---
title: Ship TOS-8 đánh dấu tất cả Có mặt và lưu điểm danh hàng loạt
date: 2026-10-26
summary: "Ship issue #441: nút điền nhanh, hộp xác nhận lưu thiếu, tự mở ca kế tiếp trên /attendance; PR vào develop (beta)"
---

# Ship TOS-8 đánh dấu tất cả Có mặt và lưu điểm danh hàng loạt

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #441 theo plan `plans/261026-1533-tos-8-mark-all-present/`. Branch `feat/tos-8-mark-all-present` rebase lên develop sau khi TOS-7 (#440, PR #444) merge — base SHA 55585e96 giữ nguyên trong merge commit nên rebase `--onto` sạch, chỉ xử lý 1 conflict formatting ở `attendance-session-row.tsx`.

## Decision
- Red-team 3 reviewer song song trên code thật TOS-7: 24 findings → 12 accept / 2 reject. Quan trọng nhất: auto-advance tính ca kế tiếp từ dữ liệu **sau** refetch (tránh tái mở ca vừa lưu — Critical), confirm modal tính entries bằng pure helper `markAllPresentState` (tránh `toSaveEntries` throw trên stale state), nút điền nhanh disable khi ca đã `recorded` (không đè lịch sử "Chưa rõ").
- Kongming 2 lượt: chọn phương án branch từ head TOS-7 (không chờ merge, không sweep commit) và GO kèm 4 điều kiện (`actionablePending` loại legacy, `latestSearchRef` guard, focus-sau-đóng-modal, `role="status"`).
- Local code review (2 agent fresh-context): CR-Bugs F1 cao nhất — route truyền `busy` khoá Lưu/điền nhanh/modal của mọi ca khi một ca đang bay, hết đường nuốt save im lặng cross-row.
- `min-h-11` = 38.5px vì root font-size app là 14px → đổi `min-h-[44px]` tuyệt đối cho 4 nút chạm mobile.

## Verification
- Unit 40/40 (draft 8, row 13, route 19); biome check . exit 0; tsc sạch.
- e2e `specs/daily-attendance.spec.ts` 6/6: AC-002 (modal + empty-state mới), AC-003 bulk giữ lựa chọn + API verify excused/absent, modal 2 người thiếu, NFR-008 5 lớp keyboard ≤ 120s, 3 viewport + touch target 44px.
- Screenshot: `plans/261026-1533-tos-8-mark-all-present/screenshots/`.

## Open
- Người duyệt xem 2 quyết định reject của red-team: không thêm confirm/undo cho nhánh bulk-then-save (trái D1/D2 đã chốt), không rework giữ nháp khi 409 (scope TOS-7).
- Scenario e2e "ca recorded còn Chưa rõ" không dựng được qua public API — đã cover unit test.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
