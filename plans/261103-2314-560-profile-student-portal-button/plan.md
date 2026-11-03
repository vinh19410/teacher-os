---
title: "#560: Nút \"Gốc học viên\" ở trang profile dẫn tới student portal"
description: "Thêm nút \"Gốc học viên\" trên header apps/profile, trỏ tới origin của apps/student theo từng môi trường (prod/staging/dev)."
status: pending
priority: P3
effort: 2h
issue: 560
branch: feat/560-profile-student-portal-button
tags: [frontend, profile, infra]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #560 — Nút "Gốc học viên" ở trang profile

## Outcome

Trang `apps/profile` có nút **"Gốc học viên"** (header, desktop + mobile). Bấm vào sẽ mở student portal (`apps/student`) đúng môi trường: prod `https://student.teacheros.io.vn`, staging `https://student.staging.teacheros.io.vn`, dev `http://localhost:8003`.

## Non-goals

- Không đổi `apps/student`, API, auth, CORS.
- Không thêm nút ở trang `kiem-tra-dau-vao/` (chỉ trang chủ profile, trừ khi chủ dự án yêu cầu thêm).
- Không đổi hành vi các CTA hiện có.

## Phát hiện từ scout

- `apps/profile` là site tĩnh (`public/index.html`), không có bundler. Origin khác nhau theo môi trường nên **không hard-code** được.
- Tiền lệ cùng loại: `LEAD_API_URL` → `<meta name="lead-api">`, thay lúc build (`build.mjs`) và lúc dev (`serve.mjs` `replaceLeadApiMeta`), truyền từ `packages/infra/alchemy.run.ts` (StaticSite `profile`, `env`).
- Topology đã có `topology.studentOrigin` (`packages/infra/src/topology.ts`); khi không có topology dùng `studentWorker.url`; dev local là port 8003.
- Header hiện có `.nav-actions` với 2 nút CTA (dòng ~1883 của `index.html`).

## Hướng làm

Nhân bản đúng cơ chế `lead-api`: env `STUDENT_PORTAL_URL` → thay `href` của nút lúc build/dev. HTML mặc định trỏ prod để file mở thẳng vẫn dùng được. Một cơ chế duy nhất, không thêm abstraction.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Nút + cơ chế thay URL + wiring infra](phase-01-student-portal-button.md) | pending |

## Acceptance criteria

- Header có nút "Gốc học viên" (`<a>`, `rel="noopener"`), href mặc định `https://student.teacheros.io.vn`.
- `STUDENT_PORTAL_URL` đặt → build/dev thay href; để trống → giữ mặc định.
- `alchemy.run.ts` truyền origin student đúng theo topology / workers.dev / dev 8003.
- Test mới trong `apps/profile/tests` xanh; `pnpm --filter profile test`, `pnpm exec biome check .`, `pnpm check-types` xanh.
- 3 viewport (1440×900, 768×1024, 375×812): nút hiển thị, không vỡ header, focus bàn phím thấy rõ.

## Phụ thuộc / lưu ý

- #559 cũng sửa `apps/profile/public/index.html` (khối khác) — không chặn nhau, chỉ có thể cần rebase.
