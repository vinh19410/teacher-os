---
type: srs-userflow
feature: selfomy-alignment
updated: 2026-10-26
primary_device: desktop
stage: flow-approved
flow_approved_at: 2026-10-26
flow_hash: "9a7c6b66"
---

# selfomy-alignment — User Flow

> Nguồn chia flow DUY NHẤT cho feature này. `/wireframe-ascii` và `/wireframe-html` đọc file này để biết flow nào gồm những màn nào — KHÔNG tự chia flow riêng.

## 1. User Flow (tổng)

> Phủ happy / error / edge cases. `[n]` = số màn hình đối chiếu Mục 2.

### Flow: daily-ops-and-holiday-flow

```mermaid
flowchart TD
    n1["[1] Bảng điều khiển — Thẻ Việc cần làm hôm nay<br/>(dashboard-reminders)"]
    n2["[2] Điểm danh tổng theo ngày<br/>(daily-attendance)"]
    n3["[3] Lịch học và Hộp thoại Tạo lịch nghỉ chung<br/>(schedule-and-holiday-modal)"]
    n5["[5] Nhật ký gửi thông báo Email và In-app<br/>(notification-logs)"]
    d1{"Chọn thao tác vận hành"}
    d2{"Kiểm tra trạng thái ca học<br/>trong kỳ nghỉ lễ"}
    d3{"Phương thức xử lý lịch nghỉ"}
    d4{"Ngày học bù cuối khóa<br/>có trùng kỳ nghỉ khác?"}
    m1["Mở rộng ca học inline,<br/>chọn Có mặt / Vắng có phép / Vắng không phép / Đi muộn"]
    m2["Lưu điểm danh ca học thành công,<br/>giảm bộ đếm trên Bảng điều khiển"]
    m3["Giữ nguyên ca học đã điểm danh<br/>(không tự động dời hay hủy)"]
    m4["Đánh dấu buổi học Đã hủy,<br/>giữ nguyên ngày kết thúc khóa"]
    m5["Tự động nhảy sang ngày học hợp lệ kế tiếp<br/>theo đúng thứ trong tuần"]
    m6["Hiển thị Bảng xem trước các buổi bị trùng<br/>và ngày học bù mới (+1 buổi)"]
    m7["Xác nhận áp dụng nguyên tử<br/>và đẩy thông báo đổi lịch"]

    n1 -->|"Bấm thẻ Ca học chưa điểm danh"| n2
    n1 -->|"Mở Lịch dạy học"| n3
    n2 -->|"Chọn ngày / lớp / giáo viên"| d1
    d1 -->|"Điểm danh tại chỗ"| m1
    d1 -->|"Chuyển xem Lịch học và Kỳ nghỉ lễ"| n3
    m1 -->|"Bấm Lưu điểm danh ca học"| m2
    n3 -->|"Bấm Tạo lịch nghỉ chung"| d2
    d2 -->|"Ca học đã điểm danh trước đó"| m3
    d2 -->|"Ca học chưa diễn ra"| d3
    d3 -->|"Chọn Hủy buổi"| m4
    d3 -->|"Chọn Dời lịch (+1 buổi)"| d4
    d4 -->|"Trùng kỳ nghỉ lễ khác"| m5
    d4 -->|"Không trùng"| m6
    m5 -->|"Cập nhật ngày bù hợp lệ"| m6
    m4 -->|"Xem trước danh sách hủy"| m7
    m6 -->|"Bấm Xác nhận áp dụng"| m7
    m7 -->|"Phát sự kiện thông báo đổi lịch"| n5

    classDef happy fill:#d4edda,stroke:#28a745
    classDef error fill:#f8d7da,stroke:#dc3545
    classDef edge fill:#fff3cd,stroke:#ffc107

    class n1,n2,n3,m1,m2,m6,m7 happy
    class m3,m4,m5,n5 edge
```

### Flow: debt-and-notification-flow

