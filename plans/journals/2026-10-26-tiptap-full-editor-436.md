---
title: "Tiptap full-option editor (#436, pivot từ CKEditor)"
date: 2026-10-26
---

# Tiptap full-option editor (#436, pivot từ CKEditor)

Feature: mở toolbar `RichTextEditor` từ 6 lên 15 nút (H2/H3, strike, blockquote, code inline, code block, hr, undo/redo) theo đúng render contract `sanitizeRichText` — mọi nút sinh markup nằm sẵn trong allowlist, không thêm dependency (StarterKit 3.31 bundle đủ). Style WYSIWYG dùng chung 1 nguồn `RICH_TEXT_CONTENT_CLASSES` cho editor + `RichTextBody`.

License gate: plan gốc #436 là migrate CKEditor 5. Phase 1 (license gate) chặn: repo private/không LICENSE; key `'GPL'` kích hoạt nghĩa vụ GPL-2+ cho bundle JS phân phối tới browser; free CDN ~1.000 lượt tải/tháng. User chốt 2026-10-26: giữ Tiptap, nâng full-option. Plan CKEditor `261026-0524` → cancelled; plan mới `261026-1243-tiptap-full-editor`.

Kiến trúc: `RichTextToolbar` tách component con dùng `useEditorState` (selector phẳng + deepEqual) — `useEditor` v3 không re-render theo transaction nên state toolbar (aria-pressed/canUndo) stale nếu đọc ở parent render; tách con tránh `shouldRerenderOnTransaction: true` re-render cả 5 editor prompt-composer mỗi keystroke. `div[role=toolbar]` giữ là preceding-sibling trực tiếp của `EditorContent` — bất biến DOM mà 3 spec e2e cũ neo XPath.

Bug thật test/screenshot bắt được (đều fix + test-first):
1. Stale toolbar state (red-team Critical, `@tiptap/react@3.31.3/dist/index.js:457`): stored mark không đổi doc → controlled cha không re-render → nút "In đậm" không sáng. Test: click bold trên doc rỗng, assert `aria-pressed` đổi — fail trước fix.
2. Undo-history pollution: value-sync mount (`""` ≠ `getHTML()` `"<p></p>"`) ghi 1 bước undo rác → mở đề cũ bấm Ctrl+Z một lần là trắng nội dung. Fix `chain().setMeta("addToHistory", false).setContent(...).run()`. Test: assert Hoàn tác disabled trên editor chưa đụng — fail trước fix. Đánh đổi: form reset ngoài không undo ngược lại được (giống `<input>` set value bằng code).
3. WYSIWYG list/link (code review Important): preflight reset `list-style`/`text-decoration`; restore `a`/`ul`/`ol` đưa vào hằng dùng chung, xoá bản append riêng của `RichTextBody`.

Quyết định nhãn: "Đề mục cấp 2/3" thay "Tiêu đề 2/3" — `getByLabel("Tiêu đề")` (substring, ~40 chỗ e2e) otherwise strict-mode violation vỡ cả suite.

Bài học: (1) red-team 2 persona + kongming sau plan gate bắt 1 Critical có thật trong claim "giữ pattern hiện tại" — pattern cũ chính là bug; (2) e2e strict-mode violation do aria-label toolbar trùng field label: đặt tên aria là API công khai, đổi nhãn nút rẻ hơn đổi 40 spec; (3) screenshot assertion tự viết (focus/undo disabled/320 reflow) bắt 2 bug mà unit test DOM không thấy; (4) `.ProseMirror` style gộp 1 bản vào `packages/ui/src/styles/globals.css` cho web + admin.

Verification: unit web 1437 + ui 180 + admin 180 (test-first 2 regression đỏ→xanh), `pnpm check` exit 0, check-types 8/8, e2e rich-text 4/4, full Playwright 194 pass/1 skip, design:compare, screenshot 3 viewport × 2 theme + 320 reflow + keyboard focus + admin editor. PR → develop (beta, #436).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
