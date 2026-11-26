---
phase: 2
title: "Phase 2: AnnotatableReadingPassage UI & QuizReadingSplitLayout Integration"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: AnnotatableReadingPassage UI & QuizReadingSplitLayout Integration

## Goal

Xây dựng theo TDD component `AnnotatableReadingPassage` (floating selection bar, right-click context menu, note popover, collapsible notes panel, xác nhận xoá tất cả, chế độ edit & readonly, hỗ trợ mobile touch + modal focus-trap + 3 scroll containers) và tích hợp sạch vào `QuizReadingSplitLayout` qua prop tuỳ chọn `annotations` mà không phá vỡ bất kỳ test/invariant nào hiện có.

## Files to Create / Modify

- Create: `packages/ui/src/components/quiz/annotatable-reading-passage.tsx`
- Create: `packages/ui/src/components/quiz/annotatable-reading-passage.test.tsx`
- Create: `packages/ui/src/components/quiz/quiz-reading-layout.ssr.test.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-reading-layout.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-reading-layout.test.tsx`

## Tasks & Steps

### Task 2.1 — Write failing TDD component & real-Node SSR tests (Red Phase)
<!-- Updated: Red-Team RT-1..RT-8, RT-10, RT-13 - RichText classes, modal-aware portal, pointercancel, insideAnchor, collapsed check, real node SSR test -->
- **Goal**: Viết đầy đủ unit/jsdom tests cho mọi tương tác người dùng và 1 file test SSR chạy thật trên môi trường `node` trước khi triển khai UI.
- **Target files and symbols**:
  - Create: `packages/ui/src/components/quiz/annotatable-reading-passage.test.tsx`
  - Create: `packages/ui/src/components/quiz/quiz-reading-layout.ssr.test.tsx` (`// @vitest-environment node`)
  - Modify: `packages/ui/src/components/quiz/quiz-reading-layout.test.tsx`
