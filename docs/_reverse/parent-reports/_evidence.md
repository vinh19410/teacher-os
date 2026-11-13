---
feature: parent-reports
type: reverse-evidence
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — parent-reports

Bằng chứng thô theo hạng mục. Cite dạng `repo-relative/path:line`; range đã kiểm EOF
bằng awk END NR và nội dung bằng sed/grep.

## §Cờ cụm và cơ chế ẩn

- `PARENT_REPORTS_ENABLED = false` — hằng tĩnh export, chú thích module "Static
  feature flags for deferred feature clusters. Flip a constant to re-enable a hidden
  cluster; no runtime toggle needed." — apps/web/src/lib/features.ts:3-7.
- Mục nav "Báo cáo" nhóm "Kinh doanh", href /reports, `enabled: PARENT_REPORTS_ENABLED`
  — apps/web/src/components/layout/sidebar.tsx:106-124 (enabled :121); import :24.
- Shell lọc mục `enabled !== false` khỏi sidebar —
  packages/ui/src/components/app-shell/nav-group.tsx:207-209.
- ⌘K dùng `teacherNavForViewer(...)` + cùng bộ lọc `enabled !== false` —
  apps/web/src/components/command-search/search-index.ts:178-191 (filter :182).
- beforeLoad redirect `/reports` → `/dashboard` khi cờ tắt —
  apps/web/src/routes/_auth/reports.tsx:15-22; test throw redirect —
  apps/web/src/routes/_auth/reports.test.tsx:158-165.
- Service worker allowlist giữ `"/reports": true` — apps/web/src/routes-matcher.ts:13;
  test assert có trong danh sách — apps/web/src/routes-matcher.test.ts:24.
- Breadcrumb "/_auth/reports" → "Báo cáo phụ huynh" —
  apps/web/src/components/layout/app-shell.tsx:56.
- Active-key map "/reports" → "reports" (vô hại khi mục nav bị lọc) —
  apps/web/src/components/layout/sidebar.tsx:204.
- Test chốt cờ: mục reports `enabled` phải là false —
  apps/web/src/components/layout/sidebar.test.tsx:178-184.
- Test suite cờ BẬT cho hồ sơ học viên: mock `PARENT_REPORTS_ENABLED: true`, chú
  thích "Parent reports ship behind a static flag; this suite covers the enabled UI"
  — apps/web/src/routes/_auth/students/$studentId.reports.test.tsx:17-18.

## §Trang "Báo cáo phụ huynh" (S2)

- Hằng `isZaloConnected = false` + chú thích #172 "When unconnected, the CTA / claim
  'Gửi qua Zalo OA' is hidden to prevent fake integration promises; the UI honestly
  reports the report count and connection status badge" —
  apps/web/src/routes/_auth/reports.tsx:38-42.
- Kicker 2 nhánh: khi "kết nối" → "Gửi qua Zalo OA · N báo cáo"; khi chưa → đếm
  ("N báo cáo" / "Chưa có báo cáo nào") + Badge "Zalo OA: Chưa kết nối" —
  apps/web/src/routes/_auth/reports.tsx:64-84.
- Nút action "+ Tạo báo cáo tuần" → mở modal — :85-90; render modal :188.
- 3 Stat: "Tổng báo cáo" = reports.length; "Đã gửi" = lọc status !== "draft";
  "Phụ huynh đã đọc" = đếm r.read truthy — :91-104.
- SectionTitle "Báo cáo đã gửi" mô tả "Báo cáo tuần gửi phụ huynh qua Zalo OA" — :105-109.
- Bảng DataTable 6 headers: "Học viên", "Chu kỳ", "Số buổi", "Trạng thái", "Gửi lúc",
  "Phụ huynh xem" — :116-124; ô học viên = avatar + tên ghép từ danh sách học viên :125-132;
  nhãn trạng thái map {read: "Đã đọc", sent: "Đã gửi", draft: "Nháp"} + variant
  {read: success, sent: accent, draft: muted} :24-33, :139-141; ô "Phụ huynh xem":
  mốc đọc hoặc "Chưa mở" :145-153.
- Empty state bảng: "Chưa có báo cáo nào được gửi." — :110-113.
- Nhật ký: lọc status sent|read → {date: mốc gửi, title: "Báo cáo tuần → {tên}",
  desc: "Zalo OA · Phụ huynh đã mở {mốc}" | "Zalo OA · Đã gửi", channel: "Zalo OA"},
  reverse() mới nhất trước — :44-58; section "Nhật ký gửi tin nhắn" + empty "Chưa có
  nhật ký gửi tin nhắn." — :160-187.

