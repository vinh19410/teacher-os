---
title: "Student onboarding wizard (thu thập mục tiêu học sau đăng ký)"
description: "Sau khi email đã verify, học viên vào portal thấy wizard 4 bước (IELTS/TOEIC, điểm mục tiêu, mục tiêu học, giờ học/ngày) lưu vào cột mới bảng student qua POST /api/student/onboarding; gate 2 chiều giữa / và /onboarding."
status: completed
priority: P2
effort: 11h
issue: 264
branch: vinh19410/feat/student-onboarding-wizard
tags: [feature, backend, frontend, database, api]
blockedBy: []
blocks: []
created: 2026-09-24
---

# Student onboarding wizard (thu thập mục tiêu học sau đăng ký)

## Overview

Kế thừa mạch plan `260924-0213-student-email-verification` (đã completed): học viên đăng ký portal bằng email/password → server gửi email verify (soft mode vẫn cấp session) → portal hiển thị màn chờ xác thực → click link verify + auto sign-in → bridge provisioning tạo hồ sơ student khi `emailVerified === true`. Plan này thêm bước kế tiếp trong hành trình đó: **lần đầu vào portal sau khi đã verify, học viên thấy wizard 4 bước thu thập mục tiêu học** — quan tâm IELTS hay TOEIC, band/điểm mục tiêu, mục tiêu học tiếng Anh, thời gian tự học mỗi ngày — rồi mới vào overview.

Lưu trữ: 6 cột nullable mới trên bảng `student` (migration 0026), ghi qua endpoint mới `POST /api/student/onboarding` nằm sau middleware provisioning có sẵn của `/api/student/*` (`apps/server/src/routes/student.ts:43-145`). UI: route `/onboarding` dưới `_auth` + gate 2 chiều với `_auth/index.tsx`. Không thêm dependency; không đụng teacher app (apps/web).

