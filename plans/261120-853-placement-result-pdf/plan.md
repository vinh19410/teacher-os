# Plan #853: Đổi mục "Link kết quả cho học viên" thành xuất PDF phiếu kết quả đầu vào

- **Issue:** https://github.com/vinh19410/teacher-os/issues/853
- **Branch:** `vinh19410/feat-placement-result-pdf` → PR vào `develop` (`--merge --beta`)
- **Status:** In Progress

## Mục tiêu & Phạm vi

Thay thế khối **"Link kết quả cho học viên"** trong `apps/web/src/components/leads/placement-submission-panel.tsx` (dùng chung ở `/leads` và `/students/$studentId`) bằng khối **"Phiếu kết quả cho học viên (PDF)"** cho phép giáo viên tải xuống file PDF phiếu kết quả A4 đầy đủ bằng 1 cú bấm.

Giữ nguyên toàn bộ luồng backend (`resultToken`, gửi email tự động) và trang kết quả công khai `apps/profile/public/kiem-tra-dau-vao/ket-qua/`.

## Hợp đồng chia mảnh (Disjoint File Ownership)

### Foundation (Orchestrator)
- `apps/web/src/assets/fonts/BeVietnamPro-{Regular,Bold,Italic,BoldItalic}.ttf` + `OFL.txt`
- `apps/web/package.json` + `pnpm-lock.yaml` (`pdfmake` + `@types/pdfmake`)
- Xác minh glyph, API `pdfmake`, và lazy-load build chunk trên Vite 8.

### Piece A — PDF Model, Renderer & Unit Tests
- **Files:**
  - `apps/web/src/lib/placement-result-pdf-model.ts`
  - `apps/web/src/lib/placement-result-pdf.ts`
  - `apps/web/src/lib/placement-result-pdf.test.ts`
- **Exported Contract:**
  - `export function buildPlacementPdfFilename(studentName: string): string`
  - `export function buildPlacementResultPdfModel(submission: PlacementSubmissionDetail): PlacementResultPdfModel`
  - `export async function generatePlacementResultPdfBytes(submission: PlacementSubmissionDetail): Promise<Uint8Array>`
  - `export async function exportPlacementResultPdf(submission: PlacementSubmissionDetail): Promise<void>`
- **Requirements:**
  - Vector PDF khổ A4, font `Be Vietnam Pro` self-host, lazy-load qua dynamic `import()` (không tăng initial bundle).
  - Nội dung đầy đủ như trang kết quả công khai: header thương hiệu (`Cô Đỗ Thục Mỹ • The English Corner`), thông tin học viên (tên, ngày làm, ngày chấm — không SĐT), tổng quan xếp lớp (CEFR, khóa đề xuất, điểm tổng %), điểm 3 kỹ năng trắc nghiệm (không bảng chi tiết từng câu/đáp án đúng), Writing & Speaking (band IELTS 0–9 + 4 tiêu chí, hoặc fallback legacy `/15`, `/20` + tiêu chí cũ; bài viết/transcript tô màu lỗi + đánh số + chú giải 5 loại lỗi + danh sách thẻ lỗi `đoạn sai → cách sửa` + giải thích), nhận xét của cô, lộ trình theo trình độ, ghi chú thêm (nếu có), footer `Hỗ trợ: Zalo 0929.060.994` + `Trang X / Y`.
  - Hỗ trợ kiểm tra binary PDF thật + trích text bằng `pdfjs-dist` trong unit test.

### Piece B — UI Panel Replacement & Unit Tests
- **Files:**
  - `apps/web/src/components/leads/placement-submission-panel.tsx`
  - `apps/web/src/components/leads/placement-submission-panel.test.tsx`
- **Requirements:**
  - Bỏ hoàn toàn khối `"Link kết quả cho học viên"` (`placement-result-link`, link `resultUrl`, `copy-result-link-btn`, `copiedLink`, `handleCopyLink`, `Link2` import).
  - Hiển thị khối `"Phiếu kết quả cho học viên (PDF)"` (`data-testid="placement-result-pdf"`) khi `submission.gradedAt !== null` (áp dụng cả IELTS và legacy, cả `/leads` lẫn `/students/$studentId`).
  - Nút 1-click **"Tải phiếu kết quả (PDF)"** (`data-testid="export-result-pdf-btn"`) gọi `exportPlacementResultPdf(submission)` (truyền `submission` đã lưu, không truyền draft form chưa lưu), có trạng thái `aria-busy` / disabled khi đang sinh PDF, toast thành công và lỗi.
  - Khi `dirty === true`, hiển thị cảnh báo nhẹ (`data-testid="placement-pdf-dirty-warning"`) nhắc lưu lại nếu muốn phiếu PDF phản ánh chỉnh sửa mới.
  - Giữ dòng `placement-result-email-status`; cập nhật `EMAIL_STATUS_TEXT.failed` và `EMAIL_STATUS_TEXT.skipped` nhắc tải phiếu PDF gửi qua Zalo.
  - Tuân thủ `DESIGN.md` (light/dark, không hex cứng) và `REVIEW.md` (focus ring, responsive 3 viewport).

### Piece C — E2E Spec & Visual Verification
- **Files:**
  - `apps/e2e/specs/placement-ai-grading.spec.ts`
- **Requirements:**
  - Đọc `resultUrl` từ body response `PATCH /api/leads/:id/placement-submission` để vẫn giữ bước kiểm tra trang kết quả công khai ở `apps/profile/kiem-tra-dau-vao/ket-qua/`.
  - Xác nhận panel giáo viên không còn `placement-result-link`, hiển thị `placement-result-pdf` và `placement-result-email-status`.
  - Bấm `export-result-pdf-btn`, bắt sự kiện `download` của Playwright, xác nhận tên file `phieu-ket-qua-*.pdf` và magic bytes `%PDF-` + kích thước > 5KB.
  - Chụp ảnh POT 3 viewport (1440×900, 768×1024, 375×812) light/dark cho khối kết quả PDF.

## Kiểm chứng & Hoàn tất

1. Tích hợp từng nhánh con vào `vinh19410/feat-placement-result-pdf`.
2. Chạy gate tại orchestrator: `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm --filter web build` (xác minh PDF chunk tách riêng), spec E2E `placement-ai-grading.spec.ts` (port 8100–8105), `pnpm design:compare`.
3. Chạy review độc lập trong sub-session mới, sửa mọi finding và re-review đến khi sạch.
4. Commit, push, đăng POT kèm ảnh/kết quả kiểm chứng lên issue #853, mở PR vào `develop`, review PR sạch và merge, cập nhật label `shipped`.
