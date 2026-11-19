# Plan #832 — Nhóm bộ từ vựng & lọc theo nhóm để pick số lượng lớn

- **Issue**: [#832](https://github.com/vinh19410/teacher-os/issues/832)
- **Branch**: `vinh19410/squirrelfish` → PR vào `develop` (`--merge --beta`)
- **Status**: Completed

## Mục tiêu & Done means
- Bảng `vocab_group` (unique `org_id` + `normalized_name`) và cột nullable `vocab_deck.group_id` có Drizzle migration + rehearsal test pass; xoá nhóm đặt `group_id = NULL` tường minh trong 1 `db.batch`.
- API `/api/kernel/vocab/groups` (create/rename/delete với org IDOR guard + 409 trùng tên) và `create`/`rename`/`import-csv`/`clone`/`snapshot` hỗ trợ `groupId` đầy đủ, unit/route tests pass.
- UI có nút **Quản lý nhóm** (modal CRUD), dropdown **Nhóm** + tạo nhóm nhanh inline ở Tạo/Sửa bộ từ và Import CSV, badge + bộ lọc Nhóm ở `VocabDeckList` (`/vocab` và trang lớp).
- Tab **Bộ từ đã tạo** trong `VocabLibraryDialog` có lọc Nhóm (kết hợp Tìm kiếm + Nguồn), nút Chọn tất cả cộng dồn không chặn 500 từ, tự chia batch (`<= 50` bộ & `<= 500` bộ+từ/lượt) kèm hiển thị tiến độ & xử lý lỗi giữa chừng, bản clone giữ nguyên `groupId`.
- `pnpm exec biome check .`, `pnpm check-types`, unit/integration tests, spec E2E lẻ liên quan pass; kiểm tra UI 3 viewport (light + dark) sạch; isolated code review sạch.
- Issue #832 có POT đầy đủ và chuyển nhãn `shipped` sau khi merge PR vào `develop`.

## Các pha thực hiện

### Phase 1: DB Schema, Migration, API Contracts & Server Routes
- **Sở hữu file**:
  - `packages/db/src/schema/vocab.ts`
  - `packages/db/src/migrations/0080_*.sql` & `packages/db/src/migrations/meta/*`
  - `packages/db/src/schema/vocab.test.ts`
  - `packages/api/src/contracts.ts`, `packages/api/src/vocab-contracts.test.ts`
  - `apps/server/src/routes/snapshot.ts`
  - `apps/server/src/routes/vocab-teacher.ts`, `apps/server/src/routes/vocab-teacher.test.ts`
- **Kiểm chứng**: `pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm check-types`

### Phase 2: Web Store Glue (tiền điều kiện cho Phase 3A & 3B song song)
- **Sở hữu file**:
  - `apps/web/src/lib/data-actions.ts`
  - `apps/web/src/lib/repos/kernel.ts`
  - `apps/web/src/lib/kernel-state.ts`
  - `apps/web/src/lib/mock-data.ts`
  - `apps/web/src/test/kernel-harness.tsx`

### Phase 3A (song song với 3B): Quản lý nhóm, Tạo/Sửa/CSV & Bộ lọc trên `VocabDeckList`
- **Sở hữu file**:
  - `apps/web/src/components/vocab/vocab-group-manager-modal.tsx` (mới)
  - `apps/web/src/components/vocab/vocab-group-select-field.tsx` (mới)
  - `apps/web/src/components/vocab/vocab-deck-list.tsx`
  - `apps/web/src/components/vocab/vocab-csv-import-dialog.tsx`
  - `apps/web/src/components/vocab/vocab-hub.test.tsx`

### Phase 3B (song song với 3A): Lọc theo nhóm & Auto-batch Clone trên tab "Bộ từ đã tạo"
- **Sở hữu file**:
  - `apps/web/src/components/vocab/vocab-clone-batches.ts` (mới)
  - `apps/web/src/components/vocab/vocab-clone-batches.test.ts` (mới)
  - `apps/web/src/components/vocab/vocab-teacher-decks-tab.tsx`
  - `apps/web/src/components/vocab/vocab-library-dialog.tsx`
  - `apps/web/src/components/vocab/vocab-library-dialog.test.tsx`

### Phase 4: E2E lẻ + Ảnh POT 3 viewport + Isolated Review + Merge PR vào `develop`
- Mở rộng `apps/e2e/specs/vocab-teacher-deck-clone.spec.ts` kiểm chứng nhóm + multi-batch >500 từ + chụp ảnh POT 3 viewport (light + dark).
- Chạy full local gates (`biome`, `check-types`, unit tests, spec E2E lẻ).
- Chạy isolated code review trên sub-session mới, xử lý mọi finding, mở PR vào `develop`, đăng POT lên #832, merge PR và chuyển nhãn `shipped`.
