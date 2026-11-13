---
type: reverse-usecase
feature: grading
uc: UC-06
status: draft
updated: 2026-11-12
---

# UC-06 — Xử lý hết Credit hoặc hết hạn mức

**a. Mục tiêu** — Khi ví tổ chức hết khả dụng Credit, hệ thống ưu tiên cứu Writing bằng lượt chấm nhanh 0 Credit; hết đường đó thì chặn rõ ràng kèm chỉ dẫn, và chấm tay vẫn hoạt động.

**b. Actor** — Chính: hệ thống (tự quyết khi pipeline chạy). Hiển thị cho: giáo viên.

**c. Điều kiện tiên quyết** — Ví balance − held < chi phí kỹ năng khi pipeline cần giữ Credit.

**d. Luồng chính** —
1. Pipeline cần giữ Credit nhưng không đủ (F2 nhánh alt).
2. Nếu là Writing VÀ ví đang gói tháng active/grace_period → giành 1 lượt chấm nhanh 0 Credit, ≤30/tháng dương lịch giờ VN, INSERT nguyên tử [FR-40].
3. Thắng → nháp "quick", creditCost 0, nhãn "Bản nháp chấm nhanh", nhận xét AI 1–2 câu [FR-40, FR-49].
4. Nếu không đủ điều kiện quick → nháp lỗi: E-002 (hết cả 30 lượt) hoặc E-001 (không phải Writing) [FR-41].
5. GV mở màn chấm thấy thông điệp nguyên văn E-001/E-002 + hộp thoại "Nạp thêm Credit AI" chỉ dẫn liên hệ Chủ trung tâm; chữ nhấn mạnh chấm tay bình thường [FR-61].

**e. Luồng thay thế & lỗi** —
- E1: 2 bài nộp cùng lúc giành lượt cuối → INSERT..SELECT..WHERE count<30 chỉ cho 1 thắng (nguyên tử).
- E2: AI quick lỗi → hoàn lượt chấm nhanh bằng dòng bù "reverted" (kể cả giao thừa tháng) [BR-11].

**f. Hậu điều kiện** — Không có nháp kẹt trạng thái giữ Credit; GV vẫn chấm tay được (BR-03).

**g. Quy tắc nghiệp vụ** — BR-06 (ưu tiên Writing 30 lượt/tháng), BR-11 (sổ cái append-only + dòng bù), BR-12 (1 org 1 ví, không âm).

**h. Truy vết** — FR-40, FR-41, FR-61; BR-06, BR-11, BR-12; F2 (alt); Error E-001, E-002; Test: run-grading.test.ts (E-001/E-002 + quick slots), ai-grading-ac-003.spec.ts:185-277 (Scenario 1 30/30, Scenario 2 31/30 + modal E-002 + keyboard).
