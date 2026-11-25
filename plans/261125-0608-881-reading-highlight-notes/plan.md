---
title: "Reading Highlight & Note Tools (#881)"
description: "Bổ sung công cụ tô sáng (highlight) và gắn ghi chú trên bài đọc IELTS Reading chuẩn computer-delivered test cho màn làm bài, màn xem lại và xem trước đề."
status: completed
priority: P1
effort: "1d"
tags: [reading, student, ui, ielts, issue-881]
created: 2026-11-25
---

# Plan: Reading Highlight & Note Tools (#881)

## Overview

Học viên làm bài Reading trên máy (cả luồng giao bài `/learn/quizzes/$assignmentId` và tự luyện `/learn/quizzes/practice/$testId`) hiện không thể tô sáng (highlight) hay gắn ghi chú trên đoạn văn bài đọc, khác với trải nghiệm thi IELTS trên máy (CBT).

Kế hoạch này bổ sung công cụ tô sáng và ghi chú dùng chung ở lớp UI (`@teacher-os/ui`) trên `QuizReadingSplitLayout`, dùng engine **DOMPurify → `DOMParser` → React AST + cắt text-leaf theo offset UTF-16** an toàn với rich-text HTML, đi kèm lưu trữ `localStorage` riêng theo `attemptId` (kèm `passageHash`, LRU tối đa 25 attempt, tự dọn khi đăng xuất/đổi tài khoản) để bền qua reload và hiển thị read-only sau khi nộp bài.

- **Issue nguồn**: `https://github.com/vinh19410/teacher-os/issues/881`
- **Branch**: `vinh19410/feat-reading-thi-u-c-ng-c-t-s-ng-v-ghi-ch-tr-n-b`
- **Mode**: `--tdd --advice` (handover-ready plan với `Failure Protocol` trong từng phase)
- **Advisor Scope Lock (`kongming` post-investigation + User Validation Session 1)**:
  - **Locked In-Scope**:
    1. 1 màu vàng/hổ phách chuẩn IELTS CBT trong `packages/ui/src/styles/globals.css`, ép `color: var(--foreground)` để đạt WCAG AA ≥ 4.5:1 cả trong `<blockquote>` ở Light & Dark, và `--reading-highlight-border` đạt ≥ 3.0:1 (WCAG 1.4.11).
    2. Pure engine rich-text AST + UTF-16 offset mapping + interval algebra (`packages/ui/src/lib/reading-annotations.ts`), bao gồm defense-in-depth `sanitizeHref`, hạ cấp `<a>` không có `href` thành `<span>`, giới hạn `colspan`/`rowspan` `1..50`, và chuẩn hoá overlap đầy đủ cho cả `applyHighlightSpan`, `upsertNoteSpan`, `removeHighlightRange`.
    3. `AnnotatableReadingPassage` + tích hợp vào `QuizReadingSplitLayout` qua prop tuỳ chọn `annotations` (floating selection bar, right-click context menu, note popover, collapsible notes panel với badge đếm `aria-hidden="true"`, nút "Xoá tất cả" có xác nhận; bảo toàn `RICH_TEXT_CONTENT_CLASSES`, `whitespace-pre-line`, `<table>` overflow wrapper, portal modal-safe, outside-click dismiss, `pointercancel` mobile, và capture scroll filtering).
    4. `localStorage` persistence theo `quiz-reading-annotations:{attemptId}` có kiểm `passageHash`, validate chống poisoning, LRU cap 25 bài + evict khi `QuotaExceededError`, và dọn sạch khi đăng xuất/đổi tài khoản trong `syncActiveStudentUser`; wire vào Student Take (`QuizTakeView`), Student Review (`AttemptDetailScreen`, readonly mode), và Admin Preview (`TestPreviewOverlay`, keyed theo `tab.part`, in-memory, 0 write request).
  - **Explicit Non-Goals (v1)**:
    1. `PlacementReadingStep` (`apps/student/src/components/placement/placement-reading-step.tsx`).
    2. Tô sáng/ghi chú trong pane Câu hỏi (`reading-work-pane` / `QuizPaper`).
    3. Các kỹ năng khác (`listening`, `writing`, `speaking`, `grammar`, `vocabulary`) và nhánh không split-pane.
    4. Lưu DB server / đồng bộ đa thiết bị / cho giáo viên xem reading notes của học viên.
    5. Bảng nhiều màu highlight / gạch ngang (strikethrough) đáp án.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Xây engine highlight/ghi chú thuần trên rich-text HTML & plain text không lệch offset, không XSS | P1 |
