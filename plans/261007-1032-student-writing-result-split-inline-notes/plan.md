---
title: "Màn kết quả Writing: chia 2 khung trái/phải, ghi chú hiện inline"
description: "Ở màn kết quả học viên, bài Writing đã chấm hiện thành 2 khung: bài viết bên trái, kết quả chấm bên phải. Ghi chú của giáo viên hiện ngay sau đoạn được highlight thay cho danh sách riêng dưới bài."
status: completed
priority: P2
effort: "4h"
issue: 336
branch: develop
tags: [feature, frontend, student, grading]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Màn kết quả Writing: chia 2 khung trái/phải, ghi chú hiện inline

## Overview

Màn kết quả học viên `/learn/quizzes/attempt/$attemptId` (route [`$attemptId.tsx`](../../apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx)) hiện bài Writing đã chấm thành một cột rộng 720px, xếp từ trên xuống:

1. Dòng "Bạn đã nộp bài lúc…".
2. "Bài viết của bạn": số từ và essay có highlight đánh số (`EssayWithHighlights`).
3. Danh sách "Ghi chú của giáo viên" (`EssayAnnotationList`), mỗi mục là trích đoạn kèm ghi chú.
4. Card "Kết quả chấm của giáo viên" (`AttemptGradeCard`): band tổng, 4 tiêu chí, nhận xét.

Học viên phải cuộn qua essay rồi dò số ở danh sách để biết ghi chú nào của đoạn nào, và cuộn tiếp mới thấy band. Plan này đổi thành:

- **Khung trái:** bài viết, mỗi ghi chú hiện ngay sau đoạn được highlight (đọc liền mạch, không cần bấm).
- **Khung phải:** kết quả chấm (band, tiêu chí, nhận xét), dính ở đầu màn hình khi cuộn essay.
- Bỏ danh sách "Ghi chú của giáo viên" vì nội dung đã nằm inline.

```text
≥ 921px (app)                                         < 921px
┌──────────────────────────────────────────────────┐  ┌──────────────────────┐
│ Bạn đã nộp bài lúc …                             │  │ Bạn đã nộp bài lúc … │
├─────────────────────────────┬────────────────────┤  │ Bài viết của bạn     │
│ Bài viết của bạn · 182 từ   │ Kết quả chấm của   │  │ … [clear]¹ ┊Đúng từ.┊│
│ The graph shows a [clear]¹  │ giáo viên (sticky) │  │ …                    │
│ ┊Đúng từ.┊ upward trend,    │ 6.5  Band tổng     │  ├──────────────────────┤
│ [rising]² ┊Dùng increasing.┊│ Task … 6.0         │  │ Kết quả chấm …       │
│ …                           │ Nhận xét …         │  └──────────────────────┘
└─────────────────────────────┴────────────────────┘
```

## Key Decisions (user chốt 2026-10-07)

