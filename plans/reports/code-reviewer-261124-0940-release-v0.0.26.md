# Báo cáo Pre-Landing Code Review — Official Release v0.0.26 (`develop` → `main`)

- **Ngày review:** 2026-11-24 (Europe/London)
- **Vai trò:** Staff Engineer (Two-Pass Pre-Landing Production-Readiness Review)
- **Phạm vi diff:** `git diff origin/main...HEAD` (`1ae8b600..0840654d`, nhánh `vinh19410/Ship-Official`)
- **Quy mô:** 46 commits, 969 files thay đổi (bao gồm bộ JSON dataset `docs/listening_ielts/` và ảnh báo cáo `plans/reports/*.png`), **4 D1 migrations (`0083`–`0086`)**
- **Tài liệu chuẩn đã đối chiếu:** `AGENTS.md`, `REVIEW.md`, `docs/production-release-runbook.md`

---

## 1. Kết luận tổng quan (Overall Assessment)

**Phán quyết: `GO WITH CONDITIONS` (Đủ điều kiện phát hành khi áp dụng điều kiện giảm thiểu & quy trình cutover dưới đây)**

- **Pass 1 (Critical / Blocking):** **0 lỗi Critical** thuộc nhóm XSS/HTML injection, SQL injection, IDOR/rò rỉ dữ liệu liên org, SSRF, rò rỉ secret, hay D1 migration phá hủy dữ liệu. Toàn bộ 4 migration (`0083`–`0086`), cơ chế fail-closed của `VITE_STUDENT_PRACTICE_ENABLED` trên prod, bộ redirect 301 legacy và cấu trúc unified LMS Worker đều đã được kiểm chứng qua mã nguồn và test suite.
- **Điều kiện cần xử lý / giảm thiểu trước hoặc ngay trong đợt release:**
  1. **[High — Security Boundary]** Đóng hoặc giảm thiểu cửa sổ **account squatting / verification-link pre-hijacking** cho các email mới cấu hình trong `ADMIN_EMAILS` / `TEACHER_EMAILS` trên unified LMS (`packages/auth/src/index.ts:408-423`, `.github/workflows/deploy.yml:98`).
  2. **[High — Cutover Hazard]** Tuân thủ quy trình cutover giảm rủi ro downtime/orphan 3 custom domain (`app`/`student`/`admin.msmy.io.vn`) do `detach-legacy-worker-domains.ts` chạy trước `alchemy deploy` (`.github/workflows/deploy.yml:68-104`).
  3. **[Important — Reliability]** Bổ sung giãn cách gửi email (`sendIntervalMs`) trong `emitNotifications` cho luồng `confirm-opening` để tránh HTTP 429 burst của Resend (2 req/s) khi gửi thông báo khai giảng cho lớp đông (`apps/server/src/lib/notifications/emit.ts:76-82`).
  4. **[Important — Defense-in-Depth]** Bổ sung `/api/student/practice/:testId/audio` vào danh sách route áp `Cross-Origin-Resource-Policy: same-site` trong `apps/server/src/app.ts:339-362`.

---

## 2. Pass 1 — Phát hiện mức Critical / High / Important

### Critical (Blocking)
*Không phát hiện lỗ hổng mức Critical trong phạm vi `origin/main...HEAD`.*

### High Priority

#### [H1] Cửa sổ Account Squatting & Verification-Link Pre-Hijacking cho email mới trong `ADMIN_EMAILS` / `TEACHER_EMAILS` trên Unified LMS
- **Vị trí:**
  - `packages/auth/src/index.ts:408-423` (`databaseHooks.user.create.before` nhánh `isUnifiedContext`)
  - `packages/auth/src/index.ts:350` (`emailVerification.sendOnSignUp: true`)
  - `.github/workflows/deploy.yml:98` (lần đầu wire `ADMIN_EMAILS: ${{ vars.ADMIN_EMAILS }}` lên production)
  - `apps/lms/src/routes/login.tsx:126` (UI ghi *"Tạo tài khoản học viên"*, nhưng backend không giới hạn role ở endpoint `/api/auth/sign-up/email`)
