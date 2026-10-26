---
type: srs-screens
feature: selfomy-alignment
status: draft
updated: 2026-10-26
primary_device: desktop
links:
  - docs/selfomy-alignment/srs/selfomy-alignment-spec.md
  - docs/selfomy-alignment/srs/selfomy-alignment-userflow.md
  - docs/selfomy-alignment/usecases/selfomy-alignment-usecase-index.md
---

# selfomy-alignment — Screen Specifications & ASCII Wireframe Index

> Tài liệu tổng hợp danh mục 11 màn hình (`[1]..[11]`) của tính năng **selfomy-alignment**, phân chia theo đúng 4 luồng UX đã chốt tại [[../srs/selfomy-alignment-userflow.md|selfomy-alignment-userflow.md]]. Mỗi màn hình có cả đặc tả ASCII (`ascii-wireframe/*.md`) và bản vẽ tương tác đen-trắng (`html-wireframe/*.html`).

## Screens

| # | Slug | Tên màn hình | Status | Thuộc flow | Used by Functions | Figma | HTML prototype | HTML wireframe | FRs | Purpose |
|---|------|--------------|--------|------------|-------------------|-------|----------------|----------------|-----|---------|
| 1 | `dashboard-reminders` | Bảng điều khiển — Thẻ Việc cần làm hôm nay | draft | [daily-ops-and-holiday-flow](daily-ops-and-holiday-flow.md) | [uc-daily-attendance-and-holiday](../usecases/uc-daily-attendance-and-holiday.md) | — | — | [daily-ops-and-holiday-flow.html](../html-wireframe/daily-ops-and-holiday-flow.html) | FR-selfomy-alignment-004, FR-selfomy-alignment-026, FR-selfomy-alignment-029 | Hiển thị 3 thẻ nhắc việc có bộ đếm, cảnh báo 3 ngày ân hạn thuê bao và điều hướng 1 chạm (`Shared Screen`) |
| 2 | `daily-attendance` | Điểm danh tổng theo ngày | draft | [daily-ops-and-holiday-flow](daily-ops-and-holiday-flow.md) | [uc-daily-attendance-and-holiday](../usecases/uc-daily-attendance-and-holiday.md) | — | — | [daily-ops-and-holiday-flow.html](../html-wireframe/daily-ops-and-holiday-flow.html) | FR-selfomy-alignment-005, FR-selfomy-alignment-029, FR-selfomy-alignment-031 | Lọc ca học theo ngày trên URL, mở rộng danh sách học viên inline để điểm danh 4 trạng thái, ghi chú học vụ và mở Bảng điểm ma trận lớp |
| 3 | `schedule-and-holiday-modal` | Lịch học & Hộp thoại Tạo lịch nghỉ chung | draft | [daily-ops-and-holiday-flow](daily-ops-and-holiday-flow.md) | [uc-daily-attendance-and-holiday](../usecases/uc-daily-attendance-and-holiday.md) | — | — | [daily-ops-and-holiday-flow.html](../html-wireframe/daily-ops-and-holiday-flow.html) | FR-selfomy-alignment-006, FR-selfomy-alignment-007, FR-selfomy-alignment-008 | Lịch dạy đa chế độ Tháng/Tuần/Ngày, khai báo kỳ nghỉ lễ (`2–100 ký tự`, `<= 30 ngày`), chọn `Hủy buổi` hoặc `Dời lịch (+1 buổi)` |
| 4 | `student-debt-ledger` | Sổ công nợ học viên | draft | [debt-and-notification-flow](debt-and-notification-flow.md) | [uc-student-debt-and-notification](../usecases/uc-student-debt-and-notification.md) | — | — | [debt-and-notification-flow.html](../html-wireframe/debt-and-notification-flow.html) | FR-selfomy-alignment-009, FR-selfomy-alignment-010, FR-selfomy-alignment-029 | Thống kê 3 thẻ KPI công nợ, lọc học viên theo trạng thái nợ, xem dòng thời gian lịch sử hóa đơn/giao dịch, ghi nhận thu tiền và gửi nhắc phí |
| 5 | `notification-logs` | Nhật ký gửi thông báo Email + In-app | draft | [debt-and-notification-flow](debt-and-notification-flow.md) | [uc-student-debt-and-notification](../usecases/uc-student-debt-and-notification.md) | — | — | [debt-and-notification-flow.html](../html-wireframe/debt-and-notification-flow.html) | FR-selfomy-alignment-001, FR-selfomy-alignment-002, FR-selfomy-alignment-003 | Theo dõi trạng thái gửi của 4 sự kiện thông báo chính (`queued/sent/read/failed`) và bấm `Gửi lại` cho các bản ghi lỗi (`Shared Screen`) |
| 6 | `ai-exam-import-workspace` | Không gian Nhập đề thi từ PDF/Ảnh bằng AI | draft | [ai-teaching-assistant-flow](ai-teaching-assistant-flow.md) | [uc-ai-exam-import](../usecases/uc-ai-exam-import.md) | — | — | [ai-teaching-assistant-flow.html](../html-wireframe/ai-teaching-assistant-flow.html) | FR-selfomy-alignment-013, FR-selfomy-alignment-015, FR-selfomy-alignment-016, FR-selfomy-alignment-017 | Tải tệp PDF/Ảnh (`<= 15 MB`, `<= 20 trang`), chống trùng đề `0 credit`, tạm giữ `5 credit` bóc tách và đối chiếu 2 cột |
| 7 | `ai-grading-review-workspace` | Không gian Rà soát chấm bài AI 4 kỹ năng & Trợ giảng Chat AI | draft | [ai-teaching-assistant-flow](ai-teaching-assistant-flow.md) | [uc-ai-grading-review](../usecases/uc-ai-grading-review.md) | — | — | [ai-teaching-assistant-flow.html](../html-wireframe/ai-teaching-assistant-flow.html) | FR-selfomy-alignment-013, FR-selfomy-alignment-014, FR-selfomy-alignment-018, FR-selfomy-alignment-019, FR-selfomy-alignment-020, FR-selfomy-alignment-027, FR-selfomy-alignment-028 | Đối chiếu 2 cột bài làm và điểm nháp AI 4 tiêu chí, khóa nút `Chốt trả bài` với TA, tích hợp `Trợ giảng Chat AI` |
| 8 | `public-exam-room-config` | Cấu hình Phòng thi ảo công khai & Danh sách khách thi thử | draft | [growth-billing-and-center-flow](growth-billing-and-center-flow.md) | [uc-public-exam-lead](../usecases/uc-public-exam-lead.md) | — | — | [growth-billing-and-center-flow.html](../html-wireframe/growth-billing-and-center-flow.html) | FR-selfomy-alignment-021, FR-selfomy-alignment-023 | Bật/tắt đường dẫn công khai, cấu hình trần bảo vệ kép (`1 lượt/khách` & `20 credit/ngày/phòng`), quản lý `GuestLead` |
| 9 | `public-exam-guest-portal` | Cổng Phòng thi thử công khai cho khách vãng lai | draft | [growth-billing-and-center-flow](growth-billing-and-center-flow.md) | [uc-public-exam-lead](../usecases/uc-public-exam-lead.md) | — | — | [growth-billing-and-center-flow.html](../html-wireframe/growth-billing-and-center-flow.html) | FR-selfomy-alignment-022, FR-selfomy-alignment-023, FR-selfomy-alignment-027 | Thu thập Họ tên + Email + SĐT kèm đồng ý dữ liệu cá nhân (`NFR-006`), tự lưu tạm khi mất mạng, trả điểm Reading/Listening tức thì |
| 10 | `subscription-and-credit-wallet` | Thuê bao, Ví Credit AI & Thanh toán QR | draft | [growth-billing-and-center-flow](growth-billing-and-center-flow.md) | [uc-subscription-and-center-staff](../usecases/uc-subscription-and-center-staff.md) | — | — | [growth-billing-and-center-flow.html](../html-wireframe/growth-billing-and-center-flow.html) | FR-selfomy-alignment-011, FR-selfomy-alignment-013, FR-selfomy-alignment-014, FR-selfomy-alignment-024, FR-selfomy-alignment-025, FR-selfomy-alignment-026 | Quản lý gói thuê bao tháng (`200k/70Cr`, `350k/130Cr`, `500k/200Cr`, `3 ngày ân hạn`), gói Top-up (`149k/100Cr`), sinh mã QR `15 phút` và sổ cái Credit (`Shared Screen`) |
| 11 | `center-staff-and-quota` | Quản lý Nhân sự Trung tâm, Trần Credit cá nhân & Công cụ Admin | draft | [growth-billing-and-center-flow](growth-billing-and-center-flow.md) | [uc-subscription-and-center-staff](../usecases/uc-subscription-and-center-staff.md) | — | — | [growth-billing-and-center-flow.html](../html-wireframe/growth-billing-and-center-flow.html) | FR-selfomy-alignment-012, FR-selfomy-alignment-029, FR-selfomy-alignment-030, FR-selfomy-alignment-032 | Mời nhân sự 4 vai trò, đặt trần Credit AI cá nhân/tháng, xem chấm công/mục tiêu doanh thu trên `apps/web`; công cụ cấp gói/Credit & đối soát đơn QR trên `apps/admin` |

