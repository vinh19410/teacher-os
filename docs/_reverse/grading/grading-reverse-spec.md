---
type: reverse-srs
feature: grading
status: draft
updated: 2026-11-12
confidence_summary: "✅99 🔵7 🟡125 (trong spec; toàn bộ 17 file: ✅99 🔵7 🟡126 — đếm theo luật batch sau audit) — OQ 9"
links:
  - reverse-sources.md
  - reverse-gaps.md
  - _evidence.md
  - srs/grading-reverse-flows.md
  - srs/grading-reverse-states.md
  - srs/grading-reverse-erd.md
  - usecases/grading-reverse-usecase-index.md
---

# SRS đảo ngược — Tính năng Chấm bài (Grading) & Nháp chấm AI

> Tài liệu tạo bằng cách đọc tĩnh source code `teacher-os` (git `develop`, commit `d6c0f6b5`).
> Nhãn: ✅ chắc chắn (code/test khẳng định rõ: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## 0. Truy vết nguồn

### 0.1 Bối cảnh đảo ngược

- Feature: **grading** — giáo viên/nhân sự chấm bài Writing & Speaking (queue → mở bài → chấm 4 tiêu chí IELTS → chốt trả học viên), kèm trục **nháp chấm AI** (TOS-30/32/33): nộp bài tự kích hoạt grader AI tạo bản nháp ẩn với học viên, giáo viên rà soát rồi mới "Chốt trả bài".
- Repo: pnpm monorepo — `apps/server` (Cloudflare Workers + Hono), `apps/web` (TanStack Router SPA), `packages/db` (Drizzle + D1), `packages/api` (Zod contracts), `apps/student` (portal học viên, đối chiếu).
- Đọc tĩnh 100%, không chạy test/server; CODE = PROOF. Mọi câu chữ người dùng trích NGUYÊN VĂN.

### 0.2 Bảng truy vết S-id

| S-id | Nguồn | Vai trong tài liệu này |
|---|---|---|
| [S1] | apps/server/src/routes/grading.ts | Route chính /grading (queue, grade, draft, retry, media, annotation, demo) |
| [S2] | apps/server/src/lib/ai-grading/run-grading.ts | Pipeline AI: draft, reserve/settle Credit, CAS, retry vòng grader |
| [S3] | apps/server/src/lib/ai-grading/release-stale.ts | Sweep dọn lượt chấm treo + hoàn Credit |
| [S4] | apps/server/src/lib/ai-grading/grader.ts | Interface grader + roundBandStep |
| [S5] | apps/server/src/lib/ai-grading/workers-ai-grader.ts | Grader Workers AI: model, prompt, parse JSON |
| [S6] | apps/server/src/lib/ai-grading/fake-grader.ts | Grader giả cho e2e |
| [S7] | apps/server/src/lib/ai-gate.ts | Gate biến môi trường AI (fail-closed) |
| [S8] | apps/server/src/lib/credits/wallet.ts | Ví Credit: reserve/settle/release, chấm nhanh |
| [S9] | apps/server/src/routes/student.ts | Điểm nộp bài kích hoạt scheduleAiGrading |
| [S10] | apps/server/src/routes/kernel.ts | Mount route /grading |
| [S11] | apps/server/src/routes/credits.ts | Ví Credit gọi sweep |
| [S12] | apps/server/src/routes/dashboard-reminders.ts | Nhắc việc "bài chờ chấm" |
| [S13] | apps/server/src/lib/notifications/templates.ts | Thông báo "Bài đã được chấm" |
| [S14] | apps/server/src/lib/quiz-grade.ts | Map grade → view + band tổng |
| [S15] | apps/server/src/app.ts | Deps (runInBackground, getAiGrader) |
| [S16] | apps/server/src/index.ts | Boot waitUntil + AI providers |
| [S17] | packages/api/src/contracts.ts | Zod contract, hằng số, thông điệp lỗi E-001…E-011 |
| [S18] | packages/api/src/lib/ielts-band.ts | Tiêu chí IELTS, band 0–9/0.5, band tổng |
| [S19] | packages/api/src/lib/essay-annotations.ts | Span highlight, overlap, render |
| [S20] | packages/api/src/lib/essay-plain.ts | Plain text + bản đồ offset (#382) |
| [S21] | packages/auth/src/role.ts | Allowlist vai canPublishGrade/canReviewGrade |
| [S22] | packages/db/src/schema/quiz-attempt.ts | Bài nộp: essay, media, grade |
| [S23] | packages/db/src/schema/ai-grading-draft.ts | Bản nháp AI + state machine |
| [S24] | packages/db/src/schema/quiz-attempt-annotation.ts | Highlight nhận xét |
| [S25] | packages/db/src/schema/comment-bank.ts | Ngân hàng nhận xét dùng chung |
| [S26] | packages/db/src/schema/credit-wallet.ts | Ví Credit + sổ cái |
| [S27] | apps/web/src/routes/_auth/grading/index.tsx | Màn hàng chờ chấm |
| [S28] | apps/web/src/routes/_auth/grading/$attemptId.tsx | Màn chấm 1 bài nộp |
| [S29] | apps/web/src/lib/repos/grading.ts | Repo HTTP client grading |
| [S30] | apps/web/src/lib/features.ts | Flag web VITE_AI_ENABLED |
| [S31] | apps/web/src/components/grading/ai-draft-panel.tsx | Panel "Gợi ý từ AI" |
| [S32] | apps/web/src/components/grading/grade-form.tsx | Form 4 tiêu chí + Chốt trả bài |
| [S33] | apps/web/src/components/grading/band-slider.tsx | Slider band 0–9 bước 0.5 |
| [S34] | apps/web/src/components/grading/submission-view.tsx | Xem bài làm học viên |
| [S35] | apps/server/src/routes/grading.test.ts | Unit test route grading |
| [S36] | apps/server/src/lib/ai-grading/run-grading.test.ts | Unit test pipeline AI |
| [S37] | apps/e2e/specs/ai-grading-ac-001.spec.ts | E2E nháp AI ẩn với học viên |
| [S38] | apps/e2e/specs/ai-grading-ac-003.spec.ts | E2E chấm nhanh 30 lượt/tháng |
| [S39] | apps/e2e/specs/ai-grading-ac-004.spec.ts | E2E vai trò + xung đột E-011 |
| [S40] | apps/e2e/specs/teacher-grade-submission.spec.ts | E2E chấm tay Writing/Speaking/practice |
| [S41] | apps/web/src/routes/_auth/grading/index.test.tsx | Test màn hàng chờ |
| [S42] | apps/web/src/components/grading/ai-draft-panel.test.tsx | Test panel AI |
| [S43] | apps/web/src/components/grading/grade-form.test.tsx | Test form chấm |
| [S44] | apps/e2e/src/boot.ts | Boot API test inject fake grader |
| [S45] | apps/e2e/playwright.config.ts | Bật flag AI cho e2e |
| [S46] | packages/infra/alchemy.run.ts | Cấu hình hạ tầng AI flag |
| [S47] | packages/env/src/web.ts | Khai báo biến web |
| [S48] | apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx | Portal học viên: nhãn chờ chấm |

Bảng chi tiết (loại tệp, range đọc, độ tin cậy, encoding, ghi chú): xem `reverse-sources.md`.

- Bằng chứng gom nhóm theo chủ đề: xem `_evidence.md`.
- Tài liệu hiện hữu (existing doc): không có tài liệu SRS/BA hiện hữu cho feature này trong repo (tìm trong `docs/` không thấy spec chấm bài; hằng số trong code trỏ tới `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` nhưng đường dẫn này KHÔNG tồn tại — xem Gap G-1 trong `reverse-gaps.md`). Không có Mục 0.3.

## 1. Scope (Phạm vi)

**Trong phạm vi (đọc được từ code):**

- Hàng chờ chấm: danh sách bài nộp Writing/Speaking đã nộp (assignment + luyện tập), lọc/nhóm/đếm, nhãn trạng thái AI. [S1]
- Mở một bài nộp: xem bài làm (essay, media Speaking, phần trắc nghiệm chấm tự động của đề hybrid), chấm 4 tiêu chí IELTS, nhận xét ≤ 5000 ký tự. [S1][S27][S28][S32]
- Chốt trả bài: lưu điểm chính thức vào bài nộp, học viên thấy ngay, gửi thông báo. [S1][S13][S22]
- Trục nháp AI: nộp bài → pipeline AI (reserve Credit → gọi LLM tối đa 3 lượt → CAS bản nháp → settle), bản nháp ẩn với học viên, rà soát, chốt; chấm lại AI; chấm nhanh Writing 30 lượt/tháng khi hết Credit. [S2][S8][S9][S23]
- Đồng bộ & dọn dẹp: sweep hoàn Credit các lượt treo, chống xung đột 2 nhân sự cùng sửa (version + 409). [S3]
- Highlight nhận xét trên bài viết (annotation) với note từng đoạn. [S1][S19][S24]
- Bài nộp mẫu dùng thử (demo sample) trên màn hàng chờ. [S1]
- Vai trò: GV đứng lớp / chủ trung tâm / quản trị / trợ giảng — ai được chốt, ai chỉ được lưu nháp. [S21]

**Ngoài phạm vi (không nằm trong feature này, chỉ đối chiếu):**

- Sinh đề, giao bài, học viên làm bài & nộp bài (feature assignments/quizzes) — chỉ lấy đúng điểm nộp bài kích hoạt AI. [S9]
- Cổng học viên xem điểm sau khi chốt (feature portal học viên). [S48]
- Bán/mua gói Credit, hoá đơn (feature tài chính). [S8]
- Chuyển giọng nói thành văn bản (STT) cho Speaking — code có chỗ cắm nhưng CHƯA cắm bộ chuyển đổi thật (Gap G-2). [S2]

## 2. Actors (Chủ thể)

| Vai | Tên nghiệp vụ | Quyền trên chấm bài (đọc từ code) | Nguồn |
|---|---|---|---|
| Teacher / Owner / Admin / Class teacher | Giáo viên độc lập / Chủ trung tâm / Quản trị viên / Giáo viên đứng lớp | "Chốt trả bài" (publish) + "Thử chấm lại AI" + tạo/xoá bài nộp mẫu | [S21] `GRADING_PUBLISH_ROLES` |
| Các vai trên + TA | Trợ giảng | Thêm "Lưu bản nháp" (rà soát nháp AI); KHÔNG chốt, KHÔNG chấm lại AI | [S21] `GRADING_REVIEW_ROLES` |
| Staff (mọi vai trên) | Nhân sự trung tâm | Xem hàng chờ + mở bài nộp + xem nháp AI (GET) | [S1] các GET không gate thêm vai |
| Học viên | Học viên | KHÔNG thấy nháp AI; chỉ thấy điểm sau khi chốt; nhận thông báo "Bài đã được chấm" | [S23] bình luận Bảng riêng; [S13] |
| Hệ thống | Pipeline chấm AI | Tạo nháp, giữ/hoàn Credit, tự dọn lượt treo | [S2][S3] actor = "system" [S2] L67 |

- 🟡 Actor "Giáo viên đứng lớp" là cách dịch nghiệp vụ của `class_teacher` — code chỉ định nghĩa mã vai; cách gọi thương mại nằm ở tooltip UI ("Chỉ Giáo viên đứng lớp được chốt trả bài" [S32] L26-27). OQ-01.

## 3. Functional Requirements (Yêu cầu chức năng)

Cột Nguồn: đường dẫn tệp:dòng (repo-relative). Cột Ưu tiên: 🟡 (code không nói — OQ-02).
Quy ước nhãn như đầu tài liệu.

### 3.1 Nhóm A — Hàng chờ chấm

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-01 | Hàng chờ chỉ gồm bài nộp ĐÃ NỘP của bài tập kỹ năng writing/speaking (kèm part) | ✅ | apps/server/src/routes/grading.ts:182-191 | 🟡 |
| FR-02 | Bài luyện tập (không gắn bài tập) cũng vào hàng chờ, hiển thị nhãn "Luyện tập" | ✅ | apps/server/src/routes/grading.ts:227-234, 305, 638 | 🟡 |
| FR-03 | Mỗi dòng hàng chờ có: học viên, lớp, kỹ năng, trạng thái chấm, trạng thái AI + chế độ nháp AI | ✅ | apps/server/src/routes/grading.ts:638-663; packages/api/src/contracts.ts:2647-2666 | 🟡 |
| FR-04 | Thứ tự hàng chờ: bài chưa chấm trước; trong nhóm đã chấm, bài nộp sau đứng trước (thời điểm nộp giảm dần, hòa thì mã bài giảm dần) | ✅ | apps/server/src/routes/grading.ts:133, 321-328 | 🟡 |
| FR-05 | Màn hàng chờ lọc theo từ khoá (q), chế độ nháp (mode), kỹ năng (skill), trạng thái (status) — lọc phía client | ✅ | apps/web/src/routes/_auth/grading/index.tsx:56-82 | 🟡 |
| FR-06 | Ô tìm kiếm chờ 300ms sau khi gõ mới áp dụng | ✅ | apps/web/src/routes/_auth/grading/index.tsx:193-204 | 🟡 |
| FR-07 | Bộ đếm nhóm tính cả bài chờ lẫn đã chấm, không phân biệt hoa/thường & dấu tiếng Việt | ✅ | apps/web/src/routes/_auth/grading/index.tsx:243-301 | 🟡 |
| FR-08 | Truy vấn hàng chờ giới hạn số nhánh lọc 500 dòng | ✅ | apps/server/src/routes/grading.ts:84 | 🟡 |
| FR-09 | Tiêu đề trang hiển thị chuỗi đếm: "N bài chờ chấm · M bài đã nộp" (kicker), kèm nút "Xóa bài nộp mẫu" khi đã có bài mẫu (nút tạo chỉ nằm ở trạng thái rỗng — FR-10) | ✅ | apps/web/src/routes/_auth/grading/index.tsx:335-352 | 🟡 |
| FR-10 | Khi hàng chờ trống: hiện trạng thái rỗng + nút "Tạo bài nộp mẫu dùng thử" | ✅ | apps/web/src/routes/_auth/grading/index.tsx:354-379 | 🟡 |
| FR-11 | Nhắc việc trên dashboard có mục "bài chờ chấm" với tổng count + tách writing/speaking | ✅ | apps/server/src/routes/dashboard-reminders.ts:263-266 | 🟡 |
| FR-12 | Lỗi tải hàng chờ hiển thị: "Không tải được hàng chờ chấm. Thử tải lại trang." | ✅ | apps/web/src/routes/_auth/grading/index.tsx:327 | 🟡 |

### 3.2 Nhóm B — Mở bài nộp để chấm

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-13 | GET một bài nộp trả: thông tin bài nộp + đề + (nếu có) bản nháp AI; mọi nhân sự staff đọc được | ✅ | apps/server/src/routes/grading.ts:946-968 | 🟡 |
| FR-14 | Bài chưa nộp mà gọi chấm/mở chấm → chặn 409 với mã NOT_SUBMITTED | ✅ | apps/server/src/routes/grading.ts:509, 665-679 | 🟡 |
| FR-15 | Kỹ năng không chấm được (không phải writing/speaking) → chặn 400 mã SKILL_NOT_GRADABLE | ✅ | apps/server/src/routes/grading.ts:661, 665-679; packages/api/src/lib/ielts-band.ts:20-25 | 🟡 |
| FR-16 | Đề của bài luyện tập đã bị xoá → chặn 400 (không còn nội dung để chấm) | ✅ | apps/server/src/routes/grading.ts:530-534 | 🟡 |
| FR-17 | Đề hybrid Writing: phần trắc nghiệm hiển thị "Phần trắc nghiệm (chấm tự động)" — giáo viên chỉ chấm phần essay | ✅ | apps/server/src/routes/grading.ts:641-646; apps/web/src/components/grading/submission-view.tsx:34-41 | 🟡 |
| FR-18 | Bài Speaking: phát trực tiếp bản ghi âm/hình qua endpoint media dạng blob; chỉ cho phép số ít kiểu nội dung đa phương tiện trong danh sách cho phép | ✅ | apps/server/src/routes/grading.ts:975-996; apps/web/src/lib/repos/grading.ts (fetch blob + allowlist Content-Type) | 🟡 |
| FR-19 | Thiết bị lưu media chưa sẵn sàng → lỗi 503 "media storage unavailable"; không thấy media → 404 | ✅ | apps/server/src/routes/grading.ts:980, 989, 993 | 🟡 |
| FR-20 | Essay render dạng văn bản thuần (đã bóc định dạng), ánh xạ offset văn bản thuần ↔ bản gốc để highlight đúng vị trí | ✅ | apps/web/src/components/grading/submission-view.tsx:8-10; packages/api/src/lib/essay-plain.ts:1-8 | 🟡 |
| FR-21 | Màn chấm báo lỗi tải theo từng trường hợp: "Không tìm thấy bài nộp này." (404), "Học viên chưa nộp bài này." (409), "Đề này được chấm tự động, không cần chấm tay." (400), "Không tải được bài nộp. Thử tải lại trang." (khác) | ✅ | apps/web/src/routes/_auth/grading/$attemptId.tsx:240-247 | 🟡 |

### 3.3 Nhóm C — Chốt trả bài (publish điểm)

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-22 | Chốt trả bài chỉ cho phép: teacher, owner, admin, class_teacher; trợ giảng bị chặn 403 mã GRADE_PUBLISH_FORBIDDEN | ✅ | apps/server/src/routes/grading.ts:1003-1008; packages/auth/src/role.ts:116-121, 136-138 | 🟡 |
| FR-23 | Điểm gồm ĐỦ 4 tiêu chí theo kỹ năng (writing: task/coherence/lexical/grammar; speaking: fluency/lexical/grammar/pronunciation), mỗi tiêu chí 0–9 bước 0.5 | ✅ | packages/api/src/contracts.ts:2459-2461, 2525-2540; packages/api/src/lib/ielts-band.ts:7-18, 129-136 | 🟡 |
| FR-24 | Nhận xét cho học viên tối đa 5000 ký tự; form hiển thị bộ đếm đã dùng/tối đa (vd "120/5000") | ✅ | packages/api/src/contracts.ts:2457; apps/web/src/components/grading/grade-form.tsx:107-121 | 🟡 |
| FR-25 | Chốt bài ghi điểm + nhận xét + thời điểm chấm vào bài nộp; học viên thấy ngay ở lần đọc sau | ✅ | packages/db/src/schema/quiz-attempt.ts:74-79, 29-31 | 🟡 |
| FR-26 | Chống xung đột: yêu cầu version (mặc định 1); UPDATE chỉ ăn khi trạng thái chưa "published" và đúng version; trượt → 409 mã E-selfomy-alignment-011 | ✅ | apps/server/src/routes/grading.ts:1065, 1076, 1094-1100; packages/api/src/contracts.ts:4234, 4243-4244 | 🟡 |
| FR-27 | Band tổng IELTS tự tính (trung bình 4 tiêu chí, làm tròn 0.5), KHÔNG lưu DB | ✅ | packages/api/src/lib/ielts-band.ts:143-147; apps/server/src/lib/quiz-grade.ts; packages/api/src/contracts.ts:2554-2562 | 🟡 |
| FR-28 | Khi bài có nháp AI: chốt bài đồng thời đưa nháp sang trạng thái "published" (so khớp trạng thái nguyên tử) | ✅ | apps/server/src/routes/grading.test.ts:2382-2435 (3 test CAS publish); apps/server/src/routes/grading.ts:1065-1110 | 🟡 |
| FR-29 | Sau chốt (trừ bài mẫu demo) gửi thông báo cho học viên: tiêu đề "Bài đã được chấm", nội dung "Bài "<tựa đề>" của bạn đã có điểm và nhận xét của giáo viên.", chống gửi trùng theo bài nộp | ✅ | apps/server/src/routes/grading.ts:1115-1130; apps/server/src/lib/notifications/templates.ts:111-127 | 🟡 |
| FR-30 | Đường dẫn mở thông báo: bài tập → trang bài làm của học viên; luyện tập → trang luyện tập | ✅ | apps/server/src/routes/grading.ts:1115-1130 | 🟡 |
| FR-31 | Bài nộp mẫu (tiền tố demo-attempt:) không gửi thông báo, không đụng tới ví Credit | ✅ | apps/server/src/routes/grading.ts:88, 1115-1130 | 🟡 |
| FR-32 | UI: trợ giảng thấy nút chốt bị khoá kèm dòng "Chỉ Giáo viên đứng lớp được chốt trả bài"; lỗi 403 cũng map về cùng câu này | ✅ | apps/web/src/components/grading/grade-form.tsx:26-27, 160-176; apps/web/src/routes/_auth/grading/$attemptId.tsx:269 | 🟡 |
| FR-33 | Lưu thành công hiện "Đã lưu · <thời điểm>"; xung đột E-011 hiện hộp thoại với nút "Tải lại bản mới nhất", giữ nguyên edits đang soạn | ✅ | apps/web/src/components/grading/grade-form.tsx:133-137; apps/web/src/routes/_auth/grading/$attemptId.tsx:434-463, 467-503 | 🟡 |

### 3.4 Nhóm D — Nháp chấm AI tự động (sau nộp bài)

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-34 | Học viên nộp bài writing/speaking (có phần chấm AI được) → kích hoạt pipeline chấm AI chạy nền, không chặn phản hồi nộp bài | ✅ | apps/server/src/routes/student.ts:1954-1961 (void scheduleAiGrading tại L1961); apps/server/src/index.ts:93, 174 (waitUntil) | 🟡 |
| FR-35 | Cổng AI fail-closed: chỉ khi biến môi trường AI bật đúng chuỗi "true" hệ thống mới có grader; không có grader → pipeline thoát NGAY, không tạo bản nháp | ✅ | apps/server/src/lib/ai-gate.ts:18, 22; apps/server/src/lib/ai-grading/run-grading.ts:329-337 | 🟡 |
| FR-36 | Tạo bản nháp ở trạng thái "ai_processing"; nếu bài nộp đã có nháp thì bỏ qua (không ghi đè) | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:344-356; packages/db/src/schema/ai-grading-draft.ts:29-38 | 🟡 |
| FR-37 | Speaking không có lời thoại chuyển văn bản → nháp chuyển "manual_pending" kèm mã lỗi AI_GRADING_NO_TRANSCRIPT, KHÔNG giữ Credit | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:371-383; packages/api/src/contracts.ts:4196-4209 | 🟡 |
| FR-38 | Essay hybrid rỗng (chỉ có trắc nghiệm) → nháp "manual_pending" không mã lỗi, không gọi LLM, không tốn Credit | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:386-395 | 🟡 |
| FR-39 | Giữ Credit TRƯỚC khi chấm: Writing 1 Credit, Speaking 2 Credit; ví tổ chức mới nhận 30 Credit dùng thử | ✅ | packages/api/src/contracts.ts:4117, 4186-4189; apps/server/src/lib/credits/wallet.ts:88-95, 324-346 | 🟡 |
| FR-40 | Hết khả dụng Credit: nếu là Writing và org đang có gói tháng active/grace_period → giành 1 lượt "chấm nhanh" 0 Credit, tối đa 30 lượt/tháng dương lịch theo giờ Việt Nam; thắng → nháp ghi chế độ "quick", chi phí 0 | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:404-439; apps/server/src/lib/credits/wallet.ts:163-202; packages/api/src/contracts.ts:2485, 4192 | 🟡 |
| FR-41 | Không giành được lượt chấm nhanh (hết 30) → nháp lỗi E-selfomy-alignment-002; không phải Writing → lỗi E-selfomy-alignment-001 | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:404-439; packages/api/src/contracts.ts:4251-4260 | 🟡 |
| FR-42 | Gọi LLM tối đa 3 lượt, chờ giữa các lượt 1s rồi 2s, mỗi lượt tối đa 20s (hoặc phần còn lại của ngân sách 30s, tối thiểu 1s) | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:47, 55, 58, 464, 473-515 | 🟡 |
| FR-43 | Model LLM: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"; prompt tiếng Việt, yêu cầu trả JSON thuần; chế độ quick yêu cầu nhận xét 1–2 câu | ✅ | apps/server/src/lib/ai-grading/workers-ai-grader.ts:29-63 | 🟡 |
| FR-44 | Kết quả AI được kiểm: đủ 4 tiêu chí, band làm tròn 0.5 trong [0,9]; nhận xét cắt còn 5000 ký tự | ✅ | apps/server/src/lib/ai-grading/grader.ts:52-56; apps/server/src/lib/ai-grading/workers-ai-grader.ts:164; apps/server/src/lib/ai-grading/run-grading.ts:473-515 | 🟡 |
| FR-45 | Ghi điểm nháp theo thứ tự "nháp trước, ví sau": CAS chuyển nháp sang "ai_drafted" TRƯỚC, thắng mới chốt trừ Credit; thua CAS/rollback → hoàn/revert Credit | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:530-551; packages/db/src/schema/ai-grading-draft.ts:7-23 | 🟡 |
| FR-46 | AI thất bại (hết 3 lượt TIMEOUT/FAILED) → nháp "manual_pending" + mã lỗi tương ứng, hoàn (hoặc revert chấm nhanh) Credit đầy đủ | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:243-275, 517-528 | 🟡 |
| FR-47 | Chỉ TIMEOUT và FAILED là lỗi được phép "thử chấm lại AI"; DISABLED/NO_TRANSCRIPT/hết Credit không | ✅ | packages/api/src/contracts.ts:4219-4230 | 🟡 |
| FR-48 | Bản nháp AI nằm ở bảng riêng, KHÔNG xuất hiện trong bất kỳ API học viên nào (ẩn theo cấu trúc dữ liệu) | 🔵 | packages/db/src/schema/ai-grading-draft.ts:7-23; packages/api/src/contracts.ts:2493-2510; apps/server/src/routes/grading.test.ts:2136; apps/e2e/specs/ai-grading-ac-001.spec.ts:163-180 | 🟡 |
| FR-49 | Bản nháp quick hiển thị nhãn "Bản nháp chấm nhanh" | ✅ | apps/web/src/components/grading/ai-draft-panel.tsx:58 | 🟡 |
| FR-50 | Học viên nộp xong chỉ thấy "Đã nộp — Đang chờ giáo viên chấm" | ✅ | apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:144; apps/e2e/specs/ai-grading-ac-001.spec.ts:156-158 | 🟡 |

### 3.5 Nhóm E — Rà soát nháp & chấm lại AI

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-51 | Panel "Gợi ý từ AI" hiện 4 điểm + nhận xét AI + huy hiệu trạng thái: "AI đang chấm…" / "AI đã chấm nháp" / "Đang rà soát" / "Chờ chấm tay" / "Đã trả kết quả" | ✅ | apps/web/src/components/grading/ai-draft-panel.tsx:23-32 | 🟡 |
| FR-52 | Khi nháp đang "ai_processing", màn chấm tự nạp lại mỗi 1 giây cho tới khi rời trạng thái | ✅ | apps/web/src/routes/_auth/grading/$attemptId.tsx:75-77 | 🟡 |
| FR-53 | Lưu bản nháp (PATCH): cho phép cả trợ giảng; chỉ khi nháp ở một trong "ai_drafted" / "teacher_reviewing" / "manual_pending" | ✅ | apps/server/src/routes/grading.ts:421-425, 1142-1221; packages/auth/src/role.ts:122, 140-142 | 🟡 |
| FR-54 | PATCH bản nháp lưu điểm rà soát + nhận xét rà soát, đưa nháp sang "teacher_reviewing", chống xung đột theo version + chưa "published" | ✅ | apps/server/src/routes/grading.ts:1179-1208 | 🟡 |
| FR-55 | Nháp không tồn tại → 404 DRAFT_NOT_FOUND; không ở trạng thái sửa được → 409 DRAFT_NOT_EDITABLE (kèm 409 E-011 nếu trượt version) | ✅ | apps/server/src/routes/grading.ts:1177, 1179-1190 | 🟡 |
| FR-56 | "Thử chấm lại AI": chỉ vai được publish; chỉ khi nháp đang "manual_pending" và mã lỗi thuộc nhóm được phép; CAS "manual_pending" → "ai_processing", tăng số lượt thử, xoá mã lỗi, đặt mốc thời gian mới | ✅ | apps/server/src/routes/grading.ts:1235-1334 (403: 1238-1243; 409: 1264-1278; CAS: 1292-1306) | 🟡 |
| FR-57 | Trước khi chấm lại AI, hệ thống dọn các lần giữ Credit chưa kết thúc của chính bài nộp đó (theo số lượt thử) | ✅ | apps/server/src/routes/grading.ts:1285-1291; apps/server/src/lib/ai-grading/release-stale.ts:180-230 | 🟡 |
| FR-58 | Lượt chấm lại dùng khoá idempotent riêng theo số lượt thử: "ai_grading:<mã bài>:r<n>:<thao tác>" | 🔵 | apps/server/src/lib/credits/wallet.ts:71-72; apps/server/src/lib/ai-grading/release-stale.ts:180-230; apps/server/src/routes/grading.ts:1292-1306 | 🟡 |
| FR-59 | Trợ giảng bị chặn chấm lại AI (403 AI_RETRY_FORBIDDEN); nút bị khoá kèm dòng "Chỉ Giáo viên đứng lớp được chấm lại AI" | ✅ | apps/server/src/routes/grading.ts:1238-1243; apps/web/src/components/grading/ai-draft-panel.tsx:99-100 | 🟡 |
| FR-60 | Lỗi AI quá hạn (E-004) hiển thị khối lỗi + nút "Thử chấm lại AI" (đổi thành "Đang chấm lại AI…" khi đang chạy) | ✅ | apps/web/src/components/grading/ai-draft-panel.tsx:133-142, 248-284 | 🟡 |
| FR-61 | Lỗi hết Credit/hạn mức (E-001/E-002) mở hộp thoại "Nạp thêm Credit AI" với nội dung chỉ dẫn liên hệ Chủ trung tâm; vẫn nhấn mạnh chấm tay bình thường | ✅ | apps/web/src/components/grading/ai-draft-panel.tsx:133-142, 224-247 | 🟡 |
| FR-62 | Nháp lỗi hiển thị câu theo mã: TIMEOUT "AI quá hạn — bạn vẫn chấm tay bình thường.", FAILED "AI chấm lỗi — bạn vẫn chấm tay bình thường.", DISABLED "Chấm AI chưa cấu hình cho tổ chức.", NO_TRANSCRIPT "Chưa có lời thoại chuyển văn bản (Speaking).", khác "AI chấm lỗi." | ✅ | apps/web/src/components/grading/ai-draft-panel.tsx:73-92 | 🟡 |
| FR-63 | Form chấm điền sẵn điểm nháp khi chưa có điểm rà soát: ưu tiên điểm đã publish > điểm rà soát > điểm AI | ✅ | apps/web/src/routes/_auth/grading/$attemptId.tsx:274-286 | 🟡 |

### 3.6 Nhóm F — Đồng bộ, dọn dẹp, chống treo

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-64 | Sweep "lười": chạy khi đọc hàng chờ, đọc 1 bài nộp, hoặc đọc ví Credit; ngưỡng treo 60 giây, mỗi lần tối đa 20 dòng | ✅ | apps/server/src/lib/ai-grading/release-stale.ts:14, 17, 38-39; apps/server/src/routes/grading.ts:726, 951; apps/server/src/routes/credits.ts:32 | 🟡 |
| FR-65 | Sweep xử lý 3 nhóm: (1) nháp treo ở "ai_processing" quá ngưỡng → CAS về "manual_pending" mã TIMEOUT + hoàn Credit; (2) nháp đã rời "ai_processing" nhưng còn phần giữ chưa chốt/hoàn hết → hoàn phần còn lại; (3) lượt chấm nhanh đã ghi nhưng chưa hoàn khi AI lỗi → hoàn lượt | ✅ | apps/server/src/lib/ai-grading/release-stale.ts:41-173 | 🟡 |
| FR-66 | Hoàn Credit theo "occasion" (mỗi lượt chấm/retry một occasion), idempotent theo khoá, không đụng occasion đã kết thúc | ✅ | apps/server/src/lib/ai-grading/release-stale.ts:180-230 | 🟡 |
| FR-67 | Bất biến kiểm bằng test: ngưỡng sweep 60s LỚN HƠN ngân sách chấm AI 30s (không bao giờ giết lượt đang chạy) | ✅ | apps/server/src/lib/ai-grading/run-grading.test.ts:954 | 🟡 |

### 3.7 Nhóm G — Highlight nhận xét (annotation)

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-68 | Chỉ bài Writing được highlight; kỹ năng khác → 400 SKILL_NOT_ANNOTATABLE | ✅ | apps/server/src/routes/grading.ts:1342-1358 | 🟡 |
| FR-69 | Đoạn highlight hợp lệ: kết thúc > bắt đầu, dài ≤ 1000 ký tự, không toàn khoảng trắng; hệ thống tự căn về ranh giới từ | ✅ | apps/server/src/routes/grading.ts:1361-1373; packages/api/src/lib/essay-annotations.ts:21-62; packages/api/src/contracts.ts:2580-2587 | 🟡 |
| FR-70 | Tối đa 200 highlight mỗi bài nộp; vượt → 400 TOO_MANY_ANNOTATIONS; đoạn chồng nhau → 409 OVERLAP | ✅ | apps/server/src/routes/grading.ts:1376-1387; packages/api/src/contracts.ts:2569 | 🟡 |
| FR-71 | Note của highlight ≤ 1000 ký tự; sửa note (PATCH) và xoá highlight (DELETE) | ✅ | packages/api/src/contracts.ts:2567; apps/server/src/routes/grading.ts:1412-1468 | 🟡 |
| FR-72 | Offset tính trên bản essay gốc (UTF-16), essay coi như "đóng băng" sau nộp; khi render, annotation sai/overlap bị bỏ qua | ✅ | packages/db/src/schema/quiz-attempt-annotation.ts:6-27; packages/api/src/lib/essay-annotations.ts:76-123 | 🟡 |
| FR-73 | Lỗi highlight ở UI: "Đoạn này trùng với highlight khác." (OVERLAP), "Đã đạt tối đa 200 highlight." (TOO_MANY), "Highlight không còn tồn tại — tải lại trang." (404) | ✅ | apps/web/src/routes/_auth/grading/$attemptId.tsx:47-52 | 🟡 |

### 3.8 Nhóm H — Bài nộp mẫu (demo)

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-74 | Tạo bài nộp mẫu: chỉ vai được publish; sinh bài writing mẫu với điểm cố định task 6.5 / coherence 6.5 / lexical 6.0 / grammar 6.0; trả 201 | ✅ | apps/server/src/routes/grading.ts:732-746, 880 | 🟡 |
| FR-75 | Xoá bài nộp mẫu theo tổ chức (DELETE) | ✅ | apps/server/src/routes/grading.ts:883-944 | 🟡 |
| FR-76 | Bài mẫu có tiền tố ID "demo-attempt:" để mọi luồng (thông báo, ví) nhận diện và bỏ qua | ✅ | apps/server/src/routes/grading.ts:88 | 🟡 |

### 3.9 Nhóm I — Cờ tính năng AI trên web

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-77 | Badge/huy hiệu AI trên hàng chờ chỉ hiện khi cờ web AI bật (chuỗi "true") | ✅ | apps/web/src/lib/features.ts:9; apps/web/src/routes/_auth/grading/index.tsx:604-611 | 🟡 |
| FR-78 | E2E bật cờ AI cho môi trường test; hạ tầng mặc định TẮT khi không cấu hình | ✅ | apps/e2e/playwright.config.ts:95; packages/infra/alchemy.run.ts:121-123, 214, 306; packages/env/src/web.ts:8 | 🟡 |

### 3.10 Nhóm J — Ngân hàng nhận xét dùng chung (liên quan nhẹ)

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| FR-79 | Hệ thống có bảng "ngân hàng nhận xét" dùng chung theo tổ chức, khoá duy nhất theo (tổ chức, thao tác), nhãn mặc định "chung" | ✅ | packages/db/src/schema/comment-bank.ts:11-30 | 🟡 |
| FR-80 | 🟡 Tồn tại route gắn ở kernel cho ngân hàng nhận xét, nhưng KHÔNG tìm thấy sử dụng nào trong các màn/hàm chấm bài — kế nối nghiệp vụ chưa thấy trong code | 🟡 | apps/server/src/routes/kernel.ts:3498; negative search trong apps/web/src/routes/_auth/grading/ + apps/web/src/components/grading/ (pattern "comment-bank|commentBank|CommentBank" → 0 kết quả) | 🟡 |

## 4. Non-Functional Requirements (Yêu cầu phi chức năng)

| ID | Yêu cầu | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| NFR-01 | Truy vấn hàng chờ bị chặn trần: mỗi nhánh lọc tối đa 500 dòng; truy vấn IN chia lô 50 | ✅ | apps/server/src/routes/grading.ts:84, 86 | 🟡 |
| NFR-02 | Một lượt gọi LLM tối đa 20s; toàn pipeline chấm AI có ngân sách 30s; bỏ giữa lượt nếu ngân sách còn dưới 1s | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:47, 55, 58 | 🟡 |
| NFR-03 | Sweep dọn treo: ngưỡng 60s, mỗi lượt 20 dòng, chỉ chạy kèm request đọc (không cron) | ✅ | apps/server/src/lib/ai-grading/release-stale.ts:14, 17, 38-39 | 🟡 |
| NFR-04 | Mọi biến đổi Credit idempotent qua khoá duy nhất trong sổ cái; tạo nháp chống trùng bằng khoá chính bài nộp | ✅ | packages/db/src/schema/credit-wallet.ts:44-45, 66-68; apps/server/src/lib/ai-grading/run-grading.ts:344-356 | 🟡 |
| NFR-05 | Toàn vẹn ví: giữ trước – chốt sau khi thắng CAS; không cho ví âm (UPDATE có điều kiện trong 1 batch D1); route không đụng bảng ví trực tiếp | ✅ | packages/db/src/schema/credit-wallet.ts:10-16; apps/server/src/lib/ai-grading/run-grading.ts:530-551 | 🟡 |
| NFR-06 | Phân quyền theo allowlist nghiêm ngặt (least privilege): vai lạ/rỗng/null đều bị chặn hành động tài chính | ✅ | packages/auth/src/role.ts:72-74, 105-115, 136-142 | 🟡 |
| NFR-07 | Riêng tư: nháp AI tách bảng, không có trường nháp nào trong schema trả học viên; test chặn bằng so khớp chuỗi toàn response | 🔵 | packages/api/src/contracts.ts:2493-2510; apps/server/src/routes/grading.test.ts:2136; apps/e2e/specs/ai-grading-ac-001.spec.ts:163-180 | 🟡 |
| NFR-08 | Chống XSS: essay render dưới dạng văn bản thuần JSX, không gắn HTML động | ✅ | apps/web/src/components/grading/submission-view.tsx:8-10 | 🟡 |
| NFR-09 | Thông điệp tiếng Việt: hằng số chia sẻ server/web qua packages/api + chuỗi hard-code trong component; KHÔNG có catalogue i18n | ✅ (hiện trạng) | packages/api/src/contracts.ts:4238-4260; Gap G-3 | 🟡 |
| NFR-10 | Màn chấm tự làm mới 1s/lần khi AI đang chấm; hủy khi rời trạng thái | ✅ | apps/web/src/routes/_auth/grading/$attemptId.tsx:75-77 | 🟡 |
| NFR-11 | Tìm kiếm hàng chờ khử rung 300ms | ✅ | apps/web/src/routes/_auth/grading/index.tsx:193-204 | 🟡 |
| NFR-12 | Pipeline chạy nền: dùng waitUntil của Workers khi có; nếu không, chạy "quên" kèm ghi log lỗi console | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:560-574; apps/server/src/index.ts:93, 174 | 🟡 |
| NFR-13 | Offset highlight tính theo UTF-16 trên essay gốc; essay "đóng băng" sau nộp (không đổi nội dung làm trôi offset) | ✅ | packages/db/src/schema/quiz-attempt-annotation.ts:6-15; packages/api/src/lib/essay-plain.ts:1-8 | 🟡 |

## 5. Business Rules (Quy tắc nghiệp vụ)

| ID | Quy tắc | Nhãn | Nguồn | Ưu tiên |
|---|---|---|---|---|
| BR-01 | Nháp AI KHÔNG BAO GIỜ tới học viên trực tiếp; học viên chỉ thấy điểm khi giáo viên "Chốt trả bài" | 🔵 | packages/db/src/schema/ai-grading-draft.ts:7-23; apps/e2e/specs/ai-grading-ac-001.spec.ts:163-180, 213-233 | 🟡 |
| BR-02 | AI chỉ đưa nháp — người giáo viên luôn là người chốt điểm cuối cùng (nháp không tự publish; AI không ghi trực tiếp vào điểm chính thức của bài nộp) | 🔵 | apps/server/src/lib/ai-grading/run-grading.ts:216-552 (pipeline chỉ đụng bảng nháp); apps/web/src/components/grading/ai-draft-panel.tsx:92-97 (bình luận "CHỈ ĐỌC") | 🟡 |
| BR-03 | AI lỗi/qua hạn KHÔNG chặn chấm tay: nháp rơi về "manual_pending" và form chấm tay hoạt động bình thường | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:243-254; apps/web/src/components/grading/ai-draft-panel.tsx:73-92 | 🟡 |
| BR-04 | Credit là tài nguyên của TỔ CHỨC; mọi hành vi tiêu Credit (pipeline nháp AI, chấm lại AI) thuộc nhóm vai publish, không cho trợ giảng | ✅ | packages/auth/src/role.ts:105-115; apps/server/src/routes/grading.ts:1238-1243 | 🟡 |
| BR-05 | Trợ giảng chỉ rà soát nháp ("Lưu bản nháp"), không chốt, không chấm lại AI | ✅ | packages/auth/src/role.ts:116-122; apps/e2e/specs/ai-grading-ac-004.spec.ts:185 | 🟡 |
| BR-06 | Hết Credit: ưu tiên cứu Writing bằng 30 lượt chấm nhanh/tháng (0 Credit); Speaking không có chấm nhanh | ✅ | apps/server/src/lib/ai-grading/run-grading.ts:404-439; apps/server/src/lib/credits/wallet.ts:155-161 | 🟡 |
| BR-07 | Mỗi cặp (bài tập, học viên) chỉ có MỘT bài nộp — không làm lại (v1) | ✅ | packages/db/src/schema/quiz-attempt.ts:86-89 | 🟡 |
| BR-08 | Thang điểm IELTS: 4 tiêu chí 0–9 bước 0.5; band tổng = trung bình làm tròn 0.5, chỉ tính khi đủ 4, không lưu DB | ✅ | packages/api/src/lib/ielts-band.ts:7-18, 129-147; apps/server/src/lib/quiz-grade.ts | 🟡 |
| BR-09 | Thông báo "Bài đã được chấm" chỉ gửi khi chốt thật, chống trùng theo bài nộp, bỏ qua bài mẫu | ✅ | apps/server/src/routes/grading.ts:1115-1130; apps/server/src/lib/notifications/templates.ts:111-127 | 🟡 |
| BR-10 | Mỗi lượt chấm AI (gốc hoặc lượt retry n) là một "occasion" Credit riêng, khoá idempotent riêng, có thể hoàn độc lập | ✅ | apps/server/src/lib/credits/wallet.ts:71-72; apps/server/src/lib/ai-grading/release-stale.ts:180-230 | 🟡 |
| BR-11 | Sổ cái Credit chỉ ghi thêm (append-only): mọi biến đổi là dòng mới, có dòng bù "reverted" khi hoàn lượt chấm nhanh, kể cả giao thừa tháng | ✅ | packages/db/src/schema/credit-wallet.ts:37-46; apps/server/src/lib/credits/wallet.ts:197-203 | 🟡 |
| BR-12 | Một tổ chức một ví; khả dụng = balance − held; không âm | ✅ | packages/db/src/schema/credit-wallet.ts:10-23; apps/server/src/lib/credits/wallet.ts:273-283 | 🟡 |
| BR-13 | Bài luyện tập được chấm như bài tập (cùng form, band, publish), chỉ khác nhãn và đường dẫn thông báo | 🔵 | apps/server/src/routes/grading.ts:227-234, 305, 1115-1130; apps/e2e/specs/teacher-grade-submission.spec.ts:343-487 | 🟡 |

## 6. Ma trận lỗi (wording thật — quote nguyên văn)

### 6.1 Lỗi máy chủ (route /grading)

| Tình huống | HTTP | Mã (reason) | Wording nguyên văn | Nguồn |
|---|---|---|---|---|
| Không tìm thấy bài nộp | 404 | (chuỗi trong message) | "attempt not found" | apps/server/src/routes/grading.ts:665-679 |
| Bài chưa nộp mà gọi chấm | 409 | NOT_SUBMITTED | "attempt not yet submitted" | apps/server/src/routes/grading.ts:665-679, 509 |
| Kỹ năng không chấm được | 400 | SKILL_NOT_GRADABLE | "skill not gradable" | apps/server/src/routes/grading.ts:661, 665-679 |
| Sai vai khi chốt | 403 | GRADE_PUBLISH_FORBIDDEN | (message lỗi chung 403) | apps/server/src/routes/grading.ts:1003-1008 |
| Sai vai khi lưu nháp | 403 | GRADE_REVIEW_FORBIDDEN | (message lỗi chung 403) | apps/server/src/routes/grading.ts:1149 |
| Sai vai khi chấm lại AI | 403 | AI_RETRY_FORBIDDEN | (message lỗi chung 403) | apps/server/src/routes/grading.ts:1238-1243 |
| Trượt version khi chốt | 409 | E-selfomy-alignment-011 | "draft version conflict" + hằng message (6.2) | apps/server/src/routes/grading.ts:1094-1100; packages/api/src/contracts.ts:4234 |
| Trượt version/trạng thái khi lưu nháp | 409 | DRAFT_NOT_EDITABLE / E-selfomy-alignment-011 | (theo nhánh) | apps/server/src/routes/grading.ts:1179-1190 |
| Nháp không tồn tại | 404 | DRAFT_NOT_FOUND | (message lỗi chung 404) | apps/server/src/routes/grading.ts:1177 |
| Chấm lại khi chưa "manual_pending" | 409 | DRAFT_NOT_RETRYABLE | (theo nhánh) | apps/server/src/routes/grading.ts:1264-1278 |
| Kỹ năng không highlight được | 400 | SKILL_NOT_ANNOTATABLE | (theo nhánh) | apps/server/src/routes/grading.ts:1353-1358 |
| Span highlight sai | 400 | INVALID_SPAN | (theo nhánh) | apps/server/src/routes/grading.ts:1361-1373 |
| Vượt 200 highlight | 400 | TOO_MANY_ANNOTATIONS | (theo nhánh) | apps/server/src/routes/grading.ts:1376-1381 |
| Highlight chồng nhau | 409 | OVERLAP | (theo nhánh) | apps/server/src/routes/grading.ts:1382-1387 |
| Media chưa cấu hình / không có | 503 / 404 | (message) | "media storage unavailable" | apps/server/src/routes/grading.ts:975-996 |
| Body JSON sai | 400 | (message) | "invalid json" / "invalid body" | apps/server/src/routes/grading.ts:394-416 |

- Ghi chú: với nháp "manual_pending" do essay hybrid rỗng, mã lỗi để NULL — panel AI hiển thị huy hiệu "Chờ chấm tay" và KHÔNG có khối lỗi (hàm nhãn lỗi trả null khi mã rỗng) — apps/web/src/components/grading/ai-draft-panel.tsx:73-92.

### 6.2 Thông điệp nghiệp vụ chia sẻ (hằng số — nguyên văn)

| Mã | Nguyên văn | Nguồn |
|---|---|---|
| E-selfomy-alignment-001 | "Tổ chức của bạn đã dùng hết Credit AI trong kỳ. Vui lòng mua thêm gói 100 Credit (149.000đ) hoặc nâng cấp gói tháng để tiếp tục sử dụng tính năng này." | packages/api/src/contracts.ts:4251-4260 |
| E-selfomy-alignment-002 | "Bạn đã sử dụng hết hạn mức Credit AI và 30 lượt chấm nhanh Writing hỗ trợ thêm trong tháng này. Vui lòng nạp thêm Credit để tiếp tục chấm tự động." | packages/api/src/contracts.ts:4251-4260 |
| E-selfomy-alignment-004 (E004) | "Hệ thống AI đang phản hồi chậm hoặc không đọc được cấu trúc tệp này. Số Credit tạm giữ đã được hoàn lại đầy đủ vào ví của bạn. Vui lòng thử lại sau." | packages/api/src/contracts.ts:4238-4239 |
| E-selfomy-alignment-011 (E011) | "Bài làm này vừa được cập nhật bởi một nhân sự khác hoặc đang trong tiến trình chấm AI. Vui lòng tải lại dữ liệu mới nhất trước khi lưu." | packages/api/src/contracts.ts:4243-4244 |
| AI_GRADING_* | mã máy: AI_GRADING_TIMEOUT / AI_GRADING_FAILED / AI_GRADING_DISABLED / AI_GRADING_NO_TRANSCRIPT | packages/api/src/contracts.ts:4196-4209 |

### 6.3 Chữ phía web (nguyên văn)

| Bối cảnh | Nguyên văn | Nguồn |
|---|---|---|
| Huy hiệu trạng thái nháp | "AI đang chấm…" / "AI đã chấm nháp" / "Đang rà soát" / "Chờ chấm tay" / "Đã trả kết quả" | apps/web/src/components/grading/ai-draft-panel.tsx:23-32 |
| Nhãn nháp quick | "Bản nháp chấm nhanh" | apps/web/src/components/grading/ai-draft-panel.tsx:58 |
| Lỗi nháp theo mã | "AI quá hạn — bạn vẫn chấm tay bình thường." / "AI chấm lỗi — bạn vẫn chấm tay bình thường." / "Chấm AI chưa cấu hình cho tổ chức." / "Chưa có lời thoại chuyển văn bản (Speaking)." / khác: "AI chấm lỗi." | apps/web/src/components/grading/ai-draft-panel.tsx:73-92 |
| Chặn vai (publish) | "Chỉ Giáo viên đứng lớp được chốt trả bài" | apps/web/src/components/grading/grade-form.tsx:26-27 |
| Chặn vai (retry) | "Chỉ Giáo viên đứng lớp được chấm lại AI" | apps/web/src/components/grading/ai-draft-panel.tsx:99-100 |
| Hộp thoại hết Credit | tiêu đề "Nạp thêm Credit AI"; nội dung: "Vui lòng liên hệ Chủ trung tâm hoặc bộ phận quản trị để nạp thêm gói 100 Credit (149.000đ) hoặc gia hạn gói thuê bao tháng. Trong lúc chờ nạp thêm Credit, bạn vẫn có thể chấm bài thủ công bình thường ở khung bên phải." | apps/web/src/components/grading/ai-draft-panel.tsx:224-247 |
| Nút chấm lại AI | "Thử chấm lại AI" / "Đang chấm lại AI…" | apps/web/src/components/grading/ai-draft-panel.tsx:248-284 |
| Xung đột E-011 | hộp thoại có nút "Tải lại bản mới nhất" | apps/web/src/routes/_auth/grading/$attemptId.tsx:467-503 |
| Lỗi tải màn chấm | "Không tìm thấy bài nộp này." / "Học viên chưa nộp bài này." / "Đề này được chấm tự động, không cần chấm tay." / "Không tải được bài nộp. Thử tải lại trang." | apps/web/src/routes/_auth/grading/$attemptId.tsx:240-247 |
| Lỗi hàng chờ | "Không tải được hàng chờ chấm. Thử tải lại trang." | apps/web/src/routes/_auth/grading/index.tsx:327 |
| Lỗi highlight | "Đoạn này trùng với highlight khác." / "Đã đạt tối đa 200 highlight." / "Highlight không còn tồn tại — tải lại trang." | apps/web/src/routes/_auth/grading/$attemptId.tsx:47-52 |
| Thông báo học viên | "Bài đã được chấm" + "Bài "<tựa đề>" của bạn đã có điểm và nhận xét của giáo viên." | apps/server/src/lib/notifications/templates.ts:111-127 |
| Nhãn chờ ở portal | "Đã nộp — Đang chờ giáo viên chấm" | apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:144 |

- R2-i18n: repo KHÔNG có catalogue bản dịch (negative search: không tìm thấy thư mục i18n/locales/messages nào); wording "chuẩn" nằm ở hằng số packages/api (6.2) và chuỗi literal web (6.3). Hai câu E-001/E-002 xuất hiện CẢ ở hằng chia sẻ lẫn hộp thoại web (web hiển thị hộp thoại riêng cho E-001/E-002 — see FR-61). Xem Gap G-3.

## 7. Success Metrics (Đo lường thành công)

Code không định nghĩa KPI. Các dấu vết đo lường gián tiếp đọc được:

- 🟡 Giảm "bài chờ chấm": đếm hiển thị ngay trên kicker hàng chờ ("N bài chờ chấm · M bài đã nộp") và mục nhắc việc dashboard {count, writing, speaking} — apps/web/src/routes/_auth/grading/index.tsx:335-352; apps/server/src/routes/dashboard-reminders.ts:263-266. OQ-05.
- 🟡 "1 lượt chấm AI Writing = 1 Credit": đơn giá định giá trong thông điệp gói 100 Credit (149.000đ) — packages/api/src/contracts.ts:4251-4260. Không thấy báo cáo doanh thu/thu hộ nào gắn với grading. OQ-03.
- 🟡 Tỉ lệ AI thành công: chỉ nhìn được qua mã lỗi trên nháp (TIMEOUT/FAILED/NO_TRANSCRIPT); không có bảng chỉ số tổng hợp. OQ-04.
- 🔵 Kiểm chứng hành vi bằng bộ test: e2e AC-001 (ẩn nháp với học viên), AC-003 (30 lượt chấm nhanh), AC-004 (vai + xung đột), teacher-grade-submission (chấm tay 2 kỹ năng + luyện tập) — apps/e2e/specs/*.

## 8. Entities (Thực thể dữ liệu)

Chi tiết cột: xem `srs/grading-reverse-erd.md`. Tóm tắt:

| Thực thể | Vai | Khoá/chỉ mục chính | Nguồn |
|---|---|---|---|
| quiz_attempt | Bài nộp của học viên (essay, media speaking, điểm chốt, thời điểm chấm) | PK id; UNIQUE (assignment_id, student_id); CHECK bài tập phải có assignment_id | packages/db/src/schema/quiz-attempt.ts |
| ai_grading_draft | Bản nháp AI (trạng thái, điểm nháp, điểm rà soát, chế độ, chi phí, mã lỗi, version, số lượt thử) | PK attempt_id (ON DELETE CASCADE); index (org_id, status) | packages/db/src/schema/ai-grading-draft.ts |
| quiz_attempt_annotation | Highlight + note trên essay Writing | PK id; FK DB attempt_id + org_id (cascade); start/end offset | packages/db/src/schema/quiz-attempt-annotation.ts |
| credit_wallet | Ví Credit tổ chức (balance/held, gói) | PK org_id | packages/db/src/schema/credit-wallet.ts:17-35 |
| credit_usage_log | Sổ cái Credit append-only (khoá idempotent UNIQUE) | PK id; UNIQUE idempotency_key; index (org_id, created_at) | packages/db/src/schema/credit-wallet.ts:47-70 |
| comment_bank | Ngân hàng nhận xét dùng chung | UNIQUE (org_id, operation_id) | packages/db/src/schema/comment-bank.ts:27-30 |
| (liên kết) organizations / users / membership / assignment / test | chủ thể & ngữ cảnh | FK DB thật ở quiz_attempt (4 khóa) + annotation (cascade); bảng khác xem ERD | packages/db/src/schema/* |

## 9. Luồng nghiệp vụ (Flows)

Mỗi flow có CẢ sequenceDiagram và flowchart TD tại `srs/grading-reverse-flows.md`:

| Flow | Tên | Trigger chính |
|---|---|---|
| F1 | Học viên nộp bài kích hoạt chấm AI | Nộp bài Writing/Speaking [S9] |
| F2 | Pipeline chấm AI (happy + nhánh lỗi Credit/AI) | scheduleAiGrading [S2] |
| F3 | Mở hàng chờ chấm | GV mở /grading [S27] |
| F4 | Mở một bài nộp để chấm | GV chọn dòng hàng chờ [S28] |
| F5 | Lưu bản nháp rà soát (+ xung đột E-011) | Nút "Lưu bản nháp" |
| F6 | Chốt trả bài + thông báo học viên | Nút "Chốt trả bài" |
| F7 | Thử chấm lại AI | Khối lỗi E-004 / nút retry |
| F8 | Sweep dọn lượt chấm treo + hoàn Credit | Request đọc (queue/attempt/wallet) [S3] |
| F9 | Highlight nhận xét trên essay | Bôi đen đoạn văn bản |
| F10 | Bài nộp mẫu demo | Nút "Tạo bài nộp mẫu dùng thử" |

## 10. Screens (Màn hình)

| Màn | Đường dẫn (web) | Thành phần chính | Nguồn |
|---|---|---|---|
| Hàng chờ chấm | /grading | Bộ lọc q/mode/skill/status, nhóm + đếm, kicker, nút demo, huy hiệu AI | apps/web/src/routes/_auth/grading/index.tsx |
| Chấm một bài nộp | /grading/:attemptId | Bài làm học viên (essay/media/trắc nghiệm), panel "Gợi ý từ AI", form 4 tiêu chí, modal E-011, highlight | apps/web/src/routes/_auth/grading/$attemptId.tsx |
| Nhắc việc dashboard | (widget dashboard) | overdueGrading {count, writing, speaking} | apps/server/src/routes/dashboard-reminders.ts:263-266 |
| Portal học viên (đối chiếu) | /learn/quizzes/attempt/:id | "Đã nộp — Đang chờ giáo viên chấm" → điểm + band sau chốt | apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:144 |

## 11. Constraints (Ràng buộc kỹ thuật)

- Stack: Cloudflare Workers + Hono; D1 (SQLite) qua Drizzle; batch D1 nguyên tử cho biến đổi ví (packages/db/src/schema/credit-wallet.ts:10-16).
- Nền chạy: pipeline AI chạy qua `waitUntil` (apps/server/src/index.ts:93, 174); không có queue ngoài — retry pipeline phụ thuộc request GET và sweep.
- Cờ tính năng: server `AI_ENABLED` (chuỗi "true" mới bật, apps/server/src/lib/ai-gate.ts:18); web `VITE_AI_ENABLED` (apps/web/src/lib/features.ts:9); hạ tầng mặc định tắt (packages/infra/alchemy.run.ts:121-123).
- Model AI: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Workers AI) — apps/server/src/lib/ai-grading/workers-ai-grader.ts:29.
- Thời gian: mốc thời gian lưu dạng millisecond (timestamp_ms) trong D1; tháng hạn mức chấm nhanh theo múi giờ Asia/Ho_Chi_Minh (apps/server/src/lib/credits/wallet.ts:155-161).
- Offset văn bản: UTF-16 trên essay gốc; ánh xạ văn bản thuần ↔ gốc sinh MỘT lần mỗi lần đọc (packages/api/src/lib/essay-plain.ts:1-8).
- E2E: grader giả điểm cố định 6.5/7.0/6.0/6.5, token "ai-fail" ép lỗi FAILED (apps/server/src/lib/ai-grading/fake-grader.ts:30, 40-44; apps/e2e/src/boot.ts:194).
- Giới hạn route: JSON body parse nghiêm (400 "invalid json"/"invalid body"), lỗi chuẩn hoá qua errorResponse (apps/server/src/routes/grading.ts:394-416, 665-679).

## 12. Câu hỏi mở (Open Questions) — tóm tắt

Chi tiết đầy đủ (kèm negative search): `reverse-gaps.md`.

| ID | Câu hỏi | Loại |
|---|---|---|
| OQ-01 | Cách gọi thương mại chuẩn của các vai (class_teacher = "Giáo viên đứng lớp"?) — code chỉ có mã vai + tooltip | 🟡 Inferred |
| OQ-02 | Ưu tiên (P0/P1…) của từng FR/NFR — code không nói | 🟡 |
| OQ-03 | Cơ sở hạn mức 30 lượt chấm nhanh/tháng & gói 100 Credit (149.000đ) — quy định kinh doanh nằm ở đâu | 🟡 |
| OQ-04 | Có cần thông báo cho giáo viên khi nháp AI xong/lỗi (hiện chỉ poll UI 1s khi đang mở màn) | 🟡 |
| OQ-05 | KPI mục tiêu (giảm bao nhiêu % bài chờ chấm; tỉ lệ AI thành công mong đợi) | 🟡 |
| OQ-06 | Hàng chờ khi vượt 500 dòng/nhánh — có cần phân trang? (negative search: chỉ có .limit(500)/nhánh, không thấy cursor/offset) | 🟡 |
| OQ-07 | Có nên giới hạn số lần "Thử chấm lại AI"? retryCount chỉ tăng, không thấy trần | 🟡 |
| OQ-08 | Kế nối ngân hàng nhận xét (comment_bank) vào màn chấm — schema có, UI chưa thấy dùng | 🟡 |
| OQ-09 | Sweep "lười" phụ thuộc request đọc — chấp nhận lượt treo tồn tại bao lâu nếu không ai mở màn chấm/ví? | 🟡 |
| G-1 | Tài liệu được code tham chiếu `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` KHÔNG tồn tại | Gap |
| G-2 | Bộ chuyển giọng nói (getTranscriber) chưa được cắm ở boot — Speaking AI luôn dừng NO_TRANSCRIPT | Gap |
| G-3 | Không có catalogue i18n; wording rải ở hằng + literal → rủi ro lệch chữ server/web | Gap |
| G-4 | Hàm trần nhân sự `assertStaffCap` hiện là no-op (chỗ cắm chưa có nội dung) — trần số staff dùng AI chưa được thực thi | Gap |
| C-1 | Comment contracts nói nháp kết ở "manual_pending → published" nhưng code cho thêm "manual_pending → ai_processing" (retry) — comment cũ | Conflict |
| C-2 | Wording E-004 nhắc "cấu trúc tệp" (mượn từ exam-import) trong bối cảnh chấm essay/transcript | Conflict |
| I-1 | Mục tiêu nghiệp vụ tổng: "AI tăng tốc, giáo viên vẫn chốt" | 🟡 Inferred |
| I-2 | Ưu tiên Writing khi hết Credit vì Writing là khối lượng chính | 🟡 Inferred |
| I-3 | Chỉ số "bài chờ chấm" được coi là thước đo chính của feature | 🟡 Inferred |