- **Bản chất & Kết quả kiểm chứng thực nghiệm (`better-auth@1.7.16`):**
  - Khi nhận `POST /api/auth/sign-up/email` với `Origin: https://lms.msmy.io.vn`, hook `user.create.before` phân loại role trực tiếp qua `resolveAllowlistRole(email, { adminEmails, teacherEmails })` và cho phép **bất kỳ người dùng chưa đăng nhập nào** tạo tài khoản `credential` (email + password do kẻ tấn công chọn) mang `role: "admin"` hoặc `role: "teacher"` (`emailVerified: false`) cho bất kỳ email nào nằm trong `ADMIN_EMAILS` / `TEACHER_EMAILS` mà chưa đăng ký trước đó.
  - Đã kiểm chứng thực nghiệm bằng script chạy trực tiếp `createAuth` (`better-auth@1.7.16`):
    - **Điểm an toàn đã xác nhận:** `better-auth` mặc định **từ chối** tự động link Google OAuth vào tài khoản `credential` chưa xác minh (trả `302 /api/auth/error?error=account_not_linked`), và toàn bộ route API nhạy cảm (`createRequireAdmin` ở `apps/server/src/lib/require-admin.ts:36`, `bootstrapMiddleware` ở `apps/server/src/app.ts:282`) đều chặn `emailVerified !== true`. Do đó **không xảy ra OAuth auto-linking pre-hijacking thụ động**.
    - **Rủi ro thực tế vẫn tồn tại:**
      1. **Account squatting / DoS Google OAuth:** Chủ tài khoản hợp pháp của email mới thêm vào `ADMIN_EMAILS` sẽ bị lỗi `account_not_linked` khi đăng nhập Google lần đầu, buộc phải reset password hoặc can thiệp DB.
      2. **Verification-link pre-hijacking:** Ngay khi kẻ tấn công gọi `sign-up/email`, hệ thống lập tức gửi email thật *"Xác thực email Cô Mỹ Dạy Tiếng Anh của bạn"* (`sendOnSignUp: true`) tới hộp thư admin/teacher. Nếu chủ email bấm vào link đó (đặc biệt dễ xảy ra ngay trong ngày cutover cấu hình `ADMIN_EMAILS`), `email_verified` chuyển thành `1` trong khi mật khẩu của kẻ tấn công vẫn còn hiệu lực → **chiếm toàn quyền `admin`/`teacher`**.
- **Khuyến nghị xử lý:**
  - **Giảm thiểu bắt buộc ngay khi release (nếu chưa vá code trước merge):** Trước khi công bố `lms.msmy.io.vn`, kiểm tra mọi email trong `vars.ADMIN_EMAILS` và `vars.TEACHER_EMAILS` của GitHub Environment `production`; nếu có email nào chưa có bản ghi `user` trong prod D1, chủ tài khoản phải đăng nhập Google OAuth để tạo và xác minh tài khoản ngay sau deploy.
  - **Sửa triệt để (follow-up hoặc vá trước ship):** Ở `packages/auth/src/index.ts:409-423`, chặn `POST /api/auth/sign-up/email` tạo mới tài khoản mang role `admin`/`teacher` trên unified origin (chỉ cho phép `student` tự đăng ký email/password; `admin`/`teacher` đăng nhập lần đầu qua Google OAuth — hoặc tách cờ opt-in riêng cho E2E/local test).

#### [H2] Cửa sổ downtime bắt buộc & rủi ro orphan 3 production domain khi cutover Unified LMS
- **Vị trí:**
  - `.github/workflows/deploy.yml:68-74` (chạy `detach-legacy-worker-domains.ts --stage prod` **trước** `alchemy deploy`)
  - `packages/infra/scripts/detach-legacy-worker-domains.ts:37-44,169-201`
  - `packages/infra/alchemy.run.ts:375-425` (deploy `lms` với 4 domain `lms/app/student/admin.msmy.io.vn` sau `db`/`server`/`landing`/`profile`)
