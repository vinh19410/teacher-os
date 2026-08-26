# Red Team — Assumption Destroyer

**Plan:** `260826-1854-in-place-attendance-on-bui-hc-tab`
**Role:** Fact Checker + Contract Verifier
**Date:** 2026-08-26
**Verdict:** Plan không đạt success criteria dưới các assumption load-bearing bên dưới. Không implement. Không sửa plan.

---

## Finding 1: Sequential head không phải buổi giáo viên muốn điểm danh
- **Severity:** Critical
- **Location:** Phase 0 / plan.md, section "Why sequential (load-bearing)"; Phase 2 Success Criteria
- **Flaw:** Plan giả định CTA trên `isSequentialHead` (`sidStateAt === "upcoming" && slotIndex === completed + cancelled + 1`) chính là buổi giáo viên đang dạy. Kernel không có cột date trên `lesson` (`packages/db/src/schema/lesson.ts:16-38`). Dashboard/`/schedule` điểm danh **mọi** row cùng weekday, không phải sequential head: `lessonsToday` giữ cả 12 Monday upcoming (`dashboard-from-kernel.ts:12-17`, test `dashboard-from-kernel.test.ts:109-114`); `schedule.tsx:107-108` filter `l.day === i + 1` rồi render mọi card. Prefix `sidStateAt` (`class-sessions.ts:210-214`) sơn occurrence sớm nhất khi **bất kỳ** upcoming id của sid bị check-in. Hệ quả: class đã chạy 4 tuần mà chưa từng điểm danh trên tab này (trạng thái mặc định lúc ship) → CTA nằm ở buổi 1, hàng hôm nay chỉ Badge "Sắp tới".
- **Failure scenario:** Giáo viên dạy buổi hôm nay, mở tab Buổi học, không thấy nút trên hàng hôm nay → cho rằng feature hỏng; hoặc bấm "Điểm danh" ở hàng đầu → POST sơn buổi tuần 1, không phải buổi vừa dạy. Success criterion "1:1 ngày ≤ hôm nay VN + sequential head → button" vẫn tick trên giấy, nhưng criterion sản phẩm "điểm danh tại chỗ buổi đang diễn ra" thất bại với mọi class `startDate` trong quá khứ.
- **Evidence:** `class-sessions.ts:19-23,168-169,210-214`; `dashboard-from-kernel.ts:12-17`; `dashboard-from-kernel.test.ts:109-114`; `schedule.tsx:107-108`; `packages/db/src/schema/lesson.ts:16-38`; plan.md "Click trên buổi 5 khi buổi 1 chưa điểm danh sẽ sơn buổi 1".
- **Suggested fix:** Pin explicit product rule: (A) backlog-first là đúng — đổi success copy thành "điểm danh buổi chưa chốt sớm nhất, không phải buổi hôm nay"; hoặc (B) từ chối ship CTA trên timeline cho đến khi có cột date / occurrence id. Không được viết success như thể hàng hôm nay luôn có nút.

---

## Finding 2: firstUpcomingLessonId bag order không phải occurrence identity
- **Severity:** Critical
- **Location:** Phase 1, section "Helper — implement đúng như sau" / test "mọi Tue session trả id a"
- **Flaw:** `firstUpcomingLessonId` = `rows.find(sid + upcoming).id` — first-match trên **array order**. `buildClassSessions` gán **cùng một mảng** cho mọi occurrence (`class-sessions.ts:168-169`), thứ tự = thứ tự `input.lessons` khi push vào `rowsBySlot` (`:123-132`). Production `input.lessons` đến từ `mapLessons` giữ nguyên snapshot. Snapshot **không** giữ generation index: `ORDER BY day, time, createdAt` (`snapshot.ts:137-141`). Generator viết 12 row trong **một** `db.batch` (`routes/kernel.ts:397-409`), `createdAt` default `unixepoch(subsecond)*1000` (`schema/lesson.ts:36-38`) — tie cùng ms → ORDER BY không ổn định. Unit test P1 chế bag `a,b,c` bằng tay; **không** chứng minh bag production === thứ tự sinh === buổi đang nhìn. Check-in id bất kỳ vẫn tăng `completed` và sơn occurrence 1 — UI tab đúng, row kernel sai.
- **Failure scenario:** Junior implement đúng spec `find()`. Test "mọi occurrence trả a" xanh. Giáo viên bấm CTA buổi 1; POST hoàn thành một Tue row ngẫu nhiên (thường là row `createdAt` nhỏ nhất còn upcoming, đôi khi không). `/schedule` hiện card đó completed trên **mọi** cột Tuesday. Lần check-in sau sơn buổi 2 trên timeline nhưng hoàn thành một id khác. Success "mỗi click = đúng 1 POST check-in" đúng chữ, sai identity.
- **Evidence:** `class-sessions.ts:123-132,168-169`; `snapshot.ts:137-141`; `routes/kernel.ts:92-107,397-409`; `schema/lesson.ts:36-38`; `class-sessions.test.ts:76-80` (chỉ chứng minh bag length 13, không chứng minh order).
- **Suggested fix:** Helper phải chọn id bằng quy tắc **ổn định đã viết ra** (sort `createdAt` rồi id; hoặc persist generation index). Test phải dùng fixture thứ tự đảo / createdAt tie — không chỉ `[a,b,c]` thuận. Cấm coi bag order hiện tại là contract.

