---
title: "Fix #939: Design-compare unified LMS"
date: 2026-11-26
summary: "Di chuyển harness design:compare sang kiến trúc 2 port hợp nhất (API_PORT + LMS_PORT) với bundle LMS cô lập, xử lý 4 lỗi runtime/review và xác minh xanh 216/216 + 54/54 ảnh (#939)"
---

# Fix #939: Design-compare unified LMS

## What Happened & Root Cause

Tiêu đề issue #939 (`fix(design-compare): cập nhật URL chờ apps/student sang base /student/ trong capture.mjs`) thoạt nhìn như lỗi sửa 1 dòng đường dẫn. Nguyên nhân gốc thực sự sâu hơn nhiều: sau loạt commit hợp nhất portal (`e933d3c2`, `889fe997`, `ce74fc46`), `apps/web` mount tại `/teacher/`, `apps/student` mount tại `/student/`, `apps/lms` giữ vai trò gateway root (`/login`, `/forgot-password`, `/verify-email`, `/pay/$token`), còn `apps/e2e/src/boot.ts` chỉ tin duy nhất `LMS_ORIGIN`. Toàn bộ harness cũ (2 Vite dev server tách biệt cho `WEB_PORT` + `STUDENT_PORT`) đã vỡ kiến trúc từ CORS/origin trust, teacher bootstrap, selector đăng nhập đến route 36 màn — vá riêng URL của `student` không giải quyết được gốc rễ.

## The Brutal Truth

Cú đánh mệt mỏi nhất không nằm ở lúc chuyển sang kiến trúc hợp nhất, mà ở loạt bẫy ngầm của Node và Playwright chỉ lộ ra khi chạy live và review: truyền path qua `node -e` vô tình kích hoạt chính guard CLI của `serve-lms.mjs`, double-redirect trên `/login` khiến `page.waitForURL` nổ `net::ERR_ABORTED`, còn nhánh kiểm tra tiến trình con chết trong `waitUrl` lại nằm gọn trong `try/catch` nên âm thầm nuốt lỗi của chính mình. Nếu bỏ qua dù chỉ một trong bốn lỗi này, người bảo trì sau ở 2 giờ sáng sẽ lại gặp những ca treo hoặc fail mơ hồ cực kỳ tốn thời gian gỡ.

## Decision

Chọn **Phương án A** — kiến trúc 2 port hợp nhất (`API_PORT` + `LMS_PORT`):

- Giữ chỗ `API_PORT` qua `reserveFreePort()` xuyên suốt pha build để đóng cửa sổ TOCTOU; build tuần tự `lms` (với `LMS_SKIP_PORTAL_ASSEMBLE=1`), `web` (`/teacher`), `student` (`/student`) vào `.state/lms-dist` cô lập — không đụng `apps/*/dist` dùng chung — và tự dọn `.state/lms-dist` khi thoát.
- Khởi chạy gateway bằng `startLmsServer` của `apps/lms/scripts/serve-lms.mjs` trên `127.0.0.1` với `LMS_PORT` cấp sát lúc boot.
- **Phương án bị loại:** sửa riêng URL `student` (vẫn gãy `LMS_ORIGIN` và `/teacher/`), hoặc build đè trực tiếp vào `apps/*/dist` (làm nhiễm `API_PORT` tạm và cờ debug vào artifact dùng chung).

## Technical Failures Caught & Fixed

1. **Guard `isDirectRun` kích hoạt nhầm (`apps/lms/scripts/serve-lms.mjs:217-224`):** Truyền path `serve-lms.mjs` ở `process.argv[1]` của `node -e` làm điều kiện `path.resolve(process.argv[1]) === ...` đúng và gọi `startLmsServer()` lần 2. Đã sửa bằng `buildServeLmsBootArgs` đặt sentinel `"design-compare-lms"` tại `argv[1]` (đẩy `modulePath` sang `argv[2]`) kèm subprocess test thật.
2. **Double-redirect văng `net::ERR_ABORTED`:** Trên `/login`, `SignInForm` (`location.assign`) và `LoginRoute` (`location.replace`) đua redirect làm `page.waitForURL` fail với `net::ERR_ABORTED`. Đã thay bằng polling `waitForUrlMatch` + `waitForLoadState("load")` + re-check URL đích sau load + kiểm tra cookie qua `hasSessionTokenCookie`.
3. **Nguy cơ deadlock trong `reserveFreePort().release()`:** `net.Server` không có `closeAllConnections`, nên TCP client giữ kết nối vào cổng đang giữ chỗ sẽ treo `srv.close()`. Đã thay bằng `createHoldServer()` theo dõi `sockets` và gọi `socket.destroy()` ngay khi nhận kết nối, khóa lại bằng test hồi quy mở TCP client thật.
4. **`waitUrl` nuốt lỗi tiến trình con chết (`scripts/design-compare/capture.mjs`):** Nhánh `if (child && !childAlive(child))` đặt bên trong `try/catch` khiến exception bị nuốt tới khi hết timeout. Đã đưa ra ngoài `try/catch` (kiểm tra cả trước và sau `fetch`).

## Verification

- `pnpm test:design-compare`: **31/31 pass** (gồm drift test 36 màn `scripts/design-compare/screens.json` ↔ `apps/lms/src/routes-matcher.ts` + `apps/student/src/routeTree.gen.ts`, subprocess test `buildServeLmsBootArgs`, và test TCP client cho `reserveFreePort`).
- `pnpm --filter e2e test`: **9/9 pass**.
- Live capture `pnpm design:compare --side app --force`: **216/216 ảnh** (0 lỗi); smoke mặc định `--side both`: **54/54 ảnh** (0 lỗi).

## Lessons Learned

- Không bao giờ mặc định 404/timeout một URL là lỗi 1 dòng khi hệ thống vừa đổi topology auth/origin (`LMS_ORIGIN`).
- Không truyền đường dẫn module vào `argv[1]` của `node -e` nếu module có CLI guard đọc `process.argv[1]`.
- Mọi nhánh fail-fast trong vòng polling (như kiểm tra `childAlive`) phải nằm ngoài `try/catch` bắt lỗi mạng tạm thời; mọi `net.Server` giữ chỗ cổng phải tự `destroy()` socket để tránh treo `close()`.

## Next Steps

- Chủ nhánh commit và mở PR beta vào `develop` cho issue #939, chờ CI `develop` xanh và đăng POT lên #939 (bỏ qua AgentWiki publish theo quy ước local journal).
- Duy trì drift test 36 màn (`pnpm test:design-compare`) làm cổng bắt buộc mỗi khi thêm hoặc đổi route trên các portal.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