- **Phân tích tác động:**
  - `detach-legacy-worker-domains.ts` xóa custom domain binding của `app.msmy.io.vn`, `student.msmy.io.vn`, và `admin.msmy.io.vn` khỏi 3 Worker cũ (`web`, `student`, `admin`) **trước khi** `pnpm alchemy deploy --stage prod --yes` bắt đầu build 4 app frontend (`lms` + `web`/`student`/`admin`), `landing`, `profile`, `server`, chạy D1 migrations `0083`–`0086`, và gắn lại domain vào Worker `lms` (kèm thời gian Cloudflare cấp/gắn lại TLS).
  - Hệ quả:
    1. **Downtime cứng ~3–10 phút** trên cả 3 domain đang chạy prod trong lần deploy cutover đầu tiên (các lần deploy sau script này là idempotent no-op).
    2. **Rủi ro partial-failure:** Nếu `alchemy deploy` lỗi giữa chừng (lỗi build Vite, lỗi D1 migration, lỗi Cloudflare API timeout/rate-limit) sau khi bước detach đã hoàn tất, cả 3 domain legacy rơi vào trạng thái **mồ côi (không trỏ Worker nào)** cho đến khi deploy lại thành công hoặc rollback.
    3. **Kiểm tra tên Worker prod:** Guard `isLegacyWorkerServiceName` (`detach-legacy-worker-domains.ts:37-42`) fail-closed an toàn nếu gặp tên service lạ, nhưng cần chắc chắn tên Worker cũ trên prod khớp `teacher-os-(web|student|admin)-prod(-...)?` hoặc `teacher-os-prod-(web|student|admin)(-...)`.
- **Khuyến nghị xử lý:**
  - Thực hiện cutover trong **khung giờ thấp tải** (tránh giờ học buổi tối và tránh sát 06:00 VN khi cron gửi mail chạy).
  - Chạy `Deploy Production` với `dry_run=true` **trước** khi deploy thật để xác nhận plan Alchemy không có thao tác xóa/thay thế ngoài ý muốn lên D1 (`database`) hoặc 3 R2 bucket (`media`, `library-audio`, `materials`).
  - Sao lưu prod D1 ngay trước khi chạy deploy; chuẩn bị sẵn phương án re-run deploy hoặc revert nhanh nếu bước `alchemy deploy` thất bại sau khi đã detach.

---

### Important

#### [I1] Nguy cơ HTTP 429 burst trên Resend khi `confirm-opening` gửi email thông báo khai giảng cho lớp đông
- **Vị trí:**
  - `apps/server/src/routes/kernel.ts:2789-2793` (`POST /api/classes/:id/confirm-opening` gọi `emitNotifications`)
  - `apps/server/src/lib/notifications/emit.ts:76-82` (gọi `deliverNotifications` **không truyền `sendIntervalMs`**, mặc định `0`)
  - Đối chiếu: `apps/server/src/lib/notifications/daily-deadline-reminder.ts:41-42,342-350` đã đặt `DEFAULT_REMINDER_SEND_INTERVAL_MS = 550` để tôn trọng giới hạn 2 req/s của Resend.
- **Tác động:**
  - Khi giáo viên bấm chốt khai giảng cho lớp 10–30 học viên có email trên prod (`MAILER_IMPL=resend`), `deliverNotifications` bắn tuần tự với khoảng cách 0ms giữa các email; từ email thứ 3 trở đi dễ dính HTTP 429, và ở cả 2 lượt retry sau (`2s`, `5s`) các email thất bại vẫn bị bắn dồn với gap 0ms → dễ bị đánh dấu `failed` vĩnh viễn trong `notification_record` (phải bấm gửi lại thủ công).
  - **Lưu ý phân biệt với issue đã mở:** Issue `#906` chỉ theo dõi bulk resend trong `apps/server/src/routes/notification-logs.ts` và index `class_assignment(due_at)` — **chưa bao gồm `emitNotifications` / `confirm-opening`**.
- **Khuyến nghị xử lý:**
  - Truyền `sendIntervalMs` mặc định (ví dụ `550` ms khi `queuedEmailIds.length > 1`, có thể override về `0` qua `NotificationDeps` cho test/E2E giống mẫu `retryDelaysMs`) ngay trong `emitNotifications` (`apps/server/src/lib/notifications/emit.ts:76-82`), hoặc mở rộng phạm vi `#906` để xử lý chung cho cả `emitNotifications` và bulk resend.

