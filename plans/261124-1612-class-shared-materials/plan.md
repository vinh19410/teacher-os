# Plan: Tab "Tài liệu chung" cấp lớp học (Issue #914)

- **Status:** completed
- **Issue:** #914 (`https://github.com/vinh19410/teacher-os/issues/914`)
- **Branch:** `feat/class-shared-materials` (target: `develop` / beta)

## Acceptance criteria (từ Handoff brief đã chốt)

1. Bảng `class_material` + migration Drizzle chạy sạch (FK `class_id` CASCADE, `material_id` NO ACTION) và test migration/FK pass.
2. API giáo viên (`/api/classes/:classId/materials*`) và học viên (`/api/student/classes/:classId/materials*`) cùng logic đếm/chặn xóa `MATERIAL_IN_USE` (`classCount`) pass toàn bộ unit/integration test (phân quyền `canWriteMaterials` / `ta` / enrollment `active`, chống IDOR 404, ẩn cột teacher-only, rollback R2 khi lỗi DB).
3. Tab **"Tài liệu chung"** hoạt động hoàn chỉnh ở `apps/web` (`?tab=materials`, đủ 3 thao tác thêm + gỡ + chế độ chỉ đọc cho `ta`) và `apps/student` (chỉ đọc, xem trước PDF/ảnh, phát audio/video, mở link, tải về, hoạt động cả khi lớp chưa có buổi hoặc đang tạm dừng), pass toàn bộ unit/component test của cả hai app.
4. Các cổng kiểm tra local pass: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, và verify giao diện 3 viewport (`1440×900`, `768×1024`, `375×812`) cả light & dark mode theo `DESIGN.md` / `REVIEW.md`.
5. Review độc lập ở sub-session tách biệt không còn lỗi blocking; PR vào `develop` được mở, CI pass, merge thành công (`--merge --beta`); issue #914 chuyển nhãn tới `shipped` và có comment POT đầy đủ bằng chứng + screenshot permalink.

## Phases & File Ownership

### Phase 1 — DB Schema, Migration, API Contracts & Server Routes (Sequential foundation)
- **Owned files:**
  - `packages/db/src/schema/material.ts` (thêm `classMaterial` table)
  - `packages/db/src/migrations/**` (sinh migration mới qua `pnpm --filter @teacher-os/db db:generate`)
  - `packages/api/src/material-contracts.ts` & `packages/api/src/material-contracts.test.ts`
  - `apps/server/src/routes/materials.ts` & `apps/server/src/routes/materials.test.ts`
  - `apps/server/src/routes/student-materials.ts`
  - `apps/server/src/class-material-migration.test.ts` (hoặc test trong `materials.test.ts`)
