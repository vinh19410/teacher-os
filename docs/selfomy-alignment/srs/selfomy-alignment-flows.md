---
type: srs-flows
feature: selfomy-alignment
updated: 2026-10-26
---

# selfomy-alignment — Flows

## Flow: Điểm danh tổng theo ngày & Tạo lịch nghỉ chung tự động dời buổi
**Trigger**: Giáo viên / Giáo vụ mở Bảng điều khiển nhắc việc để điểm danh các lớp trong ngày hoặc mở Lịch dạy tạo Lịch nghỉ chung (`uc-daily-attendance-and-holiday`).
**Related UC**: [[../usecases/uc-daily-attendance-and-holiday.md|uc-daily-attendance-and-holiday]]
**Related FR**: FR-selfomy-alignment-001, FR-selfomy-alignment-004, FR-selfomy-alignment-005, FR-selfomy-alignment-006, FR-selfomy-alignment-007, FR-selfomy-alignment-008

```mermaid
sequenceDiagram
    actor Staff as Giáo viên / Giáo vụ
    participant Sys as Hệ thống Teacher OS
    participant EmailSvc as Dịch vụ gửi Email
    actor Student as Học viên chính thức

    Staff->>Sys: Mở Bảng điều khiển (Dashboard)
    Sys-->>Staff: Hiển thị thẻ Bài chờ chấm và Lớp chưa điểm danh (FR-selfomy-alignment-004)
    Staff->>Sys: Mở Điểm danh theo ngày và đánh dấu điểm danh hàng loạt
    Sys-->>Staff: Lưu hoàn tất điểm danh các lớp trong ngày (FR-selfomy-alignment-005)

    Staff->>Sys: Mở Lịch dạy -> Tạo Lịch nghỉ chung (nhập ngày, chọn Dời lịch +1 buổi)
    Sys-->>Staff: Hiển thị danh sách buổi học bị trùng và ngày dự kiến bù cuối khóa (FR-selfomy-alignment-007)
    Staff->>Sys: Xác nhận áp dụng Lịch nghỉ chung
    Sys->>Sys: Chuyển buổi trùng sang Nghỉ lễ, sinh bù +1 buổi cuối khóa (BR-selfomy-alignment-003)
    Sys->>Student: Tạo thông báo In-app đổi lịch học (FR-selfomy-alignment-001)
    Sys->>EmailSvc: Gửi Email thông báo đổi lịch (Reply-To theo tổ chức)
    alt Gửi Email thành công (trong tối đa 3 lần thử)
        EmailSvc-->>Sys: Xác nhận đã chuyển phát
        Sys->>Sys: Cập nhật trạng thái thông báo = sent
    else Gửi Email thất bại sau 3 lần thử (E-selfomy-alignment-010)
        EmailSvc-->>Sys: Báo lỗi chuyển phát
        Sys->>Sys: Cập nhật trạng thái thông báo = failed (E-selfomy-alignment-010)
        Sys-->>Staff: Hiển thị cảnh báo Lỗi gửi kèm nút Gửi lại (FR-selfomy-alignment-003)
    end
```

```mermaid
flowchart TD
    Start([Bắt đầu tạo Lịch nghỉ chung]) --> Input["Nhập tên kỳ nghỉ, khoảng ngày (<= 30 ngày) và phạm vi lớp"]
    Input --> Preview["Quét và hiển thị các buổi học bị trùng lịch"]
    Preview --> Mode{"Chọn phương thức xử lý?"}
    Mode -->|"Hủy buổi"| CancelSess["Đánh dấu buổi trùng = Đã hủy (không kéo dài ngày kết thúc khóa)"]
    Mode -->|"Dời lịch +1 buổi"| CheckOverlap{"Ngày dự kiến bù cuối khóa có trùng kỳ nghỉ khác?"}
    CheckOverlap -->|Có| SkipNext["Nhảy tiếp sang ngày học hợp lệ kế tiếp của lớp (BR-selfomy-alignment-003)"]
    CheckOverlap -->|Không| CreateMakeup["Sinh bù 1 buổi học ở cuối khóa, giữ nguyên số buổi gói học phí"]
    SkipNext --> CreateMakeup
    CancelSess --> Notify["Phát thông báo In-app và gửi Email đổi lịch (FR-selfomy-alignment-001)"]
    CreateMakeup --> Notify
    Notify --> End([Hoàn tất])
```

