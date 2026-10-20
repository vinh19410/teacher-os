---
title: "Vocab lesson detail: bỏ 3 thẻ thống kê, chỉ giữ 2 nút Ôn tập / Bắt đầu học; thống kê gom về dashboard /vocab"
description: "Trang chi tiết bài học từ vựng (/vocab/$deckId) bỏ hàng thẻ Từ mới / Đến hạn ôn / Đã thuộc, thay CTA tự-chọn-chế-độ bằng 2 nút rõ ràng Ôn tập và Bắt đầu học; số Từ mới tổng được thêm vào hàng thống kê tổng ở /vocab."
status: pending
priority: P2
effort: 3h
issue: 372
branch: ai-handle-issue-372
tags: [feature, frontend, vocab, student-app, ui]
blockedBy: []
blocks: []
created: 2026-10-20
---

# Vocab lesson detail: chỉ giữ 2 nút Ôn tập / Bắt đầu học

## Overview

Trang chi tiết bài học `/vocab/$deckId` (Student Portal) hiện có một hàng 3 thẻ thống kê **theo từng bài** — *Từ mới*, *Đến hạn ôn*, *Đã thuộc (L2+)* — và một nút CTA duy nhất tự đổi nhãn/chế độ (`Học từ mới (n)` → `Ôn tập (n)` → `Ôn lại bộ từ`). Yêu cầu:

1. **Bỏ hàng 3 thẻ thống kê** ở trang bài học (`apps/student/src/routes/_auth/vocab/$deckId.tsx`, khối `grid grid-cols-3`).
2. **Chỉ giữ 2 hành động**: **Ôn tập** và **Bắt đầu học**, hiển thị cạnh nhau ở header (thay nút CTA tự-chọn hiện tại).
3. **Thống kê là thống kê tổng ở bên ngoài**, không theo từng bài: dashboard `/vocab` đã có hàng thống kê tổng (Đến hạn ôn, Streak, Đã thuộc, Thành thạo) — bổ sung thẻ **Từ mới** tổng (cộng `newCount` của mọi bộ đang học, tính client-side từ `overview.decks`, **không đổi contract API**).

Phân bổ chế độ hiện nằm trong `VocabSessionView` (`hasNewCards ? "learn" : "review"`). Để 2 nút đi đúng chế độ, route session nhận thêm search param `mode=learn|review` và truyền xuống `VocabSessionView`; không có `mode` → giữ hành vi tự chọn cũ (tương thích link cũ/bookmark).

## Hành vi 2 nút

| Nút | testid | Nhãn | Điều hướng | Disabled khi |
|---|---|---|---|---|
| Bắt đầu học (primary) | `vocab-start-learn-btn` | `Bắt đầu học (n)` khi n từ mới > 0, ngược lại `Bắt đầu học` | `/vocab/$deckId/session?mode=learn` (+`course` nếu có) | Không còn từ `state === "new"` |
| Ôn tập (outline) | `vocab-start-review-btn` | `Ôn tập (n)` khi n từ đến hạn > 0, ngược lại `Ôn tập` | `/vocab/$deckId/session?mode=review` (+`course`) | Chưa có từ nào `state === "review"` (bài mới tinh) |

- Ôn tập khi có từ đã học nhưng chưa đến hạn → vẫn cho ôn (engine dùng `selectReviewCards(..., { allowAllWhenNoneDue: true })` như nhánh "Ôn lại bộ từ" hiện tại).
- Disabled dùng `<button disabled>` (hoặc `aria-disabled` + không điều hướng) kèm `title` giải thích ngắn: "Đã học hết từ mới" / "Chưa có từ nào để ôn".
- Bộ từ rỗng (`cards.length === 0`) → không render 2 nút (như hiện tại).
- Giữ nguyên: back-link, tiêu đề, gợi ý `Đợt ôn tiếp theo sau …`, bảng "Danh sách từ".

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bỏ hàng 3 thẻ thống kê + testid `vocab-deck-new-count`/`due-count`/`learned-count` ở `/vocab/$deckId` | P2 |
| 2 | 2 nút Ôn tập / Bắt đầu học theo bảng trên; session route nhận `mode` và engine tôn trọng nó | P2 |
| 3 | Dashboard `/vocab` thêm thẻ **Từ mới** tổng (`vocab-overview-new-count`) trong hàng thống kê tổng, layout responsive 5 thẻ | P2 |
| 4 | E2E/unit cập nhật, gates local pass, screenshot 3 viewport | P2 |

## Non-goals

- Không đổi contract/API server (`vocabOverviewSchema`, session data) — tổng Từ mới tính từ `decks[].newCount`.
- Không đổi engine SRS (`LearnSession`/`ReviewSession`), không đổi trang lưới bài học `/vocab/courses/$courseId`.
- Không đổi màn tổng kết phiên (`VocabSummary`) — thống kê sau phiên vẫn giữ.
- Không thêm thống kê theo khóa học.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [UI: 2 nút ở lesson detail, session `mode`, thẻ Từ mới tổng](./phase-01-lesson-ctas-overview-stat.md) | Pending |
| 2 | [Tests, E2E & verification gates](./phase-02-tests-gates.md) | Pending |

## Acceptance criteria

- [ ] `/vocab/$deckId` không còn thẻ Từ mới / Đến hạn ôn / Đã thuộc; header chỉ có 2 nút Ôn tập và Bắt đầu học
- [ ] Bắt đầu học → session chế độ học từ mới (`vocab-learn-intro` hiện); Ôn tập → session chế độ ôn (`vocab-learn-intro` không hiện, prompt ôn tập hiện) kể cả khi bài vẫn còn từ mới
- [ ] Nút disabled đúng điều kiện (hết từ mới / chưa có từ để ôn), có `title` giải thích
- [ ] `?course=` được giữ khi vào/thoát session; thoát session không mang `mode` về trang bài học
- [ ] Mở `/vocab/$deckId/session` không có `mode` → hành vi cũ (tự chọn learn nếu còn từ mới)
- [ ] `/vocab` có thẻ Từ mới tổng = tổng `newCount` các bộ đang học
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, e2e vocab specs pass; screenshot 1440×900 / 768×1024 / 375×812

## Risks

- E2E cũ assert `vocab-deck-new-count` và click `vocab-start-session-btn` (4 spec) — phải đổi theo ngữ cảnh learn/review, xem Phase 2.
- `mode=learn` khi không còn từ mới (URL gõ tay) → fallback sang review thay vì engine rỗng.
