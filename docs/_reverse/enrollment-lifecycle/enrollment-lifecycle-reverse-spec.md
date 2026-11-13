---
type: reverse-srs
feature: enrollment-lifecycle
status: draft
updated: 2026-11-11
confidence_summary: "✅97 🔵3 🟡67 (trong spec; toàn bộ 13 file: ✅254 🔵10 🟡75 — đếm cơ học sau audit, loại dòng legend/front-matter) — OQ 10"
links:
  - reverse-sources.md
  - reverse-gaps.md
  - _evidence.md
  - srs/enrollment-lifecycle-reverse-flows.md
  - srs/enrollment-lifecycle-reverse-states.md
  - srs/enrollment-lifecycle-reverse-erd.md
  - usecases/enrollment-lifecycle-reverse-usecase-index.md
---

# enrollment-lifecycle — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) — 28 nguồn code/test/doc đọc trực tiếp từ repo `/root/projects/teacher-os`.
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md) — 10 OQ, 4 Gap, 1 Conflict, 4 Inferred.
- **Quyết định sản phẩm duyệt trước:** PDR ghi quyết định bền vững "Enrollment có vòng đời trạng thái `invited` → `active`…". ✅ [S22 `docs/project-overview-pdr.md:24`]

### 0.3 Khác biệt với tài liệu chính (chỉ khi feature trùng doc hiện có)

