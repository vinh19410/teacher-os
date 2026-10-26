---
type: wireframe-html-index
feature: selfomy-alignment
status: draft
updated: 2026-10-26
primary_device: desktop
links:
  - docs/selfomy-alignment/srs/selfomy-alignment-spec.md
  - docs/selfomy-alignment/srs/selfomy-alignment-userflow.md
  - docs/selfomy-alignment/ascii-wireframe/selfomy-alignment-wireframe-index.md
---

# selfomy-alignment — HTML Wireframe Index

> Bộ bản vẽ HTML tương tác đen-trắng (`lo-fi B&W wireframe`) cho 11 màn hình của tính năng **selfomy-alignment**, hiển thị trong khung thiết bị chuẩn **`desktop` (`1024px`)** và hỗ trợ chuyển đổi trạng thái (`Happy / Empty / Error / Edge`) cũng như bật/tắt chú thích đánh số `#[n]` đối chiếu 1-1 với bảng đặc tả trong [[../ascii-wireframe/selfomy-alignment-wireframe-index.md|ASCII Wireframe Index]].

## 1. Cổng Điều hướng Tổng (Navigation Entry Point)

- **File mở trực tiếp trên trình duyệt**: [[selfomy-alignment-wireframe.html|selfomy-alignment-wireframe.html]]
- Bao gồm thanh chuyển đổi 4 luồng UX, nhúng trực tiếp từng file `.html` qua `iframe` và tab **Sơ đồ chuyển màn tổng quan (Flow Map)**.

## Flows

| # | Flow-slug | File | Đặc tả ASCII đối ứng | Screens |
|---|-----------|------|----------------------|---------|
| 1 | `daily-ops-and-holiday-flow` | [daily-ops-and-holiday-flow.html](daily-ops-and-holiday-flow.html) | [daily-ops-and-holiday-flow.md](../ascii-wireframe/daily-ops-and-holiday-flow.md) | dashboard-reminders, daily-attendance, schedule-and-holiday-modal |
| 2 | `debt-and-notification-flow` | [debt-and-notification-flow.html](debt-and-notification-flow.html) | [debt-and-notification-flow.md](../ascii-wireframe/debt-and-notification-flow.md) | student-debt-ledger, notification-logs |
| 3 | `ai-teaching-assistant-flow` | [ai-teaching-assistant-flow.html](ai-teaching-assistant-flow.html) | [ai-teaching-assistant-flow.md](../ascii-wireframe/ai-teaching-assistant-flow.md) | ai-exam-import-workspace, ai-grading-review-workspace |
| 4 | `growth-billing-and-center-flow` | [growth-billing-and-center-flow.html](growth-billing-and-center-flow.html) | [growth-billing-and-center-flow.md](../ascii-wireframe/growth-billing-and-center-flow.md) | public-exam-room-config, public-exam-guest-portal, subscription-and-credit-wallet, center-staff-and-quota |

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
