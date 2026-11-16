# Plan #734 — Tinh gọn màn kết quả sau nộp bài kiểm tra đầu vào (`/kiem-tra-dau-vao/`)

- **Issue:** [#734](https://github.com/vinh19410/teacher-os/issues/734)
- **Nhánh:** `vinh19410/Sửa-page-result-entry-test` → PR vào `develop` (`--beta --merge`)
- **Trạng thái:** `completed`

## Mục tiêu

Tinh gọn màn hình kết quả ngay sau khi học viên nộp bài kiểm tra đầu vào tại `/kiem-tra-dau-vao/` (`apps/profile`) để chỉ hiển thị số câu đúng phần **Listening** và **Reading** kèm thông báo chờ kết quả chấm **Writing & Speaking** qua email đã đăng ký (`state.lead.email`), đồng thời gỡ bỏ hoàn toàn khối `"Phân tích theo từng cấp độ câu hỏi"`, bảng tham khảo khung CEFR (`#cefrExplorerBox`) và các ô điểm phần trăm / trung bình tạm tính.

## Danh sách file sửa

- `apps/profile/public/kiem-tra-dau-vao/test.js` — thu gọn `renderResultStep()` còn 2 thẻ `Listening` & `Reading` (`X/Y câu đúng`, không hiện `%`), hiển thị hộp thông báo chờ chấm Writing & Speaking qua email đã đăng ký (`state.lead.email`), đồng bộ câu giới thiệu trong `renderIntroStep()` và phản hồi đăng ký tư vấn, giữ nguyên hàng 3 nút CTA và `#speakingUploadRetryBox`, gỡ `.provisional-hero-grid`, `.level-breakdown-section`, `CEFR_ORDER`, `CEFR_EXPLORER_DATA`, `createCefrExplorer` và import thừa `resolveSpeakingStatusDisplay`.
- `apps/profile/public/kiem-tra-dau-vao/test.css` — đổi `.result-skills-grid` sang lưới 2 cột cân đối trên desktop/tablet (1 cột trên mobile), thêm `overflow-wrap: anywhere` cho `.teacher-grading-callout`, dọn toàn bộ CSS selector mồ côi của hero tạm tính, level breakdown và CEFR explorer.
- `apps/profile/tests/placement-test.test.mjs` — cập nhật bất biến file tĩnh cho màn kết quả mới và danh sách `forbiddenToken` (không còn `"Phân tích theo từng cấp độ câu hỏi"`, `createCefrExplorer`, `cefrExplorerBox`, `level-breakdown-section`, `provisional-hero-grid`, `objective-average-pct`).
- `apps/profile/tests/index.test.mjs` — cập nhật kiểm tra bất biến không còn `createCefrExplorer`, `CEFR_EXPLORER_DATA`, `cefrDetailPanel`, `"Phân tích theo từng cấp độ câu hỏi"` trong `test.js`.
- `apps/e2e/specs/profile-placement-test.spec.ts` — cập nhật assertion màn kết quả ở cả luồng nộp đủ 5 kỹ năng lẫn luồng bỏ qua Speaking, kiểm tra `320px` reflow & 3 viewport và chụp ảnh POT `734-entry-test-result-*.png`.
- `CHANGELOG.md` — ghi nhận thay đổi màn kết quả `/kiem-tra-dau-vao/` (`#734`).

## Tiêu chí nghiệm thu (Done means)

1. Sau khi nộp bài tại `/kiem-tra-dau-vao/`, `#testResultCard` chỉ hiển thị 2 thẻ `[data-skill-result="listening"]` và `[data-skill-result="reading"]` dạng `${correct}/${total} câu đúng` (fallback `—` khi `total === 0`, không hiển thị `%`), cùng thông báo chờ kết quả chấm Writing & Speaking gửi qua `state.lead.email`; `renderIntroStep()` và thông báo phản hồi tư vấn đồng bộ sang nhận kết quả qua email.
2. Các khối `.provisional-hero-grid`, `[data-testid="objective-average-pct"]`, `[data-skill-result="vocab-grammar"]`, `[data-skill-result="writing"]`, `[data-skill-result="speaking"]`, `.level-breakdown-section` (`"Phân tích theo từng cấp độ câu hỏi"`) và `#cefrExplorerBox` bị gỡ bỏ khỏi DOM và mã nguồn `apps/profile/public/kiem-tra-dau-vao/`.
3. Hàng 3 nút CTA (`#zaloResultCta`, `#registerWithResultBtn`, `#retryTestBtn`) và hộp khôi phục `#speakingUploadRetryBox` (khi `speakingStatus === "pending_upload"`) hoạt động bình thường; không tràn ngang ở `1440×900`, `768×1024`, `375×812` và `320×568`.
4. `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm --filter profile test` và spec E2E `specs/profile-placement-test.spec.ts` pass xanh; review cô lập không còn lỗi chặn.
5. GitHub Issue `#734` đi đủ vòng đời tới `shipped`, PR vào `develop` được review + merge hoàn tất với CI xanh, và comment POT kèm ảnh chụp 3 viewport (permalink theo commit SHA) được đăng lên `#734`.