## Flow: Tra cứu Sổ công nợ học viên & Quản lý gửi/gửi lại thông báo Email + In-app
**Trigger**: Giáo viên / Chủ trung tâm / Giáo vụ mở Sổ công nợ học viên để kiểm tra dư nợ lũy kế và gửi thông báo nhắc phí (`uc-student-debt-and-notification`).
**Related UC**: [[../usecases/uc-student-debt-and-notification.md|uc-student-debt-and-notification]]
**Related FR**: FR-selfomy-alignment-001, FR-selfomy-alignment-002, FR-selfomy-alignment-003, FR-selfomy-alignment-009, FR-selfomy-alignment-010

```mermaid
sequenceDiagram
    actor Manager as Giáo viên / Chủ trung tâm / Giáo vụ
    participant Sys as Hệ thống Teacher OS
    participant EmailSvc as Dịch vụ gửi Email
    actor Student as Học viên chính thức

    Manager->>Sys: Mở màn hình Sổ công nợ học viên (lọc Còn nợ / Quá hạn)
    Sys-->>Manager: Hiển thị Tổng phải thu, Đã đóng, Còn nợ theo từng học viên (FR-selfomy-alignment-009)
    Manager->>Sys: Chọn học viên xem lịch sử hóa đơn/thanh toán và bấm Gửi nhắc phí
    Sys->>Sys: Tạo bản ghi thông báo trạng thái queued (FR-selfomy-alignment-002)
    Sys->>Student: Đẩy thông báo lên chuông cổng học viên (In-app)
    Sys->>EmailSvc: Gửi Email từ tên miền chung Teacher OS + Reply-To tổ chức (FR-selfomy-alignment-001)
    alt Chuyển phát Email thành công
        EmailSvc-->>Sys: Đã gửi thành công
        Sys->>Sys: Chuyển trạng thái = sent
        Student->>Sys: Mở xem thông báo trên cổng học viên
        Sys->>Sys: Chuyển trạng thái = read
    else Lỗi chuyển phát sau 3 lần tự động thử lại (E-selfomy-alignment-010)
        EmailSvc-->>Sys: Thất bại sau 3 lần thử
        Sys->>Sys: Chuyển trạng thái = failed (E-selfomy-alignment-010)
        Manager->>Sys: Kiểm tra lại Email học viên và bấm nút Gửi lại (FR-selfomy-alignment-003)
        Sys->>EmailSvc: Đặt lại trạng thái queued và gửi lại Email
    end
```

## Flow: Nhập đề thi IELTS từ tệp PDF/ảnh bằng AI có kiểm tra trùng & tạm giữ Credit
**Trigger**: Giáo viên / Chủ trung tâm / Giáo viên đứng lớp tải tệp PDF hoặc ảnh đề thi lên màn hình Soạn đề để bóc tách bằng AI (`uc-ai-exam-import`).
**Related UC**: [[../usecases/uc-ai-exam-import.md|uc-ai-exam-import]]
**Related FR**: FR-selfomy-alignment-013, FR-selfomy-alignment-015, FR-selfomy-alignment-016, FR-selfomy-alignment-017

