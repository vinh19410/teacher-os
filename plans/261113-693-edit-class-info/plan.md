# Plan: Cho phép chỉnh sửa thông tin lớp học (#693)

- **Issue:** #693 (`ai-handle`)
- **Related follow-up:** #694 (chuyển trạng thái lớp `active` ↔ `paused`)
- **Branch:** `feat/693-edit-class-info` → `develop` (`--beta`)

## Scope

Cho phép giáo viên chỉnh sửa thông tin lớp học ngay tại trang chi tiết lớp (`/classes/$classId`), đảm bảo đồng bộ rule dữ liệu và khóa lịch học an toàn khi đã có buổi học thực tế.

### Done means

1. `classUpdateSchema` (`@teacher-os/api/contracts`) + `PATCH /api/classes/:id` (`apps/server`) org-scoped (`404` cross-org), kiểm tra `type`/`skills`/`schedule`/`sessionsTotal`/`tuitionFee`, khóa theo curriculum đang gắn, và trả `409 Conflict` nguyên tử (an toàn race với `activateEnrollment`/`addManualSession`) khi sửa `schedule`, `startDate`, hoặc `sessionsTotal` lúc lớp đã có bản ghi `lesson` hoặc `class_session`.
2. Nút **"Chỉnh sửa"** trên `PageHead` của `/classes/$classId` mở `EditClassModal` điền sẵn dữ liệu lớp:
   - Sửa thông tin chung (`name`, `type`, `level`, `skills`, `mode`, `tuitionFee`) bất cứ lúc nào (kể cả lớp có `startDate` quá khứ/legacy nếu không sửa `startDate`).
   - Sửa lịch (`schedule`, `startDate` >= hôm nay VN nếu thay đổi, `sessionsTotal`) khi chưa có buổi học thực tế, kèm cảnh báo trùng lịch realtime loại trừ chính lớp đang sửa (`excludeClassId`).
   - Khóa các trường lịch kèm ghi chú giải thích khi đã có buổi học thực tế.
   - Giữ nguyên `EditClassFeeModal` ở tab Danh sách.
3. Pass toàn bộ local gates (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm build`), Playwright E2E trên 3 viewport (`1440×900`, `768×1024`, `375×812`) + keyboard navigation, và `pnpm design:compare --force --screens t-class-detail --side both --label new`.
4. Merge PR vào `develop`, CI + Deploy Staging xanh, đăng POT kèm bằng chứng và screenshot theo SHA lên #693.

## Out of scope

- Đổi trạng thái `active` ↔ `paused` hoặc xóa lớp (#694).
- Đổi hàng loạt các buổi `lesson` đã materialize.
- Import/gỡ giáo trình ngay trong `EditClassModal`.

## Phases & Checklist

- [x] Setup issue #693, follow-up #694, branch `feat/693-edit-class-info`
- [x] Phase 1: Shared foundation (`packages/api` contracts + `page-head.tsx` responsive action wrap)
- [x] Phase 2 (Wave 1A - Backend): `PATCH /api/classes/:id`, race guard trong `enrollment-activation.ts`, server tests
- [x] Phase 2 (Wave 1B - Frontend): `update-class` action/reducer/repo, `findScheduleConflicts` (`excludeClassId`), shared helpers, `EditClassModal`, button trên `/classes/$classId`, unit tests
- [x] Phase 3: Tích hợp Wave 1, E2E (`edit-class.spec.ts`), chụp screenshot 3 viewport Light/Dark, `pnpm design:compare`
- [x] Phase 4: Cập nhật `CHANGELOG.md`, local quality gates (`biome check`, `check-types`, `test`, `build`)
- [ ] Phase 5: Code review độc lập, PR vào `develop`, merge, verify CI & Staging deploy, đăng POT
