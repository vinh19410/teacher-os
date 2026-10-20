---
title: "feat(#372): vocab lesson detail 2 nút Ôn tập / Bắt đầu học"
date: 2026-10-20
summary: "Bỏ 3 thẻ thống kê theo bài ở /vocab/$deckId, thay CTA tự chọn bằng 2 nút rõ chế độ (?mode=learn|review), thẻ Từ mới tổng trên dashboard /vocab; engine rebuild theo mode, disabled + title/aria-label, fallback review khi hết từ mới"
---

# feat(#372): vocab lesson detail chỉ giữ 2 nút Ôn tập / Bắt đầu học

## Why
- CTA cũ tự đổi nhãn/chế độ (`Học từ mới (n)` → `Ôn tập (n)` → `Ôn lại bộ từ`) khiến học viên không chủ động chọn học hay ôn; 3 thẻ thống kê theo từng bài lặp thông tin đã có ở dashboard tổng.

## What changed
- `$deckId.tsx`: bỏ grid 3 thẻ (`vocab-deck-new/due/learned-count`), thay CTA bằng nhóm 2 nút — **Ôn tập** (outline, `vocab-start-review-btn`, disabled khi chưa có từ `state=review`, title "Chưa có từ nào để ôn", label kèm số đến hạn) và **Bắt đầu học** (primary, `vocab-start-learn-btn`, disabled khi hết từ mới, title "Đã học hết từ mới", label kèm số từ mới); `aria-label` gộp lý do cho nút disabled; `?course=` giữ khi vào session.
- `$deckId.session.tsx`: `validateSearch` thêm `mode=learn|review` (giá trị lạ → undefined → hành vi cũ); `handleExit` vẫn chỉ mang `course` về trang bài học.
- `vocab-session-view.tsx`: prop `mode?: "learn" | "review"`; `instanceKey` gồm `mode ?? "auto"` (red-team bắt được: đổi `?mode` cùng mount không remount route — engine phải rebuild); `useLearn = mode === "review" ? false : hasNewCards` (mode=learn hết từ mới → fallback review qua `allowAllWhenNoneDue`); guard không replay phản hồi buffer vào engine đã swap.
- `index.tsx` (/vocab): thẻ **Từ mới** tổng (`vocab-overview-new-count`, reduce `decks[].newCount` client-side, không đổi API), stats row `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`.
- Tests: unit 5 case mode (force-review/learn/legacy/fallback/rebuild-cùng-mount); e2e 3 spec đổi sang testid mới, assert `toHaveCount(0)` thẻ cũ, URL session qua `searchParams` (thay regex cứng), pin disabled+title ở 3 ngữ cảnh, dashboard "Từ mới 3".

## Verification
- `pnpm check` ✓ (35 warnings pre-existing), `pnpm check-types` ✓ 7/7, `pnpm --filter student test` ✓ 293/293 (11 test file vocab-session-view gồm 5 case mode mới).
- E2E: vocab-srs + vocab-hub-suggestion + vocab-library-clone ✓ 9/9 sau review fix; full suite ✓ trên cây đã merge develop (#374).
- Screenshot 1440×900 / 768×1024 / 375×812: deck mới tinh (Ôn tập disabled), deck một phần đã học (cả 2 enabled), dashboard 5 thẻ — `plans/261020-1058-vocab-lesson-detail-two-ctas/screenshots/`; focus Tab: nút disabled bị skip, nút enabled có focus ring.

## Notes
- Review local (fresh-context agent): PASS — I1 (pin disabled/title bằng e2e) đã sửa; M1 stale-closure replay đã guard; M2 aria-label đã thêm; M3 plan status sync.
- Card state là enum nhị phân `new|review` (contracts.ts:2624) — không có state thứ ba làm cả 2 nút cùng disabled.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
