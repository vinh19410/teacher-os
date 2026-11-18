---
title: "Inline Document Preview (PDF & Image) in Web & Student"
description: "Render inline preview of PDF and image materials directly inside material cards in apps/web and apps/student, with IntersectionObserver lazy-loading and an optional expand modal."
status: completed
priority: P1
effort: "4h"
tags: [materials, preview, web, student, pdfjs, ui]
created: 2026-11-18
---

# Inline Document Preview (PDF & Image) in Web & Student

## Outcome

Giáo viên (`apps/web`: `/materials` và modal «Tài liệu buổi …`) và học viên (`apps/student`: mục «Tài liệu» của buổi học) xem được **nội dung xem trước inline ngay trong từng item tài liệu** cho các file PDF và ảnh (`PNG`/`JPG`/`WEBP`), thay vì chỉ hiện nút «Xem trước» mở modal. Các file được lazy-load theo viewport (`IntersectionObserver`, giữ placeholder có chiều cao cố định `min-h-48`, giới hạn song song tối đa 3 request, và file >10 MiB cần 1 cú click tải inline ngay tại chỗ để tránh ngốn RAM/băng thông), kèm nút «Mở rộng ${title}» để đọc toàn khung khi cần. Các loại tài liệu khác (`DOCX`/`PPTX`/`XLSX`, liên kết, audio/video) giữ nguyên hành vi hiện có.

## Scope & Constraints

- **Apps áp dụng:** `apps/web` (`/materials`, `SessionMaterialsModal` cả danh sách gắn trực tiếp & «Từ giáo trình») và `apps/student` (`LessonMaterials` trong `ClassLessonList`). Không nhúng inline preview vào `MaterialBankBrowser` (picker chọn tài liệu) để giữ danh sách chọn gọn nhẹ.
- **Định dạng xem trước:** `application/pdf`, `image/png`, `image/jpeg`, `image/webp`. Không thay đổi server attachment headers (`material-file-response.ts`); client fetch với `credentials: "include"`, xác thực lại `Content-Type` của response thuộc allowlist trước `URL.createObjectURL`, và revoke khi unmount/đổi `requestKey`. `pdfjsLib.getDocument` tắt `isEvalSupported: false` và kẹp kích thước canvas tối đa để chống OOM.
- **Màn hình không đổi:** `SourceDocumentViewer` (`apps/web/src/components/exam-import/source-document-viewer.tsx`) giữ nguyên nhãn, DOM và hành vi cho màn import đề.
- **CSP:** `apps/web` đã có `blob:` trong `connect-src` và `img-src` (`apps/web/src/security-headers.ts`); bổ sung `Content-Security-Policy` cho `apps/student/src/worker.ts` (bỏ qua trên localhost giống web, mở `blob:` cho `connect-src`/`img-src`/`media-src`, `script-src 'self'`, `worker-src 'self'`, `object-src 'none'`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Dùng chung `BlobDocumentView` + `InlineDocumentPreview` trong `@teacher-os/ui` với lazy-load viewport, kiểm soát MIME/eval/canvas/concurrency và vòng đời blob URL ổn định theo `requestKey` | P1 |
| 2 | Thay nút «Xem trước» mặc định ở `apps/web` (cả `/materials` và 2 danh sách của `SessionMaterialsModal`) bằng khung preview inline trong `MaterialItem` + nút «Mở rộng» tái sử dụng blob URL | P1 |
| 3 | Bổ sung preview inline PDF/ảnh (kèm nút «Mở rộng» portal `document.body`, xử lý `401` `reauth()` / `403 ORG_MISMATCH`, và CSP worker) vào `apps/student` | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Shared Inline Preview Core in @teacher-os/ui](./phase-01-start.md) | Pending |
| 2 | [Web Inline Material Preview](./phase-02-web-inline-preview.md) | Pending |
| 3 | [Student Inline Material Preview & Gates](./phase-03-student-inline-preview.md) | Pending |

## Dependencies

- `pdfjs-dist` (`^6.4.299`, đã có trong `pnpm-lock.yaml`) — khai báo thêm cho `@teacher-os/ui` và `student`.
- Giữ nguyên contract `@teacher-os/api/material-contracts` và routes `/api/materials/:id/file`, `/api/student/classes/:classId/sessions/:date/materials/:materialId/file`.

## Success Criteria

- [ ] PDF/PNG/JPG/WEBP ở `/materials`, `SessionMaterialsModal` (direct + từ giáo trình) và `apps/student` `LessonMaterials` tự hiển thị preview inline khi vào viewport (`IntersectionObserver`, file >10 MiB có nút tải inline tại chỗ), có khung giới hạn chiều cao không tràn ngang mobile `375×812` + nút «Mở rộng ${title}» và giữ nút «Tải xuống» / «Tải».
- [ ] `MaterialBankBrowser` (picker) không render inline preview nặng; `SourceDocumentViewer` (exam import) giữ nguyên hành vi; `SessionMaterialsModal` không còn nút «Xem trước» cũ.
- [ ] DOCX/PPTX/XLSX, liên kết và audio/video giữ nguyên hành vi cũ (không render document preview và không để khoảng trống thừa trong `MaterialItem`).
- [ ] Blob URL bị abort nếu unmount/đóng giữa chừng và luôn `URL.revokeObjectURL` khi dọn dẹp; nút «Mở rộng» tái sử dụng blob URL qua `renderExpandedModal` khi `state.status === "ready"`, không fetch lại và không Use-After-Revoke.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, unit tests (`packages/ui`, `apps/web`, `apps/student`) và E2E lẻ `material-preview.spec.ts` pass.

## Red Team Review

### Session — 2026-11-18
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Contract Verifier), Assumption Destroyer (Fact Checker)
**Findings:** 10 deduplicated findings (3 Critical, 5 High, 2 Medium) — 10 accepted, 0 rejected.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `SessionMaterialsModal` curriculum list vẫn còn `<MaterialPreviewButton>` gây lỗi compile hoặc trùng modal/fetch | Critical | Accept | Phase 2 |
| 2 | `apps/student/src/worker.ts` thiếu CSP + `pdfjs-dist` thiếu `isEvalSupported: false` + thiếu kiểm tra `Content-Type` trước `URL.createObjectURL` | Critical | Accept | Phase 1, Phase 2, Phase 3 |
| 3 | Test harnesses (`materials/index.test.tsx`, `session-materials-modal.test.tsx`, `lesson-materials.test.tsx`) và `vi.mock` path ở `packages/ui`/`web`/`student` gãy khi `InlineDocumentPreview` tự fetch `/file` và import `./blob-document-view` | Critical | Accept | Phase 1, Phase 2, Phase 3 |
| 4 | `loadBlobUrl` closure không ổn định + thiếu `requestKey` gây Use-After-Revoke khi bấm «Mở rộng» hoặc stale blob khi đổi item/org | High | Accept | Phase 1, Phase 2, Phase 3 |
| 5 | `IntersectionObserver` thiếu placeholder `min-h` cố định → thundering herd tải hàng loạt lúc mount; thiếu giới hạn concurrency, ngưỡng size lớn và clamp canvas chống OOM | High | Accept | Phase 1 |
| 6 | `fetchLessonMaterialBlobUrl` và `MaterialInlinePreview` bỏ qua `401` `reauth()`, `403 STUDENT_ORG_MISMATCH` self-healing, và gửi nhầm `Accept: application/json` | High | Accept | Phase 2, Phase 3 |
| 7 | `StudentInlineMaterialPreview` overlay render inline bị kẹt trong `opacity-60` stacking context của `ClassLessonList` nếu không dùng `createPortal(..., document.body)` | High | Accept | Phase 3 |
| 8 | Mobile `375×812` overflow ngang ở `ClassLessonList` (`grid-cols-[2rem_1fr]`), `MaterialItem` (`flex-wrap` thiếu `min-w-0`), và `ImageView` thiếu `overflow-auto`; `MaterialItem` có khoảng trống `gap-3` khi `preview` trả `null` | High | Accept | Phase 1, Phase 2, Phase 3 |
| 9 | Nút «Mở rộng» thiếu `aria-label` gắn tên tài liệu (`Mở rộng ${title}`); `apps/student` thiếu thông điệp lỗi tiếng Việt cho HTTP error | Medium | Accept | Phase 1, Phase 2, Phase 3 |
| 10 | `StudentInlineMaterialPreview` overlay cần `document`-level `Escape`/Tab focus-trap và khôi phục focus khi đóng (kể cả khi `Suspense` đang tải) | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-web-inline-preview.md`, `phase-03-student-inline-preview.md`
- Decision deltas checked: 10
- Reconciled stale references: 4 (bỏ `onExpand(blobUrl)` chuyển sang `renderExpandedModal` + `requestKey`; bỏ `MaterialPreviewButton` khỏi `session-materials-modal.tsx`; đồng bộ `createPortal` + CSP + `401`/`403` healing ở Phase 3; cập nhật đầy đủ test files ở Phase 1–3).
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-18
**Trigger:** `/ak-vibe` pre-implementation gate (`/ak-plan validate` + `/ak-plan red-team`)
**Questions asked:** 3 (initial UX/scope alignment via `ask_question` before planning: layout inline trực tiếp trong card, phạm vi cả `apps/web` + `apps/student`, giữ PDF + ảnh kèm nút mở rộng).

#### Verification Results
- **Tier:** Standard (3 phases)
- **Claims checked:** 14
- **Verified:** 14 | **Failed:** 0 | **Unverified:** 0
- Verified paths & symbols: `apps/web/src/components/document-preview/blob-document-view.tsx:23`, `apps/web/src/components/materials/material-item.tsx:68,112`, `apps/web/src/components/materials/material-preview.tsx:32,38,73`, `apps/web/src/components/class-detail/session-materials-modal.tsx:11,237,272`, `apps/web/src/routes/_auth/materials/index.tsx:387,416`, `apps/web/src/lib/repos/materials.ts:411`, `apps/student/src/components/class/lesson-materials.tsx:56,159`, `apps/student/src/components/class/class-lesson-list.tsx:153,219`, `apps/student/src/lib/repos/student.ts:60,399`, `apps/student/src/lib/query-client.ts:105-149`, `apps/student/src/worker.ts:9-18`, `apps/server/src/lib/material-file-response.ts:90-96`.

#### Confirmed Decisions
- Inline layout: Nhúng thẳng khung preview ngay trong từng card (lazy-load `IntersectionObserver`, khung `max-h-80`, nút «Mở rộng ${title}»).
- Scope: `apps/web` (`/materials` + `SessionMaterialsModal` direct & curriculum) và `apps/student` (`LessonMaterials`), giữ `MaterialBankBrowser` và `SourceDocumentViewer` gọn/không đổi.
- Security & stability: `isEvalSupported: false`, canvas pixel cap, `Content-Type` allowlist verification, CSP cho `apps/student/src/worker.ts`, `requestKey` + `useRef` + `renderExpandedModal`, concurrency limit 3, auto-preview threshold 10 MiB.

<!-- slug: inline-material-preview -->
