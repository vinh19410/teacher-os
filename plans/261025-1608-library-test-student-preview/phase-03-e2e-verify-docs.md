---
phase: 3
title: "E2E, verify 3 viewport, docs"
status: completed
priority: P2
effort: "0.5d"
dependsOn: [2]
---

# Phase 3 — E2E + verify + docs

## File sở hữu

| File | Hành động |
|---|---|
| `apps/e2e/specs/admin-library-reading.spec.ts` | sửa — thêm case Xem trước |
| `apps/e2e/specs/admin-library-listening.spec.ts` | sửa — thêm case Xem trước |
| `docs/` (trang mô tả admin library nếu có) | sửa ngắn — nhắc nút Xem trước |

## E2E

- Reading: tạo/mở đề có 2 nhóm khác type + option bank nhóm, sửa một câu **không lưu**, bấm Xem trước → thấy câu đã sửa, thấy split-pane passage, nhãn `Questions X–Y`, option bank của nhóm, **không có alert "Thiếu ngân hàng lựa chọn"** (RT2); chọn một đáp án; Esc → trang soạn vẫn còn "Có thay đổi chưa lưu"; mở lại → đáp án đã chọn trống.
- Listening: tab Section 2 có số câu bắt đầu đúng sau Section 1; nhãn `🔊 <tên file>` hiện khi part có audio; part có pin (qOffset > 0) → điền pin ghi đúng đáp án khi chuyển tab qua lại (RT1).
- Header dirty → bấm Xem trước → assert **0** request `PUT/PATCH/POST/DELETE` trong lúc overlay mở (`page.on("request")`), đóng overlay → blur header vẫn lưu như cũ (RT4).
- Part draft hỏng schema + chưa lưu → tab hiện trạng thái "bản nháp không hợp lệ", không phải "chưa có nội dung" (RT12).
- Assert không có request `PUT/PATCH/POST/DELETE` nào trong lúc overlay mở (`page.on("request")`).

Chạy với port override:

```bash
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- admin-library
```

Trước khi merge vào `develop`: chạy full Playwright suite (quy ước dự án).

## Verify UI

- 1440×900, 768×1024, 375×812: overlay không tràn ngang, tab part cuộn ngang được trên mobile, split-pane xếp 1 cột dưới `lg`; ở lg, navigator nằm TRONG viewport kể cả khi banner nhiều dòng (RT13 — fillParent, không calc cứng).
- Bàn phím: Tab vào overlay, mũi tên chuyển tab, Esc đóng, focus trả về nút Xem trước.
- Screenshot đính kèm PR; chạy `pnpm design:compare` nếu PR đụng hình ảnh trang soạn.

## Gate cuối

```bash
pnpm check
pnpm check-types
pnpm --filter @teacher-os/api test
pnpm --filter @teacher-os/ui test
pnpm --filter admin test
pnpm --filter student test
pnpm --filter web test
```
