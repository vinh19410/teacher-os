---
title: "Phase 1: Toolbar a11y + H4 + popover link"
status: completed
priority: P2
effort: 0.5d
dependencies: []
---

# Phase 1: Toolbar a11y + H4 + popover link (TDD)

## Goal

Toolbar 16 nút có focus ring tường minh, 1 Tab stop (roving tabindex Base UI), popover chọn link thay `window.prompt`, H4 soạn được — toàn bộ khóa bằng unit test viết TRƯỚC (red) rồi mới sửa component (green).

## Files to Create / Modify

- Modify: `packages/ui/src/components/web-kit/rich-text-editor.tsx` (toolbar → Base UI `Toolbar`, popover link, H4, focus ring, wrapper `has-[.ProseMirror:focus]`)
- Modify: `packages/ui/src/lib/rich-text-content-classes.ts` (thêm `[&_h4]`)
- Modify: `apps/web/src/components/ui/rich-text-editor.test.tsx` (test mới; KHÔNG sửa/xóa test cũ)
- Chỉ đọc: `packages/ui/src/components/theme-toggle.tsx` (precedent focus-visible), `packages/ui/src/lib/rich-text-sanitize.ts` (allowlist đã có h4), `apps/e2e/specs/rich-text-content.spec.ts` (bất biến DOM)

## Tasks & Steps

### Task 1.1 — Unit test keyboard + focus (viết trước, chạy RED)

- Goal: test khóa hành vi toolbar mục tiêu: 1 Tab stop, roving ←/→/Home/End, Undo disabled bị skip, 16 nút đủ nhãn.
- Target: `apps/web/src/components/ui/rich-text-editor.test.tsx` — thêm `describe("toolbar a11y")`.
- Steps:
  1. Render `<RichTextEditor value="<p>x</p>" onChange={vi.fn()} ariaLabel="Editor" />` trong jsdom; lấy toolbar bằng `screen.getByRole("toolbar", { name: "Định dạng văn bản" })`. Mock `ResizeObserver` nếu Base UI cần (pattern `command-search.test.tsx:20-22`).
  2. Roving assert CHÍNH qua `element.focus()` + `assert(document.activeElement)` (không mô phỏng phím mù). Trạng thái 1 (Undo disabled — value chưa đổi): đúng 1 button trong toolbar có `tabIndex` không âm; điều hướng `ArrowRight`/`ArrowLeft`/`Home`/`End` qua `fireEvent.keyDown` → activeElement đúng nút kế/trước/đầu/cuối; Undo disabled bị skip.
  3. Trạng thái 2 (Undo enabled — dispatch `insertContent("x")` vào editor instance để onChange chạy): assert VẪN đúng 1 tab stop và ←/→ không dừng sai chỗ (khóa metadata cập nhật theo `disabled` đổi).
  4. Assert nút đầu có class chứa `focus-visible:shadow-[var(--focus-ring)]`.
- Success criteria: bộ test compile và CHẠY FAIL vì component hiện tại chưa thỏa (15 nút đều tabbable, không có nút H4).
- Verify: `pnpm --filter web test -- rich-text-editor` exits non-zero với assertion failure ở describe mới — FAIL là kết quả ĐÚNG của bước red.

### Task 1.2 — Toolbar sang Base UI + focus ring tường minh

- Goal: `Toolbar.Root` (div `role="toolbar"`, giữ `aria-label="Định dạng văn bản"`) + `Toolbar.Button` cho 15 nút hiện có; ring nút thấy rõ, wrapper không sáng khi focus ở toolbar.
- Target: `packages/ui/src/components/web-kit/rich-text-editor.tsx` — component `RichTextToolbar`.
- Steps:
  1. Import `Toolbar` từ `@base-ui/react/toolbar`. `Toolbar.Root` thay `div role="toolbar"`, giữ class flex/wrap/border + đổi `gap-0.5` → `gap-1`. KHÔNG bọc toolbar trong container mới (e2e neo `xpath=../preceding-sibling::div[@role='toolbar']` — `Toolbar.Root` phải là sibling trực tiếp của `EditorContent`).
  2. Nút → `Toolbar.Button` render `<button>`: giữ `aria-label`, `title`, `aria-pressed`, class `hover:bg-accent`; thêm `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none` (precedent `theme-toggle.tsx:24`). Undo/Redo: `focusableWhenDisabled={false}` + giữ `disabled` attr từ state (test cũ `rich-text-editor.test.tsx:165` phải vẫn xanh).
  3. Wrapper editor (`rich-text-editor.tsx:345`): đổi `focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring` → `has-[.ProseMirror:focus]:ring-[3px] has-[.ProseMirror:focus]:ring-ring/50 has-[.ProseMirror:focus]:border-ring`.
  4. Chạy lại test Task 1.1 → GREEN.
