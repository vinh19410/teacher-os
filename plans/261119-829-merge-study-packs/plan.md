# Plan #829 — Gộp bộ đề của tôi và thư viện hệ thống thành 1 danh sách dùng chung

- **Issue:** https://github.com/vinh19410/teacher-os/issues/829
- **Branch:** `vinh19410/Gộp-bộ-đề-tự-học` (base: `origin/develop`)
- **Status:** in progress

## Acceptance Criteria (Done means)

1. `/assignments/packs`: Loại bỏ bộ chọn tab "Bộ đề của tôi" / "Thư viện hệ thống" (`fieldset aria-label="Phạm vi bộ đề"`). Toàn bộ bộ đề (cả `org` và `system`) hiển thị chung trong cùng 1 danh sách, giữ badge phân biệt nguồn gốc ("Hệ thống" / "Trung tâm") và trạng thái ("Sẵn sàng" / "Nháp"). Có bộ lọc nguồn ("Tất cả", "Trung tâm", "Hệ thống") và bộ lọc trình độ ("Tất cả", "Foundation", "A1"...) dạng `ChipFilter`.
2. `/assignments/packs` & `/assignments/packs/$packId`: Loại bỏ hoàn toàn nút và logic "Nhân bản về trung tâm" (`handleCloneSystemPack` / `handleClone`) do hệ thống chạy single-org.
3. `/assignments/packs` & `/assignments/packs/$packId`: Mọi bộ đề (cả Hệ thống và Trung tâm) đều hỗ trợ "Xem chi tiết", "Chỉnh sửa", "Xoá" đối với giáo viên quản lý (`canPublishGrade`), và hỗ trợ "Gán cho lớp" khi ở trạng thái sẵn sàng.
4. Backend API (`PUT /api/study-packs/:id` & `DELETE /api/study-packs/:id`): Mở quyền cho phép giáo viên cập nhật và xoá bộ đề hệ thống (`orgId IS NULL`), đảm bảo tính toàn vẹn dữ liệu (chặn 409 nếu bộ đề đã gán vào lớp).
5. Toàn bộ test suite liên quan (`pnpm --filter server test`, `pnpm --filter web test`), `pnpm check`, `pnpm check-types` đều pass.
6. Xác minh trực quan & lưu ảnh chụp 3 viewport (`1440×900`, `768×1024`, `375×812`) + dark mode vào `plans/reports/`.
7. Review độc lập đạt trạng thái sạch; PR mở vào `develop`, CI quality pass, merge vào `develop` (`--merge --beta`), đăng POT có ảnh permalink SHA và chuyển issue sang `shipped`.

## Phases & File Ownership

| Phase | Owner | Files | Dependencies |
|---|---|---|---|
| Phase 1: Backend API | Orchestrator | `apps/server/src/routes/study-pack.ts`, `apps/server/src/routes/study-pack.test.ts` | None |
| Phase 2: Frontend Web | Orchestrator | `apps/web/src/routes/_auth/assignments/packs/index.tsx`, `apps/web/src/routes/_auth/assignments/packs/$packId.tsx`, `apps/web/src/routes/_auth/assignments/packs/index.test.tsx`, `apps/web/src/routes/_auth/assignments/packs/$packId.test.tsx` | Phase 1 |
| Phase 3: Verification & Screenshots | Orchestrator | `plans/reports/829-study-packs-*.png` | Phase 2 |
| Phase 4: Isolated Code Review | Subagent `code-reviewer` | Read-only across modified files | Phase 3 |
| Phase 5: Ship & POT | Orchestrator | Git commit, push, PR to `develop`, merge, post POT to #829 | Phase 4 |
