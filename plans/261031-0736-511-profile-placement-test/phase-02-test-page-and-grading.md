---
phase: 2
title: "Trang làm bài và chấm điểm"
status: pending
priority: P2
effort: "0.7d"
dependencies: [1]
---

# Phase 2: Trang làm bài và chấm điểm

## Goal

`/kiem-tra-dau-vao/` chạy hoàn chỉnh: giới thiệu, hai phần làm bài, giới hạn nghe, lưu tiến độ và màn kết quả.

## Files to Create / Modify

- Create: `apps/profile/public/kiem-tra-dau-vao/index.html`
- Create: `apps/profile/public/kiem-tra-dau-vao/test.css`
- Create: `apps/profile/public/kiem-tra-dau-vao/grading.js`
- Create: `apps/profile/public/kiem-tra-dau-vao/test.js`
- Create: `apps/profile/tests/placement-test.test.mjs`
- Modify: `apps/profile/serve.mjs`
- Modify: `apps/profile/build.mjs`

## Tasks & Steps

1. `grading.js`: module ES thuần, không chạm DOM. Xuất `flattenQuestions(test)`, `gradeAttempt(test, answers)` trả điểm từng phần, tổng và band, và `buildPlacementSummary(result)` trả chuỗi dạng `Kiểm tra đầu vào: 21/30 (Vocab + Grammar 11/15, Listening 10/15) – CEFR B1`, không quá 300 ký tự. Câu bỏ trống tính sai.
2. `test.js`: tải `questions.json`, render theo các bước Giới thiệu → Phần 1 → Phần 2 → Kết quả. Nếu tải lỗi thì hiện thông báo kèm link Zalo cô Mỹ.
3. Nút nghe tự làm, không dùng `controls` để không tua được. Tăng lượt tại sự kiện `playing`, hoàn lượt nếu `error` xảy ra trước `ended`, chỉ phát một đoạn tại một thời điểm, và hiện số lượt còn lại trong vùng `aria-live`.
4. Lưu `{version, step, answers, plays, result}` vào `localStorage` key `msmy_placement_attempt_v1` sau mỗi thay đổi, bọc try/catch như draft form hiện có. Khác `version` thì bỏ bản lưu. Storage bị chặn thì bài vẫn làm được, chỉ mất khả năng khôi phục.
5. Nộp bài: nếu còn câu trống thì hiện số câu trống và xác nhận lại. Sau khi nộp, tải lại vẫn thấy kết quả; nút "Làm lại" xóa bản lưu, gồm cả số lần nghe.
6. Màn kết quả theo D9: điểm từng phần, CEFR, khóa đề xuất ghi rõ là gợi ý, nút "Đăng Ký Theo Kết Quả Này", nút Zalo. Link đăng ký theo D8, dùng đường dẫn tương đối để giữ nguyên host `www` hoặc không `www`.
7. Dùng `fieldset`/`legend` cho từng câu, radio thật, focus nhìn rõ, không tràn ngang ở 375px. `test.css` sao chép đúng các token màu và font đang dùng trong `:root` của `index.html` để hai trang cùng diện mạo.
8. `serve.mjs`: thêm MIME `.mp3`, `.json`; đường dẫn kết thúc `/` phục vụ `index.html` của thư mục; `/kiem-tra-dau-vao` chuyển hướng 301 sang có dấu `/`.
9. `build.mjs`: đọc `questions.json`, dừng với lỗi rõ ràng nếu `status !== "approved"` (D10).

## Test Matrix

| Trường hợp | Kỳ vọng |
|---|---|
| `questions.json` | Phần 1 đủ 15 câu, phần 2 đủ 5 đoạn và 15 câu, id duy nhất, `answer` hợp lệ, mọi `src` tồn tại, không có trường `transcript` |
| `bands` | Phủ liên tục 0–30, mọi `course` thuộc `LEAD_COURSES` |
| `gradeAttempt` | Đúng hết 30/30 ra B2+; trống hết 0/30 ra A1; biên 8/9, 15/16, 22/23 |
| `buildPlacementSummary` | Không quá 300 ký tự, khớp định dạng |
| `serve.mjs` | `/kiem-tra-dau-vao/` 200 HTML; không dấu `/` 301; `.mp3` đúng MIME; path traversal vẫn 403 |

## Verification

- `pnpm --filter profile test`
- `pnpm exec biome check apps/profile`
- Mở `pnpm dev:profile`, làm thử trọn bài ở cả 3 viewport.

## Risks

`index.html` của trang profile đặt CSS inline nên token bị sao chép sang `test.css`. Chấp nhận trùng lặp nhỏ này vì tách CSS dùng chung sẽ phải sửa file 150 KB ngoài phạm vi.
