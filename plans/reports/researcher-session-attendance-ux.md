# Báo Cáo Nghiên Cứu UX: Điểm Danh Trực Tiếp Tại Tab "Buổi Học" Chi Tiết Lớp (Class Detail)

> **Mục tiêu**: Nghiên cứu và thiết kế trải nghiệm người dùng (UX) cho tính năng điểm danh tại chỗ (in-place attendance) ngay trên bảng tiến độ buổi học (`ClassScheduleTable`) thuộc tab "Buổi học" của trang chi tiết lớp học (`$classId.tsx`).
> **Ràng buộc & Nguyên tắc**: Tái sử dụng tối đa Design System và UI Primitives hiện có (`Button`, `Badge`, `Modal`, `Avatar`), tuân thủ triệt để luồng kernel mutation, đảm bảo chuẩn tiếp cận a11y (không xung đột click expand-row), và kiểm soát chặt chẽ quy tắc ngày học (chỉ cho phép điểm danh các buổi đã/đang diễn ra, vô hiệu hóa các buổi tương lai).

---

## 1. Hiện Trạng Bảng "Buổi Học" (`ClassScheduleTable`)

Hiện tại, bảng danh sách buổi học được định nghĩa tại `apps/web/src/routes/_auth/classes/$classId.tsx:246-474`.

### 1.1. Cấu trúc cột hiện tại (Chế độ Active `sessions !== null`)
Bảng gồm 4 cột chính:
1. **Ngày & Giờ** (`apps/web/src/routes/_auth/classes/$classId.tsx:376-380`):
   - Hiển thị ngày dạng text tiếng Việt kết hợp giờ học: `{formatSessionDate(s.dateISO)} · {sessionTimeRange(s)}` (Ví dụ: *"Thứ Ba, 25/08 · 19:00–20:30"*).
   - Format font mono, kích thước text-xs `text-meta`.
2. **Học viên** (`apps/web/src/routes/_auth/classes/$classId.tsx:381`):
   - Danh sách tên học viên tham gia buổi học được suy luận từ `sessionStudents(s)`, nối bằng dấu phẩy: `{students || "—"}`.
3. **Chủ đề** (`apps/web/src/routes/_auth/classes/$classId.tsx:382-416`):
   - Chứa nút bấm Chevron (`ChevronDown` / `ChevronRight`) nếu buổi học có chi tiết giáo trình (`hasDetails`).
   - Badge module: `info.moduleTitle` (ví dụ: `Module 1`) nếu có.
   - Tiêu đề bài học: `info.title` (ví dụ: `Listening Section 1`).
4. **Trạng thái** (`apps/web/src/routes/_auth/classes/$classId.tsx:417-427`):
   - Render `Badge` trạng thái tổng hợp từ `sessionStatus(s)`:
     - `completed` -> `<Badge variant="success" dot>Đã học</Badge>`
     - `cancelled` -> `<Badge variant="danger">Đã hủy</Badge>`
     - `upcoming` -> `<Badge variant="accent">Sắp tới</Badge>`

### 1.2. Cơ chế Expand-Row và Click Handlers
- **Hành vi click trên hàng** (`apps/web/src/routes/_auth/classes/$classId.tsx:357-375`):
  - Khi `hasDetails = Boolean(info.materials || info.objectives || info.lessonId)` là `true`, toàn bộ thẻ `<tr>` được gắn:
    - `onClick={() => toggleExpand(s.index)}`
    - `tabIndex={0}`
    - `onKeyDown` (bắt phím `Enter` hoặc `Space` để toggle)
    - `aria-expanded={isExpanded}`
    - Class CSS hover: `cursor-pointer hover:bg-surface focus-visible:shadow-[var(--focus-ring)]`.
  - Nút Chevron bên trong có `e.stopPropagation()` để tránh kích hoạt sự kiện 2 lần khi click thẳng vào icon.