```mermaid
flowchart TD
    n1["[1] Bảng điều khiển — Thẻ Việc cần làm hôm nay<br/>(dashboard-reminders)"]
    n4["[4] Sổ công nợ học viên<br/>(student-debt-ledger)"]
    n5["[5] Nhật ký gửi thông báo Email và In-app<br/>(notification-logs)"]
    d1{"Kiểm tra phân quyền vai trò"}
    d2{"Chọn thao tác trên Sổ công nợ"}
    d3{"Kiểm tra số tiền thực thu"}
    d4{"Kết quả gửi Email tự động<br/>(tối đa 3 lần thử)"}
    e1["Ẩn chức năng tài chính đối với Trợ giảng (TA)"]
    e2["Báo lỗi inline: Số tiền thu phải > 0<br/>và <= Số tiền còn nợ"]
    e3["Gắn nhãn đỏ Lỗi gửi (failed)<br/>kèm nguyên nhân lỗi (E-selfomy-alignment-010)"]
    m1["Cập nhật trạng thái công nợ,<br/>tính lại 3 thẻ KPI tức thì"]
    m2["Đưa thông báo nhắc học phí<br/>vào hàng đợi (queued)"]
    m3["Ghi nhận trạng thái Đã gửi (sent)<br/>và Đã đọc (read)"]

    n1 -->|"Bấm thẻ Học phí đến hạn / quá hạn"| d1
    d1 -->|"Trợ giảng (TA)"| e1
    d1 -->|"Giáo viên độc lập / Giáo vụ / Chủ trung tâm"| n4
    n4 -->|"Lọc học viên Sắp đến hạn / Quá hạn"| d2
    d2 -->|"Bấm Ghi nhận thu tiền"| d3
    d3 -->|"Số tiền <= 0 hoặc > Số tiền còn nợ"| e2
    e2 -.->|"Nhập lại số tiền hợp lệ"| n4
    d3 -->|"Hợp lệ (thu 1 phần hoặc toàn bộ)"| m1
    d2 -->|"Bấm Gửi nhắc học phí"| m2
    m2 -->|"Chuyển phát qua Email và In-app"| d4
    d4 -->|"Thành công"| m3
    d4 -->|"Thất bại sau 3 lần thử"| e3
    m3 -->|"Tra cứu lịch sử"| n5
    e3 -->|"Hiển thị dòng lỗi trên nhật ký"| n5
    n5 -.->|"Bấm nút Gửi lại (Retry)"| m2

    classDef happy fill:#d4edda,stroke:#28a745
    classDef error fill:#f8d7da,stroke:#dc3545
    classDef edge fill:#fff3cd,stroke:#ffc107

    class n1,n4,n5,m1,m2,m3 happy
    class e2,e3 error
    class e1 edge
```

### Flow: ai-teaching-assistant-flow

