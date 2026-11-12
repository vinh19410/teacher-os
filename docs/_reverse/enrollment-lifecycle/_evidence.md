# enrollment-lifecycle — Evidence base (truy vết code → luồng)

## §1. Endpoints (điểm vào)

| Method | Path | Màn/route gọi | Auth | Mục đích nghiệp vụ | Nguồn (file:line) |
|--------|------|---------------|------|--------------------|-------------------|
| POST | `/api/students` (body `classId` + `activateNow`) | Web modal "Thêm học viên vào lớp" → tab "Tạo học viên mới" | teacher kernel session (origin+JSON guard) | Tạo học viên mới, kèm enrollment `invited` nếu có classId; `activateNow=true` (default) kích hoạt ngay | S3 `kernel.ts:463-694`; S2 `contracts.ts:34-68`; S8 `enroll-student-modal.tsx:156-170` |
| POST | `/api/classes/:id/enroll` | Web modal "Thêm học viên vào lớp" → tab "Chọn học viên có sẵn" | teacher kernel session | Enroll học viên có sẵn → `invited`; `activateNow` tùy chọn; 201 `{id}` | S3 `kernel.ts:1385-1443`; S2 `contracts.ts:79-83`; S10 `repos/kernel.ts` (action `enroll-student`) |
| POST | `/api/enrollments/:enrollmentId/accept` | Web nút "Kích hoạt" (roster lớp) | teacher kernel session | Kích hoạt `invited → active`, sinh package + lessons; `{ok:true}` | S3 `kernel.ts:1453-1470`; S7 `class-roster-tab.tsx:262-267`; S10 `repos/kernel.ts:263-267` |
| DELETE | `/api/enrollments/:enrollmentId` | Web nút "Hủy lời mời" (roster lớp) | teacher kernel session | Hủy lời mời (chỉ `invited`); `{ok:true}` | S3 `kernel.ts:1480-1505`; S7 `class-roster-tab.tsx:268-274`; S10 `repos/kernel.ts:268-272` |
| POST | `/api/student/enrollments/:enrollmentId/accept` | Portal nút "Tham gia lớp" | student session (requireStudent + CSRF origin/JSON) | Học viên xác nhận tham gia lớp (cùng hàm kích hoạt) | S5 `student.ts:1291-1324,454-466,722`; S13; S14 `student.ts:819-827` |
| POST | `/api/invoices` (body `enrollmentId`) | Web /tuition "Tạo hóa đơn" | teacher + requireFinanceRole | Tạo hóa đơn — CHỈ cho enrollment `active` | S3 `kernel.ts:209-211,3043-3111`; S2 `contracts.ts:1564-1572` |
| POST | `/api/classes/:id/assignments` | Web lớp → "Giao bài tập" | teacher kernel session | Giao đề — CHỈ nhận studentIds trong roster `active` | S3 `kernel.ts:1511-1601` |
| GET | `/api/kernel` (snapshot) | Web teacher (load gate) | teacher session | Snapshot exposing enrollments (status) | S28 `snapshot.ts:281-284` |
| GET | `/api/student/overview` | Portal trang chủ + lớp | student session | Mọi enrollment của học viên kèm `enrollmentId`, `enrollmentStatus` | S5 `student.ts:978-1041` |
| GET | `/api/student/classes/:classId` | Portal chi tiết lớp | student session | CHỈ enrollment `active` của chính học viên; khác → 404 | S5 `student.ts:1043-1063` |
| POST | `/api/students/invite/resend` (resend invite, `enrollmentId` optional) | Web nút "Gửi lại lời mời" | teacher + canManageStudentInvites | Gửi lại email lời mời LỚP cho enrollment `invited` của học viên | S3 `kernel.ts:1122-1278`; S2 `contracts.ts:2930-2935` |

## §2. Validation (ràng buộc field)

