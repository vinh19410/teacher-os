# students — Evidence base (truy vết code → luồng)

## §1. Endpoints (điểm vào)

| Method | Path | Màn/route gọi | Auth | Mục đích nghiệp vụ | Nguồn (file:line) |
|--------|------|---------------|------|--------------------|-------------------|
| GET | /api/kernel | Mọi trang teacher (data store) | Session teacher (bootstrap kernelCtx) | Snapshot toàn org (students, classes, enrollments, packages, invoices, lessons…) | `apps/server/src/routes/kernel.ts:448-454`; `apps/server/src/routes/snapshot.ts:233-273` |
| GET | /api/students | /students (tùy chọn — web chính đi qua /api/kernel) | Session teacher | Danh sách student của org (= snapshot.students) | `apps/server/src/routes/kernel.ts:456-461` |
| POST | /api/students | Modal "Thêm học viên mới" | Session teacher + Origin allowlist + JSON | Tạo hồ sơ (+ enrollment invited + mail mời + auto-accept invitation) | `apps/server/src/routes/kernel.ts:463-694` |
| POST | /api/students/:id/resend-invite | Danh sách/chi tiết (nút "Gửi lại lời mời") | Session teacher + role gate `canPublishGrade` | Gửi lại mail mời portal cho hồ sơ có email | `apps/server/src/routes/kernel.ts:1073-1160` |
| GET | /api/students/invitations | Tab "Lời mời đang chờ" | Session teacher | Danh sách lời mời org (boundary student-invitations) | `apps/server/src/routes/kernel.ts:912-922`; web `apps/web/src/lib/repos/invitations.ts:59-70` |
| POST | /api/students/invite | Modal "Mời học viên vào tổ chức" | Session teacher + `canManageStudentInvites` | Mời email vào org (boundary) | `apps/server/src/routes/kernel.ts:696-…` |
| POST | /api/students/invitations/:id/resend | Tab lời mời chờ | Session teacher + role gate | Gửi lại lời mời org (boundary) | `apps/server/src/routes/kernel.ts:925-…` |
| DELETE | /api/students/invitations/:id | Tab lời mời chờ | Session teacher + role gate | Hủy lời mời org → status `canceled` (boundary) | `apps/server/src/routes/kernel.ts:1346-1375` |
| POST | /api/classes/:id/enroll | Chi tiết lớp — picker | Session teacher | Ghi danh học viên CÓ SẠCH vào lớp (boundary enrollment-lifecycle) | `apps/server/src/routes/kernel.ts:1382-1410` |
| GET | /api/students/:id/billing-timeline | /debts (Sổ công nợ) | Session teacher + `requireFinanceRole` | Timeline hóa đơn + giao dịch theo học viên (boundary tuition) | `apps/server/src/routes/kernel.ts:3267-3277` |
| POST | /api/student/onboarding | Portal học viên — wizard 5 bước | Session student (guard portal) | Học viên tự khai mục tiêu + entryScore (boundary; ghi đè entryScore) | `apps/server/src/routes/student.ts:1241-1289` |

## §2. Validation (ràng buộc field)

| Field | Rule | Giá trị exact | Lỗi khi vi phạm | Nguồn (file:line) | Nhãn |
|-------|------|---------------|-----------------|-------------------|------|
| name | bắt buộc, trim, 1..120 ký tự | zod min/max + message "Vui lòng nhập họ tên học viên" / "Họ tên tối đa 120 ký tự" | 400 "invalid body" (wire) · client: "Vui lòng nhập họ tên học viên." | `packages/api/src/contracts.ts:35-39`; `apps/web/src/components/modals/add-student-modal.tsx:74-79` | ✅ (wire) / 🔵 (message zod không xuống wire) |
| phone | trim, rỗng hoặc `^[0-9]{1,20}$` | PHONE_DIGITS_REGEX | 400 "invalid body" | `packages/api/src/contracts.ts:21,41-48` | ✅ |
| email | trim + toLowerCase, rỗng hoặc email hợp lệ; message "Email không hợp lệ" | zod `.email()` | 400 "invalid body" · client: "Email không đúng định dạng." | `packages/api/src/contracts.ts:49-56`; `add-student-modal.tsx:15,81-87` | ✅ |
| parentName | trim ≤120, default "" | zod max | 400 "invalid body" | `packages/api/src/contracts.ts:57` | ✅ |
| parentPhone | như phone | PHONE_DIGITS_REGEX, message riêng "Số điện thoại phụ huynh chỉ gồm chữ số (tối đa 20 số)" | 400 "invalid body" | `packages/api/src/contracts.ts:58-63` | ✅ |
| entryScore | trim ≤50 (`ENTRY_SCORE_MAX_LENGTH=50`), optional; rỗng→NULL | message "Điểm đầu vào tối đa 50 ký tự" | 400 "invalid body" (test 51 ký tự) | `packages/api/src/contracts.ts:24-31`; test `kernel.test.ts:5017-5024` | ✅ |
| classId | trim, optional; phải thuộc org | findClass theo (id, orgId) | 404 "class not found" | `apps/server/src/routes/kernel.ts:471-477` | ✅ |
| activateNow | boolean, default true | zod default | 400 "invalid body" | `packages/api/src/contracts.ts:66` | ✅ |
| (schema strict) | field lạ bị từ chối | `.strict()` | 400 "invalid body" | `packages/api/src/contracts.ts:68` | ✅ |
| UI phone/parentPhone | gõ ký tự không số bị strip ngay; cap 20 ký tự input | `replace(/\D+/g,"").slice(0,20)` | không gửi được giá trị lệch | `add-student-modal.tsx:164-167,204-207` | ✅ |