```mermaid
flowchart TD
    n1["[1] Bảng điều khiển — Thẻ Việc cần làm hôm nay<br/>(dashboard-reminders)"]
    n6["[6] Không gian Nhập đề thi từ PDF/Ảnh bằng AI<br/>(ai-exam-import-workspace)"]
    n7["[7] Không gian Rà soát chấm bài AI 4 kỹ năng<br/>(ai-grading-review-workspace)"]
    n10["[10] Thuê bao, Ví Credit AI và Thanh toán QR<br/>(subscription-and-credit-wallet)"]
    n11["[11] Quản lý Nhân sự Trung tâm và Trần Credit cá nhân<br/>(center-staff-and-quota)"]
    d1{"Kiểm tra tệp tải lên<br/>(<= 15 MB, <= 20 trang, không mật khẩu)"}
    d2{"Kiểm tra mã băm tệp<br/>có trùng đề đã trích xuất?"}
    d3{"Kiểm tra Ví Credit (>= 5 credit)<br/>và Trần cá nhân nhân sự"}
    d4{"Kết quả bóc tách AI (<= 120s)"}
    d5{"Loại bài nộp và kiểm tra điều kiện<br/>(Writing 1 credit / Speaking 2 credit)"}
    d6{"Vai trò người rà soát trên màn [7]"}
    d7{"Kiểm tra trần 100 lượt AI nhẹ/ngày<br/>(Chat AI / Tạo bài tập nhanh)"}
    e1["Chặn tải lên và báo lỗi tệp không hợp lệ<br/>(E-selfomy-alignment-003)"]
    e2["Báo chạm trần Credit cá nhân (E-selfomy-alignment-007)<br/>hoặc hết Credit chính (E-selfomy-alignment-001)"]
    e3["Giải tỏa 5 credit tạm giữ về ví,<br/>báo lỗi dịch vụ AI (E-selfomy-alignment-004)"]
    e4["Không gọi AI, không trừ Credit:<br/>Gắn nhãn bản thu < 15 từ (E-selfomy-alignment-009)"]
    e5["Hết cả 30 lượt Chấm nhanh Writing:<br/>Chuyển Chờ chấm tay (E-selfomy-alignment-002)"]
    e6["Chặn ghi đè khi xung đột phiên bản điểm chấm<br/>(E-selfomy-alignment-011)"]
    ed1["Mở lại bản đề nháp cũ đã bóc tách<br/>với chi phí 0 credit (BR-selfomy-alignment-005)"]
    ed2["Hạ cấp mềm sang Chấm nhanh Writing<br/>(<= 30 bài/tháng, 0 credit, BR-selfomy-alignment-007)"]
    ed3["Hộp thoại chọn chờ qua 00:00 hôm sau<br/>hoặc xác nhận trừ 0,5 credit/lượt (E-selfomy-alignment-005)"]
    m1["Tạm giữ 5 credit, bóc tách thành công,<br/>khấu trừ 5 credit và mở đối chiếu 2 cột"]
    m2["Rà soát câu nhãn vàng Cần rà soát lại<br/>và Lưu vào Ngân hàng đề"]
    m3["Hiển thị bài chấm nháp AI (ai_drafted)<br/>kèm nhãn giới hạn phát âm Speaking"]
    m4["Trợ giảng (TA) lưu nháp rà soát (teacher_reviewing),<br/>khóa nút Chốt trả bài"]
    m5["Giáo viên / Chủ trung tâm bấm Chốt trả bài (published),<br/>mở khóa điểm cho học viên"]

    n6 -->|"Tải tệp PDF / JPG / PNG"| d1
    d1 -->|"Vượt 15 MB / 20 trang / có mật khẩu"| e1
    d1 -->|"Hợp lệ"| d2
    d2 -->|"Trùng tệp đề đã có"| ed1
    ed1 -->|"Chỉnh sửa miễn phí"| m2
    d2 -->|"Tệp mới"| d3
    d3 -->|"Chạm trần nhân sự"| e2
    d3 -->|"Hết Credit ví tổ chức"| e2
    e2 -->|"Nạp thêm Credit"| n10
    e2 -->|"Xin nâng trần cá nhân"| n11
    d3 -->|"Đủ 5 credit và còn trần"| d4
    d4 -->|"Lỗi hoặc quá hạn 120s"| e3
    e3 -.->|"Bấm Thử lại"| d4
    d4 -->|"Thành công <= 120s"| m1
    m1 -->|"Tích xác nhận câu độ tự tin thấp"| m2

    n1 -->|"Bấm thẻ Bài tập quá hạn chấm"| n7
    n7 -->|"Tiếp nhận bài nộp Writing / Speaking"| d5
    d5 -->|"Speaking < 15 từ hoặc rỗng"| e4
    d5 -->|"Ví = 0 credit nhưng còn 30 lượt Writing"| ed2
    d5 -->|"Ví = 0 credit và hết 30 lượt Writing"| e5
    e5 -->|"Nạp thêm Credit"| n10
    d5 -->|"Đủ Credit và hợp lệ"| m3
    ed2 -->|"Gắn nhãn Bản nháp chấm nhanh"| m3
    e4 -->|"Chấm tay hoặc yêu cầu nộp lại"| m3
    m3 -->|"Người dùng chỉnh sửa lời phê"| d6
    d6 -->|"Xung đột lưu đè đồng thời"| e6
    e6 -.->|"Tải lại phiên bản mới nhất"| n7
    d6 -->|"Trợ giảng (TA)"| m4
    m4 -->|"Chuyển Giáo viên đứng lớp duyệt"| m5
    d6 -->|"Giáo viên / Chủ trung tâm"| m5

    n7 -->|"Mở Khung Trợ giảng Chat AI / Tạo bài tập nhanh"| d7
    d7 -->|"Trong 100 lượt miễn phí/ngày"| n7
    d7 -->|"Vượt 100 lượt/ngày hoặc chọn Phân tích sâu"| ed3

    classDef happy fill:#d4edda,stroke:#28a745
    classDef error fill:#f8d7da,stroke:#dc3545
    classDef edge fill:#fff3cd,stroke:#ffc107

    class n1,n6,n7,m1,m2,m3,m5 happy
    class e1,e2,e3,e4,e5,e6 error
    class n10,n11,ed1,ed2,ed3,m4 edge
```

### Flow: growth-billing-and-center-flow

