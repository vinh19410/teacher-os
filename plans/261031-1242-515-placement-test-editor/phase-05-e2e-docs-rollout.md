---
phase: 5
title: "E2E, tài liệu và thứ tự phát hành"
status: pending
priority: P2
effort: "0.5d"
dependencies: [3, 4]
---

# Phase 5: E2E, tài liệu và thứ tự phát hành

## Goal

Chứng minh luồng sửa rồi phát hành chạy thật từ đầu đến cuối, và ghi lại thứ tự deploy để học viên không rơi vào trang bảo trì.

## Files to Create / Modify

- Create: `apps/e2e/specs/placement-test-editor.spec.ts`
- Modify: `apps/e2e/specs/profile-placement-test.spec.ts`
- Modify: `docs/production-release-runbook.md` (dòng 111-113), `docs/codebase-summary.md` (dòng 38), `CHANGELOG.md`

## Tasks & Steps

1. `placement-test-editor.spec.ts`: seed teacher vào `e2e-lead-org` như `profile-lead-intake.spec.ts`. Vào `/placement-test`, bấm Nhập đề gốc, sửa một `prompt`, xóa một câu rồi Phát hành và thấy lỗi ngưỡng, sửa ngưỡng, Phát hành. Mở `PROFILE_ORIGIN/kiem-tra-dau-vao/`, thấy `prompt` mới và số câu mới. Thay audio một đoạn, nghe thử ở màn sửa, phát hành, và phát được ở trang profile.
2. Thêm kịch bản nháp chưa phát hành không hiện ở trang profile, và kịch bản `page.route` chặn API thì hiện trang bảo trì.
3. `profile-placement-test.spec.ts`: thêm helper `ensurePlacementPublished` gọi API bằng cookie teacher, dùng đề gốc ở `apps/web/public/placement-seed/`, chạy ở `beforeAll`. Đổi đường dẫn đọc đề gốc ở dòng 7. Kịch bản hoàn lượt khi audio lỗi (dòng 287, 298) đang chặn `**/audio/clip-2.mp3`: đổi sang URL `src` của đoạn 2 lấy từ payload công khai. Toàn bộ kịch bản cũ giữ nguyên ý nghĩa, kể cả giới hạn nghe 2 lần, reload, lead có `placement`.
4. Runbook: thay mục cổng `status` bằng thứ tự phát hành:
   1. Deploy server và web, migration `0058` chạy cùng deploy.
   2. Xác nhận `LEAD_ORG_ID` là org của cô Mỹ và màn sửa không hiện cảnh báo org.
   3. Cô Mỹ nhập đề gốc, nghe, sửa, đối chiếu `plans/reports/placement-test-content-review.md`, rồi bấm Phát hành.
   4. `curl -i https://api.teacheros.io.vn/public/placement-test -H "Origin: https://msmy.io.vn"` trả 200 kèm header CORS; `curl -i -H "Range: bytes=0-99"` tới `src` của một đoạn trả 206.
   5. Build và deploy `apps/profile`.
   6. Smoke: làm bài trên Safari iOS, gửi form tạo lead có `placement`.
5. `docs/codebase-summary.md` và `CHANGELOG.md`: ghi đề ở DB, `/placement-test`, `/public/placement-test`, hết cổng `status`.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e` qua toàn bộ, không chỉ spec mới.
- `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` qua.
- Link và lệnh trong runbook đối chiếu với code.
