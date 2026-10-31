---
phase: 2
title: "Trang làm bài và chấm điểm"
status: completed
priority: P2
effort: "0.7d"
dependencies: [1]
---

# Phase 2: Trang làm bài và chấm điểm

## Goal

`/kiem-tra-dau-vao/` chạy hoàn chỉnh: giới thiệu, hai phần làm bài, giới hạn nghe, lưu tiến độ và màn kết quả.

## Files to Create / Modify

- Modify: `biome.json`
- Create: `apps/profile/public/kiem-tra-dau-vao/index.html`
- Create: `apps/profile/public/kiem-tra-dau-vao/test.css`
- Create: `apps/profile/public/kiem-tra-dau-vao/grading.js`
- Create: `apps/profile/public/kiem-tra-dau-vao/test.js`
- Create: `apps/profile/tests/placement-test.test.mjs`
- Modify: `apps/profile/serve.mjs`
- Modify: `apps/profile/build.mjs`

## Tasks & Steps

<!-- Updated: Red Team Session 1 - RT-1 serve.mjs security/Range, RT-3 audio state machine, RT-4 biome.json, RT-5 URL/DOM safety, RT-6 test matrix -->

### Task 2.1 — Mở quét Biome cho `apps/profile/public/kiem-tra-dau-vao/**`
- **Goal:** Đảm bảo `pnpm exec biome check .` quét đầy đủ `grading.js`, `test.js`, `test.css` và `questions.json` trong `apps/profile/public/kiem-tra-dau-vao/`.
- **Target files and symbols:** `biome.json` (`files.includes`).
- **Steps:**
  1. Trong `biome.json`, đổi `"!**/apps/profile/public"` thành `"!**/apps/profile/public/index.html"` để chỉ loại trừ file HTML 3700 dòng cũ nhưng vẫn quét toàn bộ code mới trong `apps/profile/public/kiem-tra-dau-vao/`.
- **Success criteria:** `pnpm exec biome check apps/profile` quét các file trong `apps/profile/public/kiem-tra-dau-vao/`.
- **Verify:** `pnpm exec biome check biome.json` exits 0.

### Task 2.2 — Viết module chấm điểm thuần `grading.js`
- **Goal:** Cung cấp các hàm chấm điểm và tóm tắt kết quả thuần ES module, không phụ thuộc DOM.
- **Target files and symbols:** `apps/profile/public/kiem-tra-dau-vao/grading.js` (`flattenQuestions`, `gradeAttempt`, `buildPlacementSummary`).
- **Steps:**
  1. Xuất `flattenQuestions(test)` trả mảng toàn bộ 30 câu hỏi theo thứ tự kèm `partId` (`"vocab-grammar"` hoặc `"listening"`).
  2. Xuất `gradeAttempt(test, answers)` nhận `test` (`questions.json`) và map `answers` (`{ [questionId]: number }`), chấm điểm từng phần (`vocabGrammar: { score, total }`, `listening: { score, total }`), `totalScore`, `maxScore` (30), và tra `bands` để trả `band` (`{ min, max, cefr, course }`). Câu bỏ trống hoặc kiểu dữ liệu không hợp lệ tính 0 điểm.
  3. Xuất `buildPlacementSummary(result)` trả chuỗi dạng `Kiểm tra đầu vào: 21/30 (Vocab + Grammar 11/15, Listening 10/15) – CEFR B1`, cắt tối đa 300 ký tự (`LEAD_PLACEMENT_MAX`).
- **Success criteria:** Các hàm chạy đúng trên mọi biên điểm (0, 8, 9, 15, 16, 22, 23, 30) và chuỗi tóm tắt <= 300 ký tự.
- **Verify:** no verification needed (verified by Task 2.5 unit tests).

### Task 2.3 — Nâng cấp `serve.mjs` và `build.mjs`
- **Goal:** `serve.mjs` phục vụ `/kiem-tra-dau-vao/`, redirect 301 an toàn cho `/kiem-tra-dau-vao`, thêm MIME `.mp3`/`.json`, hỗ trợ HTTP `Range` (`206 Partial Content`) cho audio, chống `URIError` và path traversal; `build.mjs` chặn build khi `questions.json` có `status !== "approved"`.
- **Target files and symbols:** `apps/profile/serve.mjs` (`createProfileServer`, `types`), `apps/profile/build.mjs` (`assertPlacementContentApproved` / build gate).
- **Steps:**
  1. Trong `apps/profile/serve.mjs`, thêm `".mp3": "audio/mpeg"` và `".json": "application/json; charset=utf-8"` vào `types`.
  2. Bọc `new URL(...)` và `decodeURIComponent(...)` trong `try / catch`; nếu lỗi `URIError` thì trả `400 Bad Request`.
  3. Kiểm tra path traversal bằng biên dấu gạch chéo (`const rootWithSep = root.endsWith(sep) ? root : root + sep; if (file !== root && !file.startsWith(rootWithSep))` → `403 Forbidden`).
  4. Nếu đường dẫn trỏ tới thư mục tồn tại nhưng không kết thúc bằng `/` (ví dụ `/kiem-tra-dau-vao`), chuẩn hóa đường dẫn bắt đầu bằng một dấu `/` duy nhất (`pathname.replace(/^\/+/, "/") + "/"` + `url.search`) và trả `301 Moved Permanently` với header `Location`.
  5. Nếu đường dẫn kết thúc bằng `/` (ví dụ `/` hoặc `/kiem-tra-dau-vao/`), phục vụ `index.html` trong thư mục đó (riêng `/index.html` gốc vẫn chạy `replaceLeadApiMeta`).
  6. Hỗ trợ header `Range: bytes=start-end` trên file tĩnh (đặc biệt `.mp3`): luôn gửi `Accept-Ranges: bytes` và `Content-Length`; nếu có `Range` hợp lệ thì trả `206 Partial Content` kèm `Content-Range: bytes start-end/total` và slice buffer; nếu `Range` sai phạm vi thì trả `416 Range Not Satisfiable`.
  7. Trong `apps/profile/build.mjs`, xuất hàm `resolveBuildChannel` và `buildProfile({ questionsUrl, distUrl, leadApiUrl, channel })`: chặn `status: "draft"` ở mọi kênh, cho phép `status: "beta"` ở kênh `beta` (`develop` CI / `PROFILE_CHANNEL=beta`), và bắt buộc `status === "approved"` ở kênh `production` (`main` / build phát hành local) theo D10 & D10b.
