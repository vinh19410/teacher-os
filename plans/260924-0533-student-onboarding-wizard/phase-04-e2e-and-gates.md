---
phase: 4
title: "E2E onboarding + cập nhật spec cũ + full gates"
status: completed
priority: P2
effort: 3h
dependencies: [1, 2, 3]
---

# Phase 4: E2E onboarding + cập nhật spec cũ + full gates

## Goal

Bằng chứng tự động cho trọn user journey: đăng ký → verify email (qua mail log) → vào `/` → tự rơi vào `/onboarding` → chạy 4 bước → "Hoàn thành" → về `/` overview + dữ liệu đúng cột DB. Kèm: cập nhật spec cũ bị gate ảnh hưởng (có chủ ý) và chạy full gates (3 spec student ×2 lần liên tiếp, full suite ×1).

Điểm load-bearing: gate 2 chiều của Phase 3 thay đổi hành vi sau-verify của spec `student-portal-email-verification.spec.ts` — test 1 của spec đó hiện assert `page.getByRole("heading", { name: /Chào/ })` ngay sau khi goto verify URL (dòng 74-77); với gate mới, user mới chưa onboarding sẽ thấy wizard thay vì overview → assertion này PHẢI được đổi ở Task 4.2, không phải "fix wizard" để spec cũ xanh. Ngược lại, `student-portal-provisioning.spec.ts:11-36` KHÔNG bị ảnh hưởng (chỉ đăng ký trên web app + assert DB count, không mở portal). Infra e2e đã sẵn từ plan #259: 3 webServer (`apps/e2e/playwright.config.ts:33-69`), `workers: 1` (dòng 16), RecordingMailer + origin student (`apps/e2e/src/boot.ts:27-52`) — phase này KHÔNG đụng boot/config.

## Files to Create / Modify

- Create: `apps/e2e/specs/student-portal-onboarding.spec.ts`
- Modify: `apps/e2e/specs/student-portal-email-verification.spec.ts` (đổi assertion sau-verify ở test 1 — Task 4.2)

## Tasks & Steps

### Task 4.1 — Spec `student-portal-onboarding.spec.ts`
- Goal: happy-path wizard + assert DB + gate ngược; regression màn verify.
- Target files: `apps/e2e/specs/student-portal-onboarding.spec.ts` (mới).
- Steps:
  1. `test.describe` + `beforeAll` seed org trực tiếp vào `local.db` — copy nguyên khối từ `student-portal-email-verification.spec.ts:7-25` (select org sớm nhất, insert `org-e2e-seed` nếu chưa có, `busy_timeout 5000`).
  2. Test 1 — happy path (email duy nhất theo pattern `e2e-${Date.now()}-${random}@test.local` — spec email-verification dòng 30; tuyệt đối không tái dùng email):
     - Đăng ký qua UI: goto `${STUDENT_ORIGIN}/login` (import từ `./origins`, `apps/e2e/specs/origins.ts:8`) → `#tab-signup` → fill `#signup-name/#signup-email/#signup-password` → submit (pattern dòng 33-42).
     - Expect màn chờ xác thực: "Email chưa được xác thực" visible (timeout 15s, pattern dòng 45-47).
     - Lấy URL verify: poll `readVerificationEmails()` (`apps/e2e/specs/helpers.ts:51-61`) tới khi có entry khớp email (vòng 20 lần × 500ms — pattern dòng 56-69); `page.goto(verifyUrl)`.
     - SAU verify: expect URL chứa `/onboarding` (`await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 })`) và wizard hiển thị: "Bạn đang quan tâm chứng chỉ nào?" visible; KHÔNG thấy heading "Chào".
     - Chạy wizard: click nút "IELTS" → "Tiếp tục" → click "Band 6.5" → "Tiếp tục" → click "Du học" + "Giao tiếp tự tin" → "Tiếp tục" → click "1–2 giờ" → "Tiếp tục" → màn tổng hợp hiển thị "Xác nhận thông tin của bạn" + các lựa chọn (assert thấy "IELTS", "Du học") → click "Hoàn thành".
     - Expect về overview: `await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })` và heading "Chào" visible (`greeting-header.tsx:25`). **Anti-bounce:** sau khi "Chào" visible, `page.waitForTimeout(1500)` rồi assert URL vẫn `/` và wizard question KHÔNG tái xuất hiện (đóng gate regression race cache — setQueryData ở Task 3.1).
     - Assert DB (pattern dòng 80-93 của spec email-verification — libsql `local.db`):
       ```sql
       SELECT exam_interest, target_score, learning_goals, learning_goals_note,
              daily_study_hours, onboarding_completed_at
       FROM student WHERE lower(trim(email)) = lower(?)
       ```
       Kỳ vọng: `ielts` / `6.5` / JSON chứa `study-abroad` + `communication` (parse `JSON.parse(learning_goals)` rồi expect mảng) / null (không điền note) / `1-2` / NOT NULL.
     - Gate ngược (cùng test, sau khi đã ở `/`): `page.goto(`${STUDENT_ORIGIN}/onboarding`)` → expect URL về `/` (user đã onboarding bị đẩy ra).
  3. Test 2 — regression màn verify: đăng ký email duy nhất mới, KHÔNG verify, goto thẳng `${STUDENT_ORIGIN}/onboarding` → vẫn thấy "Email chưa được xác thực" + nút "Gửi lại email" (gate D1: wizard không bao giờ xuất hiện trước verify; route `/onboarding` render `StudentErrorView` khi `meQuery.error`).