```mermaid
sequenceDiagram
    actor Teacher as Giáo viên / Chủ trung tâm
    participant Sys as Hệ thống Teacher OS
    participant Wallet as Ví Credit AI
    participant AISvc as Dịch vụ AI

    Teacher->>Sys: Chọn tệp PDF/ảnh để Nhập đề bằng AI (5 Credit)
    Sys->>Sys: Kiểm tra định dạng, dung lượng <= 15MB, số trang <= 20 và mã chống trùng
    alt Tệp sai quy cách (E-selfomy-alignment-003)
        Sys-->>Teacher: Chặn tải lên và hiển thị lỗi E-selfomy-alignment-003
    else Tệp trùng với đề đã trích xuất trước đó (BR-selfomy-alignment-005)
        Sys-->>Teacher: Cảnh báo trùng tệp và mở lại bản đề nháp cũ (0 Credit)
    else Tệp mới hợp lệ
        Sys->>Wallet: Kiểm tra gói hoạt động, trần cá nhân và tạm giữ 5 Credit
        alt Gói hết hạn ân hạn (E-selfomy-alignment-006) hoặc chạm trần cá nhân (E-selfomy-alignment-007) hoặc thiếu Credit (E-selfomy-alignment-001)
            Wallet-->>Sys: Từ chối tạm giữ Credit
            Sys-->>Teacher: Hiển thị thông báo E-selfomy-alignment-001 / E-006 / E-007
        else Đủ hạn mức -> Đã tạm giữ 5 Credit
            Wallet-->>Sys: Xác nhận tạm giữ 5 Credit
            Sys->>AISvc: Gửi tệp bóc tách đoạn đọc, câu hỏi và đáp án (tối đa 120 giây)
            alt Trích xuất hợp lệ trong 120 giây
                AISvc-->>Sys: Trả cấu trúc đề nháp
                Sys->>Wallet: Chốt trừ 5 Credit (ưu tiên gói tháng trước Top-up)
                Sys-->>Teacher: Mở màn Soạn đề nháp để sửa tay miễn phí (0 Credit) và Xuất bản
            else Quá 120 giây hoặc lỗi trích xuất hoàn toàn (E-selfomy-alignment-004)
                AISvc-->>Sys: Lỗi hoặc quá thời gian chờ
                Sys->>Wallet: Giải phóng và hoàn trả đủ 5 Credit tạm giữ (BR-selfomy-alignment-004)
                Sys-->>Teacher: Hiển thị thông báo lỗi và xác nhận đã hoàn 5 Credit (E-selfomy-alignment-004)
            end
        end
    end
```

## Flow: Chấm nháp Writing/Speaking bằng AI, Trợ giảng rà soát & Giáo viên bấm "Chốt trả bài"
**Trigger**: Học viên chính thức nộp bài làm Writing hoặc tệp ghi âm Speaking, sau đó Trợ giảng và Giáo viên đứng lớp rà soát trên màn hình Chấm bài (`uc-ai-grading-review`).
**Related UC**: [[../usecases/uc-ai-grading-review.md|uc-ai-grading-review]]
**Related FR**: FR-selfomy-alignment-013, FR-selfomy-alignment-014, FR-selfomy-alignment-018, FR-selfomy-alignment-019, FR-selfomy-alignment-020, FR-selfomy-alignment-027, FR-selfomy-alignment-028

