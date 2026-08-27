---
phase: 2
title: "E2E doc-contract update and verification gates"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: E2E doc-contract update and verification gates

## Overview

Cập nhật comment doc-contract của e2e spec cho khớp thực tế mới (badge status giờ có ở cả tab "Giáo trình", không chỉ "Lịch học"), rồi chạy toàn bộ gates local — biome, type-check, unit tests, e2e `class-operations.spec.ts` — xác nhận fix không gây regression mà không đổi assert logic.

## Requirements

- Functional:
  - Header comment `apps/e2e/specs/class-operations.spec.ts` (line 15: *"Sắp tới" badges exist only on the class "Lịch học" tab"*) phản ánh đúng trạng thái sau merge, dùng nhãn badge CHÍNH XÁC theo tab: tab "Lịch học" dùng "Đã học"/"Sắp tới" (`$classId.tsx:311`); tab "Giáo trình" (sau dedupe) dùng "Đã dạy"/"Đang học"/"Sắp tới" (`lesson-status.tsx` badges — chú ý KHÔNG phải "Đã học"). Các assert exact-count (lines 53, 80) vẫn chỉ đếm khi đứng trên tab "Lịch học" và KHÔNG được sửa logic.
  - Comment doc-contract tương tự ở `apps/e2e/specs/helpers.ts:21-22` ("the only page rendering the 'Đã học'/'Sắp tới' badges") cũng phải update — chỉ comment, không đụng logic helper.
- Non-functional:
  - Gates phải chạy trên cùng một working tree chứa Phase 1, theo ĐÚNG lệnh CI dùng (`pnpm exec biome check .`, `pnpm test`, `pnpm check-types`, `pnpm build` — xem `.github/workflows/ci.yml:32-35`).

## Architecture

Không đổi kiến trúc — bước xác minh. E2E an toàn vì các tab render độc lập theo state `tab` trong `$classId.tsx` (`tab === "syllabus" && …`, `tab === "schedule" && …`), default `roster`: khi test click sang tab "Lịch học", cây syllabus không còn trong DOM nên count 12/11 không đổi.

## Related Code Files

- Modify: `apps/e2e/specs/class-operations.spec.ts` — chỉ dòng comment header (line 15); không sửa bất kỳ `expect(...)` nào.
- Modify: `apps/e2e/specs/helpers.ts` — chỉ comment doc-contract (lines 21-22); không sửa logic helper.

## Implementation Steps

1. Đổi comment line 15 của `class-operations.spec.ts` thành mô tả đúng với nhãn chuẩn: tab "Lịch học" render badges "Đã học"/"Sắp tới"; tab "Giáo trình" (sau khi dedupe curriculum) render badges "Đã dạy"/"Đang học"/"Sắp tới"; các exact-count assert chỉ áp dụng trên tab "Lịch học". Update comment `helpers.ts:21-22` tương tự (openClassScheduleTab vẫn an toàn vì chỉ mở tab "Lịch học").
2. Chạy gates đúng lệnh CI (`.github/workflows/ci.yml`): `pnpm exec biome check .`, `pnpm test` (= `turbo run test && pnpm test:ci-workflow && pnpm test:topology-drift`), `pnpm check-types` (web: `vite build && tsc --noEmit`), `pnpm build`.
3. Chạy e2e bị ảnh hưởng: `class-operations.spec.ts` (playwright) — verify count 12/11 vẫn pass.
4. Smoke thủ công trên dev server: mở class đã import template → tab "Giáo trình" → mỗi module/lesson đúng 1 lần; EditLessonModal đổi status → badge/dot cập nhật; tab "Lịch học" không đổi.
5. Chụp screenshot before/after đính vào PR (so sánh với screenshot bug trong issue).

## Success Criteria

- [x] Comment e2e spec phản ánh đúng doc-contract mới; `git diff` cho thấy KHÔNG có thay đổi assert nào trong spec.
- [x] `pnpm exec biome check .` pass.
- [x] `pnpm check-types` pass (0 error — `vite build && tsc --noEmit`).
- [x] `pnpm build` pass.
- [x] Unit tests pass qua `pnpm test` (toàn bộ vitest hiện có, gồm `repos/syllabus.test.ts`, `kernel.test.ts`).
- [x] E2E `class-operations.spec.ts` pass nguyên vẹn (counts 12/11 "Sắp tới", "Đã học" giữ nguyên).
- [x] Screenshot after: tab "Giáo trình" không còn list trùng — mỗi module MỘT block, lesson kèm status.

## Risk Assessment

- E2E flaky do badge text "Sắp tới" xuất hiện thêm ở tab syllabus: chỉ rủi ro NẾU test đứng ở sai tab khi đếm — các test đều click "Lịch học" trước khi đếm; nếu fail, signal là count gấp đôi/sai → scope selector theo container của tab đang active (Tabs render plain buttons, KHÔNG có role="tab"/"tabpanel" — `tabs.tsx:18-43`, spec line 11; có thể thêm `data-testid` cho container tab nếu cần) thay vì lỏng assert.
- Asserts là page-global `page.getByText(...)` (không scope theo tab): an toàn hiện tại nhờ HAI lớp — (1) tab render độc lập theo state `tab`, (2) class fixture được tạo trong test không import syllabus nên `cls.syllabusId === ""` → tab "Giáo trình" render empty-state (`$classId.tsx:260-273`). Mọi spec tương lai tái dùng `openClassScheduleTab` cho class CÓ curriculum phải scope count theo tab.
- Playwright cần dev server/port đúng topology local (plan 260816-2017 đã remap port 800x): nếu e2e không chạy được do môi trường, ghi rõ trong issue phần verification — không coi là plan fail.
