---
title: Ship Official Release v0.0.26
date: 2026-11-24
summary: "Promote develop lên main v0.0.26: hợp nhất LMS lms.msmy.io.vn, 4 D1 migration, vá I1/I2 in-branch, giữ merge chờ cửa sổ cutover H2"
---

# Ship Official Release v0.0.26 (develop → main)

**Date**: 2026-11-24 10:15 Europe/London
**Severity**: High
**Component**: Release `v0.0.26` (`vinh19410/Ship-Official`, `develop` → `main`)
**Status**: Đã qua local gate và vá I1/I2 in-branch; mở PR + review nhưng **chủ động giữ merge** chờ cửa sổ cutover prod

## Chuyện gì đã xảy ra

Đợt promote `v0.0.25` → `v0.0.26` trên nhánh `vinh19410/Ship-Official` gom **46 commits** (969 files thay đổi, gồm bộ dataset `docs/listening_ielts/` và ảnh báo cáo) từ `origin/develop` (`3a1212ff`) kèm merge `origin/main` (`1ae8b600`) tại `0840654d`, đi cùng **4 D1 migrations chỉ cộng thêm (`0083`–`0086`)**: `0083_light_midnight.sql`, `0084_fine_moira_mactaggert.sql`, `0085_assignment_prompt_groups.sql`, `0086_class_opening_email.sql`.

