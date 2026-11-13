# UC-04 — Chỉnh sửa đề đã lưu

Repo: /root/projects/teacher-os @ develop d6c0f6b5.

**a. Mô tả ngắn.** Giáo viên mở đề từ ngân hàng, sửa nội dung hoặc metadata và lưu; server chỉ nhận từng phần thay đổi (field-diff), khóa nội dung/Writing theo dữ liệu tham chiếu — `apps/web/src/routes/_auth/assignments/new.tsx:440-472,846-926`; `apps/server/src/routes/assignments/index.ts:199-525`.

**b. Actor.** Chính: Giáo viên. Phụ: command bus (`update-assignment-prompt` → PATCH — `apps/web/src/lib/repos/kernel.ts:302-309`).

**c. Tiền điều kiện.** Đề tồn tại và thuộc org; truy cập bằng `?promptId=`.

**d. Hậu điều kiện.** Thành công: row cập nhật đúng phần đổi; card "Đã cập nhật bài tập". Thất bại: row không đổi (4xx/409 giữ nguyên); form giữ payload đã soạn.

**e. Kịch bản chính.**

| Bước | Actor | Hệ thống | Nguồn |
|------|-------|----------|-------|
| 1 | Bấm "Chỉnh sửa" | `/assignments/new?promptId=...`; nạp đề từ snapshot (fallback legacy), khóa skill/part (BR-014) | `new.tsx:537-545,602-635`; `packages/api/src/contracts.ts:1129-1140` |
| 2 | Sửa nội dung/metadata | Chốt `EditBaseline` từ server state | `new.tsx:440-472` |
| 3 | Bấm "Lưu thay đổi" | Dựng payload chỉ gồm field khác baseline | `:846-926` |
| 4 | — | PATCH; server nạp row (404 nếu không thấy), validate lại type/question theo part/skill của ROW | `assignments/index.ts:230-281` |
| 5 | — | Nếu `writing` đổi: 3 probe tham chiếu → 409 WRITING_SECTION_LOCKED nếu bị dùng | `:304-374` |
| 6 | — | Nếu contentChanged: probe quiz_attempt → 409 PROMPT_CONTENT_LOCKED nếu có; không thì ghi content + metadata | `:376-509` |
| 7 | — | Không đổi gì: chỉ metadata (hoặc no-op 200 `{id}`) | `:511-512` |
| 8 | — | Client reconcile `editSubmissionPersisted` so payload đã submit với snapshot; khớp → card thành công | `new.tsx:491-529,992-1051` |

**f. Luồng thay thế/ngoại lệ.**
- A1 — Đề không tồn tại/không thuộc org: trang "Không tìm thấy đề này." (E-013). `new.tsx:1052-1076`.
- A2 — 409 CONTENT_LOCKED (E-012): thông báo "Đề đã có học viên làm bài nên không sửa được nội dung..."; chỉ metadata được qua; gợi ý tạo đề mới. `use-kernel-form-submit.ts:21-22`.
- A3 — 409 WRITING_SECTION_LOCKED (E-011): "Đề đã được giao hoặc đang dùng trong bộ đề..."; trả Writing về cũ rồi lưu phần khác.
- A4 — Lưu y nguyên đề bị khóa: không phải thay đổi (BR-016) → 200 bình thường.
- A5 — Đổi type/skill dữ liệu sẵn có: confirm cấu trúc + carry-over (FR-011) — nhưng skill/part bị khóa ở chế độ sửa; chỉ type đổi được.
- A6 — Reconcile không chứng minh được (E-017): "Đã tải lại dữ liệu nhưng thay đổi của bạn chưa được lưu. Vui lòng lưu lại."

**g. Ràng buộc/NFR.** BR-014/015/016/020; body ≤256KB; CSRF.

**h. Truy vết.** FR-007/008/009/011/014/015/016/017/018/019/020; BR-014/015/016; E-005..013/017/018; Flow F3/F6; Test: API `prompt-content-lock.test.ts` 9 test; E2E reading-types 9 + map-listening 2 + create (:476-580); web `new-submit.test.tsx` 14.
