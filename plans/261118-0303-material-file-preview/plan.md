---
title: Xem trước tài liệu (PDF/ảnh) ở ngân hàng tài liệu và buổi học
status: completed
mode: tdd
branch: feat/material-file-preview
ship: beta
---

# Xem trước tài liệu ở ngân hàng và buổi học

## Outcome
Giáo viên (app `web`) xem trước được nội dung tài liệu dạng file ngay trong app thay vì chỉ thấy tên file và nút «Tải xuống». Định dạng không xem trước được vẫn hiển thị như cũ (tên + tải xuống).

## Phạm vi
- Ngân hàng tài liệu `/materials` (danh sách tài liệu).
- Modal «Tài liệu buổi …» ở chi tiết lớp: cả danh sách tài liệu đã gắn và danh sách chỉ đọc «Từ giáo trình».

## Ma trận định dạng
| Định dạng | Hành vi |
| --- | --- |
| PDF | Nút «Xem trước» → modal render bằng pdfjs (lật trang + zoom), dùng chung viewer của màn import đề |
| PNG/JPG/WEBP | Nút «Xem trước» → modal hiển thị ảnh + zoom |
| MP3/M4A/MP4 | Giữ nguyên nút «Phát» (đã mở inline trong tab mới) |
| DOCX/PPTX/XLSX | Không xem trước — giữ tên file + «Tải xuống» |
| Liên kết | Giữ nguyên «Mở» |

## Thiết kế
- Không đổi server: file tài liệu vẫn `attachment` + CSP khoá cứng. Client tải bằng `fetch(credentials: include)` → blob URL (giống `fetchExamImportFileUrl`), revoke khi đóng modal.
- Tách `PdfCanvas`/`ImageView`/`ViewerToolbar` khỏi `source-document-viewer.tsx` sang component dùng chung (`components/document-preview/blob-document-view.tsx`), nhãn a11y truyền qua prop; màn import đề giữ nguyên nhãn cũ.
- `materialPreviewMime(item)` quyết định có xem trước được không (chỉ `kind=file` + MIME pdf/ảnh trong allowlist).
- `MaterialPreviewModal` (Modal size xl): loading / lỗi (kèm nút tải xuống) / nội dung; footer «Tải xuống» + «Đóng».

## Non-goals
- App học viên (`apps/student`), picker chọn tài liệu, thumbnail trong danh sách, xem trước Office (DOCX/PPTX/XLSX).

## Acceptance criteria
1. Tài liệu PDF/PNG/JPG/WEBP ở `/materials` và modal buổi học (gắn trực tiếp + từ giáo trình) có nút «Xem trước <tiêu đề>»; bấm mở modal hiển thị nội dung.
2. DOCX/PPTX/XLSX, liên kết, audio/video không có nút «Xem trước»; hành vi cũ («Tải xuống», «Phát», «Mở») giữ nguyên.
3. Lỗi tải file hiển thị thông báo trong modal kèm đường tải xuống; blob URL được revoke khi đóng.
4. Màn import đề (`SourceDocumentViewer`) không đổi hành vi.
5. Gate: `pnpm exec biome check .`, `pnpm check-types`, test vitest liên quan pass.

## Phase
1. TDD: test `materialPreviewKind`, test nút «Xem trước» ở material-item / session modal / materials page, test modal (loading/lỗi/ảnh).
2. Tách viewer dùng chung; thêm repo `fetchMaterialFileBlobUrl`; thêm preview modal + action.
3. Gate + review.

## Rủi ro
- PDF lớn tải toàn bộ vào bộ nhớ (giới hạn upload hiện có của ngân hàng vẫn áp dụng). Rollback: revert PR, không có migration.

## Ghi chú triển khai
- CSP production của web thêm `blob:` vào `connect-src`: pdfjs nạp blob URL bằng fetch, thiếu `blob:` thì PDF xem trước (và viewer màn import đề) ra khung trắng. Localhost/E2E bỏ CSP nên chỉ test unit `security-headers.test.ts` bảo vệ điều này.
- E2E lẻ: `apps/e2e/specs/material-preview.spec.ts`.
