---
phase: 1
title: "Contract + DB migration + server"
status: completed
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 1: Contract + DB migration + server

## Overview

Đưa `type` (loại lớp) và `skills` (mảng kỹ năng) vào zod contract và DB, đổi `schedule` trên wire thành object có cấu trúc, cập nhật POST `/api/classes` + snapshot mapping. Kết thúc phase: API ghi/đọc được class mới, DB migrate back-compat.

## Requirements

- Functional: `classCreateSchema` nhận `type: "ielts"|"communication"` (default `"ielts"`), `skills: array` thuộc `["Writing","Speaking","Reading","Listening"]` (default `[]`), `schedule: {days: number[] (0–6, ≥1, ≤7, không trùng), start: "HH:MM", end: "HH:MM"}` (bắt buộc). Cross-field invariant qua `superRefine`: `type="ielts"` → `skills.length ≥ 1`; `type="communication"` → `skills` phải rỗng. Time regex chặt: `/^([01]\d|2[0-3]):[0-5]\d$/`. Overnight: `end <= start` nghĩa là qua ngày hôm sau — hợp lệ, không validate `end > start`. Server insert `type`, `skills` (JSON string), `schedule` (JSON string; days dedupe trước khi lưu). Snapshot trả `type` + `skills: string[]` (parsed), `schedule` giữ raw string.
- Non-functional: migration forward-only; parse JSON phòng vệ (fallback `[]`); không đổi auth/CSRF/bus.

## Architecture

Wire → DB → read path:

```
modal payload ──POST /api/classes──▶ zod classCreateSchema (object schedule)
                                        │
                                        ▼
                       classTable: type TEXT 'ielts' | skills TEXT (JSON) | schedule TEXT (JSON)
                                        │
                                        ▼
       snapshot.ts: skills = parseSkills(row.skills) → KernelClassRow.skills: string[]
```

- `ClassType` union export từ `packages/api/src/contracts.ts` làm single source of truth (web import type này).
- `parseSkills(raw): string[]` — helper server-side, `try { JSON.parse }` + `Array.isArray` check, fallback `[]`.
- Migration `0007_*.sql`. **Quan trọng (red-team F1/F6):** khi đổi cả tên cột lẫn default (`skill` default `''` → `skills` default `'[]'`), `pnpm --filter db db:generate` nhiều khả năng sinh table-rebuild kiểu `__new_class` (style 0006) thay vì `RENAME COLUMN`. Chiến lược: chạy generate để có entry journal + file, rồi **viết lại tay file 0007** thành chuỗi ALTER tường minh (SQLite ≥3.35 hỗ trợ cả hai), theo đúng thứ tự sau — thứ tự UPDATE bắt buộc để không corrupt rows `skill=''` thành `'["[]"]'`:
  ```sql
  ALTER TABLE "class" ADD "type" text NOT NULL DEFAULT 'ielts';
  ALTER TABLE "class" RENAME COLUMN "skill" TO "skills";
  UPDATE "class" SET "type" = 'communication' WHERE "skills" = 'Giao tiếp';
  -- wrap TRƯỚC, có guard không đụng rows rỗng
  UPDATE "class" SET "skills" = json_array("skills") WHERE "type" = 'ielts' AND "skills" <> '';
  -- blanket '[]' SAU CÙNG: rows rỗng + communication
  UPDATE "class" SET "skills" = '[]' WHERE "skills" = '' OR "type" = 'communication';
  ```
  Sau apply chạy sanity check: `SELECT count(*) FROM "class" WHERE "type"='ielts' AND "skills" NOT LIKE '[%'` phải = 0 (không còn skill đơn lẻ sót). Divergence default DB `''` vs schema `'[]'` chấp nhận có chủ đích (zod + server luôn ghi giá trị đầy đủ).

## Related Code Files

- Modify: `packages/api/src/contracts.ts` (`classCreateSchema`, `KernelClassRow`, export `ClassType`, `IELTS_SKILLS`)
- Modify: `packages/db/src/schema/class.ts` (cột `type`, rename `skill`→`skills`)
- Create: `packages/db/src/migrations/0007_*.sql` (+ `meta/_journal.json` qua db:generate)
- Modify: `apps/server/src/routes/kernel.ts:223-253` (POST /api/classes insert field mới)
- Modify: `apps/server/src/routes/snapshot.ts:174-177` (map `type`, `skills` parsed)
- Modify: `apps/server/src/kernel.test.ts` (helper `createClass` ~192-212 + test mới)

## Implementation Steps

