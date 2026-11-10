---
title: "Audit lesson_material mồ côi từ activation trước fix #659"
description: "Script audit + cleanup one-off, workflow CI read-only chạy D1 thật (staging/prod), ghi số liệu vào issue #663"
status: completed
priority: P1
effort: 3.5h
issue: 663
branch: fix/663-audit-orphan-lesson-materials
tags: [bugfix, database, infra]
blockedBy: []
blocks: []
created: 2026-11-10
---

# Audit lesson_material mồ côi từ activation trước fix #659

## Overview

Trước fix #659/#662, các đường activation/attach-sau-shift tạo `holiday_session_shift` mà không move `lesson_material` — tài liệu GV gắn vào buổi gốc kẹt ở `original_date`, buổi bù trống tài liệu. Plan này giao: (1) script audit + cleanup one-off chạy được cả local libsql lẫn Cloudflare D1 thật, (2) workflow GitHub Actions read-only chạy audit trên DB staging/prod theo precedent `state-migrate.yml`, (3) chạy audit thật và ghi số liệu vào issue #663.

## Phạm vi & ràng buộc

- **Repo là PUBLIC** (red-team S1, verified `gh repo view`): mọi thứ in ra Actions log/comment issue là công khai. Mode `--d1` chỉ in số tổng hợp (`manual_total`, `cleanup_eligible`, breakdown); bảng dòng chi tiết chỉ mode `--file` local. Không bao giờ in token; error message redact databaseId/token.
- Query audit: `lesson_material` JOIN `holiday_session_shift` ON `(class_id, original_date = date)`, KHÔNG filter `NOT EXISTS class_session` (#659 không move `class_session` — buổi gốc LUÔN còn dòng). EXISTS lesson phải **status-aware** (`upcoming`/`completed` — lesson `holiday` ở ngày gốc là trạng thái tất yếu sau shift; red-team F1).
- Phân loại (advisory round-2 kiểm chứng `kernel.ts:2427-2450`): chiều chắc duy nhất — lớp manual ⟹ `has_class_session=1` (route thêm buổi manual luôn insert `class_session`); chiều ngược KHÔNG chắc (lớp auto 0 lesson qua gate add-session và cũng insert được `class_session`) → query JOIN `class` lấy `scheduling_mode` + `lm.created_at` để report tự chứng minh cơ chế và phân biệt legacy với tái phát. Phạm vi cleanup v1: `has_class_session=1` (superset bảo thủ). `has_class_session=0` ⟹ auto — breakdown riêng, không đụng v1.
- Cleanup `--apply` (script, không nằm trong workflow): delete-then-move pattern #659 với DELETE **live-subquery**; chain shift được resolve về đích cuối trước khi move; chỉ dòng thỏa v1: manual ∧ không còn lesson `upcoming`/`completed` ở gốc ∧ chain resolve được ∧ đích cuối có buổi thật. `--apply` qua `--d1` bắt buộc `--confirm-stage` + dump JSON trước câu ghi. Plan single-use (replay cùng plan bị chặn — red-team S2).
- Workflow audit read-only tuyệt đối, có test gate cơ học trong `ci-workflow.test.mjs` (red-team A3).
- Không đụng `vocab-library` seed (license gate có chủ ý) — chỉ import regex đã export.

## Phases

| # | Phase | Status |
|-------|--------|--------|
| 1 | [Module audit + cleanup + script CLI (TDD)](./phase-01-audit-cleanup-script.md) | Pending |
| 2 | [Workflow CI audit-663.yml read-only + test gate](./phase-02-ci-workflow.md) | Pending |
| 3 | [Chạy audit DB thật + ghi số liệu vào issue](./phase-03-run-audit-record.md) | Pending |

## Success Criteria

- [ ] `pnpm --filter @teacher-os/db test` xanh (10 nhóm test mới: phân loại, chain, single-use, partial-failure hội tụ, resolve fail-closed, redact, reconciliation).
- [ ] Script chạy `--file` (libsql) và `--d1 --d1-stage <staging|prod>`; mặc định read-only; `--apply` qua D1 có confirm-gate + dump.
- [ ] Workflow `audit-663.yml` dispatch được, read-only có test gate cơ học, không lộ secret, serialize với deploy.
- [ ] Số liệu audit (tổng hợp) staging + prod được ghi comment vào issue #663 kèm breakdown đối chiếu `manual_total = cleanup_eligible + Σ(loại)`.

## Cross-Plan Dependencies

Không có plan chặn; thuộc chuỗi domain #645 → #658 → #659 → #662 → #663 (trước #663 đã merge hết).

## Red Team Review

### Session — 2026-11-10
**Findings:** 25 thô → 20 sau dedupe (13 accepted, 7 rejected/trùng)
**Severity breakdown:** 3 Critical, 5 High, 12 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Repo PUBLIC — log CI phơi ID nội bộ (S1) | High | Accept | Phase 1 (exposure policy), Phase 3 |
| 2 | Replay cùng plan cleanup = mất data (S2) | High | Accept | Phase 1 (single-use plan, fresh rebuild) |
| 3 | `--apply` prod không có write-gate (S3+A4) | High | Accept | Phase 1 (`--confirm-stage` + dump JSON) |
| 4 | `has_lesson_at_date` đếm cả lesson holiday → gate loại 100% population (F1) | Critical | Accept | Phase 1 (status-aware EXISTS + fixture holiday) |
| 5 | Chain/cancel đích tạo mồ côi mới tự giấu (F2) | High | Accept | Phase 1 (chain resolve về terminal, đích phải có buổi thật) |
| 6 | Dispatch cần workflow trên default branch `main`; fallback API chết cùng nguyên nhân (A1+F3) | Critical | Accept | Phase 3 (restructured sau quyết định user) |
| 7 | Biome trên YAML luôn exit 1; verify phase 2 không thể pass (A2+F4) | High | Accept | Phase 2 (python3 YAML parse, bỏ biome-on-yaml) |
| 8 | Thiếu test gate cơ học cho workflow chạm secrets (A3) | High | Accept | Phase 2 (7 assert trong `ci-workflow.test.mjs`) |
| 9 | Comment read-only mâu thuẫn grep `--apply`=0 (S7+A7) | Medium | Accept | Phase 2 (ngôn từ comment + assert trong test) |
| 10 | Nhãn `manual_candidates` mơ hồ, undercount population (S8+A5) | Medium | Accept | Phase 1 (manual_total/cleanup_eligible + reconciliation) |
| 11 | Prod prefix list quá rộng + pagination cliff (S9) | Medium | Accept | Phase 1 (prefix `teacher-os-database-prod-` + phân trang đủ) |
| 12 | `redactSensitive` citation sai file/dòng (S4+A8+F6) | Medium | Accept | Phase 1 (citation đúng `scripts/seed-vocab-library.ts:121`, copy pattern vào module + test) |
| 13 | "single quote" sai — biome double quotes (S5) | Medium | Accept | Phase 1 (tab + double quotes) |
| 14 | Thiếu YAML validate thật (S6) | Medium | Accept | Phase 2 (python3 safe_load) |
| 15 | D1 tuần tự không test partial-failure; DELETE pre-bind sai pattern (F5) | High | Accept | Phase 1 (live subquery + test abort giữa chừng) |
| 16 | Cleanup không có owner/điều kiện apply; bug gate trốn trong số liệu (F7) | Medium | Accept | Phase 1 (reconciliation exit 2) + plan.md (Post-plan decision) |
| 17 | RED verify Task 1.1 bị pipe che exit (F8) | Medium | Accept | Phase 1 (tách exit check khỏi pipe) |
| 18 | tsconfig không include `src/audit/**` → test file thoát check-types (A6) | Medium | Accept | Phase 1 (thêm include) |
| 19 | Staging DB ephemeral — không suy prod từ staging (kongming A3) | Medium | Accept | Phase 3 (ghi chú nghiệp vụ) |
| 20 | Cleanup qua confirm-gate workflow riêng khi prod > 0 (kongming Q3) | Medium | Defer | Post-plan decision (follow-up issue nếu có số liệu) |

Rejected sau dedupe: 5 finding trùng lặp giữa 3 reviewer (biome-yaml, grep semantics, redact citation, comment-vs-grep, fixture arithmetic) — gộp vào các dòng trên.

### Whole-Plan Consistency Sweep — 2026-11-10

- Từ vựng số liệu thay `manual_candidates` → `manual_total`/`cleanup_eligible` đồng bộ ở plan.md, phase-01, phase-03.
- Gate `has_lesson_at_date` → `active_lesson_at_date` (status-aware) đồng bộ mọi file; fixture phase-01 yêu cầu lesson `holiday` ở ngày gốc.
- `is_chain_intermediate` (loại) → `resolveChain` về terminal đích (move theo chuỗi) — phase-01 không còn nhắc cột cũ.
- Chính sách public repo thay "repo private" ở phase-03; mode `--d1` không in bảng dòng.
- Phase 3 viết lại sau quyết định user về đường dispatch (workflow cần nằm trên `main` để GitHub đăng ký).
- Không còn mâu thuẫn chưa giải quyết.

## Post-plan decision (ngoài phạm vi tự động)

- Chạy `--apply` trên DB thật là quyết định owner SAU khi review breakdown số liệu; điều kiện: `cleanup_eligible > 0`, dump JSON đã lưu, `--confirm-stage` khớp. Nếu prod có dòng mồ côi: follow-up issue cho workflow cleanup confirm-gate riêng (kongming đề xuất, defer).
