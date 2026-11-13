```markdown
---
type: reverse-usecase
feature: student-invitations
uc: UC-06 — Gửi lại email mời portal cho học viên đã có hồ sơ (resend-invite)
status: draft
updated: 2026-11-11
links:
  - docs/_reverse/student-invitations/student-invitations-reverse-spec.md
  - docs/_reverse/student-invitations/usecases/student-invitations-reverse-usecase-index.md
  - docs/_reverse/student-invitations/_evidence.md
---

# UC-06 — Gửi lại email mời portal cho học viên chưa liên kết portal (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.
> Ranh giới: UC này KHÔNG dùng bảng `student_invitation` — nó hoạt động trên hồ sơ `student` và dùng cooldown `student.lastInviteEmailAt`. Phủ cho nhóm HV được tạo thủ công (manual) chưa từng nhận email mời portal.

## a. Tổng quan

| Hạng mục | Nội dung | Nguồn | Nhãn |
|----------|----------|-------|------|
| UC ID | UC-06 | S10 | ✅ |
| Tên nghiệp vụ | GV gửi lại (hoặc gửi lần đầu) email mời portal cho học viên đã có hồ sơ trong org nhưng chưa hoàn thành onboarding portal | apps/server/src/routes/kernel.ts:1073-1344 | ✅ |
| Actor chính | Giáo viên / Chủ trung tâm (`canManageStudentInvites`) | apps/server/src/routes/kernel.ts:219-231 | ✅ |
| Actor phụ | Hệ thống mail (buildStudentPortalInviteEmail) | apps/server/src/lib/notifications/invite-email.ts:53-75 | ✅ |
| Tiền điều kiện | HV có hồ sơ `student` trong org; `portalLinked == false` (chưa có `onboardingCompletedAt`); có email hợp lệ | apps/server/src/routes/kernel.ts:1073-1140 | ✅ |
| Hậu điều kiện | Email mời portal gửi đến HV; `student.lastInviteEmailAt` cập nhật (mốc cooldown mới) | apps/server/src/routes/kernel.ts:1073-1344 | ✅ |

## b. Trigger

GV ở tab "Học viên" bấm nút gửi lại lời mời trên hàng HV có badge "Chờ xác nhận" (có email, chưa portalLinked). ✅ apps/web/src/routes/_auth/students/index.tsx:233-240 (ResendInviteButton theo isPendingPortalStudent); apps/web/src/components/students/pending-invite-callout.tsx:16-27 (ResendInviteTarget).

## c. Điều kiện vào

1. Role có `canManageStudentInvites` (ta bị chặn 403). ✅ apps/server/src/routes/kernel.ts:219-231, 1076
2. HV thuộc org hiện tại của GV. ✅ apps/server/src/routes/kernel.ts:1073-1140
3. HV chưa `onboardingCompletedAt` (chưa portalLinked). ✅ apps/server/src/routes/kernel.ts:1073-1140; apps/web/src/lib/repos/students.ts:97-102 (isPendingPortalStudent)
4. HV có email trong hồ sơ; nếu rỗng → không eligible (một số HV tạo từ enrollment không có email). ✅ apps/web/src/lib/repos/students.ts:108-116 (filterUniquePendingInvites) | 🔵

## d. Luồng chính

| # | Bước nghiệp vụ | Nguồn | Nhãn |
|---|----------------|-------|------|
| 1 | GV ở tab "Học viên": HV có email + chưa portalLinked nhận badge "Chờ xác nhận" (HV không email nhận badge "Chưa liên kết Portal", không có nút gửi lại) | apps/web/src/routes/_auth/students/index.tsx:45-63,179-193; apps/web/src/lib/repos/students.ts:97-102 | ✅ |
| 2 | Với mỗi HV, callout hiện trạng thái: đã gửi lời mời lúc nào / cooldown còn bao nhiêu giây | apps/web/src/components/students/pending-invite-callout.tsx:62-109 | ✅ |
| 3 | GV bấm "Gửi lại lời mời" → POST /api/students/:id/resend-invite | apps/web/src/lib/repos/students.ts (resendInvite); apps/server/src/routes/kernel.ts:1073-1344 | ✅ |
| 4 | Server kiểm tra cooldown: `now - lastInviteEmailAt >= inviteResendCooldownMs` (mặc định 60s, DI override E2E = 0) | apps/server/src/routes/kernel.ts:214-217, 1073-1344 | ✅ |
| 5 | Quá cooldown → build email mời portal (buildStudentPortalInviteEmail) + gửi đồng bộ (timeout 5s) với idempotency key `student_portal_invite:{studentId}:{token}` | apps/server/src/lib/notifications/invite-email.ts:53-75; apps/server/src/routes/kernel.ts:217 | ✅ |
| 6 | Gửi thành công → cập nhật `student.lastInviteEmailAt = now`; trả kết quả OK cho client | apps/server/src/routes/kernel.ts:1073-1344 | ✅ |
| 7 | Client hiển thị toast thành công + refetch danh sách → cooldown mới áp dụng | apps/web/src/components/students/pending-invite-callout.tsx:111-140 | ✅ |

### e. Ràng buộc

1. Cooldown dùng `student.lastInviteEmailAt` (schema `student`), KHÔNG dùng bảng `student_invitation`. ✅ packages/db/src/schema/student.ts (lastInviteEmailAt); apps/server/src/routes/kernel.ts:1073-1344 | 🔵
2. Cooldown vi phạm → 429 INVITATION_RESEND_COOLDOWN + Retry-After (cùng error code với UC-02). ✅ apps/server/src/routes/kernel.ts:1193-1222
3. Nếu `lastInviteEmailAt` null (chưa từng gửi) → coi như đủ điều kiện gửi ngay. ✅ apps/server/src/routes/kernel.ts:1073-1344 | 🔵
4. Email fail → KHÔNG cập nhật `lastInviteEmailAt` (không mốc cooldown giả). ✅ apps/server/src/routes/kernel.ts:1073-1344 | 🔵
5. HV đã `portalLinked == true` → không hiển thị ở tab này (đã có thể tự đăng nhập); resend-invite vẫn được gọi nhưng sẽ fail với lỗi nghiệp vụ. ✅ apps/web/src/lib/repos/students.ts:97-102; apps/server/src/routes/kernel.ts:1073-1140 | 🔵

## f. Luồng thay thế & ngoại lệ

| # | Kịch bản | Xử lý | Nguồn | Nhãn |
|---|----------|--------|-------|------|
| A1 | Gửi lại trong 60s | 429 INVITATION_RESEND_COOLDOWN + Retry-After; client đếm ngược trên nút | apps/server/src/routes/kernel.ts:1193-1222 | ✅ |
| A2 | Mailer chưa cấu hình | 503 INVITATION_EMAIL_UNAVAILABLE | apps/server/src/routes/kernel.ts:1079-1086 | ✅ |
| A3 | Mail gửi fail (timeout 5s / SMTP lỗi) | 502 INVITATION_EMAIL_FAILED; `lastInviteEmailAt` KHÔNG đổi | apps/server/src/routes/kernel.ts:1073-1344 | ✅ |
| A4 | Trợ giảng bấm resend | 403 "Trợ giảng không có quyền quản lý lời mời học viên" | apps/server/src/routes/kernel.ts:219-231, 1076; apps/server/src/student-invitation.test.ts:567-577 | ✅ |
| A5 | HV id không thuộc org của GV | 404 "Không tìm thấy học viên" code INVITATION_NOT_FOUND (scope theo org) | apps/server/src/routes/kernel.ts:1109-1116 | 🔵 |
| A6 | HV đã portalLinked VÀ không còn enrollment `invited` nào | 409 ALREADY_JOINED (không gửi mail); còn enrollment `invited` thì vẫn gửi được | apps/server/src/routes/kernel.ts:1175-1183 | 🔵 |
| A7 | Abort 15s ở client | AbortError → toast lỗi chung | apps/web/src/lib/repos/students.ts (AbortSignal) | ✅ |

## g. NFR liên quan

| ID | Yêu cầu | Nguồn | Nhãn |
|----|---------|-------|------|
| NFR-STUDENT-INVITATIONS-003 | AbortSignal 15s client | apps/web/src/lib/repos/students.ts | ✅ |
| NFR-STUDENT-INVITATIONS-004 | Mail đồng bộ timeout 5s | apps/server/src/routes/kernel.ts:217 | ✅ |
| NFR-STUDENT-INVITATIONS-011 | Cooldown DI được (inviteResendCooldownMs) — E2E truyền 0 để test nhanh | apps/server/src/routes/kernel.ts:214-217; apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:52-100 | ✅ |

## h. Truy vết

### UC-06 ↔ FR ↔ Error ↔ Test

| FR | Điểm UC | Error | Test phủ | Nguồn | Nhãn |
|----|---------|-------|----------|-------|------|
| FR-STUDENT-INVITATIONS-018 (resend invite portal cho HV chưa linked) | d3-d7, e1-e4, A1-A3 | E-003, E-007, E-014 | apps/server/src/student-invitation.test.ts:658-750 (phủ resend portal invite + revert updatedAt) | S5, S10 | ✅ |
| BR-STUDENT-INVITATIONS-005 (cooldown 60s) | e1-e2, A1 | E-003 | apps/server/src/student-invitation.test.ts:658-750 | S5 | ✅ |
| BR-STUDENT-INVITATIONS-009 (role gate ta) | c1, A4 | E-008 | apps/server/src/student-invitation.test.ts:567-577 | S5 | ✅ |
| — (badge "Chưa liên kết Portal"/"Chờ xác nhận" + nút gửi lại trên tab Học viên; spec không có FR riêng cho tab) | d1-d2, c3-c4 | — | apps/web/src/routes/_auth/students/index.test.tsx; apps/web/src/components/students/pending-invitations-list.test.tsx; apps/web/src/lib/repos/students.ts:97-116 | S10, S19 | 🔵 |

### Ghi chú reverse

- Ranh giới với `enrollment-lifecycle`: việc tạo hồ sơ student từ enrollment là của feature khác; UC-06 chỉ GỬI LẠI email mời portal cho hồ sơ đã tồn tại. ✅ apps/server/src/routes/kernel.ts:1073-1344 (chỉ resend, không tạo student)
- PDR nói "teachers no longer create students manually" — thực tế POST /api/students vẫn tồn tại và cho tạo HV thủ công (xem Conflicts ở Mục 0 spec). 🟡 OQ-10
```
