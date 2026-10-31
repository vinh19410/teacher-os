---
phase: 4
title: "Trang profile đọc đề từ API"
status: completed
priority: P2
effort: "0.5d"
dependencies: [2]
---

# Phase 4: Trang profile đọc đề từ API

## Goal

`/kiem-tra-dau-vao/` lấy đề và audio từ API, hiện bảo trì khi không có đề, và không còn phụ thuộc file đề trong repo.

## Files to Create / Modify

<!-- Updated: Red Team Review - delete static questions.json & audio/*.mp3 here, fix questionNumber = part1.length + 1 and all remaining hardcoded counts in test.js & index.html -->
- Delete: `apps/profile/public/kiem-tra-dau-vao/questions.json`, `apps/profile/public/kiem-tra-dau-vao/audio/*.mp3`
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.js`, `apps/profile/public/kiem-tra-dau-vao/index.html`, `apps/profile/public/kiem-tra-dau-vao/grading.js`
- Modify: `apps/profile/public/index.html` (chữ "30 câu" / "15 câu" / "8 câu ngữ pháp..." / "5 đoạn", dòng 1907, 2160-2205)
- Modify: `apps/profile/build.mjs`, `apps/profile/serve.mjs`
- Modify: `apps/profile/tests/placement-test.test.mjs`, `apps/profile/tests/index.test.mjs`

## Tasks & Steps

1. `kiem-tra-dau-vao/index.html`: thêm `<meta name="lead-api" content="https://api.teacheros.io.vn">`. `serve.mjs` và `build.mjs` thay meta ở cả `/index.html` và `/kiem-tra-dau-vao/index.html` để e2e và staging trỏ đúng API.
2. `test.js`: đọc API base từ `<meta name="lead-api">`, gọi `GET ${base}/public/placement-test` với `cache: "no-cache"`. Kiểm `parts`, `bands`. `audio.src` là `clip.src.startsWith("http") ? clip.src : `${base}${clip.src.startsWith("/") ? "" : "/"}${clip.src}``.
3. Trang bảo trì: mọi lỗi tải (mạng, không phải 200, sai schema) gọi `renderMaintenance`, tiêu đề `"Bài kiểm tra đang bảo trì"`, nội dung mời học viên quay lại sau và có link về trang chủ (`../`). Thay nhánh `renderError` của `init`. Không đụng `localStorage` nên bài làm dở còn nguyên.
4. Bỏ toàn bộ số câu/số đoạn hard-code trong `test.js` (dòng 177-178, 310, 331, 367-376, 424, 447, 463, 469, 474):
   - Tính tổng số câu từ `flattenQuestions(test).length`, số câu Phần 1 từ `part1Questions.length`, số câu Phần 2 từ `totalQuestions - part1Questions.length`, số đoạn từ `clips.length`.
   - Tại `renderPart2Step` (dòng 474), khởi tạo `let questionNumber = (part1?.questions?.length ?? 0) + 1;` thay vì `16`.
   - Tiêu đề Phần 2 dùng `clips.length` (`Phần 2: Nghe Hiểu (Listening – ${clips.length} Đoạn Audio)`); mô tả không hard-code "8 câu ngữ pháp... 7 câu từ vựng" hay "3 câu hỏi".
5. Bỏ `COURSE_LABELS` trong `test.js`, dùng `result.band.courseLabel || result.band.course`. `gradeAttempt` trong `grading.js` trả thêm `courseLabel: matchedBand.courseLabel ?? ""` trong `band`.
6. Bỏ `"30 Câu"`, `"15 câu"`, `"8 câu ngữ pháp..."`, `"5 đoạn"` ở `apps/profile/public/kiem-tra-dau-vao/index.html` và `apps/profile/public/index.html`, viết lại câu không nêu số cố định (D15). Xóa `apps/profile/public/kiem-tra-dau-vao/questions.json` và `apps/profile/public/kiem-tra-dau-vao/audio/*.mp3`.
7. `build.mjs`: bỏ `resolveBuildChannel`, `assertPlacementContentApproved`, tham số `questionsUrl`, `channel`. `serve.mjs`: bỏ `parseByteRange` và nhánh `Range` vì profile không còn file audio; giữ directory index và redirect.
8. Cập nhật `apps/profile/tests/placement-test.test.mjs` và `apps/profile/tests/index.test.mjs`: dùng fixture nội tuyến cho `gradeAttempt`; bỏ test cổng build và test Range; thêm test meta `lead-api` được thay ở cả hai trang; thêm test HTML tĩnh không còn chuỗi `"30 câu"` / `"30 Câu"`.

## Verification

- Verify: `pnpm --filter profile test` exits 0.
- Verify: `pnpm --filter profile build` exits 0; `apps/profile/dist` không có `questions.json`, và `dist/kiem-tra-dau-vao/index.html` mang đúng `LEAD_API_URL`.
- Verify: `grep -rn -i "questions.json\|PROFILE_CHANNEL\|30 câu" apps/profile/public apps/profile/build.mjs` returns no matches.
- Verify: `pnpm exec biome check .` exits 0.

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