- **Steps**:
  1. Tạo `packages/ui/src/components/quiz/annotatable-reading-passage.test.tsx` (jsdom, `@testing-library/react`) kiểm thử:
     - Render rich HTML (`<p>An là <strong>học sinh</strong> giỏi.</p><blockquote>Trích dẫn</blockquote><table><tbody><tr><td>Ô 1</td></tr></tbody></table><a href="https://example.com">Nguồn</a><a href="javascript:alert(1)">Bad</a>`) áp dụng đúng `RICH_TEXT_CONTENT_CLASSES`, bọc `<table>` trong `overflow-x-auto`, hạ cấp `<a href="javascript:...">` thành `<span>`; với plain text passage áp dụng `whitespace-pre-line`.
     - Bôi đen chọn chữ (kể cả xuyên `<strong>` và xuyên `<p>`) → thả chuột (`pointerdown` với `button: 0` → `pointerup`) → hiện floating selection toolbar (`role="toolbar"`) với nút `Tô sáng` và `Ghi chú`.
     - Mobile touch `pointercancel`: `pointerdown` → `pointercancel` → `selectionchange` (sau debounce) VẪN mở floating toolbar (không bị kẹt `draggingRef`).
     - Chuột phải (`pointerdown` `button: 2` + `contextmenu`) trên vùng đang chọn → mở duy nhất Context Menu (`role="menu"`), không mở chồng Floating Toolbar khi `pointerup` bắn; right-click trực tiếp trên `<mark>` → hiện `Thêm ghi chú`/`Sửa ghi chú` và `Bỏ tô sáng`.
     - Bấm `Tô sáng` → gọi `onChange` với span đúng offset; render `<mark data-highlight-id="...">` có class `reading-hl`; vùng chọn được xoá sạch và toolbar đóng.
     - Kéo chọn bên trong `<mark>` (selection không collapsed) → click trên `<mark>` KHÔNG mở Note Popover mà để Floating Toolbar hiện với `Bỏ tô sáng`; click thông thường (selection collapsed) hoặc `Enter`/`Space` lên `<mark>` hay icon ghi chú → mở Note Popover.
     - Highlight/ghi chú nằm trong `<a href="https://example.com">`: không lồng `<button>` bên trong `<a>` (nút/trigger gọi `preventDefault()` & `stopPropagation()` không kích hoạt điều hướng thẻ `<a>`).
     - Bấm `Ghi chú` → mở Note Popover (`role="dialog"`) với trích đoạn, textarea (`maxLength={1000}`), nút `Lưu ghi chú` và `Huỷ`; lưu xong gọi `onChange`; icon `<StickyNote>` (`data-reading-ui="true"`) **KHÔNG chứa bất kỳ text node nào** bên trong passage content; trường hợp chọn vắt qua ≥ 2 highlight đã có ghi chú hiện thông báo cảnh báo inline (`role="alert"`) thay vì âm thầm làm rơi dữ liệu.
     - Outside-click (`document` `pointerdown` ngoài passage & portal) đóng Floating Toolbar / Context Menu / Note Popover.
     - `Escape` guard: khi popover/menu đang mở, `Escape` đóng nó và chặn sự kiện lan tới document bubble listener (bảo vệ `TestPreviewOverlay`), NHƯNG nếu trên DOM có `[role="alertdialog"][aria-modal="true"]` đang mở thì KHÔNG cướp `Escape` của `QuizDialog`.
     - Portal target: khi render bên trong một `<div role="dialog" aria-modal="true">`, portal nằm bên trong dialog đó (bảo toàn focus trap `TestPreviewOverlay`).
     - Đổi prop `passage` hoặc `mode` tự reset mọi popover/menu/confirmClearAll đang mở.
     - Scroll filtering: sự kiện `scroll` trên phần tử KHÔNG phải tổ tiên của `passageRef` (ví dụ pane câu hỏi anh em hay `<textarea>`) KHÔNG đóng Note Popover; sự kiện `scroll` trên tổ tiên của `passageRef` đóng Floating Toolbar/Context Menu nhưng giữ nguyên Note Popover đang nhập dở.
     - Collapsible Notes Panel: mặc định đóng; nút `"Ghi chú"` có badge đếm mang `aria-hidden="true"` (accessible name chỉ là `"Ghi chú"`); bấm mở hiện danh sách; bấm mục tìm `<mark>` bằng so sánh `dataset.highlightId` (an toàn cả với ID đặc biệt) rồi gọi `scrollIntoView` & `focus()`.
     - Nút `"Xoá tất cả"`: ẩn khi danh sách rỗng; hiện khi có ≥ 1 mục; bấm hiện xác nhận inline (`Xoá tất cả?` + `Xoá` / `Huỷ`), chỉ gọi `onChange([])` sau khi xác nhận.
     - Chế độ `mode="readonly"`: render `<mark>`, icon ghi chú, Note Popover chỉ đọc, và Notes Panel chỉ đọc; KHÔNG mở toolbar, context menu tạo mới, hay nút `"Xoá tất cả"`.
  2. Tạo `packages/ui/src/components/quiz/quiz-reading-layout.ssr.test.tsx` với dòng 1 là `// @vitest-environment node`:
     - Verify `typeof document === "undefined"` và `typeof DOMParser === "undefined"`, rồi gọi `renderToStaticMarkup` cho `<QuizReadingSplitLayout annotations={{ mode: "edit", items: [...] }} ...>` xác nhận không crash, vẫn giữ `aria-label="Bài đọc"`, nhãn `"Bài đọc"`, nội dung passage, và không có `overflow-y-auto` trần.
  3. Mở rộng `packages/ui/src/components/quiz/quiz-reading-layout.test.tsx`:
     - Giữ nguyên 6 test hiện có (không sửa bất kỳ assertion cũ nào).
     - Thêm test truyền prop `annotations` (edit / readonly): vẫn giữ `aria-label="Bài đọc"`, `data-testid="reading-passage-pane"`, không có class `overflow-y-auto` trần (không prefix `lg:`), navigator vẫn là anh em của grid.
- **Success criteria**: Các test mới biên dịch/chạy và fail ở bước Red vì `AnnotatableReadingPassage` và prop `annotations` chưa tồn tại.
- **Verify**: `pnpm --filter @teacher-os/ui test src/components/quiz/annotatable-reading-passage.test.tsx` exits non-zero (module not found / failing tests; passing test is a failure).

