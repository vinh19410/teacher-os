# PM Status Report — Tiến độ & Độ sẵn sàng tính năng

**Ngày:** 2026-09-15 · **Branch:** develop · **Version:** 0.0.2

## Kết luận nhanh

Project ở **cuối M3 / trước M4 (pilot)**: 3/5 milestone hoàn thành (M1 vận hành lớp, M2 thu học phí, M3 go-live production). Nhóm tính năng cốt lõi luồng dạy học + thu phí **đã dùng được end-to-end trên production**. Nhóm assignment / report / settings persist / billing nâng cao **chưa dùng được** — bị loại có chủ đích khỏi roadmap, chỉ mở lại nếu pilot chứng minh blocker.

## Trạng thái milestone

| Milestone | Trạng thái | Bằng chứng |
|-----------|-----------|------------|
| M1 — Vận hành lớp | ✅ Hoàn thành (2026-08-23) | E2E CI xanh (PR #71–#76) |
| M2 — Thu học phí | ✅ Hoàn thành (2026-08-30) | E2E invoice + server test idempotency (PR #136, #137) |
| M3 — Go-live production | ✅ Hoàn thành (2026-08-31) | UAT r2/r2.1 GO, deploy CI pass, runbook |
| M4 — Pilot vận hành | ⬜ Chưa bắt đầu | — |
| M5 — Ổn định & quyết định | ⬜ Chưa bắt đầu | — |

Plans: 44 plan files, 42 có frontmatter `completed`, 2 `pending` — cả 2 đều là **trạng thái stale** (xem mục Blockers).

## ✅ ĐÃ DÙNG ĐƯỢC (production, HTTPS)

| Nhóm | Tính năng | Ghi chú |
|------|-----------|---------|
| Auth | Đăng nhập Google/email + bootstrap org | Google OAuth production pass theo deviation (email-auth evidence); round-trip Google thật verify khi onboard pilot đầu tiên |
| Lớp học | Tạo lớp (loại lớp + lịch structured), start date picker | |
| Học viên | Thêm học viên, enroll (picker học viên có sẵn #122), gói học không lớp (#104), detail row | |
| Buổi học | Tạo/sửa/hủy buổi từ lịch lớp (per-occurrence + bulk), projection trước enrollment đầu (#121) | |
| Điểm danh | Check-in/điểm danh tại chỗ trên tab Buổi học | |
| Giáo trình | Syllabus CRUD module→lesson, template import, xóa/đổi thứ tự, **Excel/CSV import (#144, PR #146 — mới nhất, 2026-09-14)** | 1 todo e2e-CI chưa backfill checkbox (commit a2314ef đã fix e2e) |
| Lịch + Dashboard | /schedule nav tuần thật, "buổi hôm nay" + học viên rủi ro từ data thật | 0 số hardcode |
| Class Detail | 3 tab: Học viên / Buổi học (merged Giáo trình+Lịch học) / Ghi chú | |
| Tài chính | Tạo invoice (amount/due/note), mark-paid idempotent, KPI đã thu/còn nợ từ data thật | |
| Khác | Profile page (avatar/tên/link Google), global search (#109), collapsible sidebar | |

## ❌ CHƯA DÙNG ĐƯỢC

| Tính năng | Trạng thái | Lý do |
|-----------|-----------|-------|
| Tạo assignment | Non-goal hiện tại | Chỉ thêm nếu pilot chứng minh blocker (M5) |
| Tạo/gửi report | Non-goal hiện tại | Như trên |
| Settings persist | Non-goal hiện tại | Như trên |
| Billing "Quản lý thanh toán" | Disabled + nhãn "Sắp ra mắt" (#138) | Định vị có chủ đích |
| Pilot thật | M4 chưa bắt đầu | Cần onboard giáo viên đầu tiên |

## ⚠️ Blockers & việc cần dọn

1. **Plan `260826-1611-merge-tabs` frontmatter vẫn `pending`** dù đã ship: code Class Detail đã là 3 tab (roster/sessions/notes) đúng thiết kế. Cần verify DOD rồi đổi `completed`.
2. **Plan `260821-0935-unblock-UAT` frontmatter vẫn `pending`** dù 5 operator inputs #41 đã đóng với evidence (M3 DOD tick). Stale — cần đổi `completed`.
3. **Plan `260914 syllabus-import` còn 1 checkbox e2e-CI** chưa backfill dù PR #146 merged.
4. **M4 chưa có hành động khởi động**: cần chọn + onboard giáo viên pilot để verify Google OAuth round-trip thật (deviation M3) và bắt đầu pilot log.

## Next steps (theo thứ tự ưu tiên)

1. Reconcile 3 plan statuses stale (sync-back theo DOD evidence).
2. Khởi động M4: onboard giáo viên pilot đầu tiên → xác nhận Google OAuth round-trip production.
3. Thiết lập pilot log (severity/frequency/workflow impact) trước khi pilot bắt đầu.
