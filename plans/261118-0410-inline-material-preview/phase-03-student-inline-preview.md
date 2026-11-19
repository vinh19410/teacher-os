---
phase: 3
title: "Student Inline Material Preview & Gates"
status: todo
priority: P1
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: Student Inline Material Preview & Gates

## Goal

Bổ sung xem trước inline cho tài liệu PDF và ảnh (`PNG`/`JPG`/`WEBP`) trong mục «Tài liệu» của buổi học ở `apps/student` (bao gồm nút «Mở rộng ${title}» mở dialog portal `document.body` focus-trapped, tự hồi phục `401`/`403 ORG_MISMATCH`, và thông điệp lỗi tiếng Việt), bổ sung `Content-Security-Policy` cho `apps/student/src/worker.ts`, giữ nguyên link/audio/video/Office, và chạy toàn bộ gate kiểm tra của monorepo.

## Files to Create / Modify

- Modify: `apps/student/src/worker.ts`, `apps/student/src/worker.test.ts` — bổ sung `Content-Security-Policy` cho `apps/student` (bỏ qua trên localhost giống `apps/web/src/security-headers.ts` để giữ Vite HMR, bật trên prod/staging với `script-src 'self' https://static.cloudflareinsights.com`, `worker-src 'self'`, `img-src 'self' data: blob: https:`, `media-src 'self' blob: ${crossOrigin}`, `connect-src 'self' blob: ${crossOrigin}`, `object-src 'none'`, `frame-ancestors 'none'`).
- Modify: `apps/student/src/lib/repos/student.ts` — thêm `fetchLessonMaterialBlobUrl(classId, date, materialId, signal?)` gọi `fetch` với `credentials: "include"` và `getStudentHeaders({ Accept: "*/*" })`, tự xử lý `403 STUDENT_ERROR_CODES.ORG_MISMATCH` (xóa `active_student_org_id` + invalidate `["student", "orgs"]` + retry 1 lần giống `fetchAssignmentAudioObjectUrl`), xử lý `401 -> reauth()`, kiểm tra `isPreviewableContentType(res.headers.get("Content-Type"))` trước `URL.createObjectURL(blob)`.
- Create: `apps/student/src/components/class/student-material-preview.tsx` — component `StudentInlineMaterialPreview` dùng `InlineDocumentPreview` (với `requestKey={`${activeOrgId ?? ""}:${classId}:${date}:${material.id}`}` và hàm map `HttpError` sang tiếng Việt cho 404/403/503/mạng), kèm overlay modal dùng `createPortal(..., document.body)` (thoát stacking context `opacity-60` của buổi tương lai trong `ClassLessonList`), focus vào dialog khi mở, lắng nghe `Escape` và Tab trap ở `document`, khôi phục focus về nút trigger khi đóng, và giữ link «Tải» + nút «Đóng».
- Modify: `apps/student/src/components/class/class-lesson-list.tsx` — đổi `grid-cols-[2rem_1fr]` thành `grid-cols-[2rem_minmax(0,1fr)]` và thêm `min-w-0` vào container nội dung buổi học để preview canvas/ảnh không làm tràn ngang viewport 375px.
- Modify: `apps/student/src/components/class/lesson-materials.tsx` — thêm `min-w-0` cho `<li>` và wrapper disclosure; render `<StudentInlineMaterialPreview>` inline ngay dưới header row của `MaterialRow` (cùng vị trí với `<video>`/`<audio>`) khi `isPreviewableDocumentMime(material.kind, material.mimeType)` khác `null`.
- Modify: `apps/student/src/components/class/lesson-materials.test.tsx` — mock `@teacher-os/ui/components/document-preview/blob-document-view` + stub `URL.createObjectURL`/`revokeObjectURL` + định tuyến URL `/file` trong `stubFetch`; bổ sung test: PDF/ảnh render inline (gửi `credentials: "include"` + `x-student-org-id`), 403 `ORG_MISMATCH` tự retry, lỗi 404/503 hiện thông điệp tiếng Việt trong `role="alert"` và giữ nút «Tải», DOCX/link/media không render inline preview, nút «Mở rộng» portal ra `document.body` + Escape đóng + khôi phục focus, unmount revoke blob URL.

<!-- Updated: Red Team Session 2026-11-18 - Applied Findings 2, 3, 4, 6, 7, 8, 9, 10 -->

## Tests Before (TDD)

1. `worker.test.ts`: production request trả `Content-Security-Policy` có `worker-src 'self'`, `object-src 'none'`, `blob:` trong `connect-src`/`img-src`/`media-src`; localhost bỏ qua CSP để không chặn Vite HMR.
2. `lesson-materials.test.tsx`: với tài liệu PDF hoặc PNG, `MaterialRow` render inline preview và gọi `fetch` tới `/api/student/classes/.../materials/.../file` với `credentials: "include"`, `Accept: "*/*"`, và `x-student-org-id` nếu có active org; nếu trả `403 STUDENT_ORG_MISMATCH` thì tự clear org stale và retry thành công.
3. `lesson-materials.test.tsx`: với DOCX/XLSX, `link`, `media` (audio/video), không render `InlineDocumentPreview` và giữ nguyên «Tải» / «Mở» / `<audio>` / `<video>`.
4. `lesson-materials.test.tsx`: bấm «Mở rộng Đề cương» mở `role="dialog"` trong `document.body` (không nằm trong `<li>` `opacity-60`); nhấn `Escape` đóng dialog và trả focus về nút trigger; unmount component gọi `URL.revokeObjectURL`.
5. `lesson-materials.test.tsx`: fetch file lỗi (404/503) hoặc trả `Content-Type: text/html` hiện `role="alert"` tiếng Việt nhưng vẫn giữ nút «Tải».

## Implementation Steps

1. Thêm tests trước vào `apps/student/src/worker.test.ts` và `apps/student/src/components/class/lesson-materials.test.tsx`.
2. Cập nhật `apps/student/src/worker.ts` bổ sung `Content-Security-Policy` (tương thích localhost dev & production API origin).
3. Thêm `fetchLessonMaterialBlobUrl` vào `apps/student/src/lib/repos/student.ts` (kèm `401` `reauth()`, `403 ORG_MISMATCH` self-heal, và `isPreviewableContentType` guard).
4. Tạo `apps/student/src/components/class/student-material-preview.tsx` (dùng `createPortal(..., document.body)` + focus trap/restore + `document` Escape) và tích hợp vào `MaterialRow` trong `lesson-materials.tsx` + sửa `minmax(0,1fr)` ở `class-lesson-list.tsx`.
5. Chạy toàn bộ test unit (`packages/ui`, `apps/web`, `apps/student`), `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter web build`, `pnpm --filter student build`, và chạy E2E lẻ `material-preview.spec.ts` (với port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`) kèm ảnh chụp 3 viewport.

## Verification

- `pnpm --filter student test`
- `pnpm --filter student check-types`
- `pnpm --filter student build`
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/ui test && pnpm --filter web test`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e material-preview.spec.ts`
