---
phase: 2
title: "API giáo viên và API công khai"
status: completed
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 2: API giáo viên và API công khai

## Goal

Giáo viên đọc, lưu nháp, upload audio, phát hành; trang profile đọc được bản phát hành và audio mà không cần đăng nhập.

## Files to Create / Modify

- Create: `apps/server/src/routes/placement-test.ts`, `apps/server/src/routes/placement-test.test.ts`
- Create: `apps/server/src/routes/public-placement-test.ts`, `apps/server/src/routes/public-placement-test.test.ts`
- Create: `apps/server/src/lib/byte-range.ts`, `apps/server/src/lib/byte-range.test.ts`
- Modify: `apps/server/src/app.ts` (mount, CORS bypass), `apps/server/src/routes/kernel.ts` (thêm `leadOrgId`, `getLibraryAudioStore` vào kiểu tham số của `kernelRoutes`; runtime đã nhận qua `...deps` ở `app.ts:410`; mount `/placement-test`)

## Tasks & Steps

<!-- Updated: Red Team Review - CAS onConflictDoNothing & published_revision, CORP same-site, 206 Content-Length = range.length, extractReferencedAudioIds -->
1. Router giáo viên (`apps/server/src/routes/placement-test.ts`) mount tại `/placement-test` trong `kernelRoutes`, thừa hưởng Origin guard. Guard `canAccessFinance` trả 403 `placement-forbidden` cho toàn router:
   - `GET /api/placement-test`: trả `{ draft, revision, publishedVersion, publishedAt, dirty, isLeadOrg, audio }`, trong đó `audio` là map `audioId → { name, size, type }` của org. Chưa có row thì `draft: null`, `revision: 0`, `publishedVersion: 0`, `publishedAt: null`, `dirty: false`. Khi có row, `dirty = row.draft !== null && (row.published === null || row.revision !== row.publishedRevision)`. `isLeadOrg = Boolean(deps.leadOrgId && deps.leadOrgId === orgId)`.
   - `PUT /api/placement-test/draft` nhận `{ revision, content }` (giới hạn body 256 KB). `revision === 0` thì `.insert(placementTest).values({ orgId, draft: JSON.stringify(content), revision: 1, updatedAt }).onConflictDoNothing().returning({ revision: placementTest.revision })`; `revision > 0` thì `UPDATE placement_test SET draft = ?, revision = revision + 1, updated_at = ? WHERE org_id = ? AND revision = ? RETURNING revision`. Không ảnh hưởng dòng nào thì 409 `PLACEMENT_REVISION_CONFLICT`. Thành công trả `{ revision, dirty }`.
   - `PUT /api/placement-test/audio` nhận raw body, header `Content-Length`, `Content-Type`, `X-File-Name`. Kiểm MIME thuộc `LIBRARY_AUDIO_MIME`, trần `PLACEMENT_AUDIO_MAX_BYTES = 20 * 1024 * 1024` (20 MB), `sanitizeMediaFileName`; thiếu store thì 503. Ghi object (`placement/${orgId}/${audioId}`) trước, row `placement_test_audio` sau; lỗi ghi row thì xóa object. Trả `{ audioId, name, size, type }`.
   - `GET /api/placement-test/audio/:id` kiểm `org_id` theo session, stream qua `mediaObjectResponse` cho màn nghe thử; audio org khác trả 404.
   - `POST /api/placement-test/publish` nhận `{ revision }`. Đọc row hiện tại: chưa có row hoặc `row.draft === null` hoặc `row.revision !== revision` thì 409 `PLACEMENT_REVISION_CONFLICT`. Chạy `validatePlacementForPublish(draft)` — nếu có lỗi thì 422 `{ error: "PLACEMENT_INVALID", code: "PLACEMENT_INVALID", issues }`. Kiểm mọi `audioId` trong `draft` đều tồn tại trong `placement_test_audio` của `org_id` — thiếu thì 422 kèm `issues`. Dựng `snapshot = buildPlacementSnapshot(draft, row.publishedVersion + 1)` và cập nhật bằng một `UPDATE` có CAS `WHERE org_id = ? AND revision = ? AND published_version = ?` (gán `published = JSON.stringify(snapshot)`, `published_version = row.publishedVersion + 1`, `published_revision = revision`, `published_at = now`, `published_by = userId`). Thành công trả `{ publishedVersion, publishedAt, revision, dirty: false }`. Chạy dọn audio theo D11 qua `runInBackground`: dùng `extractReferencedAudioIds(row.draft, JSON.stringify(snapshot))` để giữ mọi audio đang được `draft` hoặc `published` tham chiếu, chỉ xóa row `placement_test_audio` của org không được tham chiếu và có `created_at < now - 24h` (xóa row trước, `store.delete(objectKey)` sau).
