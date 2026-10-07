---
phase: 3
title: "Web giáo viên: bôi đen để highlight, danh sách ghi chú"
status: pending
priority: P2
effort: "5h"
dependencies: [1, 2]
---

# Phase 3: Web giáo viên — bôi đen để highlight, danh sách ghi chú

## Goal

Trên trang `/grading/$attemptId` của bài Writing, giáo viên bôi đen từ/cụm từ để tạo highlight kèm ghi chú, xem/sửa/xoá ghi chú trong danh sách dưới essay. Mỗi thao tác lưu ngay.

Đọc `DESIGN.md` và `REVIEW.md` trước khi làm UI.

## Files to Create / Modify

- Create: `packages/ui/src/components/quiz/essay-with-highlights.tsx` (hiển thị dùng chung, Phase 4 dùng lại)
- Create: `apps/web/src/components/grading/annotatable-essay.tsx` (bôi đen + popover + danh sách)
- Create: `apps/web/src/components/grading/annotatable-essay.test.tsx`
- Create: `apps/web/src/components/ui/essay-with-highlights.test.tsx` (test component dùng chung — `packages/ui` không có script test; precedent `rich-text-body.test.tsx` ở cùng thư mục)
- Modify: `apps/web/src/components/grading/submission-view.tsx`
- Modify: `apps/web/src/components/grading/submission-view.test.tsx`
- Modify: `apps/web/src/lib/repos/grading.ts`
- Modify: `apps/web/src/routes/_auth/grading/$attemptId.tsx`

## Tasks & Steps

### 3.1 `EssayWithHighlights` (packages/ui)

```tsx
export function EssayWithHighlights(props: {
	essay: string;
	annotations: ReadonlyArray<EssayAnnotation>;
	activeId?: string | null;
	/** Web truyền vào để highlight focus/bấm được; student bỏ trống. */
	markProps?(annotation: EssayAnnotation, n: number): React.HTMLAttributes<HTMLElement>;
	className?: string;
	ref?: React.Ref<HTMLDivElement>;
	"data-testid"?: string;
})
```
- Gọi `segmentEssay(essay, annotations)` (Phase 1).
- Đoạn thường: `<span data-start={seg.start}>{seg.text}</span>`. Đoạn highlight: `<mark data-start={seg.start} data-n={n} data-annotation-id={id} {...markProps?.(a, n)}>{seg.text}</mark>`. **Mỗi phần tử chứa đúng một text node**, không có phần tử con, để Phase 3.3 ánh xạ offset được.
- Số thứ tự vẽ bằng pseudo-element: class `after:content-[attr(data-n)] after:ml-0.5 after:align-super after:font-mono after:text-[10px] after:text-meta`. Pseudo-element không nằm trong DOM text nên không chọn được và không làm lệch offset.
- Style mark: `rounded-sm bg-warn-soft px-0.5 text-fg` (utility `bg-warn-soft` có sẵn qua `--color-warn-soft` ở `globals.css:156`). `activeId` khớp thì thêm `ring-1 ring-fg` — `DESIGN.md` quy định selection dùng mực đen, không thêm màu nhấn thứ hai. Không đổi font, không gạch chân màu mới.
- Container: `whitespace-pre-wrap` + class do caller truyền, giữ nguyên style khối essay hiện tại ở mỗi app.
- JSDoc: plain text qua JSX text node, không dangerouslySetInnerHTML.

### 3.2 Repo `apps/web/src/lib/repos/grading.ts`

Thêm 3 hàm cùng pattern `saveGrade` (`credentials: "include"`, `HttpError` khi `!res.ok`, parse bằng zod):
- `createAnnotation(attemptId, input: EssayAnnotationCreate)` → POST, parse `essayAnnotationSchema`.
- `updateAnnotation(attemptId, annotationId, input: EssayAnnotationPatch)` → PATCH với header `Content-Type: application/json`, parse `essayAnnotationSchema`.
- `deleteAnnotation(attemptId, annotationId)` → DELETE, không parse body.
`encodeURIComponent` cho cả 2 id.

### 3.3 `AnnotatableEssay` (apps/web)

Props:
```ts
{
	essay: string;
	annotations: EssayAnnotation[];
	pending: boolean;
	error: string | null;
	onCreate(input: EssayAnnotationCreate): Promise<unknown>;
	onUpdate(id: string, note: string): Promise<unknown>;
	onDelete(id: string): Promise<unknown>;
}
```

