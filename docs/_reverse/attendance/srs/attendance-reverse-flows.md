# srs/attendance-reverse-flows — attendance

Mỗi flow có CẢ HAI diagram. Chỉ vẽ bước có trong code; bước suy đoán gắn 🔵/🟡.

## F1 — Xem điểm danh theo ngày (GET /api/attendance/daily)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant Web as Man hinh /attendance
    participant API as GET /api/attendance/daily
    participant DB as D1
    GV->>Web: mở /attendance?date=&status=
    Web->>Web: validateAttendanceSearch (date sai về hôm nay, status lạ về all)
    Web->>API: GET ?date= (thiếu date → hôm nay VN)
    API->>API: date sai định dạng → 400 invalid-date
    API->>DB: SELECT lesson ⋈ class ⋈ enrollment(active) ⋈ student (chunk 50, cùng orgId)
    DB-->>API: raw rows (kèm status/attendance/attendanceNote)
    API->>API: excludeNonTeachingSessions (loại cancelled + holiday)
    API->>API: gom bucket dated (classId,date) / legacy (classId,time)
    API->>API: recorded = không còn dòng upcoming; counts all/pending/completed
    API->>API: coerce hiển thị (completed+NULL → present; absent+NULL → null)
    API-->>Web: DailyAttendanceResponse (zod parse)
    Web-->>GV: danh sách thẻ ca + chip counts + empty-state
```

```mermaid
flowchart TD
    A["GV mở /attendance"] --> B["validateSearch: date + status"]
    B -->|"date lệch hợp đồng"| C["date = hôm nay (VN), status = all"]
    B -->|"hợp lệ"| D["GET /api/attendance/daily?date="]
    C --> D
    D --> E{"?date= hợp lệ?"}
    E -->|"không"| F["400 invalid-date"]
    E -->|"có hoặc bỏ trống"| G["query lesson+class+enrollment+student (orgId, chunk 50)"]
    G --> H["loại status cancelled + holiday"]
    H --> I{"bucket"}
    I -->|"date !== null"| J["dated: gom (classId, date), lessonId giữ"]
    I -->|"date === null"| K["legacy: gom (classId, time), lessonId = null"]
    J --> L["sort ca theo giờ+tên lớp; sort HV theo tên vi"]
    K --> L
    L --> M["recorded + counts"]
    M --> N["trả response + web parse zod"]
    N --> O{"filteredSessions"}
    O -->|"rỗng + ngày có dữ liệu"| P["empty-state: Đã điểm danh xong mọi ca trong ngày"]
    O -->|"rỗng"| Q["Không có ca học nào trong ngày này."]
    O -->|"có"| R["render thẻ ca"]
```

Nguồn: apps/web/src/routes/_auth/attendance.tsx:56-69, apps/web/src/routes/_auth/attendance.tsx:308-321, apps/web/src/routes/_auth/attendance.tsx:373-413; apps/server/src/routes/daily-attendance.ts:80-330; apps/server/src/routes/daily-attendance.test.ts:94-583.

## F2 — Lưu điểm danh cả ca (PUT)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant Row as AttendanceSessionRow
    participant API as PUT /api/classes/:id/sessions/:date/attendance
    participant DB as D1
    GV->>Row: chọn 4 trạng thái + ghi chú, bấm Lưu
    Row->>Row: còn thiếu? → ca chưa recorded: modal xác nhận; ca recorded: alert + focus (không PUT)
    Row->>Row: toSaveEntries (throw nếu còn null) → entries trim
    Row->>API: PUT {entries}
    API->>API: auth + date strict (400) + lớp/scope 404
    API->>API: date > hôm nay VN → 422 future-session
    API->>DB: roster = lesson cùng (orgId,classId,date), enrollment active, loại cancelled + holiday
    API->>API: roster rỗng → 404; id lạ → 422 unknown-lesson; thiếu → 422 incomplete-roster
    API->>DB: db.batch UPDATE từng lesson (status = D2(attendance), attendance, note) + roster-count guard
    API->>API: updated ≠ entries.length → 409 roster-changed
    API-->>Row: 200 {updated, recorded: true}
    Row-->>GV: toast Đã lưu điểm danh / Đã cập nhật điểm danh; thu gọn thẻ
```