### Task 2.2 — Implement `AnnotatableReadingPassage` component (Green Phase)
<!-- Updated: Red-Team RT-1..RT-8, RT-10 -->
- **Goal**: Triển khai `packages/ui/src/components/quiz/annotatable-reading-passage.tsx` đáp ứng toàn bộ yêu cầu UX IELTS CBT, bảo mật, a11y, mobile/touch, focus trap và DOM invariant.
- **Target files and symbols**:
  - Create: `packages/ui/src/components/quiz/annotatable-reading-passage.tsx` (`AnnotatableReadingPassage`, `ReadingAnnotationConfig`, `ReadingAnnotationMode`)
- **Steps**:
  1. Định nghĩa và export type:
     ```ts
     export type ReadingAnnotationMode = "edit" | "readonly";
     export interface ReadingAnnotationConfig {
       mode: ReadingAnnotationMode;
       items: readonly ReadingAnnotation[];
       onChange?: (next: ReadingAnnotation[]) => void;
     }
     ```
  2. Xây dựng React AST renderer trong `AnnotatableReadingPassage`:
     - Nếu `typeof document === "undefined" || typeof DOMParser === "undefined"` (SSR/Node thật): render hàng header `"Bài đọc"` (kèm nút `"Ghi chú"` tĩnh nếu có items) + `<RichTextBody text={passage} className="mt-2 text-sm leading-[1.85]" />`.
     - Memoize `model = useMemo(() => buildPassageModel(passage), [passage])` và `normalized = useMemo(() => normalizeReadingAnnotations(items, model.canonicalText.length), [items, model.canonicalText.length])`.
     - Tính `lastSegmentEndById: Map<string, number>` (dùng `new Map()`, KHÔNG dùng plain object) cho các highlight có `note.trim() !== ""`.
     - Container nội dung bài đọc (`ref={passageRef}`) gắn `cn("mt-2 text-sm leading-[1.85]", model.isHtml ? RICH_TEXT_CONTENT_CLASSES : "whitespace-pre-line")`.
     - Render từng `PassageElementNode`:
       - Thẻ `table`: bọc bằng `<div className="my-2 max-w-full overflow-x-auto"><table>...</table></div>` (tránh vỡ ngang 375px/320px).
       - Thẻ `a`: nếu không có `node.attrs?.href` thì hạ cấp render `<span>...</span>`; nếu có `href` thì render `<a href={...} target="_blank" rel="noopener noreferrer">` và truyền cờ `insideAnchor = true` xuống cây con.
       - Ở mỗi `PassageTextLeaf`, gọi `splitLeafByAnnotations`:
         - Mảnh highlight: render `<mark data-highlight-id={h.id} data-has-note={hasNote ? "true" : undefined} tabIndex={0} role="button" aria-label={...} className="reading-hl cursor-pointer focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ...">` với `onClick` kiểm tra `const sel = window.getSelection(); if (sel && !sel.isCollapsed) return;`, gọi `e.preventDefault(); e.stopPropagation();` trước khi mở Note Popover.
         - Nếu `slice.isLastSegment && hasNote`:
           - Khi `!insideAnchor`: render `<button type="button" data-reading-ui="true" data-note-trigger={h.id} aria-label={...} className="ml-0.5 inline-flex size-4 select-none items-center justify-center rounded-sm align-middle text-warn hover:bg-accent focus-visible:shadow-[var(--focus-ring)]" onClick={...}><StickyNote aria-hidden="true" className="size-3" /></button>` (CHỈ chứa `<svg>`, KHÔNG có text node).
           - Khi `insideAnchor`: render `<span role="button" tabIndex={0} data-reading-ui="true" data-note-trigger={h.id} aria-label={...} className="ml-0.5 inline-flex size-4 cursor-pointer select-none items-center justify-center rounded-sm align-middle text-warn hover:bg-accent focus-visible:shadow-[var(--focus-ring)]" onClick={...} onKeyDown={...}><StickyNote aria-hidden="true" className="size-3" /></span>` (không lồng `<button>` trong `<a>`, gọi `e.preventDefault(); e.stopPropagation();`).
  3. Unified Overlay State & Selection/Gesture Listeners:
     - Dùng một discriminated-union state duy nhất cho lớp nổi:
       `type ActiveOverlay = null | { kind: "toolbar"; start: number; end: number; top: number; left: number; below: boolean; overlaps: boolean } | { kind: "contextMenu"; x: number; y: number; start?: number; end?: number; highlightId?: string; overlaps: boolean } | { kind: "notePopover"; start: number; end: number; highlightId?: string; top: number; left: number; triggerEl?: HTMLElement | null }`.
     - Reset toàn bộ `overlay = null` và `confirmClearAll = false` trong `useEffect` mỗi khi `passage` hoặc `mode` thay đổi.
     - Listeners (chỉ kích hoạt selection creation khi `mode === "edit"`):
       - `pointerdown` trên `passageRef`: CHỈ khi `e.button === 0` thì đặt `draggingRef.current = true`; đóng toolbar/contextMenu đang mở.
       - `window.pointerup` VÀ `window.pointercancel`: luôn reset `draggingRef.current = false`; riêng `pointerup` nếu trước đó đang kéo (`wasDragging`) thì gọi `readSelectionAndOpenToolbar()`.
       - `keyup` trên `passageRef`: đọc selection cho `Shift+Arrow`.
       - `document.selectionchange` (debounce 250ms, bỏ qua khi `draggingRef.current === true` hoặc khi đang mở `contextMenu` / `notePopover`): mở/cập nhật toolbar cho mobile touch handle; huỷ debounce timer ngay khi mở `contextMenu` hoặc `notePopover`.
       - `onContextMenu` trên `passageRef`: huỷ debounce timer, `draggingRef.current = false`; nếu có selection hợp lệ trong `passageRef`, gọi `e.preventDefault()` và mở `contextMenu` tại `(e.clientX, e.clientY)`; nếu không có selection nhưng `e.target` nằm trong `<mark data-highlight-id>`, gọi `e.preventDefault()` và mở `contextMenu` cho highlight đó.
  4. Portal UI, Outside-click, Focus Trap, Escape & Scroll Handling:
     - Xác định portal container động: `const portalRoot = passageRef.current?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? document.body;` và lớp z-index: `portalRoot === document.body ? "z-40" : "z-20"` (nổi trên `QuizRuntimeHeader` `z-30`, nằm dưới `QuizDialog` `z-50`, và nằm gọn trong focus-trap `containerRef` của `TestPreviewOverlay`).
     - Outside-click listener trên `document` (`pointerdown`): nếu target nằm ngoài `passageRef` và ngoài `portalOverlayRef`, đóng `overlay` hiện tại (đảm bảo bấm `"Nộp bài"` hay ô câu hỏi luôn đóng toolbar/popover trước).
     - Capture-phase `Escape` listener trên `window`: khi `overlay !== null`, nếu `document.querySelector('[role="alertdialog"][aria-modal="true"]')` đang tồn tại thì bỏ qua (không cướp `Escape` của `QuizDialog`); ngược lại gọi `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();`, đóng `overlay` và trả focus về `triggerEl` (nếu còn connected).
     - Capture-phase `scroll` listener trên `window` (`{ capture: true, passive: true }`): chỉ phản ứng khi `e.target` là tổ tiên cuộn của `passageRef` (`e.target === window || e.target === document || (e.target instanceof Node && passageRef.current ? e.target.contains(passageRef.current) : false)`); khi đó chỉ đóng `toolbar` và `contextMenu` (GIỮ `notePopover` đang mở để không mất ghi chú đang gõ dở!).
     - Vị trí & Viewport Clamping:
       - Dùng `window.visualViewport` (fallback `window.innerWidth`/`window.innerHeight`) để clamp cách lề tối thiểu `8px`, tránh bàn phím ảo che Note Popover trên mobile `< 921px`.
       - Toolbar nút dùng `onPointerDown={(e) => e.preventDefault()}` để bấm không làm mất selection, đồng thời hành động đọc trực tiếp snapshot `{ start, end }` lưu trong state.
       - Note Popover (`role="dialog"`, `aria-label="Ghi chú bài đọc"`) giữ focus loop đơn giản (`Tab`/`Shift+Tab` quay vòng trong popover khi mở để không thoát khỏi `TestPreviewOverlay`), xử lý kết quả `upsertNoteSpan`: nếu `reason === "multiple_notes_overlap"` thì hiện thông báo `role="alert"` ngay trong popover và không đóng.
  5. Header controls & Collapsible Notes Panel:
     - Render thanh header chung hàng với nhãn `"Bài đọc"`:
       - Khi `mode === "edit"` hoặc `normalized.length > 0`: nút toggle `"Ghi chú"` (`aria-expanded={panelOpen}`, `aria-controls={panelId}`) kèm badge đếm `<span aria-hidden="true" className="tabular-nums ...">{normalized.length}</span>` (khi > 0).
       - Khi `mode === "edit" && normalized.length > 0`: nút `"Xoá tất cả"` mở xác nhận inline (`Xoá tất cả?` + nút destructive `Xoá` + `Huỷ`).
     - Khi `panelOpen === true`: render danh sách các highlight/ghi chú theo thứ tự trong bài; khi bấm 1 mục, tìm `<mark>` bên trong `passageRef.current` bằng cách duyệt `passageRef.current.querySelectorAll<HTMLElement>("mark[data-highlight-id]")` so sánh `el.dataset.highlightId === item.id` (TUYỆT ĐỐI không nội suy CSS selector), gọi `el.scrollIntoView({ block: "center" })` và `el.focus()`. Panel mặc định đóng (`panelOpen === false`) nên không phát sinh `overflow-y-auto` trần lúc SSR.
