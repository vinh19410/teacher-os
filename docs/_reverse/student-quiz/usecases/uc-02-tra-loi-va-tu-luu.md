---
type: reverse-usecase
feature: student-quiz
uc: UC-02
status: draft
updated: 2026-11-12
---
# UC-02 — Trả lời câu hỏi, viết bài và tự lưu

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Học viên trả lời từng câu (chọn/go chữ), gõ bài Writing; mỗi thay đổi tự lưu theo câu, sống qua reload, và ghép lại khi khôi phục bài dở |
| (b) Actor chính | Học viên. Phụ: máy tự lưu client (debounce/mirror) |
| (c) Tiền điều kiện | Attempt `in_progress` thuộc học viên; đề đã được đóng băng ở UC-01 |
| (d) Hậu điều kiện | `answers` có giá trị mới nhất cho từng câu đã làm; `essay` lưu toàn văn bài Writing; mirror localStorage đồng bộ; 401/409 thì máy lưu halt |

**(e) Luồng chính**

1. Học viên thay đổi đáp án câu `q` (hoặc gõ bài viết). — ✅ [S16] `apps/student/src/components/quiz/quiz-take-view.tsx`, [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`
2. Máy tự lưu ghi mirror `quiz-attempt:{id}` / `quiz-attempt:{id}:essay` vào localStorage và xếp hàng, debounce 600ms. — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:11-25,108-160`
3. Hết debounce: PATCH `/attempts/:id/answer` với `{q, value}` (hoặc PATCH essay với `{text}`). — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:223-260`; [S7] `packages/api/src/contracts.ts:2732-2741,2413-2418`
4. Máy chủ xác nhận sở hữu (predicate org + student), kiểm attempt còn `in_progress`. — ✅ [S1] `apps/server/src/routes/student.ts:1581-1596,1656-1662`
5. Đáp án: kiểm `q` trong phạm vi snapshot (ngoài → 400 `question index out of range`) rồi ghi bằng `json_set` với key chuỗi `'$."<q>"'` và `json_quote(value)` — nguyên tử, không read-modify-write. — ✅ [S1] `apps/server/src/routes/student.ts:1599-1612`
6. Essay: chỉ khi đề có phần Writing (`essayTaskOf(attempt) !== null`), ghi đè toàn văn, cap 10.000 ký tự; ngược lại 400 `essay not allowed`. — ✅ [S1] `apps/server/src/routes/student.ts:1664-1673`, [S7] `packages/api/src/contracts.ts:2407`
7. Header hiển thị "Đang lưu…" → "Đã lưu". — ✅ [S20] `apps/student/src/components/quiz/quiz-runtime-header.tsx:8-10`
8. Dạng điền chữ có đáp án T/F/NG (hoặc Y/N/NG) mà không khai type được suy thành tfng/ynng để render radio. — ✅ [S10] `packages/api/src/lib/infer-question-types.ts:60-89`

**(f) Luồng thay thế/đặc biệt**

- f1: Cùng câu đang có PATCH bay → bỏ qua luột này, gửi giá trị mới nhất sau khi request xong (last-write-wins). — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:131-160,293-297`
- f2: 401 khi autosave → halt `auth`, banner "Phiên đăng nhập đã hết hạn — bài làm của bạn được giữ lại. Đang chuyển đến trang đăng nhập…", redirect. — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:57,252`; [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:495-505`
- f3: 409 khi autosave → halt `submitted` (bài đã nộp ở nơi khác). — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:261`
- f4: Tab đóng/ẩn → flush `keepalive` trên `pagehide`/`visibilitychange`. — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:345-355`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:350-354`
- f5: Khôi phục: route mở lại bát dở, đọc mirror và server, mirror mới hơn thắng, drain đồng bộ; nộp trước khi drain xong thì drain ném lỗi rõ ràng (`quiz autosave did not settle`) sau tối đa 2 wave. — ✅ [S12] `apps/student/src/lib/quiz-attempt-store.ts:356-480`
- f6: 0 rows cập nhật (submit xen giữa read/write) → re-read phân biệt 404/409. — ✅ [S1] `apps/server/src/routes/student.ts:1613-1624,1675-1685`
- f7: Giá trị đặc biệt (`0.0`, khoảng trắng, ký tự Unicode) round-trip nguyên vẹn; chấm mới normalize. — ✅ [S1] `apps/server/src/routes/student.ts:1606-1612`; test [S23] `apps/server/src/routes/student-quiz.test.ts:1294-1337`

**(g) Dữ liệu chính**

- Vào: `{q: int ≥ 0, value: string ≤ 500}`; `{text: string ≤ 10000}`.
- Ra: `{ok: true}`; `answers` JSON cập nhật từng key; header save-state. — ✅ [S7] `packages/api/src/contracts.ts:2732-2741`

**(h) Truy vết test**

- Unit: PATCH xen kẽ nhiều câu giữ đúng giá trị — `apps/server/src/routes/student-quiz.test.ts:794-825`; out-of-bound 400 — `:1260-1293`; ký tự đặc biệt — `:1294-1337`. — ✅
- E2E: autosave sống qua reload — `apps/e2e/specs/student-quiz-take-review.spec.ts:481-615`; essay đếm từ + sống qua reload — `:950-1015`; tfng markerless — `:1016-1082`. — ✅
