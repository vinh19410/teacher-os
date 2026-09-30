# Code Review — Promotion develop → main (v0.0.7 → v0.0.10)

- Reviewer: code-reviewer (subagent, report-only — không sửa file nào)
- Delta: `origin/main...HEAD`, 202 files, +27931/−676, 24 commits
- Phạm vi theme: rich text Tiptap v3 (#280), student-view preview `?id=` (#282), luồng học viên làm bài + xem lại (#283: bảng `quiz_attempt` migration 0030 + 6 endpoint `/api/student/*`), tab "Làm thử & Soi bài" (#285), IELTS full test builder (assignment_test + CRUD), dashboard schedule cards (#278), rename dev scripts.
- Ngày review: 2026-09-30 (Asia/Saigon)

## Verification đã chạy (bằng chứng)

| Gate | Kết quả |
|---|---|
| `pnpm --filter server test` | 26 files / 427 tests PASS |
| `pnpm --filter web test` | 107 files / 1145 tests PASS |
| `pnpm --filter student test` | 12 files / 110 tests PASS |
| `pnpm check-types` | 7/7 tasks PASS (turbo cache) |
| `pnpm check` (biome) | sạch, 1 info (gợi ý `biome migrate` config) |
| E2E | KHÔNG chạy trong review này (cần dev stack port 8100/8101/8103 theo AGENTS.md) — kết luận E2E dựa trên đọc spec |

## Pass 1 — CRITICAL

### C1 — Transcript đề listening lộ xuống wire take payload của học viên (data exposure / cheat vector)

**Bằng chứng (đã verify bằng đọc code):**
- `apps/server/src/routes/student.ts` — handler `GET /api/student/assignments/:assignmentId/quiz`, object `detail` trả về có `transcript: prompt.transcript` (dòng ~885 trong bản đọc; symbol: `router.get("/assignments/:assignmentId/quiz", ...)`).
- `packages/api/src/contracts.ts:1517` — `studentQuizDetailSchema` khai báo `transcript: z.string()` (schema take).
- `apps/student/src` — grep toàn bộ source (trừ test) cho "transcript": **0 kết quả** — student app không render transcript ở bất kỳ đâu.
- `packages/ui/src/components/quiz/quiz-paper.tsx` — render passage/intro/prompt qua `RichTextBody`, **không có nhánh render transcript** cho skill listening.
- `apps/e2e/specs/student-quiz-take-review.spec.ts` (hàm leak-check, dòng ~422) — ban-list chỉ gồm `["answer", "alts", "note", "verdict", "key"]`, **thiếu "transcript"**.

**Failure scenario cụ thể:** giáo viên giao đề Listening (transcript là nguồn soạn đáp án — answer key của listening suy ra từ transcript). Học viên mở DevTools → Network → đọc response `GET /api/student/assignments/:id/quiz` khi đang làm bài → thấy toàn bộ transcript → chép đáp án. Điều này trái với chính thiết kế đã ghi trong changelog và comment code: "answer/alts/note không bao giờ xuống wire" (RT#6) — transcript là dạng "answer key" với listening nên vi phạm cùng bất biến. Leak cũng xảy ra ở detail page (route `$attemptId.detail.tsx` loader gọi `quizDetailQueryOptions` để lấy paper chrome).

**Fix đề xuất (không áp dụng):**
1. Ở handler GET quiz: trả `transcript: ""` khi attempt chưa submit (hoặc bỏ field khỏi schema take; nếu muốn tiết lộ sau nộp thì thêm vào `quizAttemptDetailSchema` một cách tường minh).
2. Thêm `"transcript"` vào ban-list 3 lớp của e2e leak-check.
3. Lưu ý: teacher sim (#285) lấy transcript từ draft/web snapshot, không qua endpoint này — không bị ảnh hưởng.

### Đánh giá các mục Pass 1 khác — KHÔNG tìm thấy defect (ghi nhận bằng chứng)

| Mục | Kết luận | Bằng chứng chính |
|---|---|---|
| CSRF/Origin/Content-Type guard endpoint student mới | ĐẠT — `quizWriteGuard` (student.ts, symbol `quizWriteGuard`, đăng ký sau session gate) check Origin allowlist + Content-Type JSON + `bodyLimit` 4096 đo trên byte thật; phủ đúng `/assignments/:id/quiz/*` (start) và `/attempts/*` (answer/submit). Server test (b) verify 403/415/413. `allowedOrigins` fail-closed khi env rỗng; infra (`packages/infra/alchemy.run.ts` topology branch) đảm bảo CORS_ORIGIN chứa cả appOrigin + studentOrigin, sai thì fail-loud trước deploy | student.ts; index.ts; alchemy.run.ts |
| Auth bypass / requireStudent | ĐẠT — closure `requireStudent` gắn đủ 6 endpoint mới ngay trong `studentRoutes()` (RT#1); session gate chặn role teacher; mọi statement `quiz_attempt` đều có predicate org + studentId (GET quiz / start / PATCH answer / submit / summary / detail); GET quiz/start ownership qua inner-join `classAssignmentTarget` (org + student). Server test (c): same-org non-owner → 404 trên toàn bộ `/attempts/*` | student.ts; student-quiz.test.ts |
| XSS đường rich text | ĐẠT — single sink xác nhận bằng grep toàn `apps/web`, `apps/student`, `packages/ui`: chỉ `packages/ui/src/components/assignments/rich-text-body.tsx` dùng `dangerouslySetInnerHTML`, luôn qua `sanitizeRichText` (DOMPurify 3.4.16, allowlist 14 tag + 2 attr, không data attr, hook ép `a` target=_blank + rel=noopener noreferrer; javascript: URI bị chặn bởi default URI regexp). Nhánh không-DOM luôn render React-escaped. Adapter legacy escape `&`/`<`. StarterKit v3.31 có sẵn Link + Underline (verify trong pnpm-lock — lo ngại toolbar thiếu extension đã loại). E2E `rich-text-content.spec.ts` là behavioral (assert `<img onerror>` không tồn tại + handler không chạy) | rich-text-sanitize.ts; rich-text-body.tsx; pnpm-lock.yaml |
| Race/idempotency autosave | ĐẠT — PATCH answer dùng `json_set` atomic (không read-modify-write), CAS `status='in_progress'` trong WHERE, path `$."<q>"` bind TEXT an toàn (q là int đã validate + range-check theo snapshot); start idempotent + unique-race re-read (unique index `quiz_attempt_assignment_student_uq`); client store drain giới hạn 2 wave, per-key in-flight ordering chống out-of-order, cap value 500 cắt client-side | student.ts; quiz-attempt-store.ts; schema quiz-attempt.ts |
| Data integrity migration 0030 + snapshot semantics | ĐẠT — SQL khớp schema drizzle (unique `(assignment_id, student_id)`, index org, FK cascade); `_journal.json` cập nhật idx 29/30; snapshot đề ĐẦY ĐỦ KEY tại start, grading chỉ đọc snapshot (RT#3); GET quiz map questions chỉ `{stem, opts, pin}`; `assignment_test_part` unique (testId, part) + FK prompt RESTRICT; org scoping part qua inner-join test; route PUT parts có IDOR check promptId (org + skill + part) + delete/insert trong MỘT `db.batch` | 0030_previous_drax.sql; schema/quiz-attempt.ts; schema/assignment-test.ts; snapshot.ts; assignments/tests.ts |
| Secrets scan toàn delta | SẠCH — mọi match (PASSWORD test, token harness, SECRET_QC_285_KEY fixture) đều là dummy trong test/spec; không có key/credential thật | grep toàn diff |

## Pass 1 — HIGH

### H1 — Submit flip-first: partial failure giữa flip và batch làm mất vĩnh viễn stamp `class_assignment_target.submittedAt` (thuộc mục review bắt buộc "D1 không có transaction")

**Bằng chứng:** `apps/server/src/routes/student.ts`, handler `POST /attempts/:attemptId/submit`: (1) CAS UPDATE flip `in_progress → submitted` (kèm `submittedAt` trên chính row attempt); (2) SELECT đọc lại; (3) nếu thắng CAS → `db.batch([update correctCount, update classAssignmentTarget.submittedAt])`.

**Failure scenario cụ thể:** flip thành công → `db.batch` throw (D1 transient 5xx, hoặc SELECT ở bước 2 throw) → response 500, client toast "Không nộp được bài". Trong lúc đó trên client, refetch `useStudentQuizDetail` thấy `attempt.status === "submitted"` → effect redirect sang trang summary (route take `$assignmentId.tsx`) → học viên **không bao giờ bấm nộp lại**. Lần submit retry tiếp theo (nếu có) thua CAS (`flipped.length === 0`) → trả 200 nhưng bỏ qua batch → `class_assignment_target.submittedAt` giữ `null` **vĩnh viễn**: overview học viên + view giáo viên hiển thị "chưa nộp" dù attempt đã submitted. Điểm số hiển thị vẫn đúng (summary/detail chấm live từ snapshot), chỉ stamp denormalized bị mất — nhưng đây là cột quyết định trạng thái nộp bài trên 2 UI.

**Xác suất:** thấp (cần 1 trong 2 thao tác D1 kế tiếp fail ngay sau khi thao tác đầu thành công) nhưng hậu quả tồn tại vĩnh viễn, không có đường tự chữa.

**Fix đề xuất:** trên retry path (`flipped.length === 0`), đọc `classAssignmentTarget.submittedAt`; nếu null thì chạy lại batch idempotent (update correctCount + stamp đều vô hại khi lặp). Chi phí 1 SELECT, đóng hoàn toàn cửa sổ.

### H2 — Kernel CSRF guard không check Origin cho PATCH/PUT (các endpoint mới thuộc diện này)

**Bằng chứng:** `apps/server/src/routes/kernel.ts`, middleware `kernel.use("*")` đầu tiên: `if (c.req.method === "POST" || c.req.method === "DELETE")` — PATCH và PUT bỏ qua hoàn toàn Origin + Content-Type check. Delta thêm 3 endpoint thuộc khoảng trống này: `PATCH /api/assignments/prompts/:id`, `PATCH /api/assignments/tests/:id`, `PUT /api/assignments/tests/:id/parts` (gọi từ web qua `kernelCommand`).

**Đánh giá rủi ro (đã fact-check, không phải blocker):** cross-site PATCH/PUT với JSON body bắt buộc qua CORS preflight; origin list tĩnh từ env (infra fail-loud khi thiếu origin bắt buộc) → preflight thất bại, request thực không tới server. Với cấu hình hiện tại **không khai thác được**; đây là inconsistency với chính policy "fail-closed Origin check" mà comment kernel.ts tự tuyên bố (DELETE cũng cần preflight nhưng vẫn được check).

**Fix đề xuất:** mở rộng điều kiện thành `["POST", "PUT", "PATCH", "DELETE"].includes(method)` — 1 dòng, khép khoảng trống cho mọi endpoint tương lai.

## Pass 2 — MEDIUM / INFORMATIONAL

- **M1 — Heuristic `isHtml` của `RichTextBody` làm hỏng hiển thị hàng legacy chứa dạng `<chữ...>`:** legacy plain "x<y and y>z" khớp regex `<\/?[a-z][^>]*>` → DOMParser tạo element `y` (children > 0) → đi nhánh DOMPurify → tag bị strip, đoạn " and y" bị nuốt thành attributes → render "xz". Dữ liệu lưu không đổi (chỉ corrupt lúc hiển thị), xác suất thấp với nội dung IELTS. Gợi ý: trước khi classify là HTML, kiểm tra tag nằm trong tập allowlist đã biết thay vì mọi tag.
- **M2 — Reconcile mirror-đè-server có thể làm regression đáp án mới hơn từ thiết bị khác:** `quiz-attempt-store.ts` `reconcile()` — mirror local (có thể stale) override answers server và re-PATCH giá trị cũ đè đáp án mới hơn học viên vừa làm trên thiết bị khác. Tradeoff sản phẩm hợp lý (edit chưa save thắng), nhưng với mirror stale lâu ngày thì ngược. Ghi nhận để product quyết.
- **I1 — Thiếu body cap trên kernel PATCH/PUT + POST /prompts:** chỉ `POST /syllabi` có `bodyLimit` 2MiB; các endpoint prompt/test mới không có (zod reject sau khi parse toàn body). Đồng nhất hóa transport cap khi tiện.
- **I2 — `htmlToPlainText` hai implementation (DOM vs regex fallback trên workerd):** cap plain-text được đo bằng regex phía server worker nhưng bằng DOM phía client — nội dung sát cap có thể pass client mà fail server 400 (hoặc ngược). Headroom raw ×2.5 làm giảm thực tế; ghi nhận.
- **I3 — `handleReconcile` của test-builder khớp test theo title+skill:** hai test trùng title+skill → reconcile có thể navigate nhầm test. Dùng id khi có thể.
- **I4 — Double cast `questions as unknown as AssignmentQuestion[]`** trong `quiz-paper.tsx` khi truyền PinOverlay — hoạt động vì PinOverlay chỉ đọc `pin`, nhưng là smell che khuất contract thật (chỉ cần `{pin}`).
- **I5 — `dispose()` của attempt store clear mirror đồng thời trong khi PATCH còn bay:** flush không keepalive + clearMirror ngay — nếu PATCH fail transient đúng lúc unmount, value mất khỏi cả server lẫn mirror. Cửa sổ hẹp, impact 1 câu.
- **I6 — Version:** diff `origin/main...HEAD` cho `package.json` 0.0.7 → 0.0.9, nhưng working tree hiện là 0.0.10 — xác nhận commit bump 0.0.10 vào delta trước khi tag/PR promotion.
- **I7 — `pnpm check` còn 1 info của biome (gợi ý migrate config).**
- **I8 — N+1 pre-existing:** `/api/student/overview` query lesson per-class trong `Promise.all` — không thuộc delta, không đổi.
- **I9 — Test gap:** ban-list leak-check e2e thiếu "transcript" (gắn với C1); không có test riêng cho superRefine answer-choice khi PATCH body không kèm `type` (route đã xử lý đúng bằng row DB, chỉ thiếu pin).

## Positive Observations (để cân bằng rủi ro, không praise-padding)

- Design flip-first + CAS + json_set atomic trên D1 không-transaction là lựa chọn đúng cho stack này; client store (drain 2 wave, per-key ordering, halt reasons, mirror reconciliation) xử lý các race mà phần lớn implementation bỏ qua — điểm này là lý do chỉ tìm thấy H1 thay vì cả cụm race bug.
- Server tests là behavioral thật (buildApp + libsql + migration thật, assert HTTP status + shape + DB state), không phải phantom.
- Deploy-order note "chạy `db:migrate:deploy` TRƯỚC worker" đã có trong migration 0029 và changelog — nhắc lại trong runbook promotion.

## Recommended Actions (thứ tự ưu tiên)

1. **Trước merge promotion:** fix C1 (strip transcript khỏi take payload + thêm vào e2e ban-list) — 1 dòng handler + 1 dòng test.
2. **Trước merge promotion (khuyến nghị mạnh):** fix H1 (re-stamp idempotent trên retry submit) — khoảng 10 dòng + 1 test case.
3. Cùng PR hoặc follow-up sát: H2 (mở rộng Origin check cho PATCH/PUT), I6 (confirm bump version 0.0.10).
4. Follow-up: M1, M2 (product call), I1–I5, I7, I9.

## Metrics

- Type Coverage: TS strict toàn repo, không thấy `any`-widening mới trong delta (không có số % chính xác — repo không bật report)
- Test Coverage: unit server 427 / web 1145 / student 110 — PASS; e2e không chạy trong review
- Linting Issues: 0 error, 1 info (biome migrate)

## Unresolved Questions

1. Transcript trên take wire là chủ đích cho tính năng read-along tương lai hay là sót? Nếu chủ đích, cần UI + product gate; nếu sót, fix theo C1.
2. Commit bump version 0.0.10 chưa nằm trong delta `origin/main...HEAD` tại thời điểm review — lead xác nhận trước khi mở PR promotion.

---

Status: DONE_WITH_CONCERNS
Summary: Review toàn delta promotion 202 files — chất lượng tổng thể cao, các gate Pass 1 (CSRF, ownership, XSS single-sink, autosave atomic, migration, secrets) đều verify đạt bằng code thật + 1682 unit test xanh; tìm thấy 1 Critical (transcript đề listening lộ xuống wire take payload của học viên, e2e leak-check thiếu ban-list này) và 1 High (submit flip-first mất vĩnh viễn stamp submittedAt nếu batch fail giữa chừng, không có đường tự chữa).
Concerns/Blockers: C1 cần fix trước merge (data exposure trên assessment); H1 khuyến nghị fix trước merge; version 0.0.10 cần confirm commit vào delta; e2e chưa được chạy trong review này (chỉ unit/typecheck/lint).