| Field | Rule | Giá trị exact | Lỗi khi vi phạm | Nguồn (file:line) | Nhãn |
|-------|------|---------------|-----------------|-------------------|------|
| enroll.studentId | bắt buộc | z.string().min(1) | 400 readBody (Zod) | S2 `contracts.ts:79-83`; S3 `kernel.ts:1388-1389` | ✅ |
| enroll.activateNow | boolean tùy chọn | optional | — (mặc định undefined = false) | S2 `contracts.ts:81` | ✅ |
| students-create.activateNow | boolean default | `default(true)` | — | S2 `contracts.ts:66` | ✅ |
| students-create.email | "" hoặc email hợp lệ; trùng trong org (đã normalize lower/trim) | — | 409 `STUDENT_ALREADY_IN_ORG` | S2 `contracts.ts:48-55`; S3 `kernel.ts:499-511` | ✅ |
| invoice.enrollmentId | bắt buộc | z.string().min(1) | 400 | S2 `contracts.ts:1566`; S3 `kernel.ts:3060-3068` | ✅ |
| invoice.amount | số nguyên dương | int().min(1) | 400 / client-side "Vui lòng nhập số tiền." | S2 `contracts.ts:1567`; S16 `create-invoice.spec.ts:189-196` | ✅ |
| invoice.due | ISO yyyy-mm-dd hợp lệ theo lịch thật | regex + `parseStartDateStrict` | 400 "invalid body" | S3 `kernel.ts:3085-3087` | ✅ |
| (server) enrollment tồn tại cùng org khi tạo hóa đơn | lookup org-scoped | — | 404 `enrollment not found` | S3 `kernel.ts:3054-3068` | ✅ |
| (server) enrollment `active` khi tạo hóa đơn | status check | `!== "active"` | 409 `Học viên chưa đồng ý tham gia lớp` | S3 `kernel.ts:3069-3071` | ✅ |
| (server) studentIds ⊆ roster active khi giao bài | lookup `status='active'` | — | 400 `student not enrolled` | S3 `kernel.ts:1564-1577` | ✅ |
| (server) accept portal ownership | `enrollment.studentId === s.id` cùng org | — | 404 `enrollment not found` | S5 `student.ts:1305-1311` | ✅ |
| (server) resend enrollment `invited` của đúng học viên | status + studentId + org | — | 404 `INVITATION_NOT_FOUND` wording "Lời mời vào lớp không tồn tại hoặc đã được xử lý" | S3 `kernel.ts:1126-1152` | ✅ |

## §3. Errors (lỗi + wording thật)

| Error ID | Trigger | Wording exact (câu thật) | Recovery | Nguồn throw + catalog (file:line) | Nhãn |
|----------|---------|--------------------------|----------|-----------------------------------|------|
| E-EL-001 | lớp lạ/khác org (enroll; accept map error="class") | `"class not found"` | chọn lại | throw S3 `kernel.ts:1396` · accept map `kernel.ts:1463-1469` · portal S5 `student.ts:1317-1323` | ✅ |
| E-EL-002 | học viên lạ/khác org | `"student not found"` | chọn lại | S3 `kernel.ts:1405` | ✅ |
| E-EL-003 | enroll trùng | `"student already enrolled"` | mở roster | S3 `kernel.ts:1417` | ✅ |
| E-EL-004 | activateNow lỗi | `"enrollment activation failed"` (HTTP 500) | Kích hoạt lại trên roster | S3 `kernel.ts:621,1431` | ✅ |
| E-EL-005 | accept/delete id lạ/khác org | `"enrollment not found"` | đóng modal | S3 `kernel.ts:1466,1493`; S5 `student.ts:1310,1320` | ✅ |
| E-EL-006 | DELETE enrollment active | `"cannot delete active enrollment"` (409) | không có đường | S3 `kernel.ts:1496` | ✅ |
| E-EL-007 | invoice cho invited | `"Học viên chưa đồng ý tham gia lớp"` (409) | kích hoạt trước | S3 `kernel.ts:3070` | ✅ |
| E-EL-008 | giao bài chứa invited | `"student not enrolled"` (400) | bỏ khỏi danh sách | S3 `kernel.ts:1576` | ✅ |
| E-EL-009 | CSRF origin | `"origin not allowed"` (403) | gọi đúng origin | S5 `student.ts:458` | ✅ |
| E-EL-010 | CSRF content-type | `"content-type must be application/json"` (415) | gửi JSON | S5 `student.ts:462` | ✅ |
| E-EL-011 | retry guard cạn | throw `"materializeScheduleForEnrollment: guard retry exhausted"` → 500 | thử lại (idempotent) | S4 `enrollment-activation.ts:653` | ✅ |
| E-EL-012 | resend enrollment không hợp lệ | `"Lời mời vào lớp không tồn tại hoặc đã được xử lý"` + code `INVITATION_NOT_FOUND` | kiểm trạng thái | S3 `kernel.ts:1147-1148` · catalog S2 `contracts.ts:2916` | ✅ |
| E-EL-013 | email trùng khi tạo mới | `"Email này đã được dùng cho học viên <tên>"` + code `STUDENT_ALREADY_IN_ORG` + `existingStudentId/Name/portalLinked` | callout mời lại học viên có sẵn | S3 `kernel.ts:503-509` · catalog S2 `contracts.ts:2914` | ✅ |
| E-EL-014 | mailer lỗi khi resend | `"Không gửi được email lời mời. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau."` + `INVITATION_EMAIL_FAILED` | thử lại | S3 `kernel.ts:1266-1269` · catalog S2 `contracts.ts:2917` | ✅ |
| E-EL-015 | học viên đã onboarding | `"Học viên này đã tham gia cổng học viên"` + `STUDENT_ALREADY_JOINED` | không cần resend | S3 `kernel.ts:1178-1179` · catalog S2 `contracts.ts:2920` | ✅ |
| E-EL-016 | mailer lỗi lúc tạo (không chặn) | response 201 `inviteEmailSent:false`; toast warning "Đã thêm <tên> vào lớp nhưng chưa gửi được email lời mời — bạn có thể bấm Gửi lại lời mời." | Gửi lại lời mời | S3 `kernel.ts:607-614` · UI S8 `enroll-student-modal.tsx:171-178` | ✅ |

