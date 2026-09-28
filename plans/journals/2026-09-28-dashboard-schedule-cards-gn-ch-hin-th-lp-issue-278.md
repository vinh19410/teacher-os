---
title: "Dashboard schedule cards gọn — chỉ hiển thị lớp (issue #278)"
date: 2026-09-28
summary: "Refactor apps/web/src/routes/_auth/dashboard.tsx: bỏ Avatar lớp + student rows (kèm nút Điểm danh/Badge Đã học) ở 2 section Lịch hôm nay & Lịch sắp tới; card chỉ còn tên lớp + meta time·dur·type·topic. Bỏ early-return studentRows===0. Dọn imports Button/useDirectKernelAction/studentById. Drift-guard kernel-runtime.contract.test.ts đổi positive pin check-in dashboard thành negative pin (giữ nguyên mọi pin khác). Verification: biome+tsc sạch, 1072/1072 unit pass, e2e 3+5 pass (login.smoke, account-role-separation, class-operations, schedule-session-modal, projected-sessions) trên alt ports 8810-8813. Code review subagent: APPROVE 0C/0I/0M/1Nit (đã sửa comment). Red-team gate bắt được plan bỏ sót contract test → plan cập nhật Goal 4 trước khi implement."
---

# Dashboard schedule cards gọn — chỉ hiển thị lớp (issue #278)

Refactor apps/web/src/routes/_auth/dashboard.tsx: bỏ Avatar lớp + student rows (kèm nút Điểm danh/Badge Đã học) ở 2 section Lịch hôm nay & Lịch sắp tới; card chỉ còn tên lớp + meta time·dur·type·topic. Bỏ early-return studentRows===0. Dọn imports Button/useDirectKernelAction/studentById. Drift-guard kernel-runtime.contract.test.ts đổi positive pin check-in dashboard thành negative pin (giữ nguyên mọi pin khác). Verification: biome+tsc sạch, 1072/1072 unit pass, e2e 3+5 pass (login.smoke, account-role-separation, class-operations, schedule-session-modal, projected-sessions) trên alt ports 8810-8813. Code review subagent: APPROVE 0C/0I/0M/1Nit (đã sửa comment). Red-team gate bắt được plan bỏ sót contract test → plan cập nhật Goal 4 trước khi implement.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
