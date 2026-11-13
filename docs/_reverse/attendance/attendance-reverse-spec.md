---
type: reverse-srs
feature: attendance
status: draft
updated: 2026-11-12
confidence_summary: "✅74 🔵21 🟡90 (trong spec; toàn bộ 14 file: ✅99 🔵24 🟡113 — đếm theo luật batch sau audit) — OQ 12"
links:
  - reverse-sources.md
  - reverse-gaps.md
  - _evidence.md
  - srs/attendance-reverse-flows.md
  - srs/attendance-reverse-states.md
  - srs/attendance-reverse-erd.md
  - usecases/attendance-reverse-usecase-index.md
---

# attendance — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn (code khẳng định, cite 1 chỗ) · 🔵 có ≥2 chỗ code hậu thuẫn · 🟡 Inferred — code KHÔNG nói, cần xác nhận. Nhãn chứng thực cột mô tả + Nguồn; cột Priority (FR/NFR) và Severity (error matrix) là phân loại của nhà phân tích, không có nguồn trong code/test (xem OQ-01).

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) (S1–S36, liên tục).
- **Câu hỏi mở / Gap / Conflict / Inferred:** xem [`reverse-gaps.md`](./reverse-gaps.md) (OQ-01…OQ-12, GAP-1…GAP-3, INF-1…INF-6; không phát hiện Conflict code-vs-code).
- **Bằng chứng chi tiết theo hạng mục:** xem [`_evidence.md`](./_evidence.md).
- Feature `attendance` bao trùm 2 mảng nghiệp vụ liền mạng: (1) **điểm danh hằng ngày** — màn `/attendance` điểm danh tổng theo ngày với 4 trạng thái cho từng học viên, và (2) **ngày nghỉ lễ** — "Lịch nghỉ chung" của tổ chức dời/hủy buổi học trúng khoảng nghỉ, kèm hoàn tác. Hai mảng gặp nhau ở quy tắc "buổi nghỉ lễ không diễn ra → không nằm trong cửa điểm danh" 🔵 [S1 — apps/server/src/routes/daily-attendance.ts:52-59; S5 — packages/db/src/schema/lesson.ts:48-57; S9 — apps/server/src/routes/kernel.ts:2947-2951; S21 — apps/server/src/routes/holidays.test.ts:1201-1222].
- Data ghi duy nhất của điểm danh nằm trên bảng `lesson` (2 cột `attendance`, `attendance_note` + cập nhật `status`); dữ liệu nghỉ lễ nằm trên 4 bảng riêng `organization_holiday*` / `holiday_session_*` 🔵 [S5 — packages/db/src/schema/lesson.ts:57-68; S6 — packages/db/src/schema/organization-holiday.ts:22-149; S29 — packages/db/src/migrations/0045_aspiring_thena.sql:1-2, packages/db/src/migrations/0047_slim_nightmare.sql:18-42, packages/db/src/migrations/0050_bent_spectrum.sql:1-15].
- Feature dùng chung 2 pipeline đã có đặc tả riêng: cửa "Việc cần làm hôm nay" (dashboard) chỉ là bộ đếm + CTA dẫn vào `/attendance`, còn hộp thoại tạo/hoàn tác lịch nghỉ sống trong màn Lịch (schedule) — tài liệu này bóc phần nghiệp vụ điểm danh + nghỉ lễ, không tái đặc tả UI lịch tuần 🔵 [S10 — apps/server/src/routes/dashboard-reminders.ts:64-149; S30 — apps/web/src/components/schedule/holiday-modal.tsx:237-238; S4 — apps/e2e/specs/daily-attendance.spec.ts:59-66].
- `existing_doc = null` (docs/_reverse/reverse-plan.json:205-215) → không có Mục 0.3 "Khác biệt với tài liệu chính".

## 1. Scope

Feature `attendance` đặc tả:

- **Trong scope:**
  - Màn `/attendance` — "Điểm danh tổng theo ngày": chọn ngày (mặc định hôm nay giờ VN), lọc ca theo chip Tất cả / Chưa điểm danh / Đã điểm danh, mở từng ca để điểm danh 4 trạng thái + ghi chú cho từng học viên, lưu cả ca trong 1 request 🔵 [S3 — apps/web/src/routes/_auth/attendance.tsx:323-439; S4 — apps/e2e/specs/daily-attendance.spec.ts:7-12].
  - API đọc danh sách ca trong ngày `GET /api/attendance/daily?date=` và API ghi `PUT /api/classes/:id/sessions/:date/attendance` (gọi từ màn này và từ trang lớp) 🔵 [S1 — apps/server/src/routes/daily-attendance.ts:306-330; S9 — apps/server/src/routes/kernel.ts:2909-3040; S11 — apps/web/src/lib/repos/daily-attendance.ts:93-112].
  - Quy ước hiển thị dữ liệu điểm danh cũ (điểm danh 1-click trước TOS-7): `completed + attendance NULL` hiện "Có mặt", `absent + attendance NULL` hiện "Chưa rõ" 🔵 [S1 — apps/server/src/routes/daily-attendance.ts:61-78; S7 — packages/api/src/contracts.ts:1384-1390; S13 — apps/web/src/components/attendance/attendance-session-row.tsx:346-349,369-373].
  - Điền nhanh "Đánh dấu tất cả Có mặt" + hộp xác nhận "Gán Có mặt và lưu" khi còn học viên chưa chọn 🔵 [S12 — apps/web/src/lib/attendance-draft.ts:111-131; S13 — apps/web/src/components/attendance/attendance-session-row.tsx:136-162; S15 — apps/web/src/components/attendance/fill-missing-confirm.tsx:14-58].
  - Auto-advance: sau khi lưu ca đầu tiên, tự mở ca chưa điểm danh kế tiếp, focus picker đầu, aria-live báo hoàn tất 🔵 [S3 — apps/web/src/routes/_auth/attendance.tsx:184-261; S26 — apps/web/src/routes/_auth/attendance.test.tsx:304-824].
  - "Lịch nghỉ chung": preview → apply (mode `shift` dời buổi +1 vào cuối khóa, mode `cancel` hủy không bù) → hoàn tác kỳ nghỉ tương lai; kèm thông báo in-app + email cho học viên 🔵 [S2 — apps/server/src/routes/holidays.ts:450-1012; S8 — packages/api/src/holiday-plan.ts:94-283; S17 — apps/web/src/lib/repos/holidays.ts:48-122].
  - Tương tác hai chiều với điểm danh: buổi `holiday`/`cancelled` bị loại khỏi danh sách điểm danh; buổi đã điểm danh bị khóa không dời/hủy; hoàn tác chặn khi buổi bù đã bị đụng 🔵 [S1 — apps/server/src/routes/daily-attendance.ts:52-59; S8 — packages/api/src/holiday-plan.ts:176-187; S2 — apps/server/src/routes/holidays.ts:763-830].