2. Router công khai (`apps/server/src/routes/public-placement-test.ts`) mount tại `/public/placement-test`, ngoài `/api/*`:
   - `cors({ origin: deps.leadOrigins ?? [], allowMethods: ["GET", "OPTIONS"] })`, không credentials.
   - `GET /`: thiếu `leadOrgId` thì 503 `PLACEMENT_DISABLED`; chưa có row hoặc `published === null` thì 404 `PLACEMENT_NOT_PUBLISHED`; có thì trả nguyên văn cột `published` với `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-cache`.
   - `GET /audio/:id`: thiếu `leadOrgId` thì 503; thiếu store thì 503; tìm row trong `placement_test_audio` theo `id` và `org_id = leadOrgId`, không có thì 404. Nếu có header `Range`, parse bằng `parseByteRange(rangeHeader, row.size)`: nếu `unsatisfiable` thì trả `416` kèm `Content-Range: bytes */${row.size}`; nếu hợp lệ (`{ start, end }`) thì gọi `store.get(row.objectKey, { offset: start, length: end - start + 1 })`. Khi `object.range` có mặt, trả `206` với `Content-Range: bytes ${start}-${end}/${row.size}` và `Content-Length: String(object.range.length)`; ngược lại trả `200` với `Content-Length: String(object.size)`. Luôn đặt `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: public, max-age=31536000, immutable`.
3. `app.ts`:
   - Thêm `/api/placement-test/audio/*` vào middleware đặt `Cross-Origin-Resource-Policy: same-site` trước `secureHeaders` (cùng `/api/student/attempts/:attemptId/media` và `/api/grading/:attemptId/media`).
   - Thêm `/public/placement-test` và `/public/placement-test/*` vào nhánh bỏ qua CORS toàn cục (`app.ts:354-360`).
   - Mount `app.route("/public/placement-test", publicPlacementTestRoutes(deps))`.
4. `apps/server/src/lib/byte-range.ts`: `parseByteRange(rangeHeader: string, totalLength: number)` dựa trên `apps/profile/serve.mjs`, phân biệt header không phải `bytes=` / multi-range (bỏ qua → trả 200) với range ngoài biên hoặc sai cú pháp đơn (`null` → trả 416), kèm unit test `byte-range.test.ts`.

## Verification

- Verify: `pnpm --filter server test placement-test` and `pnpm --filter server test byte-range` exit 0:
  - Hai PUT cùng `revision` (kể cả `revision = 0`) thì cái sau 409; publish sai revision thì 409.
  - Ngay sau publish thì `dirty === false`; sửa nháp sau khi phát hành thì `dirty === true` và không làm đổi response công khai.
  - `ta` và `class_teacher` nhận 403; PUT không có Origin hợp lệ nhận 403; `GET /api/placement-test/audio/:id` có `Cross-Origin-Resource-Policy: same-site`.
  - Teacher org A không đọc được audio org B.
  - Publish thiếu ngưỡng trả 422 có `issues`; audio của org khác trả 422.
  - Dọn audio giữ lại file được nháp hoặc bản phát hành (`src`) tham chiếu, và file mới hơn 24 giờ.
  - Công khai: 503 khi thiếu `leadOrgId`, 404 khi chưa phát hành, header CORS đúng origin, `206` với `bytes=0-99` (`Content-Length: 100`, `Content-Range: bytes 0-99/<total>`), `416` với range ngoài file, audio ngoài `LEAD_ORG_ID` trả 404.
- Verify: `pnpm exec biome check .` and `pnpm check-types` exit 0.

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
