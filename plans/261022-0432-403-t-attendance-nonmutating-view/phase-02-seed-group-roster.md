---
phase: 2
title: "Seed: enrollment thứ 2 cho lớp chính (roster nhóm)"
goal: "Lớp chính trong design-seed có 2 học viên active với lesson rows đầy đủ → session group → link mở modal render, nút commit 1:1 biến mất."
---

# Phase 02 — Seed: enrollment thứ 2 cho lớp chính

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Files to Create or Modify

- `apps/e2e/scripts/design-seed.ts` (modify) — sau khối fixture bước 2 (`seedQuizFixture`),
  thêm: 1 student "Nguyễn Thu Hà", 1 enrollment vào `fixture.classId`, 5 lesson rows cùng
  ngày/giờ/dur/status/topic với 5 lesson của Phạm Bảo Ngọc.

## Tasks & Steps

### Task 2.1 — Thêm học viên + enrollment + lesson rows
- Goal: mỗi buổi của lớp chính có 2 attendees → `isGroupSession = true`.
- Target files: `apps/e2e/scripts/design-seed.ts` (hàm main, sau `seedQuizFixture`).
- Steps:
  1. INSERT student `Nguyễn Thu Hà` (email `design.roster2.${runToken}@test.local` —
     **phải** có hậu tố `runToken` giống `teacherEmail`/`studentEmail` (design-seed.ts:27-29)
     vì unique index `student(org_id, lower(trim(email)))` (packages/db/src/migrations/0025_spotty_betty_ross.sql:16-17)
     làm seed crash `SQLITE_CONSTRAINT_UNIQUE` nếu chạy lại trên cùng db chưa wipe;
     `onboarding_completed_at` = now — active, không cần auth portal). Đặt TRƯỚC vòng
     `for` bước 6 hiện có và dùng tên KHÔNG trùng với danh sách
     `["Lê Quang Huy", "Trần Minh Anh", "Đỗ Khánh Linh"]` để không tạo student trùng
     tên trong org.
  2. INSERT enrollment (status active) của student này vào `fixture.classId`.
  3. INSERT 5 lesson rows cho enrollment mới, copy đúng 5 cặp
     `date/time/dur/status/topic` của lesson Phạm Bảo Ngọc đang seed (−7d completed,
     −3d completed, 0d upcoming, +4d upcoming, +9d cancelled) — giữ nguyên dữ liệu buổi,
     chỉ thêm attendee. `day` tính từ weekday của `date` (giống cách seed hiện có nếu có
     cột day; đọc INSERT lesson hiện tại trong `helpers-quiz.ts:136-142` để giữ schema).
  4. Không đụng: signup/verify portal học viên (bước 7), quiz attempts (bước 8), hoá đơn,
     syllabus, bước 6 (3 học viên org-only).
- Success criteria: script type-check sạch; logic seed read-through không đổi nhánh nào khác.
- Verify: `pnpm check-types` exit 0. (Verify runtime là phần `--side app` của phase 03 —
  seed chạy bên trong harness.)

### Task 2.2 — Rà side-effect trên các màn khác (tĩnh)
- Goal: biết trước các composite cần regenerate ở phase 03.
- Steps:
  1. Đọc nhanh các route chịu ảnh hưởng dữ liệu roster: `apps/web/src/routes/_auth` —
     dashboard (stat học viên), students list, student detail, schedule, reports; student
     portal `apps/student/src` — class detail (classmates).
  2. Liệt kê kết quả vào cuối file này (mục "Side-effect scan") — danh sách này là đầu vào
     cho Task 3.2.
- Success criteria: mục "Side-effect scan" có danh sách màn + lý do.
- Verify: no verification needed (ghi chú phân tích, phase 03 verify bằng ảnh thật).

## Verification matrix (tổng phase)

| Bước | Lệnh | Kỳ vọng |
|---|---|---|
| Type | `pnpm check-types` | exit 0 |
| Runtime | (phase 03) harness `--side app` seed thành công | log `[harness] seed xong` |

## Side-effect scan

Đã xác nhận bằng route thật (2026-10-22): thêm enrollment thứ 2 + 5 lesson rows đổi dữ
liệu mà các màn sau render → phải regenerate composite trong Task 3.2:

- `t-class-detail` — stat "học viên" (cls.studentIds), tally từng buổi (2 rows/buổi).
- `t-attendance` — mục tiêu: modal roster 2 hàng.
- `t-students` — list học viên org (+1 "Nguyễn Thu Hà", status active).
- `t-student-detail` — trang Bảo Ngọc: thông tin lớp (sessionsDone/tally không đổi nhưng
  regenerate cho an toàn vì cùng fixture).
- `t-schedule` — lịch tuần: số học viên/buổi hiển thị trên card.
- `t-dashboard` — stat tổng học viên / buổi đã học của org.
- `t-reports` — báo cáo chuyên cần theo lớp (roster 2 người).
- `s-dashboard`, `s-classes` — portal Bảo Ngọc: card lớp (số học viên).
- `s-class-detail` — portal Bảo Ngọc: danh sách cùng lớp (classmates) +1.

Không đổi: `t-classes` (list lớp — tên/số buổi giữ nguyên), `t-syllabus*`, `t-assignments`,
`t-tuition`, `t-invoice`, `s-quiz-*`, `s-vocab*`, `s-practice-*`, `s-history` (dữ liệu
attempt/học viên chính không đụng).