## §Modal tạo báo cáo tuần (S3)

- 4 trường: Select "Học viên" (defaultStudentId ?? học viên đầu tiên ?? ""), Input
  "Chu kỳ" placeholder "VD: 01–07/09", Textarea "Nội dung báo cáo" placeholder "Nhập
  nội dung báo cáo...", Select "Gửi qua" mặc định "Zalo OA", options: "Zalo OA (Chưa
  kết nối)" value="Zalo OA" và "Email" —
  apps/web/src/components/modals/create-report-modal.tsx:17-23, :85-119.
- Validate save(): "Chọn học viên trước khi lưu." :28-31; "Nhập chu kỳ báo cáo
  (VD: 01–07/09)." :32-35; gửi mà content rỗng → "Nhập nội dung báo cáo trước khi
  gửi." :36-39.
- dispatch {type: "create-report", payload 5 trường} — :43-52; busy guard chặn double
  submit :27.
- Kết quả: definite-failure → "Không gửi được báo cáo — thử lại." / "Không lưu được
  nháp — thử lại.", giữ modal; outcome-unknown → "Không chắc báo cáo đã lưu — kiểm
  tra danh sách trước khi thử lại." (chú thích: giữ modal mở an toàn hơn nguy cơ ghi
  đôi khi retry mù); thành công → reset period/content, đóng modal — :53-73.
- Nút "Lưu nháp" (secondary, save("draft")) + "Gửi báo cáo" (submit, save("sent")),
  cùng disabled khi busy — :125-138.

## §Client wiring (S10-S15)

- Kiểu lệnh: `create-report` payload {studentId, period, content, channel, status:
  "draft" | "sent"}, chú thích #173 "sent requires content server-side; drafts
  persist as-is with an empty sent stamp" — apps/web/src/lib/data-actions.ts:95-106.
- kernelCommand: `create-report` → path "/api/reports", body 5 trường verbatim, chú
  thích ".strict() — exactly these five fields" — apps/web/src/lib/repos/kernel.ts:181-186;
  test ánh xạ — apps/web/src/lib/repos/kernel-command.test.ts:6-33.
- Result kinds: refreshed (2xx + snapshot áp lại) / committed (2xx nhưng refetch lỗi)
  / definite-failure (4xx — an toàn retry) / outcome-unknown (5xx/408/429/mất vận
  chuyển) — apps/web/src/lib/repos/kernel.ts:393-421.
- mapReports: snapshot.reports → Report {id, sid: studentId, period, sessions, status,
  sent, read} — apps/web/src/lib/repos/reports.ts:4-14; gắn vào kho apps/web/src/lib/repos/kernel.ts:373, khóa slice kernel.ts:561.