- **Ngoài scope (không đặc tả ở đây):** UI lịch tuần/tháng và khóa sửa nhóm `holiday` (feature schedule — chỉ trích làm bằng chứng chéo), luồng điểm danh trên trang lớp chi tiết (luồng cũ), dashboard đầy đủ, cấp gói buổi học theo `lesson.status` (invariant 6 — chỉ trích hàm ánh xạ).

## 2. Actors

| Actor | Vai trò trong feature | Bằng chứng | Mức |
|---|---|---|---|
| Giáo viên (teacher app) | Actor duy nhất thực hiện mọi use case: xem, điểm danh, điền nhanh, tạo/hoàn tác lịch nghỉ. Session teacher bootstrap org; scope dữ liệu là toàn org (`resolveReminderScope()` không truyền role → `kind: "org"`) | apps/server/src/routes/daily-attendance.ts:322-327; apps/server/src/routes/dashboard-reminders.ts:275-281 | ✅ |
| Học viên (student portal) | Bị chặn tuyệt đối: bootstrap middleware trả 403 trước khi vào kernel routes | apps/server/src/app.ts:224-232; apps/server/src/routes/daily-attendance.test.ts:549-565 | ✅ |
| Role admin | Bị chặn trên kernel tree (chỉ làm việc trên /api/admin) | apps/server/src/app.ts:234-237 | ✅ |
| Học viên (người nhận thông báo) | Nhận thư `holiday_created` + bản ghi in-app khi `notify = true` — actor thụ động, không thao tác | apps/server/src/routes/holidays.ts:637-669; apps/server/src/routes/holidays.test.ts:1462-1494 | ✅ |

- Actor thật của nghiệp vụ (ai bị ảnh hưởng bởi cửa điểm danh — học viên, phụ huynh, trung tâm) là 🟡 Inferred: code chỉ cơ chế, không nói mục tiêu kinh doanh (INF-1, OQ-02).

## 3. Functional Requirements

> Cột Priority do nhà phân tích đề xuất (🟡 — chưa có nguồn P0/P1 trong code/test; xem OQ-01).