- **Hàng mở rộng (Sub-row)** (`apps/web/src/routes/_auth/classes/$classId.tsx:429-453`):
  - Khi `isExpanded && hasDetails`, render một `<tr>` phụ với `<td colSpan={4}>` màu nền `bg-surface-warm/30`.
  - Hiển thị thông tin `Tài liệu` (`info.materials`) và `Mục tiêu` (`info.objectives`).

### 1.3. Chế độ Fallback cũ (`sessions === null`)
- Được kích hoạt tại `apps/web/src/routes/_auth/classes/$classId.tsx:259-299` khi `buildClassSessions` trả về `null` (lịch tự do kiểu cũ, thiếu `startDate`, không có lesson rows, hoặc các rows bị chỉnh sửa lệch khỏi slot cố định).
- Render component `DataTable` 5 cột: `["Ngày", "Giờ", "Học viên", "Chủ đề", "Trạng thái"]` duyệt qua danh sách phẳng `legacyLessons`.
- Bảng hoàn toàn ở chế độ **read-only**, không có tương tác hàng, không có sub-row.

---

## 2. Khảo Sát Affordance "Điểm Danh" Hiện Có Trong Hệ Thống

Affordance "Điểm danh" hiện đang vận hành tại 2 vị trí chính:
1. **Modal Bài học `/schedule`** (`apps/web/src/components/schedule/lesson-modal.tsx:165-184`)
2. **Trang Tổng quan `/dashboard`** (`apps/web/src/routes/_auth/dashboard.tsx:80-101`)

```
+-------------------+-----------------------------------------------------------+
| Thuộc tính        | Quy chuẩn đang vận hành trong Teacher OS                  |
+-------------------+-----------------------------------------------------------+
| Copy Button       | "Điểm danh" (Kích thước: size="sm", variant="primary")   |
| Pending State     | "Đang lưu…" (khi isPending(lessonId) === true)            |
| Toast Thông Báo   | "Đã điểm danh." (khi mutation hoàn tất thành công)        |
| Điều kiện Enable  | lesson.status === "upcoming" && !busy && !isPending(id)   |
| Trạng thái Sau Đó | <Badge variant="success" dot>Đã học</Badge>              |
| Action Payload    | dispatch({ type: "check-in", lessonId })                  |
| Endpoint Backend  | POST /api/lessons/:id/check-in với body rỗng {}          |
+-------------------+-----------------------------------------------------------+
```

### 2.1. Phân tích chi tiết luồng Mutation
- Khi bấm nút "Điểm danh", client gọi hook `useDirectKernelAction` (`apps/web/src/routes/_auth/dashboard.tsx:21`):
  1. Đặt `pendingKey = lessonId` (làm cho `isPending(lessonId) = true` và `busy = true`, vô hiệu hóa các nút bấm khác để chống double-click).
  2. Gửi lệnh qua command bus `POST /api/lessons/:id/check-in` với body `{}`.
  3. Nhận kết quả: nếu thành công, hiển thị toast `"Đã điểm danh."` thông qua `reportDirectOutcome`, sau đó tự động gọi `refresh()` để reload snapshot kernel.
  4. Reducer và derived counters tự động tính lại số buổi `sessionsDone` và entitlement `pkg.remaining` của học viên mà không lưu hardcode.

---

## 3. Quy Tắc Kích Hoạt Theo Ngày (Enable/Disable by Session Date)

### 3.1. Tại sao cần chặn điểm danh theo ngày ở Frontend?
- Trong Kernel API backend (`apps/server/src/routes/kernel.ts:646`), endpoint `POST /api/lessons/:id/check-in` chỉ xác thực `row.status === "upcoming"`, **hoàn toàn không có date guard** (không kiểm tra ngày tháng trên server).
- Nếu Frontend không kiểm soát điều kiện ngày, người dùng có thể vô tình hoặc cố ý điểm danh những buổi học nằm ở 2 tháng sau, gây sai lệch nghiêm trọng về số buổi còn lại và báo cáo tiến độ.

### 3.2. So sánh 3 phân vùng thời gian
Đặt $T_{\text{today}}$ là ngày hôm nay theo giờ Việt Nam (`todayISOVietnam()`), $S_{\text{date}}$ là ngày của buổi học (`session.dateISO`):