| 2 | Dựng trải nghiệm IELTS CBT (floating bar, right-click menu, note popover, notes panel, clear all) đạt WCAG AA cả Light/Dark và 3 viewport | P1 |
| 3 | Lưu trữ bền qua reload và xem lại read-only sau nộp bằng `localStorage` riêng (có LRU + cô lập phiên đăng nhập) + hỗ trợ preview in-memory cho Admin | P1 |
| 4 | Đạt 0 regression trên unit test, typecheck, lint, E2E split-pane & preview, và hoàn tất POT 3 viewport + Light/Dark | P1 |

## Extension Trace

Biên giao tiếp giữa UI và tầng lưu trữ đi qua prop `annotations?: ReadingAnnotationConfig` của `QuizReadingSplitLayout` và kiểu `ReadingAnnotation` (`{ id, start, end, note }`):
- **Biến thể kế tiếp khả dĩ**: chuyển lưu trữ từ `localStorage` sang server DB (`PATCH /api/student/attempts/:id/reading-annotations`) để đồng bộ đa thiết bị, hoặc thêm thuộc tính `color?: ReadingHighlightColor` vào `ReadingAnnotation`.
- **Hợp đồng giữ nguyên**: `QuizReadingSplitLayout`, `AnnotatableReadingPassage`, `buildPassageModel`, và `splitLeafByAnnotations` giữ nguyên chữ ký props (`items`, `onChange`, `mode`) và mô hình offset UTF-16. <!-- Updated: Red-Team RT-12 - synced symbol name to buildPassageModel -->
- **Phần cần đổi**: chỉ thay hook adapter ở `apps/student/src/lib/reading-annotations-store.ts` (đổi sang API sync) hoặc mở rộng schema dữ liệu có fallback mặc định; không tạo factory/plugin/config thừa ở v1.
- **Cách chứng minh**: Phase 3 wire cùng 1 prop `annotations` cho 3 chế độ thực tế khác nhau (localStorage edit, localStorage readonly, React state in-memory ở Admin preview).

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Core Reading Annotation Engine & Design Tokens](./phase-01-start.md) | Completed |
| 2 | [Phase 2: AnnotatableReadingPassage UI & QuizReadingSplitLayout Integration](./phase-02-annotatable-passage-ui-and-layout.md) | Completed |
| 3 | [Phase 3: Student Persistence Store & App Wiring](./phase-03-student-persistence-and-app-wiring.md) | Completed |
| 4 | [Phase 4: E2E Verification, Visual/Contrast QA & POT](./phase-04-e2e-verification-and-ui-qa.md) | Completed |

## Success Criteria

- [x] Học viên bôi đen văn bản trong bài đọc (1 đoạn, xuyên `<strong>/<em>`, xuyên `</p><p>`, trong `<li>`/`<td>`, hoặc plain text) có thể bấm **Tô sáng**, **Ghi chú**, hoặc **Bỏ tô sáng** từ cả **floating selection toolbar** lẫn **right-click context menu** (cả desktop lẫn mobile touch có `pointercancel`).
- [x] Click (khi selection collapsed) hoặc bấm Enter/Space vào đoạn đã tô sáng hoặc icon ghi chú mở popover xem/sửa/xoá ghi chú hoặc bỏ tô sáng; không điều hướng nhầm nếu nằm trong `<a>`; `Escape` đóng popover trước mà không đóng nhầm `TestPreviewOverlay` hay cướp `Escape` của `QuizDialog`.
- [x] Header pane "Bài đọc" có nút mở danh sách "Ghi chú" (badge đếm `aria-hidden="true"`, mặc định đóng, click mục nhảy tới đúng `<mark>` không dùng CSS selector interpolation) và nút "Xoá tất cả" có bước xác nhận khi có ≥ 1 mục.
- [x] Highlight + ghi chú tồn tại sau reload trong lúc làm bài (không giật mất ở `QuizResumeDialog`), sống sót sau khi nộp bài để xem read-only ở `$attemptId.detail.tsx` (cùng trình duyệt), tự bỏ qua khi `passageHash` đổi, có LRU cap 25 bài + evict khi `QuotaExceededError`, và tự dọn khi đăng xuất/đổi tài khoản.
- [x] `TestPreviewOverlay` cho phép thử highlight/ghi chú theo từng tab (`key={tab.part}`) trong RAM với 0 network write request, giữ nguyên focus trap modal và reset khi đóng overlay.
- [x] Đạt tương phản WCAG AA ≥ 4.5:1 ở Light & Dark mode (kể cả trong `<blockquote>`), `--reading-highlight-border` ≥ 3.0:1; không tràn ngang ở 1440×900, 768×1024, 375×812 (và 320px reflow).
- [x] Toàn bộ gates cục bộ pass: `pnpm check`, `pnpm check-types`, unit tests (`@teacher-os/ui`, `student`, `admin`, `web` cho `RichTextBody`), và E2E reading spec liên quan.

