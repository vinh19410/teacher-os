# UC-07 — Xem trước bộ đề

a) **Actor & mục tiêu:** Giáo viên xem bộ đề đúng như học viên đọc (giấy thi), kiểm tra số câu và nội dung trước khi dùng.

b) **Tiền điều kiện:** Đang ở builder có dữ liệu (create: state; edit: state + test id).

c) **Trigger:** Bấm "Xem trước" (có ở cả create và edit). `test-builder-shell.test.tsx:195-203` (test), `821-823`

d) **Kịch bản chính:**
1. Lưu handoff sessionStorage: nguyên văn khi ≤1MB, else ref (testId + assignedByPart). `assignment-test-preview-draft.ts:135-168`
2. Route preview đọc handoff (non-destructive — reload vẫn chạy); ref → dựng lại từ snapshot ưu tiên test row. `preview.tsx:83-89,29-78`
3. Render: tiêu đề, "Time: x minutes" (round từ timeLimitSeconds), collection · group, "Questions 1–N", từng part heading (READING PASSAGE 1…), passage/audio placeholder/prompt, option bank, câu đánh số liên tục. `test-preview-paper.tsx:45-174`
4. Đáp án không bao giờ render. `test-preview-paper.tsx:21-24`; e2e `assignment-test-create.spec.ts:295-298`

e) **Nhánh mở rộng:**
- 2a. Không có handoff → empty state "Chưa có bộ đề nào để xem trước." + nút mở trang soạn. `preview.tsx:91-117`
- 1a. QuotaExceeded → nuốt im lặng, preview không chặn flow. `assignment-test-preview-draft.ts:147-167`
- 3a. Bộ đề trống part → "Chưa có part nào…". `test-preview-paper.tsx:90-94`
- Slot trống bị bỏ khỏi render nhưng không dịch mốc số. `test-preview-paper.test.tsx:173-202`

f) **Nghiệp vụ/quy tắc:** FR-013, FR-005; BR-009.

g) **Hậu điều kiện:** Không thay đổi dữ liệu; quay lại builder bằng "Quay lại soạn" (history.back). `preview.tsx:138-141`

h) **Nguồn & nhãn:** S3 preview files; test `test-preview-paper.test.tsx`; e2e `assignment-test-create.spec.ts:274-298`. Nhãn ✅.
