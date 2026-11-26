---
phase: 3
title: "PDF Slicer Engine (pdf-lib) & Teacher Class UI"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: PDF Slicer Engine (pdf-lib) & Teacher Class UI

## Goal

Cài đặt `pdf-lib` cho `apps/web` (lazy-load để không tăng bundle khởi tạo và không chạm giới hạn RAM Cloudflare Workers), xây dựng engine cắt trang PDF có unit test đầy đủ, xây dựng modal **Cắt bài giảng từ sách gốc** (1 buổi hoặc hàng loạt nhiều buổi từ Tài liệu chung / Ngân hàng tài liệu / file PDF cục bộ), nâng cấp `SessionMaterialsModal` tách rõ **Bài giảng** và **Bài tập buổi học** (upload/gắn/thêm link trước hoặc sau buổi + giao bài từ Ngân hàng đề gắn buổi), và cập nhật `AssignClassPromptModal` / `ClassAssignmentsTab` hỗ trợ chọn và hiển thị buổi học.

## Files to Create / Modify

- Modify: `apps/web/package.json` + `pnpm-lock.yaml` — thêm dependency `pdf-lib` (`^1.17.1`).
- Create: `apps/web/src/lib/pdf-slicer.ts` — lazy `import("pdf-lib")`, `PDF_SOURCE_MAX_BYTES` (100 MiB), kiểm chữ ký `%PDF-` đầu file, `validatePageRange`, `inspectPdfDocument`, `slicePdfPages`, `buildSlicedPdfFile` (cắt ngắn tên file `<= 200` ký tự giữ đuôi `.pdf`), lớp lỗi `PdfSliceError` (`SOURCE_TOO_LARGE`, `ENCRYPTED_PDF`, `INVALID_PDF`, `INVALID_RANGE`, `SLICE_TOO_LARGE`). <!-- Red-Team RT-8, RT-10 -->
- Create: `apps/web/src/lib/pdf-slicer.test.ts` — test cắt PDF thật nhiều trang (kiểm số trang đầu ra, header `%PDF-`, kiểm lỗi khoảng trang, PDF hỏng, PDF mã hóa, file nguồn quá lớn, tên file dài > 200 ký tự).
- Modify: `apps/web/src/lib/repos/materials.ts` — mở rộng `attachSessionMaterial` & `uploadSessionMaterial` (chỉ gửi `category`/query khi khác mặc định `"lecture"` hoặc có metadata nguồn để giữ tương thích `.strict()` & test cũ), thêm `createSessionMaterialLink`, `updateSessionMaterialCategory`, `fetchMaterialFileBytes` (kiểm `Content-Type === application/pdf` và xử lý `401` qua `reauth()`), thông điệp lỗi `INVALID_PAGE_RANGE`. <!-- Red-Team RT-7, RT-10 -->
- Modify: `apps/web/src/lib/mock-data.ts`, `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/repos/class-assignments.ts` (và test `class-assignments.test.ts`) — truyền (omit `sessionDate` khi null/rỗng) và chiếu `sessionDate: row.sessionDate ?? null` trong `mapClassAssignments`. <!-- Red-Team RT-4, RT-7 -->
- Create: `apps/web/src/components/class-detail/slice-book-modal.tsx` — modal chọn sách PDF gốc (mặc định nguồn riêng của GV: **Ngân hàng tài liệu** và **File PDF từ máy tính**; tab **Tài liệu chung của lớp** kèm cảnh báo rõ rằng học viên đang thấy toàn bộ sách trong tab Tài liệu chung), xem tổng số trang + xem nhanh trang PDF qua `React.lazy` `BlobDocumentView`, lọc bỏ buổi `isProjected`/`holiday`/`shiftedAway`, cấu hình khoảng trang & tiêu đề cho 1 hoặc nhiều buổi học, cắt và tải từng file PDF con gắn làm `lecture` kèm tiến trình từng buổi & retry nếu lỗi. <!-- Red-Team RT-10 -->
- Create: `apps/web/src/components/class-detail/slice-book-modal.test.tsx`.
- Modify: `apps/web/src/components/class-detail/session-materials-modal.tsx` & `session-materials-modal.test.tsx` — dùng bố cục **2 tab** (chỉ mount 1 panel mỗi lúc, mặc định tab **Bài giảng** giữ nguyên `session-materials-empty` / `"Chọn file tải lên cho buổi học"` / `"Tài liệu đã gắn"`) với **2 `useMaterialUploadQueue` độc lập** (`lectureQueue` & `homeworkQueue`) tránh race đổi tab; nút "Cắt từ sách gốc", thêm liên kết trực tiếp cho buổi, nút chuyển mục Bài giảng ↔ Bài tập, hiển thị badge `"Sách gốc · tr. X–Y"`, hiển thị bài tập tương tác gắn buổi + nút "+ Giao bài từ ngân hàng đề". <!-- Red-Team RT-7 -->
- Modify: `apps/web/src/components/class-detail/class-sessions-section.tsx` — thêm nút **"Cắt sách theo buổi"** ở header section (khi `canWrite && supportsMaterials` và có ít nhất 1 buổi hợp lệ khác `holiday`/`shiftedAway`), ẩn nút Tài liệu trên buổi `shiftedAway`, truyền danh sách buổi hợp lệ + callback giao bài tập gắn buổi. <!-- Red-Team RT-10 -->
- Modify: `apps/web/src/components/classes/assign-class-prompt-modal.tsx` & `class-assignments-tab.tsx` & `apps/web/src/routes/_auth/classes/$classId.tsx` — lọc chỉ buổi thực (`!isProjected && !holiday && !shiftedAway`), đồng bộ `defaultSessionDate` ngay trong `useEffect` reset theo `wasOpenRef`, hiển thị badge buổi học trên bài tập đã giao. <!-- Red-Team RT-10 -->

