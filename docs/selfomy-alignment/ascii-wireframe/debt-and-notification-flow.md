# Flow 2: Sổ công nợ học viên & Nhật ký gửi thông báo đa kênh (`debt-and-notification-flow`)

> Thuộc bộ đặc tả giao diện của tính năng **selfomy-alignment**. Liên kết ngược: [[selfomy-alignment-wireframe-index.md|Wireframe Index]] · [[../srs/selfomy-alignment-userflow.md|User Flow]] · [[../html-wireframe/debt-and-notification-flow.html|HTML Wireframe]].

---

## Screen: student-debt-ledger

- **Screen number**: `[4]`
- **Screen name**: Sổ công nợ học viên
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Giáo vụ / Quản lý học vụ (`Admin/Staff`), Chủ trung tâm (`Owner`) *(Trợ giảng `TA` bị chặn truy cập theo `FR-selfomy-alignment-029`)*
- **Related FR**: `FR-selfomy-alignment-001`, `FR-selfomy-alignment-009`, `FR-selfomy-alignment-010`, `FR-selfomy-alignment-029`
- **Related UC**: [[../usecases/uc-student-debt-and-notification.md|uc-student-debt-and-notification]]
- **HTML Wireframe**: [[../html-wireframe/debt-and-notification-flow.html|debt-and-notification-flow.html#screen-student-debt-ledger]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| SO CONG NO HOC VIEN                                [1] [Gui nhac hoc phi (02)] [2] [+ Tao khoan] |
|--------------------------------------------------------------------------------------------------|
| +------------------------------+ +------------------------------+ +----------------------------+ |
| | [3] TONG PHAI THU KY NAY     | | [4] TONG DA THU              | | [5] TONG CON NO QUA HAN    | |
| |     48.500.000 VND (18 HV)   | |     33.000.000 VND (13 HV)   | |     15.500.000 VND (05 HV) | |
| +------------------------------+ +------------------------------+ +----------------------------+ |
|--------------------------------------------------------------------------------------------------|
| [6] Tim HV/SĐT: [              ] | [7] Trang thai: (Tat ca 18) (Qua han 05) (Sap den han <=7n 03)|
|                                    (Da thu du 10)  | [8] Lop: [Tat ca lop v]                     |
|--------------------------------------------------------------------------------------------------|
| [x] | Hoc vien         | Lop        | Phai đóng  | Da thu     | Con no     | Han đóng   | Thao tac|
|-----|------------------|------------|------------|------------|------------|------------|--------|
| [x] | Nguyen Minh Anh  | IELTS 6.5A | 4.500.000d | 2.000.000d | 2.500.000d | 20/10 (!QH)|[9][Thu]|
| [x] | Tran Hoang Nam   | IELTS 5.0B | 3.800.000d |         0d | 3.800.000d | 29/10 (SDH)|[9][Thu]|
| [ ] | Le Thu Ha        | IELTS 6.5A | 4.500.000d | 4.500.000d |         0d | 15/10 (Xong)|[15](eye)|
|==================================================================================================|
|                 HOP THOAI / NGAN KEO: GHI NHAN THU TIEN HOC PHI (Nguyen Minh Anh)                |
|--------------------------------------------------------------------------------------------------|
| Khoan thu: Khoa IELTS 6.5A (24 buoi) | Phai đóng: 4.500.000d | Da thu: 2.000.000d | No: 2.500.000d|
| [10] So tien thuc thu lan nay (VND) *: [ 2.500.000 ]  [Chon nhanh: Thu toan bo 2.500.000d]       |
| [11] Phuong thuc: (•) Chuyen khoan ( ) Tien mat | [12] Ghi chu: [ Phu huynh CK dot 2           ] |
| (info) So du con no sau giao dich nay: 0 VND -> Trang thai chuyen sang: [Da thu du]              |
|                                                       [13] [Huy]   [14] [Luu phieu thu hoc phi]  |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Nút `Gửi nhắc học phí (N)` | Secondary button | Action | Kích hoạt khi có ít nhất 1 học viên đang nợ được tích chọn trong bảng. Khi bấm, hệ thống phát sự kiện `Nhắc học phí đến hạn / quá hạn` qua Email + In-app (`FR-selfomy-alignment-001`, `FR-selfomy-alignment-010`) và hiển thị liên kết mở màn `[5] notification-logs`. |
| 2 | Nút `+ Tạo khoản thu` | Outline button | Action | Mở biểu mẫu khởi tạo khoản học phí mới cho học viên theo gói khóa học (`Số tiền phải đóng`, `Hạn thanh toán`, `Ghi chú`). |
| 3 | Thẻ KPI `Tổng phải thu kỳ này` | Metric card | Currency (`VND`) + Count | Tổng giá trị học phí phải thu của các khoản thu khớp bộ lọc hiện tại kèm tổng số học viên (`FR-selfomy-alignment-009`). |
| 4 | Thẻ KPI `Tổng đã thu` | Metric card | Currency (`VND`) + Count | Tổng số tiền thực tế đã thu được và số lượng học viên đã hoàn tất nghĩa vụ học phí (`FR-selfomy-alignment-009`). |
| 5 | Thẻ KPI `Tổng còn nợ quá hạn` | Metric card | Currency (`VND`) + Count | Tổng số dư nợ của các khoản đã vượt quá `Hạn thanh toán` hoặc sắp đến hạn (`FR-selfomy-alignment-009`). |
| 6 | Ô tìm kiếm học viên / số điện thoại | Search input (debounced) | String | Tìm theo họ tên, email hoặc số điện thoại học viên; áp dụng `debounce 300ms` trước khi cập nhật tham số URL `?q=...`. |
| 7 | Nhóm chip lọc trạng thái công nợ | Chip filter group | Enum | Lọc theo trạng thái công nợ (`FR-selfomy-alignment-009`): `Tất cả`, `Quá hạn (overdue)`, `Sắp đến hạn <= 7 ngày (due_soon)`, `Đã thu đủ (paid)`. Đồng bộ 2 chiều với URL `?status=...`. |
| 8 | Bộ lọc Lớp học | Select dropdown | UUID | Lọc danh sách công nợ theo từng lớp học trong tổ chức. |
| 9 | Nút `Thu` (`Ghi nhận thu tiền`) | Action button | Action | Mở hộp thoại/ngăn kéo `Ghi nhận thu tiền học phí` cho học viên tại dòng tương ứng (`FR-selfomy-alignment-009`, `FR-selfomy-alignment-010`). |
| 10 | Ô `Số tiền thực thu lần này (VND) *` | Currency number input | Integer (`VND`) | Nhập số tiền thu một phần hoặc toàn bộ (`0 < Số tiền thực thu <= Số tiền còn nợ`). Có nút chọn nhanh `Thu toàn bộ {Số tiền còn nợ}`. |
| 11 | Bộ chọn `Phương thức thanh toán` | Radio group | Enum | Chọn hình thức thu (`Chuyển khoản QR Bank-Hub`, `Tiền mặt`, `Khác`). |
| 12 | Ô `Ghi chú phiếu thu` | Text input | String (`<= 255 chars`) | Ghi chú thông tin đợt thu tiền hoặc mã giao dịch ngân hàng của phụ huynh/học viên. |
| 13 | Nút `Hủy` | Ghost button | Action | Đóng hộp thoại thu tiền mà không lưu thay đổi. |
| 14 | Nút `Lưu phiếu thu học phí` | Primary button | Action | Lưu giao dịch thu tiền, cộng dồn vào `Số tiền đã đóng`, tính lại `Số tiền còn nợ = Số tiền phải đóng - Số tiền đã đóng`, tự động cập nhật trạng thái (`Còn nợ một phần` hoặc `Đã thu đủ`) và làm mới 3 thẻ KPI đầu trang trong `<= 2 giây` (`FR-selfomy-alignment-009`, `NFR-selfomy-alignment-001`). |
| 15 | Nút `(eye) Xem dòng thời gian lịch sử hóa đơn & giao dịch` | Icon button | Drawer trigger | Mở ngăn xem dòng thời gian (`timeline`) toàn bộ các hóa đơn học phí đã phát hành và các giao dịch thanh toán (qua QR Bank-Hub hoặc thu thủ công) của học viên (`FR-selfomy-alignment-010`). |

### Screen Actions & Validation Rules

- **Kiểm tra số tiền thu hợp lệ**: Nếu người dùng nhập `Số tiền thực thu <= 0` hoặc `> Số tiền còn nợ`, hệ thống hiển thị thông báo lỗi inline màu đỏ ngay dưới ô `[10]` (*"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ"*), đồng thời khóa nút `[14] Lưu phiếu thu học phí`.
- **Bảo전 lịch sử khi dời lịch nghỉ lễ (`BR-selfomy-alignment-003`)**: Việc dời lịch nghỉ lễ trên màn `[3]` không làm phát sinh phụ phí hay thay đổi `Số tiền phải đóng` của gói học phí đã ghi nhận trên màn `[4]`.

---

## Screen: notification-logs

- **Screen number**: `[5]`
- **Screen name**: Nhật ký gửi thông báo Email + In-app (`Shared Screen`)
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Giáo vụ / Quản lý học vụ (`Admin/Staff`), Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-001`, `FR-selfomy-alignment-002`, `FR-selfomy-alignment-003`
- **Related UC**: [[../usecases/uc-student-debt-and-notification.md|uc-student-debt-and-notification]]
- **HTML Wireframe**: [[../html-wireframe/debt-and-notification-flow.html|debt-and-notification-flow.html#screen-notification-logs]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| NHAT KY GUI THONG BAO (EMAIL & IN-APP)                        [1] [Gui lai tat ca muc loi (02)]  |
|--------------------------------------------------------------------------------------------------|
| [2] Tim nguoi nhan/tieu de: [             ] | [3] Su kien: (Tat ca) (Giao bai tap) (Tra ket qua) |
|                                               (Nhac hoc phi) (Doi lich nghi le)                  |
| [4] Trang thai chuyen phat: (Tat ca 42) (Dang cho 01) (Da gui 35) (Da doc 04) (Loi gui 02)       |
|--------------------------------------------------------------------------------------------------|
| [5] Bang lich su chuyen phat thong bao:                                                          |
| +----------------------------------------------------------------------------------------------+ |
| | Thoi gian    | Nguoi nhan         | Su kien          | Kenh        | Trang thai  | Thao tac  | |
| |--------------|--------------------|------------------|-------------|-------------|-----------| |
| | 26/10 10:15  | Nguyen Minh Anh    | Nhac hoc phi     | Email+InApp | [!] Loi gui | [6][Gui l]| |
| |              | minhanh@wrong..com | (E-010: Hop thu khong ton tai sau 3 lan thu) |           | |
| |--------------|--------------------|------------------|-------------|-------------|-----------| |
| | 26/10 09:40  | Lop IELTS 6.5A(12) | Doi lich nghi le | Email+InApp | (v) Da gui  | [7](eye)  | |
| |--------------|--------------------|------------------|-------------|-------------|-----------| |
| | 25/10 21:05  | Tran Hoang Nam     | Tra ket qua cham | Email+InApp | (v) Da doc  | [7](eye)  | |
| +----------------------------------------------------------------------------------------------+ |
|                                         [8] Trang 1 / 5   [< Truoc] [1] [2] [3] [Sau >]          |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Nút `Gửi lại tất cả mục lỗi (N)` | Secondary button | Action | Đưa toàn bộ các bản ghi thông báo đang ở trạng thái `Lỗi gửi (failed)` trong bộ lọc hiện tại về lại hàng đợi `Đang chờ (queued)` để thực hiện chu kỳ gửi lại (`FR-selfomy-alignment-011`, `BR-selfomy-alignment-009`). |
| 2 | Ô tìm kiếm người nhận / tiêu đề | Search input (debounced) | String | Tìm theo tên học viên, địa chỉ Email người nhận hoặc tiêu đề thông báo; áp dụng `debounce 300ms` cập nhật URL `?q=...`. |
| 3 | Nhóm chip lọc `Sự kiện thông báo` | Chip filter group | Enum | Lọc theo đúng 4 sự kiện thông báo chính (`FR-selfomy-alignment-010`): `Giao bài tập mới`, `Trả kết quả chấm bài`, `Nhắc học phí đến hạn / quá hạn`, `Thay đổi lịch học / nghỉ lễ` (cùng lời mời học viên từ phòng thi công khai). |
| 4 | Nhóm chip lọc `Trạng thái chuyển phát` | Chip filter group | Enum | Lọc theo 4 trạng thái vòng đời thông báo (`FR-selfomy-alignment-011`): `Đang chờ (queued)`, `Đã gửi (sent)`, `Đã đọc (read)`, `Lỗi gửi (failed)`. |
| 5 | Bảng lịch sử chuyển phát thông báo | Data table | Array<Row> | Hiển thị thời gian phát sinh, tên & email người nhận, loại sự kiện, kênh gửi (`Email + In-app`), nhãn trạng thái chuyển phát và thông điệp lỗi chi tiết (`E-selfomy-alignment-010`) nếu thất bại sau 3 lần thử tự động. |
| 6 | Nút `Gửi lại` (`Retry`) | Action button | Action | Chỉ hiển thị trên các dòng có trạng thái `Lỗi gửi (failed)` (`FR-selfomy-alignment-011`, `E-selfomy-alignment-010`). Khi bấm, hệ thống đặt lại số lần thử và đưa thông báo về trạng thái `Đang chờ (queued)` mà không nhân bản thông báo In-app đã hiển thị. |
| 7 | Nút `Xem chi tiết` (`(eye)`) | Icon button | Modal trigger | Mở hộp thoại xem nội dung chi tiết bức thư Email đã gửi, thời điểm gửi từng lần thử (`attempt 1..3`) và thời điểm học viên mở đọc (`read_at`). |
| 8 | Thanh phân trang (`Pagination`) | Pagination bar | Integer | Điều hướng phân trang danh sách nhật ký thông báo (`20 dòng/trang`), đồng bộ với tham số URL `?page=...`. |

### Screen Actions & Validation Rules

- **Chống nhân bản thông báo khi bấm `Gửi lại` (`BR-selfomy-alignment-009`, `NFR-selfomy-alignment-004`)**: Mỗi thông báo gắn khóa chống trùng (`idempotency_key`) theo cặp `(sự kiện, người nhận, đối tượng tham chiếu)`. Khi bấm `Gửi lại`, hệ thống chỉ kích hoạt lại kênh gửi bị lỗi (`Email`) trên cùng bản ghi đó, không tạo thêm bản ghi thông báo In-app trùng lặp trên cổng học viên.

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
