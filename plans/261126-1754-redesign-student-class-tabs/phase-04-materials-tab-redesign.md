---
phase: 4
title: "Phase 4: Redesign Tab Tài liệu chung"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 4: Redesign Tab Tài liệu chung

## Goal
Redesign tab **Tài liệu chung** (`ClassMaterialsTab`) theo `open-design/student-classes.html` với thanh tìm kiếm không dấu (debounce ~300ms an toàn chống race, đồng bộ URL), bộ lọc loại (`Tất cả | Tài liệu | Audio – Video | Liên kết`), nhóm theo `kind` thật, nút `"Xem trước"` on-demand (`StudentClassMaterialPreviewButton`) bảo toàn self-heal `403 STUDENT_ORG_MISMATCH` + đóng modal khi logout/đổi org + trả focus `Escape`, đồng thời giữ nguyên `useSyncExternalStore(subscribeActiveStudentOrg, ...)`, inline `<audio>`/`<video>`, link tải nguyên vẹn, và chế độ chỉ đọc tuyệt đối.

## Files to Create / Modify
- Modify: `apps/student/src/components/class/student-material-preview.tsx` (thêm `returnFocusTo?: HTMLElement | null` tùy chọn cho `StudentPreviewDialog` và export `StudentClassMaterialPreviewButton`, giữ nguyên `StudentDocumentPreview`, `StudentClassMaterialPreview` và `StudentInlineMaterialPreview`)
- Modify: `apps/student/src/components/class/class-materials-tab.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx` (truyền `kindFilter`, `query`, `onKindFilterChange`, `onQueryChange` xuống `ClassMaterialsTab` với guard chỉ cập nhật `mq` khi `(prev.tab ?? "journey") === "materials"`)
- Modify: `apps/student/src/components/class/class-materials-tab.test.tsx`

## TDD Structure

### Tests Before
Cập nhật và mở rộng `apps/student/src/components/class/class-materials-tab.test.tsx` trước khi sửa component:
- Giữ nguyên kiểm tra loading (`role="status"`), error + retry (`role="alert"`), 404 → empty (`data-testid="class-materials-empty"`), read-only (0 write controls, 0 `<input type="file">`, giữ chặt regex `/tải lên|chọn từ kho|thêm|sửa|xóa|xoá|gỡ/i` ở trạng thái mặc định, <!-- Updated: Red-Team RT-14 -->), `?org=` reactive trên `<audio>` và link tải (<!-- Updated: Red-Team RT-3 -->).
- Bổ sung & cập nhật cho thiết kế mới:
  - Không tự động gọi fetch `/file` cho PDF khi vừa mount; chỉ gọi `fetchClassMaterialBlobUrl` khi học viên bấm nút `"Xem trước"` (`aria-label="Xem trước <title>"`).
  - Double-click khi đang tải không bắn 2 request; khi bấm `"Xem trước"`, mở portal `role="dialog"` trên `document.body` với `blob-document-view`, nút tải reactive `?org=` trong footer, `Escape` đóng & trả focus chính xác về nút `"Xem trước"` (<!-- Updated: Red-Team RT-8 -->), đóng dialog / unmount / đổi `activeOrgId` (cả đổi sang org khác lẫn `org -> null` khi logout ở tab khác, <!-- Updated: Red-Team RT-2 -->) đều thu hồi `blob:` URL qua `URL.revokeObjectURL`.
  - Khi đang `loading`, `403 STUDENT_ORG_MISMATCH` (`org-stale -> null`) KHÔNG bị effect abort giữa chừng — tự hồi phục và mở dialog thành công ở lần retry (<!-- Updated: Red-Team RT-2 -->); chặn `Content-Type: text/html` (hiển thị `role="alert"` và không gọi `createObjectURL`); abort không tạo alert lỗi giả (<!-- Updated: Red-Team RT-8 -->).
  - Lọc theo loại `Tất cả | Tài liệu | Audio – Video | Liên kết` (`aria-pressed`), nhóm theo 3 nhóm thật (ẩn nhóm rỗng).
  - Tìm kiếm tiếng Việt không dấu (ví dụ `"lo trinh"` khớp `"Lộ trình khóa học"`, `"cambridge"` khớp link host `dictionary.cambridge.org`), nút `"Xóa tìm kiếm"` chỉ hiện khi có query, `aria-live="polite"` thông báo kết quả, debounce ~300ms kèm 3 test chống race (<!-- Updated: Red-Team RT-7 -->: gõ rồi bấm filter không mất filter, gõ rồi unmount trước 300ms không bắn `onQueryChange`, đổi `query` từ URL đồng bộ lại input).
  - Hàng media giữ inline `<audio controls>` / `<video controls>` + nút `"Mở"` + nút `"Tải <title>"`; hàng link hiển thị hostname và `"Mở liên kết"` (`target="_blank" rel="noopener noreferrer"`).

