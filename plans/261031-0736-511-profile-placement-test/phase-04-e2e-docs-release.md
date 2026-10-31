---
phase: 4
title: "E2E, tài liệu và cổng phát hành"
status: pending
priority: P2
effort: "0.4d"
dependencies: [2, 3]
---

# Phase 4: E2E, tài liệu và cổng phát hành

## Goal

Chứng minh trọn luồng từ CTA tới lead, cập nhật tài liệu vận hành và kiểm chứng trên host thật trước khi công khai.

## Files to Create / Modify

- Create: `apps/e2e/specs/profile-placement-test.spec.ts`
- Modify: `docs/codebase-summary.md`
- Modify: `docs/production-release-runbook.md`

## Tasks & Steps

1. Spec e2e dùng `PROFILE_ORIGIN`, cùng mẫu với `profile-lead-intake.spec.ts`:
   - Bấm CTA hero sang `/kiem-tra-dau-vao/`, làm đủ 30 câu, xem kết quả.
   - Phát audio hai lần thì nút bị khóa; reload vẫn khóa.
   - Reload giữa bài giữ câu trả lời.
   - Bấm đăng ký: form có banner kết quả và khóa đề xuất, URL đã sạch query; gửi form thì `lead.placement` trong DB đúng.
   - Làm xong không bấm đăng ký thì không có dòng `lead`.
2. Cập nhật mô tả `apps/profile` trong `docs/codebase-summary.md`.
3. Thêm vào mục "Build & deploy `apps/profile`" của runbook: cổng `status: approved` và cách sửa đề hoặc tăng `version`.
4. Chụp màn hình 3 viewport cho PR theo `REVIEW.md`.
5. Sau khi deploy, smoke test trên `https://msmy.io.vn` và `https://www.msmy.io.vn`: `/kiem-tra-dau-vao/` trả 200; `.mp3` đúng MIME và hỗ trợ Range; audio phát được trên Safari iOS; đăng ký thật tạo lead có `placement`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e profile-placement-test`
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter profile build` qua khi `status: approved`.

## Risks

Host production chưa rõ nên smoke test có thể lộ lỗi directory index hoặc Range. Nếu lỗi directory index, đổi CTA sang `kiem-tra-dau-vao/index.html` là cách lùi rẻ nhất.
