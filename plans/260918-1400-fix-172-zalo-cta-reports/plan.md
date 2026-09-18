---
title: "Fix #172: CTA 'Gửi qua Zalo OA' trên Reports phản ánh đúng trạng thái kết nối kênh"
description: "Empty state của /reports hiển thị subtitle 'Gửi qua Zalo OA' dù chưa kết nối kênh Zalo OA nào. Khắc phục bằng cách ẩn CTA 'Gửi qua Zalo OA' khi chưa có kênh kết nối, hiển thị số lượng báo cáo và badge trạng thái kênh trung thực (Zalo OA: Chưa kết nối), cập nhật nhãn kênh trong modal tạo báo cáo và bổ sung unit test cho /reports."
status: completed
priority: P3
effort: 1h
issue: 172
branch: vinh19410/issue-172-zalo-cta-reports
tags: [frontend, bugfix, reports, zalo-oa, empty-state, ux]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #172: CTA 'Gửi qua Zalo OA' trên Reports phản ánh đúng trạng thái kết nối kênh

## Overview

Theo Dogfood QA vòng 1 (issue #13 trong `dogfood-output/report.md` và GitHub Issue #172), khi người dùng mở trang `/reports` ở trạng thái empty (chưa có báo cáo), phần `PageHead lead` hiển thị cứng `"Gửi qua Zalo OA"` (`apps/web/src/routes/_auth/reports.tsx:56-57`) dù chưa kết nối bất kỳ kênh Zalo OA nào. Không có trạng thái kết nối, không disable, gây hiểu lầm là hệ thống đã tích hợp và đang tự động gửi báo cáo qua Zalo OA.

Thực tế kiểm tra kiến trúc:
- Hệ thống Teacher OS hiện chưa tích hợp kênh gửi tin nhắn Zalo OA thật; comment tại `packages/api/src/contracts.ts:278` nêu rõ: `channel is metadata only (no real delivery yet)`.
- Khi chưa có báo cáo (`reportCount === 0`), `lead` hiển thị `"Gửi qua Zalo OA"` là do ternary `reportCount > 0 ? \`Gửi qua Zalo OA · \${reportCount} báo cáo\` : "Gửi qua Zalo OA"` còn sót lại từ đợt dọn mock data (#107).
- Giải pháp trung thực theo tiêu chuẩn QC ("CTA phản ánh trạng thái kết nối: disable kèm hướng dẫn connect, hoặc ẩn khi chưa có kênh"):
  1. Khi chưa có kênh kết nối (trạng thái hiện tại): Ẩn CTA/claim "Gửi qua Zalo OA" khỏi empty state. `PageHead lead` hiển thị số lượng báo cáo (`Chưa có báo cáo nào` khi 0 hoặc `\${reportCount} báo cáo` khi có) kèm Badge trạng thái kênh trung thực `Zalo OA: Chưa kết nối`.
  2. Trong `CreateReportModal`: Cập nhật tùy chọn kênh gửi thành `Zalo OA (Chưa kết nối)` để thông báo rõ cho giáo viên khi chọn kênh, giữ nguyên value `"Zalo OA"` tương thích schema `reportCreateSchema`.
  3. Viết unit test `apps/web/src/routes/_auth/reports.test.tsx` kiểm thử cả 2 trạng thái: empty state (chưa có báo cáo, badge chưa kết nối, không có claim "Gửi qua Zalo OA" sai lệch) và populated state (hiển thị danh sách báo cáo, nhật ký gửi tin).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Ẩn claim "Gửi qua Zalo OA" ở empty state khi chưa kết nối kênh; lead hiển thị "Chưa có báo cáo nào" và badge "Zalo OA: Chưa kết nối" | P3 |
| 2 | Khi có báo cáo, hiển thị số lượng báo cáo cùng badge trạng thái kênh | P3 |
| 3 | Cập nhật nhãn chọn kênh trong CreateReportModal thành "Zalo OA (Chưa kết nối)" | P3 |
| 4 | Bổ sung unit test toàn diện cho ReportsRoute trong `reports.test.tsx` | P3 |
| 5 | Đảm bảo toàn bộ test suites (`pnpm test`, `pnpm check`, `pnpm check-types`) pass sạch | P1 |

## Non-Goals

- Không triển khai Zalo OA OAuth flow hoặc webhook trong phạm vi issue này (chưa có infra/credentials Zalo OA).
- Không sửa đổi database schema hay contract API `reportCreateSchema`.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Phản ánh trạng thái kết nối Zalo OA trên ReportsRoute và CreateReportModal](./phase-01-zalo-cta-reports.md) | Completed |

## Success Criteria

- [x] Khi `data.reports.length === 0`: `PageHead lead` hiển thị "Chưa có báo cáo nào" kèm badge "Zalo OA: Chưa kết nối", không còn chuỗi "Gửi qua Zalo OA" không có ngữ cảnh.
- [x] Khi `data.reports.length > 0`: `PageHead lead` hiển thị số lượng báo cáo (ví dụ: `2 báo cáo`) kèm badge trạng thái kênh.
- [x] `CreateReportModal` hiển thị rõ trạng thái `Zalo OA (Chưa kết nối)` trong danh sách chọn kênh.
- [x] Unit test `reports.test.tsx` pass 100%.
- [x] `pnpm test`, `pnpm check`, `pnpm check-types` pass sạch.