## 2. Thành phần Giao diện Dùng chung (Shared Shell & UI Conventions)

1. **Khung điều hướng quản trị (`sidebar-07` + `⌘K` trên `apps/web`)**:
   - Áp dụng cho các màn hình `[1]..[8]`, `[10]` và phân vùng Chủ trung tâm của `[11]`.
   - Thanh bên trái (`sidebar-07`) có thể thu gọn, hiển thị huy hiệu số dư **Ví Credit AI** theo thời gian thực và nhãn gói thuê bao hiện tại (`Dùng thử 30 credit` / `Cơ bản` / `Chuyên nghiệp` / `Nâng cao` / `Ân hạn 72h`).
   - Phím tắt tìm kiếm toàn cục `⌘K` (hoặc `Ctrl+K`) trên thanh đầu trang.
2. **Quy ước Bộ lọc trên Trang Danh sách (`URL Search Params` + `ChipFilter`)**:
   - Áp dụng trên `[2] daily-attendance`, `[4] student-debt-ledger`, `[5] notification-logs`, `[8] public-exam-room-config` và sổ cái trên `[10] subscription-and-credit-wallet`.
   - Ô tìm kiếm văn bản áp dụng `debounce 300ms` trước khi cập nhật URL; bộ lọc hai cấp dạng nhóm chip (`chip-filter.tsx`) có huy hiệu đếm gắn `aria-hidden="true"`.
