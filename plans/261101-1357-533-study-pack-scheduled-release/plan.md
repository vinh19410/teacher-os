---
title: "#533: Bộ đề tự học (study pack) gán vào lớp, hiển thị theo lịch không cần cron"
description: "Thay cron giao bài của #526 bằng bộ đề (pack) gồm các ngày → bài; gán vào lớp sinh class_assignment kèm available_at, học viên chỉ thấy bài khi available_at <= now (lọc lúc đọc). Bộ đề thư viện hệ thống + bộ đề org; chỉ Reading, Listening, Grammar, Vocabulary (tự chấm, không tốn credit AI)."
status: pending
priority: P1
effort: 18h
issue: 533
branch: feat/533-study-pack
tags: [feature, database, api, backend, frontend]
blockedBy: []
blocks: []
created: 2026-11-01
---

# Plan: #533 — Bộ đề tự học gán vào lớp, hiển thị theo lịch

## Outcome

Giáo viên chọn một **bộ đề** (thư viện hệ thống hoặc do org tự tạo), gán vào lớp với ngày bắt đầu + giờ mở/hạn nộp. Từ đó học viên tự thấy bài của từng ngày đúng lịch mà **không có job định kỳ nào**: mọi bài đã được tạo sẵn lúc gán, và truy vấn phía học viên lọc `available_at <= now`.

## Quyết định đã chốt với người dùng

| Quyết định | Chọn |
|---|---|
| Grammar | Làm luôn dạng bài Grammar tự chấm (tái dùng engine quiz hiện có) |
| "Bộ đề có sẵn" | Thư viện hệ thống (admin quản lý) + bộ đề org tự tạo; **thay** cron/plan #526 |
| Thông báo bài mới | Bỏ thông báo chủ động (học viên thấy khi mở app) |
| Kỹ năng được phép | `reading`, `listening`, `grammar`, `vocabulary` — không `writing`/`speaking` (tốn credit AI) |

## Hiện trạng (đã scout)

- #526 (cron `*/5` + `self_study_plan*`) chỉ có trên `develop`, **chưa vào `main`** (main dừng ở #510) → gỡ không ảnh hưởng production. Nhưng migration `0059_self_study_plan.sql` đã chạy ở dev/staging → gỡ bằng migration mới `0060`, không sửa `0059`.
- Học viên mở bài qua `class_assignment` + `class_assignment_target` (`apps/server/src/routes/student.ts` ~1167, ~1299; list ở `loadClassAssignmentItems` trong `student-class.ts`). Attempt khoá theo `class_assignment.id` (`quiz_attempt.assignment_id`, mode `assignment`) → **bài tự học bắt buộc là một dòng `class_assignment`**; không thể "ảo" hoàn toàn.
- Chưa có Grammar ở bất kỳ đâu (`ASSIGNMENT_SKILLS` = writing/reading/listening/speaking; `superRefine` chỉ cho `questions` khi reading/listening). Vocabulary hiện là `vocab_deck` (SRS) chứ không phải bài giao.
- `library_test`/`library_test_part` (không `orgId`, cột map 1-1 `assignment_prompt`, thiết kế sẵn để clone vào ngân hàng org) và admin CRUD (`apps/admin`, `admin-library.ts`) đã có cho reading/listening.
- #526 có giới hạn 200 bài/snapshot và lọc `plan_item_id IS NULL` → bài từ pack phải tiếp tục được loại khỏi snapshot/trần 200.

## Kiến trúc

```
study_pack (org_id NULL = thư viện hệ thống)
  └─ study_pack_item (day_index, position, source_kind, source_id)
       source_kind: org_prompt | library_test_part | library_exercise

Gán vào lớp  ──►  class_study_pack (class, pack, start_date, release_time, due_time)
   (1 transaction/batch, idempotent bằng id tất định)
   ├─ clone nguồn thư viện → assignment_prompt(ready) của org (1 lần, dedupe theo library_ref)
   ├─ class_assignment × item   (available_at, due_at, study_pack_ref)
   └─ class_assignment_target × học viên active

Đọc phía học viên:  WHERE available_at IS NULL OR available_at <= :now
Học viên vào lớp sau: hook ở luồng kích hoạt enrollment tạo target cho các bài chưa quá hạn
```

Lịch: ngày thứ `k` của pack = `start_date` + `k-1` ngày, **bỏ qua ngày nghỉ** (`organization_holiday` phạm vi org/lớp) bằng cách dịch các ngày sau lùi về sau — tính một lần lúc gán, không cần job.

## Phases

