---
phase: 2
title: "Web Inline Material Preview"
status: todo
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Web Inline Material Preview

## Goal

Cập nhật UI tài liệu trong `apps/web` (`/materials` và `SessionMaterialsModal`) để hiển thị khung xem trước PDF/ảnh inline ngay trong từng `MaterialItem` thay cho nút «Xem trước» mở modal mặc định, đồng thời giữ nút «Mở rộng ${title}» để mở `MaterialPreviewModal` tái sử dụng blob URL khi cần đọc kỹ.

## Files to Create / Modify

- Modify: `apps/web/src/lib/repos/materials.ts` — trong `fetchMaterialFileBlobUrl`, kiểm tra `res.headers.get("Content-Type")` khớp allowlist (`isPreviewableContentType`) trước `URL.createObjectURL` để tránh nhét HTML/kiểu lạ vào `blob:` URL; chuẩn hóa trường hợp `401` (nếu `status === 401` thì vẫn ném `MaterialRequestError` để UI gọi `reauth()`, và `materialErrorMessage` map `401` sang thông điệp hết phiên rõ ràng).
- Modify: `apps/web/src/components/materials/material-item.tsx` — thêm `min-w-0` vào `<li>` chống tràn ngang 375px; thêm prop tùy chọn `preview?: ReactNode` chỉ render `<div className="min-w-0 w-full basis-full">{preview}</div>` khi `preview` truthy (không tạo khoảng trống `gap-3` thừa cho tài liệu không xem trước); bỏ `MaterialPreviewButton` khỏi `MaterialOpenActions`.
- Modify: `apps/web/src/components/materials/material-preview.tsx` — thay `MaterialPreviewButton` bằng `MaterialInlinePreview` (dùng `InlineDocumentPreview` với `requestKey={item.id}`, gọi `reauth()` nếu lỗi `401`, và dùng `renderExpandedModal` mở `MaterialPreviewModal` truyền `blobUrl` đã tải); `MaterialPreviewModal` nhận `blobUrl?: string` (khi nhận từ inline parent thì render trực tiếp, không fetch lại và không revoke blob của parent).
- Modify: `apps/web/src/routes/_auth/materials/index.tsx` — chỉ truyền `preview={<MaterialInlinePreview item={item} />}` khi `materialPreviewMime(item) !== null`.
- Modify: `apps/web/src/components/class-detail/session-materials-modal.tsx` — gỡ bỏ `import { MaterialPreviewButton }` và `<MaterialPreviewButton item={item} />` ở danh sách «Tài liệu từ giáo trình» (dòng 11 & 272); bổ sung link «Tải xuống» cho curriculum item khi cần (hoặc giữ `Badge` + nút «Tải xuống» để khi lỗi xem trước vẫn tải được), và truyền `preview={materialPreviewMime(item) ? <MaterialInlinePreview item={item} /> : undefined}` cho cả 2 danh sách «Tài liệu đã gắn» và «Tài liệu từ giáo trình».
- Modify: `apps/web/src/components/materials/material-preview.test.tsx` — mock `@teacher-os/ui/components/document-preview/blob-document-view`; kiểm tra `MaterialInlinePreview` render inline, kiểm tra `Content-Type` allowlist, không render cho Office/link/media, nút «Mở rộng» mở dialog dùng lại blob URL không gọi `fetch` lần 2, đóng dialog không revoke blob URL inline, unmount mới revoke.
- Modify: `apps/web/src/components/class-detail/session-materials-modal.test.tsx` — mock `@teacher-os/ui/components/document-preview/blob-document-view`, xử lý route `/api/materials/:id/file` trong mock server + stub `URL.createObjectURL`/`revokeObjectURL`, cập nhật test cho inline preview ở cả 2 danh sách + Escape đóng modal «Mở rộng» mà giữ `SessionMaterialsModal` mở.
- Modify: `apps/web/src/routes/_auth/materials/index.test.tsx` — mock `@teacher-os/ui/components/document-preview/blob-document-view` + xử lý `/file` fetch / `URL.createObjectURL` trong `renderRoute`, và kiểm tra vai trò `ta` vẫn xem trước inline được.
- Modify: `apps/e2e/specs/material-preview.spec.ts` — cập nhật test E2E xác nhận PDF và ảnh render inline ngay trên `/materials`, XLSX không có preview inline, bấm «Mở rộng ${PDF_NAME}» mở modal ở 3 viewport (`1440×900`, `768×1024`, `375×812`) và không tràn ngang.

<!-- Updated: Red Team Session 2026-11-18 - Applied Findings 1, 2, 3, 4, 6, 8, 9 -->

## Tests Before (TDD)

1. `material-preview.test.tsx`: `MaterialInlinePreview` render inline ngay cho PDF/ảnh (không cần click nút «Xem trước»); từ chối response có `Content-Type: text/html` bằng `role="alert"`; không render gì cho DOCX/link/media.
2. `material-preview.test.tsx`: bấm «Mở rộng Đề Reading» mở `dialog` với cùng `blob:` URL mà không gọi `fetch` lần thứ 2; đóng dialog không revoke blob URL đang dùng inline; unmount `MaterialInlinePreview` mới revoke blob URL.
3. `session-materials-modal.test.tsx`: cả danh sách direct và «Từ giáo trình» đều render inline preview cho PDF (không còn nút «Xem trước» cũ); bấm «Mở rộng Handout buổi 1» rồi nhấn `Escape` chỉ đóng modal preview, giữ `SessionMaterialsModal` mở.
4. `materials/index.test.tsx`: toàn bộ test danh sách `/materials` pass sạch không lỗi `fetch` `/file` 500 giả; vai trò `ta` vẫn thấy khung xem trước inline nhưng không thấy nút sửa/xóa.

## Implementation Steps

1. Cập nhật tests trước ở `material-preview.test.tsx`, `session-materials-modal.test.tsx`, `materials/index.test.tsx`.
2. Cập nhật `fetchMaterialFileBlobUrl` trong `apps/web/src/lib/repos/materials.ts` kiểm tra `Content-Type` allowlist (`isPreviewableContentType`) trước `URL.createObjectURL`, và xử lý `401` trong `materialErrorMessage`.
3. Cập nhật `MaterialItem` (`min-w-0`, slot `preview`) và gỡ `MaterialPreviewButton` khỏi `MaterialOpenActions`.
4. Cập nhật `material-preview.tsx` triển khai `MaterialInlinePreview` và cập nhật `MaterialPreviewModal` hỗ trợ `blobUrl?: string` mượn từ `renderExpandedModal`.
5. Cập nhật `apps/web/src/routes/_auth/materials/index.tsx` và `apps/web/src/components/class-detail/session-materials-modal.tsx` (gỡ hẳn `MaterialPreviewButton`, truyền `preview` có điều kiện `materialPreviewMime(item)`). Giữ nguyên `MaterialBankBrowser` (`material-picker.tsx`) không truyền `preview`.
6. Cập nhật `apps/e2e/specs/material-preview.spec.ts` theo UX inline mới.

## Verification

- `pnpm --filter web exec vitest run src/components/materials/material-preview.test.tsx src/components/class-detail/session-materials-modal.test.tsx src/routes/_auth/materials/index.test.tsx`
- `pnpm --filter web check-types`
- `pnpm --filter web build`
