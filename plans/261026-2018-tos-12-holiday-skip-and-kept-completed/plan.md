---
title: "TOS-12: Buổi bù nhảy qua kỳ nghỉ khác và bảo vệ ca đã điểm danh"
description: "Hiển thị chú thích (*) khi ngày bù nhảy qua kỳ nghỉ khác và nhãn 'Giữ nguyên — Đã diễn ra' cho buổi đã điểm danh trên Bảng xem trước Lịch nghỉ chung; khóa hành vi bằng test server + E2E 2 scenario AC-002."
status: pending
priority: P1
effort: 1d
issue: 446
branch: feat/tos-12-holiday-skip-kept-completed
tags: [feature, frontend, backend, e2e]
blockedBy: [445]
blocks: [448]
created: 2026-10-26
---

# Plan: TOS-12 — Nhảy qua kỳ nghỉ khác và bảo vệ ca đã điểm danh

## Overview

AC-002 của US-002 có hai luật:

1. Ngày bù dự kiến ở cuối khóa trùng một kỳ nghỉ đã khai báo trước đó thì nhảy sang ngày học hợp lệ kế tiếp của lớp (ví dụ lớp "IELTS 5.0B" học T3 & T7: 26/12/2026 là ngày nghỉ → bù vào T3 29/12/2026).
2. Buổi trong khoảng nghỉ đã có điểm danh thì hiện nhãn **"Giữ nguyên — Đã diễn ra"** trên Bảng xem trước và không bị dời hay hủy.

Theo quyết định D1 của plan TOS-11 ([#445](https://github.com/vinh19410/teacher-os/issues/445), `plans/261026-2007-tos-11-holiday-shift-makeup/plan.md`), thuật toán của cả hai luật **đã nằm trong `planHolidayShift`** (`skippedHolidayDates`, `keptCompleted`). Ticket này làm phần hiển thị, khóa hành vi bằng test ở tầng route, và E2E hai scenario.

Nguồn: Jira [TOS-12](https://teacher-os.atlassian.net/browse/TOS-12) (subtask TOS-9 / US-002 · AC-002), FR-selfomy-alignment-007/008, BR-selfomy-alignment-003, wireframe `docs/selfomy-alignment/ascii-wireframe/daily-ops-and-holiday-flow.md` (Screen `schedule-and-holiday-modal`, mục [9]).

## Scope Challenge

- **Có sẵn sau TOS-11:** planner trả `skippedHolidayDates` trên mỗi shift và mảng `keptCompleted`; hộp thoại render `keptCompleted` thành dòng xám không nhãn; apply tính lại từ DB và guard `status='upcoming'`.
- **Còn thiếu:** chú thích `(*)` + ghi chú giải thích dưới bảng; nhãn "Giữ nguyên — Đã diễn ra"; test route chứng minh kỳ nghỉ đã *lưu trong DB* (không chỉ trong input thuần) làm ngày bù nhảy; E2E.
- **Mode:** fast, HOLD SCOPE. Không migration, không endpoint mới.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Không viết lại thuật toán; nếu test phase 1 đỏ thì sửa trong `packages/api/src/holiday-plan.ts` và loader `apps/server/src/routes/holidays.ts`. | Một nguồn tính toán cho preview và apply (D7 của TOS-11). |
| D2 | "Đã điểm danh" = buổi có ít nhất 1 dòng `lesson.status ∈ {completed, absent}` (đúng định nghĩa `keptCompleted` của planner). Buổi trộn (một học viên đã điểm danh, người khác còn `upcoming`) cũng giữ nguyên cả buổi. | Buổi là occurrence vật lý `classId + date`; không tách đôi một buổi. |
| D3 | Chú thích `(*)` gắn vào ngày bù, ghi chú dưới bảng liệt kê tên kỳ nghỉ bị nhảy qua: "*Ngày dự kiến 26/12 trùng «Nghỉ Tết Dương lịch» nên tự nhảy sang T3, 29/12/2026". Preview trả thêm `skippedHolidays: {date, holidayName}[]` thay cho mảng ngày trần. | Wireframe ghi rõ tên kỳ nghỉ; client không có map ngày → tên. |
| D4 | Nhãn "Giữ nguyên — Đã diễn ra" dùng `Badge` tone `muted` + icon `(!)`, dòng không thao tác, không đếm vào "N buổi sẽ được xử lý". | Wireframe mục [9]. |

## Non-goals

- Phương thức "Hủy buổi" và hoàn tác → TOS-13 (nhãn "Giữ nguyên — Đã diễn ra" ở ticket này áp dụng cho cả hai phương thức vì cùng component).
- Đổi thuật toán chọn ngày bù ngoài hai luật trên.

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-preview-contract-and-route-tests.md](phase-01-preview-contract-and-route-tests.md): `skippedHolidays` có tên, test route với kỳ nghỉ đã lưu + buổi đã điểm danh | 3h | pending | #445 merged |
| 2 | [phase-02-preview-table-labels.md](phase-02-preview-table-labels.md): chú thích `(*)`, ghi chú, nhãn "Giữ nguyên — Đã diễn ra", 3 viewport | 2h | pending | 1 |
| 3 | [phase-03-e2e-ac-002.md](phase-03-e2e-ac-002.md): E2E 2 scenario AC-002 | 2h | pending | 2 |

## Acceptance criteria (từ AC-002)

- [ ] Lớp T3 & T7 có 26/12/2026 là ngày nghỉ đã khai báo; tạo kỳ nghỉ mới làm dời 1 buổi mà ngày bù kế tiếp là 26/12 → bảng xem trước và dữ liệu sau apply đều cho ngày bù 29/12/2026, ngày bù có `(*)` kèm ghi chú tên kỳ nghỉ bị nhảy qua.
- [ ] Buổi 20/11/2026 của "Giao tiếp 1" đã điểm danh; kỳ nghỉ toàn tổ chức bao 20/11 → dòng hiện "Giữ nguyên — Đã diễn ra", sau apply mọi dòng lesson của buổi đó giữ nguyên status, không có shift/buổi bù cho buổi đó.
- [ ] `pnpm check`, `pnpm check-types`, test package bị đụng, E2E AC-002 xanh.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| TOS-11 đổi shape preview khi implement. | Phase 1 đọc lại `HolidayPreview` thực tế trên `develop` trước khi sửa contract. |
| Kỳ nghỉ scope "lớp chọn" không áp cho lớp khác nhưng vẫn làm nhảy. | Test route: kỳ nghỉ chỉ cho lớp A không làm ngày bù lớp B nhảy. |

## Unresolved questions

- Không có câu hỏi chặn.