---

## Finding 3: todayISOVietnam != date-input tomorrow — E2E 12 Sắp tới vỡ đúng cửa sổ CI
- **Severity:** High
- **Location:** Phase 3, section "Vì sao test cũ vẫn xanh" + Success Criteria
- **Flaw:** Create-class UI lấy tomorrow bằng **TZ máy**: `getTomorrowDateInputValue` → `setDate(+1)` local (`date-input.ts:31-36`, `add-class-modal.tsx:53-54,103-104`). Date gate CTA dùng **Asia/Ho_Chi_Minh** (`week-grid.ts:21-34`). Playwright không pin timezone (`playwright.config.ts:13-16`). 17:00–23:59 UTC: local tomorrow === VN today → class "start tomorrow" có `dateISO <= todayISOVietnam()` → sequential head thành `actionable` → Badge "Sắp tới" bị thay bằng Button. Test cũ `toHaveCount(12)` (`class-operations.spec.ts:53-54`) đỏ. Plan tự nhận rồi bảo "ghi chú, đừng nới count 12" — tức là **bỏ** success criterion khi assumption vỡ.
- **Failure scenario:** CI UTC evening (hoặc runner TZ=UTC sau 17:00). P2 đã merge. P3 step 1 chạy test cũ → fail. Cook "ghi chú" và tick P3. Success "E2E lớp start-tomorrow vẫn 12 Sắp tới" không còn đúng trên CI. Ngược lại nếu nới count, date-gate bug thật bị nuốt.
- **Evidence:** `date-input.ts:31-36`; `add-class-modal.tsx:53-54,103-104,238-240`; `week-grid.ts:21-34`; `playwright.config.ts:13-16`; `class-operations.spec.ts:18-54,79-81`; phase-03 "Cảnh báo CI UTC".
- **Suggested fix:** Pin Chromium `timezoneId: "Asia/Ho_Chi_Minh"` trong Playwright, **hoặc** e2e cũ assert `getByRole("button", { name: "Điểm danh" }).toHaveCount(0)` cộng Badge, không dựa vào coincidence tomorrow-local != today-VN. Cấm "ghi chú rồi bỏ qua" như đường thoát success.

---

## Finding 4: Công thức 1:2 mixed dẫn junior copy fixture sai enrollment
- **Severity:** High
- **Location:** Phase 1, Implementation step 4 (dòng 1:2 mixed)
- **Flaw:** Plan bắt copy pattern `class-sessions.test.ts:288-303`. Fixture đó **không** phải lớp 1:2 đủ buổi: s1 chỉ có 2 Tue completed + 11 Fri; s2 mới `standardRows(26)`. `sessionStudents` loại sid khi `counts < slotIndex` (`class-sessions.ts:241-248`). Biến thể plan: "s1 completed x1, s2 toàn upcoming → occ 2 actionable **chỉ s1**". Copy đúng 288-303 với `done = ["completed"]` → s1 chỉ còn **1** Tue row → `counts(s1)=1 < slotIndex 2` → s1 **không** vào `sessionStudents(occ 2)` → `sessionAttendanceState` không emit check-in cho s1. Occ 2 không actionable cho s1. Công thức biến thể chỉ đúng khi **cả hai** sid có >=2 row Tue (1:2 equal enrollment). Plan bảo junior copy `standardRows` **và** 288-303 — hai fixture mâu thuẫn.
- **Failure scenario:** Junior viết test biến thể theo 288-303 → fail. Họ "sửa" `isSequentialHead` / bỏ filter `sessionStudents` để test xanh → CTA hiện cho sid không attend occurrence đó, hoặc một-click nhầm. Hoặc họ xóa biến thể — 1:2 equal-enrollment (đúng production) không được khóa.
- **Evidence:** `class-sessions.test.ts:288-303` (`done.map` 2 status + 11 Fri + `standardRows("s2")`); `class-sessions.ts:210-214,241-248`; phase-01 step 4 biến thể; so với 1:2 thật `class-sessions.test.ts:161-172` (26+26 rows).
- **Suggested fix:** Tách 2 test: (1) equal 1:2 = `[...standardRows("s1"), ...standardRows("s2")]` + override status; (2) divergent counts = 288-303, occ 2 **không** có s1. Viết expected table theo `sessionStudents` trước, không theo trực giác "s1 đã completed x1 thì occ 2 là head của s1".

