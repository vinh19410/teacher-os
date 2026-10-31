---
title: "#524: Xử lý các release blocker từ đợt review promote develop → staging"
description: "Map LEAD_ORG_ID/LEAD_ORIGINS vào workflow deploy kèm chuẩn hóa fallback, sửa race check-then-act ở POST /public/leads bằng câu lệnh SQL nguyên tử, bắt buộc emailVerified cho allowlist TEACHER_EMAILS kèm luồng gửi lại mail xác thực, và áp role gate canAccessFinance cho /api/leads."
status: in_progress
priority: P1
effort: 6h
issue: 524
branch: fix/524-resolve-release-blockers
tags: [bugfix, security, backend, frontend, infra, docs]
blockedBy: []
blocks: []
created: 2026-10-31
---

# Plan: #524 — Xử lý các release blocker trước khi promote `develop` → `main`

## Overview

Từ kết quả review PR #523 (promote `develop` → `staging`), 5 hạng mục trong nhóm **"Chặn promote lên `main`"** của issue #524 phải được giải quyết trước khi phát hành production:

1. **Map `LEAD_ORG_ID` và `LEAD_ORIGINS` vào workflow deploy (`deploy-staging.yml`, `deploy.yml`):** Hiện hai workflow chưa truyền hai biến này vào bước `pnpm alchemy deploy`, khiến `/public/leads` và `/public/placement-test` trên staging trả 503. Ngoài ra, dù `Effect` (`effect@4.0.0-rc.108`, `ConfigProvider.fromEnv`) tự coi chuỗi rỗng `""` là missing, giá trị chỉ chứa khoảng trắng hoặc dấu phẩy (`"  "`, `","`) từ biến môi trường sẽ làm `Config.withDefault` không chạy và `parseCORSOrigins` trả `[]` (chặn toàn bộ POST). Cần chuẩn hóa bằng helper `resolveLeadOrigins` trong `packages/infra/src/topology.ts`, trim `LEAD_ORG_ID` ở cả `alchemy.run.ts`, `public-leads.ts` và `placement-test.ts`, và khóa bằng unit test + drift test. <!-- Updated: Red Team RT-5 -->
2. **Đặt `TEACHER_EMAILS` ở environment `production` (và `LEAD_ORG_ID` ở `staging`/`production`):** Biến trên GitHub Environment do người vận hành đặt sau khi đối chiếu D1 thực tế (VM không giữ credential Cloudflare và repo cấm lưu email thật / D1 ID vào git). Cần nâng cấp mục runbook thành **hard preflight gate** yêu cầu tài khoản trong `TEACHER_EMAILS` đã tồn tại với `role = 'teacher'` và `email_verified = 1` trong D1 (kèm xóa session lạ nếu xác thực thủ công), và liệt kê lệnh `gh variable set` cụ thể trong báo cáo bàn giao. <!-- Updated: Red Team RT-4 -->
3. **Sửa lỗi check-then-act (TOCTOU race) ở `POST /public/leads` (`apps/server/src/routes/public-leads.ts:178-280`):** Ba câu `SELECT` kiểm tra giới hạn IP (`LEAD_IP_MAX = 3`), trần ngày (`LEAD_DAILY_CAP = 100`) và dedupe SĐT 24h tách rời khỏi câu `INSERT`/`UPDATE`, khiến các request song song vượt ngưỡng, tạo dòng lead trùng cho cùng SĐT và bắn email thông báo hàng loạt. Cần gộp điều kiện vào câu lệnh SQL nguyên tử (`INSERT INTO lead ... SELECT ... WHERE ... RETURNING` và `UPDATE lead SET ... WHERE ... RETURNING`), giữ nguyên `ip_hash` gốc khi dedupe `UPDATE`, loại trừ dòng đang sửa khỏi đếm IP của `UPDATE`, và không chặn `UPDATE` bằng `LEAD_DAILY_CAP`. <!-- Updated: Red Team RT-1 -->
4. **Bắt buộc `emailVerified === true` cho allowlist `TEACHER_EMAILS` (`apps/server/src/app.ts:234-248`), chặn role-poisoning khi đăng ký từ cổng khác (`packages/auth/src/index.ts`), và rà luồng giáo viên chưa xác thực:** Gate `teacherEmails` trong `bootstrapMiddleware` hiện chỉ so khớp chuỗi email mà không kiểm tra `session.emailVerified === true`. Cần tách mã lỗi `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` khi email nằm trong allowlist nhưng chưa verify, chặn đăng ký email thuộc `TEACHER_EMAILS` ở origin khác `teacher` (`packages/auth/src/index.ts`), và bổ sung nút gửi lại email xác thực + nút tải lại trang trên `AccountBlockedView` cho giáo viên hợp lệ chưa verify. <!-- Updated: Red Team RT-3, RT-4 -->
5. **Áp role gate `canAccessFinance` cho `/api/leads` (`apps/server/src/routes/leads.ts:53,133`), lọc người nhận `notifyNewLead` và chặn JSON hỏng:** Hiện `ta` và `class_teacher` đọc/sửa được PII của lead qua `GET/PATCH /api/leads` và nhận email thông báo lead mới. Cần áp gate `canAccessFinance(ctx.role)` đồng nhất với `/api/placement-test` (#515), lọc người nhận trong `lead-notify.ts` theo `canAccessFinance(membership.role)`, ẩn mục `/leads` khỏi Sidebar/⌘K kèm route guard `useFinanceRouteGuard` (đặt trước `if (isPending)`) khi `!canAccessFinance`, cập nhật JSDoc ở `leads.ts:17-20`, và bọc `try/catch` quanh `c.req.raw.json()` ở `leads.ts:137` để trả 400 thay vì 500 khi JSON hỏng. <!-- Updated: Red Team RT-2, RT-6 -->

## Advisor Scope Lock (`--advice`)

- **Locked Scope:** 5 mục dưới nhóm "Chặn promote lên `main`" của issue #524 + chặn JSON hỏng trả 400 tại `apps/server/src/routes/leads.ts:137`.
- **Explicit Non-Goals:**
  - Không tự ý đặt biến giả lên GitHub Environment `production`/`staging` từ VM hoặc commit email thật / ID D1 vào repo.
  - Không tạo migration D1 mới (không thêm unique index vào bảng `lead` vì cùng một SĐT được phép tạo lead mới sau cửa sổ 24 giờ).
  - Không thực hiện các mục "Cần quyết định" (deploy `apps/profile` lên staging, chọn org staging, chính sách lưu giữ PII) và các mục "Làm sau" ngoài `leads.ts:137` (`kernel.ts` enroll atomicity, `student.ts` manual-student consent, SQLite `lower()` Unicode).

## Phases

| # | Phase | Trạng thái | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | [Map biến deploy, chuẩn hóa `LEAD_ORIGINS` và cập nhật runbook](phase-01-deploy-env-and-runbook.md) | in_progress | 1.5h | — |
| 2 | [Sửa check-then-act tại `POST /public/leads` bằng SQL nguyên tử](phase-02-atomic-public-leads-rate-limit.md) | pending | 2.5h | — |
| 3 | [Bắt buộc `emailVerified` cho `TEACHER_EMAILS` và áp role gate `canAccessFinance` cho `/api/leads`](phase-03-teacher-email-verified-and-leads-role-gate.md) | pending | 2h | — |

## Acceptance Criteria

- [ ] `.github/workflows/deploy-staging.yml` và `.github/workflows/deploy.yml` truyền `LEAD_ORG_ID: ${{ vars.LEAD_ORG_ID }}` và `LEAD_ORIGINS: ${{ vars.LEAD_ORIGINS }}` vào bước `Deploy to Cloudflare`.
- [ ] `resolveLeadOrigins` trong `packages/infra/src/topology.ts` chuẩn hóa giá trị rỗng / khoảng trắng / chỉ dấu phẩy về mặc định theo chế độ (`https://msmy.io.vn,https://www.msmy.io.vn` khi có topology, `http://localhost:8005` khi dev), và `LEAD_ORG_ID` được `.trim()` đồng nhất ở `alchemy.run.ts`, `public-leads.ts`, `placement-test.ts`, được kiểm chứng bằng unit test và `scripts/topology-drift.test.mjs`.
- [ ] `docs/production-release-runbook.md` quy định rõ cổng preflight cứng kiểm tra tài khoản `TEACHER_EMAILS` đã tồn tại với `email_verified = 1` trên D1 production và lệnh `gh variable set` cho `TEACHER_EMAILS`, `LEAD_ORG_ID`, `LEAD_ORIGINS`.
- [ ] `POST /public/leads` thực thi kiểm tra tần suất IP (`LEAD_IP_MAX`), trần ngày (`LEAD_DAILY_CAP`) và dedupe SĐT 24h (`LEAD_DEDUPE_MAX_SUBMITS`) nguyên tử ngay trong câu lệnh `INSERT ... SELECT ... WHERE ... RETURNING` và `UPDATE ... WHERE ... RETURNING` (không ghi đè `ip_hash` khi dedupe `UPDATE`, không tự chặn `UPDATE` tại biên `LEAD_IP_MAX` / `LEAD_DAILY_CAP`); các test `Promise.all` bắn request song song chứng minh không vượt ngưỡng, không tạo dòng trùng cho cùng SĐT trong 24h và chỉ gửi đúng 1 email cho lead mới.
- [ ] Khi `teacherEmails` khác rỗng, `bootstrapMiddleware` (`apps/server/src/app.ts`) trả 403 `ACCOUNT_TEACHER_NOT_ALLOWED` cho email ngoài danh sách và trả 403 `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` cho email trong danh sách nhưng `session.emailVerified !== true` (không tạo org/membership); `packages/auth/src/index.ts` chặn đăng ký email thuộc `teacherEmails` từ origin không phải `teacher`. Khi `teacherEmails` rỗng, hành vi soft-mode cho dev/E2E giữ nguyên.
- [ ] `AccountBlockedView` (`apps/web/src/components/account-blocked-view.tsx`) giữ tiêu đề `"Đây là tài khoản học viên"` (tương thích E2E `account-role-separation.spec.ts`), và khi bị chặn bởi `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` thì hiển thị hướng dẫn xác thực email kèm nút `"Gửi lại email xác thực"` (xử lý `res.error` và `EMAIL_ALREADY_VERIFIED`) và nút `"Tôi đã xác thực — Kiểm tra lại"`.
- [ ] `GET /api/leads` và `PATCH /api/leads/:id` chặn `ta` và `class_teacher` bằng 403 `leads-forbidden` (chỉ cho phép `canAccessFinance(ctx.role)`); `PATCH /api/leads/:id` trả 400 `invalid body` khi body JSON hỏng; `notifyNewLead` chỉ gửi email cho thành viên có `canAccessFinance(membership.role)`; Sidebar, ⌘K và màn `/leads` trên web ẩn/chặn khi `viewer.canAccessFinance === false`.
- [ ] Toàn bộ gate local (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm build`) xanh.

## Handover

Kế hoạch này được soạn theo hợp đồng bàn giao `--advice` (`advice-handover-plan.md`): mỗi phase chia thành các task tuần tự với đường dẫn file, ký hiệu hàm/biến, các bước cụ thể, tiêu chí hoàn thành quan sát được, điều kiện `Verify` cơ học và khối `## Failure Protocol` nguyên văn. Executor phải dừng ngay và gọi `kongming` nếu bất kỳ bước `Verify` nào không thỏa điều kiện pass.

## Validation Log

### Verification Results
- Claims checked: 14
- Verified: 11 | Failed: 3 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Failures resolved inline:
  1. `phase-03:48` — `signUp()` trong `apps/server/src/role-gates.test.ts:36-48` trả về cookie đã ký `token.signature`; cột `session.token` trong DB lưu giá trị qua `dbToken(token)`. Đã cập nhật Task 3.1 dùng `dbToken(token)`.
  2. `phase-03:62-63` — `isStudentRoleRejected(error: unknown): boolean` trong `apps/web/src/lib/repos/kernel.ts:686` chưa là type guard `error is HttpError`, nên `error.reason` ở 3 nơi gọi trong `kernel.ts` sẽ lỗi `TS18046`. Đã cập nhật Task 3.2 đổi kiểu trả về thành `error is HttpError`.
  3. `phase-03:115-118` — `LeadsRoute` trong `apps/web/src/routes/_auth/leads/index.tsx:254` có `if (isPending)` trước `return (` chính; khi `enabled: false`, `isPending` là `true`. Đã cập nhật Task 3.4 đặt `if (!canAccessFinance) return null;` ngay trước `if (isPending)`.

### Whole-Plan Consistency Sweep
- Đã đối chiếu toàn bộ `plan.md` và 3 file `phase-01..03.md`: tên biến, hàm (`resolveLeadOrigins`, `ACCOUNT_TEACHER_EMAIL_UNVERIFIED`, `resetRoleBlockedForTest`, `canAccessFinance`), câu lệnh SQL nguyên tử và vị trí guard trong `LeadsRoute` khớp hoàn toàn.

## Red Team Review

### Session — 2026-10-31
**Findings:** 7 (6 accepted, 1 rejected)
**Severity breakdown:** 2 Critical, 2 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Dedupe `UPDATE` ghi đè `ip_hash` (lách rate-limit bằng IP thứ 2), tự chặn update hợp lệ tại biên `LEAD_DAILY_CAP` / `LEAD_IP_MAX`, và dư `tryAtomicInsert()` lần 2 ở Step 4 | Critical | Accept | Phase 2 (Task 2.2) |
| 2 | Đặt `if (!canAccessFinance) return null;` sau `if (isPending)` trong `LeadsRoute` khiến trang render thẻ loading thay vì `null` khi `enabled: false` | Critical | Accept | Phase 3 (Task 3.4) |
| 3 | Thiếu type guard `error is HttpError` trên `isStudentRoleRejected`, thiếu `dbToken(token)` trong `role-gates.test.ts`, thiếu `resetRoleBlockedForTest()` trong `role-block.ts` và xử lý `res.error` + nút reload trên `AccountBlockedView` | High | Accept | Phase 3 (Task 3.1, 3.2) |
| 4 | Đăng ký email thuộc `TEACHER_EMAILS` trên cổng student (`appRole !== "teacher"`) làm nhiễm `role = "student"` gây khóa vĩnh viễn; runbook cần yêu cầu tài khoản đã tồn tại với `email_verified = 1` | High | Accept | Phase 1 (Task 1.3), Phase 3 (Task 3.1) |
| 5 | `LEAD_ORG_ID` chưa `.trim()` đồng nhất ở `alchemy.run.ts`, `public-leads.ts`, `placement-test.ts`; drift test cần kiểm tra đúng phạm vi step `Deploy to Cloudflare` và `alchemy.run.ts` | Medium | Accept | Phase 1 (Task 1.1, 1.2) |
| 6 | Ghi chú cho phép `ctx.role === undefined` trong `leads.ts` trái hợp đồng least-privilege của `canAccessFinance` | Medium | Accept | Phase 3 (Task 3.3) |
| 7 | Dedupe `UPDATE` ghi đè các trường tùy chọn (`course`, `note`, `placement`...) khi gửi lại để trống | Medium | Reject | Giữ nguyên hợp đồng D7 của #506 (`public-leads.test.ts:269-301`); ngoài phạm vi #524 |

### Whole-Plan Consistency Sweep
- Đã rà soát lại `plan.md`, `phase-01-deploy-env-and-runbook.md`, `phase-02-atomic-public-leads-rate-limit.md`, `phase-03-teacher-email-verified-and-leads-role-gate.md` sau khi áp dụng RT-1..RT-6: không còn mâu thuẫn giữa mô tả tổng quan, câu lệnh SQL, tên hàm/mã lỗi và bước kiểm chứng.
