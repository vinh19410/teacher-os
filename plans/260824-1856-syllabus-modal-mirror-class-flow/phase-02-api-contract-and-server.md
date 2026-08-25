---
phase: 2
title: "API contract and server"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: API contract and server

## Overview

Cập nhật Zod contract `syllabusCreateSchema`, kernel-row `KernelSyllabusRow`, POST handler `/api/syllabi`, và snapshot adapter để consume + emit `type` + `skills[]`.

## Requirements

- Functional: `POST /api/syllabi` chấp nhận `{name, type, level, skills[], description, totalLessons}` và persist đúng vào DB
- Functional: `superRefine` mirror logic của `classCreateSchema`: `ielts` bắt buộc ≥1 skill, `communication` cấm mọi skill
- Functional: `KernelSyllabusRow` chứa `type: ClassType` và `skills: string[]`; snapshot handler đọc từ DB (JSON.parse `skills`) và emit đúng shape
- Non-functional: TypeScript public-contract compat break — tất cả callsite phải đổi cùng lúc

## Architecture

- **Contract** (`packages/api/src/contracts.ts`): tái sử dụng `CLASS_TYPES`, `IELTS_SKILLS`. Định nghĩa lại `syllabusCreateSchema` giống pattern `classCreateSchema` (chỉ giữ các field liên quan syllabus).
- **Server route** (`apps/server/src/routes/kernel.ts` L547-565): thêm `type`, `skills: JSON.stringify(input.skills)` vào INSERT.
- **Snapshot** (`apps/server/src/routes/snapshot.ts` L226-234): **bắt buộc** `skills: parseSkills(row.skills)` và `type: knownClassTypes.has(row.type) ? row.type : "ielts"` — copy đúng pattern class ở L196-197. Cấm `JSON.parse` trần. Cấm bịa `safeParseJsonArray`.

## Related Code Files

- Modify: `packages/api/src/contracts.ts` (syllabusCreateSchema, KernelSyllabusRow)
- Modify: `apps/server/src/routes/kernel.ts` (POST /syllabi handler)
- Modify: `apps/server/src/routes/snapshot.ts` (syllabi map block)
- Modify: `apps/server/src/kernel.test.ts` (tests dùng snapshotA.syllabi, đảm bảo còn xanh)

## Implementation Steps

1. **Contract update** (`packages/api/src/contracts.ts`):
   ```ts
   export const syllabusCreateSchema = z
     .object({
       name: z.string().min(1),
       type: z.enum(CLASS_TYPES).default("ielts"),
       level: z.string().default(""),
       skills: z
         .array(z.enum(IELTS_SKILLS))
         .max(IELTS_SKILLS.length)
         .refine((skills) => new Set(skills).size === skills.length)
         .default([]),
       description: z.string().default(""),
       totalLessons: z.number().int().min(0).default(0),
     })
     .superRefine((input, ctx) => {
       if (input.type === "ielts" && input.skills.length === 0) {
         ctx.addIssue({ code: "custom", path: ["skills"], message: "Syllabus IELTS cần ít nhất một kỹ năng" });
       }
       if (input.type === "communication" && input.skills.length > 0) {
         ctx.addIssue({ code: "custom", path: ["skills"], message: "Syllabus Giao tiếp không chọn kỹ năng" });
       }
     });
   ```
2. Đổi `KernelSyllabusRow`:
   - Xóa `skill: string`
   - Thêm `type: ClassType`
   - Thêm `skills: string[]`
3. **Server POST handler** (`apps/server/src/routes/kernel.ts` L547-565): thêm `type: input.type`, `skills: JSON.stringify(input.skills)` vào `db.insert(syllabus).values(...)`.
4. **Snapshot adapter** (`apps/server/src/routes/snapshot.ts` L226-234):
   ```ts
   type: knownClassTypes.has(row.type) ? (row.type as ClassType) : "ielts",
   skills: parseSkills(row.skills),
   ```
   `parseSkills` đã có tại `snapshot.ts:55-64` (try/catch, filter string, `""` → `[]`). Không tạo helper thứ hai.
5. **Server test** — sửa helper `createSyllabus` tại `apps/server/src/kernel.test.ts:240-258` (body hiện `skill: "Writing"`). Đổi thành `{ type: "ielts", skills: ["Writing"] }`. L821+ chỉ assert cây module/lesson — không phải fixture POST. Thêm 2 case cạnh helper class: ielts+`skills=[]` → 400; communication+`skills` non-empty → 400.
6. Chạy `pnpm --filter @teacher-os/api check-types` và `pnpm --filter @teacher-os/server check-types` + test.

<!-- Updated: Validation Session 1 - parseSkills + createSyllabus helper -->
## Success Criteria

- [x] `syllabusCreateSchema` reject `{type:"ielts", skills:[]}` với message `"Syllabus IELTS cần ít nhất một kỹ năng"`
- [x] `syllabusCreateSchema` reject `{type:"communication", skills:["Writing"]}` với message `"Syllabus Giao tiếp không chọn kỹ năng"`
- [x] `POST /api/syllabi` với payload hợp lệ trả 201 + id; row DB có `type` và `skills` (JSON stringified)
- [x] `GET /api/kernel` trả `syllabi[].type` và `syllabi[].skills: string[]`. **Không** thêm route `/api/kernel/snapshot`.
- [x] `apps/server` tests xanh; contract type export không còn `skill: string`

## Risk Assessment

- **Risk:** Snapshot handler đọc `row.skills` là chuỗi rỗng `""` (không phải `"[]"`) trên row chưa migrate.
  - **Signal:** `JSON.parse("")` throw.
  - **Response:** Dùng `try/catch` hoặc kiểm `if (raw.trim() === "") return []`. Phase 1 migration đã set default `"[]"` nên chỉ là defensive.
- **Risk:** `IELTS_SKILLS` không cover skill lịch sử (VD "Grammar") có trong row cũ.
  - **Signal:** Zod parse fail khi hydrate snapshot? Không — kernel snapshot không dùng `syllabusCreateSchema` để validate output. Ok.
