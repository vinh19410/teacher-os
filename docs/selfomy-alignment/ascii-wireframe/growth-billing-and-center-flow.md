# Flow 4: Phòng thi công khai thu Lead, Thuê bao & Ví Credit AI, Nhân sự & Cấp hạn mức Trung tâm (`growth-billing-and-center-flow`)

> Thuộc bộ đặc tả giao diện của tính năng **selfomy-alignment**. Liên kết ngược: [[selfomy-alignment-wireframe-index.md|Wireframe Index]] · [[../srs/selfomy-alignment-userflow.md|User Flow]] · [[../html-wireframe/growth-billing-and-center-flow.html|HTML Wireframe]].

---

## Screen: public-exam-room-config

- **Screen number**: `[8]`
- **Screen name**: Cấu hình Phòng thi ảo công khai & Danh sách khách thi thử
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Giáo vụ / Quản lý học vụ (`Admin/Staff`), Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-021`, `FR-selfomy-alignment-023`
- **Related UC**: [[../usecases/uc-public-exam-lead.md|uc-public-exam-lead]]
- **HTML Wireframe**: [[../html-wireframe/growth-billing-and-center-flow.html|growth-billing-and-center-flow.html#screen-public-exam-room-config]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| PHONG THI AO CONG KHAI & DANH SACH KHACH THI THU (LEAD)     [1] [Mo xem truoc Cong thi thu ->]   |
|--------------------------------------------------------------------------------------------------|
| CAU HINH PHONG THI & TRAN BAO VE CREDIT AI (BR-selfomy-alignment-008):                           |
| [2] Trang thai phong thi: [x] Dang mo cong khai | [3] Link: https://.../public-exams/ielts-thang10|
| [4] De thi ap dung *: [ IELTS Mock Test Thang 10 (4 ky nang) v ]          [Sao chep link]        |
| [5] Tran bao ve kep : Toi da [ 1 ] luot AI/khach VA toi da [ 20 ] Credit AI/ngay/phong thi       |
|     (Da dung hom nay: 14 / 20 Credit AI — Khi cham tran tu dong chuyen bài sang Cho cham tay)    |
|                                                                     [6] [Luu cau hinh phong thi] |
|--------------------------------------------------------------------------------------------------|
| DANH SACH KHACH THI THU (GUEST LEAD)                                                             |
| [7] Tim ten/Email/SDT: [            ] | [8] Trang thai: (Tat ca 24) (Vua dang ky 03)             |
|                                         (Da hoan thanh thi 15) (Da moi vao lop 04) (Hoc vien 02) |
| +----------------------------------------------------------------------------------------------+ |
| | Ho va ten        | Lien he (Email / SDT)     | Ket qua thi thu  | Trang thai     | Thao tac  | |
| |------------------|---------------------------|------------------|----------------|-----------| |
| | Pham Gia Huy     | huy@gmail.com / 0901234567| R:7.0 L:6.5 (W*) | Da thi xong    | [9][Moi]  | |
| | Doan Minh Chau   | chau@yahoo.com/ 0987654321| R:6.0 L:6.0      | Da moi vao lop | [10](eye) | |
| | Vu Hoang Long    | long@gmail.com/ 0912345678| Dang lam bai...  | Vua dang ky    | [10](eye) | |
| +----------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Nút `Mở xem trước Cổng thi thử ->` | Secondary button | Navigation | Mở màn `[9] public-exam-guest-portal` ở chế độ xem trước để giáo viên kiểm tra giao diện phòng thi công khai. |
| 2 | Công tắc `Trạng thái phòng thi` | Toggle switch | Boolean | Bật hoặc tạm đóng đường dẫn phòng thi ảo công khai bất kỳ lúc nào (`FR-selfomy-alignment-021`). |
| 3 | Đường dẫn chia sẻ công khai & Nút `Sao chép link` | Read-only URL + Button | URL | Đường dẫn định danh duy nhất `/public-exams/{slug}` để giáo viên/trung tâm gắn lên mạng xã hội hoặc trang giới thiệu tuyển sinh (`FR-selfomy-alignment-021`). |
| 4 | Bộ chọn `Đề thi áp dụng *` | Select dropdown | UUID | Chọn một đề thi đã xuất bản trong Ngân hàng đề làm đề thi thử đầu vào cho phòng thi công khai. |
| 5 | Khung `Trần bảo vệ kép Credit AI` | Quota configuration + Progress | Integer (`1` & `20`) | Hiển thị và thực thi quy tắc bảo vệ kép (`FR-selfomy-alignment-023`, `BR-selfomy-alignment-008`): giới hạn tối đa **`1 lượt chấm AI / khách`** (theo SĐT/Email) VÀ tối đa **`20 credit / ngày / phòng thi`**. Hiển thị thanh tiến độ số Credit đã tiêu thụ trong ngày. |
| 6 | Nút `Lưu cấu hình phòng thi` | Primary button | Action | Lưu thay đổi trạng thái bật/tắt, đề thi gắn kèm và cấu hình phòng thi trong `<= 2 giây` (`NFR-selfomy-alignment-001`). |
| 7 | Ô tìm kiếm khách thi thử | Search input (debounced) | String | Tìm theo họ tên, địa chỉ Email hoặc số điện thoại của khách thi thử (`debounce 300ms` cập nhật URL `?q=...`). |
| 8 | Nhóm chip lọc trạng thái `GuestLead` | Chip filter group | Enum | Lọc theo vòng đời chuyển đổi khách thi thử (`selfomy-alignment-states.md#State: GuestLead`): `Vừa đăng ký (guest_registered)`, `Đã hoàn thành thi (guest_tested)`, `Đã mời vào lớp (invited)`, `Đã thành học viên (active_student)`. |
| 9 | Nút `Mời` (`Mời vào lớp học`) | Primary action button | Action | Mở hộp thoại chọn lớp học chính thức và gửi lời mời qua Email cho khách thi thử (`FR-selfomy-alignment-021`). Khi khách kích hoạt tài khoản, hệ thống tự động hợp nhất lịch sử bài thi thử vào hồ sơ học viên chính thức (`BR-selfomy-alignment-009`). |
| 10 | Nút `Xem chi tiết bài thi` (`(eye)`) | Icon button | Navigation | Mở chi tiết bài làm của khách thi thử (hoặc chuyển sang màn `[7] ai-grading-review-workspace` nếu bài có phần Writing/Speaking đang chờ duyệt). |

