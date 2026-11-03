---
phase: 5
title: "E2E, tài liệu và thứ tự phát hành"
status: completed
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

<!-- Updated: Red Team Review - isolate e2e-lead-org placement_test state across specs and update profile-placement-test.spec.ts selectors/labels -->
1. `placement-test-editor.spec.ts`: trong `beforeEach`, xóa `placement_test` và `placement_test_audio` của `e2e-lead-org` trong `local.db` để mỗi kịch bản bắt đầu sạch (`draft === null`). Seed teacher vào `e2e-lead-org` như `profile-lead-intake.spec.ts`. Vào `/placement-test`, bấm "Nhập đề gốc (30 câu, 5 audio)", sửa một `prompt`, xóa một câu rồi bấm Phát hành và thấy lỗi ngưỡng (`0..29` vs `0..30`), sửa ngưỡng cuối thành `29`, bấm Phát hành. Mở `PROFILE_ORIGIN/kiem-tra-dau-vao/`, thấy `prompt` mới và tổng `29` câu. Thay audio một đoạn, nghe thử ở màn sửa, phát hành, và phát được ở trang profile.
2. Thêm kịch bản nháp chưa phát hành không hiện ở trang profile, và kịch bản `page.route` chặn `/public/placement-test` thì hiện trang bảo trì (`"Bài kiểm tra đang bảo trì"`) mà không xóa `localStorage`.
3. `profile-placement-test.spec.ts`: thêm helper `ensurePlacementPublished` tạo teacher thuộc `e2e-lead-org` (gán `membership.org_id = 'e2e-lead-org'` trong `local.db`), xóa dòng `placement_test` cũ của `e2e-lead-org`, upload 5 MP3 và publish đề gốc 30 câu từ `apps/web/public/placement-seed/` trong `beforeAll`. Đổi đường dẫn đọc đề gốc ở đầu file sang `../../web/public/placement-seed/questions.json`. Cập nhật selector link trang chủ và heading trang giới thiệu (đã bỏ `"30 Câu"` ở Phase 4), cập nhật nhãn khóa học gợi ý `"Pre IELTS (4.0–4.5)"` (theo `LEAD_COURSE_LABELS["ielts-pre"]`), và đổi `page.route` chặn audio đoạn 2 sang URL `src` lấy từ `GET /public/placement-test`. Toàn bộ kịch bản cũ giữ nguyên ý nghĩa, kể cả giới hạn nghe 2 lần, reload, lead có `placement`.
4. Runbook (`docs/production-release-runbook.md`): thay mục cổng `status` bằng thứ tự phát hành:
   1. Đảm bảo biến `LEAD_ORG_ID` (org của cô Mỹ) được truyền khi deploy `server`, rồi deploy `server` và `web` (migration `0058` chạy cùng deploy).
   2. Mở `/placement-test`, xác nhận `LEAD_ORG_ID` khớp org của cô Mỹ (màn sửa không hiện cảnh báo org).
   3. Cô Mỹ bấm "Nhập đề gốc", nghe, sửa, đối chiếu `plans/reports/placement-test-content-review.md`, rồi bấm Phát hành.
   4. `curl -i https://api.teacheros.io.vn/public/placement-test -H "Origin: https://msmy.io.vn"` trả 200 kèm header CORS; `curl -i -H "Range: bytes=0-99"` tới `src` của một đoạn trả 206.
   5. Build và deploy `apps/profile`.
   6. Smoke: làm bài trên Safari iOS, gửi form tạo lead có `placement`.
5. `docs/codebase-summary.md` và `CHANGELOG.md`: ghi đề ở DB, `/placement-test`, `/public/placement-test`, hết cổng `status`.

## Verification

- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e` exits 0.
- Verify: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` all exit 0.

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
