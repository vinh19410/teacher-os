---
title: "Fix #175: Modal tạo lớp có Template giáo trình — xác minh kernel wiring và sửa reset state"
description: "Xác minh end-to-end kernel wiring cho templateId khi tạo lớp, sửa bug resetForm() trong AddClassModal bỏ quên templateId, và bổ sung test contract/integration."
status: completed
priority: P2
effort: 30m
issue: 175
branch: vinh19410/issue-175-modal-class-template
tags: [bugfix, frontend, classes, syllabus, modal, kernel]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #175: Modal tạo lớp có "Template giáo trình" nhưng lớp mới vẫn không có giáo trình

## Overview

Theo Dogfood QA vòng 2 (Issue #17 trong `dogfood-output/report.md`, GitHub Issue #175):
- Báo cáo: Modal tạo lớp có chọn "Template giáo trình" (`apps/web/src/components/modals/add-class-modal.tsx`), nhưng lớp mới tạo trong QA test lại không có giáo trình (chưa gán, KPI `—`, buổi `Dự kiến` chủ đề `—`).
- Câu hỏi mở: `templateId` hiện có được kernel dùng khi tạo lớp không, hay chỉ là UI chết? Cần trace payload → kernel command.

### Điều tra nguyên nhân gốc (Root Cause Analysis):
1. **Kernel Command & Backend Wiring**:
   - `templateId` **KHÔNG PHẢI** là UI chết. Kernel đã cài đặt đầy đủ luồng:
     - `add-class-modal.tsx:127`: `payload.templateId` được gửi qua command bus `run({ type: "add-class", payload: { ... templateId } })`.
     - `apps/web/src/lib/repos/kernel.ts:63-67`: ánh xạ `add-class` sang `POST /api/classes` với toàn bộ payload.
     - `apps/server/src/routes/kernel.ts:699-741`: `POST /api/classes` kiểm tra `input.templateId !== ""`, tìm template cùng org và `class_id IS NULL`, gọi `buildImportBatch` tạo deep copy (bản sao riêng cho lớp) gồm syllabus + modules + lessons, và chèn vào `classTable` với `syllabusId: imported.copyId`.
     - Khi client refetch snapshot (`GET /api/kernel`), lớp có `syllabusId = copyId`, và bản copy có `classId = class.id`.
     - Trên `/classes/$classId`, `sy = syllabusById(cls.syllabusId)` tìm thấy bản copy, KPI bài syllabus hiển thị số lượng bài, accordion giáo trình hiển thị đầy đủ, và bảng buổi học lấy topic từ bài học.
2. **Tại sao Dogfood QA gặp tình trạng lớp trống?**
   - Kiểm tra `dogfood-output/full/findings.json` và `dogfood-output/retry-session.mjs`:
     - Trong kịch bản test tự động vòng 2, bước `add-syllabus` bị fail do strict mode violation (`getByRole('button', { name: /^Writing$/ })` trùng 2 element).
     - Vì template chưa được tạo, trong `explore-full.mjs:251-258`, option template không tìm thấy và dropdown giữ nguyên giá trị mặc định `""` ("— Lớp trống —").
     - Trong `retry-session.mjs:115-118`, test tạo lớp "Lớp Last" hoàn toàn không chọn template (giữ mặc định `""`).
     - Do đó lớp được tạo đúng như yêu cầu: là lớp trống (`templateId: ""`), và trang `/classes/$classId` hiển thị trung thực "Lớp chưa có giáo trình".
3. **Lỗi thực tế phát hiện trong `AddClassModal` (`add-class-modal.tsx`)**:
   - Hàm `resetForm()` (`:65-73`) bỏ quên `setTemplateId("")`, cũng như không reset `setClassType("ielts")`, `setLevel("Band 7.0")`, `setMode("Online")`, `setTotal("12")`.
   - Hậu quả: Khi người dùng chọn một template và tạo lớp thành công, nếu mở modal để tạo lớp tiếp theo, `templateId` bị giữ lại từ lần trước thay vì trở về mặc định "— Lớp trống —", gây rò rỉ state giữa các lần mở modal.
   - Trong `data-store-reducer.ts:170`, `syllabusId` bị gán cứng `""` thay vì `action.payload.templateId || ""`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Xác nhận rõ ràng và giữ nguyên field "Template giáo trình" trong `AddClassModal` với kết quả gắn curriculum ngay khi tạo lớp | P2 |
| 2 | Sửa `resetForm()` trong `AddClassModal` để reset sạch `templateId` về `""` cùng các field `classType`, `level`, `mode`, `total` | P2 |
| 3 | Cập nhật `data-store-reducer.ts` để `syllabusId` phản ánh đúng `action.payload.templateId || ""` | P2 |
| 4 | Bổ sung unit/contract test trong `kernel-runtime.contract.test.ts` và `data-store-reducer.test.ts` để khóa chặt wiring và resetForm | P2 |
| 5 | Đảm bảo 100% test suite, lint check và typecheck xanh (`pnpm test`, `pnpm check`, `pnpm check-types`) | P2 |

## Key Decisions

- **Giữ field "Template giáo trình" trong modal tạo lớp**: Trả lời câu hỏi mở của Issue #175: `templateId` được kernel hỗ trợ và hoạt động end-to-end. Khi giáo viên chọn template, lớp tạo ra có ngay giáo trình mà không cần vào lớp bấm "Nhập từ template" sau.
- **Sửa `resetForm()` trong `AddClassModal`**: Reset toàn bộ form state bao gồm `setTemplateId("")`, `setClassType("ielts")`, `setLevel("Band 7.0")`, `setMode("Online")`, `setTotal("12")` để đảm bảo mỗi lần tạo lớp mới là độc lập.
- **Không thay đổi API contract hay server logic**: Endpoint `POST /api/classes` đã có unit test và e2e test hoàn chỉnh (`kernel.test.ts:2745`, `syllabus-detail-import-overwrite.spec.ts:98-119`).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Modal Template Persistence and Reset](./phase-01-modal-template-persistence-and-reset.md) | Completed |

## Success Criteria

- [x] `AddClassModal` reset sạch `templateId` về `""` sau khi submit thành công.
- [x] `data-store-reducer.ts` lưu `syllabusId` từ `templateId` khi có.
- [x] Contract test khóa chặt `resetForm()` trong `AddClassModal` có `setTemplateId("")`.
- [x] Contract test khóa chặt `AddClassModal` truyền `templateId` vào `add-class` payload.
- [x] Toàn bộ test suite pass (`pnpm test`, `pnpm check`, `pnpm check-types`).
