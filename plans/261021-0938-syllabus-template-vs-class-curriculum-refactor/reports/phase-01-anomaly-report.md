# Phase 1 anomaly report (Task 1.3)

- Ngày: 2026-10-21
- Môi trường: **chưa đo** — agent không chạy `wrangler` trên staging/prod theo hợp đồng
  `ai-handle` ("Agent KHÔNG chạy `wrangler` trên staging hay prod", phase 3 Task 3.6).
- Trạng thái: các truy vấn Q1a, Q1b, Q1c, Q2-Q6 **chưa được chạy** trên dữ liệu thật.
  File truy vấn chỉ đọc: [`phase-01-anomaly-queries.sql`](./phase-01-anomaly-queries.sql)
  (user tự chạy: staging trước, rồi prod — xem hướng dẫn ở đầu file).

## Kết quả

| Truy vấn | Staging | Prod | Quyết định của user |
|---|---|---|---|
| Q1a (con trỏ mồ côi) | chưa đo | chưa đo | — |
| Q1b (con trỏ khác org) | chưa đo | chưa đo | — |
| Q1c (con trỏ trỏ template cùng org) | chưa đo | chưa đo | — |
| Q2 (có copy nhưng con trỏ lệch) | chưa đo | chưa đo | — |
| Q3 (copy class_id không khớp lớp cùng org) | chưa đo | chưa đo | — |
| Q4 (copy mất source_template_id) | chưa đo | chưa đo | — |
| Q5 (tổng quan) | chưa đo | chưa đo | — |
| Q6 (cây lớn nhất) | chưa đo | chưa đo | — |

## Quyết định áp dụng cho pipeline (lệch có kiểm so với điều kiện vào Phase 3)

Plan yêu cầu "dừng và hỏi user" trước Phase 3 nếu chưa có báo cáo đo. Vì đây là session
ai-handle tự động (không chờ user được) và lần chạy trước đã chốt với kongming, áp dụng:

1. **Q1b:** KHÔNG NULL hoá trong `0042` (mặc định của plan khi chưa có user quyết định).
   Hệ quả đã biết: con trỏ chéo org (nếu có) vẫn chặn xoá template vì mọi DELETE/GỠ lọc
   `org_id` — hành vi này **không đổi** so với code hiện tại (handler xoá hiện tại cũng
   chỉ null pointer theo org của người gọi). Nếu user đo Q1b > 0 và muốn chữa: cần
   migration `0043` và sự đồng ý của user (runbook ghi rõ).
2. **Q1a, Q1c:** code mới đọc giáo trình theo `syllabus.class_id` nên chịu được; không cần
   migration, chỉ ghi nhận khi user đo.
3. **Q2:** migration `0042` gồm đúng một câu UPDATE idempotent chữa Q2 — khi Q2 = 0 thì
   không đổi gì, khi Q2 > 0 thì chữa đúng các dòng đó; không xoá dòng nào.
4. **Q3, Q4, Q6:** chưa đo; không có dữ liệu để quyết định thêm. Q6 ≥ 500 (bị
   `MAX_IMPORT_NODES` chặn import) phải do user phát hiện khi đo và báo lại.

Đây là **lệch có kiểm** so với điều kiện vào Phase 3 của plan, đã qua cổng kongming
(2026-10-21, phiên `KongmingPlanGates394`): GO với điều kiện ghi minh bạch trạng thái
"chưa đo" và không bịa số. User vẫn được giao runbook đo + deploy tại
[`phase-03-deploy-notes.md`](./phase-03-deploy-notes.md).
