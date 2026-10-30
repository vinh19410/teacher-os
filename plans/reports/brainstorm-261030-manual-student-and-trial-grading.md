# Brainstorm: Thêm học viên thủ công & dữ liệu mẫu dùng thử Chấm điểm

Ngày: 2026-10-30 · Trạng thái: contract đã chốt (kèm `--advice` Kongming), chờ `ak-plan`

## Hiện trạng (đã kiểm chứng trên codebase)

1. **Nguồn tạo `student` bị khóa hoàn toàn phía giáo viên:**
   - PR #257 (`plans/260923-0758-students-from-portal-registration/plan.md`) đã xóa `POST /api/students` và `AddStudentModal`.
   - PR #263 (`plans/260924-0556-student-org-invite-and-switch/plan.md`) thêm `POST /api/students/invite` (`apps/server/src/routes/kernel.ts:316-387`) nhưng chỉ tạo bản ghi `student_invitation` (`status = 'pending'`), **chưa tạo dòng `student`** và hiện chưa gửi email.
   - Dòng `student` chỉ sinh ra khi học viên đăng nhập Student Portal (`apps/student`) bằng tài khoản có `emailVerified === true` rồi bấm Chấp nhận lời mời (`apps/server/src/routes/student.ts:565-625`), hoặc tự đăng ký không có lời mời (auto-provision vào org sớm nhất toàn hệ thống tại `apps/server/src/student-provisioning.ts:53-59`).
   - Session của giáo viên bị chặn `403 ACCOUNT_TEACHER_ON_STUDENT_PORTAL` trên Student Portal (`apps/server/src/routes/student.ts:494-502`) và dùng chung vùng cookie cross-subdomain, khiến giáo viên dùng thử một mình trên một trình duyệt không thể tự đóng vai học viên để chấp nhận lời mời.
2. **Hiệu ứng domino chặn toàn bộ luồng vận hành của giáo viên mới:**
   - **Ghi danh vào lớp (`POST /api/classes/:id/enroll`, `EnrollStudentModal`)**: chỉ cho chọn từ `data.students` đã có trong org (`apps/web/src/components/modals/enroll-student-modal.tsx:29-37`). Khi org có 0 học viên, modal hiển thị nhầm thông báo *"Tất cả học viên đã được thêm vào lớp."* (`enroll-student-modal.tsx:99`).
   - **Lập hóa đơn (`POST /api/invoices`, `AddInvoiceModal`)**: bắt buộc `enrollmentId` có `status === 'active'` (`apps/server/src/routes/kernel.ts:1528-1545`). Không có học viên → không có enrollment → không tạo được hóa đơn.
   - **Giao bài tập (`POST /api/classes/:id/assignments`, `ClassAssignmentsTab`)**: bắt buộc truyền `studentIds` thuộc `enrollment` `active` của lớp (`apps/server/src/routes/kernel.ts:597-610`). Không có học viên active → không giao được bài tập.
   - **Chấm điểm (`/grading`, `apps/server/src/routes/grading.ts:93-204`)**: `loadGradingQueue` chỉ lấy `quiz_attempt` có `status = 'submitted'` (kỹ năng `writing` hoặc `speaking`) do học viên nộp từ Student Portal. Kể cả sau khi thêm học viên và giao bài tập, nếu chưa có học viên đăng nhập Portal nộp bài thì `/grading` vẫn trống.
3. **Điểm neo kiến trúc cho phép khôi phục tạo thủ công mà không phá Student Portal:**
   - Bảng `student` (`packages/db/src/schema/student.ts:57-59`) dùng partial unique index `UNIQUE(org_id, lower(trim(email))) WHERE trim(email) != ''` → cho phép nhiều học viên không có email (`email = ""`) trong cùng org, đồng thời chặn trùng email có thực trong cùng org.
   - Bridge `createStudentGuard` (`apps/server/src/routes/student.ts:128-132`) nối tài khoản Student Portal với hồ sơ `student` qua `lower(trim(student.email)) = normalizedEmail` (sau khi middleware `student.ts:515-523` đã kiểm `session.emailVerified === true`). Nếu giáo viên tạo trước hồ sơ `student` kèm email, khi học viên đăng nhập Portal bằng đúng email đã xác thực đó thì tự động khớp ngay vào hồ sơ sẵn có.

## Quyết định của người dùng

1. **Phạm vi giải pháp:** **Phương án A + C** — Mở lại Tạo học viên thủ công (mở khóa Lớp học, Hóa đơn, Giao bài tập) + Khớp nối Portal qua email + Bổ sung nút/luồng tạo dữ liệu mẫu dùng thử cho trang Chấm điểm (`/grading`).
2. **Trạng thái ghi danh khi giáo viên thêm học viên vào lớp:** **Cho phép ghi danh & kích hoạt "Đang học" (`active`) ngay lập tức** (sinh luôn `session_package` + chuỗi `lesson` qua `activateEnrollment`, mở khóa ngay tạo hóa đơn và giao bài tập).
3. **Trường thông tin học viên:** **Chỉ bắt buộc Họ tên (`name`)**; SĐT (`phone`), Email (`email`), Phụ huynh (`parentName`, `parentPhone`) là tùy chọn.