```
                  Quá khứ                      Hôm nay                       Tương lai
        (S_date < T_today)               (S_date == T_today)            (S_date > T_today)
  <-----------------------------------|-----------------------|----------------------------------->
            [CHO PHÉP]                       [CHO PHÉP]                     [VÔ HIỆU HÓA]
      Điểm danh bù các buổi             Điểm danh trong/trước           Chưa diễn ra, khóa CTA
          đã qua trong lịch                  buổi học hôm nay              Hiển thị Badge "Sắp tới"
```

1. **Buổi học trong Quá khứ (`session.dateISO < todayISOVietnam()`):**
   - Buổi học chắc chắn đã diễn ra.
   - Nếu trạng thái vẫn là `upcoming` (do giáo viên quên điểm danh lúc dạy) -> **BẮT BUỘC CHO PHÉP** (Enable) để giáo viên điểm danh bù.
2. **Buổi học trong Tương lai (`session.dateISO > todayISOVietnam()`):**
   - Buổi học chưa diễn ra.
   - **VÔ HIỆU HÓA HOÀN TOÀN** (Disable / Không hiển thị nút bấm). Chỉ hiển thị static `<Badge variant="accent">Sắp tới</Badge>`.
3. **Buổi học Hôm nay (`session.dateISO === todayISOVietnam()`) — Quyết định thiết kế:**
   - **Hành vi thực tế của giáo viên (Teacher Workflow):**
     - Giáo viên thường mở phần mềm điểm danh vào 3 thời điểm:
       1. Trước giờ học 5–15 phút (khi học sinh bắt đầu bước vào phòng học hoặc tham gia phòng Zoom).
       2. Giữa giờ học (trong lúc học sinh đang làm bài luyện tập).
       3. Cuối buổi học (trước khi rời lớp).
     - *Nếu áp dụng quy tắc cực đoan "chỉ cho phép buổi trong quá khứ (`S_date < T_today`)"*: Giáo viên dạy xong lúc 20:30 tối nay sẽ **bị chặn không thể điểm danh** cho đến tận 00:00 ngày hôm sau! Đây là lỗi trải nghiệm nghiêm trọng (broken workflow).
     - *Nếu áp dụng quy tắc chặn theo giờ bắt đầu (`S_time <= T_now`)*: Rất dễ phát sinh lỗi khi đồng hồ thiết bị bị lệch 1-2 phút, hoặc gây khó chịu khi giáo viên muốn tick điểm danh sớm 5 phút khi học sinh đã có mặt đầy đủ trong Zoom. Ngoài ra, đòi hỏi client phải chạy timer polling để re-render khi bước qua phút bắt đầu.
   - **Khuyến nghị nhất quán:**
     - **Cho phép điểm danh toàn bộ buổi học của ngày "Hôm nay" (`session.dateISO <= todayISOVietnam()`):**
     - Quyết định này đồng bộ 100% với màn hình `dashboard.tsx` (`apps/web/src/routes/_auth/dashboard.tsx:42`), nơi tất cả các buổi học trong ngày `lessonsToday` đều hiển thị sẵn nút "Điểm danh" ngay từ đầu ngày.

```typescript
// Điều kiện kích hoạt điểm danh chuẩn hóa
const isEligibleDate = session.dateISO <= todayISOVietnam();
const canCheckIn = isEligibleDate && sessionStatus(session) === "upcoming";
```

---

## 4. Phân Tích Múi Giờ (Timezone) & Rủi Ro Lệch Ngày (Off-by-One)

### 4.1. Các mô hình ngày giờ hiện hữu trong codebase
1. **`class-sessions.ts`** (`apps/web/src/lib/class-sessions.ts:48-62, 185-190`):
   - Mọi phép tính lịch đều neo tại **UTC Midnight** (`new Date(`${iso}T00:00:00Z`)`).
   - Chuỗi `session.dateISO` luôn là định dạng strict ISO `YYYY-MM-DD` (ví dụ: `"2026-08-26"`).
   - `formatSessionDate(dateISO)` sử dụng `timeZone: "UTC"` để ép thứ (weekday) không bị nhảy sang ngày khác ở các máy khách phương Tây.
