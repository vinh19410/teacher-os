---
type: reverse-srs
feature: dashboard
status: draft
updated: 2026-11-11
confidence_summary: "✅137 🔵7 🟡14 — OQ 6 (đếm cơ học trên 7 file, loại dòng legend/front-matter: raw ✅140 🔵10 🟡17)"
links:
  - reverse-sources.md
  - reverse-gaps.md
  - _evidence.md
  - srs/dashboard-reverse-flows.md
  - srs/dashboard-reverse-states.md
  - srs/dashboard-reverse-erd.md
  - usecases/dashboard-reverse-usecase-index.md
---

# dashboard — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận. Nhãn chứng thực cột mô tả + Nguồn; cột Priority (FR/NFR) và Severity (error matrix) là phân loại của nhà phân tích, không có nguồn trong code/test.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) (S1–S30).
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md) (OQ-1…OQ-6, GAP-1…GAP-3, CF-1, CF-2, INF-1…INF-3).
- Feature `dashboard` là trang tổng quan đọc-chỉ của app giáo viên: giáo viên đăng nhập, thấy lời chào, 3 thẻ "Việc cần làm hôm nay" đếm từ server, 4 KPI + lịch hôm nay + lịch sắp tới + bảng "Cần kiểm tra" tính từ kernel snapshot. Feature KHÔNG có endpoint ghi nào — điểm ghi duy nhất gián tiếp là các CTA dẫn sang màn domain khác. 🔵 [S3 — apps/web/src/routes/_auth/dashboard.tsx:67-296; S12 — apps/web/src/routes/_auth/dashboard.test.tsx:152-153]
- Toàn bộ tính toán bộ đếm nằm ở hàm thuần `computeReminders` phía server, route chỉ bọc session và parse lại hợp đồng. ✅ [S4 — apps/server/src/routes/dashboard-reminders.ts:64-85, apps/server/src/routes/dashboard-reminders.ts:294-296]
- PDR (docs/project-overview-pdr.md) không mô tả trang dashboard; các quyết định bền vững PDR liên quan gián tiếp: org-scoped kernel, auth boundary, student 403. 🔵 [S1 — docs/project-overview-pdr.md:3-40]

