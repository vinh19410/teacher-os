---
title: "Ship #93 phase 1 — bỏ cột Học viên tab Buổi học"
date: 2026-08-27
summary: "Scope thu hẹp còn Phase 1 theo Scope Decision (OQ1 option 3: per-occurrence edit cần server-side occurrence identity trước — SessionActionsModal DEFERRED giữ làm tư liệu phases 02/03 status:blocked). TDD red-green: contract test thêm positive pin 3 th + count=3 + negative /ƅ>\s*Học viên\s*<\/th>/ scoped scheduleTableSrc + colSpan={3} pins + legacy array flip + rename titles; RED 3 failed xác nhận rồi mới sửa component GREEN. Giữ attendees/isGroupSession, studentById pass-through modal. Red-team rerun 10 findings áp hết; code-review APPROVE (0 Critical/Important); kongming ×3 (gates GO-WITH-CHANGES, pre-ship GO). Gates: check/test/check-types xanh; 435 tests pass. Follow-up: doc-rot comment e2e spec :151."
---

# Ship #93 phase 1 — bỏ cột Học viên tab Buổi học

Scope thu hẹp còn Phase 1 theo Scope Decision (OQ1 option 3: per-occurrence edit cần server-side occurrence identity trước — SessionActionsModal DEFERRED giữ làm tư liệu phases 02/03 status:blocked). TDD red-green: contract test thêm positive pin 3 th + count=3 + negative /ƅ>\s*Học viên\s*<\/th>/ scoped scheduleTableSrc + colSpan={3} pins + legacy array flip + rename titles; RED 3 failed xác nhận rồi mới sửa component GREEN. Giữ attendees/isGroupSession, studentById pass-through modal. Red-team rerun 10 findings áp hết; code-review APPROVE (0 Critical/Important); kongming ×3 (gates GO-WITH-CHANGES, pre-ship GO). Gates: check/test/check-types xanh; 435 tests pass. Follow-up: doc-rot comment e2e spec :151.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
