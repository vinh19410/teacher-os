```markdown
---
type: reverse-usecase
feature: student-invitations
uc: UC-03 — Học viên nhận thông báo và chấp nhận lời mời
status: draft
updated: 2026-11-11
links:
  - docs/_reverse/student-invitations/student-invitations-reverse-spec.md
  - docs/_reverse/student-invitations/usecases/student-invitations-reverse-usecase-index.md
  - docs/_reverse/student-invitations/_evidence.md
---

# UC-03 — Học viên chấp nhận lời mời vào tổ chức (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## a. Tổng quan

| Hạng mục | Nội dung | Nguồn | Nhãn |
|----------|----------|-------|------|
| UC ID | UC-03 | S10 | ✅ |
| Tên nghiệp vụ | Học viên nhận thông báo chuông trên portal và chấp nhận lời mời vào tổ chức → hồ sơ học viên được tạo trong tổ chức đó | S7, S10 | ✅ |
| Actor chính | Học viên (đã đăng nhập student portal, email đã verify) | apps/server/src/routes/student.ts:500-545 | ✅ |
| Actor phụ | Hệ thống chuông thông báo bell (polling 15s), tổ chức đích | apps/student/src/lib/repos/student.ts:724-731 | ✅ |
| Tiền điều kiện | Có lời mời `pending` khớp email của user; user đã đăng nhập portal; org có ít nhất 1 GV/owner | apps/server/src/routes/student.ts:548-577 | ✅ |
| Hậu điều kiện thành công | Bản ghi `student` mới được tạo trong org đích; lời mời chuyển `accepted`; portal tự chuyển org active sang org mới → onboarding wizard | apps/server/src/routes/student.ts:579-639; apps/student/src/lib/repos/student.ts:249-274 | ✅ |

## b. Trigger

Học viên truy cập portal → NotificationBell poll GET /api/student/notifications mỗi 15s → thấy lời mời mới → bấm "Chấp nhận". ✅ apps/student/src/components/layout/notification-bell.tsx:46-79; apps/student/src/lib/repos/student.ts:724-731 (refetchInterval 15_000).

## c. Điều kiện vào

1. Session student hợp lệ. ✅ apps/server/src/routes/student.ts:500-545
2. Email user đã verify (rào EMAIL_UNVERIFIED chặn trước ở trang lỗi). ✅ apps/student/src/routes/_auth/index.tsx:64-75; apps/student/src/components/overview/student-error-view.tsx:108-112
3. Tồn tại ≥1 lời mời `pending` khớp `lower(trim(email))`. ✅ apps/server/src/routes/student.ts:548-577
4. Bell truy cập được cả khi user có 0 hàng `student` (trường hợp mới ký chưa gán org nào) — endpoint notifications KHÔNG nằm sau createStudentGuard. ✅ apps/server/src/routes/student.ts:547-577; apps/server/src/routes/student.ts:716-739 (so sánh: các endpoint kia nằm sau guard) | 🔵
5. Code KHÔNG kiểm tra org lời mời khác org hiện tại — accept vẫn chạy nếu lời mời thuộc org đang active (hồ sơ đã có → bỏ qua insert). Điều kiện thật chỉ là: pending invitation chặn auto-provision → user rơi vào 403 NOT_LINKED → được dẫn tới bell | apps/server/src/routes/student.ts:611-637; apps/server/src/student-provisioning.ts:37-51 | 🔵

## d. Luồng chính

| # | Bước nghiệp vụ | Nguồn | Nhãn |
|---|----------------|-------|------|
| 1 | Học viên được mời qua email (UC-01); email chứa link tới `{studentOrigin}/login` | apps/server/src/lib/notifications/invite-email.ts:53-75 | ✅ |
| 2 | HV đăng ký/đăng nhập portal; provisioning cố gắng auto-gán vào org sớm nhất | apps/server/src/student-provisioning.ts:37-51 | ✅ |
| 3 | Do có lời mời pending, provisioning BỎ QUA auto-assign → các trang /api/student/me trả 403 STUDENT_NOT_LINKED | apps/server/src/student-provisioning.ts:37-51; apps/server/src/routes/student.ts:124-210 | ✅ |
| 4 | Trang lỗi NOT_LINKED hiển thị hướng dẫn "bấm vào biểu tượng Chuông thông báo ở góc trên để chấp nhận tham gia lớp" | apps/student/src/components/overview/student-error-view.tsx:104-107 | ✅ |
| 5 | Bell poll GET /api/student/notifications (kể cả khi 0 hàng student) → nhận danh sách lời mời pending kèm tên org + tên người mời | apps/server/src/routes/student.ts:548-577; apps/student/src/lib/repos/student.ts:220-247 | ✅ |
| 6 | Bell hiện badge số lượng + dropdown mục "Lời mời" liệt kê từng lời mời: "Giáo viên {inviter} đã mời bạn tham gia tổ chức {org}." + thời điểm, 2 nút "Chấp nhận" / "Từ chối" | apps/student/src/components/layout/notification-bell.tsx:46-124,165-250 | ✅ |
| 7 | HV bấm "Chấp nhận" → POST /api/student/invitations/:id/accept | apps/student/src/components/layout/notification-bell.tsx:65-79; apps/student/src/lib/repos/student.ts:249-274 | ✅ |
| 8 | Server xác nhận: lời mời thuộc user này + vẫn `pending` → tạo bản ghi `student` mới trong org đích (tên = user.name hoặc fallback email prefix), chuyển lời mời `accepted` | apps/server/src/routes/student.ts:579-639 | ✅ |
| 9 | Server trả về org mới; client setActiveStudentOrgId(org mới) + invalidate toàn bộ query portal | apps/student/src/lib/repos/student.ts:249-274, 45-67 | ✅ |
| 10 | Bell đóng dropdown, refetch → lời mời biến mất | apps/student/src/components/layout/notification-bell.tsx:65-79 | ✅ |
| 11 | Portal điều hướng vào org mới → onboarding wizard (Navigate) | apps/student/src/routes/_auth/index.tsx:77-79 | ✅ |
| 12 | HV (chưa onboarding) xuất hiện ở tab "Học viên" với badge "Chờ xác nhận" + nút gửi lại mời portal (portalLinked=false); lời mời biến khỏi tab "Lời mời đang chờ" (khử theo email #616) | apps/web/src/routes/_auth/students/index.tsx:45-63,179-193; apps/web/src/lib/repos/students.ts:97-116 | ✅ |

### e. Ràng buộc & ghi nhận nghiệp vụ tại bước 7-11

1. Accept KHÔNG cho phép chỉ định org — org được lấy từ lời mời, không tin client. ✅ apps/server/src/routes/student.ts:579-639
2. Accept KHÔNG kích hoạt mail gửi lại hay thông báo cho GV. 🟡 OQ-4
3. Nếu `user.name` rỗng → fallback tên từ email prefix (before @). ✅ apps/server/src/routes/student.ts:623-636
4. Multi-org: sau accept, user có thể có nhiều hàng student (mỗi org 1 hàng); org active do client chọn qua header `x-student-org-id` (server tự kiểm tra và fallback nếu org không thuộc user). ✅ apps/server/src/routes/student.ts:177-189; apps/server/src/app.ts:387 (CORS allow header)
5. Idempotency: bấm accept 2 lần → lần 2 lời mời không còn `pending` → 404 INVITATION_NOT_FOUND (accept KHÔNG có nhánh 409; 409 STUDENT_ALREADY_JOINED chỉ thuộc resend-invite portal kernel.ts:1175-1183, test student-invitation.test.ts:725-749 là của resend-invite). ✅ apps/server/src/routes/student.ts:585-604 (chưa có test riêng bấm accept 2 lần)
6. Accept KHÔNG tự gán HV vào lớp nào — việc gán lớp do GV làm sau đó (UC-06/enrollment). ✅ apps/server/src/routes/student.ts:579-639 (chỉ insert student, không insert class_enrollment) | 🔵

## f. Luồng thay thế & ngoại lệ

| # | Kịch bản | Xử lý | Nguồn | Nhãn |
|---|----------|--------|-------|------|
| A1 | HV bấm accept nhưng lời mời đã bị GV thu hồi / HV từ chối ở tab khác | 404 INVITATION_NOT_FOUND (accept không có nhánh 409); client chỉ console.error | apps/server/src/routes/student.ts:585-604; apps/server/src/student-invitation.test.ts:293-331 | ✅ |
| A2 | HV đã là student của org này rồi (trùng email trong org) | Vẫn 200 ok — accept bỏ qua insert (idempotent BR-004), KHÔNG trả 409 | apps/server/src/routes/student.ts:611-637 | ✅ |
| A3 | 2 hàng student trùng email trong 1 org (race) | Chặn bởi unique index `student_org_email_uq` (org_id, lower(trim(email))) WHERE trim(email) != '' | packages/db/src/migrations/0025_spotty_betty_ross.sql:17 | ✅ |
| A4 | HV chưa verify email | Chặn trước ở trang: EMAIL_UNVERIFIED | apps/student/src/components/overview/student-error-view.tsx:108-112 | ✅ |
| A5 | Accept thành công nhưng trên server lỗi sau khi tạo student (response lỗi) | Client KHÔNG setActiveStudentOrgId; HV refetch bell → lời mời đã accepted nên biến mất; hồ sơ vẫn được tạo (server-first) | apps/student/src/lib/repos/student.ts:249-274 | 🔵 |
| A6 | Bell hiển thị lời mời nhưng server không còn lời mời đó (stale poll >15s) | 404 → client refetch, badge về 0 | apps/student/src/lib/repos/student.ts:249-274 | 🔵 |
| A7 | HV có 0 hàng student nhưng bấm accept | Vẫn OK — endpoint accept nằm sau auth gate, KHÔNG nằm sau createStudentGuard | apps/server/src/routes/student.ts:547-577 | ✅ |

## g. NFR liên quan

| ID | Yêu cầu | Nguồn | Nhãn |
|----|---------|-------|------|
| NFR-STUDENT-INVITATIONS-006 | Bell poll chu kỳ 15s (refetchInterval) — KHÔNG phải real-time push | apps/student/src/lib/repos/student.ts:724-731 | ✅ |
| NFR-STUDENT-INVITATIONS-007 | Badge bell đọc được bởi screen-reader ("Thông báo (N mục chưa xử lý)" khi có mục, "Thông báo" khi 0) | apps/student/src/components/layout/notification-bell.tsx:110-124 | ✅ |
| NFR-STUDENT-INVITATIONS-008 | Accept/reject tối đa 1 request tại 1 thời điểm (disable nút khi đang loading) | apps/student/src/components/layout/notification-bell.tsx:65-91 | 🔵 |

## h. Truy vết

### UC-03 ↔ FR ↔ Error ↔ Test

| FR | Điểm UC | Error | Test phủ | Nguồn | Nhãn |
|----|---------|-------|----------|-------|------|
| FR-STUDENT-INVITATIONS-012 (bell notifications) | d5-d6 | — | apps/server/src/student-invitation.test.ts:280-291; apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:102-234 | S5, S12 | ✅ |
| FR-STUDENT-INVITATIONS-013 (accept lời mời) | d7-d12, e1-e6, A1-A3, A7 | E-006, E-011, E-012, E-013 | apps/server/src/student-invitation.test.ts:333-409; apps/server/src/student.test.ts:1871-1917 (auto-accept liên quan); apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:102-234 | S5, S6, S12 | ✅ |
| FR-STUDENT-INVITATIONS-013 (tạo hồ sơ student trong org khi accept) | d8, e3 | — | apps/server/src/student-invitation.test.ts:333-409 | S5, S6 | ✅ |
| BR-STUDENT-INVITATIONS-008 (provisioning skip khi có pending invite) | d2-d4, c5 | E-012 | apps/server/src/routes/student-auth-otp.test.ts:160-199; apps/e2e/specs/student-portal-provisioning.spec.ts:11-36 | S8, S12 | ✅ |
| — (org mới → onboarding; spec không có BR riêng) | d10-d11 | — | apps/student/src/routes/_auth/index.tsx:77-79; apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:102-234 | S11, S12 | ✅ |
| BR-STUDENT-INVITATIONS-001 (multi-org sau accept) | e4, A5 | — | apps/server/src/student.test.ts:417-448 | S6 | ✅ |

### Ghi chú reverse

- Không có unit test cho NotificationBell component (bell chỉ được phủ qua e2e). 🟡 OQ-8
- Không có e2e riêng cho reject; accept có e2e full happy path. 🟡 (xem UC-04)
```