| # | Phase | Status | Effort | Dependencies |
|---|---|---|---|---|
| 1 | [Schema, migration 0060 & contracts](./phase-01-schema-migration-contracts.md) | Pending | 3h | — |
| 2 | [Dạng bài Grammar & Vocabulary tự chấm](./phase-02-grammar-vocabulary-exercises.md) | Pending | 4h | Phase 1 |
| 3 | [Bộ đề: API org + thư viện hệ thống](./phase-03-pack-library-and-org-api.md) | Pending | 4h | Phase 1, 2 |
| 4 | [Gán vào lớp, lọc lúc đọc, gỡ cron #526](./phase-04-assign-to-class-and-read-time-gate.md) | Pending | 4h | Phase 1, 3 |
| 5 | [UI giáo viên, kiểm chứng học viên & E2E](./phase-05-ui-and-e2e.md) | Pending | 3h | Phase 2, 3, 4 |

## Non-goals

- Writing/Speaking/AI grading và mọi thao tác tốn credit.
- Sửa giờ/lịch của pack đang chạy (V1: huỷ rồi gán lại).
- Thông báo email/in-app chủ động khi mở bài.
- Giao full test (`assignment_test`) hoặc SRS vocab (`vocab_deck`) qua pack.
- Builder đồ hoạ cho bộ đề thư viện trong admin (V1: tạo/sửa bằng form + import JSON).

## Extension trace

Ranh giới ổn định: `class_assignment.available_at` + helper `visibleAssignmentFilter(now)`. Biến thể kế tiếp có thể có (một loại học liệu khác, ví dụ video) chỉ cần thêm một `source_kind` và một nhánh clone ở phase 4; cơ chế lịch/lọc không đổi. Không thêm registry/plugin.

## Red-team (tự rà soát, chưa chạy 4 persona độc lập)

| # | Rủi ro | Xử lý |
|---|---|---|
| R1 | Bỏ sót một đường đọc `class_assignment` → học viên thấy/làm bài chưa mở bằng URL trực tiếp | Phase 4 kiểm kê mọi nơi dùng `classAssignment` ở route học viên (`student.ts`, `student-class.ts`, `student-history.ts`) + test "truy cập trước `available_at` → 404" cho cả GET quiz, start attempt, submit |
| R2 | Gán pack cho lớp đông × pack dài vượt giới hạn D1 (100 bind/câu lệnh, số statement/batch) | Chunk insert theo hằng `D1_*` đã có; id tất định + `onConflictDoNothing` để chạy lại an toàn; trần `MAX_PACK_DAYS` |
| R3 | Clone listening từ thư viện mất audio | Phase 3 xác minh cơ chế audio key (`getLibraryAudioStore`) trước khi mở `listening` cho system pack; nếu không copy được thì chặn item đó với lỗi rõ |
| R4 | Gỡ bảng #526 làm mất plan đang chạy ở staging | Backup trước migration; kiểm tra staging không có plan `published` (câu hỏi mở bên dưới) |
| R5 | Học viên vào lớp muộn không có target | Hook ở luồng kích hoạt enrollment, idempotent |
| R6 | Skill mới `grammar`/`vocabulary` lọt vào màn Writing/Speaking-only (chấm AI, practice catalog) | Phase 2 audit mọi `switch`/enum theo skill; test hồi quy catalog `PRACTICE_SKILLS` không đổi |

## Success criteria

- [ ] Gán pack vào lớp; trước `available_at` học viên không thấy bài (list, mở quiz, nộp), sau đó thấy ngay mà không có tiến trình nền.
- [ ] `packages/infra` không còn `crons`; `scheduled` handler và `runSelfStudyPlanTick` đã gỡ.
- [ ] Pack chỉ chứa reading/listening/grammar/vocabulary; item Writing/Speaking bị từ chối ở API.
- [ ] Bộ đề thư viện clone/gán được vào org; chạy lại không tạo trùng prompt hay bài.
- [ ] Bài từ pack không tính vào trần 200 bài và không phình snapshot.
- [ ] Học viên vào lớp giữa chừng nhận các bài chưa quá hạn.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` xanh; e2e có spec dịch đồng hồ qua `now` (không cron tick).

## Câu hỏi còn mở

1. Staging có plan #526 đang `published` cần chuyển sang pack không, hay được phép bỏ?
2. Bài Vocabulary trong pack là bài trắc nghiệm/điền từ tự chấm (đã giả định), hay cần liên kết `vocab_deck`/SRS?
3. Mỗi ngày tối đa bao nhiêu bài? (giả định giữ trần 10 như #526).
