---
title: "Tự động điền tổng số buổi của lớp theo syllabus trong modal tạo lớp"
description: "Chọn template giáo trình trong modal 'Tạo lớp mới' tự động điền 'Tổng số buổi' bằng tổng số buổi của syllabus đó, tính luôn cả buổi thi (midterm/final)."
status: pending
priority: P2
effort: 2h
issue: 235
branch: vinh19410/feat/class-modal-auto-sessions
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Tự động điền tổng số buổi của lớp theo syllabus trong modal tạo lớp

## Overview

Kế thừa plan `260922-0338-class-modal-auto-skills` (issue #232, đã merge qua PR #234): handler `changeTemplateId` trong `AddClassModal` (`apps/web/src/components/modals/add-class-modal.tsx:145-152`) hiện tự bật chips kỹ năng theo syllabus chọn. Ô "Tổng số buổi" vẫn mặc định `"12"` dù syllabus có cây buổi học riêng (state `total` tại `:110`).

Plan này mở rộng `changeTemplateId`: khi chọn một syllabus, tự điền `total` bằng **tổng số lesson qua mọi `modules[]` của syllabus — tính luôn các buổi thi (`midterm`/`final`) nếu có** (yêu cầu tường minh của user). Thay đổi nằm hoàn toàn trong web state — **shape payload `add-class` cùng kernel command, contracts, schema đều không đổi** (giá trị `sessionsTotal` gửi đi giờ đi theo syllabus chọn). Người dùng vẫn sửa tay sau khi auto-fill (auto-fill chỉ chạy lúc change template).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chọn syllabus có ≥1 buổi → ô "Tổng số buổi" tự điền đúng tổng số buổi, **tính cả buổi thi** (midterm/final) | P1 |
| 2 | Chọn "— Lớp trống —" / syllabus 0 buổi → giữ nguyên số buổi đang nhập (không xóa trắng) | P1 |
| 3 | Chuyển sang template khác → ghi đè số buổi đã nhập tay | P1 |
| 4 | Không vỡ contract test regex trên source modal, unit/component test hiện có, và 2 e2e specs hiện có | P1 |

## Phases

| Phase | Name | Status |
| ----- | ---- | ------ |
| 1 | [UI — tự điền tổng số buổi theo syllabus](./phase-01-ui-auto-sessions.md) | Pending |
| 2 | [Tests — unit helper và e2e guard](./phase-02-tests-e2e.md) | Pending |

## Design Decisions

- **Mở rộng handler `changeTemplateId` sẵn có** (`add-class-modal.tsx:145-152`, tạo bởi PR #234) thay vì tạo handler mới; wiring `onTemplateId={changeTemplateId}` (`:279`) không đổi. Handler giữ `templateId` set đầu tiên, thêm đoạn đếm buổi: template tồn tại và có ≥1 lesson → `setTotal(String(sessions))`.
- **Pure helper tách riêng `sessionsFromTemplate(templateModules: Syllabus["modules"]): number` = `templateModules.reduce((sum, m) => sum + m.lessons.length, 0)`**, export ở module scope để unit-test trực tiếp. Lý do: `apps/web` chỉ có `renderToStaticMarkup` (không jsdom/@testing-library) nên không simulate được event `onChange` của `<select>` — phải test logic qua helper. Cùng pattern với `skillsFromTemplate` (`:31-37`) và precedent đếm buổi sẵn có: `$syllabusId.tsx:110-113`, `syllabus-import.ts:210`.
- **Đếm MỌI kind — `lesson`, `midterm`, `final`** (không filter). "Buổi test" trong hệ thống là `kind: "midterm" | "final"` (`mock-data.ts:165-166`, `contracts.ts:145` — không có kind "mock"/"test" riêng). Yêu cầu user: "tính luôn cả các buổi test nếu có" → reduce không filter là đúng nghĩa; helper không cần biết khái niệm buổi thi.
- **Đếm từ `modules`, không dùng `totalLessons`**: `totalLessons` có thể stale — `syllabusCreateSchema` default 0 (`contracts.ts:164`) và server chỉ sync lại khi replace content (`kernel.ts:1634`), trong khi cây `modules` là source of truth mà detail page cũng dùng để đếm (`$syllabusId.tsx:110-113`). Snapshot server gắn đầy đủ `modules` vào mọi syllabus row (`snapshot.ts:323` — thiếu thì `[]`), nên template trong `useSyllabus().templates` (`use-syllabus.ts:24`) luôn mang dữ liệu đếm được.
- **"— Lớp trống —" và syllabus 0 buổi → giữ nguyên số buổi nhập tay.** Nhất quán với behavior skills đã chốt ở plan #232 (giữ selection tay, không xóa trắng): xóa trắng sẽ phá input người dùng mà không có gì thay thế được.
- **Template mới ghi đè số buổi tay.** Đúng semantics "tự động điền theo syllabus chọn", nhất quán với skills (ghi đè, không merge).
- **Syllabus > 52 buổi: vẫn điền số thật, không clamp.** Validation submit sẵn có (`:184-192`, mirror server cap `sessionsTotal 1..52` tại `contracts.ts:72`) sẽ báo "Tổng số buổi tối đa là 52." và người dùng chỉnh tay. Clamp im lặng về 52 sẽ che giấu mismatch giữa syllabus và lớp; giáo trình thực tế hiếm khi vượt 52 buổi → YAGNI xử lý riêng.
- **Không phân biệt classType**: "Tổng số buổi" áp dụng cho mọi loại lớp và `ClassTemplatePicker` đã hiển thị cho mọi classType — auto-fill chạy bất kể `ielts`/`communication` (khác với skills vốn có gate `:204`).
- **Payload shape giữ nguyên**: `templateId,` vẫn liền trước `schedule:` (`:206-207`), `sessionsTotal: parsedTotal` (`:208`) không đổi vị trí → regex contract test `kernel-runtime.contract.test.ts:150-155` vẫn pass. `resetForm()` vẫn `setTotal("12")` (`:135`) — sau submit thành công không có auto-fill nào chạy lại (handler chỉ chạy khi user change).
- **`ClassTemplatePicker` không đổi** (display-only, có test riêng). Modal đọc `template.modules` trực tiếp từ `templates` của `useSyllabus()` — object `Syllabus` đầy đủ, không cần mở rộng prop type của picker. Không thêm "· N buổi" vào option label — YAGNI.

## Non-Goals

- Đổi backend, kernel command `add-class`, contracts, schema, snapshot API.
- Sync ngược (đổi số buổi lớp → đổi syllabus) — auto-fill chỉ chạy một chiều lúc change template.
- Auto chọn level/type/ngày học/giờ học theo syllabus template.
- Hiển thị hint "đã tự điền số buổi" hay toast.
- Clamp số buổi về 52 khi syllabus dài hơn cap.
- Đổi `ClassTemplatePicker` (props, rendering, option label).

## Success Criteria

- [ ] Chọn syllabus có N buổi (gồm cả midterm/final) → "Tổng số buổi" = N.
- [ ] Chọn "— Lớp trống —" / syllabus 0 buổi → ô số buổi giữ nguyên giá trị trước đó (mặc định "12" hoặc số đã nhập tay).
- [ ] Đã sửa số buổi tay, rồi chọn template khác → bị ghi đè bằng số buổi của template mới.
- [ ] Syllabus > 52 buổi → điền số thật; submit báo lỗi cap 52 như cơ chế hiện có (không crash, không clamp).
- [ ] Payload `add-class` shape không đổi; `templateId,` vẫn liền trước `schedule:`; `resetForm()` vẫn reset `total: "12"`, `templateId: ""`.
- [ ] `pnpm --filter web test` pass (unit helper + contract test regex + test render đầu).
- [ ] `pnpm check` pass; 2 e2e specs `syllabus-test-session-mark`, `syllabus-detail-import-overwrite` pass với assert số buổi mới.

## Dependencies

- Không có cross-plan dependency đang mở (blockedBy trống).
- Phụ thuộc logic vào plan `260922-0338-class-modal-auto-skills` (issue #232, đã merge qua PR #234 vào develop): handler `changeTemplateId` và helper `skillsFromTemplate` sẵn có tại `add-class-modal.tsx:145-152`, `:31-37` là điểm mở rộng.

## Validation Log

### Verification Results
- Claims checked: 21 (9 phase-01, 9 phase-02, 3 cấu trúc)
- Verified: 21 | Failed: 1 → đã sửa | Unverified: 0
- Tier: Light (Fact Checker — plan 2 phases)
- Bằng chứng chính: `add-class-modal.tsx:19,31-37,99,110,135,145-152,184-192,204,206-208,279,304-312`; `contracts.ts:72,145,164`; `mock-data.ts:165-166,167-174,193`; `kernel.ts:1634`; `snapshot.ts:323`; `use-syllabus.ts:24`; `$syllabusId.tsx:110`; `syllabus-import.ts:210`; `kernel-runtime.contract.test.ts:150-155`; `field.tsx:41`; `add-class-modal.test.tsx:118-138`; e2e `syllabus-test-session-mark.spec.ts:120-194` (import v4 "2 module · 5 buổi học" `:131`, 2 buổi thi `:188-189`); e2e `syllabus-detail-import-overwrite.spec.ts:105-108`; `CHANGELOG.md:13,15,17-19`.
- Ghi chú: verification thực hiện trong phiên planning (grep/đọc trực tiếp sau khi pull develop về `edbc9af` — merge PR #234), không spawn agent riêng — tier Light với plan nhỏ.
- 1 failed đã sửa: citation `field.tsx:38-45` → logic label-for nằm ở `field.tsx:41` (`target = htmlFor ?? childId ?? id`).

### Whole-Plan Consistency Sweep
- Đã re-read cả 3 file sau khi viết. Phát hiện + sửa 2 điểm: (1) typo lặp từ "thay thế thay thế" trong Design Decisions plan.md; (2) phase-02 thiếu nêu import type `SyllabusLesson` dùng trong fixture factory (snippet có dùng nhưng text import thiếu).
- Nhất quán đã kiểm: semantics "ghi đè số buổi tay" (Goals #3 = Design Decisions = phase-01 = Success Criteria); "0 buổi / Lớp trống → giữ nguyên" (Goals #2 = Design Decisions = phase-02 e2e assert "12"); "tính cả buổi thi midterm/final" (Overview = Goals #1 = Design Decisions = phase-01 helper = phase-02 unit fixture 3+2 và e2e assert "5"); tên label "Tổng số buổi" thống nhất khớp `add-class-modal.tsx:304`.
- `ak plan validate` → `[OK] plans/260922-1107-class-modal-auto-sessions is a valid plan directory`.