2. **`week-grid.ts`** (`apps/web/src/lib/week-grid.ts:18-35`):
   - Cung cấp hàm `todayISOVietnam(now = new Date())` sử dụng `Intl.DateTimeFormat` với `timeZone: "Asia/Ho_Chi_Minh"`.
   - Đảm bảo "ngày hôm nay" luôn tính theo giờ Việt Nam (UTC+7), bất kể máy giáo viên đang đặt múi giờ UTC, US hay JP.
3. **`dashboard-from-kernel.ts`** (`apps/web/src/lib/dashboard-from-kernel.ts:6-10`):
   - `lessonDayFromDate(now)` sử dụng `now.getDay()` (dựa trên múi giờ local của browser, có nguy cơ lệch thứ nếu browser đặt múi giờ khác UTC+7).

### 4.2. Rủi ro Off-by-One và Biện pháp Phòng Ngừa
- **Rủi ro**: Nếu so sánh ngày bằng `new Date().toISOString().slice(0, 10)`:
  - Vào lúc 05:00 sáng ngày 26/08 tại Việt Nam (UTC+7), giờ UTC mới là 22:00 ngày 25/08 -> `toISOString()` sẽ trả về ngày `2026-08-25` (bị trễ 1 ngày, khiến buổi học hôm nay bị coi là buổi tương lai và bị khóa nhầm).
- **Quy tắc an toàn tuyệt đối**:
  - Luôn sử dụng `todayISOVietnam()` từ `@/lib/week-grid` làm mốc so sánh chuẩn.
  - So sánh trực tiếp chuỗi: `session.dateISO <= todayISOVietnam()`. Phép so sánh chuỗi `"YYYY-MM-DD"` là so sánh thứ tự từ điển (lexicographical), hoàn toàn độc lập với múi giờ của máy khách, đạt độ chính xác 100% trên mọi môi trường và test runner.

---

## 5. Đánh Giá & So Sánh Các Phương Án UI (UI Options Matrix)

| Tiêu chí | Phương án A: Row Action Button mở Attendance Modal | Phương án B: Expand-Row trở thành Bảng Roster | Phương án C: Inline Chips/Buttons trong ô Học viên | Phương án D (Đề xuất): Smart In-Place CTA + Modal cho Lớp Nhóm |
| :--- | :--- | :--- | :--- | :--- |
| **Mô tả** | Nút "Điểm danh" trên hàng mở Modal danh sách học viên | Mở rộng sub-row hiển thị danh sách học viên & nút điểm danh | Đặt trực tiếp nút/chip điểm danh cho từng bạn trong cell bảng | Lớp 1:1 điểm danh trực tiếp 1-click; Lớp >= 2 học viên mở Modal chọn |
| **Tốc độ thao tác** | Trung bình (2 clicks: Mở modal -> Xác nhận) | Chậm (Phải expand hàng -> tìm nút điểm danh) | Nhanh nhất cho 1:1, Rối loạn với lớp đông | **Tối ưu nhất** (1 click cho 1:1, 2 clicks rõ ràng cho 1:2/nhóm) |
| **Độ phức tạp UI** | Thấp (Dùng lại `Modal`, `Avatar`, `Badge`) | Cao (Gánh cả nội dung giáo trình lẫn form điểm danh) | Rất cao (Ô bảng bị chật chội, layout dễ vỡ) | **Thấp & Gọn** (Không phát sinh component thừa) |
| **Trải nghiệm Lớp 1:2 / Nhóm** | Rất tốt (Không gian modal rộng rãi, dễ xem từng bạn) | Trung bình (Bảng con lồng trong bảng mẹ) | Rất tệ (Nhiều nút bấm chen chúc trong 1 cell) | **Rất tốt** (Hiển thị tiến độ rõ ràng `1/2`, modal chi tiết) |
| **Xung đột a11y & Click** | Không xung đột (`stopPropagation` trên button) | Xung đột cao (Biến toàn bộ hàng thành form phức hợp) | Xung đột rất cao (Nhiều click target trong 1 row tương tác) | **Không xung đột** (Tách bạch click target rõ ràng) |
| **Mức độ tương thích Design System** | 100% component có sẵn | Cần custom layout sub-row | Cần chế thêm chip bấm mới | **100% Primitives chuẩn** (`Button`, `Badge`, `Modal`) |

