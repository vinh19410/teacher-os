---
title: "Khóa view-only mục Kỹ năng và Tổng số buổi khi đã base theo syllabus trong modal tạo lớp"
description: "Khi template syllabus được chọn, chips 'Kỹ năng' và ô 'Tổng số buổi' hiển thị view-only theo dữ liệu syllabus; chỉ editable với lớp trống hoặc syllabus thiếu dữ liệu tương ứng."
status: pending
priority: P2
effort: 2h
issue: 236
branch: vinh19410/feat/class-modal-view-only-syllabus-fields
tags: [feature, frontend]
blockedBy: [260922-1107-class-modal-auto-sessions]
blocks: []
created: 2026-09-22
---

# Khóa view-only mục Kỹ năng và Tổng số buổi khi đã base theo syllabus trong modal tạo lớp

## Overview

Kế thừa 2 thay đổi liền trước trong `AddClassModal` (`apps/web/src/components/modals/add-class-modal.tsx`): PR #234 (issue #232, đã merge) auto bật chips kỹ năng theo syllabus chọn, và plan `260922-1107-class-modal-auto-sessions` (issue #235) auto điền "Tổng số buổi" theo tổng buổi syllabus. Hiện người dùng vẫn sửa tay được cả hai sau khi auto-fill.

Yêu cầu mới: **khi một mục đã được base theo syllabus thì mục đó chỉ nên view-only** — chips "Kỹ năng" không toggle được và ô "Tổng số buổi" không gõ được, vì giá trị của chúng đang do syllabus quyết định. Chọn "— Lớp trống —" (hoặc syllabus thiếu dữ liệu tương ứng: 0 kỹ năng / 0 buổi) → mục đó quay về editable như cũ. Không đổi payload, kernel, validation, hay `ClassTemplatePicker`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chọn syllabus có kỹ năng → chips "Kỹ năng" disabled (giá trị theo syllabus, không toggle được) | P1 |
| 2 | Chọn syllabus có buổi học → ô "Tổng số buổi" disabled (giá trị theo syllabus từ #235) | P1 |
| 3 | "— Lớp trống —" hoặc syllabus 0 kỹ năng / 0 buổi → mục tương ứng editable như cũ (khóa theo từng field) | P1 |
| 4 | Payload `add-class`, validation 1..52, reset form, contract test hiện có không đổi | P1 |

## Phases

| Phase | Name | Status |
| ----- | ---- | ------ |
| 1 | [UI — khóa view-only 2 mục theo syllabus](./phase-01-ui-view-only-fields.md) | Pending |
| 2 | [Tests — unit ChipMulti, contract regex, e2e guard](./phase-02-tests-e2e.md) | Pending |

## Design Decisions

- **Điều kiện khóa = điều kiện auto-fill, tính theo từng field.** `skillsLocked` khi template được chọn có `skills.length > 0` (y hệt điều kiện `setSkills` của PR #234 tại `add-class-modal.tsx:149`); `sessionsLocked` khi template có ≥1 buổi qua `sessionsFromTemplate` (y hệt điều kiện `setTotal` của #235). Nghĩa là: **mục chỉ bị khóa đúng khi giá trị của nó đang do syllabus quyết định** — không có trạng thái "khóa nhưng giá trị không theo syllabus".
- **Không theo dõi "user đã sửa tay"** (không có cờ touched, không có mixed state). Chọn template = khóa; lớp trống = tự do. Đơn giản, dự đoán được, và đúng ý "đã base theo syllabus thì view only".
- **`disabled` thay vì `readOnly` cho input số buổi**: chặn cả gõ lẫn spinner, chuẩn a11y (`toBeDisabled` của Playwright khớp trực tiếp). Disabled input không tham gia native form submit nhưng form này tự build payload từ state `total` → `sessionsTotal` vẫn gửi đúng giá trị.
- **`ChipMulti` nhận prop `disabled?: boolean` mới (optional)** → mọi chỗ dùng khác (Loại lớp, Ngày học, các modal khác) không đổi behavior. Chip disabled giữ `aria-pressed` (giá trị vẫn đọc được bởi screen reader) + thêm `disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60` để chặn feedback hover và thể hiện rõ trạng thái xem.
- **Syllabus > 52 buổi: input vẫn khóa; submit báo lỗi cap hiện có "Tổng số buổi tối đa là 52."** Người dùng thoát bằng cách đổi template khác hoặc về "— Lớp trống —". Không clamp, không làm message riêng — edge hiếm (nhất quán với non-goal của #235), và lỗi vẫn trung thực về nguyên nhân.
- **Không thêm hint text "theo syllabus"/toast**: nhất quán non-goal của #235; `ClassTemplatePicker` đã hiển thị dòng "Kỹ năng giáo trình: [tags]" ngay cạnh làm rõ nguồn giá trị.
- **Không đụng gì đã khóa bởi contract test** (`kernel-runtime.contract.test.ts:150-155`): `<Field label="Template giáo trình">`, `templateId,` liền trước `schedule:`, `setTemplateId("")` trong `resetForm`. Handler `changeTemplateId` và payload giữ nguyên — thay đổi thuần UI render.
- **`ClassTemplatePicker` không đổi** — vẫn display-only; modal tự tìm `selectedTemplate` từ `templates` của `useSyllabus()` (đầy đủ `skills` + `modules`, pattern #235 đã chốt) để tính 2 cờ khóa.

## Non-Goals

- Đổi backend, kernel command `add-class`, contracts, schema, payload shape.
- Nút "ghi đè tay" để mở khóa có điều kiện, hay khóa/mở theo trạng thái touched.
- Thay input bằng display row / Tag cho số buổi (giữ nguyên layout form).
- Thêm hint, tooltip, toast giải thích trạng thái khóa.
- Đổi `ClassTemplatePicker` (props, rendering, option label).
- Sửa behavior auto-fill (thuộc #235, giữ nguyên).

## Success Criteria

- [ ] Chọn syllabus có kỹ năng + có buổi → chips "Kỹ năng" và ô "Tổng số buổi" đều disabled với đúng giá trị theo syllabus.
- [ ] Chọn "— Lớp trống —" → cả hai editable như hiện trạng.
- [ ] Syllabus 0 kỹ năng → chips editable (tự chọn, validation ≥1 kỹ năng chạy như cũ); syllabus 0 buổi → ô số buổi editable (khóa theo field).
- [ ] Chip disabled vẫn giữ `aria-pressed` đúng giá trị; submit vẫn gửi `skills`/`sessionsTotal` đúng từ state.
- [ ] Payload `add-class` shape không đổi; `resetForm()` vẫn reset về editable (templateId "").
- [ ] `pnpm --filter web test` pass (unit ChipMulti + contract regex + test render hiện có).
- [ ] `pnpm check` pass; 2 e2e specs `syllabus-test-session-mark`, `syllabus-detail-import-overwrite` pass với assert khóa mới.

## Dependencies

- **blockedBy plan `260922-1107-class-modal-auto-sessions` (issue #235, pending)**: phase 1 dùng helper `sessionsFromTemplate` và phase 2 assert trên e2e assert giá trị "5"/"12" mà #235 thêm. Cook #235 xong rồi cook plan này — nếu không, ô số buổi sẽ khóa ở giá trị mặc định "12" thay vì theo syllabus.
- Kế thừa logic skills từ plan `260922-0338-class-modal-auto-skills` (issue #232, đã merge qua PR #234): handler `changeTemplateId` + `skillsFromTemplate` sẵn có.

## Validation Log

_(điền sau validation gate)_
