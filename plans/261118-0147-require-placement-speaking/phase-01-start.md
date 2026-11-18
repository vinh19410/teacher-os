---
phase: 1
title: "Phase 1: Backend Contract & API Enforcement"
status: completed
priority: P1
effort: 1h
dependencies: []
---

# Phase 1: Backend Contract & API Enforcement

## Goal

Cập nhật contract và hai endpoint nộp bài Entry Test (`public-placement-test` và `student-placement-test`) để loại bỏ `"skipped"` khỏi submit contract và từ chối nộp bài nếu đề phát hành có câu hỏi Speaking mà client gửi `speakingMode !== "upload"`.

> **Boundary & Tradeoff Note (2-step upload):** Hệ thống giữ nguyên luồng 2 bước (`POST .../submissions` tạo submission `pending_upload` + `uploadToken`, sau đó `PUT .../speaking-media` hoặc `PUT .../speaking` tải file audio tới 50 MB) để hỗ trợ upload dung lượng lớn và nút "Thử tải lại" khi mạng chập chờn. Phase này chặn triệt để việc gửi `"skipped"` hoặc `"none"` ở `POST` khi đề có Speaking.

## Requirements

- [x] Thêm helper `hasPlacementSpeakingTasks(snapshot: PlacementSnapshot): boolean` trong `packages/api/src/placement-test-contracts.ts` (tìm part `id === "speaking"` và kiểm tra `tasks.length > 0`).
- [x] Loại `"skipped"` khỏi `studentPlacementSubmitSchema` và `placementPublicSubmitSchema` trong `packages/api/src/placement-test-contracts.ts`: đổi sang `speakingMode: z.enum(["upload", "none"]).default("none")` để bất kỳ request nào gửi `"skipped"` đều bị Zod từ chối ngay với HTTP 400 `PLACEMENT_SUBMIT_INVALID`.
- [x] Giữ nguyên `"skipped"` trong `PlacementSpeakingStatus` (`packages/db/src/schema/placement-test.ts`), `buildPlacementZaloText` (`packages/api/src/placement-test-contracts.ts`), và UI hiển thị lịch sử để không làm gãy bản ghi cũ.
- [x] Tại `POST /public/placement-test/submissions` (`apps/server/src/routes/public-placement-test.ts`) và `POST /api/student/placement-test/submissions` (`apps/server/src/routes/student-placement-test.ts`), sau khi load `snapshot` và trước khi ghi DB/tạo lead/đếm rate limit:
  - Nếu `hasPlacementSpeakingTasks(snapshot) && submit.speakingMode !== "upload"` → trả HTTP 400 `{ error: "PLACEMENT_SPEAKING_REQUIRED", code: "PLACEMENT_SPEAKING_REQUIRED", message: "Bài kiểm tra đầu vào yêu cầu hoàn thành phần Speaking trước khi nộp." }`.
  - Nếu `!hasPlacementSpeakingTasks(snapshot) && submit.speakingMode === "upload"` → trả HTTP 400 `{ error: "PLACEMENT_SUBMIT_INVALID", code: "PLACEMENT_SUBMIT_INVALID", fields: ["speakingMode"] }` (tránh treo `pending_upload` / bỏ qua AI Writing trên đề không có Speaking).
  - Loại bỏ nhánh `submit.speakingMode === "skipped"` ở biến `speakingStatus` tại cả 2 route (vì schema chỉ còn `"upload" | "none"`).

## Files to Create / Modify

- Modify: `packages/api/src/placement-test-contracts.ts`
- Modify: `packages/api/src/placement-test-contracts.test.ts`
- Modify: `apps/server/src/routes/public-placement-test.ts`
- Modify: `apps/server/src/routes/student-placement-test.ts`
- Modify: `apps/server/src/routes/public-placement-test.test.ts`
- Modify: `apps/server/src/routes/student-placement-test.test.ts`
- Modify: `apps/server/src/routes/placement-ai-grading.test.ts`

## Tests Before (TDD)

1. `packages/api/src/placement-test-contracts.test.ts`:
   - Test `hasPlacementSpeakingTasks(snapshot)` trả `true` khi `tasks.length > 0` và `false` khi `tasks: []` (direct unit test trên object `PlacementSnapshot`).
   - Test `studentPlacementSubmitSchema` và `placementPublicSubmitSchema` từ chối `speakingMode: "skipped"`.