```mermaid
sequenceDiagram
    actor Student as Học viên chính thức
    participant Sys as Hệ thống Teacher OS
    participant Wallet as Ví Credit AI
    participant AISvc as Dịch vụ AI & Chuyển giọng nói
    actor TA as Trợ giảng (TA)
    actor Teacher as Giáo viên đứng lớp / Chủ trung tâm

    Student->>Sys: Nộp bài Writing hoặc tệp ghi âm Speaking (submitted)
    Sys->>Wallet: Kiểm tra Ví tổ chức và Trần cá nhân của Giáo viên phụ trách lớp (BR-selfomy-alignment-011)
    alt Hết Credit cho Speaking (E-selfomy-alignment-001) hoặc hết cả 30 lượt Chấm nhanh Writing (E-selfomy-alignment-002)
        Wallet-->>Sys: Không đủ hạn mức chấm AI
        Sys->>Sys: Chuyển bài sang trạng thái Chờ chấm thủ công (manual_pending)
    else Đủ hạn mức (hoặc dùng lượt Chấm nhanh Writing <= 30 bài/tháng)
        Wallet-->>Sys: Tạm giữ 1 Credit (Writing) hoặc 2 Credit (Speaking)
        opt Bài nộp là Speaking
            Sys->>AISvc: Chuyển tệp ghi âm thành văn bản
            AISvc-->>Sys: Trả văn bản ghi âm
        end
        alt Bài Speaking có văn bản dưới 15 từ (E-selfomy-alignment-009)
            Sys->>Wallet: Giải phóng 2 Credit tạm giữ (không trừ phí)
            Sys->>Sys: Gắn cờ E-selfomy-alignment-009 và chuyển sang manual_pending
        else Bài Writing hoặc Speaking >= 15 từ
            Sys->>AISvc: Chấm nháp theo 4 tiêu chí IELTS
            alt AI chấm thành công
                AISvc-->>Sys: Điểm gợi ý và nhận xét sửa lỗi
                Sys->>Wallet: Chốt trừ Credit (hoặc ghi nhận +1 lượt Chấm nhanh)
                Sys->>Sys: Lưu vào vùng ẩn Bản nháp AI (trạng thái ai_drafted)
            else AI lỗi sau 2 lần tự động thử lại (E-selfomy-alignment-004)
                AISvc-->>Sys: Thất bại
                Sys->>Wallet: Hoàn trả đủ Credit tạm giữ (E-selfomy-alignment-004)
                Sys->>Sys: Chuyển bài sang manual_pending
            end
        end
    end

    TA->>Sys: Mở bài làm, chỉnh sửa nhận xét nháp và bấm Lưu nháp trình duyệt
    Sys->>Sys: Chuyển trạng thái = teacher_reviewing (khóa nút Chốt trả bài với TA)
    Teacher->>Sys: Mở bài làm, rà soát điểm/lời phê và bấm nút Chốt trả bài (FR-selfomy-alignment-020)
    alt Xung đột phiên bản do người khác vừa lưu đè (E-selfomy-alignment-011)
        Sys-->>Teacher: Cảnh báo tải lại phiên bản mới nhất (E-selfomy-alignment-011)
    else Phiên bản hợp lệ
        Sys->>Sys: Chuyển trạng thái = published
        Sys-->>Student: Công bố điểm chính thức và gửi thông báo Email + In-app (FR-selfomy-alignment-001)
    end
```

## Flow: Khách vãng lai đăng ký thi thử tại Phòng thi ảo công khai & Kiểm soát trần Credit AI
**Trigger**: Học viên vãng lai mở đường dẫn Phòng thi ảo công khai, điền thông tin liên hệ và nộp bài thi thử (`uc-public-exam-lead`).
**Related UC**: [[../usecases/uc-public-exam-lead.md|uc-public-exam-lead]]
**Related FR**: FR-selfomy-alignment-021, FR-selfomy-alignment-022, FR-selfomy-alignment-023

```mermaid
flowchart TD
    Start([Khách vãng lai mở đường dẫn Phòng thi công khai]) --> Form["Điền Họ tên + Email + SĐT 10 số + Đồng ý điều khoản dữ liệu"]
    Form --> CheckExisting{"Email chuẩn hóa trùng Học viên chính thức?"}
    CheckExisting -->|Có| LinkStudent["Gắn lượt thi vào hồ sơ Học viên chính thức hiện hữu (BR-selfomy-alignment-009)"]
    CheckExisting -->|Không| CreateLead["Tạo hồ sơ Học viên vãng lai (guest_registered)"]
    LinkStudent --> TakeExam["Làm bài thi có đồng hồ đếm ngược và tự lưu tạm câu trả lời"]
    CreateLead --> TakeExam
    TakeExam --> Submit["Khách bấm Nộp bài hoặc hết giờ 00:00 -> trạng thái guest_tested"]
    Submit --> SkillType{"Kỹ năng trong bài nộp?"}
    SkillType -->|"Reading / Listening"| AutoScore["Tự chấm ngay lập tức (0 Credit) và hiển thị điểm kèm giải thích lưu đệm"]
    SkillType -->|"Writing / Speaking"| RoomAI{"Phòng thi có bật chấm AI không?"}
    RoomAI -->|"Tắt (Mặc định)"| ManualWait["Lưu bài chờ giáo viên chấm thủ công (0 Credit) và báo nhận kết quả qua Email"]
    RoomAI -->|"Đang bật"| CheckCap{"Khách <= 1 lượt AI VÀ Phòng <= 20 credit/ngày VÀ Ví còn Credit?"}
    CheckCap -->|Đạt cả 3 điều kiện| RunAI["Gọi chấm nháp AI, trừ Credit của giáo viên, chờ giáo viên duyệt gửi Email"]
    CheckCap -->|Chạm bất kỳ trần nào| CapHit["Lưu bài nộp an toàn, bỏ qua gọi AI và hiện thông báo thân thiện (E-selfomy-alignment-008)"]
    AutoScore --> End([Hoàn tất lượt thi công khai])
    ManualWait --> End
    RunAI --> End
    CapHit --> End
```