---

## 6. Phương Án Thiết Kế Đề Xuất (Recommended Solution)

### 6.1. Chi tiết Tương tác "Smart In-Place Action"
Thay vì áp dụng một cơ chế cứng nhắc, UI sẽ thích ứng thông minh theo quy mô lớp học và trạng thái buổi học:

```
                                      Kiểm tra Buổi học
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
            Buổi Tương lai                                   Buổi Quá khứ / Hôm nay
     (dateISO > todayISOVietnam())                        (dateISO <= todayISOVietnam())
                      │                                               │
                      ▼                               ┌───────────────┴───────────────┐
           <Badge variant="accent">                   ▼                               ▼
                   Sắp tới                      Trạng thái Đã xong               Trạng thái Upcoming
                                            (completed hoặc cancelled)                │
                                                      │                               │
                                            Hiển thị Badge tương ứng                  │
                                            ("Đã học" / "Đã hủy")                     ▼
                                                                             Kiểm tra Số Học Viên
                                                                                      │
                                                              ┌───────────────────────┴───────────────────────┐
                                                              ▼                                               ▼
                                                          Lớp 1:1                                    Lớp 1:2 hoặc Nhóm
                                                      (1 học viên)                                  (>= 2 học viên)
                                                              │                                               │
                                                              ▼                                               ▼
                                                    [Nút: "Điểm danh"]                             [Nút: "Điểm danh (0/2)"]
                                                    Click: 1-click check-in                        Click: Mở SessionAttendanceModal
                                                    Toast: "Đã điểm danh."                         Điểm danh từng bạn / Tất cả
```

### 6.2. Giao diện Mockup trực quan trên cột "Trạng thái"

#### Trường hợp 1: Lớp 1:1 (Phổ biến nhất trong dạy kèm)
- **Buổi tương lai**: `<Badge variant="accent">Sắp tới</Badge>`
- **Buổi hôm nay / quá khứ chưa điểm danh**:
  ```tsx
  <Button
    size="sm"
    disabled={busy || isPending(lessonId)}
    onClick={(e) => {
      e.stopPropagation();
      void run(lessonId, { type: "check-in", lessonId }, "Đã điểm danh.");
    }}
  >
    {isPending(lessonId) ? "Đang lưu…" : "Điểm danh"}
  </Button>
  ```
- **Sau khi điểm danh**: Tự động chuyển thành `<Badge variant="success" dot>Đã học</Badge>`.

#### Trường hợp 2: Lớp 1:2 hoặc Lớp Nhóm (Nhiều học viên)
- **Khi chưa có học viên nào điểm danh (0/2)**:
  - Cột Trạng thái hiển thị nút phụ: `<Button size="sm" variant="secondary">Điểm danh (0/2)</Button>`.
- **Khi có 1 học viên đã điểm danh (Mixed State - 1/2)**:
  - Cột Trạng thái hiển thị: `<Button size="sm" variant="secondary" className="border-accent-blue text-accent-blue">Điểm danh (1/2)</Button>`.
- **Khi click nút**: Mở `SessionAttendanceModal`:
  - Tiêu đề: `Điểm danh — Buổi 3 (Thứ Ba, 25/08)`
  - Danh sách học viên dạng Card/List:
    - *Nguyễn Văn A*: `<Badge variant="success" dot>Đã học</Badge>`
    - *Trần Thị B*: `<Button size="sm">Điểm danh</Button>`
  - Footer: Nút "Điểm danh tất cả" (nếu còn bạn chưa điểm danh) và nút "Đóng".

