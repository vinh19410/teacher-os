# Báo cáo nghiên cứu: Chọn rich text editor cho Teacher OS (React 19 + Vite + Tailwind 4 + TS strict)

**Ngày nghiên cứu:** 28/09/2026. **Kết luận nhanh:** Dùng **Tiptap v3 (`@tiptap/react` + `@tiptap/starter-kit`)**. Toàn bộ nhu cầu toolbar của app (bold, italic, underline, list, link) đã nằm trong StarterKit **MIT, miễn phí 100%**; highlight chỉ cần thêm 1 package MIT. HTML string là định dạng native của Tiptap nên khớp trực tiếp với zod contracts + cột SQLite `TEXT`. Lexical là lựa chọn dự phòng nếu lo rủi ro vendor, nhưng HTML chỉ là "công dân hạng hai" với Lexical.

## 1. Bảng so sánh

| Tiêu chí | **Tiptap v3** | **Lexical** | **Quill 2 + react-quill-new** | **Slate** |
|---|---|---|---|---|
| Giấy phép | MIT (core + mọi extension trên npm công khai) | MIT | Quill: BSD-3-Clause; wrapper: MIT | MIT |
| Kích thước (gzip, đo bằng Bundlephobia) | StarterKit ~103 KB + `@tiptap/react` ~8 KB ≈ **~110 KB** | `lexical` core ~61 KB + `@lexical/react` + các module con → ước tính **~100–130 KB** tổng | Quill ~56 KB; `react-quill-new` ~47 KB (bao trùm nhau) ≈ **~56 KB** | `slate-react` ~21 KB (+ core, không đo riêng) |
| Bảo trì 2025–2026 | Rất tích cực: 3.31.3, phát hành gần nhất 09/2026 (npm) | Rất tích cực: 0.51.0, phát hành 28/09/2026, do Meta bảo trợ | `react-quill` gốc **chết** (lần cuối 9/2023); fork `react-quill-new` 3.8.3 còn hoạt động (02/2026); Quill core chậm (2.0.3, 01/2025) | Phát hành đều trở lại (slate-react 0.127.1, 09/2026) nhưng dự án **tự gọi là "beta"**, chưa bao giờ ra 1.0 |
| Tương thích React 19 | Peer deps `^17 \|\| ^18 \|\| ^19` — xác minh từ npm | Peer deps `>=18.x` | `react-quill-new`: `^16–^19` | `>=18.2.0` |
| Headless / style riêng | **Hoàn toàn headless** — DOM chỉ là class `.ProseMirror`, style bằng Tailwind | Headless, themeless | **Không headless**: ship CSS theme snow/bubble, phải override | Headless nhưng tự dựng mọi thứ |
| Định dạng value | **HTML string native** (`getHTML()` / `setContent()`), cả JSON | EditorState JSON là gốc; HTML qua `@lexical/html` (adapter 2 chiều tự viết) | **Delta JSON** là gốc; HTML thứ yếu, không cam kết ổn định để lưu | Model tự định nghĩa; serializer HTML tự viết |
| IME tiếng Việt | ProseMirror có tầng xử lý composition riêng, rất tốt | Tương đương tốt | Quill 2 đã cải thiện, lịch sử nhiều vấn đề IME ở v1 | Ổn nhưng phụ thuộc bản beta |
| Testing | Core chạy headless tốt trong jsdom; Playwright `fill()` hỗ trợ chính thức `[contenteditable]` | Tốt nhưng nhiều khái niệm | Wrapper khó test controlled; fill hoạt động | Phức tạp nhất |

## 2. Chi tiết giấy phép Tiptap v3 (đã xác minh từ nguồn chính thức)