## Contract

**Outcome:**
- Giáo viên mới (hoặc giáo viên dạy học viên nhỏ tuổi/offline chưa có tài khoản Portal) có thể tự thêm học viên trực tiếp trên app giáo viên (chỉ bắt buộc Họ tên; SĐT/Email/Phụ huynh tùy chọn), ghi danh vào lớp ở trạng thái **Đang học (`active`)** ngay lập tức, từ đó lập được hóa đơn học phí và giao được bài tập mà không cần chờ học viên đăng ký Student Portal.
- Khi học viên được tạo thủ công có điền Email, lúc học viên đó đăng nhập Student Portal bằng tài khoản đã xác thực cùng email sẽ tự động liên kết vào đúng hồ sơ `student` đã có trong org (thấy ngay lớp học, lịch học, hóa đơn, bài tập).
- Tại trang Chấm điểm (`/grading`) khi chưa có bài nộp, giáo viên có thể bấm nút tạo nhanh **Bài nộp mẫu dùng thử** để trải nghiệm ngay luồng chấm điểm Writing (kèm nhận xét AI mẫu cố định, không tốn credit AI thật) và xóa sạch dữ liệu mẫu khi không cần nữa.

**Constraints:**
- Giữ nguyên cấu trúc bảng `student` org-scoped và partial unique index `student_org_email_uq` (`UNIQUE(org_id, lower(trim(email))) WHERE trim(email) != ''`).
- Chuẩn hóa email `lower(trim(email))` nhất quán ở mọi điểm ghi/đọc; nếu trùng email đã có trong cùng `orgId` → trả `409` kèm thông báo rõ ràng.
- Khi tạo học viên thủ công có `email` trùng với một `student_invitation` đang `pending` trong cùng `orgId`, tự động chuyển lời mời đó sang `accepted` trong cùng thao tác ghi để không để lại lời mời mồ côi.
- Defense-in-depth tại `createStudentGuard` (`apps/server/src/routes/student.ts:120`): kiểm tra tường minh `sessionUser.emailVerified === true` ngay trong guard bên cạnh middleware `router.use("*")`.
- Luồng ghi danh + kích hoạt ngay phải tái sử dụng logic `activateEnrollment` (`apps/server/src/routes/enrollment-activation.ts`) để bảo toàn toàn bộ bất biến sinh `session_package`, `lesson` theo lịch lớp và nghỉ lễ (`organization_holiday`).
- Dữ liệu mẫu dùng thử Chấm điểm:
  - Chỉ tạo khi giáo viên chủ động bấm nút (không tự seed vào mọi org mới lúc bootstrap).
  - Không gọi model AI thật khi tạo bài nộp mẫu (seed sẵn bản nháp `ai_grading_draft` tĩnh hoặc tắt trigger AI tự động cho bài mẫu) để không tốn chi phí/credit AI.
  - Dùng định danh/email không thể đăng nhập (`@demo.invalid` hoặc rỗng) để không tài khoản thật nào khớp nhầm qua `provisionStudentForUser` hay `createStudentGuard`.
  - Idempotent (bấm nhiều lần không nhân bản) và có nút xóa sạch dữ liệu mẫu.
- Tuân thủ `DESIGN.md` (shadcn v2, Geist, kiểm tra 3 viewport 1440×900, 768×1024, 375×812 + keyboard focus).

**Non-goals:**
- Không xóa luồng mời học viên qua email (`POST /api/students/invite`) hay luồng học viên tự đăng ký trên Student Portal — hai luồng này vẫn giữ cho giáo viên muốn học viên tự vào bằng email.
- Không cho phép giáo viên đăng nhập trực tiếp vào Student Portal bằng session giáo viên (giữ nguyên ranh giới bảo mật `TEACHER_ON_STUDENT_PORTAL`).
- Không tự động chuyển mọi Lead (`/leads`) thành học viên trong phạm vi này (có thể mở modal thêm học viên điền sẵn thông tin ở đợt sau).