- Success criteria: cả 2 test pass; không dùng email trùng giữa các test hay với spec khác.
- Verify: `pnpm --filter e2e e2e -- specs/student-portal-onboarding.spec.ts` → exit 0 (output `2 passed`).

### Task 4.2 — Cập nhật spec email-verification cũ (contract change có chủ ý)
- Goal: spec cũ phản ánh hành vi mới sau-verify (rơi vào wizard), giữ nguyên phần còn lại.
- Target files: `apps/e2e/specs/student-portal-email-verification.spec.ts`.
- Steps:
  1. Test 1 (dòng 27-94), bước 7 (dòng 72-77): thay `expect(page.getByRole("heading", { name: /Chào/ }))` bằng `await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 })` + `await expect(page.getByText("Bạn đang quan tâm chứng chỉ nào?")).toBeVisible()`; đổi comment bước 7 thành "Better-Auth verify + auto sign-in → gate onboarding đưa user mới sang /onboarding". GIỮ NGUYÊN dòng 77 (assert "Email chưa được xác thực" not visible — deterministic: màn wizard không chứa chuỗi đó nên assertion vẫn đúng và tiếp tục phòng regression).
  2. KHÔNG đổi test resend (dòng 96-146) — user chưa verify, không đụng gate.
  3. Ghi chú trong PR/commit: đây là kỳ vọng đổi có chủ ý theo D1/D2 (cùng cách plan #259 đổi NOT_LINKED → EMAIL_UNVERIFIED cho test server).
  4. Spec `student-portal-provisioning.spec.ts` KHÔNG đổi — chỉ chạy lại ở Verification.
- Success criteria: spec email-verification pass với assertion mới.
- Verify: `pnpm --filter e2e e2e -- specs/student-portal-email-verification.spec.ts` → exit 0.

### Task 4.3 — Full gates (student specs ×2, full suite ×1)
- Goal: chứng minh toàn plan không vỡ gì xung quanh, trong budget thực tế (full suite 29+ specs chạy workers:1 — chạy toàn bộ 2 lần không cần thiết và dễ ép người thực thi bỏ protocol).
- Target files: không sửa — chỉ chạy.
- Steps:
  1. `pnpm check` → exit 0.
  2. `pnpm check-types` → exit 0.
  3. `pnpm test` (root — gồm turbo test + ci-workflow + topology-drift) → exit 0.
  4. `pnpm --filter e2e e2e -- specs/student-portal-onboarding.spec.ts specs/student-portal-email-verification.spec.ts specs/student-portal-provisioning.spec.ts` (3 spec student, `workers: 1`) → exit 0. Chạy nhóm này **lần thứ hai** → vẫn exit 0 (2 lần liên tiếp, cùng chuẩn plan #259).
  5. `pnpm --filter e2e e2e` (toàn bộ suite) → exit 0, **1 lần**.
  6. **Đọc output cả 2 nhóm kết quả:** không được có dòng `flaky` / `retried` nào (CI bật `retries: 1` — `playwright.config.ts:17` — một test pass nhờ retry KHÔNG tính là pass; local retries = 0). Nếu có flake: chạy lại spec liên quan bắt trace (`trace: "on-first-retry"`, dòng 25) — chỉ chấp nhận xanh khi chạy lại pass thật không retry.
- Success criteria: các lệnh exit 0; 3 spec student xanh ở CẢ HAI lần chạy; full suite xanh 1 lần; output không có flaky/retried.
- Verify: chính là các lệnh trên.

## Verification (cả phase)

- `pnpm --filter e2e e2e` (full suite 1 lần) → exit 0, không flaky/retried.
- 3 spec student chạy riêng 2 lần liên tiếp → đều exit 0.
- `pnpm check` → exit 0.
- `pnpm check-types` → exit 0.
- `pnpm test` (root) → exit 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