### 0.3 Khác biệt với tài liệu chính (chỉ khi feature trùng doc hiện có)

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md`) | Đề xuất |
|------|------------------------|-----------------------------------|---------|
| Trang tổng quan | Dashboard tồn tại như mô tả ở Mục 1, mọi số liệu derived từ kernel/reminders API | PDR không nhắc "dashboard"/"tổng quan" (grep 0 hit) | `/gap` (GAP-1): PDR thiếu mô tả landing page của app |
| Scope dữ liệu bộ đếm | `resolveReminderScope` luôn trả `org` — chưa có scope "lớp được gán" | PDR không nhắc vai trò Trợ giảng trên dashboard | Không cần `/cr`; dead branch → OQ-1 |
| Quyền tài chính trên thẻ học phí | Thẻ 3 chỉ trả khi `canAccessFinance(role)` (teacher/owner/admin) | PDR không nhắc phân quyền tài chính trên dashboard | Không cần `/cr`; khớp hướng "least privilege" PDR |

## 1. Scope

Feature `dashboard` đặc tả trang `/dashboard` — điểm khởi đầu ngày làm việc của giáo viên trong workspace org:

- **Điều hướng & truy cập**: route gốc `/` tự chuyển hướng sang `/dashboard` (S20 — apps/web/src/routes/index.tsx:3-7 ✅); mục "Tổng quan" đứng đầu sidebar nhóm "Giảng dạy" (S21 — apps/web/src/components/layout/sidebar.tsx:34-40 ✅); breadcrumb "Tổng quan" (S22 — apps/web/src/components/layout/app-shell.tsx:33 ✅); chưa đăng nhập bị đẩy về `/login` (S3 — apps/web/src/routes/_auth/dashboard.tsx:70-72 ✅; S26 — apps/web/src/routes/_auth/route.tsx:6-37).
- **Khu vực "Việc cần làm hôm nay"**: 3 thẻ đếm lấy từ `GET /api/dashboard/reminders` (TOS-6, issue #439), đặt trên hàng KPI (S3 — apps/web/src/routes/_auth/dashboard.tsx:126-164 ✅; S5 — apps/server/src/routes/kernel.ts:3508-3509 ✅).
  - Thẻ 1 — "Ca học hôm nay chưa điểm danh": số ca + tối đa 3 dòng xem trước, CTA dẫn `/attendance?date=<hôm nay VN>&status=pending` (S7 — apps/web/src/components/dashboard/reminder-cards.tsx:45-56 ✅).
  - Thẻ 2 — "Bài tập quá hạn chấm > 24h": tổng + Writing/Speaking, CTA dẫn `/grading?status=awaiting` (S7 — apps/web/src/components/dashboard/reminder-cards.tsx:57-67 ✅).
  - Thẻ 3 — "Học phí đến hạn / quá hạn thu": số học viên + tổng tiền, CTA dẫn `/tuition`; CHỈ render khi response có block `tuition` (S7 — apps/web/src/components/dashboard/reminder-cards.tsx:68-77 ✅).
- **Hàng 4 KPI** tính từ kernel snapshot phía client: "Buổi học hôm nay" (+ "N buổi còn lại tuần này"), "Học viên" (+ "N cần kiểm tra"), "Bài tập chưa có điểm", "Còn phải thu" (hot khi > 0, sub "N hóa đơn") (S3 — apps/web/src/routes/_auth/dashboard.tsx:167-193 ✅).
- **Lịch hôm nay**: các buổi-lớp gom theo (classId, time), sắp giờ tăng, loại đã hủy/nghỉ lễ; rỗng có empty-state; link "Xem tuần →" sang `/schedule` (S3 — apps/web/src/routes/_auth/dashboard.tsx:194-225 ✅; S8 — apps/web/src/lib/dashboard-from-kernel.ts:13-25, apps/web/src/lib/dashboard-from-kernel.ts:43-78 ✅).
- **Lịch sắp tới**: phần còn lại của tuần (mai → Chủ nhật) theo giờ VN, nhóm theo ngày; legacy (date NULL) so thứ trong tuần, lớp dated so ngày ISO (S3 — apps/web/src/routes/_auth/dashboard.tsx:226-258 ✅; S8 — apps/web/src/lib/dashboard-from-kernel.ts:79-108 ✅).
- **"Cần kiểm tra"**: bảng học viên rủi ro với 2 tín hiệu — vắng không phép trong 14 ngày (`absent`) và "Miss check-in" (buổi upcoming có thứ TRƯỚC hôm nay trong tuần Mon=1); cột Học viên / Vấn đề / Còn (số buổi gói còn lại) (S3 — apps/web/src/routes/_auth/dashboard.tsx:260-292 ✅; S8 — apps/web/src/lib/dashboard-from-kernel.ts:110-178 ✅).
- **Lời chào theo giờ VN**: Sáng (05–11), Chiều (12–17), Tối (18–04) + kicker thứ/ngày vi-VN (S3 — apps/web/src/routes/_auth/dashboard.tsx:107-125 ✅; S8 — apps/web/src/lib/dashboard-from-kernel.ts:190-214 ✅).
- **Làm mới bộ đếm**: nút "Làm mới dữ liệu" thủ công + tự refetch khi kernel snapshot refresh sau mỗi action (cơ chế key gắn `dataUpdatedAt`) (S3 — apps/web/src/routes/_auth/dashboard.tsx:81-96, apps/web/src/routes/_auth/dashboard.tsx:135-142 ✅; S9 — apps/web/src/lib/repos/dashboard-reminders.ts:16-24 ✅).
- **Ranh giới dữ liệu**: mọi truy vấn bộ đếm có predicate `orgId` (chuẩn IDOR); org khác không bao giờ đếm (S4 — apps/server/src/routes/dashboard-reminders.ts:66-67, apps/server/src/routes/dashboard-reminders.ts:110-131 ✅; S11 — apps/server/src/routes/dashboard-reminders.test.ts:270-275 ✅).

**Boundary (out of scope):**

- Chi tiết điểm danh (màn `/attendance`, chính sách trừ buổi) — feature `attendance`; dashboard chỉ CTA kèm query đã lọc. ✅ [S7 — apps/web/src/components/dashboard/reminder-cards.tsx:53-55] — *ranh giới: dashboard chỉ hiển thị đếm + preview, không thao tác.*
- Hàng chờ chấm và thao tác chấm — feature `grading`; dashboard chỉ CTA `/grading?status=awaiting`. (S7 — apps/web/src/components/dashboard/reminder-cards.tsx:64-66)
- Hóa đơn/thu học phí — feature `tuition`; dashboard chỉ CTA `/tuition`. (S7 — apps/web/src/components/dashboard/reminder-cards.tsx:74-76)
- Dashboard là READ-ONLY: không có nút điểm danh/check-in nào trên trang (assert test #278). ✅ [S12 — apps/web/src/routes/_auth/dashboard.test.tsx:152-153; negative-search §7 _evidence.md: không có mutation nào từ trang]
- Lịch dạy chi tiết (grid tuần/tháng) — feature `schedule`; dashboard chỉ 2 khối "Lịch hôm nay"/"Lịch sắp tới". (S3 — apps/web/src/routes/_auth/dashboard.tsx:194-258)
- Gợi ý việc (task list) tự tạo/xóa — KHÔNG tồn tại trong code: 3 thẻ là đếm read-only, không thêm/sửa/xóa reminder nào. ✅ [negative-search §7: `grep -rn "reminder" apps/server/src/routes --include=*.ts` chỉ có dashboard-reminders.ts (read) và notification-logs/debt-reminders (feature khác)] → OQ-1.
- Blocked view cho tài khoản sai app (student/admin) — gate biên, UI blocked thuộc shell chung (S23 — apps/e2e/specs/account-role-separation.spec.ts:137-145 ✅).

## 2. Actors & Stakeholders

| Actor | Loại (người/hệ thống/ngoài) | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|-----------------------------|----------|--------------|-------|------|
| Giáo viên (org teacher/owner/admin membership) | người | Nhìn một trang biết: hôm nay dạy gì, việc gì tồn (điểm danh, chấm bài, thu tiền), học viên nào rủi ro | Có | S3 — apps/web/src/routes/_auth/dashboard.tsx:67-96; S14 — packages/auth/src/role.ts:75-87 | ✅ |
| Kernel snapshot server (GET /api/kernel) | hệ thống | Cung cấp dữ liệu tổng hợp org cho KPI + lịch + risk | Có (bên trong luồng) | S27 — apps/web/src/lib/repos/kernel.ts:622-662 | ✅ |
| TanStack Query (client cache) | hệ thống | Nối vòng đời bộ đếm vào snapshot: snapshot mới → key mới → refetch | Có (bên trong luồng) | S9 — apps/web/src/lib/repos/dashboard-reminders.ts:16-24; S3 — apps/web/src/routes/_auth/dashboard.tsx:81-96 | ✅ |
| Tài khoản role `student` chạm app giáo viên | hệ thống (gate) | Bị chặn 403 `ACCOUNT_STUDENT_ROLE`, không bootstrap org | Không (chỉ gate biên) | S6 — apps/server/src/app.ts:224-232; S2 — packages/api/src/contracts.ts:1981-1982 | ✅ |
| Tài khoản role `admin` chạm kernel tree | hệ thống (gate) | Bị chặn 403 `ACCOUNT_ADMIN_ROLE` | Không (chỉ gate biên) | S6 — apps/server/src/app.ts:235-242; S2 — packages/api/src/contracts.ts:1985 | ✅ |
| Membership role `ta` / `class_teacher` (Trợ giảng / GV đứng lớp) | người (một phần) | Nhận bộ đếm KHÔNG kèm block học phí (không có quyền tài chính) | Có (đối với ẩn thẻ học phí) | S14 — packages/auth/src/role.ts:79-87; S4 — apps/server/src/routes/dashboard-reminders.ts:273-280 | ✅ |
| Trợ giảng với scope "lớp được gán" | người (tương lai) | Bộ đếm thu hẹp theo lớp phân công, không có tài chính | Không — dead branch, điểm cắm Phase 5 (FR-029) | S4 — apps/server/src/routes/dashboard-reminders.ts:45-54, apps/server/src/routes/dashboard-reminders.ts:273-280 | 🟡 → OQ-1 |

## 3. Functional Requirements (FR)

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-dashboard-001 | Landing + bảo vệ route | `/` tự redirect sang `/dashboard`; vào `/dashboard` khi chưa có session bị đẩy `/login`; session đọc từ context `_auth`. | P0 | test | S20 — apps/web/src/routes/index.tsx:3-7; S3 — apps/web/src/routes/_auth/dashboard.tsx:38-40, apps/web/src/routes/_auth/dashboard.tsx:68-72; S26 — apps/web/src/routes/_auth/route.tsx:6-37 | ✅ |
| FR-dashboard-002 | Khu vực "Việc cần làm hôm nay" | Hiển thị tiêu đề "Việc cần làm hôm nay (Thứ X, dd/mm/yyyy)" suy từ `date` ISO trả về (không phụ thuộc múi máy); fallback nhãn khi chưa có data. | P0 | test | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:28-36; S3 — apps/web/src/routes/_auth/dashboard.tsx:128-134; S13 — apps/web/src/components/dashboard/reminder-cards.test.tsx:116-125 | ✅ |
| FR-dashboard-003 | Thẻ ca học chưa điểm danh | Số ca (`attendance.pending`) + tối đa 3 dòng xem trước "Tên lớp (HH:mm – HH:mm-kết-thúc)" ghép `dur`; CTA "Mở Điểm danh ngày →" dẫn `/attendance?date=&status=pending`; cả thẻ là 1 vùng bấm. | P0 | test | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:45-56, apps/web/src/components/dashboard/reminder-cards.tsx:8-21, apps/web/src/components/dashboard/reminder-cards.tsx:96-119; S10 — apps/e2e/specs/dashboard-reminders.spec.ts:143-149 | ✅ |
| FR-dashboard-004 | Thẻ bài quá hạn chấm > 24h | Số bài (`overdueGrading.count`) + dòng "N Writing · M Speaking"; CTA "Mở Không gian chấm →" dẫn `/grading?status=awaiting`. | P0 | test | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:57-67; S10 — apps/e2e/specs/dashboard-reminders.spec.ts:154-163 | ✅ |
| FR-dashboard-005 | Thẻ học phí đến hạn / quá hạn | Số học viên (`tuition.students`) + tổng tiền outstanding định dạng VND; CTA "Mở Sổ học phí →" dẫn `/tuition`; KHÔNG render khi response thiếu block `tuition`. | P0 | test | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:68-77; S13 — apps/web/src/components/dashboard/reminder-cards.test.tsx:66-74 | ✅ |
| FR-dashboard-006 | Làm mới bộ đếm | Nút "Làm mới dữ liệu" (disabled khi đang fetch) refetch thủ công; tự động refetch khi kernel snapshot refresh (timestamp `dataUpdatedAt` nằm trong query key). | P1 | test | S3 — apps/web/src/routes/_auth/dashboard.tsx:81-96, apps/web/src/routes/_auth/dashboard.tsx:135-142; S9 — apps/web/src/lib/repos/dashboard-reminders.ts:16-24; S12 — apps/web/src/routes/_auth/dashboard.test.tsx:248-282 | ✅ |
| FR-dashboard-007 | 4 KPI từ kernel | "Buổi học hôm nay" = số ca gom theo (classId, time) hôm nay, sub "N buổi còn lại tuần này" khi > 0; "Học viên" = tổng số học viên, sub "N cần kiểm tra"; "Bài tập chưa có điểm" = số assignment chưa graded; "Còn phải thu" = outstanding VND (hot khi > 0), sub "N hóa đơn". | P0 | test | S3 — apps/web/src/routes/_auth/dashboard.tsx:114-115, apps/web/src/routes/_auth/dashboard.tsx:167-193; S8 — apps/web/src/lib/dashboard-from-kernel.ts:13-25; S18 — apps/web/src/lib/tuition-from-kernel.ts:35-48 | ✅ |
| FR-dashboard-008 | Lịch hôm nay | Liệt kê buổi-lớp hôm nay (gom (classId, time), dedupe theo học viên, sort giờ tăng); mỗi dòng: giờ (cột co nội dung), tên lớp, meta "dur' · type · topic" chỉ nối phần có giá trị; empty state "Không có buổi học nào hôm nay."; link "Xem tuần →" sang `/schedule`. | P0 | test | S3 — apps/web/src/routes/_auth/dashboard.tsx:194-225, apps/web/src/routes/_auth/dashboard.tsx:47-65; S8 — apps/web/src/lib/dashboard-from-kernel.ts:36-78; S12 — apps/web/src/routes/_auth/dashboard.test.tsx:112-154 | ✅ |
| FR-dashboard-009 | Lịch sắp tới | Phần còn lại của tuần (mai → CN theo lịch VN): lớp dated chỉ tính khi `date` ∈ các ngày còn lại; lớp legacy (date NULL) tính khi thứ > thứ hôm nay; loại cancelled/holiday; nhóm theo ngày với nhãn thứ; empty state riêng. | P1 | test | S8 — apps/web/src/lib/dashboard-from-kernel.ts:79-108; S3 — apps/web/src/routes/_auth/dashboard.tsx:226-258 | ✅ |
| FR-dashboard-010 | Bảng "Cần kiểm tra" | Học viên có ≥1 tín hiệu rủi ro: `absent` (vắng không phép trong 14 ngày) và/hoặc `missed-check-in` (buổi upcoming có thứ trước hôm nay, Mon=1 — thứ Hai luôn 0 miss); nhãn "Vắng"/"Miss check-in"; cột "Còn" = số buổi gói còn lại; empty state "Không có học viên rủi ro."; tín hiệu chỉ từ kernel lessons, không dùng cờ atRisk/tuition. | P0 | test | S8 — apps/web/src/lib/dashboard-from-kernel.ts:110-178; S3 — apps/web/src/routes/_auth/dashboard.tsx:42-45, apps/web/src/routes/_auth/dashboard.tsx:260-292; S12 — apps/web/src/routes/_auth/dashboard.test.tsx:156-203 | ✅ |
| FR-dashboard-011 | Lời chào + kicker | Lời chào theo giờ VN: Sáng 05:00–11:59, Chiều 12:00–17:59, Tối còn lại; tên từ session, fallback "Giáo viên"; kicker = thứ + ngày vi-VN đầy đủ. | P2 | test | S8 — apps/web/src/lib/dashboard-from-kernel.ts:190-214; S3 — apps/web/src/routes/_auth/dashboard.tsx:74, apps/web/src/routes/_auth/dashboard.tsx:107-125 | ✅ |
| FR-dashboard-012 | Org scoping bộ đếm | Mọi truy vấn (buổi học/lớp/ghi danh, bài nộp/đề/bộ đề, hóa đơn) đều lọc `orgId` của session; dữ liệu org khác không được đếm; join đều có org predicate. | P0 | test | S4 — apps/server/src/routes/dashboard-reminders.ts:66-67, apps/server/src/routes/dashboard-reminders.ts:101-132, apps/server/src/routes/dashboard-reminders.ts:161-258; S11 — apps/server/src/routes/dashboard-reminders.test.ts:270-275, apps/server/src/routes/dashboard-reminders.test.ts:495-509 | ✅ |
| FR-dashboard-013 | Trạng thái tải & lỗi bộ đếm | Đang tải: 3 khối skeleton (aria-busy); lỗi: câu "Không tải được bộ đếm nhắc việc." + nút "Thử lại"; chưa có kernel snapshot thì chưa fetch (tránh fetch thừa với key 0). | P0 | test | S3 — apps/web/src/routes/_auth/dashboard.tsx:92-96, apps/web/src/routes/_auth/dashboard.tsx:128-164 | ✅ |
| FR-dashboard-014 | Zero inbox trung thực | Đếm 0 → thẻ chuyển tông trung tính, hiển thị "Đã hoàn tất hôm nay" thay cho số 0, CTA vẫn dẫn đúng đích. | P1 | test | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:6, apps/web/src/components/dashboard/reminder-cards.tsx:87-122; S13 — apps/web/src/components/dashboard/reminder-cards.test.tsx:76-92 | ✅ |
| FR-dashboard-015 | Gate vai trò trên API | Chưa đăng nhập → 401 `unauthorized`; session `student` → 403 `ACCOUNT_STUDENT_ROLE` (không bootstrap org); `admin` → 403 `ACCOUNT_ADMIN_ROLE`; email ngoài allowlist → 403 `ACCOUNT_TEACHER_NOT_ALLOWED` / chưa xác thực → 403 `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` (khi cấu hình TEACHER_EMAILS). | P0 | test | S4 — apps/server/src/routes/dashboard-reminders.ts:285-287; S6 — apps/server/src/app.ts:224-268; S11 — apps/server/src/routes/dashboard-reminders.test.ts:597-611; S2 — packages/api/src/contracts.ts:1981-1996 | ✅ |
| FR-dashboard-016 | Ẩn thẻ học phí theo quyền tài chính | `resolveReminderScope(role)` gắn `finance = canAccessFinance(role)`: teacher/owner/admin true; ta/class_teacher/giá trị lạ false → response KHÔNG có block `tuition` (bỏ hẳn key, không trả null/0). | P0 | test | S4 — apps/server/src/routes/dashboard-reminders.ts:231-258, apps/server/src/routes/dashboard-reminders.ts:268-280; S14 — packages/auth/src/role.ts:75-87; S11 — apps/server/src/routes/dashboard-reminders.test.ts:514-542 | ✅ |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-dashboard-001 | performance | API bộ đếm phản hồi trong ≤ 2 giây (AC-001, đo response server). | P1 | e2e đo `elapsedMs ≤ 2000` | S10 — apps/e2e/specs/dashboard-reminders.spec.ts:14-16, apps/e2e/specs/dashboard-reminders.spec.ts:106-112 | ✅ |
| NFR-dashboard-002 | performance | `computeReminders` dưới 200ms với bộ seed unit test hiện tại. | P2 | test unit đo performance.now | S11 — apps/server/src/routes/dashboard-reminders.test.ts:624-630 | ✅ |
| NFR-dashboard-003 | security | Mọi truy vấn bộ đếm có predicate `orgId` (chuẩn IDOR grading.ts); không rò dữ liệu chéo org. | P0 | test (cô lập org) | S4 — apps/server/src/routes/dashboard-reminders.ts:66-67; S11 — apps/server/src/routes/dashboard-reminders.test.ts:270-275, apps/server/src/routes/dashboard-reminders.test.ts:495-501 | ✅ |
| NFR-dashboard-004 | correctness/múi giờ | Ngày + thứ trong tuần suy từ ISO giờ Việt Nam (UTC-anchored), không dùng `getDay()` của server UTC — server chạy UTC, 0h–7h giờ VN dễ lệch 1 ngày. | P0 | test (23:30 UTC Chủ nhật) | S4 — apps/server/src/routes/dashboard-reminders.ts:56-62; S15 — packages/api/src/vietnam-date.ts:20-39; S11 — apps/server/src/routes/dashboard-reminders.test.ts:562-583 | ✅ |
| NFR-dashboard-005 | contract integrity | Response parse lại qua zod `.strict()` trước khi trả; web cũng parse zod; không thừa/thiếu field. | P1 | test | S4 — apps/server/src/routes/dashboard-reminders.ts:294-296; S2 — packages/api/src/contracts.ts:2692-2716; S9 — apps/web/src/lib/repos/dashboard-reminders.ts:40 | ✅ |
| NFR-dashboard-006 | read-only UX | Dashboard không có nút thao tác dữ liệu (vd Điểm danh) — chỉ đọc + điều hướng. | P1 | test | S12 — apps/web/src/routes/_auth/dashboard.test.tsx:152-153 | ✅ |
| NFR-dashboard-007 | accessibility | Mỗi thẻ nhắc việc có đúng 1 điểm focus: toàn thẻ là link phủ inset-0 với aria-label "tiêu đề — CTA". | P1 | test | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:82-104; S10 — apps/e2e/specs/dashboard-reminders.spec.ts:144-149 | ✅ |
| NFR-dashboard-008 | honesty (empty org) | Org rỗng hiển thị trung thực: empty-state từng khối, không tên/khoản tiền demo, lời chào dùng tên session thật. | P0 | test | S12 — apps/web/src/routes/_auth/dashboard.test.tsx:205-225; S3 — apps/web/src/routes/_auth/dashboard.tsx:208-212, apps/web/src/routes/_auth/dashboard.tsx:265-268 | ✅ |
| NFR-dashboard-009 | resilience (deploy skew) | Observer kernel dùng `staleTime: Infinity` (không tự fetch), bộ đếm chỉ fetch khi đã có snapshot; fetch bộ đếm hủy được qua AbortSignal. | P2 | test | S3 — apps/web/src/routes/_auth/dashboard.tsx:87-96; S9 — apps/web/src/lib/repos/dashboard-reminders.ts:26-51 | ✅ |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-dashboard-001 | Bài "quá hạn chấm" = attempt `status="submitted"` + mode `assignment` (đề writing/speaking thuần HOẶC đề tự chấm có `writingPart`) HOẶC mode `practice` (deck writing/speaking) + `gradeScores IS NULL` + `submittedAt < now − 24h`; khớp hàng chờ chấm bài với bộ lọc "chờ chấm" (điểm chưa có — grade null; endpoint ở cột Nguồn). | Tính thẻ 2 | FR-004 | S4 — apps/server/src/routes/dashboard-reminders.ts:38-39, apps/server/src/routes/dashboard-reminders.ts:160-229; S11 — apps/server/src/routes/dashboard-reminders.test.ts:299-431 | ✅ |
| BR-dashboard-002 | Bài nộp mẫu dùng thử id dạng `demo-attempt:%` bị loại khỏi thẻ chấm (không tính là việc của giáo viên). | Tính thẻ 2, mode practice | FR-004 | S4 — apps/server/src/routes/dashboard-reminders.ts:220; S11 — apps/server/src/routes/dashboard-reminders.test.ts:412-422 | ✅ |
| BR-dashboard-003 | Hóa đơn "đến hạn / quá hạn thu" = `due ≠ ""` AND `due ≤ hôm nay + 7 ngày` AND (status ≠ "paid" OR paidAmount < amount); outstanding = Σ(amount − min(paidAmount, amount)) — clamp trả thừa, khớp tuition-from-kernel. | Tính thẻ 3 | FR-005, FR-016 | S4 — apps/server/src/routes/dashboard-reminders.ts:40-41, apps/server/src/routes/dashboard-reminders.ts:231-258; S18 — apps/web/src/lib/tuition-from-kernel.ts:28-48; S11 — apps/server/src/routes/dashboard-reminders.test.ts:435-510 | ✅ |
| BR-dashboard-004 | Ca cần điểm danh = lesson `status="upcoming"` của hôm nay: lớp dated so `date = hôm nay VN`, lớp legacy (date NULL) so `day` = thứ suy từ ISO giờ VN; gom bucket: dated theo (classId, date), legacy theo (classId, time) — khớp bucket vật lý của GET/PUT attendance; sort giờ tăng; preview tối đa 3 ca. | Tính thẻ 1 | FR-003, FR-012 | S4 — apps/server/src/routes/dashboard-reminders.ts:42-43, apps/server/src/routes/dashboard-reminders.ts:99-158; S11 — apps/server/src/routes/dashboard-reminders.test.ts:255-268 | ✅ |
| BR-dashboard-005 | Buổi `cancelled` và `holiday` KHÔNG phải ca dạy: không đếm ở thẻ 1, không nằm trong "Lịch hôm nay"/"Lịch sắp tới". | Mọi tính lịch/đếm | FR-007, FR-008, FR-009 | S4 — apps/server/src/routes/dashboard-reminders.ts:126 (`status="upcoming"`); S8 — apps/web/src/lib/dashboard-from-kernel.ts:17-22, apps/web/src/lib/dashboard-from-kernel.ts:99-101; S11 — apps/server/src/routes/dashboard-reminders.test.ts:277-295 | ✅ |
| BR-dashboard-006 | "Miss check-in" = buổi `upcoming` có `day` TRƯỚC thứ hôm nay trong tuần Mon=1; không wrap từ Chủ nhật → thứ Hai luôn 0 miss. | Tính bảng risk | FR-010 | S8 — apps/web/src/lib/dashboard-from-kernel.ts:138-166 | ✅ |
| BR-dashboard-007 | "Vắng" chỉ tính trong cửa sổ 14 ngày gần nhất, CHỈ buổi CÓ NGÀY (`date` ≠ null), bỏ vắng có phép (`excused`); tín hiệu = `unexcused` HOẶC dòng absent cũ (`attendance = NULL` + `status = "absent"`); legacy không date đóng băng, không có đường ghi absent. | Tính bảng risk | FR-010 | S8 — apps/web/src/lib/dashboard-from-kernel.ts:117-136 | ✅ |
| BR-dashboard-008 | Quyền tài chính quyết định thẻ học phí: `finance = canAccessFinance(role)` — true cho teacher/owner/admin, false cho ta/class_teacher/giá trị lạ; scope không tài chính BỎ hẳn key `tuition` (undefined, không phải 0/null); scope "assigned" cũng không tính practice (không gắn lớp). | Resolve scope | FR-005, FR-016 | S4 — apps/server/src/routes/dashboard-reminders.ts:45-54, apps/server/src/routes/dashboard-reminders.ts:199-201, apps/server/src/routes/dashboard-reminders.ts:232-258, apps/server/src/routes/dashboard-reminders.ts:268-280; S14 — packages/auth/src/role.ts:63-87 | ✅ |
| BR-dashboard-009 | Student role bị chặn Ở MIDDLEWARE trước khi tới route: 403 `ACCOUNT_STUDENT_ROLE`, không bootstrap org/membership (cookie chung cross-subdomain — form-level check chưa đủ). | Session student chạm API | FR-015 | S6 — apps/server/src/app.ts:221-232; S2 — packages/api/src/contracts.ts:1975-1982 | ✅ |
| BR-dashboard-010 | Mọi session đều được bootstrap org teacher rỗng nếu chưa có membership (idempotent, org sớm nhất thắng race) → dashboard của giáo viên mới vẫn hiển thị org rỗng trung thực. | Teacher mới đăng nhập | FR-001, FR-008 | S6 — apps/server/src/app.ts:197-300; S12 — apps/web/src/routes/_auth/dashboard.test.tsx:205-225 | ✅ |
| BR-dashboard-011 | Bộ đếm tự cập nhật theo snapshot: refresh sau action kernel chạy `exact: true` trên `["kernel"]` nên prefix không tự phủ key con — timestamp `dataUpdatedAt` được đưa vào key reminders để snapshot mới buộc refetch. | Mọi action kernel | FR-006 | S9 — apps/web/src/lib/repos/dashboard-reminders.ts:16-24; S3 — apps/web/src/routes/_auth/dashboard.tsx:81-96 | ✅ |
| BR-dashboard-012 | Rủi ro học viên chỉ từ kernel lessons — KHÔNG dùng `student.atRisk` hay cờ tuition. | Tính bảng risk | FR-010 | S8 — apps/web/src/lib/dashboard-from-kernel.ts:139-141 | ✅ |

## 6. Error Matrix

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-dashboard-001 | 401 chưa đăng nhập | Request tới `/api/dashboard/reminders` không có `kernelCtx` (session rỗng) | major | FR-015 | Thẻ bộ đếm vào state lỗi + retry; app redirect login theo session | "Thử lại" / redirect `/login` | S4 — apps/server/src/routes/dashboard-reminders.ts:286-287 (nguyên văn: ``if (!ctx) return c.json({ error: "unauthorized" }, 401);``); S11 — apps/server/src/routes/dashboard-reminders.test.ts:597-602 | ✅ |
| E-dashboard-002 | 403 ACCOUNT_STUDENT_ROLE | Session role `student` chạm kernel tree (cookie chung) | critical | FR-015 | Blocked view thay toàn workspace: "Đây là tài khoản học viên" + nút "Đăng xuất" | Đăng xuất; DB không sinh org/membership | S6 — apps/server/src/app.ts:224-232 (nguyên văn: `error: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP`); S2 — packages/api/src/contracts.ts:1982 (catalog: `STUDENT_ON_TEACHER_APP: "ACCOUNT_STUDENT_ROLE"`); S23 — apps/e2e/specs/account-role-separation.spec.ts:137-145 | ✅ |
| E-dashboard-003 | 403 ACCOUNT_ADMIN_ROLE | Session role `admin` chạm kernel tree (plan #413) | critical | FR-015 | Blocked view như student | Quản trị chỉ làm việc trên `/api/admin` | S6 — apps/server/src/app.ts:235-242 (nguyên văn: `error: ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP`); S2 — packages/api/src/contracts.ts:1985 (catalog: `ADMIN_ON_TEACHER_APP: "ACCOUNT_ADMIN_ROLE"`) | ✅ |
| E-dashboard-004 | Lỗi tải bộ đếm (mạng/HTTP ≠ 2xx) | Fetch reminders thất bại hoặc status ≠ ok | major | FR-013, FR-002 | Câu "Không tải được bộ đếm nhắc việc." + nút "Thử lại" | Bấm "Thử lại"/"Làm mới dữ liệu" refetch | S3 — apps/web/src/routes/_auth/dashboard.tsx:150-160; S9 — apps/web/src/lib/repos/dashboard-reminders.ts:34-39 (nguyên văn: ``throw new HttpError(res.status, `Failed to load dashboard reminders: ${res.status}`)``) | ✅ |
| E-dashboard-005 | 403 TEACHER_NOT_ALLOWED / TEACHER_EMAIL_UNVERIFIED | TEACHER_EMAILS cấu hình khác rỗng: email ngoài allowlist hoặc chưa xác thực | critical | FR-015 | Blocked view theo mã lỗi | Liên hệ quản trị / xác thực email | S6 — apps/server/src/app.ts:246-268; S2 — packages/api/src/contracts.ts:1993, packages/api/src/contracts.ts:1995 (catalog: `TEACHER_NOT_ALLOWED: "ACCOUNT_TEACHER_NOT_ALLOWED"`, `TEACHER_EMAIL_UNVERIFIED: "ACCOUNT_TEACHER_EMAIL_UNVERIFIED"`) | ✅ |
| E-dashboard-006 | Snapshot sai dạng (lỗi thuộc luồng tải dữ liệu chung) | GET /api/kernel trả 200 nhưng thiếu collection bắt buộc / JSON hỏng | major | FR-007 | App không rời load-gate / workspace không áp snapshot | Load lại (bus refresh) | S27 — apps/web/src/lib/repos/kernel.ts:601-619 (shape guard), apps/web/src/lib/repos/kernel.ts:649-661 (nguyên văn: `throw new MalformedSnapshotError(...)`) | ✅ |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-dashboard-01 | Giáo viên thấy 3 thẻ đếm ĐÚNG với dữ liệu seed, API trả trong ≤ 2s, và 1 cú bấm thẻ/nút dẫn sang màn đã lọc sẵn (AC-001) | e2e: so khớp body API với seed + đo elapsedMs + assert URL đích | ≤ 2s; URL khớp `/attendance?date&status=pending`, `/grading?status=awaiting` | S10 — apps/e2e/specs/dashboard-reminders.spec.ts:12-17, apps/e2e/specs/dashboard-reminders.spec.ts:99-164 | ✅ |
| SC-dashboard-02 | Org rỗng hiển thị trung thực, không demo data | test unit: textContent không chứa tên/tiền/ngày demo | 0 demo string | S12 — apps/web/src/routes/_auth/dashboard.test.tsx:205-225 | ✅ |
| SC-dashboard-03 | Giáo viên không bỏ sót việc tồn: 3 nguồn việc (điểm danh, chấm, thu tiền) hiện đúng khi có và biến mất khi xong (zero-inbox) | test unit: đếm 0 → "Đã hoàn tất hôm nay" trên cả 3 thẻ | 3/3 thẻ zero-inbox đúng | S13 — apps/web/src/components/dashboard/reminder-cards.test.tsx:76-92 | ✅ |
| SC-dashboard-04 | Giảm thời gian tổng hợp ngày làm việc về 1 màn hình (kicker + greeting + reminders + KPI + lịch + risk) | Phân tích (không có đo trong code) | — | S3 — apps/web/src/routes/_auth/dashboard.tsx:117-296 | 🔵 |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/dashboard-reverse-erd.md`)