```mermaid
flowchart TD
    A["Bấm Lưu điểm danh ca học"] --> B{"isFutureDate hoặc đang lưu hoặc legacy?"}
    B -->|"có"| C["bỏ qua (không PUT)"]
    B -->|"không"| D{"còn dòng attendance = null?"}
    D -->|"có và ca chưa recorded"| E["mở modal Gán Có mặt và lưu"]
    D -->|"có và ca đã recorded"| F["viền cảnh báo + focus dòng thiếu đầu"]
    D -->|"không"| G["PUT entries (note trim)"]
    G --> H{"server kiểm tra"}
    H -->|"400 invalid date/body"| I["banner: Ngày không đúng định dạng. hoặc fallback"]
    H -->|"422 future-session"| J["banner: Chưa đến ngày học, chưa thể điểm danh."]
    H -->|"422 incomplete/unknown hoặc 409 roster-changed"| K["toast: Danh sách lớp vừa thay đổi, đã tải lại. + refetch"]
    H -->|"lỗi khác"| L["banner: Không thể lưu điểm danh. Vui lòng thử lại."]
    H -->|"200"| M["toast Đã lưu/Đã cập nhật + invalidate + thu gọn"]
    M --> N{"ca vừa lưu là lần đầu?"}
    N -->|"không (đã recorded)"| O["kết thúc, không auto-advance"]
    N -->|"có"| P["sang F4 auto-advance"]
```

Nguồn: apps/web/src/components/attendance/attendance-session-row.tsx:136-162; apps/web/src/lib/attendance-draft.ts:93-109; apps/web/src/lib/repos/daily-attendance.ts:93-112; apps/web/src/routes/_auth/attendance.tsx:162-306; apps/server/src/routes/kernel.ts:2909-3040; test: apps/server/src/routes/daily-attendance.test.ts:585-921, apps/web/src/routes/_auth/attendance.test.tsx:176-302.

## F3 — Điền nhanh & lưu thiếu có xác nhận

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant Row as AttendanceSessionRow
    participant Modal as FillMissingConfirm
    GV->>Row: bấm Đánh dấu tất cả Có mặt
    Row->>Row: markAllPresentState: chỉ điền ô trống, giữ lựa chọn + ghi chú
    GV->>Row: bấm Lưu khi còn thiếu (ca chưa recorded)
    Row->>Modal: mở "Còn N học viên chưa chọn trạng thái"
    alt Quay lại chỉnh / Esc
        GV->>Modal: Quay lại chỉnh
        Modal-->>Row: đóng, không PUT
        Row->>Row: alert thiếu + focus dòng thiếu đầu tiên (sau khi modal đóng)
    else Gán Có mặt và lưu
        GV->>Modal: Gán Có mặt và lưu
        Modal->>Row: entries = markAllPresentState(draft) (helper thuần, không dispatch-then-read)
        Row->>Row: onSave(entries) → sang F2
    end
```

```mermaid
flowchart TD
    A["Đánh dấu tất cả Có mặt"] --> B["điền present cho ô trống, giữ lựa chọn có sẵn"]
    B --> C["nút disabled khi: đủ trạng thái / ca đã recorded / ngày tương lai / đang lưu"]
    C --> D["Bấm Lưu còn thiếu"]
    D --> E{"ca đã recorded?"}
    E -->|"có"| F["alert + focus (không bulk đè lịch sử Chưa rõ)"]
    E -->|"không"| G["modal Còn N học viên chưa chọn trạng thái"]
    G --> H{"lựa chọn"}
    H -->|"Quay lại chỉnh"| I["đóng modal, 0 PUT, alert thiếu + focus"]
    H -->|"Gán Có mặt và lưu"| J["toSaveEntries(markAllPresentState(draft))"]
    J --> K["PUT đủ sĩ số → F2"]