**a) Ánh xạ vùng chọn → offset.** Hàm nội bộ `offsetOf(container, node, offset): number | null`:
- `node` là text node: lấy `parentElement.closest("[data-start]")`, phải nằm trong `container`; kết quả `Number(dataset.start) + offset`.
- `node` là element (biên chọn ở mức phần tử): nếu là `container` thì lấy child thứ `offset` (hoặc `essay.length` khi `offset === childNodes.length`) và đọc `data-start`; nếu là phần tử đoạn thì `offset === 0 ? start : start + text.length`.
- Ngoài container → `null`.
`readSelection()`: `window.getSelection()`, bỏ qua khi `isCollapsed` hoặc `rangeCount === 0`; tính `start`, `end` từ `range.startContainer/startOffset` và `endContainer/endOffset`; bất kỳ biên nào `null` → bỏ qua; rồi `snapSpanToWords(essay, start, end)`.

**b) Bắt vùng chọn.** Nghe `pointerup` và `keyup` (Shift+mũi tên khi bật caret browsing) trên container, và `selectionchange` trên `document` (debounce 250ms, chỉ xử lý khi `anchorNode` nằm trong container) để phủ cảm ứng. Kết quả hợp lệ → state `draft = { start, end, rect }` với `rect` = `range.getBoundingClientRect()` quy đổi theo wrapper `relative`.

**c) Popover tạo mới.** Phần tử `role="dialog"` `aria-label="Thêm highlight"`, absolute trong wrapper `relative`, `top = rect.bottom + 8`. Từ `app` trở lên: `left` = `rect.left` kẹp trong `[0, wrapperWidth - 320]`, rộng 320px. Ở `max-app`: `left-0 right-0` (đủ chiều ngang khối essay). Nền `bg-bg`, `border border-line`, `rounded-lg`, `shadow-[var(--elev-raised)]` (precedent `account-blocked-view.tsx:23`), `p-4`. Nội dung:
- Trích đoạn: `“{essay.slice(start, end)}”` cắt 120 ký tự, `text-muted-fg text-sm`.
- `overlapsAny(annotations, start, end)` → hiện `role="alert"` "Đoạn này trùng với highlight khác." và disable nút lưu.
- `Field label="Ghi chú"` + `Textarea id="annotation-note"` `maxLength={QUIZ_ANNOTATION_NOTE_MAX}` placeholder "Tuỳ chọn…", autofocus khi popover mở.
- Nút "Lưu highlight" (primary) + "Huỷ" (ghost). Esc hoặc bấm ra ngoài → huỷ. Lưu thành công → đóng popover, `getSelection().removeAllRanges()`. Lỗi → hiện `error` trong popover, giữ nội dung đã gõ.
- Khi popover đóng, trả focus về container essay (`tabIndex={-1}`).

**d) Highlight tương tác.** `markProps` trả `{ tabIndex: 0, role: "button", "aria-label": \`Highlight ${n}: ${note || "chưa có ghi chú"}\`, onClick, onKeyDown(Enter/Space) }`. Kích hoạt → `setActiveId(id)` và focus + `scrollIntoView({ block: "nearest" })` mục tương ứng trong danh sách. Focus ring theo token `--focus-ring`.

**e) Danh sách ghi chú.** Dưới essay, `SectionLabel` "Ghi chú trên bài viết (n)" và `<ol aria-label="Ghi chú trên bài viết">`. Dùng `orderedAnnotations(essay, annotations)` để số khớp highlight. Mỗi `<li id={\`annotation-${id}\`} tabIndex={-1}>`:
- Số `n` (mono, meta), trích đoạn trong ngoặc kép (cắt 80 ký tự), ghi chú `whitespace-pre-wrap` (rỗng → "Chưa có ghi chú" màu meta).
- Nút "Sửa": chuyển ghi chú thành `Textarea` + "Lưu"/"Huỷ" tại chỗ; Esc huỷ.
- Nút "Xoá": hiện xác nhận tại chỗ "Xoá highlight này?" + "Xoá"/"Huỷ". Tránh `window.confirm`.
- Mục đang active có `ring-1 ring-fg` (cùng quy tắc "list row chọn" trong `DESIGN.md`).
- `aria-label` cho nút: `Sửa ghi chú ${n}`, `Xoá highlight ${n}`.
- Danh sách rỗng: dòng gợi ý "Bôi đen từ hoặc cụm từ trong bài để highlight và ghi chú."

**f) Trạng thái pending.** Khi `pending`, disable mọi nút lưu/xoá để tránh gửi chồng.

### 3.4 `SubmissionView`

