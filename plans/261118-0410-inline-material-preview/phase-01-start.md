---
phase: 1
title: "Shared Inline Preview Core in @teacher-os/ui"
status: todo
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Shared Inline Preview Core in @teacher-os/ui

## Goal

Đưa `BlobDocumentView` sang `@teacher-os/ui` và xây dựng component `InlineDocumentPreview` dùng chung cho cả `apps/web` và `apps/student`, hỗ trợ lazy-load qua `IntersectionObserver` với placeholder giữ chiều cao, giới hạn concurrency/canvas/kích thước file, kiểm tra `Content-Type` + tắt `eval` của pdfjs, và quản lý vòng đời `blob:` URL ổn định theo `requestKey`.

## Files to Create / Modify

- Modify: `packages/ui/package.json`, `apps/student/package.json` — thêm `"pdfjs-dist": "^6.4.299"` (đã có trong `pnpm-lock.yaml`).
- Create: `packages/ui/src/vite-env.d.ts` — khai báo `declare module "*?url"` để `packages/ui` typecheck sạch với Vite `?url` worker import.
- Create: `packages/ui/src/components/document-preview/blob-document-view.tsx` — chuyển từ `apps/web/src/components/document-preview/blob-document-view.tsx`, dùng `@teacher-os/ui/components/button`, bật `isEvalSupported: false` trên `pdfjsLib.getDocument`, kẹp kích thước pixel `<canvas>` tối đa (ví dụ cạnh max 4096px / tổng pixel <= 16_777_216) chống OOM từ MediaBox dị dạng, thêm `overflow-auto rounded-lg border border-input bg-muted/40 p-3` cho `ImageView`, và thêm prop `viewportClassName?: string`.
- Create: `packages/ui/src/components/document-preview/inline-document-preview.tsx` — helper `isPreviewableDocumentMime`, `isPreviewableContentType`, `INLINE_AUTO_PREVIEW_MAX_BYTES` (`10 * 1024 * 1024`), hàng đợi giới hạn 3 fetch song song, và component `InlineDocumentPreview`.
- Create: `packages/ui/src/components/document-preview/inline-document-preview.test.tsx` — unit test TDD cho `isPreviewableDocumentMime`, `isPreviewableContentType`, và `InlineDocumentPreview` (mock `./blob-document-view` để không chạy `pdfjs-dist` worker trong jsdom).
- Modify: `apps/web/src/components/document-preview/blob-document-view.tsx` — re-export từ `@teacher-os/ui/components/document-preview/blob-document-view` để giữ tương thích `source-document-viewer.tsx`.

<!-- Updated: Red Team Session 2026-11-18 - Applied Findings 2, 3, 4, 5, 8, 9 -->

## Tests Before (TDD)

1. `isPreviewableDocumentMime(kind, mimeType)` trả về `mimeType` cho `kind === "file"` với `application/pdf`, `image/png`, `image/jpeg`, `image/webp`; trả `null` cho DOCX/PPTX/XLSX, `text/html`, `link`, `media`, hoặc `mimeType === null`. `isPreviewableContentType(headerValue)` chấp nhận `application/pdf; charset=...` / `image/*` trong allowlist và từ chối `text/html` / `application/octet-stream`.
2. `InlineDocumentPreview` có placeholder `min-h-48` và chưa gọi `loadBlobUrl` khi `IntersectionObserver` báo chưa vào viewport; khi `isIntersecting: true` mới gọi `loadBlobUrl` và `disconnect()` observer.
3. Với `sizeBytes > INLINE_AUTO_PREVIEW_MAX_BYTES`, hiển thị nút «Tải bản xem trước» tại chỗ (không tự fetch khi cuộn tới); bấm vào mới gọi `loadBlobUrl`.
4. `InlineDocumentPreview` hiển thị `BlobDocumentView` khi load thành công; truyền `loadBlobUrl` qua `useRef` + phụ thuộc duy nhất `[triggered, requestKey]` nên bấm «Mở rộng ${title}» (`renderExpandedModal({ blobUrl, onClose })`) re-render không revoke/fetch lại; đổi `requestKey` hoặc unmount mới gọi `URL.revokeObjectURL` (kể cả khi unmount giữa lúc fetch đang pending) và tự đóng modal nếu đang mở.
5. `InlineDocumentPreview` hiển thị `role="alert"` + thông báo lỗi khi `loadBlobUrl` reject; bỏ qua lỗi abort.

