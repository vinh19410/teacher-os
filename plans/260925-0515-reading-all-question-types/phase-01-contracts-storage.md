---
phase: 1
title: "Contracts & Storage: 8 type id mới, kind mapping, cột image_url"
status: done
priority: P1
effort: 3.5h
dependencies: []
---

# Phase 1: Contracts & Storage

## Context Links

- [plan.md](./plan.md) · [reports/scout-codebase.md](./reports/scout-codebase.md) · [reports/research-ielts-formats.md](./reports/research-ielts-formats.md)
- Code: `packages/api/src/contracts.ts:271-329` (catalog/kinds), `:335-462` (create schema), `:773-802` (snapshot interfaces); `packages/db/src/schema/assignment-prompt.ts`; `apps/server/src/routes/assignments/index.ts:60-93`; `apps/server/src/routes/snapshot.ts:74-108`; migration precedent `packages/db/src/migrations/0019_*.sql` (ADD COLUMN `audio_name`)

## Goal

Server chấp nhận và lưu trữ được 8 dạng Reading mới: catalog id hợp lệ qua `ASSIGNMENT_PART_TYPES`, đáp án letter được validate, ảnh diagram có cột riêng và đi trọn vòng create → DB → snapshot.

## Requirements

- [x] Reading catalog đạt 14 type id: p1 `["tfng","sent","note","shortans","diagram"]`, p2 `["headings","info","summary","sentend","tablecomp"]`, p3 `["ynng","mcq","features","flowchart"]`
- [x] `features`, `sentend` validate đáp án thuộc `ASSIGNMENT_ANSWER_CHOICES.letter` (A–H); 6 dạng text không cần entry trong `answerKindByType` (fallback — precedent `sent` tại `contracts.ts:450-461`)
- [x] **Export `answerKindByType`** (red-team #3: hiện là module-private tại `contracts.ts:318`, không test nào so sánh được với web `KIND`) — export const hoặc wrapper `answerKindForType(typeId)`
- [x] `imageUrl` mới: optional, default `""`, ≤500 ký tự, **chỉ nhận `https://`** khi khác rỗng (red-team #6: match precedent `SAFE_AVATAR_SRC_PATTERN` https-only tại `packages/auth/src/avatar-policy.ts:20-21`); pattern scheme export dùng chung (red-team #8: một nguồn, web import lại — không rải regex 3 chỗ); `KernelAssignmentPromptRow.imageUrl: string`
- [x] Reading + type `diagram` + status `ready` bắt buộc `imageUrl` (mirror listening `audioName` tại `contracts.ts:413-418`)
- [x] Cột `image_url` TEXT NOT NULL DEFAULT '' trên bảng `assignment_prompt` + migration SQL sinh qua `pnpm db:generate`
- [x] Route POST `/prompts` ghi `imageUrl`; snapshot trả `imageUrl` với fallback `""` cho row legacy

## Implementation Steps

1. `packages/api/src/contracts.ts` — sửa `ASSIGNMENT_PART_TYPES.reading.types` theo bảng phân bổ 5/5/4 ở plan.md.
2. Cùng file — thêm `features: "letter"`, `sentend: "letter"` vào `answerKindByType` và **thêm `export`** cho map này (hoặc wrapper) để Phase 2 viết test sync với web `KIND`.
3. Cùng file — thêm vào `assignmentPromptCreateSchema` trường `imageUrl: z.string().trim().max(500).default("")` + trong `.superRefine`: nếu khác rỗng phải khớp pattern `https://` (định nghĩa 1 const/hàm export, ví dụ `ASSIGNMENT_IMAGE_SRC_PATTERN`); thêm nhánh reading + `diagram` + `ready` → issue "image required when ready" (đặt cạnh block listening `audioName`).
4. Cùng file — thêm `imageUrl: string` vào interface `KernelAssignmentPromptRow` (sau `audioName`, theo vị trí `audio_name` trong row).
5. `packages/db/src/schema/assignment-prompt.ts` — thêm `imageUrl: text("image_url").notNull().default("")` ngay sau `audioName`. Sinh migration bằng `pnpm db:generate` (drizzle-kit generate — chỉ sinh SQL, KHÔNG chạy `db:migrate:deploy` tay: `drizzle.config.ts` là driver `d1-http` trỏ DB remote Cloudflare; việc apply staging/production do **alchemy lúc deploy** đảm nhiệm theo `docs/production-release-runbook.md` — red-team #4). Cơ chế xác thực cột local: migrator chạy tự động trong vitest server tests và e2e boot (`apps/e2e/src/boot.ts`).
6. `apps/server/src/routes/assignments/index.ts` — thêm `imageUrl: body.data.imageUrl` vào `.values({...})` của POST `/prompts` (giữa `audioName` và `questions`).
7. `apps/server/src/routes/snapshot.ts` — trong mapping `assignmentPromptRows` của `loadSnapshot`, thêm `imageUrl` với fallback `""` nếu value không phải string (defensive theo style `parseQuestions`).
8. Type-check toàn monorepo để bắt caller còn thiếu field; kiểm tra payload type của command `create-assignment-prompt` (`apps/web/src/lib/repos/kernel.ts:157`, `data-actions.ts`) — nếu type khai tay thì bổ sung `imageUrl` (chưa rõ derive hay tay: xác minh khi làm).

## Todo

- [x] Catalog 14 type id + 2 entry `answerKindByType` + export map trong contracts.ts
- [x] `imageUrl` trong create schema + superRefine (https-only, ready-diagram bắt buộc) + const pattern export + interface snapshot
- [x] Cột `image_url` + migration SQL qua `pnpm db:generate`
- [x] Route insert + snapshot mapping + payload type check
- [x] Test server: 201 roundtrip có imageUrl; 400 diagram-ready thiếu ảnh; 400 đáp án `"I"` cho **cả `sentend` lẫn `features`**

## Verification

- `pnpm check-types` sạch.
- **Gate phase này:** server tests xanh (kernel/snapshot + test mới). Web presets tests sẽ đỏ về số lượng cho tới Phase 2 — **chấp nhận có chủ đích vì cả 3 phase nhập 1 PR duy nhất, không merge Phase 1 riêng lẻ** (CI chạy `pnpm test` trên PR, red-team #9).
- Migration: SQL mới nằm trong `packages/db/src/migrations/` và được migrator áp trong server tests/e2e boot — confirm test xanh là đủ; không chạy migrate tay vào DB remote.

## Risk & Mitigation

- **Migration chạm bảng có dữ liệu thật** — chỉ ADD COLUMN default `''`, không rewrite row (precedent `0019` audio_name); apply production qua alchemy deploy kèm rehearsal gate của runbook.
- **Rollback coupling** (red-team #15): schema `.strict()` + web post payload verbatim → rollback server mà giữ tab web mới (SPA đã load) khiến mọi request tạo đề 400 do unknown key `imageUrl`. Rollback code phải đồng bộ server + web; bounded theo session tab.
- **Quên đồng bộ kind map web** — Phase 2 thêm test sync (dùng map vừa export); trước đó test sync ids cũ không bảo vệ kind (red-team #3).

## Security

- `imageUrl` do giáo viên nhập — chỉ `https://` (chặn `javascript:`/`data:`/mixed-content); pattern là single source export từ contracts, web tái sử dụng.
- Preview là đường client-side (sessionStorage draft) **không qua contract** (red-team #7) — renderer preview (Phase 3) phải tự verify scheme; đó là lớp bảo vệ chính của preview.
