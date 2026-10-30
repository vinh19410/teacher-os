---
phase: 2
title: "Phase 2: Web UI tạo học viên thủ công & modal thêm vào lớp"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Web UI tạo học viên thủ công & modal thêm vào lớp

## Goal

Cung cấp giao diện tạo học viên thủ công (`AddStudentModal`) tại `/students`, nâng cấp `EnrollStudentModal` tại `/classes/$classId` hỗ trợ cả chọn học viên có sẵn lẫn tạo học viên mới kèm kích hoạt Đang học ngay lập tức, và hiển thị trạng thái liên kết Student Portal trên danh sách/hồ sơ học viên.

## Files to Create / Modify

- Modify: `apps/web/src/lib/data-actions.ts` — thêm action `add-student` và thêm `activateNow?: boolean` vào `enroll-student`.
- Modify: `apps/web/src/lib/repos/kernel.ts` — thêm nhánh `case "add-student"` trong `kernelCommand` và truyền `activateNow` trong `case "enroll-student"`.
- Modify: `apps/web/src/lib/data-store-reducer.ts` — thêm `case "add-student"` vào danh sách action server-owned (refresh từ snapshot).
- Create: `apps/web/src/components/modals/add-student-modal.tsx` — modal tạo học viên thủ công (Họ tên bắt buộc; SĐT, Email, Tên phụ huynh, SĐT phụ huynh, Lớp học và checkbox Kích hoạt Đang học ngay tùy chọn).
- Modify: `apps/web/src/components/modals/enroll-student-modal.tsx` — sửa thông báo khi org chưa có học viên, thêm chuyển đổi 2 chế độ ("Chọn học viên có sẵn" / "Tạo học viên mới") và checkbox "Kích hoạt trạng thái Đang học ngay" (mặc định `true` ở chế độ tạo mới, `false` ở chế độ chọn học viên có sẵn).
- Modify: `apps/web/src/routes/_auth/students/index.tsx` — thêm nút "+ Thêm học viên" mở `AddStudentModal` cạnh nút "Mời học viên", thêm nút "+ Thêm học viên" trong empty state, và hiển thị nhãn "Chưa liên kết Portal" khi `student.email === ""`.
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx` — hiển thị rõ trạng thái `Email: <email>` hoặc `"Chưa có email (chưa liên kết Portal)"` ở phần thông tin học viên.
- Modify: `apps/web/src/routes/_auth/students/index.test.tsx`, `apps/web/src/components/modals/enroll-student-modal.test.tsx`, `apps/web/src/routes/_auth/classes/$classId.test.tsx`, `apps/web/src/lib/repos/kernel.test.ts` — cập nhật và bổ sung unit test cho hành vi mới.

## Tasks & Steps

### Task 2.1 — Nối action `add-student` và `enroll-student` (`activateNow`) vào command bus của Web

- **Goal:** Cho phép UI gửi lệnh `add-student` (`POST /api/students`) và `enroll-student` kèm `activateNow` (`POST /api/classes/:id/enroll`) qua `useKernelFormSubmit`.
- **Target files and symbols:**
  - `apps/web/src/lib/data-actions.ts`: union `KernelAction` (dòng 22–100).
  - `apps/web/src/lib/repos/kernel.ts`: hàm `kernelCommand` (dòng 42–60).
  - `apps/web/src/lib/data-store-reducer.ts`: hàm `reducer` (dòng 97–129).
- **Steps:**
  1. Trong `apps/web/src/lib/data-actions.ts`:
     - Import `type StudentCreateInput` từ `@teacher-os/api/contracts`.
     - Thêm vào `KernelAction`:
       ```ts
       | {
       		type: "add-student";
       		payload: StudentCreateInput;
         }
       ```
     - Cập nhật nhánh `enroll-student` thành:
       ```ts
       | {
       		type: "enroll-student";
       		classId: string;
       		studentId: string;
       		activateNow?: boolean;
         }
       ```
  2. Trong `apps/web/src/lib/repos/kernel.ts` tại `kernelCommand`:
     - Thêm nhánh `case "add-student"`:
       ```ts
       case "add-student":
       	return {
       		path: "/api/students",
       		body: { ...action.payload },
       	};
       ```
     - Cập nhật nhánh `case "enroll-student"`:
       ```ts
       case "enroll-student":
       	return {
       		path: `/api/classes/${action.classId}/enroll`,
       		body: {
       			studentId: action.studentId,
       			...(action.activateNow !== undefined
       				? { activateNow: action.activateNow }
       				: {}),
       		},
       	};
       ```
  3. Trong `apps/web/src/lib/data-store-reducer.ts`:
     - Gộp `case "add-student":` vào nhóm `case "record-invoice-payment": return state;` (dòng 97–104) vì dữ liệu học viên mới và gói buổi học được đồng bộ từ snapshot refresh ngay sau POST.
- **Success criteria:** `kernelCommand` ánh xạ đúng `add-student` sang `POST /api/students` và `enroll-student` sang `POST /api/classes/:id/enroll`.
- **Verify:** no verification needed (covered by Task 2.4 test suite).

### Task 2.2 — Tạo `AddStudentModal` và nâng cấp `EnrollStudentModal`

- **Goal:** Cho phép giáo viên tạo học viên mới từ `/students` hoặc ngay bên trong modal thêm học viên của lớp (`/classes/$classId`), chỉ bắt buộc Họ tên, tự lọc ký tự không phải số ở ô SĐT, và mặc định bật "Kích hoạt trạng thái Đang học ngay".
- **Target files and symbols:**
  - Create `apps/web/src/components/modals/add-student-modal.tsx`: component `AddStudentModal`.
  - Modify `apps/web/src/components/modals/enroll-student-modal.tsx`: component `EnrollStudentModal`.
- **Steps:**
  1. Tạo file `apps/web/src/components/modals/add-student-modal.tsx`:
     - Props: `{ open: boolean; onClose: () => void; defaultClassId?: string }`.
     - State: `name`, `phone`, `email`, `parentName`, `parentPhone`, `classId` (khởi tạo `defaultClassId ?? ""`), `activateNow` (khởi tạo `true`), và các state lỗi theo trường `nameError`, `emailError`.
     - Ô SĐT học viên và SĐT phụ huynh tự động strip ký tự không phải chữ số khi nhập (`e.target.value.replace(/\D+/g, "").slice(0, 20)`).
     - Khi `open` chuyển sang `true`, reset toàn bộ state và gọi `reset()` của `useKernelFormSubmit()`.
     - Validate client trước khi gửi:
       - `name.trim() === ""` → `setNameError("Vui lòng nhập họ tên học viên.")`.
       - `email.trim() !== ""` và không khớp `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → `setEmailError("Email không đúng định dạng.")`.
     - Khi submit hợp lệ, gọi `run({ type: "add-student", payload: { name: name.trim(), phone, email: email.trim().toLowerCase(), parentName: parentName.trim(), parentPhone, ...(classId ? { classId } : {}), activateNow } })`. Nếu `result?.kind === "refreshed"`, đóng modal (`onClose()`).
     - Hiển thị ghi chú nhỏ dưới ô Email: *"Tùy chọn. Nếu nhập email, học viên đăng nhập Student Portal bằng email này sẽ tự động khớp vào hồ sơ."*
     - Nếu `data.classes.length > 0` và không truyền `defaultClassId` cố định, hiển thị dropdown `Select` "Ghi danh vào lớp (tùy chọn)" (mặc định `"— Chưa chọn lớp —"`). Khi có `classId` được chọn, hiển thị checkbox `"Kích hoạt trạng thái Đang học ngay"` (mặc định checked).
  2. Cập nhật `apps/web/src/components/modals/enroll-student-modal.tsx`:
     - Thêm state `mode: "existing" | "create"` (khi mở modal: nếu `data.students.length === 0` thì mặc định `"create"`, ngược lại `"existing"`) và `activateNow` (mặc định `true` khi `mode === "create"`, `false` khi `mode === "existing"`).
     - Thêm thanh chuyển chế độ (2 nút tab/segmented: `"Chọn học viên có sẵn"` và `"Tạo học viên mới"`) ở đầu modal.
     - Ở chế độ `"existing"`:
       - Sửa câu thông báo khi `filteredStudents.length === 0` (dòng 97–101):
         - Nếu `data.students.length === 0`: hiển thị `"Chưa có học viên nào trong tổ chức."` kèm nút `"Tạo học viên mới ngay"` (bấm vào chuyển `setMode("create")`).
         - Nếu `eligibleStudents.length === 0`: giữ `"Tất cả học viên đã được thêm vào lớp."`.
         - Ngược lại: `"Không có học viên phù hợp."`.
       - Thêm checkbox `"Kích hoạt trạng thái Đang học ngay"` (mặc định `false` ở chế độ `"existing"` để giữ nguyên luồng mời-rồi-kích-hoạt của E2E hiện hữu).
       - Khi submit, gửi `run({ type: "enroll-student", classId, studentId: selectedStudentId, activateNow })`.
     - Ở chế độ `"create"`:
       - Hiển thị các trường `Họ tên học viên *`, `Số điện thoại`, `Email`, `Tên phụ huynh`, `SĐT phụ huynh` và checkbox `"Kích hoạt trạng thái Đang học ngay"` (mặc định `true`), gửi `run({ type: "add-student", payload: { name: name.trim(), phone, email: email.trim().toLowerCase(), parentName: parentName.trim(), parentPhone, classId, activateNow } })`.
