# UC-06 — Soát đáp án bộ đề

a) **Actor & mục tiêu:** Giáo viên đối chiếu đáp án đã soạn của toàn bộ câu hỏi với answer key chuẩn và sửa lệch hàng loạt.

b) **Tiền điều kiện:** Có part đã gán có câu hỏi; panel đọc từ snapshot, không fetch riêng. `answers-checking-panel.tsx:28-31`

c) **Trigger:** Bấm "Soát đáp án". `test-builder-shell.tsx:814-820`

d) **Kịch bản chính:**
1. View All: grid ô theo số câu tuyệt đối, ô thiếu đáp án nổi bật cam. `answers-checking-panel.tsx:141-158,259-281`
2. Dán key: mỗi dòng `số. giá trị[/alt1 / alt2]`; dòng lỗi liệt kê riêng, không chặn dòng hợp lệ. `test-answer-key.ts:105-181`
3. Compare: match/mismatch/missing/extra theo số câu tuyệt đối từ computeTestRanges. `test-answer-key.ts:206-231`
4. Có lệch: preview "Sẽ đổi N câu ở M part" chỉ liệt kê mismatch. `answers-checking-panel.tsx:208-221`
5. Confirm → PATCH tuần tự từng part (chỉ thay answer+alts, giữ stem/opts/pin). `repos/assignment-tests.ts:159-191,206-219`

e) **Nhánh mở rộng:**
- 2a. Dòng không đọc được / trùng số / sai bộ đáp án → E-014 với message riêng. `test-answer-key.ts:117-179`
- 3a. Key toàn match → "Key khớp toàn bộ — không có gì để ghi." `answers-checking-panel.tsx:248-252`
- 4a. GV hủy confirm → không ghi.
- 5a. Part lỗi → dừng, thông báo chạy lại (idempotent — chỉ câu còn lệch được ghi). `answers-checking-panel.tsx:126-132`
- e2e: 40 dòng, 2 lệch → 38 match/2 mismatch → fix → 40 match/0 mismatch; grid Q5/Q33 phản ánh patched. `assignment-test-create.spec.ts:226-259`

f) **Nghiệp vụ/quy tắc:** FR-012; BR-011 (chỉ mismatch được ghi); chuẩn so khớp text trim + alts `" / "`; choice so canonical hai chiều. `test-answer-key.ts:236-249`

g) **Hậu điều kiện:** Prompts chứa key mới; compare về 0 mismatch; số câu tuyệt đối không đổi.

h) **Nguồn & nhãn:** S4 `test-answer-key.ts`, `repos/assignment-tests.ts:159-219`; S3 `answers-checking-panel.tsx`; test `answers-checking-panel.test.tsx`, `repos/assignment-tests.test.ts:385-500`, `test-answer-key.test.ts` (13 ca); e2e `assignment-test-create.spec.ts:226-259`. Nhãn ✅.