- **Details:**
  - Table `class_material`: `org_id` (FK `organization.id` CASCADE), `class_id` (FK `class.id` CASCADE), `material_id` (FK `material.id` NO ACTION), `position` (integer default 0), `created_at` (timestamp_ms). PK `(class_id, material_id)`, indexes `class_material_material_idx(material_id)`, `class_material_org_idx(org_id)`.
  - Contracts (`packages/api/src/material-contracts.ts`):
    - Giữ nguyên `usageCount: number` (số buổi gắn); thêm `classUsageCount?: number` trên `MaterialView` (server luôn trả số nguyên).
    - Thêm `ClassMaterialView` (alias/extends `MaterialView` với `position: number; attachedAt: string`), `StudentClassMaterialView` (same safe projection as `StudentLessonMaterialView`), `ClassMaterialListResponse`, `StudentClassMaterialListResponse`.
    - Thêm `classMaterialAttachSchema` (dùng chung shape `{ materialId }`) và `classMaterialLinkCreateSchema` (`title`, `description`, `url` — strict, không cần `folderId`).
  - Teacher routes (`apps/server/src/routes/materials.ts`):
    - Mount `gate` trên `/classes/:classId/materials` và `/classes/:classId/materials/*`.
    - `GET /classes/:classId/materials` → `{ items: ClassMaterialView[] }` (sort `position, createdAt, material.id`; `404 CLASS_NOT_FOUND` nếu sai lớp/org).
    - `POST /classes/:classId/materials` → gắn `materialId` có sẵn trong org (`409 ALREADY_ATTACHED`, `404 MATERIAL_NOT_FOUND`, `404 CLASS_NOT_FOUND`).
    - `PUT /classes/:classId/materials/files` → tái dùng `storeUpload`, `db.batch` tạo `material` (`folderId: null`) + `class_material`, lỗi DB thì `upload.discard()`.
    - `POST /classes/:classId/materials/links` → `db.batch` tạo `material` (`kind: "link"`, `folderId: null`) + `class_material`.
    - `DELETE /classes/:classId/materials/:materialId` → gỡ khỏi `class_material` (`404 NOT_ATTACHED`, không xóa khỏi bảng `material`).
    - Cập nhật `materialUsage()` trả `{ sessionCount, syllabusCount, classCount }`, `DELETE /materials/:id` chặn 409 `MATERIAL_IN_USE` khi bất kỳ bộ đếm nào > 0 và trả `{ sessionCount, syllabusCount, classCount }`.
    - Cập nhật `toMaterialView` + query `loadMaterial` / `GET /materials` để trả thêm `classUsageCount`.
  - Student routes (`apps/server/src/routes/student-materials.ts`):
    - Mount `requireStudent` trên `/classes/:classId/materials` và `/classes/:classId/materials/*`.
    - `resolveClass`: kiểm `enrollment` (`orgId`, `studentId = me.id`, `classId`, `status = 'active'`) — không yêu cầu dòng `lesson`, hoạt động cả lớp chưa có buổi và lớp `paused`. Không khớp → 404.
    - `GET /classes/:classId/materials` → `{ items: StudentClassMaterialView[] }` (projection an toàn, sort `position, createdAt, material.id`).
    - `GET /classes/:classId/materials/:materialId/file` → kiểm `resolveClass` + tồn tại dòng `class_material`, stream R2 qua `materialFileResponse` hỗ trợ `Range` và `?download=1`, thiếu store → 503 `MATERIALS_DISABLED`, thiếu liên kết/objectKey → 404.

### Phase 2A — Teacher Web UI (`apps/web`, Parallel with 2B after Phase 1)
- **Owned files:**
  - `apps/web/src/lib/repos/materials.ts` & `apps/web/src/lib/repos/materials.test.ts`
  - `apps/web/src/components/class-detail/class-shared-materials-tab.tsx` (new)
  - `apps/web/src/components/class-detail/class-shared-materials-tab.test.tsx` (new)
  - `apps/web/src/routes/_auth/classes/$classId.tsx` & `apps/web/src/routes/_auth/classes/$classId.test.tsx`
  - `apps/web/src/routes/_auth/materials/index.tsx` & `apps/web/src/routes/_auth/materials/index.test.tsx`
  - `apps/web/src/test/materials-harness.ts` (nếu cần cập nhật helper mock)
- **Details:**
  - Repo (`materials.ts`): thêm `classMaterialsQueryKey(classId)`, `fetchClassMaterials`, `attachClassMaterial`, `uploadClassMaterial`, `createClassMaterialLink`, `detachClassMaterial`; cập nhật `MaterialRequestError` giữ `classCount`, cập nhật `materialErrorMessage` xử lý `MATERIAL_IN_USE` có `classCount` (giữ nguyên nguyên văn thông điệp cũ khi `classCount === 0` để tương thích E2E!) và thông điệp `ALREADY_ATTACHED`/`NOT_ATTACHED` tự nhiên cho cả buổi và lớp (hoặc không làm hỏng test cũ).
  - Component `ClassSharedMaterialsTab`:
    - Khi `canWriteMaterials`: 3 nút **Chọn từ kho tài liệu**, **Tải file lên** (1-step file input giống `SessionMaterialsModal`), **Thêm liên kết** (modal nhập tiêu đề, URL http/https, mô tả không bắt buộc) + dòng hướng dẫn `UPLOAD_HELP`.
    - Modal **Chọn từ kho tài liệu** tái dùng `MaterialBankBrowser` (`selectedIds = attachedIds`, `onPick => attach.mutate(ref.id)`).
    - Danh sách tài liệu dùng `MaterialItem` + `MaterialInlinePreview` + `MaterialOpenActions` + nút **Gỡ** (khi `canWriteMaterials`).
    - Với `ta`: ẩn nút thêm và nút gỡ, chỉ giữ chế độ đọc.
    - Invalidate `materialsAllQueryKey` sau khi gắn/tải/thêm link/gỡ để Ngân hàng tài liệu cập nhật ngay `classUsageCount`.
  - Route `$classId.tsx`: thêm `"materials"` vào `CLASS_DETAIL_TABS` với nhãn `"Tài liệu chung"` đặt ngay sau `"Giáo trình"`, render `<ClassSharedMaterialsTab classId={cls.id} />`.
  - Trang `/materials` (`materials/index.tsx`): hiển thị thêm badge `Dùng ở N lớp` khi `(item.classUsageCount ?? 0) > 0` (giữ nguyên `Dùng ở M buổi` khi `usageCount > 0`, chỉ hiện `Chưa dùng ở buổi/lớp nào` hoặc `Chưa dùng` — kiểm kỹ test `materials/index.test.tsx` để không làm vỡ assertion cũ).