### Refactor
Thêm `StudentClassMaterialPreviewButton` vào `student-material-preview.tsx` và viết lại `ClassMaterialsTab` bằng token `globals.css` (input `border-input text-base md:text-sm`, icon tile 40×40 `bg-muted`, segmented filter `max-w-full flex-wrap` không tràn ngang `320px`, không hex cứng).

### Tests After
Chạy toàn bộ unit tests của `ClassMaterialsTab`, `LessonMaterials`, và `ClassDetailView`.

### Regression Gate
- `pnpm --filter student test -- src/components/class/class-materials-tab.test.tsx src/components/class/lesson-materials.test.tsx src/components/class/class-detail-view.test.tsx`
- `pnpm --filter student exec tsc --noEmit`

## Tasks & Steps

### Task 4.1 — Cập nhật & mở rộng `class-materials-tab.test.tsx` (TDD Red)
- **Goal:** Khóa toàn bộ hợp đồng mới (toolbar tìm kiếm/lọc, nhóm theo `kind`, on-demand preview, 403 self-heal, logout revoke, Escape focus restore, debounce race protection) và toàn bộ hợp đồng bảo mật/media cũ.
- **Target files and symbols:** `apps/student/src/components/class/class-materials-tab.test.tsx`.
- **Steps:**
  1. Cập nhật test PDF (dòng 235–311) để kiểm 3 nhóm `Tài liệu` / `Audio – Video` / `Liên kết`, xác nhận không auto-fetch `/file` trước khi bấm `"Xem trước <title>"`, giữ nguyên guard read-only (0 input file, 0 nút ghi/xóa khớp `/tải lên|chọn từ kho|thêm|sửa|xóa|xoá|gỡ/i` ở trạng thái mặc định).
  2. Cập nhật test dialog (dòng 313–344) bấm nút `"Xem trước Sổ tay học viên"` → mở portal `role="dialog"`, `blob-document-view`, `Escape` trả focus chính xác về `expandBtn` và `URL.revokeObjectURL` khi đóng / unmount / `activeOrgId` đổi sang `null` (logout).
  3. Cập nhật test 403 `STUDENT_ORG_MISMATCH` và test `text/html` Content-Type theo luồng bấm `"Xem trước"`, thêm test double-click không gửi 2 fetch và test unmount giữa lúc đang tải gọi `URL.revokeObjectURL` sau `await` mà không bắn alert lỗi giả.
  4. Thêm test lọc `Tài liệu` / `Audio – Video` / `Liên kết`, nhóm theo loại (ẩn nhóm rỗng), tìm kiếm tiếng Việt không dấu + nút `"Xóa tìm kiếm"`, và 3 test race debounce (chuyển filter trước 300ms, unmount trước 300ms, đồng bộ URL `query` ngược vào input).
  5. Giữ nguyên test `<audio>`/`<video>`, `?org=` reactive (dòng 400–447), và link tải `Tải <title>`.
- **Success criteria:** Test mới fail vì `ClassMaterialsTab` chưa có toolbar/on-demand preview.
- **Verify:** `pnpm --filter student test -- src/components/class/class-materials-tab.test.tsx` exits non-zero (passing is a failure).