## §3. Errors (lỗi + wording thật)

| Error ID | Trigger | Wording exact (câu thật) | Recovery | Nguồn throw + catalog (file:line) | Nhãn |
|----------|---------|--------------------------|----------|-----------------------------------|------|
| E-students-001 | Tên rỗng ở modal | "Vui lòng nhập họ tên học viên." | Nhập tên | `add-student-modal.tsx:75` · zod `contracts.ts:39` | ✅ |
| E-students-002 | Email sai dạng ở modal | "Email không đúng định dạng." | Sửa email | `add-student-modal.tsx:82` | ✅ |
| E-students-003 | Zod fail server-side | "invalid body" | Sửa dữ liệu | `kernel.ts:390-393` (readBody) | ✅ |
| E-students-004 | classId lạ | "class not found" | Chọn lớp khác | `kernel.ts:476` | ✅ |
| E-students-005 | Trùng email trong org | `error`: "Email này đã được dùng cho học viên {existingStudentName}" + `code: STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG` ("STUDENT_ALREADY_IN_ORG") + existingStudentId/Name/portalLinked; UI hiển thị thay bằng: "Email này đã tham gia cổng học viên ({name})." hoặc callout 'Hồ sơ "{name}" ({email}) đã có trong tổ chức nhưng học viên chưa hoàn tất tham gia trên Student Portal.' | Gửi lại lời mời / dùng hồ sơ sẵn | throw `kernel.ts:503-509` + race 563-569 · catalog `contracts.ts:2913-2921` (`ALREADY_JOINED: "STUDENT_ALREADY_JOINED"` dòng 2920; mã dùng là `ALREADY_IN_ORG: "STUDENT_ALREADY_IN_ORG"` dòng 2914) · UI `add-student-modal.tsx:121-137` | ✅ |
| E-students-006 | activateNow lỗi kích hoạt | "enrollment activation failed" | Ghi danh lại từ lớp | `kernel.ts:620-622` | ✅ |
| E-students-007 | Mail mời tạo-hồ sơ fail | toast: "Đã lưu hồ sơ học viên nhưng chưa gửi được email lời mời — bạn có thể bấm Gửi lại lời mời trong danh sách học viên." | Bấm resend | `add-student-modal.tsx:107-109` · server nuốt lỗi `kernel.ts:607-615` | ✅ |
| E-students-008 | Resend, thiếu mailer | "Hệ thống gửi email chưa sẵn sàng. Vui lòng thử lại sau." / `INVITATION_EMAIL_UNAVAILABLE` | Thử lại sau | `kernel.ts:1081-1087` · catalog `contracts.ts:2918` | ✅ |
| E-students-009 | Cooldown resend | "Vui lòng đợi {n} giây trước khi gửi lại lời mời." / `INVITATION_RESEND_COOLDOWN` + header Retry-After | Chờ | `kernel.ts:244-250` · catalog `contracts.ts:2919` | ✅ |
| E-students-010 | Resend, student lạ | "Không tìm thấy học viên" / `INVITATION_NOT_FOUND` | Refresh danh sách | `kernel.ts:1108-1114` · catalog `contracts.ts:2916` | ✅ |
| E-students-011 | Resend, không email | "Học viên chưa có địa chỉ email" (không mã) | Bổ sung email (không có UI — OQ-2) | `kernel.ts:1119` | ✅ |
| E-students-012 | Resend, mail lỗi | "Không gửi được email lời mời. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau." / `INVITATION_EMAIL_FAILED` | Thử lại | `kernel.ts:1329-1336` (nhánh kèm enrollmentId: 1264-1271) · catalog `contracts.ts:2917` | ✅ |
| E-students-013 | Resend kèm enrollmentId sai | "Lời mời vào lớp không tồn tại hoặc đã được xử lý" / `INVITATION_NOT_FOUND` | Gửi lại không kèm lớp | `kernel.ts:1145-1151` | ✅ |
| E-students-014 | `ta` resend | "Trợ giảng không có quyền quản lý lời mời học viên" / `FORBIDDEN` | Liên hệ GV chủ | `kernel.ts:224-230,1076` | ✅ |
| E-students-015 | Origin lạ / không JSON | "origin not allowed" (403) · "content-type must be application/json" (415) | Gọi từ app chính thống | `kernel.ts:190-207,374-382` | ✅ |
| E-students-016 | Chưa đăng nhập | "unauthorized" (401) | Đăng nhập | `kernel.ts:213-215` | ✅ |
| E-students-017 | Session student/admin | `ACCOUNT_STUDENT_ROLE` / `ACCOUNT_ADMIN_ROLE` (403; khóa catalog `STUDENT_ON_TEACHER_APP`/`ADMIN_ON_TEACHER_APP` — contracts.ts:1982,1985) | Dùng portal đúng | `apps/server/src/app.ts:227-246` | ✅ |
| E-students-018 | id chi tiết lạ | "Không tìm thấy học viên" + "Học viên này không tồn tại hoặc dữ liệu demo đã được reset." | Link "← Về danh sách học viên" | `$studentId.tsx:47-58` | ✅ |
| E-students-019 | Danh sách rỗng / lọc trống | "Chưa có học viên nào" + hướng dẫn · "Không có học viên nào phù hợp với bộ lọc." | CTA thêm / đổi chip | `index.tsx:139-143,151-156` | ✅ |
| E-students-020 | Snapshot lệch shape | MalformedSnapshotError (class nội bộ web) | Reload | `apps/web/src/lib/kernel-load-state.ts:42-48` | 🔵 |
| E-students-021 | Resend generic (web) | "Không thể gửi lại lời mời. Vui lòng thử lại sau." (fallback khi body rỗng) | Thử lại | `pending-invite-callout.tsx:37,46` | ✅ |
| E-students-022 | Resend thành công | toast "Đã gửi lại lời mời tới {email}" | — | `pending-invite-callout.tsx:88` | ✅ |
| E-students-023 | Submit kernel fail khác (web) | "Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại." | Thử lại | `apps/web/src/lib/use-kernel-form-submit.ts:11-12` | ✅ |

