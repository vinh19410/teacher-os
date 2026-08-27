---
title: "M1 lesson API plan (issue #55)"
date: 2026-08-21
summary: "Plan issue #55 qua hard-mode pipeline: 2 researcher → kongming chốt Option B (sinh lesson lúc enroll) → 3 red-team reviewer bắt 12 findings (1 Critical: sessionsTotal cap) — tất cả applied, validation 0 contradiction"
---

# M1 lesson API plan (issue #55)

Plan cho "M1: API tạo/sửa/hủy buổi học từ lịch lớp" (issue #55, milestone M1) trong worktree `feat/55-lesson-crud-api-from-class-schedule`, plan `plans/260821-1538-add-lesson-crud-api-from-class-schedule/`.

Quyết định trung tâm: **Option B — sinh lesson per-enrollment trong batch POST /students** thay vì literal "lúc tạo lớp". `lesson.enrollmentId` NOT NULL + lớp mới có 0 enrollment; mọi đường sinh lesson trước enrollment đều phá kernel đã verify (mapLessons, findLessonAction, invariant 6) và đòi table-rebuild migration — mâu thuẫn ràng buộc "no big schema change" của chính issue. Kongming xác nhận không có cách đọc thứ ba thỏa cả literal text lẫn kernel constraints; diễn giải ghi audit trail vào issue #55.

Thiết kế: pure generator `generateScheduleLessons` (weekday mapping +1 — schedule 0-6 [0=Monday] → lesson.day 1-7; dur wrap-midnight; fail-closed → [] cho legacy schedule) + `POST /lessons/:id/edit` upcoming-only với conditional-write guard + optimistic concurrency; cancel đã có từ Wave 4. 0 schema change, 0 migration.

Red-team (3 reviewer hostile, Standard tier): 22 raw → 12 consolidated, 100% accepted. Đáng nhớ nhất: (1) Critical — `sessionsTotal` không cap tạo poison class (enroll batch nổ, không có endpoint sửa lớp → chết vĩnh viễn) → cap `.max(52)`; (2) guard `status='upcoming'` KHÔNG chống được edit-vs-edit lost update vì edit không đổi cột guard, khác check-in → đưa old values pre-read vào WHERE; (3) nhãn "pre-existing" cho sessionsDone distinct-(day,time) collapse là sai — chưa từng có production lesson-create path, plan này kích hoạt defect → relabel + pin test red-target cho #56; (4) `zoom` chưa validate scheme là vector inject link độc qua Zalo template → refine ""|https://.

Bài học: (a) "guard giống check-in" không transplant được nguyên văn khi statement không ghi chính cột guard — phải suy lại từ thuộc tính race cần chặn; (b) claiming một limitation là "pre-existing" cần kiểm tra xem feature này có phải writer đầu tiên không; (c) trust-boundary cap string là quy ước đã có trong contracts.ts — reviewer bắt ngay khi schema mới quên.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

## Implementation outcome (2026-08-21, cùng ngày)

Implement xong trên branch `feat/55-lesson-crud-api-from-class-schedule`: 5 file code (+856/−9), 0 schema change. Suite: server 97/97 (thêm ~31 test), web 187/187 (thêm pin test collapse), auth 16, infra 11; biome baseline pre-existing; check-types + build xanh. Code-review Stage 2 bắt 1 Important (form web gửi sessionsTotal > 52 chết ngắt sau cap — fix validate client "Tổng số buổi tối đa là 52." + max={52}) và thêm test concurrent Promise.all xác nhận optimistic-lock [200,409] đúng 10/10 runs. Deploy note: server→web; D1 smoke sau merge (createClass → addStudent → GET /kernel + concurrent edit + cancel).