- **organization / membership** — phạm vi org + vai trò thành viên (quyết định finance). ✅ [S6 — apps/server/src/app.ts:296-300; S14 — packages/auth/src/role.ts:75-87]
- **class** (classTable) — tên lớp hiển thị trên thẻ 1 và lịch. ✅ [S4 — apps/server/src/routes/dashboard-reminders.ts:101-113; S3 — apps/web/src/routes/_auth/dashboard.tsx:213-215]
- **enrollment** — join bắt buộc `status="active"` khi đếm ca điểm danh. ✅ [S4 — apps/server/src/routes/dashboard-reminders.ts:114-122]
- **lesson** — trạng thái (upcoming/completed/cancelled/holiday/absent), day 1–7 Mon-first, date nullable (legacy), time/dur, attendance (excused/unexcused/null) — nguồn của thẻ 1, lịch, risk. ✅ [S4 — apps/server/src/routes/dashboard-reminders.ts:99-132; S8 — apps/web/src/lib/dashboard-from-kernel.ts:110-178]
- **invoice** — amount/paidAmount/status/due — nguồn thẻ 3 (server) và KPI "Còn phải thu" (client). ✅ [S4 — apps/server/src/routes/dashboard-reminders.ts:231-258; S18 — apps/web/src/lib/tuition-from-kernel.ts:28-48]
- **quiz_attempt / class_assignment / assignment_prompt / assignment_test** — bài nộp + đề gắn lớp + ngân hàng đề (skill, writingPart) — nguồn thẻ 2. ✅ [S4 — apps/server/src/routes/dashboard-reminders.ts:160-229; S16 — apps/server/src/lib/assignment-visibility.ts:11-16; S17 — packages/api/src/lib/ielts-band.ts:61-85]
- **DashboardReminders (read model, không persist)** — `{date, attendance{pending, items[≤3]}, overdueGrading{count, writing, speaking}, tuition?{students, outstanding}}`, zod `.strict()`, `tuition` optional. ✅ [S2 — packages/api/src/contracts.ts:2680-2719]

