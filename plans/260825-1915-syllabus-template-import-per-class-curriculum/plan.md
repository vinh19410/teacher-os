---
title: "Syllabus template import per-class curriculum"
description: "Syllabus thành template dùng chung (class_id NULL); lớp import deep copy qua POST /api/classes/:id/import-syllabus (db.batch atomic, status reset upcoming, unique index chặn trùng); giáo viên edit module/lesson riêng từng lớp. Migration 0009 thêm class_id + source_template_id + index + backfill copy-on-import cho class hiện có."
status: pending
priority: P1
effort: "3-4d"
tags: [feature, backend, frontend, database, api]
branch: feat/syllabus-template-import
issue: 79
---

# Syllabus template import per-class curriculum

## Overview

Hiện tại syllabus là cây dùng chung: `class.syllabusId` chỉ là pointer, edit syllabus đổi nội dung mà mọi lớp cùng gán đều đọc (scout §8). Refactor này chuyển sang mô hình **template + copy-on-import** (D1):

- `syllabus.class_id IS NULL` = template. Lớp import → deep copy cây syllabus/module/lesson với id mới (server-side UUID), `class_id` trỏ về lớp, `source_template_id` ghi provenance — chỉ dùng đếm "đang dùng", không sync (D6).
- Import atomic bằng một `db.batch` (D1 batch = transaction, docs verified); mọi lesson status copy reset `upcoming` (status là tiến độ lớp, không phải nội dung template — D2); unique index trên `class_id` → import trùng trả 409.
- Giáo trình lớp edit độc lập; edit template chỉ ảnh hưởng import tương lai.

Binding: D1-D6 trong [reports/design-decisions.md](./reports/design-decisions.md). Bằng chứng code: [reports/scout-report.md](./reports/scout-report.md). Căn cứ external (Moodle/Classroom copy-vs-Canvas Blueprint, D1 batch limits ~71 statements): [reports/research-report.md](./reports/research-report.md).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | DB: discriminator `class_id` + `source_template_id` + unique/partial index; migration 0009 backfill copy-on-import cho class hiện có, preserve status | P1 |
| 2 | API: `import-syllabus` (atomic, reset status, 409 trùng) thay `assign-syllabus`; `remove-curriculum`; `POST /api/classes` nhận `templateId` import cùng lúc | P1 |
| 3 | Web data layer: `templates` filter, pass-through `classId`/`sourceTemplateId`, action import/remove (reducer chỉ dọn case chết), in-use derive qua `sourceTemplateId` | P1 |
| 4 | Web UI: trang syllabus thành template gallery + template editor; tab Giáo trình lớp thành full editor trên bản copy + ImportSyllabusModal | P1 |
| 5 | Zero regression: org isolation, position ordering, status trio, totalLessons recompute, scheduled lesson (`lesson` table) tách biệt | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [DB schema và migration 0009 — discriminator](./phase-01-start.md) | Pending |
| 2 | [DB schema và migration 0009 — backfill](./phase-02-db-schema-and-migration.md) | Pending |
| 3 | [API contract and server import](./phase-03-api-contract-and-server-import.md) | Pending |
| 4 | [Web data layer](./phase-04-web-data-layer.md) | Pending |
| 5 | [Web UI template gallery and class editor](./phase-05-web-ui-template-gallery-and-class-editor.md) | Pending |
| 6 | [Acceptance and migration rehearsal](./phase-06-acceptance-and-migration-rehearsal.md) | Pending |

## Dependencies

1. [Phase 1: DB schema và migration 0009 — discriminator](./phase-01-start.md) — tạo schema + phần structural của file 0009.
2. [Phase 2: DB schema và migration 0009 — backfill](./phase-02-db-schema-and-migration.md) — viết tiếp backfill copy-on-import trong cùng file 0009; cần phase 1.
3. [Phase 3: API contract and server import](./phase-03-api-contract-and-server-import.md) — cần schema (phase 1) + backfill semantics (phase 2).
4. [Phase 4: Web data layer](./phase-04-web-data-layer.md) — cần contract/action mới (phase 3).
5. [Phase 5: Web UI template gallery and class editor](./phase-05-web-ui-template-gallery-and-class-editor.md) — cần `templates` + action import/remove (phase 4).
6. [Phase 6: Acceptance and migration rehearsal](./phase-06-acceptance-and-migration-rehearsal.md) — cần đủ 1-5.

Tuyến tính 1→6, không parallelize — contract chảy DB → API → web.

## Success Criteria