## Red Team Review

### Session — 2026-11-25
**Findings:** 13 deduplicated from 3 adversarial reviewers — Security Adversary, Assumption Destroyer, Failure Mode Analyst (13 accepted, 0 rejected)
**Severity breakdown:** 6 Critical, 5 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `AnnotatableReadingPassage` drops `RICH_TEXT_CONTENT_CLASSES`, `whitespace-pre-line`, and `<table>` overflow wrapper | Critical | Accept | Phase 2 |
| 2 | Portal `z-[60]` + missing outside-click + capture `Escape` conflicts with `QuizDialog` (`z-50`) and breaks `TestPreviewOverlay` focus trap & tab switch | Critical | Accept | Phase 2, Phase 3 |
| 3 | Missing `pointercancel` freezes mobile touch selection; right-click `pointerdown`/`pointerup` & `selectionchange` race | Critical | Accept | Phase 2 |
| 4 | Sanitizer fail-open guard (`typeof document`), missing `sanitizeHref`, un-downgraded `<a>`, unbounded `colspan`/`rowspan` | Critical | Accept | Phase 1, Phase 2 |
| 5 | `localStorage` poisoning: CSS selector injection, `NaN`/float offsets, prototype key collision, unbounded raw JSON | Critical | Accept | Phase 1, Phase 2, Phase 3 |
| 6 | Vitest env mismatch (`apps/student` runs `node`; `packages/ui` runs `jsdom` making SSR test phantom) | Critical | Accept | Phase 2, Phase 3 |
| 7 | Drag/double-click inside `<mark>` hijacked by `<mark onClick>`; nested interactive inside `<a>` opens external tab | High | Accept | Phase 2 |
| 8 | `upsertNoteSpan` partial-overlap unspecified → silent note drop via `normalizeReadingAnnotations` | High | Accept | Phase 1, Phase 2 |
| 9 | WCAG contrast failures: `mark.reading-hl` `color: inherit` inside `<blockquote>` (< 4.5:1) & Light `--reading-highlight-border` (2.92:1 < 3.0:1) | High | Accept | Phase 1 |
| 10 | 3 distinct scroll containers + virtual keyboard obscuring Note Popover on mobile 375×812 | High | Accept | Phase 2 |
| 11 | Cross-account reading note leak on shared machines + unbounded `localStorage` growth threatening `QuizAttemptStore.writeMirror()` | High | Accept | Phase 3 |
| 12 | Resume dialog flicker (`QuizTakeView`), pending-passage hazard (`AttemptDetailScreen`), `buildPassageAst` symbol mismatch in `plan.md` | Medium | Accept | `plan.md`, Phase 3 |
| 13 | Verify commands (`test -- <path>` in pnpm 10), missing `apps/web` `RichTextBody` test gate, wrong E2E spec prefix | Medium | Accept | `plan.md`, Phase 1–4 |

