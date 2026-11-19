# Code review: Zoom Pro integration (#831)

- Worktree: `/root/orca/workspaces/teacher-os/zoom-pro-integration` (branch `vinh19410/feat/zoom-pro-integration`, chưa commit)
- Spec: `plans/261119-0617-zoom-pro-integration/plan.md` + 5 phase
- Phạm vi: 50 file, +1931/−3248 (server service/route/client, migrations 0080/0081, contracts, auth, infra, web/student UI, e2e boot, docs)

## Gate đã chạy (local, Node v24.22.1)

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter server exec vitest run src/routes/zoom-meeting.test.ts src/lib/zoom/zoom-client.test.ts` | 23/23 pass |
| `pnpm --filter server exec vitest run src/auth-role-roundtrip.test.ts` | 10/10 pass |
| `pnpm --filter @teacher-os/auth test` | 102/102 pass |
| `pnpm --filter web exec vitest run session-zoom-panel.test.tsx profile.test.tsx` | 19/19 pass |
| `pnpm --filter student exec vitest run src/components` | 111/111 pass |
| `pnpm check-types` | exit 0 (turbo cache hit 12/12) |
| `pnpm exec biome check .` | exit 0 (153 warning / 17 info, không có error) |
| `drizzle-kit check` (packages/db) | "Everything's fine" — snapshot 0080/0081 khớp |
| Grep tàn dư `google-meet|googleMeet|GoogleWorkspace|meetUrl|meet.google|googleapis.com/auth|syncCalendar|GOOGLE_MEET` trong apps/packages/docs (trừ `lead-contracts` và migrations) | 0 kết quả |
| `git merge-base --is-ancestor` commit thêm 0078 với `origin/main` | chưa lên main → prod tạo bảng 0078 rồi rebuild 0080 trên bảng rỗng, an toàn |

## Critical

Không có.

## Important

### I1. Sửa link tay ghi đè `joinUrl` nhưng giữ `zoomMeetingId` → Zoom meeting mồ côi, cron theo dõi nhầm meeting
- `apps/server/src/lib/zoom/session-zoom-service.ts:668-673`: khi `input.zoom` khác `meeting.joinUrl` thì chỉ đổi `joinUrl`, không xoá meeting trên Zoom, không xoá `zoomMeetingId`. Kernel truyền `zoom` ở `kernel.ts:2804` và `kernel.ts:3170`.
- Hai hậu quả:
  1. Giáo viên xoá trống link (`zoom: ""`): dòng meeting còn `joinUrl=""` cùng `zoomMeetingId` cũ. Lần sau `ensureSessionMeeting` (nút "Tạo link Zoom", hoặc `kernel.ts:3438`) không dừng ở `:287` mà tạo meeting mới, và `saveClaimedMeeting` (`:333-350`) ghi đè `zoomMeetingId`. Meeting cũ vẫn sống trên Zoom (`auto_recording: cloud`, `join_before_host`), không còn đường nào xoá nó. Ai còn link cũ (email nhắc lịch đã gửi `{{zoom_link}}`) vẫn vào được và ghi vào cloud của tài khoản Pro.
  2. Giáo viên dán link khác (Zoom cá nhân, Meet): server vẫn gọi `updateMeeting` cho meeting hệ thống (`:681-707`, tốn quota 100/ngày), và cron vẫn lấy recording của meeting hệ thống mà không ai dùng → sau 72 giờ thành `failed` kèm lỗi "Không tìm thấy cloud recording", gây hiểu nhầm.
- Cách sửa: khi `input.zoom !== undefined && input.zoom !== meeting.joinUrl && meeting.zoomMeetingId`, gọi `client.deleteMeeting` (best-effort) và đặt `zoomMeetingId: null`, `recordingStatus` = `ready` nếu đã có `recordingUrl`, ngược lại `none`. Cách này cùng nhánh với `syncZoomOnSessionCancelOrDelete`. Sau đó `return` trước khi tới `updateMeeting`. Thêm test: sửa link tay → `fake.calls` có `delete`, và `zoomMeetingId` thành null.

### I2. Dời buổi sang ngày đã có meeting thì xoá dòng đích mà không xoá meeting trên Zoom
- `session-zoom-service.ts:656-666`: lệnh `delete(classSessionMeeting)` ở `newDateISO` bỏ luôn `zoomMeetingId` và `recordingUrl`/`recordingPassword` của buổi đích, nhưng meeting đó vẫn còn trên Zoom.
- Logic này có từ bản Google, nhưng với Zoom thì meeting mồ côi vẫn dùng được (vào trước host, tự ghi cloud). Recording đã đồng bộ của buổi đích cũng mất mà không báo.
- Sửa: trước khi xoá, đọc dòng đích; nếu có `zoomMeetingId` thì `deleteMeeting` best-effort; nếu dòng đích có `recordingUrl` thì giữ lại hoặc ít nhất `console.warn`.

### I3. Staging và production dùng chung license, host và quota Zoom; staging có thể mở cho người lạ
- `.github/workflows/deploy-staging.yml:90-93` và `deploy.yml:72-75` đọc cùng tên secret. README cùng runbook (`docs/production-release-runbook.md:88`) hướng dẫn đặt "Repository hoặc environment secret". Nếu đặt ở mức Repository, staging tạo meeting dưới đúng host của prod.
- Hệ quả: (a) test và e2e thủ công trên staging ăn vào quota 100 lệnh tạo/sửa mỗi ngày của host thật; (b) gói Pro một license chỉ chạy được một meeting mỗi lúc, nên meeting staging có thể chặn lớp thật; (c) recording staging chiếm dung lượng cloud.
- Ranh giới tin cậy cũng đổi. Trước đây mỗi giáo viên dùng Google Workspace của chính mình. Giờ mọi org cùng gọi một license dùng chung. `resolveTeacherEmails` (`packages/infra/src/topology.ts:171-186`) chỉ bắt buộc `TEACHER_EMAILS` trên prod. Trên staging, nếu biến này rỗng, ai đăng ký cũng tự bootstrap được org (`app.ts` `bootstrapMiddleware`). Người đó gọi được `POST /api/classes/:id/zoom/bulk` (12 meeting mỗi lần gọi) và tạo lớp Online (tự cấp 5 meeting) dưới host của prod.
- Sửa (cần người dùng chọn): bắt buộc dùng secret per-environment và ghi rõ trong README/runbook "không đặt ở mức Repository"; hoặc staging để trống secret Zoom (tắt êm sẵn có), hoặc dùng `ZOOM_HOST_USER` riêng cho staging.

### I4. Bulk và auto-provision không dừng khi Zoom báo hết quota ngày
- `session-zoom-service.ts:600-622` (bulk) và `:476-497` (auto-provision): chỉ `NOT_CONFIGURED` mới dừng vòng lặp. Khi gặp `ZOOM_RATE_LIMITED` (429 daily), vòng lặp vẫn gọi tiếp tới 12 lần, lần nào cũng 429, và trả về 12 lỗi giống nhau.
- Mỗi lần gọi còn tốn một request token nếu token chưa cache. Không hỏng dữ liệu, nhưng làm nhiễu lỗi và có thể kéo dài thời gian bị giới hạn theo giây.
- Sửa: gặp `err.code === RATE_LIMITED` thì `break`; các ngày còn lại tính vào `skipped` và trả về một message chung.

### I5. Refresh token Google với scope Drive/Calendar còn nằm trong DB staging
- Bản #816 lưu `account.refresh_token` cùng scope `.../auth/drive` (toàn quyền Drive) cho giáo viên đã liên kết trên staging (develop). Thay đổi này bỏ hẳn tính năng nhưng không dọn credential cũ: không có migration nào xoá và docs không có bước thu hồi.
- Theo nguyên tắc tối thiểu dữ liệu, credential không còn dùng thì không nên giữ, nhất là token Drive toàn quyền.
- Sửa (cần người dùng chọn): thêm migration `UPDATE account SET refresh_token = NULL, access_token = NULL, scope = 'openid email profile' WHERE provider_id = 'google'`; hoặc thêm vào runbook bước thu hồi grant trên myaccount.google.com. Prod không bị ảnh hưởng vì #816 chưa lên `main`.

## Minor

- **M1. Cron có thể bị kẹt bởi dòng `failed` đã hết hạn.** `session-zoom-service.ts:866-884, 975-977`: scan sắp theo `recordingSyncedAt ASC` với `LIMIT 30`. Dòng đã `failed` vì quá 72 giờ không bao giờ được cập nhật lại (chỉ dòng `pending` mới vào `expiredIds`), nên `recordingSyncedAt` của chúng cũ dần và nằm đầu danh sách scan cho tới khi ra khỏi cửa sổ 4 ngày. Nếu có trên 30 dòng như vậy thì dòng `pending` mới không được xét. Có thể loại các dòng này ngay trong SQL, ví dụ `status = 'pending' OR (status = 'failed' AND synced_at < now - 1h AND date >= today-3)`. Hoặc tách hai query.
- **M2. Gọi Zoom không có timeout.** `zoom-client.ts:131-140` và token fetch `:91-97` không có `AbortSignal.timeout`. Cron chạy tuần tự 10 lượt, và route tạo/bulk chạy đồng bộ trong request: nếu Zoom treo thì Worker request treo theo. Nên thêm `signal: AbortSignal.timeout(15_000)`.
- **M3. Thiếu test chặn IDOR giữa các org cho route Zoom.** `zoom-meeting.test.ts` chỉ có `org-1` và một giáo viên. Route có check `classTable.orgId` (`zoom-meeting.ts:87-94, 136-143, 190-197, 246-253`), đọc code thấy đúng, nhưng không có test teacher org B gọi `POST …/zoom` hay `…/recording/sync` lên `classId` của org A và nhận 404. Cũng không có test route trả 429 `ZOOM_RATE_LIMITED`, và không có test nhánh `failed` được thử lại sau 1 giờ.
- **M4. Race giữa tạo và huỷ chạy nền.** Thêm buổi Online (ensure chạy nền ở `kernel.ts:3438`) rồi huỷ ngay: nếu cancel (`syncZoomOnSessionCancelOrDelete`) chạy trước khi ensure insert xong, cancel thấy `!meeting` và return, sau đó ensure tạo meeting và mirror link vào buổi đã huỷ. Kết quả là meeting sống trên Zoom và lệch dữ liệu. Học viên không thấy link vì UI ẩn buổi inactive. Hiếm xảy ra, nhưng nên kiểm tra lại `isCancelledOrHoliday` sau khi tạo, rồi xoá meeting nếu đã bị huỷ.
- **M5. Dữ liệu staging cũ sau migration 0080.** `meet_url` bị bỏ nhưng `class_session.zoom` / `lesson.zoom` trên staging vẫn chứa link `meet.google.com`, nên học viên thấy nút "Vào lớp (Zoom)" mở Google Meet. Bulk bỏ qua các ngày này vì `cs.zoom` khác rỗng (`session-zoom-service.ts:572, 578`). Dòng `pending` cũ không có `zoomMeetingId` sẽ treo ở "Đang chờ recording" mãi. Chỉ ảnh hưởng staging. Có thể dọn bằng SQL một lần, không cần migration vì trên prod người dùng có thể đã tự gõ link Meet.
- **M6. Field deps chết.** `apps/server/src/routes/student.ts:127` thêm `getZoomClient` mà không dùng; `googleClientId/googleClientSecret` trong deps của `student.ts:125` và `kernel.ts:201-202` chỉ còn phục vụ Meet cũ. Nên xoá để không ai hiểu nhầm là còn đường gọi Google API.
- **M7. `recordingError` hiển thị như chữ phụ.** `apps/web/src/components/schedule/session-zoom-panel.tsx:268-272` dùng `text-muted-foreground`, trong khi badge là `danger`. Theo DESIGN.md, lỗi nên dùng token destructive (`text-destructive`). Nút sao chép mật khẩu phía học viên (`apps/student/src/components/class/recording-password.tsx:11-17`) cũng không có phản hồi nào khi sao chép xong.
- **M8. Secret Zoom bind dạng plain text.** `packages/infra/alchemy.run.ts:236-249` dùng `Config.String` cho `ZOOM_CLIENT_SECRET`, cùng mẫu với `RESEND_API_KEY`/`OPENAI_API_KEY` và đúng như plan đã chốt. Ai có quyền Cloudflare dashboard đều đọc được giá trị (binding plain_text, không phải secret). Không phải lỗi mới, chỉ ghi lại để cân nhắc khi Alchemy hỗ trợ `Redacted` kèm default.

## Kiểm theo checklist được giao

- **Lộ secret:** không log hay trả về secret. Lỗi token chỉ đưa `message`/body của Zoom (≤200 ký tự) vào `ZoomIntegrationError`. Header `Authorization` không được log. `console.warn` chỉ log `err` của chính client.
- **Authz:** cả 4 route đều cần `kernelCtx` (đã chặn student/admin trong `bootstrapMiddleware`) và scope `classTable.orgId = ctx.orgId` trước khi gọi service. Service cũng lọc theo `orgId` ở mọi query. Không thấy IDOR trên `classId/date`. Cảnh báo về license dùng chung xem I3.
- **Migration:** 0080 rebuild bảng theo đúng tiền lệ `0073`. Không bảng nào FK tới `class_session_meeting`, nên trên D1 dù `PRAGMA foreign_keys=OFF` không có tác dụng, `DROP TABLE` vẫn an toàn. Dữ liệu copy giữ các cột recording. 0081 `ADD COLUMN` có default an toàn. `drizzle-kit check` sạch.
- **Cron:** chưa cấu hình thì trả `{0,0,0}` (đã có test). Quá 72 giờ thì chuyển `failed` kèm message (đã có test). Retry `failed` mỗi giờ. Phòng mở lại nhiều phiên là giới hạn đã chấp nhận và đã ghi README. Rủi ro scan xem M1.
- **Token/401/429:** cache theo `accountId:clientId` với skew 60 giây. Gặp 401 thì xoá cache và thử lại một lần; body là string nên gửi lại được. Lỗi 429 phân biệt giới hạn ngày và giới hạn tần suất; test bao phủ cả hai.
- **Tàn dư Google Meet:** grep sạch, trừ copy landing đã giữ có chủ đích. Auth bỏ `accessType: "offline"` và `consent`; test roundtrip đã cập nhật.
- **Chất lượng test:** test client assert body request, URL, header retry và số lần gọi token, không phải test tautology. Test route kiểm DB thật (libsql) cùng `fake.calls`. Thiếu các ca nêu ở M3 và I1.
- **UI:** dùng `Badge` variant, `buttonVariants`, icon `aria-hidden`, nút chỉ có icon thì có `aria-label`, focus ring dùng token. Đã có ảnh POT ở 3 viewport (`plans/reports/831-zoom-*.png`).

## Đối chiếu "Done means" (#831)

| Tiêu chí | Đánh giá |
|---|---|
| Migration chuyển sang cột Zoom | Đạt |
| Thiếu secret thì tắt êm (`ZOOM_NOT_CONFIGURED`, cron bỏ qua) | Đạt (có test) |
| Tạo/sửa/huỷ/dời/bù lễ đồng bộ Zoom | Đạt cho luồng chính; lỗ ở I1, I2, M4 |
| Setting meeting (cloud, JBH, không phòng chờ, không registration) | Đạt (`zoom-client.ts:177-183`, có test) |
| Cron `pending/ready/failed`, UI hiện lỗi, nút đồng bộ tay | Đạt; rủi ro M1, M7 |
| Gỡ Google Meet/Calendar/Drive, giữ đăng nhập Google | Đạt về code; còn credential cũ (I5) |
| UI web và student ở 3 viewport | Đã có ảnh, chưa xác minh bằng mắt trong review này |
| Gate | biome, check-types, test liên quan đều pass; chưa chạy spec E2E `zoom-meeting.spec.ts` trong review này |

## Câu hỏi còn mở

1. Secret Zoom sẽ đặt per-environment hay ở mức Repository? Staging có dùng chung host/license với prod không? (I3)
2. Có dọn refresh token Google scope Drive trên staging bằng migration không, hay chỉ ghi bước thu hồi tay? (I5)
3. `ZOOM_HOST_USER=me` với app S2S: cần thử một lần trên tài khoản thật để chắc `me` trỏ đúng user chủ app. Nếu không đúng, đặt email host vào biến.
