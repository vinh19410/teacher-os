# 2026-08-25 — Syllabus modal mirror class flow (issue 77)

## What
Popup Tạo syllabus mới chọn loại lớp (ielts/communication) rồi kỹ năng, persist `type` + `skills[]`. Ship beta → `develop`.

## Decisions
- Migration 0008 viết tay theo 0007 (ADD type, RENAME skill→skills, json_array, empty→[]). Không apply SQL drizzle-kit generate.
- Snapshot tái sử dụng `parseSkills` + `knownClassTypes`. Cấm JSON.parse trần.
- Release unit: migration + worker + web cùng alchemy deploy. Không dual-write.
- Assign-syllabus không filter theo type (non-goal đã confirm).
- Backfill `skill=''` → `type=ielts` + `skills=[]` (cosmetic drift chấp nhận).
- Giữ `id` trên KernelAction; list giữ ternary "Tất cả".

## Challenges
- POST insert và snapshot map suýt drop `level` khi thay `skill` — reviewer bắt, đã thêm lại + assert Band 7.0.
- `db:generate` sạch sau snapshot 0008 clone từ 0007.
- Stash-merge `origin/develop` (e2e/schedule) rồi pop; tests sau merge: server 103, web 234.

## Verify
- `pnpm --filter server test` 103 pass
- `pnpm --filter web test` 234 pass
- `pnpm --filter server check-types` / `web check-types` xanh
- `pnpm --filter @teacher-os/db db:generate` không sinh 0009