#### [I2] Thiếu `Cross-Origin-Resource-Policy: same-site` cho endpoint audio tự luyện có xác thực
- **Vị trí:**
  - `apps/server/src/app.ts:339-362` (danh sách 16 route media/audio cookie-auth được ghi đè `CORP: same-site` + `Referrer-Policy: no-referrer`)
  - `apps/server/src/routes/student-practice.ts:433-450` (`GET /api/student/practice/:testId/audio`)
- **Tác động:**
  - Khi phục vụ audio từ R2 qua `serveStudyPackAudio` → `mediaObjectResponse`, route `/api/student/practice/:testId/audio` không nằm trong danh sách ghi đè ở `app.ts:339-356`, nên kế thừa `Cross-Origin-Resource-Policy: cross-origin` từ middleware `secureHeaders` (`app.ts:370`). Vì cookie phiên dùng `SameSite=None; Secure`, trang bên thứ ba có thể nhúng `<audio>` trỏ vào endpoint này kèm cookie phiên học viên (chỉ lộ metadata/phát âm thanh, không đọc được byte nhờ CORS).
  - Mức độ trên prod hiện được giảm nhẹ do menu tự luyện đang tắt (`VITE_STUDENT_PRACTICE_ENABLED=false`), nhưng API vẫn mở theo trust boundary đã ghi nhận trong `AGENTS.md`.
- **Khuyến nghị xử lý:**
  - Thêm `"/api/student/practice/:testId/audio"` vào mảng đường dẫn tại `apps/server/src/app.ts:339-356`.

---

## 3. Các bề mặt rủi ro cao đã kiểm tra & đạt yêu cầu (Verified Clean)

| Bề mặt kiểm tra | File / bằng chứng đã đối chiếu | Kết quả |
|---|---|---|
| **D1 Migrations `0083`–`0086` trên DB prod có dữ liệu** | `packages/db/src/migrations/0083..0086*.sql`, `meta/_journal.json`, `apps/server/src/routes/readiness.ts` | **Đạt.** Hoàn toàn additive (`CREATE TABLE`, `ADD COLUMN` nullable hoặc `DEFAULT` hằng số, `REFERENCES ... ON DELETE set null` có default `NULL`, index non-unique). `/readyz` tự động đối chiếu toàn bộ bảng/cột/index mới từ Drizzle schema. |
| **XSS / HTML Injection trong email & modal preview** | `packages/api/src/class-opening-email.ts`, `apps/server/src/lib/notifications/templates.ts`, `apps/web/src/components/modals/confirm-opening-modal.tsx:753-758` | **Đạt.** Mọi biến nội suy đều qua `escapeEmailHtml`/`escapeHtml`; link qua `isSafeEmailUrl`/`isSafeLinkUrl`; modal preview dùng `<iframe sandbox="" srcDoc={...}>` (cô lập tối đa, không script, không same-origin). |
| **Public Library Images (`/public/library-images/:filename`)** | `apps/server/src/routes/public-library-images.ts` | **Đạt.** Regex nghiêm ngặt `/^[a-zA-Z0-9_-]{1,128}\.(png\|jpg\|jpeg\|webp\|gif)$/` chặn path traversal & `.svg`; header `X-Content-Type-Options: nosniff`, `CSP: default-src 'none'; sandbox`, `CORP: cross-origin`. |
| **Inline Answer Inputs trong `QuizPaper`** | `packages/ui/src/lib/inline-instruction.ts`, `packages/ui/src/components/quiz/quiz-inline-instruction.tsx` | **Đạt.** Làm sạch hai lớp (DOMPurify + AST allowlist thẻ/thuộc tính + `sanitizeHref` chặn control char/protocol lạ) và render hoàn toàn bằng React JSX (không `dangerouslySetInnerHTML`). |
| **Placement Result PDF & Trang kết quả công khai** | `apps/web/src/lib/placement-result-pdf.ts`, `apps/profile/public/kiem-tra-dau-vao/ket-qua/{highlight,result}.js` | **Đạt.** PDF dùng `pdfmake` lazy-load + font Be Vietnam Pro tự host (tương thích CSP, không Web Worker/object), lọc bỏ PII (SĐT/email) và đáp án; `result.js` dựng DOM thuần bằng `document.createTextNode`/`el()`, không `innerHTML`. |
| **Guard tắt Student Practice trên Production** | `packages/infra/src/topology.ts`, `packages/infra/alchemy.run.ts:169-172`, `apps/lms/scripts/assemble-dist.mjs`, `.github/workflows/deploy.yml` | **Đạt.** Fail-closed cứng trên `PROD_APP_DOMAIN` (`msmy.io.vn`), được verify hậu-build trong `assemble-dist.mjs` và kiểm tra negative smoke check trực tiếp trên live bundle `/student/` trong `deploy.yml`. |
| **Legacy 301 Redirects, Routes Matcher & URL Prefixes** | `apps/lms/src/{legacy-redirect,routes-matcher,worker,security-headers}.ts`, `apps/server/src/index.ts:123,208`, `apps/web/src/components/modals/invoice-payment-modal.tsx:68` | **Đạt.** Bảo toàn `/sw.js` & `/registerSW.js` trên `app.`, không open-redirect, `/pay/$token` dùng `${window.location.origin}/pay/...`, `studentOrigin` = `.../student` và `appOrigin` = `.../teacher` không bị lặp prefix ở các callsite. |
| **Phân quyền & Cô lập Org** | `apps/server/src/routes/{courses,kernel,student,admin-library}.ts` | **Đạt.** `courses.ts` kiểm `canAccessFinance(ctx.role)` cho mọi thao tác ghi & đọc full; `confirm-opening` có CAS theo `openingAnnouncementVersion` và `NOT EXISTS` khóa lịch học; `student.ts` lọc `hasInAppChannel` nên bản ghi email-only (`daily_deadline_reminder`) không rò vào chuông/inbox học viên; `admin-library.ts` dùng `instr(lower(...))` có tham số hóa (tránh giới hạn 50 byte của `LIKE` trên D1). |
| **Merge conflict resolution (`0840654d`)** | `git show 0840654d --stat` và diff 4 file xung đột | **Đạt.** Các commit trên `origin/main` (`#856`, `#857`, `#859`) đã được đồng bộ nhất quán, không làm rơi cờ hay test nào. |

