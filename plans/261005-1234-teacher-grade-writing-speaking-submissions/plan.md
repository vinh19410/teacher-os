---
title: "Giáo viên xem và chấm bài Writing/Speaking học viên đã nộp"
description: "Giáo viên mở bài Writing (essay) hoặc Speaking (file audio/video) học viên đã nộp từ tab Bài tập của lớp, chấm 4 tiêu chí IELTS + nhận xét; học viên thấy band và nhận xét ngay trên màn kết quả."
status: pending
priority: P1
effort: "16h"
issue: TBD
branch: develop
tags: [feature, frontend, backend, database, quiz, grading]
blockedBy: []
blocks: []
created: 2026-10-05
---

# Giáo viên xem và chấm bài Writing/Speaking học viên đã nộp

## Overview

Học viên đã nộp được bài Writing (cột `quiz_attempt.essay`, #304) và bài Speaking (file trên R2, cột `quiz_attempt.media_*`, #305). Phía giáo viên hiện chưa có đường nào đọc `quiz_attempt`:

- Tab "Bài tập" trong trang chi tiết lớp ([class-assignments-tab.tsx:716-748](../../apps/web/src/components/classes/class-assignments-tab.tsx)) chỉ hiện "Đã nộp" + thời điểm nộp cho từng học viên. Không có link xem bài.
- Màn kết quả của học viên ghi cứng "Giáo viên sẽ chấm bài viết/nói của bạn." ([`$attemptId.tsx:143,168`](../../apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx)). Không có chỗ nào hiện điểm.
- Màn `/assignments/$assignmentId` + `GradeModal` đang có là luồng **legacy**: chạy trên bảng `assignment` cũ ([assignment.ts](../../packages/db/src/schema/assignment.ts)), không nối với `quiz_attempt`. Ô nhận xét ở màn đó cũng không được lưu. Plan này **không** dùng lại luồng đó.

Plan này làm trọn vòng chấm bài:

1. Giáo viên vào lớp, mở tab Bài tập. Mỗi học viên **đã nộp** một đề Writing/Speaking có nút "Chấm bài", hoặc tag "Đã chấm · Band X" kèm link "Xem / sửa điểm".
2. Trang chấm `/grading/$attemptId` hiện:
   - đề bài (đề rich-text, ảnh Task 1, cue card),
   - bài làm: essay kèm số từ, hoặc player nghe/xem file nói,
   - form chấm 4 tiêu chí IELTS (0–9, bước 0.5), band tổng tự tính, ô nhận xét.
3. Bấm "Lưu điểm" thì học viên thấy band, điểm 4 tiêu chí và nhận xét ngay trên màn kết quả. Giáo viên sửa lại được bất cứ lúc nào.

## Key Decisions (user chốt 2026-10-05)

1. **Học viên thấy kết quả ngay khi giáo viên lưu.** Không có trạng thái nháp hay nút "Trả bài". Giáo viên sửa điểm thì ghi đè: `graded_at` cập nhật, học viên thấy bản mới nhất.
2. **4 tiêu chí IELTS + band tổng tự tính, kèm nhận xét chữ.**
   - Writing dùng key `task`, `coherence`, `lexical`, `grammar`. Nhãn của `task` theo part: `task1` là "Task Achievement", `task2` là "Task Response".
   - Speaking dùng key `fluency`, `lexical`, `grammar`, `pronunciation`.
   - Mỗi tiêu chí 0–9, bước 0.5 (`v*2` phải là số nguyên).
   - Band tổng = trung bình 4 tiêu chí, làm tròn theo quy ước IELTS (`.25` lên `.5`, `.75` lên số nguyên kế): `Math.round(avg * 2) / 2`. Hàm thuần `ieltsOverallBand` dùng chung cho server, web và student. Band **không lưu DB**, luôn derive từ scores, nên không lệch.
   - Nhận xét là plain text, tối đa `QUIZ_FEEDBACK_MAX = 5000` ký tự, được phép rỗng. Render bằng `whitespace-pre-wrap`, không dùng HTML, nên không có bề mặt XSS.
3. **Lối vào là tab Bài tập trong lớp.** Không đụng `apps/web/src/routes/_auth/assignments/index.tsx` vì file này đang có thay đổi chưa commit của việc khác. Không làm hàng đợi "Cần chấm" toàn org.
4. **Lưu điểm trên chính `quiz_attempt`** (migration 0033), cùng precedent #304/#305 "1 attempt mỗi lượt giao, không tạo bảng mới". Thêm 3 cột:
   - `grade_scores text` (JSON, nullable, null = chưa chấm),
   - `grade_feedback text NOT NULL DEFAULT ''`,
   - `graded_at integer` (timestamp_ms, nullable).
5. **API giáo viên keyed theo `attemptId`.** Router mới `apps/server/src/routes/grading.ts` mount trong kernel (`kernel.route("/grading", …)`), nên có sẵn Origin guard, guard JSON content-type cho POST và role gate teacher. Tenancy là `quiz_attempt.org_id = ctx.orgId`.
   - `GET /api/grading/:attemptId`: trả bài nộp kèm đề và điểm hiện tại.
   - `GET /api/grading/:attemptId/media`: stream file Speaking, header giống route học viên.
   - `POST /api/grading/:attemptId/grade`: body `{ scores, feedback }`, ghi đè điểm.

   Mã lỗi: 404 khi attempt không thuộc org; 409 `NOT_SUBMITTED` khi attempt còn `in_progress` (chỉ chấm sau khi nộp); 400 `SKILL_NOT_GRADABLE` khi đề không phải writing/speaking; 400 `invalid body` / `invalid scores` khi body sai.
6. **Snapshot kernel mang trạng thái chấm theo từng target.** `KernelClassAssignmentRow.targets[]` thêm 3 field:
   - `attemptId: string | null`: chỉ attempt đã `submitted`,
   - `gradedAt: string | null`,
   - `band: number | null`.

   Tab Bài tập dùng 3 field này để chọn nút "Chấm bài" hay tag "Đã chấm · Band X". Phía web, type `ClassAssignment.targets` khai **optional** cho 3 field này để fixture test cũ (kể cả `assignments/index.test.tsx` đang sửa dở) vẫn compile.
7. **Media cho giáo viên phát bằng blob fetch** (`credentials: "include"`), cùng lý do và precedent `QuizMediaPlayer` của #305. Route GET media của giáo viên dùng chung helper dựng `Response` với route học viên: tách ra `apps/server/src/lib/media-response.ts` (DRY) và giữ nguyên header `nosniff` + CSP sandbox + `no-store`. Middleware CORP `same-site` ở `app.ts` mở rộng thêm path giáo viên.
8. **Summary học viên thêm `grade` và `part` optional** (`quizAttemptGradeSchema.nullable().optional()`, `z.string().optional()`). `part` cần để nhãn tiêu chí Writing đúng Task Achievement/Response. Server **chỉ thêm 2 key này khi đã chấm**. Như vậy bundle học viên cũ (schema `.strict()`) chỉ lỗi parse ở attempt đã được chấm, thay vì mọi attempt. Đây là cửa sổ lệch version hẹp hơn precedent #304/#305; reload là hết. Route detail không trả `grade`.
9. **Trang chấm là route riêng `/grading/$attemptId`** (một segment động, thêm prefix `/grading/` vào `routes-matcher.ts`). Không lồng dưới `/classes/$classId` vì `$classId.tsx` là leaf route không có `<Outlet/>`. Nút "← Về lớp" dẫn tới `/classes/$classId?tab=assignments`. Route lớp thêm `validateSearch` cho `tab` optional, mở đúng tab Bài tập.

## Non-Goals

- Chấm Reading/Listening: đã tự chấm.
- Hàng đợi "Cần chấm" toàn org, badge đếm bài chưa chấm ở sidebar hay dashboard.
- Nháp điểm, nút "Trả bài", thông báo (notif/email) cho học viên khi có điểm.
- Chú thích inline trên essay (highlight, sửa lỗi từng câu) và ngân hàng nhận xét trong trang chấm.
- Lịch sử các lần sửa điểm, cột `graded_by` (ai chấm).
- Đổi hoặc xoá luồng legacy `assignment` / `GradeModal` / `/assignments/$assignmentId`.
- Hiện điểm ở overview hoặc danh sách bài của học viên. Chỉ màn kết quả attempt hiện điểm.
- Cho học viên nộp lại sau khi bị chấm (không có retake v1).

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Contract + DB + hàm band dùng chung](./phase-01-contract-db-band.md) | Pending | 2.5h |
| 2 | [Server: API chấm bài + snapshot + summary học viên](./phase-02-server-grading-api.md) | Pending | 4.5h |
| 3 | [Web giáo viên: trang chấm + nút ở tab Bài tập](./phase-03-web-grading-ui.md) | Pending | 5h |
| 4 | [Student: hiện band + nhận xét ở màn kết quả](./phase-04-student-grade-display.md) | Pending | 1.5h |
| 5 | [E2E + docs + gate cuối](./phase-05-e2e-docs-gates.md) | Pending | 2.5h |