## §4. Business Rules (rule + hằng số + state transition)

| Rule | Trigger | Hằng số/ngưỡng | Có test phủ? | Nguồn (file:line) | Nhãn |
|------|---------|----------------|--------------|-------------------|------|
| Unique (org, lower(trim(email))) partial `trim(email)!=''` | Insert student | — | có (student-multi-org-migration.test.ts:34,52) | `packages/db/src/schema/student.ts:65-70` | ✅ |
| Ẩn `demo-student:%` khỏi teacher view + check trùng | Load/create | prefix `demo-student:` | có (kernel.test.ts qua snapshot fixtures; grading.test.ts dùng prefix) | `snapshot.ts:271`; `kernel.ts:492,1102` | ✅ |
| entryScore ""→NULL; read về `""` | POST /students | 50 ký tự max | có (kernel.test.ts:4995-5025) | `kernel.ts:526`; `contracts.ts:24` | ✅ |
| portalLinked = onboardingCompletedAt != null | Load snapshot | — | có (index.test.tsx:137-187 fixtures) | `snapshot.ts:656` | ✅ |
| Pending count gộp + khử trùng email | Render | — | có (index.test.tsx:189-257) | `index.tsx:50-60`; `repos/students.ts:108-116` | ✅ |
| Attention: tag nợ/sắp-hết, pkg `total>0 && remaining<=4`, invoice chưa paid | Render lead | remaining <= 4 | có (index.test.tsx:95-124) | `index.tsx:64-73` | ✅ |
| pkg = package `active` mới nhất; done/remaining derive từ lesson `completed` của đúng enrollment gói | mapStudents | — | có (repos students.test.ts; repos/students.ts:34-91) | `apps/web/src/lib/repos/students.ts:34-91` | ✅ |
| Cooldown resend 60s | Resend | `DEFAULT_INVITE_COOLDOWN_MS=60_000`; mail timeout `SYNC_INVITE_MAIL_TIMEOUT_MS=5_000`; web abort 15s | có (student-invitation.test.ts:595-609 — 429 + Retry-After; UI test index.test.tsx:175-187) | `kernel.ts:216-217,1092-1093`; `repos/invitations.ts:129-160` (AbortSignal.timeout(15_000) tại 132/160) | ✅ |
| Role resend/invite: teacher, owner, admin, class_teacher (ta bị chặn) | Resend/invite org | GRADING_PUBLISH_ROLE_MAP | có (role-gates.test.ts; student-invitation.test.ts:447 — chặn vai ta) | `kernel.ts:219-231`; `packages/auth/src/role.ts:112-138` | ✅ |
| Tạo kèm lớp → enrollment `invited`; 0 package, 0 lesson đến khi kích hoạt | POST /students | status "invited" | có (kernel.test.ts:7092-7110) | `kernel.ts:544-554` | ✅ |
| `activateNow` → `activateEnrollment` ngay (gói + buổi học sinh ngay) | POST /students | default true | có (E2E manual-student-and-trial-grading.spec.ts:56-79 — POST /api/students + "Kích hoạt trạng thái Đang học ngay" → "Đang học"; kernel.test.ts:1682 chỉ phủ nhánh invited→accept qua /api/enrollments/:id/accept) | `kernel.ts:617-635` | ✅ |
| Mail mời fail-open (không rollback hồ sơ) | POST /students | — | có (student.test.ts:401 pattern fail-open provisioning; kernel log) | `kernel.ts:607-615` | ✅ |
| Tạo hồ sơ trùng email lời mời pending → invitation `accepted` | POST /students | — | không (chưa thấy test riêng — Gap §2) | `kernel.ts:530-543` | 🟡 |
| zalo = phone khi tạo | POST /students | — | không thấy test khẳng định riêng | `kernel.ts:523` | 🔵 |
| Onboarding không xóa entryScore có sẵn | Portal wizard | — | có (student.test.ts:968-995) | `student.ts:1274-1275` | ✅ |

