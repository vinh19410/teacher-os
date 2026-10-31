---
title: Plan giáo viên sửa bộ đề kiểm tra đầu vào
date: 2026-10-31
summary: "Lập plan #515 chuyển đề /kiem-tra-dau-vao/ từ file tĩnh sang DB, sửa và phát hành trong apps/web"
---

# Plan giáo viên sửa bộ đề kiểm tra đầu vào

## What happened

Lập plan #515 tại `plans/261031-1242-515-placement-test-editor/`. Đề `/kiem-tra-dau-vao/` đang là `questions.json` và 5 MP3 trong repo nên mọi thay đổi đều cần deploy.

## Decision

- Sửa ở `apps/web`, route `/placement-test`; chỉ vai trò `canAccessFinance` được ghi.
- Nút Phát hành là bước duyệt của cô Mỹ, thay cổng `status` trong `build.mjs` của #511.
- API lỗi hoặc chưa phát hành thì trang hiện bảo trì; không có đề dự phòng tĩnh.
- Số câu linh hoạt, mỗi câu đúng 4 đáp án, ngưỡng phải phủ kín `0..tổng điểm`.

Các ràng buộc phát hiện khi scout: guard kernel chặn POST không phải JSON nên upload audio dùng PUT; route audio hiện có chưa hỗ trợ `Range` mà Safari iOS cần; CSP của web không có `media-src`.

## Next steps

Chạy `/ak-cook` theo plan. Khi deploy phải đi đúng thứ tự: server và web, cô Mỹ phát hành, rồi mới tới `apps/profile`. Còn phải kiểm trên header thật xem `blob:` có bị CSP chặn không.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
