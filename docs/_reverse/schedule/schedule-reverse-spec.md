---
type: reverse-srs
feature: schedule
status: draft
updated: 2026-11-11
confidence_summary: "✅105 🔵4 🟡3 (trong spec; toàn bộ 12 file: ✅113 🔵10 🟡13 — đếm theo luật batch sau audit) — OQ 6"
links: [reverse-sources.md, reverse-gaps.md, _evidence.md, srs/schedule-reverse-flows.md, srs/schedule-reverse-states.md, srs/schedule-reverse-erd.md, usecases/schedule-reverse-usecase-index.md]
---

# schedule — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) (S1–S33; mỗi nhãn ✅/🔵 trong tài liệu này cite `path:line` theo working tree develop @ d6c0f6b5).
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md) (6 OQ, 2 Gap, 2 Conflict, 3 Inferred).
- **Phạm vi chứng cứ:** feature `schedule` = màn **Lịch dạy** (`/schedule`, sidebar "Lịch dạy") với 3 chế độ xem Tháng/Tuần/Ngày + thực thể **sự kiện vận hành** riêng của tổ chức (tạo/xóa, hiển thị ngoài lịch lớp) + các điểm chạm hiển thị từ feature khác (kỳ nghỉ, ca học lớp). Toàn bộ dữ liệu lịch đi qua snapshot kernel đã tải sẵn; duy nhất sự kiện vận hành có API ghi riêng.

### 0.3 Khác biệt với tài liệu chính (chỉ khi feature trùng doc hiện có)

