---
title: "Ship gộp trang /assignments (issue #267)"
date: 2026-09-25
summary: "Thực thi plan 260925-0337 qua ak-vibe (--ship --beta) trên branch refactor/merge-assignments-bank: port UI bank vào /assignments, xoá bank.tsx, verify xanh 728 unit + 84 e2e, target develop"
---

# Ship gộp trang /assignments (issue #267)

## What happened

Thực thi `plans/260925-0337-merge-assignments-bank/plan.md` qua ak-vibe pipeline (`--ship --beta`), branch `refactor/merge-assignments-bank`, target `develop`, issue #267.

- Port UI bank vào `/assignments` (index.tsx): filter skill/part, search, preview aside (đổi tên `BankPreviewAside` → `PromptPreviewAside`), StatusTag.
- Xoá `bank.tsx` + `bank.test.tsx` + 4 tham chiếu nav.
- Viết lại `index.test.tsx`: 6 case tĩnh — renderToStaticMarkup/node env không test được click (đã ghi trong red-team của plan).
- Cập nhật `kernel-runtime.contract.test.ts` block #106 để assert `data.assignmentPrompts` derive; cập nhật 3 e2e specs trỏ về `/assignments`; thêm entry CHANGELOG 2026-09-25.

Red-team (3 personas) tìm 10 findings — 2 Critical đã fix ngay trong plan trước khi implement:
1. Contract test #106 đọc source index.tsx nên sẽ đỏ mãi nếu không đưa vào Phase 2.
2. Unit test click-navigate bất khả thi dưới vitest node env → thay bằng assert label CTA tĩnh.

Verify ở trạng thái merged (develop merge vào tại `3308383`): tsc sạch, 728/728 unit tests, 84 e2e pass (1 skipped); grep sweep `assignments/bank` = 0 ngoài routeTree.gen; không đổi apps/server, packages/api, packages/db.

## Decision

- Xoá hẳn route `/assignments/bank` thay vì redirect; UI gộp giữ nguyên UX bank vì phục vụ trực tiếp việc duyệt danh sách prompts.
- Hai Critical của red-team xử lý ở mức plan (không đợi implement vấp): thêm contract test #106 vào Phase 2, và thay unit test click bằng assertion tĩnh — chấp nhận test e2e là nơi phủ hành vi navigate.
- Luồng chấm điểm `/assignments/$assignmentId` giữ entry point thứ hai tại `students/$studentId.tsx:256` → không đổi scope.

## Next steps

- PR review trên GitHub; merge vào develop sau khi CI xanh; đóng plan index sau khi merge.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
