# Ship Official Release v0.0.23 (develop → main)

**Date**: 2026-11-17 09:40 Europe/London
**Severity**: Medium
**Component**: Release `v0.0.23` (nhánh `release/promote-v0.0.23`)
**Status**: PR mở, chờ review + merge

## Chuyện gì đã xảy ra

Promote 20 commit (không tính merge) từ `develop` lên `main` (`v0.0.22` → `v0.0.23`): bài kiểm tra đầu vào trong Student Portal (#748), đồng bộ toàn diện entry test theo bản HTML gốc (#754), bỏ chữ "khách quan" (#751), căn lại ảnh "Học viên nói gì" (#757), staging luôn bật profile còn prod giữ bảo trì (#756). Có 1 D1 migration `0073`: dựng lại bảng `placement_test_submission` (`lead_id` nullable, thêm `student_id`) và thêm cột `student.placement_prompt_dismissed_at`.

## Yêu cầu: giữ profile ở chế độ bảo trì trên production

Không đổi gì về cờ: `apps/profile/maintenance.json` vẫn `disabled: true`, `deploy.yml` không đặt `PROFILE_MAINTENANCE`. `isProfileMaintenanceEnabled()` không có override trả `true`; reviewer build thử profile và `dist` chỉ có 4 trang bảo trì + `_headers` (`noindex`, `no-store`), không có trang/asset bài test. `topology-drift.test.mjs` chặn việc đặt override `false`/`0` cho prod.

## Merge `main` vào nhánh release

`main` đã nhận #747, #753 qua nhánh `release/*`. Xung đột 4 file (`deploy.yml`, `deploy-staging.yml`, `apps/profile/tests/index.test.mjs`, `docs/codebase-summary.md`) đều lấy bản `develop` vì `develop` là bản phát triển tiếp; reviewer xác nhận không mất nội dung của `main`.

## Rủi ro còn lại (từ review)

- **Medium**: email kết quả kiểm tra đầu vào trỏ tới `https://msmy.io.vn/kiem-tra-dau-vao/ket-qua/?t=…`, trang này đang bảo trì trên prod nên link không dùng được.
- #748 bật modal mời làm bài cho học viên chưa có `entryScore` trên prod nếu org đã phát hành đề.
- Migration `0073` dựng lại bảng (giữ đủ dữ liệu, không bảng nào tham chiếu FK); nên backup D1 trước deploy theo runbook.

Report đầy đủ: `plans/reports/code-reviewer-261117-0929-release-v0-0-23.md`.
