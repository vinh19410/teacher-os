---
phase: 3
title: "Phase 3: Web TA Read-Only Surfaces & Verification"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: Web TA Read-Only Surfaces & Verification

<!-- Updated: Red Team Session 1 - MaterialBankBrowser depth clamp + TA empty copy, materials-harness snapshot override, mocked router folderId setup, 3-site activeView & dialog state reset -->

## Goal

Ẩn toàn bộ nút ghi/upload/sửa/xóa và đóng cổng dialog ghi khi `viewer.role = "ta"` trên cả 3 bề mặt web (`/materials`, `SessionMaterialsModal`, `MaterialPicker` + `MaterialBankBrowser`), kẹp thụt lề `FolderPanel` và `MaterialBankBrowser`, bổ sung đầy đủ unit test và kiểm chứng trực quan trên 3 viewport light/dark cùng các cổng chất lượng của repo.

## Files to Create / Modify

- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/lib/repos/materials.ts`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/routes/_auth/materials/index.tsx`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/routes/_auth/materials/index.test.tsx`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/class-detail/session-materials-modal.tsx`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/class-detail/session-materials-modal.test.tsx`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/materials/material-picker.tsx`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/materials/material-picker.test.tsx`
- Modify: `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/test/materials-harness.ts`

## Tasks & Steps

### Task 3.1 — Viết unit test đỏ cho chế độ chỉ đọc của `ta` và gỡ chu trình `FolderDialog` trên 3 bề mặt Web UI (TDD Red)
- **Goal:** Khóa kỳ vọng hành vi giao diện cho `viewer.role = "ta"` (và trường hợp di chuyển thư mục dính vòng ở `/materials`) trước khi sửa component.
- **Target files and symbols:**
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/test/materials-harness.ts` (`startMaterialsBankServer`)
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/routes/_auth/materials/index.test.tsx`
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/class-detail/session-materials-modal.test.tsx`
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/components/materials/material-picker.test.tsx`
- **Steps:**
  1. Trong `apps/web/src/test/materials-harness.ts`: mở rộng chữ ký `startMaterialsBankServer(items = [bankMaterialRow], snapshot = snapshotFixture())` để truyền `snapshot` vào `startKernelServer(snapshot, ...)` (mặc định giữ nguyên cho các test cũ).
  2. Trong `apps/web/src/routes/_auth/materials/index.test.tsx`:
     - Cho phép `renderRoute` nhận tham số thứ 3 `options?: { role?: string; folders?: MaterialFolderView[] }` (khi có `options?.role`, gọi `client.setQueryData(kernelQueryKey, { viewer: { role: options.role, canAccessFinance: false } })` trên `QueryClient`; khi có `options?.folders`, trả `options.folders` cho `GET /api/materials/folders`).
     - Thêm test `"hides all write actions and shows read-only empty copy when viewer role is ta (#646)"`:
       - Đặt `mockSearch.current = { folderId: "f-1" }` rồi `renderRoute([material({ folderId: "f-1" })], undefined, { role: "ta" })`: xác nhận KHÔNG có các nút `Thêm liên kết`, `Tải file lên`, `Thư mục mới`, `Đổi tên`, `Di chuyển`, `Xóa thư mục`, `Sửa Đề Writing Task 1`, `Xóa Đề Writing Task 1`, nhưng vẫn có nút `Tải xuống Đề Writing Task 1` và cây thư mục.
       - Render ngân hàng rỗng với `mockSearch.current = {}` và `{ role: "ta" }`: xác nhận `materials-empty` hiển thị câu chỉ đọc trung tính và không có nút `Thêm liên kết` / `Tải file lên`.
     - Thêm test `"renders cyclic folders at root and moves a cyclic folder to root in one save (#646)"`: đặt trước `mockSearch.current = { folderId: "x" }` (vì `mockNavigate` trong `index.test.tsx` không tự sửa `mockSearch.current`), truyền 2 thư mục chu trình `[{ id: "x", parentId: "y", name: "X", ... }, { id: "y", parentId: "x", name: "Y", ... }]` và handler `PATCH /api/materials/folders/x` trả `200`; xác nhận cả `"X"` và `"Y"` xuất hiện trong `<nav aria-label="Thư mục tài liệu">`, bấm `"Di chuyển"`, bấm `"Lưu"` ngay (không đổi `<select>`) và assert request `PATCH /api/materials/folders/x` có body `{ parentId: null }`.
  3. Trong `apps/web/src/components/class-detail/session-materials-modal.test.tsx`:
     - Mở rộng `startSessionServer(body, role = "teacher")` truyền `snapshotFixture({ viewer: { role, canAccessFinance: false } })`.
     - Thêm test `"hides attach, upload, and detach controls for ta while keeping open actions and curriculum list (#646)"` và test trạng thái rỗng của `ta` hiển thị đúng `"Chưa có tài liệu nào cho buổi này."` (không có câu gợi ý chọn/tải file).
  4. Trong `apps/web/src/components/materials/material-picker.test.tsx`:
     - Thêm test `"hides bank file upload for ta while keeping bank browser and chip selection (#646)"` dùng `startMaterialsBankServer([bankMaterialRow], snapshotFixture({ viewer: { role: "ta", canAccessFinance: false } }))`: xác nhận không có nút `Tải file lên` và không có `<input type="file">`, vẫn bấm được `Chọn từ ngân hàng`, chọn tài liệu và bấm `Gỡ ...` trên chip; đồng thời kiểm tra khi ngân hàng trống (`startMaterialsBankServer([], snapshotFixture({ viewer: { role: "ta", canAccessFinance: false } }))`), modal duyệt hiển thị câu trung tính không nhắc `"Tải lên mới"` hay thêm ở trang Tài liệu.
- **Success criteria:** Cả 3 file test đều thất bại ở các assertion ẩn nút/thông điệp của `ta` (vì UI hiện vẫn render đầy đủ nút ghi).
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/materials/index.test.tsx src/components/class-detail/session-materials-modal.test.tsx src/components/materials/material-picker.test.tsx` exits non-zero with assertion failures on `ta` tests (passing test ở bước này là lỗi).