| Mã | Chức năng | Quy tắc (kèm mức + nguồn) | Priority |
|---|---|---|---|
| FR-01 | Hợp đồng URL màn điểm danh | 🔵 `/attendance?date=YYYY-MM-DD&status=all\|pending\|completed`; parse non-throw — giá trị lệch rơi về mặc định (date sai → hôm nay, status lạ → `all`), không throw, không redirect | 🟡 |
| FR-02 | Mặc định "hôm nay" theo giờ Việt Nam | 🔵 Client: `todayISOVietnam()` qua Intl `Asia/Ho_Chi_Minh`; server: thiếu `?date=` → `vietnamTodayISO()`; nút "Hôm nay" disable khi đang ở hôm nay | 🟡 |
| FR-03 | GET daily gom ca theo bucket "1 buổi vật lý" | ✅ Lớp có ngày: bucket `(classId, date)` — mọi dòng lesson cùng ngày là một buổi; ca sắp theo giờ rồi tên lớp (vi), học viên theo tên (vi) rồi lessonId | 🟡 |
| FR-04 | Lớp legacy (date NULL) chỉ xem | ✅ Bucket `(classId, time)`, `mode: "legacy"`, `lessonId: null`, attendance luôn null; UI hiện "Lớp chưa gắn lịch ngày" + link "Mở lớp để điểm danh →", không render picker | 🟡 |
| FR-05 | Loại buổi không diễn ra khỏi danh sách | 🔵 Buổi `cancelled` và `holiday` bị lọc khỏi mọi ca của GET daily; PUT cũng loại 2 trạng thái này khỏi roster điểm danh | 🟡 |
| FR-06 | Tenant & sĩ số active | 🔵 Mọi truy vấn gắn `orgId` (join class/enrollment/student cùng org); chỉ enrollment `status = "active"` tạo dòng học viên trong ca | 🟡 |
| FR-07 | Cờ `recorded` + bộ đếm | ✅ `recorded = true` khi ca không còn dòng `upcoming`; counts `all/pending/completed` đếm theo ca | 🟡 |
| FR-08 | Hiển thị dữ liệu điểm danh cũ | 🔵 `completed + attendance NULL` → hiển thị `present`; `absent + attendance NULL` → giữ `null` ("Chưa rõ") — không bịa "excused", không đụng dữ liệu | 🟡 |
| FR-09 | 4 trạng thái điểm danh | ✅ `present \| late \| excused \| unexcused` — enum duy nhất ở contract, nhãn UI "Có mặt / Đi muộn / Vắng có phép / Vắng không phép" | 🟡 |
| FR-10 | Ánh xạ trạng thái điểm danh → `lesson.status` (D2) | ✅ present/late → `completed` (trừ buổi); excused → `absent` (không trừ); unexcused → `completed` khi `UNEXCUSED_CONSUMES_SESSION = true` | 🟡 |
| FR-11 | Ghi chú học vụ | ✅ ≤255 ký tự sau trim (server chặn, client cắt + placeholder nhắc); lưu vào `lesson.attendance_note` | 🟡 |
| FR-12 | Lưu cả ca, đủ sĩ số | ✅ PUT nhận `entries[]` (lessonId + attendance + note), chặn trùng lessonId; thừa id lạ → 422 `unknown-lesson`; thiếu → 422 `incomplete-roster` kèm `missing[]` | 🟡 |
| FR-13 | Chặn điểm danh ngày tương lai | ✅ `date > hôm nay (VN)` → 422 `future-session` (422 chứ không 409 — 409 dành cho "heal stale snapshot") | 🟡 |
| FR-14 | Chống race roster | ✅ Ghi bằng 1 batch nguyên tử kèm roster-count guard trong WHERE; số dòng cập nhật ≠ entries → 409 `roster-changed`, DB không đổi | 🟡 |
| FR-15 | Điền nhanh chỉ điền ô trống | ✅ "Đánh dấu tất cả Có mặt" gán `present` cho dòng `attendance = null`, giữ lựa chọn có sẵn + ghi chú; disabled khi ca đã recorded / ngày tương lai / đang lưu / không còn ô trống | 🟡 |
| FR-16 | Lưu khi thiếu trạng thái | ✅ Ca chưa recorded → modal "Gán Có mặt và lưu" / "Quay lại chỉnh" (không PUT); ca đã recorded còn "Chưa rõ" → giữ hành vi cũ: viền cảnh báo + focus dòng thiếu đầu tiên | 🟡 |
| FR-17 | Auto-advance sau lưu lần đầu | ✅ Sau lưu ca chưa recorded: mở ca pending kế tiếp (tính từ dữ liệu SAU refetch), focus picker đầu; hết ca → aria-live "Đã điểm danh xong mọi ca trong ngày" (+ ghi chú ca legacy) hoặc "Còn N ca chưa điểm danh trong ngày"; hủy advance khi đổi ngày/chip giữa lúc lưu, refetch lỗi, dữ liệu stale; ca đã recorded không auto-advance | 🟡 |
| FR-18 | Hợp đồng draft lịch nghỉ | ✅ name 2–100 ký tự sau trim; fromDate/toDate ISO chuẩn lịch (roundtrip UTC); toDate ≥ fromDate; khoảng ≤ 30 ngày tính cả hai đầu; scope `org\|classes`; scope classes bắt buộc ≥1 lớp, classIds dedupe ≤200; mode `shift\|cancel`; notify default true | 🟡 |
| FR-19 | Preview lịch nghỉ | ✅ POST `/api/holidays/preview` tính kế hoạch từ DB, không ghi DB; lớp lạ/lệch org → 404; body sai contract → 400 | 🟡 |
| FR-20 | Luật planner dời buổi | ✅ Chỉ dời buổi mà MỌI dòng còn `upcoming`; buổi có dòng completed/absent → `keptCompleted` (giữ nguyên); buổi toàn cancelled/holiday → bỏ qua; lớp legacy-schedule hoặc còn dòng không có ngày → `unsupported`; ngày bù quét từ `max(buổi dạy cuối, hôm nay) + 1`, đúng thứ chuẩn lớp, nhảy qua ngày thuộc kỳ nghỉ (ghi `skippedHolidays` kèm tên, tên null = kỳ đang tạo) và ngày đã có dòng lesson; trần quét 364 ngày — vượt thì ném lỗi, không bịa ngày; số thứ tự buổi không đếm nhóm `holiday` | 🟡 |
| FR-21 | planHash chống stale preview (I7) | ✅ Preview trả `planHash` SHA-256 của danh sách shift/cancel; apply bắt gửi lại; server tính lại từ DB — lệch → 409 `stale-preview`, không ghi | 🟡 |
| FR-22 | Apply nguyên tử có guard | ✅ Toàn bộ ghi trong 1 batch nguyên tử; mỗi shift/cancel có guard CASE: trạng thái lệch (buổi vừa bị điểm danh / ngày bù đã có dòng / đã có bản cancel-shift) → cột NOT NULL nhận NULL → rollback TOÀN batch → 409 `stale-preview` | 🟡 |
| FR-23 | Chặn khoảng đã qua | ✅ `fromDate < hôm nay (VN)` → 422 `past-range` — chỉ dời/hủy buổi chưa diễn ra | 🟡 |
| FR-24 | Trần kích thước apply | ✅ Số câu lệnh batch > 500 → 422 `too-large` (cả apply lẫn undo), không cắt âm thầm | 🟡 |
| FR-25 | Mode cancel (hủy không bù) | ✅ Buổi trúng khoảng chuyển `upcoming → cancelled`, KHÔNG sinh buổi bù, không đổi max(date) khóa; bản ghi `holiday_session_cancel` unique `(classId, date)` | 🟡 |
| FR-26 | Hoàn tác kỳ nghỉ tương lai | ✅ DELETE `/api/holidays/:id`: chỉ khi `fromDate > hôm nay (VN)` (ngược lại 422 `holiday-started`); buổi bù còn nguyên `upcoming` và buổi gốc còn nguyên `holiday`/`cancelled` mới được hoàn tác — lệch → 409 `makeup-touched` kèm `touched[]`; khôi phục trong 1 batch guard, dời tài liệu ngược về ngày gốc, xóa sạch bảng con | 🟡 |
| FR-27 | Thông báo khi apply | ✅ `notify = true`: 1 notif in-app kê "schedule" cho org ("Lịch nghỉ «tên»: dời/hủy N buổi của M lớp") + sự kiện `holiday_created` gửi email/in-app cho mọi học viên ACTIVE của lớp bị ảnh hưởng; `notify = false` → không tạo bản ghi nào | 🟡 |
| FR-28 | Tài liệu theo buổi bù | ✅ `lesson_material` gắn `(classId, date)` được dời theo ngày bù khi apply và dời ngược khi hoàn tác; dòng trùng materialId được dọn trước để không đụng khóa chính | 🟡 |
| FR-29 | Cửa "Việc cần làm" trên dashboard | ✅ Bộ đếm ca chưa điểm danh hôm nay (lesson `upcoming`, bucket dated `(classId,date)` / legacy `(classId,time)`), tối đa 3 dòng xem trước, CTA `/attendance?date=<hôm nay>&status=pending`; sau khi lưu, bộ đếm giảm về 0 và thẻ chuyển "Đã hoàn tất hôm nay" | 🟡 |
| FR-30 | Khóa sửa nhóm buổi nghỉ lễ | ✅ Nhóm có dòng `holiday` bị chặn move/edit từ luồng lịch (409 `holiday-locked`) — buổi gốc-dời chỉ sống theo cặp `holiday_session_shift` | 🟡 |
| FR-31 | Ranh quyền vào feature | ✅ Chưa đăng nhập → 401; session student → 403 `ACCOUNT_STUDENT_ROLE`; session admin → 403 `ADMIN_ON_TEACHER_APP`; teacher (có allowlist email thì phải khớp) mới bootstrap được org | 🟡 |
| FR-32 | Kích hoạt enrollment muộn (D6/D7) | ✅ Học viên kích hoạt sau khi kỳ nghỉ áp dụng vẫn nhận đủ: buổi gốc `holiday` + các buổi bù `upcoming` (không dư buổi); mode cancel → dòng ngày hủy là `cancelled`, không sinh bù | 🟡 |

## 4. Non-Functional Requirements

> Cột Priority do nhà phân tích đề xuất (🟡 — xem OQ-01).

