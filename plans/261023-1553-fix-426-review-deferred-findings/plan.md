---
title: "Fix 4 finding defer từ code review #420/#424 (issue #426)"
description: "Fail-soft parse questions (500→NOT_READY), thống nhất path lỗi answerSet giữa 2 luật, giảm work-per-keystroke trang soạn đề, e2e keyboard bỏ đếm Tab mù."
status: completed
priority: P1
effort: 6h
issue: 426
branch: vinh19410/ai-handle-issue-426
tags: [bugfix, backend, api, frontend]
blockedBy: []
blocks: []
created: 2026-10-23
---

# Fix 4 finding defer từ code review #420/#424

## Overview

Issue #426 gom 4 finding Medium được defer từ code review PR #420/#424 (không chặn merge). Toàn bộ anchor code nằm trên nhánh `feat/424-quiz-builder-page-refactor` (PR #427 đang OPEN vào `develop`) — branch làm việc `ai-handle-issue-426` được đặt trên head của nhánh đó (stacked PR). Plan sửa từng finding kèm test regression, giữ nguyên số lượng assertion, không merge vào `main`.

## Bằng chứng điều tra (đã verify trên cây code hiện tại)

| # | Finding | Anchor | Root cause |
|---|---------|--------|------------|
| 1 | questions blind cast → 500 thay vì NOT_READY | `apps/server/src/routes/admin-library.ts:150` | `toPartInput` cast mù `parseJsonArray(row.questions) as LibraryPartInput["questions"]`; JSON corrupt (vd `[{"stem":123}]`) → `partIssues` gọi `q.stem.trim()` → TypeError → PATCH ready 500. `groups` đã có `parseGroups` fail-soft (dòng 133-139) — `questions` chưa. |
| 2 | Path lỗi answerSet lệch giữa 2 luật | `packages/api/src/library-contracts.ts` superRefine (~196-215) vs `partIssues` (~371-393) | superRefine emit `["groups"]` (chung chung); partIssues emit `groups.{gi}` (đúng nhóm). Draft save (`partInputFromValue`) key `"groups"` → không có field nào đọc key này → lỗi không hiện đúng nhóm; ready lại chỉ đúng group. |
| 3 | Perf: mỗi keystroke rebuild outline + zod-parse mọi part | `apps/admin/src/routes/_auth/library/tests/$testId.tsx:363-407`, `apps/admin/src/components/library/part-form.tsx:194-224,462` | Mỗi keystroke: `onDraftChange` → `setDrafts` (Map mới) → `effectiveParts` chạy `partInputFromValue` (zod parse) cho MỌI slot + `partValueFromDto` cho mọi part đã lưu; kèm `validateTestReady` + `buildTestOutline` + `buildAnswersOverview` sync cùng frame. `isPartDirty` rebuild baseline (`partValueFromDto(saved)`) + 2× `JSON.stringify` (passage 20k) mỗi render. |
| 4 | E2E keyboard đếm 7 Tab mù | `apps/e2e/specs/admin-library-reading.spec.ts:565-578`, helper `fillQuestionRow` :60-70 | `for (i=0; i<7; i++) press Tab` rồi assert `activeElement` — thêm/bớt 1 nút là lệch. `fieldset[aria-label^="Câu"]` dùng `.nth()` toàn trang thay vì scope theo id hàng (`${slot}-q${n}` / `group-${slot}-${gi}-q${n}` đã tồn tại từ #424). |

## Non-goals (không làm)

- Không đổi luật validate, không thêm rule mới (chỉ đổi path_issue của 1 rule có sẵn).
- Không trả zod issues trong 400 của PUT part (mục "cân nhắc" trong issue — skip để giữ scope).
- Không merge/t Roll PR #427 — chỉ tái sử dụng head của nó làm base.
- Không đụng `main`, không deploy, không force-push.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Fail-soft parse questions — hết 500 khi JSON corrupt](./phase-01-fail-soft-questions.md) | Pending |
| 2 | [Phase 2: Thống nhất path lỗi answerSet giữa superRefine và partIssues](./phase-02-answerset-path.md) | Pending |
| 3 | [Phase 3: Perf — giảm work mỗi keystroke (memo per-slot + deferred)](./phase-03-perf-drafts.md) | Pending |
| 4 | [Phase 4: E2E keyboard theo role+name, fieldset scope theo row id](./phase-04-e2e-keyboard.md) | Pending |
| 5 | [Phase 5: Gates tổng + docs decision](./phase-05-gates-docs.md) | Pending |

