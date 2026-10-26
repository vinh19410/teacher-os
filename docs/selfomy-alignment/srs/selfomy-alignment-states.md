---
type: srs-states
feature: selfomy-alignment
updated: 2026-10-26
---

# selfomy-alignment — State Diagrams

> State diagram per entity của feature **selfomy-alignment**. Mỗi entity 1 section `## State: {Entity}`.

## State: OrgSubscription

**Related UC**: [[../usecases/uc-subscription-and-center-staff.md|uc-subscription-and-center-staff]]
**Related BR**: BR-selfomy-alignment-007, BR-selfomy-alignment-010

```mermaid
stateDiagram-v2
    [*] --> trial: Khởi tạo tổ chức (cấp 30 Credit dùng thử 1 lần)
    trial --> active: Thanh toán QR gói tháng (Cơ bản/Chuyên nghiệp/Nâng cao) hoặc Admin kích hoạt
    active --> active: Gia hạn gói tháng hoặc nâng bậc gói trước khi hết hạn
    active --> grace_period: Đến thời điểm hết hạn chu kỳ 30 ngày chưa thanh toán
    grace_period --> active: Thanh toán gia hạn thành công trong vòng 72 giờ
    grace_period --> expired: Quá 72 giờ (3 ngày ân hạn) chưa thanh toán (khóa AI, giữ nguyên lớp học)
    expired --> active: Thanh toán mua gói thuê bao tháng mới hoặc Admin kích hoạt
```

### Invalid transitions

| From | To | Why not |
|---|---|---|
| `active` | `trial` | Gói Dùng thử (`30 credit`) chỉ cấp một lần duy nhất cho mỗi tổ chức; sau khi đã lên gói trả phí không được quay lại gói Dùng thử |
| `expired` | `trial` | Tổ chức đã hết hạn gói thuê bao không thể quay về trạng thái Dùng thử để nhận lại `30 credit` miễn phí |
| `active` | `expired` | Khi hết chu kỳ `30 ngày`, gói thuê bao bắt buộc phải đi qua `72 giờ` ân hạn (`grace_period`) trước khi chuyển sang `expired` (`BR-selfomy-alignment-010`) |

## State: AiGradingDraft

**Related UC**: [[../usecases/uc-ai-grading-review.md|uc-ai-grading-review]]
**Related BR**: BR-selfomy-alignment-001, BR-selfomy-alignment-004, BR-selfomy-alignment-006, BR-selfomy-alignment-007

```mermaid
stateDiagram-v2
    [*] --> submitted: Học viên bấm nộp bài Writing hoặc Speaking
    submitted --> ai_drafted: Dịch vụ AI chấm nháp thành công (ẩn với học viên)
    submitted --> manual_pending: Hết Credit / Bản ghi âm dưới 15 từ / Lỗi AI sau 2 lần thử
    manual_pending --> ai_drafted: Giáo viên nạp thêm Credit và bấm Thử chấm lại bằng AI
    ai_drafted --> teacher_reviewing: Trợ giảng hoặc Giáo viên chỉnh sửa và lưu nháp lời phê
    manual_pending --> teacher_reviewing: Trợ giảng chấm tay sơ bộ và lưu nháp trình duyệt
    ai_drafted --> published: Giáo viên đứng lớp / Giáo viên độc lập / Chủ trung tâm bấm Chốt trả bài
    teacher_reviewing --> published: Giáo viên đứng lớp / Giáo viên độc lập / Chủ trung tâm bấm Chốt trả bài
    manual_pending --> published: Giáo viên đứng lớp / Giáo viên độc lập / Chủ trung tâm chấm tay và bấm Chốt trả bài
    published --> teacher_reviewing: Giáo viên mở lại bản nháp để sửa bổ sung (giữ nguyên điểm cũ của học viên cho tới khi Chốt lại)
```

### Invalid transitions

| From | To | Why not |
|---|---|---|
| `submitted` | `published` | Đối với bài Writing và Speaking, hệ thống cấm tự động công bố kết quả thẳng cho học viên khi chưa có thao tác kiểm duyệt và bấm **"Chốt trả bài"** của giáo viên (`BR-selfomy-alignment-001`) |
| `ai_drafted` | `published` (bởi Trợ giảng) | Vai trò Trợ giảng (`TA`) bị khóa nút **"Chốt trả bài"**; Trợ giảng chỉ được chuyển bài sang `teacher_reviewing` để chờ Giáo viên đứng lớp hoặc Chủ trung tâm duyệt chốt |

## State: GuestLead

**Related UC**: [[../usecases/uc-public-exam-lead.md|uc-public-exam-lead]]
**Related BR**: BR-selfomy-alignment-008, BR-selfomy-alignment-009