---

## 4. Pass 2 — Hạng mục Informational & Checklist Rollout Production

### Ghi nhận kỹ thuật (Non-Blocking)

1. **[M1] `reauth()` không `await` `authClient.signOut()` trước khi điều hướng `/login` (liên quan `#890`):**
   - `apps/web/src/lib/reauth.ts:29-32`, `apps/student/src/lib/query-client.ts:112-115`, `apps/admin/src/lib/query-client.ts:32-35` gọi `void authClient.signOut()` rồi lập tức `window.location.assign('/login?returnUrl=...')`. Dưới mô hình unified LMS nơi `/login` tự động redirect nếu còn session cookie, request `signOut()` bị trình duyệt hủy giữa chừng khi điều hướng có thể tạo vòng lặp redirect (đã được ghi nhận theo triệu chứng ở issue `#890`).
2. **[M2] Mất deep-link trên bookmark legacy dạng `/login?returnUrl=/classes`:**
   - `apps/lms/src/legacy-redirect.ts:84-109` giữ nguyên query `?returnUrl=/classes` khi redirect 301 từ `app.msmy.io.vn/login?returnUrl=/classes` → `lms.msmy.io.vn/login?returnUrl=/classes`. Khi đăng nhập xong, `resolvePostAuthRedirect` từ chối đường dẫn không bắt đầu bằng `/teacher` và fallback an toàn về `/teacher` (không lỗi bảo mật, chỉ rơi deep-link của bookmark cũ).
3. **[M3] Lệch nhẹ giữa `class.openingNote` và nội dung email ở chế độ `confirm-opening` `new_only`:**
   - `apps/server/src/routes/kernel.ts:2627,2779`: khi `input.mode === "new_only"`, `persistedNote` giữ nguyên `cls.openingNote` trong DB nhưng `classOpeningConfirmedEvents` dùng `input.note`. Nếu giáo viên sửa ghi chú khi gửi bổ sung học viên mới, email gửi đi mang ghi chú mới nhưng bản ghi lớp vẫn giữ ghi chú cũ.
