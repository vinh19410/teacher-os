---
phase: 1
title: "DB unique index + provisioning ở bridge portal"
status: todo
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: DB unique index + provisioning ở bridge portal

## Context Links

- Code nền (đã merge #255): `apps/server/src/routes/student.ts` (middleware resolve `:44-110`, STUDENT_ERROR_CODES branch), `apps/server/src/student.test.ts` (bridge tests), `apps/server/src/session.ts` (SessionUser đã có `email`/`emailVerified`)
- Decision nguồn: `plan.md` D1, D2, D3, D5, D7
- Docblock `student.email`: `packages/db/src/schema/student.ts:18-21`
- Pattern migration-with-existing-data: `apps/server/src/student-identity-migration.test.ts`
- Partial index precedent trong repo: `packages/db/src/schema/syllabus.ts:47-49` (migration 0009)

## Overview

**Priority:** P1 · **Status:** todo · Nền dữ liệu của cả plan: (a) migration 0023 dedupe non-destructive + unique **expression** index trên `lower(trim(student.email))` (0022 đã bị #253 lấy), (b) provisioning học viên tại bridge portal — middleware `requireStudent` thấy 0 row + email verified → tự sinh student row → resolve lại trong cùng request. Teacher đăng ký trên web app không bao giờ bị provision (họ không gọi `/api/student/*`). Phase 1 và Phase 2 phải cùng nhánh/cùng PR (D5) — không deploy phase 1 một mình.

## Key Insights

- `requireStudent` hiện fail `STUDENT_NOT_LINKED` khi 0 row (`student.ts:66-73`) — nhánh này chính là điểm cắm provisioning; mọi error code/error page phía portal đã có sẵn từ #255 nên UX fail-open không cần làm thêm.
- `SessionUser` đã mang `email` + `emailVerified` (`apps/server/src/session.ts:3-9`) — middleware có đủ dữ liệu, không đụng `packages/auth` (tránh phải thêm `drizzle-orm`/`@libsql/client` vào package đó — red-team #11).
- Index phải là **expression index** trên `lower(trim(email))`: bridge tra cứu theo `lower(trim(email))` (`student.ts:61-63`), provisioning sẽ insert email đã normalize — raw index cho qua case-variant và tạo ambiguous vĩnh viễn (red-team #6). Drizzle sqlite hỗ trợ `.on(sql\`...\`)` + `.where(sql\`...\`)` (drizzle-orm 0.45.2, precedent syllabus.ts).
- Provisioning phải idempotent theo email: middleware chạy MỌI request portal, và là retry tự nhiên khi insert lỗi transient (D7) — không cần hook riêng.
- Bootstrap middleware tạo org per-user (`app.ts:64-74`), vì vậy "org sớm nhất" là heuristic toàn cục riêng của plan này, KHÔNG phải behavior của bootstrap (red-team #7 — đã viết lại D2 trung thực).

## Requirements

- [ ] Migration 0023: dedupe non-destructive + `CREATE UNIQUE INDEX student_email_uq ON student(lower(trim(email))) WHERE trim(email) != ''`
- [ ] `provisionStudentForUser` với đúng 4 luật D1/D2/D3/D7, cắm vào nhánh 0-row của middleware
- [ ] Teacher signup (web app) và signup unverified không sinh row; bridge test cũ của #255 vẫn xanh

## Implementation Steps

1. Sửa `packages/db/src/schema/student.ts`: thay phần index của bảng `student` — thêm `uniqueIndex("student_email_uq").on(sql\`lower(trim(${table.email}))\`).where(sql\`trim(${table.email}) != ''\`)` (giữ nguyên `student_org_idx`). Cập nhật docblock `student.email` (L18-21): nguồn ghi giờ là provisioning bridge, không còn POST /api/students.
2. `pnpm run db:generate` sinh migration 0023 (mới nhất hiện là `0022_neat_quicksilver` của #253); mở file SQL generated và **prepend** 2 statement dedupe trước statement `CREATE UNIQUE INDEX` (ngăn cách `--> statement-breakpoint`):
   ```sql
   -- Blank email ở row trùng (giữ row created_at, id cũ nhất) — non-destructive.
   -- Tie-break id UUID là arbitrary khi created_at trùng ms: chấp nhận vì legacy
   -- dupes vốn fail-closed (không ai login được) và cả 2 row vẫn hiện trong
   -- danh sách admin để đối soát tay (red-team #12).
   UPDATE student SET email = ''
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(trim(email)) ORDER BY created_at, id) AS rn
        FROM student WHERE trim(email) != ''
      ) WHERE rn > 1
    );
   --> statement-breakpoint
   -- Normalize email còn lại về lower(trim) khớp expression index + luật tra cứu bridge
   UPDATE student SET email = lower(trim(email)) WHERE trim(email) != '';
   ```
3. Tạo `apps/server/src/student-provisioning.ts` — export `provisionStudentForUser(db: Db, user: { name: string; email: string }): Promise<void>`:
   1. `const email = user.email.trim().toLowerCase()`; rỗng → return.
   2. `SELECT id FROM student WHERE lower(trim(email)) = ?` → có bất kỳ row → return (1 row: bridge đã link; >1 row: fail-closed giữ nguyên).
   3. `SELECT id FROM organization ORDER BY created_at ASC, id ASC LIMIT 1` → không có → return (deployment chưa có org nào — risk đã ghi).
   4. INSERT `student { id: crypto.randomUUID(), orgId, name: user.name ?? "", email, phone: "", zalo: "", parentName: "", parentPhone: "" }`; unique violation (race) → nuốt + log.
4. Wire vào `apps/server/src/routes/student.ts` middleware — trong nhánh `rows.length === 0` (hiện trả `NOT_LINKED` tại `:66-73`), TRƯỚC khi return: nếu `session.emailVerified === true` → `await provisionStudentForUser(deps.getDb(), { name: session.userName, email })` trong try/catch (nuốt + log), rồi **re-run truy vấn resolve**; vẫn 0 row → trả `NOT_LINKED` như cũ. Các branch `EMAIL_UNVERIFIED`/`AMBIGUOUS` giữ nguyên vị trí logic hiện tại (unverified vẫn không được provision).
5. Test unit `apps/server/src/student-provisioning.test.ts` (libsql + drizzle, pattern `auth-roundtrip.test.ts`): có org → tạo đúng row (name/email, phone/parent rỗng); email rỗng → không tạo; email đã có 1 row → không dup; 2 row trùng → không tạo; chưa có org → không tạo; DB ném lỗi → promise không reject (D7).
6. Sửa `apps/server/src/student.test.ts` (bridge): thêm case — Google-session verified + 0 row → `GET /api/student/me` trả 200 (provision + resolve trong cùng request); session unverified → vẫn `EMAIL_UNVERIFIED`, DB không có row; email trùng 2 row → vẫn `AMBIGUOUS`; provisioning throw → vẫn `NOT_LINKED` (không 500).
7. Test migration `apps/server/src/student-email-unique-migration.test.ts` (pattern `student-identity-migration.test.ts`): seed 2 student trùng email khác created_at + 1 case-variant (`"Anna@X.com"` + `"anna@x.com"`) + 1 email riêng → sau migrate: row cũ nhất mỗi email giữ email (normalized lower), row kia email rỗng, case-variant bị gộp, còn đủ số row; INSERT trùng `lower(trim(email))` bị index từ chối.

## Verification

- `pnpm run db:generate` → diff chỉ là migration 0023; SQL có `lower(trim(email))` trong index expression
- `pnpm test` xanh (gồm 3 test file mới/sửa) + `pnpm check-types` xanh
- Tay thủ công: `sqlite3` trên 1 DB sample — `INSERT` 2 email case-variant → violation thứ 2 bị từ chối

## Risk Assessment

- **Dữ liệu production có email trùng** → dedupe blank row mới hơn: row đó mất email seam nhưng bridge vốn fail-closed với ambiguous; teacher vẫn thấy đủ học viên trong danh sách để đối soát.
- **Deployment chưa có org nào** (student đăng nhập portal trước mọi teacher) → không provision; khi teacher signup sau, học viên đó không tự vào và **không có đường tạo lại** (phase 2 đã xoá POST /students) — user phải liên hệ support/SQL tay. Hiếm (teacher signup trước là flow chuẩn); fix triệt để là link-table teacher-approve (non-goal).
- **Deployment nhiều org / junk smoke org sớm nhất** (staging theo runbook có throwaway accounts) → provisioning vào org #1 không phải org teacher thật → teacher thật không thấy học viên. Accepted-risk D2, có chủ đích cho mô hình 1-trung-tâm; cần lưu ý khi QC staging.
- **Middleware thêm 1 INSERT mỗi request khi user chưa link** → chỉ xảy ra nhánh 0-row (hiếm, và sau khi provision thành công nhánh không chạy lại); không ảnh hưởng request thường.

## Security Considerations

- Email lấy từ session Better-Auth đã xác thực, normalize lower/trim — khớp expression index và luật tra cứu bridge; không có input tự do từ client.
- Provision chỉ khi `emailVerified === true` (Google; hoặc verified flow tương lai) — unverified signup không tạo row, chống spam row rác.
- Unique expression index chặn email planting trùng (kể cả case-variant) từ mọi đường ghi.
- Không log PII ngoài `userId` trong error path.
