---
phase: 1
title: "Contract + schema + migration"
status: completed
priority: P2
effort: "0.4d"
dependencies: []
---

# Phase 1: Contract + schema + migration

## Goal
Có bảng `lead` trong D1 và contract zod dùng chung cho endpoint công khai, API giáo viên và web.

## Files to Create / Modify
- Create: `packages/api/src/lead-contracts.ts`
- Create: `packages/api/src/lead-contracts.test.ts`
- Create: `packages/db/src/schema/lead.ts`
- Modify: `packages/db/src/schema/index.ts` (export `./lead`)
- Create: `packages/db/src/migrations/0057_*.sql` + snapshot `meta/` (sinh bằng `pnpm --filter @teacher-os/db db:generate`)

## Tasks & Steps
1. `lead-contracts.ts` (mẫu `holiday-contracts.ts`, `library-contracts.ts`):
   - `LEAD_COURSES`, `LEAD_STUDY_MODES` (`group-online`, `private-online`, `offline-vgp` — D12), `LEAD_STUDY_DAYS`, `LEAD_TIME_SLOTS`, `LEAD_STATUSES` (`new`, `contacted`, `enrolled`, `dropped`) dạng `as const` + map nhãn tiếng Việt (`LEAD_COURSE_LABELS`, …) theo D2 của plan; nhóm khóa `LEAD_COURSE_GROUPS` (IELTS / Giao tiếp định hướng IELTS / Khác) để web và test drift dùng.
   - `normalizeVietnamPhone(raw): string | null` theo D3 (+ test: `0909 123 456`, `+84 909123456`, `84909123456`, `12345` → null).
   - `leadSubmitSchema` `.strict()`: `name` (trim, 2–80), `phone` (transform qua `normalizeVietnamPhone`, refine non-null), `email` (optional, rỗng → undefined, `z.string().email().max(120)`), `birthDate` (optional `YYYY-MM-DD`, năm 1940..năm hiện tại), `course`/`studyMode`/`studyDays`/`timeSlot` (optional enum), `note` (≤ 500), `placement` (≤ 300), `website` (honeypot, optional string), `elapsedMs` (int ≥ 0).
   - `leadQuerySchema` (`q` ≤ 100, `status` enum optional, `page` ≥ 1), `leadPatchSchema` (`status` enum, `teacherNote` ≤ 1000 optional) — `.strict()`.
   - Kiểu response: `LeadRow`, `LeadListResponse { rows, total, page, pageSize: 20, counts: Record<LeadStatus | "all", number> }`.
   - `LEAD_ERROR_CODES`: `LEAD_INTAKE_DISABLED`, `LEAD_RATE_LIMITED`, `LEAD_DAILY_CAP`, `LEAD_ORIGIN_FORBIDDEN`, `LEAD_INVALID`, `LEAD_NOT_FOUND`.
2. `schema/lead.ts` (mẫu `notification-record.ts`): `id` text PK, `orgId` FK `organization` cascade, `name`, `phone`, `email` (default ""), `birthDate` (default ""), `course`/`studyMode`/`studyDays`/`timeSlot` (text default ""), `note`, `placement`, `teacherNote` (default ""), `source` (default `"profile"`), `status` `$type<LeadStatus>()` default `"new"`, `ipHash` (default ""), `submitCount` int default 1, `createdAt`/`updatedAt` `timestamp_ms` default `unixepoch('subsecond')*1000`, `statusChangedAt` nullable.
   - Index: `lead_org_status_created` (orgId, status, createdAt), `lead_org_phone_updated` (orgId, phone, updatedAt), `lead_ip_updated` (ipHash, updatedAt).
3. **Backup trước khi migrate** (rule repo): backup `apps/e2e/local.db` không cần (bị xoá mỗi boot); với D1 staging/prod ghi bước `wrangler d1 export` trong phase 6.
4. `pnpm --filter @teacher-os/db db:generate`; đọc lại SQL sinh ra (chỉ `CREATE TABLE lead` + 3 index, không đụng bảng khác).

## Verification
- `pnpm --filter @teacher-os/api test -- lead-contracts`
- `pnpm check-types`
- Migration áp được trên libsql: test server có sẵn chạy `migrate()` toàn bộ thư mục (`pnpm --filter server test -- readiness`).