- Success criteria: test keyboard xanh; DOM toolbar vẫn `div role=toolbar` sibling của `EditorContent`.
- Verify: `pnpm --filter web test -- rich-text-editor` exit 0, không test nào bị skip.

### Task 1.3 — H4: test trước rồi thêm nút

- Goal: nút "Đề mục cấp 4" sinh `<h4>`, style editor ≡ render.
- Target: `rich-text-editor.tsx` (`TOOLBAR_BUTTONS`, `ToolbarState`, `StarterKit.configure`), `rich-text-content-classes.ts`, test file.
- Steps:
  1. Test: extend test "emits one allowlisted tag per full-option command" bằng `editor.commands.setHeading({ level: 4 })` → `getHTML()` chứa `<h4>`. Test DOM: toolbar `getAllByRole("button")` length 16, nút "Đề mục cấp 4" nằm NGAY SAU "Đề mục cấp 3" (so sánh index trong mảng). RED trước.
  2. Component: `StarterKit.configure({ heading: { levels: [2, 3, 4] } })`; thêm entry `{ label: "Đề mục cấp 4", icon: Heading4, toggleKey: "isH4", run: toggleHeading({ level: 4 }) }` ngay sau H3; `ToolbarState` thêm `isH4: e.isActive("heading", { level: 4 })`.
  3. `RICH_TEXT_CONTENT_CLASSES` thêm `[&_h4]:font-semibold` (h4 1em, nhỏ hơn h3 1.1em — đúng thang cấp).
  4. GREEN: chạy test.
- Success criteria: `<h4>` qua `sanitizeRichText` nguyên vẹn; 16 nút, H4 ngay sau H3.
- Verify: `pnpm --filter web test -- rich-text-editor` exit 0 (bao gồm assertion DOM 16 nút + thứ tự).

### Task 1.4 — Popover link: test trước rồi thay window.prompt

- Goal: popover `@base-ui/react/popover` controlled-open thay `window.prompt`; scheme allowlist ở đường authoring; giữ toàn bộ hành vi link cũ.
- Target: `rich-text-editor.tsx` — nút "Chèn liên kết" + xóa `promptLinkHref` (`:31-34`); test file.
- Steps:
  1. Mock infra trước (theo precedent `command-search.test.tsx:20-22`): `ResizeObserver`, nếu floating-ui cần thì `DOMRect`/`getBoundingClientRect` stub. Assert trạng thái popover qua `aria-expanded` trên trigger + query portal bằng `screen`/`document.body`, KHÔNG qua vị trí floating.
  2. Viết 8 ca test (RED trước):
     - (a) Selection có text → click "Chèn liên kết" → popover mở (`aria-expanded=true`), input focus (đặt `initialFocus` tường minh) → nhập `https://example.com` → Enter (onKeyDown) → `onChange` chứa `<a href="https://example.com">`, popover đóng.
     - (b) Đang active link → click nút → link GỠ, `aria-expanded` vẫn `false` (popover không mở).
     - (c) Esc trong input → popover đóng, focus về trigger.
     - (d) Selection rỗng → Apply `https://x.dev` → **unit:** doc không đổi (`onChange` không gọi), popover đóng, focus trả về `.ProseMirror` (finalFocus Apply). **e2e:** gõ tiếp text thật (Playwright keyboard) → `<a href="https://x.dev">` bọc text — jsdom không mô phỏng được PM typing (probe: DOM mutation không tạo transaction). Deviation đã adjudicate với kongming (KongmingPopoverVerify).
     - (e) Scheme ngoài allowlist (`javascript:alert(1)`, `data:text/html…`) → Apply → lỗi inline hiện (`aria-describedby` trỏ input), popover còn mở, `onChange` KHÔNG chứa `javascript:`/`data:`. Allowlist: `http:`, `https:`, `mailto:`, `#…`, `/…` (relative).
     - (f) Click-outside đóng popover → focus về trigger (không rơi vào editor).
     - (g) Bọc `RichTextEditor` trong `<form onSubmit={spy}>` thật (mẫu `test-builder-shell.tsx:587`) → Apply bằng Enter → `spy` KHÔNG được gọi (popover không dùng `<form>` — portal bubbles onSubmit lên form trang).
     - (h) Focus input rỗng → gửi `Home` rồi `ArrowRight` → `document.activeElement` vẫn là input (Popup stopPropagation Arrow/Home/End, không bị Toolbar.Root cướp phím). Tab-cycle trap của modal popover **không drive được từ jsdom** → verify ở e2e/Playwright (phase-02) + REVIEW.md keyboard check.
  3. Component: `const [linkOpen, setLinkOpen] = useState(false)` — **controlled**. KHÔNG dùng `onClick` riêng trên trigger: quyết định CHỈ trong `onOpenChange={(next, details) => { if (next && details.reason === "trigger-press" && editor.isActive("link")) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; } setLinkOpen(next); }}` (thứ tự onClick của ta vs handler nội bộ của trigger không đảm bảo). Trigger: `Popover.Trigger render={<Toolbar.Button …/>}` với `aria-haspopup="dialog"`, KHÔNG `aria-pressed` (style pressed giữ class `isLink`). Panel: `Popover.Portal > Popover.Positioner > Popover.Popup` với `modal={true}` + `onKeyDown` stopPropagation cho `["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"]` (giữ Escape); bên trong: `<Popover.Close>` "Hủy" (BẮT BUỘC — focus trapping của `modal` chỉ bật khi có Close, `PopoverRoot.d.ts:49`; KHÔNG dùng `"trap-focus"`), `initialFocus` trỏ input, `<input type="text" inputMode="url" placeholder="https://…" aria-label="Địa chỉ liên kết" aria-describedby={errId} onKeyDown={Enter → preventDefault + apply}>`, nút "Áp dụng" `type="button"`. KHÔNG có `<form>` nào trong popup (portal bubbles submit lên form trang — ca g).
  4. Apply handler: trim → nếu rỗng: ignore; nếu lệch allowlist: `setError(...)` + giữ mở + focus input; nếu hợp lệ: `editor.chain().focus().extendMarkRange("link").setLink({ href }).run()`, đóng popover, giữ value nhập lại. `finalFocus` của Popup trả về `editor.view.dom` khi đóng do Apply (ref `closingViaApplyRef`) — Base UI mặc định trả focus về trigger, làm chết stored mark (bug UX kongming bắt trong KongmingPopoverVerify). Xóa `promptLinkHref`.
  5. `grep -rn "window.prompt" packages/ui apps/web apps/admin` không còn hit rich text.
  6. GREEN + `pnpm check:fix` + `pnpm run check-types`.