---

## 7. Xử Lý Các Trường Hợp Đặc Biệt (Edge Cases Matrix)

```
+------------------------------------+------------------------------------+---------------------------------------------------------------+
| Tình huống (Edge Case)             | Dữ liệu Backend / Logic Helper    | Hành vi UX & Giao diện trên Bảng                             |
+------------------------------------+------------------------------------+---------------------------------------------------------------+
| 1. Buổi học đã hủy (Cancelled)     | sessionStatus === "cancelled"      | - Ẩn hoàn toàn nút Điểm danh.                                 |
|                                    | (mọi row đều có status cancelled)  | - Hiển thị <Badge variant="danger">Đã hủy</Badge>.           |
|                                    |                                    | - Backend sẽ trả 409 nếu cố tình check-in.                    |
+------------------------------------+------------------------------------+---------------------------------------------------------------+
| 2. Buổi học đã học (Completed)     | sessionStatus === "completed"      | - Ẩn hoàn toàn nút Điểm danh.                                 |
|                                    | (mọi row đều có status completed)  | - Hiển thị <Badge variant="success" dot>Đã học</Badge>.      |
+------------------------------------+------------------------------------+---------------------------------------------------------------+
| 3. Trạng thái hỗn hợp (Mixed)      | 1 row "completed", 1 row "upcoming"| - sessionStatus(s) trả về "upcoming".                         |
|    (VD: 1 bạn đi học, 1 bạn nghỉ)  | trong cùng 1 session slot          | - Nút hiển thị tiến độ: "Điểm danh (1/2)".                    |
|                                    |                                    | - Click mở modal thấy rõ bạn nào đã học, bạn nào chưa.         |
+------------------------------------+------------------------------------+---------------------------------------------------------------+
| 4. Lớp chưa có học viên            | cls.studentIds.length === 0        | - Ô Học viên hiển thị "—".                                    |
|    (0 học viên)                    | session.rows.length === 0          | - Cột Trạng thái hiển thị Badge "Sắp tới" (hoặc "—").         |
|                                    |                                    | - Không hiển thị nút bấm (không có lessonId để dispatch).     |
+------------------------------------+------------------------------------+---------------------------------------------------------------+
| 5. Chế độ Fallback cũ              | sessions === null                  | - Giữ nguyên bảng DataTable 5 cột READ-ONLY.                  |
|    (Legacy Schedule / Invalid Date)| (không xác định được dateISO chuẩn)| - Không gắn nút điểm danh để tránh vi phạm date-guard.        |
|                                    |                                    | - Giáo viên thao tác điểm danh qua /schedule nếu cần.         |
+------------------------------------+------------------------------------+---------------------------------------------------------------+
| 6. Buổi học trong tương lai        | session.dateISO > todayISOVietnam()| - Khóa/Ẩn CTA điểm danh.                                      |
|    (Future Sessions)               |                                    | - Hiển thị tĩnh <Badge variant="accent">Sắp tới</Badge>.      |
+------------------------------------+------------------------------------+---------------------------------------------------------------+
```

---

## 8. Khả Năng Tiếp Cận (Accessibility / a11y) & Giải Quyết Xung Đột Tương Tác

### 8.1. Phân tích xung đột DOM & Sự kiện hiện tại
Trong `ClassScheduleTable` (`apps/web/src/routes/_auth/classes/$classId.tsx:357-375`):
- Toàn bộ thẻ `<tr>` hiện đang nhận sự kiện `onClick` để mở rộng sub-row chi tiết giáo trình (`toggleExpand`).
- Nếu đặt trực tiếp một thẻ `<button>` ("Điểm danh") vào trong `<td>` mà không xử lý:
  1. **Event Bubbling Collision**: Click vào nút "Điểm danh" sẽ nổi bọt lên `tr.onClick`, khiến hàng vừa điểm danh vừa bị mở rộng/thu gọn giật cục.
  2. **Vi phạm chuẩn a11y (Nested Interactive Controls)**: Thẻ `<tr>` có `tabIndex={0}` đóng vai trò như một button ảo. Việc lồng một `<button>` thực thụ bên trong một container tương tác vi phạm quy chuẩn WCAG 2.1 (Screen reader sẽ đọc đè role hoặc người dùng bàn phím bị kẹt focus).

