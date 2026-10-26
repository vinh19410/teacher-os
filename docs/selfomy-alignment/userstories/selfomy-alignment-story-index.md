---
type: userstory-index
feature: selfomy-alignment
status: draft
updated: 2026-10-26
links:
  - docs/selfomy-alignment/srs/selfomy-alignment-spec.md
  - docs/selfomy-alignment/usecases/selfomy-alignment-usecase-index.md
  - docs/selfomy-alignment/ascii-wireframe/selfomy-alignment-wireframe-index.md
---

# selfomy-alignment — User Stories Index

## User Stories

| # | ID | Title | Persona | Covers FR | UC | Screens | Priority | Status | Jira | Updated |
|---|----|-------|---------|-----------|----|---------|----------|--------|------|---------|
| 1 | [US-001](us-001.md) | Theo dõi thẻ Việc cần làm hôm nay và Điểm danh tổng theo ngày tại chỗ | Giáo viên đứng lớp / Giáo viên độc lập / Trợ giảng | FR-selfomy-alignment-004, FR-selfomy-alignment-005 | [[../usecases/uc-daily-attendance-and-holiday.md\|uc-daily-attendance-and-holiday]] | `dashboard-reminders`, `daily-attendance` | P0 | draft | — | 2026-10-26 |
| 2 | [US-002](us-002.md) | Xem Lịch dạy đa chế độ Tháng/Tuần/Ngày, tạo Lịch nghỉ chung và tự động dời buổi học bù vào cuối khóa | Giáo viên độc lập / Giáo vụ / Chủ trung tâm | FR-selfomy-alignment-006, FR-selfomy-alignment-007, FR-selfomy-alignment-008 | [[../usecases/uc-daily-attendance-and-holiday.md\|uc-daily-attendance-and-holiday]] | `schedule-and-holiday-modal` | P0 | draft | — | 2026-10-26 |
| 3 | [US-003](us-003.md) | Quản lý Sổ công nợ học viên, tra cứu dòng thời gian hóa đơn/giao dịch và ghi nhận thu học phí | Giáo viên độc lập / Giáo vụ / Chủ trung tâm | FR-selfomy-alignment-009, FR-selfomy-alignment-010 | [[../usecases/uc-student-debt-and-notification.md\|uc-student-debt-and-notification]] | `student-debt-ledger` | P0 | draft | — | 2026-10-26 |
| 4 | [US-004](us-004.md) | Tự động gửi thông báo Email + In-app cho 4 sự kiện chính và gửi lại thông báo lỗi | Giáo viên độc lập / Giáo vụ / Chủ trung tâm | FR-selfomy-alignment-001, FR-selfomy-alignment-002, FR-selfomy-alignment-003 | [[../usecases/uc-student-debt-and-notification.md\|uc-student-debt-and-notification]] | `notification-logs` | P0 | draft | — | 2026-10-26 |
| 5 | [US-005](us-005.md) | Nhập đề thi từ tệp PDF/Ảnh bằng AI có chống trùng đề và giao diện đối chiếu 2 cột | Giáo viên độc lập / Giáo viên đứng lớp / Chủ trung tâm | FR-selfomy-alignment-013, FR-selfomy-alignment-015, FR-selfomy-alignment-016, FR-selfomy-alignment-017 | [[../usecases/uc-ai-exam-import.md\|uc-ai-exam-import]] | `ai-exam-import-workspace` | P0 | draft | — | 2026-10-26 |
| 6 | [US-006](us-006.md) | Chấm nháp AI Writing/Speaking, hạ cấp Chấm nhanh Writing và Giáo viên bấm "Chốt trả bài" | Giáo viên đứng lớp / Trợ giảng / Chủ trung tâm | FR-selfomy-alignment-013, FR-selfomy-alignment-014, FR-selfomy-alignment-018, FR-selfomy-alignment-019, FR-selfomy-alignment-020 | [[../usecases/uc-ai-grading-review.md\|uc-ai-grading-review]] | `ai-grading-review-workspace` | P0 | draft | — | 2026-10-26 |
| 7 | [US-007](us-007.md) | Tạo bài tập nhanh, giải thích đáp án lưu đệm và sử dụng Trợ giảng Chat AI trong hạn mức 100 lượt/ngày | Giáo viên / Trợ giảng / Học viên | FR-selfomy-alignment-014, FR-selfomy-alignment-027, FR-selfomy-alignment-028 | [[../usecases/uc-ai-grading-review.md\|uc-ai-grading-review]] | `ai-grading-review-workspace`, `public-exam-guest-portal` | P1 | draft | — | 2026-10-26 |
| 8 | [US-008](us-008.md) | Vận hành Phòng thi ảo công khai thu thập Lead khách vãng lai với trần bảo vệ kép Credit AI | Giáo viên / Chủ trung tâm / Khách vãng lai | FR-selfomy-alignment-021, FR-selfomy-alignment-022, FR-selfomy-alignment-023 | [[../usecases/uc-public-exam-lead.md\|uc-public-exam-lead]] | `public-exam-room-config`, `public-exam-guest-portal` | P1 | draft | — | 2026-10-26 |
| 9 | [US-009](us-009.md) | Quản lý gói thuê bao tháng, Ví Credit AI, thanh toán QR tự động và chu kỳ 3 ngày ân hạn | Giáo viên độc lập / Chủ trung tâm | FR-selfomy-alignment-011, FR-selfomy-alignment-013, FR-selfomy-alignment-014, FR-selfomy-alignment-024, FR-selfomy-alignment-025, FR-selfomy-alignment-026 | [[../usecases/uc-subscription-and-center-staff.md\|uc-subscription-and-center-staff]] | `subscription-and-credit-wallet`, `dashboard-reminders` | P0 | draft | — | 2026-10-26 |
| 10 | [US-010](us-010.md) | Phân quyền nhân sự Trung tâm 4 vai trò, đặt trần Credit AI cá nhân hàng tháng và công cụ Admin cấp hạn mức | Chủ trung tâm (`Owner`) / Quản trị viên nền tảng (`Super Admin`) | FR-selfomy-alignment-012, FR-selfomy-alignment-029, FR-selfomy-alignment-030 | [[../usecases/uc-subscription-and-center-staff.md\|uc-subscription-and-center-staff]] | `center-staff-and-quota` | P0 | draft | — | 2026-10-26 |
| 11 | [US-011](us-011.md) | Quản lý Bảng điểm ma trận theo lớp, chấm công ca dạy tự động và phân tách mục tiêu doanh thu đa cơ sở | Giáo viên / Giáo vụ / Chủ trung tâm | FR-selfomy-alignment-031, FR-selfomy-alignment-032 | [[../usecases/uc-daily-attendance-and-holiday.md\|uc-daily-attendance-and-holiday]], [[../usecases/uc-subscription-and-center-staff.md\|uc-subscription-and-center-staff]] | `daily-attendance`, `center-staff-and-quota` | P2 | draft | — | 2026-10-26 |

**Status values:** `draft` / `in-review` / `revisions` / `approved` / `shipped` / `stale`.

**UC column:** use case slug mà story này bóc ra. Nguồn edge US→UC (traceability).

**Jira column:** issue key sau khi `/jira --push`. `—` nếu chưa push. Mapping canonical ở `.claude/state/atlassian/sync-state.yaml`.

## Links upstream

- [[../srs/selfomy-alignment-spec.md|SRS spec]]
- [[../usecases/selfomy-alignment-usecase-index.md|Use cases index]]
- [[../ascii-wireframe/selfomy-alignment-wireframe-index.md|ASCII Wireframe & Screen Specs]]
- [[../html-wireframe/selfomy-alignment-wireframe-html-index.md|HTML Wireframe Index]]

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