| Mã | Yêu cầu | Chỉ số & bằng chứng | Priority |
|---|---|---|---|
| NFR-01 | Tải danh sách điểm danh nhanh | 🟡 GET `/api/attendance/daily` ≤ 2000ms — đo thời gian server, không tính render/lần compile đầu (E2E assert) [apps/e2e/specs/daily-attendance.spec.ts:68-78] | 🟡 |
| NFR-02 | Lưu điểm danh nhanh, không đổi URL | 🟡 Bấm "Lưu điểm danh ca học" → toast xác nhận ≤ 2000ms; URL giữ nguyên [apps/e2e/specs/daily-attendance.spec.ts:137-146, apps/e2e/specs/daily-attendance.spec.ts:341-346] | 🟡 |
| NFR-03 | Hoàn tất điểm danh 5 lớp ≤ 120s | 🟡 NFR-008: 5 lớp (3–5 HV) hoàn tất bằng điền nhanh tổng ≤ 120 giây (proxy đo 1 lần, ngưỡng override qua env `NFR008_TOTAL_MS` cho CI chậm) [apps/e2e/specs/daily-attendance.spec.ts:440-534] | 🟡 |
| NFR-04 | Ghi server hiệu năng | ✅ Ca 30 học viên lưu < 300ms ở server (unit test) [apps/server/src/routes/daily-attendance.test.ts:922-945] | 🟡 |
| NFR-05 | Không lộ dữ liệu tenant khác | ✅ Lớp lạ hoặc lệch org không phân biệt được với "không tồn tại" (đều 404) — NFR-005 nêu trong chú thích code loader [apps/server/src/routes/holidays.ts:98-137; apps/server/src/routes/kernel.ts:2917-2923] | 🟡 |
| NFR-06 | Ràng buộc nền D1/Workers | ✅ Truy vấn IN chia lô 50 giá trị (trần bind parameter D1); ghi nguyên tử trong 1 batch (D1 không có transaction tương tác); trần 500 câu/batch | 🟡 |
| NFR-07 | A11y & mobile | 🔵 Picker theo WAI-ARIA radiogroup + roving tabindex (mũi tên đổi trạng thái); aria-live "polite" luôn mount; nút ghi ≥ 44px ở <lg; 375px không cuộn ngang | 🟡 |
| NFR-08 | Xác định ngày giờ nhất quán | 🔵 Mọi ngày là chuỗi `yyyy-mm-dd` neo UTC; "hôm nay" giải theo Asia/Ho_Chi_Minh (Workers chạy UTC, trừ 7h mới sang ngày VN) — một nguồn dùng chung server/web/test | 🟡 |
| NFR-09 | Chuỗi hiển thị tiếng Việt | 🟡 Toàn bộ wording là chuỗi literal tiếng Việt trong code; KHÔNG có lớp i18n/catalog (negative-search — GAP-1, OQ-12) | 🟡 |

## 5. Business Rules

| Mã | Quy tắc | Mức + nguồn |
|---|---|---|
| BR-01 | Vắng không phép TRỪ 1 buổi gói, vắng có phép KHÔNG trừ — chính sách mới chốt bởi user (Validation Session 1, 2026-10-26); setting cũ `unexcused_deduct` là tombstone chưa từng được enforce | 🔵 packages/api/src/contracts.ts:1326-1358; packages/api/src/attendance.test.ts:18-55; packages/db/src/schema/settings.ts:32 |
| BR-02 | Buổi `holiday` (buổi gốc đã dời) không trừ buổi, không điểm danh, không sửa/hủy — buổi bù là dòng `upcoming` thường, số buổi không phải `holiday` vẫn bằng sessionsTotal | 🔵 packages/db/src/schema/lesson.ts:48-57; apps/server/src/routes/kernel.ts:2947-2951, apps/server/src/routes/kernel.ts:3008-3009; apps/server/src/routes/daily-attendance.ts:52-59 |
| BR-03 | Dữ liệu điểm danh 1-click cũ: `completed + NULL` quy ước hiển thị "Có mặt"; `absent + NULL` hiển thị "Chưa rõ" và buộc GV chủ động chọn — không tự bịa trạng thái | 🔵 apps/server/src/routes/daily-attendance.ts:61-78; packages/api/src/contracts.ts:1384-1390; apps/web/src/components/attendance/attendance-session-row.tsx:346-349,369-373 |
| BR-04 | Hai kỳ nghỉ chồng ngày: kỳ KHAI BÁO TRƯỚC thắng (duyệt theo createdAt ASC, id) | ✅ apps/server/src/routes/holidays.ts:162-225; packages/api/src/holiday-plan.ts:159-168; packages/api/src/holiday-plan.test.ts:167-184 |
| BR-05 | Buổi đã điểm danh (có dòng `completed`/`absent`) KHÔNG bị dời hay hủy — vào `keptCompleted`, giữ nguyên cả bucket | ✅ packages/api/src/holiday-plan.ts:176-197; packages/api/src/holiday-plan.test.ts:185-234; apps/e2e/specs/holiday-skip-and-kept-completed.spec.ts:197-240 |
| BR-06 | Ngày bù: sau buổi dạy MUỘN NHẤT của lớp và sau hôm nay; đúng thứ trong lịch chuẩn lớp; nhảy qua ngày thuộc kỳ nghỉ (ghi tên) và ngày đã có bất kỳ dòng lesson nào; không sinh ngày bù quá khứ | ✅ packages/api/src/holiday-plan.ts:218-262; packages/api/src/holiday-plan.test.ts:62-115,257-310 |
| BR-07 | Kỳ nghỉ chỉ hoàn tác được khi CHƯA bắt đầu (`fromDate > hôm nay` giờ VN) | ✅ apps/server/src/routes/holidays.ts:695-704; apps/server/src/routes/holidays.test.ts:1889-1908; apps/e2e/specs/holiday-cancel-and-undo.spec.ts:196-231 |
| BR-08 | `holiday_session_cancel` là nguồn DUY NHẤT để khôi phục buổi do kỳ nghỉ hủy — không khôi phục nhầm buổi GV đã hủy tay cùng ngày | ✅ packages/db/src/schema/organization-holiday.ts:114-121; apps/server/src/routes/holidays.test.ts:1844-1888 |
| BR-09 | Ràng buộc một-lần: một buổi gốc chỉ dời 1 lần; hai buổi bù không cùng ngày của cùng lớp; một ngày một lớp chỉ bị hủy bởi tối đa một kỳ nghỉ thành công | ✅ packages/db/src/schema/organization-holiday.ts:71-111,141-149 |
| BR-10 | Ghi chú học vụ là teacher-only — không bao giờ chiếu vào `/api/student` | ✅ packages/db/src/schema/lesson.ts:67-68 |
| BR-11 | Mode `cancel` không sinh buổi bù và không kéo dài ngày kết thúc khóa — học viên chấp nhận mất buổi đó (không có cơ chế đền/bù trong code) | ✅ packages/api/src/holiday-plan.ts:201-214; apps/server/src/routes/holidays.test.ts:1551-1632; hệ quả nghiệp vụ 🟡 INF-4/OQ-11 |
| BR-12 | Ca legacy (lớp chưa gắn lịch ngày) không điểm danh được trên màn ngày — chỉ xem và dẫn về trang lớp | 🔵 apps/server/src/routes/daily-attendance.ts:251-281; apps/web/src/components/attendance/attendance-session-row.tsx:230-274; apps/web/src/routes/_auth/attendance.tsx:243-251 |

## 6. Error Matrix (wording thật, nguyên văn)

> Không có catalog i18n trong repo (GAP-1): wording lấy NGUYÊN VĂN tại throw-site / component. Cột Severity là phân tích của BA (🟡 — OQ-01).