## Decisions

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | Wizard hiển thị **lần đầu vào portal sau khi email đã verify** (khi `onboardingCompletedAt` null), không phải ngay sau sign-up | Bridge provisioning + endpoint ghi yêu cầu `emailVerified === true` (middleware trả 403 `STUDENT_EMAIL_UNVERIFIED`, `apps/server/src/routes/student.ts:103-111`); lưu answers tạm client-side qua bước verify là state mong manh. Flow chốt: sign-up → màn chờ verify (plan #259) → verify + auto sign-in → vào `/` → redirect `/onboarding` → hoàn thành → về `/`. **Đường Google OAuth** (verified ngay, không có màn chờ — `login.tsx:5,100`, `packages/auth/src/index.ts:59-64`): Google user rơi thẳng `/login` → `/` → gate → wizard — hành vi đúng; copy wizard KHÔNG được viết theo ngữ cảnh "vừa xác thực email" |
| D2 | Route mới `/onboarding` dưới layout `_auth`; gate 2 chiều: `_auth/index.tsx` khi chưa onboarding → Navigate `/onboarding`; route `/onboarding` khi đã onboarding → Navigate `/`. KHÔNG đụng `beforeLoad` của `_auth/route.tsx` | Gate bằng dữ liệu (`onboardingCompletedAt`) thay vì đổi guard session đang chạy tốt (`apps/student/src/routes/_auth/route.tsx:4-16`); 2 chiều chặn vòng lặp redirect và chặn user đã onboarding quay lại wizard bằng URL |
| D3 | Storage = 6 cột nullable trên bảng `student`: `examInterest` text, `targetScore` text, `learningGoals` text (JSON array string của goal keys), `learningGoalsNote` text, `dailyStudyHours` text, `onboardingCompletedAt` integer timestamp_ms nullable. Migration kế tiếp = **0026** (sinh bằng `pnpm db:generate`) | Theo quy ước "derived-until-user-mutable" của `docs/code-standards.md:26-35` (mutable facts get a real column + docblock ghi user action); repo không có enum DB-level — text + enum zod ở contracts là pattern hiện có (`CLASS_TYPES`, `packages/api/src/contracts.ts:19-20`) |
| D4 | Contracts trong `packages/api/src/contracts.ts` theo pattern `CLASS_TYPES`: `EXAM_INTERESTS = ["ielts","toeic"]`, `IELTS_TARGET_BANDS = ["5.0","5.5","6.0","6.5","7.0","7.5","8.0+"]`, `TOEIC_TARGET_SCORES = ["450","550","650","750","850","990"]`, `LEARNING_GOAL_OPTIONS = ["study-abroad","career","certification","communication","academic","other"]`, `DAILY_STUDY_HOUR_OPTIONS = ["under-1","1-2","2-3","3-plus"]` (đều `as const`). `studentOnboardingPayloadSchema`: examInterest enum, targetScore điều kiện theo examInterest (superRefine), learningGoals array(enum).min(1) + unique + note optional trim ≤200, dailyStudyHours enum. `studentMeSchema` mở rộng onboarding fields (nullable) + `onboardingCompletedAt` dạng **ISO string nullable** | Enum nghiệp vụ nằm ở zod contracts là pattern duy nhất hiện có của repo; wire format ISO string chosen vì `studentMeSchema` hiện chưa có timestamp nào và precedent serialize cùng khu student portal là `submittedAt: z.string().nullable()` (`packages/api/src/contracts.ts:970`) — không đưa number ms lên wire |
| D5 | API: `POST /api/student/onboarding` trong `studentRoutes`, đi qua middleware provisioning có sẵn; parse payload → update student row → trả studentMe DTO. Idempotent last-write-wins. **Bắt buộc kèm guard CSRF** cho POST (Origin ∈ allowlist `corsOrigin` → 403 fail-closed; `Content-Type` phải `application/json` → 415; content-length > 4KB → 413) đăng ký TRƯỚC middleware session — nhân bản pattern `kernel.ts` vì cookie là `SameSite=None` (`packages/auth/src/index.ts:111-116`) | Middleware provisioning chỉ check session, không chống CSRF — POST ghi đầu tiên dưới `/api/student/*` phải có cùng lớp phòng thủ như mọi mutation của kernel (`apps/server/src/routes/kernel.ts:146-166`, test regression `student.test.ts:460-495`); form cross-site `text/plain` sẽ vượt qua `c.req.json()` nếu không chặn content-type. Double-submit hoặc chạy lại chỉ ghi đè — an toàn |
| D6 | UI: `OnboardingWizard` + step components; state object lifted trong wizard; validate từng bước bằng zod schema con dựng từ enums contracts; progress indicator tự dựng bằng tokens có sẵn (packages/ui KHÔNG có stepper — đã duyệt `packages/ui/src/components/`). Copy tiếng Việt. Textarea ở bước mục tiêu dùng `Textarea` có sẵn từ `@teacher-os/ui` (`packages/ui/src/components/textarea.tsx`) + `className` override về token portal (`border-line`, `--focus-ring`). Bước cuối tổng hợp + nút "Hoàn thành" → POST qua repo function `submitOnboarding` trong `apps/student/src/lib/repos/student.ts` + TanStack Query mutation (onSuccess `setQueryData(["student","me"], data)` trước khi navigate — triệt tiêu race cache) + sonner toast lỗi; thành công → invalidate overview + navigate `/` | KISS/DRY: không thêm dependency (student app đã import từ `@teacher-os/ui` — `__root.tsx:6`); repo + HttpError pattern có sẵn (`apps/student/src/lib/repos/student.ts:16-44`); toast + spinner precedent `sign-up-form.tsx:43`, `student-error-view.tsx:129`. `setQueryData` từ DTO mutation trả về đóng cửa sổ stale-cache giữa navigate và refetch (gate ở `/` đọc cache mới ngay) |
| D7 | Bắt buộc, không skip: 4 bước, mỗi bước 1 lựa chọn nhanh (multi-select ở bước mục tiêu), không nút bỏ qua, không default ngầm | Dữ liệu thu thập có giá trị sử dụng (gợi ý lớp, hiển thị mục tiêu sau này) chỉ khi đầy đủ; user flow ngắn (4 lựa chọn + 1 note tùy chọn) nên không cần lối thoát |
| D8 | **Cohort học viên hiện hữu** (đã verify trước khi feature ship, `onboardingCompletedAt` null sau migration) cũng đi qua wizard đúng một lần — KHÔNG backfill `onboarding_completed_at` trong migration | Mục tiêu của plan là thu thập thông tin từ học viên — cohort hiện hữu chính là nguồn dữ liệu giá trị nhất (đang học thật); backfill sẽ vĩnh viễn bỏ mất cơ hội hỏi họ. Wizard ngắn nên chấp nhận friction một lần. Kill-switch nếu phản ứng tiêu cực: `UPDATE student SET onboarding_completed_at = <now>` chạy tay trên D1 (không cần code change) |

Wizard steps (copy tiếng Việt, cho phép refine khi implement): (1) "Bạn đang quan tâm chứng chỉ nào?" — IELTS / TOEIC; (2) "Điểm mục tiêu của bạn?" — options đổi theo bước 1; (3) "Mục tiêu học tiếng Anh của bạn là gì?" — multi-select chips (Du học / Thăng tiến công việc / Thi chứng chỉ / Giao tiếp tự tin / Học tập & nghiên cứu / Khác) + note tùy chọn ≤200 ký tự; (4) "Mỗi ngày bạn dành bao nhiêu thời gian cho tiếng Anh?" — Dưới 1 giờ / 1–2 giờ / 2–3 giờ / Hơn 3 giờ. Màn cuối: tổng hợp lựa chọn + nút "Hoàn thành".

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [DB schema + migration 0026 + contracts onboarding](./phase-01-db-and-contracts.md) | Completed |
| 2 | [POST /api/student/onboarding + studentMe mở rộng + unit tests](./phase-02-onboarding-endpoint.md) | Completed |
| 3 | [Portal — route /onboarding + wizard UI + gate 2 chiều](./phase-03-portal-wizard-ui.md) | Completed |
| 4 | [E2E onboarding + cập nhật spec cũ + full gates](./phase-04-e2e-and-gates.md) | Completed |

## Success Criteria

- [x] Flow đầy đủ: sign-up → màn chờ verify → click link verify + auto sign-in → vào `/` → tự chuyển `/onboarding` → hoàn thành wizard → về `/` thấy overview (heading "Chào")
- [x] Dữ liệu lưu đúng cột DB (`exam_interest`, `target_score`, `learning_goals` JSON, `learning_goals_note`, `daily_study_hours`, `onboarding_completed_at` NOT NULL sau khi hoàn thành) — assert ở unit test + e2e
- [x] User đã onboarding vào `/` KHÔNG bị redirect sang `/onboarding`; vào thẳng `/onboarding` bị đẩy về `/`
- [x] User chưa verify vẫn thấy màn "Email chưa được xác thực" cũ (kể cả khi vào thẳng `/onboarding`) — wizard không xuất hiện trước verify
- [x] `pnpm check`, `pnpm check-types`, `pnpm test` (root) exit 0
- [x] E2E: 3 spec student (onboarding mới + email-verification sau đổi kỳ vọng + provisioning) pass **2 lần liên tiếp** (không có test nào pass nhờ retry); full e2e suite pass 1 lần

## Non-goals

- HIỂN THỊ dữ liệu onboarding ở teacher app (apps/web): placeholder `targetBand: "—"` giữ nguyên (`apps/web/src/lib/repos/students.ts:67`, render tại `apps/web/src/components/class-detail/class-roster-tab.tsx:81` và `apps/web/src/routes/_auth/students/$studentId.tsx:99`) — follow-up plan riêng
- UI chỉnh sửa answers sau khi hoàn thành wizard (edit profile) — chỉ làm mới hoàn chỉnh một lần; endpoint đã idempotent nên plan sau tái sử dụng được
- i18n ngoài tiếng Việt (repo hardcode tiếng Việt trong JSX, không có infra i18n)
- Onboarding cho teacher app (apps/web)
- Nút skip / lưu từng phần (partial save) — trái D7
- Đổi `CLASS_TYPES` hiện có (`["ielts","communication"]`) hay type lớp: `examInterest` là dữ liệu riêng học viên, không đụng mô hình lớp học

## Risks & Notes

- **Migration 0024 vs plan #260** (account-role-app-separation): CẢ HAI plan đang cùng claim số 0024 (plan #260 `plan.md:39,109` cũng ghi "migration 0024"; journal hiện dừng idx 23). Quy trình bắt buộc (Task 1.2): (1) pull/rebase develop + đọc `_journal.json` MỚI NHẤT ngay trước khi chạy `pnpm db:generate` — không dựa memory; (2) trước khi mở PR, nếu develop đã có 0024 → **delete file migration + entry journal/meta local, chạy lại `db:generate`** để sinh 0025, rồi cập nhật mọi tham chiếu số trong phase docs. KHÔNG thể renumber bằng cách sửa docs — file đã sinh phải xoá sinh lại. Hai migration không conflict SQL (bảng khác nhau), chỉ conflict số
- **Version-skew server/client**: 6 field onboarding trong `studentMeSchema` khai báo `.nullable().catch(null)` (read-side) — client bundle mới gặp server cũ (rollback worker, cache CDN) vẫn parse được thay vì ZodError trắng màn lỗi cả portal. Deploy order chuẩn: server trước client. Siết lại `.catch(null)` thành required ở release sau khi chắc chắn không còn bundle cũ
- **Trust model `/api/student/*` đổi từ read-only → có POST ghi** (comment `contracts.ts:907-910` cập nhật ở Phase 2). Lookup email global không scope org: session teacher (Google, verified ngay) có email trùng student row ở org khác về mặt lý thuyết ghi được vào row đó. Role gate chéo app (teacher/student) là đúng scope plan #260 (account-role-app-separation) — KHÔNG lồng ghép vào plan này
- Rate-limit cho POST `/onboarding`: repo chưa có rate-limit tầng app ngoài better-auth (`/api/auth/*` chỉ) — chấp nhận posture hiện có (như kernel), chỉ thêm content-length cap 4KB (payload thật tối đa ~500B). Durable rate-limit là việc riêng nếu thấy lạm dụng
- **Gate `/` chờ cả `meQuery` lẫn `overviewQuery`** (giữ `isLoading` hiện có, tối thiểu diff): user chưa onboarding trả giá 1 lần fetch overview rồi mới bị redirect — với user mới provision thì overview rỗng (nhanh); cohort hiện hữu có enrollment sẽ chậm hơn một lần duy nhất. Gate đặt TRƯỚC nhánh `overviewQuery.error` nên lỗi overview không bao giờ kẹt user ngoài wizard
- `learningGoals` là JSON-in-text: mọi đường đọc parse + validate fail-soft (enum 4 phía: goals, examInterest, targetScore, dailyStudyHours — invalid → null ở DTO, không crash), có unit test khóa hành vi (Task 2.3)
- **Portal gate phá spec e2e cũ có chủ ý**: `student-portal-email-verification.spec.ts:74-77` hiện assert heading "Chào" ngay sau verify — với gate mới, user mới sẽ rơi vào `/onboarding` thay vì overview. Phase 4 cập nhật assertion đó (cùng cách plan #259 đổi kỳ vọng NOT_LINKED → EMAIL_UNVERIFIED). Spec `student-portal-provisioning.spec.ts:11-36` KHÔNG bị ảnh hưởng (chỉ web app + DB count)
- Thứ tự contract bắt buộc: Phase 1 chỉ THÊM exports mới (enums + payload schema); việc sửa `studentMeSchema` dồn về Phase 2 làm cùng handler `/me` + test — nếu không, `pnpm check-types` của server vỡ lửng giữa Phase 1 và 2
- E2E boot shim đã sẵn 3 webServer + origin student + RecordingMailer (plan #259 để lại: `apps/e2e/src/boot.ts:27-52`, `apps/e2e/playwright.config.ts:33-69`) — Phase 4 không phải đụng infra, chỉ viết spec
- E2E chạy `workers: 1` (`apps/e2e/playwright.config.ts:16`), DB wipe mỗi lần boot — spec mới seed org theo pattern `beforeAll` của spec email-verification. CI bật `retries: 1` (`playwright.config.ts:17`) — kết luận "pass thật" phải đọc output không có dòng flaky/retry (Task 4.3)
- Phụ thuộc chuỗi #259: flow verify + auto sign-in + provisioning phải còn hoạt động; regression ở đó làm wizard không bao giờ được nhìn thấy
- Test strict-equality `(a)` trong `apps/server/src/student.test.ts:270-278` (`expect(me).toEqual({...})`) sẽ vỡ khi mở rộng DTO — đổi kỳ vọng có chủ ý ở Phase 2 Task 2.1

## Red Team Review

### Session — 2026-09-24
**Reviewers:** 3 hostile reviewers (Security Adversary/Fact Checker, Failure Mode Analyst/Contract Verifier, Assumption Destroyer/Fact Checker)
**Findings:** 24 raw → 16 unique sau dedupe → gom thành 15 findings (**15 accepted**, trong đó 2 accept-modified; 0 rejected sau evidence filter — mọi finding đều có citation file:line)
**Severity breakdown:** 1 Critical, 5 High, 9 Medium
**Verification (tier Standard):** Fact Checker 34 claims (29V/5F — failures: posture read-only của D5, lập luận vị trí gate, citation origins.ts:10, tiền đề "không có textarea dùng lại được", thiếu phân tích Google OAuth); Contract Verifier liệt kê đầy đủ consumer `studentMeSchema`/`StudentMe`/`/api/student/me` (3 schema site, 6 type site, 1 runtime caller + 11 test call — không consumer nào bị bỏ sót; đúng 1 strict-equality test cần đổi, plan đã phủ) + ~30 line-claim khớp toàn bộ. Mọi failure đã fix qua findings dưới đây.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | POST `/onboarding` thiếu guard CSRF (Origin + content-type) mà kernel bắt buộc cho mọi mutation — cookie `SameSite=None`, form `text/plain` cross-site vượt qua `c.req.json()` | Critical | Accept | Phase 2 Task 2.2 (middleware trước session middleware) + Task 2.3 case 5 + D5 |
| 2 | `/api/student/*` đổi posture read-only → có POST ghi; lookup email global không scope org (teacher Google-verified email trùng student row org khác ghi được) | High | Accept-modified (cập nhật trust-model comment contracts + Risks; role gate chéo app là scope plan #260, không lồng vào plan này) | Phase 2 Task 2.1 + plan Risks |
| 3 | Gate đặt sau nhánh `overviewQuery.error` → lỗi overview thoáng qua kẹt user chưa onboarding ở màn lỗi, không tới wizard; overview fetch trước redirect là phí | High | Accept (chuyển gate lên giữa nhánh `meQuery.error` và `overviewQuery.error`; giữ `isLoading` 2 query như tradeoff tối thiểu diff, ghi Risks) | Phase 3 Goal + Task 3.4 + plan Risks |
| 4 | Race invalidate→navigate: gate ở `/` đọc cache cũ (`onboardingCompletedAt` null) trong cửa sổ refetch → bounce ngược vào wizard, mất state answers | High | Accept (`setQueryData(["student","me"], data)` trong onSuccess trước navigate + e2e anti-bounce assertion) | Phase 3 Task 3.1 + Phase 4 Task 4.1 |
| 5 | Collision migration 0024 với plan #260 là kịch bản mặc định (cùng claim 0024); remedy "đổi tham chiếu số trong docs" sai cơ học — journal trùng idx hỏng deploy | High | Accept (re-read journal develop ngay trước generate; nếu trùng: delete migration + journal/meta local rồi regenerate; verify grep pin bảng `student`) | Phase 1 Task 1.2 + plan Risks |
| 6 | Cohort học viên hiện hữu (verified trước khi ship) bị force-redirect wizard vĩnh viễn — không quyết định backfill/intent | High | Accept (thành D8: chủ ý thu thập từ cohort hiện hữu — nguồn dữ liệu giá trị nhất; kill-switch SQL) | plan D8 |
| 7 | `studentMeSchema` thêm 6 required key + client `.parse()` strict → server rollback/cache CDN lệch version = ZodError trắng màn CẢ portal | Medium | Accept (6 field `.nullable().catch(null)` read-side + Risks deploy order server-trước-client) | Phase 2 Task 2.1 + plan Risks |
| 8 | D1 không phân tích đường Google OAuth (verified ngay, không màn chờ verify — `login.tsx:5,100`) | Medium | Accept (note D1: Google user rơi thẳng gate → wizard; copy không viết theo ngữ cảnh "vừa verify email") | plan D1 |
| 9 | Validation read-side bất đối xứng: chỉ `learningGoals` được fail-soft theo enum, 3 field kia pass-through; hành vi fail-soft không có test khóa | Medium | Accept (`parseEnum`/`parseTargetScore` fail-soft 4 phía + test case 8 corrupt DB) | Phase 2 Task 2.1 + 2.3 |
| 10 | Verify migration đếm `ADD COLUMN` tổng — không pin bảng, schema drift bảng khác lọt qua | Medium | Accept (grep `ALTER TABLE "student" ADD COLUMN` = 6 và tổng `ALTER TABLE` = 6) | Phase 1 Task 1.2 |
| 11 | POST mới không body-size cap, không rate-limit (write-amplification) | Medium | Accept-modified (content-length > 4KB → 413; rate-limit defer — nhất quán posture repo, kernel cũng chưa có, ghi Risks) | Phase 2 Task 2.2 + plan Risks |
| 12 | Task 4.2 "bỏ assertion chỉ nếu ổn định" mơ hồ; CI `retries: 1` khiến chuẩn "2 lần liên tiếp" không phân biệt pass-that vs pass-on-retry | Medium | Accept (giữ deterministic dòng 77; Task 4.3 đọc output không có flaky/retried) | Phase 4 Task 4.2/4.3 + plan Risks + Success Criteria |
| 13 | Snippet Task 3.4 dùng `navigate` không khai báo + thiếu imports — implementer copy là vỡ check-types | Medium | Accept (snippet đầy đủ `const navigate = useNavigate()` + imports + `void navigate` theo `login.tsx:39-40`) | Phase 3 Task 3.4 |
| 14 | Tiền đề "KHÔNG import shadcn mới" sai — `packages/ui` CÓ `Textarea`; tự dựng là reimplementation song song | Medium | Accept (dùng `Textarea` từ `@teacher-os/ui` + className override token portal) | Phase 3 Task 3.2 + D6 |
| 15 | Effort Phase 4 = 2h không thực tế cho full suite ×2 (29+ specs, workers:1) + citation lệch dòng (origins.ts:10→8, helpers 51-60→51-61) | Medium | Accept (student specs ×2 + full suite ×1; effort 3h, plan 11h; sửa citation) | Phase 4 + plan frontmatter |

**Decision được bảo toàn (không relitigate):** D1 (wizard sau verify), D5 (idempotent last-write-wins qua bridge có sẵn), D7 (bắt buộc, không skip) — mọi finding đều áp trong khung các quyết định này.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-04 (sau khi áp 15 findings)
- Decision deltas checked: 15
- Reconciled stale references: 5 — D5 "không sinh surface mới" → thêm guard CSRF; phase-02 Goal "không thêm một dòng guard nào" → CSRF guard đăng ký trước middleware session; phase-03 Goal vị trí gate (sau 2 nhánh error → giữa 2 nhánh) + lý do sai về user chưa verify rút lại; Task 3.1 invalidate prefix `["student"]` → setQueryData + invalidate overview; phase-04 chuẩn "2 lần" → student specs ×2 + full ×1; citations origins.ts/helpers.ts
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-09-24 (intake, trước khi draft)
- Scope Challenge (auto, không --yagni): **HOLD SCOPE** — giao đủ phạm vi user yêu cầu (wizard 4 bước: IELTS/TOEIC, target, mục tiêu học, giờ/ngày); từ chối additions ngoài yêu cầu (hiển thị teacher app → Non-goals). Existing code: toàn bộ flow đăng ký/verify/provisioning từ #257/#259 tái sử dụng; không có wizard/profile field/toeic nào hiện hữu
- Mode auto-detect: **hard** (feature full-stack 4 package, cần scouting) — scout report lưu `reports/scout-report.md`; không spawn researcher ngoài (không unknown công nghệ mới, mọi quyết định grounding từ codebase)

### Verification Results
- Tier: Standard (4 phases → Fact Checker ×2 + Contract Verifier ×1, chạy trong red-team session)
- Claims checked: 64 | Verified: 58 | Failed: 5 | Unverified/partial: 1
- Failures (đã fix qua findings #1, #3, #8, #14, #15): posture read-only `/api/student`; lập luận vị trí gate; citation `origins.ts:10`; tiền đề textarea; Google OAuth assumption gap
- Consumer enumeration (Contract Verifier): `studentMeSchema` (3 site), `StudentMe` (6 site), `/api/student/me` (1 runtime + 11 test call) — không consumer bị bỏ sót; đúng 1 strict test cần đổi (Task 2.1 bước 4)