- [ ] Migration 0009 (structural + backfill, land cùng commit) apply sạch trên rehearsal test in-memory seed pilot-like: mỗi class cùng-org có `syllabus_id` sở hữu đúng 1 copy (UUID format), status + position copy giữ nguyên, cây template gốc reset 100% `upcoming`, pointer trỏ copy, replay idempotent; `pnpm --filter @teacher-os/db db:generate` không sinh migration lạ.
- [ ] `pnpm --filter server test` pass — kernel.test.ts cover: import copy full tree (id mới, position giữ), reset status `upcoming`, 409 import trùng (pre-check), 404 ngoài org / không phải template, remove-curriculum xóa cây + null pointer (thứ tự FK đúng), class create + `templateId` atomic.
- [ ] `pnpm test` pass toàn workspace (web repo/contract test cập nhật theo action mới; reducer chỉ xoá case assign chết).
- [ ] `pnpm check-types` và `pnpm build` pass.
- [ ] Browser smoke (`pnpm dev:server` + `pnpm dev:web`, chỉ sau khi 0009 land hoàn chỉnh): `/syllabus` chỉ list template + badge "đang dùng N lớp"; import template vào lớp → edit lesson trên lớp không đổi template; import lần 2 → 409 "Lớp đã có giáo trình"; gỡ giáo trình → confirm → cây copy bị xóa; tạo lớp kèm template → có sẵn cây; payload snapshot đo trước/sau, ngưỡng < 512KB.
- [ ] Clean cutover: grep `apps/` + `packages/` không còn `assign-syllabus` (endpoint, action, modal; `open-design/` + `plans/` là archive loại trừ).
## Red Team Review

### Session — 2026-08-25
**Mode:** deep (4 hostile reviewers: Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic). Kongming checkpoint (`--advice`): dispatch failed at transport (proxy 502) — advisory miss recorded; red-team verification roles compensated.
**Findings:** 15 (all accepted: 13 Accept, 2 Accept-modified; 0 rejected after evidence filter)
**Severity breakdown:** 4 Critical/High clusters (migration workflow — db:migrate:deploy unusable + alchemy ledger-skip trap + missing statement-breakpoints; import response contract `{id}` vs json.id + dead reducer path; remove-curriculum FK order + org guard; backfill org-join + orphan + idempotency), 11 Medium/Low.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| A | Migration workflow: db:migrate:deploy bất khả thi (d1-http, repo cấm) + bẫy ledger-skip khi 2-phase sửa chung file 0009 (tái hiện sự cố 0008) + thiếu `--> statement-breakpoint` | Critical | Accept | Phase 1, 2, 6 |
| B | Response import `{syllabusId}` bị transport drop (`json.id`); reducer là dead fixture — chỉ xoá case; `""` thay null | High | Accept | Phase 3, 4 |
| C | remove-curriculum: FK NO ACTION chặn delete-parent — update pointer null TRƯỚC; mọi DELETE kèm org_id | High | Accept | Phase 3 |
| D | Backfill: org-join `s.org_id = c.org_id`, không NULL hóa pointer mồ côi, idempotent NOT EXISTS | High | Accept | Phase 2 |
| E | Id format: printf UUID-shaped (randomblob không khớp `crypto.randomUUID`) | Medium | Accept | Phase 2 |
| F | Reset status cây template gốc → `upcoming` sau backfill + scenario | Medium | Accept | Phase 2 |
| G | 409 duplicate: pre-check pointer deterministic, bỏ string-match SQLite error | Medium | Accept | Phase 3 |
| H | Race remove vs add-module → module mồ côi | Medium | Accept (modified: risk-note có chủ đích) | Phase 3 |
| I | Thứ tự batch create-class: copy tree trước, insert class cuối (FK) | Medium | Accept | Phase 3 |
| J | Snapshot phình O(classes×tree) | Medium | Accept (modified: đo payload phase 6, defer arch) | Phase 3, 6 |
| K | Gate grep thu hẹp `apps/ packages/` (archive loại trừ) | High | Accept | Phase 6, plan.md |
| L | Bỏ dead index `syllabus_template_idx` | Medium | Accept | Phase 1 |
| M | Callers bỏ sót: kernel.test :226/:371/:1996, classes.test.ts:75-86, inline filters :50/:86, xoá resolveSyllabusId, widen findSyllabus | Medium | Accept | Phase 3, 4, 5 |
| N | Nút header "Đổi syllabus": xoá khi có curriculum + KERNEL_WRITE_MODALS filename | Medium | Accept | Phase 5 |
| O | Size guard import: modules+lessons > 500 → 422 | Low | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-06 (sau khi apply toàn bộ findings).
- Decision deltas checked: 15 (response shape, FK order, grep scope, index set, rehearsal method, id format, status reset, reducer scope, header button).
- Reconciled stale references: 4 (plan.md success criteria; phase-03 architecture "unique guard duy nhất"; phase-03 output response shape; phase-06 matrix 8→11).
- Unresolved contradictions: 0.

