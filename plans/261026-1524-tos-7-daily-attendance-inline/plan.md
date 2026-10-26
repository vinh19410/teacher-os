---
title: "TOS-7: Điểm danh tổng theo ngày — lọc ca theo URL và điểm danh inline 4 trạng thái"
description: "Dựng nội dung màn /attendance: liệt kê ca học trong ngày chọn trên URL (loại buổi đã huỷ, chừa điểm cắm nghỉ lễ), mở rộng inline, chọn 1 trong 4 trạng thái chuẩn kèm ghi chú học vụ và lưu cả ca trong 2 giây, bộ đếm dashboard giảm 1."
status: completed
priority: P1
effort: 2.5d
issue: 440
branch: feat/tos-7-daily-attendance-inline
tags: [feature, frontend, backend, api, database]
blockedBy: [261026-1501-tos-6-dashboard-reminder-cards]
blocks: []
created: 2026-10-26
---

# Plan: TOS-7 — Điểm danh tổng theo ngày, inline 4 trạng thái

## Overview

Route khung `/attendance` (TOS-6 Phase 2) được dựng nội dung thật:

1. Đọc `?date=YYYY-MM-DD&status=all|pending|completed` trên URL, tải danh sách ca học (lớp × khung giờ) của ngày đó từ server. Buổi đã huỷ bị loại; bộ lọc nghỉ lễ là một hàm tách riêng, hiện chưa có dữ liệu.
2. Mỗi ca là một hàng accordion. Mở ra thấy danh sách học viên, mỗi người chọn 1 trong 4 trạng thái **Có mặt / Vắng có phép / Vắng không phép / Đi muộn** và ghi chú học vụ ≤ 255 ký tự.
3. Bấm **Lưu điểm danh ca học** thì cả ca được ghi trong một request, không chuyển trang, phản hồi ≤ 2 giây. Ca đổi nhãn "Đã điểm danh", bộ đếm "Ca học hôm nay chưa điểm danh" trên dashboard giảm 1.