> **R2 chú ý:** feature này KHÔNG có file i18n/catalog riêng cho wording — wording là chuỗi hardcode server trả trong body `error` và UI hiển thị nguyên văn (teacher web) hoặc tự viết toast nghiệp vụ (roster: "Đã kích hoạt học viên vào lớp." — S7 `class-roster-tab.tsx:266`; "Đã hủy lời mời tham gia lớp." — :272). Mã máy có catalog: `STUDENT_INVITATION_ERROR_CODES` (S2 `contracts.ts:2913-2921`). Không có mục nào cần ⚠️ vì wording chính là hợp đồng server, đã cite đủ throw-site.

## §4. Business Rules (rule + hằng số + state transition)

| Rule | Trigger | Hằng số/ngưỡng | Có test phủ? | Nguồn (file:line) | Nhãn |
|------|---------|----------------|--------------|-------------------|------|
| Trạng thái hợp lệ chỉ `invited|active` | mọi write | `ENROLLMENT_STATUSES = ["invited","active"]` | có (S19 `kernel.test.ts:1691-1695,1710`) | S2 `contracts.ts:1615-1616`; S1 `enrollment.ts:34` | ✅ |
| Insert mới luôn `status:"invited"` | enroll / create-with-class | literal `"invited"` | có (S19 `kernel.test.ts:7112-7134`; S3) | S3 `kernel.ts:551,1426` | ✅ |
| CAS flip `invited → active` | accept | WHERE `status='invited'` | có (S20 `student.test.ts:1383-1404` idempotent; race chỉ code) | S4 `enrollment-activation.ts:733-743` | ✅ |
| Đã active → accept lại trả ok, không tạo gì | accept-đúp | re-read `isAlreadyActive` | có (S20 `student.test.ts:1383-1404`) | S4 `enrollment-activation.ts:675-704,745-757` | ✅ |
| Chỉ DELETE được `invited` | hủy | `status !== "invited"` → 409 | có (S19 `kernel.test.ts:7271-7324`) | S3 `kernel.ts:1495-1497` | ✅ |
| Gói derive: total = sessionsTotal (auto) / đếm class_session (manual); price = tuitionFee ?? 0; mode = class.mode | kích hoạt | `packageValues` | có (S19 `kernel.test.ts:4873-4882` total 24, price 600000, Offline) | S4 `enrollment-activation.ts:338-348` | ✅ |
| Lessons: sessionsTotal dòng (auto, capped 52 bởi classCreateSchema) / 1 dòng mỗi class_session (manual); legacy schedule → 0 dòng | kích hoạt | cap 52 | có (S19 `kernel.test.ts:4402-4453,4884-4888`) | S4 `enrollment-activation.ts:209-249,350-371`; S2 `contracts.ts:122` | ✅ |
| Unique gói theo enrollment | kích hoạt | `session_package_enrollment_uq` | có (code path catch; test gián tiếp idempotent) | S25 `session-package.ts:45`; S4 `enrollment-activation.ts:662-667` | ✅ |
| Notify `class_enrolled` chỉ khi KHÔNG activateNow | enroll | idempotencyKey `class_enrolled:<enrollmentId>` | có (S19 `kernel.test.ts:7485-7523`) | S3 `kernel.ts:636-659,1433-1441`; S26 `templates.ts:60-76` | ✅ |
| Roster giao bài chỉ active | giao bài | `eq(enrollment.status,"active")` | có (S19 `kernel.test.ts:7351-7399`) | S3 `kernel.ts:1564-1577` | ✅ |
| Hóa đơn chỉ active | tạo hóa đơn | `status !== "active"` → 409 | có (S19 `kernel.test.ts:1516-1538`) | S3 `kernel.ts:3069-3071` | ✅ |
| Portal chi tiết lớp chỉ active | đọc portal | WHERE `status='active'` → else 404 | có (S20 `student.test.ts:840` "404 for an invited enrollment") | S5 `student.ts:1048-1063` | ✅ |
| Attendance/điểm danh chỉ active | điểm danh | `eq(enrollment.status,"active")` | có (S21; route tests) | S5-route khác: `daily-attendance.ts:120,164` | ✅ |

