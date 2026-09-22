---
title: "Plan: student-create-identity-fields (issue #240)"
date: 2026-09-22
summary: "Ak-plan --github: plan cho việc bỏ 3 input gói khỏi form tạo học viên, thêm Email bắt buộc, SĐT digits-only làm danh tính login tương lai; gói derive từ lớp (D1) hoặc không tạo (D2). 4 phase, ~7h."
---

# Plan: student-create-identity-fields (issue #240)

## Bối cảnh
Người dùng yêu cầu (`ak-plan --github`): khi tạo học viên bỏ input số buổi/đơn giá/hình thức, bổ sung email; SĐT + email là username login tương lai; SĐT chỉ nhận chữ số.

## Quyết định chính
- User không trả lời 3 câu hỏi scope (AskUserQuestion) → chạy theo phương án khuyến nghị, ghi rõ là assumption D1–D4 trong plan:
  - D1: tạo học viên trong lớp → gói derive từ lớp (`sessionsTotal` / `tuitionFee ?? 0` / `mode`), enrollment + lesson giữ nguyên.
  - D2: tạo ngoài lớp → KHÔNG tạo session_package; UI hiển thị "Chưa có gói" (thêm flag `hasPackage` vào mapper vì ZERO_PKG hiện không phân biệt được với gói 0 buổi).
  - D3: email + SĐT bắt buộc lúc tạo; legacy row giữ email "" (danh tính login thật + unique constraint để plan sau — hiện không có student portal, better-auth user không link student).
  - D4: mode "Học viên có sẵn" (enroll) giữ nguyên package fields.
- SĐT: client strip non-digits on change + server zod regex `^[0-9]+$` (thay `PHONE_RE = /^[0-9\s+]*$/` cũ cho phép khoảng trắng/+); migration normalize phone legacy.

## Evidence đã xác thực
- Form duy nhất: `apps/web/src/components/modals/add-student-modal.tsx` (packageFields dùng chung 2 mode ở dòng 188–223/295/325 — phải un-share).
- Contract: `packages/api/src/contracts.ts:9-18` studentCreateSchema; `KernelStudentRow:634-641` thiếu email.
- Server: `apps/server/src/routes/kernel.ts:510-602` POST /students — findClass select cần thêm `mode`/`tuitionFee`; nhánh không lớp hiện parked package (issue #104) sẽ bị xoá theo D2.
- DB: `student` không có email (invariant 3: no package columns on student); `class` đã có `mode`/`sessionsTotal`/`tuitionFee` → D1 khả thi không cần thêm cột.
- E2E sẽ gãy: `student-package-validation.spec.ts`, `student-package-without-class.spec.ts` + 13 spec chỉ fill tên (SĐT/email bắt buộc) → phase 4 làm helper `createStudentViaUi`.

## Sản phẩm
- `plans/260922-0716-student-create-identity-fields/` (plan.md + 4 phase, `ak plan validate` OK, effort 7h)
- GitHub issue #240, label `ready to review`, frontmatter issue đã backfill.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
