---
phase: 10
title: "Học viên: Practice catalog (mới, gồm migration)"
status: pending
priority: P1
effort: "11h"
dependencies: [9]
---

# Phase 10: Practice catalog

## Goal

Học viên tự luyện theo kỹ năng (Reading, Listening, Writing, Speaking, Vocabulary — **không
Dictation**) từ **mọi đề `ready`** trong thư viện `assignment_test` của tổ chức đang chọn, đúng
bố cục `design-v2/src/pages/StudentPractice.tsx` (`SkillCatalog`, `SpeakingCatalog`,
`VocabCatalog`, `Select`, `Segmented`, `Pager`, `HistoryButton`). Bài luyện tập không ảnh hưởng
điểm lớp, báo cáo, học phí.

## Mô hình dữ liệu

- `quiz_attempt.assignment_id` → **nullable**; thêm `test_id` (FK `assignment_test.id`,
  `on delete set null`), `mode` (`"assignment"` | `"practice"`, default `"assignment"`).
  Ràng buộc logic: `mode='assignment'` ⇒ `assignment_id` not null; `mode='practice'` ⇒
  `test_id` not null (kiểm ở tầng route + test, SQLite CHECK nếu drizzle hỗ trợ trong migration).
- Index `(org_id, student_id, mode, submitted_at)` cho History (phase 11).
- Attempt cũ: migration set `mode='assignment'`.
- SQLite đổi NOT NULL → nullable = rebuild bảng: `pnpm db:generate` sinh `0041_*.sql`; review
  SQL thủ công (giữ dữ liệu, FK, index).
- **Backup trước khi chạy migration** ở mọi môi trường: copy file `.db` local (vd
  `apps/e2e/local.db` và DB dev) sang `*.bak-YYYYMMDD`; môi trường deploy chạy bước backup
  theo quy trình `db:migrate:deploy` hiện có trước khi migrate.

## Files to Create / Modify

- Modify: `packages/db/src/schema/quiz-attempt.ts`; Create: `packages/db/src/migrations/0041_*.sql`
  + `meta/*` (generate).
- Create: `apps/server/src/quiz-attempt-practice-migration.test.ts` — attempt cũ còn nguyên,
  `mode='assignment'`, FK giữ.
- Modify: `packages/api/src/contracts.ts` — `PracticeCatalogItem { testId, title, skill, parts,
  collection, testGroup, durationMin, lastAttempt?: { score, submittedAt, status } }`,
  `PracticeCatalogResponse`, `StartPracticeResponse { attemptId }`.
- Create: `apps/server/src/routes/student-practice.ts` (+ đăng ký trong `app.ts`):
  `GET /student/practice?skill=&collection=&q=&page=` (đề `status='ready'` của org đang chọn,
  phân trang 12), `POST /student/practice/:testId/attempts` (tạo attempt `mode=practice`,
  snapshot câu hỏi như luồng assignment). Submit/lưu dùng route attempt hiện có
  (`routes/student.ts`) — mở rộng để chấp nhận attempt practice (không yêu cầu class assignment).
- Create: `apps/server/src/routes/student-practice.test.ts` — chỉ thấy đề ready của org mình;
  không thấy draft; học viên org khác 403; tạo attempt → `assignment_id` null, `mode=practice`.
- Modify (lọc `mode='assignment'`): `apps/server/src/routes/grading.ts`, `routes/reporting/*`,
  `routes/snapshot.ts`, mọi query đếm submission/điểm của giáo viên — test hồi quy:
  practice attempt không xuất hiện trong bảng điểm lớp/báo cáo.
- Chấm Writing/Speaking luyện tập: mặc định **trạng thái "Chờ chấm"**, hiện trong hàng chờ chấm
  giáo viên với nhãn "Luyện tập" (filter riêng, không tính vào tiến độ lớp); Reading/Listening
  tự chấm như hiện có.
- Modify: `apps/student/src/lib/repos/student.ts` — `usePracticeCatalog`, `useStartPractice`.
- Create routes: `apps/student/src/routes/_auth/practice/index.tsx` (redirect skill đầu),
  `practice/$skill.tsx`; Create: `apps/student/src/components/practice/{skill-catalog,speaking-catalog,vocab-catalog,practice-filters,pager,history-button}.tsx` (+ test).
- Vocabulary catalog: đọc deck/course hiện có (`vocab`, `vocab_library_course`), mở vào luồng
  `/vocab/$deckId` sẵn có — không tạo dữ liệu mới.
- Modify: nav học viên (phase 4) — bật mục "Luyện tập" + con theo skill (không có Dictation).
- Filter sống trong URL (`?collection=&q=&page=`), ô search debounce 300ms (AGENTS.md).

## Tasks & Steps

1. Backup DB → schema + migration + migration test.
2. Route catalog + start practice + mở rộng submit; test quyền/phạm vi.
3. Lọc `mode` ở mọi query giáo viên + test hồi quy grading/reporting.
4. UI catalog 5 skill theo design; empty state khi org chưa có đề ready ("Giáo viên chưa có đề
   luyện tập cho kỹ năng này").
5. E2E: học viên mở Luyện tập › Reading → bắt đầu đề seed → nộp → thấy điểm; giáo viên không
   thấy attempt này trong bảng điểm lớp.

## Verification

- `pnpm --filter @teacher-os/db db:generate` không sinh diff thêm sau khi commit.
- `pnpm --filter server test -- practice migration grading reporting snapshot`
- `pnpm --filter student test -- practice`
- e2e mới `student-practice.spec.ts` (port override) + e2e grading/reporting hiện có xanh.
- `pnpm design:compare --screens s-practice-reading,s-practice-listening,s-practice-writing,s-practice-speaking,s-practice-vocabulary --side app --label new` → PASS.