### Task 3.2 — Thêm `useCanWriteMaterials()` và cập nhật 3 bề mặt UI (TDD Green)
- **Goal:** Đọc `viewer.role` an toàn từ cache `kernelQueryKey` (tự cập nhật khi snapshot refetch, an toàn SSR/`renderToStaticMarkup`) và ẩn toàn bộ nút/hộp thoại ghi khi `!canWrite`.
- **Target files and symbols:**
  - `/root/projects/worktrees/teacher-os-646-materials-folder-race-and-rbac/apps/web/src/lib/repos/materials.ts` (`useCanWriteMaterials`)
  1. Trong `apps/web/src/lib/repos/materials.ts`: import `useQueryClient` từ `@tanstack/react-query`, `useCallback` và `useSyncExternalStore` từ `react`, `canWriteMaterials` từ `@teacher-os/auth/role`, và `kernelQueryKey` từ `./kernel`. Xuất `export function useCanWriteMaterials(): boolean` bọc `const subscribe = useCallback((onStoreChange: () => void) => queryClient.getQueryCache().subscribe(onStoreChange), [queryClient]);`, dùng `useSyncExternalStore(subscribe, () => queryClient.getQueryData<{ viewer?: { role?: string } }>(kernelQueryKey)?.viewer?.role ?? "teacher", () => "teacher")` và trả về `canWriteMaterials(role)`.
  2. Trong `apps/web/src/routes/_auth/materials/index.tsx`:
     - Gọi `const canWrite = useCanWriteMaterials();` trong `MaterialsRoute`, thêm `useEffect(() => { if (!canWrite) setDialog(null); }, [canWrite]);`, và truyền `canWrite` xuống `FolderPanel`.
     - `PageHead`: đặt `action={canWrite ? (...) : undefined}`.
     - Empty state không bộ lọc: khi `!canWrite`, hiển thị câu dẫn trung tính `"Ngân hàng tài liệu của trung tâm hiện chưa có học liệu nào."` và ẩn cụm nút `Thêm liên kết` / `Tải file lên`.
     - `MaterialItem` `actions`: chỉ render nút `Sửa` và `Xóa` khi `canWrite` (giữ `MaterialOpenActions`).
     - Các hộp thoại ghi cuối `MaterialsRoute` (`folder`, `link`, `upload`, `edit`, `delete`): bọc trong `{canWrite && ...}`.
     - Trong `FolderPanel`: chỉ render nút `Thư mục mới` và `<fieldset>` (`Đổi tên`, `Di chuyển`, `Xóa thư mục`) khi `canWrite`; ở thông báo `folders.length === 0`, khi `!canWrite` hiển thị `"Chưa có thư mục."`; ở `style={{ paddingLeft }}`, kẹp `Math.min(depth, MATERIAL_FOLDER_MAX_DEPTH - 1)` (import `MATERIAL_FOLDER_MAX_DEPTH` từ `@teacher-os/api/material-contracts`).
  3. Trong `apps/web/src/components/class-detail/session-materials-modal.tsx`:
     - Gọi `const canWrite = useCanWriteMaterials();`, thêm `useEffect(() => { if (!canWrite) { setView("list"); setError(null); } }, [canWrite]);` và đặt `const activeView = canWrite ? view : "list";`; thay toàn bộ 3 chỗ kiểm tra `view` (`title`, `footer`, và thân modal) bằng `activeView`.
     - Chỉ render cụm nút `Chọn từ ngân hàng` + `Tải lên mới` + `<input type="file">` và dòng hướng dẫn `UPLOAD_HELP` khi `canWrite`.
     - Ở trạng thái rỗng (`items.length === 0 && curriculum.length === 0`): khi `!canWrite`, hiển thị `"Chưa có tài liệu nào cho buổi này."` (giữ câu cũ khi `canWrite`).
     - Trên từng dòng `items`: chỉ render nút `Gỡ` khi `canWrite` (giữ `MaterialOpenActions` và danh sách `Từ giáo trình`).
  4. Trong `apps/web/src/components/materials/material-picker.tsx`:
     - Import `MATERIAL_FOLDER_MAX_DEPTH` từ `@teacher-os/api/material-contracts` và `useCanWriteMaterials` từ `@/lib/repos/materials`.
     - Trong `MaterialBankBrowser`: gọi `const canWrite = useCanWriteMaterials();`; kẹp `const clampedDepth = Math.min(depth, MATERIAL_FOLDER_MAX_DEPTH - 1)` với `"\u00a0\u00a0".repeat(clampedDepth)` trên `<option>` thư mục; khi ngân hàng trống không bộ lọc và `!canWrite`, hiển thị `"Ngân hàng tài liệu của trung tâm hiện chưa có học liệu nào."` thay vì câu nhắc tải lên.
     - Trong `MaterialPicker`: gọi `const canWrite = useCanWriteMaterials();`; giữ nút `Chọn từ ngân hàng` và thao tác gỡ chip `×`; chỉ render nút `Tải file lên` và `<input type="file">` khi `canWrite`; với đoạn hướng dẫn dưới nút, khi `!canWrite` chỉ render `<p>` nếu `atCap` đang bật (`"Tối đa ... tài liệu cho một buổi/bài — gỡ bớt để chọn thêm."`), ẩn hoàn toàn câu `UPLOAD_HELP`.
