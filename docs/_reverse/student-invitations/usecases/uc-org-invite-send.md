```markdown
# UC-org-invite-send — GV gửi lời mời vào tổ chức qua email (reverse, draft)

## a. Mục tiêu & bối cảnh
Giáo viên muốn đưa một học viên mới vào tổ chức mà không tự tay nhập hồ sơ: gửi email mời, học viên tự đăng nhập portal và chấp nhận. Kết quả mong đợi: lời mời `pending` tồn tại đúng 1 dòng cho (org, email) và email đã tới hộp thư học viên. ✅ (`apps/server/src/routes/kernel.ts:696-909`)

## b. Actor chính
Giáo viên (membership teacher/owner/admin/class_teacher). Trợ giảng bị chặn 403. ✅ (`apps/server/src/routes/kernel.ts:219-231`)

## c. Tiền điều kiện
- GV đã đăng nhập web giáo viên, có kernelCtx (org + role). ✅ (`apps/server/src/app.ts:278-298`)
- Hệ thống gửi email khả dụng (mailer cấu hình). ✅ (`apps/server/src/lib/notifications/emit.ts:27-38`)
- Email học viên chưa có hồ sơ trong org và không có lời mời pending. (nếu có → vẫn gửi được request, hệ thống trả 409 có cấu trúc) ✅ (`apps/server/src/routes/kernel.ts:707-769`)

## d. Hậu điều kiện
- Thành công: 1 dòng `student_invitation` status pending + email đã gửi (idempotencyKey `student_invite:{id}`); UI thêm lời mời vào tab đang chờ. ✅ (`apps/server/src/routes/kernel.ts:810-909`)
- Thất bại gửi mail: KHÔNG còn dòng lời mời (đã xóa) — không row ma. ✅ (`apps/server/src/routes/kernel.ts:876-901`)

## e. Luồng chính
1. GV mở màn Học viên, bấm "Mời học viên" → modal "Mời học viên vào tổ chức". ✅ (`apps/web/src/routes/_auth/students/index.tsx:90-96`, `apps/web/src/components/modals/invite-student-modal.tsx:112-167`)
2. GV nhập email; client kiểm tra regex — sai thì chặn tại chỗ với "Email không đúng định dạng.". ✅ (`apps/web/src/components/modals/invite-student-modal.tsx:17,41-45`)
3. Client POST email đã trim tới endpoint invite. ✅ (`apps/web/src/lib/repos/invitations.ts:74-93`)
4. Server chuẩn hóa lower/trim; tra hồ sơ org (trừ demo-student) → thấy thì 409 E-001 kèm existingStudentId/Name/portalLinked. ✅ (`apps/server/src/routes/kernel.ts:707-756`)
5. Server tra lời mời pending cùng org → thấy thì 409 E-002 kèm invitationId. ✅ (`apps/server/src/routes/kernel.ts:726-769`)
6. Server kiểm tra cooldown với các dòng canceled gần nhất (60s) → chạm thì 429 E-003 + Retry-After. ✅ (`apps/server/src/routes/kernel.ts:771-797`)
7. Server resolve mailer; thiếu → 503 E-004. ✅ (`apps/server/src/routes/kernel.ts:799-808`)
8. Insert lời mời pending; đụng unique (race) → re-check và trả lại 409 tương ứng. ✅ (`apps/server/src/routes/kernel.ts:810-848`)
9. Build nội dung email tiếng Việt (subject "Lời mời tham gia {org} trên Cô Mỹ Dạy Tiếng Anh", link {studentOrigin}/login, reply-to chủ org) và gửi đồng bộ (timeout 5s). ✅ (`apps/server/src/lib/notifications/invite-email.ts:31-47`, `apps/server/src/lib/notifications/org-mail-sender.ts:16-43`, `apps/server/src/routes/kernel.ts:850-869`)
10. Gửi OK → trả 201 object lời mời; UI toast "Đã gửi lời mời tới {email}", đóng modal, refresh danh sách. ✅ (`apps/server/src/routes/kernel.ts:904-909`, `apps/web/src/components/modals/invite-student-modal.tsx:50-54`)

## f. Luồng thay thế / ngoại lệ
- f1 Email sai định dạng qua API: 400 "invalid body" (E-009). ✅ (`apps/server/src/routes/kernel.ts:388-390`)
- f2 Gửi mail lỗi (bounce/timeout): xóa row pending, 502 E-005; nếu lời mời vừa được accept đồng thời → trả 201 với bản ghi settled. ✅ (`apps/server/src/routes/kernel.ts:870-902`)
- f3 Role `ta`: 403 E-008 "Trợ giảng không có quyền quản lý lời mời học viên". ✅ (`apps/server/src/routes/kernel.ts:223-231`)
- f4 Origin/Content-Type sai: 403/415 trước handler (E-011). ✅ (`apps/server/src/routes/kernel.ts:177-207`)
- f5 UI nhận E-001 với portalLinked=false → hiện callout "Chờ xác nhận" kèm nút "Gửi lại lời mời" (target hồ sơ); portalLinked=true → "Email này đã tham gia cổng học viên ({name}).". ✅ (`apps/web/src/components/modals/invite-student-modal.tsx:61-87`)
- f6 UI nhận E-002 kèm invitationId → callout gửi lại lời mời (target invitation). ✅ (`apps/web/src/components/modals/invite-student-modal.tsx:88-106`)

## g. Yêu cầu đặc biệt (NFR)
- Cooldown 60s cấu hình được (DI), E2E truyền 0. ✅ (`apps/server/src/routes/kernel.ts:166-167,704-705`)
- Không log/return chi tiết SMTP gốc. ✅ (`apps/server/src/routes/kernel.ts:870-875`)
- Thời gian chờ client resend 15s (không dùng cho lần gửi đầu). ✅ (`apps/web/src/lib/repos/invitations.ts:131-132`)

## h. Traceability
- FR: FR-STUDENT-INVITATIONS-001..007, 020 · Errors: E-001..005, E-009..011 · OQ: OQ-3 (chặn tự mời), OQ-5 (cooldown sau rejected)
- Test: `apps/server/src/student-invitation.test.ts:176-234,447-578` · e2e: `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:10-100`
- Nghiệp vụ tự mời email chính mình không bị chặn (OQ-3) 🔵 — hệ quả: hồ sơ học viên trùng email giáo viên có thể sinh ra trong org.

## Ma trận UC ↔ FR ↔ Error (UC này)

| FR | Error chính | Test phủ |
|----|-------------|----------|
| FR-001 | E-009, E-010 | `apps/server/src/student-invitation.test.ts:176-191` |
| FR-002/003 | E-002 | `apps/server/src/student-invitation.test.ts:193-207,469-483` |
| FR-004 | E-001 | `apps/server/src/student-invitation.test.ts:209-221` |
| FR-005 | — | `apps/server/src/student-invitation.test.ts:223-234` |
| FR-006 | E-004 | `apps/server/src/student-invitation.test.ts:458-466,538-565` |
| FR-007 | E-005 | `apps/server/src/student-invitation.test.ts:509-535` |
| FR-011 | E-008 | `apps/server/src/student-invitation.test.ts:567-577` |
| FR-020 | E-011 | `apps/server/src/student-invitation.test.ts:411-445` |
```
