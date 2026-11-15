# Plan #726 — Ẩn hiển thị level CEFR của câu hỏi trên bài kiểm tra đầu vào (`/kiem-tra-dau-vao/`)

- **Issue:** [#726](https://github.com/vinh19410/teacher-os/issues/726)
- **Nhánh:** `vinh19410/Xóa-bỏ-phần-level-của-câu-hỏi` → PR vào `develop` (`--beta --merge`)

## Mục tiêu

Ẩn toàn bộ phần hiển thị level CEFR của câu hỏi, đoạn nghe và nhiệm vụ nói trong lúc thí sinh làm bài kiểm tra đầu vào tại `/kiem-tra-dau-vao/` (`apps/profile`), bao gồm tự động lược bỏ nhãn CEFR trong ngoặc trên tiêu đề đoạn nghe/bài đọc, đồng thời giữ nguyên khối `"Phân tích theo từng cấp độ câu hỏi"` trên màn Kết quả tạm tính và toàn bộ chức năng phía giáo viên (`apps/web`, `packages/api`).

## Danh sách file sửa

- `apps/profile/public/kiem-tra-dau-vao/grading.js` — thêm `stripInlineCefrLabel(rawTitle)`
- `apps/profile/public/kiem-tra-dau-vao/test.js` — gỡ 4 vị trí render `.question-level-pill`, không render `.clip-badges` rỗng khi thiếu `partLabel`, dùng `stripInlineCefrLabel` cho tiêu đề đoạn nghe/phiếu ghi chú/bài đọc
- `apps/profile/public/kiem-tra-dau-vao/test.css` — xóa rule `.question-level-pill`
- `apps/profile/tests/placement-test.test.mjs` — bổ sung bất biến không chứa `question-level-pill` và unit test cho `stripInlineCefrLabel`
- `apps/e2e/specs/profile-placement-test.spec.ts` — xác nhận `0` `.question-level-pill` trên 4 phần có câu hỏi/task, xác nhận `.clip-badges` không render rỗng và tiêu đề đoạn nghe lọc `(A2)` đúng trên legacy v1, giữ nguyên `.level-breakdown-section` ở màn Kết quả, chụp ảnh 3 viewport

## Tiêu chí nghiệm thu

1. Không còn phần tử hay class `.question-level-pill` trong `apps/profile/public/kiem-tra-dau-vao/test.js` và `test.css`; thẻ `.clip-badges` không render rỗng khi thiếu `partLabel`.
2. `stripInlineCefrLabel` lọc sạch nhãn CEFR dạng ngoặc (`(Pre-A1)`..`(C2)`, `(A2+)`, `(A1–A2)`, `[B1–B2]`, `(Level A2)`) trên tiêu đề và pass unit test trong `apps/profile/tests/placement-test.test.mjs`.
3. Màn Kết quả tạm tính vẫn hiển thị `.level-breakdown-section`; giao diện/API giáo viên (`apps/web`, `packages/api`) giữ nguyên.
4. Pass xanh `pnpm check`, `pnpm check-types`, `pnpm --filter profile test`, `pnpm test`, và E2E lẻ `specs/profile-placement-test.spec.ts` với ảnh POT 3 viewport (`1440×900`, `768×1024`, `375×812`) tại `plans/reports/`.
5. PR vào `develop` sạch review cô lập, merge thành công, CI + Deploy Staging xanh, Issue chuyển sang `shipped` kèm comment POT.
