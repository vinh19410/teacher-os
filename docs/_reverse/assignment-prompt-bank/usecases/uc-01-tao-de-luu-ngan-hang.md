# UC-01 — Tạo đề mới và lưu "Sẵn sàng giao"

Repo: /root/projects/teacher-os @ develop d6c0f6b5. Nhãn toàn bộ ✅ trừ khi ghi chú riêng.

**a. Mô tả ngắn.** Giáo viên soạn một đề theo catalog IELTS và lưu với trạng thái "Sẵn sàng giao"; đề nằm riêng trong ngân hàng, chưa gắn lớp/học viên nào. Đường: `/assignments/new` → POST `/api/assignments/prompts` — `apps/web/src/routes/_auth/assignments/new.tsx:829-991`; `apps/server/src/routes/assignments/index.ts:113-153`.

**b. Actor.** Chính: Giáo viên (đã đăng nhập org teacher). Phụ: Kernel command bus (gửi lệnh + refresh snapshot) — `apps/web/src/lib/repos/kernel.ts:187-193`.

**c. Tiền điều kiện.** Đã xác thực (kernelCtx có orgId/userId — `apps/server/src/app.ts:296-301`); Origin + Content-Type JSON hợp lệ (`apps/server/src/routes/kernel.ts:189-211`).

**d. Hậu điều kiện.**
- Thành công: row `assignment_prompt` mới `status="ready"` của org; snapshot có đề; UI card "Đã thêm vào ngân hàng"; draft autosave bị xóa (`apps/server/src/routes/assignments/index.ts:140-152`; `apps/web/src/routes/_auth/assignments/new.tsx:969-978`).
- Thất bại: không có row mới; form giữ nguyên + thông báo; draft giữ lại.

**e. Kịch bản chính.**

| Bước | Actor hành động | Hệ thống phản hồi | Nguồn |
|------|-----------------|-------------------|-------|
| 1 | Mở "Tạo đề mới", chọn kỹ năng/phần/dạng từ catalog | Form dựng preset theo (skill,part,type): số câu, KIND, bankable, image pairs | `packages/ui/src/components/assignments/editor/assignment-presets.ts:45-358` |
| 2 | Điền nội dung (đề/passage/transcript/câu hỏi/đáp án/ảnh...) | Field errors inline mirror rule; chặn mục chưa hợp lệ bằng disable | `apps/web/src/routes/_auth/assignments/new.tsx:700-746` |
| 3 | Chọn "Sẵn sàng giao" và bấm Lưu | Chạy `missingRequirementsFor` theo (skill, status=ready) | `:141-305,836-844` |
| 4 | — | Gate qua: dựng payload field-diff, khóa nút, gửi `create-assignment-prompt` | `:861-921`; `apps/web/src/lib/data-actions.ts:80-85` |
| 5 | — | Bus POST JSON; server bodyLimit 256KB rồi schema strict + superRefine | `apps/server/src/routes/assignments/index.ts:63-99`; `packages/api/src/contracts.ts:872-1124` |
| 6 | — | Insert row (task/genre derive; questions/optionBank stringify; band default 7.0 nếu trống), trả 201 `{id}` | `apps/server/src/routes/assignments/index.ts:124-152`; `packages/db/src/schema/assignment-prompt.ts:25-31,41` |
| 7 | — | Bus refresh GET /api/kernel (snapshot có `assignmentPrompts`), kind `refreshed` | `apps/web/src/lib/repos/kernel.ts:412-430`; `apps/server/src/routes/snapshot.ts:338-347` |
| 8 | — | Card "Đã thêm vào ngân hàng" + ghi chú "chưa được giao lớp"; xóa draft | `apps/web/src/components/assignments/create-success-card.tsx:53-63`; `apps/web/src/components/assignments/prompt-preview-aside.tsx:202-211` |

**f. Luồng thay thế/ngoại lệ.**
- A1 — Thiếu mục bắt buộc ở bước 3: hiện alert `role="alert"` "Cần hoàn thiện trước khi lưu (N mục)" + focus mục đầu (E-015; UC-02 là lối thoát tự nhiên). `apps/web/src/routes/_auth/assignments/new.tsx:1141-1172`.
- A2 — Schema từ chối (E-005 `invalid body`): 400 chỉ chứng minh KHÔNG lưu; form giữ, thông báo chung E-018, draft giữ. `apps/web/src/lib/repos/kernel.ts:423-430`.
- A3 — Response thất lạc/refresh lỗi → `committed`/`outcome-unknown`: vào UC đối chiếu (F6), thiếu chứng cứ thì E-016. `apps/web/src/lib/use-kernel-form-submit.ts:66-113`.
- A4 — INSERT không trả row: 500 `prompt write conflict` (E-014). `apps/server/src/routes/assignments/index.ts:151`.
- A5 — Đổi kỹ năng/phần/dạng giữa chừng khi đã có nội dung: `window.confirm` + rule chuyền dữ liệu (FR-011) trước khi tiếp tục bước 2. `apps/web/src/routes/_auth/assignments/new.tsx:747-773`.

**g. Ràng buộc/NFR.** body ≤256KB (FR-015); mọi rule ready phải thỏa (BR-004..013, BR-020); CSRF (E-002/E-003).

**h. Truy vết.** FR-001/002/004/013/015/017/018/019; BR-001/002/003/019; E-004/005/014/015/016/018; Flow F1; Test: E2E `assignment-prompt-create.spec.ts:18-68` + reading-types 9 + map-listening 2; web `new-submit.test.tsx` 14 test.
