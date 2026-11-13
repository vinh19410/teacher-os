```markdown
---
type: reverse-usecase
feature: student-invitations
uc: UC-04 — Học viên từ chối lời mời
status: draft
updated: 2026-11-11
links:
  - docs/_reverse/student-invitations/student-invitations-reverse-spec.md
  - docs/_reverse/student-invitations/usecases/student-invitations-reverse-usecase-index.md
  - docs/_reverse/student-invitations/_evidence.md
---

# UC-04 — Học viên từ chối lời mời vào tổ chức (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## a. Tổng quan

| Hạng mục | Nội dung | Nguồn | Nhãn |
|----------|----------|-------|------|
| UC ID | UC-04 | S10 | ✅ |
| Tên nghiệp vụ | Học viên bấm "Từ chối" trên bell → lời mời chuyển `rejected`, biến mất khỏi bell; hồ sơ KHÔNG được tạo | apps/server/src/routes/student.ts:641-674 | ✅ |
| Actor chính | Học viên (đã đăng nhập portal) | apps/server/src/routes/student.ts:500-545 | ✅ |
| Tiền điều kiện | Lời mời `pending` khớp email; session hợp lệ | apps/server/src/routes/student.ts:548-577, 641-674 | ✅ |
| Hậu điều kiện | Lời mời `rejected`; không tạo student; GV KHÔNG nhận thông báo riêng (chỉ thấy lời mời biến mất khỏi tab chờ) | apps/server/src/routes/student.ts:641-674 | ✅ + 🟡 OQ-4 |

## b. Trigger

HV bấm "Từ chối" trên 1 lời mời trong dropdown NotificationBell. ✅ apps/student/src/components/layout/notification-bell.tsx:81-91.

## c. Điều kiện vào

1-4. Giống UC-03 c.1-c.4. ✅ apps/server/src/routes/student.ts:500-577
5. Lời mời vẫn `pending` tại thời điểm bấm. ✅ apps/server/src/routes/student.ts:641-674

## d. Luồng chính

| # | Bước nghiệp vụ | Nguồn | Nhãn |
|---|----------------|-------|------|
| 1 | HV thấy lời mời ở bell (giống UC-03 d.5-d6) | apps/student/src/components/layout/notification-bell.tsx:46-124 | ✅ |
| 2 | HV bấm "Từ chối" → POST /api/student/invitations/:id/reject | apps/student/src/components/layout/notification-bell.tsx:81-91; apps/student/src/lib/repos/student.ts:276-301 | ✅ |
| 3 | Server cập nhật trạng thái `rejected` trên lời mời thuộc user này | apps/server/src/routes/student.ts:641-674 | ✅ |
| 4 | Client invalidate query notifications → bell refetch, lời mời biến mất | apps/student/src/lib/repos/student.ts:796-806 | ✅ |
| 5 | GV mở lại tab "Đã mời chờ" → lời mời không còn hiển thị (danh sách chỉ query `pending`) | apps/server/src/routes/kernel.ts:870-909 | ✅ |
| 6 | UI cổng GV KHÔNG có màn nào hiển thị lịch sử `rejected`/`canceled` | apps/web/src/components/students/pending-invitations-list.tsx:66-184 (chỉ render pending) | 🔵 |

## e. Ràng buộc nghiệp vụ

1. Reject là trạng thái kết thúc (terminal) — KHÔNG có endpoint "re-invite từ rejected"; GV phải tạo lời mời mới (POST /students/invite). ✅ apps/server/src/routes/kernel.ts:690-909; packages/db/src/schema/student-invitation.ts:14-20 | 🔵
2. Mời lại cùng email sau khi bị `rejected`: KHÔNG rơi vào cooldown (cooldown chỉ quét `canceled`) → được gửi ngay. ✅ apps/server/src/routes/kernel.ts:770-800 (chỉ WHERE status='canceled') | 🔵 — đã ghi BR-STUDENT-INVITATIONS-012
3. Không có lời mời tồn tại sau reject (không insert row mới, chỉ update status). ✅ apps/server/src/routes/student.ts:641-674
4. KHÔNG có email/info gửi về cho GV khi bị từ chối. 🟡 OQ-4

## f. Luồng thay thế & ngoại lệ

| # | Kịch bản | Xử lý | Nguồn | Nhãn |
|---|----------|--------|-------|------|
| A1 | HV bấm reject 2 lần | Lần 2: lời mời không còn `pending` → 404 INVITATION_NOT_FOUND | apps/server/src/routes/student.ts:641-674; apps/server/src/student-invitation.test.ts:293-331 | ✅ |
| A2 | HV bấm reject nhưng GV vừa cancel | 404 INVITATION_NOT_FOUND; refetch bell | apps/server/src/routes/student.ts:641-674 | ✅ |
| A3 | HV bấm reject nhưng lời mời đã accepted (race) | 404 INVITATION_NOT_FOUND (reject chỉ có nhánh 404, không có 409); client chỉ console.error | apps/server/src/routes/student.ts:647-666 | 🔵 |
| A4 | Reject khi mailer lỗi / offline | KHÔNG liên quan mail — reject chỉ là DB update, không gửi email | apps/server/src/routes/student.ts:641-674 | ✅ |
| A5 | HV từ chối nhầm, muốn nhận lại | Phải nhờ GV mời lại; lời mời mới tạo row mới (status pending) | apps/server/src/routes/kernel.ts:690-909 | 🔵 |

## g. NFR liên quan

| ID | Yêu cầu | Nguồn | Nhãn |
|----|---------|-------|------|
| NFR-STUDENT-INVITATIONS-008 | Nút "Từ chối" disabled khi loading (tránh double-submit) | apps/student/src/components/layout/notification-bell.tsx:81-91 | 🔵 |

## h. Truy vết

### UC-04 ↔ FR ↔ Error ↔ Test

| FR | Điểm UC | Error | Test phủ | Nguồn | Nhãn |
|----|---------|-------|----------|-------|------|
| FR-STUDENT-INVITATIONS-014 (từ chối lời mời) | d2-d4, e1-e3, A1-A3 | E-006, E-011 | apps/server/src/student-invitation.test.ts:293-331 (server test phủ reject) | S5 | ✅ |
| BR-STUDENT-INVITATIONS-012 (không cooldown khi mời lại sau rejected) | e2, A5 | — | Không có test riêng — suy ra từ code WHERE status='canceled' | apps/server/src/routes/kernel.ts:770-800 | 🔵 |
| — (GV không còn thấy lời mời sau reject; spec không có FR riêng) | d5-d6 | — | apps/server/src/routes/kernel.ts:912-923 (API trả mọi trạng thái); apps/web/src/lib/repos/students.ts:108-116 (UI lọc chỉ pending) | S2, S10 | 🔵 |
| — (thiếu phủ UI/e2e cho reject) | — | — | 🟡 OQ-8: không có unit test NotificationBell; không có e2e riêng reject | S10 | 🟡 |

### Ghi chú reverse

- Reject KHÔNG gửi mail/notify cho GV — hành vi này là trục trặc UX tiềm năng (GV không biết lời mời đã bị từ chối). 🟡 OQ-4
- Endpoint reject có cập nhật `updatedAt` (tự động bởi Drizzle `.$onUpdate`), KHÔNG có CAS như resend. ✅ apps/server/src/routes/student.ts:641-674; packages/db/src/schema/student-invitation.ts:21-23
```