- **Success criteria:** Giáo viên có thể tạo học viên mới ngay từ `EnrollStudentModal` (kể cả khi org có 0 học viên) hoặc chọn học viên có sẵn và kích hoạt `active` ngay trong 1 bước.
- **Verify:** no verification needed (covered by Task 2.4 test suite).

### Task 2.3 — Cập nhật trang `/students` và `/students/$studentId`

- **Goal:** Bổ sung nút `"+ Thêm học viên"` trên `/students` (cả trên thanh tiêu đề lẫn trong empty state) và hiển thị rõ trạng thái liên kết Portal cho học viên chưa có email.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/students/index.tsx`: `StudentsRoute` (dòng 34–197).
  - `apps/web/src/routes/_auth/students/$studentId.tsx`: `StudentDetailRoute` (dòng 123–199).
- **Steps:**
  1. Trong `apps/web/src/routes/_auth/students/index.tsx`:
     - Import `AddStudentModal` từ `@/components/modals/add-student-modal` và icon `Plus` từ `lucide-react`.
     - Thêm state `const [addModalOpen, setAddModalOpen] = useState(false);`.
     - Ở `PageHead.action` (dòng 73–81), hiển thị 2 nút:
       - Nút phụ (`variant="secondary"`): `Mời học viên` mở `setInviteModalOpen(true)`.
       - Nút chính (`variant="primary"`): `+ Thêm học viên` mở `setAddModalOpen(true)`.
     - Ở `students-empty-state` (dòng 112–123): giữ câu mô tả có cụm `"student portal"` (*"Bạn có thể thêm học viên thủ công để quản lý lớp học, học phí, bài tập ngay lập tức, hoặc mời học viên đăng nhập student portal."*), và thêm nút `+ Thêm học viên` mở `setAddModalOpen(true)`.
     - Ở bảng danh sách học viên (dòng 146–151), dưới tên học viên: hiển thị `{s.phone || s.email || "Chưa có SĐT / Email"}` và nếu `!s.email` thì hiển thị thêm nhãn nhỏ `Chưa liên kết Portal`.
     - Mount `<AddStudentModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />` cạnh `InviteStudentModal`.
  2. Trong `apps/web/src/routes/_auth/students/$studentId.tsx` (dòng 152–162):
     - Hiển thị `Email: {student.email}` khi có email, hoặc `"Chưa có email (chưa liên kết Portal)"` khi `student.email === ""`.
- **Success criteria:** Trang `/students` có cả nút `+ Thêm học viên` và `Mời học viên`; empty state có nút `+ Thêm học viên`; học viên không có email hiển thị rõ trạng thái chưa liên kết Portal.
- **Verify:** no verification needed (covered by Task 2.4 test suite).

### Task 2.4 — Cập nhật và bổ sung unit test cho Web UI

- **Goal:** Đảm bảo toàn bộ unit test của `apps/web` phản ánh đúng hợp đồng mới và kiểm tra đầy đủ luồng tạo học viên thủ công + ghi danh kích hoạt ngay.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/students/index.test.tsx`
  - `apps/web/src/components/modals/enroll-student-modal.test.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.test.tsx`
  - `apps/web/src/lib/repos/kernel.test.ts`