## Tests Before (TDD)

1. Viết `apps/web/src/lib/pdf-slicer.test.ts` kiểm tra:
   - `validatePageRange` với biên hợp lệ (`1..1`, `2..5`), ngoài biên (`0..2`, `5..3`, `1..999`, số thập phân).
   - Tạo PDF 6 trang thật bằng `pdf-lib`, gọi `inspectPdfDocument` trả `pageCount: 6`, gọi `slicePdfPages(doc, 2, 4)` trả PDF hợp lệ đọc lại có đúng 3 trang và kích thước khớp.
   - Bytes không phải PDF → ném `PdfSliceError("INVALID_PDF")`.
   - File PDF đánh dấu mã hóa → ném `PdfSliceError("ENCRYPTED_PDF")`.
   - File cắt vượt `MATERIAL_DOC_MAX_BYTES` → ném `PdfSliceError("SLICE_TOO_LARGE")`.
2. Viết test trong `apps/web/src/components/class-detail/session-materials-modal.test.tsx` và `slice-book-modal.test.tsx`:
   - `SessionMaterialsModal` tách đúng danh sách Bài giảng (`lecture` + `curriculumMaterials`) và Bài tập (`homework` + `classAssignments` gắn buổi); upload/gắn từ đúng tab gửi đúng `category`; đổi `category` gọi PATCH; hiển thị metadata `Trang X–Y` cho bài giảng cắt từ sách gốc; TA chỉ đọc không thấy các nút sửa/cắt/upload.
   - `SliceBookModal` cho phép chọn sách PDF từ Tài liệu chung / Ngân hàng / file cục bộ, validate khoảng trang `Từ trang <= Đến trang <= pageCount`, cắt và upload từng buổi với `category: "lecture"` và `sourceTitle`/`pageStart`/`pageEnd`.
3. Cập nhật test `assign-class-prompt-modal.test.tsx` kiểm tra chọn `sessionDate` và `defaultSessionDate`.

## Implementation Steps

1. Cài `pdf-lib` vào `apps/web`: `pnpm --filter web add pdf-lib`.
2. Xây dựng `apps/web/src/lib/pdf-slicer.ts` với dynamic `import("pdf-lib")` và helper thuần.
3. Mở rộng `apps/web/src/lib/repos/materials.ts` (attach/upload/link/patch category + `fetchMaterialFileBytes`) và `kernel.ts`/`data-actions.ts`/`mock-data.ts` cho `sessionDate`.
4. Xây dựng `SliceBookModal` theo đúng token `DESIGN.md` (shadcn neutral, light mặc định + dark, `focus-visible:shadow-[var(--focus-ring)]`, `tabular-nums`, keyboard/a11y chuẩn `REVIEW.md`).
5. Nâng cấp `SessionMaterialsModal` giữ tương thích tên/role cũ ở các đường dẫn không đổi và bổ sung phân vùng **Bài giảng** / **Bài tập buổi học** rõ ràng, có hướng dẫn upload trước hoặc sau buổi học, có nút mở `SliceBookModal` cho buổi hiện tại và nút mở `AssignClassPromptModal` gắn sẵn buổi hiện tại.
6. Nối `SliceBookModal` (chế độ hàng loạt) và `defaultSessionDate` vào `ClassSessionsSection`, `AssignClassPromptModal`, `ClassAssignmentsTab`, và `apps/web/src/routes/_auth/classes/$classId.tsx`.

## Tests After

1. Chạy toàn bộ test `apps/web` cho `pdf-slicer`, `materials`, `session-materials-modal`, `slice-book-modal`, `assign-class-prompt-modal`, `$classId.sessions`, `$classId`.
2. Chạy `pnpm --filter web check-types` và `pnpm --filter web build` để xác nhận Vite tách chunk `pdf-lib` sạch sẽ.

## Regression Gate

```bash
pnpm --filter web check-types && pnpm --filter web exec vitest run src/lib/pdf-slicer.test.ts src/lib/repos/materials.test.ts src/components/class-detail/session-materials-modal.test.tsx src/components/class-detail/slice-book-modal.test.tsx src/components/classes/assign-class-prompt-modal.test.tsx src/routes/_auth/classes/\$classId.test.tsx src/routes/_auth/classes/\$classId.sessions.test.tsx
```

## Todo

- [ ] Cài `pdf-lib` cho `apps/web`.
- [ ] Triển khai và test `pdf-slicer.ts`.
- [ ] Mở rộng repo `materials.ts` và kernel `sessionDate`.
- [ ] Triển khai `SliceBookModal` và unit test.
- [ ] Nâng cấp `SessionMaterialsModal`, `ClassSessionsSection`, `AssignClassPromptModal`, `ClassAssignmentsTab`, `$classId.tsx`.
- [ ] Chạy regression gate Phase 3 xanh.