Thông báo chính thức: Tiptap 3.0 stable phát hành 12/07/2025 ([tiptap.dev/blog/release-notes/tiptap-3-0-is-stable](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable)). Trang giá ghi rõ: *"The Tiptap Editor is open source (MIT) and free. Only platform features and cloud documents are priced."* ([tiptap.dev/pricing](https://tiptap.dev/pricing))

**Miễn phí (MIT, trên npm công khai `@tiptap/*`) — StarterKit MIỄN PHÍ.** Đọc source `packages/starter-kit/src/starter-kit.ts` + đối chiếu `npm view @tiptap/starter-kit dependencies`: StarterKit v3.31.3 gồm **22 extension**: Blockquote, Bold, BulletList, Code, CodeBlock, Document, Dropcursor, Gapcursor, HardBreak, Heading, HorizontalRule, **Italic**, **ListItem, ListKeymap, BulletList, OrderedList**, **Link** (từ v3), Paragraph, Strike, Text, **Underline** (từ v3), TrailingNode, **UndoRedo**.

Ngoài ra các package sau đều **free MIT**: `@tiptap/extension-highlight`, `extension-image`, `extension-table`, `extension-task-list`, `extension-emoji`, `extension-placeholder`, `extension-character-count`.

**Trả phí:** (1) Pro extensions qua private registry `@tiptap-pro/*` (E404 trên npm công khai — drag handle, unique ID, TOC, DOCX/PDF export, tracked changes); (2) Platform/Cloud (collab, comments, AI Toolkit, UI Components Pro) — $59–$1.199/tháng.

→ **Không có gì app này cần nằm ở tầng trả phí.** Highlight là mục duy nhất ngoài StarterKit.

## 3. Khuyến nghị (xếp hạng)

1. **Tiptap v3 — chọn cho app này.** Headless chuẩn với shadcn/Tailwind; value là HTML string native khớp zod contract; React 19 chính thức trong peer deps; docs tốt nhất nhóm; mọi extension cần đều MIT.
   - **Rủi ro ghi nhận:** open-core do công ty vận hành; có thể đẩy tính năng mới sang tầng trả phí. Giảm thiểu: pin version trong pnpm catalog, chỉ phụ thuộc package `@tiptap/*` công khai MIT.
   - **Rủi ro IME:** một số bug Vietnamese IME là tầng trình duyệt ([contenteditable.realerror.com](https://contenteditable.realerror.com)); ProseMirror tự xử lý composition đúng chuẩn. Cần smoke test với EVKey/Unikey + Telex/VNI trước khi ship.
2. **Lexical** — phương án B nếu rủi ro vendor của Tiptap thành vấn đề. Nhược: phải viết adapter HTML ↔ EditorState, chi phí học cao hơn, version 0.x.
3. **Quill 2 (`react-quill-new`)** — nhẹ nhất nhưng không headless (theme CSS kèm theo), Delta format lệch yêu cầu HTML string.
4. **Slate** — không khuyến nghị: beta vĩnh cửu, tự viết serializer + toolbar nhiều nhất.

## 4. Danh sách package cần cài

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-highlight @tiptap/extension-placeholder
```

- `@tiptap/starter-kit` đã chứa: bold, italic, underline, bullet/ordered list, link, undo/redo.
- `@tiptap/extension-highlight`: highlight text (ngoài StarterKit).
- `@tiptap/extension-placeholder`: placeholder (nằm trong `@tiptap/extensions`, không tự bật qua StarterKit).
- Tất cả MIT, version 3.31.3, nên thêm vào `pnpm-workspace.yaml` catalog.

## 5. Pattern controlled component với HTML string

```tsx
import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'

interface RichTextEditorProps {
  value: string                    // HTML string — khớp zod contract z.string()
  onChange: (html: string) => void
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Highlight,
      Placeholder.configure({ placeholder: 'Nhập nội dung...' }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // state -> editor (form reset, load dữ liệu). emitUpdate: false tránh vòng lặp
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [value, editor])

  return <EditorContent editor={editor} />
}
```

Lưu ý: chữ ký v3 là `setContent(content, options)` với `options: { emitUpdate?, parseOptions?, errorOnInvalidContent? }` — khác v2 positional boolean ([docs setContent](https://tiptap.dev/docs/editor/api/commands/set-content)).

## 6. Testing

**Vitest + jsdom:** jsdom không mô phỏng selection/contenteditable thật — **không gõ phím vào editor trong unit test**; test qua Commands API (Tiptap core chạy headless tốt):

```ts
it('toggleBold sinh <strong>', () => {
  const editor = new Editor({ extensions: [StarterKit], content: '<p>hello</p>' })
  editor.commands.setTextSelection({ from: 1, to: 6 })
  editor.commands.toggleBold()
  expect(editor.getHTML()).toContain('<strong>')
})
```

React Testing Library: render component, click nút toolbar (toolbar cần aria-label), assert onChange nhận HTML đúng.

**Playwright:** `locator.fill()` **hỗ trợ chính thức** `[contenteditable]` ([docs](https://playwright.dev/docs/api/class-locator#locator-fill)):

```ts
const editor = page.locator('.ProseMirror').first()
await editor.click()
await editor.fill('Đọc đoạn văn sau')
await editor.pressSequentially(' và trả lời')
await page.getByRole('button', { name: 'Bold' }).click()
await expect(editor.locator('strong')).toContainText('Đọc')
```

Muốn set HTML đầy đủ trong E2E: dispatch sự kiện `paste` với `clipboardData` chứa HTML, thay vì `evaluate` gán `innerHTML` (bỏ qua vòng sync của ProseMirror).

## Nguồn

- Tiptap v3 stable: [tiptap.dev/blog/release-notes/tiptap-3-0-is-stable](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable), [starter-kit.ts source](https://github.com/ueberdosis/tiptap/blob/main/packages/starter-kit/src/starter-kit.ts)
- Giấy phép/giá: [tiptap.dev/pricing](https://tiptap.dev/pricing), [feature-comparison](https://tiptap.dev/feature-comparison)
- setContent v3: [tiptap.dev/docs/editor/api/commands/set-content](https://tiptap.dev/docs/editor/api/commands/set-content)
- npm (truy vấn 28/09/2026): [@tiptap/react](https://www.npmjs.com/package/@tiptap/react), [@lexical/react](https://www.npmjs.com/package/@lexical/react), [react-quill](https://www.npmjs.com/package/react-quill), [react-quill-new](https://github.com/VaguelySerious/react-quill), [slate-react](https://www.npmjs.com/package/slate-react)
- Bundle size: [bundlephobia.com](https://bundlephobia.com)
- Playwright contenteditable: [playwright.dev/docs/api/class-locator#locator-fill](https://playwright.dev/docs/api/class-locator#locator-fill)
- IME tiếng Việt: [contenteditable.realerror.com](https://contenteditable.realerror.com), [ProseMirror](https://prosemirror.net/)

## Hạn chế & câu hỏi chưa giải quyết

- **Bundle size Lexical tổng thể là ước tính** (~100–130 KB gzip): Bundlephobia HTTP 429 khi đo `@lexical/react`. Không ảnh hưởng quyết định.
- **IME tiếng Việt chưa test thực nghiệm** — cần smoke test với EVKey/Unikey, Telex và VNI trên Chrome/Edge thật.
- **Sanitization ngoài phạm vi** báo cáo này (xem researcher-02).
