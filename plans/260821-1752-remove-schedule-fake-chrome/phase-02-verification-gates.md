---
phase: 2
title: "Verification gates + evidence"
status: completed
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Verification gates + evidence

## Overview
Chạy toàn bộ gate mirror đúng CI trên worktree, xác nhận 0 phần tử giả còn sót trong source lẫn build output, và tổng hợp evidence cho issue #58 (DOD M1 "0 CTA no-op trong luồng classes/schedule").

## Requirements
- Functional: mọi gate của repo xanh trên branch `feat/58-remove-schedule-fake-chrome`, đúng đúng bước CI chạy.
- Non-functional: evidence ghi lại bằng lệnh + output thật, không weaken test nào; phase này KHÔNG sửa code (mọi fix quay lại phase 1).

## Architecture
CI (`.github/workflows/ci.yml`) chạy 4 step: `pnpm install --frozen-lockfile`, `pnpm exec biome check .` (read-only, KHÔNG `--write`), `pnpm test`, `pnpm check-types`, `pnpm build`. Local mirror đủ set này. Lưu ý: local `pnpm check` là `biome check --write .` (auto-fix) — chỉ dùng ở phase 1 để format; phase 2 verify bằng `pnpm exec biome check .` read-only, và mọi diff từ `--write` phải đã commit trước khi vào phase 2.

## Related Code Files
- Create: `plans/260821-1752-remove-schedule-fake-chrome/reports/evidence.md` (tổng hợp evidence)
- Modify: (không đổi code trong phase này — chỉ verify; nếu gate fail thì quay lại phase 1)

## Implementation Steps
1. `pnpm test` (từ root worktree — turbo test + 2 script test CI/topology; bao gồm contract test schedule-chrome mới).
2. `pnpm check-types` (vite build + tsc --noEmit cho web; các package khác theo turbo).
3. `pnpm exec biome check .` (read-only, mirror CI — không `--write` ở bước này).
4. Grep scoped 4 file (chính là các assertion của contract test, chạy tay để evidence): `grep -n "dayDates\|todayIdx\|GCal\|19–25\|11 buổi học\|← Trước\|Sau →\|Tuần này" apps/web/src/routes/_auth/schedule.tsx apps/web/src/components/schedule/lesson-modal.tsx "apps/web/src/routes/_auth/classes/\$classId.tsx" apps/web/src/lib/mock-data.ts` → 0 kết quả. (KHÔNG grep toàn `apps/web/src` — "Tuần này" tồn tại hợp lệ ở `settings.tsx:29` + contract test dashboard.)
5. Build web (`pnpm build` hoặc `pnpm -F web build`) và grep string giả trong `apps/web/dist/assets/` → 0 kết quả ("GCal · Đã bật", "19–25/08" không còn trong bundle).
6. Viết `reports/evidence.md`: từng gate, lệnh, kết quả; liên kết Success Criteria của plan.md.

## Success Criteria
- [x] `pnpm test` exit 0.
- [x] `pnpm check-types` exit 0.
- [x] `pnpm exec biome check .` exit 0.
- [x] `pnpm build` exit 0.
- [x] Grep scoped source + dist: 0 kết quả cho các chuỗi giả.
- [x] `reports/evidence.md` tồn tại với evidence thật.

## Risk Assessment
- Gate fail do import thừa/unused export → fix trong phase 1 rồi chạy lại phase 2 (deterministic, không cần replan).
- Biome read-only fail do class sort chưa commit (diff `--write` của phase 1 chưa commit) → commit diff trước khi verify; KHÔNG chạy `--write` trong phase 2 để che.
- `dist/` là artifact build địa phương (không track trong git) — chỉ dùng làm evidence, không commit.
