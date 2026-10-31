---
title: "Trang kiểm tra đầu vào 30 câu trên apps/profile"
description: "Thay quiz 5 câu nhúng trong trang profile bằng trang riêng /kiem-tra-dau-vao/ gồm 15 câu Vocab + Grammar và 15 câu Listening, chấm ngay trên trình duyệt và đưa kết quả sang form đăng ký."
status: pending
priority: P2
effort: 2d
issue: 511
branch: feat/511-profile-placement-test
tags: [feature, frontend, profile]
blockedBy: []
blocks: []
created: 2026-10-31
---

# Trang kiểm tra đầu vào 30 câu trên apps/profile

## Overview

Mọi nút "Làm test" trên `apps/profile/public/index.html` hiện chỉ cuộn tới `#lam-test-mien-phi`, nơi có quiz nhúng 5 câu (4 câu chấm điểm, 1 câu chọn mục tiêu), và câu 1 đang được chọn sẵn đáp án đúng. Plan này chuyển các nút đó sang trang riêng `/kiem-tra-dau-vao/` với bài kiểm tra 30 câu: 15 câu Vocab + Grammar và 15 câu Listening. Trang chấm ngay trên trình duyệt, cho biết CEFR ước tính và khóa đề xuất, rồi đưa kết quả về form đăng ký.

## Contract

- **Outcome:** học viên bấm nút làm test là sang trang riêng, làm đủ 30 câu, xem kết quả theo từng phần, và đăng ký với kết quả được điền sẵn.
- **Constraints:** `apps/profile` giữ zero-dependency, không bundler; không đổi API hay schema `lead`; đề và audio là nội dung gốc, không sao chép nguồn ngoài; trang chỉ phát hành sau khi cô Mỹ duyệt nội dung.
- **Non-goals:** lưu kết quả của người không đăng ký; tài khoản học viên; giới hạn giờ; đồng bộ đề vào ngân hàng đề teacher-os; bài nói (vẫn là buổi 1-1 hiện có); chống gian lận phía server.
- **Scope mode:** HOLD SCOPE.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | AI soạn 30 câu gốc và transcript; audio tạo bằng TTS hoặc cô Mỹ tự thu; cô Mỹ duyệt trước khi phát hành. | Quyết định người dùng. |
| D2 | Học viên làm bài không cần nhập thông tin, xem kết quả ngay; chỉ người bấm đăng ký mới thành lead. | Quyết định người dùng. Giữ nguyên hợp đồng `POST /public/leads`. |
| D3 | Không giới hạn giờ; mỗi đoạn audio nghe tối đa 2 lần; tiến độ, câu trả lời và số lần nghe lưu ở `localStorage`. | Quyết định người dùng. |
| D4 | Trang tĩnh trong `apps/profile/public/kiem-tra-dau-vao/`, chấm phía client bằng module thuần. | Bài xếp lớp không có phần thưởng phụ thuộc vào điểm, nên việc đáp án nằm ở client là chấp nhận được; đổi lại không tốn server và không mở thêm endpoint công khai. |
| D5 | Listening gồm 5 đoạn audio, mỗi đoạn 3 câu, độ khó tăng dần. Vocab + Grammar gồm 8 câu grammar và 7 câu vocab, trải từ A1 đến C1. | Một đoạn nhiều câu sát dạng bài nghe thật hơn 15 clip rời; giới hạn 2 lần nghe tính theo đoạn. |
| D6 | Quy đổi theo tổng điểm /30: 0–8 A1 → `ielts-foundation`; 9–15 A2 → `ielts-first-step`; 16–22 B1 → `ielts-pre`; 23–30 B2+ → `ielts-advanced`. Ngưỡng nằm trong `questions.json` và cô Mỹ duyệt cùng đề. | Dùng đúng mã khóa trong `LEAD_COURSES`. Khóa chỉ là gợi ý, học viên vẫn đổi được ở form. |
| D7 | Gỡ quiz 5 câu. Section `#lam-test-mien-phi` giữ lại làm phần giới thiệu kèm nút sang trang mới; toàn bộ CTA đổi href trực tiếp sang `kiem-tra-dau-vao/`. | Hai bài test song song cho hai kết quả mâu thuẫn. Giữ `id` để link cũ đã chia sẻ không chết. |
| D8 | Kết quả về form qua query `?ketqua=<placement>&khoa=<course>#dang-ky-tu-van`; trang chủ đọc một lần rồi xóa bằng `history.replaceState`. `khoa` phải khớp option của `select[name=course]`; `ketqua` cắt 300 ký tự (`LEAD_PLACEMENT_MAX`) và render bằng `textContent`. | Không phụ thuộc `localStorage` bị chặn. Link giả chỉ điền trước nội dung học viên vốn tự sửa được. |
| D9 | Sau khi nộp chỉ hiện điểm từng phần, CEFR và khóa đề xuất, không hiện đáp án. | Đề dùng lại lâu dài; cô Mỹ chữa khi học viên học 1-1. |
| D10 | `questions.json` có `status`. `build.mjs` dừng với lỗi rõ ràng nếu khác `approved`; chỉ đổi thành `approved` sau khi cô Mỹ xác nhận. | Biến bước duyệt nội dung thành cổng cơ học: PR không qua được CI build trước khi duyệt. `serve.mjs` không kiểm nên dev và e2e vẫn chạy. |