## §5. Entities (đối tượng dữ liệu nghiệp vụ)

| Entity | Field nghiệp vụ chính | Quan hệ | Nguồn (file:line) |
|--------|-----------------------|---------|-------------------|
| student | name, phone, zalo, email, parent_name/phone, entry_score, exam_interest, current_level, target_score, learning_goals(+note), daily_study_hours, onboarding_completed_at, last_invite_email_at, created_at | thuộc organization; 0-n enrollment/package/invoice | `packages/db/src/schema/student.ts:15-71` |
| organization | name, created_at | 1-n student; bootstrap cho teacher mới | `apps/server/src/app.ts:279-290` |
| enrollment | class_id, student_id, status invited/active, created_at | student↔class | `apps/server/src/routes/kernel.ts:544-554`; `packages/db/src/schema/enrollment.ts` |
| session_package | enrollment_id (nullable — parked), student_id, total, price, mode, start, expiry, status | theo student/enrollment | `snapshot.ts:284-311`; `repos/students.ts:34-42` |
| invoice | student_id, enrollment_id, amount, paid_amount, status, due, type | theo student | `snapshot.ts:61-93`; `$studentId.tsx:145,326-368` |
| student_invitation | org_id, inviter_user_id, email, status pending/accepted/rejected/canceled; unique pending per (org, email) | org↔email; accepted khi tạo hồ sơ trùng email | `packages/db/src/schema/student-invitation.ts:10-43`; `kernel.ts:530-543` |
| KernelStudentRow (wire) | id, name, phone, email, zalo, parentName/Phone, entryScore?, portalLinked? | projection của student | `packages/api/src/contracts.ts:1576-1589`; `snapshot.ts:647-657` |
| Student (view model web) | + pkg{total,done,remaining,price,mode,start,expiry}, hasPackage, tags[], notes"", targetBand" —", skills[], examDate"", avatar initials | derive client-side | `apps/web/src/lib/repos/students.ts:53-91`; `apps/web/src/lib/mock-data.ts:22-48` |

## §6. Cross-repo hops (điểm nghiệp vụ → luồng liên quan)

