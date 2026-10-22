---
phase: 3
title: "Verify UI 3 viewport + design:compare"
status: done
---

# Phase 3 — Verify

## Steps

1. Dev stack local (8000/8001/8003). Route list **derive từ output audit phase 2**: mọi file có `<Card`
   được sửa hoặc ghi nhận đều phải được chụp trước/sau. Tối thiểu (đã đối chiếu consumer map):
   `/profile`, `/syllabus`, `/syllabus/$id`, `/tuition`, `/tuition/$id`, `/students`, `/students/$id`,
   `/assignments`, `/assignments/$id`, `/assignments/tests/new` + `/assignments/tests/$id` (test builder,
   sticky sidebar `py-4`), `/grading`, `/classes`, `/classes/$id`, `/reports`, `/dashboard`, `/schedule`,
   `/vocab` — ở 1440×900, 768×1024, 375×812 (theo `REVIEW.md`).
   Đo cả 2 chiều: nội dung cách mép card 24px; khoảng dọc không còn **phình** (gap-6 + mt-* cộng dồn) và
   không bị **mất** (collapse sau khi bỏ gap-6 ở call site quên thêm gap).
2. `pnpm design:compare` — LƯU Ý: script chỉ **chụp** (`scripts/design-compare/capture.mjs`, capture-only,
   exit 0 không có nghĩa là không vỡ). Gate thật = người/AI đối chiếu từng cặp screenshot trước/sau của
   MỌI route ở bước 1, kèm quyết định accept/fix từng cặp.
3. Gate local: `pnpm check`, `pnpm check-types`, `pnpm --filter web test`.
4. E2E full (port 8100/8101/8103): `pnpm --filter e2e e2e` — bắt buộc trước khi squash-merge vào `develop`.
   E2e dùng testid/role nên KHÔNG bắt lỗi visual padding — vai trò của nó là gate chức năng, không thay
   thế bước 2.

## Báo cáo tách mức

- Cú pháp/type/lint: máy kiểm.
- Unit test hợp đồng Card: máy kiểm.
- Thẩm mỹ khớp design v2 ở từng màn: người/AI đối chiếu screenshot — máy không kết luận được.