**Acceptance criteria:**
1. Trên `/students` và trong `EnrollStudentModal` (`/classes/$classId`), giáo viên có thể tạo học viên mới với `name` bắt buộc, `phone`/`email`/`parentName`/`parentPhone` tùy chọn; có thể chọn lớp để ghi danh và kích hoạt `active` ngay trong một luồng.
2. Khi org chưa có học viên nào, mở `EnrollStudentModal` trong chi tiết lớp hiển thị đúng thông báo *"Chưa có học viên nào trong tổ chức"* kèm nút/chế độ tạo học viên mới ngay tại chỗ (thay vì câu sai *"Tất cả học viên đã được thêm vào lớp."*).
3. Sau khi tạo học viên + ghi danh `active` vào lớp (kể cả học viên không có email), giáo viên lập được ngay Hóa đơn (`POST /api/invoices` → 201) và Giao được bài tập (`POST /api/classes/:id/assignments` → 201).
4. Học viên tạo thủ công có `email`:
   - Nếu trùng email với học viên đã có trong cùng org → trả `409` hiển thị lỗi tại trường Email.
   - Nếu có `student_invitation` `pending` cùng email trong org → tự chuyển thành `accepted`.
   - Khi học viên đăng nhập Student Portal với email đã verify trùng khớp → vào thẳng đúng org và thấy lớp/hóa đơn/bài tập đã giao.
5. Học viên tạo thủ công không có `email` hiển thị trạng thái chưa có email/chưa liên kết Portal rõ ràng trên danh sách/hồ sơ học viên.
6. Trên `/grading` khi hàng chờ trống, có nút tạo nhanh bài nộp mẫu dùng thử → tạo idempotent 1 bộ dữ liệu mẫu (học viên mẫu + bài nộp Writing `submitted` kèm bản nháp AI tĩnh) hiện ngay trong bảng `/grading` để giáo viên bấm "Chấm bài" trải nghiệm trọn luồng chấm và duyệt điểm; có thể xóa dữ liệu mẫu bất kỳ lúc nào.
7. Toàn bộ cổng chất lượng `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` và E2E liên quan xanh.

## Trade-offs

- **Phương án A + C (Tạo học viên thủ công + Khớp nối Portal qua email + Nút tạo bài nộp mẫu trên `/grading` — Đã chọn):**
  - *Giả định phụ thuộc lớn nhất:* Email do giáo viên nhập (nếu có) là email học viên sẽ dùng để đăng nhập Student Portal; và dữ liệu mẫu dùng thử được cô lập/xóa gọn không làm nhiễu vận hành thật.
  - *Điều kiện hỏng đầu tiên:* Giáo viên gõ sai email của học viên (học viên đăng nhập Portal bằng email khác sẽ không khớp hồ sơ cũ cho tới khi giáo viên cập nhật lại email); hoặc dữ liệu mẫu dùng thử không có đường xóa rõ ràng khiến giáo viên thấy vướng trong danh sách lớp/học viên.
  - *Cách giảm thiểu trong thiết kế:* Cho phép cập nhật email học viên về sau; dữ liệu mẫu chỉ tạo khi bấm nút và có hành động "Xóa dữ liệu mẫu" một chạm.
- **Phương án A đơn thuần (Chỉ mở lại tạo học viên thủ công, không có bài nộp mẫu `/grading`):**
  - *Giả định phụ thuộc lớn nhất:* Giáo viên dùng thử chỉ cần kiểm tra tới bước Giao bài tập, hoặc sẵn sàng mở trình duyệt ẩn danh tạo tài khoản học viên thứ hai để nộp bài.
  - *Điều kiện hỏng đầu tiên:* Giáo viên dùng thử 1 mình muốn xem tính năng Chấm bài AI (`/grading`) — điểm bán hàng quan trọng của sản phẩm — nhưng trang `/grading` vẫn trống rỗng sau khi đã giao bài tập.
- **Phương án B (Giữ nguyên chỉ mời qua email nhưng tạo luôn dòng `student` khi gửi lời mời):**
  - *Giả định phụ thuộc lớn nhất:* Mọi học viên đều có email cá nhân ngay từ ngày đầu và giáo viên luôn biết email đó.
  - *Điều kiện hỏng đầu tiên:* Học viên nhỏ tuổi / học viên giao tiếp chỉ dùng SĐT/Zalo phụ huynh không có email → giáo viên vẫn bị chặn hoàn toàn; đồng thời làm hỏng ngữ nghĩa bảng `student_invitation` khi lời mời bị từ chối/hủy mà dòng `student` đã phát sinh hóa đơn/buổi học.

**Better approaches:** Luồng gộp **"Tạo học viên + Ghi danh & Kích hoạt `active` ngay trong modal của lớp"** kết hợp **"Nút nạp bài nộp mẫu một chạm trên `/grading`"** tốt hơn việc bắt giáo viên đi qua 3 màn hình rời rạc (Tạo học viên ở `/students` → Sang `/classes/$id` bấm Thêm học viên ở trạng thái `invited` → Bấm Kích hoạt sang `active`) và tốt hơn việc tự động seed dữ liệu rác vào mọi org mới lúc đăng ký.