3. **Đáp ứng Đa thiết bị (`Responsive 3 Viewports` theo `NFR-selfomy-alignment-008`)**:
   - **Desktop (`1440×900` / khung chuẩn `1024px`)**: Hiển thị đầy đủ bảng dữ liệu và bố cục 2 cột chia đôi trên `[6]`, `[7]`.
   - **Tablet (`768×1024`) & Mobile (`375×812`)**:
     - Màn `[2] daily-attendance` và `[4] student-debt-ledger` tự động chuyển dòng bảng thành thẻ xếp chồng dọc (`card stack`).
     - Màn `[6] ai-exam-import-workspace` và `[7] ai-grading-review-workspace` tự động gom 2 cột thành **2 Tab ngang** (*"Tài liệu / Bài làm gốc"* ↔ *"Bóc tách / Chấm điểm"*) kèm thanh hành động cố định dưới đáy (`sticky bottom action bar`).
     - Hộp thoại QR trên `[10] subscription-and-credit-wallet` hiển thị nút **Tải ảnh mã QR** và **Sao chép nhanh Số tài khoản + Nội dung chuyển khoản định danh**.

## 3. Liên kết Tài liệu

- Đặc tả SRS (Tầng 1): [[../srs/selfomy-alignment-spec.md|selfomy-alignment-spec.md]]
- Luồng người dùng (Tầng 3): [[../srs/selfomy-alignment-userflow.md|selfomy-alignment-userflow.md]]
- Cổng điều hướng HTML Wireframe: [[../html-wireframe/selfomy-alignment-wireframe.html|selfomy-alignment-wireframe.html]]
- Chỉ mục HTML Wireframe: [[../html-wireframe/selfomy-alignment-wireframe-html-index.md|selfomy-alignment-wireframe-html-index.md]]

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
