---
phase: 1
title: "Soạn đề, audio và bộ duyệt nội dung"
status: pending
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

1. Viết `questions.json` theo cấu trúc dưới đây, với `status: "draft"`.
2. Soạn phần 1: 8 câu grammar và 7 câu vocab, mỗi câu 4 lựa chọn, có `level` từ A1 đến C1. Không chép đề từ ExamEnglish hay nguồn khác.
3. Soạn phần 2: 5 transcript 45–90 giây, độ khó tăng dần từ A2 đến C1, mỗi đoạn 3 câu. Bối cảnh trung tính, không dùng tên người hay thương hiệu thật.
4. Trộn vị trí đáp án đúng để không có mẫu dễ đoán.
5. Tạo audio. Kiểm tra `ffmpeg`, Multix và `MINIMAX_API_KEY` qua `ak-vault`. Nếu đủ, tạo TTS rồi chuẩn hóa MP3 mono 64 kbps, mỗi file không quá 2 MB. Nếu thiếu, giao transcript để cô Mỹ tự thu, không dùng audio giả để lấp chỗ.
6. Sinh `plans/reports/placement-test-content-review.md`: từng câu kèm đáp án, level, transcript, link audio và bảng ngưỡng D6.
7. Gửi cô Mỹ duyệt. Sửa theo phản hồi. Chỉ đổi `status` thành `approved` khi cô Mỹ xác nhận.

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

## Verification

- Unit test ở phase 2 xác nhận số câu, cấu trúc và tính liên tục của `bands`.
- `du -h apps/profile/public/kiem-tra-dau-vao/audio/*` cho thấy mỗi file không quá 2 MB.
- Cô Mỹ xác nhận duyệt; ghi lại ngày duyệt trong báo cáo review.

## Risks

Audio TTS có thể phát âm sai hoặc thiếu tự nhiên. Cô Mỹ nghe đủ 5 đoạn khi duyệt và có quyền thay bằng bản tự thu.

Transcript trong file public sẽ làm lộ nội dung nghe, nên transcript chỉ nằm trong báo cáo review, không đưa vào `questions.json`.