- **Success criteria:** Toàn bộ test của 3 bề mặt web và toàn suite `web` pass.
- **Verify:** `pnpm --filter web exec vitest run src/routes/_auth/materials/index.test.tsx src/components/class-detail/session-materials-modal.test.tsx src/components/materials/material-picker.test.tsx` exits 0 and prints `passed`.

### Task 3.3 — Chạy toàn bộ cổng chất lượng local & kiểm chứng trực quan 3 viewport (Light/Dark)
- **Goal:** Xác nhận không có lỗi lint/type/test/design-compare và chụp bằng chứng POT trên 3 viewport (`1440×900`, `768×1024`, `375×812`) ở cả light và dark cho giao diện `ta`.
- **Target files and symbols:** Toàn bộ workspace (`@teacher-os/auth`, `server`, `web`), `plans/reports/646-*.png`.
- **Steps:**
  1. Chạy `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter @teacher-os/auth test`, `pnpm --filter server test`, `pnpm --filter web test`.
  2. Chạy `pnpm design:compare` theo quy định `REVIEW.md` cho PR đụng UI.
  3. Khởi động stack local trên port cô lập, đăng nhập tài khoản `ta` được seed trong org, mở `/materials` và modal tài liệu buổi học ở vai trò `ta` trên 3 viewport `1440×900`, `768×1024`, `375×812` (light + dark), kiểm tra không tràn ngang (kể cả 320px), không còn nút ghi, focus ring rõ ràng, và lưu ảnh chụp vào `plans/reports/646-ta-materials-*.png`.
- **Success criteria:** Tất cả các lệnh kiểm tra trả exit code 0 và bộ ảnh screenshot POT được lưu đầy đủ trong `plans/reports/`.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/auth test && pnpm --filter server test && pnpm --filter web test && pnpm design:compare` exits 0.

## Todo

- [ ] Viết unit test đỏ cho `viewer.role = "ta"` trên `/materials`, `SessionMaterialsModal`, `MaterialPicker`/`MaterialBankBrowser` và test gỡ chu trình `FolderDialog`
- [ ] Cài đặt `useCanWriteMaterials()` và ẩn nút/hộp thoại ghi trên cả 3 bề mặt UI + kẹp `depth` ở `FolderPanel` & `MaterialBankBrowser`
- [ ] Chạy đủ cổng `biome check`, `check-types`, `test`, `design:compare` và chụp screenshot 3 viewport (light/dark) cho POT

## Verification

- `pnpm exec biome check .` exits 0.
- `pnpm check-types` exits 0.
- `pnpm --filter @teacher-os/auth test && pnpm --filter server test && pnpm --filter web test` exits 0.
- `pnpm design:compare` exits 0.

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
