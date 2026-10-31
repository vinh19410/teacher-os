---
phase: 1
title: "Soạn đề, audio và bộ duyệt nội dung"
status: in-progress
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 1: Soạn đề, audio và bộ duyệt nội dung

## Goal

Có đủ 30 câu gốc, 5 đoạn audio và tài liệu để cô Mỹ duyệt toàn bộ nội dung cùng ngưỡng quy đổi.

## Files to Create / Modify

- Create: `apps/profile/public/kiem-tra-dau-vao/questions.json`
- Create: `apps/profile/public/kiem-tra-dau-vao/audio/clip-1.mp3` … `clip-5.mp3`
- Create: `plans/reports/placement-test-content-review.md`

## Tasks & Steps

<!-- Updated: Red Team Session 1 - RT-6 audio TTS via edge-tts + ffmpeg and handover task breakdown -->

### Task 1.1 — Soạn `questions.json` (15 câu Vocab + Grammar và 15 câu Listening)
- **Goal:** Tạo file `apps/profile/public/kiem-tra-dau-vao/questions.json` với `version: 1`, `status: "draft"`, 4 band quy đổi CEFR theo D6, 15 câu phần 1 (8 grammar, 7 vocab, từ A1 đến C1) và 5 đoạn nghe phần 2 (mỗi đoạn 3 câu, từ A2 đến C1), không chứa trường `transcript`.
- **Target files and symbols:** `apps/profile/public/kiem-tra-dau-vao/questions.json` (keys `version`, `status`, `bands`, `parts`).
- **Steps:**
  1. Tạo thư mục `apps/profile/public/kiem-tra-dau-vao/audio/`.
  2. Viết `apps/profile/public/kiem-tra-dau-vao/questions.json` theo cấu trúc bên dưới với `"status": "draft"`.
  3. Soạn phần 1 (`id: "vocab-grammar"`): 8 câu `"kind": "grammar"` và 7 câu `"kind": "vocab"`, mỗi câu 4 lựa chọn trong `options`, `answer` là chỉ số `0..3`, `level` trải từ `A1` đến `C1`. Nội dung gốc 100%, trộn đều vị trí đáp án đúng.
  4. Soạn phần 2 (`id: "listening"`): 5 clip (`clip-1` đến `clip-5`, `src: "audio/clip-1.mp3"` … `"audio/clip-5.mp3"`, `maxPlays: 2`, `level` từ `A2` đến `C1`), mỗi clip 3 câu hỏi (`l-01` đến `l-15`), mỗi câu 4 lựa chọn, không đặt trường `transcript` trong `questions.json`.
- **Success criteria:** `questions.json` là JSON hợp lệ, có đúng 15 câu ở phần 1 (8 grammar + 7 vocab) và 5 clip × 3 câu = 15 câu ở phần 2, không có trường `transcript`.
- **Verify:** `node -e 'const q = JSON.parse(require("fs").readFileSync("apps/profile/public/kiem-tra-dau-vao/questions.json","utf8")); if (q.status !== "draft" || q.parts[0].questions.length !== 15 || q.parts[1].clips.length !== 5 || q.parts[1].clips.flatMap(c => c.questions).length !== 15 || JSON.stringify(q).includes("\"transcript\"")) process.exit(1); console.log("questions.json valid");'` exits 0 and prints `questions.json valid`.

```json
{
  "version": 1,
  "status": "draft",
  "bands": [{ "min": 0, "max": 8, "cefr": "A1", "course": "ielts-foundation" }],
  "parts": [
    { "id": "vocab-grammar", "title": "Vocab + Grammar", "questions": [
      { "id": "vg-01", "kind": "grammar", "level": "A1", "prompt": "…", "options": ["…"], "answer": 1 }
    ]},
    { "id": "listening", "title": "Listening", "clips": [
      { "id": "clip-1", "src": "audio/clip-1.mp3", "maxPlays": 2, "level": "A2", "questions": [] }
    ]}
  ]
}
```