4. **[M4] Check-then-insert trùng tên trong `courses.ts` thiếu unique index ở DB:**
   - `apps/server/src/routes/courses.ts:159-197,485-529` kiểm tra trùng tên bằng `SELECT` trước khi `INSERT` (không có unique index trên `(org_id, lower(name))` / `(org_id, category_id, lower(name))`). Rủi ro rất thấp trong bối cảnh single-org ít đồng thời.
5. **[M5] Ngưỡng thời gian chạy của cron `0 23 * * *` (`daily-deadline-reminder.ts`):**
   - Với `sendIntervalMs = 550`, gửi tuần tự ~500 email mất ~4,5 phút (nằm trong giới hạn wall-time của Cloudflare Cron Trigger, nhưng cần theo dõi log khi số học viên hoạt động tăng mạnh). Lưu ý cron `0 23 * * *` cũng được đăng ký trên staging (an toàn miễn `MAILER_IMPL=log`).
6. **[M6] Version trong `package.json`:**
   - Tại commit `0840654d`, `package.json` vẫn đang là `0.0.25`; bước bump lên `0.0.26` cần thực hiện đúng chuẩn trước khi mở PR / merge lên `main`.

### Checklist vận hành & Rollout Production (v0.0.26)

- [ ] **1. Sao lưu prod D1** trước khi merge/deploy (4 migrations `0083`–`0086`, thêm 3 bảng mới `course_catalog_seed`, `course_category`, `course`).
- [ ] **2. Kiểm tra Cloudflare DNS cho zone `msmy.io.vn`:** Đảm bảo không có bản ghi DNS thủ công (A/AAAA/CNAME) xung đột tại `lms.msmy.io.vn` trước khi Worker `lms` gắn custom domain.
- [ ] **3. Đối soát GitHub Environment `production` (Variables & Secrets):**
  - Xác nhận đã khai báo đầy đủ: `TEACHER_EMAILS` (bắt buộc, fail-closed), `ADMIN_EMAILS` (mới được nối vào `deploy.yml:98` — **xác nhận giá trị dự kiến**), `MAILER_IMPL=resend`, `RESEND_API_KEY`, `MAIL_FROM`, `LEAD_ORG_ID`, `LEAD_ORIGINS`, `OPENAI_API_KEY` (nếu bật AI grading).
  - Không đặt `STUDENT_PRACTICE_ENABLED` trên prod (đã bị fail-closed chặn cứng ở `resolveStudentPracticeEnabled`).
- [ ] **4. Xác nhận `apps/profile/maintenance.json`:** Hiện giữ nguyên `{"disabled": true}` (chế độ bảo trì trang hồ sơ công khai); xác nhận đây là chủ đích của bản phát hành này.
- [ ] **5. Chạy `Deploy Production` với `dry_run=true` trước:** Duyệt log plan của Alchemy để chắc chắn **0 thao tác delete/replace** lên D1 `database` hoặc R2 `media`/`library-audio`/`materials`, và tên Worker legacy khớp guard của `detach-legacy-worker-domains.ts`.
- [ ] **6. Chọn khung giờ thấp tải cho cutover thật** (dự trù cửa sổ gián đoạn 3–10 phút cho `app`/`student`/`admin.msmy.io.vn`).
- [ ] **7. Ngay sau khi deploy xanh & smoke check pass:**
  - Nếu `vars.ADMIN_EMAILS` có email chưa từng tồn tại trong prod D1, **đăng nhập Google OAuth bằng chính email đó ngay lập tức** để đóng cửa sổ H1.
  - Smoke thủ công trên **Chrome + Safari** tại `https://lms.msmy.io.vn/login` (đăng nhập teacher/student/admin, chuyển trang không bounce) và kiểm tra `curl -I https://app.msmy.io.vn/` trả `301` về `https://lms.msmy.io.vn/teacher`.
