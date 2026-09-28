---
title: "Rich text cho luồng tạo bài tập (prompt composer + test builder)"
description: "Thay 7 textarea soạn nội dung bằng Tiptap (HTML), lưu HTML string vào contract/DB hiện có, render rich mọi nơi hiển thị với DOMPurify + tương thích ngược plain text; cuePoints giữ plain."
status: pending
priority: P2
effort: 3d
branch: vinh19410/feat/rich-text-test-builder
tags: [refactor, frontend, feature]
created: 2026-09-28
issue: 280
---

# Rich text cho luồng tạo bài tập

## Overview

5 Textarea của `PromptComposer` (prompt writing, passage, transcript, prompt speaking, note) + intro của `QuestionKeyEditor` + description của `TestHeaderForm` — **7 instance** đổi sang **Tiptap v3** soạn HTML. `cuePoints` **giữ textarea plain text** (interview Q2, 2026-09-28). Giá trị vẫn là `string` nên contract zod `.strict()` và cột SQLite giữ nguyên shape; mới chỉ đổi "chất" của chuỗi (plain → HTML). Render mọi nơi hiển thị đi qua một điểm duy nhất `<RichTextBody>` (DOMPurify ở browser), tự phát hiện hàng cũ plain text và render đúng như hiện trạng — **không data migration**. Server (Workers) không chạy sanitizer ngày đầu (jsdom/linkedom không khả dụng trên workerd).

## Key Design Decisions

1. **Tiptap v3** (`@tiptap/react`, `starter-kit`, `extension-placeholder` — MIT, catalog pnpm). **Không** kèm `@tiptap/extension-highlight` (dead dep — không có nút toolbar và `mark` không nằm trong allowlist thẻ; thêm sau khi có yêu cầu nút highlight, kèm `mark` vào allowlist). HTML là value native; Lexical bị loại vì cần adapter HTML.
2. **Lưu raw HTML string** trong field zod `string` + cột TEXT hiện có. Không JSON, không Markdown, không đổi schema DB.
3. **Sanitize-on-render, một sink duy nhất** `<RichTextBody>` (DOMPurify, apps/web). Server chỉ validate (raw cap + plain cap). Defense-in-depth sanitize-on-write để sau.
4. **`richTextField(plainMax, rawMax?)`** zod factory trong `packages/api/src/rich-text.ts` — raw max mặc định ≈ ×2.5, cap nội dung đo trên plain text đã strip thẻ **và collapse whitespace** (`\s+` → 1 space, để `\n` chèn ở ranh giới block không làm lệch trần). **Không** kèm refine "không rỗng" — draft phải được lưu rỗng (gating `ready` ở superRefine + client giữ nguyên trách nhiệm).
5. **Không migrate dữ liệu.** `RichTextBody` 2 nhánh: không có thẻ → render như cũ (whitespace-pre-line, React escape); có thẻ → DOMPurify + innerHTML. Hàng plain có `\n` render y hệt trước kia.
6. **cuePoints GIỮ plain text** (interview Q2, 2026-09-28): semantics "mỗi dòng 1 ý" + render `split('\n')` không đổi; không đụng contract, editor, hay render.
7. **Test theo house pattern**: mặc định node env; chỉ file mới dùng `// @vitest-environment jsdom` (thêm jsdom devDep) cho Tiptap Commands API + DOMPurify thật; e2e là lớp xác minh XSS tổng thể trên Chromium thật.
8. **Kiểm tra rỗng `.trim()` → `isEmptyRichText`** ở mọi điểm gate (validate client, draft store, preview gate, superRefine `ready`) — nếu không, `<p></p>` được coi là có nội dung.
9. **Legacy adapter bắt buộc khi nạp nội dung cũ vào editor** — `normalizeLegacyRichText(text)` (`apps/web/src/lib/rich-text-legacy.ts`): nếu chuỗi không có thẻ HTML → escape `&`/`<` → chuyển `\n` → `<br>` trước khi `setContent` (ProseMirror mặc định collapse `\n` — không adapter là **mất dữ liệu vĩnh viễn** khi edit draft cũ/bank row cũ). Áp tại 3 cửa nạp: restore draft `new.tsx` (~L200-225), slotDrafts restore `test-builder-shell.tsx` `openComposeNew` (~L312-318), `composerFromPrompt` bank-edit (`apps/web/src/lib/repos/assignment-tests.ts` ~L93-119). Không bump schemaVersion draft store — adapter migrate-on-restore (draft cũ vẫn hợp lệ, an toàn rollback).
10. **DOMPurify hardening**: `ALLOWED_ATTR` chỉ `href, target`; thẻ `a` qua hook `afterSanitizeAttributes` ép `target="_blank" rel="noopener noreferrer"` (payload không tự set được `rel`); **không** cho `img`/`src`/`alt`/`title` (không có trong allowlist thẻ).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Soạn prompt/passage/transcript/note (composer), intro (key editor), description (header form) với bold/italic/underline/list/link, autosave draft không mất | P1 |
| 2 | Nội dung lưu HTML, contract + DB giữ nguyên shape string, mọi lệnh cũ vẫn parse | P1 |
| 3 | Preview (giáo viên) + tab Lớp học render rich; hàng plain cũ render **giống hệt** trước kia | P1 |
| 4 | Payload XSS (`<img onerror>`, `<script>`) bị vô hiệu khi render | P1 |
| 5 | Trần độ dài theo nội dung thật (plain text), không bị thẻ đánh lừa | P2 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Rich text foundation](./phase-01-rich-text-foundation.md) | Pending |
| 2 | [Contracts migration](./phase-02-contracts-migration.md) | Pending |
| 3 | [Builder UI swap](./phase-03-builder-ui-swap.md) | Pending |
| 4 | [Render surfaces](./phase-04-render-surfaces.md) | Pending |
| 5 | [Tests e2e regression](./phase-05-tests-e2e-regression.md) | Pending |