1. **Ghi chú hiện ngay sau highlight.** Sau mỗi `<mark>` có ghi chú khác rỗng (chuỗi rỗng **hoặc chỉ khoảng trắng** — contract chỉ ràng buộc `max(1000)`, không trim), chèn một `<span data-testid="essay-inline-note">` chứa ghi chú, cùng dòng chảy với văn bản. Highlight không có ghi chú chỉ có mark, không chèn gì.
2. **Bỏ danh sách "Ghi chú của giáo viên"** ở màn học viên. Xoá `apps/student/src/components/quiz/essay-annotation-list.tsx`. Trang chấm của giáo viên giữ nguyên danh sách của nó (danh sách đó là chỗ sửa/xoá highlight).
3. **Ghi chú inline là prop opt-in `inlineNotes` của `EssayWithHighlights`** (mặc định `false`). Trang chấm của giáo viên không bật, nên bất biến "mỗi phần tử render đúng một text node, offset = `data-start` + caret" mà phép bôi đen dựa vào vẫn giữ nguyên. Doc comment ghi rõ: không bật `inlineNotes` ở essay bôi đen được.
4. **Kiểu hiển thị ghi chú inline** theo token sẵn có, không thêm màu: viền trái `border-l-2 border-warn` (cùng họ màu với nền highlight `bg-warn-soft`), nền `bg-surface`, chữ `text-fg-2 text-sm`, `rounded-sm px-1.5 py-0.5 mx-1`, `box-decoration-clone` để ghi chú xuống dòng vẫn giữ nền/viền ở mỗi dòng. Phía trước có `<span className="sr-only">Ghi chú {n}: </span>` để trình đọc màn hình biết đây là ghi chú của highlight số n. Plain text qua JSX text node như hiện tại (không HTML, không XSS).
5. **Chỉ chia 2 khung khi bài Writing đã có điểm** (`summary.grade` khác null). Bài chưa chấm giữ một cột 720px như hiện nay (khung phải sẽ trống). Speaking và Reading/Listening không đổi.
6. **Breakpoint `app` (≥ 921px)**, cùng breakpoint với trang chấm của giáo viên (`max-app:grid-cols-1` ở [grading `$attemptId.tsx:194`](../../apps/web/src/routes/_auth/grading/$attemptId.tsx)). Tỉ lệ cột `minmax(0,3fr) minmax(0,2fr)`, `gap-6`, `items-start`. Khung `main` nới từ `max-w-[720px]` lên `max-w-[1120px]` khi chia 2 khung. Dưới 921px xếp dọc theo thứ tự DOM: bài viết trước, kết quả chấm sau (khớp thứ tự đọc trái → phải).
7. **Khung phải dính khi cuộn:** `app:sticky app:top-20` (header runtime cao `h-14` + khoảng thở) truyền qua `className` từ route. Toàn bộ hành vi vùng cuộn gói trọn trong prop `scrollable` của `AttemptGradeCard`: `app:max-h-[calc(100svh-6rem)] app:overflow-y-auto app:overscroll-contain` (repo precedent: `message-scroller.tsx`, `attachment.tsx`) + focus ring theo `DESIGN.md` + `tabIndex={0}` **chỉ khi** `matchMedia("(min-width: 921px)")` khớp (pattern `APP_MEDIA_QUERY` của `annotatable-essay.tsx`) — tránh dead tab stop dưới 921px nơi card không cuộn. `feedback` trong card thêm `break-words` để chuỗi dài không tràn cột `2fr`.
8. **`AttemptGradeCard` nhận thêm 2 prop:** `className` (gộp bằng `cn` — nhánh Writing truyền `app:sticky app:top-20 min-w-0` để thêm sticky và chống tràn cột `2fr`) và `scrollable` (Key Decision 7). **`mt-6` giữ nguyên ở cả hai nhánh** — `h2` "Bài viết của bạn" cũng có `mt-6` nằm *bên trong* section trái (grid item là BFC, margin không collapse ra ngoài), nên giữ cả hai làm đỉnh 2 khung thẳng hàng. Nhánh Speaking gọi không đổi.

## Non-Goals

- Đổi trang chấm của giáo viên (`apps/web`), API, contract hoặc dữ liệu `annotations`.
- Ghi chú dạng popover/tooltip, ghi chú bên lề (kiểu Google Docs) hoặc gom ghi chú cuối đoạn văn.
- Đồng bộ cuộn giữa highlight và khung phải, bấm highlight để nhảy tới ghi chú.
- Kéo đổi độ rộng 2 khung.
- Đổi bố cục màn kết quả Speaking, Reading/Listening hoặc bài Writing chưa chấm.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Ghi chú inline trong `EssayWithHighlights`](./phase-01-inline-notes-shared-component.md) | pending | 1h |
| 2 | [Màn kết quả Writing chia 2 khung + bỏ danh sách ghi chú](./phase-02-student-split-layout.md) | pending | 1.5h |
| 3 | [E2E + CHANGELOG + gate cuối](./phase-03-e2e-docs-gates.md) | pending | 1.5h |

Chạy tuần tự 1 → 2 → 3. Phase 2 dùng prop `inlineNotes` của Phase 1.

## Success Criteria