1. `contracts.ts`: thêm `export const CLASS_TYPES = ["ielts","communication"] as const;` + `export type ClassType = (typeof CLASS_TYPES)[number];` + `export const IELTS_SKILLS = ["Writing","Speaking","Reading","Listening"] as const;`; viết lại `classCreateSchema` với `type`, `skills: z.array(z.enum(IELTS_SKILLS)).default([])`, `schedule: z.object({ days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine((d) => new Set(d).size === d.length), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })` (bỏ field `skill` cũ) + `.superRefine`: `type==='ielts' && skills.length===0` → fail "IELTS cần ≥1 kỹ năng"; `type==='communication' && skills.length>0` → fail "Lớp Giao tiếp không chọn kỹ năng".
2. `KernelClassRow`: thêm `type: ClassType` (không phải `string` — tránh ép cast ở `mapClasses`, giá trị DB đã được zod + DEFAULT migration kiểm soát), đổi `skill: string` → `skills: string[]`; comment rõ `schedule` là raw string (JSON mới hoặc free-text legacy), web chịu trách nhiệm format.
3. `packages/db/src/schema/class.ts`: thêm `type: text("type").notNull().default("ielts")`, rename property `skill` → `skills` (`text("skills").notNull().default("[]")`).
4. Migration 0007 theo khối SQL ở Architecture: chạy `pnpm --filter db db:generate` để tạo entry journal, rồi viết lại tay file SQL thành chuỗi ALTER + UPDATE đúng thứ tự (drizzle có thể sinh rebuild `__new_class` — thay bằng ALTER tường minh); kiểm tra `meta/_journal.json`.
5. `apps/server/src/routes/kernel.ts` POST handler: `values` thêm `type: input.type`, `skills: JSON.stringify(input.skills)`, `schedule: JSON.stringify({ ...input.schedule, days: [...new Set(input.schedule.days)].sort() })` (dedupe + sort trước lưu); bỏ `skill`.
6. `snapshot.ts`: thêm helper `parseSkills`; class mapping thêm `type: row.type`, `skills: parseSkills(row.skills)`; `schedule: row.schedule` giữ nguyên.
7. Server tests: cập nhật `createClass` helper dùng payload mới (type ielts + skills array + schedule object); thêm test: (a) tạo lớp communication → DB có `skills='[]'`; (b) schedule thiếu `days` hoặc sai format → 400; (c) `days` ngoài 0–6 / trùng / >7 phần tử → 400; (d) `start:"99:99"` → 400; (e) snapshot trả `skills` là mảng; (f) `type:'ielts'` + `skills:[]` → 400; (g) `type:'communication'` + `skills:['Writing']` → 400.

## Todo

- [x] contracts.ts: schema (superRefine + regex chặt + days unique/max) + KernelClassRow (`type: ClassType`) + ClassType/IELTS_SKILLS export
- [x] db schema + migration 0007 viết tay theo thứ tự UPDATE đúng (rename + back-compat + sanity check)
- [x] POST /api/classes handler (dedupe days)
- [x] snapshot.ts parseSkills + mapping
- [x] Server tests cập nhật + 7 case mới

## Success Criteria

- [x] Migration 0007 apply đúng: class cũ `skill='Writing'` → `type='ielts'`, `skills='["Writing"]'`; `skill='Giao tiếp'` → `type='communication'`, `skills='[]'`; **`skill=''` → `type='ielts'`, `skills='[]'` (không phải `'["[]"]'`)**; sanity check SQL = 0 rows sót
- [x] POST hợp lệ trả 201; POST thiếu/sai schedule → 400; POST `skills` chứa giá trị lạ → 400; POST ielts không kỹ năng / communication có kỹ năng → 400; `days` trùng/>7 → 400; time sai format → 400
- [x] `GET /api/kernel` trả class có `type` + `skills: string[]`
- [x] `pnpm --filter server test` pass

## Rollout / Deploy (bắt buộc đọc trước khi áp dụng)

Migration chạy thủ công (`db:migrate:deploy`), KHÔNG chạy khi server boot. `RENAME COLUMN` làm server cũ đang chạy throw "no such column" trên mọi query đọc class → sequence bắt buộc: **stop server → migrate → deploy server mới + web mới cùng lúc** (monorepo, 1 release). Wire change là breaking có chủ đích: bundle web cũ còn cache sẽ nhận 400 "invalid body" trên tạo lớp trong cửa sổ stale — chấp nhận được ở giai đoạn pre-pilot (production-readiness plan chưa GO); rollback app code là một chiều (forward-only).

## Risk Assessment

- **Drizzle sinh table-rebuild thay vì RENAME** khi đổi cùng lúc name + default (tiền lệ style `__new_class` ở 0006). Tín hiệu: file 0007 chứa `__new_class`/`DROP TABLE`. Phản ứng: đã định sẵn — viết lại tay file 0007 thành chuỗi ALTER tường minh (cho phép edit trước khi apply); luôn đọc file 0007 + chạy sanity check SQL trước khi coi migration xong.
- **Thứ tự UPDATE sai corrupt rows `skill=''`** thành `'["[]"]'` (bắt bởi red-team). Phòng: thứ tự wrap-trước/blanket-sau + guard `<> ''` đã ghi trong SQL; success criteria có case `skill=''`; sanity check sau apply.
- **Heuristic back-compat `WHERE skill='Giao tiếp'`** chỉ khớp chuỗi option cũ chính xác; dữ liệu dev viết tay khác ("giao tiếp", "Communication") sẽ bị xếp thành ielts với `skills='["..."]'`. Chấp nhận được (chỉ dữ liệu dev); ghi nhận để biết khi UAT.
- **Zod strip thầm lặng**: gửi field mới khi schema chưa update sẽ bị bỏ qua không lỗi. Phòng: schema là bước 1, bộ test 400 ở bước 7 chứng minh validation chạy thật.
