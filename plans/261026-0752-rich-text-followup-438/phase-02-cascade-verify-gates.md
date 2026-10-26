---
title: "Phase 2: Cascade layer, verify hình ảnh, e2e, docs, gates"
status: pending
priority: P2
effort: 0.5d
dependencies: [1]
---

# Phase 2: Cascade layer, verify hình ảnh, e2e, docs, gates

## Goal

`.ProseMirror` vào `@layer components` (utility min-h thắng thật), chứng minh bằng assertion computed style; verify hình ảnh đầy đủ theo issue (quiz-paper + quiz-reading-layout 375/1440 light/dark với passage h2/blockquote/pre, 2 test-header-form, các surface editor); e2e +1 spec popover link; docs sync; đủ gate REVIEW.md.

## Files to Create / Modify

- Modify: `packages/ui/src/styles/globals.css` (bọc khối `.ProseMirror` vào `@layer components`)
- Modify: `apps/e2e/specs/rich-text-content.spec.ts` (+1 spec link popover; KHÔNG sửa assertion cũ)
- Modify: `docs/**` (grep `tiptap|ProseMirror|rich text` trước khi sửa)
- Create: `plans/261026-0752-rich-text-followup-438/screenshots/*` (evidence, glob `plans/reports/**` không áp dụng — screenshots theo precedent #437 nằm trong plan dir)
- Create: script capture throwaway dưới `plans/261026-0752-rich-text-followup-438/` (mượn pattern boot free-port của `scripts/design-compare/capture.mjs`, xóa trước khi ship nếu không dùng lại)

## Tasks & Steps

### Task 2.1 — Cascade layer + assertion computed style

- Goal: utility `[&_.ProseMirror]:min-h-*` của callers thắng rule base; chiều cao thay đổi thật, có assertion khóa.
- Target: `packages/ui/src/styles/globals.css:278-290` — bọc CẢ `.ProseMirror { … }` lẫn `.ProseMirror p.is-editor-empty:first-child::before { … }` vào `@layer components { … }`.
- Steps:
  1. Sửa globals.css như trên; không đổi giá trị nào khác.
  2. Assertion e2e (trong spec link popover hoặc spec riêng ngắn): mở `/assignments/tests/new` (web test-header-form — field rich text label **"Mô tả"**, `test-header-form.tsx:169-177`, `contentClassName="[&_.ProseMirror]:min-h-22"`), `await page.getByLabel("Mô tả").evaluate("el => getComputedStyle(el).minHeight")` → kỳ vọng `"77px"` (= 5.5rem; root `html{font-size:14px}` tại `globals.css:220`, baseline TRƯỚC fix = 5rem = `"70px"`). Surface thứ hai: admin part-content-fields `min-h-16` → `"56px"`, đi qua admin flow với `ensureAdminAccount` + `adminSignInViaUi` (helpers.ts) theo mẫu `admin-library-*.spec.ts`; nếu navigation không khả thi thì fallback answer-key-grid (web) và ghi chú trong PR.
  3. Con số KHÔNG đoán lại: 1rem = 14px là fact (`globals.css:220`); nếu computed khác 77px/56px/70px thì cascade chưa ăn đúng hoặc có rule khác — STOP theo Failure Protocol, không tự chỉnh con số cho khớp.
- Success criteria: computed min-height đúng utility của callsite; surface min-h-22 = 77px (không còn 70px).
- Verify: `pnpm --filter e2e e2e -- --grep rich-text` exit 0 với assertion minHeight PASS (77px/56px; nếu ra 70px → cascade chưa ăn, STOP theo Failure Protocol).

### Task 2.2 — Verify hình ảnh (REVIEW.md + issue #438)

- Goal: bằng ảnh cho mọi surface bị đụng, đủ viewport/theme, kèm focus state.
- Target: `plans/261026-0752-rich-text-followup-438/screenshots/`.
- Steps:
  1. Boot stack e2e free-port (pattern `scripts/design-compare/capture.mjs` — boot:api xóa local.db, chạy seed mới). Dữ liệu quiz: dùng `seedQuizFixture` (`apps/e2e/specs/helpers-quiz.ts:71`) với prompt/passage chứa `<h2>`, `<blockquote>`, `<pre>` (điền qua `fillRichEditor` hoặc seed trực tiếp DB theo helper).
  2. Chụp mặt HỌC VIÊN: trang attempt dùng `quiz-paper` + trang dùng `quiz-reading-layout` (`apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` / `quiz-take-view`) @375×812 và 1440×900, light + dark (đặt `localStorage.theme`).
  3. Chụp EDITOR surfaces: web test-header-form (`/assignments/tests/new`), admin test-header-form, admin part-content-fields, prompt-composer, answer-key-grid — @1440×900 light + dark (gọn nhất: 1440 cho all + 375 cho 1 surface tiêu biểu).
  4. Focus state: Tab vào nút toolbar đầu tiên, chụp light + dark (chứng minh ring nút thấy rõ, wrapper không sáng).
  5. Chạy `pnpm design:compare` → exit 0 — LƯU Ý: chỉ là canary hồi quy redesign #378 (`scripts/design-compare/screens.json` hardcode screen t-*/s-*, `capture.mjs:59` ghi ảnh vào plan 378). Evidence CHÍNH cho surface #438 là ảnh do script throwaway của plan này tạo (bước 2–4), đọc trực tiếp từ `plans/261026-0752-rich-text-followup-438/screenshots/`.
- Success criteria: bộ ảnh phủ đủ danh sách; focus state hiển thị ring nút.
- Verify: `ls plans/261026-0752-rich-text-followup-438/screenshots | wc -l` ≥ 12 (quiz 8 + editor surfaces + focus 2); `pnpm design:compare` exit 0 (canary).

### Task 2.3 — E2E popover link + full suite

- Goal: e2e chứng minh popover link end-to-end và không hồi quy.
- Steps:
  1. Spec mới trong `rich-text-content.spec.ts`: soạn đề → selection chữ → click "Chèn liên kết" → popover nhập URL → Apply → lưu → mở preview học viên → assert `<a href>` render (làm theo mẫu spec "full-option toolbar structures persist"). THÊM 2 assertion kế thừa từ unit deviation: (i) selection rỗng + Apply + gõ tiếp text (keyboard thật) → text thành `<a href>` (ca d e2e); (ii) popover mở → Tab từ input qua "Áp dụng"/"Hủy" → quay lại input, KHÔNG thoát ra ngoài dialog (modal trap, ca h e2e). KHÔNG sửa 4 spec cũ.
  2. Chạy `pnpm --filter e2e e2e` FULL với port mặc định 8000/8001/8003/8104; nếu dev stack chiếm port → override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104` (AGENTS.md). Watchdog #402: crash vite giữa run ≠ lỗi test — đọc kỹ message cuối run.
- Success criteria: full e2e xanh, spec cũ nguyên vẹn (`git diff apps/e2e/specs/rich-text-content.spec.ts` chỉ thêm spec mới).
- Verify: `pnpm --filter e2e e2e` exit 0.

### Task 2.4 — Docs + checklist REVIEW.md

- Goal: docs phản ánh đúng tính năng; checklist REVIEW.md hoàn tất.
- Steps:
  1. `grep -rn "tiptap\|ProseMirror\|rich text\|rich-text" docs/` → cập nhật chỗ liệt kê tính năng editor (16 nút, popover link, không còn prompt).
  2. Checklist REVIEW.md: 3 viewport không tràn ngang (1440/768/375) + 320 reflow; dark+light; focus ring 2 theme; `aria-pressed` đúng; motion không đổi; `role="toolbar"` + group label. PR kèm screenshot.
- Success criteria: docs merge-ready; checklist tick đủ kèm evidence.
- Verify: `pnpm check` exit 0 (biome format cả docs mới sửa); `git status` không còn file rác (script throwaway xóa hoặc ghi trong PR).

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

- Chiều cao editor tăng thật ở prompt-composer (`min-h-52` = 13rem) và admin part-content-fields (`min-h-48` = 12rem) — là ĐÚNG Ý ĐỊNH (bug cascade pre-existing #280); nếu layout vỡ chỗ khác thì hạ giá trị min-h ở callsite cụ thể, KHÔNG revert layer.
- `quiz-reading-layout` có thể cần attempt đang dở: dùng đúng flow `seedQuizFixture` + bắt đầu attempt như spec student hiện có.
- Playwright theme: đặt `localStorage.theme = "dark"` trước `page.goto` (script `/theme-init.js` đọc trước render).

## Rollback

Revert globals.css (unlayered như cũ) + spec mới; screenshots giữ lại làm evidence của lần thử.