| Mã | Tình huống | HTTP + payload máy | Wording người dùng (nguyên văn) | Nguồn | Severity |
|---|---|---|---|---|---|
| E-01 | Chưa đăng nhập gọi API feature | 401 `{"error":"unauthorized"}` | (auth layer xử lý ngoài feature) | apps/server/src/routes/daily-attendance.ts:306-308; apps/server/src/routes/holidays.ts:462-464 | 🟡 |
| E-02 | Session student/admin mở app GV | 403 `{"error":"ACCOUNT_STUDENT_ROLE","code":"ACCOUNT_STUDENT_ROLE"}` / `"ADMIN_ON_TEACHER_APP"` | (không wording riêng) | apps/server/src/app.ts:224-237; apps/server/src/routes/daily-attendance.test.ts:549-565 | 🟡 |
| E-03 | `?date=` sai định dạng | 400 `{"error":"invalid date","reason":"invalid-date"}` | `Ngày không đúng định dạng.` | apps/server/src/routes/daily-attendance.ts:315-318; apps/web/src/routes/_auth/attendance.tsx:272-279 | 🟡 |
| E-04 | PUT body lệch schema / JSON hỏng | 400 `{"error":"invalid body"}` | `Không thể lưu điểm danh. Vui lòng thử lại.` (nhánh fallback) | apps/server/src/routes/kernel.ts:2913-2914, apps/server/src/routes/kernel.ts:3030-3032; apps/web/src/routes/_auth/attendance.tsx:298-301 | 🟡 |
| E-05 | Lớp lạ / lệch org | 404 `{"error":"class not found","reason":"not-found"}` (PUT) · `{"error":"class not found","reason":"class"}` (holiday preview/apply) | (không hiển thị riêng — ca không tồn tại thì không bấm được) | apps/server/src/routes/kernel.ts:2916-2923; apps/server/src/routes/holidays.ts:500-503,526-528 | 🟡 |
| E-06 | PUT vào ngày không còn dòng điểm danh (toàn holiday/cancelled hoặc không có buổi) | 404 `{"error":"occurrence not found","reason":"not-found"}` | `Không thể lưu điểm danh. Vui lòng thử lại.` | apps/server/src/routes/kernel.ts:2953-2958; apps/web/src/routes/_auth/attendance.tsx:298-301 | 🟡 |
| E-07 | Điểm danh ngày tương lai | 422 `{"error":"future-session","reason":"future-session"}` | `Chưa đến ngày học, chưa thể điểm danh.` (banner lỗi) · `Chưa đến ngày học` (thẻ ca) | apps/server/src/routes/kernel.ts:2925-2928, apps/server/src/routes/kernel.ts:326-333; apps/web/src/routes/_auth/attendance.tsx:280-286; apps/web/src/components/attendance/attendance-session-row.tsx:277-281 | 🟡 |
| E-08 | Lưu khi còn học viên chưa chọn (server xác nhận thiếu) | 422 `{"error":"incomplete roster","reason":"incomplete-roster","missing":[...]}` | Toast `Danh sách lớp vừa thay đổi, đã tải lại.` + tự refetch (trước đó client đã chặn bằng alert `Còn {n} học viên chưa chọn trạng thái`) | apps/server/src/routes/kernel.ts:2973-2985; apps/web/src/routes/_auth/attendance.tsx:287-296; apps/web/src/components/attendance/attendance-session-row.tsx:283-290 | 🟡 |
| E-09 | Gửi kèm lessonId lạ | 422 `{"error":"unknown lesson","reason":"unknown-lesson"}` | `Danh sách lớp vừa thay đổi, đã tải lại.` | apps/server/src/routes/kernel.ts:2964-2971; apps/web/src/routes/_auth/attendance.tsx:287-296 | 🟡 |
| E-10 | Roster đổi giữa lúc đọc và ghi | 409 `{"error":"roster changed","reason":"roster-changed"}` | `Danh sách lớp vừa thay đổi, đã tải lại.` | apps/server/src/routes/kernel.ts:2987-3037; apps/web/src/routes/_auth/attendance.tsx:287-296 | 🟡 |
| E-11 | Lỗi khác khi lưu | (tùy lỗi) | `Không thể lưu điểm danh. Vui lòng thử lại.` | apps/web/src/routes/_auth/attendance.tsx:298-301 | 🟡 |
| E-12 | Tải danh sách ngày lỗi | (network/5xx) | `Không thể tải danh sách ca học trong ngày.` + nút `Thử lại` | apps/web/src/routes/_auth/attendance.tsx:386-400 | 🟡 |
| E-13 | Holiday: Content-Type không phải JSON | 415 `{"error":"content-type must be application/json"}` | (chưa có wording riêng — đi vào nhánh fallback) | apps/server/src/routes/holidays.ts:472-481 | 🟡 |
| E-14 | Holiday: JSON hỏng / body lệch contract | 400 `{"error":"invalid json"}` / `{"error":"invalid body"}` | Form đã chặn trước (validate zod tại client, ví dụ `Tên từ 2–100 ký tự (đang {n})`) | apps/server/src/routes/holidays.ts:482-492; apps/web/src/components/schedule/holiday-modal.tsx:144-148 | 🟡 |
| E-15 | Holiday preview lỗi | 404/400/422 → Error mang `holidayErrorCode` | `Không tải được bảng xem trước` | apps/web/src/lib/repos/holidays.ts:47-54; apps/web/src/components/schedule/holiday-modal.tsx:130-132 | 🟡 |
| E-16 | Khoảng ngày đã qua khi apply | 422 `{"error":"past-range","reason":"past-range"}` | `Khoảng ngày đã qua — chỉ dời buổi chưa diễn ra.` | apps/server/src/routes/holidays.ts:513-522; apps/web/src/components/schedule/holiday-modal.tsx:223-224 | 🟡 |
| E-17 | Khoảng không trúng buổi nào | 422 `{"error":"no-sessions","reason":"no-sessions"}` | `Không có buổi học nào trong khoảng ngày đã chọn.` | apps/server/src/routes/holidays.ts:529-539; apps/web/src/components/schedule/holiday-modal.tsx:225-226 | 🟡 |
| E-18 | Phạm vi batch vượt 500 câu | 422 `{"error":"too-large","reason":"too-large"}` | `Phạm vi quá lớn — chọn ít lớp hoặc khoảng ngắn hơn.` | apps/server/src/routes/holidays.ts:604-612, apps/server/src/routes/holidays.ts:980-988; apps/web/src/components/schedule/holiday-modal.tsx:227-228 | 🟡 |
| E-19 | DB đổi giữa preview và apply (planHash lệch hoặc guard vi phạm) | 409 `{"error":"stale-preview","reason":"stale-preview"}` | `Lịch vừa thay đổi, kiểm tra lại bảng xem trước.` (tự tải lại preview) | apps/server/src/routes/holidays.ts:540-551, apps/server/src/routes/holidays.ts:613-628; apps/web/src/components/schedule/holiday-modal.tsx:196-222 | 🟡 |
| E-20 | Hoàn tác kỳ nghỉ không tồn tại / thuộc org khác | 404 `{"error":"holiday not found","reason":"holiday"}` | `Kỳ nghỉ không còn tồn tại.` | apps/server/src/routes/holidays.ts:692-694; apps/web/src/components/schedule/holiday-undo-dialog.tsx:143-144 | 🟡 |
| E-21 | Hoàn tác kỳ đã bắt đầu | 422 `{"error":"holiday-started","reason":"holiday-started"}` | `Kỳ nghỉ đã bắt đầu — không thể hoàn tác.` | apps/server/src/routes/holidays.ts:695-704; apps/web/src/components/schedule/holiday-undo-dialog.tsx:9,141-142 | 🟡 |
| E-22 | Buổi bù đã bị điểm danh / lịch lệch khi hoàn tác | 409 `{"error":"makeup-touched","reason":"makeup-touched","touched":[{classId,makeupDate}]}` | `Không thể hoàn tác vì có buổi học bù đã điểm danh hoặc đã thay đổi:` · `Không thể hoàn tác vì lịch học của kỳ nghỉ đã thay đổi.` | apps/server/src/routes/holidays.ts:821-830, apps/server/src/routes/holidays.ts:989-1003; apps/web/src/components/schedule/holiday-undo-dialog.tsx:9,136-139 | 🟡 |
| E-23 | Hoàn tác lỗi khác | (tùy lỗi) | `Không xóa được kỳ nghỉ. Thử lại.` | apps/web/src/components/schedule/holiday-undo-dialog.tsx:146-148 | 🟡 |
| E-24 | Move/edit nhóm có dòng `holiday` (luồng schedule) | 409 `{"error":"holiday occurrence is locked","reason":"holiday-locked"}` | (wording hiển thị thuộc feature schedule — OQ-06) | apps/server/src/routes/kernel.ts:1996-2000, apps/server/src/routes/kernel.ts:2206-2210; apps/server/src/routes/holidays.test.ts:1223-1262 | 🟡 |
| E-25 | Client còn thiếu trạng thái khi bấm Lưu (chưa gọi API) | (không HTTP) | Alert + modal: `Còn {n} học viên chưa chọn trạng thái` · mô tả modal `Gán Có mặt cho {n} học viên này rồi lưu điểm danh ca học?` | apps/web/src/components/attendance/attendance-session-row.tsx:283-290; apps/web/src/components/attendance/fill-missing-confirm.tsx:30,53-55 | 🟡 |
| E-26 | Form lịch nghỉ sai tại client | (không HTTP) | `Tên từ 2–100 ký tự (đang {n})` · `Ngày kết thúc phải từ ngày bắt đầu trở đi` · `Khoảng nghỉ tối đa 30 ngày` · `Chọn ít nhất một lớp` | apps/web/src/components/schedule/holiday-modal.tsx:144-164; apps/server/src/routes/holidays.test.ts:313-347 | 🟡 |

