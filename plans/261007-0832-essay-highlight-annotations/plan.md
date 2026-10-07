---
title: "Highlight + ghi chú trên bài Writing khi chấm"
description: "Giáo viên bôi đen từ/cụm từ trong essay ở trang chấm để highlight và ghi chú; mỗi highlight lưu ngay, học viên thấy highlight + ghi chú trên màn kết quả khi bài đã có điểm."
status: pending
priority: P2
effort: "14h"
issue: 332
branch: develop
tags: [feature, frontend, backend, database, grading]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Highlight + ghi chú trên bài Writing khi chấm

## Overview

Trang chấm `/grading/$attemptId` (#319) đang hiện essay của học viên dạng plain text trong một khối `whitespace-pre-wrap` ([submission-view.tsx:76-84](../../apps/web/src/components/grading/submission-view.tsx)). Giáo viên chỉ góp ý được qua một ô nhận xét chung cho cả bài. Plan #319 đã ghi "chú thích inline trên essay" vào Non-Goals; plan này làm phần đó.

Luồng mới:

1. Giáo viên bôi đen một từ hoặc cụm từ trong essay. Vùng chọn tự "bắt dính" theo ranh giới từ.
2. Một popover hiện ngay dưới vùng chọn, có ô "Ghi chú" và nút "Lưu highlight". Lưu xong, đoạn đó được tô nền và gắn số thứ tự.
3. Dưới essay có danh sách "Ghi chú trên bài viết" theo thứ tự xuất hiện. Mỗi mục có trích đoạn, ghi chú, nút Sửa và Xoá. Bấm vào highlight trong essay thì nhảy tới mục tương ứng.
4. Khi bài đã có điểm, màn kết quả của học viên hiện essay với các highlight đánh số và danh sách ghi chú của giáo viên.

## Key Decisions (user chốt 2026-10-07)

1. **Học viên chỉ thấy highlight khi bài đã chấm.** Server chỉ đưa `annotations` vào summary của học viên khi `toQuizAttemptGrade(attempt)` khác null. Giáo viên có thể highlight trước rồi chấm điểm sau mà học viên chưa thấy gì dở dang. Sau khi đã chấm, mỗi thay đổi highlight hiện ngay cho học viên (cùng tinh thần "thấy ngay khi lưu" của #319).
2. **Mỗi highlight lưu ngay**, qua API riêng, không phụ thuộc nút "Lưu điểm". Nút đó khoá tới khi đủ 4 tiêu chí, nên không thể gắn highlight vào nó. Rời trang không mất ghi chú.
3. **Một kiểu highlight + ghi chú tự do.** Không phân loại, không gắn tiêu chí. Nền highlight dùng token `--warn-soft` có sẵn trong `globals.css`; highlight đang chọn thêm viền mực đen `ring-1 ring-fg` (quy tắc "selection = mực đen" của `DESIGN.md`). Không thêm màu mới.
4. **Lưu trong bảng mới `quiz_attempt_annotation`** (migration 0035), mỗi highlight một dòng. Thêm/sửa/xoá từng cái là một câu SQL, không phải read-modify-write cả mảng JSON. Cột: `id`, `org_id`, `attempt_id` (FK cascade), `start_offset`, `end_offset`, `note`, `created_at`, `updated_at`.
5. **Vị trí lưu bằng offset ký tự (UTF-16, giống `String.prototype.slice`)** trên `quiz_attempt.essay`. Essay đóng băng sau khi nộp: route PATCH essay trả 409 khi `status = submitted` ([student.ts:1289](../../apps/server/src/routes/student.ts)), và không có retake. Nên offset không bao giờ lệch. Trích đoạn không lưu DB; client cắt từ `essay`.
6. **Không cho highlight chồng nhau.** Server trả 409 `OVERLAP` khi đoạn mới cắt vào đoạn đã có. Hàm render vẫn bỏ qua đoạn chồng hoặc sai biên để không vỡ UI nếu dữ liệu lỗi.
7. **Ghi chú được phép rỗng** (chỉ highlight), tối đa `QUIZ_ANNOTATION_NOTE_MAX = 1000` ký tự, plain text render bằng JSX text node (không HTML, không XSS). Mỗi bài tối đa `QUIZ_ANNOTATIONS_MAX = 200` highlight, mỗi đoạn tối đa `QUIZ_ANNOTATION_SPAN_MAX = 1000` ký tự.
8. **API giáo viên nằm trong router `grading.ts`**, mount trong kernel, nên có sẵn Origin guard, content-type guard cho POST và role gate teacher.
   - `POST /api/grading/:attemptId/annotations`, body `{ start, end, note }`, trả 201 + annotation.
   - `PATCH /api/grading/:attemptId/annotations/:annotationId`, body `{ note }`, trả 200 + annotation.
   - `DELETE /api/grading/:attemptId/annotations/:annotationId`, trả 204.
   - `GET /api/grading/:attemptId` trả thêm `annotations` (sắp theo `start`). Speaking luôn là `[]`.

   Mã lỗi: 401 không session; 404 attempt hoặc annotation không thuộc org/attempt; 409 `NOT_SUBMITTED`; 400 `SKILL_NOT_ANNOTATABLE` khi đề là Speaking; 400 `INVALID_SPAN` khi offset sai biên, quá dài hoặc toàn khoảng trắng; 409 `OVERLAP`; 400 `TOO_MANY_ANNOTATIONS`; 400 `invalid body`.
9. **Logic thuần dùng chung ở `packages/api/src/lib/essay-annotations.ts`**: `isValidAnnotationSpan`, `overlapsAny`, `snapSpanToWords`, `segmentEssay`. Server dùng để validate, web dùng để bắt dính vùng chọn, cả web và student dùng để chia essay thành đoạn.
10. **Component hiển thị dùng chung `EssayWithHighlights`** ở `packages/ui/src/components/quiz/essay-with-highlights.tsx` (cùng chỗ với `quiz-essay-input.tsx`). Số thứ tự trên highlight vẽ bằng CSS `::after { content: attr(data-n) }`, nên không lọt vào text DOM và không làm sai phép tính offset khi bôi đen.
11. **Contract thêm field optional, theo precedent #304/#305/#319.**
    - `teacherSubmissionSchema.annotations` optional (server luôn gửi; client đọc `?? []`).
    - `quizAttemptSummarySchema.annotations` optional, và server **chỉ thêm key khi đã chấm, đề Writing và có ít nhất 1 highlight**. Bundle học viên cũ (schema `.strict()`) chỉ lỗi parse ở đúng các attempt đó, reload là hết.

## Non-Goals

- Highlight trên bài Speaking (transcript, mốc thời gian audio).
- Phân loại highlight, màu theo loại lỗi, gắn tiêu chí IELTS.
- Gợi ý sửa (thay thế chữ), track changes.
- Highlight chồng nhau hoặc lồng nhau.
- Tạo highlight chỉ bằng bàn phím. Tạo mới cần bôi đen bằng chuột hoặc cảm ứng; sửa, xoá và duyệt highlight thì dùng bàn phím được hoàn toàn.
- Học viên trả lời hoặc đánh dấu "đã đọc" ghi chú.
- Ngân hàng ghi chú mẫu (comment bank) trong popover.
- Lịch sử chỉnh sửa, cột "ai highlight".
- Đổi form chấm điểm, band, nhận xét chung (plan `261007-0830-grade-form-band-slider` lo phần form; hai plan không đụng chung file code).

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Contract + DB + logic highlight dùng chung](./phase-01-contract-db-shared-lib.md) | pending | 2.5h |
| 2 | [Server: API highlight + payload giáo viên/học viên](./phase-02-server-annotation-api.md) | pending | 3h |
| 3 | [Web giáo viên: bôi đen để highlight, danh sách ghi chú](./phase-03-web-annotatable-essay.md) | pending | 5h |
| 4 | [Student: hiện highlight + ghi chú ở màn kết quả](./phase-04-student-annotated-essay.md) | pending | 1.5h |
| 5 | [E2E + docs + gate cuối](./phase-05-e2e-docs-gates.md) | pending | 2h |

Chạy tuần tự 1 → 2 → 3 → 4 → 5. Phase 3 và 4 chỉ phụ thuộc 1–2 nên có thể đảo thứ tự, nhưng không chạy song song (Phase 4 dùng component `EssayWithHighlights` tạo ở Phase 3).

## Success Criteria

- [ ] Ở trang chấm bài Writing, bôi đen một phần từ (ví dụ `nviron` trong `environment`) thì popover hiện với trích đoạn đã bắt dính thành cả từ `environment`.
- [ ] Lưu highlight thì đoạn đó được tô nền `--warn-soft`, có số thứ tự, và xuất hiện trong danh sách "Ghi chú trên bài viết". Tải lại trang vẫn còn.
- [ ] Bôi đen đè lên highlight đã có thì popover báo "Đoạn này trùng với highlight khác" và không cho lưu. Server cũng trả 409 nếu gọi thẳng API.
- [ ] Sửa ghi chú và xoá highlight từ danh sách được, kể cả chỉ dùng bàn phím (Tab, Enter, Esc). Bấm hoặc Enter trên highlight trong essay thì focus mục tương ứng trong danh sách.
- [ ] Học viên mở màn kết quả của bài **chưa chấm** không thấy highlight nào. Bài **đã chấm** thì thấy essay có highlight đánh số và danh sách ghi chú, bên cạnh band và nhận xét chung.
- [ ] Bài Speaking không có công cụ highlight; API highlight cho attempt Speaking trả 400.
- [ ] API: giáo viên org khác nhận 404 (IDOR), annotationId thuộc attempt khác nhận 404, attempt `in_progress` trả 409, offset sai biên/toàn khoảng trắng trả 400, ghi chú > 1000 ký tự trả 400, highlight thứ 201 trả 400, Origin lạ trả 403, session học viên trả 403, không session trả 401.
- [ ] UI đúng `DESIGN.md` ở 1440×900, 768×1024, 375×812. Ở 375 px, popover chiếm đủ chiều ngang khối essay và không tràn khỏi màn hình.
- [ ] Luồng chấm điểm (#319), màn kết quả Reading/Listening/Speaking và luồng nộp Writing không hồi quy.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test` và e2e `teacher-grade-submission`, `student-quiz-take-review` (ports 8100/8101/8103) đều xanh.

## Risks

- **Thứ tự deploy migration 0035:** worker mới query `quiz_attempt_annotation` ở GET trang chấm và ở summary học viên đã chấm. Nếu worker lên trước migration, các route đó trả 500, trong khi `/readyz` vẫn xanh. Giảm thiểu: header DEPLOY ORDER trong file migration và ghi vào runbook (precedent 0033).
- **Cửa sổ lệch version:** bundle web cũ parse `teacherSubmissionSchema` strict sẽ lỗi trên mọi trang chấm khi server mới gửi `annotations`; bundle student cũ lỗi ở attempt đã chấm có highlight. Reload là hết. Giảm thiểu: deploy server, web và student cùng release.
- **Race tạo highlight chồng nhau:** kiểm overlap rồi mới insert, không có khoá. Chỉ xảy ra khi hai tab cùng tạo hai đoạn chồng nhau trong vài ms. `segmentEssay` bỏ qua đoạn chồng nên UI không vỡ; giáo viên xoá được đoạn thừa từ danh sách. Chấp nhận ở v1 (org hiện là 1 giáo viên).
- **Ánh xạ vùng chọn DOM sang offset:** mỗi đoạn render đúng một text node và mang `data-start`; số thứ tự là pseudo-element. Vùng chọn tràn ra ngoài khối essay bị bỏ qua. Có unit test với Range thật trên jsdom và e2e trên Chromium.
- **Cảm ứng (375 px):** trình duyệt mobile hiện menu copy/paste native khi bôi đen. Popover nằm dưới vùng chọn (không đè menu native ở phía trên). Bắt vùng chọn qua `selectionchange` (debounce) thay vì chỉ `pointerup`. Verify thủ công ở viewport mobile.
- **Bảng mới tăng số query:** GET trang chấm thêm 1 query theo `attempt_id` có index; summary học viên chỉ query khi đã chấm và là Writing. Không đáng kể.

## Dependencies

- Xây trên #319 (trang chấm, `grading.ts`, `toQuizAttemptGrade`), #304 (essay), đều đã merge vào `develop`.
- Không phụ thuộc plan `261007-0830-grade-form-band-slider`. Plan đó sửa `grade-form.tsx`; plan này sửa `submission-view.tsx` và route `$attemptId.tsx`. Cả hai cùng sửa `CHANGELOG.md` và `teacher-grade-submission.spec.ts`, nên ai merge sau thì rebase.
- PR đích: `develop`. CI chỉ chạy cho `main`, gate là bộ lệnh local ở Phase 5 (theo `AGENTS.md`).

## Validation Log

### Session 1 — 2026-10-07

User chốt 3 quyết định trước khi soạn plan:
1. Học viên thấy highlight + ghi chú khi bài đã có điểm (không thấy khi giáo viên đang chấm dở).
2. Mỗi highlight lưu ngay qua API riêng, không gắn vào nút "Lưu điểm".
3. Một kiểu highlight + ghi chú tự do, không phân loại.

### Verification Results
- Tier: Full (5 phase), kiểm bằng grep/đọc code trực tiếp.
- Claims checked: 18 | Verified: 18 | Failed: 0 | Unverified: 0.
- Đã xác minh: essay đóng băng sau nộp (`student.ts:1289` trả 409); kernel guard áp Origin cho POST/PUT/PATCH/DELETE và content-type chỉ cho POST (`kernel.ts:112-127`); precedent PATCH trong router con (`assignments/index.ts:135`); `grading.ts` có `loadGradableAttempt`/`errorResponse` để tái dùng; summary học viên chỉ gắn `grade` khi đã chấm (`student.ts` khối `if (teacherGrade)`); handler summary không có biến `db` sẵn (đã sửa Task 2.6 dùng `deps.getDb()`); migration mới nhất là 0034 nên số kế tiếp là 0035; header DEPLOY ORDER theo `0033_*.sql`; utility `bg-warn-soft` có qua `--color-warn-soft` (`globals.css:156`) và Tailwind quét `packages/ui` (`globals.css:4-5`); `shadow-[var(--elev-raised)]` có precedent (`account-blocked-view.tsx:23`); `packages/api` export `./*` nên `@teacher-os/api/lib/essay-annotations` resolve được; student đã import `@teacher-os/ui/components/quiz/*` (`$attemptId.tsx:22-23`); web test component `packages/ui` có precedent (`rich-text-body.test.tsx`); `packages/ui` không có script test; e2e helper `seedQuizFixture`/`seedSubmittedEssay`/`orgIdForTeacherEmail` và `API_ORIGIN` tồn tại; precedent gọi API bằng `page.request` (`class-operations.spec.ts:156`); `ak plan validate` OK.

### Whole-Plan Consistency Sweep
- Style highlight đang chọn: plan.md Key Decision 3 và Phase 3.1/3.3e cùng dùng `ring-1 ring-fg` (không còn `bg-warn/40`, `border-warn`).
- Tên cột `start_offset`/`end_offset` (DB) và `start`/`end` (wire) thống nhất ở Phase 1, 2.
- `annotations` optional ở cả hai schema; server chỉ gửi cho học viên khi đã chấm + Writing + có highlight: khớp Key Decision 1, 11, Phase 2.6, Phase 4.2.
- E2E chấm qua API, không đụng widget chọn điểm, nên không xung đột với plan band-slider.
- Không còn mâu thuẫn chưa giải quyết.