### Task 4.2 — Thêm `StudentClassMaterialPreviewButton` vào `student-material-preview.tsx`
- **Goal:** Cung cấp nút `"Xem trước"` on-demand tải blob PDF/ảnh khi bấm, tái sử dụng `StudentPreviewDialog` với bảo vệ đầy đủ 403 self-heal, đóng/revoke khi đổi org hoặc đăng xuất, AbortController, post-await cleanup và trả focus `Escape`.
- **Target files and symbols:** `apps/student/src/components/class/student-material-preview.tsx` (cập nhật `StudentPreviewDialog` nhận optional `returnFocusTo?: HTMLElement | null`, export `StudentClassMaterialPreviewButton`, giữ nguyên `StudentDocumentPreview`, `StudentClassMaterialPreview`, `StudentInlineMaterialPreview`).
- **Steps:**
  1. Trong `StudentPreviewDialog`, thêm prop optional `returnFocusTo?: HTMLElement | null`: khi unmount/close, ưu tiên `returnFocusTo?.focus()` nếu còn gắn DOM, fallback `previouslyFocused.current?.focus()`.
  2. Export `StudentClassMaterialPreviewButton` nhận `{ material: StudentClassMaterialView; classId: string }`.
  3. <!-- Updated: Red-Team RT-2, RT-3, RT-8 --> Gắn `const activeOrgId = useSyncExternalStore(subscribeActiveStudentOrg, getActiveStudentOrgId, getActiveStudentOrgId)` để tính reactive `downloadUrl = classMaterialFileUrl(classId, material.id, true)` cho footer dialog.
  4. Kiểm tra `isPreviewableDocumentMime(material.kind, material.mimeType)`; nếu `null` trả `null`.
  5. Giữ `triggerRef`, `controllerRef`, `blobUrlRef`, `inFlightRef`, `mountedRef`, `orgAtFetchStartRef`:
     - Nút bấm dùng `aria-busy={status === "loading" || undefined}` + chặn click trùng bằng `if (inFlightRef.current) return;` (KHÔNG dùng `disabled` để trình duyệt không tự blur nút trước khi dialog mount).
     - Khi bấm: lưu `orgAtFetchStartRef.current = activeOrgId`, tạo `AbortController`, gọi `fetchClassMaterialBlobUrl(classId, material.id, controller.signal)`.
     - Ngay sau `await`: nếu `controller.signal.aborted || !mountedRef.current` → gọi ngay `URL.revokeObjectURL(nextUrl)` và return.
     - Trong `catch`: bỏ qua khi `controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")`; lỗi khác hiển thị qua `formatStudentMaterialError` trong `role="alert"`.
     - Khi `status === "loading"`: nếu `activeOrgId` đổi sang giá trị KHÁC `null` và khác `orgAtFetchStartRef.current` → abort; bỏ qua duy nhất chuyển đổi `orgAtFetchStartRef -> null` (self-heal 403 tại chỗ).
     - Khi `status === "ready"` (dialog đang mở): đóng dialog và `URL.revokeObjectURL` ngay trên **mọi** thay đổi của `activeOrgId` (gồm cả `org -> null` khi logout từ tab khác), `classId`, `material.id`, đóng dialog, hoặc unmount.
- **Success criteria:** Component biên dịch sạch, không ảnh hưởng `StudentInlineMaterialPreview` hay `LessonMaterials`.
- **Verify:** no verification needed (verified in Task 4.3).

