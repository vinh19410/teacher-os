# Journal — Ship TOS-27 (#473): Chặn tệp không hợp lệ & tự hoàn 5 Credit khi AI lỗi/quá hạn

- **Ngày:** 2026-10-27
- **Issue:** #473 (Jira TOS-27 · US-005 AC-004)
- **Branch:** `ai-handle-issue-473`

## Bẫy kỹ thuật đáng nhớ: `unpdf` / `pdf.js` detach `ArrayBuffer` qua `LoopbackPort`

- **Hiện tượng:** Sau khi thêm `inspectExamFile(data, mimeType)` bằng `unpdf.getDocumentProxy(new Uint8Array(data))` ở đầu `POST /api/exam-imports` (trước khi lưu file gốc lên R2), 2 scenario mới của E2E `ai-exam-import-ac-004.spec.ts` đều pass, nhưng E2E cũ `ai-exam-import-ac-001.spec.ts` lại fail ở assertion `pdf-page-indicator` (`Expected: "Trang 1 / 2"`, `Received: "Trang 1 / 1"`).
- **Nguyên nhân gốc rễ:** `unpdf` chạy fake-worker của `pdf.js` qua `LoopbackPort.postMessage` sử dụng `structuredClone` kèm transfer list trên `ArrayBuffer` truyền vào. Ngay khi `getDocumentProxy` hoàn tất, `data.byteLength` bị **detach về `0`**. Khi `runImport` chạy tiếp `store.put(fileKey, new Response(data).body, ...)`, file lưu lên R2 bị rỗng (0 byte) dù `sizeBytes` vẫn ghi kích thước cũ. Khi `SourceDocumentViewer` tải lại `/api/exam-imports/:id/file`, `pdfjs-dist` ở trình duyệt nhận 0 byte → ném `InvalidPDFException` → `totalPages` giữ nguyên mặc định `1`.
- **Cách giải quyết:** Truyền bản sao `new Uint8Array(data.slice(0))` vào `getDocumentProxy` trong `apps/server/src/lib/exam-import/validate-file.ts` và khóa chặt bằng unit test (`expect(buf.byteLength).toBe(originalLen)`) + route test (`expect((await fileRes.arrayBuffer()).byteLength).toBe(PDF_BYTES.byteLength)`).

## Hai điểm tinh chỉnh từ Code Review (`run-import.ts`)

1. **Không nuốt lỗi DB thật khi `releaseCredits`:** Trong catch-all của `runImport`, chỉ được nuốt `InsufficientCreditsError` (tức `held` đã được nhả bởi stale sweep hoặc luồng khác). Nếu `releaseCredits` ném lỗi DB tạm thời mà vẫn tiếp tục `UPDATE ... SET import_status = 'failed_refunded'`, 5 Credit sẽ kẹt trong `held` vĩnh viễn vì `releaseStaleImports` chỉ quét các job còn ở `processing`.
2. **Bắt cả `signal.aborted` khi phân loại `timeout`:** Khi extractor tôn trọng `AbortSignal.timeout(120_000)` và reject sớm trước khi timer dự phòng của `Promise.race` kịp bật `timedOut = true`, `classifyImportError(error, timedOut || Boolean(signal?.aborted))` đảm bảo vẫn phân loại chính xác là `"timeout"` thay vì rơi vào `"ai_error"`.