### Task 1.2 — Tạo 5 file audio MP3 từ transcript bằng TTS và chuẩn hóa `ffmpeg`
- **Goal:** Sinh 5 file MP3 giọng đọc tiếng Anh tự nhiên (`clip-1.mp3` … `clip-5.mp3`), độ dài khoảng 45–90 giây mỗi đoạn, chuẩn hóa MP3 mono 64 kbps, dung lượng mỗi file < 2 MB.
- **Target files and symbols:** `apps/profile/public/kiem-tra-dau-vao/audio/clip-1.mp3` … `apps/profile/public/kiem-tra-dau-vao/audio/clip-5.mp3`.
- **Steps:**
  1. Kiểm tra `ffmpeg`, Multix và `MINIMAX_API_KEY` qua `ak-vault`. Nếu máy chưa có `ffmpeg` và `MINIMAX_API_KEY`, cài `ffmpeg` + `edge-tts` để tổng hợp giọng đọc tiếng Anh neural cho 5 transcript (1 giọng cho độc thoại, 2 giọng ghép cho hội thoại).
  2. Chuẩn hóa cả 5 file sang MP3 mono, 64 kbps, 24 kHz/44.1 kHz bằng `ffmpeg -ac 1 -b:a 64k`.
  3. Kiểm tra thời lượng và dung lượng từng file bằng `ffprobe` và `du -h`.
- **Success criteria:** Cả 5 file `clip-1.mp3` … `clip-5.mp3` tồn tại, là MP3 hợp lệ có thời lượng 45–95 giây, mỗi file < 2 MB.
- **Verify:** `node -e 'const fs = require("fs"); for (let i = 1; i <= 5; i++) { const s = fs.statSync("apps/profile/public/kiem-tra-dau-vao/audio/clip-" + i + ".mp3"); if (s.size < 100000 || s.size > 2 * 1024 * 1024) process.exit(1); } console.log("audio files valid");'` exits 0 and prints `audio files valid`.

### Task 1.3 — Tạo báo cáo duyệt nội dung cho cô Mỹ (`plans/reports/placement-test-content-review.md`)
- **Goal:** Xuất tài liệu đầy đủ để cô Mỹ duyệt toàn bộ 30 câu hỏi, đáp án, level, 5 transcript, thông tin giọng TTS/file audio và bảng ngưỡng quy đổi CEFR (D6).
- **Target files and symbols:** `plans/reports/placement-test-content-review.md`.
- **Steps:**
  1. Viết `plans/reports/placement-test-content-review.md` gồm: bảng ngưỡng quy đổi D6, danh sách 15 câu Vocab + Grammar kèm đáp án đúng và giải thích ngắn, 5 đoạn Listening kèm transcript nguyên văn, thông số file audio (thời lượng, giọng TTS, lưu ý bản quyền/tự thu thay thế) và3 câu hỏi/đáp án mỗi đoạn.
  2. Giữ `status: "draft"` trong `questions.json` cho tới khi cô Mỹ xác nhận duyệt.
- **Success criteria:** File `plans/reports/placement-test-content-review.md` tồn tại, có đủ 30 câu, 5 transcript và bảng ngưỡng D6.
- **Verify:** `test -s plans/reports/placement-test-content-review.md && echo "review doc exists"` exits 0 and prints `review doc exists`.

## Verification

- Unit test ở phase 2 xác nhận số câu, cấu trúc và tính liên tục của `bands`.
- `du -h apps/profile/public/kiem-tra-dau-vao/audio/*` cho thấy mỗi file không quá 2 MB.
- Cô Mỹ xác nhận duyệt; chỉ đổi `status` sang `approved` khi cô Mỹ xác nhận.

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

Audio TTS có thể phát âm sai hoặc thiếu tự nhiên. Cô Mỹ nghe đủ 5 đoạn khi duyệt và có quyền thay bằng bản tự thu.

Transcript trong file public sẽ làm lộ nội dung nghe, nên transcript chỉ nằm trong báo cáo review, không đưa vào `questions.json`.