```

Nguồn: apps/web/src/lib/attendance-draft.ts:111-131; apps/web/src/components/attendance/attendance-session-row.tsx:136-162, apps/web/src/components/attendance/attendance-session-row.tsx:310-327, apps/web/src/components/attendance/attendance-session-row.tsx:425-431; apps/web/src/components/attendance/fill-missing-confirm.tsx:14-58; test: apps/web/src/components/attendance/attendance-session-row.test.tsx:89-168, apps/web/src/components/attendance/attendance-session-row.test.tsx:301-470; apps/web/src/lib/attendance-draft.test.ts:107-190; E2E: apps/e2e/specs/daily-attendance.spec.ts:244-438.

## F4 — Auto-advance sau lưu lần đầu (client)

```mermaid
sequenceDiagram
    participant Web as /attendance route
    participant QC as React Query cache
    Web->>Web: PUT 200 và ca vừa lưu CHƯA recorded (CR-Bugs F3)
    Web->>Web: search đổi giữa lúc lưu? → dừng
    Web->>QC: đọc query state ngày đó (phải tươi hơn thời điểm lưu, không lỗi)
    Web->>QC: refetch (invalidate ["kernel"]) đã xong
    Web->>Web: quét từ ca sau ca vừa lưu, vòng lại đầu; khớp chip và chưa recorded và mode ≠ legacy
    alt có ca kế tiếp
        Web->>Web: mở ca + autoFocusBulk (focus picker đầu tiên)
    else hết ca trong chip
        Web->>Web: aria-live: Đã điểm danh xong mọi ca trong ngày (hoặc còn N ca / còn legacy)
        Web->>Web: focus về ô chọn ngày
    end
```

```mermaid
flowchart TD
    A["PUT 200, ca chưa recorded"] --> B{"searchNow ≠ searchAtStart?"}
    B -->|"có"| Z["bỏ auto-advance"]
    B -->|"không"| C{"query data tươi hơn savedAt và không lỗi?"}
    C -->|"không"| Z
    C -->|"có"| D["quét sessions từ vị trí sau ca vừa lưu rồi vòng lại"]
    D --> E{"có ca kế: khớp chip + chưa recorded + không legacy?"}
    E -->|"có"| F["mở ca + setAutoFocusBulkKey"]
    E -->|"không"| G{"còn ca pending điểm danh được?"}
    G -->|"0 và có legacy pending"| H["aria-live: Đã điểm danh xong mọi ca trong ngày. Còn N ca lớp chưa gắn lịch ngày..."]
    G -->|"0"| I["aria-live: Đã điểm danh xong mọi ca trong ngày"]
    G -->|">0"| J["aria-live: Còn N ca chưa điểm danh trong ngày"]
    F --> K["component focus picker đầu + scrollIntoView + báo settled"]
```

Nguồn: apps/web/src/routes/_auth/attendance.tsx:98-130, apps/web/src/routes/_auth/attendance.tsx:184-261; apps/web/src/components/attendance/attendance-session-row.tsx:78-99; test: apps/web/src/routes/_auth/attendance.test.tsx:304-850; E2E: apps/e2e/specs/daily-attendance.spec.ts:440-535.

## F5 — Xem trước lịch nghỉ (POST /api/holidays/preview)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant Modal as Modal Tạo lịch nghỉ
    participant API as POST /api/holidays/preview
    participant Planner as planHolidayShift thuan
    participant DB as D1
    GV->>Modal: nhập tên, từ/đến ngày, scope, mode, notify
    Modal->>Modal: validate client (tên 2–100, toDate ≥ from, ≤30 ngày, scope classes ≥1 lớp)
    Modal->>API: POST draft (debounce theo previewKey)
    API->>API: auth + readBody (415/400)
    API->>DB: loadApplicableClasses (org hoặc classIds, active, cùng org; thiếu → 404)
    API->>DB: loadClassLessons (chunk 50) + loadExistingHolidayDates (createdAt ASC, id)
    API->>Planner: planHolidayShift(range, classes, existingHolidayDates, today, mode)
    Planner-->>API: shifts/cancellations + keptCompleted + unsupported
    API->>API: planHash = SHA-256 (gồm enrollmentIds nội bộ)
    API-->>Modal: HolidayPreview (bỏ enrollmentIds) — không ghi DB
    Modal-->>GV: bảng xem trước + nút xác nhận enable khi actionCount > 0
```

