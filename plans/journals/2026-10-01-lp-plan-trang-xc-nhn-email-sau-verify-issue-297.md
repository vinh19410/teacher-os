---
title: "Lập plan trang xác nhận email sau verify (issue #297)"
date: 2026-10-01
summary: "Chẩn đoán trang OK sau verify-email: teacher sign-up thiếu callbackURL; lập plan 3 phase cho cả hai cổng."
---

# Lập plan trang xác nhận email sau verify (issue #297)

## What happened

- User báo sau khi bấm link verify mail, redirect chỉ hiện "OK". Scout + đối chiếu dist better-auth 1.6.27 (unpkg, node_modules bị hook chặn) chẩn đoán: link verify nằm trên origin API; sign-up teacher không truyền `callbackURL` (`apps/web/src/components/sign-up-form.tsx:40-44`) nên verify xong không có chỗ để về — đứng lại nhận response trần (root API `apps/server/src/app.ts:154` trả "OK", hoặc JSON `{"status":true}` của better-auth). Student có callbackURL nhưng redirect thẳng `/login` → gate, không có trang xác nhận.
- Hành vi khoá để thiết kế: thành công + callbackURL → redirect nguyên vẹn KHÔNG thêm param; lỗi → append `?error=TOKEN_EXPIRED|INVALID_TOKEN`; `autoSignInAfterVerification` set cookie trước redirect; token là JWT single-use.
- Lập plan `plans/261001-0635-verify-email-confirmation-page/` (3 phase) + issue #297, validation interview 3 câu.

## Decision

- Fix ở gốc: sign-up/resend truyền `callbackURL: ${origin}/verify-email?verified=1` — marker `verified=1` nướng trong callbackURL vì better-auth không thêm param khi thành công (không marker thì không phân biệt direct-nav).
- User chọn mở rộng scope: làm CẢ teacher lẫn student portal (không chỉ teacher như recommend) → 4 spec e2e student phải refactor qua helper chung `verifyStudentEmailFromMailLog` (RT6).
- Card thành công + CTA (không auto-redirect); error card có resend tại chỗ khi còn session chưa verify; không echo giá trị `error` thô.
- Không component test cho view student (app student 0 test file, precedent #292); không bật `requireEmailVerification`.

## Next steps

- `/ak:cook plans/261001-0635-verify-email-confirmation-page/plan.md` khi user duyệt issue #297.
- Lưu ý khi cook: route mới web phải vào cả `VALID_EXACT_ROUTES` lẫn matcher test (drift guard); không đổi shape URL email (regex mail-log `boot.ts:40`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