Chạy tuần tự 1 → 2 → 3 → 4 → 5. Phase 3 và 4 chỉ phụ thuộc Phase 1–2 nên có thể đảo thứ tự, nhưng không chạy song song (cùng sửa `CHANGELOG.md` ở Phase 5).

## Success Criteria

- [ ] Ở tab Bài tập của lớp, học viên đã nộp đề Writing/Speaking chưa chấm có nút "Chấm bài". Đề Reading/Listening và học viên chưa nộp không có nút.
- [ ] Trang `/grading/$attemptId` với Writing hiện đề (kể cả ảnh Task 1), essay giữ xuống dòng, số từ và mục tiêu tối thiểu theo part. Với Speaking, trang hiện cue card/câu hỏi, tên file, dung lượng và nút "Nghe bài nói"/"Xem bài nói"; bấm vào thì phát đúng file.
- [ ] Form chấm có 4 select tiêu chí đúng theo skill. Band tổng cập nhật ngay khi đổi. Nút "Lưu điểm" disable tới khi đủ 4 tiêu chí. Lưu xong hiện "Đã lưu", tag ở tab Bài tập đổi thành "Đã chấm · Band X".
- [ ] Mở lại trang chấm của bài đã chấm thì form điền sẵn điểm và nhận xét cũ. Sửa rồi lưu thì ghi đè.
- [ ] Màn kết quả học viên của bài đã chấm hiện band tổng, 4 tiêu chí (nhãn tiếng Anh IELTS) và nhận xét, thay cho dòng "Giáo viên sẽ chấm…". Bài chưa chấm giữ nguyên dòng cũ.
- [ ] API: giáo viên org khác nhận 404 (IDOR). Attempt `in_progress` trả 409. Đề reading trả 400. Thiếu tiêu chí, thừa key, điểm lẻ 0.25 hoặc > 9 trả 400. Nhận xét > 5000 ký tự trả 400. Origin lạ trả 403. Session học viên trả 403 (role gate có sẵn).
- [ ] Reading/Listening, luồng nộp Writing/Speaking của học viên và luồng legacy `/assignments/$assignmentId` không hồi quy.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test` và e2e `teacher-grade-submission` (ports 8100/8101/8103) đều xanh.

## Risks

- **Cửa sổ lệch version (student):** bundle cũ + server mới chỉ lỗi parse summary của attempt **đã chấm**, vì key `grade` chỉ xuất hiện khi có điểm. Error boundary `AttemptReviewError` không có nút thử lại; reload là lấy bundle mới. Giảm thiểu: deploy server và student trong cùng release, server đi trước.
- **Hai giáo viên cùng org chấm một bài:** ghi sau thắng (last-write-wins), không có khoá. Chấp nhận ở v1 vì org hiện là 1 giáo viên.
- **Kích thước snapshot:** `loadSnapshot` thêm một query `quiz_attempt` theo `org_id`, có index `quiz_attempt_org_idx`, chỉ select 5 cột nhẹ (không lấy essay/answers/snapshot). Không đáng kể ở quy mô pilot.
- **Migration:** chỉ `ALTER TABLE ADD COLUMN` (nullable hoặc có default), không đụng dữ liệu cũ. Vẫn backup D1 trước khi apply ở môi trường thật (theo rule dự án) và ghi 0033 vào `docs/production-release-runbook.md`.
- **Bài Speaking nộp rỗng trước #305** (`media = null`): trang chấm hiện "Bài này được nộp khi chưa có file bài nói." và vẫn cho chấm.

## Dependencies

- Xây trên #283 (quiz attempt), #304 (essay) và #305 (media + `MediaStore`), tất cả đã merge vào `develop`.
- PR đích: `develop`. CI chỉ chạy cho `main`, nên gate là bộ lệnh local ở Phase 5 (theo `AGENTS.md`).
- Thực thi dưới `--advice`: mỗi phase có Failure Protocol riêng. Verify fail thì STOP và hỏi `kongming`, không tự suy luận để đi tiếp.