- fetchKernelSnapshot → GET /api/kernel (một lần lấy toàn bộ dữ liệu, có reports) —
  apps/web/src/lib/repos/kernel.ts:622-640; kernelQueryOptions :672-677; trang đọc từ
  kho này, KHÔNG gọi GET /api/reports (negative-search #11 — reverse-gaps.md).
- Reducer: create-report thuộc nhóm no-op "figures come from the post-write snapshot
  refresh — server-owned" — apps/web/src/lib/data-store-reducer.ts:97-105.
- Kiểu Report client (7 trường, không content/channel) — apps/web/src/lib/mock-data.ts:172-180;
  trường kho :271, :291; khởi tạo reports: [] — apps/web/src/lib/kernel-state.ts:8.

## §Server (S17-S20)

- Schema bảng report: id (PK text), orgId (FK organization, cascade, NOT NULL),
  studentId (FK student, cascade, NOT NULL), period (default ""), sessions (int,
  default 0), status (ReportStatus, default "draft"), sent (default ""), read
  (default ""), content (default "", chú thích #173 "what the teacher wrote and
  through which channel"), channel (default ""), createdAt (timestamp_ms, default
  unixepoch ms); 2 index — packages/db/src/schema/report.ts:9-35; ReportStatus =
  "read" | "sent" | "draft" :6; chú thích bảng: "Org-scoped parent report projection;
  created via POST /api/reports (#173). Real delivery is not wired — channel is
  metadata." :8.
- GET /api/reports (list): đòi kernelCtx, trả loadReports(orgId) —
  apps/server/src/routes/reporting/index.ts:25-36.
- POST /api/reports: 401 nếu thiếu ctx :60-61; 400 "invalid json" :63-68; 400 "invalid
  body" khi schema fail :69-70; học viên phải tồn tại + cùng org, không thì 400
  "unknown student" :73-79; insert với id crypto.randomUUID(), sessions: 0, sent =
  sentStamp(now) chỉ khi status "sent" else "", read: "" :81-96; guard 500 "report
  write conflict" cho RETURNING rỗng :97-99; 201 {id} :100.
- sentStamp: "dd/MM HH:mm" qua Intl timeZone "Asia/Ho_Chi_Minh", chú thích giải thích
  Workers chạy UTC và định dạng khớp seeded display "25/08 20:00" —
  apps/server/src/routes/reporting/index.ts:42-52.
- loadReports: select 7 cột hiển thị (không content/channel), innerJoin student với
  điều kiện cùng org (che dòng quan hệ chéo org), where orgId, orderBy asc(createdAt),
  asc(id) — apps/server/src/routes/reporting/loaders.ts:9-30.
- Mount: `kernel.route("/reports", reportRoutes(deps))` — apps/server/src/routes/kernel.ts:3496;
  mount SAU middleware Origin/content-type (chú thích "the sub-router's POSTs are
  CSRF-guarded exactly like the kernel writes") :3487-3489.
- CSRF middleware kernel: POST/PUT/PATCH/DELETE đòi Origin trong allowlist (403
  "origin not allowed"); POST đòi Content-Type JSON (415) —
  apps/server/src/routes/kernel.ts:185-206.

## §Hợp đồng (S16)

- reportCreateSchema: {studentId min1, period trim min1 max120, content max4000,
  channel enum ["Zalo OA", "Email"], status enum ["draft", "sent"]} .strict() +
  refine "content required when sending"; chú thích #173: gửi rỗng sẽ tạo log cho
  tin không tồn tại; nháp được rỗng; kênh chỉ metadata —
  packages/api/src/contracts.ts:1298-1315.
- KernelReportRow: 7 trường hiển thị (id, studentId, period, sessions, status
  read|sent|draft, sent, read) — packages/api/src/contracts.ts:1894-1902.
- snapshot.reports: KernelReportRow[] — packages/api/src/contracts.ts:1940.

## §Migration

- 0005_mature_sasquatch.sql: CREATE TABLE `report` (23-35) + index
  report_org_created_idx (org_id, created_at, id) :37 + report_student_idx :38; cùng
  lô tạo comment_bank (:1-10) và notif (:11-22) — hai bảng kia thuộc feature khác.
- 0015_high_wither.sql: ALTER TABLE report ADD content, channel (mặc định "") —
  packages/db/src/migrations/0015_high_wither.sql:1-2.
- 0016_real_butterfly.sql: workspace_settings thêm tpl_report default "Tuần này
  {{student_name}} học {{sessions}} buổi, chuyên cần {{attendance}}. Band gần nhất:
  {{latest_band}}. Việc ở nhà: {{homework}}. Chi tiết: {{report_link}}" —
  packages/db/src/migrations/0016_real_butterfly.sql:6. Bảng này đã MỘ (#321):
  "toàn bộ API/web reader-writer đã gỡ... Feature mới KHÔNG tái sử dụng bảng này" —
  packages/db/src/schema/settings.ts:6-10; tplReport vẫn trong schema bảng :23-26.

## §Tests (R1 — test là bằng chứng hạng nhất)

GAP-3 (R1): `grep -n "\.skip\|\.todo\|\.only"` trên S24-S29 → 0 hit. Nhóm:

- Server (apps/server/src/kernel.test.ts, nhóm ~2440-2768):
  - Org mới: snapshot + GET 3 endpoint trả [] — :2453-2460.
  - Chèn thẳng DB + reload + DTO tường minh; org khác vẫn [] — :2460-2521.
  - Quan hệ chéo org (report org A trỏ student org B) bị ẩn khỏi snapshot lẫn list —
    :2523-2544.
  - POST gửi có nội dung → 201, status "sent", mốc gửi khác rỗng, mốc đọc rỗng —
    :2660-2680.
  - POST nháp content rỗng → 201, "draft", mốc gửi rỗng — :2682-2699.
  - POST gửi content khoảng trắng → 400 — :2701-2714.
  - POST student chéo org → 400 và snapshot org B vẫn [] — :2716-2730.
  - POST period rỗng + channel "Fax" → 400; không đăng nhập → 401 — :2732-2756.
  - Không có route mark-read cho notif (PATCH → 404) + report chèn tay vẫn đọc được —
    :2758-2768.
- Trang (apps/web/src/routes/_auth/reports.test.tsx):
  - Empty state trung thực: "Chưa có báo cáo nào", "Zalo OA: Chưa kết nối", KHÔNG
    />Gửi qua Zalo OA</, KHÔNG demo cũ ("Minh Anh", "Quốc Bảo", "18/08"...) — :63-102.
  - Có dữ liệu: đếm "2 báo cáo", nhãn "Đã gửi"/"Nháp", nhật ký có "Báo cáo tuần →
    Nguyễn Văn A" + "Phụ huynh đã mở 08/09 11:30", nháp KHÔNG vào nhật ký — :104-145.
  - Modal option: "Zalo OA (Chưa kết nối)", value="Zalo OA", "Email" — :147-155.
  - Redirect cờ tắt: beforeLoad throw redirect — :158-165.
- Modal (apps/web/src/components/modals/create-report-modal.test.tsx):
  - Mở rỗng (không prefilled) — :61-70; gửi/lưu nháp persist đúng 5 trường và đóng —
    :72-97 (trim chu kỳ "01–07/10").
  - Chặn gửi rỗng + vẫn lưu nháp được — :99-114.
  - Server từ chối (422): giữ chữ đã gõ, "Không gửi được báo cáo — thử lại.", không
    đóng — :116-133.
  - Mất fetch: "Không chắc báo cáo đã lưu — kiểm tra danh sách trước khi thử lại.",
    không đóng — :137-149.
- Hồ sơ học viên cờ BẬT (apps/web/src/routes/_auth/students/$studentId.reports.test.tsx):
  nút "Tạo báo cáo" mở dialog với Select "Học viên" đúng học viên đang xem (st-2) —
  :19-47.
- Sidebar (apps/web/src/components/layout/sidebar.test.tsx): mục reports tồn tại
  trong TEACHER_NAV và enabled === false — :178-184.

## §Cross-repo hops

| Từ | Đến | Bằng chứng |
|---|---|---|
| UI web (modal) | client action type | apps/web/src/components/modals/create-report-modal.tsx:43-52 → apps/web/src/lib/data-actions.ts:95-106 |
| client action | HTTP POST | apps/web/src/lib/repos/kernel.ts:181-186 → /api/reports |
| HTTP | server route | apps/server/src/routes/kernel.ts:3496 → apps/server/src/routes/reporting/index.ts:54-103 |
| server route | hợp đồng Zod | apps/server/src/routes/reporting/index.ts:1-12 (import reportCreateSchema) |
| server route | bảng DB | packages/db/src/schema/report.ts:9-35; migration 0005/0015 |
| snapshot | UI | packages/api/src/contracts.ts:1940 → apps/web/src/lib/repos/reports.ts:4-14 → apps/web/src/routes/_auth/reports.tsx:44-60 |
| cờ UI | 4 điểm gắn | apps/web/src/lib/features.ts:7 → sidebar.tsx:121, reports.tsx:17, $studentId.tsx:218,382 |

## §Ranh giới feature (tránh trộn)

- comment_bank: cùng module server (reporting/index.ts:105-153) + cùng lô migration
  0005 nhưng phục vụ Chấm bài (client gọi từ grade-modal) —
  apps/web/src/components/modals/grade-modal.tsx:116; UI hiển thị ở trang bài tập —
  apps/web/src/routes/_auth/assignments/$assignmentId.tsx:128.
- notif: cùng module server (loaders.ts:32-47) nhưng là chuông thông báo + màn Nhật
  ký thông báo (#454) — apps/web/src/components/layout/sidebar.tsx:79-85.
- Thẻ "Phụ huynh" (tên + SĐT) ở hồ sơ học viên = dữ liệu hồ sơ (parent_name,
  parent_phone trên bảng student), giữ nguyên khi cụm ẩn —
  apps/web/src/routes/_auth/students/$studentId.tsx:282-287;
  packages/db/src/schema/student.ts:29-30; plans/260921-0347-hide-parent-reports-cluster/plan.md:40.