---

## Finding 5: Hai lessonId khác namespace — CTA dễ POST id giáo trình
- **Severity:** High
- **Location:** Phase 1 extract + Phase 2 step 4 ("1:1 dùng attendance.sids.find(...).lessonId")
- **Flaw:** `sessionLessonInfo().lessonId` là **syllabus lesson id** map theo `session.index` (`class-sessions.ts:272-307`), đã dùng sẵn trong table cho expand (`$classId.tsx:351-352, hasDetails`). Enrollment lesson id nằm trên `Lesson.id` / (sau P1) `ClassSessionLesson.id`. Phase 2 đặt field `lessonId` trên `sessionAttendanceState.sids`. Cùng component sẽ có `info.lessonId` và `attendance.sids[].lessonId`. Plan không cấm `run(info.lessonId, { type: "check-in", lessonId: info.lessonId })`. `POST /api/lessons/:id/check-in` 404 nếu id không thuộc bảng `lesson` (`routes/kernel.ts:661-663`, test unknown id 404).
- **Failure scenario:** Junior extract xong, thấy `info.lessonId` đã có, wire CTA vào đó vì "plan bảo thêm id vào lesson". Click → 404 → không toast "Đã điểm danh." → không Badge "Đã học". Mọi success P2/P3 runtime fail. Unit helper P1 vẫn xanh vì không đụng UI.
- **Evidence:** `class-sessions.ts:272-307` (`flattenedLessons[session.index-1].lessonId`); `$classId.tsx:351-352`; `mock-data.ts:30-31` vs syllabus tree; `routes/kernel.ts:661-663`; `repos/kernel.ts:88-91` (path dùng đúng enrollment id **nếu** caller truyền đúng).
- **Suggested fix:** Đặt tên field enrollment là `enrollmentLessonId`. Cấm `info.lessonId` trong handler check-in (contract source-parse). Test UI/helper assert id nằm trong `session.rows.map(r => r.id)`, không trong syllabus.

---

## Finding 6: useDirectKernelAction không giữ contract 1 POST / 1 pending như plan viết
- **Severity:** High
- **Location:** Phase 2, Architecture "Data flow" + Success "share một pendingKey"
- **Flaw:** Hook đúng ở `$classId.tsx:64` (`use-direct-kernel-action.ts:13-33`) — một instance, notes + attendance share `pendingKey`. Hai lỗ load-bearing: (1) `if (pendingKey) return` đọc state **sau paint**. Hai click cùng tick (double-click 1:1, hoặc 2 sid trong modal) đều thấy `pendingKey === null` → 2 `dispatch`. `busy` disable chỉ sau re-render. Kernel WHERE `status=upcoming` (`routes/kernel.ts:674-684`) chặn trùng **cùng** id (409); **khác** id thì cả hai thành công — phá "1 POST / click" và "không check-in song song". (2) Modal: step 5 `setModalSession(s)` freeze object lúc click; step 6 bảo "parent phải truyền session từ sessions mới" — **mâu thuẫn**. Sau refresh, `modalSession` vẫn row cũ → vẫn `display === check-in` → click lại → 409. Plan ghi đóng modal khi hết actionable là **optional**.
- **Failure scenario:** Lớp 1:2, giáo viên bấm Điểm danh 2 sid rất nhanh → 2 POST song song, prefix sơn 2 occurrence một lúc, hàng hôm nay nhảy "Đã học" dù chỉ định điểm 1 người. Hoặc bấm sid A, toast xong, modal vẫn hiện nút A → bấm lại → 409/heal-409 trong khi UI chưa đổi Badge.
- **Evidence:** `use-direct-kernel-action.ts:16-25,33`; `$classId.tsx:64,204-217` (notes cùng hook); phase-02 step 5 vs 6; `routes/kernel.ts:674-684`.
- **Suggested fix:** Lookup session tươi theo `dateISO`/`index` mỗi render modal (không snapshot object). Guard in-flight bằng ref đồng bộ, không chỉ `useState`. Bỏ "optional" — đóng hoặc recompute khi sid hết check-in.

