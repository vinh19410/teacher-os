---
phase: 1
title: "Phase 1: Contract min(1) + server tests"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Contract min(1) + server tests

## Overview

Nâng server contract `total` lên `min(1)` cho cả `studentCreateSchema` và `enrollStudentSchema`, test-first: thêm case 400 vào `kernel.test.ts` trước (case `total=0` phải ĐỎ), rồi sửa contract để xanh. Client chưa đụng trong phase này.

<!-- Updated: Red Team Session 1 - corrected route paths /api/students (app.ts mounts kernel at /api), static error shape, pnpm filter syntax, split red-first vs regression-lock criteria, pin omitted-field defaults -->

## Requirements

- Functional: `total: 0` bị server từ chối (400) trên POST `/api/students` và POST `/api/classes/:id/enroll` (kernel routes mount tại `/api` — `app.ts:103`, cùng path `kernel.test.ts:289` đang gọi); `total: 1` hợp lệ; `price: -500` bị chặn (đã có từ `min(0)` — test là regression-lock, sinh ra xanh, KHÔNG đỏ-first); `price: 0` hợp lệ.
- Functional (pin hành vi chủ đích): request **omit** `total`/`price` → vẫn 201 với default `10`/`400000` — đây là quyết định có chủ đích từ #122 (`kernel.test.ts:3148` đã assert). Thêm 1 test pin để ranh giới này tường minh thay vì ngầm.
- Non-functional: KHÔNG đổi shape error response — hiện tại là static `{ error: "invalid body" }` 400 từ `readBody` (`kernel.ts:150-152`, zod issues bị discard, không có zod flatten). Test chỉ assert status 400.

## Architecture

Zod schema ở `packages/api/src/contracts.ts` là nguồn thật duy nhất cho cả hai route (server `readBody`). Route handler không đổi — chỉ đổi min. Test ở `apps/server/src/kernel.test.ts` theo pattern test route hiện có (gọi app với input sai, assert 400).

## Related Code Files

- Modify: `packages/api/src/contracts.ts` — `studentCreateSchema.total` và `enrollStudentSchema.total`: `.min(0)` → `.min(1)` (kèm comment mirror issue #115)
- Modify: `apps/server/src/kernel.test.ts` — thêm case: create student total=0 → 400; enroll total=0 → 400; price=-500 → 400 (regression-lock); price=0 + total=1 → pass; omit total/price → 201 + defaults (pin)

## Implementation Steps

1. Đọc `kernel.test.ts` quanh dòng 289 (POST /students) và 3139-3163 (enroll matrix) để nối theo đúng pattern seed db + gọi request.
2. Viết test: case `total=0` (2 route) → chạy `pnpm --filter server exec vitest run src/kernel.test.ts` → xác nhận ĐỎ (đỏ đúng vì `min(0)` còn nhận 0 — không phải đỏ vì lỗi cú pháp/đường dẫn). Case price/omitted sinh ra xanh ngay — ghi rõ trong evidence đây là regression-lock, không phải TDD red.
3. Sửa 2 schema `total` → `.min(1)` với comment ngắn mirror #115. Giữ nguyên `.default(10)`/`.default(400000)` — default là quyết định chủ đích của #122, chỉ min mới đổi.
4. Chạy lại `pnpm --filter server test` → XANH toàn bộ (kể cả test defaults pin mới).

## Success Criteria

- [x] Case `total=0` ĐỎ trước (min(0) còn cho phép) / XANH sau; case price + omitted-defaults là regression-lock sinh ra xanh (ghi chú rõ, không claim TDD)
- [x] `total=0` → 400 trên cả 2 route; `total=1` pass — assert status, không assert body zod
- [x] `price=0` pass, `price<0` chặn — có assertion
- [x] Omit total/price → 201 với default 10/400000 — pinned, đánh dấu "intentional #122"
- [x] Toàn bộ server test suite xanh (`pnpm --filter server test`)

## Risk Assessment

- Giả định: không caller nào trong repo gửi `total=0` — 3 reviewer red-team đã grep verify toàn repo (server tests + e2e chỉ fill "10"/"400000"); nếu CI/e2e đỏ chỗ bất ngờ → signal là fixture cũ dùng 0, sửa fixture chứ không nới schema.
