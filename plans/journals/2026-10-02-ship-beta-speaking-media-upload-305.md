---
title: "Ship beta màn nộp bài Speaking upload audio/video (#305)"
date: 2026-10-02
summary: "Implement 4 phase #305: R2 + MediaStore, endpoint media CAS, panel kéo-thả, summary nghe lại; red-team và code review sửa self-heal submit, deploy window, note của giáo viên"
---

# Ship beta màn nộp bài Speaking upload audio/video (#305)

## What happened
- Implement đủ 4 phase của `plans/261002-1247-student-speaking-media-upload/`:
  - Bucket R2 `MEDIA` và `MediaStore` inject qua deps.
  - Migration 0032 thêm 5 cột `media_*`.
  - `PUT`/`DELETE`/`GET /api/student/attempts/:id/media`.
  - Panel kéo-thả trên take screen và nhánh Speaking ở summary.
- Red-team trước implement (3 reviewer, 15 finding, nhận 14). Hai lỗi thật đáng nhớ:
  - Thêm predicate media vào UPDATE submit tạo thêm một lý do "flip 0 row". Nhánh self-heal cũ coi mọi 0 row là "đã nộp", nên đóng dấu `submittedAt` dù attempt còn `in_progress`. Sửa: re-read `status`, chỉ self-heal khi `submitted`.
  - Field summary mới phải optional theo precedent `essay` của #304, không thì client mới + server cũ vỡ mọi màn kết quả.
- Code review sau implement phát hiện "hướng dẫn của giáo viên" lấy từ `intro`, nhưng composer Speaking không có ô `intro`. Giáo viên chỉ nhập được "Hướng dẫn thêm" (`note`). User chốt: gửi `note` xuống take payload **chỉ với đề Speaking**.
- Gate: server 492, student 233, web 1184, e2e quiz + class detail 14/14, check-types 7/7.

## Decision
- **Đếm byte thật dùng chung:** `enforceDeclaredSize` (TransformStream) dùng cho cả R2, fs và Map. R2 nối thêm `FixedLengthStream`. Không map lỗi runtime theo message.
- **CORP `same-site` cho GET media:** set bằng middleware ngoài `secureHeaders`. Đã test thấy `secureHeaders` ghi đè header do handler set.
- **Guard ghi:** chỉ PUT/DELETE đúng path media bỏ qua JSON + bodyLimit. Mọi method ghi khác vẫn qua guard.
- **Client:** media đọc thẳng từ cache React Query (`setQueryData` sau khi `cancelQueries`), không giữ bản sao state. `beforeunload` đọc ref để redirect 409/401 không bật hộp "Leave site?". `useBlocker` hỏi trước khi rời màn khi đang tải.
- **Test UI:** chỉ markup tĩnh + logic thuần, vì app student chạy vitest node, không có testing-library. Tương tác thật phủ bằng 3 test e2e, gồm giữ PUT bằng `page.route` để test Hủy và chặn điều hướng.

## Next steps
- Release đầu: bật R2 trên tài khoản Cloudflare và cấp quyền "Workers R2 Storage: Edit" cho token deploy (runbook mục #305). Diễn tập staging trước.
- Chưa chạy được `alchemy dev` với binding R2 vì port 8000/8001/8003 đang bị dev stack phiên khác chiếm. Cần kiểm thủ công.
- Follow-up: giáo viên nghe/chấm bài nói (gộp issue chấm bài Writing/Speaking của #304), job đối chiếu object R2 mồ côi, tuỳ chọn ghi âm trực tiếp (MediaRecorder).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