## Success Criteria

- [ ] JSON `questions` corrupt trong DB → PATCH ready trả 400 `NOT_READY` kèm issues có cấu trúc (không 500).
- [ ] answerSet vắt nhóm: draft-save chỉ lỗi đúng nhóm (path `groups.{gi}`), cùng ngữ nghĩa với luật ready.
- [ ] Bench trước/sau (call-count `partInputFromValue` mỗi keystroke 4→1 + wall-time khối derived) ở quy mô 4 part × 40 câu; hành vi UI không đổi.
- [ ] E2E keyboard định vị bằng role+name trong nav; fieldset scope theo row id; không giảm số assertion.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test`, e2e admin (reading + listening) pass local.

## Rủi ro

- **Stacked PR (đã hiệu chỉnh theo kongming plan-gate):** `gh pr merge --auto` KHÔNG chờ PR khác merge — nó chỉ chờ checks/review của chính PR đó. Vì vậy:
  1. PR mở với **base = `feat/424-quiz-builder-page-refactor`** (head `ai-handle-issue-426`) để diff chỉ chứa thay đổi của #426.
  2. CẤM merge khi #427 còn OPEN.
  3. Sau khi #427 merge vào `develop` (kể cả squash): `git merge origin/develop` vào branch (merge thường — KHÔNG rebase để tôn trọng cấm force-push), push, rồi `gh pr edit --base develop`.
  4. Khi đó `gh pr merge --auto` / merge vào `develop` là an toàn.
  5. Nếu #427 kẹt lâu: PR để open (watcher chuyển card In review cho human) — external blocker được ghi nhận.
- `useDeferredValue` làm outline/answers/readyIssues trễ ~1 frame — chấp nhận được (server vẫn là nguồn sự thật NOT_READY khi publish; RT-4).
- **Trade-off fail-soft questions (kongming):** server parse TOÀN MẢNG (1 câu hỏng → `[]` → "at least one question") trong khi admin `normalizeQuestions` xử lý từng câu — UI có thể thấy 40 câu nhưng server chặn ready. Chấp nhận: dữ liệu hỏng chỉ đến từ ghi ngoài luồng; ghi rõ trade-off trong comment `parseQuestions` và PR.

## Red Team Review

> Lưu ý vận hành: 3 reviewer subagent (`code-reviewer`) lỗi "No model selected" (môi trường không cấp model cho subagent) → red-team 3 persona (Security / Assumption / Failure) do controller tự chạy, mọi finding bắt buộc kèm evidence `file:line`; kongming passive advisory đã đóng góp RT-1 trước gate.

| # | Severity | Persona | Finding | Evidence | Disposition |
|---|----------|---------|---------|----------|-------------|
| RT-1 | High | Failure | Task 4.1 thay vòng Tab bằng `.focus()` làm MẤT kiểm chứng "cây đi tới được bằng Tab" — làm yếu test, vi phạm ràng buộc không weaken test | `apps/e2e/specs/admin-library-reading.spec.ts:565-578` | **Accept (đã sửa)** — phase-04 Task 4.1 viết lại: giữ Tab, vòng trần 20 + `toBeFocused()` + assert thứ tự `traversed` đối chiếu locator từ `outline(page)` (đề xuất của kongming advisory) |
| RT-2 | Medium | Assumption | Row id `#group-p1-1-q2` trong Task 4.1 là suy đoán từ comment, chưa verify runtime (index 0/1-based) | `apps/admin/src/components/library/part-form.tsx:564`, `packages/ui/src/components/assignments/editor/answer-key-grid.tsx:438` | **Accept** — plan đã bắt buộc "KIỂM TRA lại cấu trúc id thật khi chạy"; giữ nguyên, executor phải confirm bằng DOM thật trước khi assert |
| RT-3 | Medium | Security | Lo ngại fail-soft `[]` nuốt dữ liệu hợp lệ → publish nội dung thiếu câu | `apps/server/src/routes/admin-library.ts:133-157` | **Reject** — pattern khớp `parseGroups` hiện có; `[]` làm ready CHẶN bằng "at least one question" (không publish được), không nuốt trường hợp hợp lệ (safeParse pass giữ nguyên data + defaults) |
| RT-4 | Low | Failure | `currentQStart` derive từ `sections` (deferred sau phase 3) → đánh số fold trễ ~1 frame khi thêm/bớt câu | `apps/admin/src/routes/_auth/library/tests/$testId.tsx:457-459` | **Accept (ghi nhận)** — cosmetic; publish luôn re-validate server-side (NOT_READY là nguồn sự thật) |
| RT-5 | Medium | Failure | Bench file tạm nằm trong `apps/admin` sẽ bị biome quét → risk fail `pnpm check` | `plans/…/phase-03-perf-drafts.md` Task 3.1 | **Accept** — bổ sung ghi chú viết bench sạch chuẩn biome ngay từ đầu; xóa trước commit (Task 3.5) |
| RT-6 | High | Assumption | Nghi superRefine KHÔNG phát `["groups"]` cho answerSet (plan sai anchor) | `packages/api/src/library-contracts.ts` superRefine `addIssue(["groups"], "answer set must stay inside one group")` | **Reject** — đã đọc code: superRefine phát đúng `["groups"]`; partIssues phát `groups.{gi}` — anchor plan chính xác |
| RT-7 | Medium | Assumption | Nghi `useDeferredValue` không khả dụng trên stack hiện tại | `pnpm-workspace.yaml:21` (react ^19.2.8) | **Reject** — React 19 hỗ trợ đầy đủ (API từ 18) |