## Flow: Mua gói thuê bao/Top-up qua QR Bank-Hub, Quản trị viên cấp hạn mức & Phân quyền Trung tâm
**Trigger**: Giáo viên / Chủ trung tâm tạo đơn mua gói thuê bao tháng hoặc gói Top-up qua QR ngân hàng, hoặc Chủ trung tâm mời nhân sự và đặt trần Credit cá nhân (`uc-subscription-and-center-staff`).
**Related UC**: [[../usecases/uc-subscription-and-center-staff.md|uc-subscription-and-center-staff]]
**Related FR**: FR-selfomy-alignment-011, FR-selfomy-alignment-012, FR-selfomy-alignment-024, FR-selfomy-alignment-025, FR-selfomy-alignment-026, FR-selfomy-alignment-029, FR-selfomy-alignment-030

```mermaid
sequenceDiagram
    actor Owner as Giáo viên / Chủ trung tâm
    participant Sys as Hệ thống Teacher OS
    participant BankHub as Dịch vụ Bank-Hub
    actor Admin as Quản trị viên nền tảng

    Owner->>Sys: Chọn gói tháng (200k/350k/500k) hoặc gói Top-up (149k = 100 Credit)
    Sys-->>Owner: Tạo đơn pending (giữ 15 phút) và hiển thị mã QR kèm nội dung định danh (FR-selfomy-alignment-024)
    Owner->>BankHub: Quét mã QR chuyển khoản trên ứng dụng ngân hàng
    BankHub->>Sys: Gửi thông báo biến động giao dịch về hệ thống
    alt Khớp đúng số tiền và mã định danh trong 15 phút
        Sys->>Sys: Chuyển đơn = paid, kích hoạt gói 30 ngày hoặc cộng 100 Credit (hạn 12 tháng)
        Sys-->>Owner: Hiển thị thông báo thành công và gửi Email xác nhận (FR-selfomy-alignment-025)
    else Quá 15 phút chưa nhận tiền (E-selfomy-alignment-012)
        Sys->>Sys: Chuyển đơn = expired
        Sys-->>Owner: Báo mã QR hết hiệu lực sau 15 phút, mời tạo lại mã mới (E-selfomy-alignment-012)
    else Chuyển lệch số tiền so với đơn hàng (E-selfomy-alignment-012)
        Sys->>Sys: Chuyển đơn = mismatch (Cần đối soát)
        Sys-->>Owner: Báo đơn đang chờ Quản trị viên đối soát cộng bù (E-selfomy-alignment-012)
        Admin->>Sys: Rà soát giao dịch và kích hoạt gói/cộng Credit thủ công (FR-selfomy-alignment-012)
    end

    Owner->>Sys: Mời nhân sự qua Email (4 vai trò), gán lớp học và đặt trần Credit cá nhân/tháng
    Sys-->>Owner: Lưu phân quyền lớp học và trần Credit cá nhân (FR-selfomy-alignment-029, FR-selfomy-alignment-030)
```

## Notes

* Mọi mã lỗi (`E-selfomy-alignment-001` đến `E-selfomy-alignment-012`) và quy tắc nghiệp vụ (`BR-selfomy-alignment-001` đến `BR-selfomy-alignment-012`) tham chiếu trực tiếp tới `docs/selfomy-alignment/srs/selfomy-alignment-spec.md`.