## Success Criteria

- [ ] e2e: soạn prompt, bôi đậm 1 cụm, lưu → mở lại → `<strong>` còn nguyên; preview render đậm thật.
- [ ] Payload `<img src=x onerror=...>` lưu được nhưng khi render không thực thi (assert không cắm handler vào DOM).
- [ ] Hàng plain-text cũ (có `\n`, không thẻ) render pixel-logic giống trước: passage/prompt giữ xuống dòng; cuePoints render không đổi (vẫn bullet từ `split('\n')`).
- [ ] `<p></p>` (chỉ thẻ rỗng) bị coi là rỗng ở mọi gate: nút lưu, draft autosave skip, gate `ready` server 400 trên **POST create**. (PATCH `/prompts/:id` hiện không có ready-gate — gap có sẵn từ trước, ghi nhận ở Validation Log, ngoài scope plan này.)
- [ ] Prompt plain 6000 ký tự bị chặn dù bọc trong 1 cặp thẻ; raw HTML 13k ký tự bị chặn raw cap.
- [ ] `pnpm check` + `pnpm check-types` + `pnpm test` + e2e xanh; IME tiếng Việt (EVKey/Telex) gõ được trong editor (manual smoke checklist).

## NOT in Scope (HOLD)

- **Transient boxes giữ Textarea** (logic phụ thuộc plain text): pasteRaw answer key (`question-key-editor.tsx:315`), cloze source ×2 (`cloze-editor.tsx:231,298` — parser marker `*đáp án*` đọc plain text), keyText (`answers-checking-panel.tsx:163`).
- **Input 1 dòng** (stem/opts/answer, option-bank-editor, table-grid-editor): nội dung ngắn, không cần định dạng.
- **apps/student**: hôm nay không render nội dung đề — không đụng.
- **cuePoints giữ plain** (interview Q2): không đổi contract, editor, hay render của cuePoints.
- **Sanitize-on-write server-side**: deferred defense-in-depth — trigger cụ thể = trước khi thêm consumer non-React (PDF/email/student app) hoặc expose API công khai (cần linkedom smoke test trên workerd nếu làm).
- **Print/PDF, image/table trong editor**, heading toolbar (StarterKit có heading nhưng không exposing nút — giữ output đơn giản).

## Deploy & Rollback

- Rows HTML là **forward-only**: rollback web về bản cũ sẽ hiển thị tag soup `<p>` trong khung `pre-line` (chấp nhận — degraded, không phá dữ liệu).
- Rollback/roll-forward phải **cùng lúc server + web** (deploy 1 stem `alchemy deploy` qua turbo đã đồng bộ 2 app).
- **KHÔNG deploy giữa phase 3 và 4** — ở khoảng đó preview sẽ hiện raw HTML; phase 3 + 4 ship liền một nhánh.

## Context Links

- Research: [researcher-01-editor-libraries.md](./research/researcher-01-editor-libraries.md), [researcher-02-rich-text-persistence.md](./research/researcher-02-rich-text-persistence.md)
- Plan tiền nhiệm: `plans/260928-0419-ielts-full-test-builder/` (test builder + composer nhúng mà plan này đụng tới).
- Code standards: `docs/code-standards.md` — contract đổi → server + web cùng nhánh, cùng phase.

## Red Team Review