- **Success criteria:** `/kiem-tra-dau-vao` trả 301 sang `/kiem-tra-dau-vao/`; `/kiem-tra-dau-vao/` trả 200 HTML; `.mp3` hỗ trợ 200 và 206 Range; `/%FF` trả 400 không sập server; path traversal trả 403; `build.mjs` dừng với lỗi khi `status !== "approved"`.
- **Verify:** no verification needed (verified by Task 2.5 unit tests).

### Task 2.4 — Xây dựng giao diện và logic trang `/kiem-tra-dau-vao/` (`index.html`, `test.css`, `test.js`)
- **Goal:** Trang làm bài chạy trọn luồng Giới thiệu → Phần 1 (15 câu) → Phần 2 (5 đoạn nghe, 15 câu) → Kết quả, giới hạn nghe 2 lần/đoạn bền vững qua reload, lưu tiến độ vào `localStorage`, và dựng DOM an toàn bằng `textContent`.
- **Target files and symbols:** `apps/profile/public/kiem-tra-dau-vao/index.html`, `apps/profile/public/kiem-tra-dau-vao/test.css`, `apps/profile/public/kiem-tra-dau-vao/test.js`.
- **Steps:**
  1. Tạo `apps/profile/public/kiem-tra-dau-vao/index.html` và `test.css` dùng chung hệ token `:root` của `apps/profile/public/index.html` (`--paper`, `--ink`, `--brand`, `--gold`, font Cormorant Garamond & Plus Jakarta Sans), đảm bảo responsive ở 1440×900, 768×1024, 375×812 (không tràn ngang) và focus ring rõ ràng.
  2. Trong `test.js`, tải `./questions.json`; nếu lỗi mạng hoặc JSON không hợp lệ thì hiện thông báo lỗi kèm link Zalo cô Mỹ (`https://zalo.me/0929060994`).
  3. Dựng DOM hoàn toàn bằng `document.createElement` và `textContent` (không dùng `innerHTML` với dữ liệu từ JSON hay `localStorage`). Dùng `<fieldset>` và `<legend>` cho từng câu hỏi với `<input type="radio">` thật.
  4. Quản lý state `{ version, step, answers, plays, submitted }` trong `localStorage` key `msmy_placement_attempt_v1` (bọc `try/catch`). Nếu khác `version` thì bỏ bản lưu cũ; làm sạch `plays[clipId]` thành số nguyên trong `[0, clip.maxPlays]`; khi `submitted === true` thì tính lại kết quả bằng `gradeAttempt(test, answers)` thay vì tin object `result` thô trong storage.
  5. Nút phát audio tự làm (không dùng `controls`):
     - Khi một clip đang phát, khóa nút của chính clip đó (`disabled`) để tránh bấm đúp làm mất lượt, và nếu người dùng bấm phát clip khác thì dừng clip đang phát.
     - Dùng cờ `chargedCurrentAttempt` cho từng lượt phát: chỉ tăng `plays[clipId]` ở sự kiện `playing` đầu tiên của lượt đó (`!chargedCurrentAttempt`), lưu ngay vào `localStorage`, và không tăng thêm nếu mạng buffer (`waiting` → `playing`) trong cùng lượt.
     - Nếu sự kiện `error` xảy ra trước `ended` và `chargedCurrentAttempt === true` (và trang không đang unload), hoàn lại 1 lượt (`plays[clipId]--`), lưu lại `localStorage` và báo lỗi trong vùng `aria-live`.
     - Khi `plays[clipId] >= clip.maxPlays` và clip đã phát xong (`ended` hoặc khi tải lại trang), khóa vĩnh viễn nút phát của clip đó (`Đã hết lượt nghe (0/2 lượt còn lại)`).
  6. Khi bấm "Nộp bài": nếu còn câu chưa chọn thì hiện thông báo xác nhận nêu rõ số câu còn trống (câu trống tính 0 điểm) kèm nút "Vẫn nộp bài" và "Quay lại làm tiếp".
  7. Màn kết quả (D9): hiển thị tổng điểm `/30`, điểm Phần 1 `/15`, điểm Phần 2 `/15`, mức CEFR ước tính, tên khóa học đề xuất (ghi rõ là gợi ý tham khảo), không hiển thị đáp án đúng/sai từng câu. Nút "Đăng Ký Theo Kết Quả Này" trỏ tới `../?ketqua=<encodeURIComponent(summary)>&khoa=<encodeURIComponent(course)>#dang-ky-tu-van`. Nút "Làm lại bài kiểm tra" xóa `msmy_placement_attempt_v1` và đưa về bước Giới thiệu.
