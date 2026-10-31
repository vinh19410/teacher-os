---
phase: 4
title: "Trang profile đọc đề từ API"
status: pending
priority: P2
effort: "0.5d"
dependencies: [2]
---

# Phase 4: Trang profile đọc đề từ API

## Goal

`/kiem-tra-dau-vao/` lấy đề và audio từ API, hiện bảo trì khi không có đề, và không còn phụ thuộc file đề trong repo.

## Files to Create / Modify

- Modify: `apps/profile/public/kiem-tra-dau-vao/test.js`, `index.html`, `grading.js`
- Modify: `apps/profile/public/index.html` (chữ "30 câu", dòng 1907, 2160-2205)
- Modify: `apps/profile/build.mjs`, `apps/profile/serve.mjs`
- Modify: `apps/profile/tests/placement-test.test.mjs`, `apps/profile/tests/index.test.mjs`

## Tasks & Steps

1. `kiem-tra-dau-vao/index.html`: thêm `<meta name="lead-api">`. `serve.mjs` và `build.mjs` thay meta ở cả file này, không chỉ trang chủ, để e2e và staging trỏ đúng API.
2. `test.js`: đọc API base từ meta, gọi `GET {base}/public/placement-test` với `cache: "no-cache"`. Kiểm `parts`, `bands`. `audio.src` là `base + clip.src`.
3. Trang bảo trì: mọi lỗi tải (mạng, không phải 200, sai schema) gọi `renderMaintenance`, tiêu đề "Bài kiểm tra đang bảo trì", nội dung mời quay lại sau, có link về trang chủ. Thay nhánh `renderError` của `init`. Không đụng `localStorage` nên bài làm dở còn nguyên.
4. Bỏ số câu hard-code trong `test.js` (dòng 177-178, 310, 331, 367-372, 424, 447): tính số câu từ `flattenQuestions`, số đoạn từ `clips.length`. Mô tả "mỗi đoạn gồm 3 câu hỏi" đổi thành câu không nêu số.
5. Bỏ `COURSE_LABELS`, dùng `band.courseLabel` của payload. `gradeAttempt` trả thêm `courseLabel` trong `band`.
6. Bỏ "30 Câu", "15 câu" ở `index.html` của trang test và trang chủ, viết lại câu không nêu số (D15).
7. `build.mjs`: bỏ `resolveBuildChannel`, `assertPlacementContentApproved`, tham số `questionsUrl`, `channel`. `serve.mjs`: bỏ `parseByteRange` và nhánh `Range` vì profile không còn file audio; giữ directory index và redirect.
8. Cập nhật test: dùng fixture nội tuyến cho `gradeAttempt`; bỏ test cổng build và test Range; thêm test meta `lead-api` được thay ở cả hai trang; thêm test HTML tĩnh không còn chuỗi "30 câu".

## Verification

- `pnpm --filter profile test` qua.
- `pnpm --filter profile build` chạy được; thư mục output không có `questions.json`, và trang test mang đúng `LEAD_API_URL`.
- Tìm `questions.json`, `PROFILE_CHANNEL`, `30 Câu` trong `apps/profile/public` và `apps/profile/build.mjs` không còn kết quả.
- `pnpm exec biome check .` qua.
