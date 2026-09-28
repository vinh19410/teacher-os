# PM Report — Sync status GitHub Project "Teacher OS" (#8)

**Ngày:** 2026-09-24 · **Phạm vi:** https://github.com/users/vinh19410/projects/8 (114 items)

## Kết quả

Đồng bộ project board với trạng thái thực tế của repo. 8 issue đang kẹt ở **Backlog** dù công việc đã hoàn thành (plan `completed` + PR đã merge) đã được chuyển sang **Done** và đóng issue. Board hiện nhất quán: **113/114 items Done + CLOSED**, chỉ còn #260 (Backlog, OPEN) — đúng vì plan mới được commit, status `pending`, chưa triển khai.

## Thay đổi

| Issue | Tiêu đề | Bằng chứng hoàn thành | Hành động |
|---|---|---|---|
| #229 | Hiển thị kỹ năng syllabus trong modal tạo lớp | PR #231 merged · plan `completed` | Backlog → Done |
| #230 | Input tiền format VNĐ khi gõ | PR #233 merged · plan `completed` (16/16) | Backlog → Done |
| #232 | Tự động chọn kỹ năng lớp theo syllabus | PR #234 merged · plan `completed` | Backlog → Done |
| #240 | Tạo học viên — trường danh tính, gói derive từ lớp | PR #243 merged · plan `completed` | Backlog → Done |
| #245 | Hồ sơ học viên hiển thị lớp thay vì gói | PR #246 merged · plan `completed` | Backlog → Done |
| #247 | Danh sách học viên hiển thị lớp thay vì gói | PR #248 merged · plan `completed` (9/9) | Backlog → Done |
| #251 | Enroll-existing bỏ input gói | PR #252 merged · plan `completed` (21/21) | Backlog → Done |
| #254 | Student Portal app (login + tổng quan) | PR #255 merged · plan `completed` (52/52) | Backlog → Done |

Ghi chú: sau khi board chuyển Done, các issue tự động CLOSED (không phải lệnh `gh issue close` của session này — có thể do automation của project/repo).

## Không thay đổi

- **#260** (Tách role tài khoản theo app): giữ **Backlog** — mới có plan commit `0721410`, plan status `pending` (0/30 phase tasks), chưa có implementation.

## Câu hỏi chưa giải quyết

1. **Checkbox sync-back lag ở 3 plan đã hoàn thành:** `260922-0716-student-create-identity-fields` (#240, 49 unchecked), `260922-0859-student-profile-class-instead-of-package` (#245, 18 unchecked), `260923-0550-enrollment-invite-accept-flow` (#253, 25 unchecked) — frontmatter ghi `completed` nhưng phase files còn nhiều `[ ]`. Cần rà soát từng mục trước khi backfill `[x]` để không đánh dấu sai việc chưa làm.
2. Có automation nào trên repo/project tự đóng issue khi Status → Done không? Nếu không, cần xác nhận lại ai đã đóng 8 issue trên.
