---
title: "#542 vibe run: select chevron shipped beta"
date: 2026-11-03
summary: "Run tiếp quản dở dang: plan-gate go có điều kiện, review 0C/1I+3M đã sửa, e2e 251 pass lần 2, design:compare 30 ảnh 5 màn hình — ship beta vào develop"
---

# #542 vibe run: select chevron shipped beta

# #542 Vibe run: chevron dropdown `<select>` dính mép phải — ship beta vào develop

**Date**: 2026-11-03 11:00 GMT
**Severity**: Low
**Component**: `packages/ui` web-kit `Select` + 5 select thô (apps/web, apps/student)
**Status**: Ongoing — gates đã xanh, ship beta vào `develop` đang land; lúc 11:00 GMT nhánh `fix/542-select-chevron-padding` chưa push lên origin, chưa có PR

## What Happened

Vibe run `--ship --beta --advice` cho issue #542: chevron native của `<select>` dính sát mép phải. Đây là run tiếp quản — lần trước bỏ dở nhưng để lại plan (`plans/261103-1415-542-select-chevron-padding/plan.md`) và implementation còn hợp lệ trên worktree, nên run này xác minh rồi tiếp quản thay vì viết lại.

Kongming plan-gate trả **go có điều kiện**; cả 4 điều kiện đã vào code/plan: (1) ghi caveat twMerge `px-*`/`p-*` ngay tại primitive, (2) fallback `forced-colors`, (3) `-webkit-appearance`, (4) sync plan theo design cuối. Tiếp đó: code-reviewer fresh-context **0 Critical / 1 Important (bằng chứng design:compare) / 3 Minor** — Important và cả 3 Minor đã sửa trước gate ship; e2e full 251/251 pass ở lần 2; design:compare 30 ảnh / 5 màn hình; ship beta vào `develop`.

## The Brutal Truth

Cái đau không phải bug — một chỗ trống 36px cho cái mũi tên — mà là e2e chết lần 1 không phải vì code: API ngộp nhớ vì chạy song song với vibe run khác, và cả đội phải tự hỏi "diff mình vỡ hay hạ tầng vỡ" trong khi máy đang gánh thêm run. Chạy song song để nhanh, trả giá bằng một lần e2e full chết giả làm regression. Còn `<select>` là replaced element: mọi kỹ thuật `::before/::after` quen thuộc chết im lặng — kiểu bug ai cũng tưởng 5 phút.

## Technical Details

- Primitive `Select` (`packages/ui/src/components/web-kit/field.tsx`) thêm `select-chevron pr-9`; chevron là background-image data-URI lucide chevron-down, `background-position: right 0.75rem center`, size 1rem, đứng trong `@layer components` của `globals.css` để utility caller thắng (#438).
- CSS var không vào được trong `url()` → màu nhúng cứng 2 bản: `%236a6a6a` (xấp xỉ `--muted-foreground` light oklch(0.525)) và `%23a1a1a1` (dark oklch(0.708)) qua `.dark .select-chevron`.
- `forced-colors: active` ẩn background-image → trả lại `appearance: auto` giữ affordance native; `-webkit-appearance: none` cho WebKit.
- twMerge: `px-3` của `inputCls` KHÔNG xoá `pr-9` (thứ tự emit CSS của Tailwind), nhưng caller truyền `px-*`/`p-*` sẽ xoá `pr-9` → chevron đè chữ. Hiện không có callsite nào làm vậy — caveat ghi trong comment tại primitive.
- 5 select thô chuyển sang primitive/class: `#lead-status` (trang leads), invoice-payment-modal, 3 select placement-test (question-card, bands-editor, clip-card); `PracticeSelect` (student) bỏ overlay `ChevronDown` absolute. Bonus: select placement-test qua primitive giờ đúng `h-8 w-auto` (trước đây `h-9 w-full` của `inputCls` thắng cascade).
- Test mới trong `field.test.tsx` ("Select chevron (#542)"): assert `select-chevron`, `pr-9`, caller className và `disabled`/`aria-label` giữ nguyên. CHANGELOG đã cập nhật.

## What We Tried

- e2e full lần 1: API chết — memory pressure khi chạy song song với vibe run khác. Lần 2: 251/251 pass. Không sửa code cho lần fail đầu — đúng flaky hạ tầng, không phải regression.
- design:compare 30 ảnh trên 5 màn hình (assignments, practice, testbuilder, …) làm bằng chứng cho reviewer; bản lưu `plans/reports/542-select-chevron-*.png`.
- Xử lý finding review: 1 Important (chỉ ra qua ảnh design:compare) + 3 Minor.

## Root Cause Analysis

Gốc rễ product: style đè lên select native mà không chừa chỗ cho chevron, và mỗi callsite tự bắc cầu riêng (overlay absolute ở student) thay vì sửa một chỗ ở primitive. Gốc rễ quy trình: e2e full không có hàng rào tài nguyên giữa các run song song — một run ngốn RAM giết e2e của run khác, và tín hiệu fail không phân biệt được bug với ngộp nhớ.

## Lessons Learned

- Style `<select>`: không `::after`, không CSS var trong `url()`; chevron phải là background-image + màu nhúng cứng kèm bản `.dark`, và fallback `appearance: auto` cho `forced-colors` là bắt buộc chứ không phải nice-to-have.
- Khi giữ chỗ bằng utility (`pr-9`) qua twMerge: caveat "caller `px-*`/`p-*` xoá chỗ để" phải ghi tại primitive, không chỉ trong plan — người sau đọc code trước, đọc plan sau.
- e2e fail lần đầu + có run song song: chạy lại sạch trước khi đổ lỗi cho diff, nhưng phải phân loại nguyên nhân (memory pressure vs timeout spec) chứ không retry mù.
- Run dở dang còn plan + diff hợp lệ: xác minh rồi tiếp quản rẻ hơn viết lại.

## Next Steps

- Main: commit → push `fix/542-select-chevron-padding` → PR → merge vào `develop`, theo dõi PR CI (đến 11:00 GMT chưa thấy PR trên origin; issue #542 còn OPEN, label `in progress`).
- Cân nhắc serialize hoặc phân tài nguyên cho e2e khi chạy nhiều vibe run song song — Main quyết định.
- AgentWiki publish skipped — file local là nguồn chân trị.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