### Task 4.3 — Redesign `ClassMaterialsTab` và nối URL search props ở `ClassDetailView`
- **Goal:** Hoàn thiện giao diện Tab 3 bám sát `open-design/student-classes.html` bằng dữ liệu thật, token v2, `useSyncExternalStore` reactive `?org=`, debounce an toàn và reflow `320px`.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-materials-tab.tsx` (`ClassMaterialsTab`)
  - `apps/student/src/components/class/class-detail-view.tsx`
- **Steps:**
  1. <!-- Updated: Red-Team RT-3 --> Giữ nguyên `useSyncExternalStore(subscribeActiveStudentOrg, getActiveStudentOrgId, getActiveStudentOrgId)` ở đầu `ClassMaterialsTab` để mọi `classMaterialFileUrl` (`<audio>`, `<video>`, download link) phản ứng tức thì khi đổi org.
  2. Thêm props tùy chọn cho `ClassMaterialsTab`: `kindFilter?: MaterialKindFilter`, `onKindFilterChange?: (next: MaterialKindFilter) => void`, `query?: string`, `onQueryChange?: (next: string) => void`.
  3. <!-- Updated: Red-Team RT-7, RT-11 --> Khi có ít nhất 1 tài liệu (`items.length > 0`), render toolbar:
     - Ô tìm kiếm có `<label htmlFor={searchId}>Tìm tài liệu</label>`, icon `Search`, `<input type="search" ... className="... border-input text-base md:text-sm ..." />`, nút xóa nhanh chỉ hiện khi `draft.length > 0`; áp dụng đúng mẫu `PracticeFilters` (`apps/student/src/components/practice/practice-filters.tsx:154-180`): `draft`, `lastEmittedRef`, `onQueryChangeRef`, `useEffect([query])`, và `useEffect` debounce `300ms` kèm `return () => clearTimeout(timer)` (bấm xóa cập nhật ngay lập tức).
     - Segmented filter `role="group" aria-label="Lọc theo loại tài liệu"` dùng `inline-flex max-w-full flex-wrap`: `Tất cả` (`all`), `Tài liệu` (`file`), `Audio – Video` (`media`), `Liên kết` (`link`) với `aria-pressed`.
  4. Lọc client-side bằng `normalizeVietnameseSearch` khớp trên `title`, `description`, `originalName`, và `extractSafeHostname(url)`.
  5. Một vùng `aria-live="polite"` duy nhất thông báo tóm tắt kết quả lọc (khi đang lọc/tìm) hoặc empty state tìm kiếm (`"Không tìm thấy tài liệu khớp “${trimmedDraft}”. Thử từ khóa ngắn hơn hoặc bỏ dấu."` + nút `"Xóa tìm kiếm"`, hoặc `"Lớp chưa có tài liệu thuộc loại này."` + nút `"Xóa bộ lọc"` — chỉ render nút `"Xóa..."` khi thực sự có query/filter đang bật).
  6. Nhóm tài liệu theo `[{ kind: "file", title: "Tài liệu" }, { kind: "media", title: "Audio – Video" }, { kind: "link", title: "Liên kết" }]`, bỏ qua nhóm rỗng; mỗi nhóm có heading `<h3>` + đếm `N mục` (`tabular-nums`) và `<ul className="divide-y rounded-xl border bg-card" aria-label={group.title}>`.
  7. Mỗi hàng `<li data-testid="class-material" data-kind={m.kind}>`:
     - Icon box 40×40 (`size-10 rounded-lg bg-muted text-foreground`, icon `FileText` / `Image` / `Music` / `Video` / `Link2`).
     - Tiêu đề (`font-medium text-foreground break-words`), metadata (`${formatMaterialTypeLabel(m)}` + `formatFileSize(m.sizeBytes)` hoặc `extractSafeHostname(m.url)`), và `description` (nếu có).
     - Hành động bên phải (wrap gọn trên mobile `< 640px`, không tràn `320px`):
       - `link`: `<a href={m.url} target="_blank" rel="noopener noreferrer">` `"Mở liên kết"` (chỉ khi `isSafeMaterialUrl`).
       - `file`: `<StudentClassMaterialPreviewButton>` (nếu PDF/ảnh) + `<a href={downloadUrl}>` với icon `Download` + text `"Tải"` + `<span className="sr-only"> {m.title}</span>` (giữ accessible name `Tải ${m.title}` khớp `class-shared-materials.spec.ts:282`).
       - `media`: link `"Mở"` (`target="_blank" rel="noopener noreferrer"`) + link `"Tải"` (`Tải ${m.title}`), và hàng dưới giữ `<audio controls preload="none" src={fileUrl}>` hoặc `<video controls preload="none" src={fileUrl}>`.
  8. <!-- Updated: Red-Team RT-7 --> Nối props mới trong `ClassDetailView`, trong đó `onMaterialQueryChange` dùng functional updater kiểm tra `(prev.tab ?? "journey") !== "materials"` thì trả nguyên `prev` để timer trễ không bao giờ kéo ngược người dùng về Tab 3.
- **Success criteria:** Toàn bộ unit test `class-materials-tab.test.tsx`, `lesson-materials.test.tsx`, `class-detail-view.test.tsx` và `tsc --noEmit` pass 100%.
- **Verify:** `pnpm --filter student test -- src/components/class/class-materials-tab.test.tsx src/components/class/lesson-materials.test.tsx src/components/class/class-detail-view.test.tsx && pnpm --filter student exec tsc --noEmit` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