Doc chính hiện có gần nhất là `docs/project-overview-pdr.md` (không có mục riêng cho Lịch dạy — grep "lịch|schedule" trên file này trả rỗng):

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md`) | Đề xuất |
|------|------------------------|------------------------------------------------|---------|
| Cách ghi thay đổi xuống dữ liệu | Sự kiện vận hành KHÔNG đi qua kernel command bus; client **không** refetch snapshot mà vá cache tại chỗ từ response (comment D6, `apps/web/src/lib/repos/events.ts:1-6`; test chặn refetch `apps/web/src/routes/_auth/schedule.test.tsx:698-703`) | "Kernel writes are POST-only JSON commands; the client refreshes the snapshot after each write" (`docs/project-overview-pdr.md:18`) | Cập nhật PDR: thêm carve-out "org_event cập nhật cache tại chỗ, không refetch" hoặc gộp sự kiện vào command bus nếu muốn thống nhất (`/cr`) |
| Route ghi | `POST` + `DELETE` (xóa để sửa nhập nhầm — plan TOS-14 D3, `plans/261026-2018-tos-14-schedule-views-and-events/plan.md:52`) | PDR không đề cập Delete + snapshot-patch cho nhóm này | Bổ sung dòng quyết định bền vững vào PDR nếu duyệt (`/gap`) |
| Org-scoping | Mọi đọc/ghi sự kiện chốt org từ phiên (`apps/server/src/app.ts:296-300`; `apps/server/src/routes/events.ts:52,74`) | "Keep every user-facing data change org-scoped" (`docs/project-overview-pdr.md:32`) | Không khác biệt — reverse xác nhận tuân thủ ✅ |

## 1. Scope

**Trong scope (code khẳng định):**

1. Màn **Lịch dạy** truy cập được cho người dùng đã đăng nhập ứng dụng giáo viên; vào thẳng `/schedule` từ sidebar và từ thẻ "Lịch hôm nay" trên Dashboard. ✅ [S31 sidebar `apps/web/src/components/layout/sidebar.tsx:62-67`; dashboard `apps/web/src/routes/_auth/dashboard.tsx:201-206`; guard đăng nhập `apps/web/src/routes/_auth/route.tsx:5-40`]
2. **Chế độ xem Tuần**: lưới 7 cột Thứ Hai → Chủ Nhật; mỗi cột chứa ca học thực và ca dự kiến xen kẽ theo giờ, thẻ kỳ nghỉ, chip sự kiện; tô sáng hôm nay; thông báo tuần trống. ✅ [S8 `apps/web/src/components/schedule/schedule-week-view.tsx:20-26,57-61,68-88,97-117`; view-model S4 `apps/web/src/lib/schedule-week.ts:303-328`]
3. **Chế độ xem Tháng**: lưới 6×7 = 42 ô bắt đầu Thứ Hai, bơm ngày lân cận cho đủ 6 hàng; mỗi ô tối đa 3 mục, phần dư đếm thành "+N xem ngày"; ô ngoài tháng làm mờ; tô sáng hôm nay; ở 375px thu thành chấm màu. ✅ [S7 `apps/web/src/components/schedule/schedule-month-view.tsx:15-19,80-158`; S5 `apps/web/src/lib/schedule-month.ts:107,176-276`; S3 `apps/web/src/lib/week-grid.ts:195-200`]
4. **Chế độ xem Ngày**: agenda theo giờ tăng dần gồm ca học (có ngày + mẫu theo thứ + dự kiến), sự kiện vận hành, kỳ nghỉ cả ngày (đẩy lên đầu); bấm ca mở hộp thoại ca học; ca đã hủy vẫn hiện với gạch ngang. ✅ [S9 `apps/web/src/components/schedule/schedule-day-view.tsx:12-17,43-49,102-135`; S6 `apps/web/src/lib/schedule-day.ts:79-87,95-168`]
5. **Điều hướng thời gian**: nút trước/sau bước theo đơn vị của view (tháng/tuần/ngày) và nút "Hôm nay"; nút tự tắt khi chạm biên năm 1970–2099; nhảy sang Tuần luôn neo về thứ Hai của tuần chứa ngày đang xem. ✅ [S1 `apps/web/src/routes/_auth/schedule.tsx:102-130,167-194`; S3 `apps/web/src/lib/week-grid.ts:17-18,77-85,172-190`]
6. **Trạng thái view nằm trong URL** `?view=month|week|day&date=yyyy-mm-dd`; tham số rác hoặc cặp thiếu được scrub về dạng chuẩn (replace, không thêm lịch sử); link `?week=` cũ vẫn đọc được và được đổi thành dạng mới. ✅ [S2 `apps/web/src/lib/schedule-view.ts:47-83`; S1 `apps/web/src/routes/_auth/schedule.tsx:38-44,71-78`]
7. **Tạo sự kiện vận hành** (ngoài lịch lớp): tên, ngày, giờ bắt đầu/kết thúc, ghi chú tùy chọn; lỗi hiển thị inline theo cùng bộ luật với server; thành công thì chip xuất hiện ngay trong view đang mở. ✅ [S10 `apps/web/src/components/schedule/org-event-modal.tsx:38-43,89-117`; S14 `apps/server/src/routes/events.ts:34-63`; S20 `packages/api/src/event-contracts.ts:35-46`]
8. **Xóa sự kiện vận hành**: từ chi tiết chip, xác nhận 2 bước; xong chip biến mất ngay; trường hợp sự kiện đã bị xóa nơi khác thì báo "đã không còn tồn tại" thay vì lỗi. ✅ [S11 `apps/web/src/components/schedule/org-event-chip.tsx:40-58,101-141`; S14 `apps/server/src/routes/events.ts:65-78`]
9. Sự kiện hiển thị **trong cả 3 chế độ xem** dạng chip màu trung tính kèm icon lịch, phân tách khỏi ca học; bấm chip xem chi tiết (ngày, khung giờ, ghi chú). ✅ [S7:141-145; S8:254-256; S9:63-65; S11 `apps/web/src/components/schedule/org-event-chip.tsx:62-100,144-154`]
10. Thay đổi sự kiện phản ánh trong **≤ 2 giây** bằng cách vá snapshot đang cache tại chỗ (không tải lại toàn bộ). ✅ [S12 `apps/web/src/lib/repos/events.ts:1-6,31-52`; test `apps/web/src/routes/_auth/schedule.test.tsx:698-703`; e2e đo `apps/e2e/specs/schedule-views-and-events.spec.ts:105-112`]
11. Ca học tô **màu ổn định theo lớp** (hash id lớp → 1 trong 8 màu), loại buổi chuyển thành badge nhỏ; hai lớp khác nhau phải ra màu khác nhau trong kịch bản e2e. ✅ [S13 `apps/web/src/lib/class-color.ts:1-22`; e2e `apps/e2e/specs/schedule-views-and-events.spec.ts:76-96`]
12. **Trạng thái rỗng**: khi tổ chức chưa có lớp và chưa có sự kiện → thẻ "Chưa có lịch dạy nào" + nút dẫn sang Quản lý lớp học. ✅ [S1 `apps/web/src/routes/_auth/schedule.tsx:196-212`]
13. Sự kiện vận hành **không ảnh hưởng ca học**: không đổi dòng buổi học, không vào điểm danh theo ngày, không vào nhắc việc của Dashboard. ✅ [test server `apps/server/src/routes/events.test.ts:192-237`; chú thích trong chi tiết chip `apps/web/src/components/schedule/org-event-chip.tsx:152-154`]
14. **Điểm chạm kỳ nghỉ** (nghiệp vụ dời/hủy/hoàn tác thuộc feature holidays): thẻ kỳ nghỉ hiển thị trong cả 3 view; nút "+ Tạo lịch nghỉ" trên màn; hộp thoại hoàn tác trong view Tuần. ✅ render tại `apps/web/src/routes/_auth/schedule.tsx:157-162,242-251`; S8 `apps/web/src/components/schedule/schedule-week-view.tsx:236-271`; S9:51-61; S7:135-139; S29 `apps/web/src/components/schedule/holiday-modal.tsx:1-9`
15. **Điểm chạm ca học** (nghiệp vụ điểm danh/sửa thuộc feature classes): bấm ca học từ view Tuần/Ngày mở hộp thoại ca học của lớp. ✅ [S9 `apps/web/src/components/schedule/schedule-day-view.tsx:112-135`; S8:161-233; S30 `apps/web/src/components/schedule/class-session-modal.tsx:18-25`]

**Boundary (ngoài scope):**

- Lịch buổi học sinh từ dòng buổi của lớp (mẫu thứ/giờ, occurrence, điểm danh, sửa/dời buổi): thuộc feature **classes**; schedule chỉ đọc snapshot để hiển thị và mở hộp thoại. 🔵 [âm bản: route sự kiện `apps/server/src/routes/events.ts:26-30` ghi rõ "không đụng lesson/attendance/reminders"; consumer `data.events` chỉ nằm trong các file lịch `apps/web/src/components/schedule/*` và view-model `apps/web/src/lib/schedule-day.ts:143`, `apps/web/src/lib/schedule-month.ts:200`]
- Kỳ nghỉ (tạo/xóa/hoàn tác, dời buổi, bù): thuộc feature **holidays**; schedule chỉ hiển thị thẻ và mở hộp thoại. 🔵 [S29 header `apps/web/src/components/schedule/holiday-modal.tsx:1-9`; mã lỗi riêng của pipeline nghỉ `packages/api/src/contracts.ts:3631-3645`]
- Học sinh/portal học viên KHÔNG thấy sự kiện vận hành: không có tham chiếu nào trong ứng dụng học viên. ✅ [âm bản: grep "orgEvent|org-event|/api/events" trên `apps/student/src` và `apps/admin/src` trả rỗng — xem reverse-gaps.md Gap-4]
- Sửa sự kiện, sự kiện lặp, mời người tham dự, thông báo sự kiện: không tồn tại trong code. ✅ [âm bản: route chỉ có POST + DELETE `apps/server/src/routes/events.ts:34,65`; schema không có cột lặp/người tham dự `packages/db/src/schema/org-event.ts:9-27`; plan liệt kê non-goals `plans/261026-2018-tos-14-schedule-views-and-events/plan.md:58-63`]

## 2. Actors & Stakeholders

| Actor | Loại (người/hệ thống/ngoài) | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|-----------------------------|----------|--------------|-------|------|
| Giáo viên (thành viên org, ứng dụng giáo viên) | người | Xem toàn bộ lịch dạy theo Tháng/Tuần/Ngày, quản lý sự kiện vận hành, đi đến ca học cần điểm danh | Có | S1, S31 | ✅ |
| Kernel API (server đa tổ chức) | hệ thống | Chốt tổ chức + người dùng từ phiên cho mọi đọc/ghi; chống xóa chéo tổ chức | Có | S17 `apps/server/src/app.ts:296-300`, S14 | ✅ |
| Snapshot kernel | hệ thống | Cung cấp toàn bộ dữ liệu lịch (lớp, buổi, sự kiện, kỳ nghỉ) cho 3 view | Có | S16 `apps/server/src/routes/snapshot.ts:96-116`, S21 | ✅ |
| Feature classes (lớp/buổi/điểm danh) | hệ thống (nội bộ) | Cung cấp dữ liệu ca học + hộp thoại ca học mà lịch mở ra | Chạm — sở hữu elsewhere | S30 | ✅ |
| Feature holidays (kỳ nghỉ chung) | hệ thống (nội bộ) | Cung cấp thẻ kỳ nghỉ, hộp thoại tạo/hoàn tác | Chạm — sở hữu elsewhere | S29 | ✅ |
| Học viên (portal) | người | Không có điểm chạm nào với sự kiện vận hành | Không | âm bản Gap-4 | ✅ |

## 3. Functional Requirements (FR)

> Cột Priority là phán định của BA (không có metadata priority trong code; plan TOS-14 ghi P1 cho cả feature — `plans/261026-2018-tos-14-schedule-views-and-events/plan.md:5`) — xem OQ-4.

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-schedule-001 | Xem lịch Tuần | Lưới 7 cột Thứ Hai→Chủ Nhật; ca học thực + ca dự kiến xen kẽ theo giờ; thẻ kỳ nghỉ và chip sự kiện trong cột ngày; tô sáng và gắn nhãn hôm nay; thông báo tuần không có buổi | P0 | demo/test | S8 `apps/web/src/components/schedule/schedule-week-view.tsx:20-26,57-61,62-117,254-256`; S4 `apps/web/src/lib/schedule-week.ts:303-328` | ✅ |
| FR-schedule-002 | Xem lịch Tháng | Lưới 6×7 (42 ô) bắt đầu Thứ Hai; mỗi ô ≤ 3 mục + "+N xem ngày"; ngày ngoài tháng làm mờ; tô sáng hôm nay; bấm ô/ngày mở view Ngày | P0 | demo/test | S7 `apps/web/src/components/schedule/schedule-month-view.tsx:15-19,80-158`; S5 `apps/web/src/lib/schedule-month.ts:176-276`; S3 `apps/web/src/lib/week-grid.ts:195-200` | ✅ |
| FR-schedule-003 | Xem lịch Ngày | Agenda trong ngày theo giờ tăng dần: kỳ nghỉ cả ngày lên đầu, rồi ca học (có ngày + mẫu theo thứ + dự kiến) và sự kiện; ca hủy vẫn hiện (gạch ngang); bấm ca mở hộp thoại ca học | P0 | demo/test | S9 `apps/web/src/components/schedule/schedule-day-view.tsx:12-17,43-49,102-135`; S6 `apps/web/src/lib/schedule-day.ts:79-87,95-168` | ✅ |
| FR-schedule-004 | Điều hướng thời gian | Nút trước/sau bước theo đơn vị view; "Hôm nay" về ngày hiện tại giờ Việt Nam; nút tắt ở biên 1970–2099; chuyển sang Tuần neo về thứ Hai của tuần chứa ngày đang xem | P0 | demo/test | S1 `apps/web/src/routes/_auth/schedule.tsx:102-130,167-194`; S3 `apps/web/src/lib/week-grid.ts:17-18,29-34,77-85,172-190` | ✅ |
| FR-schedule-005 | Trạng thái view trong URL | `?view=&date=` là dạng chuẩn; tham số rác/cặp thiếu được scrub (replace); link `?week=` cũ vẫn đọc và đổi sang dạng chuẩn | P1 | test | S2 `apps/web/src/lib/schedule-view.ts:47-83`; S1 `apps/web/src/routes/_auth/schedule.tsx:34-44,71-78` | ✅ |
| FR-schedule-006 | Tạo sự kiện vận hành | Nhập tên (2–100 ký tự), ngày (yyyy-mm-dd có thật), giờ bắt đầu/kết thúc (HH:mm), ghi chú tùy chọn ≤ 500 ký tự; lỗi inline từng trường theo cùng bộ luật với server; mặc định ngày = ngày đang neo của view | P0 | demo/test | S10 `apps/web/src/components/schedule/org-event-modal.tsx:38-43,64-82,89-117,252-256` (route pass `defaultDate`) | ✅ |
| FR-schedule-007 | Xóa sự kiện vận hành | Từ chi tiết chip, nút Xóa → bước xác nhận → xóa vĩnh viễn; chip biến mất ngay khi thành công | P1 | demo/test | S11 `apps/web/src/components/schedule/org-event-chip.tsx:40-58,101-141`; S14 `apps/server/src/routes/events.ts:65-78` | ✅ |
| FR-schedule-008 | Sự kiện hiển thị cả 3 view | Chip màu trung tính kèm icon lịch (tách khỏi ca học), biến thể thu gọn cho ô Tháng; bấm chip mở chi tiết ngày + khung giờ + ghi chú | P0 | demo | S7:141-145; S8:254-256; S9:63-65; S11 `apps/web/src/components/schedule/org-event-chip.tsx:12-16,62-100,144-154` | ✅ |
| FR-schedule-009 | Cập nhật tức thì không tải lại | Tạo/xóa sự kiện vá mảng sự kiện trong snapshot đang cache (chèn/xóa + sắp xếp lại) thay vì tải lại toàn bộ; đảm bảo chip hiện/mất ngay trong view đang mở | P0 | test | S12 `apps/web/src/lib/repos/events.ts:31-52`; S25 `apps/web/src/routes/_auth/schedule.test.tsx:664-704` | ✅ |
| FR-schedule-010 | Màu ca học theo lớp | Mã màu ổn định theo id lớp (hash → 1..8), nhất quán giữa 3 view và các lần tải; loại buổi (1:1, trial, mock…) thành badge nhỏ | P1 | test | S13 `apps/web/src/lib/class-color.ts:1-22`; S8:182; S9:106,125-132; S28 `apps/e2e/specs/schedule-views-and-events.spec.ts:76-96` | ✅ |
| FR-schedule-011 | Trạng thái rỗng | Chưa có lớp và chưa có sự kiện → thẻ "Chưa có lịch dạy nào" kèm nút dẫn sang Quản lý lớp học | P1 | demo | S1 `apps/web/src/routes/_auth/schedule.tsx:196-212` | ✅ |
| FR-schedule-012 | Sự kiện tách khỏi ca học | Tạo/xóa sự kiện không làm đổi dòng buổi học, điểm danh theo ngày, nhắc việc Dashboard; chi tiết chip ghi chú điều này cho người dùng | P0 | test | S23 `apps/server/src/routes/events.test.ts:192-237`; S11 `apps/web/src/components/schedule/org-event-chip.tsx:152-154` | ✅ |
| FR-schedule-013 | Đếm buổi tuần ở tiêu đề | Tiêu đề view Tuần hiển thị "Tuần <khoảng ngày> · N buổi" với N = số khung giờ thực + dự kiến, trùng khung chỉ đếm một lần, loại buổi đã hủy/đã dời nghỉ | P2 | demo | S1 `apps/web/src/routes/_auth/schedule.tsx:115-120`; S4 `apps/web/src/lib/schedule-week.ts:267-290` | ✅ |
| FR-schedule-014 | Điểm chạm kỳ nghỉ trên lịch | Thẻ kỳ nghỉ hiển thị cả 3 view (chiếm 1 slot trong ô Tháng, mục cả ngày trong agenda Ngày, trong cột ngày ở Tuần); nút "+ Tạo lịch nghỉ" và hộp thoại hoàn tác trong view Tuần — nghiệp vụ dời/hủy/hoàn tác thuộc feature holidays | P1 | demo | S1:157-162,242-251; S7:135-139; S8:236-271; S9:51-61; S29 `apps/web/src/components/schedule/holiday-modal.tsx:1-9` | ✅ |
| FR-schedule-015 | Điểm chạm ca học trên lịch | Bấm ca học (không phải ca dự kiến) ở view Tuần/Ngày mở hộp thoại ca học của lớp để xem học viên, điểm danh, sửa buổi — nghiệp vụ thuộc feature classes; ca dự kiến cố ý không bấm được | P1 | demo/test | S9:102-135; S8:144-233; S30 `apps/web/src/components/schedule/class-session-modal.tsx:18-25`; S25 `apps/web/src/routes/_auth/schedule.test.tsx:730-740` | ✅ |

## 4. Non-Functional Requirements (NFR)

> Cột Priority là phán định của BA — xem OQ-4.

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-schedule-001 | performance | Đổi Tháng↔Tuần↔Ngày phản ánh ≤ 2 giây, tính toán thuần client trên snapshot đã tải | P1 | e2e đo click → phần tử đầu tiên của view < 2000ms | S28 `apps/e2e/specs/schedule-views-and-events.spec.ts:49-67` | ✅ |
| NFR-schedule-002 | performance | Tạo sự kiện hiển thị trong view đang mở ≤ 2 giây (vá cache tại chỗ, không refetch) | P1 | e2e đo bấm Tạo → chip hiện < 2000ms; unit test khẳng định không có lần tải snapshot nào thêm | S28:105-112; S25 `apps/web/src/routes/_auth/schedule.test.tsx:698-703` | ✅ |
| NFR-schedule-003 | performance | View-model Tháng index dữ liệu một lần ngoài vòng lặp; 50 lớp × 24 buổi build 42 ô dưới 50ms | P2 | unit test đo `performance.now()` < 50ms | S5 `apps/web/src/lib/schedule-month.ts:171-175`; S27 `apps/web/src/lib/schedule-month.test.ts:363-391` | ✅ |
| NFR-schedule-004 | độ bền tương thích | Snapshot của server cũ thiếu mảng sự kiện vẫn không làm trắng workspace (tùy chọn trong hợp đồng, web tự bó rỗng) | P1 | test shape guard | S21 `packages/api/src/contracts.ts:1934-1937`; S22 `apps/web/src/lib/repos/kernel.ts:385,576-580` | ✅ |
| NFR-schedule-005 | bảo mật đa tổ chức | Mọi đọc/ghi sự kiện chốt tổ chức + người dùng từ phiên (client không được gửi id tổ chức); xóa sự kiện của tổ chức khác trả 404 và không xóa | P0 | test | S17 `apps/server/src/app.ts:296-300`; S14 `apps/server/src/routes/events.ts:52,74`; S23 `apps/server/src/routes/events.test.ts:260-281` | ✅ |
| NFR-schedule-006 | responsive | Ở 375px view Tháng không tràn ngang, mục thu thành chấm màu; kiểm trên 1440/768/375 | P1 | e2e assert `scrollWidth <= clientWidth` | S28:121-142; S7 `apps/web/src/components/schedule/schedule-month-view.tsx:95-116` | ✅ |
| NFR-schedule-007 | độ bền client | Mọi request tạo/xóa sự kiện có giới hạn chờ 15 giây, quá hạn coi như lỗi và báo thử lại | P2 | kiểm tra code + demo | S12 `apps/web/src/lib/repos/events.ts:15,65,104` | ✅ |
| NFR-schedule-008 | phiên đăng nhập | 401 từ tạo/xóa sự kiện kích hoạt luồng đăng nhập lại của client | P1 | demo | S12 `apps/web/src/lib/repos/events.ts:67-70,106-109` | ✅ |
| NFR-schedule-009 | tính toàn vẹn ngày | Mọi toán lịch chạy trên chuỗi yyyy-mm-dd neo UTC, "hôm nay" theo giờ Việt Nam, chống trôi múi giờ trên máy chạy UTC | P2 | test view-model | S3 `apps/web/src/lib/week-grid.ts:4-13,29-43`; S5 `apps/web/src/lib/schedule-month.ts:7-10` | ✅ |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-schedule-001 | Tên sự kiện 2–100 ký tự, cắt khoảng trắng hai đầu trước khi kiểm | Nhập liệu tạo sự kiện | FR-006 | S20 `packages/api/src/event-contracts.ts:3-4,37`; S24 `packages/api/src/event-contracts.test.ts:16-38,84-95` | ✅ |
| BR-schedule-002 | Ngày sự kiện phải là yyyy-mm-dd có thật trên lịch (2026-02-30 bị từ chối bằng phép kiểm vòng UTC) | Nhập liệu tạo sự kiện | FR-006 | S20 `packages/api/src/event-contracts.ts:24-31,38`; S24:52-65 | ✅ |
| BR-schedule-003 | Giờ theo mẫu HH:mm trong 00:00–23:59; giờ kết thúc phải sau giờ bắt đầu (so sánh chuỗi) | Nhập liệu tạo sự kiện | FR-006 | S20 `packages/api/src/event-contracts.ts:33,39-45`; S24:40-50,97-111 | ✅ |
| BR-schedule-004 | Ghi chú tùy chọn ≤ 500 ký tự, mặc định rỗng khi bỏ trống | Nhập liệu tạo sự kiện | FR-006 | S20 `packages/api/src/event-contracts.ts:5,41`; S24:67-82; S23 `apps/server/src/routes/events.test.ts:152-173` | ✅ |
| BR-schedule-005 | Sự kiện luôn thuộc tổ chức của người tạo; id tổ chức lấy từ phiên, không nhận từ request | Mỗi lần tạo sự kiện | FR-006, NFR-005 | S14 `apps/server/src/routes/events.ts:52`; S17 `apps/server/src/app.ts:296-300` | ✅ |
| BR-schedule-006 | Chỉ xóa được sự kiện cùng tổ chức; id của tổ chức khác hoặc không tồn tại → 404, không lộ sự tồn tại | Yêu cầu xóa sự kiện | FR-007 | S14 `apps/server/src/routes/events.ts:74-76`; S23 `apps/server/src/routes/events.test.ts:260-281` | ✅ |
| BR-schedule-007 | Ô Tháng hiển thị tối đa 3 mục; phần dư tính vào "+N", không cắt tối đa 3 một cách âm thầm; buổi đã hủy không tính là mục cũng như phần dư | Ô có nhiều mục | FR-002 | S5 `apps/web/src/lib/schedule-month.ts:107,233-235,272-273`; S27 `apps/web/src/lib/schedule-month.test.ts:89-130` | ✅ |
| BR-schedule-008 | Thứ tự mục trong ô/agenda: kỳ nghỉ (cả ngày) lên đầu, sau đó tăng theo giờ, hòa thì so id | Mỗi ô/agenda | FR-002, FR-003 | S6 `apps/web/src/lib/schedule-day.ts:78-87`; S5 `apps/web/src/lib/schedule-month.ts:159-168` | ✅ |
| BR-schedule-009 | Buổi đã hủy: ẩn hẳn ở ô Tháng, nhưng vẫn hiện (gạch ngang, mờ) ở agenda Ngày và cột Tuần — agenda chi tiết phải trung thực | Render buổi hủy | FR-003 | S5 `apps/web/src/lib/schedule-month.ts:233-235`; S9 `apps/web/src/components/schedule/schedule-day-view.tsx:12-17,80-88`; S8 `apps/web/src/components/schedule/schedule-week-view.tsx:173-181,187-193` | ✅ |
| BR-schedule-010 | Ca dự kiến (lớp chưa có dòng học viên) chỉ hiển thị, không bấm được, không mở hộp thoại ghi dữ liệu | Render ca dự kiến | FR-015 | S9 `apps/web/src/components/schedule/schedule-day-view.tsx:66-68,102-111`; S8 `apps/web/src/components/schedule/schedule-week-view.tsx:64-67,125-142` | ✅ |
| BR-schedule-011 | Số buổi tuần không đếm buổi đã hủy và buổi đã dời vì nghỉ; khung giờ trùng giữa nguồn thực và dự kiến chỉ đếm một lần | Tính nhãn tiêu đề tuần | FR-013 | S4 `apps/web/src/lib/schedule-week.ts:267-290` | ✅ |
| BR-schedule-012 | Điều hướng lịch chặn ở biên năm 1970–2099: ngày dịch ra ngoài biên giữ nguyên → nút bị tắt; tuần luôn neo thứ Hai khi ghi vào URL | Bấm trước/sau ở sát biên | FR-004 | S3 `apps/web/src/lib/week-grid.ts:17-18,73-85,168-190`; S1 `apps/web/src/routes/_auth/schedule.tsx:98-108` | ✅ |
| BR-schedule-013 | Tham số URL rác/không hợp lệ không làm vỡ trang: được scrub về dạng chuẩn bằng replace (không thêm lịch sử); tải mặc định sạch không ghi đè URL | Mở/đổi URL /schedule | FR-005 | S1 `apps/web/src/routes/_auth/schedule.tsx:35-44,68-78`; S2 `apps/web/src/lib/schedule-view.ts:43-71` | ✅ |
| BR-schedule-014 | Hộp thoại tạo lịch nghỉ chỉ cho chọn lớp đang hoạt động | Mở hộp thoại lịch nghỉ | FR-014 | S1 `apps/web/src/routes/_auth/schedule.tsx:242-246` | ✅ |

## 6. Error Matrix

> Wording là nguyên văn chuỗi lỗi trong code. Sự kiện vận hành KHÔNG dùng bảng mã lỗi riêng (khác pipeline kỳ nghỉ có `HOLIDAY_ERROR_CODES` — `packages/api/src/contracts.ts:3631-3645`); server trả chuỗi `error` ngắn, client chỉ diễn giải theo nhóm trạng thái HTTP. Chi tiết từng cặp ném/bắt ở `_evidence.md` §3.

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-schedule-001 | `unauthorized` (HTTP 401) | Gọi tạo/xóa sự kiện khi chưa đăng nhập hoặc hết phiên | major | FR-006, FR-007 | Hộp thoại sự kiện / chip chi tiết | Client kích hoạt đăng nhập lại; form giữ nguyên | S14 `apps/server/src/routes/events.ts:36,67`; S12 `apps/web/src/lib/repos/events.ts:67-70,106-109` | ✅ |
| E-schedule-002 | `invalid json` (HTTP 400) | Body request không parse được JSON | minor | FR-006 | (server-side) | Client luôn gửi JSON hợp lệ — chủ yếu là phòng vệ; không có UI riêng | S14 `apps/server/src/routes/events.ts:38-43` | ✅ |
| E-schedule-003 | `invalid body` (HTTP 400) | Body vi phạm bộ luật sự kiện (tên/ngày/giờ/ghi chú) | major | FR-006 | Hộp thoại tạo sự kiện — dòng lỗi "Dữ liệu chưa hợp lệ — kiểm tra lại các trường." | Sửa dữ liệu rồi gửi lại; form không đóng | S14 `apps/server/src/routes/events.ts:44-45`; S10 `apps/web/src/components/schedule/org-event-modal.tsx:106-113` | ✅ |
| E-schedule-004 | `insert failed` (HTTP 500) | Câu lệnh ghi không trả về dòng nào (lỗi DB) | major | FR-006 | Toast "Không tạo được sự kiện — thử lại." | Thử lại | S14 `apps/server/src/routes/events.ts:61`; S10:115 | ✅ |
| E-schedule-005 | `not found` (HTTP 404 khi xóa) | Xóa id không tồn tại hoặc thuộc tổ chức khác | minor | FR-007 | Toast thông báo "Sự kiện đã không còn tồn tại." rồi đóng (không coi là lỗi) | Cập nhật giao diện theo thực tế | S14 `apps/server/src/routes/events.ts:70,76`; S11 `apps/web/src/components/schedule/org-event-chip.tsx:51-55` | ✅ |
| E-schedule-006 | Phản hồi lạ từ server (HTTP 502 do client phân loại) | Tạo xong nhưng body không phải JSON hoặc thiếu id | major | FR-006 | Toast "Không tạo được sự kiện — thử lại." | Thử lại | S12 `apps/web/src/lib/repos/events.ts:77-89`; S10:115 | ✅ |
| E-schedule-007 | Quá hạn chờ 15 giây | Mạng chậm/giữ connection khi POST/DELETE | major | FR-006, FR-007 | Toast "Không tạo được sự kiện — thử lại." / "Không xóa được sự kiện — thử lại."; form mở lại | Thử lại | S12 `apps/web/src/lib/repos/events.ts:15,65,104`; S10:115; S11:56 | ✅ |
| E-schedule-008 | Lỗi nhập liệu inline (chặn trước khi gửi) | Trường vi phạm bộ luật: "Tên sự kiện cần 2–100 ký tự." · "Ngày không hợp lệ (yyyy-mm-dd)." · "Giờ bắt đầu không hợp lệ (HH:mm)." · "Giờ kết thúc phải sau giờ bắt đầu (HH:mm)." · "Ghi chú tối đa 500 ký tự." | minor | FR-006 | Lỗi đỏ dưới từng trường; chỉ hiện sau lần gửi đầu hoặc trên trường đã nhập | Sửa trường tương ứng; không gửi đi đâu cả | S10 `apps/web/src/components/schedule/org-event-modal.tsx:16-22,66-70,91` | ✅ |
| E-schedule-009 | Chip trỏ tới sự kiện thiếu trong snapshot (runtime throw "org event {id} missing from snapshot") | Dữ liệu không nhất quán: danh sách mục agenda có id sự kiện mà mảng sự kiện không có | minor | FR-008 | Trang vỡ tại chỗ render | Không có cơ chế phục hồi — được coi là không thể xảy ra vì mục và chip cùng một nguồn snapshot | S9 `apps/web/src/components/schedule/schedule-day-view.tsx:142-149`; S7 `apps/web/src/components/schedule/schedule-month-view.tsx:167-174` | ✅ |
| E-schedule-010 | Tham số URL rác (`?view=`/`?date=` lạ) | Dán link hỏng hoặc link `?week=` cũ | minor | FR-005 | Không hiển thị lỗi; URL được scrub replace về dạng chuẩn | Tự phục hồi, người dùng không làm gì | S1 `apps/web/src/routes/_auth/schedule.tsx:68-78`; S2 `apps/web/src/lib/schedule-view.ts:54-70` | ✅ |
| E-schedule-011 | (Điểm chạm) Mã lỗi pipeline kỳ nghỉ `no-sessions`/`past-range`/`too-large`/`stale-preview`/`holiday-locked`/`holiday-started`/`makeup-touched` | Áp dụng/hoàn tác lịch nghỉ từ màn lịch | major | FR-014 | Hộp thoại lịch nghỉ (thuộc feature holidays) | Xem lại bảng xem trước / tải lại — xử lý ở SRS holidays | S21 `packages/api/src/contracts.ts:3631-3645`; S29 `apps/web/src/components/schedule/holiday-modal.tsx:1-9` | ✅ |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-schedule-01 | Giáo viên đọc lịch ở cả 3 độ sâu (Tháng/Tuần/Ngày) mà không chờ màn hình | e2e đo thời gian đổi view | < 2000ms mỗi lần chuyển | S28 `apps/e2e/specs/schedule-views-and-events.spec.ts:49-67` | ✅ |
| SC-schedule-02 | Sự kiện vận hành (vd. "Họp chuyên môn giáo viên") xuất hiện ngay sau khi tạo | e2e đo bấm Tạo → chip hiện; unit test khẳng định không có lần tải lại snapshot | < 2000ms | S28:100-119; S25:664-704 | ✅ |
| SC-schedule-03 | Sự kiện không làm sai số liệu dạy học (buổi, điểm danh, nhắc việc cùng ngày) | test server so sánh trước/sau khi tạo sự kiện | 3 bộ dữ liệu bất biến | S23 `apps/server/src/routes/events.test.ts:192-237` | ✅ |
| SC-schedule-04 | Lịch dùng được trên máy tính, tablet, điện thoại | e2e 3 viewport + assert không tràn ngang 375px; chụp baseline | Không tràn ngang ở 375px | S28:121-151 | ✅ |

## 8. Data Entities (tóm tắt — chi tiết ở [`srs/schedule-reverse-erd.md`](./srs/schedule-reverse-erd.md))

- **org_event — Sự kiện vận hành của tổ chức** (thực thể riêng của feature): id, tổ chức chủ (khóa ngoại xóacascade), tên, ngày, giờ bắt đầu/kết thúc (HH:mm), ghi chú (mặc định rỗng), người tạo, thời điểm tạo; chỉ mục đi cặp (tổ chức, ngày) cho truy vấn lịch. Không có cột trạng thái — vòng đời chỉ là "tồn tại / đã xóa". ✅ [S18 `packages/db/src/schema/org-event.ts:9-27`; S19 `packages/db/src/migrations/0046_faithful_punisher.sql:1-14`]
- **organization — Tổ chức** (chạm: chủ sở hữu dữ liệu, khóa phạm vi mọi sự kiện). ✅ [S18 `packages/db/src/schema/org-event.ts:13-15`; S5 tương ứng `packages/db/src/schema/organization.ts:4-10`]
- **lesson — Buổi học của lớp** (chạm hiển thị: nguồn ca học thực/dự kiến, trạng thái upcoming|completed|absent|cancelled|holiday). Thuộc feature classes. ✅ [`packages/db/src/schema/lesson.ts:41-72`]
- **class_session — Buổi thủ công của lớp** (chạm hiển thị: buổi không phụ thuộc ghi danh, #649). Thuộc feature classes. ✅ [`packages/db/src/schema/class-session.ts:18-38`]
- **organization_holiday — Kỳ nghỉ chung** (+ cặp dời `holiday_session_shift`): nguồn thẻ kỳ nghỉ trên lịch. Thuộc feature holidays. ✅ [`packages/db/src/schema/organization-holiday.ts:20-49,80-96`]
- **KernelSnapshot.events** — mảng sự kiện trong hợp đồng snapshot, tùy chọn để chịu lệch phiên triển khai; client bó rỗng khi thiếu. ✅ [S21 `packages/api/src/contracts.ts:1934-1937`; S22 `apps/web/src/lib/repos/kernel.ts:385,576-580`]

## 9. Flows (tóm tắt — chi tiết ở [`srs/schedule-reverse-flows.md`](./srs/schedule-reverse-flows.md))

1. **F1 — Xem lịch & đổi Tháng/Tuần/Ngày**: mở `/schedule` (kiểm phiên) → phân tích URL (dọn tham số rác, dịch `?week=` cũ) → dựng view-model thuần từ snapshot → render view; đổi view chỉ đổi URL + tính lại client. ✅
2. **F2 — Tạo sự kiện vận hành**: mở hộp thoại (ngày mặc định = ngày neo) → kiểm hợp lệ phản ứng theo bộ luật chung → gửi POST → server chốt tổ chức/người dùng từ phiên, ghi dòng → trả dòng đầy đủ → client vá cache tại chỗ + toast thành công → chip hiện ngay. Lỗi 4xx hiển thị inline, lỗi khác/quá hạn chờ → toast thử lại. ✅
3. **F3 — Xóa sự kiện vận hành**: bấm chip → chi tiết → Xóa → xác nhận → gửi DELETE → thành công gỡ khỏi cache + toast; 404 coi như "đã không còn tồn tại"; lỗi khác → toast thử lại. ✅
4. **F4 — Điểm chạm ca học & kỳ nghỉ từ lịch** (biên): bấm ca học mở hộp thoại ca học (classes); bấm "+ Tạo lịch nghỉ" mở hộp thoại kỳ nghỉ (holidays); hoàn tác kỳ nghỉ trong view Tuần. ✅

## 10. Screens (tóm tắt)

- **/schedule — "Lịch dạy"**: đầu trang kicker + tiêu đề + cụm điều khiển (bộ chuyển Tháng/Tuần/Ngày, nút "Sự kiện", nút "+ Tạo lịch nghỉ"); hàng điều hướng ←/Hôm nay/→; thân = 1 trong 3 view; trạng thái rỗng khi chưa có lớp lẫn sự kiện. ✅ [S1 `apps/web/src/routes/_auth/schedule.tsx:132-258`]
  - View Tháng: `schedule-month-grid`, ô ngày bấm được (`aria-label "Xem lịch ngày dd/MM"`), "+N xem ngày", chấm màu 375px. ✅ [S7 `apps/web/src/components/schedule/schedule-month-view.tsx:66-158`]
  - View Tuần: `.week-cal` 7 cột, cột hôm nay tô viền + nhãn "Hôm nay", khối "—" khi trống hoàn toàn. ✅ [S8:57-124]
  - View Ngày: `schedule-day-agenda`, thông báo ngày trống "Không có ca học hay sự kiện nào trong ngày này.". ✅ [S9:34-49]