- Success criteria: 8 ca test xanh; không còn `window.prompt`; gỡ-link-khi-active giữ nguyên; `javascript:`/`data:` không vào được stored HTML qua popover; Enter trong popover không submit form trang.
- Verify: `pnpm --filter web test -- rich-text-editor` exit 0; `grep -rn "window.prompt" packages/ui/src` rỗng (exit 1).

### Task 1.5 — Suite toàn cục phase

- Goal: không hồi quy ngoài phạm vi unit.
- Verify: `pnpm check` exit 0; `pnpm run check-types` exit 0; `pnpm --filter web test` exit 0; `pnpm --filter admin test` exit 0.

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

## Risk Assessment

- Base UI Toolbar trong jsdom: assert roving qua `focus()` + `document.activeElement` (chính sách chính, Task 1.1); nếu `fireEvent.keyDown` không kích hoạt được composite handler thì vẫn giữ assertion tab-stop/state, bổ sung test keyboard ở tầng e2e/Playwright — không hạ assertion về "không test".
- **[Phase-1 Verification Finding, adjudicated kongming `KongmingToolbarRegr`] Hồi quy e2e spec cũ `full-option toolbar structures persist`:** TipTap defer `view.focus()` qua rAF khi editor chưa có focus → click nút toolbar giữ focus ở nút → phím gõ sau click rơi vào toolbar; handler Home/End tự viết biến race thành phá dữ liệu (End nhảy focus, Enter kích hoạt Undo). **Fix:** `onMouseDown={(e) => e.preventDefault()}` trên `Toolbar.Button` lệnh (pattern nhà `library/tests/$testId.tsx:628`) — editor không mất focus khi click, `chain().focus()` đi nhánh hasFocus ngay. Bàn phím a11y không đổi (chặn mousedown thôi). Link trigger giữ nguyên (popover tự quản focus). e2e spec cũ là regression test cho fix này.
- Composition `Popover.Trigger render={Toolbar.Button}`: đã thiết kế controlled-open qua `onOpenChange` (Task 1.4 step 3). Nếu ca (b)/(f)/(g) vẫn đỏ sau 2 vòng red→green: chuyển hẳn sang fallback anchor — bỏ `Popover.Trigger`, `Toolbar.Button` thường + `Popover` anchor theo ref, `Popover.Root` đặt ngoài `Toolbar.Root`, tự quản `aria-expanded`/`aria-haspopup` — không cố vá quanh trigger quá 2 vòng.
- Wrap 2 hàng 375px với 16 nút + gap-1: chấp nhận (F6 #437), chụp evidence phase 2.

## Rollback

Revert `rich-text-editor.tsx` + `rich-text-content-classes.ts` + test mới; không đụng data/docs.
