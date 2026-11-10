# Kongming Investigation Gate — 2026-11-10 (vibe #663, --advice)

Verdict: **GO** với 3 điều chỉnh bắt buộc (đã nạp vào phase files).

## Điều chỉnh bắt buộc
1. KHÔNG sửa `resolveStagingD1DatabaseId`/`assertNonProdD1Database` trong `packages/db/src/seed/vocab-library.ts` — license gate có chủ ý ("seeding production D1 requires written project-owner sign-off"), kèm guard test (`vocab-library.test.ts:342-346`). Resolver D1 viết MỚI file riêng, copy pattern fail-closed (exactly-1 match `vocab-library.ts:686-694`, pagination guard `:666-674`, UUID check), redact secrets (`redactSensitive` `:160`).
2. Workflow audit read-only tách khỏi cleanup; cleanup `--apply` không nằm trong workflow audit. Nếu prod > 0: workflow cleanup confirm-gate RIÊNG (copy confirm-gate `state-migrate.yml:30-37`) chỉ chạy sau khi owner review số liệu.
3. Query bổ sung cột: `s.makeup_date`, `s.id`, `s.created_at`, `dest_conflict_same_material`, `dest_has_lesson`, `dest_has_class_session`, `has_lesson_at_date`, `is_chain_intermediate`, `lm.org_id`, `s.org_id`.

## Phạm vi cleanup v1
Chỉ dòng thỏa ĐỒNG THỜI: `has_class_session=1` ∧ `has_lesson_at_date=0` ∧ `is_chain_intermediate=0` ∧ (`dest_has_lesson=1` ∨ `dest_has_class_session=1`). Nhóm auto (`has_class_session=0` — nghi mồ côi auto pre-#645) chỉ breakdown số liệu, không đụng, cần owner quyết định riêng.

## Rủi ro canh
- Staging DB tên `teacher-os-database-staging-<base32-16>` gần như chắc chắn không chứa legacy data → staging run chỉ validate plumbing; không suy ra prod sạch từ staging sạch (A3).
- `gh workflow run --ref <branch>` có thể 404 khi workflow chưa có ở default branch (A1) → fallback `gh api .../dispatches -f ref=<branch>`; nếu vẫn 404 → STOP escalate.
- Token environment đủ quyền POST `/query` vì deploy dùng chung (A2, medium) — nếu scoped hẹp sẽ thấy ở run staging đầu tiên.
- D1 REST `/query` non-atomic per statement (README-seed `:61-62`) → cleanup phải idempotent; sau apply re-audit = 0.

## Điểm nào KHÔNG nạp (và lý do)
- Gộp cleanup `--apply` vào workflow: từ chối — blast radius; giữ script local + đề xuất workflow confirm-gate riêng làm bước SAU khi có số liệu (ngoài phạm vi pipeline này).
- Sửa README-seed stale doc (nhắc `scripts/ci-workflow.test.mjs` không tồn tại trong packages/db/scripts): để lại follow-up, không scope-creep.

## Toàn văn
Lưu tại transcript `history://KongmingInvestigateGate` (agent job `KongmingInvestigateGate`, 2026-11-10).

## Advisory receipts — cập nhật 2026-11-10

- Advisory round-2 (blocker "⟺ manual"): NHẬN — 3 điều chỉnh (JOIN class/scheduling_mode, lm.created_at, mệnh đề một chiều) đã nạp vào plan.md:25 + phase-01. Đã tự verify `kernel.ts:2427-2450`.
- Checkpoint "after plan gates": spawn `KongmingPlanGate` THẤT BẠI hạ tầng — Cursor USAGE_PRICING_REQUIRED: Claude Opus 5.5 hết weekly usage. Theo advisory-supervision.md: lỗi counsel là non-fatal → record miss, tiếp tục dưới authoritative gates (validate exit 0; red-team 20 findings adjudicated; user đã quyết tooling+try_then_local). Hai receipt trước (investigation GO + round-2 blocker, round-2 đã đọc plan post-red-team) phủ phần lớn scope checkpoint này.