### 8.2. Giải pháp kỹ thuật đạt chuẩn a11y
1. **Chặn nổi bọt sự kiện (Event Isolation)**:
   - Mọi nút bấm tương tác (Nút Điểm danh, Nút Mở Modal) bên trong cell phải có:
     ```tsx
     onClick={(e) => {
       e.stopPropagation();
       // handle action
     }}
     onKeyDown={(e) => {
       if (e.key === " " || e.key === "Enter") {
         e.stopPropagation();
       }
     }}
     ```
2. **Tách biệt ranh giới tương tác (Separation of Concerns)**:
   - Thay vì gán `onClick` trên toàn bộ thẻ `<tr>`, biến khu vực cột "Chủ đề" thành trigger mở rộng chuyên biệt (với nút Chevron rõ ràng có `aria-expanded={isExpanded}` và `aria-label="Xem chi tiết bài học"`).
   - Thẻ `<tr>` chỉ giữ vai trò container ngữ nghĩa (semantic table row) không cần `tabIndex={0}`.
   - Giúp người dùng khiếm thị dùng phím Tab di chuyển mượt mà: `Tab` -> Nút Chevron mở rộng -> `Tab` -> Nút Điểm danh.

---

## 9. Danh Sách Tệp Nguồn Trích Dẫn (Source Files Citation)

Báo cáo trích dẫn chính xác 5 tệp nguồn nền tảng trong codebase:

1. **`apps/web/src/routes/_auth/classes/$classId.tsx`**: Định nghĩa tuyến chi tiết lớp học, tab "Buổi học", và component bảng `ClassScheduleTable` (dòng 246-474).
2. **`apps/web/src/lib/class-sessions.ts`**: Module tính toán lịch học niên đại `buildClassSessions`, trạng thái buổi `sessionStatus`, danh sách học viên `sessionStudents`, và định dạng ngày `formatSessionDate` (dòng 15-250).
3. **`apps/web/src/components/schedule/lesson-modal.tsx`**: Mẫu modal chuẩn cho buổi học, affordance nút "Điểm danh", xử lý pending và toast thông báo (dòng 17-185).
4. **`apps/web/src/lib/week-grid.ts`**: Bộ tiện ích xử lý ngày tháng an toàn theo múi giờ Việt Nam `todayISOVietnam()` và định dạng ngày chuẩn (dòng 18-35, 97-100).
5. **`apps/web/src/routes/_auth/dashboard.tsx`**: Giao diện điểm danh tại chỗ mẫu trên Dashboard, quy tắc hiển thị `lessonsToday` và quản lý trạng thái pending `"Đang lưu…"` (dòng 40-105).

---

## 10. Kết Luận & Khuyến Nghị Triển Khai (Summary & Action Plan)

1. **Về mặt UX**:
   - Áp dụng **Phương án D ("Smart In-Place Action")**: 1-click check-in trực tiếp cho lớp 1:1 (chiếm >80% nhu cầu thực tế); hiển thị nút kèm modal roster chi tiết cho lớp 1:2 và nhóm.
   - Luôn cho phép điểm danh các buổi **Quá khứ & Hôm nay** (`dateISO <= todayISOVietnam()`); khóa chặt các buổi **Tương lai** (`dateISO > todayISOVietnam()`).
2. **Về mặt Kỹ thuật**:
   - Sử dụng hook `useDirectKernelAction` có sẵn để dispatch action `{ type: "check-in", lessonId }`.
   - Cập nhật `ClassSessionLesson` trong `class-sessions.ts` để giữ lại trường `id` của từng `Lesson` row.
   - Thêm `e.stopPropagation()` và tách bạch trigger mở rộng giáo trình để đảm bảo chuẩn a11y WCAG.
   - Giữ bảng legacy fallback ở trạng thái read-only.