PDR là doc chính duy nhất đề cập feature. So từng mệnh đề quyết định PDR vs code:

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md:23-24`) | Đề xuất |
|------|------------------------|------------------------------------------------------|---------|
| Đường thêm học viên vào lớp | POST `/api/classes/:id/enroll` (S3 `kernel.ts:1385`) VÀ cả POST `/api/students` kèm `classId` (S3 `kernel.ts:544-553`) đều tạo `invited` | PDR:23 chỉ nêu "teachers … only enroll existing students into classes via POST /api/classes/:id/enroll" | PDR cần bổ sung chú thích nhánh tạo-học-viên-mới-kèm-lớp — cách ghi do PO chốt (không tự chọn bên) 🟡 OQ-1 |
| Trạng thái mặc định DB | Cột `status` default `'active'` chỉ để backfill row cũ; code mới luôn ghi tường minh (S1 `enrollment.ts:30-34`) | PDR không nêu default | Ghi rủi ro row legacy vào spec + OQ-2 🟡 |
| Hủy enrollment | DELETE xóa hẳn row; KHÔNG có trạng thái `cancelled` (S3 `kernel.ts:1480-1505`) | PDR:24 nói "hủy lời mời (DELETE) chỉ áp dụng invited" — khớp | Không đổi ✅ |

## 1. Scope

Feature **enrollment-lifecycle** quản lý vòng đời quan hệ "học viên ∈ lớp" trong một tổ chức:

- Giáo viên thêm học viên (có sẵn hoặc tạo mới) vào lớp → sinh row `enrollment` trạng thái `invited`; chưa có gói học (`session_package`) và chưa có lịch buổi (`lesson`). ✅ [S3 `kernel.ts:1420-1427`, S19 `kernel.test.ts:7112-7134`]
- Enrollment trở thành `active` theo ĐÚNG MỘT trong hai đường: giáo viên bấm "Kích hoạt" trên roster lớp (POST `/api/enrollments/:id/accept`), hoặc học viên bấm "Tham gia lớp" trên portal (POST `/api/student/enrollments/:id/accept`). ✅ [S3 `kernel.ts:1445-1470`, S5 `student.ts:1291-1324`, S4 `enrollment-activation.ts:656-668`]
- Khi kích hoạt: hệ thống CAS-flip `invited → active`, sinh `session_package` derive từ lớp (total = số buổi lớp, price = học phí lớp, mode = lớp) và sinh chuỗi dòng `lesson`; thao tác idempotent (accept lại không nhân đôi). ✅ [S4 `enrollment-activation.ts:733-775`, S19 `kernel.test.ts:7176`, S20 `student.test.ts:1383-1404`]
- Hủy lời mời: DELETE chỉ cho phép khi `status = 'invited'`; `active` bị chặn 409; xóa hẳn row (không có trạng thái `cancelled`), sau đó mời lại được. ✅ [S3 `kernel.ts:1472-1505`, S19 `kernel.test.ts:7271-7324`, S15 `enroll-existing-student.spec.ts:302-374`]
- Cổng tài chính/bài tập: tạo hóa đơn và giao bài tập chỉ chấp nhận enrollment `active`; `invited` bị chặn (409 / 400) và UI ẩn luôn lựa chọn. ✅ [S3 `kernel.ts:3069-3071`, `kernel.ts:1564-1577`, S16 `create-invoice.spec.ts:219-248`, S19 `kernel.test.ts:1516-1538`, `kernel.test.ts:7351-7399`]
- Trạng thái hiển thị hai đầu: teacher web (badge "Đã mời"/"Đang học", KPI "N chờ xác nhận") và portal học viên (thẻ "Chờ kích hoạt" + nút "Tham gia lớp"). ✅ [S7 `class-roster-tab.tsx:144-150`, S9 `$classId.tsx:285-292`, S12 `class-card.tsx:99-113,212`]

**Boundary (out of scope):**

- Học phí, thanh toán, ledger giao dịch — feature `invoice/payment` (chỉ lấy điểm chạm "chặn khi chưa active"). ✅ [S3 `kernel.ts:3042-3111`]
- Nội dung giao bài, chấm điểm — feature `assignment` (chỉ lấy điểm chạm "chỉ chọn học viên active"). ✅ [S3 `kernel.ts:1507-1601`]
- Onboarding portal học viên, email lời mời portal, multi-org switch — feature `student-provisioning` (chỉ lấy điểm chạm resend lời mời lớp). ✅ [S3 `kernel.ts:1122-1278`]
- Kỳ nghỉ/lệch lịch sinh dòng buổi — feature `holiday` (chỉ lấy phần materialize buổi lúc kích hoạt). ✅ [S4 `enrollment-activation.ts:281-654`]
- Học viên rời lớp giữa khóa (un-enroll khi `active`) — KHÔNG tồn tại trong code; chỉ hủy được `invited`. ✅ negative-search [S3 — không có route DELETE cho enrollment active; `grep -rn "unenroll\|withdraw" apps/server/src` = 0 kết quả] 🟡 OQ-3
- Quản lý hồ sơ học viên (tên/SĐT/email/điểm đầu vào, trang /students, sửa hồ sơ) — feature `students`; enrollment chỉ đọc studentId và chỉ chạm ghi hồ sơ qua nhánh tạo-mới-kèm-lớp (UC-1 f1, Conflict C-1). ✅
- Lời mời portal qua email (bảng `student_invitation` pending/accepted, callout mời lại) — feature `student-invitations`; enrollment chỉ chạm khi tạo học viên mới kèm lớp (kernel.ts:530-543 tự accept invitation pending) và resend lời mời LỚP (FR-EL-015). ✅

## 2. Actors & Stakeholders

| Actor | Loại | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|------|----------|--------------|-------|------|
| Giáo viên (teacher role, chủ org) | người | Thêm học viên vào lớp; kích hoạt; hủy lời mời | Có | S3 `kernel.ts:463,1385,1453,1480`; S22 `pdr.md:14` | ✅ |
| Học viên (student role, portal) | người | Xác nhận tham gia lớp đang `invited` | Có | S5 `student.ts:1300-1324`; S12 `class-card.tsx:105-112` | ✅ |
| Hệ thống phân quyền tài chính (requireFinanceRole) | hệ thống | Chặn role không phải teacher/finance tạo hóa đơn trên enrollment | Có (điểm chạm) | S3 `kernel.ts:209-211`; S19 `require-finance-role.test.ts` | ✅ |
| Bộ máy thông báo (notification enqueue + mailer) | hệ thống | Phát `class_enrolled` + email lời mời lớp khi tạo `invited` | Có (điểm chạm) | S26 `templates.ts:60-76`; S3 `kernel.ts:1434-1441` | ✅ |
| Phụ huynh | người (gián tiếp) | Nhận email/nhắc; không thao tác enrollment | Không | S26 (body email) | 🔵 |

## 3. Functional Requirements (FR)

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-EL-001 | Thêm học viên có sẵn vào lớp → invited | Giáo viên chọn học viên có sẵn trong org từ modal lớp; server kiểm lớp + học viên cùng org, chặn trùng (mỗi cặp lớp-học viên đúng 1 enrollment — unique index DB), insert `enrollment` status `invited`, trả 201 + id. Chưa có package/lesson. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | e2e + test | S3 `kernel.ts:1385-1443`; S1 `enrollment.ts:39-43`; S15 `enroll-existing-student.spec.ts:174-263` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-002 | Tạo học viên mới kèm lớp → invited | POST `/api/students` với `classId` tạo student + enrollment `invited` trong cùng batch; trùng email trong org → 409 `STUDENT_ALREADY_IN_ORG`. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S3 `kernel.ts:513-553`; S2 `contracts.ts:34-68`; S19 `kernel.test.ts:7092-7110` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-003 | Kích hoạt ngay lúc thêm (`activateNow`) | Checkbox "Kích hoạt trạng thái Đang học ngay" (default bật khi tạo học viên mới): server insert `invited` rồi gọi `activateEnrollment` ngay; lỗi kích hoạt → 500 `enrollment activation failed`. | P1 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S2 `contracts.ts:66,81`; S3 `kernel.ts:617-635,1428-1432`; S20 `student.test.ts:1785-1869` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-004 | Kích hoạt bởi giáo viên | Nút "Kích hoạt" trên roster lớp (modal xác nhận) → POST `/api/enrollments/:enrollmentId/accept` → chuyển `invited → active`, sinh session_package derive từ lớp + chuỗi lesson; toast "Đã kích hoạt học viên vào lớp."; badge chuyển "Đang học". | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | e2e + test | S3 `kernel.ts:1453-1470`; S7 `class-roster-tab.tsx:188-203,231-278`; S15 `enroll-existing-student.spec.ts:265-289`; S19 `kernel.test.ts:7136-7171` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-005 | Chấp nhận bởi học viên từ portal | Portal hiện thẻ "Chờ kích hoạt" + nút "Tham gia lớp" cho enrollment `invited` của chính học viên; POST `/api/student/enrollments/:id/accept` yêu cầu sở hữu (enrollment.studentId == student đăng nhập, cùng org) — khác học viên → 404; cùng logic kích hoạt với FR-EL-004. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S5 `student.ts:1291-1324`; S12 `class-card.tsx:33,99-113`; S20 `student.test.ts:1292-1424` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-006 | Sinh gói học derive từ lớp khi active | session_package: total = số buổi lớp (manual: đếm class_session; auto: sessionsTotal), price = học phí lớp ?? 0, mode = mode lớp, status `active`, unique theo enrollment; client không được phép nhập field gói (bị bỏ qua). | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S4 `enrollment-activation.ts:338-348,505-521`; S19 `kernel.test.ts:4959-4980`; S17 `student-package-validation.spec.ts:45-48` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-007 | Sinh chuỗi buổi học khi active | Sinh `sessionsTotal` dòng `lesson` cho enrollment (auto: từ schedule + startDate; manual: từ class_session), áp shift/cancel ngày nghỉ; lớp legacy schedule không parse được → 0 dòng (fail closed). | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S4 `enrollment-activation.ts:209-249,281-654`; S19 `kernel.test.ts:4402-4430` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-008 | Idempotent kích hoạt (CAS) | CAS UPDATE chỉ flip khi status vẫn `invited`; accept lại → 200, không nhân đôi package/lesson; hai request song song chỉ một request ghi; unique violation `session_package_enrollment_uq` được phục hồi về ok nếu đã active. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S4 `enrollment-activation.ts:656-676,729-757`; S20 `student.test.ts:1383-1404` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-009 | Hủy lời mời (chỉ invited) | Nút "Hủy lời mời" + modal xác nhận → DELETE `/api/enrollments/:id`; chỉ cho khi `status = 'invited'`; `active` → 409; xóa hẳn row; sau đó mời lại cùng học viên thành công (không 409). | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | e2e + test | S3 `kernel.ts:1472-1505`; S7 `class-roster-tab.tsx:204-218,231-278`; S19 `kernel.test.ts:7271-7324`; S15 `enroll-existing-student.spec.ts:302-374` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-010 | Chặn hóa đơn khi chưa active | POST `/api/invoices` với enrollment `invited` → 409 "Học viên chưa đồng ý tham gia lớp"; enrollment không tồn tại/khác org → 404; picker tạo hóa đơn ẩn học viên chưa kích hoạt. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | e2e + test | S3 `kernel.ts:3066-3071`; S16 `create-invoice.spec.ts:219-248`; S19 `kernel.test.ts:1516-1538` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-011 | Chặn giao bài khi chưa active | POST `/api/classes/:id/assignments` chỉ nhận studentIds nằm trong roster `active` của lớp; có học viên `invited` trong danh sách → 400 "student not enrolled". | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S3 `kernel.ts:1564-1577`; S19 `kernel.test.ts:7351-7399` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-012 | Đọc trạng thái trên teacher web | Snapshot exposing enrollments (classId, studentId, status, createdAt); web tách active/invited thành `studentIds` / `invitedStudentIds`; badge "Đã mời" (warn) / "Đang học" (success); KPI "học viên · N chờ xác nhận". | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | e2e | S28 `snapshot.ts:281-284`; S11 `classes.ts:65-66`; S7 `class-roster-tab.tsx:103-150`; S9 `$classId.tsx:285-292` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-013 | Đọc trạng thái trên portal | GET `/api/student/overview` trả mọi enrollment của học viên (kèm `enrollmentId`, `enrollmentStatus`); chi tiết lớp GET `/api/student/classes/:classId` CHỈ trả khi enrollment `active` của chính học viên — `invited`/khác org/không ghi danh đều 404; lịch học gộp cũng chỉ đếm enrollment `active`. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S5 `student.ts:983-1001,1043-1063,1112-1128`; S20 `student.test.ts:1336-1348`; S22 `pdr.md:25` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-014 | Thông báo lời mời lớp | Khi tạo `invited` (không activateNow): phát sự kiện `class_enrolled` khóa idempotency `class_enrolled:<enrollmentId>` + email lời mời lớp đồng bộ; replay enroll trùng → 409 không thêm thông báo; enqueue lỗi không làm hỏng request (fail-open). | P1 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S26 `templates.ts:60-76`; S3 `kernel.ts:636-683,1433-1441`; S19 `kernel.test.ts:7485-7809` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-015 | Gửi lại lời mời lớp (resend) | Endpoint resend invite của giáo viên nhận `enrollmentId` tùy chọn: chỉ nhận enrollment `invited` của đúng học viên (khác → 404 "Lời mời vào lớp không tồn tại hoặc đã được xử lý"); không truyền id → chọn enrollment `invited` mới nhất; có cooldown + chống trùng email. | P1 (🟡 OQ-10 — không nguồn nào nêu priority) | phân tích | S3 `kernel.ts:1122-1278`; S2 `contracts.ts:2930-2935` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-016 | Kích hoạt bổ trợ study-pack | Sau khi enrollment đã `active` (kể cả accept-đúp), hệ thống backfill target study-pack của học viên trong lớp (`backfillStudyPackTargetsForStudent`). | P2 (🟡 OQ-10 — không nguồn nào nêu priority) | phân tích | S4 `enrollment-activation.ts:696-704,747-755,769-774`; S27 `study-pack-assign.ts` | ✅ (hành vi) · 🟡 (priority) |
| FR-EL-017 | Bảo vệ CSRF cho accept portal | POST `/api/student/enrollments/*` yêu cầu Origin nằm trong whitelist (khác → 403 "origin not allowed") và Content-Type JSON (khác → 415 "content-type must be application/json"); role không phải student → 403. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S5 `student.ts:453-466,722`; S20 `student.test.ts:1441-1484` | ✅ (hành vi) · 🟡 (priority) |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-EL-001 | consistency | Kích hoạt là multi-write (enrollment + package + lessons + holiday rows) nhưng khóa kín cửa sổ TOCTOU: statement-0 guard nguyên tử kiểm `status='active'` + chưa có lesson + trạng thái lớp không đổi, retry tối đa 3 lần; hết retry → throw `materializeScheduleForEnrollment: guard retry exhausted`. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | kiểm tra code | S4 `enrollment-activation.ts:269-280,494-504,648-653` | ✅ (hành vi) · 🟡 (priority) |
| NFR-EL-002 | integrity | Ràng buộc DB: `enrollment_class_student_uq` unique (classId, studentId) — một học viên một enrollment mỗi lớp; `session_package_enrollment_uq` unique enrollmentId — một gói mỗi enrollment. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S1 `enrollment.ts:39-43`; S25 `session-package.ts:45` | ✅ (hành vi) · 🟡 (priority) |
| NFR-EL-003 | security | Mọi thao tác enrollment đều org-scoped (orgId từ session, không tin client); accept portal kiểm sở hữu enrollment; cross-org đọc/ghi/xóa đều 404 không lộ thông tin. | P0 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S3 `kernel.ts:1489-1497`; S5 `student.ts:1305-1311`; S19 `kernel.test.ts:4480-4496,7326-7349` | ✅ (hành vi) · 🟡 (priority) |
| NFR-EL-004 | reliability | Thông báo fail-open: enqueue lỗi (mất bảng ghi) → enroll vẫn 201. | P2 (🟡 OQ-10 — không nguồn nào nêu priority) | test | S19 `kernel.test.ts:7798-7809` | ✅ (hành vi) · 🟡 (priority) |
| NFR-EL-005 | compatibility | Portal parse `enrollmentStatus` với `.catch("active")` — server cũ chưa trả field vẫn chạy (hiện "đang học"); `enrollmentId` `.catch("")`. | P2 (🟡 OQ-10 — không nguồn nào nêu priority) | phân tích | S2 `contracts.ts:2130-2139` | ✅ (hành vi) · 🟡 (priority) |
| NFR-EL-006 | performance | Một batch D1 duy nhất cho toàn bộ write kích hoạt (batch statement limit, chunk chống vượt 100 bind). | P2 (🟡 OQ-10 — không nguồn nào nêu priority) | kiểm tra code | S4 `enrollment-activation.ts:496-608,607`; S27 `study-pack-assign.ts:23-28` | 🔵 |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-EL-001 | Enrollment chỉ có 2 trạng thái hợp lệ: `invited`, `active` (enum `ENROLLMENT_STATUSES`; cột DB là text, default `'active'` chỉ dùng backfill row cũ, code mới luôn ghi tường minh). | Mọi write enrollment | FR-EL-001,004,005 | S2 `contracts.ts:1615-1616`; S1 `enrollment.ts:30-34`; S6 `student-class.ts:134` | ✅ |
| BR-EL-002 | Thêm vào lớp luôn sinh `invited` (trừ khi `activateNow=true` thì insert `invited` rồi activate ngay trong cùng request). | Giáo viên thêm học viên | FR-EL-001,002,003 | S3 `kernel.ts:551,1426`; S19 `kernel.test.ts:7092-7134` | ✅ |
| BR-EL-003 | Chỉ `invited` được chuyển sang `active` (CAS WHERE status='invited'); `active` không quay lại `invited` và không có trạng thái khác. | Kích hoạt | FR-EL-004,005,008 | S4 `enrollment-activation.ts:733-743` | ✅ |
| BR-EL-004 | Mỗi cặp (class, student) đúng một enrollment (unique index); enroll trùng → 409 `student already enrolled`. | Enroll | FR-EL-001 | S1 `enrollment.ts:39-43`; S3 `kernel.ts:1407-1418`; S19 `kernel.test.ts:7485-7513` | ✅ |
| BR-EL-005 | Hủy chỉ áp dụng `invited`; `active` → 409 `cannot delete active enrollment`; hủy xóa hẳn row (không có status `cancelled`), cho phép mời lại sau. | Hủy lời mời | FR-EL-009 | S3 `kernel.ts:1472-1505`; S19 `kernel.test.ts:7271-7324` | ✅ |
| BR-EL-006 | Hóa đơn chỉ chấp nhận enrollment `active`; `invited` → 409 "Học viên chưa đồng ý tham gia lớp". `invoice.enrollmentId` là text không FK — record tài chính sống sót khi enrollment bị xóa; hợp lệ kiểm tại lúc ghi. | Tạo hóa đơn | FR-EL-010 | S3 `kernel.ts:3066-3071`; S23 `invoice.ts:12-17,35`; S19 `kernel.test.ts:1516-1538` | ✅ |
| BR-EL-007 | Bài tập chỉ giao cho học viên trong roster `active`; danh sách chứa học viên `invited` → 400 "student not enrolled". | Giao bài | FR-EL-011 | S3 `kernel.ts:1564-1577`; S19 `kernel.test.ts:7351-7399` | ✅ |
| BR-EL-008 | Gói học + buổi học chỉ tồn tại cho enrollment `active`, sinh ĐÚNG LÚC kích hoạt, derive từ lớp, không cho client nhập; accept-đúp không nhân đôi. | Kích hoạt | FR-EL-006,007,008 | S4 `enrollment-activation.ts:338-348,656-668`; S19 `kernel.test.ts:1682-1722,7176` | ✅ |
| BR-EL-009 | Accept portal chỉ trên enrollment CỦA CHÍNH học viên trong org đang chọn; khác → 404 (không phân biệt 404-thật). | Accept portal | FR-EL-005 | S5 `student.ts:1297-1311`; S20 `student.test.ts:1406-1424` | ✅ |
| BR-EL-010 | Portal chi tiết lớp + lịch học chỉ phục vụ enrollment `active` (invited 404) — học viên phải xác nhận trước khi thấy lịch. | Đọc portal | FR-EL-013 | S5 `student.ts:1048-1063,1112-1128`; S22 `pdr.md:25` | ✅ |
| BR-EL-011 | Ô "Học phí" trên roster: học viên `invited` luôn hiện "—" (không hợp lệ lập hóa đơn); "Chưa lập phiếu" chỉ cho active. | Render roster | FR-EL-010,012 | S7 `class-roster-tab.tsx:37-48` | ✅ |
| BR-EL-012 | Modal thêm học viên chỉ liệt kê học viên CHƯA nằm trong lớp (kể cả đang `invited`); hết ứng viên → empty state "Tất cả học viên đã được thêm vào lớp." | Mở modal enroll | FR-EL-001 | S8 `enroll-student-modal.tsx:63-71,300-304`; S15 `enroll-existing-student.spec.ts:291-299` | ✅ |
| BR-EL-013 | Có ĐÚNG 2 đường vào `active`: nút Kích hoạt của giáo viên và nút Tham gia lớp của học viên — cùng một hàm `activateEnrollment` (caller tự chịu scoping). | Kích hoạt | FR-EL-004,005 | S4 `enrollment-activation.ts:656-663`; S3 `kernel.ts:1445-1452`; S5 `student.ts:1291-1299` | ✅ |

## 6. Error Matrix

> Wording là CHUỖI THẬT server trả trong JSON `error` (contract là raw string; UI hiển thị nguyên văn hoặc toast nghiệp vụ riêng). Không có file i18n catalog riêng cho feature này — mã lỗi có catalog là `STUDENT_INVITATION_ERROR_CODES` (S2 `contracts.ts:2913-2921`).

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-EL-001 | Lớp không tồn tại | Enroll vào classId lạ / khác org | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-001 | 404 `{error:"class not found"}` | Chọn lại lớp | S3 `kernel.ts:1394-1397`; accept: `kernel.ts:1463-1469`; portal: S5 `student.ts:1317-1323` | ✅ |
| E-EL-002 | Học viên không tồn tại | Enroll studentId lạ / khác org | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-001 | 404 `{error:"student not found"}` | Chọn lại học viên | S3 `kernel.ts:1398-1406` | ✅ |
| E-EL-003 | Đã ghi danh | Enroll trùng cặp (class, student) | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-001 | 409 `{error:"student already enrolled"}` | Không làm gì; mở roster | S3 `kernel.ts:1407-1418`; test S19 `kernel.test.ts:7507-7513` | ✅ |
| E-EL-004 | Kích hoạt thất bại | `activateNow=true` nhưng `activateEnrollment` lỗi | major (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-003 | 500 `{error:"enrollment activation failed"}` (enrollment đã insert ở `invited`) | Thử Kích hoạt lại trên roster | S3 `kernel.ts:618-622,1428-1432` | ✅ |
| E-EL-005 | Enrollment không tìm thấy | Accept/DELETE id lạ hoặc khác org | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-004,005,009 | 404 `{error:"enrollment not found"}` | Đóng modal, refresh | S3 `kernel.ts:1466,1492-1494`; S5 `student.ts:1310` | ✅ |
| E-EL-006 | Không hủy được enrollment active | DELETE enrollment `active` | major (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-009 | 409 `{error:"cannot delete active enrollment"}`; UI không bấm được nút vì chỉ hiện với invited | Không có đường hủy active (OQ-3) | S3 `kernel.ts:1495-1497`; test S19 `kernel.test.ts:7305-7324` | ✅ |
| E-EL-007 | Chưa đồng ý tham gia lớp | Tạo hóa đơn cho enrollment `invited` | major (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-010 | 409 `{error:"Học viên chưa đồng ý tham gia lớp"}`; UI picker ẩn sẵn | Kích hoạt học viên trước | S3 `kernel.ts:3069-3071`; test S19 `kernel.test.ts:1516-1538` | ✅ |
| E-EL-008 | Học viên chưa ghi danh (giao bài) | studentIds có học viên `invited` hoặc không trong lớp | major (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-011 | 400 `{error:"student not enrolled"}` | Bỏ học viên khỏi danh sách / kích hoạt trước | S3 `kernel.ts:1574-1577`; test S19 `kernel.test.ts:7351-7399` | ✅ |
| E-EL-009 | CSRF accept portal | POST accept thiếu/sai Origin | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-017 | 403 `{error:"origin not allowed"}` | Gọi từ portal đúng origin | S5 `student.ts:454-459`; test S20 `student.test.ts:1441-1455` | ✅ |
| E-EL-010 | Content-Type sai | POST accept không phải JSON | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-017 | 415 `{error:"content-type must be application/json"}` | Gửi JSON | S5 `student.ts:460-463`; test S20 `student.test.ts:1457-1468` | ✅ |
| E-EL-011 | Guard retry exhausted | Materialize kích hoạt xung đột 3 lần liên tục | critical (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-008 | Server 500 (throw); enrollment đã `active` nhưng có thể thiếu lesson | Thử kích hoạt lại (idempotent sẽ bù) | S4 `enrollment-activation.ts:648-653` | ✅ |
| E-EL-012 | Lời mời lớp không tồn tại/đã xử lý | Resend invite với enrollmentId không phải invited-của-học-viên | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-015 | 404 `{error:"Lời mời vào lớp không tồn tại hoặc đã được xử lý", code:"INVITATION_NOT_FOUND"}` | Bỏ enrollmentId hoặc kiểm trạng thái | S3 `kernel.ts:1144-1152` | ✅ |
| E-EL-013 | Email đã trong org | Tạo học viên mới kèm lớp với email trùng | major (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-002 | 409 `{error:"Email này đã được dùng cho học viên <tên>", code:"STUDENT_ALREADY_IN_ORG", existingStudentId, existingStudentName, portalLinked}` | UI gợi ý callout mời lại học viên có sẵn | S3 `kernel.ts:499-511,558-573`; S8 `enroll-student-modal.tsx:220-237` | ✅ |
| E-EL-014 | Gửi email lời mời thất bại | Mailer lỗi khi resend lời mời lớp | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-015 | 502 `{error:"Không gửi được email lời mời. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau.", code:"INVITATION_EMAIL_FAILED"}`; rollback cooldown | Thử lại sau | S3 `kernel.ts:1254-1272` | ✅ |
| E-EL-015 | Đã tham gia portal | Resend khi học viên đã onboarding và không còn lời mời lớp invited | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-015 | 409 `{error:"Học viên này đã tham gia cổng học viên", code:"STUDENT_ALREADY_JOINED"}` | Không cần gửi lại | S3 `kernel.ts:1175-1183` | ✅ |
| E-EL-016 | Email invite ban đầu lỗi (không chặn tạo) | `activateNow`/tạo `invited` nhưng mailer lỗi | minor (🟡 OQ-10 — severity suy đoán, không nguồn) | FR-EL-014 | 201 kèm `inviteEmailSent:false`; web toast warning "…chưa gửi được email lời mời — bạn có thể bấm Gửi lại lời mời." | Nút Gửi lại lời mời | S3 `kernel.ts:575-615,675-683`; S8 `enroll-student-modal.tsx:171-178` | ✅ |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-EL-01 | Học viên được mời xuất hiện trên roster "Đã mời" và KPI "1 chờ xác nhận", chưa tiêu tài nguyên gói/buổi | e2e + snapshot test (0 package, 0 lesson) | 201 + snapshot invited | S15 `enroll-existing-student.spec.ts:258-263`; S19 `kernel.test.ts:7112-7134` | ✅ |
| SC-EL-02 | Sau kích hoạt, học viên "Đang học" có ngay gói + 12 (hoặc sessionsTotal) buổi lịch | e2e "0/12" + test lessons count | accept 200 → package total N, lessons N | S15 `enroll-existing-student.spec.ts:274-289`; S19 `kernel.test.ts:4884-4888` | ✅ |
| SC-EL-03 | Học viên tự xác nhận trên portal mà không cần giáo viên | test portal accept | accept 200, status active, pkg + lesson sinh | S20 `student.test.ts:1350-1381` | ✅ |
| SC-EL-04 | Hủy nhầm lời mời không hỏng dữ liệu: mời lại được ngay | e2e hủy + mời lại | DELETE 200 → re-enroll 201 | S19 `kernel.test.ts:7271-7303`; S15 `enroll-existing-student.spec.ts:355-374` | ✅ |
| SC-EL-05 | Không lập được hóa đơn / giao bài cho học viên chưa xác nhận | e2e picker ẩn + test 409/400 | 409 / 400 wording đúng | S16 `create-invoice.spec.ts:219-248`; S19 `kernel.test.ts:1516-1538,7351-7399` | ✅ |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/enrollment-lifecycle-reverse-erd.md`)

- **ENROLLMENT** — row roster: id, orgId, classId, studentId, status (`invited|active`), createdAt; unique (classId, studentId). ✅ [S1 `enrollment.ts:17-47`]
- **STUDENT** — học viên org-scoped; enrollment tham chiếu cascade delete. ✅ [S1 `enrollment.ts:27-29`]
- **CLASS** — lớp; nguồn derive gói/buổi khi kích hoạt (sessionsTotal, tuitionFee, mode, schedule, startDate, schedulingMode). ✅ [S4 `enrollment-activation.ts:294-307`]
- **SESSION_PACKAGE** — gói buổi entitlement, unique theo enrollment (`session_package_enrollment_uq`), enrollId nullable cho gói "parked" không lớp. ✅ [S25 `session-package.ts:31,45,48-50`; S2 `contracts.ts:1626-1644`]
- **LESSON** — dòng buổi học sinh theo enrollment lúc kích hoạt. ✅ [S4 `enrollment-activation.ts:598-606`]
- **INVOICE** — hóa đơn học phí, giữ `enrollmentId` dạng text KHÔNG FK (chịu xóa enrollment), bắt buộc enrollment `active` lúc tạo. ✅ [S23 `invoice.ts:12-17,35`]
- **CLASS_ASSIGNMENT + CLASS_ASSIGNMENT_TARGET** — lượt giao đề cho lớp + học viên nhận; chỉ target học viên có enrollment `active`. ✅ [S24 `class-assignment.ts:21-78`; S3 `kernel.ts:1564-1577`]

## 9. Flows (tóm tắt — chi tiết ở `srs/enrollment-lifecycle-reverse-flows.md`)

1. Giáo viên thêm học viên vào lớp (tạo `invited`) — modal 2 chế độ (có sẵn / tạo mới) + notify + email. ✅
2. Giáo viên kích hoạt ("Kích hoạt" → accept) — CAS + materialize gói/buổi + study-pack backfill. ✅
3. Học viên chấp nhận từ portal ("Tham gia lớp") — ownership check + cùng hàm kích hoạt. ✅
4. Hủy lời mời (DELETE, chỉ `invited`) — confirm modal, xóa row, mời lại được. ✅
5. Hóa đơn / bài tập gặp enrollment chưa `active` — 409/400 chặn + UI ẩn lựa chọn. ✅

## 10. Screens

- **Teacher web `/classes/$classId` (tab Học viên):** bảng roster 5 cột (Học viên, Đăng ký, Band mục tiêu, Học phí, Thao tác); badge "Đã mời"/"Đang học"; nút "Kích hoạt", "Hủy lời mời", "Gửi lại lời mời"; modal xác nhận 2 loại; modal "Thêm học viên vào lớp" (picker + tạo mới + checkbox kích hoạt ngay); KPI "học viên · N chờ xác nhận". ✅ [S9 `$classId.tsx:285-292,403-436,496-501`; S7; S8]
- **Portal học viên (Trang chủ + Danh sách lớp):** thẻ lớp trạng thái `invited` — tag "Chờ kích hoạt", nút "Tham gia lớp" full-width, mô tả "Giáo viên đã mời bạn vào lớp…"; trạng thái active — progress + buổi tới, card link vào lớp. ✅ [S12 `class-card.tsx:43-123,207-215`; S13]
- **Web `/tuition` (Tạo hóa đơn):** picker "Học viên *" chỉ liệt kê enrollment active. ✅ [S16 `create-invoice.spec.ts:243-248`]

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Org-scoped bắt buộc: mọi đọc/ghi enrollment theo orgId của session; không có tenant header | Kernel contract | S2 `contracts.ts:13`; S3 | ✅ |
| Không xóa enrollment `active` — vùng an toàn tài chính (đã có package/lesson/invoice) | kernel.ts comment D5 | S3 `kernel.ts:1472-1479` | ✅ |
| Teacher-only finance guard trên `/invoices*` | kernel.ts | S3 `kernel.ts:209-211` | ✅ |
| Kernel writes POST-only JSON, ids do server cấp | PDR + contracts | S22 `pdr.md:18` | ✅ |
| Học viên chỉ được tạo qua portal provisioning; giáo viên chỉ enroll học viên có sẵn qua `/classes/:id/enroll` (nhánh `/students` với classId vẫn còn cho UI "Tạo học viên mới") | PDR + code | S22 `pdr.md:23`; S3 `kernel.ts:1382-1384` | 🟡 OQ-1 |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Lớp có lịch/số buổi/template hợp lệ | feature class | Kích hoạt sinh 0 buổi (lớp manual/template-less từ #649) — vẫn active, gói total 0 | S17 `student-package-validation.spec.ts:78-83`; S19 `kernel.test.ts:4402-4430` | ✅ |
| Mailer (Resend) + org mail sender | feature notifications | Email lời mời lỗi → `inviteEmailSent:false` / 502 resend, enrollment vẫn tạo | S3 `kernel.ts:575-615` | ✅ |
| Bảng `notification_record` | feature notifications | Mất bảng → enroll vẫn 201 (fail-open) | S19 `kernel.test.ts:7798-7809` | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Enrollment `active` là bất biến cuối (không bao giờ quay `invited` hay bị xóa qua API) | FR-EL-009, BR-EL-005; nếu sản phẩm cần "học viên rời lớp" thì phải thêm API + trạng thái mới | S3; negative-search | 🟡 OQ-3 |
| Row enrollment tạo trước Wave invitation với status default `active` là hợp lệ (backfill cố ý) | NFR/BR-EL-001; nếu sai thì cần migration dọn | S1 `enrollment.ts:30-34` | 🟡 OQ-2 |
| Hai đường kích hoạt đồng thời là kịch bản thật (teacher + student cùng lúc) | NFR-EL-001: nếu không bao giờ xảy ra, CAS/retry là dư thừa (giữ nguyên — chi phí thấp) | S4 `enrollment-activation.ts:662-667` | 🔵 |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích OQ blocking.

- [ ] OQ-1: PDR nói "teachers no longer create students manually" nhưng UI + API `/students` vẫn giữ nhánh tạo học viên mới kèm lớp (EnrollStudentModal tab "Tạo học viên mới"). Giữ hay gỡ?
- [ ] OQ-2: Default `'active'` của cột status là backfill legacy — có cần migration/kiểm dữ liệu production còn row nào tự động `active` không đúng ý không?
- [ ] OQ-3: Không có đường học viên rời lớp khi đã `active` — sản phẩm có cần "un-enroll/hoàn học phí" không?
- [ ] OQ-4: Kích hoạt lớp manual/template-less (0 buổi) vẫn sinh gói total 0 — nghiệp vụ có muốn chặn kích hoạt khi lớp chưa sẵn sàng lịch không?
