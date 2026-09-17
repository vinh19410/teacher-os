---
title: "fix-107-mock-data-reports-prefill"
description: "Loại bỏ mock data lộ vào báo cáo phụ huynh, nhật ký gửi tin nhắn và modal prefill báo cáo tuần — issue #107 QC P1"
status: completed
priority: P1
effort: "2h"
tags: [bugfix, reports, mock-data, qc]
created: 2026-09-17
issue: 107
branch: fix/107-mock-data-reports-prefill
route: bugfix
mode: beta
---

# fix-107-mock-data-reports-prefill

## Overview

QC phát hiện trên account thật (`usertest1@mail.com`), trang Báo cáo phụ huynh (`/reports`) và modal "Tạo báo cáo tuần" (`CreateReportModal`) đang hiển thị dữ liệu mock hardcode kế thừa từ open-design HTML prototype:

1. **Nhật ký gửi tin nhắn:** Mảng tĩnh `sendLog` chứa thông tin học viên "Minh Anh", "Quốc Bảo" với các ngày cũ `17–18/08` (trong khi account thật không có các học viên này và ngày kiểm thử là 27/08/2026).
2. **PageHead lead:** Hardcode `Gửi qua Zalo OA · 4 báo cáo tuần này` ngay cả khi account không có báo cáo nào.
3. **Modal Tạo báo cáo tuần:** Prefill chu kỳ hardcode `19–25/08` và nội dung báo cáo bịa (`Số buổi: 2 · Chuyên cần: Đủ`, `Band gần nhất: 6.5 (Writing)`, `Task 2 Opinion Essay`, `Bar chart`, `article a/an`), ngay cả khi học viên mới có 0 buổi học (ví dụ `QC-TEST-1` = 0 buổi).

## Root Cause (đã xác minh bằng code, không đoán)

- `apps/web/src/routes/_auth/reports.tsx:28-59`: `const sendLog = [...]` hardcode 5 bản ghi mock với Minh Anh, Quốc Bảo, Task 2 University. Dưới UI render vô điều kiện trong `<Card>{sendLog.map(...)}</Card>`.
- `apps/web/src/routes/_auth/reports.tsx:69`: `lead="Gửi qua Zalo OA · 4 báo cáo tuần này"` hardcode chuỗi "4 báo cáo tuần này" của open-design mock.
- `apps/web/src/components/modals/create-report-modal.tsx:7-14`: `const DEFAULT_CONTENT = ...` chứa nội dung bịa.
- `apps/web/src/components/modals/create-report-modal.tsx:29-30`: `useState("19–25/08")` và `useState(DEFAULT_CONTENT)` gán sẵn chu kỳ và nội dung bịa vào input value, tạo rủi ro giáo viên gửi nhầm dữ liệu sai cho phụ huynh.
- `apps/web/src/components/modals/create-report-modal.tsx:43-49`: `<Select value={sid}>` không có option fallback khi `data.students` rỗng.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Xóa toàn bộ mock data tĩnh khỏi `reports.tsx` (Minh Anh, Quốc Bảo, 17–18/08, 4 báo cáo tuần này). | P1 |
| 2 | Chuyển `sendLog` và bảng "Báo cáo đã gửi" sang derive động từ `data.reports`: khi account trống (0 báo cáo), hiện empty state rõ ràng, không hiện mock data. | P1 |
| 3 | PageHead lead phản ánh số lượng báo cáo thực tế từ `data.reports` (`0 báo cáo` thì không gắn số đếm hardcode). | P2 |
| 4 | `CreateReportModal`: gỡ bỏ `DEFAULT_CONTENT` và chu kỳ `"19–25/08"`; prefill mặc định là chuỗi rỗng `""` (với placeholder hướng dẫn); khi chưa có học viên thì select có placeholder rõ ràng. | P1 |
| 5 | Bổ sung ban-list contract test trong `kernel-runtime.contract.test.ts` để ngăn chặn triệt để mock data quay trở lại. | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Remove mock data from reports and prefill modal](./phase-01-remove-mock-data-reports-prefill.md) | Completed |

## Success Criteria

- [x] `apps/web/src/routes/_auth/reports.tsx` không chứa bất kỳ tên học viên mock (`Minh Anh`, `Quốc Bảo`), ngày mock (`18/08`, `17/08`), text mock (`Task 2 University`), hoặc text hardcode KPI (`4 báo cáo tuần này`).
- [x] Khi account có 0 báo cáo trong `data.reports`:
  - "Báo cáo đã gửi" hiện empty state: `Chưa có báo cáo nào được gửi.`
  - "Nhật ký gửi tin nhắn" hiện empty state: `Chưa có nhật ký gửi tin nhắn.`
  - PageHead lead là `Gửi qua Zalo OA`.
