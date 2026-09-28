---
phase: 3
title: "E2E seed DB + regression + docs chốt"
status: completed
priority: P1
effort: 6h
dependencies: [2]
---

# Phase 3: E2E seed DB + regression + docs chốt

## Context Links

- Decision nguồn: `plan.md` D6, D7
- Helper bị thay: `apps/e2e/specs/helpers.ts:29-47` (`createStudentViaUi`) — **12 spec files** + chính helpers.ts (grep verified lại ở red-team #9)
- Boot shim (nơi sống của `local.db`): `apps/e2e/src/boot.ts:27` (`DB_PATH`), wipe + migrate lúc start; Playwright specs chạy process RIÊNG qua webServer `boot:api`, `workers: 1` (`playwright.config.ts:16`)
- Spec 2-teacher (phải seed đúng org): `class-operations.spec.ts:138,174`, `session-occurrence.spec.ts:80,91`, `student-package-validation.spec.ts:113,119` (red-team #4)
- Schema cột student: `packages/db/src/schema/student.ts` (id, org_id, name, phone, email, zalo, parent_name, parent_phone, created_at)

## Overview

**Priority:** P1 · **Status:** todo · Phase 2 xoá nút + route tạo học viên nên mọi e2e tạo học viên qua UI sẽ gãy. Thay bằng helper `seedStudent()` chèn thẳng vào `apps/e2e/local.db` qua `@libsql/client` (**đúng org theo teacher đang đăng nhập của spec**), dựng lại 12 spec, thêm 1 spec negative assert-DB cho provisioning, rồi chạy toàn bộ regression gate.

## Key Insights

- `createStudentViaUi` cũ chạy trong org của teacher đang đăng nhập (POST org-scoped) — seed DB phải tái tạo đúng ngữ nghĩa đó: resolve `user (email) → membership → orgId`. Với spec có teacher thứ 2 (`class-operations`, `session-occurrence`, `student-package-validation`), seed vào earliest-org toàn cục sẽ đặt học viên vào org SAI → snapshot org-scoped không thấy → spec đỏ (red-team #4).
- `signUpViaUi` (helpers.ts:9-25) tạo user email/password → `emailVerified=false` → phase 1 KHÔNG provision. Không thể e2e-flow Google (dummy credentials) — behavior verified-signup được cover bằng test bridge ở phase 1; e2e chỉ assert negative qua **DB count**, không assert qua UI (red-team #8: row ở org khác không bao giờ hiện trong /students của spec nên UI-assert là vô nghĩa).
- `student-package-validation.spec.ts` một phần test validation form create (SĐT/email) — phần đó chết cùng form; phần package-validation khác giữ với seed.
- `enroll-existing-student.spec.ts` là QC spec của issue #122 (2 mode modal) — viết lại cho modal 1 mode.
- Playwright `workers: 1` chặn spec-spec race, KHÔNG chặn spec-server race — helper cần guard + retry (SQLITE_BUSY) và stale-read poll.

## Requirements

- [x] Helper `seedStudent()` resolve org theo teacher của spec, guard org rỗng + busy_timeout/retry
- [x] 12 spec files dựng lại; 3 spec rework (without-class, enroll-existing, package-validation); negative spec assert-DB
- [x] Full regression: `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build`, `pnpm --filter e2e e2e` xanh

## Implementation Steps

1. `apps/e2e/specs/helpers.ts`: thêm
   ```ts
   export async function seedStudent(opts: {
     teacherEmail?: string;          // org của teacher này; bỏ trống = earliest org
     name: string; email?: string; phone?: string;
   } = {}) {
     const client = createClient({ url: `file:${new URL("../local.db", import.meta.url).pathname}` });
     const email = opts.email ?? `${slug}.${Date.now()}@e2e.test`; // slug như helper cũ
     const orgRow = opts.teacherEmail
       ? await client.execute({
           sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
                 WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
           args: [opts.teacherEmail] })
       : await client.execute("SELECT id FROM organization ORDER BY created_at ASC, id ASC LIMIT 1");
     if (!orgRow.rows[0]) throw new Error("seedStudent: no org — signUpViaUi phải chạy trước");
     const id = crypto.randomUUID();
     await withBusyRetry(client, () => client.execute({
       sql: `INSERT INTO student (id, org_id, name, phone, email, zalo, parent_name, parent_phone, created_at)
             VALUES (?,?,?,?,?,?,?,?,cast(unixepoch('subsecond')*1000 as integer))`,
       args: [id, orgRow.rows[0].id, opts.name, opts.phone ?? "", email, opts.phone ?? "", "", ""],
     }));
     client.close();
     return { id, name: opts.name, email };
   }
   ```
   (`withBusyRetry`: retry 2-3 lần cho `SQLITE_BUSY`; nếu libsql version chê `unixepoch` trong INSERT, dùng `Date.now()` qua args — schema default dùng cùng hàm nên an toàn). Xoá `createStudentViaUi`.
2. Thay lời gọi ở **9 spec "thay máy"** (create → seed, giữ nguyên name/email/phone của từng spec): `student-row-detail`, `create-invoice`, `class-operations` (pass `teacherEmail` tương ứng mỗi test), `class-assign`, `class-roster-tuition-debt`, `global-search`, `projected-sessions`, `schedule-session-modal`, `session-occurrence` (pass `teacherEmail`).
3. Viết lại `student-package-without-class.spec.ts`: seed học viên chưa lớp → "Chưa có lớp" ở `/students` → enroll qua lớp (enrollment "Đã mời") → teacher Kích hoạt → package xuất hiện (đồng bộ lifecycle invited→accept từ #253).
4. Viết lại `enroll-existing-student.spec.ts` cho modal 1-mode (bỏ assertion về tab "Tạo học viên mới"; picker hiển thị đúng học viên chưa enroll).
5. `student-package-validation.spec.ts`: xoá các case validation form create (SĐT rỗng/không phải số, email sai định dạng — form không còn); giữ case package-validation khác chuyển sang seed (pass `teacherEmail` — spec này có 2 teacher).
6. Thêm `apps/e2e/specs/student-portal-provisioning.spec.ts`: `signUpViaUi` với email xác định → **assert DB**: `SELECT COUNT(*) FROM student WHERE lower(trim(email)) = ?` = 0 (unverified gate + không đụng portal API) — bảo vệ D1/D7 khỏi regression ở tầng app thật (red-team #8).
7. Chạy và sửa đến xanh: `pnpm --filter e2e e2e` toàn suite. Nếu seed gặp stale-read (server chưa thấy row): thêm poll/retry ngắn trong helper — KHÔNG thêm endpoint seed.
8. Regression chốt theo thứ tự: `pnpm check` → `pnpm check-types` → `pnpm test` → `pnpm build` → `pnpm --filter e2e e2e`.
9. Cross-check docs lần cuối: `docs/` không còn mô tả flow tạo học viên thủ công; smoke tay `pnpm dev`: `/students` hiển thị học viên seed, enroll vào lớp hoạt động.

## Verification

- `grep -rn "createStudentViaUi" apps/e2e` → 0 hit
- `pnpm --filter e2e e2e` xanh toàn suite (12 spec dựng lại + 1 spec mới)
- `pnpm test` + `pnpm check-types` + `pnpm build` xanh
- Smoke tay: 1 vòng `pnpm dev` — enroll-existing + invoice trên học viên seed hoạt động

## Risk Assessment

- **Ghi từ process Playwright vào SQLite đang mở bởi server** → libsql file + WAL hỗ trợ multi-connection (unverified tĩnh — red-team); mitigation: busy-retry + poll trong helper (bước 1, 7); nếu vẫn flaky thì xác minh `PRAGMA journal_mode` thực tế và Điều chỉnh helper trước khi tối ưu vi phẫu.
- **Spec phụ thuộc dữ liệu ngầm** (invoice picker chỉ hiện học viên active, global search cần tên ASCII...) → giữ nguyên tham số name/email/phone khi chuyển seed để dữ liệu test không đổi semantics.
- **Seed trước khi teacher bootstrap org** → helper throw message rõ ("signUpViaUi phải chạy trước") thay vì TypeError mơ hồ (red-team #5-ơ-phase-3).

## Security Considerations

- Helper seed chỉ chạy trong e2e với DB local wipe mỗi run — không chạm production.
- Spec negative (bước 6) là assertion bảo mật ở tầng DB: chặn regression làm signup thường sinh student row.