- [x] Ở ≥ 921px, bài Writing đã chấm hiện 2 khung: bài viết bên trái, "Kết quả chấm của giáo viên" bên phải; cuộn essay dài thì khung phải vẫn ở đầu màn hình.
- [x] Mỗi highlight có ghi chú hiện ghi chú ngay sau đoạn tô (`mark[data-n="1"] + [data-testid="essay-inline-note"]`); highlight không có ghi chú không chèn gì.
- [x] Không còn danh sách "Ghi chú của giáo viên" (`essay-annotation-list`) ở màn học viên.
- [x] Dưới 921px (768×1024, 375×812) xếp dọc: bài viết rồi kết quả chấm, không tràn ngang; ghi chú dài xuống dòng vẫn giữ nền và viền.
- [x] Bài Writing chưa chấm, Speaking, Reading/Listening hiện như cũ.
- [x] Trang chấm của giáo viên không đổi: không có `essay-inline-note`, bôi đen tạo highlight vẫn đúng offset (e2e `teacher-essay-annotations` xanh).
- [x] Ghi chú chứa HTML vẫn render dạng text.
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter student test` và e2e `teacher-essay-annotations`, `student-quiz-take-review`, `teacher-grade-submission` (ports 8100/8101/8103) đều xanh. PR kèm screenshot 3 viewport.

## Risks

- **Bật nhầm `inlineNotes` ở trang chấm giáo viên** sẽ làm bôi đen **im lặng** (span ghi chú chen giữa các text node → selection vắt qua nó khiến `offsetOf` trả `null` → `readSelection` trả `null` → popover không bao giờ hiện; không phải "offset sai"). Giảm thiểu: prop mặc định `false`, doc comment cảnh báo, test web khẳng định `EssayWithHighlights` mặc định không render `essay-inline-note` **và** `AnnotatableEssay` (trang chấm) không truyền prop.
- **Card kết quả dài hơn màn hình khi sticky.** Giảm thiểu: `max-h` + `overflow-y-auto` + `overscroll-contain` + focusable bằng bàn phím (Key Decision 7); e2e chấm với feedback dài và assert card cuộn được (Phase 3).
- **Ghi chú dài làm vỡ nhịp đọc essay.** Ghi chú tối đa 1000 ký tự (`QUIZ_ANNOTATION_NOTE_MAX`); `text-sm` + nền khác giúp tách khỏi văn bản. Chấp nhận ở v1 theo lựa chọn của user.
- **`position: sticky` chết âm thầm nếu ancestor thêm `overflow` không phải `visible`.** Chain ancestor hiện tại sạch (`main` → `_auth/route.tsx` là Outlet trần); e2e cuộn thật và assert vị trí card để khoá hành vi (Phase 3).

## Dependencies

- Xây trên #332 (highlight + ghi chú, đã merge `develop` ở `b076e46`, `4d6cf69`).
- PR đích: `develop`. CI chỉ chạy cho `main`, gate là bộ lệnh local ở Phase 3 (theo `AGENTS.md`).

## Red Team Review

### Session — 2026-10-07 (vibe run, 3 reviewer: Security Adversary + Failure Mode Analyst + Assumption Destroyer)
**Findings:** 12 sau dedupe (5 accepted nguyên trạng/kèm điều chỉnh, 7 merged & accepted, 0 Critical)
**Severity breakdown:** 0 Critical, 5 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | KD8 mâu thuẫn Task 3 về `mt-6` (hai layout lệch 24px, không gate phân biệt) | High | Accept — chốt giữ `mt-6` cả hai cột, KD8 viết lại | plan.md KD8, phase-02 |
| 2 | Sticky (chủ đề cốt lõi) không có test — mọi gate xanh khi sticky chết (ancestor `overflow-x-hidden`) | High | Accept — e2e cuộn thật assert `y` card ≈ `top-20` trước/sau scroll | phase-03 |
| 3 | Card cuộn được không được test dù `feedback` không có `max()` | High | Accept — unit test `scrollable` markup + e2e feedback dài assert `scrollHeight > clientHeight` | phase-02, phase-03 |
| 4 | `max-w-[1120px]` không có test — 2 cột nhồi trong 720px vẫn pass mọi gate | High | Accept — e2e assert `essay-frame` width ≥ 500px @1280 | phase-03 |
| 5 | Note chỉ-toàn-khoảng-trắng qua gate `!== ""` → chip rỗng có viền | Medium | Accept — gate `.trim() !== ""` + test whitespace | phase-01 |
| 6 | `tabIndex={0}` vô điều kiện → dead tab stop dưới 921px | Medium | Accept — `tabIndex` gated theo `matchMedia` 921px, `scrollable` gói trọn max-h/overflow/overscroll/tabIndex/focus-ring | plan.md KD7, phase-02 |
| 7 | Thiếu `overscroll-contain` trên nested scroller (repo có precedent) | Medium | Accept — thêm vào `scrollable` | plan.md KD7, phase-02 |
| 8 | E2E layout so biên section thay vì cặp ý nghĩa (h2 ↔ card), ngưỡng 40px nuốt cả hai nhánh `mt-6` | Medium | Accept — assert `y` của `h2#essay-heading` ≈ `y` của `attempt-grade` | phase-03 |
| 9 | Điều kiện chia khung nhân bản 3 nơi, helper hard-code `"speaking"` → drift khi thêm skill | Medium | Accept — `AttemptSummaryBody` dùng `isSplitWritingResult` làm nguồn sự thật duy nhất | phase-02 |
| 10 | Mô hình rủi ro sai (popover im lặng, không phải offset sai); test `textContent` không bảo vệ bất biến cấu trúc | Medium | Accept — sửa wording Risks; thêm test `AnnotatableEssay` không render `essay-inline-note` | plan.md Risks, phase-01 |
| 11 | `min-w-0` thiếu ở card phải + `feedback` không `break-words` → tràn ngang ở dải 921–1168px; dải hẹp nhất (960px) không nằm trong verify | Medium | Accept — `min-w-0` + `break-words`; e2e `scrollWidth <= innerWidth` @960 + screenshot 960 | plan.md KD7/KD8, phase-02, phase-03 |
| 12 | Bất biến trang chấm chỉ còn default-false làm guard (e2e selection không vắt qua note span) | Medium | Accept (điều chỉnh) — test `AnnotatableEssay` không truyền prop thay cho selection-crossing test jsdom (phức tạp, thấp giá trị) | phase-01 |

