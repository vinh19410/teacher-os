---
title: "Nghiên cứu Domain Điểm danh & Buổi học (Session Attendance & Check-in Domain)"
target: "Class Detail - Tab Buổi học (In-place attendance)"
author: "Technical Analyst (ResearchDomain)"
date: "2026-08-26"
status: "completed"
---

# Báo cáo Nghiên cứu: Domain Điểm danh & Thiết kế Điểm danh tại chỗ trên Tab "Buổi học"

## 1. Tóm tắt điều hành & Đề xuất cốt lõi (Executive Summary)

Nghiên cứu này phân tích toàn diện hiện trạng domain **Điểm danh (Check-in)**, **Trạng thái buổi học (Lesson/Session Status)**, **Mô hình dữ liệu per-enrollment vs per-session**, và cơ chế **Date-gating** trong Teacher OS để đề xuất giải pháp kỹ thuật tối ưu cho tính năng điểm danh trực tiếp tại chỗ (in-place attendance) trên tab "Buổi học" của trang Chi tiết Lớp học (`$classId.tsx`).

**Kết luận cốt lõi:**
1. **Bản chất "Điểm danh" trong Teacher OS**: Hiện tại hoàn toàn đồng nghĩa với hành động **`check-in`** (chuyển trạng thái `upcoming` → `completed`), ghi nhận học viên đã tham gia buổi học và tiêu hao 1 buổi trong gói học (`pkg.done` tăng 1, `pkg.remaining` giảm 1). Kernel **chưa có write path cho `absent`** (trạng thái vắng được nhận diện ngầm qua `missed-check-in` khi buổi học thuộc ngày trong quá khứ chưa được check-in).
2. **Mô hình dữ liệu `lesson` per-enrollment**: Bảng `lesson` trong DB được tổ chức theo từng lượt đăng ký (`enrollmentId`), **không có cột ngày tháng (`date` / `dateISO`)** và không có bảng `class_session` vật lý. Một buổi học của lớp 1:2 tương ứng với 2 bản ghi `lesson` riêng biệt.
3. **Date-gating phải nằm ở UI layer**: Do server không lưu ngày tháng cụ thể cho từng dòng `lesson` (chỉ lưu `day` 1–7 và `time`), việc tính toán ngày tháng (`dateISO`) hoàn toàn diễn ra tại client qua helper `buildClassSessions`. Do đó, quy tắc *"chỉ cho phép điểm danh các buổi đã/đang diễn ra, vô hiệu hóa các buổi tương lai"* **bắt buộc phải được kiểm soát tại UI layer** (`s.dateISO <= todayISO`).
4. **Từ chối Dropdown Status cấp Buổi học (Issue #87 / Plan 260826-1611 Phase 3)**: Việc dùng 1 dropdown gộp (`Upcoming` / `Completed` / `Cancelled`) cho cả session sẽ phá vỡ tính chi tiết điểm danh của lớp ghép 1:2 (khi 1 bạn đi học, 1 bạn nghỉ), gây xung đột với thuật toán `sessionStatus` và tính chất 1 chiều không thể rollback của Kernel API (lỗi 409).
5. **Đề xuất: Tiếp cận Phương án A (Reuse Check-in)**: Tái sử dụng trọn vẹn Kernel Action `check-in` sẵn có, bổ sung UI điểm danh theo từng học viên (per-student attendance pills/buttons) trực tiếp trên từng dòng buổi học trong tab "Buổi học", áp dụng date-gating chặn các buổi tương lai. **Không thay đổi DB schema, không tạo migration, không sửa server route**.

---

## 2. Kernel Actions, Schemas & Ma trận Chuyển trạng thái (Transition Matrix)

### 2.1. Hợp đồng API & Schema
Hành động thay đổi trạng thái `lesson` trong Kernel API được kiểm soát chặt chẽ thông qua schema rỗng để ngăn chặn việc client giả mạo trạng thái đích:

- **Schema definition** (`packages/api/src/contracts.ts:182-183`):
```typescript
export const lessonActionSchema = z.object({}).strict();
export type LessonAction = z.infer<typeof lessonActionSchema>;
```
- **Endpoint declarations** (`apps/server/src/routes/kernel.ts:688-694`):
```typescript
kernel.post("/lessons/:id/check-in", (c) =>
	lessonStatusAction(c, c.req.param("id"), "completed"),
);

kernel.post("/lessons/:id/cancel", (c) =>
	lessonStatusAction(c, c.req.param("id"), "cancelled"),
);
```

### 2.2. Quy tắc chuyển trạng thái & Concurrency Guard trong Kernel
Hàm `lessonStatusAction` (`apps/server/src/routes/kernel.ts:648-685`) thực thi 3 bước kiểm tra bắt buộc:

1. **Kiểm tra quyền sở hữu & Invariant 2 (Binding)**:
   `findLessonAction` (`apps/server/src/routes/kernel.ts:306-324`) `innerJoin` bảng `lesson` với `enrollment` và kiểm tra `orgId`. Nếu `row.enrollmentClassId !== row.classId` → trả về `409 { error: "lesson enrollment mismatch" }`.
2. **Kiểm tra trạng thái tiền điều kiện**:
   `if (row.status !== "upcoming") return c.json({ error: "lesson is not upcoming" }, 409);`.
3. **Ghi có điều kiện (Optimistic Concurrency Guard)**:
   Trạng thái `status = 'upcoming'` được đưa trực tiếp vào mệnh đề `WHERE` của câu lệnh `UPDATE`. Nếu 2 request đồng thời gửi đến, request đến sau sẽ match 0 dòng và nhận `409`:
   ```typescript
   const updated = await db
   	.update(lesson)
   	.set({ status: nextStatus })
   	.where(
   		and(
   			eq(lesson.id, lessonId),
   			eq(lesson.orgId, ctx.orgId),
   			eq(lesson.status, "upcoming"),
   		),
   	)
   	.returning({ id: lesson.id });
   if (updated.length === 0) {
   	return c.json({ error: "lesson is not upcoming" }, 409);
   }
   ```

### 2.3. Ma trận chuyển trạng thái (State Transition Matrix)

| Trạng thái hiện tại | Trạng thái đích: `completed` (`/check-in`) | Trạng thái đích: `cancelled` (`/cancel`) | Trạng thái đích: `absent` | Trạng thái đích: `upcoming` (Undo) |
|---|---|---|---|---|
| **`upcoming`** | **HỢP LỆ (200 OK)** | **HỢP LỆ (200 OK)** | *KHÔNG CÓ WRITE PATH* | N/A |
| **`completed`** | Bị từ chối (409 Conflict) | Bị từ chối (409 Conflict) | *KHÔNG CÓ WRITE PATH* | Bị từ chối (409 / Không có route) |
| **`cancelled`** | Bị từ chối (409 Conflict) | Bị từ chối (409 Conflict) | *KHÔNG CÓ WRITE PATH* | Bị từ chối (409 / Không có route) |
| **`absent`** | Bị từ chối (409 Conflict) | Bị từ chối (409 Conflict) | *KHÔNG CÓ WRITE PATH* | Bị từ chối (409 / Không có route) |

*Đặc tính quan trọng*: Tất cả chuyển đổi trạng thái trong Kernel là **1 chiều (irreversible)**. Không tồn tại endpoint nào để rollback từ `completed` hoặc `cancelled` quay ngược về `upcoming`.

### 2.4. Bằng chứng kiểm thử trong Kernel (`apps/server/src/kernel.test.ts`)
Các quy tắc trên đã được chứng minh qua bộ test suite chính thức:
- **Check-in thành công và chặn lặp lại**:
  `test("check-in flips upcoming→completed and persists; second check-in is 409", ...)` (`apps/server/src/kernel.test.ts:1804-1834`). Khẳng định `check-in` chỉ ghi nhận dòng `lesson`, không ghi đè trực tiếp các bộ đếm trên `session_package` hay `class.sessionsDone` (Invariant 6 & 7).
- **Hủy buổi và chặn check-in buổi đã hủy**:
  `test("cancel flips upcoming→cancelled; cancelled cannot be checked in; completed cannot be cancelled", ...)` (`apps/server/src/kernel.test.ts:1836-1865`).
- **Chặn giả mạo payload**:
  `test("guards: no Origin → 403, form content-type → 415, extra body key → 400", ...)` (`apps/server/src/kernel.test.ts:1888-1918`). Body có chứa `{ status: "completed" }` sẽ bị từ chối 400 bởi `lessonActionSchema.strict()`.

---

## 3. Bản ghi `lesson` per-enrollment vs Nhóm `ClassSession` (1:2 Group Classes)

### 3.1. Cấu trúc bảng `lesson` trong cơ sở dữ liệu
Theo `packages/db/src/schema/lesson.ts:7-44`:
```typescript
export const lesson = sqliteTable("lesson", {
	id: text("id").primaryKey(),
	orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
	classId: text("class_id").notNull().references(() => classTable.id, { onDelete: "cascade" }),
	enrollmentId: text("enrollment_id").notNull().references(() => enrollment.id, { onDelete: "cascade" }),
	day: integer("day").notNull(), // 1 = Monday ... 7 = Sunday
	time: text("time").notNull(),  // "19:00"
	dur: integer("dur").notNull(),   // 90
	type: text("type").notNull().default("1:1"),
	status: text("status").notNull().default("upcoming"),
	topic: text("topic").notNull().default(""),
	zoom: text("zoom").notNull().default(""),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```
- **Invariant 2**: "A scheduled session belongs to a class and exactly one enrollment" (Một buổi học gắn liền với 1 lớp và đúng 1 enrollment của 1 học viên).
- Khi thêm học viên vào lớp có tổng số buổi `sessionsTotal = N` (`apps/server/src/routes/kernel.ts:380-410`), hàm `generateScheduleLessons` sẽ sinh **N bản ghi `lesson` cho học viên đó**.
- **Lớp 1:1** (10 buổi): Có 1 enrollment → 10 bản ghi `lesson`.
- **Lớp 1:2** (10 buổi): Có 2 enrollments (HV A và HV B) → **20 bản ghi `lesson`** riêng biệt.

### 3.2. Cơ chế điểm danh hiện tại trong sản phẩm
1. **Trên Dashboard** (`apps/web/src/routes/_auth/dashboard.tsx:70-100`):
   - `lessonsToday` lọc danh sách lesson trong ngày. Lớp 1:2 sẽ render **2 thẻ riêng biệt** (1 thẻ cho HV A, 1 thẻ cho HV B).
   - Giáo viên nhấn nút "Điểm danh" trên thẻ của ai thì gửi action `check-in` cho đúng `lesson.id` của người đó.
2. **Trên Lịch tuần (`/schedule`)** (`apps/web/src/components/schedule/lesson-modal.tsx:165-174`):
   - Click vào ô học viên mở `LessonModal` mang tiêu đề `"${student.name} — 1:2"`.
   - Nút "Điểm danh" dispatch `{ type: "check-in", lessonId: lesson.id }` với toast `"Đã điểm danh."`.
   - Điểm danh diễn ra hoàn toàn độc lập theo từng học viên.

### 3.3. Cơ chế Gom nhóm `ClassSession` trên Tab "Buổi học"
Helper `buildClassSessions` (`apps/web/src/lib/class-sessions.ts:100-170`) gom các dòng `lesson` có cùng khung giờ (`slotKey = ${day}|${time}`) thành các buổi học theo trình tự thời gian (`ClassSession`):
- Mỗi `ClassSession` chứa `rows: ClassSessionLesson[]` (chứa tất cả các dòng của mọi học viên trong slot đó).
- `sessionStudents(session)` (`class-sessions.ts:239-250`): Lấy danh sách ID học viên tham gia buổi này.
- `sessionStatus(session)` (`class-sessions.ts:221-233`):
  ```typescript
  export function sessionStatus(session: ClassSession): SessionStatus {
  	const stats = slotStatsBySid(session.rows);
  	let allCompleted = true;
  	let allCancelled = true;
  	for (const entry of stats.values()) {
  		const state = sidStateAt(entry, session.slotIndex);
  		if (state !== "completed") allCompleted = false;
  		if (state !== "cancelled") allCancelled = false;
  	}
  	if (stats.size > 0 && allCompleted) return "completed";
  	if (stats.size > 0 && allCancelled) return "cancelled";
  	return "upcoming";
  }
  ```
- **Hệ quả đối với lớp 1:2**: Nếu HV A đã điểm danh (`completed`) nhưng HV B chưa điểm danh (`upcoming`), thì `allCompleted = false` → **trạng thái tổng thể của buổi học vẫn là `upcoming` ("Sắp tới")**.

---

## 4. Ngữ nghĩa Sản phẩm của "Điểm danh" (Check-in vs Absent)

### 4.1. "Điểm danh" hiện tại là Check-in Có mặt
Trong toàn bộ codebase Teacher OS:
- Nút bấm: Luôn là **"Điểm danh"** (`lesson-modal.tsx:165`, `dashboard.tsx:94`).
- Action gửi đi: Luôn là `{ type: "check-in", lessonId }`.
- Toast thông báo: Luôn là `"Đã điểm danh."`.
- Trạng thái nhận được: Luôn là `completed` (hiển thị nhãn **"Đã học"** hoặc **"Hoàn thành"**).
- Tác động gói học: Tăng `pkg.done` thêm 1, giảm `pkg.remaining` đi 1 (`apps/web/src/lib/repos/students.ts:40-58`).

### 4.2. Vị trí của trạng thái "Vắng" (`absent`) trong hệ thống
- Mặc dù chuỗi `"absent"` có mặt trong TypeScript union `KernelLessonRow.status` (`packages/api/src/contracts.ts:330`), nhưng ghi chú tại `apps/web/src/lib/dashboard-from-kernel.ts:28-30` xác nhận:
  > *`"absent has no kernel write path yet; missed-check-in is the live signal: upcoming on a weekday strictly before today in the Mon=1 week model."`*
- **Quy trình xử lý học viên vắng hiện nay**:
  Khi học viên vắng mặt, giáo viên **không thực hiện hành động gì** (buổi học giữ nguyên `status = "upcoming"`). Khi ngày học đó trôi qua, Dashboard sẽ tự động đánh dấu học viên này vào danh sách *"Học viên rủi ro"* với lý do `"missed-check-in"` (`dashboard-from-kernel.ts:45`).
- **Gói học của học viên vắng**: Do buổi học không chuyển sang `completed`, học viên không bị trừ số buổi trong gói (`pkg.done` không tăng), bảo toàn quyền lợi học bù.

---

## 5. Phân tích Date-Gating trên Server vs Client

### 5.1. Server có thể chặn điểm danh buổi học tương lai không?
**Câu trả lời**: **Server hiện tại KHÔNG THỂ phân biệt một dòng `lesson` cụ thể là của quá khứ hay tương lai.**

**Lý do kiến trúc:**
1. Bảng `lesson` **không có cột `date` hay `dateISO`** (`packages/db/src/schema/lesson.ts:19-44`).
2. Bảng `lesson` chỉ lưu `day` (thứ 1–7) và `time` ("19:00"). Khi tạo lớp có 26 buổi (thứ 3 và thứ 6), server sinh ra 13 dòng thứ 3 hoàn toàn giống hệt nhau về `(day, time)`, chỉ khác UUID ngẫu nhiên.
3. Server không lưu số thứ tự lần học (`slotIndex` hay `occurrence`).
4. Ngày lịch cụ thể (`dateISO`) **chỉ được dựng động trong bộ nhớ client** bởi helper `buildClassSessions` (`apps/web/src/lib/class-sessions.ts:14-17`) bằng cách tính toán tịnh tiến từ `class.startDate` dọc theo `schedule.days`.

Nếu cố ép server chặn ngày:
- Server chỉ có thể chặn thô cấp lớp: `if (class.startDate > today) return 409;`.
- Nhưng với lớp đang diễn ra (đã học 3 tuần, còn 5 tuần tương lai), khi client gửi `POST /api/lessons/:id/check-in`, server không có cách nào biết `lessonId` đó ứng với ngày 25/08 (đã diễn ra) hay ngày 15/09 (tương lai) nếu không tái hiện toàn bộ thuật toán duyệt lịch phức tạp của client.
- Việc thay đổi schema để thêm cột `date` vào `lesson` sẽ phá vỡ Invariant 6, đòi hỏi migration và sửa đổi hàng loạt test trong `kernel.test.ts`.

### 5.2. Giải pháp Date-Gating chuẩn mực: Thực thi tại UI Layer
Date-gating phải được kiểm soát tuyệt đối tại UI của Tab "Buổi học":
- Lấy ngày hiện tại: `const todayISO = new Date().toISOString().slice(0, 10);` (hoặc helper `todayIso` từ app state).
- So sánh với ngày của session:
  - **`s.dateISO <= todayISO`** (Buổi học hôm nay hoặc trong quá khứ): Cho phép giáo viên thực hiện thao tác Điểm danh (nút "Điểm danh" khả dụng).
  - **`s.dateISO > todayISO`** (Buổi học tương lai): **Vô hiệu hóa (disable)** nút điểm danh, kèm visual hint hoặc tooltip rõ ràng: *"Chưa đến ngày học"*.

---

## 6. Xung đột với Kế hoạch Dropdown Trạng thái Buổi học (Issue #87 / Plan 260826-1611 Phase 3)

Trong Plan `260826-1611-merge-class-detail-schedule-and-curriculum-tabs/phase-03-timeline-mutations-inline-edit-and-status.md`, Phase 3 đề xuất đặt một **Status Dropdown** (`Upcoming` / `Completed` / `Cancelled`) trên mỗi dòng session và thực hiện bulk fan-out action:
```typescript
const action = newStatus === "completed" ? "check-in" : "cancel-lesson";
for (const row of session.rows) {
	const state = sidStateAt(...);
	if (state !== "upcoming") continue;
	await dispatch({ type: action, lessonId: row.id });
}
```

### 4 Điểm gãy kiến trúc nghiêm trọng của thiết kế này:

1. **Phá vỡ tính chi tiết điểm danh của lớp ghép 1:2**:
   - Nếu lớp có 2 học viên, trong đó Học viên 1 đi học và Học viên 2 nghỉ.
   - Dropdown cấp session chỉ có 1 giá trị duy nhất. Nếu chọn `Completed`, hệ thống sẽ ép điểm danh cả 2 học viên, làm sai lệch dữ liệu học tập và trừ tiền oan uổng của Học viên 2.
2. **Nghịch lý trạng thái hiển thị (State Inconsistency)**:
   - Theo `apps/web/src/lib/class-sessions.test.ts:285-303`, nếu 1 học viên `completed` và 1 học viên `upcoming`, hàm `sessionStatus()` sẽ trả về `"upcoming"`.
   - Kết quả: Giáo viên vừa điểm danh cho 1 bạn xong, quay lại nhìn dropdown vẫn thấy hiển thị `"Sắp tới"`, gây hoang mang tột độ.
3. **Xung đột tính bất biến 1 chiều của Kernel API (Lỗi 409)**:
   - Dropdown tạo ảo giác cho người dùng là có thể tùy ý chuyển đổi qua lại giữa `Upcoming` ↔ `Completed` ↔ `Cancelled`.
   - Tuy nhiên, Kernel API trả về **409 Conflict** đối với bất kỳ hành động nào cố gắng đưa `completed` hay `cancelled` quay trở lại `upcoming`.
4. **Không nhất quán với toàn bộ sản phẩm**:
   - Màn hình `/dashboard` và màn hình `/schedule` đều dùng cơ chế nút bấm Điểm danh theo từng học viên.

**Khẳng định**: Phải **bãi bỏ ý tưởng Status Dropdown cấp Session** của Issue #87 / Plan Phase 3, thay thế bằng **Bảng/Nút điểm danh theo từng học viên** (Per-Student In-place Attendance).

---

## 7. So sánh Chi tiết Hai Phương án Triển khai (Trade-off Matrix)

| Tiêu chí đánh giá | Phương án A: Tái sử dụng Check-in sẵn có (ĐƯỢC ĐỀ XUẤT) | Phương án B: Thêm Action `mark-absent` + Roster Có mặt/Vắng |
|---|---|---|
| **Thay đổi DB Schema** | **Không (0 migration)** | Có thể cần hoặc không (nhưng cần mở rộng semantics) |
| **Thay đổi Server Kernel API** | **Không (Giữ nguyên `POST /api/lessons/:id/check-in`)** | Có (Thêm endpoint `POST /api/lessons/:id/absent`, cập nhật handler) |
| **Mức độ phức tạp & Rủi ro** | **Rất thấp** (Đã kiểm chứng trên Dashboard và Schedule) | **Rất cao** (Ảnh hưởng Invariant 6, cách tính `pkg.done`, hàm `mapStudents`, `class-sessions.ts`) |
| **Hỗ trợ lớp 1:1 và 1:2** | **Hoàn hảo**: Điểm danh độc lập từng học viên | Phức tạp: Phải chọn giữa Có mặt / Vắng cho từng bạn |
| **Tác động đến gói học (`pkg`)** | Điểm danh → trừ buổi (`pkg.done + 1`). Không điểm danh → bảo lưu buổi. Phù hợp 100% logic hiện tại. | `absent` có trừ buổi trong gói hay không? Nếu trừ thì sai luật giáo dục, nếu không trừ thì phá vỡ công thức tổng dòng. |
| **Date-gating** | Client chặn `s.dateISO > todayISO` dễ dàng | Client chặn `s.dateISO > todayISO` |
| **Tiến độ khả thi** | Có thể triển khai và bàn giao ngay lập tức | Cần 2–3 ngày refactor toàn diện backend & frontend |

---

## 8. Đề xuất Kiến trúc & Giao diện Triển khai (Recommendation)

### 8.1. Cơ chế hoạt động trên Tab "Buổi học" (`$classId.tsx`)

Trong bảng `ClassScheduleTable` (`apps/web/src/routes/_auth/classes/$classId.tsx:246-350`):

1. **Xác định thời điểm của Session**:
   ```typescript
   const todayISO = new Date().toISOString().slice(0, 10);
   const isPastOrToday = s.dateISO <= todayISO;
   ```
2. **Tìm dòng lesson tương ứng của từng học viên**:
   Trong mỗi `ClassSession` (`s`), đối với mỗi học viên `sid` tham gia:
   - Dùng `slotStatsBySid` và `sidStateAt(entry, s.slotIndex)` để biết học viên đó ở buổi này đã `completed` hay chưa.
   - Nếu chưa (`upcoming`): Lấy dòng lesson đầu tiên có `sid` đó và `status === "upcoming"` trong `s.rows`.
3. **Hiển thị trực quan tại Cột Trạng thái / Học viên**:
   - **Đối với lớp 1:1**:
     - Nếu đã hoàn thành: Hiển thị `<Badge variant="success" dot>Đã học</Badge>`.
     - Nếu đã hủy: Hiển thị `<Badge variant="danger">Đã hủy</Badge>`.
     - Nếu sắp tới & `isPastOrToday`: Hiển thị nút **`<Button size="sm">Điểm danh</Button>`**. Khi click → gọi `useDirectKernelAction` dispatch `check-in`.
     - Nếu sắp tới & **tương lai (`!isPastOrToday`)**: Hiển thị `<Badge variant="accent">Sắp tới</Badge>` (nút Điểm danh bị ẩn hoặc disabled với title *"Chưa đến ngày học"*).
   - **Đối với lớp 1:2 (Lớp nhóm)**:
     - Tại mỗi dòng buổi học, render danh sách học viên kèm nút trạng thái nhỏ gọn cạnh tên từng bạn:
       - Bạn A: `[✓ Đã học]`
       - Bạn B: Nếu `isPastOrToday` → hiển thị nút `[Điểm danh]`; nếu tương lai → hiển thị `[Sắp tới]`.
     - Giúp giáo viên thấy ngay bạn nào đã đi học, bạn nào chưa điểm danh mà không làm xáo trộn bảng.

---

## 9. Phương án bị bác bỏ (Rejected Alternatives)

1. **Bác bỏ Dropdown Trạng thái Session gộp (Issue #87)**:
   - *Lý do*: Gây mất tính chi tiết trên lớp ghép 1:2, xung đột với hàm derive `sessionStatus`, và vi phạm ràng buộc không thể rollback của Kernel (lỗi 409).
2. **Bác bỏ việc thêm cột `date` vào bảng `lesson` trong DB**:
   - *Lý do*: Vi phạm nguyên tắc YAGNI/KISS. Hệ thống hiện tại đã derive ngày tháng hoàn hảo trên frontend thông qua `class.startDate` + `schedule`. Thêm cột `date` đòi hỏi migration DB, sửa đổi logic sinh buổi khi thêm học viên, và phá vỡ 10+ server tests.
3. **Bác bỏ việc tạo mới Kernel Action `mark-absent` vào thời điểm hiện tại**:
   - *Lý do*: Chưa có yêu cầu nghiệp vụ rõ ràng về việc xử lý trừ tiền hay tính bù khi học viên vắng mặt. Hiện trạng hệ thống (để `upcoming` và cảnh báo `missed-check-in` trên Dashboard) đang hoạt động ổn định và an toàn nhất cho quyền lợi gói học của học sinh.

---

## 10. Các câu hỏi mở & Rủi ro phụ thuộc (Open Questions & Load-bearing Risks)

1. **Hành vi hủy buổi (`cancel-lesson`) trên Tab Buổi học**:
   - Khi cần hủy một buổi học (do giáo viên bận hoặc nghỉ lễ), UI có nên cung cấp nút "Hủy buổi" cạnh nút "Điểm danh" không? *(Khuyến nghị: Chỉ cung cấp nút Hủy buổi khi mở chi tiết buổi học hoặc có Confirm Dialog rõ ràng, vì `cancel-lesson` là thao tác vĩnh viễn không thể hoàn tác)*.
2. **Đồng bộ thời gian giữa Client và Server (Timezone)**:
   - `s.dateISO` được tính toán chuẩn UTC midnight (`yyyy-mm-dd`). Client lấy `todayISO` theo giờ địa phương Việt Nam (UTC+7). Cần đảm bảo so sánh chuỗi ngày `YYYY-MM-DD` nhất quán để tránh trường hợp lệch 1 ngày khi giáo viên mở web vào rạng sáng.

---

## 11. Trích dẫn Tệp Nguồn Chính (Source File Citations)

1. `apps/server/src/routes/kernel.ts` (Dòng 640–695, 300–325, 80–105): Định nghĩa logic `lessonStatusAction`, concurrency WHERE guard, và bộ sinh `generateScheduleLessons`.
2. `packages/db/src/schema/lesson.ts` (Dòng 7–44): Schema bảng `lesson`, Invariant 2, khẳng định không lưu `date` và liên kết chặt `enrollmentId`.
3. `packages/api/src/contracts.ts` (Dòng 180–185, 325–335): Schema `lessonActionSchema` (strict empty object) và kiểu dữ liệu `KernelLessonRow`.
4. `apps/web/src/lib/class-sessions.ts` (Dòng 4–28, 100–175, 215–250): Helper `buildClassSessions`, `sessionStatus`, `sessionStudents` và thuật toán phân bổ trạng thái prefix theo slot.
5. `apps/web/src/components/schedule/lesson-modal.tsx` (Dòng 160–180): Cơ chế điểm danh hiện tại của ứng dụng (`useDirectKernelAction` + `check-in`).
