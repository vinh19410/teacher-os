```markdown
---
type: reverse-srs
feature: student-invitations
status: draft
updated: 2026-11-11
confidence_summary: "✅366 🔵47 🟡25 — OQ 11 (đếm lại trên 14 file; loại dòng legend + ghi chú chèn)"
links:
  - docs/_reverse/student-invitations/reverse-sources.md
  - docs/_reverse/student-invitations/reverse-gaps.md
  - docs/_reverse/student-invitations/_evidence.md
  - docs/_reverse/student-invitations/srs/student-invitations-reverse-flows.md
  - docs/_reverse/student-invitations/srs/student-invitations-reverse-states.md
  - docs/_reverse/student-invitations/srs/student-invitations-reverse-erd.md
  - docs/_reverse/student-invitations/usecases/student-invitations-reverse-usecase-index.md
---

# student-invitations — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md).
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md).
- **Evidence code → luồng:** xem [`_evidence.md`](./_evidence.md).

Feature tái lập từ source code monorepo `/root/projects/teacher-os` (product "Cô Mỹ Dạy Tiếng Anh"), provenance type `reverse-srs`. Không có tài liệu SRS gốc cho feature này; PDR có 1 mục tóm tắt "Student Multi-Org and Invitation Model" dùng làm đối chiếu chéo.

### 0.3 Khác biệt với tài liệu chính (chỉ khi feature trùng doc hiện có)

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md`) | Đề xuất |
|------|------------------------|-----------------------------------|---------|
| Cách HV nhận thông báo lời mời | Chuông portal polling mỗi 15 giây (`apps/student/src/lib/repos/student.ts:729`) | "real-time notifications in their portal bell icon" (`docs/project-overview-pdr.md:48`) | `/gap` — chỉnh wording PDR thành "polling 15s" |
| Giáo viên có tạo học viên thủ công không | Vẫn có: nút "Thêm học viên" + `POST /api/students` tạo hồ sơ kèm email (`apps/web/src/routes/_auth/students/index.tsx:97-100`, `apps/server/src/routes/kernel.ts:463`) | "teachers no longer create students manually" (`docs/project-overview-pdr.md:23`) | `/cr` — PDR cần cập nhật theo hành vi hiện tại |

## 1. Scope

Feature mô tả vòng đời **mời học viên tham gia tổ chức (org) qua email** và **học viên đa org**:

- Giáo viên gửi lời mời vào tổ chức của mình bằng địa chỉ email học viên, từ màn Học viên của web giáo viên. ✅ [S2][S10]
- Hệ thống chống trùng: mỗi org chỉ giữ MỘT lời mời đang chờ cho một email (unique per org + email chuẩn hóa). ✅ [S1][S14]
- Cùng một email có thể được mời đồng thời bởi nhiều tổ chức khác nhau. ✅ [S5][S7][S13]
- Email lời mời gửi đồng bộ trong request, nội dung tiếng Việt, dẫn về cổng học viên. ✅ [S2][S16]
- Học viên nhận lời mời ở biểu tượng chuông trên Student Portal (kèm tên org + tên người mời), chấp nhận hoặc từ chối. ✅ [S3][S11]
- Chấp nhận lời mời tạo hồ sơ học viên trong org đích (nếu chưa có) và chuyển org đang hoạt động sang org mới. ✅ [S3][S11]
- Học viên đang học ở nhiều org chuyển đổi org đang hoạt động bằng org-switcher; ngữ cảnh org truyền đi qua header `x-student-org-id`. ✅ [S3][S11][S13]
- Bổ trợ: giáo viên gửi lại email mời portal/lớp cho học viên đã có hồ sơ nhưng chưa tham gia portal (`resend-invite`), dùng chung bộ mã lỗi lời mời. ✅ [S2][S9]
- Bổ trợ: giáo viên tạo học viên thủ công với email trùng lời mời pending → lời mời tự động chuyển "accepted". ✅ [S2][S6]

**Boundary (out of scope):**
- Vòng đời ghi danh vào lớp `enrollment` (`invited` → `active`) và nút "Kích hoạt" — thuộc feature `enrollment-lifecycle`; chỉ intersect tại endpoint `POST /api/students/:id/resend-invite` khi có `enrollmentId`. ✅ [S15]
- Đăng ký/đăng nhập tài khoản học viên, xác thực email — thuộc feature `auth-student-signup`. ✅ [S8]
- Hộp thư in-app học viên (`notification_record`, endpoint inbox) — feature thông báo độc lập; lời mời org KHÔNG ghi dòng `notification_record`. ✅ [S3][S15]
- Chuông thông báo phía giáo viên (bảng `notif`) không liên quan đến lời mời học viên. ✅ [S15]
- Xóa/hủy hồ sơ học viên, xóa org (chỉ có FK cascade). ✅ [S1]

## 2. Actors & Stakeholders