2. `apps/server/src/routes/public-placement-test.test.ts`:
   - Test `POST /public/placement-test/submissions` trả `400 PLACEMENT_SUBMIT_INVALID` khi gửi `speakingMode: "skipped"`, và trả `400 PLACEMENT_SPEAKING_REQUIRED` khi gửi `speakingMode: "none"` trên đề đã phát hành (luôn có Speaking do `normalizePublishedPlacementSnapshot` backfill), đồng thời không tạo `lead` mới trong DB.
3. `apps/server/src/routes/student-placement-test.test.ts`:
   - Test `POST /api/student/placement-test/submissions` trả `400 PLACEMENT_SUBMIT_INVALID` với `speakingMode: "skipped"` và `400 PLACEMENT_SPEAKING_REQUIRED` với `speakingMode: "none"`, đồng thời không tạo submission/notification.

## Refactor & Implementation Steps

1. Cập nhật `packages/api/src/placement-test-contracts.ts` (thêm `hasPlacementSpeakingTasks` và sửa `studentPlacementSubmitSchema` + `placementPublicSubmitSchema`).
2. Cập nhật `apps/server/src/routes/public-placement-test.ts` và `apps/server/src/routes/student-placement-test.ts` với guard `PLACEMENT_SPEAKING_REQUIRED` và `!hasPlacementSpeakingTasks(snapshot) && submit.speakingMode === "upload"`.
3. Cập nhật test harnesses ở `public-placement-test.test.ts`, `student-placement-test.test.ts`:
   - Đổi các lượt submit hợp lệ trong `public-placement-test.test.ts` (dòng 467, 713, 793) và `student-placement-test.test.ts` (dòng 847, 1139, 1339) sang `speakingMode: "upload"` (và gọi `PUT .../speaking` ở test dòng 1139 để pipeline AI grading chạy bình thường, hoặc kiểm `aiStatus` sau upload).
4. Cập nhật `apps/server/src/routes/placement-ai-grading.test.ts` (vốn dùng `createHarness()` có câu Speaking `s-01`):
   - Lưu ý: `loadPublishedPlacementSnapshot()` luôn backfill 8 câu Speaking nếu `tasks.length === 0`, nên không dùng cách seed `tasks: []` để đi qua `POST`.
   - Đổi `h.submit()` sang `speakingMode: "upload"` mặc định (có helper `h.submitAndUpload()` hoặc tùy chọn `upload?: boolean` gọi `h.upload(...)`).
   - Với các test kết hợp `gradeLead` / email / chốt điểm / `ai-retry` (dòng 731-896, 1188, 1199, 1230, 1261, 1283, 1325, 1345, 1367, 1399, 1415): chuyển sang `speakingMode: "upload"` + `h.upload(...)` (và cập nhật assertion `h.calls` / `aiSpeaking` tương ứng nếu test kiểm `calls` hoặc kiểm `speakingRubric: null`).
   - Với các test edge case muốn kiểm `runPlacementAiGrading` khi không có audio (`writing-only` / `empty-writing` / `grader-disabled` ở dòng 369, 423, 434): hoặc insert trực tiếp bản ghi legacy `speakingStatus: "none"`/`"skipped"` vào DB rồi gọi `runPlacementAiGrading(h.pipelineDeps, id)` (hoặc `POST .../ai-retry` trên submission `pending_upload` như test dòng 1303 đã làm) để giữ nguyên coverage Writing-only của worker mà không cần mở lỗ hổng trên endpoint `POST`.

## Tests After

- `pnpm --filter @teacher-os/api test`
- `pnpm --filter server test`

## Todo

- [x] Viết Tests Before cho `hasPlacementSpeakingTasks`, schema reject `"skipped"`, `public-placement-test`, `student-placement-test`
- [x] Cài đặt `hasPlacementSpeakingTasks` và sửa schemas trong `packages/api/src/placement-test-contracts.ts`
- [x] Cài đặt guard `400 PLACEMENT_SPEAKING_REQUIRED` và `!hasPlacementSpeakingTasks` guard ở `public-placement-test.ts` và `student-placement-test.ts`
- [x] Cập nhật tests trong `public-placement-test.test.ts`, `student-placement-test.test.ts`, `placement-ai-grading.test.ts`
- [x] Chạy test regression gate cho `@teacher-os/api` và `server`

## Verification

- `pnpm --filter @teacher-os/api test`
- `pnpm --filter server test`

## Success Criteria

- Mọi request nộp bài vào đề có Speaking mà `speakingMode !== "upload"` đều bị từ chối với HTTP 400 (`PLACEMENT_SUBMIT_INVALID` cho `"skipped"`, `PLACEMENT_SPEAKING_REQUIRED` cho `"none"`) trước khi ghi dữ liệu vào DB.
- Không có regression trên AI grading, lead dedupe, rate limit, upload media hay notification.
