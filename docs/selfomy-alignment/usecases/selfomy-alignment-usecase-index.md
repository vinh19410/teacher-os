---
type: usecase-index
feature: selfomy-alignment
status: draft
updated: 2026-10-26
links:
  - docs/selfomy-alignment/srs/selfomy-alignment-spec.md
---

# selfomy-alignment — Use Cases Index

## Use cases

| # | Slug | Level | Status | Actor primary | Covers FR | Screens | Errors (E-*) | OQ ref | Priority | Updated |
|---|------|-------|--------|---------------|-----------|---------|--------------|--------|----------|---------|
| 1 | [uc-daily-attendance-and-holiday](uc-daily-attendance-and-holiday.md) | sea | draft | Giáo viên độc lập, Quản lý / Giáo vụ, Giáo viên đứng lớp, Trợ giảng | FR-selfomy-alignment-004, FR-selfomy-alignment-005, FR-selfomy-alignment-006, FR-selfomy-alignment-007, FR-selfomy-alignment-008, FR-selfomy-alignment-031 | dashboard-reminders, daily-attendance, schedule-and-holiday-modal | E-selfomy-alignment-010 | — | P0 | 2026-10-26 |
| 2 | [uc-student-debt-and-notification](uc-student-debt-and-notification.md) | sea | draft | Giáo viên độc lập, Chủ trung tâm, Quản lý / Giáo vụ, Học viên chính thức | FR-selfomy-alignment-001, FR-selfomy-alignment-002, FR-selfomy-alignment-003, FR-selfomy-alignment-009, FR-selfomy-alignment-010 | student-debt-ledger, notification-logs | E-selfomy-alignment-010 | — | P0 | 2026-10-26 |
| 3 | [uc-ai-exam-import](uc-ai-exam-import.md) | sea | draft | Giáo viên độc lập, Chủ trung tâm, Giáo viên đứng lớp | FR-selfomy-alignment-013, FR-selfomy-alignment-015, FR-selfomy-alignment-016, FR-selfomy-alignment-017 | ai-exam-import-workspace | E-selfomy-alignment-001, E-selfomy-alignment-003, E-selfomy-alignment-004, E-selfomy-alignment-006, E-selfomy-alignment-007 | — | P0 | 2026-10-26 |
| 4 | [uc-ai-grading-review](uc-ai-grading-review.md) | sea | draft | Giáo viên độc lập, Chủ trung tâm, Giáo viên đứng lớp, Trợ giảng, Học viên chính thức | FR-selfomy-alignment-013, FR-selfomy-alignment-014, FR-selfomy-alignment-018, FR-selfomy-alignment-019, FR-selfomy-alignment-020, FR-selfomy-alignment-027, FR-selfomy-alignment-028 | ai-grading-review-workspace | E-selfomy-alignment-001, E-selfomy-alignment-002, E-selfomy-alignment-004, E-selfomy-alignment-005, E-selfomy-alignment-006, E-selfomy-alignment-007, E-selfomy-alignment-009, E-selfomy-alignment-011 | — | P0 | 2026-10-26 |
| 5 | [uc-public-exam-lead](uc-public-exam-lead.md) | sea | draft | Học viên vãng lai, Giáo viên độc lập, Chủ trung tâm, Quản lý / Giáo vụ | FR-selfomy-alignment-021, FR-selfomy-alignment-022, FR-selfomy-alignment-023 | public-exam-room-config, public-exam-guest-portal | E-selfomy-alignment-008 | — | P1 | 2026-10-26 |
| 6 | [uc-subscription-and-center-staff](uc-subscription-and-center-staff.md) | sea | draft | Giáo viên độc lập, Chủ trung tâm, Quản trị viên nền tảng | FR-selfomy-alignment-011, FR-selfomy-alignment-012, FR-selfomy-alignment-024, FR-selfomy-alignment-025, FR-selfomy-alignment-026, FR-selfomy-alignment-029, FR-selfomy-alignment-030, FR-selfomy-alignment-032 | subscription-and-credit-wallet, center-staff-and-quota | E-selfomy-alignment-001, E-selfomy-alignment-006, E-selfomy-alignment-007, E-selfomy-alignment-012 | — | P1 | 2026-10-26 |

## CRUD matrix

| UC \ Entity | OrgSubscription | CreditWallet | StaffMember | OrganizationHoliday | DailyAttendanceSummary | StudentDebtSummary | NotificationRecord | ExamImportJob | AiGradingDraft | PublicExamRoom | GuestLead |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [uc-daily-attendance-and-holiday](uc-daily-attendance-and-holiday.md) | | | R | CRU | CRU | R | C | | R | | |
| [uc-student-debt-and-notification](uc-student-debt-and-notification.md) | | | R | | | RU | CRU | | | | R |
| [uc-ai-exam-import](uc-ai-exam-import.md) | R | RU | RU | | | | | CRU | | | |
| [uc-ai-grading-review](uc-ai-grading-review.md) | R | RU | RU | | | R | C | | CRU | | |
| [uc-public-exam-lead](uc-public-exam-lead.md) | R | RU | | | | | C | | C | CRU | CRU |
| [uc-subscription-and-center-staff](uc-subscription-and-center-staff.md) | CRU | CRU | CRUD | | | | C | | | | |

