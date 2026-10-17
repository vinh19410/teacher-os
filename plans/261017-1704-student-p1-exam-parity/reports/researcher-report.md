# Research — best practices cho timer thi, audio play-once, PWA, feedback endpoint

Ngày: 2026-10-17 · Agent: researcher · Cho plan P1 student exam parity

## 1. EXAM COUNTDOWN TIMER trong SPA

| Tiêu chí | Client-only `setInterval` | Server-authoritative deadline |
|---|---|---|
| Chống gian lận | Không — student sửa được deadline DevTools/localStorage | Có — server giữ mốc |
| Sống qua refresh | Mất nếu chỉ lưu client | Đúng — `started_at` nằm DB |
| Chi phí | 0 API call | 1 API call khi start attempt |

Kết luận verified:
- `setInterval` thuần sai bản chất: browser throttle timer tab background tối thiểu 1s/lần, Chrome 88+ "intensive throttling" 1 lần/phút khi tab ẩn >5 phút ([MDN setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout), [Chrome Developers](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)). Giải pháp: không đếm tick — mỗi tick tính lại `remaining = deadline - Date.now()` từ anchor timestamp.
- Deadline phải nằm server: hệ thống thi thương mại giữ đồng hồ chính thức ở server, chấm nộp theo giờ server ([form-timer.com](https://form-timer.com/features/anti-cheat), [TestInvite](https://www.testinvite.com/dy/en/pages/distinctive-features/anticheating-safeguards)); nguyên tắc "never trust the client".
- Refresh giữa lúc thi: server trả `started_at` + `duration_seconds`; client cache localStorage chỉ để render nhanh, load lại phải re-fetch lấy mốc chính thức.
- Clock drift máy student: server cấp `server_now` trong response để client bù offset `[server_now, client_now]`.
- Hiển thị cảnh báo <5 phút: UI thuần theo DESIGN.md (warn token).

**Khuyến nghị:** server-authoritative hybrid — server lưu `started_at + duration`, client render bằng `Date.now()` anchor + bù offset `server_now`; auto-submit client là tiện nghi; chốt cuối là server (nộp trễ vẫn ghi `submitted_at` thật — giáo viên thấy).

## 2. LISTENING AUDIO "phát 1 lần" ở chế độ thi

| Tiêu chí | Client enforcement (events) | Signed URL server-side |
|---|---|---|
| Chặn seek/replay | Đủ cho UI | Không chặn trực tiếp — chỉ cấp quyền |
| Chặn DevTools | Không | Không, nhưng server log phát hiện bất thường |
| iOS Safari | Tốt nếu giữ nút bấm thủ công | Không đổi |

Kết luận verified:
- Presigned R2 GET hỗ trợ Range header — seek/tải từng phần hoạt động tự nhiên, chữ ký không phủ hành vi người dùng ([Cloudflare R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [AWS range-get](https://docs.aws.amazon.com/AmazonS3/latest/userguide/range-get-olap.html)) → "phát 1 lần" vốn là **policy UI**, không phải policy transport.
- Presigned URL là bearer token; expiry hợp lệ 1s–7 ngày, khuyến nghị 5–15 phút cho một ca thi.
- Events cần bắt: `play` (đếm lượt, khóa khi đã phát), `seeking`/`seeked` (rollback `currentTime` về vị trí cao nhất đã đạt), `timeupdate` (ghi `maxReached`), `ended` (disable). Tự vẽ nút Play, không dùng `controls` mặc định.
- iOS Safari: `play()` có âm thanh phải gọi từ user gesture (click/touchend handler); gọi từ setTimeout/callback bị từ chối `NotAllowedError` ([WebKit](https://webkit.org/blog/6784/new-video-policies-for-ios/), [MDN Autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)). Pattern nút Play → play() ngay trong handler là an toàn.

**Khuyến nghị cho Teacher OS:** tái dùng media-store stream hiện có (raw PUT/GET qua worker, blob fetch với header org — pattern `quiz-media-player`) thay vì thêm presign mới; enforcement play-once + chặn seek bằng UI events ở chế độ thi; chấp nhận DevTools là giới hạn của mọi web app.

## 3. PWA installable cho SPA React/Vite đã auth

| Tiêu chí | Chỉ manifest + `apple-*` meta | + vite-plugin-pwa (Workbox) |
|---|---|---|
| Installable Android Chrome | Có — SW không còn bắt buộc | Có |
| iOS Add to Home Screen | Có (Share menu) | Có |
| Offline | Không | Có |
| Rủi ro bảo trì | Gần 0 | Cache stale là lỗi PWA kinh điển |

Kết luận verified:
- Service worker **không còn là điều kiện installable** trên Chrome/Edge ([MDN](https://developer.mozilla.org/en-US/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Web Almanac 2025](https://almanac.httparchive.org/en/2025/pwa), [web.dev](https://web.dev/articles/install-criteria)). Tiêu chí: HTTPS + manifest hợp lệ (name/short_name, icons **192 và 512**, `start_url`, `display: standalone`) + heuristic tương tác.
- iOS: cài qua Add to Home Screen (Share menu), iOS 16.4+ từ mọi browser; iOS đọc **`apple-touch-icon`** thay vì manifest icons ([Lighthouse](https://developer.chrome.com/docs/lighthouse/pwa/apple-touch-icons)). Meta cần: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` ([Apple](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)). Cảnh báo: `apple-mobile-web-app-capable` mở full-screen không URL bar — chấp nhận có chủ đích.
- Icon maskable: 192 + 512 `purpose: "maskable"` với safe-zone padding.

**Khuyến nghị cho Teacher OS:** chỉ manifest + 2 icon maskable + apple meta, **KHÔNG service worker** — khớp quyết định issue #125 (SW đã tháo vì vỡ SPA boot) và spec e2e `no-service-worker`.

## 4. FEEDBACK widget endpoint

| Phương án | Đặc điểm |
|---|---|
| Tự viết fixed-window trên D1/SQLite | ~20 dòng SQL, không dependency |
| `hono-rate-limiter` + store | Thêm dependency; thừa cho 1 endpoint |

Kết luận verified:
- Fixed window per-key là pattern chuẩn ([Fiberplane](https://blog.fiberplane.com/blog/rate-limiting-intro)); Hono chưa có rate limiter core ([issue #5018](https://github.com/honojs/hono/issues/5018)).
- IP client trên Workers: `getConnInfo(c).remote.address` đọc `CF-Connecting-IP` ([Hono conninfo](https://hono.dev/docs/helpers/conninfo)) — không tin `X-Forwarded-For` tự khai.
- Honeypot: input ẩn CSS, bot điền → drop im lặng 200 OK. Cap độ dài server-side bắt buộc.
- Auth: anonymous-friendly + gắn `user_id` khi có session là quyước tốt nhất cho widget public.

**Khuyến nghị cho Teacher OS:** student app auth-gated toàn bộ (route `_auth`) → endpoint auth student, rate limit = COUNT feedback của student trong 1 giờ (≤5) — không cần bảng rate-limit riêng, không cần per-IP; honeypot + cap 2000 ký tự + category enum. Triệt để KISS.

## Bảng tổng hợp — khuyến nghị

| Chủ đề | Approach tối thiểu | Lý do |
|---|---|---|
| Exam countdown | Server trả `started_at + duration`; client render anchor `Date.now()` + bù `server_now`; auto-submit client; `submitted_at` thật ghi nhận mọi lúc | Client chỉ là hiển thị; server-check tốn 1 API call. |
| Audio play-once | Stream qua media-store hiện có + UI tự vẽ chặn seek/đếm play; `play()` trong user gesture cho iOS | "Phát 1 lần" là policy UI; không thêm presign surface mới. |
| PWA | Manifest + icons 192/512 maskable + apple meta, KHÔNG SW | Chrome không còn yêu cầu SW; app thi cử cần online; issue #125 + spec e2e cấm SW. |
| Feedback | POST auth student + fixed-window COUNT 5/giờ + honeypot + cap | Đủ chống spam, không dependency, không bảng rate-limit riêng. |

## Hạn chế

- Chưa thực nghiệm iOS Low Power Mode (nút Play thủ công vẫn là thiết kế an toàn duy nhất).
- Không benchmark proxy-stream vs presigned URL cho MP3 của repo (suy luận kiến trúc).
- Anti-cheat sâu (fullscreen lock, log tab-switch) ngoài scope P1.
