---
title: "TOS-7: Điểm danh tổng theo ngày — lọc ca theo URL và điểm danh inline 4 trạng thái"
description: "Dựng nội dung màn /attendance: liệt kê ca học trong ngày chọn trên URL (loại buổi đã huỷ, chừa điểm cắm nghỉ lễ), mở rộng inline, chọn 1 trong 4 trạng thái chuẩn kèm ghi chú học vụ và lưu cả ca trong 2 giây, bộ đếm dashboard giảm 1."
status: pending
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

**Lưu ý D2 — bảng cài đặt là tombstone.** Cột `unexcused_deduct` nằm trong `workspace_settings`, bảng đã bị đánh dấu TOMBSTONE (issue #321, `packages/db/src/schema/settings.ts:5`): cấm đọc lại cho ngữ nghĩa mới, mọi reader/writer đã gỡ. Plan này **không đọc bảng đó**. Ánh xạ `unexcused → completed` được viết thành một hằng số duy nhất `UNEXCUSED_CONSUMES_SESSION = true` trong `packages/api`, khớp giá trị mặc định cũ "Có, trừ 1 buổi". Muốn cấu hình theo tổ chức thì cần một bảng preference mới — để story riêng.

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
| 1 | [phase-01-attendance-schema-and-contracts.md](phase-01-attendance-schema-and-contracts.md): migration 2 cột + contract zod + ánh xạ trạng thái | pending | — |
| 2 | [phase-02-daily-attendance-api.md](phase-02-daily-attendance-api.md): `GET /api/attendance/daily` + `PUT …/sessions/:date/attendance` | pending | 1, TOS-6 Phase 1 |
| 3 | [phase-03-daily-attendance-screen.md](phase-03-daily-attendance-screen.md): nội dung màn `/attendance` (chip lọc, accordion, radio 4 trạng thái, ghi chú, lưu) | pending | 2, TOS-6 Phase 2 |
| 4 | [phase-04-kernel-consumers-sync.md](phase-04-kernel-consumers-sync.md): mang `attendance` vào kernel snapshot, cập nhật cảnh báo rủi ro + popup lịch | pending | 1 |
| 5 | [phase-05-e2e-and-perf.md](phase-05-e2e-and-perf.md): E2E AC-002, 3 viewport, design compare, đo 2 giây | pending | 3, 4 |

## Acceptance Criteria (map AC-002)

- [ ] Mở `/attendance?date=2026-10-26` thì thấy mọi ca có buổi học ngày đó (lớp có ngày và lớp legacy theo thứ), buổi `cancelled` không xuất hiện. Danh sách tải trong ≤ 2 giây với seed e2e.
- [ ] Mở rộng 1 ca ngay tại chỗ, chọn trạng thái cho từng học viên, nhập ghi chú, bấm "Lưu điểm danh ca học": request trả về trong ≤ 2 giây, URL không đổi, toast thành công.
- [ ] Sau khi lưu, ca hiện nhãn "Đã điểm danh"; bộ đếm `attendance.pending` của `GET /api/dashboard/reminders` giảm đúng 1 (kiểm ở API test và E2E).
- [ ] Dữ liệu ghi xuống đúng D2: `present`/`late`/`unexcused` → `status = completed`, `excused` → `status = absent`; ghi chú được lưu và hiển thị lại khi tải lại trang.
- [ ] Lưu khi còn học viên chưa chọn trạng thái thì bị chặn ở client (viền vàng dòng thiếu + thông báo) và server trả 422.
- [ ] Ngày tương lai không lưu được (422 `future-session`, giống guard check-in hiện có).
- [ ] `pnpm check`, `pnpm check-types`, test web/server/db và e2e liên quan đều xanh.

## Rủi ro

- **Phụ thuộc TOS-6 chưa merge.** Route `/attendance`, `ReminderScope`, query key reminders và mục sidebar đều đến từ TOS-6. Bắt đầu Phase 2 khi TOS-6 Phase 1–2 đã vào `develop`; nếu cần làm song song thì rebase lên nhánh `feat/tos-6-dashboard-reminder-cards`.
- **Gói học phí bị trừ sai.** Đổi `excused` sang `absent` làm `done` giảm so với cách check-in cũ. Phase 1 có test cho bảng ánh xạ; Phase 4 kiểm `pkg.done` trên snapshot trước/sau khi lưu.
- **Sửa lại ca đã điểm danh** có thể đổi `completed ↔ absent` và làm thay đổi số buổi còn lại của gói. Đây là hành vi mong muốn (sửa sai), nhưng toast phải nói rõ "Đã cập nhật điểm danh".
- **Race 2 tab cùng lưu một ca.** Ghi trong transaction, điều kiện WHERE gồm `orgId`, `classId`, `date`; lần lưu sau thắng (last-write-wins) vì cả hai đều là thao tác có chủ đích của giáo viên. Không trả 409.
- **Hai cách điểm danh song song** (1-click ở trang lớp ghi `attendance = NULL`). Màn ngày hiển thị `NULL` + `completed` là "Có mặt" để không bị trống.

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