```mermaid
stateDiagram-v2
    [*] --> guest_registered: Khách vãng lai điền Họ tên + Email + SĐT vào Phòng thi công khai
    guest_registered --> guest_tested: Khách bấm Nộp bài hoặc hết thời gian đếm ngược
    guest_tested --> guest_tested: Khách nộp bài ở đề thi thử khác của tổ chức
    guest_tested --> invited: Giáo viên gửi lời mời tham gia lớp học chính thức qua Email
    invited --> active_student: Học viên kích hoạt lời mời trên cổng học viên (hợp nhất lịch sử thi thử)
    active_student --> [*]
```

### Invalid transitions

| From | To | Why not |
|---|---|---|
| `active_student` | `guest_registered` | Khi đã là Học viên chính thức trong tổ chức, không được hạ trạng thái hồ sơ ngược về khách vãng lai mới đăng ký (`BR-selfomy-alignment-009`) |
| `guest_tested` | `guest_registered` | Hồ sơ đã có kết quả bài thi thử không thể quay ngược về trạng thái chưa làm bài |

## State: NotificationRecord

**Related UC**: [[../usecases/uc-student-debt-and-notification.md|uc-student-debt-and-notification]]
**Related BR**: FR-selfomy-alignment-001, FR-selfomy-alignment-002, FR-selfomy-alignment-003, E-selfomy-alignment-010

```mermaid
stateDiagram-v2
    [*] --> queued: Phát sinh 1 trong 4 sự kiện thông báo chính
    queued --> sent: Gửi Email và đẩy thông báo In-app thành công (trong tối đa 3 lần thử)
    queued --> failed: Dịch vụ Email báo lỗi chuyển phát sau cả 3 lần thử tự động
    failed --> queued: Giáo viên / Giáo vụ bấm nút Gửi lại trên màn hình Nhật ký thông báo
    sent --> read: Học viên chính thức mở xem thông báo trên cổng học viên
    read --> [*]
```

### Invalid transitions

| From | To | Why not |
|---|---|---|
| `failed` | `read` | Bản ghi đang ở trạng thái lỗi gửi chưa chuyển phát thành công thì không thể chuyển thẳng sang trạng thái đã đọc nếu chưa qua bước gửi lại (`queued` → `sent`) |
| `read` | `queued` | Thông báo đã được học viên mở xem thành công không đưa ngược lại vào hàng đợi gửi tự động |

## State: SubscriptionOrder

**Related UC**: [[../usecases/uc-subscription-and-center-staff.md|uc-subscription-and-center-staff]]
**Related BR**: BR-selfomy-alignment-010, E-selfomy-alignment-012

```mermaid
stateDiagram-v2
    [*] --> pending: Giáo viên / Chủ trung tâm tạo đơn mua gói tháng hoặc gói Top-up (sinh mã QR 15 phút)
    pending --> paid: Bank-Hub báo giao dịch khớp đúng số tiền và mã định danh trong 15 phút
    pending --> expired: Quá 15 phút chưa nhận được giao dịch thanh toán
    pending --> mismatch: Giao dịch chuyển khoản bị lệch số tiền so với đơn hàng
    expired --> mismatch: Giao dịch Bank-Hub báo về trễ sau khi đơn đã quá hạn 15 phút
    mismatch --> reconciled: Quản trị viên nền tảng đối soát và kích hoạt gói / cộng bù Credit
    paid --> [*]
    reconciled --> [*]
```

### Invalid transitions

| From | To | Why not |
|---|---|---|
| `paid` | `expired` | Đơn hàng đã đối soát thanh toán thành công và cộng hạn mức không thể bị chuyển ngược sang hết hạn |
| `mismatch` | `paid` | Đơn lệch số tiền hoặc tiền về trễ sau 15 phút bắt buộc phải qua bước Quản trị viên nền tảng kiểm tra đối soát (`reconciled`) để tránh cộng nhầm hạn mức (`E-selfomy-alignment-012`) |

## State: CreditUsageLog

**Related UC**: [[../usecases/uc-ai-exam-import.md|uc-ai-exam-import]], [[../usecases/uc-ai-grading-review.md|uc-ai-grading-review]]
**Related BR**: BR-selfomy-alignment-002, BR-selfomy-alignment-004, E-selfomy-alignment-004

```mermaid
stateDiagram-v2
    [*] --> reserved: Tạm giữ Credit AI trước khi gọi Dịch vụ AI (Nhập đề 5 Cr / Speaking 2 Cr / Writing 1 Cr)
    reserved --> settled: Dịch vụ AI trả kết quả hợp lệ trong thời gian quy định (chốt trừ Credit)
    reserved --> released: Dịch vụ AI báo lỗi sau các lần thử lại hoặc quá 120 giây (hoàn trả 100% Credit)
    settled --> [*]
    released --> [*]
```

### Invalid transitions

| From | To | Why not |
|---|---|---|
| `released` | `settled` | Giao dịch tạm giữ đã được giải phóng hoàn trả về ví do lỗi/quá hạn không được tự động trừ lại nếu người dùng chưa bấm yêu cầu mới (`BR-selfomy-alignment-004`) |
| `settled` | `reserved` | Giao dịch đã chốt trừ thành công không quay ngược lại trạng thái tạm giữ |