- **Success criteria:** Trang làm bài hoạt động đầy đủ 4 bước, hỗ trợ bàn phím 100%, không tràn ngang ở 375px.
- **Verify:** `pnpm exec biome check apps/profile` exits 0.

### Task 2.5 — Viết unit test `apps/profile/tests/placement-test.test.mjs`
- **Goal:** Kiểm thử tự động toàn bộ hợp đồng của `questions.json`, `grading.js`, `serve.mjs` và `build.mjs`.
- **Target files and symbols:** `apps/profile/tests/placement-test.test.mjs`.
- **Steps:**
  1. Kiểm tra `questions.json`: phần 1 có đúng 15 câu (8 `grammar`, 7 `vocab`), phần 2 có đúng 5 clip và 15 câu, mọi `id` câu hỏi và clip là duy nhất, mỗi câu có 4 lựa chọn và `answer` thuộc `0..3`, mọi file `src` tồn tại trong `apps/profile/public/kiem-tra-dau-vao/` và có kích thước > 0 (< 2 MB), không có khóa `transcript` ở bất kỳ cấp nào.
  2. Kiểm tra `bands`: phủ liên tục từ 0 đến 30 không hổng/chồng lấp, mọi `band.course` đều nằm trong danh sách `<option value="...">` của `<select name="course">` trong `apps/profile/public/index.html`.
  3. Kiểm tra `gradeAttempt` và `buildPlacementSummary`: đúng hết 30/30 → `B2+` (`ielts-advanced`); trống hết 0/30 → `A1` (`ielts-foundation`); các biên 8/9, 15/16, 22/23; chuỗi `buildPlacementSummary` khớp định dạng và `<= 300` ký tự.
  4. Kiểm tra `serve.mjs`: `GET /kiem-tra-dau-vao/` trả 200 HTML; `GET /kiem-tra-dau-vao?foo=1` trả 301 sang `/kiem-tra-dau-vao/?foo=1`; `GET //evil.com/kiem-tra-dau-vao` không redirect ra domain ngoài; `GET /kiem-tra-dau-vao/audio/clip-1.mp3` trả 200 `audio/mpeg` kèm `Accept-Ranges: bytes`; `Range: bytes=0-99` trả 206 `Partial Content` đúng 100 byte; `GET /%FF` trả 400 không làm sập server; path traversal trả 403.
  5. Kiểm tra `build.mjs`: chạy trên bản tạm có `status: "draft"` thì báo lỗi rõ ràng; chạy trên bản tạm có `status: "approved"` thì thành công.
- **Success criteria:** Toàn bộ test trong `apps/profile/tests/placement-test.test.mjs` chạy xanh.
- **Verify:** `pnpm --filter profile test && pnpm exec biome check apps/profile` exits 0.

## Test Matrix

| Trường hợp | Kỳ vọng |
|---|---|
| `questions.json` | Phần 1 đủ 15 câu (8 grammar, 7 vocab), phần 2 đủ 5 đoạn và 15 câu, id duy nhất, `answer` hợp lệ, mọi `src` tồn tại (< 2 MB), không có trường `transcript` |
| `bands` | Phủ liên tục 0–30, mọi `course` khớp `<select name="course">` và `LEAD_COURSES` |
| `gradeAttempt` | Đúng hết 30/30 ra B2+; trống hết 0/30 ra A1; biên 8/9, 15/16, 22/23 |
| `buildPlacementSummary` | Không quá 300 ký tự, khớp định dạng |
| `serve.mjs` | `/kiem-tra-dau-vao/` 200 HTML; không dấu `/` 301 giữ query; `.mp3` đúng MIME + hỗ trợ 206 Range; `/%FF` 400; path traversal 403 |
| `build.mjs` | `status !== "approved"` dừng với lỗi rõ ràng; `status === "approved"` xuất `dist/` thành công |

## Verification

- `pnpm --filter profile test`
- `pnpm exec biome check apps/profile`
- Mở `pnpm dev:profile`, làm thử trọn bài ở cả 3 viewport.

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
## Risks

`index.html` của trang profile đặt CSS inline nên token bị sao chép sang `test.css`. Chấp nhận trùng lặp nhỏ này vì tách CSS dùng chung sẽ phải sửa file 150 KB ngoài phạm vi.