Wording THÀNH CÔNG (nguyên văn, để đối chiếu UI):

- Toast lưu điểm danh: `Đã lưu điểm danh` (lần đầu) / `Đã cập nhật điểm danh` (sửa ca đã recorded) — apps/web/src/routes/_auth/attendance.tsx:178.
- Toast áp lịch nghỉ: `Đã dời {n} buổi của {m} lớp.` / `Đã hủy {n} buổi.` — apps/web/src/components/schedule/holiday-modal.tsx:184-192.
- Notif in-app khi apply: `Lịch nghỉ «{tên}»: dời {n} buổi của {m} lớp` / `Lịch nghỉ «{tên}»: hủy {n} buổi của {m} lớp` — apps/server/src/routes/holidays.ts:588-592.
- Notif in-app khi hoàn tác: `Đã xóa kỳ nghỉ «{tên}»: khôi phục {n} buổi` — apps/server/src/routes/holidays.ts:969-977.
- Thông báo hoàn tất điểm danh (aria-live): `Đã điểm danh xong mọi ca trong ngày` · `Đã điểm danh xong mọi ca trong ngày. Còn {n} ca lớp chưa gắn lịch ngày, mở trang lớp để điểm danh.` · `Còn {n} ca chưa điểm danh trong ngày` — apps/web/src/routes/_auth/attendance.tsx:252-261.
- Empty-state: `Đã điểm danh xong mọi ca trong ngày` (ngày có dữ liệu, hết ca điểm danh được) / `Không có ca học nào trong ngày này.` — apps/web/src/routes/_auth/attendance.tsx:401-413.

## 7. Success Metrics

Chỉ số thành công đọc được từ AC/E2E (ngưỡng test đang chạy, không phải số liệu production — 🟡 INF-2):

| Chỉ số | Ngưỡng | Bằng chứng |
|---|---|---|
| Tải danh sách ca trong ngày | ≤ 2000ms (đo server) | apps/e2e/specs/daily-attendance.spec.ts:68-78 |
| Lưu 1 ca → toast xác nhận | ≤ 2000ms, URL không đổi | apps/e2e/specs/daily-attendance.spec.ts:137-146, apps/e2e/specs/daily-attendance.spec.ts:341-346 |
| Hoàn tất điểm danh 5 lớp bằng điền nhanh | ≤ 120s tổng (kèm auto-advance) | apps/e2e/specs/daily-attendance.spec.ts:440-535 |
| Bộ đếm dashboard sau khi điểm danh | Giảm đúng N ca đã lưu (test: 1 ca → 0; 5 lớp → giảm 5) | apps/e2e/specs/daily-attendance.spec.ts:180-198, apps/e2e/specs/daily-attendance.spec.ts:526-534 |
| Đủ trạng thái mới lưu được | Thiếu → chặn PUT (modal/alert), 0 request PUT | apps/e2e/specs/daily-attendance.spec.ts:106-131, apps/e2e/specs/daily-attendance.spec.ts:402-434 |
| Mobile 375px | Không cuộn ngang; nút ghi ≥ 44px | apps/e2e/specs/daily-attendance.spec.ts:228-235, apps/e2e/specs/daily-attendance.spec.ts:570-584 |
| Buổi hủy / nghỉ lễ | Không xuất hiện trên màn điểm danh ngày đó | apps/e2e/specs/daily-attendance.spec.ts:38, apps/e2e/specs/daily-attendance.spec.ts:81-83 |

## 8. Entities

Chi tiết cột đầy đủ: [`srs/attendance-reverse-erd.md`](./srs/attendance-reverse-erd.md).

