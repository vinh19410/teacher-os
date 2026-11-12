---
feature: parent-reports
type: reverse-source-map
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — parent-reports

Bảng tài nguyên S. Range kiểm bằng đếm dòng thực tế (awk END NR), không dùng wc -l.

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/web/src/lib/features.ts | client lib | 1-15 | ✅ | ts | hằng tĩnh PARENT_REPORTS_ENABLED = false (dòng 7); module còn 2 cờ khác |
| S2 | apps/web/src/routes/_auth/reports.tsx | client route | 1-191 | ✅ | tsx | trang Báo cáo phụ huynh + beforeLoad redirect + 3 KPI + bảng + nhật ký |
| S3 | apps/web/src/components/modals/create-report-modal.tsx | client component | 1-142 | ✅ | tsx | modal tạo: 4 trường, validate, 2 nút, 3 nhánh lỗi |
| S4 | apps/web/src/components/layout/sidebar.tsx | client component | 1-214 | ✅ | tsx | nav giáo viên; mục "Báo cáo" enabled theo cờ (dòng 121) |
| S5 | packages/ui/src/components/app-shell/nav-group.tsx | ui component | 1-224 | ✅ | tsx | lọc item.enabled !== false (dòng 209) |
| S6 | apps/web/src/components/command-search/search-index.ts | client component | 1-239 | ✅ | ts | ⌘K dùng teacherNavForViewer + cùng bộ lọc enabled (dòng 182) |
| S7 | apps/web/src/components/layout/app-shell.tsx | client component | 1-193 | ✅ | tsx | breadcrumb "/_auth/reports" → "Báo cáo phụ huynh" (dòng 56) |
| S8 | apps/web/src/routes/_auth/students/$studentId.tsx | client route | 1-392 | ✅ | tsx | nút "Tạo báo cáo" (218-222) + modal (382-389) theo cờ |
| S9 | apps/web/src/routes-matcher.ts | client lib | 1-154 | ✅ | ts | "/reports": true (dòng 13) — SW cho qua để client redirect chạy |
| S10 | apps/web/src/lib/data-actions.ts | client lib | 1-344 | ✅ | ts | kiểu lệnh "create-report" (#173) dòng 95-106 |
| S11 | apps/web/src/lib/repos/kernel.ts | client lib | 1-834 | ✅ | ts | kernelCommand ánh xạ POST /api/reports (181-186); result kinds (393-421) |
| S12 | apps/web/src/lib/repos/reports.ts | client lib | 1-14 | ✅ | ts | mapReports snapshot → Report client |
| S13 | apps/web/src/lib/data-store-reducer.ts | client lib | 1-364 | ✅ | ts | create-report là no-op — số liệu từ snapshot sau ghi (97-105) |
| S14 | apps/web/src/lib/mock-data.ts | client lib | 1-352 | ✅ | ts | interface Report (172-180); reports trong kho dữ liệu (271, 291) |
| S15 | apps/web/src/lib/kernel-state.ts | client lib | 1-23 | ✅ | ts | trạng thái khởi tạo reports: [] (dòng 9) |
| S16 | packages/api/src/contracts.ts | api contract | 1-4799 | ✅ | ts | reportCreateSchema (1298-1315); KernelReportRow (1894-1902); snapshot.reports (1940) |
| S17 | packages/db/src/schema/report.ts | db schema | 1-35 | ✅ | ts | bảng report: 11 cột + 2 index + chú thích #173 |
| S18 | apps/server/src/routes/reporting/index.ts | server code | 1-153 | ✅ | ts | GET/POST /api/reports (54-103); sentStamp giờ VN (42-52); mount chung với notif + comment-bank |
| S19 | apps/server/src/routes/reporting/loaders.ts | server code | 1-62 | ✅ | ts | loadReports: join student cùng org, orderBy createdAt,id (9-30) |
| S20 | apps/server/src/routes/kernel.ts | server code | 1-3523 | ✅ | ts | CSRF middleware (185-206); mount /reports (3496); chú thích mount sau middleware (3490-3491) |
| S21 | packages/db/src/migrations/0005_mature_sasquatch.sql | migration | 1-38 | ✅ | sql | CREATE TABLE report + 2 index (23-38); cùng lô có comment_bank, notif |
| S22 | packages/db/src/migrations/0015_high_wither.sql | migration | 1-2 | ✅ | sql | ALTER TABLE report ADD content, channel |
| S23 | packages/db/src/migrations/0016_real_butterfly.sql | migration | 1-16 | ✅ | sql | tpl_report default (bảng workspace_settings — nay đã mộ #321) |
| S24 | apps/server/src/kernel.test.ts | test | 1-7844 | ✅ | ts | nhóm test báo cáo: 2447-2770 (snapshot rỗng, DTO, chéo org ẩn, POST 5 ca, 401/400) |
| S25 | apps/web/src/routes/_auth/reports.test.tsx | test | 1-165 | ✅ | tsx | honest empty state (#172), dữ liệu có, option modal, redirect cờ tắt (158-165) |
| S26 | apps/web/src/components/modals/create-report-modal.test.tsx | test | 1-150 | ✅ | tsx | form rỗng, persist sent/draft, chặn gửi rỗng, giữ chữ khi lỗi, cảnh báo outcome-unknown |
| S27 | apps/web/src/routes/_auth/students/$studentId.reports.test.tsx | test | 1-47 | ✅ | tsx | suite cờ BẬT: nút "Tạo báo cáo" mở modal đúng học viên đang xem |
| S28 | apps/web/src/components/layout/sidebar.test.tsx | test | 1-227 | ✅ | tsx | assert mục reports enabled === false (178-184) |
| S29 | apps/web/src/lib/repos/kernel-command.test.ts | test | 1-104 | ✅ | ts | ánh xạ create-report → POST /api/reports đúng 5 trường (6-33) |
| S30 | packages/db/src/schema/settings.ts | db schema | 1-51 | ✅ | ts | workspace_settings MỘ (#321): tpl_report giữ trong bảng (23-26) — boundary |
| S31 | docs/codebase-summary.md | docs | 1-67 | ✅ | md | ví dụ cụm ẩn: cờ tắt ẩn cả cụm + redirect (dòng 61) |
| S32 | docs/project-overview-pdr.md | docs | 1-50 | ✅ | md | nguyên tắc "deferred cluster ẩn bằng static flag" (dòng 21) |
| S33 | plans/260921-0347-hide-parent-reports-cluster/plan.md | plan doc | 1-97 | 🟡 | md | ý định hoãn #210, giữ nguyên backend, hướng dẫn bật lại (phần settings đã lỗi thời — OQ-07, OQ-10) |

Không có S-id nào trỏ tài liệu nghiệp vụ `.md` riêng cho feature (existing_doc = null;
#173 chỉ xuất hiện dưới dạng số issue trong comment code).
