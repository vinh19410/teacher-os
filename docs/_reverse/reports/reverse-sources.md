---
feature: reports
type: reverse-source-map
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — reports

Bảng tài nguyên S. Range kiểm bằng đếm dòng thực tế (awk END NR), không dùng wc -l.
S1..S5 đúng thứ tự nguồn trong docs/_reverse/reverse-plan.json (entry slug
`reports`); S6..S29 là nguồn mở rộng phát hiện khi điều tra. Lưu ý: S1..S4 và S29
thuộc CỤM KHÁC (nhắn tin tuần GV↔phụ huynh) — giữ trong bảng với nhãn BIÊN GIỚI
để ghi lại vì sao plan gán nhầm và để negative-search đối chiếu (reverse-gaps.md).

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/reporting/index.ts | server code | 1-153 | ✅ | ts | BIÊN GIỚI (b): GET+POST /api/reports của nhắn tin tuần (54-103); cùng module còn comment-bank (105-153) |
| S2 | apps/server/src/routes/reporting/loaders.ts | server code | 1-62 | ✅ | ts | BIÊN GIỚI (b): loadReports (9-30), loadNotifs (32-47), loadCommentBank (49-62) |
| S3 | packages/db/src/schema/report.ts | db schema | 1-35 | ✅ | ts | BIÊN GIỚI (b): bảng report 11 cột, 2 index, không cột tiền; tạo/xóa cascade |
| S4 | apps/web/src/routes/_auth/reports.tsx | client route | 1-191 | ✅ | tsx | BIÊN GIỚI (c): trang "Báo cáo phụ huynh", trước khi nạp tắt thì chuyển hướng (15-22) |
| S5 | apps/e2e/specs/tuition-revenue-chart.spec.ts | e2e | 1-209 | ✅ | ts | NGUỒN THẬT duy nhất trong plan: 2 test — cửa sổ kỳ + địa chỉ, giá trị lạ không sập |
| S6 | apps/web/src/routes/_auth/tuition/index.tsx | client route | 1-376 | ✅ | tsx | Trang Doanh thu: kiểm tham số `ky` (40-53), 4 KPI (109-131), ghép chart (132-144), giữ kỳ khi sang chi tiết (274-279) |
| S7 | apps/web/src/components/tuition/revenue-chart.tsx | client component | 1-258 | ✅ | tsx | Biểu đồ cột kép + chọn kỳ + a11y + trạng thái rỗng + đếm bỏ qua |
| S8 | apps/web/src/lib/tuition-from-kernel.ts | client lib | 1-710 | ✅ | ts | Bộ luật tổng hợp: invoiceReceived (21-33), tuitionTotals (35-48), revenueByPeriod (112-184); phần sổ công nợ/hồ sơ thuộc feature khác |
| S9 | apps/web/src/lib/tuition-from-kernel.test.ts | test | 1-1470 | ✅ | ts | 64 test / 10 nhóm: tổng, luật tiền, cửa sổ 12/8/5, biên múi giờ, bỏ qua, sổ công nợ |
| S10 | apps/web/src/routes/_auth/tuition/index.test.tsx | test | 1-178 | ✅ | tsx | 5 test / 3 nhóm: KPI, ghi nhận thu, chặn vai (152-178) |
| S11 | apps/web/src/lib/repos/invoices.ts | client lib | 1-35 | ✅ | ts | Ánh xạ dòng bản chụp → hóa đơn client; mốc ISO → ms, hỏng trả 0 (30-33) |
| S12 | apps/web/src/lib/mock-data.ts | client lib | 1-352 | ✅ | ts | Kiểu Invoice (134-155, mốc ms :154), định dạng tiền fmtVND (330) |
| S13 | apps/server/src/routes/snapshot.ts | server loader | 1-873 | ✅ | ts | loadInvoices (60-92) serialize ISO (87-91); cổng vai ẩn hóa đơn (348); viewer (868-871); nạp reports của cụm khác (58,349) |
| S14 | packages/db/src/schema/invoice.ts | db schema | 1-61 | ✅ | ts | Bảng invoice 15 cột: amount/status/paid_amount/created_at là 4 cột báo cáo đọc (36-48) |
| S15 | packages/api/src/contracts.ts | api contract | 1-4801 | ✅ | ts | KernelInvoiceRow (1768-1796, mốc ISO :1796); snapshot.invoices/reports (1939-1940); +2 dòng so với d6c0f6b5 (thêm mã lỗi #675 sau dòng 1968 — không đụng range trích) |
| S16 | apps/web/src/lib/format-invoice.ts | client lib | 1-56 | ✅ | ts | Mã hóa đơn ngắn (6-9), nhãn loại mặc định (13-16), nhãn trạng thái dùng chung (18+) |
| S17 | apps/web/src/lib/use-finance-route-guard.ts | client lib | 1-31 | ✅ | ts | Cổng route tài chính: câu chặn (6), chuyển hướng Tổng quan (16-29) |
| S18 | packages/auth/src/role.ts | role gate | 1-177 | ✅ | ts | Danh sách vai tài chính teacher/owner/admin (75-87) |
| S19 | apps/web/src/components/layout/sidebar.tsx | client component | 1-214 | ✅ | tsx | Mục "Doanh thu" (109); mục "Báo cáo" của cụm khác gắn cờ ẩn (117-121); lọc vai (128-145) |
| S20 | apps/web/src/components/command-search/search-index.ts | client component | 1-239 | ✅ | ts | Bảng chọn lệnh dùng chung danh sách điều hướng + lọc mục tắt (179-193) |
| S21 | apps/web/src/lib/query-client.ts | client lib | 1-49 | ✅ | ts | Tắt mọi tự làm mới nền: staleTime vô hạn, không refetch theo tiêu điểm/kết nối (7-24) |
| S22 | apps/web/src/lib/repos/kernel.ts | client lib | 1-834 | ✅ | ts | Nạp bản chụp GET /api/kernel (622-667), khóa truy vấn dùng chung (669-679) |
| S23 | apps/web/src/lib/week-grid.ts | client lib | 1-210 | ✅ | ts | "Hôm nay" múi giờ Việt Nam (21-36); kiểm ngày lịch thật dùng chung |
| S24 | apps/web/src/lib/data-provider.tsx | client lib | 1-190 | ✅ | tsx | Cổng nạp bản chụp + cổng chặn lỗi toàn trang (78-88, 175); làm mới sau ghi qua bus (101-108) |
| S25 | apps/e2e/specs/student-tuition-summary.spec.ts | e2e | 1-218 | ✅ | ts | Cross: tổng hợp học phí hồ sơ học viên dùng đúng luật tiền (#347) |
| S26 | plans/261007-1628-tuition-revenue-stats/plan.md | plan doc | 1-123 | ✅ | md | Plan #343: 3 quyết định chốt với người dùng (28-34), mục tiêu (46-52), phi mục tiêu (54-58), nghiệm thu (68-79) |
| S27 | plans/journals/2026-10-08-plan-doanh-thu-issue-343-red-team-bt-3-critical-cng-thc-reve.md | plan journal | 1-33 | ✅ | md | Red-team bắt 3 lỗi nghiêm trọng: luật tiền, serialize mốc, e2e sai app (15-21) |
| S28 | plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md | plan journal | 1-23 | ✅ | md | Bài học: tick bị clip, store nạp bản chụp MỘT LẦN (16), toggle trùng nhãn Q (19) |
| S29 | apps/web/src/lib/features.ts | client lib | 1-15 | ✅ | ts | BIÊN GIỚI (c): cờ tĩnh cụm "Báo cáo phụ huynh" = false (dòng 7) |

Không có S-id nào trỏ tài liệu nghiệp vụ `.md` riêng cho feature (existing_doc =
null trong plan; ngữ cảnh nghiệp vụ nằm ở S26-S28). docs/project-roadmap.md:62,64
nhắc nghiệm thu KPI học phí — dùng làm chứng cứ phụ trong spec, không tính S.