**Session:** 2026-09-28 · 4 reviewers (Full tier) · Findings: 17 (sau khử trùng lặp) · **100% accepted** theo duyệt của user.
Severity: 2 Critical, 7 High, 7 Medium, 1 Low.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Legacy round-trip mất `\n` — adapter `normalizeLegacyRichText` | Critical | Accepted | Phase 1/3 |
| 2 | Sót gate `ready` speaking `contracts.ts:616` | Critical | Accepted | Phase 2 |
| 3 | `htmlToPlainText` không tách `\n` ranh giới block → word count/cap sai | High | Accepted | Phase 1 |
| 4 | `getByLabel` chết trên contenteditable nếu không có plumbing a11y | High | Accepted | Phase 1/5 |
| 5 | Sót gate `KNOWN_HINTS` intro (`question-key-editor.tsx:107-117`) | High | Accepted | Phase 3 |
| 6 | Sót gate description trim (`test-header-form.tsx:98`) + test assertion | High | Accepted | Phase 3 |
| 7 | Sót gate Tag note trim ở 2 file preview (`student-preview:185`, `prompt-preview:189`) | High | Accepted | Phase 4 |
| 8 | Draft store cap 200KB + skip im lặng → mất draft HTML | High | Accepted | Phase 3 |
| 9 | `.partial()` zod v4 có thể rơi refine — mở rộng sang update schema 6 field | High | Accepted | Phase 2 |
| 10 | DOMPurify attr allowlist rộng, thiếu `rel="noopener"` | Medium | Accepted | Phase 1 |
| 11 | Dead dep `extension-highlight` | Medium | Accepted | Phase 1 |
| 12 | cuePoints Q2 — giữ plain, thu hẹp scope | Medium | Accepted (interview) | All |
| 13 | Deploy giữa phase 3/4 lộ raw HTML; rollback ra tag soup | Medium | Accepted | Plan (Deploy & Rollback) |
| 14 | Mất `maxLength` description → teacher không thấy lỗi cap 2000 | Medium | Accepted | Phase 3 |
| 15 | Test preview node-env mâu thuẫn (assert `<strong>` khi không có DOM) | Medium | Accepted | Phase 4 |
| 16 | Payload trim giữ nguyên (adjudicated) + tên symbol sai `partHasContent` (draft store) | Medium | Accepted | Phase 3 |
| 17 | Cite sai e2e (`toHaveValue`) + premise getByLabel + cite wordCount phase 4 | Low | Accepted | Phase 4/5 |

## Validation Log

### Verification Results (2026-09-28)

- Planner self-verify: 33 verified / 1 failed-corrected (cloze-editor path) / 3 unverified-marked.
- Red-team: 4 reviewers (Full tier) verify claim của plan bằng grep trực tiếp trên code; phát hiện thêm 6 consumer sites còn sót (đã đưa vào phase 3/4).
- Tier: Full (5 phases).

### Interview — Session 1 (2026-09-28)

| # | Question | Answer | Rationale | Impact on Phases |
|---|----------|--------|-----------|------------------|
| 1 | Áp toàn bộ red-team findings? | **Apply ALL accepted findings** | User duyệt trọn bộ; không chọn lọc | Toàn bộ chỉnh A-F trong mọi phase |
| 2 | cuePoints đổi rich hay giữ plain? | **Giữ plain text** | Semantics "mỗi dòng 1 ý" + render `split('\n')` hoạt động tốt; tránh đụng contract/render không cần thiết | Phase 2 bỏ swap cuePoints; Phase 3 bỏ swap + gate cuePoints; Phase 4 bỏ `legacyBulletList` |
| 3 | Các textarea còn lại có chuyển rich không? | **Có — đủ 7 trường còn lại** (5 composer: prompt writing, passage, transcript, prompt speaking, note + intro + description) | Đồng bộ trải nghiệm soạn thảo, tránh trạng thái nửa rich nửa plain khó bảo trì | Phase 3 swap 7 instance; Phase 4 render 7 trường ở mọi surface |

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01…phase-05 (sau khi áp 17 red-team findings + interview Q2/Q3).
- Decision deltas checked: 9 — (1) cuePoints giữ plain toàn bộ phase 2/3/4 + plan.md; (2) bỏ `extension-highlight` khỏi deps; (3) thêm adapter `normalizeLegacyRichText` (phase 1 tạo, phase 3 wire 3 cửa); (4) DOMPurify hardening decision 10 ↔ phase 1 config ↔ phase 4 risk note; (5) hợp đồng a11y label (phase 1) ↔ premise `getByLabel` (phase 5); (6) cap đo collapsed whitespace (plan decision 4 ↔ phase 1 requirement ↔ phase 2 test e2); (7) draft store 512KB + warn (phase 3) ↔ risk HTML inflation; (8) 3 gate superRefine (phase 2) ↔ success criteria plan.md (giới hạn POST, ghi gap PATCH); (9) effort 3d + gate "không deploy giữa phase 3/4" (plan Deploy & Rollback ↔ phase 3 risk).
- Reconciled stale references: 5 — "8 instance"→7; "2 gate superRefine"→3; symbol `partHasContent` tách đúng 2 ngữ cảnh (mirror draft-store là `composerDraftHasContent`, preview-paper giữ `partHasContent`); đếm gate phase 3 10→11 cụm; thêm ghi chú `<p>`→`<div>` wrapper student-preview-paper (block nesting invalid).
- Unresolved contradictions: 0 (2 mục **verify-at-implement** đã đánh dấu tường minh: line ref wordCount 2 file preview, số exact dòng `hasCoreContent`/`fieldErrors` ±2 dòng theo re-verify của planner — không chặn implement).

<!-- slug: rich-text-test-builder -->
