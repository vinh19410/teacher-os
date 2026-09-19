---
phase: 1
title: "Kernel: schema, contract & POST giao bài"
status: complete
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Kernel — schema, contract & POST giao bài

## Goal

Lưu trữ + API cho lượt giao đề ngân hàng cho lớp: 2 bảng mới (`class_assignment`, `class_assignment_target`), contract zod, collection snapshot `classAssignments` (targets nhúng), `POST /api/classes/:id/assignments` với validation org/enrollment/prompt-ready, cùng **web glue** (bắt buộc cùng phase vì guard compile-time `SNAPSHOT_COLLECTION_KEYS` — precedent #202 phase 1).

## Context Links

- Báo cáo scout: [../reports/scout-report.md](../reports/scout-report.md) (mục 1.1–1.4: chuỗi command #202 end-to-end)
- Phân tích design: [../research/design-analysis-report.md](../research/design-analysis-report.md) (mục 5: mô hình assignment ngầm định từ v2)
- Precedent trực tiếp: `packages/db/src/schema/assignment-prompt.ts`, `apps/server/src/routes/snapshot.ts:162-166,283-295`, `apps/server/src/routes/assignments/index.ts:60-72`, `apps/web/src/lib/repos/kernel.ts:162-168,363-387`

## Key Insights

- Bảng `assignment` hiện có là grading-only per-student (`studentId` notNull) — **không đụng**, dựng bảng riêng (Key Decision 1 của plan).
- Due phải là ISO `yyyy-mm-dd` để so ngày (quá hạn/trễ hạn/min hôm nay) — precedent `invoice.due` (`packages/api/src/contracts.ts:551-559`), khác `assignment.due` display dd/mm.
- **Validation due 2 lớp** (red-team F6): contract chỉ giữ regex; route bắt buộc `parseStartDateStrict(due)` (`packages/api/src/skeleton.ts:61-70` — roundtrip lịch UTC, chặn `2030-02-30`) → null là 400; **min-today là logic mới không có precedent** — so với ngày **VN (UTC+7)** qua helper dùng chung (nâng pattern `vietnamTodayISO` từ `apps/e2e/specs/helpers.ts:41-51` vào lib chia sẻ server+web), không dùng "server local" (Workers chạy UTC, không có local).
- `submitted/missing` không có cột status: `submittedAt` null = chưa nộp; "trễ hạn/quá hạn" là derived client-side. Không có write-path đổi `submittedAt` trong plan này (Non-Goal).
- Server phải tự đọc prompt (snapshot `title`, kiểm tra org + `status = "ready"`) và kiểm tra `studentIds ⊆ enrollment(classId)` — không tin client.
- Snapshot: 2 select + nhóm targets vào row trong projection — web chỉ thấy 1 collection. **Thứ tự select: header trước, targets sau** (red-team F10): race xen giữa 2 read chỉ có thể tạo targets mồ côi (projection drop), không bao giờ tạo row header với `targets: []`.
- **Atomic write** (red-team F2): header + toàn bộ targets gom trong **một** `db.batch` duy nhất — precedent mọi mutation đa statement của repo (`/students` kernel.ts:589, `/classes/:id/enroll` kernel.ts:665, `/classes` kernel.ts:740); mọi validate chạy trước khi build statements.
- **createdAt trên wire là ISO string** (red-team F1/F16): convention snapshot hiện có map `createdAt` → `toISOString()` (`snapshot.ts:232,245`); cả `KernelClassAssignmentRow` lẫn `KernelAssignmentPromptRow` (mới thêm) đều theo ISO string, một hệ ngày duy nhất.

## Requirements

- Bảng `class_assignment`: `id` text PK, `orgId` FK→organization (cascade), `classId` FK→class (cascade), `promptId` FK→assignment_prompt (cascade), `title` text (snapshot tên đề lúc giao, trim 1-200), `due` text ISO `yyyy-mm-dd`, `note` text default "", `createdAt` integer timestamp_ms default unixepoch ms. Index: `class_assignment_org_idx` (orgId), `class_assignment_class_idx` (classId). Docblock nêu rõ: một row = một lượt giao; title là snapshot (đề đổi tên sau đó không ảnh hưởng bài đã giao).
- Bảng `class_assignment_target`: `id` text PK, `orgId` FK (cascade), `assignmentId` FK→class_assignment (cascade), `studentId` FK→student (cascade), `submittedAt` text nullable (ISO `yyyy-MM-ddTHH:mm`, null = chưa nộp). Unique `(assignmentId, studentId)` tên `class_assignment_target_assignment_student_uq`. Index: `class_assignment_target_org_idx` (orgId), `class_assignment_target_assignment_idx` (assignmentId).
- Contract `classAssignmentCreateSchema` (`.strict()`) trong `packages/api/src/contracts.ts`: `{ promptId: string trim 1-100, due: string regex ISO yyyy-mm-dd, note: string trim ≤2000 default "", studentIds: array(string trim) min 1 max 100, phần tử unique }` (min-today KHÔNG nằm ở contract — route tự kiểm, red-team F6; max 100 nâng từ 50 theo red-team F11).
- `KernelClassAssignmentRow` trong contracts: `{ id, classId, promptId, title, due, note, createdAt: string (ISO), targets: Array<{ studentId, submittedAt: string | null }> }`; thêm `classAssignments: KernelClassAssignmentRow[]` vào `KernelSnapshot` (sau `assignmentPrompts`, ~dòng 616).
- **Mở rộng `KernelAssignmentPromptRow` thêm `createdAt: string` (ISO)** (red-team F1 — Critical): contract + snapshot projection (`snapshot.ts:283-295` hiện bỏ trường) + mapper `assignment-prompts.ts` + UI type `AssignmentPrompt` (`mock-data.ts:49-59`); trang bank (phase 2) cần sort desc + meta `Thêm {dd/mm/yyyy}`.
- `POST /api/classes/:id/assignments` **trực tiếp trong `apps/server/src/routes/kernel.ts`** (đặt cạnh `/classes/:id/enroll` dòng 595; kernel.ts đã có sẵn helper `readBody` ở dòng 144-161 — dùng lại): 401 nếu thiếu kernelCtx → 404 nếu class không thuộc org → zod 400 → 404 prompt không thuộc org → 400 prompt `status != "ready"` → 400 `due` fail `parseStartDateStrict` hoặc `<` hôm nay (ngày VN) → 400 `studentIds` có học viên không trong enrollment của lớp hoặc trùng lặp → **400 nếu lớp đã có ≥ 200 class_assignment** (cap chống phình snapshot, red-team F11) → một `db.batch` duy nhất insert header (crypto.randomUUID) + targets (mỗi student 1 row, `submittedAt` null) → 201 `CreatedResponse` `{ id }`.
- Snapshot loader (`apps/server/src/routes/snapshot.ts`): select `class_assignment` **trước** rồi `class_assignment_target` (order trong Promise.all không đảm bảo — chạy tuần tự 2 await hoặc giữ Promise.all nhưng document invariant), orderBy `desc(class_assignment.createdAt)`, `desc(id)` — mới nhất trước như mock unshift; projection nhóm targets theo `assignmentId`, **drop targets mồ côi** không khớp header nào.
- Web glue cùng phase: `SNAPSHOT_COLLECTION_KEYS` + `"classAssignments"` (`apps/web/src/lib/repos/kernel.ts:363-376`), `mapKernelSnapshot` thêm `classAssignments` (dòng ~236), mapper mới `apps/web/src/lib/repos/class-assignments.ts` (field-for-field, `submittedAt: row.submittedAt ?? null`), UI type `ClassAssignment` + `KernelHydratedData.classAssignments` trong `apps/web/src/lib/mock-data.ts`, `emptyKernelData.classAssignments: []` (`apps/web/src/lib/kernel-state.ts:8`), action type `"assign-class-prompt"` trong `apps/web/src/lib/data-actions.ts` (payload `{ classId, promptId, due, note, studentIds }`), case `kernelCommand` → `POST /api/classes/${classId}/assignments` (theo precedent `grade-assignment` dòng 146-150), case inert trong `apps/web/src/lib/data-store-reducer.ts`.

## Related Code Files

- Create: `packages/db/src/schema/class-assignment.ts` (2 bảng), `packages/db/src/migrations/0018_*.sql` (generate), `apps/web/src/lib/repos/class-assignments.ts`, helper ngày VN dùng chung (vd `packages/api/src/vietnam-date.ts` hoặc lib tương đương — nâng từ `apps/e2e/specs/helpers.ts:41-51`)
- Modify: `packages/db/src/schema/index.ts` (export), `packages/api/src/contracts.ts` (schema mới + `KernelClassAssignmentRow` + `classAssignments` + **`KernelAssignmentPromptRow.createdAt`**), `apps/server/src/routes/kernel.ts` (POST route), `apps/server/src/routes/snapshot.ts` (collection mới + **projection prompts thêm createdAt**), `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/repos/assignment-prompts.ts` (**thêm createdAt**), `apps/web/src/lib/mock-data.ts` (**AssignmentPrompt.createdAt** + ClassAssignment), `apps/web/src/lib/kernel-state.ts`, `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/data-store-reducer.ts`
- Delete: không

## Implementation Steps

1. Tạo `packages/db/src/schema/class-assignment.ts` với 2 bảng + index + unique + docblock; export qua `schema/index.ts`; chạy `pnpm --filter db db:generate` sinh migration 0018; **kiểm tra SQL trong cùng commit** có đủ 2 index + unique constraint — nếu thiếu thì sửa 0018 TRƯỚC khi bất kỳ env nào apply; đã apply rồi thì phải tạo 0019, không sửa bản cũ (red-team F13).
2. Thêm `classAssignmentCreateSchema`, `KernelClassAssignmentRow` (createdAt ISO), `KernelSnapshot.classAssignments`, và `KernelAssignmentPromptRow.createdAt: string` vào `packages/api/src/contracts.ts`; viết helper ngày VN (`vietnamTodayISO`) ở lib dùng chung.
3. Thêm POST route trong `kernel.ts` cạnh enroll (dùng sẵn `readBody` kernel.ts:144-161): đọc class (org-scope) → zod → đọc prompt + validate ready → `parseStartDateStrict(due)` + `due >= vietnamTodayISO()` → query enrollment `where classId = :id and studentId in (list)`, so khớp tập hợp với `studentIds` (trùng lặp → 400) → đếm `class_assignment` của lớp (≥ 200 → 400) → build statements + **một `db.batch` duy nhất** (header + N targets) → 201.
4. Mở rộng snapshot loader: select `class_assignment` trước, `class_assignment_target` sau (tránh window header-chưa-có-targets, red-team F10); orderBy desc createdAt, desc id; projection nhóm targets theo assignmentId, drop mồ côi; **projection `assignmentPrompts` thêm `createdAt: row.createdAt.toISOString()`**.
5. Web glue đủ list ở Requirements (mapper, keys, types, action, command, reducer — gồm mapper prompts + createdAt). `pnpm check-types` phải xanh ở cả server + web sau bước này (guard `MissingSnapshotKey` ép đủ).
6. Viết server tests trong `apps/server/src/kernel.test.ts`, describe `"class assignment give flow"` theo pattern #202 (`kernel.test.ts:4046-4153`): happy 201 + snapshot (targets null); ma trận 400 gồm due `2030-02-30` (roundtrip), due quá khứ, studentIds rỗng/trùng/không enrolled/trên 100, prompt draft, field lạ, cap 200; 401/404; org scoping A/B; test biên min-today quanh 00:00–07:00 UTC (ngày VN != ngày UTC).

## Todo

- [ ] Schema 2 bảng + migration 0018 (kiểm unique/index trong SQL) + export barrel
- [ ] Contracts: create schema + row (createdAt ISO) + snapshot collection + `KernelAssignmentPromptRow.createdAt` + helper ngày VN
- [ ] POST /api/classes/:id/assignments: validate đủ + một `db.batch` + cap 200/lớp
- [ ] Snapshot: thứ tự select an toàn + projection nhúng targets + prompts có createdAt
- [ ] Web glue (mapper, keys, types gồm AssignmentPrompt.createdAt, action, command bus, reducer)
- [ ] Server tests: happy + ma trận 400 (gồm `2030-02-30`, quá khứ, cap) + 401/404 + org scoping + biên ngày VN

## Success Criteria

- POST hợp lệ trả 201 `{ id }`; snapshot org A chứa row mới với `targets[].submittedAt = null`; org B không thấy.
- Ma trận lỗi đúng: 401 không đăng nhập; 404 class/prompt lạ org; 400 do due sai format/lịch không tồn tại/quá khứ, `studentIds` rỗng/trùng/không enrolled/> 100, prompt draft, field lạ (`.strict()`), vượt cap 200.
- Snapshot prompt row có `createdAt` ISO; mapper web giữ trường (unit test phase 4).
- `pnpm check-types` xanh toàn repo sau phase (bằng chứng web glue đủ).

## Verification

```bash
pnpm --filter db db:generate
cd apps/server && npx vitest run kernel.test.ts -t "class assignment"
pnpm check-types
```

## Risk Assessment

- **R1: Drizzle migration D1 không sinh unique constraint** — kiểm tra file 0018 tay trong cùng commit; môi trường nào đã apply thì tạo 0019, tuyệt đối không edit migration đã apply (red-team F13).
- **R2: Route mới trong kernel.ts dài thêm** — giữ handler gọn, tách helper đọc enrollment nếu quá 60 dòng; không tạo file route riêng vì sẽ trùng mount `/classes` với các route trực tiếp hiện có.
- **R3: Timezone ngày "hôm nay"** — chuẩn hoá bằng ngày VN (UTC+7) qua helper dùng chung cho cả server (min-today) lẫn client (phase 3 dùng cho `min` + validation), theo precedent comment TZ của `apps/e2e/specs/helpers.ts:31-33`; có test biên 00:00–07:00 UTC.
- **R4: Deploy order** (red-team F13) — thêm collection làm web guard runtime chặn snapshot thiếu key: **deploy server (kèm migration 0018) trước web**; rollback phải rollback cả hai cùng nhau (schema additive nên server cũ + web cũ vẫn chạy).

## Security Considerations

- Route nằm trong kernel router → kế thừa Origin + JSON CSRF guard (`apps/server/src/routes/kernel.ts:127-138`).
- Mọi truy vấn đều kèm `orgId` từ kernelCtx; prompt + class + enrollment đều xác nhận thuộc org trước insert (không tin client).
- Zod `.strict()` chặn field lạ; độ dài trường bounded (note ≤2000, studentIds ≤100/lượt, ≤200 lượt/lớp — chống phình snapshot full-org không pagination).

## Next Steps

- Phase 2 (trang bank) dùng ngay `classAssignments` để tính "Đã dùng N lớp".