**Rejected:** 0 (một phần finding 12 đổi phương án sửa).

### Whole-Plan Consistency Sweep

Sau khi áp findings: KD7/KD8 viết lại → đối chiếu phase-02 task 1/3 (prop `scrollable` + `className` + `mt-6` giữ nguyên — khớp), phase-03 (assert h2↔card, sticky, width, 960px — khớp), Risks (failure mode `offsetOf` → `readSelection` → popover im lặng — khớp `annotatable-essay.tsx:53-84`), Success Criteria #1/#6 không đổi ý nghĩa, gates bổ sung nằm ở phases. Không còn mâu thuẫn.

## Validation Log

### Session 1 — 2026-10-07

User chốt 2 quyết định trước khi soạn plan:
1. Ghi chú hiện ngay sau highlight (không phải cuối đoạn văn, không phải popover).
2. Bỏ danh sách "Ghi chú của giáo viên" dưới bài viết.

Các mặc định do người soạn plan chọn (không cần hỏi, ghi lại để review): chỉ chia khung khi đã chấm; breakpoint `app` 921px như trang chấm giáo viên; khung phải sticky; dưới breakpoint bài viết đứng trước.

### Verification Results
- Tier: kiểm bằng đọc code trực tiếp.
- Đã xác minh: nhánh Writing ở `AttemptSummaryBody` render `EssayWithHighlights` + `EssayAnnotationList` + `AttemptGradeCard` (`$attemptId.tsx:159-191`); `main` đang `max-w-[720px]` (`$attemptId.tsx:247`); header runtime `sticky top-0 h-14` (`quiz-runtime-header.tsx:41`); student import `@teacher-os/ui/globals.css` (`apps/student/src/index.css:1`) nên có biến thể `app:` từ `--breakpoint-app: 921px` (`globals.css:219`); token `--color-warn`, `--color-warn-soft`, `--color-fg-2`, `--color-surface` có trong `globals.css:138-156`; `EssayAnnotationList` chỉ dùng ở route student; `AttemptGradeCard` dùng ở nhánh Speaking (`:149`) và Writing (`:185`), class `mt-6` cứng (`attempt-grade-card.tsx:27`); test component `packages/ui` chạy trong `apps/web/src/components/ui/essay-with-highlights.test.tsx`; e2e kiểm `essay-annotation-list` ở `teacher-essay-annotations.spec.ts:212,236`.