### Verification Pass — 2026-08-25 (vibe gate rerun)
**Reviewer:** hostile verification lens (Failure Mode Analyst + Contract Verifier). Verdict: **GO**.
- 15/15 original findings verified applied in phase files; 9 decision deltas consistent; plan-to-repo drift: none material (line drift ≤3).
- New findings accepted + applied: (P2) `CREATE TABLE IF NOT EXISTS tmp_module_map` — replay sau partial-fail không chết ở duplicate table (phase-02); (P3) phase-06 matrix renumber 10→9, gate 9/9; (P3) design-decisions.md D3.3/D5 stale text đánh dấu superseded inline; (P3) phase-03 batch-catch semantics: SELECT re-check pointer → 409/500 thay vì catch-all 409.

### Cook-time deviation — 2026-08-25 (backfill algorithm)
Simulation of the phase-02 sketch showed **full replay crashes**: after step 6 (pointer → copy), the map join anchors on `c.syllabus_id` which now resolves to the COPY; the `source_template_id = copy_id` subquery finds nothing → map rows for copy modules → module insert with `syllabus_id NULL` → NOT NULL violation. Scenario 11 of the plan's own matrix would fail.
**Fix (implemented):** copy-anchored, position-keyed set-based backfill — every copy resolves via `(source_template_id, org)`, never via the class pointer; module/lesson guards are `NOT EXISTS ... AND m2.position = m.position` (positions are unique per parent, assigned `max+1` at runtime). This heals **every** statement-boundary crash state (proven by rehearsal scenario 11b looping all boundaries), never duplicates, and makes `tmp_module_map` unnecessary — dropped. Structural `ALTER ADD COLUMN` replay is ledger-guarded (SQLite has no ADD COLUMN IF NOT EXISTS — same as 0006-0008).

## Validation Log

### Validation Session 1 — 2026-08-25
- Verification pass: skipped per guard (Red Team Review section exists with verification evidence — 4 reviewers ran Fact Checker / Flow Tracer / Scope Auditor / Contract Verifier, 23 fact-check claims).
- Questions asked: 3. Decisions (all recommended options, plan unchanged):
  1. "Gỡ giáo trình" = **xóa cây copy + tiến độ** (pointer null, DB sạch) — đã khớp D2.
  2. Nút "Đổi syllabus" = **xoá khỏi header**; muốn đổi curriculum → Gỡ rồi Import lại — khớp D6 non-goal (no replace v1) và red-team N.
  3. Backfill status = **copy của class hiện có giữ nguyên phân phối done/current; template gốc reset `upcoming`** — khớp D2.3/D3.4 + red-team F.
- Whole-Plan Consistency Sweep (post-validation): re-read plan.md + 6 phase files; decision deltas checked 3; stale references 0; unresolved contradictions 0.

### Acceptance Evidence — 2026-08-25 (cook phase 6)
- Rehearsal: `apps/server/src/syllabus-template-migration.test.ts` — 13 tests green (unique index, 11-scenario matrix incl. orphan/cross-org/share-template, replay-idempotent, boundary-heal loop).
- Suites: server 125/125, web 234/234, infra 11/11, auth 16/16, ci-workflow + topology 7 node tests — `pnpm test` PASS. `pnpm check-types` PASS, `pnpm build` PASS, `db:generate` parity (no changes), biome clean (2 pre-existing warnings on develop files).
- Browser smoke (alchemy dev local D1, ports shifted 8010/8011 to avoid the operator's running stack; local-only uncommitted change, reverted after): 9/9 — gallery templates-only + in-use badge 0→1; import → 0/3 upcoming; 409 on duplicate (direct fetch); copy↔template isolation both directions; remove → confirm → empty state, snapshot shows exactly 1 syllabus (template) + null pointer; create-class-with-template has tree ready; classes table pointer column resolves copy name.
- Snapshot payload: 1,301 B after 1 template + 1 import; 2,553 B after re-import with second class — orders of magnitude under the 512 KB pilot threshold.
- Cutover grep: `assign-syllabus|assignSyllabus` in `apps/` + `packages/` = the one intentional 404-proof test string only.
- Pre-prod verified: no prod D1 (runbook; alchemy state has no production database), deploy coupling noted for PR.

### Local Code Review — 2026-08-25 (vibe step 6)
Stage 1 spec compliance: **PASS** (reviewer traced the migration SQL independently). Stage 2: no Critical/Important; 4 Minor — 3 fixed (422 size-guard test added; ImportSyllabusModal stale default → derived selection; legacy pointer-anomaly dead-end → remove-curriculum now nulls a non-copy pointer instead of 409, UI anomaly branch with Gỡ; template rows still never deleted). 1 noted-not-fixed: pre-migrate orphan/wrong-org skip-count is an operational SELECT, documented for the deploy note. Verdict: **SHIP**. Server 126/126 after fixes.

## Boundary reminder

- **Plan-only:** không edit code source. Sau khi plan được duyệt, chạy `/ak:cook plans/260825-1915-syllabus-template-import-per-class-curriculum`.