- **Steps:**
  1. Trong `apps/web/src/routes/_auth/students/index.test.tsx` (dòng 55–66):
     - Cập nhật test `"adds students only by invitation..."` thành `"supports both manual student creation (+ Thêm học viên) and email invitation (Mời học viên)"`: kiểm tra cả 2 nút đều hiển thị, bấm `+ Thêm học viên` mở dialog tạo học viên mới và gửi `POST /api/students` với `{ name: "Nguyễn Văn Mới", phone: "", email: "", parentName: "", parentPhone: "", activateNow: true }`.
  2. Trong `apps/web/src/components/modals/enroll-student-modal.test.tsx` (dòng 28–30) và `apps/web/src/routes/_auth/classes/$classId.test.tsx` (dòng 102–108):
     - Cập nhật `expectedWrite.body` của `POST /api/classes/cl-1/enroll` thành `{ studentId: "st-2", activateNow: false }` và thêm test tích chọn checkbox gửi `{ studentId: "st-2", activateNow: true }`.
     - Thêm test case trong `apps/web/src/components/modals/enroll-student-modal.test.tsx`: khi `students: []` (org chưa có học viên), mở `EnrollStudentModal` tự động hiển thị chế độ `"Tạo học viên mới"`, điền Họ tên và bấm Lưu sẽ gửi `POST /api/students` kèm `classId: "cl-1", activateNow: true`.
  3. Trong `apps/web/src/lib/repos/kernel.test.ts`:
     - Thêm test cho `kernelCommand({ type: "add-student", payload: ... })` và `kernelCommand({ type: "enroll-student", classId: "cl-1", studentId: "st-9", activateNow: true })`.
- **Success criteria:** Toàn bộ test unit của `apps/web` trong các file trên chạy xanh.
- **Verify:** `pnpm --filter web check-types && pnpm --filter web test -- src/routes/_auth/students/index.test.tsx src/components/modals/enroll-student-modal.test.tsx src/routes/_auth/classes/\\$classId.test.tsx src/lib/repos/kernel.test.ts src/lib/empty-states.test.tsx` exits 0.

## Verification

- `pnpm --filter web check-types` exits 0.
- `pnpm --filter web test -- src/routes/_auth/students/index.test.tsx src/components/modals/enroll-student-modal.test.tsx src/routes/_auth/classes/\\$classId.test.tsx src/lib/repos/kernel.test.ts src/lib/empty-states.test.tsx` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