### Whole-Plan Consistency Sweep
- Đối chiếu plan.md ↔ 5 phase files sau khi áp RT-1/RT-5: không còn claim cũ "thay bằng .focus()"; success criteria phase-04 đã đồng bộ "không giảm assertion".
- Non-goals khớp phạm vi phase (không phase nào đụng PUT 400 body hay thêm rule).
- Dependencies: 2 phụ thuộc 1 (test file server khác phase 1), 5 phụ thuộc 1-4 — khớp thứ tự thực thi.
- Kết luận: không còn mâu thuẫn — plan sẵn sàng implement.

## Validation Log

### Verification Results
- Claims checked: 12 (line anchors, tên hàm, props, versions, hành vi zod)
- Verified: 12 | Failed: 0 | Unverified: 1 (định dạng row id runtime — được xử lý bởi bước verify runtime trong Task 4.1)
- Tier: Standard (5 phases → Fact Checker + Contract Verifier)
- Ghi chú: phiên chạy automation (ai-handle) không có interview tương tác — các quyết định chốt theo context repo/issue và ghi nhận tại mục này; không có câu hỏi nào đủ trọng lượng để đổi hướng implement.

### Key Decisions
1. Scope giữ đúng 4 finding; mục "cân nhắc route trả zod issues trong 400" → skip (non-goal, ghi trong plan.md).
2. Branch làm việc stacked trên head PR #427; merge bắt buộc sau #427 (`gh pr merge --auto`).
3. Docs skip (không đổi public contract — server 400 body và NOT_READY issues không đổi).

### Kongming plan-gate (2026-10-23)
Verdict: **GO có điều kiện** — 5 điểm bắt buộc đã áp vào plan: (1) Task 2.5 sửa regex `firstIssueFocusPlan` cho key nhóm không field (`part-view-state.ts:89`); (2) Phase 3 đổi thước đo sang call-count (4→1) thay vì ms từng hàm thuần; (3) Task 3.5 memo canonical STRING baseline (`arePartValuesEqual` stringify cả 2 đối số); (4) Task 3.2 tách helper thuần `effectivePartsFor` + unit tests (lưới an toàn vì không có test cho `$testId.tsx`); (5) Task 4.1 id hàng đúng `#group-p1-1-q1` (index 0-based trong nhóm). Rủi ro stacked PR đã hiệu chỉnh: PR base `feat/424-…`, cấm merge khi #427 open, merge `origin/develop` vào branch rồi đổi base (không rebase/force-push). Trade-off fail-soft toàn-mảng vs per-question của admin được ghi nhận ở mục Rủi ro.