Nguồn: Jira [TOS-7](https://teacher-os.atlassian.net/browse/TOS-7) (subtask của TOS-5 / US-001), `docs/selfomy-alignment/userstories/us-001.md#AC-002`, wireframe `docs/selfomy-alignment/ascii-wireframe/daily-ops-and-holiday-flow.md` (Screen `daily-attendance`), FR-selfomy-alignment-005, NFR-selfomy-alignment-001 và NFR-selfomy-alignment-008.

## Scope Challenge

- **Code đã có:**
  - Bảng `lesson`: 1 dòng cho mỗi học viên (enrollment) ở mỗi buổi; `(classId, date)` là định danh buổi học (`packages/db/src/schema/lesson.ts`). Trạng thái hiện tại `upcoming | completed | cancelled | absent`.
  - "Buổi đã học" của gói học phí suy ra từ các dòng `completed` (invariant 6, `packages/api/src/contracts.ts:1280`).
  - Điểm danh 1 lớp theo buổi: `POST /api/classes/:id/sessions/:date/check-in` (`apps/server/src/routes/kernel.ts:1042`) với guard ngày tương lai `futureSession` và ghi có điều kiện để chống race.
  - `absent` đã là trạng thái hợp lệ ở web (`apps/web/src/lib/class-sessions.ts:655`, chỉ xuất hiện trên dòng có ngày) nhưng chưa có đường ghi (`dashboard-from-kernel.ts:110`).
  - Route khung `/attendance` + hợp đồng URL `date`/`status`, API `GET /api/dashboard/reminders` với query key `["kernel", "dashboard", "reminders"]` — **do TOS-6 tạo, chưa merge**.
  - `ChipFilter` (`apps/web/src/components/ui/chip-filter.tsx`), `PageHead`, `Card`, `Badge`, `Button`.
- **Code chưa có:**
  - Cột lưu trạng thái điểm danh chi tiết và ghi chú học vụ.
  - Lịch nghỉ chung (FR-007).
  - Vai trò TA / phân công lớp (FR-029).
- **Độ phức tạp:** ~14 file, 1 migration thêm 2 cột nullable, 2 endpoint mới.
- **Mode:** HOLD SCOPE. Plan auto mức fast + scout.

## Quyết định đã chốt (2026-10-26)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Lưu điểm danh trên chính dòng `lesson`.** Thêm 2 cột nullable `attendance` (`present` / `late` / `excused` / `unexcused`) và `attendance_note` (≤ 255). Không tạo bảng `AttendanceRecord` riêng. | Mỗi dòng `lesson` đã là đúng 1 học viên × 1 buổi. Bảng riêng sẽ nhân đôi định danh và phải đồng bộ với `status`. |
| D2 | **Ánh xạ trạng thái điểm danh sang `lesson.status`** (quyết định số buổi bị trừ khỏi gói): `present`/`late` → `completed`; `excused` → `absent` (không trừ); `unexcused` → `completed` (trừ 1 buổi). | User chọn "theo cài đặt unexcusedDeduct". Xem **Lưu ý D2** bên dưới về bảng cài đặt. |
| D3 | **Nghỉ lễ: chừa điểm cắm.** Lọc buổi `cancelled` như hiện tại, tách hàm `excludeNonTeachingSessions(rows, ctx)` để story Lịch nghỉ chung cắm vào. Không tạo bảng nghỉ lễ. | FR-007 chưa có dữ liệu; AC-002 thoả trên dữ liệu hiện có. |
| D4 | **Lớp legacy (`date IS NULL`) chỉ xem.** Vẫn liệt kê theo thứ trong tuần cho khớp bộ đếm dashboard, gắn nhãn "Lớp chưa gắn lịch ngày" và nút "Mở lớp để điểm danh →" sang `/classes/$id`. Không có radio inline. | Luồng legacy đang đóng băng; ghi qua sequential head dễ lệch. |
| D5 | **Lưu cả ca trong 1 request, 1 transaction.** Endpoint mới `PUT /api/classes/:id/sessions/:date/attendance` nhận danh sách `{ lessonId, attendance, note }` đủ sĩ số. Cho phép lưu lại (sửa) ca đã điểm danh. | AC-002 yêu cầu lưu "toàn bộ" ca. Lớp đã có "Sửa điểm danh" ở trang lớp nên sửa lại là hành vi quen thuộc. |
| D6 | **Danh sách ca lấy từ API server riêng `GET /api/attendance/daily?date=`**, không dựng từ kernel snapshot. | Cùng lý do D4 của TOS-6: điểm cắm duy nhất để giới hạn theo lớp phân công (FR-029) và loại nghỉ lễ ở server. Đi chung `ReminderScope` của TOS-6. |

**Lưu ý D2 — bảng cài đặt là tombstone, và đây là chính sách MỚI.** Cột `unexcused_deduct` nằm trong `workspace_settings`, bảng đã bị đánh dấu TOMBSTONE (issue #321, `packages/db/src/schema/settings.ts:5`): cấm đọc lại cho ngữ nghĩa mới, mọi reader/writer đã gỡ. Plan này **không đọc bảng đó**. Fact-check red-team (2026-10-26): setting cũ **chưa từng được enforce** — commit `603e05b3` chỉ echo giá trị trong form Cài đặt (GET/PUT settings), không có code nào đọc nó để quyết `lesson.status`; luồng 1-click cũ (`lessonStatusAction`, `kernel.ts:741-792`) vô điều kiện `upcoming → completed` cho mọi học viên, tức hành vi thực tế cũ là **cả vắng có phép lẫn không phép đều trừ buổi**. Do đó `UNEXCUSED_CONSUMES_SESSION = true` trong `packages/api` là **chính sách mới** do user chọn ở Validation Session 1 (trừ buổi cho vắng không phép, không trừ cho vắng có phép) — không phải "khớp mặc định cũ". Muốn cấu hình theo tổ chức thì cần một bảng preference mới — để story riêng.

## Non-goals

- Không làm "Đánh dấu tất cả Có mặt" (AC-003). Model state phía client vẫn thiết kế để thêm nút này dễ dàng.
- Không làm ô tìm kiếm `?q=` và bộ lọc giáo viên `?teacher=` (wireframe mục 3 và 5). Hợp đồng URL vẫn để chỗ cho 2 param này.
- Không tạo Lịch nghỉ chung, không dời buổi (FR-007, BR-003).
- Không làm phạm vi Trợ giảng / Giáo viên đứng lớp (FR-029). Endpoint nhận `ReminderScope` nhưng luôn là `{ kind: "org" }`.
- Không cấu hình theo tổ chức việc "Vắng không phép có trừ buổi" (xem Lưu ý D2).
- Không đổi luồng điểm danh 1-click ở trang lớp và popup lịch tuần; chúng tiếp tục ghi `completed` với `attendance = NULL`.

## Phases

| # | Phase | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [phase-01-attendance-schema-and-contracts.md](phase-01-attendance-schema-and-contracts.md): migration 2 cột + contract zod + ánh xạ trạng thái | completed | — |
| 2 | [phase-02-daily-attendance-api.md](phase-02-daily-attendance-api.md): `GET /api/attendance/daily` + `PUT …/sessions/:date/attendance` | completed | 1, TOS-6 Phase 1 |
| 3 | [phase-03-daily-attendance-screen.md](phase-03-daily-attendance-screen.md): nội dung màn `/attendance` (chip lọc, accordion, radio 4 trạng thái, ghi chú, lưu) | completed | 2, TOS-6 Phase 2 |
| 4 | [phase-04-kernel-consumers-sync.md](phase-04-kernel-consumers-sync.md): mang `attendance` vào kernel snapshot, cập nhật cảnh báo rủi ro + popup lịch | completed | 1 |
| 5 | [phase-05-e2e-and-perf.md](phase-05-e2e-and-perf.md): E2E AC-002, 3 viewport, design compare, đo 2 giây | completed | 3, 4 |

## Acceptance Criteria (map AC-002)

- [x] Mở `/attendance?date=2026-10-26` thì thấy mọi ca có buổi học ngày đó (lớp có ngày và lớp legacy theo thứ), buổi `cancelled` không xuất hiện. Danh sách tải trong ≤ 2 giây với seed e2e.
- [x] Mở rộng 1 ca ngay tại chỗ, chọn trạng thái cho từng học viên, nhập ghi chú, bấm "Lưu điểm danh ca học": request trả về trong ≤ 2 giây, URL không đổi, toast thành công.
- [x] Sau khi lưu, ca hiện nhãn "Đã điểm danh"; bộ đếm `attendance.pending` của `GET /api/dashboard/reminders` giảm đúng 1 (kiểm ở API test và E2E).
- [x] Dữ liệu ghi xuống đúng D2: `present`/`late`/`unexcused` → `status = completed`, `excused` → `status = absent`; ghi chú được lưu và hiển thị lại khi tải lại trang.
- [x] Lưu khi còn học viên chưa chọn trạng thái thì bị chặn ở client (viền vàng dòng thiếu + thông báo) và server trả 422.
- [x] Ngày tương lai không lưu được (422 `future-session`, giống guard check-in hiện có).
- [x] `pnpm check`, `pnpm check-types`, test web/server/db và e2e liên quan đều xanh.

## Rủi ro

- **Phụ thuộc TOS-6 chưa merge.** Route `/attendance`, `ReminderScope`, query key reminders và mục sidebar đều đến từ TOS-6. Bắt đầu Phase 2 khi TOS-6 Phase 1–2 đã vào `develop`; nếu cần làm song song thì rebase lên nhánh `feat/tos-6-dashboard-reminder-cards`.
- **Gói học phí bị trừ sai.** Đổi `excused` sang `absent` làm `done` giảm so với cách check-in cũ. Phase 1 có test cho bảng ánh xạ; Phase 4 kiểm `pkg.done` trên snapshot trước/sau khi lưu.
- **Hai tab cùng lưu một ca — last-write-wins có chủ ý, không phải chống race.** Ghi trong một `db.batch` nguyên tử (D1 không có `.transaction()` tương tác — `assignments/tests.ts:31`) bảo tính nguyên tử, không bảo dữ liệu mới: hai PUT tuần tự đều match `WHERE` nên không tự phát hiện stale (đối chiếu: `lessonStatusAction` ở `kernel.ts:770-783` dùng conditional write cho ghi đơn dòng, PUT full-roster không có precondition version). LWW là lựa chọn đã chốt ở D5 vì cả hai đều là thao tác có chủ đích của giáo viên; `roster-changed` 409 chỉ bắn khi roster đổi giữa chừng, không phải khi nháp cũ. Không thêm cột version trong scope này.
- **Kích hoạt enrollment hồi tố làm lật ca đã điểm danh về pending.** `enrollment-activation.ts:66-70` sinh dòng `upcoming` cho cả ngày trong quá khứ từ `startDate`: học viên kích hoạt muộn làm ca đã lưu tuần trước hiện lại "Chưa điểm danh" và `attendance.pending` tăng lại. PUT có roster-snapshot guard trong batch nên lần lưu sau buộc gồm học viên mới (đúng nghiệp vụ); hiện tượng lật badge là hành vi chung của cách đếm TOS-6, không xử lý trong plan này.
- **Hai cách điểm danh song song** (1-click ở trang lớp ghi `attendance = NULL`). GET chỉ coerce hiển thị `completed + NULL` thành `present` (default picker); dòng `absent + NULL` trả `attendance: null`, UI hiện "Chưa rõ (điểm danh cũ)" và bắt giáo viên chủ động chọn trạng thái trước khi lưu cả ca — không bịa dữ liệu "Vắng có phép" cho dòng legacy và không persist giá trị suy đoán khi lưu lại ca.
- **Sửa lại ca đã điểm danh** có thể đổi `completed ↔ absent` và làm thay đổi số buổi còn lại của gói. Đây là hành vi mong muốn (sửa sai), nhưng toast phải nói rõ "Đã cập nhật điểm danh". PUT cho phép sửa mọi ngày quá khứ và `pkg.done` là dữ liệu đầu vào của hoá đơn — chưa có audit trail (`attendance_updated_at/by`); cần truy vết "ai sửa, sửa lúc nào" thì làm story riêng.

## Validation Log

### Session 1 — 2026-10-26

Đã hỏi 3 câu, cả ba chọn phương án đề xuất:
- **Trừ buổi:** theo cài đặt (D2). Khi soát code thì phát hiện bảng cài đặt là tombstone, nên plan dùng hằng số khớp giá trị mặc định cũ. **Cần user xác nhận lại.**
- **Nghỉ lễ:** chừa điểm cắm (D3).
- **Lớp legacy:** chỉ xem + link sang trang lớp (D4).

Giả định chưa hỏi (đổi được khi review PR):
- Ca đầu tiên chưa điểm danh tự mở sẵn khi vào màn với `status=pending`.
- Học viên có `enrollment.status !== "active"` không xuất hiện trong danh sách.

### Verification Results

- Claims checked: 14 (đường dẫn file, symbol, dòng code).
- Verified: 14 | Failed: 0 | Unverified: 0 (các file do TOS-6 tạo được ghi rõ là "chưa merge").
- Bằng chứng chính:
  - `kernel.post("/classes/:id/sessions/:date/check-in", …)` ở `apps/server/src/routes/kernel.ts:1042`; `occurrenceStatusAction` ở `:1007`; guard `futureSession` ở `:1023`.
  - `lessonStatusAction` ghi có điều kiện ở `apps/server/src/routes/kernel.ts:741-792`.
  - Cột `date` + index `lesson_class_date_idx` ở `packages/db/src/schema/lesson.ts:46,57`.
  - TOMBSTONE `workspace_settings` ở `packages/db/src/schema/settings.ts:5-9`; `unexcused_deduct` ở `:32`.
  - `OccurrenceStatus = SessionStatus | "absent"` ở `apps/web/src/lib/class-sessions.ts:655`.
  - Migration mới nhất `packages/db/src/migrations/0044_library_part_groups.sql`.
  - `ChipFilter` ở `apps/web/src/components/ui/chip-filter.tsx`.

### Whole-Plan Consistency Sweep

- Tên cột `attendance` / `attendance_note` và enum `present | late | excused | unexcused` thống nhất ở plan.md, phase 1, 2, 3, 4.
- Endpoint `GET /api/attendance/daily` và `PUT /api/classes/:id/sessions/:date/attendance` thống nhất ở phase 2, 3, 5.
- Hằng số `UNEXCUSED_CONSUMES_SESSION` chỉ định nghĩa ở phase 1, được dùng ở phase 2.
- Không còn mâu thuẫn chưa giải quyết.

## Red Team Review

### Session — 2026-10-26 (3 reviewer: Security Adversary/Fact Checker, Failure Mode Analyst/Flow Tracer, Assumption Destroyer/Scope Auditor)

**Findings:** 16 sau dedupe (14 accepted/modified, 2 rejected)
**Severity breakdown:** 1 Critical, 8 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | GET gom ca theo `(classId, time)` nhưng PUT ghi theo `(classId, date)` — lớp 2 khung giờ cùng ngày không thể lưu; test 1(a) tự tạo shape bất khả | Critical | Accept | Phase 2 |
| 2 | PUT kiểm roster 1 chiều, đọc roster ngoài transaction; 422 `incomplete-roster`/`unknown-lesson` không có đường refetch UI | High | Accept | Phase 2, 3 |
| 3 | Claim "class-sessions/schedule-week đã coi absent là đã xử lý" sai — `sessionAttendanceState` (`class-sessions.ts:613`) + 2 test đang khoá ngược lại; nút Điểm danh sẽ 409 | High | Accept | Phase 4 |
| 4 | `atRiskRows` không cửa sổ thời gian + ánh xạ `excused → absent` biến vắng có phép thành cảnh báo vĩnh viễn | High | Accept | Phase 4 |
| 5 | "Chống race" thực chất là LWW thuần; tiền lệ repo là conditional write (`kernel.ts:770-783`) | High | Accept (modified — giữ quyết định D5, sửa wording, không thêm cột version) | plan.md Rủi ro |
| 6 | Coercion `absent + NULL → "excused"` bịa dữ liệu rồi persist khi lưu cả ca | Medium | Accept | Phase 2, 3 |
| 7 | Anchor `snapshot.ts:438` trỏ vào syllabus lessons — đúng là `:515-527` (`scheduledRows`) | Medium | Accept | Phase 4 |
| 8 | Migration 0045 thiếu existing-data test (quy ước repo 0019/0034/0043) + `/readyz` không nhận diện DB stale | Medium | Accept | Phase 1 |
| 9 | GET không có rule auth 401/403 và test (auth kernel là per-route, không middleware toàn cục) | High | Accept | Phase 2 |
| 10 | `422 validation` không tồn tại trong repo; `invalidDateResponse` chuẩn là 400 `invalid-date`, `readBody` là 400 | High | Accept | Phase 2, 3 |
| 11 | TOS-6 spec đếm upcoming không lọc `enrollment.status`, GET/PUT của TOS-7 lọc — drift làm AC "giảm đúng 1" gãy lặng lẽ | High | Accept (risk + integration test đối chiếu làm gate khi TOS-6 vào develop) | Phase 2, plan.md |
| 12 | PUT thiếu re-assert `date <= today` trong WHERE + pairing invariant 2 (tiền lệ `kernel.ts:776-783`) | Medium | Accept | Phase 2 |
| 13 | `inArray(classIds)` scope assigned không chunk-50 (trần bind D1, `grading.ts:35-37`) | Medium | Accept | Phase 2 |
| 14 | PUT sửa quá khứ ảnh hưởng `pkg.done`/hoá đơn, không audit trail | Medium | Reject — D5 đã chốt cho phép sửa lại; ghi risk "story riêng" ở plan.md Rủi ro | plan.md Rủi ro |
| 15 | `attendance_note` chưa khoá biên giới student portal (`student.ts:910-918` projection lesson) | Medium | Accept | Phase 1 |
| 16 | Blast radius fixture ~20 site / ~10 file khi thêm field required không được liệt kê | Medium | Accept | Phase 1 |

Fact-check đi kèm: setting `unexcused_deduct` cũ chưa từng được enforce (chỉ echo ở form Cài đặt, commit `603e05b3`) → "khớp giá trị mặc định cũ" ở Lưu ý D2 là sai; đã sửa thành "chính sách MỚI do user chọn" (see Lưu ý D2).

Không phát hiện XSS: note chỉ trim + max 255, mọi surface render qua React text node; sink `dangerouslySetInnerHTML` duy nhất của web không nhận lesson fields.

#### Advisory Checkpoint (kongming, 2026-10-26)

Go cho chiến lược phase-gated: Phase 1 + 4 làm ngay (độc lập TOS-6); gate vào Phase 2 là commit chứa `dashboard-reminders.ts` trên nhánh `feat/tos-6-dashboard-reminder-cards` (không copy WIP chưa commit); gate vào Phase 3 là commit `attendance.tsx` + sidebar; rebase lên nhánh TOS-6 khi qua gate; thêm `export` cho `resolveReminderScope` thành commit riêng nhỏ; merge chỉ sau #439 vào `develop` bằng `git rebase --onto origin/develop <tos6-tip> ;` sinh lại migration nếu 0045 bị chiếm. Leo thang mức 2 (dừng, comment #440): 3 giờ sau khi xong Phase 1+4 vẫn chưa có commit TOS-6, hoặc contract TOS-6 đổi. Trong `contracts.ts`, đặt schema attendance gần schema lesson (~:1059-1074), không đặt sau `gradingQueueResponseSchema` (vùng #439 đã chèn, conflict chắc chắn).

### Whole-Plan Consistency Sweep (sau red-team)

- Định danh ca thống nhất `(classId, date)` ở plan.md, phase 2, 3, 5; `time` là field hiển thị lấy từ các dòng trong bucket.
- Quy ước lỗi thống nhất: malformed input → 400 (`invalid-date`, `invalid body`); nghiệp vụ → 422 (`future-session`, `incomplete-roster`, `unknown-lesson`); roster đổi giữa chừng → 409 `roster-changed`. Phase 3 map đủ cả 4 nhóm.
- Coercion thống nhất: `completed + NULL → present` (hiển thị, default picker); `absent + NULL → null` ("Chưa rõ (điểm danh cũ)").
- Risk reason thống nhất: chỉ trong cửa sổ 14 ngày, chỉ `unexcused` hoặc `absent` có `attendance = NULL`.
- Không còn mâu thuẫn chưa giải quyết.