## Phases

| # | Phase | Phụ thuộc | Effort | Status |
|---|---|---|---|---|
| 1 | [Soạn đề, audio và bộ duyệt nội dung](phase-01-content-and-audio.md) | — | 0.5d | Pending |
| 2 | [Trang làm bài và chấm điểm](phase-02-test-page-and-grading.md) | 1 | 0.7d | Pending |
| 3 | [Nối CTA và form đăng ký](phase-03-profile-integration.md) | 2 | 0.4d | Pending |
| 4 | [E2E, tài liệu và cổng phát hành](phase-04-e2e-docs-release.md) | 2, 3 | 0.4d | Pending |

## Luồng chính

```text
CTA trên / ──> /kiem-tra-dau-vao/ ──> Phần 1 (15 câu) ──> Phần 2 (5 audio, 15 câu)
                                                                  │ nộp bài
                                                                  v
/?ketqua=…&khoa=…#dang-ky-tu-van <── "Đăng ký theo kết quả" <── Kết quả
          │
          v
form điền sẵn ──> POST /public/leads (không đổi)
```

## Tiêu chí hoàn thành

- [ ] Mọi CTA làm test trên trang profile mở `/kiem-tra-dau-vao/`, kể cả nút trong section giới thiệu; không còn quiz 5 câu.
- [ ] Bài có đúng 15 câu Vocab + Grammar và 15 câu Listening, đo bằng unit test trên `questions.json`.
- [ ] Mỗi đoạn audio không phát được lần thứ 3; tải lại trang không reset số lần nghe; audio lỗi không làm mất lượt.
- [ ] Tải lại giữa bài không mất câu trả lời.
- [ ] Kết quả hiện điểm từng phần, CEFR và khóa đề xuất theo D6, không lộ đáp án.
- [ ] Bấm đăng ký đưa `placement` và khóa vào form; lead lưu đúng `placement`; người không bấm đăng ký không tạo lead.
- [ ] Trang đạt checklist `REVIEW.md` ở 1440×900, 768×1024, 375×812 và dùng được hoàn toàn bằng bàn phím.
- [ ] `pnpm --filter profile test`, `pnpm exec biome check .`, `pnpm --filter e2e e2e` đều qua.
- [ ] Cô Mỹ đã duyệt đề, audio và ngưỡng quy đổi; `pnpm --filter profile build` qua với `status: approved`.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Máy hiện tại chưa có `ffmpeg`, Multix và `MINIMAX_API_KEY` trong vault, nên chưa tạo được TTS. | Phase 1 kiểm tra trước; thiếu công cụ thì giao transcript để cô Mỹ tự thu theo D1. |
| Host production của `msmy.io.vn` không được khai báo trong repo; chưa kiểm chứng được directory index, MIME `.mp3` và Range. | Phase 4 smoke test ngay trên bản deploy trước khi đổi link công khai. |
| Xóa storage hoặc đổi trình duyệt để nghe thêm. | Chấp nhận: bài không có thưởng theo điểm; D4. |
| Học viên giao tiếp nhận đề xuất khóa IELTS vì quiz cũ có câu chọn mục tiêu còn bài mới thì không. | Kết quả ghi rõ khóa là gợi ý; form cho đổi khóa và cô Mỹ tư vấn lại. |

## Validation Log

### Verification Results

- Tier: Standard (4 phase). Claims checked: 11. Verified: 10. Unverified: 1.
- Unverified: host production của `msmy.io.vn`, đã ghi ở mục Rủi ro và smoke test phase 4.
- Verified trong source: 7 href `#lam-test-mien-phi`; `serve.mjs` không phục vụ directory index và chưa có MIME `.mp3`, `.json`; `build.mjs` chỉ inject meta vào trang chủ nên trang mới không cần đổi cơ chế inject; `getCombinedPlacement` cắt 300 ký tự và `LEAD_PLACEMENT_MAX = 300`; `restoreDraft` khôi phục `quizPlacement`; `LEAD_COURSES` có đủ 4 mã trong D6; không test hay spec nào bám `placementQuizForm`; chữ "2 Phút" và "5 câu" nằm ở các dòng phase 3 sẽ sửa; `MINIMAX_API_KEY` chưa có trong env lẫn vault.
- Sửa trong quá trình validate: bỏ `transcript` khỏi schema `questions.json` để không lộ nội dung nghe.
- Red-team: không chạy vì plan ở mode fast theo auto-detect; phạm vi rõ, không đổi API hay schema.

### Quyết định của người dùng

- Nội dung: AI soạn, cô Mỹ duyệt.
- Thu lead: làm trước, đăng ký sau.
- Luật làm bài: không giới hạn giờ, nghe tối đa 2 lần.

<!-- slug: profile-placement-test -->
