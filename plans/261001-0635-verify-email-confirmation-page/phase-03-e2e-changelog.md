---
phase: 3
title: "E2E hai cổng và CHANGELOG"
status: completed
priority: P2
effort: 2h
dependencies: [2]
---

# Phase 3: E2E hai cổng và CHANGELOG

## Goal

E2E chứng minh cả hai cổng: teacher và student bấm link verify đều landing trên trang xác nhận đúng nghĩa, CTA vào app được, DB `email_verified` flip; link rác hiện error card. Bốn spec student hiện có được refactor qua helper chung và phải xanh. Một dòng CHANGELOG.

## Context

- Bốn spec đang lặp pattern poll mail-log → `goto(verifyUrl)` → kỳ vọng landing thẳng vào app:
  - `apps/e2e/specs/student-portal-email-verification.spec.ts:54-78` (happy path; sub-test resend 97-147 **không** bấm link — không đổi)
  - `apps/e2e/specs/student-portal-onboarding.spec.ts:46-68`
  - `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:78-96`
  - `apps/e2e/specs/student-quiz-take-review.spec.ts:313-326`
- Sau phase 2, `goto(verifyUrl)` của student landing trên `STUDENT/verify-email?verified=1` — mọi spec phải bấm CTA `Vào cổng học viên` trước khi kỳ vọng `/onboarding`/portal.
- Mail log: `apps/e2e/specs/helpers.ts:51-61` (`readVerificationEmails`); origins: `apps/e2e/specs/origins.ts`.
- Chạy e2e song song dev stack: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` (AGENTS.md).

## Files to Create / Modify

- Create: `apps/e2e/specs/web-email-verification.spec.ts`
- Modify: `apps/e2e/specs/helpers.ts` (helper chung verify student)
- Modify: 4 spec student listed ở Context
- Modify: `CHANGELOG.md` (một dòng, kèm issue ref)

## Tasks & Steps

### Task 3.1 — Helper chung verify student

- Goal: gom pattern poll + goto + bấm CTA vào một hàm, hết lặp 4 chỗ.
- Target files: `apps/e2e/specs/helpers.ts`.
- Signature: `verifyStudentEmailFromMailLog(page: Page, email: string): Promise<void>`.
- Steps:
  1. Poll `readVerificationEmails()` tối đa 20 lần × 500ms tìm entry `to` khớp email (case-insensitive); fail rõ nếu không thấy.
  2. `page.goto(entry.url)` → `expect(page).toHaveURL(/\/verify-email\?verified=1/)` và heading `Email đã được xác thực` visible (chứng minh landing trang mới, không phải `/login` cũ).
  3. Bấm nút `Vào cổng học viên` → `expect(page).toHaveURL(/^(?!.*verify-email).+$/, { timeout: 20_000 })` (URL rời trang xác nhận; gate tự quyết `/onboarding` hay portal).
- Success criteria: helper không chứa selector phụ thuộc copy ngoài heading + tên nút đã định ở phase 2.
- Verify: task 3.3.

### Task 3.2 — Refactor 4 spec student + bỏ khối lặp

- Goal: mỗi spec gọi helper thay khối poll/goto; các assertion riêng (copy onboarding, đếm mail, DB provision) giữ nguyên.
- Target files: 4 spec ở Context.
- Steps:
  1. `student-portal-email-verification.spec.ts`: khối 54-78 → gọi helper; giữ assert heading onboarding `Bạn đang quan tâm chứng chỉ nào?` + DB count 1 student (80-94); giữ nguyên assert pending screen trước đó (44-52) và sub-test resend (97-147).
  2. `student-portal-onboarding.spec.ts`: khối 46-68 → helper; giữ assert copy onboarding.
  3. `student-org-invitation-and-switcher.spec.ts`: khối 78-96 → helper với `studentPage`.
  4. `student-quiz-take-review.spec.ts`: khối 313-326 → helper.
  5. Không đổi ngữ nghĩa test nào ngoài việc thêm nhịp bấm CTA giữa goto và kỳ vọng landing.
- Success criteria: grep `goto(verifyUrl)` trong `apps/e2e/specs/` không còn kết quả (toàn bộ qua helper).
- Verify: task 3.4.

### Task 3.3 — Spec mới teacher (web)

- Goal: chứng minh flow teacher từ đầu tới cuối + nhánh link rác.
- Target files: `apps/e2e/specs/web-email-verification.spec.ts`.
- Steps:
  1. Happy path: mở `${WEB_ORIGIN}/login` → `#tab-signup` → fill `#signup-name`/`#signup-email`/`#signup-password` (email `e2e-<ts>-<rand>@test.local`) → submit. Sign-up soft mode tự vào workspace — không assert gì thêm ở đây.
  2. Poll mail log cho email; assert URL chứa `callbackURL` encode của `${WEB_ORIGIN}/verify-email`.
  3. `page.goto(verifyUrl)` → `expect(page).toHaveURL(/\/verify-email\?verified=1/)` + heading `Email verified` visible.
  4. Bấm `Go to workspace` → URL về `${WEB_ORIGIN}` không còn `/verify-email`; DB assert (libsql trực tiếp): `SELECT email_verified FROM user WHERE lower(trim(email)) = lower(?)` = 1.
  5. Link rác: `page.goto(\`${API_ORIGIN}/api/auth/verify-email?token=garbage&callbackURL=${encodeURIComponent(`${WEB_ORIGIN}/verify-email?verified=1`)}\`)` → `expect(page).toHaveURL(/error=INVALID_TOKEN/)` + heading `This link didn't work` visible.
- Success criteria: cả hai test xanh; không assert copy nội dung workspace (chỉ URL + DB) để không ghim dashboard.
- Verify: task 3.4.

### Task 3.4 — Full e2e gate + CHANGELOG

- Goal: toàn bộ e2e xanh trong một chạy; changelog ghi nhận.
- Steps:
  1. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.
  2. Nếu spec fail vì lý do ngoài thay đổi plan (flaky/env có sẵn): ghi rõ trong báo cáo phase, không sửa ngoài scope. Fail do thay đổi plan: STOP theo Failure Protocol.
  3. CHANGELOG, nhóm phù hợp của ngày ship, một dòng: `Trang xác nhận email sau verify cho cả teacher và học viên: bấm link trong mail landing về /verify-email của đúng cổng (card trạng thái + gửi lại link khi hết hạn) thay vì response trần của API (#<issue>)`.
- Success criteria: lệnh e2e exit 0; CHANGELOG có đúng một dòng mới kèm issue ref.
- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` exit 0.

## Security Considerations

- Spec không in token thật; mail log `.mail-log.jsonl` đã gitignore — không commit.
- DB assert chỉ đọc (SELECT).

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
