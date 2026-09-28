---
title: Plan hồ sơ học viên hiển thị lớp học thay vì gói học
date: 2026-09-22
summary: "Lập plan #245: thay card Gói học ở tab Hồ sơ bằng card Lớp học (join enrollments×classes trong route), không đổi API/type; cập nhật 2 spec e2e"
---

# Plan hồ sơ học viên hiển thị lớp học thay vì gói học

## What happened
- Tạo plan `plans/260922-0859-student-profile-class-instead-of-package/` (issue #245) theo `/ak-plan --github`, mode fast (scope rõ, ~6 file).
- Scout xác nhận: tab "Hồ sơ" ở `apps/web/src/routes/_auth/students/$studentId.tsx:143-181` là chỗ duy nhất hiển thị card "Gói học" trên detail; kernel snapshot đã chứa `enrollments` + `classes` nên không cần đổi API.
- 2 spec e2e đang assert "Gói học" trên detail: `student-package-without-class.spec.ts:34-40`, `student-package-validation.spec.ts:206-217` (test D1).

## Decision
- Join lớp học ngay trong route component (`data.classes.filter` × `data.enrollments.some`) theo pattern route đã scope lessons/invoices/assignments — KHÔNG thêm field vào display type `Student` để tránh đụng mock seeds, reducer và mọi view khác dùng `pkg`/`hasPackage`.
- Giữ coverage derive gói (#240 D1) bằng assertion trên hàng list học viên (`"${total} buổi · ${mode}"`, `fmtVND`) thay vì trên detail; dùng regex `/buổi · Online/` vì sessionsTotal do class modal quyết định.
- Empty state mới: "Chưa tham gia lớp học nào." — tránh assert `getByText("Lớp học", {exact:true})` vì trùng nav sidebar (strict-mode).

## Next steps
- Chạy `/ak:cook plans/260922-0859-student-profile-class-instead-of-package/plan.md` (branch gợi ý `vinh19410/feat/student-profile-class-instead-of-package`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
