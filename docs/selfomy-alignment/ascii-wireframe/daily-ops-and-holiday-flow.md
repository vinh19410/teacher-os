# Flow 1: Vận hành lịch dạy, Điểm danh tổng & Nghỉ lễ tự động dời buổi (`daily-ops-and-holiday-flow`)

> Thuộc bộ đặc tả giao diện của tính năng **selfomy-alignment**. Liên kết ngược: [[selfomy-alignment-wireframe-index.md|Wireframe Index]] · [[../srs/selfomy-alignment-userflow.md|User Flow]] · [[../html-wireframe/daily-ops-and-holiday-flow.html|HTML Wireframe]].

---

## Screen: dashboard-reminders

- **Screen number**: `[1]`
- **Screen name**: Bảng điều khiển — Thẻ Việc cần làm hôm nay (`Shared Screen`)
- **Application**: `apps/web` (Teacher / Center Workspace)
- **Actors**: Giáo viên độc lập, Giáo viên đứng lớp (`Teacher`), Trợ giảng (`TA`), Giáo vụ / Quản lý học vụ (`Admin/Staff`), Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-004`, `FR-selfomy-alignment-026`, `FR-selfomy-alignment-029`
- **Related UC**: [[../usecases/uc-daily-attendance-and-holiday.md|uc-daily-attendance-and-holiday]], [[../usecases/uc-student-debt-and-notification.md|uc-student-debt-and-notification]]
- **HTML Wireframe**: [[../html-wireframe/daily-ops-and-holiday-flow.html|daily-ops-and-holiday-flow.html#screen-dashboard-reminders]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| [Sidebar-07]      | [1] Tim kiem nhanh (Cmd+K)             [2] Vi AI: 245 Cr | [3] Goi Chuyen nghiep|
| - Bang dieu khien |------------------------------------------------------------------------------|
| - Diem danh ngay  | [4] (!) CANH BAO AN HAN: Goi thue bao da qua han. Con 48 gio an han truoc khi|
| - Lich & Nghi le  |         tam khoa tinh nang AI.                       [5] [Gia han ngay ->]   |
| - So cong no      |------------------------------------------------------------------------------|
| - Nhat ky TB      | VIEC CAN LAM HOM NAY (Thứ Hai, 26/10/2026)                [6] [Lam moi du lieu]|
| - Nhap de AI      | +------------------------------+ +------------------------------+ +----------+
| - Cham bai AI     | | [7] CA HOC CHUA DIEM DANH    | | [8] BAI TAP QUA HAN CHAM >24H| | [9] HOC  |
| - Phong thi chung | |     03 ca hoc hom nay        | |     12 bai Writing/Speaking  | | PHI QUA  |
| - Thue bao & Vi   | | - IELTS 6.5A (18:00 - 19:30) | | - 08 Writing (4 cham nhanh)  | | HAN THU  |
| - Nhan su & Tran  | | - IELTS 5.0B (19:30 - 21:00) | | - 04 Speaking cho duyet      | | 05 HV    |
|                   | | [10] [Mo Diem danh ngay ->]  | | [11] [Mo Khong gian cham ->] | | [12][Thu]|
|                   | +------------------------------+ +------------------------------+ +----------+
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Ô tìm kiếm toàn cục (`Cmd+K`) | Search trigger button | String | Mở hộp thoại tìm kiếm nhanh lớp học, học viên, đề thi hoặc lệnh điều hướng trên toàn hệ thống (`apps/web`). Hỗ trợ phím tắt `⌘K` trên macOS và `Ctrl+K` trên Windows. |
| 2 | Huy hiệu số dư Ví Credit AI | Status badge (clickable) | Integer | Hiển thị tổng số dư Credit AI khả dụng của tổ chức theo thời gian thực (tổng Credit gói tháng còn hạn + Credit nạp lẻ Top-up theo `BR-selfomy-alignment-002`). Nhấp vào sẽ chuyển hướng sang màn `[10] subscription-and-credit-wallet`. |
| 3 | Nhãn gói thuê bao hiện tại | Status badge | Enum | Hiển thị tên gói hiện hành (`Dùng thử 30 credit`, `Cơ bản`, `Chuyên nghiệp`, `Nâng cao`) kèm trạng thái (`Đang hoạt động`, `Ân hạn 72h`, `Hết hạn`). |
| 4 | Thanh cảnh báo ân hạn gói thuê bao (`grace_period`) | Alert banner | String | Chỉ hiển thị khi gói thuê bao bước vào chu kỳ 3 ngày ân hạn (`72 giờ` theo `FR-selfomy-alignment-026`, `BR-selfomy-alignment-010`) hoặc đã hết hạn (`expired`, mã `E-selfomy-alignment-006`). Thông báo rõ thời gian còn lại trước khi khóa mềm AI và cam kết không khóa dữ liệu lớp học/lịch dạy. |
| 5 | Nút `Gia hạn ngay` | Primary button | Action | Điều hướng trực tiếp đến màn `[10] subscription-and-credit-wallet` và mở sẵn bảng chọn gia hạn gói thuê bao tháng. |
| 6 | Nút `Làm mới dữ liệu` | Ghost button | Action | Tải lại bộ đếm thời gian thực của cả 3 thẻ nhắc việc trong thời gian phản hồi `<= 2 giây` (`NFR-selfomy-alignment-001`). |
| 7 | Thẻ `Ca học hôm nay chưa điểm danh` | Summary card | Integer + List | Đếm tổng số ca học diễn ra trong ngày hiện tại chưa hoàn tất điểm danh (`FR-selfomy-alignment-006`). Liệt kê tối đa 3 ca học gần nhất kèm khung giờ và tên lớp. Đối với Giáo viên đứng lớp/Trợ giảng chỉ đếm các lớp được phân công phụ trách (`FR-selfomy-alignment-029`). |
| 8 | Thẻ `Bài tập quá hạn chấm > 24h` | Summary card | Integer + List | Đếm tổng số bài nộp Writing/Speaking đang ở trạng thái `Chờ chấm tay (manual_pending)`, `AI đã chấm nháp (ai_drafted)` hoặc `Đang rà soát (teacher_reviewing)` đã quá `24 giờ` kể từ thời điểm nộp mà chưa bấm **"Chốt trả bài"** (`FR-selfomy-alignment-006`, `BR-selfomy-alignment-001`). |
| 9 | Thẻ `Học phí đến hạn / quá hạn thu` | Summary card | Integer + Currency | Đếm tổng số học viên có khoản học phí sắp đến hạn (`<= 7 ngày`) hoặc đã quá hạn thanh toán kèm tổng số tiền còn nợ (`FR-selfomy-alignment-005`, `FR-selfomy-alignment-006`). **Quy tắc phân quyền (`FR-selfomy-alignment-029`)**: Tự động ẩn thẻ này nếu người dùng đăng nhập có vai trò là Trợ giảng (`TA`). |
| 10 | Nút `Mở Điểm danh ngày ->` | Secondary button | Navigation | Chuyển sang màn `[2] daily-attendance` với tham số URL được gắn sẵn `?date={today}&status=pending` (`FR-selfomy-alignment-006`). |
| 11 | Nút `Mở Không gian chấm ->` | Secondary button | Navigation | Chuyển sang màn `[7] ai-grading-review-workspace` với bộ lọc danh sách bài nộp quá hạn `> 24h` chưa trả điểm. |
| 12 | Nút `Mở Sổ công nợ ->` | Secondary button | Navigation | Chuyển sang màn `[4] student-debt-ledger` với tham số URL `?status=overdue,due_soon`. Bị ẩn đối với vai trò Trợ giảng (`TA`). |

### Screen Actions & Validation Rules

- **Trạng thái hoàn thành (`Zero Inbox State`)**: Khi bộ đếm của một thẻ bằng `0`, thẻ chuyển sang tông màu trung tính nhẹ kèm nhãn `(v) Đã hoàn tất hôm nay`, nút hành động đổi thành `Xem lịch sử`.
- **Ràng buộc phân quyền (`RBAC`)**: Hệ thống kiểm tra vai trò từ phiên đăng nhập; nếu là `TA` thì chỉ hiển thị 2 thẻ `[7]` và `[8]`, tuyệt đối không trả dữ liệu công nợ về client (`FR-selfomy-alignment-029`, `NFR-selfomy-alignment-005`).

---

## Screen: daily-attendance

- **Screen number**: `[2]`
- **Screen name**: Điểm danh tổng theo ngày
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Giáo viên đứng lớp (`Teacher`), Trợ giảng (`TA`), Giáo vụ (`Admin/Staff`), Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-005`, `FR-selfomy-alignment-029`, `FR-selfomy-alignment-031`
- **Related UC**: [[../usecases/uc-daily-attendance-and-holiday.md|uc-daily-attendance-and-holiday]]
- **HTML Wireframe**: [[../html-wireframe/daily-ops-and-holiday-flow.html|daily-ops-and-holiday-flow.html#screen-daily-attendance]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| DIEM DANH TONG THEO NGAY                                      [1] [Xem Lich hoc & Nghi le ->]    |
|--------------------------------------------------------------------------------------------------|
| [2] Ngay: [ 26/10/2026 ] [Hom nay] | [3] Tim lop/HV: [          ] | [4] Trang thai: (Tat ca 05)  |
|     (Chua diem danh 03) (Da xong 02) | [5] Giao vien: [Tat ca v]                                 |
|--------------------------------------------------------------------------------------------------|
| [6] [v] Ca 18:00 - 19:30 | Lop IELTS 6.5A (Phong 201) | GV: Minh Tran | Si so: 12 HV [Chua luu]  |
|     +------------------------------------------------------------------------------------------+ |
|     | Thao tac nhanh: [7] [Danh dau tat ca Co mat]                   [8] [Luu diem danh ca hoc]| |
|     |------------------------------------------------------------------------------------------| |
|     | #  | Hoc vien          | [9] Trang thai diem danh                    | [10] Ghi chu hoc vu| |
|     |----|-------------------|---------------------------------------------|-------------------| |
|     | 01 | Nguyen Minh Anh   | (*) Co mat ( ) Vang CP ( ) Vang KP ( ) Muon | [Nop du bai tap ] | |
|     | 02 | Tran Hoang Nam    | ( ) Co mat (*) Vang CP ( ) Vang KP ( ) Muon | [Xin nghi om    ] | |
|     | 03 | Le Thu Ha         | ( ) Co mat ( ) Vang CP ( ) Vang KP (*) Muon | [Vao tre 15 phut] | |
|     +------------------------------------------------------------------------------------------+ |
|--------------------------------------------------------------------------------------------------|
| [11][>] Ca 19:30 - 21:00 | Lop IELTS 5.0B (Online)    | GV: Lan Pham  | Si so: 15 HV [Da luu(v)] |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Nút `Xem Lịch học & Nghỉ lễ ->` | Secondary button | Navigation | Điều hướng sang màn `[3] schedule-and-holiday-modal` để xem lịch tuần/tháng hoặc tạo kỳ nghỉ chung. |
| 2 | Bộ chọn ngày học (`?date=YYYY-MM-DD`) | Date picker + Quick button | Date | Mặc định chọn ngày hôm nay. Khi đổi ngày, cập nhật trực tiếp lên URL search param `?date=...` và tải danh sách tất cả ca học của các lớp trong ngày đó (`FR-selfomy-alignment-007`). |
| 3 | Ô tìm kiếm lớp học / học viên | Search input (debounced) | String | Tìm kiếm theo tên lớp hoặc tên học viên trong ngày đã chọn; áp dụng `debounce 300ms` trước khi đẩy lên URL `?q=...` (theo quy ước UI `AGENTS.md`). |
| 4 | Nhóm chip lọc trạng thái điểm danh | Chip filter group | Enum | Lọc nhanh ca học theo trạng thái: `Tất cả`, `Chưa điểm danh (pending)`, `Đã điểm danh (completed)`. Huy hiệu số đếm trên từng chip gắn `aria-hidden="true"`. |
| 5 | Bộ lọc Giáo viên phụ trách | Select dropdown | UUID | Cho phép Chủ trung tâm / Giáo vụ lọc ca học theo giáo viên đứng lớp. Đối với Giáo viên đứng lớp / Trợ giảng, bộ lọc này tự khóa vào danh sách lớp mình được gán (`FR-selfomy-alignment-029`). |
| 6 | Thẻ tiêu đề ca học (Accordion Row) | Expandable header | Object | Hiển thị khung giờ, tên lớp, phòng học/link học, giáo viên phụ trách, sĩ số và nhãn trạng thái điểm danh. Nhấp vào sẽ mở rộng danh sách học viên ngay tại chỗ (`inline`) mà không cần chuyển sang từng trang lớp học riêng lẻ (`FR-selfomy-alignment-007`). |
| 7 | Nút `Đánh dấu tất cả Có mặt` | Secondary button | Action | Điền nhanh trạng thái `Có mặt (present)` cho toàn bộ học viên chưa được chọn trạng thái trong ca học đang mở, giúp giáo viên chỉ cần chỉnh lại các học viên vắng/đi muộn. |
| 8 | Nút `Lưu điểm danh ca học` | Primary button | Action | Ghi nhận toàn bộ trạng thái điểm danh và ghi chú học vụ của ca học xuống cơ sở dữ liệu trong `<= 2 giây` (`NFR-selfomy-alignment-001`), hiển thị thông báo Toast thành công và giảm bộ đếm trên màn `[1] dashboard-reminders`. |
| 9 | Bộ chọn trạng thái điểm danh từng học viên | Radio pill group | Enum | Bắt buộc chọn 1 trong 4 trạng thái chuẩn cho mỗi học viên trong ca học (`FR-selfomy-alignment-004`): `Có mặt (present)`, `Vắng có phép (excused)`, `Vắng không phép (unexcused)`, `Đi muộn (late)`. |
| 10 | Ô `Ghi chú học vụ` | Text input | String (`<= 255 chars`) | Cho phép giáo viên/trợ giảng nhập nhận xét ngắn gọn trong buổi học (ví dụ: lý do xin nghỉ, số phút đi trễ, thái độ học tập) lưu kèm bản ghi điểm danh (`FR-selfomy-alignment-004`). |
| 11 | Thẻ ca học thu gọn | Collapsed header | Object | Hiển thị trạng thái tóm tắt của các ca học khác trong cùng ngày (ví dụ `Đã lưu (v)` kèm tỷ lệ chuyên cần `14/15 Có mặt`). |

### Screen Actions & Validation Rules

- **Ràng buộc đầy đủ sĩ số**: Nếu bấm `Lưu điểm danh ca học` khi còn học viên chưa có trạng thái, hệ thống tự động gợi ý xác nhận gán `Có mặt` cho các học viên còn trống hoặc tô viền vàng dòng học viên chưa chọn.
- **Responsive (`768px` & `375px`)**: Trên điện thoại và máy tính bảng, bảng học viên bên trong mỗi ca học tự động chuyển thành danh sách thẻ xếp chồng dọc (`card stack`), 4 nút trạng thái điểm danh hiển thị dạng lưới `2×2` chạm ngón tay dễ dàng.

---

## Screen: schedule-and-holiday-modal

- **Screen number**: `[3]`
- **Screen name**: Lịch học & Hộp thoại Tạo lịch nghỉ chung
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Giáo vụ (`Admin/Staff`), Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-001`, `FR-selfomy-alignment-006`, `FR-selfomy-alignment-007`, `FR-selfomy-alignment-008`
- **Related UC**: [[../usecases/uc-daily-attendance-and-holiday.md|uc-daily-attendance-and-holiday]]
- **HTML Wireframe**: [[../html-wireframe/daily-ops-and-holiday-flow.html|daily-ops-and-holiday-flow.html#screen-schedule-and-holiday-modal]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| LICH DAY HOC & KY NGHI CHUNG               [1] [< Tuan 26/10 - 01/11 >]   [2] [+ Tao lich nghi]  |
|--------------------------------------------------------------------------------------------------|
| [3] Bang lich tuan (nen) ... [Thu Tu 28/10: NGHI LE QUOC KHANH - Da doi sang 18/12] [Xoa nghi le]|
|==================================================================================================|
|                       HOP THOAI: TAO LICH NGHI CHUNG & TU DONG DOI BUOI                          |
|--------------------------------------------------------------------------------------------------|
| [4] Ten ky nghi le *: [ Nghi le 20/11 & Bao tri phong hoc        ]                               |
| [5] Tu ngay *:        [ 20/11/2026 ]      [6] Den ngay *: [ 21/11/2026 ]                         |
| [7] Pham vi ap dung *:(•) Toan bo to chuc ( ) Chon lop hoc cu the: [ Tat ca 06 lop dang mo  v ]  |
| [8] Phuong thuc xu ly:(•) Doi lich (+1 buoi vao cuoi khoa)         ( ) Huy buoi (khong bu)       |
|--------------------------------------------------------------------------------------------------|
| [9] BANG XEM TRUOC CAC BUOI HOC BI ANH HUONG (03 buoi se duoc xu ly):                            |
| +----------------------------------------------------------------------------------------------+ |
| | Lop hoc    | Buoi goc bi trung   | Trang thai hien tai | Ket qua sau khi ap dung (BR-003)    | |
| |------------|---------------------|---------------------|-------------------------------------| |
| | IELTS 6.5A | T6, 20/11 (Buoi 14) | Chua dien ra        | -> Doi +1 buoi sang T6, 25/12/2026  | |
| | IELTS 5.0B | T7, 21/11 (Buoi 08) | Chua dien ra        | -> Doi +1 buoi sang T3, 29/12/2026* | |
| | Giao tiep 1| T6, 20/11 (Buoi 10) | Da diem danh (v)    | (!) Giu nguyen - Da dien ra         | |
| +----------------------------------------------------------------------------------------------+ |
| (info) *Ghi chu: Ngay du kien 26/12 cua lop IELTS 5.0B trung Nghi Tet Duong lich nen he thong    |
|        tu dong nhay sang ngay hoc hop le ke tiep (T3, 29/12/2026) de bao toan du 24 buoi.        |
| [10] [x] Gui thong bao Email & In-app cho hoc vien cac lop bi anh huong                          |
|                                               [11] [Huy bo]   [12] [Xac nhan ap dung & Doi buoi] |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Bộ điều hướng tuần/tháng | Date range navigator | DateRange | Chuyển đổi chế độ xem lịch theo Tuần hoặc Tháng trên không gian lịch dạy học. |
| 2 | Nút `+ Tạo lịch nghỉ` | Primary button | Action | Mở hộp thoại khai báo kỳ nghỉ chung cho toàn bộ tổ chức hoặc các lớp học được chọn (`FR-selfomy-alignment-008`). |
| 3 | Ô sự kiện nghỉ lễ trên lịch & Nút `Xóa nghỉ lễ` | Calendar event card | Object | Hiển thị rõ nhãn kỳ nghỉ trên lịch và thông tin buổi học đã dời. Nút `Xóa nghỉ lễ` cho phép hoàn tác kỳ nghỉ tương lai (thu hồi buổi bù cuối khóa chưa diễn ra và khôi phục buổi gốc về `Đã lên lịch`). |
| 4 | Ô `Tên kỳ nghỉ lễ *` | Text input | String (`1..120 chars`) | Nhập tên hoặc lý do kỳ nghỉ (ví dụ: *Nghỉ Tết Dương lịch*, *Giáo viên bận công tác*). Trường bắt buộc. |
| 5 | Ô `Từ ngày *` | Date picker | Date | Ngày bắt đầu kỳ nghỉ chung. |
| 6 | Ô `Đến ngày *` | Date picker | Date | Ngày kết thúc kỳ nghỉ chung (`Đến ngày >= Từ ngày`). |
| 7 | Bộ chọn `Phạm vi áp dụng *` | Radio + Multi-select | Enum / UUID[] | Chọn áp dụng cho `Toàn bộ tổ chức` hoặc chọn một/nhiều `Lớp học cụ thể` (`FR-selfomy-alignment-008`). |
| 8 | Bộ chọn `Phương thức xử lý *` | Radio group | Enum | Chọn 1 trong 2 phương thức (`FR-selfomy-alignment-008`):<br/>• **`Dời lịch (+1 buổi vào cuối khóa)`** (mặc định): Tự động đánh dấu buổi trùng là *Nghỉ lễ — Đã dời lịch* và sinh thêm 1 buổi học bù vào cuối lộ trình lớp theo đúng thứ/khung giờ chuẩn (`FR-selfomy-alignment-009`, `BR-selfomy-alignment-003`).<br/>• **`Hủy buổi (không bù)`**: Đánh dấu buổi trùng là *Đã hủy*, không kéo dài ngày kết thúc khóa học. |
| 9 | `Bảng xem trước các buổi học bị ảnh hưởng` | Preview table | Array<Row> | Tính toán tức thì danh sách các buổi học nằm trong khoảng ngày nghỉ trước khi người dùng bấm xác nhận (`BR-selfomy-alignment-003`):<br/>• Hiển thị rõ ngày gốc và ngày học bù mới ở cuối khóa.<br/>• Nếu ngày dự kiến bù ở cuối khóa trùng vào một kỳ nghỉ lễ khác đã khai báo trước đó, thuật toán tự động nhảy sang ngày học hợp lệ kế tiếp và hiển thị chú thích `(*)`.<br/>• Nếu buổi học trong khoảng ngày nghỉ đã được điểm danh (`present`/`excused`/`unexcused`/`late`), hiển thị nhãn `(!) Giữ nguyên — Đã diễn ra` và không tự động dời hay hủy. |
| 10 | Hộp kiểm `Gửi thông báo Email & In-app` | Checkbox | Boolean | Mặc định bật (`checked`). Khi xác nhận tạo lịch nghỉ, hệ thống tự động đẩy sự kiện `Thay đổi lịch học / nghỉ lễ` vào hàng đợi thông báo cho toàn bộ học viên của các lớp bị ảnh hưởng (`FR-selfomy-alignment-010`). |
| 11 | Nút `Hủy bỏ` | Ghost button | Action | Đóng hộp thoại mà không thay đổi lịch học. |
| 12 | Nút `Xác nhận áp dụng & Dời buổi` | Primary button | Action | Thực thi cập nhật lịch học hàng loạt trong một giao dịch cơ sở dữ liệu nguyên tử (`atomic transaction` theo `BR-selfomy-alignment-003`), phát sự kiện thông báo sang màn `[5] notification-logs` và đóng hộp thoại. |

### Screen Actions & Validation Rules

- **Kiểm tra khoảng ngày hợp lệ**: Nếu `Đến ngày < Từ ngày` hoặc không có bất kỳ buổi học nào nằm trong khoảng ngày đã chọn, hệ thống hiển thị cảnh báo inline và khóa nút `[12] Xác nhận áp dụng & Dời buổi`.
- **Liên kết hậu kiểm thông báo**: Sau khi xác nhận thành công, thông báo Toast hiển thị kèm đường dẫn `"Xem trạng thái gửi thông báo ->"` trỏ thẳng tới màn `[5] notification-logs`.

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