## §5. Entities (đối tượng dữ liệu nghiệp vụ)

| Entity | Field nghiệp vụ chính | Quan hệ | Nguồn (file:line) |
|--------|-----------------------|---------|-------------------|
| ENROLLMENT | id, orgId, classId, studentId, status(invited|active), createdAt | N-1 CLASS, N-1 STUDENT; 1-0..1 SESSION_PACKAGE; 1-N LESSON | S1 `enrollment.ts:17-47` |
| STUDENT | id, orgId, name, phone, email, portalLinked (onboardingCompletedAt) | 1-N ENROLLMENT; unique (org, lower(trim(email))) | S1 imports + S3 `kernel.ts:486-495`; S22 `pdr.md:46` |
| CLASS | id, name, schedule, sessionsTotal, tuitionFee, mode, startDate, schedulingMode | 1-N ENROLLMENT; nguồn derive gói/buổi | S4 `enrollment-activation.ts:294-307` |
| SESSION_PACKAGE | enrollmentId (unique), studentId, total, price, mode, status, start, expiry | 0..1-1 ENROLLMENT (nullable = gói parked) | S25 `session-package.ts:31,45,48-50`; S2 `contracts.ts:1626-1644` |
| LESSON | enrollmentId, classId, day, time, dur, date, type, status, topic | N-1 ENROLLMENT | S4 `enrollment-activation.ts:598-606`; S1-schemas |
| INVOICE | id, studentId, enrollmentId (TEXT, KHÔNG FK), amount, due, status, paymentCode, payToken | N-1 STUDENT; dính enrollment hợp lệ lúc ghi | S23 `invoice.ts:12-17,25-61` |
| CLASS_ASSIGNMENT / TARGET | classId, promptId, title(snapshot), due; target: assignmentId, studentId, submittedAt | N-1 CLASS; target N-1 STUDENT (không qua enrollment) | S24 `class-assignment.ts:21-78` |
| NOTIFICATION (class_enrolled) | studentId, eventType, idempotencyKey `class_enrolled:<enrollmentId>`, linkPath /classes | N-1 STUDENT, dính enrollmentId qua key | S26 `templates.ts:60-76` |

## §6. Cross-repo hops (điểm nghiệp vụ → luồng liên quan)

