---
phase: 4
title: "Đợt 2: dọn DNS, đưa profile lên prod"
status: pending
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: Đợt 2 — dọn DNS, đưa profile lên prod

## Goal

Gắn custom domain msmy.io.vn và www vào Worker profile trên prod, giữ nguyên mail của zone.

## Files to Create / Modify

- Modify: `docs/production-release-runbook.md` (dòng sign-off của release)

## Tasks & Steps

1. Chạy lại kiểm tra `/public/placement-test` của Phase 2 để chắc bộ đề vẫn đang phát hành.
2. Lưu snapshot DNS của zone ra ngoài repo: tên, loại, giá trị, trạng thái proxy của mọi bản ghi.
3. Trình người dùng danh sách chính xác các bản ghi A/AAAA/CNAME của `msmy.io.vn` và `www.msmy.io.vn` sẽ xóa. Người dùng đã duyệt nguyên tắc, nhưng cần xác nhận lại danh sách thật vì xóa DNS khó đảo ngược.
4. Xóa đúng các bản ghi đó. **Không đụng MX, TXT, hay subdomain khác** (ví dụ bản ghi mail của Tino).
5. Mở PR `develop` → `main` và chờ người dùng duyệt merge.
6. Theo dõi `deploy.yml` đến khi xanh, gồm `Smoke check profile`. Lần gắn domain đầu có thể phải chờ cấp chứng chỉ vài phút.
7. Chạy smoke trên Safari iOS theo bước 6 của mục phát hành bộ đề trong runbook.
8. Thêm dòng sign-off, cập nhật status plan và chuyển issue #536 theo vòng đời board.

## Verification

- `curl -I https://msmy.io.vn/` và `curl -I https://www.msmy.io.vn/` trả `200`.
- `curl -s https://msmy.io.vn/ | grep -E 'lead-api|canonical'` cho thấy `https://api.teacheros.io.vn` và canonical apex.
- `dig +short MX msmy.io.vn` và `dig +short TXT msmy.io.vn` khớp snapshot ở bước 2.
- `curl -I https://msmy.io.vn/assets/teacher-profile/pdf/02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf` trả `200` kèm `application/pdf`.
- Gửi form thật từ apex và từ www, lead hiện trên `/leads`, sau đó xóa hoặc đánh dấu lead test.
- Làm bài ở `/kiem-tra-dau-vao/`, audio phát được trên Safari iOS, kết quả chuyển về form.

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

Ghi chú vận hành:
- **Deploy báo lỗi zone hoặc quyền:** bước `Deploy to Cloudflare` dừng trước khi chạy các smoke check sau deploy; sửa token ở Cloudflare, cập nhật secret, chạy lại `workflow_dispatch`.
- **Deploy báo trùng hostname hoặc bản ghi DNS:** đọc lỗi, kiểm tra bản ghi còn sót. Không tự thêm cờ override.
- **Smoke fail do `lead-api` sai:** kiểm tra lại việc truyền `LEAD_API_URL`; nếu revert PR profile sau khi đã xóa DNS ở bước 4, nhớ khôi phục các bản ghi DNS từ snapshot bước 2 để tránh `NXDOMAIN`.
- **Mail lỗi:** khôi phục bản ghi từ snapshot trước tiên, rồi mới điều tra.