| Actor | Loại (người/hệ thống/ngoài) | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|-----------------------------|----------|--------------|-------|------|
| Giáo viên (membership `teacher`) | người | Mời học viên vào org qua email, theo dõi lời mời chờ | Có | `apps/server/src/routes/kernel.ts:219-231` | ✅ |
| Owner / Admin / Class_teacher (membership org) | người | Cùng quyền quản lý lời mời với giáo viên | Có | `packages/auth/src/role.ts:116-129`, `apps/server/src/routes/kernel.ts:219-221` | ✅ |
| Trợ giảng (`ta`) | người | (bị chặn) không được quản lý lời mời — 403 | Có (negative) | `packages/auth/src/role.ts:116-122`, `apps/server/src/student-invitation.test.ts:567-577` | ✅ |
| Học viên (session role `student`, email đã xác thực) | người | Nhận lời mời, chấp nhận/từ chối, học đa org | Có | `apps/server/src/routes/student.ts:500-545` | ✅ |
| Hệ thống gửi email ngoài (Resend — thiếu `RESEND_API_KEY` thì mailer không sẵn sàng) | hệ thống ngoài | Chuyển phát email lời mời | Có | `apps/server/src/student-invitation.test.ts:549-565`, `apps/server/src/lib/notifications/emit.ts:23-38` | ✅ |
| Tổ chức đích (org) | hệ thống | Đơn vị scope của lời mời, hồ sơ, vai trò | Có | `packages/db/src/schema/student-invitation.ts:16-18` | ✅ |