- Thêm prop optional `annotation?: Omit<AnnotatableEssayProps, "essay" | "annotations">`.
- Nhánh Writing có essay khác rỗng: nếu có `annotation` thì render `<AnnotatableEssay essay={sub.essay} annotations={sub.annotations ?? []} {...annotation} />`, giữ `data-testid="essay-text"` trên container essay và giữ đúng class khối essay hiện tại; nếu không có thì render `EssayWithHighlights` không tương tác (giữ test cũ).
- Giữ nguyên dòng đếm từ, nhánh Speaking và nhánh bài trống.

### 3.5 Route `$attemptId.tsx`

- Ba `useMutation` (`createAnnotation`, `updateAnnotation`, `deleteAnnotation`). `onSuccess` cập nhật cache `gradingQueryKey(attemptId)` bằng `setQueryData`: thêm (rồi sắp theo `start`), thay theo `id`, lọc bỏ theo `id`. Không invalidate kernel (tag "Đã chấm" không đổi).
- `onError`: 401 → `reauth()` (cùng pattern mutation chấm điểm).
- Gom lỗi thành một chuỗi thân thiện: 409 + code OVERLAP → "Đoạn này trùng với highlight khác."; 400 TOO_MANY → "Đã đạt tối đa 200 highlight."; 404 → "Highlight không còn tồn tại — tải lại trang."; còn lại → "Không lưu được highlight. Thử lại." Để đọc `code` cần body: thêm vào `HttpError` hoặc chỉ dựa `status` (409 ở route này chỉ có thể là OVERLAP hoặc NOT_SUBMITTED; NOT_SUBMITTED không xảy ra vì trang chỉ mở được bài đã nộp). Chọn cách dựa `status`, không đổi `HttpError`.
- `pending = create.isPending || update.isPending || remove.isPending`.
- Truyền `annotation={{ pending, error, onCreate: create.mutateAsync, onUpdate: (id, note) => update.mutateAsync({ id, note }), onDelete: remove.mutateAsync }}` vào `SubmissionView` chỉ khi `data.skill === "writing"`.

### 3.6 Test

`essay-with-highlights.test.tsx`:
- Render essay + 2 annotation → 2 `mark` với `data-n` 1, 2 đúng thứ tự xuất hiện; `container.textContent === essay` (số thứ tự không lọt vào text).
- Essay chứa `<script>` → hiện dạng text.
- Annotation chồng → chỉ 1 `mark`.

`annotatable-essay.test.tsx` (jsdom + Testing Library, pattern `grade-form.test.tsx`):
- Tạo `Range` thật trên text node giữa từ, `getSelection().addRange`, bắn `pointerup` → popover hiện trích đoạn đã bắt dính cả từ.
- Gõ ghi chú, bấm "Lưu highlight" → `onCreate` nhận `{ start, end, note }` đúng offset.
- Vùng chọn chồng highlight có sẵn → alert trùng, nút lưu disable.
- Vùng chọn chỉ có khoảng trắng → không hiện popover.
- Esc đóng popover, không gọi `onCreate`.
- Enter trên `mark` → focus `li` tương ứng.
- Sửa ghi chú → `onUpdate(id, note)`; Xoá + xác nhận → `onDelete(id)`.
- `pending` → nút lưu disable.

`submission-view.test.tsx`: thêm case Writing có `annotations` + `annotation` props → có `mark`; case Speaking không có công cụ highlight.

### 3.7 Verify UI

- `pnpm dev` stack local (port 8000/8001/8003). Mở `/grading/<attempt writing>`.
- 3 viewport 1440×900, 768×1024, 375×812: bôi đen, popover không tràn, danh sách đọc được; ở 375 px popover full width.
- Keyboard: Tab qua từng highlight (focus ring thấy rõ), Enter nhảy tới mục danh sách, Tab tới Sửa/Xoá, Esc huỷ.
- Chụp screenshot 3 viewport cho PR.

## Verification

- `pnpm --filter web test` xanh.
- `pnpm check-types`, `pnpm check` xanh.
- Checklist 3.7 đạt.

## Failure Protocol

- jsdom không hỗ trợ `Range.getBoundingClientRect` (trả về 0 hoặc thiếu hàm): stub trong test (`Range.prototype.getBoundingClientRect = () => new DOMRect()`), không đổi code production.
- Offset lệch khi test với essay có `\n`: kiểm lại mỗi phần tử đoạn chỉ có một text node và không có phần tử con; không sửa bằng cách đếm `textContent` của container.
- Tailwind không sinh class `after:content-[attr(data-n)]` (kiểm bằng DevTools): dừng và hỏi user trước khi thêm rule CSS vào `globals.css`. Không đưa số thứ tự vào text DOM, vì sẽ làm lệch offset.