---

## Finding 7: E2E mới giả định vnTodayMon0 cùng clock với todayISOVietnam
- **Severity:** High
- **Location:** Phase 3, Architecture "E2E CTA" + step 2
- **Flaw:** Plan bắt `days: [vnTodayMon0]` + `startDate: vietnamTodayISO` theo `Asia/Ho_Chi_Minh`, nhưng **không** đưa công thức Mon=0. Convention schema: 0=Monday (`contracts.ts:46-52`). `Date#getDay()` local: 0=Sunday. Runner UTC 18:00 ngày D: `getDay()` = weekday UTC; VN đã D+1. Nếu junior lấy `todayISOVietnam()` (đúng) + `(new Date().getDay()+6)%7` (sai TZ) → `startDate` là hôm nay VN, `days` là weekday máy → buổi đầu lệch 1–6 ngày → `kind === "future"` → 0 CTA. `expect(getByRole("button", { name: "Điểm danh" })).toHaveCount(1)` đỏ. Plan chỉ cấm hardcode `[1,3]`, không cấm hardcode local weekday.
- **Failure scenario:** P3 e2e mới fail "0 button". Cook đổ lỗi date gate / CSRF / cookie. Sửa bừa `days: [0,1,2,3,4,5,6]` → nhiều ngày trong tuần `dateISO <= today` → **nhiều** sequential head (mỗi slot một head nếu ngày slot đã qua/hôm nay). Success "count 1" vỡ hướng ngược.
- **Evidence:** `contracts.ts:46-52`; `week-grid.ts:29-34`; `routes/kernel.ts:81-84` (schedule 0-6, lesson.day = +1); phase-03 step 2; `class-sessions.ts:83-86` (weekday từ UTC date của `dateISO`, không từ `Date#getDay()` máy).
- **Suggested fix:** Helper e2e bắt buộc: parse `todayISOVietnam()` → `Date.UTC(y,m-1,d)` → `(getUTCDay()+6)%7`. Test unit helper đó. Cấm `new Date().getDay()`.

---