---

## Screen: public-exam-guest-portal

- **Screen number**: `[9]`
- **Screen name**: Cổng Phòng thi thử công khai cho khách vãng lai
- **Application**: `apps/student` (Public Guest Route — không yêu cầu tài khoản đăng nhập trước)
- **Actors**: Khách vãng lai (`Guest Lead`)
- **Related FR**: `FR-selfomy-alignment-022`, `FR-selfomy-alignment-023`, `FR-selfomy-alignment-027`
- **Related UC**: [[../usecases/uc-public-exam-lead.md|uc-public-exam-lead]]
- **HTML Wireframe**: [[../html-wireframe/growth-billing-and-center-flow.html|growth-billing-and-center-flow.html#screen-public-exam-guest-portal]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| PHONG THI THU IELTS CONG KHAI — TRUNG TAM ANH NGU SELFOMY        [1] Dong ho: [ 58:42 ] [Tu luu] |
|==================================================================================================|
| BUOC 1: BIEU MAU DANG KY THONG TIN TRUOC KHI VAO LAM BAI (Bat buoc — FR-selfomy-alignment-022)    |
| +----------------------------------------------------------------------------------------------+ |
| | [2] Ho va ten *: [ Pham Gia Huy          ]  [3] So dien thoai *: [ 0901234567               ]| |
| | [4] Email nhan ket qua chi tiet *: [ giahuy.ielts@gmail.com                                 ]| |
| | [11][x] Toi dong y dieu khoan xu ly du lieu ca nhan & cham bai AI (NFR-006) [5][Bat dau ->] | |
| +----------------------------------------------------------------------------------------------+ |
|--------------------------------------------------------------------------------------------------|
| BUOC 2: KHONG GIAN LAM BAI THI (Tu dong khoi phuc phien thi neu mat mang)                        |
| [6] Tien do: Da tra loi 18 / 40 cau | [7] [Nop bai thi som]                                      |
|--------------------------------------------------------------------------------------------------|
| BUOC 3: MAN HINH KET QUA TUC THI SAU KHI NOP BAI                                                 |
| +----------------------------------------------------------------------------------------------+ |
| | [8] KET QUA TRAC NGHIEM TUC THI: Reading: 7.0 (30/40) | Listening: 6.5 (27/40)               | |
| | [9] Giai thich dap an tu dong (0 credit tu bo nho dem):                                      | |
| |     - Cau 2 (Sai: TRUE -> Dung: NOT GIVEN): Doan 1 dong 4 chi neu du bao chung, khong so sanh| |
| | [10] (info) Thong bao phan thi Writing / Speaking (E-selfomy-alignment-008):                 | |
| |      "Bai lam cua ban da duoc ghi nhan thanh cong! Giao vien se cham chi tiet phan bai       | |
| |       viet/noi va gui ket qua qua Email ban da dang ky."                                     | |
| +----------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Đồng hồ đếm ngược & Nhãn `Tự lưu` | Countdown timer + Status | Time (`MM:SS`) | Đếm ngược thời gian làm bài và hiển thị trạng thái lưu tạm tự động câu trả lời (`Auto-saved`). Nếu khách mất kết nối mạng hoặc tải lại trang, hệ thống khôi phục nguyên trạng câu trả lời và thời gian còn lại; khi đồng hồ về `00:00`, tự động khóa đề và thu bài (`FR-selfomy-alignment-022`). |
| 2 | Ô `Họ và tên *` | Text input | String (`2..80 chars`) | Trường bắt buộc trước khi mở nội dung đề thi (`FR-selfomy-alignment-022`). |
| 3 | Ô `Số điện thoại *` | Tel input | String (`10 digits`, bắt đầu bằng `0`) | Trường bắt buộc dùng làm khóa định danh chống trùng hồ sơ khách tiềm năng (`FR-selfomy-alignment-022`, `BR-selfomy-alignment-008`). |
| 4 | Ô `Email nhận kết quả chi tiết *` | Email input | Email | Trường bắt buộc để nhận thông báo kết quả chấm bài Writing/Speaking và lời mời vào lớp học chính thức (`FR-selfomy-alignment-022`, `BR-selfomy-alignment-009`). |
| 5 | Nút `Bắt đầu làm bài thi ->` | Primary button | Action | Kiểm tra hợp lệ 3 trường thông tin và ô đồng ý dữ liệu `[11]`; nếu Email trùng với Học viên chính thức chưa đăng nhập thì lưu vào `PublicExamAttempt` kèm cờ `matched_student_id` để giáo viên xác nhận hợp nhất (`BR-selfomy-alignment-009`), sau đó mở đề thi và bắt đầu đếm ngược. |
| 6 | Thanh tiến độ câu trả lời | Progress bar | Integer | Hiển thị số câu đã trả lời trên tổng số câu của đề thi. |
| 7 | Nút `Nộp bài thi sớm` | Primary button | Action | Hiển thị hộp thoại xác nhận nộp bài trước khi hết giờ. |
| 8 | Thẻ `Kết quả trắc nghiệm tức thì` | Score summary card | Band Score | Chấm và hiển thị ngay điểm số phần Reading & Listening ngay sau khi nộp bài (`FR-selfomy-alignment-023`). |
| 9 | Khung `Giải thích đáp án tự động` | Accordion list | String | Hiển thị lời giải thích đáp án chi tiết cho từng câu Reading/Listening được lấy tức thì từ bộ nhớ đệm câu hỏi với chi phí `0 credit` (`FR-selfomy-alignment-027`). |
| 10 | Thông báo trạng thái phần thi Writing / Speaking | Info banner | String | Nếu phòng thi còn trong hạn mức trần bảo vệ kép (`1 lượt/khách` & `20 credit/ngày/phòng`), bài được chấm nháp ngầm chờ giáo viên duyệt. Nếu chạm trần bảo vệ kép (`BR-selfomy-alignment-008`, `E-selfomy-alignment-008`), hệ thống vẫn lưu bài an toàn vào danh sách chờ chấm tay (`0 credit`) và hiển thị thông báo thân thiện `E-selfomy-alignment-008`. |
| 11 | Ô đánh dấu `Đồng ý điều khoản xử lý dữ liệu cá nhân *` | Checkbox | Boolean | Bắt buộc tích chọn trước khi bắt đầu làm bài và gửi dữ liệu sang dịch vụ AI bên thứ ba theo Nghị định 13/2023/NĐ-CP (`FR-selfomy-alignment-022`, `NFR-selfomy-alignment-006`). |

---

## Screen: subscription-and-credit-wallet

- **Screen number**: `[10]`
- **Screen name**: Thuê bao, Ví Credit AI & Thanh toán QR (`Shared Screen`)
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-011`, `FR-selfomy-alignment-013`, `FR-selfomy-alignment-014`, `FR-selfomy-alignment-024`, `FR-selfomy-alignment-025`, `FR-selfomy-alignment-026`
- **Related UC**: [[../usecases/uc-subscription-and-center-staff.md|uc-subscription-and-center-staff]]
- **HTML Wireframe**: [[../html-wireframe/growth-billing-and-center-flow.html|growth-billing-and-center-flow.html#screen-subscription-and-credit-wallet]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| THUE BAO, VI CREDIT AI & THANH TOAN QR                                                           |
|--------------------------------------------------------------------------------------------------|
| +-----------------------------------------------+ +--------------------------------------------+ |
| | [1] GOI HIEN TAI: CHUYEN NGHIEP (130 Cr/th)   | | [2] SO DU VI CREDIT AI KHA DUNG: 185 Cr    | |
| |     Trang thai: Dang hoat dong (Het han 25/11)| |   - Credit goi thang (uu tien tru):  85 Cr | |
| |     Chấm nhanh Writing dự phòng: Còn 30/30 bài| |   - Credit nap le Top-up (han 12T): 100 Cr | |
| | [3] [Doi / Gia han goi thue bao thang]        | | [4] [+ Mua goi Top-up 100 Cr (149.000d)]   | |
| +-----------------------------------------------+ +--------------------------------------------+ |
|--------------------------------------------------------------------------------------------------|
| [5] BANG CHON GOI THUE BAO THANG & GOI NAP LE TOP-UP (FR-selfomy-alignment-024):                 |
| (•) Co ban: 200.000d (70 Cr/th)  (•) Chuyen nghiep: 350.000d (130 Cr/th)  (•) Nang cao: 500k(200)|
| (•) Goi Top-up mua them: 149.000d / +100 Credit (Han su dung 12 thang, tru sau Credit goi thang) |
|==================================================================================================|
|                 HOP THOAI: THANH TOAN CHUYEN KHOAN QR TU DONG (Hieu luc: 14:32)                  |
|--------------------------------------------------------------------------------------------------|
| +-----------------------+  [6] Don hang: Goi Top-up +100 Credit AI | So tien *: 149.000 VND      |
| |   [MA VIETQR /        |  [7] Ngan hang: Vietcombank - STK: 1029384756 - CTK: SELFOMY EDU       |
| |    BANK-HUB QR CODE]  |  [8] Noi dung CK dinh danh *: [ TOS884920 ] (Giu nguyen de tu dong +Cr)|
| |                       |  [9] [Tai anh ma QR]  [10] [Sao chep STK & Noi dung CK] (Ho tro Mobile)|
| +-----------------------+  [11] Trang thai: Dang cho nhan tien... (Neu qua 15 phut -> [Tao QR])  |
|--------------------------------------------------------------------------------------------------|
| [12] SO CAI BIEN DONG CREDIT AI (CREDIT LEDGER) — Loc: (Tat ca) (Cap/Nap) (Tam giu) (Khau tru)   |
| +----------------------------------------------------------------------------------------------+ |
| | Thoi gian    | Loai giao dich   | Tac vu / Doi tuong       | Nguoi thuc hien | Bien dong |Du | |
| |--------------|------------------|--------------------------|-----------------|-----------|--| |
| | 26/10 11:20  | Khau tru (Settle)| Nhap de PDF Cam 18 Test 2| Minh Tran (GV)  | -5 Cr     |185| |
| | 26/10 10:05  | Hoan tra (Release| Loi mang khi cham Speaking| He thong tu dong| +2 Cr     |190| |
| +----------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Thẻ `Gói thuê bao hiện tại` | Status card | Object | Hiển thị tên bậc gói (`Dùng thử 0đ / 30 credit`, `Cơ bản 200.000đ / 70 credit`, `Chuyên nghiệp 350.000đ / 130 credit`, `Nâng cao 500.000đ / 200 credit` theo `FR-selfomy-alignment-011`, `FR-selfomy-alignment-024`), ngày hết hạn chu kỳ 30 ngày, trạng thái ân hạn `72 giờ` (`BR-selfomy-alignment-010`) và số lượt **Chấm nhanh Writing dự phòng** còn lại trong tháng (`tối đa 30 bài/tháng` theo `FR-selfomy-alignment-014`). |
| 2 | Thẻ `Số dư Ví Credit AI khả dụng` | Balance card | Integer | Hiển thị tổng số dư khả dụng và tách bạch rõ 2 nguồn theo thứ tự ưu tiên trừ (`BR-selfomy-alignment-002`): **Credit gói tháng** (ưu tiên trừ trước, hết hạn theo chu kỳ gói) và **Credit nạp lẻ Top-up** (hạn `12 tháng`, chỉ trừ khi Credit gói tháng về `0`, ưu tiên lô hết hạn gần nhất trước FEFO). |
| 3 | Nút `Đổi / Gia hạn gói thuê bao tháng` | Primary button | Action | Mở bảng chọn nâng cấp hoặc gia hạn gói thuê bao tháng (`FR-selfomy-alignment-024`). |
| 4 | Nút `+ Mua gói Top-up 100 Cr (149.000đ)` | Secondary button | Action | Mở bảng chọn mua thêm gói Top-up (`149.000đ / 100 credit`, hạn dùng `12 tháng`) bất kỳ lúc nào mà không làm thay đổi ngày hết hạn của gói thuê bao tháng (`FR-selfomy-alignment-024`, `FR-selfomy-alignment-025`). |
| 5 | Bảng chọn gói thuê bao & gói nạp lẻ | Pricing selector | Object[] | Hiển thị rõ 4 bậc gói tháng (`Dùng thử 0đ/30Cr`, `Cơ bản 200.000đ/70Cr`, `Chuyên nghiệp 350.000đ/130Cr`, `Nâng cao 500.000đ/200Cr`) và gói Top-up (`149.000đ/100Cr`). |
| 6 | Thông tin đơn hàng & Số tiền thanh toán | Order summary | Currency (`VND`) | Hiển thị mã đơn thanh toán và số tiền chính xác cần chuyển khoản. |
| 7 | Thông tin tài khoản ngân hàng đích | Read-only text | String | Hiển thị tên ngân hàng, số tài khoản và tên chủ tài khoản khớp với mã VietQR. |
| 8 | `Nội dung chuyển khoản định danh *` | Copyable code badge | String | Mã định danh duy nhất của đơn hàng để cổng `Bank-Hub` đối soát tự động (`FR-selfomy-alignment-024`). Kèm cảnh báo nhắc người dùng giữ nguyên nội dung để tránh rơi vào trạng thái lệch đơn `E-selfomy-alignment-012`. |
| 9 | Nút `Tải ảnh mã QR` | Secondary button | Action | Lưu ảnh mã QR về thiết bị (đặc biệt hữu ích khi giáo viên mở màn `[10]` trên điện thoại `375×812` và cần mở ứng dụng ngân hàng để tải ảnh QR lên thanh toán). |
| 10 | Nút `Sao chép STK & Nội dung CK` | Secondary button | Action | Sao chép nhanh số tài khoản và mã nội dung chuyển khoản vào bộ nhớ tạm. |
| 11 | Trạng thái đơn thanh toán QR (`15 phút`) | Live status indicator | Enum | Tự động lắng nghe kết quả đối soát webhook (`<= 10 giây` theo `NFR-selfomy-alignment-004`). Nếu quá `15 phút` chưa nhận được tiền (`expired`), hiển thị thông báo `E-selfomy-alignment-012` kèm nút **`Tạo mã QR mới`**. Nếu khách chuyển lệch số tiền hoặc tiền về trễ sau 15 phút (`mismatch`), hiển thị thông báo đơn đang chờ Quản trị viên đối soát cộng bù. |
| 12 | Bảng `Sổ cái biến động Credit AI (credit_ledger)` | Audit table | Array<Row> | Liệt kê lịch sử giao dịch bất biến (`FR-selfomy-alignment-013`, lưu trữ tối thiểu `5 năm` theo `NFR-selfomy-alignment-007`): cấp mới, nạp lẻ, tạm giữ (`reserved`), khấu trừ (`settled`), hoàn trả tự động khi lỗi AI (`released`) và điều chỉnh bởi Admin. |

---

## Screen: center-staff-and-quota

- **Screen number**: `[11]`
- **Screen name**: Quản lý Nhân sự Trung tâm, Trần Credit cá nhân & Công cụ Cấp hạn mức Admin
- **Application**: Phân vùng A trên `apps/web` (Chủ trung tâm) · Phân vùng B trên `apps/admin` (Quản trị viên nền tảng)
- **Actors**: Chủ trung tâm (`Owner`), Quản trị viên nền tảng (`Super Admin`)
- **Related FR**: `FR-selfomy-alignment-012`, `FR-selfomy-alignment-029`, `FR-selfomy-alignment-030`, `FR-selfomy-alignment-032`
- **Related UC**: [[../usecases/uc-subscription-and-center-staff.md|uc-subscription-and-center-staff]]
- **HTML Wireframe**: [[../html-wireframe/growth-billing-and-center-flow.html|growth-billing-and-center-flow.html#screen-center-staff-and-quota]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| PHAN VUNG A (apps/web): QUAN LY NHAN SU TRUNG TAM & TRAN CREDIT AI CA NHAN    [1] [+ Moi nhan su]|
|--------------------------------------------------------------------------------------------------|
| [2] Bang phan quyen 4 vai tro & Han muc tran Credit AI ca nhan hang thang (FR-029, FR-030, BR-11)|
| +----------------------------------------------------------------------------------------------+ |
| | Nhan su           | Vai tro (RBAC)      | Lop phu trach    | Da dung / Tran thang | Thao tac | |
| |-------------------|---------------------|------------------|----------------------|----------| |
| | Vinh Tran (Ban)   | Chu trung tam(Owner)| Toan bo to chuc  | 60 Cr / Khong gioi han| —        | |
| | Nguyen Thi Mai    | Giao vu(Admin/Staff)| Toan bo to chuc  | 15 Cr / [ 100 Cr/th ] | [3][Luu] | |
| | Minh Tran         | GV dung lop(Teacher)| IELTS 6.5A, 5.0B | 120 Cr/ [ 150 Cr/th ] | [3][Luu] | |
| | Le Hoang An       | Tro giang (TA)      | IELTS 6.5A       | 50 Cr / [ 50 Cr/th! ] | [3][Luu] | |
| +----------------------------------------------------------------------------------------------+ |
| (info) Quy tac BR-011: Tac vu chu dong (Nhap de PDF) tru vao tran nguoi bam; Cham nhap tu dong   |
|        khi hoc vien nop bai tru vao tran cua Giao vien dung lop phu trach chinh lop do.          |
|==================================================================================================|
| PHAN VUNG B (apps/admin): CONG CU QUAN TRI VIEN CAP GOI / CREDIT & DOI SOAT QR (FR-012)          |
|--------------------------------------------------------------------------------------------------|
| [4] Tim to chuc (Email/Ten/ID): [ Trung tam Anh ngu Selfomy ] -> Goi: Chuyen nghiep | Vi: 245 Cr |
| [5] Don QR lech tien can doi soat (E-012): Don #TOS884112 (Chuyen 240.000d / Goi 250.000d)       |
|--------------------------------------------------------------------------------------------------|
| [6] Thao tac cap han muc: (•) Cong/Tru Credit thu cong   ( ) Kich hoat / Gia han goi thue bao    |
| [7] So luong Credit dieu chinh *: [ +480 ]  | [8] Goi thue bao: [ Giữ nguyên gói hiện tại v ]    |
| [9] Ly do dieu chinh (Bat buoc >= 10 ky tu ghi vao Nhat ky kiem toan bat bien) *:                |
|     [ Doi soat don #TOS884112 khach chuyen khoan 240.000d quy doi 480 Credit                   ] |
|                                                          [10] [Xac nhan cap han muc & Ghi Audit] |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Nút `+ Mời nhân sự` (`apps/web`) | Primary button | Modal trigger | Mở hộp thoại mời nhân sự mới qua Email theo đúng **4 vai trò chuẩn** (`Chủ trung tâm Owner`, `Quản lý / Giáo vụ Admin/Staff`, `Giáo viên đứng lớp Teacher`, `Trợ giảng TA`), gán danh sách lớp phụ trách và đặt trần Credit AI cá nhân hàng tháng (`FR-selfomy-alignment-029`, `FR-selfomy-alignment-030`). |
| 2 | Bảng Nhân sự & Trần Credit AI cá nhân hàng tháng (`apps/web`) | Data table | Array<Row> | Hiển thị họ tên, email, vai trò RBAC, các lớp được phân công, tiến độ sử dụng `Credit đã dùng trong tháng / Hạn mức trần tháng` và ô nhập điều chỉnh trần (`số nguyên >= 0` hoặc `Không giới hạn`) (`FR-selfomy-alignment-030`, `BR-selfomy-alignment-011`). Khi nhân sự chạm `100%` trần tháng (như dòng `Le Hoang An 50/50 Cr`), hệ thống gắn nhãn cảnh báo `(!)` và chặn thao tác gọi AI của nhân sự đó kèm thông báo `E-selfomy-alignment-007`. |
| 3 | Nút `Lưu` (cập nhật quyền & trần nhân sự) | Action button | Action | Lưu thay đổi vai trò, lớp phụ trách và trần Credit AI cá nhân hàng tháng có hiệu lực tức thì mà không bắt nhân sự phải đăng nhập lại (`uc-subscription-and-center-staff.md`). |
| 4 | Ô tìm kiếm tổ chức (`apps/admin`) | Search input | String | Dành riêng cho Quản trị viên nền tảng (`Super Admin`) trên cổng `apps/admin` (`port 8004`) để tra cứu bất kỳ trung tâm/giáo viên nào theo Email, tên hoặc mã tổ chức (`FR-selfomy-alignment-012`). |
| 5 | Danh sách `Đơn QR lệch tiền cần đối soát` (`apps/admin`) | Alert list | Object[] | Hiển thị các đơn thanh toán QR đang ở trạng thái `Cần đối soát (mismatch)` do người dùng chuyển khoản sai số tiền (`FR-selfomy-alignment-024`, `E-selfomy-alignment-012`). |
| 6 | Bộ chọn `Thao tác cấp hạn mức` (`apps/admin`) | Radio group | Enum | Chọn giữa `Cộng/Trừ Credit thủ công` hoặc `Kích hoạt / Gia hạn gói thuê bao tháng` (`FR-selfomy-alignment-012`). |
| 7 | Ô `Số lượng Credit điều chỉnh *` (`apps/admin`) | Signed integer input | Integer (`!= 0`) | Nhập số Credit cộng thêm (`+N`) hoặc thu hồi (`-N`) trực tiếp vào ví của tổ chức. |
| 8 | Bộ chọn `Gói thuê bao` (`apps/admin`) | Select dropdown | Enum | Cho phép kích hoạt hoặc đổi bậc gói thuê bao (`Dùng thử`, `Cơ bản`, `Chuyên nghiệp`, `Nâng cao`) kèm ngày hết hạn mới (`FR-selfomy-alignment-012`). |
| 9 | Ô `Lý do điều chỉnh *` (`apps/admin`) | Textarea | String (`>= 10 chars`) | Trường bắt buộc tối thiểu `10 ký tự` để giải trình căn cứ nghiệp vụ (ví dụ: mã chứng từ chuyển khoản ngân hàng, xử lý đơn lệch tiền, hỗ trợ dùng thử đối tác). Lưu trực tiếp vào bảng sổ cái kiểm toán bất biến (`credit_ledger` / `audit_logs`, `FR-selfomy-alignment-012`, `NFR-selfomy-alignment-007`). |
| 10 | Nút `Xác nhận cấp hạn mức & Ghi Audit` (`apps/admin`) | Primary button | Action | Thực thi cập nhật gói thuê bao/số dư Credit và ghi bản ghi kiểm toán không thể sửa/xóa (`append-only`). |

### Screen Actions & Validation Rules

- **Ràng buộc kiểm toán bắt buộc trên `apps/admin` (`FR-selfomy-alignment-012`)**: Nếu ô `[9] Lý do điều chỉnh` có độ dài `< 10 ký tự` (sau khi cắt khoảng trắng), nút `[10] Xác nhận cấp hạn mức & Ghi Audit` bị khóa hoàn toàn.
- **Tách biệt ranh giới ứng dụng (`apps/web` vs `apps/admin`)**: Phân vùng B chỉ được render và cho phép gọi API khi phiên đăng nhập có quyền `Super Admin` trên cổng `apps/admin`; người dùng thông thường trên `apps/web` chỉ nhìn thấy Phân vùng A (`NFR-selfomy-alignment-005`).

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