## 3. Functional Requirements (FR)

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-STUDENT-INVITATIONS-001 | GV gửi lời mời vào org qua email | GV nhập email học viên → hệ thống tạo lời mời `pending` thuộc org của GV và gửi email thông báo; thành công trả 201 kèm object lời mời | P0 | test (`apps/server/src/student-invitation.test.ts:176-191`) + e2e (`apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:102-151`) | `apps/server/src/routes/kernel.ts:696-909` | ✅ |
| FR-STUDENT-INVITATIONS-002 | Chuẩn hóa email trước khi lưu | Email được `trim()` + `toLowerCase()` trước khi tra cứu và ghi; client cũng trim trước khi submit | P1 | test (`apps/server/src/student-invitation.test.ts:193-207`) | `apps/server/src/routes/kernel.ts:702`, `apps/web/src/components/modals/invite-student-modal.tsx:39` | ✅ |
| FR-STUDENT-INVITATIONS-003 | Chặn trùng lời mời pending trong 1 org | Mời email đã có lời mời `pending` trong cùng org → 409 kèm `invitationId` để UI chuyển sang chế độ "gửi lại" | P0 | test (`apps/server/src/student-invitation.test.ts:193-207`, `469-483`) | `apps/server/src/routes/kernel.ts:758-769`, `packages/db/src/schema/student-invitation.ts:38-40` | ✅ |
| FR-STUDENT-INVITATIONS-004 | Chặn mời email đã có hồ sơ trong org | Email đã là học viên (không tính hồ sơ demo) trong org → 409 kèm `existingStudentId`, `existingStudentName`, `portalLinked` để UI đề xuất "gửi lại mời portal" | P0 | test (`apps/server/src/student-invitation.test.ts:209-221`) | `apps/server/src/routes/kernel.ts:707-756` | ✅ |
| FR-STUDENT-INVITATIONS-005 | Một email, nhiều org | Org khác được mời cùng email bình thường (uniqueness chỉ trong phạm vi org) | P0 | test (`apps/server/src/student-invitation.test.ts:223-234`) | `apps/server/src/student-multi-org-migration.test.ts:63-94` | ✅ |
| FR-STUDENT-INVITATIONS-006 | Gửi email lời mời đồng bộ | Email gửi ngay trong request (timeout 5s), subject "Lời mời tham gia {org} trên Cô Mỹ Dạy Tiếng Anh", From-name "{org} qua Cô Mỹ Dạy Tiếng Anh", Reply-To email giáo viên owner sớm nhất của org, link tới {studentOrigin}/login | P0 | test (`apps/server/src/student-invitation.test.ts:458-466`) | `apps/server/src/routes/kernel.ts:850-869`, `apps/server/src/lib/notifications/invite-email.ts:31-47`, `apps/server/src/lib/notifications/org-mail-sender.ts:16-43` | ✅ |
| FR-STUDENT-INVITATIONS-007 | Không để lại "lời mời ma" khi gửi lỗi | Nếu gửi email thất bại: xóa dòng lời mời `pending` vừa tạo và trả 502; nếu trong lúc đó lời mời đã bị chấp nhận thì trả 201 với lời mời đã settled | P0 | test (`apps/server/src/student-invitation.test.ts:509-535`) + e2e (`apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:10-50`) | `apps/server/src/routes/kernel.ts:870-902` | ✅ |
| FR-STUDENT-INVITATIONS-008 | GV xem danh sách lời mời của org | Danh sách toàn bộ lời mời của org (mọi trạng thái) sắp xếp theo createdAt giảm dần; UI lọc chỉ hiện `pending` ở tab "Lời mời đang chờ" | P1 | test (`apps/server/src/student-invitation.test.ts:236-278`) | `apps/server/src/routes/kernel.ts:912-923`, `apps/web/src/lib/repos/students.ts:108-116` | ✅ |
| FR-STUDENT-INVITATIONS-009 | GV thu hồi lời mời pending | DELETE lời mời chỉ áp dụng cho trạng thái `pending` → chuyển `canceled` (không xóa dòng); không phải pending → 404 | P1 | test (`apps/server/src/student-invitation.test.ts:258-277`) | `apps/server/src/routes/kernel.ts:1346-1380` | ✅ |
| FR-STUDENT-INVITATIONS-010 | GV gửi lại lời mời pending | Resend: chỉ cho `pending`, chờ cooldown 60s giữa 2 lần (CAS trên `updatedAt`, lỗi mail thì hoàn nguyên), mỗi lần gửi dùng idempotency key mới | P1 | test (`apps/server/src/student-invitation.test.ts:580-656`) | `apps/server/src/routes/kernel.ts:925-1071` | ✅ |
| FR-STUDENT-INVITATIONS-011 | Chặn trợ giảng quản lý lời mời | Role `ta` gọi invite/resend/cancel → 403 "Trợ giảng không có quyền quản lý lời mời học viên" | P1 | test (`apps/server/src/student-invitation.test.ts:567-577`) | `apps/server/src/routes/kernel.ts:219-231`, `packages/auth/src/role.ts:116-138` | ✅ |
| FR-STUDENT-INVITATIONS-012 | HV xem lời mời pending ở chuông portal | GET notifications trả các lời mời `pending` khớp email session (mọi org), kèm tên org + tên người mời, mới nhất lên đầu; poll mỗi 15s | P0 | test (`apps/server/src/student-invitation.test.ts:280-291`) | `apps/server/src/routes/student.ts:547-577`, `apps/student/src/lib/repos/student.ts:724-731` | ✅ |
| FR-STUDENT-INVITATIONS-013 | HV chấp nhận lời mời → tạo hồ sơ trong org đích | Accept yêu cầu: lời mời tồn tại + email khớp session + đang `pending`; chuyển `accepted`; nếu org đích chưa có hồ sơ học viên cho email đó thì tạo mới (tên = tên session, dự phòng local-part email, dự phòng "Học viên"); trả `{ ok, orgId }` | P0 | test (`apps/server/src/student-invitation.test.ts:333-375`) + e2e (`apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:196-207`) | `apps/server/src/routes/student.ts:579-639` | ✅ |
| FR-STUDENT-INVITATIONS-014 | HV từ chối lời mời | Reject chuyển `rejected`, KHÔNG tạo hồ sơ học viên trong org đích | P1 | test (`apps/server/src/student-invitation.test.ts:293-331`) | `apps/server/src/routes/student.ts:641-674` | ✅ |
| FR-STUDENT-INVITATIONS-015 | HV chuyển org đang hoạt động | Chọn org ở switcher → lưu `active_student_org_id` vào localStorage → mọi request API học viên kèm header `x-student-org-id`; header chỉ nhận giá trị khớp hồ sơ của chính session, không khớp thì lặng lẽ dùng hồ sơ mới nhất; media/download dùng dự phòng `?org=` | P0 | test (`apps/server/src/student.test.ts:417-488`) + e2e (`apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:222-230`) | `apps/server/src/routes/student.ts:177-189`, `apps/student/src/lib/repos/student.ts:45-67`, `apps/student/src/components/layout/org-switcher.tsx:15-52` | ✅ |
| FR-STUDENT-INVITATIONS-016 | Tạo hồ sơ thủ công cùng email → tự động chấp nhận lời mời pending | `POST /api/students` với email trùng lời mời `pending` cùng org → lời mời chuyển `accepted` trong cùng batch | P1 | test (`apps/server/src/student.test.ts:1871-1917`) | `apps/server/src/routes/kernel.ts:530-543` | ✅ |
| FR-STUDENT-INVITATIONS-017 | Không auto-provision khi còn lời mời pending | Học viên đăng nhập portal lần đầu mà còn lời mời `pending` thì KHÔNG được tự cấp hồ sơ vào org sớm nhất; thay vào đó nhận 403 NOT_LINKED và được hướng dẫn bấm chuông để chấp nhận | P0 | test (`apps/server/src/routes/student-auth-otp.test.ts:160-199`) | `apps/server/src/student-provisioning.ts:37-51`, `apps/student/src/components/overview/student-error-view.tsx:104-107` | ✅ |
| FR-STUDENT-INVITATIONS-018 | Gửi lại mời portal/lớp cho hồ sơ có sẵn | Với học viên đã có hồ sơ (email có, chưa hoàn tất onboarding, hoặc còn enrollment `invited`): gửi lại email mời portal hoặc mời vào lớp, cùng cơ chế cooldown 60s CAS trên `student.lastInviteEmailAt`; đã onboarding và không còn lời mời lớp nào → 409 ALREADY_JOINED | P1 | test (`apps/server/src/student-invitation.test.ts:658-750`) | `apps/server/src/routes/kernel.ts:1073-1344` | ✅ |
| FR-STUDENT-INVITATIONS-019 | Bộ đếm "Lời mời đang chờ" thống nhất (#616) | Tab lời mời gộp: học viên có email + chưa portalLinked (đếm theo hồ sơ) và lời mời email pending (đếm theo lời mời), khử trùng lặp theo email | P2 | test (`apps/web/src/routes/_auth/students/index.test.tsx:189`) | `apps/web/src/routes/_auth/students/index.tsx:50-60`, `apps/web/src/lib/repos/students.ts:97-116` | ✅ |
| FR-STUDENT-INVITATIONS-020 | CSRF guard cho accept/reject | POST accept/reject phải có Origin thuộc allowlist và Content-Type JSON; vi phạm → 403 / 415 trước khi vào handler | P0 | test (`apps/server/src/student-invitation.test.ts:411-445`) | `apps/server/src/routes/student.ts:468-483` | ✅ |
| FR-STUDENT-INVITATIONS-021 | Danh sách lời mời org không kiểm tra vai trò | GET `/api/students/invitations` chỉ yêu cầu đăng nhập kernel, không gọi gate vai trò như invite/resend/cancel | P2 | phân tích (đối chiếu `kernel.ts:912-914` với `kernel.ts:699`) | `apps/server/src/routes/kernel.ts:912-914` | 🟡 |
| FR-STUDENT-INVITATIONS-022 | Không giới hạn số org một email có thể tham gia | Code không có trần số org cho một email (uniqueness chỉ per-org); giới hạn thực tế nếu có sẽ do hiệu năng truy vấn guard, không do rule nghiệp vụ | P2 | phân tích (negative-search, xem reverse-gaps OQ-8) | `packages/db/src/schema/student.ts:66-69` | 🔵 |
> 🟡 OQ-11: cột Priority (P0/P1/P2) toàn bảng FR là phán đoán BA suy từ mật độ test/mức bảo vệ trong code, không có nguồn sản phẩm — nhãn ✅ từng dòng chỉ neo hành vi code, KHÔNG neo mức ưu tiên (xem reverse-gaps.md OQ-11).

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-STUDENT-INVITATIONS-001 | anti-spam | Cooldown mặc định 60 giây giữa các lần gửi/gửi lại lời mời (cấu hình qua DI `inviteResendCooldownMs`; E2E truyền 0) | P0 | Gọi lại trong 60s → 429 + header Retry-After | `apps/server/src/routes/kernel.ts:166-167,216,704-705` | ✅ |
| NFR-STUDENT-INVITATIONS-002 | performance | Gửi mail lời mời đồng bộ, timeout 5 giây mỗi lần gọi mailer | P0 | Quá 5s coi như gửi lỗi → 502 | `apps/server/src/routes/kernel.ts:217,866` | ✅ |
| NFR-STUDENT-INVITATIONS-003 | performance (client) | Client hủy chờ resend sau 15s để nút "Đang gửi..." không treo vô hạn | P2 | `AbortSignal.timeout(15_000)` trên fetch resend | `apps/web/src/lib/repos/invitations.ts:131-132` | ✅ |
| NFR-STUDENT-INVITATIONS-004 | freshness | Chuông portal poll lời mời + inbox mỗi 15 giây khi mở app; staleTime 10s | P1 | `refetchInterval: 15_000` | `apps/student/src/lib/repos/student.ts:724-731,756-763` | ✅ |
| NFR-STUDENT-INVITATIONS-005 | reliability | Mỗi lần gửi email mang idempotency key duy nhất: `student_invite:{id}` (lần đầu), `student_invite:{id}:resend:{token}` (resend), token ngẫu nhiên mỗi lần | P0 | Test khẳng định key resend khác key đầu và chứa tiền tố đúng | `apps/server/src/routes/kernel.ts:865,1029-1035`, `apps/server/src/student-invitation.test.ts:653-656` | ✅ |
| NFR-STUDENT-INVITATIONS-006 | security | CSRF fail-closed: Origin phải nằm trong allowlist; POST phải JSON; kernel chặn sẵn POST/PUT/PATCH/DELETE ngoài allowlist | P0 | 403 "origin not allowed" / 415 "content-type must be application/json" | `apps/server/src/routes/kernel.ts:177-207`, `apps/server/src/routes/student.ts:468-498` | ✅ |
| NFR-STUDENT-INVITATIONS-007 | security | Lỗi gửi mail được làm sạch trước khi log/trả về — thông báo 502 không chứa chi tiết SMTP gốc (vd "550 5.1.1") | P1 | Test khẳng định body lỗi không chứa mã SMTP | `apps/server/src/routes/kernel.ts:870-875`, `apps/server/src/student-invitation.test.ts:518-524` | ✅ |
| NFR-STUDENT-INVITATIONS-008 | maintainability | Org list học viên cache 30s client-side; lời mời cache 10s (web) | P2 | staleTime trong query options | `apps/student/src/lib/repos/student.ts:775-781`, `apps/web/src/lib/repos/invitations.ts:172-180` | 🔵 |
> 🟡 OQ-11: cột Priority bảng NFR do BA tự gán từ code, không có nguồn sản phẩm — cần PO xác nhận (reverse-gaps.md OQ-11).

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-STUDENT-INVITATIONS-001 | Một email = nhiều hồ sơ học viên, mỗi org tối đa 1 hồ sơ | Tạo/chấp nhận hồ sơ | FR-005 | `packages/db/src/schema/student.ts:66-69`, `packages/db/src/migrations/0025_spotty_betty_ross.sql:17` | ✅ |
| BR-STUDENT-INVITATIONS-002 | Tối đa 1 lời mời `pending` cho 1 email trong 1 org (partial unique index trên lower(trim(email)) WHERE status='pending') | GV gửi lời mời | FR-003 | `packages/db/src/schema/student-invitation.ts:38-40`, `packages/db/src/migrations/0025_spotty_betty_ross.sql:15` | ✅ |
| BR-STUDENT-INVITATIONS-003 | Lời mời chỉ chấp nhận/từ chối khi: đúng id, email khớp session (lower/trim), status `pending` | HV bấm Chấp nhận/Từ chối | FR-013, FR-014 | `apps/server/src/routes/student.ts:585-604,647-666` | ✅ |
| BR-STUDENT-INVITATIONS-004 | Accept tạo hồ sơ nếu org đích chưa có; đã có thì bỏ qua (idempotent) | HV chấp nhận | FR-013 | `apps/server/src/routes/student.ts:612-636` | ✅ |
| BR-STUDENT-INVITATIONS-005 | Cooldown 60s giữa các lần gửi lại; sau khi thu hồi, mời lại cùng email trong 60s kể từ createdAt của lời mời bị hủy cũng bị chặn 429 | GV mời lại / gửi lại | FR-010 | `apps/server/src/routes/kernel.ts:771-797,966-976`, `apps/server/src/student-invitation.test.ts:486-507` | ✅ |
| BR-STUDENT-INVITATIONS-006 | Chỉ lời mời `pending` được thu hồi; thu hồi chỉ ĐÁNH DẤU `canceled`, không xóa dòng | GV bấm "Thu hồi" | FR-009 | `apps/server/src/routes/kernel.ts:1353-1377` | ✅ |
| BR-STUDENT-INVITATIONS-007 | Gửi email lần đầu thất bại → xóa lời mời pending (không giữ row ma); resend thất bại → hoàn nguyên updatedAt (mở khóa cooldown) | Lỗi mailer | FR-007, FR-010 | `apps/server/src/routes/kernel.ts:876-893,1040-1055` | ✅ |
| BR-STUDENT-INVITATIONS-008 | Email có lời mời pending KHÔNG được auto-provision vào org sớm nhất khi vào portal | HV có pending invitation đăng nhập | FR-017 | `apps/server/src/student-provisioning.ts:37-51` | ✅ |
| BR-STUDENT-INVITATIONS-009 | Chỉ role teacher/owner/admin/class_teacher được mời/gửi lại/thu hồi; `ta` bị chặn | GV-side write | FR-011 | `apps/server/src/routes/kernel.ts:219-231` | ✅ |
| BR-STUDENT-INVITATIONS-010 | Org active = header `x-student-org-id` (hoặc `?org=`) NẾU khớp hồ sơ của chính session; ngược lại dùng hồ sơ mới nhất; org lạ không bao giờ cấp quyền truy cập | Mọi request portal | FR-015 | `apps/server/src/routes/student.ts:177-189`, `apps/server/src/student.test.ts:466-481` | ✅ |
| BR-STUDENT-INVITATIONS-011 | `portalLinked` = đã hoàn thành onboarding (`onboardingCompletedAt` khác null); dùng để phân loại "chờ xác nhận" trên UI giáo viên | Load danh sách | FR-019 | `apps/server/src/routes/snapshot.ts:656`, `apps/web/src/lib/repos/students.ts:97-102` | ✅ |
| BR-STUDENT-INVITATIONS-012 | Mời lại email có lời mời `rejected`/`accepted` không bị cooldown (cooldown chỉ quét các dòng `canceled`) — tạo lời mời pending mới bình thường nếu không còn pending và chưa có hồ sơ | GV mời lại sau khi HV từ chối | FR-003 | `apps/server/src/routes/kernel.ts:773-785` | 🔵 |

## 6. Error Matrix

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-STUDENT-INVITATIONS-001 | Email đã trong org | Mời email đã có hồ sơ học viên trong org (không tính demo-student) | major | FR-004 | Modal giữ nguyên + callout "Chờ xác nhận" hoặc thông báo đã tham gia | 409 kèm existingStudentId/Name/portalLinked; portalLinked=false → hiện nút "Gửi lại lời mời" | `apps/server/src/routes/kernel.ts:744-756`, `apps/web/src/components/modals/invite-student-modal.tsx:61-87` | ✅ |
| E-STUDENT-INVITATIONS-002 | Lời mời đang chờ | Mời email đã có lời mời pending trong org | major | FR-003 | Modal → callout "Chờ xác nhận" + nút gửi lại | 409 kèm invitationId + updatedAt → UI chuyển sang resend | `apps/server/src/routes/kernel.ts:758-769`, `apps/web/src/components/modals/invite-student-modal.tsx:88-106` | ✅ |
| E-STUDENT-INVITATIONS-003 | Cooldown gửi lại | Gửi/mời lại trong 60 giây | minor | FR-010, NFR-001 | Toast lỗi + nút đếm ngược "Gửi lại (Ns)" | 429 + Retry-After + retryAfterSeconds; client khóa nút theo số giây | `apps/server/src/routes/kernel.ts:233-252`, `apps/web/src/components/students/pending-invite-callout.tsx:90-96,105-109` | ✅ |
| E-STUDENT-INVITATIONS-004 | Hệ thống gửi email chưa sẵn sàng | Mailer không cấu hình / getter throw (thiếu RESEND_API_KEY) | major | FR-006 | Toast lỗi | 503 "Hệ thống gửi email chưa sẵn sàng. Vui lòng thử lại sau." | `apps/server/src/routes/kernel.ts:799-808,929-938`, `apps/server/src/lib/notifications/emit.ts:27-38` | ✅ |
| E-STUDENT-INVITATIONS-005 | Gửi email thất bại | Mailer throw (bounce, timeout 5s, lỗi upstream) khi invite lần đầu hoặc resend | major | FR-006, FR-007 | Modal/e2e: hiện thông báo, KHÔNG tạo row pending | 502 "Không gửi được email lời mời. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau." + xóa row (lần đầu) / hoàn nguyên updatedAt (resend) | `apps/server/src/routes/kernel.ts:870-902,1040-1063` | ✅ |
| E-STUDENT-INVITATIONS-006 | Lời mời không tồn tại hoặc đã xử lý | Accept/reject/cancel/resend một lời mời không phải pending (hoặc sai id) | minor | FR-009, FR-013, FR-014 | Chuông: lỗi console; giáo viên: toast | 404 "Lời mời không tồn tại hoặc đã được xử lý" + code INVITATION_NOT_FOUND; web tự refresh danh sách khi resend 404 | `apps/server/src/routes/student.ts:596-604,658-666`, `apps/server/src/routes/kernel.ts:956-964,1364-1372`, `apps/web/src/lib/repos/invitations.ts:219-231` | ✅ |
| E-STUDENT-INVITATIONS-007 | Học viên đã tham gia portal | Gửi lại mời portal cho HV đã onboarding và không còn enrollment `invited` nào | minor | FR-018 | Toast lỗi | 409 "Học viên này đã tham gia cổng học viên" + ALREADY_JOINED | `apps/server/src/routes/kernel.ts:1175-1183` | ✅ |
| E-STUDENT-INVITATIONS-008 | Trợ giảng không có quyền | Role `ta` gọi invite/resend/cancel | major | FR-011 | Toast lỗi 403 | 403 "Trợ giảng không có quyền quản lý lời mời học viên" code FORBIDDEN | `apps/server/src/routes/kernel.ts:223-231` | ✅ |
| E-STUDENT-INVITATIONS-009 | Body không hợp lệ (server) | POST /students/invite với email sai định dạng (zod fail) hoặc body không parse được | minor | FR-001 | Toast lỗi chung | 400 "invalid body" — message zod "Email không hợp lệ" KHÔNG xuống client qua path này | `packages/api/src/contracts.ts:2925-2927`, `apps/server/src/routes/kernel.ts:392` | ✅ |
| E-STUDENT-INVITATIONS-010 | Email sai định dạng (client) | Submit modal với email rỗng/không khớp regex | minor | FR-001 | Lỗi đỏ dưới field "Email học viên" | Chặn submit, hiện "Email không đúng định dạng." | `apps/web/src/components/modals/invite-student-modal.tsx:17,41-45` | ✅ |
| E-STUDENT-INVITATIONS-011 | Origin/Content-Type bị chặn | POST accept/reject thiếu Origin allowlist hoặc Content-Type không phải JSON | major | FR-020 | Không có UI (API-level) | 403 "origin not allowed" / 415 "content-type must be application/json" | `apps/server/src/routes/student.ts:468-483`, `apps/server/src/student-invitation.test.ts:411-445` | ✅ |
| E-STUDENT-INVITATIONS-012 | Tài khoản chưa được liên kết | Session student đã verify nhưng 0 hồ sơ (có/không lời mời pending) | major | FR-017 | Màn "Tài khoản chưa được liên kết" kèm hướng dẫn bấm chuông | 403 NOT_LINKED → StudentErrorView; HV chấp nhận lời mời ở chuông để thoát | `apps/server/src/routes/student.ts:166-174`, `apps/student/src/components/overview/student-error-view.tsx:104-107` | ✅ |
| E-STUDENT-INVITATIONS-013 | Email chưa được xác thực | Session student chưa verify email | major | FR-017 | Màn "Email chưa được xác thực" + nút gửi lại email | 403 STUDENT_EMAIL_UNVERIFIED →StudentErrorView với resend verification | `apps/server/src/routes/student.ts:529-537`, `apps/student/src/components/overview/student-error-view.tsx:108-112` | ✅ |
| E-STUDENT-INVITATIONS-014 | Lỗi gửi lại mời portal/lớp | resend-invite: học viên không tồn tại / enrollment không đúng / không có email / mail lỗi | minor | FR-018 | Toast lỗi | 404 "Không tìm thấy học viên" · 404 "Lời mời vào lớp không tồn tại hoặc đã được xử lý" · 400 "Học viên chưa có địa chỉ email" · 502 EMAIL_SEND_FAILED | `apps/server/src/routes/kernel.ts:1107-1120,1144-1152,1254-1272,1329-1336` | ✅ |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-STUDENT-INVITATIONS-01 | HV được mời tham gia được org sau khi chấp nhận trên portal | e2e: mời → đăng ký portal → xác thực email → chuông → Chấp nhận → toast "Đã tham gia {org}" → chuyển onboarding → org-switcher hiển thị org | e2e pass | `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:102-234` | ✅ |
| SC-STUDENT-INVITATIONS-02 | Không sinh hồ sơ/hàng đợi rác khi gửi mail lỗi | e2e bounce: modal hiện lỗi 502, tab lời mời không có email bounce | e2e pass | `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:10-50` | ✅ |
| SC-STUDENT-INVITATIONS-03 | Một email học chung nhiều trung tâm | API test: accept 2 lời mời từ 2 org → GET /orgs có 2 org → /me theo header đúng org | test pass | `apps/server/src/student-invitation.test.ts:333-409` | ✅ |
| SC-STUDENT-INVITATIONS-04 | Giới hạn spam gửi lại lời mời | test: 429 kèm Retry-After sau cancel trong 60s; resend sớm 429; key idempotency không trùng | test pass | `apps/server/src/student-invitation.test.ts:486-507,595-656` | ✅ |
| SC-STUDENT-INVITATIONS-05 | Tỷ lệ lời mời được chấp nhận (acceptance rate) | Không có metric/log thống kê trong code | chưa có | negative-search: không thấy endpoint thống kê lời mời | 🟡 |
| SC-STUDENT-INVITATIONS-06 | Thời gian từ khi mời đến khi HV chấp nhận (time-to-accept) | Không đo trong code; chỉ có createdAt/updatedAt từng lời mời | chưa có | `packages/db/src/schema/student-invitation.ts:27-33` | 🟡 |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/student-invitations-reverse-erd.md`)

- **Lời mời học viên (`student_invitation`)** — org đích, người mời, email, trạng thái `pending|accepted|rejected|canceled`, createdAt/updatedAt; unique pending per (org, email). ✅ [S1]
- **Hồ sơ học viên (`student`)** — scoped theo org, unique (org, lower(trim(email))) khi email khác rỗng; `lastInviteEmailAt` phục vụ cooldown mời portal; `onboardingCompletedAt` xác định portalLinked. ✅ [S15]
- **Tổ chức (`organization`)** — đơn vị scope lời mời/hồ sơ; tên org làm tên người gửi email. ✅ [S15][S16]
- **Tài khoản (`user`) + thành viên org (`membership`)** — người mời (FK cascade) và vai trò phân quyền quản lý lời mời. ✅ [S1][S17]
- **Thông báo in-app (`notification_record`)** — KHÔNG sinh từ lời mời org; chỉ dùng cho mời vào lớp và thông báo khác trong inbox học viên. ✅ [S15][S3]

## 9. Flows (tóm tắt — chi tiết ở `srs/student-invitations-reverse-flows.md`)

1. GV mời HV qua email (tạo lời mời, uniqueness per org+email, gửi mail đồng bộ). ✅
2. GV gửi lại lời mời pending (cooldown CAS, idempotency key mới). ✅
3. GV thu hồi lời mời pending (status canceled). ✅
4. HV nhận thông báo + chấp nhận (cross-portal: email → portal bell → accept → provisioning hồ sơ org đích → active org mới). ✅
5. HV từ chối lời mời. ✅
6. HV chuyển org đang hoạt động (org switcher + header `x-student-org-id`). ✅
7. GV tạo học viên thủ công cùng email → lời mời pending tự động accepted. ✅

## 10. Screens (tóm tắt)

**Web giáo viên:**
- Màn Học viên (`/students`): nút "Mời học viên" mở modal; tab "Học viên" + tab "Lời mời đang chờ (n)"; kicker đếm "x học viên đang học · y lời mời đang chờ". ✅ [S10]
- Modal "Mời học viên vào tổ chức": field email bắt buộc, mô tả hướng dẫn, lỗi dưới field, callout "Chờ xác nhận" kèm nút "Gửi lại lời mời". ✅ [S10]
- Danh sách lời mời đang chờ: hàng email + thời điểm gửi, badge "Đang chờ chấp nhận", nút "Gửi lại lời mời" (đếm ngược cooldown) và "Thu hồi"; hàng học viên chưa portal badge "Chờ xác nhận" + nút gửi lại mời portal; empty state "Chưa có lời mời nào đang chờ". ✅ [S10]

**Student Portal:**
- Chuông thông báo trên shell (mọi trang): badge = lời mời pending + inbox chưa đọc; mục "Lời mời" hiển thị "Giáo viên {tên} đã mời bạn tham gia tổ chức {org}" + thời điểm, nút "Chấp nhận"/"Từ chối"; mục "Thông báo" là inbox in-app. ✅ [S11]
- Màn "Tài khoản chưa được liên kết" (403 NOT_LINKED): hướng dẫn bấm chuông để chấp nhận lời mời. ✅ [S11]
- Org switcher trên shell ("Tổ chức học tập"): đổi org → invalidate toàn bộ query `["student"]`; ẩn khi 0 org hoặc đang tải. ✅ [S11]
- Sau accept: chuyển org active sang org mới và điều hướng HV chưa onboarding tới wizard `/onboarding`. ✅ [S11][S12]

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Uniqueness pending lời mời và hồ sơ học viên là ràng buộc DB (partial unique index), không chỉ logic ứng dụng | DB schema | `packages/db/src/schema/student-invitation.ts:38-40`, `packages/db/src/schema/student.ts:66-69` | ✅ |
| Session học viên role khác `student` không bao giờ chạm portal API (gate role) | server auth | `apps/server/src/routes/student.ts:506-516` | ✅ |
| Kernel tree (API giáo viên) chặn session role student/admin; org context bootstrap từ membership đầu tiên | server auth | `apps/server/src/app.ts:221-306` | ✅ |
| Header `x-student-org-id` nằm trong CORS allow-headers; giá trị chỉ match hồ sơ của chính session | server CORS | `apps/server/src/app.ts:387`, `apps/server/src/routes/student.ts:177-189` | ✅ |
| Số org một email có thể tham gia không bị chặn bởi schema | DB schema | `packages/db/src/schema/student.ts:66-69` | 🔵 |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Mailer (Resend) + `RESEND_API_KEY` | hạ tầng deploy | 503 EMAIL_UNAVAILABLE cho mọi invite/resend | `apps/server/src/lib/notifications/emit.ts:23-38`, `apps/server/src/student-invitation.test.ts:549-565` | ✅ |
| `studentOrigin` (origin cổng học viên) cho link email | cấu hình env `STUDENT_ORIGINS` | Email không có link tuyệt đối tới portal | `apps/server/src/routes/kernel.ts:163-167`, `apps/server/src/lib/notifications/invite-email.ts:13-19` | ✅ |
| Xác thực email học viên (auth-student-signup) | feature auth | HV chưa verify → 403 EMAIL_UNVERIFIED, không accept được lời mời | `apps/server/src/routes/student.ts:529-537` | ✅ |
| Onboarding wizard | feature student-portal | Sau accept HV chưa onboarding bị điều hướng `/onboarding` trước khi thấy overview | `apps/student/src/routes/_auth/index.tsx:77-79` | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Accept song song hai lần không nhân bản hồ sơ nhờ unique index (org, email) — handler accept tự nó không có CAS | FR-013 idempotent | `apps/server/src/routes/student.ts:606-636`, `packages/db/src/schema/student.ts:66-69` | 🔵 |
| localStorage `active_student_org_id` không phải nguồn quyền — server luôn tự khớp lại hồ sơ theo session | FR-015 an toàn | `apps/student/src/lib/repos/student.ts:45-67`, `apps/server/src/routes/student.ts:180-189` | ✅ |
| Idempotency key của mailer chống gửi trùng khi retry hạ tầng | NFR-005 | `apps/server/src/routes/kernel.ts:865,1029-1035` | 🔵 |
| Lời mời `pending` không bao giờ tự hết hạn (không job dọn dẹp trong repo) | vòng đời lời mời | negative-search `grep -rn "studentInvitation" apps/server/src` không thấy scheduler/cron | 🔵 |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] OQ-1: Lời mời pending có cần thời hạn hết hạn (TTL) và job dọn dẹp không? Hiện pending sống vô hạn. *(liên quan Mục 5/9 · cần PO quyết)*
- [ ] OQ-2: GET danh sách lời mời không gate vai trò (mọi role kernel đọc được) — chủ ý (TA cần xem) hay thiếu sót? *(Mục 3 FR-021 · cần dev/PO quyết)*
- [ ] OQ-3: Có cần chặn GV mời chính email của mình/email tài khoản giáo viên không? Code hiện không chặn. *(Mục 5 · cần PO quyết)*
- [ ] OQ-11: Toàn bộ mức ưu tiên P0/P1/P2 của FR/NFR và "Mức độ" use case là phán đoán BA suy từ code (repo không có nguồn priority sản phẩm) — cần PO duyệt trước khi dùng lập kế hoạch. — *(liên quan: Mục 3/4 · cần: PO quyết)*
```