| Điểm khởi phát | → tới đâu | Cơ chế (đọc/ghi/gọi) | Luồng nghiệp vụ liên quan | Nguồn 2 đầu (file:line) |
|----------------|-----------|----------------------|---------------------------|-------------------------|
| Modal "Thêm học viên" | POST /api/students | command bus `add-student` → dispatch → POST + refresh snapshot | Tạo hồ sơ | `apps/web/src/lib/data-actions.ts:106-110` · `repos/kernel.ts:45-51` · `kernel.ts:463` |
| POST /students (có email) | Mailer + `lastInviteEmailAt` | gọi sync 5s, best-effort | Mời portal | `kernel.ts:575-615` |
| POST /students (email trùng invitation pending) | student_invitation.status=accepted | cùng `db.batch` | Auto-accept lời mời org | `kernel.ts:530-543` · `schema/student-invitation.ts:37-42` |
| Nút "Gửi lại lời mời" (web) | POST /api/students/:id/resend-invite | react-query mutation + cooldown đếm ngược từ `retryAfterSeconds` | Resend portal invite | `pending-invite-callout.tsx:60-141` · `repos/invitations.ts:129-157` · `kernel.ts:1073` |
| Tab "Lời mời đang chờ" | GET /api/students/invitations | react-query (staleTime 10s) | Gộp pending | `repos/invitations.ts:59-70,172-180` (staleTime 10_000 tại 178) · `index.tsx:43,56-60` |
| Trang chi tiết — tab Học phí | Dữ liệu snapshot (invoices) | đọc client, click → /tuition/$invoiceId | Học phí theo học viên | `$studentId.tsx:326-368` · `apps/web/src/lib/tuition-from-kernel.ts:194-202,329-…` |
| Dòng danh sách học viên | /students/$studentId | SPA navigate | Chi tiết | `index.tsx:162-169` · `$studentId.tsx:43-61` |
| Học viên onboarding portal (boundary) | student.entry_score / onboarding_completed_at | POST /api/student/onboarding | portalLinked=true, entryScore | `student.ts:1241-1289` · `snapshot.ts:656` |
| Provisioning portal lần đầu đăng nhập (boundary hand-off) | insert student org sớm nhất | `provisionStudentForUser` D1-D7 | Nguồn gốc hồ sơ không do GV tạo | `apps/server/src/student-provisioning.ts:17-84` · `student.ts:124-210` |

## §7. Gaps / Ambiguities (code câm hoặc nghi ngờ)

* KHÔNG có cập nhật/xóa hồ sơ giáo viên — negative search: `grep -rn "kernel\.(patch|put|delete)" apps/server/src --include=*.ts` trả 4 route — PUT attendance (kernel.ts:2909), DELETE invitations (1346), DELETE `/enrollments/:enrollmentId` (1480), DELETE `/classes/:id/sessions/:date` (2642) — không cái nào sửa/xóa hồ sơ học viên; `grep update(student)` chỉ trỏ các update `lastInviteEmailAt`/onboarding — *(loại: code-câm — tính năng vắng mặt)*
* Chip lọc lọc trên `tags` luôn `[]`: negative search `grep -rn "tags" apps/web/src/lib` — setter duy nhất `repos/students.ts:85` — *(loại: dead-code-nghi — OQ-3)*
* "Ghi chú nội bộ" luôn rỗng: `notes: ""` tại `repos/students.ts:86`, không có write path — *(loại: code-câm — OQ-4)*
* `targetBand "—"/skills []/examDate ""` cứng — test `$studentId.test.tsx:69-78` chốt "Chưa đặt mục tiêu" — *(loại: code-câm có test chốt — OQ-5)*
* Auto-accept invitation khi tạo hồ sơ (kernel.ts:530-543) chưa thấy test riêng — *(loại: test-skip/không-có — cần bổ sung)*
* `zalo = input.phone` khi tạo (kernel.ts:523): hành vi copy ẩn, không ô riêng — *(loại: nghi ngờ chủ đích)*
* POST /students không gate role như invite routes — *(loại: nghi ngờ — OQ-6)*
* Wording zod tiếng Việt không xuống wire (server gói hết thành "invalid body") — wording chỉ tồn tại cho client tự validate; AddStudentModal lại tự validate thủ công, không dùng zod — *(loại: code-câm — wording zod hiện là dead wording)*
* E2E `student-org-invitation-and-switcher.spec.ts` và `enroll-existing-student.spec.ts` phủ ranh giới (invitation + enrollment) — không tái lập trong bộ này, chỉ trích làm bằng chứng ranh giới.