- [ ] **8. Xác nhận Cron Triggers & Theo dõi lượt gửi 06:00 VN đầu tiên:**
  - Trên Cloudflare Dashboard của Worker `server` (prod), xác nhận cả 2 cron `*/10 * * * *` và `0 23 * * *` đều active.
  - Theo dõi log lượt chạy `0 23 * * *` (06:00 Asia/Ho_Chi_Minh) đầu tiên sau deploy để kiểm chứng digest deadline gửi sạch không lỗi 429/timeout.

---

## 5. Đối chiếu các Issue đang mở (`#875`–`#906`) — Phân tách với Blocker mới

Các vấn đề sau đã được track sẵn trên GitHub Issues từ đợt QA staging — liệt kê để không nhầm lẫn với phát hiện mới từ code review, đồng thời đánh giá mức ảnh hưởng lên **production v0.0.26**:

| Nhóm Issue | Tóm tắt | Mức ảnh hưởng lên Prod v0.0.26 |
|---|---|---|
| **`#878` (P0)** | Audio Listening không tải được, đứng ở *"Đang tải file nghe…"* trên staging (`/student/practice/listening`) | **Hạn chế trên prod, cần lưu ý:** Menu tự luyện bị ẩn trên prod (`VITE_STUDENT_PRACTICE_ENABLED=false`) và bộ đề IELTS Listening mới chưa import lên prod (`import-listening-staging.yml` chỉ chạy cho staging). Các file `apps/student/src/lib/repos/quiz.ts` và `apps/server/src/lib/study-pack-audio.ts` **không thay đổi** trong `origin/main...HEAD`, nên luồng Listening giao bài hiện hữu trên prod không bị regression từ diff này. Tuy nhiên **không nên chạy import dataset listening lên prod** cho tới khi chốt root cause `#878`. |
| **`#875`–`#889`** (trừ `#878`) | Lỗi nội dung / UX tự luyện Reading & Listening trên staging | Thấp trên prod do UI Luyện tập đang tắt (`VITE_STUDENT_PRACTICE_ENABLED=false`). |
| **`#890`, `#891`, `#895`, `#896`, `#899`** | Auth/LMS UX (bounce `/login?returnUrl=`, admin mở `/student/`, `/register` 404, confirm password signup, `/favicon.ico` 404) | Tồn tại trên unified LMS (`#890` có liên hệ trực tiếp với **M1**); nên theo dõi sớm sau cutover. |
| **`#892`, `#893`, `#894`, `#902`** | Admin library table layout / slow load / count lệch / banner `answersInline` & student home white screen (`#892`) | Cần xác nhận mức tái hiện của `#892` (student home white screen khi tài khoản mới vào) trên staging trước khi mở rộng thông báo học viên. |
| **`#897`, `#904`, `#905`, `#906`** | Hardening hệ thống thông báo (sanitize raw error, Resend Idempotency-Key 409 khi sửa email rồi resend, thu hồi `queued` kẹt, `sendIntervalMs` cho bulk resend + index `due_at`) | Không chặn release; lưu ý **I1** ở trên là lỗ hổng bổ sung ngoài phạm vi `#906` hiện tại. |

---

## 6. Bằng chứng kiểm chứng đã chạy (Verification Evidence)

Môi trường kiểm chứng: Node `v24.22.1`, kiểm tra hoàn toàn read-only (không chạy full E2E local theo quy định `AGENTS.md`).