### Phase 2B — Student Portal UI (`apps/student`, Parallel with 2A after Phase 1)
- **Owned files:**
  - `apps/student/src/lib/repos/student.ts`
  - `apps/student/src/components/class/student-material-preview.tsx`
  - `apps/student/src/components/class/lesson-materials.tsx` & `apps/student/src/components/class/lesson-materials.test.tsx`
  - `apps/student/src/components/class/class-materials-tab.tsx` (new)
  - `apps/student/src/components/class/class-materials-tab.test.tsx` (new)
  - `apps/student/src/components/class/class-detail-view.tsx` & `apps/student/src/components/class/class-detail-view.test.tsx`
- **Details:**
  - Repo (`student.ts`): trích helper nội bộ `fetchStudentMaterialBlobUrl(url, signal)` dùng chung cho cả `fetchLessonMaterialBlobUrl` và `fetchClassMaterialBlobUrl(classId, materialId, signal)`; thêm `classMaterialFileUrl(classId, materialId, download)`, `fetchClassMaterials(classId)`, `useClassMaterials(classId, enabled)`.
  - Tách / tham số hóa `StudentInlineMaterialPreview` (hỗ trợ cả props URL/loader chung lẫn backward-compatible props `classId + date` cho buổi học) và `StudentMaterialRow` để tái dùng 100% giữa `LessonMaterials` và `ClassMaterialsTab`.
  - Tạo `ClassMaterialsTab`: hiển thị loading / error (kèm nút Thử lại) / empty / danh sách chỉ đọc (xem trước PDF/ảnh nội tuyến + modal phóng to, audio/video player, mở link, tải về).
  - Cập nhật `ClassDetailView`: thêm `{ id: "materials", label: "Tài liệu chung" }` vào `CLASS_TABS` ngay sau `syllabus`, render `<ClassMaterialsTab classId={cls.id} />` khi `tab === "materials"`.

### Phase 3 — Integration, Local Gates, 3-Viewport UI Verification, Isolated Review & Beta Ship
- Merge Phase 2A & 2B tuần tự vào `feat/class-shared-materials`, chạy `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- Khởi chạy local stack (`boot:api` + web + student), kiểm chứng & chụp ảnh 3 viewport (`1440×900`, `768×1024`, `375×812`) cả light & dark mode, lưu vào `plans/reports/914-*.png`, kiểm tra bằng mắt qua vision và tắt sạch toàn bộ tiến trình dev.
- Chuyển nhãn issue #914 sang `in review`, chạy review độc lập (`code-reviewer`), khắc phục mọi blocking finding và re-review đến khi sạch.
- Dọn file preview tạm không cần thiết, commit & push, mở PR vào `develop`, chuyển nhãn `done`, chờ CI pass + chạy review/merge (`--merge --beta`), chuyển nhãn `shipped` và đăng POT comment đầy đủ bằng chứng + screenshot permalink lên issue #914.
