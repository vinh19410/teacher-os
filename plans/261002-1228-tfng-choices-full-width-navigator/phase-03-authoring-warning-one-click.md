---
phase: 3
title: "Cảnh báo + 1-click gán dạng ở answer-key grid"
status: pending
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 3: Cảnh báo + 1-click gán dạng ở answer-key grid

## Goal
Giáo viên thấy ngay khi câu có đáp án TRUE/FALSE/NOT GIVEN (hoặc YES/NO/NOT GIVEN) đang để "Theo dạng đề · Note completion", và sửa dữ liệu bằng một cú bấm. Nhờ vậy đề lưu đúng type theo câu, không phụ thuộc vào suy luận.

## Bối cảnh
- `apps/web/src/components/assignments/answer-key-grid.tsx`: mỗi hàng có Select "Dạng bài câu N" (`:315`). Giá trị `""` nghĩa là theo dạng đề. `changeRowType` (`:150`) reset `answer`/`opts` theo kind mới, nên **không dùng lại được** cho nút 1-click vì sẽ làm mất đáp án.
- `rowTypeOf(item) = item.type ?? typeId` (`:120`). Hàng text-kind hiện input text thay vì chip.
- `onItemsChange(items)` là đường ghi duy nhất.

## Files
- Modify: `apps/web/src/components/assignments/answer-key-grid.tsx`
- Modify: `apps/web/src/components/assignments/answer-key-grid.test.tsx`

## Steps
1. Test trước (red) trong `answer-key-grid.test.tsx`, dùng typeId `note` và items là 4 câu markerless có đáp án FALSE/TRUE/NOT GIVEN/FALSE cộng 1 câu `____`:
   - Render cảnh báo (role `status` hoặc `note`) cho đúng một run "Câu 1–4". Không có cảnh báo cho câu 5.
   - Bấm nút "Đặt dạng True / False / Not Given cho câu 1–4" thì `onItemsChange` nhận items có `type: "tfng"` cho index 0–3, `answer` giữ nguyên, câu 5 không đổi.
   - Items đã có `type: "tfng"` thì không có cảnh báo.
   - Part mà catalog không có `tfng`/`ynng` thì không có cảnh báo/nút.
   - Kích hoạt nút bằng bàn phím (Enter/Space khi focus nút) không thêm câu mới.
2. Implement:
   - `const inferred = inferQuestionTypes(items, typeId)`. Câu `i` bị suy luận khi `!items[i].type && inferred[i] !== typeId`.
   - Gom các index bị suy luận liên tiếp thành run. Mỗi run render một khối cảnh báo (đặt trên hàng đầu của run) với text: "Câu X–Y có đáp án dạng TRUE / FALSE / NOT GIVEN nhưng đang theo dạng đề {label}. Học viên sẽ thấy lựa chọn T/F/NG; nên gán dạng cho đúng." Label lấy từ `typeCatalog`/`quizTypeDisplay`.
   - Nút: `onItemsChange(items.map((it, i) => runIdx.has(i) ? { ...it, type: inferred[i] } : it))`. Chỉ đổi `type`, giữ stem/answer/alts/pin.
   - Số câu hiển thị trong cảnh báo/nút dùng `qStart + i` như các hàng khác.
   - Chỉ render cảnh báo kèm nút khi type suy luận nằm trong `typeCatalog` của part hiện tại (`ynng` chỉ có ở một số part, listening không có `tfng`/`ynng`); server trả 400 `invalid question type` với type ngoài catalog (`apps/server/src/routes/assignments/index.ts:171`). Part không có type đó thì không hiện nút.
   - Đặt khối cảnh báo + nút làm sibling đứng TRƯỚC fieldset của hàng đầu run, không lồng trong fieldset, vì handler Enter của fieldset gọi `preventDefault` rồi thêm câu mới (`answer-key-grid.tsx:185`, `:274`).
3. Style theo token có sẵn của grid (warning soft). Không thêm thư viện.

## Verify
- `pnpm --filter web test answer-key-grid` xanh.
- Thủ công: mở soạn đề "Wooden buildings", thấy cảnh báo trên câu 1–4. Bấm nút, thấy chip T/F/NG đã chọn đúng đáp án. Lưu, rồi reload để xác nhận `type` đã persist.

## Risk / Rollback
Thay đổi chỉ ở UI soạn, không chặn lưu. Rollback bằng cách revert component.