### Whole-Plan Consistency Sweep (Red-Team + Validation)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-annotatable-passage-ui-and-layout.md`, `phase-03-student-persistence-and-app-wiring.md`, `phase-04-e2e-verification-and-ui-qa.md`
- Decision deltas checked: 13 Red-Team deltas + 3 Validation Session 1 decisions
- Reconciled stale references: 5 (`buildPassageAst` → `buildPassageModel`, `color: inherit` → `color: var(--foreground)`, `z-[60]` → modal-aware portal & z-index, `pnpm --filter <pkg> test -- <path>` → without `--`, `apps/e2e/specs/...` → `specs/...`)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-25
**Trigger:** Pre-implementation plan validation & Red-Team adjudication (`/ak-vibe --ship --beta --advice` for issue #881)
**Questions asked:** 3

### Verification Results
- **Tier:** Standard (4 phases; Fact Checker + Contract Verifier + Flow Tracer via Red-Team)
- **Claims checked:** 34
- **Verified:** 26 | **Failed (now remediated by RT-1..RT-13):** 8 | **Unverified:** 0

#### Questions & Answers

1. **[Risks / Red-Team]** Red-Team Review phát hiện 13 lỗi kỹ thuật/bảo mật có bằng chứng mã nguồn (xung đột portal/focus trap ở TestPreviewOverlay & QuizDialog, kẹt touch pointercancel, mất RichText classes, tương phản blockquote, chống poisoning & rò localStorage khi đổi tài khoản). Bạn muốn xử lý thế nào?
   - Options: (Recommended) Đồng ý, áp dụng toàn bộ 13 phát hiện và tiếp tục triển khai | Xem chi tiết từng phát hiện trước khi áp dụng | Bỏ qua Red-Team, giữ kế hoạch ban đầu
   - **Answer:** (Recommended) Đồng ý, áp dụng toàn bộ 13 phát hiện và tiếp tục triển khai
   - **Rationale:** Đóng toàn bộ lỗ hổng bảo mật, a11y, mobile touch, focus trap và quota trước khi viết code.

2. **[Architecture / Persistence]** Phạm vi lưu trữ highlight và ghi chú bài đọc Reading ở v1?
   - Options: (Recommended) Lưu cục bộ trên trình duyệt (localStorage theo attemptId + LRU tối đa 25 bài + tự xoá khi đăng xuất/đổi tài khoản; sống qua reload và xem lại read-only sau nộp trên cùng máy) — 0 DB migration, tách biệt hoàn toàn khỏi answer mirror | Lưu trên server DB (thêm cột/bảng + PATCH API) — đồng bộ chéo thiết bị và giáo viên có thể xem sau này, nhưng cần migration D1 và thêm contract API
   - **Answer:** (Recommended) Lưu cục bộ trên trình duyệt (localStorage theo attemptId + LRU tối đa 25 bài + tự xoá khi đăng xuất/đổi tài khoản; sống qua reload và xem lại read-only sau nộp trên cùng máy) — 0 DB migration, tách biệt hoàn toàn khỏi answer mirror
   - **Rationale:** Giữ gọn scope v1 không đụng DB migration/API, vẫn giữ được trải nghiệm đầy đủ và cô lập an toàn trên máy dùng chung.

3. **[Tradeoffs / UX]** Màu tô sáng (highlight) trên bài đọc ở v1 nên chọn phương án nào?
   - Options: (Recommended) 1 màu vàng/hổ phách chuẩn IELTS CBT (đạt WCAG AA cả Light/Dark, gọn trên mobile 375px và bám sát DESIGN.md) | Nhiều màu (vàng / xanh lá / hồng) để học viên tự phân loại từ khoá — thêm nút chọn màu trên thanh công cụ nổi và bảng token Light/Dark cho từng màu
   - **Answer:** (Recommended) 1 màu vàng/hổ phách chuẩn IELTS CBT (đạt WCAG AA cả Light/Dark, gọn trên mobile 375px và bám sát DESIGN.md)
   - **Rationale:** Giữ UI tối giản theo DESIGN.md, không chật trên 375px và bám sát IELTS CBT thật.

#### Confirmed Decisions
- Red-Team remediation: áp dụng toàn bộ 13 phát hiện (RT-1..RT-13) vào cả 4 phase.
- Persistence v1: client-side `localStorage` (`quiz-reading-annotations:{attemptId}`) + `passageHash` + LRU 25 bài + auto-clear trong `syncActiveStudentUser`.
- Highlight palette v1: 1 màu vàng/hổ phách chuẩn IELTS CBT đạt WCAG AA cả Light/Dark.

#### Action Items
- [x] Cập nhật Phase 1–4 với đầy đủ 13 điểm sửa Red-Team và Verify commands chính xác.

#### Impact on Phases
- Phase 1: Bổ sung `color: var(--foreground)`, đậm `--reading-highlight-border` Light, `typeof document` + `sanitizeHref` + `colspan`/`rowspan` cap `1..50`, `Number.isSafeInteger` + `id` allowlist, luật overlap `upsertNoteSpan`, và Verify `apps/web` `rich-text-body.test.tsx`.
- Phase 2: Bổ sung `RICH_TEXT_CONTENT_CLASSES`/`whitespace-pre-line`/`<table>` overflow wrapper, modal-aware portal + outside-click + `Escape` guard + internal focus trap, `pointercancel` + `e.button === 0` + union state, `isCollapsed` check + `insideAnchor` handling, ancestor-filtered capture `scroll` + `visualViewport`, no CSS selector interpolation, và real Node SSR test.
- Phase 3: Bổ sung `// @vitest-environment jsdom`, raw JSON cap 256 KB, LRU 25 keys + `QuotaExceededError` eviction retry, `clearAllReadingAnnotationsStorage()` trong `syncActiveStudentUser`, sync initial read cho `QuizTakeView` qua `QuizResumeDialog`, `quizQuery.data ? attempt.id : null` ở `AttemptDetailScreen`, và `key={tab.part}` ở `TestPreviewOverlay`.
- Phase 4: Sửa đường dẫn E2E verify thành `specs/student-reading-highlight-notes.spec.ts` và kiểm thêm tương phản/320px reflow.

<!-- slug: 881-reading-highlight-notes -->