| Gate / Bộ test | Lệnh đã chạy | Kết quả |
|---|---|---|
| Lint & Format (read-only) | `pnpm exec biome check .` | **PASS** (0 errors; 153 warnings / 17 infos pre-existing trên 2.501 files) |
| Typecheck toàn monorepo | `pnpm check-types` | **PASS** (14/14 tasks) |
| Infra / CI workflow guards | `node --test scripts/topology-drift.test.mjs scripts/ci-workflow.test.mjs` | **PASS** (25/25) |
| `@teacher-os/infra` | `pnpm --filter @teacher-os/infra test` | **PASS** (4 files, 51/51) |
| `@teacher-os/auth` | `pnpm --filter @teacher-os/auth test` | **PASS** (10 files, 100%) |
| `apps/lms` | `pnpm --filter lms test` | **PASS** (6 files, 50/50) |
| `apps/server` (10 suites trọng tâm) | `vitest run` (`confirm-opening`, `scheduled`, `daily-deadline-reminder`, `templates`, `notifications`, `courses`, `public-library-images`, `admin-library`, `auth-role-roundtrip`, `listening-library-import`) | **PASS** (10 files, 133/133) |
| `@teacher-os/ui` (inline quiz) | `vitest run src/lib/inline-instruction.test.ts src/components/quiz/quiz-paper.test.tsx` | **PASS** (2 files, 36/36) |
| `@teacher-os/api` (contracts) | `vitest run src/class-opening-email.test.ts src/course-contracts.test.ts src/library-contracts.test.ts src/placement-errors.contracts.test.ts` | **PASS** (4 files, 89/89) |
| `apps/web` (4 suites trọng tâm) | `vitest run` (`placement-result-pdf`, `confirm-opening-modal`, `courses/index`, `_auth/route`) | **PASS** (4 files, 49/49) |
| `apps/admin` (2 suites trọng tâm) | `vitest run` (`_auth/route`, `library/tests/index`) | **PASS** (2 files, 19/19) |
| `apps/student` (3 suites trọng tâm) | `vitest run` (`student-nav`, `auth-route-guard`, `wrong-role-redirect`) | **PASS** (3 files, 26/26) |
| `@teacher-os/db` | `pnpm --filter @teacher-os/db test` | **PASS** (8 files, 62/62) |
| `apps/profile` | `pnpm --filter profile test` | **PASS** (67/67) |
| Kiểm chứng thực nghiệm `better-auth@1.7.16` | Script in-memory tái hiện `sign-up/email` + Google OAuth callback cho `ADMIN_EMAILS` | **Xác nhận H1** (OAuth trả `account_not_linked`; credential + verification email được tạo cho email allowlisted) |

---

## 7. Thứ tự hành động khuyến nghị

1. **Trước khi deploy prod (bắt buộc / ưu tiên cao):**
   - Xác nhận danh sách `ADMIN_EMAILS` / `TEACHER_EMAILS` trong GitHub Environment `production`; chốt phương án **claim ngay tài khoản bằng Google OAuth sau deploy** (hoặc vá chặn `sign-up/email` cho role `admin`/`teacher` trong `packages/auth/src/index.ts:409-423` trước khi ship — **H1**).
   - Thực hiện đủ bước 1–5 trong Checklist Rollout (backup D1, kiểm tra DNS `lms.msmy.io.vn`, chạy `dry_run=true` trước khi deploy thật — **H2**).
   - Xác nhận trạng thái/mức độ ảnh hưởng của `#892` (student home white screen trên staging) trước khi thông báo rộng rãi URL mới cho học viên.
2. **Nên vá sớm (trước ship nếu còn cửa sổ PR, hoặc hotfix ngay sau release):**
   - Thêm `sendIntervalMs` mặc định (550ms) vào `emitNotifications` (`apps/server/src/lib/notifications/emit.ts:76-82`) để bảo vệ `confirm-opening` khỏi 429 Resend (**I1**).
   - Thêm `"/api/student/practice/:testId/audio"` vào vòng lặp CORP `same-site` tại `apps/server/src/app.ts:339-356` (**I2**).
3. **Follow-up kỹ thuật:**
   - Gộp **M1** vào hướng xử lý `#890`; xử lý **M3** (`new_only` note persistence) và **M4** (unique index khóa học) ở đợt kế tiếp.

## 8. Câu hỏi còn mở cho Release Owner

1. `vars.ADMIN_EMAILS` trên GitHub Environment `production` đã được cấu hình sẵn chưa, và toàn bộ email trong danh sách đó đã có tài khoản `user` đã xác minh trong prod D1 chưa (quyết định mức độ khẩn của **H1**)?
2. `apps/profile/maintenance.json` (`"disabled": true`) có chủ đích giữ nguyên ở bản v0.0.26 hay cần mở lại?
3. Với `#892` (white screen trang chủ học viên trên staging), nguyên nhân có chỉ xảy ra với dữ liệu staging hay có nguy cơ tái hiện với tài khoản học viên thật trên prod sau cutover?
