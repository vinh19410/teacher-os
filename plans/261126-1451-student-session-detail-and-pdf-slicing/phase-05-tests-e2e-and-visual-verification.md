---
phase: 5
title: "E2E Specs, 3-Viewport Light/Dark Verification & Polish"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: E2E Specs, 3-Viewport Light/Dark Verification & Polish

## Goal

Cập nhật các spec E2E hiện có bị ảnh hưởng bởi việc gộp tab (4 tab → 3 tab), thêm spec E2E mới kiểm chứng luồng end-to-end (giáo viên cắt PDF sách gốc thành bài giảng theo buổi + upload bài tập + gắn bài tập tương tác vào buổi → học viên mở tab Hành trình học gộp giáo trình → bấm vào buổi → xem trước bài giảng đã cắt đúng số trang + xem/mở bài tập của buổi), chạy kiểm chứng giao diện 3 viewport (`1440×900`, `768×1024`, `375×812`) ở cả Light và Dark mode, chụp ảnh POT và lưu vào `plans/reports/`.

## Files to Create / Modify

- Modify: `apps/e2e/specs/student-classmates.spec.ts` — cập nhật assertion danh sách tab còn 3 tab (`Hành trình học`, `Bài tập`, `Tài liệu chung`).
- Modify: `apps/e2e/specs/student-class-detail.spec.ts` (nếu có assertion về tab Giáo trình cũ).
- Modify: `apps/e2e/specs/material-upload-student.spec.ts` — cập nhật luồng kiểm tài liệu buổi học phía học viên (bấm vào buổi mở trang chi tiết `/classes/$classId/sessions/$date` thay vì nút disclosure `"Tài liệu"` cũ, vẫn giữ đủ kiểm chứng `lesson-material`, `audio[src*=org=]`, link tải PDF). <!-- Red-Team RT-7 -->
- Create: `apps/e2e/specs/student-session-detail.spec.ts` — kiểm chứng end-to-end luồng giáo viên cắt PDF sách gốc + tải bài tập lên buổi + giao bài tập tương tác gắn buổi, và học viên mở tab Hành trình học gộp, bấm vào buổi xem chi tiết (bài giảng cắt đúng trang, bài tập file & bài tập tương tác) + chụp POT 3 viewport Light/Dark.
- Create: `plans/reports/<issue>-*.png` — ảnh chụp POT 3 viewport (`1440×900`, `768×1024`, `375×812`) cả Light và Dark cho cả màn hình học viên (tab gộp + trang chi tiết buổi) và màn hình giáo viên (modal cắt sách / tài liệu buổi).
- Modify: `DESIGN.md` — cập nhật ghi chú mục chi tiết lớp học viên (`/classes/$classId`) phản ánh 3 tab gộp và trang chi tiết buổi.

## Tests Before (TDD)

1. Rà soát toàn bộ `apps/e2e/specs/` tìm tham chiếu cũ đến tab `"Giáo trình"` hoặc `class-tab-syllabus` ở cổng học viên.

## Implementation Steps

1. Cập nhật `apps/e2e/specs/student-classmates.spec.ts` (và `student-class-detail.spec.ts` nếu cần) cho cấu trúc 3 tab mới.
2. Viết `apps/e2e/specs/student-session-detail.spec.ts` chạy độc lập với override port `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105` (tuyệt đối KHÔNG chạy full E2E suite ở local theo `AGENTS.md`).
3. Chạy các spec lẻ liên quan (bắt buộc bao gồm cả nhóm tài liệu giáo viên/học viên để tránh đỏ gate production `deploy.yml`): <!-- Red-Team RT-7 -->
   - `student-session-detail.spec.ts`
   - `student-classmates.spec.ts`
   - `student-class-detail.spec.ts`
   - `class-shared-materials.spec.ts`
   - `material-upload-student.spec.ts`
   - `material-bank.spec.ts`
   - `material-multi-upload.spec.ts`
4. Chụp ảnh kiểm chứng 3 viewport (`1440×900`, `768×1024`, `375×812`) Light & Dark + kiểm tra không tràn ngang (320px reflow), keyboard focus, contrast theo `REVIEW.md`.
5. Chạy toàn bộ bộ lệnh local gate:
   - `pnpm exec biome check .`
   - `pnpm check-types`
   - `pnpm test`
   - Kiểm tra `pnpm design:compare` nếu áp dụng.

## Tests After

1. Toàn bộ unit/integration tests (`pnpm test`), typecheck (`pnpm check-types`), lint (`pnpm exec biome check .`), và các spec E2E lẻ đều xanh 100%.

## Regression Gate

```bash
pnpm exec biome check . && pnpm check-types && pnpm test
```

## Todo

- [ ] Rà soát và cập nhật spec E2E cũ bị ảnh hưởng bởi thay đổi tab học viên.
- [ ] Viết và chạy spec E2E mới `student-session-detail.spec.ts` (port 8100–8105).
- [ ] Chụp và kiểm tra screenshot POT 3 viewport Light/Dark lưu vào `plans/reports/`.
- [ ] Cập nhật `DESIGN.md` cho thay đổi UI học viên.
- [ ] Chạy đủ local quality gates (`biome`, `check-types`, `test`).