| Thực thể | Vai trò trong feature | Mức |
|---|---|---|
| `lesson` | Dòng buổi của MỘT học viên (1:1 enrollment). Nơi lưu kết quả điểm danh (`attendance`, `attendance_note`) và trạng thái buổi (`status`). `date` là định danh buổi vật lý: mọi dòng cùng `(classId, date)` là một ca | ✅ packages/db/src/schema/lesson.ts:7-80 |
| `organization_holiday` | Một kỳ nghỉ: khoảng ngày (≤30), scope org/classes, mode shift/cancel, cờ notify, `notifiedAt`, người tạo | ✅ packages/db/src/schema/organization-holiday.ts:12-49 |
| `organization_holiday_class` | Lớp áp dụng khi scope = classes; unique `(holidayId, classId)` | ✅ packages/db/src/schema/organization-holiday.ts:51-69 |
| `holiday_session_shift` | Cặp buổi gốc → buổi bù; nguồn duy nhất cho nhãn "Đã dời sang dd/MM" và hoàn tác; unique `(classId, originalDate)` và `(classId, makeupDate)` | ✅ packages/db/src/schema/organization-holiday.ts:71-112 |
| `holiday_session_cancel` | Buổi bị kỳ nghỉ mode cancel hủy; nguồn duy nhất để hoàn tác; unique `(classId, date)` | ✅ packages/db/src/schema/organization-holiday.ts:114-149 |
| `class` / `enrollment` / `student` / `organization` | Tham chiếu chéo (feature khác): lớp cung cấp lịch chuẩn `schedule` để sinh ngày bù; chỉ enrollment `active` có dòng điểm danh | ✅ apps/server/src/routes/daily-attendance.ts:110-126; packages/api/src/holiday-plan.ts:41-60 |
| `lesson_material` | Tài liệu gắn `(classId, date)` — đi theo buổi dời/ngược về ngày gốc | ✅ apps/server/src/routes/holidays.ts:370-406, apps/server/src/routes/holidays.ts:862-898 |
| `notif` / `notification_record` (gián tiếp qua emitNotifications) | Thông báo in-app org + sự kiện holiday_created | ✅ apps/server/src/routes/holidays.ts:588-603, apps/server/src/routes/holidays.ts:637-669 |

Trạng thái `lesson.status` (enum thật): `upcoming | completed | absent | cancelled | holiday` — packages/db/src/schema/lesson.ts:48-57 ✅; nhãn hiển thị chung: `Chưa diễn ra / Đã hoàn thành / Nghỉ không phép / Đã hủy / Nghỉ lễ — Đã dời lịch` — packages/api/src/contracts.ts:3886-3892 ✅. Trạng thái điểm danh `attendance` (enum thật): `present | late | excused | unexcused | NULL` — packages/api/src/contracts.ts:1335-1342 ✅.

## 9. Flows

Diagram đầy đủ (sequenceDiagram + flowchart TD cho từng flow): [`srs/attendance-reverse-flows.md`](./srs/attendance-reverse-flows.md).

| Flow | Tên | Mô tả một dòng |
|---|---|---|
| F1 | Xem điểm danh theo ngày | Mở `/attendance`, parse URL, GET daily, lọc ca không diễn ra, gom bucket, trả counts |
| F2 | Lưu điểm danh cả ca | Client chặn thiếu → PUT đủ sĩ số → ánh xạ D2 → batch guard → toast + refetch |
| F3 | Điền nhanh & lưu thiếu có xác nhận | "Đánh dấu tất cả Có mặt" chỉ điền ô trống; lưu thiếu khi chưa recorded → modal "Gán Có mặt và lưu" |
| F4 | Auto-advance sau lưu lần đầu | Tính ca kế từ dữ liệu sau refetch, mở + focus; hết ca → aria-live hoàn tất |
| F5 | Xem trước lịch nghỉ | Modal "Tạo lịch nghỉ" → preview tính kế hoạch thuần từ DB + planHash |
| F6 | Áp dụng lịch nghỉ — dời buổi (shift) | Apply guard 3 lớp → batch nguyên tử: gốc `holiday`, sinh bù `upcoming`, dời tài liệu, notif + email |
| F7 | Áp dụng lịch nghỉ — hủy buổi (cancel) | Như F6 nhưng chuyển `cancelled`, không sinh bù, bản ghi cancel unique theo ngày |
| F8 | Hoàn tác kỳ nghỉ tương lai | DELETE: kiểm nguyên trạng thái → batch khôi phục + dời tài liệu ngược + notif |

## 10. Screens

