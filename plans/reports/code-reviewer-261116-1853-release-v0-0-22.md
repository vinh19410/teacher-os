# Code review: release/promote-v0.0.22 (0.0.21 → 0.0.22)

Reviewer: `code-reviewer` subagent (fresh context). Status: DONE_WITH_CONCERNS. 0 Critical.

## Phạm vi

`git diff origin/main...HEAD`: 564 file, +98.6k/−8.4k. HEAD^1 = origin/develop (84ca72be), HEAD^2 = origin/main (b26c698b), merge-base e922e017. Đọc kỹ: merge resolution, `apps/server/src/routes/public-placement-test.ts`, `public-leads.ts`, `lib/resolve-lead-org.ts`, `lib/placement-ai/run-placement-grading.ts`, authz `routes/leads.ts`, 4 migration mới, `.github/workflows/deploy.yml`, `e2e.yml`, `packages/infra/alchemy.run.ts`, `scripts/notify-discord-changelog.mjs`. Không review từng dòng ~90 commit develop còn lại (UI, study-pack, syllabus).

## Merge resolution (2b618dd9): không mất gì từ main

- 23 file main đã đổi kể từ merge-base: phần lớn giống hệt main; các file lấy bản develop (`apps/profile/public/*.html`, `serve.mjs`, `apps/profile/tests/*`, `alchemy.run.ts`) đều đã chứa bản tương đương (1c647425 cherry-pick từ 46bea0e3; #699/#706/#710 tương ứng d8ef2b8f/c33a4ead/8988b042). Test noi-bo "warm paper (#699)" được thay có chủ đích bằng test palette #709.
- `deploy.yml`: khác main chỉ ở phần develop thêm (reusable `e2e.yml`, `OPENAI_*`, bước Discord).
- `docs/production-release-runbook.md`: đoạn cutover của 4002935f còn đủ; phần develop thêm (DISCORD, LEAD_ORG_ID, e2e) còn.

## Pass 1: Critical — không có

- Migration 0069–0072: additive (ADD COLUMN default/nullable, CREATE TABLE `placement_test_submission`, index trên cột mới). Journal idx 69–72 liên tục.
- `POST /public/placement-test/submissions`: origin allowlist, body ≤128KB, zod, rate limit 5/IP + 50/ngày/org, insert CAS, rollback lead mới khi lỗi.
- `PUT /submissions/:id/speaking-media`: token SHA-256 + constant-time, TTL 15 phút, dùng một lần, magic bytes, CAS theo `uploadTokenHash`.
- `GET /results/:token`: token 32 byte, regex, constant-time; chỉ trả khi `status='graded'` và đã publish.
- `routes/leads.ts`: middleware bắt `kernelCtx` + `canAccessFinance`; query lọc `ctx.orgId`.
- Secrets: `OPENAI_API_KEY` chỉ vào bước deploy; script Discord redact webhook.

## High

**H1 (chưa kiểm chứng, phụ thuộc cấu hình prod):** `apps/server/src/lib/resolve-lead-org.ts:37-39, 61-74` không lọc `user.email_verified`, trong khi `packages/auth/src/index.ts:291` bật email/password không `requireEmailVerification`. Nếu `TEACHER_EMAILS` prod có email chưa đăng ký, người lạ đăng ký email đó → lead/placement (PII) đổ vào org của họ. Controller kiểm tra: prod có đúng 1 entry trong `TEACHER_EMAILS`. Đề xuất lâu dài: chỉ bỏ filter `email_verified` khi `AUTH_ASSUME_EMAIL_VERIFIED` bật.

## Medium

- **M1:** model mặc định `gpt-6-luna` (`alchemy.run.ts:249`, `openai-grader.ts:17`); production chưa đặt `OPENAI_GRADING_MODEL`. Nếu model không hợp lệ, AI chấm `failed` (an toàn, chỉ mất tính năng).
- **M2:** `speakingMode=upload` nhưng không upload → Writing không được AI chấm tự động (`public-placement-test.ts:718, 925`); giáo viên phải bấm chấm lại (`leads.ts:491`).
- **M3:** `scripts/notify-discord-changelog.mjs:698-705` lỗi ném ra ngoài → exit 1, đỏ job deploy dù prod đã live (trái cam kết fail-open).

## Pass 2: Informational

- `docs/production-release-runbook.md:105` còn ghi prod `APP_DOMAIN=teacheros.io.vn`.
- `resolveLeadTargetOrg` chạy JOIN mỗi request công khai (kể cả `GET /audio/:id`); có thể cache theo isolate.
- Race publish đề mới giữa `GET /` và `POST /submissions` (có từ trước).

## Gate reviewer đã chạy (Node v24.22.1)

Server vitest liên quan 73/73; `apps/profile` node --test 47/47; scripts 31/31; infra topology 28/28; web security-headers + worker 27/27; biome 0 error.

## Câu hỏi còn mở

- Prod `LEAD_ORG_ID` có trùng org giáo viên chính không? Nếu khác, lead cũ ở org `LEAD_ORG_ID` có thể không hiển thị cho giáo viên.
- Onboarding có cho user chưa verify email tạo org không (quyết định mức độ thật của H1)?