## Finding 8: Issue #87 không phải dropdown-only — comment SUPERSEDED nuốt luôn inline-edit
- **Severity:** Medium
- **Location:** Phase 3, Requirements "Comment GitHub issue 87" + suggested body
- **Flaw:** `gh issue view 87` title thật: **"[plan] Phase 3: Class schedule timeline mutations — inline edit lesson title + status dropdown"** (OPEN, parent #89). Body issue gồm **2** pin: inline-edit `row.topic` **và** status dropdown fan-out. Plan này chỉ thay dropdown. Merge-tabs P3 vẫn còn editable title (`260826-1611-merge-class-detail-schedule-and-curriculum-tabs/phase-03-timeline-mutations-inline-edit-and-status.md` Requirements click title → `lesson-edit`). Template comment mở "SUPERSEDED" + "Không dropdown, không bulk" nhưng reader/closer sẽ coi cả issue 87 chết. Plan nói "Không đóng issue trừ khi user yêu cầu" — không chặn người đọc hiểu nhầm identity.
- **Failure scenario:** P3 comment xong. Ai đó close #87 như "đã superseded". Merge-tabs P3 bị cắt luôn inline-edit. Hoặc cook comment nhầm issue khác vì "87" không có chữ Attendance trong title — phase-03 Risk "Comment nhầm issue" đúng một nửa: title **có** dropdown, nhưng **không chỉ** dropdown.
- **Evidence:** `gh issue view 87 --repo vinh19410/teacher-os` title/state ở trên; merge-tabs phase-03 Requirements inline edit + dropdown; phase-03 suggested body; plan.md pin 10.
- **Suggested fix:** Comment phải tách 2 bullet: dropdown/fan-out superseded; inline-edit topic **vẫn thuộc #87 / merge-tabs P3**. Cấm chữ SUPERSEDED ở cấp issue. `gh issue view` assert title chứa "inline edit" trước khi comment.

---

## Finding 9: Extract ClassScheduleTable phá contract/import trước khi CTA kịp sống
- **Severity:** Medium
- **Location:** Phase 1, Extract + Implementation steps 5–7
- **Flaw:** Table in-file `$classId.tsx:237-474` (JSDoc 237, fn 246). Contract **đang** đọc markup từ `$classId.tsx`: `Ngày & Giờ`, `sessionLessonInfo`, `info.moduleTitle`, `aria-label="Chi tiết lesson"`, `Tài liệu:`, `Mục tiêu:`, `sessions === null`, header 5-col (`class-detail-sessions-tab.contract.test.ts:50-64`). Line-count `<500` ở `:66-68` — số dòng **đúng**, nhưng P1 **bắt buộc** chuyển assert markup sang file mới; nếu junior làm step 5 trước step 7, CI đỏ giữa chừng. Import table cần: `ChevronDown/Right`, `Fragment`, `useState`, `Badge`, `Card`, `DataTable`, 6 helper `class-sessions`, `lessonDayLabel`, types `ClassGroup, Lesson, Student, Syllabus`. Route **vẫn** cần `useState`, `Badge`, `Card`, `DataTable` cho roster/notes (`$classId.tsx:65-67,138-166,197`). Xóa theo cảm tính "import chỉ table dùng" → roster vỡ. Giữ `buildClassSessions` trên route → dead import (plan bảo xóa). Assumption "Pick thêm id không phá caller": grep `ClassSessionLesson` chỉ `class-sessions.ts` + test — **đúng lúc này**. `row()` `:18-27` chưa có `id`; sau Pick, **mọi** test factory phải có `id` trước khi helper compile. Plan ghi `class-sessions.ts:167` là chỗ gán `rows` — **sai**: `:167` là `time: parsed.start`; `rows:` ở `:169`.
- **Failure scenario:** P1 extract thiếu `lessonDayLabel` → typecheck table đỏ, route 474-line vẫn còn table, CTA P2 không vào. Hoặc extract xong quên sửa contract → 6 assert markup fail, cook "sửa tối thiểu" bằng cách **copy markup trở lại route** để test xanh → line-count lại >=500. Hoặc junior mở `:167` tin đó là bag assignment.
- **Evidence:** `$classId.tsx:1-39,65-67,138-166,186-192,237-246,355-389,474`; `class-detail-sessions-tab.contract.test.ts:50-68`; `class-sessions.ts:40-43,167-169`; `class-sessions.test.ts:18-27`; phase-01 "Related Code Files" + risk extract.
- **Suggested fix:** Thứ tự cứng: (1) thêm `id` vào Pick + `row()` + chạy `class-sessions.test.ts`; (2) tạo file mới **với full import list chép từ route**; (3) đổi contract path **cùng commit** extract; (4) chỉ xóa import route sau khi typecheck roster+notes. Sửa citation `rows` thành `:169`.

---

## Điều kiện plan trượt success (tóm tắt)

| Success criterion | Vỡ khi |
|---|---|
| Điểm danh tại chỗ buổi <= hôm nay | Backlog > 0 (mọi class cũ) — CTA không ở hàng hôm nay |
| 1 click = đúng 1 enrollment lesson của buổi đang nhìn | Bag order != occurrence; hoặc wire `info.lessonId` syllabus |
| 1:2 modal, mỗi sid một button đúng head | Fixture 288-303 + biến thể; hoặc modal stale sau refresh |
| E2E 12 "Sắp tới" start-tomorrow | CI UTC 17:00–23:59 |
| E2E mới 1 CTA hôm nay | `vnTodayMon0` lấy weekday máy |
| Issue #87 superseded đúng nghĩa | Comment nuốt inline-edit |
| `$classId.tsx` <500 + UI cũ | Extract/import/contract lệch thứ tự |

Không có finding nào ở trên được gỡ bằng lint/type/test-count. Tất cả là assumption → hành vi production/e2e.