## Implementation Steps

1. Thêm `"pdfjs-dist": "^6.4.299"` vào `packages/ui/package.json` và `apps/student/package.json`, chạy `pnpm install --offline`.
2. Tạo `packages/ui/src/vite-env.d.ts` và đưa `BlobDocumentView` sang `packages/ui/src/components/document-preview/blob-document-view.tsx`:
   - `pdfjsLib.getDocument({ url: blobUrl, disableAutoFetch: true, isEvalSupported: false })`.
   - Kẹp tỷ lệ render `PdfCanvas` sao cho `Math.max(viewport.width * dpr, viewport.height * dpr) <= 4096` (vẫn đảm bảo sắc nét ở zoom 200% với trang A4 thường, không OOM với PDF MediaBox khổng lồ).
   - `ImageView` dùng khung `overflow-auto rounded-lg border border-input bg-muted/40 p-3` (áp dụng `viewportClassName`) để không tràn ngang ở mobile 375px khi zoom > 100%.
3. Tạo `packages/ui/src/components/document-preview/inline-document-preview.tsx`:
   - Props: `requestKey: string`, `title: string`, `mimeType: string`, `sizeBytes?: number | null`, `loadBlobUrl: (signal: AbortSignal) => Promise<string>`, `formatError: (err: unknown) => string`, `renderExpandedModal?: (opts: { blobUrl: string; onClose: () => void }) => ReactNode`, `className?: string`.
   - Dùng `useRef` giữ `loadBlobUrl` và `formatError` để không làm `useEffect` chạy lại khi parent re-render.
   - Khi `sizeBytes` vượt `INLINE_AUTO_PREVIEW_MAX_BYTES` (10 MiB), chờ người dùng bấm «Tải bản xem trước» thay vì auto-fetch khi intersect; các file thường auto-fetch ngay khi `IntersectionObserver` (`rootMargin: "200px 0px"`) báo `isIntersecting` (fallback `true` nếu không có `IntersectionObserver`), sau đó `disconnect()` observer ngay.
   - Hàng đợi concurrency tối đa 3 slot (hỗ trợ `AbortSignal` huỷ chờ nếu unmount trước khi tới lượt).
   - Header gọn gồm nhãn «Xem trước» + nút «Mở rộng» (`aria-label={`Mở rộng ${title}`}`) khi `state.status === "ready"` và có `renderExpandedModal`.
   - `renderExpandedModal` chỉ mount khi `expanded && state.status === "ready"`, truyền `blobUrl={state.url}` — khi `requestKey` đổi hoặc component unmount, `state` reset và `blobUrl` được `URL.revokeObjectURL` sạch sẽ, không bao giờ xảy ra Use-After-Revoke.
4. Re-export `BlobDocumentView`, `PDF_MIME` tại `apps/web/src/components/document-preview/blob-document-view.tsx`.
5. Chạy test `@teacher-os/ui`, `packages/ui check-types`, và `import.test.tsx` ở `apps/web`.

## Verification

- `pnpm --filter @teacher-os/ui test`
- `pnpm --filter @teacher-os/ui check-types`
- `pnpm --filter web exec vitest run src/routes/_auth/assignments/tests/import.test.tsx`

## Risk & Rollback

- **Rủi ro:** `pdfjs-dist` worker `?url` trong `packages/ui` cần Vite resolver của `web` và `student`. Xác minh bằng `vite build` ở Phase 2 & 3.
- **Rollback:** Revert commit nếu build hoặc CSP gặp sự cố; không có thay đổi DB hay API.
