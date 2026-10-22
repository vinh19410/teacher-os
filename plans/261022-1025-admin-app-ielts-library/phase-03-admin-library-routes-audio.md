# Phase 3 — Route `/api/admin/library` và kho audio R2

## Context

Kernel router (`routes/kernel.ts`) org-scoped và có Origin + JSON CSRF guard; `/api/student` mount riêng ngoài kernel. `/api/admin` mount riêng tương tự, tự gắn `requireAdmin` (phase 1) và **tự** áp CSRF (Origin phải thuộc `adminOrigins`, JSON content-type cho mọi write trừ upload audio raw). `MediaStore` (`lib/media-store.ts`) đã có interface thuần + adapter R2 (`r2-media-store.ts`) + adapter đĩa cho e2e (`apps/e2e/src/fs-media-store.ts`); `mediaObjectResponse` khóa header an toàn.

## Requirements

Endpoints (tất cả sau `requireAdmin`):

| Method | Path | Hành vi |
|---|---|---|
| GET | `/api/admin/library/tests?skill&status&q` | list + `partCount`, `questionCount`, `hasAllAudio`; sắp theo `updatedAt` giảm dần |
| POST | `/tests` | tạo header, luôn `draft` |
| GET | `/tests/:id` | header + parts (DTO không lộ `audioKey`) |
| PATCH | `/tests/:id` | sửa header/status; `skill` bất biến (400); chuyển `ready` chạy `validateTestReady`, lỗi 400 trả danh sách lý do theo part |
| DELETE | `/tests/:id` | xóa row (cascade parts) trong `db.batch`, dọn audio R2 qua `runInBackground` |
| PUT | `/tests/:id/parts/:part` | upsert nội dung một part; part phải thuộc preset của `skill`; nếu test đang `ready` thì validate theo luật `ready` |
| DELETE | `/tests/:id/parts/:part` | xóa part (+ audio); không cho nếu test đang `ready` (phải hạ `draft` trước) |
| PUT | `/tests/:id/parts/:part/audio` | raw body, header `Content-Length`, `X-File-Name` (encodeURIComponent), `Content-Type` ∈ allowlist; chỉ test `skill=listening` |
| GET | `/tests/:id/parts/:part/audio` | stream; hỗ trợ `Range` để seek (xem Risks) |
| DELETE | `/tests/:id/parts/:part/audio` | xóa audio; không cho nếu test `ready` |

- Upload: ghi key mới `library/<testId>/<part>/<uuid>` → cập nhật row → xóa key cũ (nền). Lỗi giữa chừng không để row trỏ tới object chưa tồn tại.
- `AppDeps.getLibraryAudioStore?()`: vắng mặt → các route audio trả 503 `LIBRARY_AUDIO_DISABLED` (giống `getMediaStore`).
- Production: binding R2 `LIBRARY_AUDIO` trong `alchemy.run.ts` (`Cloudflare.R2.Bucket("library-audio", {})`, private, không `forceDestroy`), `index.ts` tạo `createR2MediaStore(env.LIBRARY_AUDIO)`.
- CORS: `allowHeaders` đã có `X-File-Name`; thêm `Content-Range`/`Accept-Ranges` nếu hỗ trợ Range.
- Header response audio: tái dùng `mediaObjectResponse`, nhưng cache `private, no-store` đổi thành `private, max-age=0, must-revalidate`? Giữ nguyên `no-store` để đơn giản, chấp nhận mất cache.

## Files

Tạo: `apps/server/src/routes/admin-library.ts` (+ `admin-library.test.ts`, `admin-library-audio.test.ts`), `apps/server/src/lib/library-audio.ts` (key builder, Range parse) nếu logic vượt 60 dòng.
Sửa: `apps/server/src/app.ts` (`AppDeps.getLibraryAudioStore`, mount `/api/admin`), `apps/server/src/index.ts`, `packages/infra/alchemy.run.ts` (bucket + binding), `packages/env/env.d.ts`, `apps/e2e/src/boot.ts` (FS store thư mục tạm riêng, truyền vào `buildApp`), `apps/e2e/src/fs-media-store.ts` (dùng lại, không sửa nếu đủ).

## Steps

1. Test đỏ cho từng endpoint theo ma trận role: admin hợp lệ 2xx; teacher, student, chưa đăng nhập, admin không verify, admin email ngoài allowlist đều bị 401/403 và **không ghi gì**.
2. Viết router, tái dùng `readBody` pattern của `assignments/tests.ts` (JSON parse → zod strict → 400).
3. Audio: kiểm `Content-Length`, MIME allowlist, cap 50MB, `enforceDeclaredSize` qua store; test với store Map in-memory (precedent unit test).
4. `delete`/`upload` thay thế: test dọn object cũ qua `runInBackground`.
5. Nối e2e `boot.ts` để spec phase 7 chạy trên server thật.

## Validation

```bash
pnpm --filter server exec vitest run src/routes/admin-library.test.ts src/routes/admin-library-audio.test.ts
pnpm --filter server test
pnpm --filter e2e check-types
```

Pass khi: ma trận quyền đúng; `ready` bị chặn đúng ca (thiếu slot, thiếu audio, thiếu pin); upload 51MB bị từ chối không để lại object; xóa test không để object mồ côi trong store.

## Risks / Rollback

- Range request: nếu R2 adapter `get` chưa hỗ trợ range, ghi nhận trong phase và bắt đầu bằng stream toàn file (trình duyệt vẫn phát, seek chậm). Chỉ thêm Range khi adapter hỗ trợ được mà không phá `MediaStore` interface (thêm tham số tùy chọn).
- `Content-Length` lệch thực tế → `MediaSizeMismatchError` → 400 (đã có handler ở route Speaking, copy cách map lỗi).
- Rollback: route mount là cộng thêm; gỡ mount + binding là đủ, bảng giữ nguyên.
