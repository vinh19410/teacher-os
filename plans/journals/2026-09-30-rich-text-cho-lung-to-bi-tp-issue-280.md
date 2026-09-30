---
title: "Rich text cho luồng tạo bài tập (issue #280)"
date: 2026-09-30
summary: "Tiptap v3 cho 7 field soạn nội dung; HTML string qua richTextField (plain cap + raw cap 2.5x); DOMPurify single-sink RichTextBody với legacy plain fallback không migration; adapter normalizeLegacyRichText tại 3 cửa nạp editor chống mất newline; isEmptyRichText cho mọi gate; cuePoints giữ plain. E2E: bold persist + XSS neutralize + legacy newline. Spec bug fix: URL race /tests/new."
---

# Rich text cho luồng tạo bài tập (issue #280)

Tiptap v3 cho 7 field soạn nội dung; HTML string qua richTextField (plain cap + raw cap 2.5x); DOMPurify single-sink RichTextBody với legacy plain fallback không migration; adapter normalizeLegacyRichText tại 3 cửa nạp editor chống mất newline; isEmptyRichText cho mọi gate; cuePoints giữ plain. E2E: bold persist + XSS neutralize + legacy newline. Spec bug fix: URL race /tests/new.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