```mermaid
flowchart TD
    n8["[8] Cấu hình Phòng thi ảo công khai và Danh sách khách thi thử<br/>(public-exam-room-config)"]
    n9["[9] Cổng Phòng thi thử công khai cho khách vãng lai<br/>(public-exam-guest-portal)"]
    n10["[10] Thuê bao, Ví Credit AI và Thanh toán QR<br/>(subscription-and-credit-wallet)"]
    n11["[11] Quản lý Nhân sự Trung tâm, Trần Credit cá nhân và Admin<br/>(center-staff-and-quota)"]
    n7["[7] Không gian Rà soát chấm bài AI 4 kỹ năng<br/>(ai-grading-review-workspace)"]
    d1{"Khách điền Họ tên + Email + SĐT<br/>trước khi vào thi"}
    d2{"Kiểm tra trần bảo vệ kép AI<br/>(1 lượt/khách và 20 credit/ngày/phòng)"}
    d3{"Trạng thái đơn thanh toán QR<br/>(hiệu lực 15 phút)"}
    d4{"Chu kỳ thuê bao 30 ngày"}
    ed1["Gắn lượt thi vào hồ sơ sẵn có<br/>nếu trùng SĐT / Email (BR-selfomy-alignment-009)"]
    ed2["Tự lưu tạm khi mất mạng và<br/>tự động thu bài khi đồng hồ về 00:00"]
    ed3["Lưu bài Writing/Speaking vào chờ chấm tay (0 credit),<br/>hiện thông báo thân thiện (E-selfomy-alignment-008)"]
    ed4["Vào 3 ngày ân hạn (grace_period 72h):<br/>Hiện cảnh báo vàng, vẫn dùng được Credit dư"]
    e1["Đơn QR quá hạn 15 phút (expired):<br/>Bấm tạo mã QR mới (E-selfomy-alignment-012)"]
    e2["Chuyển khoản lệch số tiền (mismatch):<br/>Chuyển Admin đối soát (E-selfomy-alignment-012)"]
    e3["Hết hạn sau 72h (expired):<br/>Khóa mềm AI (E-selfomy-alignment-006), giữ nguyên lớp học"]
    m1["Hiển thị điểm Reading/Listening tức thì<br/>kèm giải thích lưu đệm (0 credit)"]
    m2["Chấm nháp AI Writing/Speaking cho khách<br/>và đẩy về màn [7] chờ giáo viên duyệt"]
    m3["Giáo viên bấm Mời vào lớp học trên màn [8],<br/>hợp nhất lịch sử thi thử vào hồ sơ chính thức"]
    m4["Webhook Bank-Hub xác nhận khớp tiền:<br/>Tự động kích hoạt gói / cộng Credit <= 10s"]
    m5["Chủ trung tâm mời nhân sự 4 vai trò<br/>và đặt trần Credit AI cá nhân/tháng trên màn [11]"]

    n8 -->|"Bật link công khai và đặt trần 20 credit/ngày"| n9
    n9 -->|"Khách truy cập link công khai"| d1
    d1 -->|"Trùng SĐT / Email trong tổ chức"| ed1
    d1 -->|"Khách mới"| ed2
    ed1 -->|"Vào làm bài thi có đếm ngược"| ed2
    ed2 -->|"Nộp bài Reading / Listening"| m1
    ed2 -->|"Nộp bài Writing / Speaking"| d2
    d2 -->|"Chạm trần 1 lượt/khách hoặc 20 credit/ngày"| ed3
    d2 -->|"Còn hạn mức trần và còn Credit"| m2
    m1 -->|"Đồng bộ kết quả về danh sách Lead"| n8
    ed3 -->|"Đẩy bài vào danh sách chờ chấm tay"| n7
    m2 -->|"Đẩy bài nháp AI về giáo viên duyệt"| n7
    n8 -->|"Bấm Mời vào lớp học"| m3

    n10 -->|"Chọn gói thuê bao hoặc Top-up -> Sinh mã QR"| d3
    d3 -->|"Khớp số tiền và nội dung trong 15 phút"| m4
    d3 -->|"Quá 15 phút chưa thanh toán"| e1
    e1 -.->|"Tạo mã QR mới"| n10
    d3 -->|"Chuyển khoản lệch số tiền"| e2
    e2 -->|"Admin kiểm tra và cộng bù có ghi lý do"| n11

    m4 -->|"Theo dõi chu kỳ thuê bao"| d4
    d4 -->|"Còn hạn hoạt động (active)"| m5
    d4 -->|"Quá hạn 30 ngày"| ed4
    ed4 -->|"Thanh toán trong 72h"| m4
    ed4 -->|"Quá 72h chưa thanh toán"| e3
    e3 -->|"Mở màn [10] gia hạn"| n10

    n11 -->|"Phân quyền RBAC và đặt trần Credit nhân sự"| m5

    classDef happy fill:#d4edda,stroke:#28a745
    classDef error fill:#f8d7da,stroke:#dc3545
    classDef edge fill:#fff3cd,stroke:#ffc107

    class n8,n9,n10,n11,m1,m2,m3,m4,m5 happy
    class e1,e2,e3 error
    class n7,ed1,ed2,ed3,ed4 edge
```

