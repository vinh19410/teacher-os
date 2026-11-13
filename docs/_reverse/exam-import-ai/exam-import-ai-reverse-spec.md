---
type: reverse-srs
feature: exam-import-ai
status: draft
updated: 2026-11-11
confidence_summary: "✅135 🔵3 🟡51 (trong spec; toàn bộ 16 file: ✅159 🔵4 🟡51 — đếm theo luật batch sau audit) — OQ 12"
links:
  - reverse-sources.md
  - reverse-gaps.md
  - _evidence.md
  - srs/exam-import-ai-reverse-flows.md
  - srs/exam-import-ai-reverse-states.md
  - srs/exam-import-ai-reverse-erd.md
  - usecases/exam-import-ai-reverse-usecase-index.md
---

# exam-import-ai — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập từ source code working tree develop @ d6c0f6b5; KHÔNG hỏi user nghiệp vụ — CODE = PROOF).
> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).
> Tất cả cite `path:line` theo working tree hiện tại.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** 44 nguồn (S1..S44) — xem [`reverse-sources.md`](./reverse-sources.md); bằng chứng từng dòng ở [`_evidence.md`](./_evidence.md).
- **Câu hỏi mở:** 12 OQ + 4 Gap + 3 Conflict + 4 Inferred — xem [`reverse-gaps.md`](./reverse-gaps.md).
- Feature ghép từ 4 kế hoạch đã hoàn tất trong repo: TOS-24 (#470 Ví Credit + bóc tách), TOS-25 (#471 chống trùng), TOS-26 (#472 chỉnh sửa + xuất bản), TOS-27 (#473 chặn tệp lỗi + hoàn trả). 🔵 [S27] — các plan tự khai `status: completed` và code tương ứng tồn tại đầy đủ kèm test.

### 0.3 Khác biệt với tài liệu chính (chỉ khi feature trùng doc hiện có)

| Điểm | Reverse nói (từ nguồn) | Doc chính nói | Đề xuất |
|------|------------------------|---------------|---------|
| PDR `docs/project-overview-pdr.md` | Feature (nhập đề AI, Ví Credit, `exam_import_job`) không được nhắc — grep `exam`/`Credit` trên PDR trả 0 dòng ✅ [S28] | PDR chỉ mô tả `assignment_prompt`/`assignment_test` ở vai đích giao bài | `/gap`: bổ sung đoạn PDR về Nhập đề AI + Ví Credit |
| Spec gốc `docs/selfomy-alignment/srs/selfomy-alignment-spec.md` | File không tồn tại trong repo (find 0 kết quả), dù plans TOS-24..27 cite nguyên văn Error Matrix từ đó 🟡 [S27] | Plans khẳng định thông điệp E-001/003/004 "lấy nguyên văn spec" | `/gap`: phục hồi/đổi nguồn tham chiếu spec |
| Plan TOS-24 D5 | POST dùng RAW BODY (byte thô + header `X-File-Name`), KHÔNG multipart ✅ [S1:S121-128][S22:S20-28] | Plan TOS-24 D5 viết "`POST /api/exam-imports` (multipart)" 🟡 [S27] | Plan stale so với code — giữ code làm chuẩn |
| Thanh tiến trình màn import | `Progress value={80}` cố định — tiến trình giả lập, không phản ánh tiến độ thật ✅ [S20:S373-376] | (không có doc) | Ghi nhận; xem Gap G-3 |

## 1. Scope

Feature `exam-import-ai` cho phép tổ chức (trung tâm) biến một tệp đề thi PDF/ảnh thành bộ đề trong Ngân hàng đề bằng AI bóc tách, trả phí bằng Ví Credit của tổ chức.

- **Nhập đề bằng tệp:** tải lên PDF/PNG/JPEG ≤ 15 MB, PDF ≤ 20 trang, không khóa mật khẩu; kiểm tra 2 lớp (client fail-fast + server kiểm sâu trước khi giữ Credit). ✅ [S4:S4120-4132][S8:S28-52][S25:S28-99]
- **Trả phí theo lượt:** mỗi lượt bóc tách tạm giữ 5 Credit (`CREDIT_COSTS.examImport`) trước khi gọi AI; chốt trừ khi có bản nháp hợp lệ, tự hoàn khi AI lỗi/quá hạn/không đọc được cấu trúc. ✅ [S4:S4114][S1:S299-325][S5:S264-297]
- **Bóc tách AI:** Workers AI (`toMarkdown` → LLM `@cf/meta/llama-4-scout-17b-16e-instruct` với json_schema) xuất bản nháp đề gồm title, skill, thời gian, parts (passage + câu hỏi stem/opts/answer/type/explanation/confidence). ✅ [S9:S56-131][S9:S169-229]
- **Nhãn Cần rà soát lại:** server tự tính `needsReview` (tin cậy < 0.8, thiếu đáp án, < 2 phương án, đáp án ngoài phương án); UI chỉ đọc nhãn. ✅ [S5:S60-81][S4:S4321-4326]
- **Chống trùng:** mã băm SHA-256 nội dung tệp; trùng job `completed` có bản nháp đọc được trong cùng tổ chức → không gọi AI, không giữ/trừ Credit, mở lại bản nháp cũ 0 Credit. ✅ [S7:S24-63][S1:S264-275]
- **Chỉnh sửa 0 Credit + cổng xác nhận:** sửa tay bản nháp không đụng ví; có câu cần rà soát thì khóa "Lưu vào Ngân hàng đề" tới khi tích xác nhận; server hợp nhất bản nháp để client không tự gỡ nhãn. ✅ [S1:S585-678][S11:S77-124][S11:S179-190]
- **Xuất bản vào Ngân hàng đề:** tạo/cập nhật `assignment_prompt` + `assignment_test` + `assignment_test_part` nguyên tử (1 batch), idempotent theo job (`publishedTestId`), Listening xuất bản ở trạng thái `draft` (thiếu audio). ✅ [S11:S164-564]
- **Hoàn trả & dọn rác:** job `processing` treo quá 150s được giải tỏa lười (lazy sweep) tại các lần chạm ví/job; mọi lỗi sau khi giữ Credit → hoàn đủ; trường hợp hiếm "đã trừ rồi mới hỏng ghi job" trả mã riêng, không dùng thông điệp "đã hoàn". ✅ [S6:S30-99][S5:S236-259][S1:S91-118]
- **Thử lại:** job `failed_refunded` được tạo job mới dùng lại file đã lưu (không upload lại). ✅ [S1:S455-583]
- **Cờ tính năng:** web giằng cờ build `VITE_AI_ENABLED` (ẩn CTA + redirect route); server fail-closed 503 khi binding AI/kho file hoặc cờ `AI_ENABLED` chưa bật. ✅ [S23:S9][S20:S41-46][S16:S14-24][S1:S163-173]
- **Phân quyền:** chỉ `teacher`/`owner` thực hiện hành động tiêu Credit (nhập/lookup/retry/sửa/xuất bản); thành viên org khác được xem kết quả job (org-scoped); học viên bị chặn ở middleware app. ✅ [S15:S94-103][S1:S372-403][S18:S227-234]
- **Giao diện:** một màn duy nhất `/assignments/tests/import` (mã màn [6]): dropzone → đối chiếu 2 cột (≥1024px) / 2 tab (<1024px), huy hiệu ví, banner trùng, panel lỗi + thử lại, hộp thoại hết Credit; vào từ CTA trên `/assignments/tests/new`. ✅ [S20][S21][S34]

**Boundary (out of scope — ranh giới do task đặt + code xác nhận):**

- Màn soạn bộ đề đích `tests/new` (TestBuilderShell) thuộc feature `assignment-tests`; feature này chỉ lấy điểm chạm CTA nhận CTA/link và điểm nhận kết quả publish (điều hướng `/assignments/tests/$id`). 🔵 [S21:S1-34][S20:S328-331]
- AI chấm bài (AI grading) là feature khác — chỉ chung binding `AI` và Ví Credit (`AI_GRADING_*` riêng trong contracts, không thuộc luồng import). ✅ [S4:S4184-4230][S16:S14-24]
- Mua gói/Top-up Credit (màn [10]) chưa tồn tại — hộp thoại hết Credit chỉ có "Đóng" và "Soạn đề thủ công". ✅ [S31:S1-56] → Gap G-1
- Đổi model AI, chất lượng bóc tách, training prompt — chỉ là hằng số cấu hình, không có cơ chế đánh giá trong code. 🟡 [S9:S56] → OQ-6

## 2. Actors & Stakeholders

| Actor | Loại (người/hệ thống/ngoài) | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|-----------------------------|----------|--------------|-------|------|
| Giáo viên (`teacher`) | người | Nhập đề từ tệp thành bộ đề trong Ngân hàng đề | Có | S15:S94-103, S1:S159-162 | ✅ |
| Chủ trung tâm (`owner`) | người | Như giáo viên (cùng quyền nhập đề) | Có | S15:S94-103 | ✅ |
| Trợ giảng (`ta`) | người | Chỉ xem kết quả job của org (GET không gate nhập đề) | Có (chỉ xem) | S1:S372-376, S15:S89-91 | 🔵 (gate "chỉ xem" ✅ route code; chủ ý nghiệp vụ 🟡 OQ-8) |
| GV đứng lớp (`class_teacher`) | người | Bị chặn các hành động nhập đề (403), được xem job | Có (chỉ xem) | S15:S89-91, S1:S160-162 | ✅ |
| Học viên (`student`) | người | Không được chạm API teacher-app | Không (bị chặn 403 STUDENT_ON_TEACHER_APP) | S18:S227-234 | ✅ |
| Quản trị hệ thống (`admin`) | người | Bật/tắt tính năng qua binding + cờ cấu hình | Một phần (chỉ cấu hình, không UI import) | S17:S99-139, S19:S121-123, S19:S213-214 | 🟡 (OQ-2) |
| Cloudflare Workers AI | hệ thống ngoài | Chuyển tệp → markdown → JSON cấu trúc đề | Có (đối tác thực thi) | S9:S40-56, S19:S210-214 | ✅ |
| Cloudflare R2 (bucket MEDIA) | hệ thống ngoài | Lưu file đề gốc, phục vụ stream lại khi xem/retry | Có | S17:S131-138, S1:S280-281 | ✅ |
| Ví Credit (hệ thống nội bộ) | hệ thống | Giữ/chốt/hoàn Credit đúng nguyên tắc | Có | S13:S319-345, S3:S9-61 | ✅ |

## 3. Functional Requirements (FR)

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-exam-import-ai-001 | CTA vào tính năng | CTA "Nhập đề bằng AI (5 Credit)" trên PageHead màn soạn đề `/assignments/tests/new`; ẩn khi cờ AI tắt. | P1 🟡 (OQ-1) | demo | S21:S29, S34:S11-19, S4:S4114 | ✅ |
| FR-exam-import-ai-002 | Cờ bật/tắt tính năng | Web: `AI_ENABLED = VITE_AI_ENABLED === "true"`; route `/assignments/tests/import` redirect về `tests/new` khi tắt; server: `createAiProviders` chỉ trả extractor khi `AI_ENABLED === "true"` và có binding `AI`; thiếu → POST/FILE/retry trả 503 `EXAM_IMPORT_DISABLED`. | P0 🟡 (OQ-2) | test | S23:S9, S20:S41-46, S16:S18-24, S1:S163-173, S38:S427 | ✅ |
| FR-exam-import-ai-003 | Kiểm tra tệp 2 lớp | Client: MIME ∈ PDF/PNG/JPEG, ≤ 15 MB, PDF ≤ 20 trang, phát hiện mật khẩu → chặn ngay không gọi API. Server: normalize MIME, Content-Length khai báo, tên file `X-File-Name` sanitize, byte thật khớp khai báo, parse `unpdf` (số trang/mật khẩu/hỏng) — tất cả TRƯỚC khi tạo job/giữ Credit. | P0 🟡 (OQ-1) | test | S25:S28-99, S8:S28-52, S1:S178-259, S38:S415-521 | ✅ |
| FR-exam-import-ai-004 | Upload raw-body | POST `/api/exam-imports` nhận nguyên byte tệp trong body (không multipart); Content-Type là MIME tệp, tên file qua header `X-File-Name` (encodeURIComponent). | P0 🟡 (OQ-1) | test | S1:S120-128, S22:S20-77 | ✅ |
| FR-exam-import-ai-005 | Giữ — chốt — hoàn 5 Credit | Tạo job `processing` + reserve 5 Credit trước khi bóc tách; settle khi có bản nháp hợp lệ (settle TRƯỚC khi mark completed); mọi lỗi sau reserve → release đủ 5 Credit + job `failed_refunded`. | P0 🟡 (OQ-1) | test | S1:S283-340, S5:S186-297, S13:S319-345 | ✅ |
| FR-exam-import-ai-006 | Bóc tách AI ≤ 120s | Extractor: `toMarkdown` → LLM chạy json_schema ép đầu ra; timeout kép 120s (`AbortSignal.timeout` + race timer bảo đảm thoát đúng hạn dù extractor phớt lờ signal). | P0 🟡 (OQ-1, OQ-6) | test | S9:S169-229, S5:S164-179, S4:S4120-4125 | ✅ |
| FR-exam-import-ai-007 | Phân loại thất bại | Lỗi sau reserve phân loại `timeout` / `ai_error` / `empty_result` (0 nhóm câu hỏi hợp lệ = không có câu nào có cả stem + answer không rỗng) ghi vào `error_reason`, trả 502 E-004 kèm reason + jobId. | P0 🟡 (OQ-1) | test | S5:S23-53, S4:S4177-4182, S1:S91-118 | ✅ |
| FR-exam-import-ai-008 | Nhãn Cần rà soát | Server gắn `needsReview` khi: confidence < 0.8, thiếu đáp án, opts < 2, hoặc đáp án không nằm trong opts; UI chỉ đọc. | P0 🟡 (OQ-1) | test | S5:S55-81, S4:S4321-4326, S36:S42-49 | ✅ |
| FR-exam-import-ai-009 | Đối chiếu 2 cột | Workspace ≥1024px: trái viewer tài liệu gốc (PDF lật trang/zoom 50–200%, ảnh `<img>`), phải panel bản nháp; <1024px: 2 tab "Tài liệu gốc" / "Câu hỏi bóc tách" + tab bar sticky. | P1 🟡 (OQ-1) | demo | S20:S452-498, S35:S104-151, S41:S37-63 | ✅ |
| FR-exam-import-ai-010 | Kết quả sống trong URL | Sau import, URL đẩy `?job=<id>` (replace); mở lại URL load job; Back về không `?job=` → reset màn trống. | P1 🟡 (OQ-1) | demo | S20:S47-52, S126-155, S41:S52-56 | ✅ |
| FR-exam-import-ai-011 | Phát hiện trùng trước upload | Client SHA-256 tệp rồi GET `/api/exam-imports/lookup?fingerprint=`; trùng → banner, không upload; lookup/hash lỗi → fail-open vẫn upload (best-effort). | P0 🟡 (OQ-1) | test | S24:S1-23, S22:S148-162, S20:S227-269 | ✅ |
| FR-exam-import-ai-012 | Chặn trùng phía server | POST tính lại fingerprint server-side; trùng job `completed` có `draft_json` đọc được trong cùng org → 200 `{duplicateOf:{jobId,title,completedAt}}`, không gọi AI, không tạo job, không lưu R2, không đụng ví; chạy TRƯỚC ensureWallet/reserve. | P0 🟡 (OQ-1) | test | S1:S264-275, S7:S24-63, S38:S1106-1214 | ✅ |
| FR-exam-import-ai-013 | Banner trùng + mở lại | Banner "Phát hiện tệp trùng mã băm" kèm nút "Mở lại bản nháp cũ (0 Cr)" → navigate `?job=<jobId cũ>`, không clone job. | P1 🟡 (OQ-1) | demo | S32:S1-45, S20:S396-426 | ✅ |
| FR-exam-import-ai-014 | Hoàn trả khi AI lỗi | AI lỗi/timeout/0 câu hợp lệ → release 5 Credit (sổ cái `released` +5), job `failed_refunded` + E-004 + reason, UI panel E-004 + nhãn lý do + nút "Thử bóc tách lại AI". | P0 🟡 (OQ-1) | test | S5:S236-303, S30:S1-58, S41:S80-124 | ✅ |
| FR-exam-import-ai-015 | Thử bóc tách lại AI | POST `/api/exam-imports/:id/retry`: chỉ nhận job `failed_refunded` cùng org (khác → 409 NOT_RETRYABLE); file gốc còn trên R2 (mất → 410 FILE_MISSING); tạo JOB MỚI dùng lại `file_key` + fingerprint, chạy lại reserve → extract → settle/release, không upload lại, không xóa file cũ. | P0 🟡 (OQ-1) | test | S1:S455-583, S38:S548-638 | ✅ |
| FR-exam-import-ai-016 | Dọn job treo | Lazy sweep: job `processing` có `started_at` cũ hơn 150s (120s + biên) → release held + mark `failed_refunded` E-004 reason `timeout`; chạy ở đầu POST, GET `/:id`, GET `/credits/wallet`; giới hạn 20 job/lần; idempotent qua sổ cái; nhánh crash-sau-settle → mark `completed` thay vì hoàn. | P0 🟡 (OQ-1) | test | S6:S11-99, S1:S262, S381, S14:S31-33, S38:S640-743 | ✅ |
| FR-exam-import-ai-017 | Chỉnh sửa bản nháp 0 Credit | PATCH `/api/exam-imports/:id/draft` (body `{draft}`): chỉ job `completed` (khác → 409 INVALID_STATE); server hợp nhất giữ `confidence` + `needsReview` gốc — client không tự gỡ nhãn; không ghi sổ cái (0 Credit). | P0 🟡 (OQ-1) | test | S1:S585-678, S11:S77-137, S38:S744-799 | ✅ |
| FR-exam-import-ai-018 | Cổng xác nhận trước xuất bản | POST `/api/exam-imports/:id/publish` (body `{draft, reviewConfirmed}`): đếm needsReview trên max(draft hợp nhất, draft gốc DB) → còn nhãn mà chưa xác nhận → 422 REVIEW_CONFIRMATION_REQUIRED; UI khóa nút + aria-describedby lý do; 0 nhãn → không hiện hộp kiểm, nút mở sẵn. | P0 🟡 (OQ-1) | test | S11:S177-190, S1:S685-776, S29:S39-59 | ✅ |
| FR-exam-import-ai-019 | Xuất bản vào Ngân hàng đề | Map draft → `assignment_prompt` (1 mỗi part, theo slot preset kỹ năng) + `assignment_test` + `assignment_test_part` trong 1 `db.batch`; id `test-import-<jobId>`/`prompt-import-<jobId>-<part>` tất định; đã có `publishedTestId` còn tồn tại → trả testId cũ (không đổi nội dung) hoặc cập nhật tại chỗ (draft thay đổi), không nhân bản; skill `mixed` → 422; vượt slot preset → 422 TOO_MANY_PARTS; câu thiếu stem/answer/opts<2 → 422 INVALID_DRAFT kèm partIndex/questionIndex; `listening` → status `draft`, kỹ năng khác → `ready`. | P0 🟡 (OQ-1) | test | S11:S164-564, S38:S800-1083 | ✅ |
| FR-exam-import-ai-020 | Hộp thoại hết Credit | 402 E-001 → modal "Không đủ Credit" với thông điệp nguyên văn + nút "Đóng" và "Soạn đề thủ công" (về `tests/new`). | P0 🟡 (OQ-1, Gap G-1) | test | S31:S1-56, S20:S379-384, S38:S317-337 | ✅ |
| FR-exam-import-ai-021 | Hiển thị ví + đơn giá | Huy hiệu "Chi phí: 5 Credit (Tạm giữ)" + "Ví: <balance> Cr"; load từ GET `/api/credits/wallet`, refresh sau khi job xong/lỗi. | P1 🟡 (OQ-1) | test | S33:S1-31, S20:S114-124, S14:S23-44 | ✅ |
| FR-exam-import-ai-022 | Xem file đề gốc | GET `/api/exam-imports/:id/file` stream file gốc (org-scoped, header bởi `mediaObjectResponse`) cho viewer PDF/ảnh; file mất → 404 NOT_FOUND. | P1 🟡 (OQ-1) | demo | S1:S405-453, S22:S182-199 | ✅ |
| FR-exam-import-ai-023 | Phân quyền nhập đề | POST/lookup/retry/draft/publish gate `canImportExam` (chỉ `teacher`/`owner` — 403); GET `/:id`, GET `/:id/file` không gate role nhập đề nhưng org-scoped; org khác/không tồn tại → 404 cùng mã; student bị chặn 403 STUDENT_ON_TEACHER_APP trước khi tới route. | P0 🟡 (OQ-1, OQ-8) | test | S15:S94-103, S1:S159-162, S348-370, S372-403, S38:S396-443, S18:S227-234 | ✅ |
| FR-exam-import-ai-024 | Bản nháp hỏng không dead-end | Job có `?job=` nhưng draft không đọc được (row hỏng/failed) → hiện cảnh báo "Bản nháp hỏng hoặc không đọc được" + trả dropzone cho nhập đề mới. | P2 🟡 (OQ-1) | test | S20:S432-450, S37:S482 | ✅ |
| FR-exam-import-ai-025 | Bảo vệ ghi JSON | PATCH draft + POST publish kiểm Origin ∈ allowlist + Content-Type `application/json` (403/415) — CSRF guard ngoài kernelRoutes; body JSON hỏng → 400 INVALID_DRAFT; draft không khớp schema → 422 INVALID_DRAFT. | P0 🟡 (OQ-1) | test | S1:S141-154, S596-658, S691-745, S38:S889 | ✅ |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-exam-import-ai-001 | performance | Bóc tách bị chặn cứng 120s (timeout kép: AbortSignal + race timer) | P0 🟡 (OQ-1) | extractor treo vẫn thoát đúng hạn, reason `timeout` | S4:S4123, S5:S164-179, S39(run-import.test):S135-219 | ✅ |
| NFR-exam-import-ai-002 | reliability (tính toàn vẹn tiền) | Ví không bao giờ âm và không kẹt: mọi biến đổi qua UPDATE có điều kiện (`balance - held >= amount` / `held >= amount`) + dòng sổ cái chỉ chui vào khi UPDATE khớp; idempotency key UNIQUE `exam_import:<jobId>:<op>`; cặp reserve/settle/release đúng 1 lần | P0 🟡 (OQ-1) | test song song/đôi | S13:S263-317, S3:S40-52, S40(wallet.test):S97-247 | ✅ |
| NFR-exam-import-ai-003 | performance (sweep) | Lazy sweep giới hạn 20 job mỗi lần gọi để bảo vệ độ trễ request | P1 🟡 (OQ-1) | `STALE_SWEEP_BATCH = 20` | S6:S15, S6:S35-45 | ✅ |
| NFR-exam-import-ai-004 | security (cô lập dữ liệu) | Mọi truy vấn job/file theo `org_id`; fileKey prefix `exam-imports/<orgId>/<jobId>` chống ghép key chéo org; wire DTO không lộ `fileKey`/`orgId`; 404 đồng nhất org khác/không tồn tại | P0 🟡 (OQ-1) | test org khác | S2:S17-21, S1:S55-88, S382-392, S38:S396 | ✅ |
| NFR-exam-import-ai-005 | auditability | Sổ cái `credit_usage_log` append-only (không update/xóa), mỗi biến đổi 1 dòng, dấu delta: reserved −amount, settled −amount, released +amount | P1 🟡 (OQ-1) | schema + test | S3:S9-61, S13:S260-317 | ✅ |
| NFR-exam-import-ai-006 | availability (fail-closed) | Thiếu binding AI/kho file/cờ → 503 DISABLED thay vì lỗi 500 | P1 🟡 (OQ-2) | test 503 | S1:S163-173, S16:S18-24, S17:S109-138 | ✅ |
| NFR-exam-import-ai-007 | security (CSRF) | Endpoint ghi JSON tự bảo vệ Origin allowlist + Content-Type application/json | P0 🟡 (OQ-1) | test 403/415 | S1:S141-154, S38:S889 | ✅ |
| NFR-exam-import-ai-008 | usability/a11y | Trạng thái dùng `role="status"`/`role="alert"`; nút khóa xuất bản có `aria-describedby`; dropzone có aria-label; e2e kiểm focus + 3 viewport (1440×900, 768×1024, 375×812) | P1 🟡 (OQ-1) | e2e | S20:S366-377, S29, S41:S106-117 | ✅ |
| NFR-exam-import-ai-009 | reliability (race) | Mỗi đổi trạng thái job là UPDATE có điều kiện `import_status='processing'` — stale sweep thắng race thì luồng gốc không ghi đè; settle muộn bị chặn bởi precondition held | P0 🟡 (OQ-1) | test | S5:S120-131, S199-235, S38:S640-743 | ✅ |
| NFR-exam-import-ai-010 | security (upload) | Byte thật phải khớp Content-Length khai báo và ≤ 15 MB — chống tệp giả mạo header | P0 🟡 (OQ-1) | test | S1:S229-242, S38:S511-522 | ✅ |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-exam-import-ai-001 | Đơn giá 5 Credit/lượt nhập đề; huy hiệu hiển thị trước khi bấm | Mọi lượt import/retry | FR-005, FR-021 | S4:S4114, S33:S14-16 | ✅ |
| BR-exam-import-ai-002 | Không bao giờ trừ Credit khi tệp không hợp lệ hoặc AI không trả được bản nháp: kiểm tệp TRƯỚC giữ Credit; mọi lỗi sau reserve → release đủ | Upload lỗi / AI lỗi | FR-003, FR-005, FR-014 | S1:S246-259, S5:S236-297, S27-plan:S21-23 | ✅ |
| BR-exam-import-ai-003 | Trùng mã băm (cùng org, job `completed` có draft đọc được) → 0 Credit tuyệt đối: không gọi AI, không tạo job, không lưu R2, không giữ/trừ; job `failed_refunded`/`processing`/completed-mất-draft không tính trùng | Upload tệp đã nhập thành công | FR-011, FR-012, FR-013 | S7:S13-22, S1:S264-275, S38:S1204-1238 | ✅ |
| BR-exam-import-ai-004 | Câu độ tin cậy thấp hoặc thiếu dữ liệu bắt buộc bị gắn nhãn Cần rà soát lại; còn nhãn thì bắt buộc xác nhận tường minh mới được xuất bản | Bóc tách xong / bấm xuất bản | FR-008, FR-018 | S5:S55-81, S11:S177-190 | ✅ |
| BR-exam-import-ai-005 | Sửa tay không bao giờ tự gỡ nhãn: server giữ `needsReview`/`confidence` gốc; xóa bớt câu để hạ số nhãn về 0 cũng bị chặn (gán lại nhãn câu đầu) | PATCH draft / POST publish | FR-017, FR-018 | S11:S86-124, S38:S744-799 | ✅ |
| BR-exam-import-ai-006 | Job không được kẹt `processing` không credit: reserve thua → XÓA job (+file nếu POST); job treo > 150s → sweep hoàn; job chỉ tồn tại với credit đang giữ hoặc đã trừ | Reserve thua / request chết | FR-005, FR-016 | S2:S4-12, S1:S297-325, S6:S17-29 | ✅ |
| BR-exam-import-ai-007 | Trường hợp hiếm "settled rồi mới hỏng ghi job": Credit ĐÃ trừ, KHÔNG hoàn; trả mã `EXAM_IMPORT_FAILED` (không dùng E-004 vì message E-004 nói "đã hoàn" sẽ sai sự thật); UI hiện fallback trung thực | Lỗi ghi job sau settle | FR-007, FR-014 | S1:S96-108, S5:S236-259, S22:S140-144, S37:S312 | ✅ |
| BR-exam-import-ai-008 | Đề Listening xuất bản ở trạng thái `draft` (chưa có file nghe); kỹ năng khác xuất bản `ready` | POST publish kỹ năng listening | FR-019 | S11:S379-380, S11-plan:S39 | ✅ |
| BR-exam-import-ai-009 | Một job = một lượt thử; retry luôn tạo JOB MỚI dùng lại file R2 (2 row cùng fileKey là chủ ý; job cũ còn làm lịch sử) | Bấm "Thử bóc tách lại AI" | FR-015 | S1:S526-541, S27-plan:S47 | ✅ |
| BR-exam-import-ai-010 | Skill `mixed` phải chọn kỹ năng cụ thể trước khi xuất bản | POST publish draft.skill = mixed | FR-019 | S11:S193-200 | ✅ |
| BR-exam-import-ai-011 | Org chưa có ví được tạo lười với 30 Credit Dùng thử khi lần đầu xem ví/tiêu Credit | GET ví hoặc lần import đầu | FR-021 | S4:S4117, S13:S84-93, S14:S34-38 | ✅ |
| BR-exam-import-ai-012 | Chỉ teacher/owner được tiêu Credit của tổ chức; role xem được phép đọc kết quả job/file của org mình | Mọi endpoint | FR-023 | S15:S89-103, S1:S372-376 | ✅ |
| BR-exam-import-ai-013 | Trần Credit cá nhân: hook `assertStaffCap` hiện là no-op (chờ TOS-49) — nghiệp vụ "còn hạn mức trần" CHƯA thực thi | Trước reserve | FR-005 | S13:S347-355, S1:S278, S40:S248 | ✅ (no-op) / 🟡 (OQ-5) |

## 6. Error Matrix

> Wording thật = chuỗi nguyên văn trong code (một nguồn chữ `EXAM_IMPORT_ERROR_MESSAGES` + text UI). R2: resolve câu thật tại catalog + throw-site.

| Error ID | Title | Trigger | Severity (🟡 ước lượng phân tích — không có trong code, xem OQ-1) | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-exam-import-ai-001 | Không đủ Credit (`E-selfomy-alignment-001`, HTTP 402, kèm `balance` + `available`) | Ví thiếu Credit khả dụng khi reserve (POST hoặc retry; POST còn xóa job + file R2 trước khi trả) | major | FR-005, FR-020 | Modal "Không đủ Credit" | Đóng, hoặc "Soạn đề thủ công" về `tests/new` | S4:S4136-4137, S4275-4276; S1:S306-325, S552-565; S31:S25-34 | ✅ |
| E-exam-import-ai-003 | Tệp không hợp lệ (`E-selfomy-alignment-003`, HTTP 400, kèm `reason: type\|size\|pages\|password`) | MIME lạ / quá 15 MB / PDF > 20 trang / PDF có mật khẩu / PDF hỏng — chặn ở client (không gọi API) lẫn server (trước tạo job + giữ Credit) | minor | FR-003 | Alert dropzone: thông điệp chung + dòng lý do cụ thể | Chọn tệp khác / tách nhỏ / bỏ mật khẩu | S4:S4138-4139, S4167-4172, S4277-4278; S25:S49-99; S1:S178-259 | ✅ |
| E-exam-import-ai-004 | AI thất bại — đã hoàn Credit (`E-selfomy-alignment-004`, HTTP 502, kèm `reason: timeout\|ai_error\|empty_result` + `jobId`) | Timeout 120s / extractor ném lỗi / 0 nhóm câu hỏi hợp lệ; cả sweep 150s (reason `timeout`) | major | FR-006, FR-007, FR-014, FR-016 | Panel `exam-import-failed-panel`: thông điệp nguyên văn + nhãn lý do + nút "Thử bóc tách lại AI" | Bấm thử lại (FR-015) hoặc nhập đề mới | S4:S4142-4143, S4177-4182, S4279-4280; S5:S23-53, S264-303; S30:S1-58 | ✅ |
| E-exam-import-ai-hard | Thất bại ghi job sau khi đã trừ (`EXAM_IMPORT_FAILED`, HTTP 502, kèm `jobId`, KHÔNG `reason`) | Settle thành công rồi lỗi ghi job; retry mark vẫn lỗi | critical (hiếm) | FR-005 | ErrorNotice fallback: "Có lỗi xảy ra khi nhập đề. Vui lòng thử lại." (cố ý KHÔNG dùng thông điệp E-004) | Nhập đề mới; Credit đã trừ đúng sổ cái | S4:S4144-4145, S4266-4267; S1:S96-108; S5:S236-259; S22:S140-144 | ✅ |
| E-exam-import-ai-disabled | Tính năng chưa cấu hình (`EXAM_IMPORT_DISABLED`, HTTP 503) | Binding `AI`/kho file vắng hoặc cờ `AI_ENABLED != "true"` | major | FR-002 | ErrorNotice: "Tính năng chưa cấu hình — liên hệ quản trị để bật Nhập đề AI." | Liên hệ quản trị bật cấu hình | S4:S4140-4141; S1:S163-173; S16:S18-24; S20:S530-531 | ✅ |
| E-exam-import-ai-404 | Job/file không tìm thấy (`exam_import_not_found`, HTTP 404) | `:id` không tồn tại hoặc thuộc org khác (GET job/file, retry, draft, publish) — cùng một mã | minor | FR-022, FR-023 | ErrorNotice: "Bản nháp không tồn tại hoặc đã bị xoá — hãy nhập đề mới." | Nhập đề mới | S4:S4146-4147; S1:S393-401, S430-437, S430-448, S491-498, S610-617, S705-712; S20:S516-517 | ✅ |
| E-exam-import-ai-409-retry | Job không retry được (`exam_import_not_retryable`, HTTP 409) | Retry khi job không ở `failed_refunded` | minor | FR-015 | ErrorNotice: "Lượt nhập đề này đã hoàn tất, không thể thử lại." | Về màn nhập đề | S4:S4148-4149; S1:S500-508; S20:S523-524 | ✅ |
| E-exam-import-ai-410 | File gốc đã mất (`exam_import_file_missing`, HTTP 410) | Retry nhưng file không còn trên R2 | minor | FR-015 | ErrorNotice: "Tệp đề gốc không còn trên kho lưu trữ — vui lòng tải lên lại tệp." | Upload lại tệp | S4:S4150-4151; S1:S509-519; S20:S519-521 | ✅ |
| E-exam-import-ai-409-state | Job chưa hoàn tất (`EXAM_IMPORT_INVALID_STATE`, HTTP 409) | PATCH draft / POST publish khi `importStatus != "completed"` | minor | FR-017, FR-018 | UI: "Không thể lưu bản nháp. Vui lòng thử lại." / "Không thể lưu vào Ngân hàng đề. Vui lòng thử lại." (map theo status, không đọc mã) | Thử lại sau khi job hoàn tất | S4:S4160-4161; S1:S619-627, S714-722; S20:S301, S557 | ✅ |
| E-exam-import-ai-review | Thiếu xác nhận rà soát (`REVIEW_CONFIRMATION_REQUIRED`, HTTP 422) | Còn câu needsReview (trên hợp nhất max(client, DB)) mà `reviewConfirmed` không đúng | minor | FR-018 | publishError: "Vui lòng tích xác nhận các câu gắn nhãn Cần rà soát lại trước khi lưu vào Ngân hàng đề." | Tích xác nhận rồi xuất bản lại | S4:S4152-4153; S11:S179-190; S20:S548-549 | ✅ |
| E-exam-import-ai-parts | Vượt số part (`TOO_MANY_PARTS`, HTTP 422, kèm `maxParts`) | Số part draft > số slot preset của kỹ năng | minor | FR-019 | publishError: "Số lượng part vượt quá giới hạn của kỹ năng đã chọn. Vui lòng gộp hoặc bớt part." | Gộp/bớt part | S4:S4154-4155; S11:S202-211, S260-267; S20:S550-551 | ✅ |
| E-exam-import-ai-mixed | Kỹ năng mixed (`SKILL_MIXED_NOT_ALLOWED`, HTTP 422) | Xuất bản khi draft.skill = mixed | minor | FR-019 | publishError: "Vui lòng chọn kỹ năng cụ thể (Reading, Listening, Writing hoặc Speaking) trước khi lưu vào Ngân hàng đề." | Chọn kỹ năng cụ thể | S4:S4156-4157; S11:S193-200; S20:S552-553 | ✅ |
| E-exam-import-ai-draft | Draft không hợp lệ (`INVALID_DRAFT`, HTTP 400/422, kèm `partIndex`/`questionIndex` khi publish) | Body JSON hỏng (400) / draft lệch schema (422) / câu thiếu stem/answer hoặc opts < 2 (publish, 422) | minor | FR-017, FR-019, FR-025 | publishError: "Một số câu hỏi chưa có nội dung hoặc đáp án hợp lệ. Vui lòng kiểm tra lại." | Sửa câu bị chỉ mục | S4:S4158-4159; S1:S629-658, S724-745; S11:S293-353; S20:S554-555 | ✅ |
| E-exam-import-ai-401 | Chưa đăng nhập (HTTP 401 `{error:"unauthorized"}`) | Không có kernelCtx (session hết hạn) | minor | FR-023 | (ngoài màn — middleware/lớp app) | Đăng nhập lại | S1:S157-158, S349-352, S377-379 | ✅ |
| E-exam-import-ai-403-role | Không đủ quyền (HTTP 403 `{error:"forbidden"}`) | Role không phải teacher/owner gọi endpoint tiêu Credit; Origin lạ trên endpoint JSON | minor | FR-023, FR-025 | (không có text riêng — HTTP thuần) | Đổi tài khoản | S1:S159-162, S141-148 | ✅ |

> Chú thích dãy ID: `E-selfomy-alignment-002` (QUOTA_EXHAUSTED) thuộc luồng AI grading (chấm bài) — không thuộc Error Matrix này, nên dãy ID nhảy từ E-001 sang E-003.

Client-side E-003 chi tiết nguyên văn (`apps/web/src/lib/exam-file-check.ts`): "Định dạng không hỗ trợ — chỉ nhận PDF, PNG, JPG, JPEG." (:36-39); "Tệp <X> MB vượt giới hạn 15 MB." (:42-45, format vi-VN dấu phẩy); "PDF <N> trang vượt giới hạn 20 trang." (:59-63); "Tệp PDF có mật khẩu — hãy bỏ mật khẩu hoặc đổi tệp khác." (:73-76); "Tệp PDF hỏng hoặc không đọc được cấu trúc." (:78-81). ✅ [S25]

Nhãn lý do E-004 nguyên văn (`import-failed-panel.tsx`): timeout → "Quá thời gian chờ 120 giây."; ai_error → "Dịch vụ AI gặp lỗi khi bóc tách."; empty_result → "AI không đọc được nhóm câu hỏi hợp lệ nào từ tệp." ✅ [S30:S8-12]

Thông báo trạng thái màn import: "Đang bóc tách (tối đa 120 giây)" (uploading) ✅ [S20:S373]; "Đã lưu bản nháp (0 Credit)." ✅ [S20:S299]; "Đã xuất bản vào Ngân hàng đề." / "Đã lưu bộ đề nháp — cần bổ sung file nghe trước khi giao bài." ✅ [S20:S322-327]; banner trùng: tiêu đề Alert "Phát hiện tệp trùng mã băm" + "với đề "<title>" đã bóc tách ngày <dd/MM/yyyy>." ✅ [S32:S24-33]; cảnh báo bản nháp hỏng: "Bản nháp hỏng hoặc không đọc được — hãy nhập đề mới." ✅ [S20:S448].

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-exam-import-ai-01 | Lượt import hợp lệ trừ đúng 5 Credit một lần | Sổ cái: đúng 1 dòng `reserved` −5 + 1 dòng `settled` cho cùng job; balance 30→25, held về 0 | 1 cặp log / job; test khóa | S38:S265-316, S40:S116-137 | ✅ |
| SC-exam-import-ai-02 | Bóc tách hoàn tất trong giới hạn 120 giây | Timeout kép 120s: extractor treo vẫn thoát hạn, job `failed_refunded` reason `timeout` | ≤ 120_000 ms | S4:S4123, S39:S135-219 | ✅ |
| SC-exam-import-ai-03 | Tệp trùng không tốn tiền | Re-upload cùng byte: extractor 0 lần, 0 dòng sổ cái mới, ví không đổi, 200 `{duplicateOf}` | 0 Credit / lần trùng | S38:S1152-1203 | ✅ |
| SC-exam-import-ai-04 | Tệp lỗi không tạo rác và không mất tiền | PDF 25 trang / có mật khẩu / 18 MB: 0 job, 0 log, 0 file R2, 400 E-003 | 0 job + 0 log | S38:S459-522 | ✅ |
| SC-exam-import-ai-05 | AI lỗi hoàn đủ Credit | Cặp `reserved` −5 + `released` +5; ví về đúng số dư trước; job `failed_refunded` E-004 | hoàn 100% | S38:S338-395, S41:S80-124 | ✅ |
| SC-exam-import-ai-06 | Job chết không kẹt Credit | Job `processing` 151s → lần chạm ví/job sau hoàn đúng 1 lần (gọi 2 lần vẫn 1 dòng released) | 1 lần hoàn | S38:S640-743, S39:S85 | ✅ |
| SC-exam-import-ai-07 | Bấm song song không âm ví | 2 reserve song song khi ví chỉ đủ 1 → đúng 1 thành công | 0 lần âm | S40:S179-208 | ✅ |
| SC-exam-import-ai-08 | Xuất bản không nhân bản bộ đề | Publish 2 lần tuần tự hoặc song song → 1 bộ đề, cùng testId | 1 test / job | S39(publish-to-bank.test):S219-288 | ✅ |
| SC-exam-import-ai-09 | Câu tin cậy thấp được rà soát trước khi lên đề | AC-003: khóa nút xuất bản tới khi xác nhận; API chặn 422 khi chưa xác nhận | 100% publish qua cổng | S41(ac-003):S16-110, S29:S59-79 | ✅ |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/exam-import-ai-reverse-erd.md`)

- **ExamImportJob** (`exam_import_job`) — một lượt nhập đề: tệp (key/tên/MIME/size/số trang), fingerprint SHA-256, `held_credits` (5), `import_status` (`processing|completed|failed_refunded`), `draft_json`, `error_code`, `error_reason`, `published_test_id`, timestamp. ✅ [S2][S43:mig-0051/0052/0053]
- **CreditWallet** (`credit_wallet`) — ví theo org: `balance`, `held` (khả dụng = balance − held), `plan_kind`, `plan_status`. ✅ [S3:S14-38]
- **CreditUsageLog** (`credit_usage_log`) — sổ cái append-only: `action_type` (`exam_import`), `credit_delta`, `tx_status` (`reserved|settled|released`), `ref_id` = jobId, `idempotency_key` UNIQUE. ✅ [S3:S40-61]
- **AssignmentTest / AssignmentTestPart / AssignmentPrompt** — đích xuất bản (Ngân hàng đề + bộ đề); test id tất định `test-import-<jobId>`. ✅ [S11:S371-508][S44:schema]
- **Draft (`ExtractedExamDraft`)** — giá trị (value object) trong `draft_json`, không phải bảng: title 1–200, skill enum 5 giá trị, timeLimitMinutes 1–300, 1–10 parts × (passage ≤ 20k + 1–40 câu: stem ≤ 500, ≤ 6 opts, answer ≤ 200, type, explanation ≤ 2000, confidence 0–1, needsReview do server tính). ✅ [S4:S4309-4362]

## 9. Flows (tóm tắt — chi tiết ở `srs/exam-import-ai-reverse-flows.md`)

- **F1 Nhập đề bằng AI (hạnh phúc)**: chọn tệp → kiểm 2 lớp → hash + lookup → POST raw-body → job `processing` + reserve 5 → R2 + AI (120s) → settle → job `completed` → đối chiếu 2 cột, `?job=`. ✅ [S1][S5][S9][S20]
- **F2 Chặn tệp lỗi (E-003)**: client fail-fast không gọi API; server kiểm sâu trước tạo job/giữ Credit. ✅ [S25:S28-99][S1:S178-259]
- **F3 Thiếu Credit (E-001)**: reserve thua → xóa job (+file R2 ở POST) → 402 kèm balance/available → modal. ✅ [S1:S306-325][S31]
- **F4 AI thất bại + retry (E-004)**: release đủ 5 → `failed_refunded` + reason → panel lỗi → retry tạo job mới tái dùng file R2. ✅ [S5:S236-303][S1:S455-583]
- **F5 Trùng mã băm (0 Credit)**: lookup trước upload + lớp POST; banner + mở lại `?job=<id cũ>` (không clone). ✅ [S7][S24][S32]
- **F6 Chỉnh sửa → xác nhận → xuất bản**: PATCH draft (0 Credit, bảo toàn nhãn) → cổng xác nhận 2 lớp → publish batch nguyên tử idempotent (listening → `draft`). ✅ [S1:S585-776][S11]
- **F7 Dọn job treo (sweep lười)**: mọi lần chạm POST/GET job/ví → quét `processing` > 150s → release + `failed_refunded` (hoặc `completed` nếu crash-sau-settle). ✅ [S6][S14]
- **Lưu ý mô hình bất đồng bộ:** không có Queue/cron — request POST giữ mở tối đa 120s; "chờ — poll" thực chất là mở lại `?job=` (GET `/:id`) và sweep lười dựa trên request kế tiếp. ✅ [S5:S120-131][S6:S17-29] → OQ-7

## 10. Screens (tóm tắt)

- **[6] `/assignments/tests/import` — "Nhập đề thi bằng AI"** (route `_auth`, gate cờ AI): breadcrumb "Bài tập › Nhập đề AI"; PageHead + `CreditCostBadge`; dropzone (kéo-thả/bấm, accept theo `EXAM_IMPORT_MIME`); trạng thái uploading (`role="status"`, progress giả lập); banner trùng; panel lỗi E-004 + retry; hộp thoại hết Credit; workspace 2 cột (≥1024px) / 2 tab (<1024px, tab bar sticky đáy); trái `SourceDocumentViewer` (pdf.js canvas + indicator "Trang x / y" + zoom 50–200%; ảnh `<img>`); phải `ExtractedExamPanel` (tên đề, kỹ năng, thời gian, passage Tiptap, `QuestionReviewCard` từng câu với nhãn vàng "(!) Cần rà soát lại"), `ReviewConfirmation`, cụm nút "Lưu bản nháp" / "Lưu vào Ngân hàng đề". Máy trạng thái màn: idle → uploading → done/error. ✅ [S20:S41-52, S60-71, S345-501][S26 các component]
- **Điểm chạm trên `tests/new`**: CTA link "Nhập đề bằng AI (5 Credit)" trên PageHead (ẩn khi cờ AI tắt). ✅ [S21:S29][S34]
- **Điểm nhận kết quả**: sau publish điều hướng `/assignments/tests/$id` (thuộc feature bộ đề — boundary). ✅ [S20:S328-331]

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Chạy trên Cloudflare Workers: dùng binding `AI` (Workers AI) + bucket R2 `MEDIA`; không có Queue/cron → sweep lười | Nền tảng deploy (alchemy) | S19:S210-214, S6:S17-29 | ✅ |
| Kích thước/tệp: PDF/PNG/JPEG, ≤ 15 MB, PDF ≤ 20 trang, không mật khẩu | Hằng contract `EXAM_IMPORT_LIMITS`/`EXAM_IMPORT_MIME` | S4:S4120-4132 | ✅ |
| Model AI cố định `@cf/meta/llama-4-scout-17b-16e-instruct` (hằng đổi nhanh) | `EXAM_EXTRACT_MODEL` | S9:S56, S27-plan:S105 | ✅ / 🟡 (OQ-6) |
| Cờ mặc định TẮT: `AI_ENABLED` default "false" (infra), web mirror `VITE_AI_ENABLED`; playwright e2e tự bật "true" | Cấu hình hạ tầng | S19:S121-123, S23:S9, S42:S95 | ✅ |
| Thông điệp lỗi là contract chung (một nguồn chữ trong contracts, web + test dùng lại) | `EXAM_IMPORT_ERROR_MESSAGES` | S4:S4262-4281, S30:S24-26 | ✅ |
| CSRF tự lo cho endpoint JSON (route mount ngoài kernelRoutes) | `checkJsonWriteCsrf` | S1:S141-154 | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Binding `AI` (Workers AI) + biến `AI_ENABLED=true` | Infra (alchemy) | 503 DISABLED — cả tính năng không dùng được | S19:S210-214, S16 | ✅ |
| Bucket R2 `MEDIA` | Infra | 503 DISABLED (không lưu/đọc file đề) | S17:S131-138 | ✅ |
| Ngân hàng đề `assignment_prompt`/`assignment_test`/`assignment_test_part` + preset slot | Feature bộ đề (assignment-tests) | Không xuất bản được (422/batch fail) | S11:S13-17, S192-211 | ✅ |
| Gói mua/Top-up Credit (màn [10]) | TOS-43 (chưa làm) | E-001 chỉ dừng ở "Soạn đề thủ công" | S31:S5-10, S27-plan:S53 | ✅ (Gap G-1) |
| Trần Credit cá nhân | TOS-49 (chưa làm) | Hook no-op — rule "hạn mức trần" chưa chạy | S13:S347-355 | ✅ (OQ-5) |
| Cờ build web `VITE_AI_ENABLED=true` | Build/deploy web | CTA ẩn + route redirect dù server bật | S23:S9, S20:S42-46 | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Workers AI không cần API key ngoài (binding) | NFR-006, việc bật production (OQ-2) | S19:S210-212 | ✅ |
| SHA-256 byte-giữ-đúng = định danh nội dung tệp (không gần đúng) | BR-003 (scan lại cùng đề vẫn tính trùng/nhầm) | S10:S5-10, S25-plan:S44 | ✅ |
| `confidence` do model tự chấm là đủ tin để gắn nhãn rà soát | FR-008 chất lượng nhãn | S4:S4303-4308 | 🟡 (OQ-6) |
| `crypto.subtle` có ở browser production (secure context) | FR-011 fail-open → cứ upload (server vẫn chặn trùng) | S24:S4-16 | ✅ |
| Request HTTP sống ≥ thời gian extract (120s) trên Workers | F1 — nếu platform cắt sớm hơn, job treo chờ sweep 150s | S5:S120-131, S27-plan:S52 | 🟡 (OQ-7) |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap + Conflict ở [`reverse-gaps.md`](./reverse-gaps.md). Trích OQ blocking:

- [ ] OQ-1: Ưu tiên P0/P1/P2 của từng FR không có trong code — chỉ plan đặt `priority: P0` ở mức plan; cần chủ sản phẩm chốt lại bảng ưu tiên. 🟡
- [ ] OQ-2: `AI_ENABLED`/`VITE_AI_ENABLED` mặc định "false" — môi trường nào (đặc biệt production) đang bật? Không tìm thấy cấu hình env thực trong repo. 🟡
- [ ] OQ-3: Không có màn danh sách/job cũ — người dùng chỉ quay lại được qua URL `?job=`; người dùng mất URL thì không có đường dẫn tìm lại bản nháp. Chấp nhận chủ ý hay cần tính năng "lịch sử nhập đề"? 🟡
- [ ] OQ-5: Trần Credit cá nhân (US-010/TOS-49) chưa thực thi (no-op) — có yêu cầu nghiệp vụ đang kỳ vọng nó không? 🟡
- [ ] OQ-6: Chất lượng bóc tách thực tế của model + ngưỡng 0.8 chưa có phép đo nào trong code; spec gốc (selfomy-alignment) không còn trong repo để đối chiếu. 🟡
- [ ] OQ-7: Mô hình request-đồng-bộ 120s (không Queue) — giới hạn runtime (subrequest, thời gian sống request) và hành vi người dùng đóng tab đã được chấp nhận dạng "sweep lười"; có cần nâng cấp Queue không? 🟡
