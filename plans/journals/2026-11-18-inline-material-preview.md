# Journal — Inline Material Preview (`apps/web` & `apps/student`)

- **Ngày:** 2026-11-18
- **Issue / Plan:** [#797](https://github.com/vinh19410/teacher-os/issues/797) | [plan.md](../261118-0410-inline-material-preview/plan.md)
- **Tóm tắt:** Chuyển trải nghiệm xem trước tài liệu PDF/ảnh (`PNG`/`JPG`/`WEBP`) từ nút «Xem trước» mở modal sang nhúng trực tiếp khung xem trước inline ngay trong từng card tài liệu ở `apps/web` (`/materials`, `SessionMaterialsModal` cả direct lẫn «Từ giáo trình») và `apps/student` (`LessonMaterials`), giữ nút «Mở rộng» để mở modal toàn khung khi cần.

## Quyết định & Vấn đề xử lý

1. **Dùng chung ở `@teacher-os/ui` nhưng giữ bundle nhỏ:** Tách `BlobDocumentView` + `InlineDocumentPreview` sang `packages/ui` (`pdfjs-dist` lazy-load khi vào viewport qua `IntersectionObserver`). Bổ sung placeholder `min-h-48`, giới hạn 3 request song song, ngưỡng auto-fetch 10 MiB, và kẹp cạnh canvas tối đa `4096px` + `maxImageSize` để tránh thundering herd hoặc OOM trên mobile.
2. **Ổn định `blob:` URL khi mở «Mở rộng»:** Lưu `loadBlobUrl`/`formatError` qua `useRef`, kích hoạt effect thuần theo `[triggered, requestKey]`, và dùng `renderExpandedModal` chỉ mount khi `state.status === "ready"` — tránh lỗi Use-After-Revoke khi parent re-render.
3. **Bảo mật & stack context ở `apps/student`:** Bổ sung `Content-Security-Policy` cho `apps/student/src/worker.ts` (giữ `microphone=(self)` cho placement test, bỏ qua CSP trên localhost cho Vite HMR), kiểm tra `Content-Type` allowlist trước `URL.createObjectURL`, tự hồi phục `403 STUDENT_ORG_MISMATCH` không invalidate thừa toàn bộ `["student"]`, và portal dialog «Mở rộng» ra `document.body` để thoát `opacity-60` của buổi tương lai trong `ClassLessonList`.
4. **Ghi chú `pdfjs-dist@6.4.299`:** Phiên bản v6 đã loại bỏ hoàn toàn tùy chọn `isEvalSupported` khỏi `DocumentInitParameters` và runtime `pdf.mjs` (đã kiểm chứng bằng `tsc --noEmit` và kiểm tra trực tiếp bundle).
