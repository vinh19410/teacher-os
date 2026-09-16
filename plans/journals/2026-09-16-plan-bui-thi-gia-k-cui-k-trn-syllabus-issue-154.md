---
title: "Plan buổi thi giữa kỳ/cuối kỳ trên syllabus (issue #154)"
date: 2026-09-16
summary: "Lập plan feature kind (lesson/midterm/final) cho syllabus_lesson: highlight cấp dòng ở syllabus detail, import v4 5 cột có cột Loại — không hồi sinh cột status đã gỡ ở #152"
---

# Plan buổi thi giữa kỳ/cuối kỳ trên syllabus (issue #154)

## What happened

Chạy `ak:plan --github` cho yêu cầu "syllabus cần phản ánh các buổi midterm/final test, buổi thi được highlight". Scout (Explore agent) + xác minh trực tiếp chứng minh: `syllabus_lesson` (packages/db/src/schema/syllabus.ts) chỉ có `status` (tiến độ lớp) — không có khái niệm loại buổi; import v3 (apps/web/src/lib/syllabus-import.ts) 4 cột và chặn mọi ô thứ 5 khác rỗng nên không thể khai báo buổi thi từ file; màn hình syllabus detail vừa bị #152 gỡ cột status nên phải highlight ở cấp dòng.

Plan 3 phase (6h) tại plans/260916-0729-syllabus-test-session-highlight:
1. Data + API: migration `kind text default 'lesson'`, contracts (lessonUpsertSchema optional / syllabusModuleContentSchema default / KernelSyllabusLessonRow), 5 write path trong kernel.ts, snapshot.ts.
2. Web UI: prop `showKind` trên Add/EditLessonModal (mirror pattern `showStatus` để không đụng màn hình lớp), row highlight `bg-warn-soft/50` + Badge warn, mapSyllabi normalize kind lạ → lesson (pattern lessonDotClassFor).
3. Import v4: 7 luật delta (bãi bỏ block cột-5; old-v2 status vocab ở ô 5 → lỗi old-template đúng nguyên nhân; dòng Loại-only vẫn tạo buổi), preview cột Loại, fixtures csv/xlsx (exceljs sẵn ở apps/e2e).

## Decision

- 2 quyết định chốt với user: (1) import nâng 5 cột có cột "Loại" tùy chọn (file v3 4 cột vẫn chạy), (2) highlight chỉ màn hình Syllabus — class detail không đổi.
- `kind` = nội dung giáo trình (buildImportBatch copy template→lớp phải giữ kind), đối lập `status` = tiến độ per-lớp (reset upcoming khi copy).
- Không title-matching heuristic — field enum first-class qua đủ 6 layer.

## Next steps

- Review plan trên issue #154 (label `ready to review`), sau đó chạy `/ak:cook plans/260916-0729-syllabus-test-session-highlight/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