```mermaid
flowchart TD
    A["GV điền form"] --> B{"validate client"}
    B -->|"sai"| C["hiện lỗi: Tên từ 2–100 / Ngày kết thúc... / Khoảng nghỉ tối đa 30 ngày / Chọn ít nhất một lớp"]
    B -->|"đúng"| D["POST /api/holidays/preview"]
    D --> E{"body + auth"}
    E -->|"415/400/401"| F["Không tải được bảng xem trước"]
    E -->|"ok"| G["load classes: scope org = mọi lớp active; classes = đúng classIds"]
    G --> H{"thiếu lớp lạ/lệch org?"}
    H -->|"có"| I["404 class not found"]
    H -->|"không"| J["load lessons + kỳ nghỉ đã có (createdAt ASC)"]
    J --> K["planHolidayShift"]
    K --> L["trả preview + planHash, KHÔNG ghi DB"]
```

Nguồn: apps/web/src/components/schedule/holiday-modal.tsx:143-235; apps/web/src/lib/repos/holidays.ts:47-54; apps/server/src/routes/holidays.ts:230-305, apps/server/src/routes/holidays.ts:495-505; packages/api/src/holiday-plan.ts:94-283; test: apps/server/src/routes/holidays.test.ts:252-347, packages/api/src/holiday-plan.test.ts:61-393.

## F6 — Áp dụng lịch nghỉ, mode shift (POST /api/holidays)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant API as POST /api/holidays
    participant DB as D1
    participant Mail as emitNotifications
    GV->>API: apply draft + planHash
    API->>API: fromDate < hôm nay VN → 422 past-range
    API->>DB: buildPlan LẠI từ DB (không tin client)
    API->>API: 0 buổi trúng → 422 no-sessions; hash lệch → 409 stale-preview
    API->>DB: db.batch: INSERT organization_holiday (+ class links)
    loop mỗi shift
        API->>DB: INSERT holiday_session_shift với guard CASE (NULL → rollback cả batch)
        API->>DB: UPDATE lesson gốc upcoming → holiday
        API->>DB: INSERT...SELECT sinh buổi bù upcoming từ các dòng holiday (id holmk-*)
        API->>DB: dọn trùng + UPDATE lesson_material sang makeupDate
    end
    API->>DB: notify=true → INSERT notif kê schedule
    API->>API: statements > 500 → 422 too-large
    API->>DB: batch lỗi UNIQUE/NOT NULL → rollback sạch → 409 stale-preview
    API->>Mail: notify=true → holiday_created cho học viên ACTIVE (email + in-app, fail-open)
    API-->>GV: 200 {holidayId, shiftedCount, cancelledCount, classCount}
```

```mermaid
flowchart TD
    A["POST /api/holidays"] --> B{"fromDate < hôm nay?"}
    B -->|"có"| C["422 past-range"]
    B -->|"không"| D["buildPlan lại từ DB"]
    D --> E{"activeCount = 0?"}
    E -->|"có"| F["422 no-sessions"]
    E -->|"không"| G{"planHash khớp?"}
    G -->|"không"| H["409 stale-preview"]
    G -->|"khớp"| I["dựng batch: holiday + class links + per-shift statements + notif"]
    I --> J{"số câu > 500?"}
    J -->|"có"| K["422 too-large"]
    J -->|"không"| L{"db.batch"}
    L -->|"lỗi UNIQUE/NOT NULL/FOREIGN KEY"| M["rollback toàn batch → 409 stale-preview"]
    L -->|"thành công"| N["notify=true: gom học viên ACTIVE các lớp → holiday_created"]
    N --> O["200 kết quả"]
    L2["mỗi shift: guard INSERT-CASE + UPDATE holiday + INSERT...SELECT bù + move material"] -.-> I
```

Nguồn: apps/server/src/routes/holidays.ts:307-441, apps/server/src/routes/holidays.ts:507-671; apps/web/src/components/schedule/holiday-modal.tsx:179-235; test: apps/server/src/routes/holidays.test.ts:348-523, apps/server/src/routes/holidays.test.ts:1303-1460; E2E: apps/e2e/specs/holiday-shift.spec.ts:69-199, apps/e2e/specs/holiday-skip-and-kept-completed.spec.ts:78-196.

## F7 — Áp dụng lịch nghỉ, mode cancel (POST /api/holidays)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant API as POST /api/holidays mode cancel
    participant DB as D1
    GV->>API: apply draft (mode=cancel) + planHash
    API->>API: past-range / no-sessions / stale-preview như F6
    API->>DB: db.batch: INSERT organization_holiday (mode=cancel) (+ class links)
    loop mỗi cancellation
        API->>DB: INSERT holiday_session_cancel với guard CASE (unique classId+date)
        API->>DB: UPDATE lesson upcoming → cancelled
    end
    API->>DB: notify=true → notif + holiday_created
    API-->>GV: 200 {holidayId, shiftedCount: 0, cancelledCount: n, classCount}
```