## Actors

| Actor | Loại | Mô tả | Nguồn |
|---|---|---|---|
| Giáo viên độc lập (Solo Teacher) | primary | Người sở hữu tổ chức mô hình cá nhân, trực tiếp điểm danh, xếp lịch nghỉ, quản lý công nợ, nhập đề AI, chấm duyệt bài, mở phòng thi thử và mua gói thuê bao | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Chủ trung tâm (Center Owner) | primary | Người sở hữu tổ chức mô hình trung tâm, quản lý gói thuê bao/Ví Credit AI, mời nhân sự 4 vai trò, phân bổ trần Credit cá nhân và duyệt chốt trả bài | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Quản lý / Giáo vụ (Admin / Staff) | primary | Nhân sự điều phối trung tâm: điểm danh tổng theo ngày, tạo lịch nghỉ chung toàn trung tâm, quản lý sổ công nợ học viên và cấu hình phòng thi thử | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Giáo viên đứng lớp (Teacher) | primary | Nhân sự giảng dạy các lớp được phân công: điểm danh, nhập đề AI, chấm bài và bấm nút **"Chốt trả bài"** trong hạn mức trần Credit cá nhân | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Trợ giảng (TA) | primary | Nhân sự hỗ trợ lớp được giao: điểm danh buổi học và chuẩn bị bản chấm nháp kết hợp gợi ý của AI để trình Giáo viên đứng lớp duyệt chốt | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Học viên chính thức (Enrolled Student) | primary | Người học đã tham gia lớp: nhận thông báo Email & In-app, nộp bài Writing/Speaking, xem giải thích đáp án tự luyện và nhận kết quả chấm đã duyệt | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Học viên vãng lai (Guest / Lead) | primary | Khách tiềm năng điền Họ tên + Email + SĐT để làm bài thi thử có bấm giờ tại Phòng thi ảo công khai | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Quản trị viên nền tảng (Platform Admin) | secondary | Người vận hành Teacher OS kích hoạt gói thuê bao/cộng hạn mức Credit thủ công ở Chặng 2 (`A0-lite`) và đối soát đơn lệch tiền | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Dịch vụ AI & Chuyển giọng nói | system | Thực thi bóc tách đề PDF/ảnh, chuyển giọng nói thành văn bản và chấm nháp Writing/Speaking theo tiêu chí IELTS | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |
| Dịch vụ đối soát Bank-Hub & Dịch vụ gửi Email | system | Gửi thông báo giao dịch chuyển khoản QR về hệ thống và chuyển phát Email thông báo từ tên miền chung của Teacher OS | `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 2 |

## Relationships

| Type | From | To | Rationale |
|---|---|---|---|
| include | [uc-daily-attendance-and-holiday](uc-daily-attendance-and-holiday.md) | [uc-student-debt-and-notification](uc-student-debt-and-notification.md) | Khi áp dụng Lịch nghỉ chung có dời buổi học, hệ thống luôn kích hoạt luồng gửi thông báo đổi lịch qua Email & In-app |
| include | [uc-ai-grading-review](uc-ai-grading-review.md) | [uc-student-debt-and-notification](uc-student-debt-and-notification.md) | Khi Giáo viên đứng lớp / Chủ trung tâm bấm **"Chốt trả bài"**, hệ thống luôn kích hoạt luồng gửi thông báo trả điểm cho học viên |
| extend | [uc-ai-grading-review](uc-ai-grading-review.md) | [uc-public-exam-lead](uc-public-exam-lead.md) | Khi Phòng thi ảo công khai bật chấm AI cho Writing/Speaking và lượt nộp bài của khách vãng lai chưa vượt trần bảo vệ, hệ thống kích hoạt luồng chấm nháp AI |
| extend | [uc-subscription-and-center-staff](uc-subscription-and-center-staff.md) | [uc-ai-exam-import](uc-ai-exam-import.md) | Khi người dùng bấm Nhập đề bằng AI nhưng ví tổ chức hết Credit (`E-selfomy-alignment-001`), hệ thống mở luồng nâng cấp gói thuê bao hoặc mua gói Top-up `100 Credit` |

## Nguồn dữ liệu

* FR + Error Matrix: [[../srs/selfomy-alignment-spec.md|SRS spec]]
* Screens: [[../ascii-wireframe/selfomy-alignment-wireframe-index.md|Screens index]]
* Open Questions: `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` Mục 12 Open Questions
