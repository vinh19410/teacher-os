# Báo cáo nghiên cứu kỹ thuật (#647): E2E Upload/Học sinh, CSP Media trên Trình duyệt & Giới hạn 100 MB Cloudflare Edge

**Ngày thực hiện:** 2026-11-11  
**Issue:** [#647 — Tài liệu: bổ sung e2e upload/học sinh và kiểm tay media trên trình duyệt/edge](https://github.com/vinh19410/teacher-os/issues/647)  
**Nhánh / Worktree:** `test/647-materials-upload-student-e2e`

## Mục lục
1. [Tóm tắt kết luận](#1-tóm-tắt-kết-luận)
2. [CSP `sandbox` khi mở media trực tiếp trong tab mới (`Phát` / `Mở`)](#2-csp-sandbox-khi-mở-media-trực-tiếp-trong-tab-mới-phát--mở)
3. [Giới hạn request body 100 MB của Cloudflare Edge so với `MATERIAL_MEDIA_MAX_BYTES`](#3-giới-hạn-request-body-100-mb-của-cloudflare-edge-so-với-material_media_max_bytes)
4. [Chiến lược E2E Playwright cho Upload, CORS Preflight, `?org=` và Media](#4-chiến-lược-e2e-playwright-cho-upload-cors-preflight-org-và-media)
5. [Nguồn tham khảo chính thức](#5-nguồn-tham-khảo-chính-thức)

---

## 1. Tóm tắt kết luận

1. **Lỗi thật đã tái hiện ở nút «Phát» (giáo viên) và «Mở» (học viên) cho file audio/video:** `apps/server/src/lib/material-file-response.ts:16` hiện trả cứng `Content-Security-Policy: default-src 'none'; sandbox` cho cả phản hồi `Content-Disposition: inline` (`kind === "media"`). Khi mở trực tiếp trên tab mới (`<a target="_blank">`), trình duyệt tạo `MediaDocument` tổng hợp và áp CSP của chính response đó: `default-src 'none'` chặn `media-src`, còn `sandbox` trần biến origin tài liệu thành `"null"` (opaque origin) làm request media nội bộ trượt CORS + `Cross-Origin-Resource-Policy: same-site`. Hệ quả là **file MP3/MP4 không phát được ngay cả trên Chromium (`readyState: 0, networkState: 3`)**, ngoài các lỗi đã ghi nhận trên Firefox/Safari.
2. **Chính sách CSP an toàn cho `inline` media:** Tách CSP theo `disposition`:
   - `attachment` (`kind === "file"` hoặc `?download=1`): giữ nguyên `default-src 'none'; sandbox`.
   - `inline` (`kind === "media" && !request.download`, chỉ gồm `audio/mpeg`, `audio/mp4`, `video/mp4` kèm `X-Content-Type-Options: nosniff`): dùng `default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox allow-same-origin`. Chính sách này cho phép `MediaDocument` nạp stream cùng origin (kể cả `Range: bytes=` + cookie phiên + `CORP: same-site`) và hiển thị media controls mặc định trên Chromium/Firefox/Safari, trong khi vẫn khoá 100% script, form, popup, plugin (`allow-scripts` vắng mặt, `script-src`/`object-src` rơi về `'none'`).
3. **Trần 100 MB trên Cloudflare Edge:** Tài liệu chính thức Cloudflare quy định **Maximum request body size = 100 MB** cho gói Free và Pro (trả `413 Request Entity Too Large` ngay tại tầng proxy trước khi vào Worker, không kèm CORS header). Trong khi đó `MATERIAL_MEDIA_MAX_BYTES = 100 * 1024 * 1024` (`104,857,600` bytes = 100 MiB). Bất kỳ file nào từ `~100,000,000` đến `104,857,600` bytes trên gói Free/Pro có nguy cơ bị Cloudflare edge cắt bằng trang HTML 413 trước Worker. Ngoài ra `materialErrorMessage` (`apps/web/src/lib/repos/materials.ts:203-206`) hiện thiếu nhánh fallback `error.status === 413` khi body 413 không phải JSON có `code: "FILE_TOO_LARGE"`.
4. **Phạm vi E2E Playwright (`apps/e2e`):** Có thể kiểm chứng tự động toàn diện trên stack thật (web `:8101`, student `:8103`, API `:8100` khác port = cross-origin thật cho CORS preflight, nhưng cùng site `localhost` cho `SameSite` cookie + `CORP: same-site`): upload file thật qua `PUT` raw body + `OPTIONS` preflight + `X-File-Name` tiếng Việt (từ cả `/materials` lẫn modal buổi học), mở tab «Phát» xác minh `<video>`/`<audio>` nạp thành công không lỗi CSP, và học viên đa-org mở/phát/tải file qua `?org=<orgId>`.

---

## 2. CSP `sandbox` khi mở media trực tiếp trong tab mới (`Phát` / `Mở`)

### Cơ chế lỗi hiện tại
- Ở thẻ nhúng `<audio controls src={fileUrl}>` / `<video controls src={fileUrl}>` bên trong trang học viên (`apps/student/src/components/class/lesson-materials.tsx:127-143`), trình duyệt nạp media như subresource nên bỏ qua header `Content-Security-Policy` của response media.
- Ngược lại, khi giáo viên bấm nút **Phát** (`apps/web/src/components/materials/material-item.tsx:86-95`) hoặc học viên bấm nút **Mở** (`apps/student/src/components/class/lesson-materials.tsx:106-114`), trình duyệt điều hướng top-level tab mới tới `/api/materials/:id/file` hoặc `/api/student/.../file` (`Content-Disposition: inline`).
- Theo HTML Standard (*Navigate to a media resource*), trình duyệt sinh một `MediaDocument` HTML bọc `<video controls autoplay>` và áp dụng `Content-Security-Policy` của response lên tài liệu đó:
  1. `default-src 'none'` không có `media-src` khiến trình duyệt chặn chính thẻ `<video>` nạp URL của tài liệu (`violates Content Security Policy directive: "default-src 'none'"`).
  2. `sandbox` không kèm `allow-same-origin` gán opaque origin `"null"` cho `MediaDocument`. Khi `<video>` nạp lại stream/Range trên cùng URL với `Cross-Origin-Resource-Policy: same-site` (`apps/server/src/app.ts:337`) và cookie phiên, request xuất phát từ origin `"null"` bị chặn bởi CORS/CORP (`Access to video ... from origin 'null' has been blocked by CORS policy`).
  3. Trên WebKit/Safari (WebKit Bug 223422, Bug 225865) và Firefox (Mozilla Bug 1781063), UA media controls trong `MediaDocument` sử dụng inline style và icon `data:` trong shadow tree; thiếu `style-src 'unsafe-inline'` / `img-src data:` hoặc thiếu `allow-same-origin` đều từng gây liệt thanh điều khiển hoặc chặn phát.

### Kết quả thực nghiệm (Playwright Chromium + HTTP Server cục bộ)

| Chính sách `Content-Security-Policy` | `/audio.mp3` & `/video.mp4` (`inline`) | Giả lập `/xss.html` (`<script>window.__xss=1</script>`) |
|---|---|---|
| `default-src 'none'; sandbox` (hiện tại) | `readyState: 0, networkState: 3` — bị chặn bởi `default-src 'none'` | Script bị chặn (`sandbox` không có `allow-scripts`) |
| `default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; sandbox` | `readyState: 0, networkState: 3` — bị chặn bởi CORS từ `origin 'null'` | Script bị chặn |
| `default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox allow-same-origin` | `readyState: 4, networkState: 1, duration: 0.2`, 0 lỗi console | `window.__xss === null`, script vẫn bị chặn hoàn toàn bởi `sandbox` |

### Đánh giá bảo mật của `sandbox allow-same-origin` (không có `allow-scripts`)
- MDN cảnh báo sự kết hợp nguy hiểm là `allow-scripts` **cùng** `allow-same-origin` (vì script đang chạy có thể gỡ sandbox). Khi **không có `allow-scripts`** (và thêm `default-src 'none'` nên `script-src 'none'`, `object-src 'none'`), trình duyệt cấm tuyệt đối mọi JavaScript, inline event handler, `<object>`/`<embed>`, submit `<form>`, mở popup và điều hướng top-level.
- Kết hợp với `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (từ `secureHeaders` toàn cục) và allowlist MIME chỉ cho phép `audio/mpeg`, `audio/mp4`, `video/mp4` trên nhánh `inline`, việc tách CSP riêng cho `inline` media vừa sửa triệt để tính năng «Phát»/«Mở» vừa bảo toàn phòng vệ chiều sâu.

---

## 3. Giới hạn request body 100 MB của Cloudflare Edge so với `MATERIAL_MEDIA_MAX_BYTES`

### Quy định của Cloudflare
- Theo trang **Cloudflare Workers Platform Limits** và **Error 413 Troubleshooting** (cập nhật 10/2026):
  - Giới hạn kích thước body của HTTP request đi vào domain qua Cloudflare proxy phụ thuộc vào gói của zone (**Free: 100 MB**, **Pro: 100 MB**, **Business: 200 MB**, **Enterprise: tối đa 5 GB**).
  - Trên cùng trang tài liệu, Cloudflare phân biệt rõ đơn vị nhị phân `MiB` (`Worker size: 64 MiB`, `Static Asset: 25 MiB`, `Durable Object outbound: 100 MiB`) và đơn vị thập phân `MB` ở proxy zone (`100 MB` ≈ `100,000,000` bytes, cộng thêm overhead framing ở một số cấu hình proxy).
  - Khi request vượt ngưỡng tại Cloudflare edge proxy, edge trả thẳng trang HTML `413 Request Entity Too Large` **trước khi Worker chạy**, nên không đi qua `corsMiddleware` của Hono. Với request cross-origin (`app.<domain>` → `api.<domain>`), trình duyệt thấy response thiếu `Access-Control-Allow-Origin` và ném `TypeError: Failed to fetch` (lỗi mạng chung) thay vì đọc được status 413 JSON.
  - Ngoài ra trong Worker (`apps/server/src/lib/r2-media-store.ts`), body được stream thẳng qua `enforceDeclaredSize` vào `bucket.put(key, counted.stream, ...)` mà không buffer vào RAM 128 MB của isolate, nên các file dưới trần edge không gặp lỗi `exceededMemory`.

### Khoảng lệch hiện tại trong codebase
1. `packages/api/src/material-contracts.ts:20` đặt `MATERIAL_MEDIA_MAX_BYTES = 100 * 1024 * 1024` (`104,857,600` bytes). Một file MP4 `102,000,000` bytes (`~97.3 MiB`, hiển thị `97 MB` qua `formatBytes`) hoặc `104,000,000` bytes (`99 MB`) vượt trần `100,000,000` bytes của Cloudflare Free/Pro nhưng vẫn vượt qua `prepareMaterialUpload` ở client.
2. `apps/web/src/lib/repos/materials.ts:203-206` (`materialErrorMessage`) hiện chỉ kiểm `error.status === 403` và `error.status === 400`, chưa có `if (error.status === 413)` cho trường hợp nhận HTTP 413 không kèm JSON `FILE_TOO_LARGE`.

---

## 4. Chiến lược E2E Playwright cho Upload, CORS Preflight, `?org=` và Media

Trên hạ tầng `apps/e2e` (`WEB_ORIGIN = http://localhost:8101`, `STUDENT_ORIGIN = http://localhost:8103`, `API_ORIGIN = http://localhost:8100`):
1. **Cross-origin `PUT` + CORS Preflight + `X-File-Name`:** Khác port (`:8101` → `:8100`) buộc Chromium phát thật `OPTIONS /api/materials/files` (kiểm tra `Access-Control-Allow-Methods: PUT` và `Access-Control-Allow-Headers: X-File-Name, Content-Type`) trước `PUT` raw binary body. Dùng `input[type="file"].setInputFiles({ name: "Bài nghe mẫu.mp3", mimeType: "audio/mpeg", buffer })` với file MP3/PDF sinh động (không commit file nhị phân vào git).
2. **Kiểm chứng nút «Phát» trên giáo viên (và «Mở» trên học viên):** Bắt popup `const [popup] = await Promise.all([page.waitForEvent("popup"), playLink.click()])`, theo dõi `console` error và đánh giá `HTMLMediaElement` trên `popup` (`readyState >= 1`, `error === null`, `Content-Security-Policy` chứa `media-src 'self'` và `sandbox allow-same-origin`). Test này **sẽ đỏ ngay lập tức** nếu quay về CSP cũ `default-src 'none'; sandbox`.
3. **Học viên đa-org xem/phát/tải file qua `?org=`:** Seed học viên thuộc 2 org (hoặc org thứ hai kích hoạt qua `active_student_org_id` trong `localStorage` qua org switcher / thiết lập trạng thái đa-org), mở trang chi tiết lớp → bung nút «Tài liệu» (`LessonMaterialsDisclosure`) → xác minh URL của nút «Tải» và thẻ `<audio>` có gắn `?org=<orgId>`, bấm «Tải» với `page.waitForEvent("download")` kiểm tra nội dung byte tải về khớp đúng file gốc, đồng thời kiểm tra học viên không thuộc lớp nhận 404.

---

## 5. Nguồn tham khảo chính thức
- Cloudflare Workers Platform Limits (`Request and response limits`, `Memory`): https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Support — HTTP 413 Payload Too Large (`Maximum Upload Size` Free/Pro = 100 MB): https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/
- MDN Web Docs — `Content-Security-Policy: sandbox`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox
- MDN Web Docs — `Content-Security-Policy: media-src`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/media-src
- Mozilla Bugzilla #1781063 — *MP4 file served with Content-Security-Policy: sandbox doesn't play in Firefox when loaded as document*: https://bugzilla.mozilla.org/show_bug.cgi?id=1781063
- WebKit Bugzilla #225865 — *CSP sandbox policy header disables built-in media player*: https://bugs.webkit.org/show_bug.cgi?id=225865
- WebKit Bugzilla #223422 — *CSP headers can block default `<video>` controls*: https://bugs.webkit.org/show_bug.cgi?id=223422
- Playwright Docs — Downloads & Pages/Popups: https://playwright.dev/docs/downloads · https://playwright.dev/docs/pages