```mermaid
flowchart TD
    A["mode = cancel"] --> B["planner: buổi toàn upcoming trúng khoảng → cancellations (không quét ngày bù)"]
    B --> C["buổi có dòng completed/absent → keptCompleted (giữ nguyên)"]
    B --> D["buổi toàn cancelled/holiday → bỏ qua"]
    C --> E["batch apply: INSERT cancel (guard) + UPDATE upcoming → cancelled"]
    D --> E
    E --> F["KHÔNG sinh lesson bù, KHÔNG đổi max(date) khóa"]
    E --> G["unique (classId, date): một ngày một lớp chỉ một kỳ hủy"]
```

Nguồn: packages/api/src/holiday-plan.ts:201-214; apps/server/src/routes/holidays.ts:414-441, apps/server/src/routes/holidays.ts:577-587; test: packages/api/src/holiday-plan.test.ts:395-640; apps/server/src/routes/holidays.test.ts:1551-1678; E2E: apps/e2e/specs/holiday-cancel-and-undo.spec.ts:50-112.

## F8 — Hoàn tác kỳ nghỉ tương lai (DELETE /api/holidays/:id)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant API as DELETE /api/holidays/:id
    participant DB as D1
    GV->>API: xóa kỳ nghỉ (Hoàn tác)
    API->>DB: tìm holiday cùng org → không thấy → 404
    API->>API: fromDate <= hôm nay VN → 422 holiday-started
    API->>DB: load shifts + cancels + lessons các lớp liên quan (chunk 50)
    API->>API: buổi bù còn nguyên upcoming và gốc còn holiday/cancelled?
    API->>API: lệch → 409 makeup-touched kèm touched[]
    API->>DB: db.batch: UPDATE guard trên organization_holiday (CASE → NULL = rollback)
    loop mỗi shift (restore)
        API->>DB: dọn trùng material + move-back material về originalDate
        API->>DB: DELETE buổi bù upcoming; UPDATE holiday → upcoming
    end
    loop mỗi cancel (restore)
        API->>DB: UPDATE cancelled → upcoming (chỉ dòng do kỳ này hủy)
    end
    API->>DB: DELETE bảng con + organization_holiday + INSERT notif Đã xóa kỳ nghỉ
    API->>API: statements > 500 → 422 too-large; batch constraint lỗi → 409 makeup-touched
    API-->>GV: 200 {restoredCount, removedMakeupCount}
```

```mermaid
flowchart TD
    A["DELETE /api/holidays/:id"] --> B{"holiday tồn tại cùng org?"}
    B -->|"không"| C["404 holiday not found"]
    B -->|"có"| D{"fromDate > hôm nay?"}
    D -->|"không"| E["422 holiday-started"]
    D -->|"có"| F["load shifts + cancels + lessons"]
    F --> G{"có buổi bù bị đụng (completed/khác upcoming) hoặc gốc không còn holiday/cancelled?"}
    G -->|"có"| H["409 makeup-touched + touched[]"]
    G -->|"không"| I["batch: guard UPDATE holiday (CASE NULL rollback)"]
    I --> J["restore shift: move-back material + xóa bù + holiday → upcoming"]
    I --> K["restore cancel: cancelled → upcoming"]
    J --> L["xóa holiday_session_shift/cancel/_class + holiday + notif"]
    K --> L
    L --> M{"batch lỗi constraint?"}
    M -->|"có"| N["409 makeup-touched (touched rỗng)"]
    M -->|"không"| O["200 {restoredCount, removedMakeupCount}"]
```

Nguồn: apps/server/src/routes/holidays.ts:673-1009; apps/web/src/components/schedule/holiday-undo-dialog.tsx:9-19, apps/web/src/components/schedule/holiday-undo-dialog.tsx:100-161; apps/web/src/lib/repos/holidays.ts:73-122; test: apps/server/src/routes/holidays.test.ts:1679-1998; E2E: apps/e2e/specs/holiday-cancel-and-undo.spec.ts:113-231.
