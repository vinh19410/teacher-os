# Project Roadmap

## Mục đích

Đưa Teacher OS từ nền tảng dữ liệu đã persist sang vận hành lớp thật qua pilot có kiểm soát. Roadmap này là nguồn trạng thái hiện tại cho người và AI collaborator; chi tiết tư vấn, kế hoạch thực thi và bằng chứng lịch sử ở `plans/`.

## Phạm vi đã chốt

- Trong 90 ngày, một người full-time đưa app qua UAT production và pilot với một giáo viên quản lý 2–3 lớp.
- Luồng cần vận hành xuyên suốt: học viên/lớp → buổi học → điểm danh và tiến độ → ghi nhận thu phí.
- Có browser E2E cho luồng lõi, log phản hồi pilot và triage lỗi.

Không nằm trong roadmap này: parent login, Zalo/GCal, mời hoặc quản trị nhiều giáo viên, dark mode, reports/assignments đầy đủ, và dashboard KPI toàn diện. Chỉ thay đổi non-goal khi pilot chứng minh nó đang chặn vận hành lớp.

## Các mốc

| Mốc | Trạng thái | Gate hoàn thành | Owner thực thi |
| --- | --- | --- | --- |
| Production readiness | Blocked | UAT trên môi trường D1 thật pass cho sign-in, bootstrap org, CRUD kernel và reload; có checklist rollback/support. Pre-deploy gates 2026-08-20: local gates xanh, rehearsal/DR có evidence, nhưng NO-GO vì thiếu input operator — xem [evidence](../plans/260819-2034-production-readiness/reports/uat-evidence-phase-06.md) và blocker #41 | [README](../README.md), [architecture](./system-architecture.md), hạ tầng trong `packages/infra/` |
| Pilot-ready class operations | Chưa bắt đầu | Giáo viên có thể tạo và vận hành 2–3 lớp với lịch, điểm danh, tiến độ data thật; E2E luồng lớp xanh | Web schedule, server kernel routes, schema lesson và test browser |
| Money loop | Chưa bắt đầu | Tạo invoice, ghi nhận đã thu và xem trạng thái đúng sau reload; E2E luồng thu phí xanh | Web tuition/modal, server invoice route, schema invoice |
| Pilot vận hành | Chưa bắt đầu | Một giáo viên dùng hằng ngày ít nhất hai tuần; issue log có severity, frequency và workflow impact | Pilot log ngoài repo hoặc tracker được chọn |
| Stabilize & quyết định | Chưa bắt đầu | Không còn pilot blocker mở quá một ngày làm việc; có quyết định mở rộng, lặp pilot hoặc đổi hướng dựa trên evidence | Regression suite, pilot log và decision record |

## Thước đo thành công

- UAT live pass toàn bộ luồng sign-in → lớp/học viên/enrollment → reload.
- CI có ít nhất hai E2E workflow xanh: vận hành lớp và tạo/thu invoice.
- Không còn CTA no-op trong luồng đã chọn.
- Giáo viên pilot có hoạt động vận hành ít nhất 8 trong 10 ngày làm việc pilot.
- Không có mất dữ liệu được xác nhận sau reload trong pilot.

## Quy ước cập nhật

Mỗi lần hoàn thành một mốc hoặc một hạng mục có thể ảnh hưởng gate:

1. Cập nhật trạng thái mốc trong bảng này (`Chưa bắt đầu` → `Đang thực hiện` → `Hoàn thành` hoặc `Blocked`).
2. Thay gate bằng kết quả đã xác minh và liên kết đến owner/bằng chứng phù hợp: test, workflow CI, deploy runbook hoặc báo cáo pilot.
3. Ghi blocker hoặc thay đổi phạm vi chỉ khi chúng ảnh hưởng mục tiêu pilot; không ghi nhật ký triển khai vụn vặt vào tài liệu này.
4. Cập nhật [docs index](./index.md) nếu đường dẫn hoặc authority của roadmap thay đổi.

Không đánh dấu `Hoàn thành` chỉ vì code đã merge: gate phải có bằng chứng tương ứng. Khi roadmap đổi hướng vì evidence pilot, cập nhật phạm vi, non-goal và thước đo trước khi thêm mốc mới.

## Nguồn quyết định

- [Project Overview PDR](./project-overview-pdr.md) — product contract và invariant bền vững.
- [System Architecture](./system-architecture.md) — request/data boundaries hiện tại.
- [Pilot-first advisory report](../plans/reports/advise-2026-08-19-pilot-first-90-day-roadmap.md) — rationale, alternatives, work checklist và trade-offs đã xác nhận.