## 2. Danh sách màn hình

> Cột `Slug` = định danh máy-đọc DUY NHẤT của màn (khớp `## Screen: {slug}` bên wireframe + node KG). `[#]` chỉ để đối chiếu Mục 1/3.5.

| [#] | Slug | Màn hình | Mục đích | Thuộc flow |
|-----|------|----------|----------|------------|
| 1 | `dashboard-reminders` | Bảng điều khiển — Thẻ Việc cần làm hôm nay | Hiển thị 3 thẻ nhắc việc có bộ đếm (`Ca học hôm nay chưa điểm danh`, `Bài tập quá hạn chấm > 24h`, `Học phí đến hạn / quá hạn thu`), thanh cảnh báo ân hạn thuê bao và điều hướng 1 chạm (`Shared Screen`) | `daily-ops-and-holiday-flow` |
| 2 | `daily-attendance` | Điểm danh tổng theo ngày | Lọc ca học trong ngày qua URL params, mở rộng danh sách học viên inline tại chỗ để đánh dấu 4 trạng thái điểm danh và lưu ghi chú học vụ | `daily-ops-and-holiday-flow` |
| 3 | `schedule-and-holiday-modal` | Lịch học & Hộp thoại Tạo lịch nghỉ chung | Khai báo kỳ nghỉ lễ, chọn `Hủy buổi` hoặc `Dời lịch (+1 buổi)` kèm bảng xem trước các buổi bị trùng và ngày học bù cuối khóa (tự nhảy qua kỳ nghỉ lễ trùng) | `daily-ops-and-holiday-flow` |
| 4 | `student-debt-ledger` | Sổ công nợ học viên | Thống kê 3 thẻ KPI công nợ, lọc học viên theo trạng thái nợ, ghi nhận thu tiền một phần/toàn bộ và kích hoạt gửi thông báo nhắc học phí | `debt-and-notification-flow` |
| 5 | `notification-logs` | Nhật ký gửi thông báo Email + In-app | Tra cứu lịch sử chuyển phát của 4 sự kiện thông báo chính (`Đang chờ`, `Đã gửi`, `Lỗi gửi`, `Đã đọc`) và bấm `Gửi lại` cho các bản ghi lỗi (`Shared Screen`) | `debt-and-notification-flow` |
| 6 | `ai-exam-import-workspace` | Không gian Nhập đề thi từ PDF/Ảnh bằng AI | Tải tệp PDF/ảnh (`<= 15 MB`, `<= 20 trang`), kiểm tra chống trùng đề (`0 credit`), tạm giữ `5 credit` bóc tách AI và đối chiếu 2 cột (tài liệu gốc ↔ cây câu hỏi có nhãn vàng `Cần rà soát lại`) | `ai-teaching-assistant-flow` |
| 7 | `ai-grading-review-workspace` | Không gian Rà soát chấm bài AI 4 kỹ năng & Trợ giảng Chat AI | Đối chiếu 2 cột bài làm Writing/Speaking và điểm nháp AI 4 tiêu chí (kèm nhãn giới hạn phát âm Speaking, nhãn `Bản nháp chấm nhanh`), khung `Trợ giảng Chat AI` (`100 lượt miễn phí/ngày`), nút `Lưu nháp` (cho TA) và nút `Chốt trả bài` (cho Giáo viên/Chủ trung tâm) | `ai-teaching-assistant-flow` |
| 8 | `public-exam-room-config` | Cấu hình Phòng thi ảo công khai & Danh sách khách thi thử | Bật/tắt đường dẫn phòng thi công khai, cấu hình trần bảo vệ kép (`1 lượt/khách` & `20 credit/ngày/phòng`), quản lý danh sách `GuestLead` và mời vào lớp học chính thức | `growth-billing-and-center-flow` |
| 9 | `public-exam-guest-portal` | Cổng Phòng thi thử công khai cho khách vãng lai | Biểu mẫu thu thập Họ tên + Email + SĐT bắt buộc trước khi thi, giao diện làm bài tự lưu tạm khi mất mạng và màn hình kết quả Reading/Listening tức thì (kèm giải thích lưu đệm `0 credit`) | `growth-billing-and-center-flow` |
| 10 | `subscription-and-credit-wallet` | Thuê bao, Ví Credit AI & Thanh toán QR | Quản lý gói thuê bao tháng (`3 ngày ân hạn`), số dư Ví Credit, sinh mã QR thanh toán tự động hiệu lực `15 phút` (hỗ trợ tải QR/sao chép STK trên mobile) và sổ cái biến động Credit (`Shared Screen`) | `growth-billing-and-center-flow` |
| 11 | `center-staff-and-quota` | Quản lý Nhân sự Trung tâm, Trần Credit cá nhân & Công cụ Admin | Phân vùng Chủ trung tâm (`apps/web`): mời nhân sự 4 vai trò, gán lớp và đặt hạn mức trần Credit AI cá nhân hàng tháng; Phân vùng Quản trị viên nền tảng (`apps/admin`): kích hoạt gói, cộng/trừ Credit có ghi lý do kiểm toán và đối soát đơn QR lệch tiền | `growth-billing-and-center-flow` |

## 3. Danh sách flow

| Flow-slug | Tên flow | Màn hình gồm | Cases phủ |
|-----------|----------|--------------|-----------|
| `daily-ops-and-holiday-flow` | Vận hành lịch dạy, Điểm danh tổng & Nghỉ lễ tự động dời buổi | `dashboard-reminders`, `daily-attendance`, `schedule-and-holiday-modal` | happy (điểm danh inline 1 chạm, tạo lịch nghỉ dời `+1 buổi`), edge (chọn `Hủy buổi`, nhảy qua kỳ nghỉ lễ trùng ở cuối khóa, giữ nguyên ca học đã điểm danh, hoàn tác lịch nghỉ) |
| `debt-and-notification-flow` | Sổ công nợ học viên & Nhật ký gửi thông báo đa kênh | `dashboard-reminders`, `student-debt-ledger`, `notification-logs` | happy (thu học phí 1 phần/toàn bộ, gửi nhắc học phí Email + In-app), error (số tiền thu `<= 0` hoặc vượt nợ, lỗi gửi Email sau 3 lần thử `E-selfomy-alignment-010` và bấm `Gửi lại`), edge (ẩn màn tài chính với Trợ giảng `TA`) |
| `ai-teaching-assistant-flow` | Nhập đề PDF/Ảnh bằng AI, Rà soát chấm bài AI 4 kỹ năng & Trợ giảng Chat AI | `ai-exam-import-workspace`, `ai-grading-review-workspace` | happy (nhập đề PDF `5 credit` đối chiếu 2 cột, chấm nháp Writing `1 credit` / Speaking `2 credit` và Giáo viên bấm `Chốt trả bài`, dùng `Trợ giảng Chat AI` trong `100 lượt/ngày`), error (tệp `> 15 MB`/`> 20 trang` `E-003`, lỗi AI hoàn trả Credit `E-004`, hết Credit `E-001`/`E-002`, bản thu `< 15 từ` `E-009`, chạm trần nhân sự `E-007`, xung đột lưu đè `E-011`), edge (mở lại đề trùng `0 credit`, hạ cấp `30 lượt Chấm nhanh Writing/tháng`, vượt `100 lượt AI nhẹ/ngày` `0,5 credit/lượt`, khóa nút `Chốt trả bài` với `TA`, thu gọn 2 cột thành 2 Tab trên mobile/tablet) |
| `growth-billing-and-center-flow` | Phòng thi công khai thu Lead, Thuê bao & Ví Credit AI, Nhân sự & Cấp hạn mức Trung tâm | `public-exam-room-config`, `public-exam-guest-portal`, `subscription-and-credit-wallet`, `center-staff-and-quota` | happy (khách điền thông tin thi thử → xem điểm Reading/Listening → Giáo viên mời vào lớp hợp nhất hồ sơ, thanh toán QR kích hoạt gói/Top-up `<= 10s`, mời nhân sự 4 vai trò & đặt trần Credit cá nhân/tháng), error (đơn QR quá hạn `15 phút` hoặc lệch tiền chờ Admin đối soát `E-012`, hết hạn sau `72h` ân hạn khóa mềm AI `E-006`), edge (hợp nhất Lead trùng SĐT/Email, khôi phục phiên thi khi mất mạng & tự thu bài ở `00:00`, chạm trần bảo vệ kép `1 lượt/khách` hoặc `20 credit/ngày` chuyển chờ chấm tay `E-008`, `3 ngày ân hạn` `grace_period`) |

## 3.5. Chuyển màn (transitions)

> Nguồn DUY NHẤT cho chuyển màn màn→màn (edge NAVIGATES_TO). `/wireframe-html` + `/prototype-html` đọc bảng này để nối nút/điều hướng — KHÔNG tự suy lại từ prose/mermaid (tránh 3 nơi maintain lệch nhau). 1 dòng = 1 chuyển; đủ phủ happy + error + edge của Mục 1.

| Từ màn [#] | Đến màn [#] | Trigger | Điều kiện |
|-----------|------------|---------|-----------|
| Bảng điều khiển [1] | Điểm danh tổng theo ngày [2] | Bấm thẻ "Ca học hôm nay chưa điểm danh" | Có ca học trong ngày ở trạng thái chưa điểm danh |
| Bảng điều khiển [1] | Sổ công nợ học viên [4] | Bấm thẻ "Học phí đến hạn / quá hạn thu" | Người dùng thuộc vai trò Giáo viên độc lập, Giáo vụ hoặc Chủ trung tâm |
| Bảng điều khiển [1] | Không gian Rà soát chấm bài AI [7] | Bấm thẻ "Bài tập quá hạn chấm > 24h" | Có bài nộp ở trạng thái chờ chấm hoặc AI đã chấm nháp quá 24 giờ |
| Bảng điều khiển [1] | Thuê bao, Ví Credit AI & Thanh toán QR [10] | Bấm nút "Gia hạn ngay / Nạp thêm Credit" trên thanh cảnh báo | Tổ chức đang trong 3 ngày ân hạn (`grace_period`) hoặc số dư Credit thấp |
| Điểm danh tổng theo ngày [2] | Lịch học & Hộp thoại Tạo lịch nghỉ chung [3] | Bấm nút chuyển xem "Lịch học & Kỳ nghỉ lễ" | Người dùng cần kiểm tra lịch tuần/tháng hoặc khai báo kỳ nghỉ chung |
| Lịch học & Hộp thoại Tạo lịch nghỉ chung [3] | Nhật ký gửi thông báo [5] | Bấm liên kết "Xem trạng thái thông báo đổi lịch" sau khi xác nhận kỳ nghỉ | Đã xác nhận tạo lịch nghỉ chung và phát sự kiện thông báo hàng loạt |
| Sổ công nợ học viên [4] | (giữ nguyên) [4] | Bấm "Lưu phiếu thu" trong hộp thoại Ghi nhận thu tiền | Số tiền nhập `<= 0` hoặc vượt quá `Số tiền còn nợ` → báo lỗi inline |
| Sổ công nợ học viên [4] | Nhật ký gửi thông báo [5] | Bấm "Gửi nhắc học phí" rồi chọn "Xem nhật ký gửi" | Đã chọn ít nhất 1 học viên có khoản nợ sắp đến hạn hoặc quá hạn |
| Nhật ký gửi thông báo [5] | (giữ nguyên) [5] | Bấm nút "Gửi lại" trên dòng thông báo lỗi | Bản ghi có trạng thái `Lỗi gửi (failed)` (`E-selfomy-alignment-010`) → đưa về `Đang chờ (queued)` |
| Không gian Nhập đề thi từ PDF/Ảnh bằng AI [6] | (giữ nguyên) [6] | Tải tệp PDF/Ảnh lên hoặc bấm "Lưu vào Ngân hàng đề" | Tệp hợp lệ (`<= 15 MB`, `<= 20 trang`) hoặc mở lại bản đề nháp trùng (`0 credit`) |
| Không gian Nhập đề thi từ PDF/Ảnh bằng AI [6] | Thuê bao, Ví Credit AI & Thanh toán QR [10] | Bấm nút "Nạp thêm Credit" trên thông báo lỗi `E-selfomy-alignment-001` | Ví Credit của tổ chức `< 5 credit` không đủ để tạm giữ |
| Không gian Nhập đề thi từ PDF/Ảnh bằng AI [6] | Quản lý Nhân sự Trung tâm & Trần Credit cá nhân [11] | Bấm nút "Xem hạn mức cá nhân / Liên hệ Chủ trung tâm" (`E-selfomy-alignment-007`) | Nhân sự đã dùng hết hạn mức trần Credit AI cá nhân trong tháng |
| Không gian Rà soát chấm bài AI [7] | (giữ nguyên) [7] | Bấm "Lưu bản nháp rà soát" hoặc "Chốt trả bài" hoặc mở "Trợ giảng Chat AI" | Trợ giảng lưu nháp (`teacher_reviewing`) hoặc Giáo viên đứng lớp bấm `Chốt trả bài` (`published`) |
| Không gian Rà soát chấm bài AI [7] | Nhật ký gửi thông báo [5] | Bấm "Xem trạng thái thông báo trả bài" sau khi bấm `Chốt trả bài` | Bài làm vừa chuyển sang trạng thái `Đã trả kết quả (published)` |
| Không gian Rà soát chấm bài AI [7] | Thuê bao, Ví Credit AI & Thanh toán QR [10] | Bấm nút "Nạp thêm Credit" trên thông báo `E-selfomy-alignment-001` / `E-selfomy-alignment-002` | Hết sạch cả Credit chính lẫn 30 lượt Chấm nhanh Writing trong tháng |
| Cấu hình Phòng thi ảo công khai [8] | Cổng Phòng thi thử công khai cho khách vãng lai [9] | Bấm nút "Mở xem trước Cổng phòng thi công khai" | Phòng thi công khai đang ở trạng thái bật |
| Cổng Phòng thi thử công khai cho khách vãng lai [9] | Cấu hình Phòng thi ảo công khai [8] | Khách vãng lai hoàn tất biểu mẫu thông tin và bấm "Nộp bài thi" | Hệ thống đồng bộ hồ sơ `GuestLead` và điểm Reading/Listening về danh sách quản lý |
| Cổng Phòng thi thử công khai cho khách vãng lai [9] | Không gian Rà soát chấm bài AI [7] | Khách nộp phần thi Writing/Speaking trong phòng thi công khai | Chuyển vào hàng đợi chấm nháp AI hoặc chờ chấm tay (`E-selfomy-alignment-008` khi chạm trần) |
| Cấu hình Phòng thi ảo công khai [8] | Nhật ký gửi thông báo [5] | Bấm nút "Mời vào lớp học" tại dòng khách thi thử | Hệ thống gửi Email lời mời kích hoạt tài khoản học viên chính thức |
| Thuê bao, Ví Credit AI & Thanh toán QR [10] | (giữ nguyên) [10] | Chọn gói thuê bao/Top-up để mở hộp thoại QR hoặc bấm "Tạo mã QR mới" | Đơn thanh toán QR trong hạn `15 phút` hoặc tạo lại khi quá hạn (`E-selfomy-alignment-012`) |
| Thuê bao, Ví Credit AI & Thanh toán QR [10] | Quản lý Nhân sự Trung tâm & Công cụ Admin [11] | Đơn thanh toán QR bị lệch số tiền (`mismatch` — `E-selfomy-alignment-012`) | Đẩy sang danh sách "Cần đối soát" trên công cụ Quản trị viên nền tảng |
| Quản lý Nhân sự Trung tâm & Trần Credit cá nhân [11] | (giữ nguyên) [11] | Mời nhân sự mới, cập nhật trần Credit AI cá nhân/tháng hoặc Admin cấp hạn mức | Chủ trung tâm (`apps/web`) hoặc Quản trị viên nền tảng (`apps/admin`) lưu thay đổi |

## 4. Open Questions

- [x] `OQ-1`: Đã chốt tại `selfomy-alignment-spec.md` — Giữ nguyên quy định tự động chấm nháp ngầm (`ai_drafted`) khi học viên nộp bài Writing/Speaking, nhưng bắt buộc ẩn kết quả cho đến khi Giáo viên bấm **"Chốt trả bài"** (`BR-selfomy-alignment-001`).
- [x] `OQ-2`: Đã chốt tại `selfomy-alignment-spec.md` — Hỗ trợ đặt **Hạn mức trần Credit AI cá nhân hàng tháng** cho từng nhân sự ngay trên màn `[11] center-staff-and-quota` (`FR-selfomy-alignment-030`, `BR-selfomy-alignment-011`).

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
