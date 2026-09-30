---
title: "ak-plan: rich text cho luồng tạo bài tập (Tiptap)"
date: 2026-09-28
summary: "Plan 5 phase đổi 7 textarea soạn đề sang Tiptap v3 HTML — qua hard mode research + red-team 17 findings, issue #280"
---

# ak-plan: rich text cho luồng tạo bài tập (Tiptap)

## What happened
Chạy `/ak-plan --github` (auto-detect → **hard mode**) cho yêu cầu đổi các textarea trong luồng tạo bài tập sang rich text. Pipeline: scope challenge (HOLD) → scout (13 textarea được phân loại: 8 content / 4 transient paste / single-line input) → 2 researcher song song (chọn editor + chiến lược persistence) → planner draft 5 phase → red-team 4 reviewer (Full tier, 17 findings sau khử trùng lặp: 2 Critical / 7 High / 7 Medium / 1 Low) → user duyệt apply-all + 3 interview → consistency sweep (0 contradiction) → GitHub issue #280.

Plan dir: `plans/260928-0820-rich-text-test-builder/` (plan.md + 5 phase files + 2 research reports). `ak plan validate` OK; đã pin `ak plan use`; issue number ghi vào frontmatter.

## Decision
- **Tiptap v3** (`@tiptap/react` + `starter-kit` + `extension-placeholder`, MIT; bỏ `extension-highlight` — dead dep theo red-team). Lý do: HTML là value native khớp contract string, headless khớp Tailwind, React 19 trong peer deps.
- **Lưu raw HTML string** trong field zod string hiện có; `richTextField(plainMax)` — plain cap đo trên collapsed whitespace, raw cap ×2.5.
- **Sanitize-on-render 1 sink** `<RichTextBody>` (DOMPurify browser; allowlist chặt, hook ép `rel="noopener noreferrer"`). Server (Workers) không sanitizer ngày đầu — jsdom/isomorphic-dompurify không chạy trên workerd.
- **Không migrate dữ liệu**: RichTextBody 2 nhánh (plain cũ render y hệt / HTML sanitize); **adapter `normalizeLegacyRichText`** tại 3 cửa nạp editor — finding Critical: ProseMirror collapse `\n`, thiếu adapter là mất dữ liệu vĩnh viễn khi edit draft/bank row cũ.
- **cuePoints giữ plain text** (interview Q2 — semantics "mỗi dòng 1 ý", render `split('\n')` giữ nguyên); 7 instance còn lại chuyển rich (interview Q3, kể cả transcript/note/description chưa có render surface).
- Gate `.trim()` → `isEmptyRichText` ở **11 cụm** (red-team enumerate lại đủ, gồm gate speaking `contracts.ts:616` bị sót + KNOWN_HINTS + note Tag); draft store cap 200KB → 512KB + console.warn (silent-skip mất draft); a11y `aria-labelledby` qua `editorProps.attributes` cho getByLabel e2e.
- Rủi ro ghi nhận: gap PATCH `/prompts/:id` không có ready-gate (có sẵn từ trước, ngoài scope); phase 3+4 ship liền một nhánh (không deploy giữa 2 phase); IME tiếng Việt verify bằng manual smoke checklist.

## Next steps
- `/ak:cook plans/260928-0820-rich-text-test-builder/plan.md` (khuyến nghị `/clear` trước khi cook).
- Effort ~3d; 5 phase: foundation → contracts → builder UI swap → render surfaces → e2e regression.
- Sau ship: bật dependabot/renovate cho `dompurify` + `@tiptap/*` (DOMPurify cần update định kỳ theo OWASP); trigger sanitize-on-write = khi có consumer non-React đầu tiên.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
