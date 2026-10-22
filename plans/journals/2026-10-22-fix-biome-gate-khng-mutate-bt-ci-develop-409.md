---
title: "Fix biome gate không mutate + bật CI develop (#409)"
date: 2026-10-22
---

# Fix biome gate không mutate + bật CI develop (#409)

## Root cause
`pnpm check` = `biome check --write .` — gate vừa đỏ (34 errors: 33 từ artifact HTML plans/reports/brainstorm-261021-1500-syllabus-refactor.html, 1 formatter error apps/e2e/devserver-watchdog.mjs từ #408) vừa tự mutate file ngoài phạm vi. Số liệu "32 errors" trong issue đo trên tree đã bị --write mutate (baseline nhiễm chính bug). CI chỉ trigger main nên develop merge lúc gate đỏ im lặng.

## Fix
biome.json: exclude hẹp plans/reports/**/*.html + rules.recommended → preset:recommended; package.json: check read-only + check:fix giữ autofix; format-only watchdog; ci.yml: develop vào push+pull_request branches; contract test khóa cấu trúc + root check non-mutating; AGENTS.md đồng bộ.

## Lessons
1. Đo baseline bằng read-only run trên tree sạch — số liệu đo sau khi --write chạy là nhiễm bug đang fix (2 red-team reviewer + kongming đều bắt).
2. Self-referential baseline: pass condition đếm cả diagnostic của chính bug đang fix (deprecation info) — mọi con số trong Verify phải truy được về rule/diagnostic cụ thể.
3. Rebase trước khi mở PR: develop tiến #410 giữa chừng — merge khi thiếu rebase = hoàn tác âm thầm.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