- **Hộp thoại "Tạo sự kiện vận hành"** (`schedule-add-event` → form, `org-event-submit`): 5 trường, lỗi inline, dòng lỗi server `role="alert"`. ✅ [S10:119-228]
- **Chi tiết sự kiện vận hành** (chip `org-event-chip` → hộp thoại, nút `org-event-delete` → `org-event-delete-confirm`): thông tin ngày giờ, ghi chú, ghi chú miễn trừ, xác nhận xóa 2 bước. ✅ [S11:60-156]
- **Hộp thoại "Tạo lịch nghỉ"** (`holiday-open`) + **thẻ kỳ nghỉ** `holiday-calendar-card` + **hộp thoại hoàn tác** — điểm chạm feature holidays. ✅ [S1:157-162; S29:1-9; S8:236-271]
- **Hộp thoại ca học** (ClassSessionModal) — điểm chạm feature classes, mở từ Tuần/Ngày. ✅ [S9:112-135; S30:18-25]

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Toán lịch chỉ chạy trên chuỗi yyyy-mm-dd neo UTC; "hôm nay" theo Asia/Ho_Chi_Minh; biên năm 1970–2099 | Quy ước week-grid trong code | S3 `apps/web/src/lib/week-grid.ts:4-19` | ✅ |
| Sự kiện không được đụng vào buổi dạy/điểm danh/nhắc việc (thiết kế D4) | Quyết định thiết kế đã mã hóa trong test | S23 `apps/server/src/routes/events.test.ts:192-237`; S14 `apps/server/src/routes/events.ts:26-30` | ✅ |
| Mọi thay đổi dữ liệu phải chốt phạm vi tổ chức từ phiên, không tin client | Quy tắc PDR + middleware phiên | `docs/project-overview-pdr.md:32`; S17 `apps/server/src/app.ts:296-300` | ✅ |
| Snapshot phải tải xong trước khi workspace hiện (load gate) | PDR | `docs/project-overview-pdr.md:17` | ✅ |
| Không thêm cột màu vào bảng lớp — màu suy từ hash id (D2) | Quyết định thiết kế plan (đã mã hóa trong hàm màu) | S13 `apps/web/src/lib/class-color.ts:1-22`; plan `plans/261026-2018-tos-14-schedule-views-and-events/plan.md:51` | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Snapshot kernel (classes, lessons, classSessions, syllabi, events, holidays, shifts, cancels) | feature kernel/server | 3 view trắng/ra lỗi nếu thiếu mảng bắt buộc; mảng tùy chọn (events/holidays/classSessions) tự bó rỗng | S16 `apps/server/src/routes/snapshot.ts:263,440,732`; S22 `apps/web/src/lib/repos/kernel.ts:385,570-580` | ✅ |
| Hộp thoại ca học + dữ liệu buổi | feature classes | Không mở được ca từ lịch (FR-015) | S30 | ✅ |
| Schema/hộp thoại kỳ nghỉ | feature holidays | FR-014 suy giảm còn thẻ trống | S29; S21 `packages/api/src/contracts.ts:3620-3645` | ✅ |
| Đăng nhập Better-Auth + bootstrap tổ chức | feature auth | Không vào được /schedule (redirect về đăng nhập) | S31 `apps/web/src/routes/_auth/route.tsx:5-40`; S17 `apps/server/src/app.ts:270-301` | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Người dùng duy nhất đăng nhập ứng dụng giáo viên là giáo viên/thành viên org — mọi thành viên đều được tạo/xóa sự kiện (route không kiểm vai trò) | Nếu tổ chức có vai trò phụ (ta/Owner…?) không được phép, cần thêm cổng vai trò — hiện không có | S14 `apps/server/src/routes/events.ts:31-78` (chỉ chặn chưa đăng nhập); S17 `apps/server/src/app.ts:296-300` | 🟡 OQ-2 |
| Nhập nhầm sự kiện chấp nhận xóa-tạo-lại (không có sửa) | Nếu người dùng cần sửa, phải thêm tính năng — hiện phải xóa tạo lại | âm bản Gap-1; plan non-goal `plans/261026-2018-tos-14-schedule-views-and-events/plan.md:60` | 🟡 OQ-1 |
| ≤ 2 giây đo từ máy người dùng trên snapshot đã tải — đủ cho quy mô 50 lớp × 24 buổi | Nếu org lớn hơn nhiều, vẫn chỉ tốn một lần index (NFR-003 đo 50×24); chưa có đo ở quy mô lớn hơn | S5 `apps/web/src/lib/schedule-month.ts:171-175`; S27 `apps/web/src/lib/schedule-month.test.ts:363-391` | 🔵 |
| `maxLength` ô nhập (200/600) cố ý nới rộng hơn bộ luật (100/500) để lỗi inline hiện được thay vì cắt ngầm | Nếu là sơ suất, người dùng gõ >100 ký tự sẽ gặp lỗi bất ngờ; nếu cố ý, giữ nguyên | S10 `apps/web/src/components/schedule/org-event-modal.tsx:161,220` so với S20 `packages/api/src/event-contracts.ts:3-5` | 🟡 OQ-3 |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] OQ-1: Sự kiện vận hành chỉ tạo/xóa, không sửa — có chấp nhận "xóa rồi tạo lại" khi nhập nhầm giờ không? (code không có đường sửa nào; plan TOS-14 xếp "sửa sự kiện" vào non-goals)
- [ ] OQ-2: Có cần giới hạn vai trò cho tạo/xóa sự kiện không? (route hiện chỉ yêu cầu đã đăng nhập; mọi thành viên org đều làm được)
- [ ] OQ-5: Người dùng có cần cảnh báo khi sự kiện trùng khung giờ với ca học/sự kiện khác không? (thiết kế D4 ghi rõ không chặn trùng giờ — chỉ xác nhận lại với nghiệp vụ)