| Điểm khởi phát | → tới đâu | Cơ chế (đọc/ghi/gọi) | Luồng nghiệp vụ liên quan | Nguồn 2 đầu (file:line) |
|----------------|-----------|----------------------|---------------------------|-------------------------|
| Nút "Kích hoạt" teacher web (`apps/web`) | POST `/api/enrollments/:id/accept` → `activateEnrollment` (server kernel) | ghi (HTTP POST command) | Flow 2 kích hoạt giáo viên | S7 `class-roster-tab.tsx:262-267` · S10 `repos/kernel.ts:263-267` · S3 `kernel.ts:1453-1470` |
| Nút "Tham gia lớp" portal (`apps/student`) | POST `/api/student/enrollments/:id/accept` → CÙNG `activateEnrollment` | ghi (HTTP POST command, student-scoped) | Flow 3 chấp nhận portal — KẾT CỤC GIỐNG Flow 2: cùng CAS flip, cùng materialize gói+buổi, cùng study-pack backfill | S12 `class-card.tsx:105-112` · S14 `student.ts:819-827` · S5 `student.ts:1300-1324` · S4 `enrollment-activation.ts:669-776` |
| Kích hoạt (2 đường) | `materializeScheduleForEnrollment` + `backfillStudyPackTargetsForStudent` | gọi nội bộ server (ghi lesson/package/study-pack target) | Sinh tài nguyên học tập | S4 `enrollment-activation.ts:759-775` · S27 `study-pack-assign.ts` |
| Enroll invited (không activateNow) | `classEnrolledEvent` → notification_record + email đồng bộ | ghi (enqueue + deliver) | Thông báo lời mời lớp | S3 `kernel.ts:1433-1441` · S26 `templates.ts:60-76` · S19 `kernel.test.ts:7485-7523` |
| Snapshot enrollments (server) | web `studentIds` / `invitedStudentIds` (adapter) | đọc (snapshot → adapter) | Badge/KPI roster | S28 `snapshot.ts:281-284` · S11 `classes.ts:65-66` |
| `enrollmentStatus` (server overview) | portal `ClassCard` invited/active UI | đọc (REST GET) | Thẻ "Chờ kích hoạt" | S5 `student.ts:983-1001` · S6 `student-class.ts:119-139` · S12 `class-card.tsx:33,212` |
| Hóa đơn picker (web /tuition) | chỉ liệt kê enrollment active | đọc (snapshot filter) | Chặn hóa đơn invited | S16 `create-invoice.spec.ts:243-248` · S3 `kernel.ts:3069-3071` |
| Giao bài (web lớp) | roster active + 400 chặn server | đọc+ghi | Chặn giao bài invited | S3 `kernel.ts:1564-1577` · S19 `kernel.test.ts:7351-7399` |

## §7. Gaps / Ambiguities (code câm hoặc nghi ngờ)

* Không có test concurrency accept song song — CAS chống race chỉ có bằng chứng code (comment idempotent + CAS WHERE) và test accept-đúp tuần tự — *(negative-search: `grep -rn "Promise.all" apps/server/src/kernel.test.ts` quanh accept = 0 mô phỏng race · loại: test-skip/code-câm)* 🟡 OQ (Gap #1).
* DELETE enrollment `invited` không phát sự kiện/hủy notification đã phát — thông báo "Được mời vào lớp" tồn tại sau khi hủy — *(grep `classEnrolledEvent` chỉ 2 caller create/resend · loại: code-câm chủ đích?)* 🟡 OQ-7.
* Nhánh `input.mode === "backfill"` trong `materializeScheduleForEnrollment` (dành cho curriculum/import chuyển manual→auto #670) nằm ngoài vòng đời UI nhưng cùng file — *(S4 `enrollment-activation.ts:269-289` · loại: dead-code-nghi cho feature này — không phải dead code tổng thể)* 🔵.
* Không tìm thấy test phủ nhánh throw `guard retry exhausted` — *(grep "guard retry exhausted" trong *.test.ts = 0 · loại: test-skip)* 🟡.
* Default cột `status = 'active'` (S1 `enrollment.ts:34`) — code mới không bao giờ dùng default; row legacy có thể tồn tại — *(loại: nghi ngờ dữ liệu cũ)* 🟡 OQ-2.
