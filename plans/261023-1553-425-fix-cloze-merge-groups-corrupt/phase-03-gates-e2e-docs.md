---
title: "Phase 3: Gates cục bộ + e2e + docs"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: Gates cục bộ + e2e + docs

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

## Goal

Toàn bộ gate cục bộ của repo xanh trên nhánh fix + changelog + runbook + minh chứng UI (screenshot banner corrupt) trước khi ship PR.

## Files to Create / Modify

- Modify: `CHANGELOG.md` — 2 dòng `### Fixed` dưới mục `## 2026-10-23` hiện có.
- Modify: `docs/production-release-runbook.md` — mục deploy-skew strict DTO (~835-836) bổ sung 2 key mới.
- Screenshot: `plans/reports/` (artifact, KHÔNG commit vào chỗ khác theo AGENTS.md).

## Tasks & Steps

1. **Task 3.1 — Lint/format**: `pnpm check:fix` rồi `pnpm check`.
   - Success criteria: exit 0, không warning mới.
   - Verify: `pnpm check` exit 0.
2. **Task 3.2 — Types**: `pnpm check-types`.
   - Success criteria: exit 0 toàn workspace.
   - Verify: `pnpm check-types` exit 0.
3. **Task 3.3 — Unit test toàn repo**: `pnpm test`.
   - Success criteria: exit 0; không test nào bị skip so với baseline.
   - Verify: `pnpm test` exit 0.
4. **Task 3.4 — e2e admin-library**:
   ```bash
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 \
     pnpm --filter e2e e2e admin-library-reading admin-library-listening
   ```
   - Success criteria: cả 2 spec pass.
   - Verify: playwright summary có `passed` cho cả 2 spec, exit 0.
   - Lưu ý: message `[dev-watchdog] hạ tầng dev server bất ổn…` là lỗi HẠ TẦNG, không phải lỗi test (AGENTS.md) — chạy lại TỐI ĐA 1 lần; vẫn chết → STOP theo Failure Protocol kèm log.
5. **Task 3.5 — Screenshot banner corrupt (minh chứng PR)** — cơ chế seed cụ thể:
   1. Đọc `apps/e2e/devserver-services.mjs` để xác định đường dẫn file DB (sqlite/libsql) mà dev API dùng, và cách boot stack.
   2. Boot dev stack (API 8100 + admin 8104) như Task 3.4, tạo 1 đề + 1 part qua UI/API.
   3. DỪNG API (giữ DB), seed corrupt: `node -e` với `@libsql/client`/`better-sqlite3` (theo loại DB ở bước 1) chạy `UPDATE library_test_part SET groups='{broken json' WHERE ...` đúng row vừa tạo. KHÔNG đụng DB khác.
   4. Boot lại API, mở trang sửa đề admin (port 8104), đăng nhập admin test, chọn part → banner hiện.
   5. Chụp 3 viewport: 1440×900, 768×1024, 375×812 (Playwright script dùng `apps/admin` URL 8104), lưu `plans/reports/425-banner-{desktop,tablet,phone}.png`.
   - Success criteria: 3 file tồn tại; banner đọc được ở 375 (không tràn ngang, không che nút hành động).
   - Verify: `ls plans/reports/425-banner-*.png` có đúng 3 file; xem ảnh.
   - Nếu DB dev là D1/remote (không phải file local) và không seed được cục bộ → fallback: chụp từ component test (`part-form.test.tsx` test 11) bằng storybook-less render script, hoặc ghi rõ blocker vào PR (screenshot người sẽ tự xác nhận sau merge) — KHÔNG tự chế đường seed khác.
6. **Task 3.6 — CHANGELOG**: thêm vào `## 2026-10-23` → `### Fixed`:
   - `segmentsToItems` (editor cloze/tablecomp) không còn merge `explanation`/`answerSet`/`pin`/`type` theo vị trí index — blank chèn/xóa giữa chuỗi không còn bám metadata sai; metadata theo nội dung đáp án, trùng đáp án map theo thứ tự (SAU khi cài phase 1) (#425)
   - Admin library: `parseGroups` corrupt được log kèm lý do + DTO gắn cờ `groupsCorrupt`; PUT ghi đè groups corrupt bằng rỗng thiếu cờ `discardCorruptGroups` bị chặn 409 `GROUPS_CORRUPT`; cờ trên đề đã sạch → 409 `GROUPS_NOT_CORRUPT`; publish đề có part corrupt bị chặn (#425)
   - Success criteria: 2 dòng đúng mục ngày + nhóm `### Fixed`.
   - Verify: `awk '/## 2026-10-23/,/## 2026-10-22/' CHANGELOG.md | grep -c "#425"` ≥ 2.
7. **Task 3.7 — Docs sync (beta mode)**: contract API đổi additive + runbook:
   1. Cập nhật `docs/production-release-runbook.md` (~835-836): thêm `groupsCorrupt` (DTO) và `discardCorruptGroups` (upsert) vào điều kiện same-release-train; ghi chú: rollback worker cần hạ admin đồng thời; server cũ nhận `discardCorruptGroups` từ admin mới → 400 (strict) — chỉ dùng nút "Xoá nhóm hỏng và lưu" sau khi cả 2 side cùng bản.
   2. Kiểm `grep -rn "libraryPartUpsertSchema\|groupsCorrupt" docs/` — các hit còn lại (ngoài runbook) đánh giá: mô tả schema chi tiết → cập nhật; chỉ nhắc tên → bỏ qua.
   - Success criteria: runbook có 2 key mới trong mục deploy skew.
   - Verify: `grep -n "groupsCorrupt" docs/production-release-runbook.md` ≥ 1 match.

## Verification (gate cuối phase)

- [ ] `pnpm check && pnpm check-types && pnpm test` exit 0 (chuỗi một lệnh).
- [ ] e2e admin-library 2 spec pass.
- [ ] `git status --porcelain` — chỉ chứa thay đổi thuộc plan: `packages/ui/src/lib/cloze.ts` (+test), `apps/web/src/lib/cloze.test.ts`, `packages/api/src/library-contracts.ts` (+test), `apps/server/src/routes/admin-library.ts` (+test), `apps/admin/src/components/library/part-form.tsx` (+test), `apps/admin/src/components/library/library-error.ts`, `apps/admin/src/components/library/test-outline-model.test.ts`, `apps/admin/src/components/library/answers-overview.test.ts`, `docs/production-release-runbook.md`, `CHANGELOG.md`, plan files, screenshots. File khác xuất hiện → điều tra trước khi commit.

## Security Considerations

- Screenshot KHÔNG chứa dữ liệu thật/token (dùng fixture local, tài khoản test).
- Không commit artifact ngoài `plans/reports/`.
- Không commit nội dung DB dev.
