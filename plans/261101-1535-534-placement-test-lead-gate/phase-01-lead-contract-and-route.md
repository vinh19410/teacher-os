---
phase: 1
title: "Contract & route: source, email bắt buộc cho nguồn test"
status: completed
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Contract & route

## Goal

`POST /public/leads` nhận `source: "placement-test"`, bắt buộc `email` khi nguồn này, và lưu nguồn vào `lead.source`; mọi request cũ (không `source`) hành xử y như trước.

## Files to Create / Modify

- Modify: `packages/api/src/lead-contracts.ts`
- Modify: `packages/api/src/lead-contracts.test.ts`
- Modify: `apps/server/src/routes/public-leads.ts`
- Modify: `apps/server/src/routes/public-leads.test.ts`

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - preserve non-empty optional fields on dedupe UPDATE and add advice handover structure -->

### Task 1.1 — Viết test đỏ cho `leadSubmitSchema` (`source` & email bắt buộc khi `placement-test`) và route `POST /public/leads`
- **Goal:** Có bộ test thất bại (red phase) kiểm chứng `LEAD_SOURCES`, `source: "placement-test"` bắt buộc `email`, lưu `lead.source`, và giữ nguyên cột tuỳ chọn khác rỗng khi dedupe `UPDATE`.
- **Target files and symbols:**
  - `packages/api/src/lead-contracts.test.ts` (describe `leadSubmitSchema`)
  - `apps/server/src/routes/public-leads.test.ts` (describe `POST /public/leads`)
- **Steps:**
  1. Trong `packages/api/src/lead-contracts.test.ts`, thêm test cho `source: "placement-test"` có email hợp lệ ⇒ parse OK; thiếu email hoặc email `""` ⇒ lỗi ở path `email`; `source` lạ ⇒ lỗi; không `source` + không email ⇒ vẫn parse OK.
  2. Trong `apps/server/src/routes/public-leads.test.ts`, thêm test: gửi `source: "placement-test"` có email ⇒ `201`, `row.source === "placement-test"`; thiếu email ⇒ `400 LEAD_INVALID` với `fields` chứa `"email"`, không ghi DB; gửi lần hai cùng SĐT kèm `placement` (bỏ trống `studyDays`/`timeSlot`/`course`/`note` đã có) ⇒ vẫn 1 dòng, `placement` cập nhật, các trường tuỳ chọn cũ không bị xoá về `""`, `submitCount = 2`, không gửi email thứ hai; lead tạo từ `profile` gửi lại với `placement-test` ⇒ `source` vẫn `"profile"`.
- **Success criteria:** Các test mới chạy và báo lỗi đúng chỗ vì `lead-contracts.ts` và `public-leads.ts` chưa cập nhật.
- **Verify:** `pnpm --filter @teacher-os/api test -- lead-contracts` và `pnpm --filter server test -- public-leads` thoát mã khác 0 tại đúng assertion mới.

### Task 1.2 — Cập nhật `leadSubmitSchema` và `POST /public/leads` để xanh toàn bộ test Phase 1
- **Goal:** `leadSubmitSchema` hỗ trợ `LEAD_SOURCES = ["profile", "placement-test"] as const`, ép `email` bắt buộc khi `source === "placement-test"`, và `public-leads.ts` lưu `source` cùng dedupe `UPDATE` bảo toàn trường tuỳ chọn.
- **Target files and symbols:**
  - `packages/api/src/lead-contracts.ts` (`LEAD_SOURCES`, `LeadSource`, `leadSubmitSchema`)
  - `apps/server/src/routes/public-leads.ts` (`publicLeadRoutes`)
- **Steps:**
  1. Trong `packages/api/src/lead-contracts.ts`, export `LEAD_SOURCES = ["profile", "placement-test"] as const` và `export type LeadSource = (typeof LEAD_SOURCES)[number]`.
  2. Thêm `source: z.enum(LEAD_SOURCES).optional()` vào `leadSubmitSchema` (giữ `.strict()`), nối `.superRefine((val, ctx) => { if (val.source === "placement-test" && !val.email) { ctx.addIssue({ code: "custom", path: ["email"], message: "Email là bắt buộc" }); } })`.
  3. Trong `apps/server/src/routes/public-leads.ts`, tính `const source = submit.source ?? "profile"`, dùng `${source}` trong `INSERT INTO lead` và `source` trong `LeadRow` gửi `notifyNewLead`.
  4. Trong nhánh dedupe `UPDATE` của `apps/server/src/routes/public-leads.ts`, giữ nguyên `source` gốc và chỉ ghi đè `birth_date`, `course`, `study_mode`, `study_days`, `time_slot`, `note`, `placement` khi giá trị gửi lên khác rỗng (`CASE WHEN ${submit.field ?? ""} = '' THEN lead.col ELSE ${submit.field ?? ""} END`).
  5. Cập nhật comment đầu file `lead-contracts.ts` và `public-leads.ts` để nêu thêm nguồn `/kiem-tra-dau-vao/`.
- **Success criteria:** Toàn bộ unit test của `@teacher-os/api` và `server`, typecheck và biome check đều xanh.
- **Verify:** `pnpm --filter @teacher-os/api test -- lead-contracts && pnpm --filter server test -- public-leads && pnpm check-types && pnpm exec biome check packages/api apps/server` thoát mã 0.

## Verification

- `pnpm --filter @teacher-os/api test -- lead-contracts`
- `pnpm --filter server test -- public-leads`
- `pnpm check-types`
- `pnpm exec biome check packages/api apps/server`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Risk / Rollback

Thay đổi tương thích ngược (trường mới tuỳ chọn). Rollback: revert commit; dữ liệu `source = placement-test` đã ghi vẫn hợp lệ vì cột là `text`.
