---
phase: 2
title: "API giáo viên và API công khai"
status: pending
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

1. Router giáo viên mount trong kernel, thừa hưởng Origin guard. Guard `canAccessFinance` trả 403 `placement-forbidden` cho toàn router:
   - `GET /api/placement-test`: `{ draft, revision, publishedVersion, publishedAt, dirty, isLeadOrg, audio }`, trong đó `audio` là map `audioId → { name, size, type }`. Chưa có row thì `draft: null`, `revision: 0`.
   - `PUT /api/placement-test/draft` nhận `{ revision, content }`. `revision = 0` thì insert, còn lại `UPDATE ... WHERE revision = ?`. Không ảnh hưởng dòng nào thì 409 `PLACEMENT_REVISION_CONFLICT`. Thành công trả `revision` mới.
   - `PUT /api/placement-test/audio` nhận raw body, header `Content-Length`, `Content-Type`, `X-File-Name`. Kiểm MIME, trần 20 MB, `sanitizeMediaFileName`; thiếu store thì 503. Ghi object trước, row sau; lỗi ghi row thì dọn object. Trả `{ audioId, name, size, type }`.
   - `GET /api/placement-test/audio/:id` kiểm `org_id` theo session, stream cho màn nghe thử; audio org khác trả 404.
   - `POST /api/placement-test/publish` nhận `{ revision }`. Sai revision thì 409; `validatePlacementForPublish` có lỗi thì 422 kèm `issues`; `audioId` không thuộc org thì 422. Phát hành bằng một `UPDATE` duy nhất có CAS, tăng `published_version`. Chạy dọn audio theo D11 qua `runInBackground`.
2. Router công khai mount tại `/public/placement-test`, ngoài `/api/*`:
   - `cors({ origin: leadOrigins, allowMethods: ["GET", "OPTIONS"] })`, không credentials.
   - `GET /`: thiếu `leadOrgId` thì 503 `PLACEMENT_DISABLED`; chưa phát hành thì 404 `PLACEMENT_NOT_PUBLISHED`; có thì trả nguyên văn cột `published`, `Cache-Control: no-cache`.
   - `GET /audio/:id`: tìm row theo `id` và `org_id = leadOrgId`, không có thì 404. Parse `Range` theo `size` trong row, sai thì 416 kèm `Content-Range`. Trả `206` hoặc `200`, luôn có `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: public, max-age=31536000, immutable`.
3. `app.ts`: thêm `/public/placement-test` vào nhánh bỏ qua CORS toàn cục (`app.ts:333-337`). Nếu không, `Access-Control-Allow-Origin` theo danh sách teacher/student và fetch từ `msmy.io.vn` sẽ hỏng.
4. `parseByteRange` dựa trên bản trong `apps/profile/serve.mjs`, đổi sang TypeScript và có test riêng.

## Verification

- `pnpm --filter server test placement-test`:
  - Hai PUT cùng `revision` thì cái sau 409; publish sai revision thì 409.
  - Nháp đổi sau khi phát hành không làm đổi response công khai.
  - `ta` và `class_teacher` nhận 403; PUT không có Origin hợp lệ nhận 403.
  - Teacher org A không đọc được audio org B.
  - Publish thiếu ngưỡng trả 422 có `issues`; audio của org khác trả 422.
  - Dọn audio giữ lại file được nháp hoặc bản phát hành tham chiếu, và file mới hơn 24 giờ.
  - Công khai: 503 khi thiếu `leadOrgId`, 404 khi chưa phát hành, header CORS đúng origin, `206` với `bytes=0-99`, `416` với range ngoài file, audio ngoài `LEAD_ORG_ID` trả 404.
- `pnpm exec biome check .` và `pnpm check-types` qua.
