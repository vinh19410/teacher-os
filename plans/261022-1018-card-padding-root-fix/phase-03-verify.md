---
phase: 3
title: "Verify UI 3 viewport + design:compare"
status: pending
---

# Phase 3 — Verify

## Steps

1. Dev stack local (8000/8001/8003), mở `/profile`, `/syllabus`, `/syllabus/$id`, `/tuition/$id`,
   `/students/$id`, `/assignments`, `/grading`, `/classes/$id` ở 1440×900, 768×1024, 375×812 (theo `REVIEW.md`).
   Đo: nội dung cách mép card 24px; khoảng dọc không còn phình.
2. `pnpm design:compare` — đính screenshot trước/sau vào PR.
3. Gate local: `pnpm check`, `pnpm check-types`, `pnpm --filter web test`.
4. E2E full (port 8100/8101/8103): `pnpm --filter e2e e2e` — bắt buộc trước khi squash-merge vào `develop`.

## Báo cáo tách mức

- Cú pháp/type/lint: máy kiểm.
- Unit test hợp đồng Card: máy kiểm.
- Thẩm mỹ khớp design v2 ở từng màn: người/AI đối chiếu screenshot — máy không kết luận được.