## 9. Flows (tóm tắt — chi tiết ở `srs/dashboard-reverse-flows.md`)

- F1 — Mở dashboard & tải dữ liệu tổng hợp (auth gate → kernel snapshot → reminders → render): sequence + flowchart.
- F2 — Bấm thẻ nhắc việc → màn đích đã lọc (3 đích): sequence + flowchart.
- F3 — Server tính bộ đếm reminders (gate vai trò → resolve scope → 3 nhóm truy vấn → parse → 200): sequence + flowchart.
- F4 — Tự làm mới bộ đếm theo vòng đời kernel snapshot: sequence + flowchart.
- F5 — Chặn tài khoản sai app (student/admin) → blocked view: sequence + flowchart.

## 10. Screens (tóm tắt)

- **/dashboard (Tổng quan)** — màn duy nhất của feature, gồm: PageHead (kicker + lời chào + minh họa ẩn mobile); khu "Việc cần làm hôm nay" (tiêu đề theo ngày + nút "Làm mới dữ liệu" + 3 thẻ); hàng 4 KPI; cột trái "Lịch hôm nay" + "Lịch sắp tới"; cột phải card "Cần kiểm tra". Trạng thái: skeleton (pending), lỗi + "Thử lại", loaded, zero-inbox từng thẻ. ✅ [S3 — apps/web/src/routes/_auth/dashboard.tsx:117-296; S7 — apps/web/src/components/dashboard/reminder-cards.tsx:42-123]
- **Blocked view** (thay workspace khi 403 sai app) — "Đây là tài khoản học viên" + "Đăng xuất". ✅ [S23 — apps/e2e/specs/account-role-separation.spec.ts:137-145]
- **/login** — đích redirect khi chưa đăng nhập (returnUrl). ✅ [S26 — apps/web/src/routes/_auth/route.tsx:26-37]

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Server chạy UTC — weekday/ngày "hôm nay" PHẢI suy từ ISO giờ VN, không dùng getDay() | apps/server (Workers UTC) | S4 — apps/server/src/routes/dashboard-reminders.ts:56-62; S15 — packages/api/src/vietnam-date.ts:20-29 | ✅ |
| Response reminders phải parse lại qua zod `.strict()` trước khi trả (chuẩn route kernel) | apps/server | S4 — apps/server/src/routes/dashboard-reminders.ts:294-296 | ✅ |
| Bộ đếm KHÔNG tự fetch khi chưa có kernel snapshot (`enabled: kernelUpdatedAt > 0`) | apps/web | S3 — apps/web/src/routes/_auth/dashboard.tsx:92-96 | ✅ |
| Preview thẻ 1 tối đa 3 ca / 3 dòng | apps/server + apps/web (2 đầu) | S4 — apps/server/src/routes/dashboard-reminders.ts:42-43, apps/server/src/routes/dashboard-reminders.ts:156-158; S7 — apps/web/src/components/dashboard/reminder-cards.tsx:113-117 | ✅ |
| Dashboard chỉ đọc — mọi thay đổi dữ liệu thuộc feature domain khác | apps/web | S12 — apps/web/src/routes/_auth/dashboard.test.tsx:152-153 | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Kernel snapshot `GET /api/kernel` (students/classes/lessons/invoices/assignments) | feature kernel | KPI + lịch + risk trống, bộ đếm không được enable | S27 — apps/web/src/lib/repos/kernel.ts:621-677; S3 — apps/web/src/routes/_auth/dashboard.tsx:87-96 | ✅ |
| Hợp đồng `dashboardRemindersResponseSchema` (packages/api) | packages/api | Web + server lệch hợp đồng, parse fail | S2 — packages/api/src/contracts.ts:2680-2719 | ✅ |
| Màn đích `/attendance`, `/grading`, `/tuition` (query lọc sẵn) | attendance / grading / tuition | CTA dẫn tới màn không lọc đúng | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:53-76; S19 — apps/web/src/lib/use-finance-route-guard.ts:12-28 | ✅ |
| Vai trò Trợ giảng + scope "lớp được gán" (Phase 5, FR-029) | feature vai trò (tương lai) | Nhánh scope "assigned" tiếp tục dead code | S4 — apps/server/src/routes/dashboard-reminders.ts:45-54, apps/server/src/routes/dashboard-reminders.ts:273-280 | 🟡 → OQ-1 |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Giờ ca học không vượt nửa đêm (thẻ 1 cộng `dur` phút trong cùng ngày) | Giờ kết thúc preview sai (wrap % 24 có sẵn nhưng semantics khác) | S7 — apps/web/src/components/dashboard/reminder-cards.tsx:8-21 | 🔵 |
| lesson.time luôn dạng chuẩn "HH:mm" (write path chuẩn hóa) | Sort/gom ca và cộng phút sai | S4 — apps/server/src/routes/dashboard-reminders.ts:140-158; S15 — packages/api/src/vietnam-date.ts:61-68 | 🔵 |
| `membership.role` là nguồn quyền tài chính của session kernel (không phải user.role app) | Thẻ 3 ẩn/hiện sai cho teacher/owner/admin/ta | S6 — apps/server/src/app.ts:296-300; S4 — apps/server/src/routes/dashboard-reminders.ts:291 | ✅ |
| KPI client-side dùng chung nguồn kernel snapshot với các màn khác (1 nguồn sự thật, không hard-code) | KPI lệch với màn domain | S3 — apps/web/src/routes/_auth/dashboard.tsx:165-193 (comment "số liệu tính từ kernel — không hard-code") | ✅ |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] OQ-1: Nhánh scope "assigned" (trợ giảng) trong `computeReminders` là dead code hiện tại (resolver luôn trả "org") — giữ làm điểm cắm Phase 5 (FR-029) hay xóa đến khi có vai trò?
- [ ] OQ-2: Các ngưỡng nghiệp vụ 24h / 7 ngày / 3 ca / 14 ngày — giá trị chốt sản phẩm hay mặc định kỹ thuật cần review?
- [ ] OQ-3: Hai con số "còn phải thu" khác phạm vi trên cùng màn hình (KPI toàn bộ hóa đơn vs thẻ chỉ ≤7 ngày) — chủ ý hay cần thống nhất?
- [ ] OQ-4: KPI "Học viên"/"Còn phải thu" không phân quyền tài chính — khi Phase 5 (TA) ra mắt có cần theo scope?
- [ ] OQ-5: "Lịch hôm nay" giữ semantics day-based (không xét date) chủ ý — chấp nhận hiển thị lệch khi lesson dated có day trùng nhưng date khác ngày?
- [ ] OQ-6: Priority FR/NFR do nhà phân tích gán, không có nguồn trong code — cần xác nhận thứ tự ưu tiên.