- [x] Khi account có báo cáo trong `data.reports`:
  - Bảng "Báo cáo đã gửi" render danh sách báo cáo thật của account.
  - "Nhật ký gửi tin nhắn" render các báo cáo có trạng thái `sent` hoặc `read` của account.
  - PageHead lead là `Gửi qua Zalo OA · ${count} báo cáo`.
- [x] `CreateReportModal`:
  - `period` khởi tạo là chuỗi rỗng `""`, có placeholder `VD: 01–07/09`.
  - `content` khởi tạo là chuỗi rỗng `""`, có placeholder `Nhập nội dung báo cáo...`.
  - Không còn chứa `DEFAULT_CONTENT`, không còn chữ `Task 2 Opinion Essay`, `Bar chart`, `article a/an`.
  - Khi `data.students` rỗng, select có `<option value="">Chưa có học viên</option>`.
- [x] Bộ contract test trong `kernel-runtime.contract.test.ts` bổ sung negative assertions (ban-list) cho `reports.tsx` và `create-report-modal.tsx`, đảm bảo không vi phạm contract.
- [x] `pnpm --filter web test` chạy xanh 100%.
## Scope Boundary / Non-goals

- Không tạo bảng mới `send_log` trong database: D1 schema hiện tại chưa có write route cho report creation/sending (Wave 7 giữ creation là no-op / modal-only flow); nhật ký tin nhắn lấy nguồn thật duy nhất hiện có trong kernel snapshot là `data.reports`.
- Không thay đổi hành vi submit modal: Save Draft và Send trong `CreateReportModal` vẫn tuân thủ contract close-only của Wave 7 (không dispatch write lên server khi chưa có endpoint).
- Không sửa các route khác không liên quan đến issue #107.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/reports.tsx` (loại bỏ mock `sendLog`, derive động từ `data.reports`, empty states, dynamic PageHead lead)
- Modify: `apps/web/src/components/modals/create-report-modal.tsx` (xóa `DEFAULT_CONTENT`, rỗng prefill `period` và `content`, empty student placeholder)
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (thêm ban-list contract tests cho `reports.tsx` và `create-report-modal.tsx`)

## Risks & Mitigations

- **Risk:** Modal mở lại nhiều lần nếu dùng unmounted state có thể không reset.
  - **Mitigation:** Giữ state trong modal; khi mở lại với `defaultStudentId` hoặc giá trị mặc định, form bắt đầu sạch với empty content và empty period.
- **Risk:** `data.reports` có thể có trạng thái `draft` chưa gửi.
  - **Mitigation:** `sendLog` chỉ derive từ các report đã gửi (`r.status === "sent" || r.status === "read"`), không đưa bản nháp vào nhật ký gửi tin nhắn.

## Red Team Review

### Session — 2026-09-17
**Findings:** 4 (4 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 2 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `data.reports` chứa cả draft reports; nếu log lấy toàn bộ `data.reports` thì draft chưa gửi sẽ xuất hiện trong "Nhật ký gửi tin nhắn". | High | Accept | Phase 1 (Filter `r.status === "sent" \|\| r.status === "read"`) |
| 2 | Khi `data.students` rỗng, `<Select value={sid}>` không có `<option>` nào, dẫn tới UI select cụt và `sid` undefined. | High | Accept | Phase 1 (Thêm `<option value="">Chưa có học viên</option>`) |
| 3 | Contract test hiện chỉ kiểm tra submit close-only, thiếu kiểm tra ban-list âm tính cho `reports.tsx` và `create-report-modal.tsx` giống như `dashboard.tsx` và `schedule.tsx`. | Medium | Accept | Phase 1 (Bổ sung đầy đủ ban-list regex vào contract test) |
| 4 | `PageHead` lead hardcode `4 báo cáo tuần này` nếu sửa thành `data.reports.length` cần xử lý số ít/số nhiều và trường hợp 0 báo cáo. | Medium | Accept | Phase 1 (`count > 0 ? \`Gửi qua Zalo OA · \${count} báo cáo\` : "Gửi qua Zalo OA"`) |

### Whole-Plan Consistency Sweep

- Đã đối chiếu `plan.md` và `phase-01-remove-mock-data-reports-prefill.md`:
  - Scope và acceptance criteria nhất quán: không có bảng `send_log` mới, derive từ `data.reports`.
  - Danh sách ban-list và regex cấm nhất quán giữa contract test spec và code files.
  - Các trường hợp account rỗng vs account có dữ liệu được định nghĩa đồng bộ.
- Không còn mâu thuẫn nội bộ.

<!-- slug: 107-mock-data-reports-prefill -->
