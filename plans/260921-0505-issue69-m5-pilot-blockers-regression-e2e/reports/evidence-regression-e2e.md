# Evidence — Issue #69: pilot blocker triage + regression E2E (M5 DOD-1)

Ngày: 2026-09-21 · Branch: `vinh19410/issue-69-pilot-blockers-e2e` (base = `develop` @ `beda711`) · Plan: [../plan.md](../plan.md)

## 1. Triage pilot blocker — kết luận: 0 blocker tồn tại

Mọi nguồn blocker được quy ước trong repo đều đã kiểm tra ngày 2026-09-21:

| # | Nguồn | Kết quả |
|---|-------|---------|
| 1 | Pilot log `plans/260917-1215-m4-pilot-operations/pilot-log.md` (merge PR #215) | **Template rỗng** — mọi bảng ghi "_Chưa có dòng — pilot chưa bắt đầu_", 0 entry `PL-NNN`, bảng "Blocker SLA tracking" 0 dòng. |
| 2 | Issue mở label `QC` / `Dev` (`gh issue list --state open`) | 0 issue mang label này. Issue [QC] gần đây #176, #200 đều đã CLOSE. |
| 3 | Pilot evidence tham chiếu trong `docs/project-roadmap.md` (M4/M5) | Không có blocker nào được ghi ngoài log; M4 status: "pilot vận hành chưa bắt đầu". |
| 4 | Nguồn phụ plan M4: `weekly-check-in.md`, `triage-convention.md` | weekly-check-in chỉ chứa template ("Template tuần — copy khi dùng — không điền vào đây"); triage-convention chỉ định nghĩa phân loại/SLA. |
| 5 | Comments issue #67 (M4 onboard) và #53 (umbrella M4) | Chỉ ghi prep docs + xác nhận "pilot not started"; không blocker nào được báo. |

→ DOD-1 "Toàn bộ pilot blocker fix" thỏa điều kiện rỗng (vacuously satisfied): pilot chưa bắt đầu nên log không có blocker nào để fix. Không bịa evidence pilot — finding này là kết quả kiểm tra trực tiếp các nguồn trên.

## 2. Regression E2E xanh — evidence

### 2.1 Local (supporting) — cùng commit `beda711`, 2026-09-21

| Gate | Kết quả |
|------|---------|
| `pnpm check` (biome) | Xanh — 362 files checked, no fixes (1 info pre-existing về lệnh `biome migrate`, không liên quan PR này) |
| `pnpm check-types` (turbo) | Xanh — 6/6 tasks successful |
| `pnpm test` | Xanh — turbo test toàn workspace + `test:ci-workflow` 2/2 + `test:topology-drift` 6/6 pass |
| `pnpm --filter e2e e2e` (ports 8100/8101, port override vì dev server khác chiếm 8000/8001) | **66 passed, 1 skipped, 0 failed** — 1.6m |

Skip duy nhất (có chủ đích, không phải regression ẩn): `apps/e2e/specs/profile.spec.ts:143` — test.skip khi thiếu `E2E_GOOGLE_OAUTH` vì boot shim dùng Google creds dummy; round-trip OAuth thật thuộc manual checklist (deviation M3, `docs/project-roadmap.md` mục M3).

Suite phủ đủ 2 luồng DOD yêu cầu: **class operations** (`class-operations.spec.ts`, `create-class-validation.spec.ts`, `class-assign.spec.ts`, `schedule-session-modal.spec.ts`, `session-occurrence.spec.ts`, `projected-sessions.spec.ts`, …) và **money loop** (`create-invoice.spec.ts`: tạo invoice → mark paid → KPI giữ sau reload).

### 2.2 CI (primary, theo convention evidence của roadmap) — workflow `E2E` + `CI`

- Baseline develop: E2E + CI **success** tại `e41c0a3` (runs 35562585219, 35562585347, 2026-09-21T04:53Z). Docs-only commits sau đó (`8a11996`, `e6d6e1f`) deploy staging success.
- PR của issue #69 chạy đúng workflow này trên chính PR (trigger `pull_request` → `develop`, `.github/workflows/e2e.yml`): link check run được ghi vào issue #69 khi PR mở.
- Post-merge develop: link 3 workflow run (CI, E2E, Deploy Staging) cho commit merge được ghi vào issue #69 sau khi merge (file này nằm trong PR nên không thể biết trước URL run post-merge).

## 3. Đổi mới scope DOD-honest

Không có code change — verification-only là thay đổi trung thực nhỏ nhất theo constraint issue #69 ("không bịa pilot evidence… smallest truthful change"). Thay đổi duy nhất trong PR: plan (file này + phases), tick 1 dòng DOD roadmap M5 kèm caveat, journal.
