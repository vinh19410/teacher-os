# Kongming Advisory — Design Fork Counsel (2026-08-21)

Advisory-only supervision cho pipeline `ak:vibe --ship --beta --advice` (issue #55).
Kongming trả về counsel; main agent chịu trách nhiệm mọi quyết định.

## Câu hỏi đặt ra

1. Fork 1 (timing generation): Option B (sinh lesson per-enrollment trong POST /students batch, kernel-coherent, 0 migration) vs Option A (nullable enrollmentId, sinh lúc POST /classes, ~12+ file, table-rebuild migration)?
2. Fork 2 (one-off create endpoint POST /lessons): có nên gồm trong #55 kèm operationId migration 0008?
3. Fork 3 (edit endpoint): POST /lessons/:id/edit upcoming-only, conditional-write mirror lessonStatusAction?

## Phán quyết của kongming

- **Fork 1: GO Option B.** "Không có cách thứ ba thỏa cả literal text lẫn kernel constraints. Mọi giải pháp cố sinh lessons trước enrollment đều vi phạm ít nhất một invariant." Diễn giải issue: user-facing flow là "tạo lớp → thêm học viên → thấy buổi". Yêu cầu ghi rõ diễn giải này vào issue #55.
- **Fork 2: NO — defer one-off create.** M1 DOD không yêu cầu endpoint one-off; operationId migration là surface thừa cho staging-only; lesson thủ công không align với "sessionsTotal sessions từ cấu trúc lịch". Revisit khi pilot đòi (tách issue riêng).
- **Fork 3: GO.** Copy nguyên guard lessonStatusAction: pre-read org-scoped, enrollment-belongs-to-class check, UPDATE với WHERE status='upcoming' + RETURNING, 0 rows → 409.

## Risk watch (kongming)

- D1 batch size: sessionsTotal thường 8-24, an toàn; test edge ≥50. *(Đã được red-team nâng cấp: cap contract `.max(52)` — finding F1/A1.)*
- Day mapping 0-6 vs 1-7: kongming đoán 0=Sunday (JS convention) — **sai**; planner đã tự verify từ code: schedule JSON 0=Monday (contracts.ts:47), lesson.day 1=Monday (schedule.tsx:53-56). Mapping +1 đúng.
- Duplicate same-slot rows collapse trong sessionsDone derive — kongming coi "existing limitation" — **red-team đính chính**: plan này kích hoạt defect (lesson.ts:11-13 "No create path yet"), đã relabel + pin test.
- Staging cũ không backfill: chấp nhận (M1 DOD chỉ cần org mới).
