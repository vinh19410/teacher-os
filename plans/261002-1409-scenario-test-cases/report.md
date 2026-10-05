# Scenario Report: teacher-os — test case toàn dự án

Sinh bởi `ak:scenario` (one-shot) ngày 2026-10-02. Nguồn đọc: `apps/server/src/routes/student.ts` (quiz attempt lifecycle), `packages/api/src/lib/grade-quiz.ts`, `packages/api/src/lib/infer-question-types.ts`, `packages/api/src/lib/word-count.ts`, `packages/api/src/contracts.ts` (QUIZ_ANSWER_VALUE_MAX=500, QUIZ_ESSAY_MAX=10_000, WRITING_MIN_WORDS chỉ cảnh báo client), `packages/auth` (role-by-origin), `packages/infra` (topology), kế hoạch #305 (speaking media upload, chưa implement).

Trọng tâm: quiz attempt lifecycle (start/snapshot → autosave → submit → review) vì đây là vùng mới nhất (#283, #303, #304, #308) và chứa các invariant không giao dịch (D1 không có transaction).

## Dimensions

**Phân tích:** User Types, Input Extremes, Timing, Scale, State Transitions, Error Cascades, Authorization, Data Integrity, Integration, Business Logic.

**Bỏ qua (kèm giả định):**
- **Environment** — SPA auth-gated, không có mặt bằng no-JS/SSR; `startedAt` lưu UTC. Giả định này gãy nếu thêm SSR/mobile-native → khi đó phải mở lại chiều này.
- **Compliance** — single-teacher org, chưa có surface GDPR/retention/audit. Lưu ý: essay học viên và invoice chứa PII; thêm multi-tenant thì chiều này trở thành bắt buộc (bỏ qua theo giả định này chính là một scenario tương lai).

## Bảng scenario

| # | Dimension | Kịch bản | Mức | Hành vi mong đợi (invariant) | Test target |
|---|-----------|----------|-----|-------------------------------|-------------|
| A1 | Authorization | Student A gọi PATCH `/attempts/:id/answer` với attemptId của student B (cùng org) | Critical | 404 — ownership predicate `orgId+studentId` (IDOR guard RT#4) | server: `student-quiz.test.ts` mở rộng |
| A2 | Authorization | attemptId thuộc org khác (đoán UUID) | Critical | 404 — mọi predicate đều kèm `orgId` | server: `student-quiz.test.ts` |
| A3 | Authorization | Teacher session gọi API student portal (role mismatch cross-app) | High | Chặn đăng nhập/call theo role-by-origin | packages/auth test + e2e role-separation |
| A4 | Authorization | Session hết hạn giữa lúc autosave | High | 401 từ PATCH; client giữ draft local, sau login lại autosave tiếp | e2e quiz-take |
| A5 | Authorization | Request từ origin không nhận diện được | Medium | Least-privilege → role student, không được quyền teacher | packages/auth test |
| T1 | Timing | Double-click POST `/quiz/start` → 2 request đua nhau | High | Một insert 201, request thua re-read trả 200 **cùng attemptId** (unique-race backstop) | server: `student-quiz.test.ts` |
| T2 | Timing | PATCH answer đang bay khi POST `/submit` thắng CAS | High | PATCH trả 409, không corrupt counts đã freeze từ snapshot | server unit + integration |
| T3 | Timing | Double submit (2 POST `/submit`) | High | Thua CAS → trả counts từ data đã freeze, idempotent, không chấm 2 lần | server: `student-quiz.test.ts` |
| T4 | Timing | `db.batch` hỏng sau khi flip status → `submittedAt` thiếu | High | Submit lại re-stamp idempotent (tự chữa theo thiết kế RT#5) | server test |
| T5 | Timing | 2 tab mở cùng attempt, autosave 2 câu khác nhau song song | High | `json_set` atomic từng câu — cả 2 câu đều sống, không read-modify-write mất chữ | server test + e2e |
| T6 | Timing | Mất mạng gián đoạn → autosave retry liên tục (retry storm) | Medium | PATCH idempotent, value cuối cùng nhất quán, không stack duplicate | web/student unit (autosave hook) |
| I1 | Input Extremes | Answer value 501 ký tự | Medium | 400 `invalid body` (QUIZ_ANSWER_VALUE_MAX=500) | server contract test |
| I2 | Input Extremes | Essay đúng 10.000 vs 10.001 ký tự | Medium | 10.000 → 200; 10.001 → 400 (QUIZ_ESSAY_MAX) | server test essay route |
| I3 | Input Extremes | `q` = -1, 3.5, hoặc ≥ snapshot length | Medium | Zod 400 với -1/3.5; range-check 400 với index ngoài đề (dựa snapshot length server-side) | server test |
| I4 | Input Extremes | Value chứa `"`, `\`, xuống dòng | High | `json_quote` escape đúng — answers JSON không corrupt, đọc lại nguyên vẹn | server test (round-trip) |
| I5 | Input Extremes | Grader alt: `"true / yes"` (space-slash-space) vs giá trị thật có slash `"24/7"` | High | Tách alt chỉ khi đúng `" / "`; slash không space là một phần giá trị, không tách | unit: `grade-quiz.test.ts` |
| I6 | Input Extremes | Đáp án tiếng Việt compose NFC vs NFD (tổ hợp dấu) | Medium | Pin hành vi hiện tại: normalize không canonicalize → verdict `wrong`; quyết định có thêm `normalize("NFC")` hay không | unit: `grade-quiz.test.ts` (pin decision) |
| I7 | Input Extremes | Word count với emoji, CJK, tab/khoảng trắng dư | Low | `countWords` = trim + split whitespace; emoji/CJK tính theo whitespace chunk — pin con số | unit: `word-count.test.ts` |
| S1 | Scale | Đề 100+ câu, snapshot JSON lớn | Medium | start/autosave/submit/review hoạt động, navigator render đủ, không timeout | e2e + server test dữ liệu lớn |
| S2 | Scale | Body essay > 48KB (paste khối lượng lớn) | Medium | quizWriteGuard từ chối trước khi chạm DB | server test |
| S3 | Scale | Lớp 0 học viên / assignment không target | Low | Kernel/reporting trả rỗng sạch, dashboard không crash | server + web test |
| ST1 | State Transitions | Teacher sửa prompt **sau khi** student đã start | Critical | Đề render + chấm điểm đều từ `questionsSnapshot` — live prompt không bao giờ được consult (RT#3) | server test: sửa prompt giữa attempt |
| ST2 | State Transitions | Đóng tab giữa chừng, mở lại | High | start trả lại cùng attemptId + answers đã autosave (idempotent resume) | e2e quiz-take |
| ST3 | State Transitions | Enrollment bị thu hồi giữa lúc làm bài | High | Pin hành vi: PATCH answer chỉ check ownership attempt, không check enrollment → vẫn save được. Xác nhận đây là chủ đích hay lỗ hổng | server test + quyết định sản phẩm |
| ST4 | State Transitions | Submit đề Writing với essay rỗng / dưới target từ | Medium | Submit thành công — WRITING_MIN_WORDS chỉ cảnh báo client, không chặn (user chốt #304) | server + student test |
| ST5 | State Transitions | Reject invitation sau khi đã accept | Medium | Idempotent hoặc 409 rõ ràng, không để enrollment half-state | server: enrollment test |
| E1 | Error Cascades | Resend outage / MAILER_IMPL=log lúc verify email | High | Lỗi mail hiện nay bị nuốt lặng lẽ — cần surface (log/alert) và test fallback log impl không crash flow đăng ký | packages/auth mail test |
| E2 | Error Cascades | `questionsSnapshot` JSON hỏng (edit tay/legacy) | Medium | `parseQuizQuestions` fail có thông điệp rõ, phân biệt 400/500 — không treo attempt vô hạn | server test |
| E3 | Error Cascades | (#305, chưa implement) Upload audio R2 fail giữa chừng | High | Không để orphan media record / attempt kẹt trạng thái; retry được | test phase mới #305 |
| D1 | Data Integrity | Answers key bị corrupt thành `"3.0"` thay vì `"3"` | High | `String(q)` bind TEXT — regression pin (đã có comment trong code, từng là bug thật) | server test: q number param |
| D2 | Data Integrity | Insert thủ công attempt thứ 2 cùng (assignmentId, studentId) | Medium | Unique constraint chặn; route re-read và resume | server test |
| D3 | Data Integrity | Teacher xóa assignment/prompt sau khi học viên đã submit | High | Review vẫn đọc được từ snapshot; hành vi xóa (cascade hay keep) được pin | server test |
| G1 | Integration | Login Google từ student app với state stamp `app` sai lệch | High | Session không land cross-app; state stamp đúng app nguồn | packages/auth + e2e |
| G2 | Integration | Import syllabus Excel/CSV UTF-16 / UTF-8 BOM | Medium | Decode đúng, không mojibake title module/lesson | web import test |
| G3 | Integration | e2e chạy libsql shim, production chạy D1 | Medium | `json_set`/`json_quote`/string-concat hành vi giống nhau 2 engine | e2e covered bằng chính suite quiz |
| B1 | Business Logic | Speaking prompt bật "ready" khi thiếu audioName | High | 400 theo contract (`contracts.ts` ready bắt buộc audio) | server: assignments/tests test |
| B2 | Business Logic | Học viên start lại bài đã submit (retake) | High | 409 `attempt already submitted` — không retake v1 | server test |
| B3 | Business Logic | Đề TF/NG xen kẽ: TRUE/FALSE … YES/NO … NOT GIVEN liền nhau | High | Run flush đúng ranh giới khi đổi họ; câu hai họ không lẫn `tfng`/`ynng` (logic mới #303) | unit: `infer-question-types.test.ts` |
| B4 | Business Logic | NOT GIVEN đơn lẻ (không có TRUE/FALSE quanh); câu có opts/pin/marker `____` | Medium | Run NEUTRAL-only → `tfng`; câu có opts/pin/marker không được infer | unit: `infer-question-types.test.ts` |
| B5 | Business Logic | Invoice số tiền 0/âm, thanh toán một phần | Medium | Validation chặn âm; partial payment hiển thị đúng số dư | server kernel + web tuition test |
| U1 | User Types | Học viên chưa onboarding gọi thẳng POST `/quiz/start` | Medium | studentCtx xử lý thiếu record student rõ ràng (từ chối hoặc dẫn onboarding), không 500 | server test |
| U2 | User Types | Tài khoản Google OAuth chưa verify email nhận invitation | Medium | Chuỗi verify-mail → accept hoạt động đầy đủ, không kẹt ở bước nào | e2e invitation |

## Summary

- **Critical: 3** (A1, A2, ST1)
- **High: 19**
- **Medium: 18**
- **Low: 2**
- **Total: 42 scenario** across 10 dimensions

## Ưu tiên chuyển thành test

1. **Critical trước**: IDOR (A1/A2) và snapshot freeze (ST1) — đúng nghĩa regress-one-line-break-production.
2. **Nhóm Timing trên quiz attempt** (T1–T5) — vùng D1-không-transaction, đã có thiết kế xử lý nhưng cần test pin từng nhánh.
3. **Grader/infer** (I5, B3, B4) — pure function, rẻ nhất để test, phủ #303.
4. **E1 (mailer nuốt lỗi)** — đã từng gây khó hiểu ở local; sửa surface lỗi rồi test.
