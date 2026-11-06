---
phase: 1
title: "Sửa nhãn và cập nhật test, docs"
status: completed
priority: P2
effort: "15m"
dependencies: []
---

# Phase 1: Sửa nhãn và cập nhật test, docs

## Goal

Đổi nhãn `#studentPortalLink` thành "Góc học viên" ở UI, test và tài liệu hiện hành, không đổi hành vi nào khác.

## Files to Modify

- `apps/profile/tests/index.test.mjs`: dòng 294, 320, 325, 332, 340.
- `apps/profile/public/index.html`: dòng 914.
- `docs/codebase-summary.md`: dòng 40.
- `CHANGELOG.md`: mục `### Fixed` của ngày làm việc.

## Tasks & Steps

1. Trong `apps/profile/tests/index.test.mjs`, thay toàn bộ `Gốc học viên` bằng `Góc học viên`, rồi chạy `pnpm --filter profile test` và xác nhận test nhãn fail vì HTML chưa đổi.
2. Trong `apps/profile/public/index.html`, đổi nhãn của `<a id="studentPortalLink">` thành `Góc học viên`, không đụng các thuộc tính khác.
3. Trong `docs/codebase-summary.md`, đổi nhãn ở phần mô tả `apps/profile`.
4. Trong `CHANGELOG.md`, thêm vào `### Fixed` của ngày làm việc một dòng ghi sửa chính tả nhãn nút, kèm số issue. Không sửa dòng #560 đã có.
5. Mở `apps/profile` ở `1440×900`, `768×1024`, `375×812`, `320×812`, chụp ảnh header để kèm PR. `pnpm design:compare` không chụp landing này nên không dùng được làm bằng chứng.

## Verification

```bash
pnpm --filter profile test
pnpm exec biome check .
grep -rn "Gốc học viên" apps packages docs   # kỳ vọng không có kết quả
```

- Nhãn hiển thị đúng và header không tràn ngang ở cả 4 viewport.
- `git diff --stat` chỉ gồm 4 file trong danh sách trên.
- Không bắt buộc full e2e, vì chỉ `ak-ship` mode `official` mới yêu cầu.
