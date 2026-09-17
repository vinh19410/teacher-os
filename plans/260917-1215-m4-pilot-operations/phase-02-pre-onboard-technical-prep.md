---
phase: 2
title: "Chuẩn bị kỹ thuật trước onboard"
status: pending
priority: P1
effort: "0.5-1d"
dependencies: []
---

# Phase 2: Chuẩn bị kỹ thuật trước onboard

## Overview

Đảm bảo production sẵn sàng đón giáo viên trước ngày onboard: chạy kiểm tra reload/0-mất-dữ-liệu trên production, định hình quy trình verify Google OAuth round-trip thật (deviation M3), và xác nhận đường fix-deploy khi có blocker. Phase này AI tự chạy được ngay, song song Phase 1 và việc user tuyển giáo viên.

## Requirements

- Checklist "0 mất dữ liệu sau reload" cho production với 3 lớp evidence, dùng xuyên suốt Phase 4:
  1. Post-deploy smoke theo `docs/production-release-runbook.md` (Chrome + Safari) sau mỗi deploy trong pilot.
  2. Checklist reload thủ công định kỳ (tối thiểu đầu mỗi tuần + sau mỗi deploy): tạo/sửa 1 mục → hard reload → dữ liệu giữ nguyên → ghi vào pilot log.
  3. Xác nhận của giáo viên trong weekly check-in ("có lần nào thấy mất/sai dữ liệu sau F5 không").
- Quy trình verify Google OAuth round-trip thật: giáo viên click "Đăng nhập với Google" → consent → callback về app có session → ghi evidence (timestamp, pass/fail, không ghi `code`/`state`/cookie). Đây là điều kiện bắt buộc của Phase 3 và đóng deviation M3.
- Onboarding script cho buổi onboard (30–45 phút): đăng nhập → kiểm tra org → tạo 2–3 lớp thật (loại lớp + lịch) → nhập học viên → điểm danh buổi đầu → tạo hóa đơn đầu tiên. Mỗi bước có "kết quả mong đợi" để phát hiện lệch ngay tại buổi.
- Xác nhận pipeline: CI + E2E + Deploy Production xanh trên `main`; đường fix blocker rehearse trên giấy: branch → PR → merge `main` → deploy tự động → smoke → đóng blocker.

## Related Code Files

- Create: `plans/260917-1215-m4-pilot-operations/onboarding-script.md`, `plans/260917-1215-m4-pilot-operations/reload-checklist.md`.
- Read only: `docs/production-release-runbook.md` (post-deploy smoke, rollback), `apps/e2e/specs/` (tham chiếu luồng đã được E2E cover).

## Implementation Steps

1. Xác nhận CI/E2E/Deploy Production xanh trên `main` mới nhất (`gh run list`).
2. Smoke thủ công production: đăng nhập thật (tài khoản user) → tạo mục thử (naming `smoke-*`) → hard reload → giữ nguyên → xóa mục thử. Ghi kết quả vào pilot log như baseline trước pilot.
3. Viết `reload-checklist.md` (3 lớp evidence ở trên) và `onboarding-script.md`.
4. Rà quy trình verify OAuth round-trip ghi thành step trong `onboarding-script.md` với evidence slot riêng.
5. Mô tả đường fix-blocker (branch naming, PR target `main`, ai merge, smoke sau deploy) vào `triage-convention.md` của Phase 1 nếu chưa đủ.

## Success Criteria

- [ ] Baseline smoke production pass có ghi lại (reload giữ dữ liệu, xóa sạch mục thử).
- [ ] `reload-checklist.md` + `onboarding-script.md` hoàn thành, mỗi bước có kết quả mong đợi.
- [ ] Quy trình verify OAuth round-trip có evidence slot riêng, không ghi secret.
- [ ] Không có thay đổi code/product trong phase này; nếu smoke phát hiện lỗi → log blocker và xử lý theo đường Phase 4, không tự mở rộng phase.
