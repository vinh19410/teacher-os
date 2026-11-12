---
type: reverse-usecase
feature: grading
uc: UC-08
status: draft
updated: 2026-11-12
---

# UC-08 — Dọn lượt chấm treo và hoàn Credit

**a. Mục tiêu** — Không để Credit của tổ chức kẹt trong trạng thái "đang giữ" và không để nháp kẹt "AI đang chấm" khi process nền chết/quá hạn.

**b. Actor** — Chính: hệ thống (sweep chạy kèm request đọc).

**c. Điều kiện tiên quyết** — Có request đọc tới hàng chờ, chi tiết bài nộp, hoặc ví Credit; tồn tại lượt treo quá 60 giây.

**d. Luồng chính** —
1. Request GET (queue / attempt / wallet) kích hoạt sweep [FR-64] (F8).
2. Nhóm 1: nháp treo "ai_processing" quá 60s → CAS "manual_pending" mã TIMEOUT + hoàn phần giữ [FR-65].
3. Nhóm 2: nháp đã rời "ai_processing" nhưng còn giữ chưa chốt/hoàn → hoàn phần còn lại [FR-65].
4. Nhóm 3: lượt chấm nhanh đã ghi nhưng AI lỗi chưa hoàn → ghi dòng bù hoàn lượt [FR-65].
5. Mỗi lượt tối đa 20 dòng [FR-64].

**e. Luồng thay thế & lỗi** —
- E1: không ai mở màn chấm/ví → không có sweep định kỳ; lượt treo tồn tại lâu hơn (OQ-09).
- E2: cuộc đua với runner/sweep/publish → mọi chuyển trạng thái qua CAS nên chỉ một phía thắng [BR-10, FR-45].

**f. Hậu điều kiện** — Sổ cái không còn mục giữ mồ côi; nháp treo về "Chờ chấm tay" cho giáo viên xử lý.

**g. Quy tắc nghiệp vụ** — BR-10 (occasion idempotent), BR-11 (dòng bù reverted); bất biến ngưỡng 60s > ngân sách 30s [FR-67].

**h. Truy vết** — FR-64…FR-67; BR-10, BR-11; F8; Error (TIMEOUT do sweep đặt); Test: run-grading.test.ts:954 (bất biến), các test sweep 3 nhóm.