- **Success criteria**: Toàn bộ test trong `annotatable-reading-passage.test.tsx` pass; không dùng hex cứng; không tạo text node rác trong `passageRef`.
- **Verify**: `pnpm --filter @teacher-os/ui test src/components/quiz/annotatable-reading-passage.test.tsx` exits 0.

### Task 2.3 — Integrate `AnnotatableReadingPassage` into `QuizReadingSplitLayout`
<!-- Updated: Red-Team RT-6, RT-13 -->
- **Goal**: Kết nối `AnnotatableReadingPassage` vào pane trái của `QuizReadingSplitLayout` qua prop tuỳ chọn `annotations?: ReadingAnnotationConfig` mà giữ 100% tương thích ngược với caller không truyền prop và chạy thật cả SSR test trên Node.
- **Target files and symbols**:
  - Modify: `packages/ui/src/components/quiz/quiz-reading-layout.tsx` (`QuizReadingSplitLayout`)
  - Verify: `packages/ui/src/components/quiz/quiz-reading-layout.test.tsx`, `packages/ui/src/components/quiz/quiz-reading-layout.ssr.test.tsx`
- **Steps**:
  1. Thêm prop tuỳ chọn `annotations?: ReadingAnnotationConfig` vào `QuizReadingSplitLayout` trong `packages/ui/src/components/quiz/quiz-reading-layout.tsx`.
  2. Khi `annotations` không được truyền: giữ nguyên y hệt nhánh render `<p>Bài đọc</p>` + `<RichTextBody text={passage} className="mt-2 text-sm leading-[1.85]" />`.
  3. Khi `annotations` được truyền: render `<AnnotatableReadingPassage passage={passage} annotations={annotations} />` bên trong `<section aria-label="Bài đọc" data-testid="reading-passage-pane" ...>`.
  4. Re-export `type ReadingAnnotationConfig` nếu thuận tiện cho apps.
- **Success criteria**: Tất cả test trong `quiz-reading-layout.test.tsx` (6 test cũ + test mới), `quiz-reading-layout.ssr.test.tsx` (chạy trên `node`), và `annotatable-reading-passage.test.tsx` pass; `packages/ui` typecheck và biome sạch.
- **Verify**: `pnpm --filter @teacher-os/ui test && pnpm --filter @teacher-os/ui check-types && pnpm exec biome check packages/ui/src/` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