Phạm vi chính của `v0.0.26`:
- **Hợp nhất Unified LMS một domain `lms.msmy.io.vn` (#867–#869):** gộp 3 Worker (`web`, `student`, `admin`) về Worker `lms` (`assets.runWorkerFirst: true`) + redirect 301 các alias cũ (`app.`/`student.`/`admin.msmy.io.vn`, bảo toàn `/sw.js`, `/registerSW.js`) và script `packages/infra/scripts/detach-legacy-worker-domains.ts`.
- **Email nhắc bài tự động 06:00 VN hằng ngày (#901, #907):** cron `0 23 * * *`, sự kiện `daily_deadline_reminder` (email-only, giãn nhịp 550ms/email cho Resend).
- **Chốt khai giảng lớp + email HTML (#874, #900):** modal xác nhận có xem trước trong `<iframe sandbox="">`, chế độ `all`/`new_only`.
- **QuizPaper inline answer inputs (#873, #903):** render ô điền từ và select chọn từ ngân hàng đáp án trực tiếp bằng React JSX qua làm sạch hai lớp (DOMPurify + AST allowlist).
- **Luyện nghe IELTS & import staging (#872):** dataset `docs/listening_ielts/`, nhóm câu hỏi (`0085`), `/public/library-images/:filename` và workflow `import-listening-staging.yml`.
- **Bài kiểm tra đầu vào & danh mục khóa học:** đồng bộ danh mục lỗi IELTS/slider/nhận xét (#863, #865), xuất PDF client-side bằng `pdfmake` + font tự host (#853, #862), master data khóa học 2 cấp `0083`–`0084` (#851, #858).
- **Quản trị, vận hành & guard:** phân trang server-side `/admin/library/tests` (#850), ẩn menu Luyện tập/Lịch sử fail-closed trên prod và bật sẵn staging (`VITE_STUDENT_PRACTICE_ENABLED`, #852, #870), gỡ nhãn độ khó band (#849), CLI + workflow promote từ vựng staging → prod (#855, #856, #859, #860).

## Sự thật phũ phàng (The Brutal Truth)

Đây không phải kiểu release "bấm merge rồi đi pha cà phê". Đợt này vừa đổi kiến trúc phân phối toàn bộ 3 cổng web/student/admin sang một Worker `lms` duy nhất, vừa ép **3–10 phút downtime cứng** trên production vì phải gỡ 3 custom domain cũ trước khi `alchemy deploy` gắn lại. Cảm giác ngồi trước nút merge lúc này khá căng: chỉ cần một lỗi Vite build hay timeout của Cloudflare API rơi đúng giữa lúc `detach-legacy-worker-domains.ts` vừa chạy xong, cả ba domain `app`/`student`/`admin.msmy.io.vn` lập tức thành mồ côi.

Điều làm người làm release giật mình nhất là kết quả pre-landing review (`plans/reports/code-reviewer-261124-0940-release-v0.0.26.md`): hai lỗi **I1** và **I2** hoàn toàn là sơ suất kỹ thuật lọt qua suốt chu kỳ phát triển trên `develop` — một bên quên gắn rate-limit cho Resend ngay trong tuần vừa viết cron 550ms, bên kia thêm endpoint audio mới nhưng quên đăng ký vào danh sách `CORP: same-site` có sẵn 16 route ngay trong `apps/server/src/app.ts`. May mắn là pre-landing review tóm được cả hai trước khi lên `main`, nhưng nó phơi bày một lỗ hổng quy trình rõ rệt.

## Chi tiết kỹ thuật & Kiểm chứng

- **Xung đột khi merge `origin/main` (`1ae8b600`) tại `0840654d`:** 4 conflict cơ học từ các backport `#852`/`#856`/`#857`/`#859` trên `AGENTS.md`, `apps/e2e/playwright.config.ts`, `apps/student/src/components/layout/student-nav.test.ts`, và `scripts/ci-workflow.test.mjs`. Đã giải quyết sạch, giữ đầy đủ guard và test của cả hai nhánh.
- **Kết quả pre-landing review:** `GO WITH CONDITIONS` — **0 Critical**, **2 High (`H1`, `H2`)**, **2 Important (`I1`, `I2`)**.
  - `H1`: Trên unified origin (`packages/auth/src/index.ts:408-423`, `better-auth@1.7.16`), `POST /api/auth/sign-up/email` cho phép tạo credential chưa xác minh mang role `admin`/`teacher` cho email mới khai báo trong `ADMIN_EMAILS`/`TEACHER_EMAILS` chưa có tài khoản trong DB; Google OAuth chặn auto-link bằng `302 /api/auth/error?error=account_not_linked` (gây account squatting) và `sendOnSignUp: true` mở nguy cơ verification-link pre-hijacking nếu chủ email bấm nhầm link xác thực.
  - `H2`: `.github/workflows/deploy.yml` chạy `detach-legacy-worker-domains.ts --stage prod` trước `alchemy deploy`, tạo cửa sổ downtime cứng 3–10 phút và rủi ro orphan 3 domain nếu deploy gãy giữa chừng.
  - `I1`: `emitNotifications` (`apps/server/src/lib/notifications/emit.ts`) gọi `deliverNotifications` với `sendIntervalMs = 0`, khiến `POST /api/classes/:id/confirm-opening` bắn dồn email vượt trần 2 req/s của Resend (HTTP 429).
  - `I2`: `GET /api/student/practice/:testId/audio` thiếu trong mảng override `CORP: same-site` + `Referrer-Policy: no-referrer` tại `apps/server/src/app.ts:339-362`, kế thừa `CORP: cross-origin` dù dùng cookie phiên `SameSite=None; Secure`.
- **Local gates (Node `v24.22.1`, sau khi vá I1/I2):**
  - `pnpm exec biome check .`: PASS (0 errors).
  - `pnpm check-types`: PASS (14/14 tasks).
  - `pnpm build`: PASS (7/7).
  - `pnpm test`: PASS (13/13 workspace packages + 5 root script suites).
  - `pnpm test:ledger`: PASS.
  - `apps/profile/maintenance.json`: giữ nguyên `{"disabled": true}` theo chủ đích.
  - **Full E2E:** không chạy local theo quy định `AGENTS.md`, chuyển sang 6 shard GitHub Actions (`e2e.yml`) trên PR vào `main`.

## Quyết định kỹ thuật & Nguyên nhân gốc rễ

1. **Vá ngay I1 và I2 ngay trong nhánh release (không đẩy sang follow-up):**
   - **I1:** Thêm `DEFAULT_EMIT_SEND_INTERVAL_MS = 550` vào `apps/server/src/lib/notifications/emit.ts`; tự áp `550ms` khi `deps.runInBackground` được truyền (giữ `0ms` cho đường đồng bộ/test), đồng thời cập nhật `notifications.test.ts`. **Phương án bác bỏ:** gộp vào issue `#906` sau release — bác bỏ vì bản vá chỉ ~20 dòng mà tránh được lỗi 429 ngay ngày đầu giáo viên bấm chốt khai giảng lớp đông.
   - **I2:** Bổ sung `"/api/student/practice/:testId/audio"` vào danh sách route trong `apps/server/src/app.ts` kèm test `media-response.test.ts`. **Phương án bác bỏ:** bỏ qua vì UI tự luyện đang tắt trên prod — bác bỏ vì API vẫn mở theo trust boundary, vá một dòng đóng luôn lỗ hổng phòng thủ chiều sâu.
   - **Root cause:** Chúng ta dựa vào trí nhớ thủ công thay vì mặc định an toàn — `deliverNotifications` để mặc định `sendIntervalMs = 0`, còn danh sách `CORP: same-site` phải liệt kê tay từng route audio mới.
2. **Giữ nguyên hành vi auth H1 theo contract unified-origin hiện tại, track vá triệt để ở `#908`:**
   - **Quyết định:** Không sửa đột ngột nhánh `user.create.before` ngay sát giờ mở PR để tránh làm vỡ giả định của bộ E2E/auth unified-origin vừa ổn định; mở GitHub issue `#908` track fix vĩnh viễn cho `H1` cùng các mục non-blocking `M1`–`M4`.
   - **Giảm thiểu bắt buộc:** Ngay sau khi deploy prod hoàn tất, chủ tài khoản của mọi email mới trong `ADMIN_EMAILS`/`TEACHER_EMAILS` chưa có bản ghi `user` trong prod D1 phải đăng nhập Google OAuth ngay lập tức để khóa tài khoản.
3. **Mở PR và chạy review (`--fix --reply`), nhưng GIỮ CHƯA MERGE vì H2:**
   - **Quyết định (theo xác nhận của người dùng):** Không auto-merge vào `main` ngay khi CI xanh. Dừng ở trạng thái PR sẵn sàng để người vận hành tự chọn khung giờ thấp tải, sao lưu prod D1 cho 4 migrations `0083`–`0086`, và chạy `Deploy Production` với `dry_run=true` trước khi cutover thật.
   - **Phương án bác bỏ:** Merge ngay vào `main` để `deploy.yml` tự kích hoạt cutover — bác bỏ vì rủi ro downtime 3–10 phút giữa giờ học và chưa có bước kiểm duyệt plan Alchemy `dry_run=true`.

## Bài học rút ra

1. **Mặc định an toàn phải nằm ở thư viện lõi, không ở callsite:** Đừng bao giờ để `sendIntervalMs = 0` làm mặc định cho gửi email hàng loạt trên Resend, và cần chuyển danh sách route media `CORP: same-site` từ mảng hard-code sang quy ước prefix/helper chung (`mediaObjectResponse` tự gắn header) để người thêm endpoint sau không thể quên.
2. **Mỗi lần backport thẳng lên `main` là một món nợ conflict:** 4 file conflict ở `0840654d` đến trực tiếp từ chuỗi backport `#852`/`#856`/`#857`/`#859`. Dù giải quyết cơ học nhanh, vẫn phải đối chiếu từng dòng test và cờ feature sau merge thay vì tin vào auto-merge của git.
3. **Cutover hạ tầng có bước phá hủy (`detach`) bắt buộc tách pha review khỏi pha bấm nút deploy:** Không gộp "duyệt code PR" với "chấp nhận downtime production" vào cùng một cú click merge.

## Bước tiếp theo (Actionable)

1. **Agent / Release pipeline (ngay bây giờ):** Commit bump `0.0.26`, `CHANGELOG.md`, bản vá I1/I2 và journal này; đẩy nhánh `vinh19410/Ship-Official`, mở PR vào `main`, chạy vòng review PR (`--fix --reply`) và đợi `quality.yml` + 6-shard `e2e.yml` xanh — **dừng trước bước merge**.
2. **Release Operator (trước khi bấm merge vào `main`):**
   - Backup prod D1 (`0083`–`0086`) và kiểm tra DNS zone `msmy.io.vn` không có bản ghi thủ công xung đột tại `lms.msmy.io.vn`.
   - Đối soát GitHub Environment `production` (`ADMIN_EMAILS`, `TEACHER_EMAILS`, `MAILER_IMPL=resend`, `RESEND_API_KEY`, đảm bảo không đặt `STUDENT_PRACTICE_ENABLED`).
   - Chạy `Deploy Production` với `dry_run=true` để xác nhận 0 thao tác delete/replace lên D1/R2 và tên Worker legacy khớp `detach-legacy-worker-domains.ts`.
   - Chọn khung giờ thấp tải (tránh giờ học tối và sát 06:00 VN), merge PR để thực hiện cutover.
3. **Release Operator (ngay sau deploy prod xanh):**
   - Claim ngay bằng Google OAuth mọi email mới trong `ADMIN_EMAILS`/`TEACHER_EMAILS` chưa có `user` trong prod D1 (đóng cửa sổ `H1`).
   - Smoke trên Chrome + Safari tại `https://lms.msmy.io.vn/login`, kiểm tra `301` từ `app.`/`student.`/`admin.msmy.io.vn`, xác nhận 2 cron `*/10 * * * *` và `0 23 * * *` trên Worker `server`, và theo dõi lượt gửi 06:00 VN đầu tiên.
   - Không chạy import dataset IELTS Listening lên prod cho tới khi chốt root cause `#878`.
4. **Engineering (đợt sau release):** Xử lý triệt để `H1` + `M1`–`M4` theo GitHub issue `#908`.

**Status**: DONE
**Summary**: Đã ghi nhận đầy đủ release v0.0.26 (`develop` → `main`) với cutover Unified LMS, 4 D1 migrations, bản vá I1/I2 in-branch, issue `#908` cho H1/M1–M4 và quyết định giữ merge chờ cửa sổ cutover prod an toàn cho H2.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