| Màn | Thành phần | Nguồn |
|---|---|---|
| `/attendance` — "Điểm danh tổng theo ngày" | Kicker `{dd/MM/yyyy} · {lọc}`; tiêu đề `Điểm danh tổng theo ngày`; input date (aria-label `Chọn ngày điểm danh`); nút `Hôm nay` (disable khi đang hôm nay); ChipFilter 3 mục `Tất cả / Chưa điểm danh / Đã điểm danh` kèm counts; aria-live ẩn `attendance-live-status`; loading skeleton; error section + `Thử lại`; empty-state 2 biến thể; danh sách thẻ ca | apps/web/src/routes/_auth/attendance.tsx:323-439 ✅ |
| Thẻ ca (AttendanceSessionRow) | Hàng tiêu đề: `{HH:MM – HH:MM} · {tên lớp} · Sĩ số {n} HV`; badge `Chưa điểm danh` / `Đã điểm danh ({p}/{t} có mặt)` / `Đã điểm danh`; badge phụ `Lớp chưa gắn lịch ngày`; mở ra: cảnh báo thiếu, banner lỗi server + `Thử lại`, nút `Đánh dấu tất cả Có mặt`, bảng HV (#[,] Học viên, Trạng thái điểm danh, Ghi chú học vụ), picker 4 pill, note input (placeholder `Ghi chú học vụ (≤ 255 ký tự)…`), nút `Lưu điểm danh ca học` / `Đang lưu…`; dòng "Chưa rõ (điểm danh cũ)"; nhánh legacy: `Lớp này đang dùng lịch theo thứ cố định. Vui lòng mở trang lớp để điểm danh từng học viên theo luồng hiện tại.` + `Mở lớp để điểm danh →` + danh sách `Chỉ xem` | apps/web/src/components/attendance/attendance-session-row.tsx:170-436 ✅ |
| Modal FillMissingConfirm | Tiêu đề `Còn {n} học viên chưa chọn trạng thái`; nút `Quay lại chỉnh` / `Gán Có mặt và lưu` (đang lưu → `Đang lưu…`, cả hai disable) | apps/web/src/components/attendance/fill-missing-confirm.tsx:19-58 ✅ |
| Modal "Tạo lịch nghỉ" (màn Lịch — trích chéo) | Trường `Tên kỳ nghỉ`, `Từ ngày`, `Đến ngày`, radio `Chọn lớp học cụ thể`, mode `shift`/`cancel`, bảng xem trước (shift/cancel/keptCompleted/unsupported), nút xác nhận enable khi `actionCount > 0` | apps/web/src/components/schedule/holiday-modal.tsx:143-238, apps/web/src/components/schedule/holiday-modal.tsx:302-336 ✅ |
| Dialog "Xóa kỳ nghỉ (Hoàn tác)" (trích chéo) | Xác nhận xóa; hiển thị danh sách `touched` khi 409 makeup-touched | apps/web/src/components/schedule/holiday-undo-dialog.tsx:9-19, apps/web/src/components/schedule/holiday-undo-dialog.tsx:137-161 ✅ |
| Thẻ "Ca học hôm nay chưa điểm danh" (dashboard — trích chéo) | Số ca + ≤3 dòng xem trước + CTA `/attendance?date={hôm nay}&status=pending`; hết pending → "Đã hoàn tất hôm nay" | apps/e2e/specs/daily-attendance.spec.ts:59-66, apps/e2e/specs/daily-attendance.spec.ts:190-198 ✅ |

## 11. Constraints

| Ràng buộc | Nội dung | Nguồn |
|---|---|---|
| C-1 | D1 không có `.transaction()` tương tác — mọi ghi nhiều bước phải là MỘT `db.batch` nguyên tử; design dùng guard-in-SQL (CASE/UPDATE-WHERE) để rollback bằng vi phạm NOT NULL/UNIQUE | apps/server/src/routes/kernel.ts:2987-2991 ✅; apps/server/src/routes/holidays.ts:307-318, apps/server/src/routes/holidays.ts:832-847 ✅ |
| C-2 | Trần bind parameter D1 → mọi `inArray` chia chunk 50 | apps/server/src/routes/daily-attendance.ts:29-30 ✅; apps/server/src/routes/holidays.ts:37-38 ✅ |
| C-3 | Trần 500 câu/batch apply-undo → 422 thay vì cắt | apps/server/src/routes/holidays.ts:40-41 ✅ |
| C-4 | Workers chạy UTC → mọi "hôm nay"/thứ trong tuần suy từ ISO giờ VN, cấm `new Date().getDay()` raw | apps/server/src/routes/dashboard-reminders.ts:56-62 ✅; packages/api/src/vietnam-date.ts:18-29 ✅; apps/web/src/lib/week-grid.ts:1-14 ✅ |
| C-5 | Invariant schema: 1 buổi vật lý = `(classId, date)`; lesson 1:1 enrollment; `date` NULL là legacy per-class (cả lớp hoặc không dòng nào); class fields (schedule/startDate/sessionsTotal) bất biến sau tạo | packages/db/src/schema/lesson.ts:7-28 ✅ |
| C-6 | Hợp đồng wire strict: response parse lại qua zod trước khi rời server và trước khi render | apps/server/src/routes/daily-attendance.ts:328 ✅; apps/web/src/lib/repos/daily-attendance.ts:80 ✅; apps/web/src/lib/repos/holidays.ts:47-70 ✅ |
| C-7 | Không có lớp i18n — chuỗi tiếng Việt literal (thay đổi wording = đổi code) | GAP-1, OQ-12 🟡 |
| C-8 | Migration cột điểm danh là ADD COLUMN nullable (0045) — dữ liệu cũ đọc được, không backfill | packages/db/src/migrations/0045_aspiring_thena.sql:1-2 ✅; apps/server/src/lesson-attendance-columns-migration.test.ts:66-105 ✅ |
| C-9 | `student/admin` bị chặn ở bootstrap middleware trước khi vào kernel (app-level, không phải từng route) | apps/server/src/app.ts:205-237 ✅ |

## 12. Open Questions

| Mã | Câu hỏi | Vì sao code không trả lời được | Mức |
|---|---|---|---|
| OQ-01 | Priority P0/P1 của từng FR/NFR và Severity của từng lỗi là gì? | Code/test không mang thông tin xếp hạng; mọi cột Priority/Severity trong tài liệu này là đề xuất của BA | 🟡 |
| OQ-02 | Mục tiêu nghiệp vụ của cửa "chưa điểm danh" là gì — chuyên cần, tính học phí theo buổi, hay thông báo phụ huynh? | Code chỉ cơ chế đếm `upcoming`; không nói ai cần nó để làm gì | 🟡 |
| OQ-03 | Setting tombstone `unexcused_deduct` (mặc định "Có, trừ 1 buổi") còn được echo ở form Cài đặt không — có nên gỡ để tránh người dùng nghĩ nó còn hiệu lực? | contracts.ts:1329-1331 khẳng định tombstone "#321 chưa từng được enforce"; negative-search không thấy usage khác ngoài schema + comment, nhưng trạng thái UI Cài đặt thuộc feature khác | 🟡 |
| OQ-04 | Lớp legacy (chưa gắn lịch ngày) không điểm danh được trên màn ngày — là quirk tạm thời chờ gắn lịch, hay định hướng dài hạn? | Code trả `mode: "legacy"` + link "Mở lớp để điểm danh →" nhưng không nói kế hoạch chuyển đổi | 🟡 |
| OQ-05 | Khi GV sửa ca ĐÃ recorded (chip completed), không auto-advance/không thông báo hoàn tất (CR-Bugs F3) — hành vi mong muốn là cố ý giữ TOS-7 hay cần thông báo nhẹ? | Comment code gọi đây là "giữ hành vi TOS-7"; ý định nghiệp vụ không ghi | 🟡 |
| OQ-06 | 409 `holiday-locked` (move/edit nhóm holiday) hiển thị cho GV bằng wording nào trên màn Lịch? | Throw-site thuộc feature schedule (kernel.ts:1999, kernel.ts:2209); wording UI không nằm trong nguồn feature này | 🟡 |
| OQ-07 | Có cần hiển thị ước tính số câu lệnh/độ lớn kỳ nghỉ trong preview để GV tránh 422 `too-large` chủ động không? | Ngưỡng 500 câu chỉ lộ qua lỗi; preview không trả số câu | 🟡 |
| OQ-08 | Ghi chú học vụ "teacher-only" — học viên/PH có cần thấy (vd "Vào trễ 10 phút") không? | schema chặn chiếu vào `/api/student` (lesson.ts:67) nhưng nhu cầu nghiệp vụ không ghi | 🟡 |
| OQ-09 | GET daily chấp nhận mọi ngày hợp lệ năm 2000–2100 (kể cả tương lai xa) — có cần giới hạn khoảng xem? | `parseStartDateStrict` chỉ chặn format + năm; không thấy business bound | 🟡 |
| OQ-10 | Điểm danh lại (sửa) ca đã recorded không có hạn — có cần khóa sửa sau N ngày để bảo toàn dữ liệu học phí/chuyên cần? | PUT guard không chặn re-save trên dòng completed/absent; không thấy rule aging | 🟡 |
| OQ-11 | Mode cancel khiến học viên mất buổi không bù vĩnh viễn (BR-11) — chính sách đền/bù tiếp theo của trung tâm là gì? | Code cố ý "không sinh bù, không kéo dài khóa" nhưng không nói ai chấp nhận rủi ro này | 🟡 |
| OQ-12 | Có cần chuẩn hóa i18n/catalog cho wording điểm danh + lịch nghỉ (đang literal tiếng Việt)? | Negative-search không thấy i18n framework trong apps/web/src (GAP-1) | 🟡 |
