# UC-03 — Chỉnh sửa part đã gán

a) **Actor & mục tiêu:** Giáo viên sửa nội dung một prompt đã gắn trong test (stem, đáp án, passage…) ngay trong builder.

b) **Tiền điều kiện:** Slot đã có prompt; prompt thuộc org.

c) **Trigger:** Bấm "Chỉnh sửa" trên slot đã gán. `test-part-slot.tsx:107-109`

d) **Kịch bản chính:**
1. Shell dựng ComposerValue từ prompt (baseline = giá trị lúc mở). `test-builder-shell.tsx:403-417`
2. GV sửa; đổi dạng đề có nội dung sẽ confirm xóa dữ liệu dạng cũ. `test-builder-shell.tsx:429-434`
3. Lưu: PATCH chỉ gửi field thật sự khác baseline (text trim; questions/optionBank so canonical JSON); skill/part không bao giờ gửi. `test-builder-shell.tsx:968-1040`
4. Server khóa nội dung nếu prompt có attempt (409 PROMPT_CONTENT_LOCKED — feature prompt-bank, touchpoint). `routes/assignments/index.ts:428-463`

e) **Nhánh mở rộng:**
- 3a. Không đổi gì → PATCH chỉ còn title/band/source/status (test #630/#632). `test-builder-shell.test.tsx:351-425`
- 4a. 409 → thông báo khóa "Đề đã có học viên làm bài nên không sửa được nội dung…". `use-kernel-form-submit.ts:21-22`
- explanation HTML được nạp và bảo toàn (#571). `test-builder-shell.test.tsx:285-350`

f) **Nghiệp vụ/quy tắc:** FR-010; BR-014 (lockPart); ràng buộc update schema `.strict()` không nhận skill/part. `contracts.ts` assignmentPromptUpdateSchema.

g) **Hậu điều kiện:** Prompt cập nhật; slot/outline tính lại dải câu nếu số câu đổi.

h) **Nguồn & nhãn:** S3 `test-builder-shell.tsx:403-417,968-1040`; S7 `routes/assignments/index.ts:199-525`; test `test-builder-shell.test.tsx:285-425`; server `tests.test.ts:747-898`. Nhãn ✅.
