---
phase: 3
title: "Merge và kiểm chứng trên staging"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Merge và kiểm chứng trên staging

## Goal

Chứng minh resource profile hoạt động thật trên staging, đúng API và CORS, trước khi chạm zone msmy.io.vn.

## Files to Create / Modify

Không có file mới; chỉ sửa nếu kiểm chứng phát hiện lỗi.

## Tasks & Steps

1. Xác nhận PR Phase 1 đã được merge vào `develop` và CI `develop` xanh. <!-- Updated: Red Team RT-5 -->
2. Đẩy lên staging: `git push origin develop:staging`.
3. Theo dõi `deploy-staging.yml` đến khi xanh, gồm step `Smoke check profile`.
4. Phát hành bộ đề trên `https://app.staging.teacheros.io.vn/placement-test` để test đầu-cuối.

## Verification

- `curl -s https://profile.staging.teacheros.io.vn/ | grep lead-api` cho thấy `https://api.staging.teacheros.io.vn`.
- `curl -i https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao` chuyển hướng sang URL có `/` cuối.
- `curl -i https://api.staging.teacheros.io.vn/public/placement-test -H "Origin: https://profile.staging.teacheros.io.vn"` trả `200` kèm ACAO đúng origin.
- Trên trình duyệt, gửi form tạo được lead ở `/leads` staging, làm hết bài kiểm tra và audio phát được.
- Kiểm tra 3 viewport (1440×900, 768×1024, 375×812) cho thấy trang hiển thị giống bản local, PDF và ảnh tải được.
- Log `deploy-staging.yml` không có thao tác nào lên `msmy.io.vn`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
