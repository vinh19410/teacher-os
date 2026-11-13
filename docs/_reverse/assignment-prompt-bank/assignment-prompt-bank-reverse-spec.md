---
type: reverse-srs
feature: assignment-prompt-bank
status: draft
updated: 2026-11-11
confidence_summary: "✅121 🔵4 🟡1 (trong spec; toàn bộ 14 file: ✅139 🔵9 🟡17 — đếm theo luật batch sau audit) — OQ 11"
links:
  - ./reverse-sources.md
  - ./reverse-gaps.md
  - ./srs/assignment-prompt-bank-reverse-flows.md
  - ./srs/assignment-prompt-bank-reverse-states.md
  - ./srs/assignment-prompt-bank-reverse-erd.md
  - ./usecases/assignment-prompt-bank-reverse-usecase-index.md
---

# assignment-prompt-bank — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn (code khẳng định + cite) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (OQ kèm theo).

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) — S1..S31; nguồn chủ lực: route server `apps/server/src/routes/assignments/index.ts`, schema `packages/db/src/schema/assignment-prompt.ts`, hợp đồng `packages/api/src/contracts.ts`, 3 trang web `/assignments`, `/assignments/new`, `/assignments/preview`, 4 spec E2E và bộ test khóa nội dung server.
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md) — OQ-1..OQ-11, Gap-1..Gap-8, Conflict-1..Conflict-2, Inferred-1..Inf-5.
- **Nguyên tắc:** CODE = PROOF. Mỗi nhãn ✅ kèm cite `path:line` đầy đủ (repo-relative). Không chạy test — chỉ đọc test active (đã grep xác nhận không có `.skip/.todo/.only` trong các spec/test của feature).
- **Complexity flag (plan):** state-machine — trạng thái `status` (draft↔ready) + 2 trạng thái khóa nội dung dẫn xuất; chi tiết ở `srs/assignment-prompt-bank-reverse-states.md`.
- **Phạm vi ranh giới plan:** gán đề cho lớp/học viên (`class_assignment`) thuộc enrollment-lifecycle/classes — chỉ lấy điểm chạm; bài nộp/chấm (grading) là feature khác — chỉ lấy điểm chạm; `assignment-test` (bộ đề) là feature kế bên — phân định bằng bằng chứng code (bảng/route riêng).

### 0.3 Khác biệt với tài liệu chính (feature trùng doc hiện có)

Doc chính: `docs/project-overview-pdr.md` dòng 20 (mô tả `assignment_prompt`).

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md:20`) | Đề xuất |
|------|------------------------|---------------------------------------------------|---------|
| Phạm vi khóa Writing | Phần Writing khóa khi đề thuộc `class_assignment` HOẶC `assignment_test_part` HOẶC `study_pack_item` — 3 probe DB riêng tại `apps/server/src/routes/assignments/index.ts:319-363`, 409 `WRITING_SECTION_LOCKED` | "immutable once referenced by `class_assignment`, `assignment_test_part`, or `study_pack_item`" | Khớp — không cần CR |
| Khóa nội dung theo attempt | Đề có `quiz_attempt` (qua lượt giao `class_assignment.prompt_id` hoặc đề tự luyện `assignment_test_part.prompt_id`) chỉ sửa được metadata — 409 `PROMPT_CONTENT_LOCKED` (`apps/server/src/routes/assignments/index.ts:428-463`) | Doc không nêu cơ chế content-lock theo attempt (chỉ nêu snapshot đề khi bắt đầu làm ở dòng 27) | Bổ sung 1 câu vào PDR `/gap` |
| Bỏ đề khỏi ngân hàng | Không có route DELETE cho `/assignments/prompts` và không có nút xóa trên UI (negative search — `reverse-gaps.md` Gap-1) | Doc không nói về xóa đề | Xác nhận OQ-1 |
| Ngân hàng giáo viên loại trừ đề thư viện | Snapshot chỉ lấy prompt có `library_ref IS NULL` và không phải seed demo (`apps/server/src/routes/snapshot.ts:341-346`) | Doc không nêu exclusion này | Bổ sung `/gap` |
| Đề trộn dạng | Type riêng từng câu (`assignmentQuestionSchema.type` nullish, `packages/api/src/contracts.ts:728-734`), rule theo type hiệu dụng `packages/api/src/contracts.ts:1047-1059` | Doc không nêu | Không cần CR |

## 1. Scope

Feature "Ngân hàng đề" (assignment-prompt-bank, phát hành lần đầu #202) là kho đề IELTS dùng chung của một tổ chức (org-scoped): giáo viên soạn đề cho 6 kỹ năng (Writing, Reading, Listening, Speaking, Grammar, Vocabulary), lưu vào ngân hàng ở một trong hai trạng thái **Sẵn sàng giao (ready)** hoặc **Bản nháp (draft)**, duyệt/tìm/lọc danh sách, xem trước góc nhìn học viên, và chỉnh sửa đề đã lưu. Một đề trong ngân hàng **không gắn** với học viên hay lớp nào — việc giao đề tạo row `class_assignment` ở luồng riêng tại trang Lớp học. ✅ [S2] (`packages/db/src/schema/assignment-prompt.ts:12-16`), ✅ [S5] (`apps/web/src/routes/_auth/assignments/new.tsx:1094-1098`), ✅ [S24] (`apps/web/src/components/assignments/prompt-preview-aside.tsx:202-211`).

Feature bao gồm: soạn đề theo catalog IELTS (phần thi + dạng đề, `packages/api/src/contracts.ts:355-403`), gate "sẵn sàng giao" hai lớp (client mirror + server schema), khóa đáp án chấm tự động, ngân hàng lựa chọn cho dạng matching, ghim nhãn ảnh, đề gộp kèm phần Writing, tự động lưu nháp trên máy giáo viên, xem trước, chỉnh sửa có khóa nội dung theo lượt làm bài. ✅ [S3] [S5] [S7].

**Boundary (out of scope — chỉ điểm chạm):**

- Giao đề cho lớp/học viên: `class_assignment` + `class_assignment_target` — thuộc feature classes/enrollment-lifecycle. Điểm chạm: server chỉ nhận đề `ready` (`apps/server/src/routes/kernel.ts:1540-1542`), UI lớp chỉ liệt kê đề ready (`apps/web/src/components/classes/class-assignments-tab.tsx:221`), và lượt giao làm khóa phần Writing của đề. ✅ [S20] [S30]
- Bài nộp/chấm (`quiz_attempt`, bảng `assignment`, grading AI): feature khác. Điểm chạm: tồn tại `quiz_attempt` là điều kiện kích hoạt khóa nội dung đề; đề hybrid đẩy phần Writing vào luồng chấm. ✅ [S1] (`apps/server/src/routes/assignments/index.ts:428-463`)
- Bộ đề trọn vẹn (`assignment_test` / `assignment_test_part`): feature kế bên `assignment-tests`, route riêng `/api/assignments/tests` (`apps/server/src/routes/assignments/tests.ts:20-29`). Điểm chạm: PATCH prompt được test-builder tái sử dụng làm "nguyên liệu nút Apply" và là một trong ba điều kiện khóa Writing. ✅ [S1] (`apps/server/src/routes/assignments/index.ts:195-199,330-343`), ✅ [S27]
- Tự học/study pack: `study_pack_item (source_kind='org_prompt')` là điều kiện khóa Writing thứ ba; prompt vật hóa từ thư viện có `library_ref` bị ẩn khỏi ngân hàng giáo viên. ✅ [S1] (`apps/server/src/routes/assignments/index.ts:344-362`), ✅ [S22] (`apps/server/src/routes/snapshot.ts:341-346`)
- Bảng `assignment` (điểm per-học viên, grading-only, server-fed): không thuộc feature — route `POST /api/assignments/:id/grade` nằm cùng router nhưng là luồng chấm. ✅ [S1] (`apps/server/src/routes/assignments/index.ts:48-50,158-193`)

## 2. Actors & Stakeholders

| Actor | Loại | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|------|----------|--------------|-------|------|
| Giáo viên (chủ/members org, role `teacher`) | người | Soạn, lưu, duyệt, tìm kiếm, chỉnh sửa, xem trước đề trong ngân hàng của tổ chức | Có | `apps/server/src/app.ts:296-301` (kernelCtx orgId+role), `apps/server/src/app.ts:283-291` (bootstrap org đầu tiên role "teacher") | ✅ |
| Thành viên org khác giáo viên (vd trợ giảng, role khác) | người | Cùng quản lý ngân hàng đề của org (không bị chặn riêng trên route /assignments) | Có (không phân biệt role) | `apps/server/src/routes/kernel.ts:448-453` (snapshot không lọc role) + `apps/server/src/routes/assignments/index.ts:199-201` (PATCH chỉ check kernelCtx) — assignments không có `requireFinanceRole`/role gate, `apps/server/src/routes/kernel.ts:209-211` (chỉ `/invoices` đòi quyền tài chính) | 🔵 (OQ-9) |
| Học viên (role `student`) | người | Không truy cập được app giáo viên/API kernel | Không (bị chặn 403) | `apps/server/src/app.ts:222-232` (403 STUDENT_ON_TEACHER_APP) | ✅ |
| Tài khoản admin hệ thống | hệ thống/người | Không bootstrap org trên kernel tree — chỉ làm việc ở `/api/admin` | Không | `apps/server/src/app.ts:234-240` (403 ADMIN_ON_TEACHER_APP) | ✅ |
| Học viên (gián tiếp, qua lượt giao) | ngoài | Làm bài từ đề đã giao; tồn tại attempt khóa nội dung đề | Không (boundary — chỉ trigger khóa) | `apps/server/src/routes/assignments/index.ts:428-453` | ✅ |
| Trang Lớp học (feature classes) | hệ thống (UI nội bộ) | Tiêu thụ đề `ready` để giao | Không (touchpoint) | `apps/server/src/routes/kernel.ts:1540-1542`, `apps/web/src/components/classes/class-assignments-tab.tsx:221` | ✅ |
| Test builder (feature assignment-tests) | hệ thống (UI nội bộ) | Lắp prompt vào slot bộ đề qua PATCH prompt | Không (touchpoint) | `apps/server/src/routes/assignments/index.ts:195-199`, `apps/web/src/components/assignment-tests/test-builder-shell.tsx:972` | ✅ |

## 3. Functional Requirements (FR)

> Cột Priority là suy đoán của phân tích viên từ độ phủ E2E/test (code không nói ưu tiên) → OQ-6. Nhãn cột "Nhãn" bọc phần Description đã cite.

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-APB-001 | Soạn đề theo catalog IELTS 6 kỹ năng | Giáo viên chọn kỹ năng (writing/reading/listening/speaking/grammar/vocabulary), phần thi và dạng đề từ catalog tĩnh (`ASSIGNMENT_PART_TYPES`: writing task1/task2, reading p1-p3, listening s1-s4, speaking part1-3, grammar g1, vocabulary v1; mỗi part có danh sách type hợp lệ) | P0 | E2E + unit | `packages/api/src/contracts.ts:337-403`, `packages/ui/src/components/assignments/editor/assignment-presets.ts:133-358` | ✅ |
| FR-APB-002 | Lưu đề "Sẵn sàng giao" vào ngân hàng | Submit form ở trạng thái ready tạo row `assignment_prompt` mới của org (`status="ready"`), trả `{id}` 201; đề chưa gắn lớp/học viên nào | P0 | E2E | `apps/server/src/routes/assignments/index.ts:113-153`, `apps/e2e/specs/assignment-prompt-create.spec.ts:18-68` | ✅ |
| FR-APB-003 | Lưu bản nháp riêng tư | Trạng thái "Bản nháp" (`status="draft"`) lưu được với nội dung chưa đầy đủ; bản nháp không hiện khi giao từ trang Lớp học | P0 | E2E | `packages/api/src/contracts.ts:828-830,864`, `apps/e2e/specs/assignment-prompt-create.spec.ts:70-90`, `apps/web/src/components/assignments/assignment-presets.ts` (actionCopyFor sub "Bản nháp chưa hiện khi giao từ trang Lớp học." tại `apps/web/src/routes/_auth/assignments/new.tsx:375-382`) | ✅ |
| FR-APB-004 | Gate "sẵn sàng giao" 2 lớp | Client chặn lưu trước (danh sách mục thiếu, focus vào mục đầu) và server từ chối bằng schema strict + superRefine (invalid part/type, audio, đáp án, ảnh/ghim, bank, cue topic...) | P0 | E2E + unit + API test | client: `apps/web/src/routes/_auth/assignments/new.tsx:141-305,836-844,1141-1172`; server: `packages/api/src/contracts.ts:872-1124`, `apps/server/src/routes/assignments/index.ts:96-99` | ✅ |
| FR-APB-005 | Duyệt ngân hàng: lọc + tìm + đếm | Danh sách đề lọc theo kỹ năng và phần thi (chip có số đếm theo query hiện tại), tìm kiếm theo tiêu đề/nguồn/tên dạng; bộ lọc sống trong URL (?q= &skill= &part=); hiển thị "Đang hiện X / Y đề" và trạng thái rỗng | P0 | E2E | `apps/web/src/routes/_auth/assignments/index.tsx:30-45,47-55,105-159,175-211,246-257,416-438,443-452`, `apps/e2e/specs/assignment-bank.spec.ts:9-120` | ✅ |
| FR-APB-006 | Xem trước góc nhìn học viên | Trang `/assignments/preview` hiển thị bài giấy học viên + tab mô phỏng làm bài; dùng cho cả đề đang soạn (handoff qua sessionStorage) và đề đã lưu (?id=); bài làm mô phỏng không được lưu | P1 | E2E | `apps/web/src/routes/_auth/assignments/preview.tsx:19-66`, `apps/e2e/specs/assignment-prompt-create.spec.ts:92-140` | ✅ |
| FR-APB-007 | Chỉnh sửa đề đã lưu | `/assignments/new?promptId=` nạp đề vào form và PATCH từng phần (`update-assignment-prompt` → `PATCH /api/assignments/prompts/:id`); skill/part không được sửa sau khi tạo | P0 | E2E/test-builder + unit | `apps/web/src/routes/_auth/assignments/new.tsx:537-545,846-926`, `apps/web/src/lib/repos/kernel.ts:302-309`, `packages/api/src/contracts.ts:1129-1140` | ✅ |
| FR-APB-008 | Khóa nội dung đề đã có lượt làm bài | Đề có `quiz_attempt` (trực tiếp qua lượt giao lớp hoặc gián tiếp qua bộ đề tự luyện) chỉ được sửa metadata title/band/source/status; mọi field nội dung phải y nguyên value (so trim 2 phía, questions/optionBank so cấu trúc) mới qua, không thì 409 `PROMPT_CONTENT_LOCKED` | P0 | API test | `apps/server/src/routes/assignments/index.ts:376-463`, `apps/server/src/routes/assignments/prompt-content-lock.test.ts:272,295,329,401,425,464,493,519` | ✅ |
| FR-APB-009 | Khóa phần Writing của đề đã được dùng | Payload `writing` thay đổi (kể cả gỡ null) trên đề thuộc `class_assignment` / `assignment_test_part` / `study_pack_item` → 409 `WRITING_SECTION_LOCKED`, kiểm tra trước content-lock | P0 | API test | `apps/server/src/routes/assignments/index.ts:296-374`, `apps/server/src/routes/assignments/prompt-content-lock.test.ts:555` | ✅ |
| FR-APB-010 | Tự động lưu nháp trên máy giáo viên | Form soạn (không phải chế độ sửa) autosave vào localStorage sau 1000ms im lặng; draft có schema-version, TTL 7 ngày, cap 512KB; khi quay lại hiện banner "Đã phục hồi bản nháp" với Tiếp tục/Hủy; draft bị clear khi lưu thành công/xem trước | P1 | E2E + unit | `apps/web/src/routes/_auth/assignments/new.tsx:687-699,774-785,969-978`, `apps/web/src/lib/assignment-draft-store.ts:15-23,133-183`, `apps/e2e/specs/assignment-prompt-create.spec.ts:380-435` | ✅ |
| FR-APB-011 | Xác nhận trước khi đổi cấu trúc đề | Đổi kỹ năng/phần thi/dạng đề khi đã có nội dung soạn phải qua `window.confirm`; từ chối giữ nguyên dữ liệu; chấp nhận thì áp rule chuyền dữ liệu (transcript giữ trong cùng kỹ năng, option bank giữ giữa 2 dạng bankable cùng kỹ năng, intro/cue/imageUrl reset) | P1 | E2E + unit | `apps/web/src/routes/_auth/assignments/new.tsx:747-773`, `apps/web/src/components/assignments/composer-transitions.ts:46-60,110-151`, `apps/e2e/specs/assignment-prompt-create.spec.ts:476-580` | ✅ |
| FR-APB-012 | Nhãn trạng thái trên danh sách đề | Hàng đề hiển thị: draft → "Bản nháp"; đã giao cho >0 lớp → "Đã dùng N lớp" (N = số lớp distinct qua `class_assignment`); ready chưa dùng → "Sẵn sàng" | P1 | unit + E2E | `apps/web/src/components/assignments/assignment-status.ts:198-206`, `apps/web/src/routes/_auth/assignments/index.tsx:162-170,469`, `apps/e2e/specs/assignment-bank.spec.ts:55-56` | ✅ |
| FR-APB-013 | Đề lưu ngân hàng chưa giao — giao ở trang Lớp học | Lưu đề chỉ đưa vào ngân hàng (thông báo tường minh "chưa được giao lớp"); giao bài thực hiện ở trang Lớp học và chỉ nhận đề ready (server 400 "prompt not ready" nếu không) | P0 | E2E | `apps/web/src/components/assignments/create-success-card.tsx:60-65`, `apps/web/src/components/assignments/prompt-preview-aside.tsx:202-211`, `apps/server/src/routes/kernel.ts:1540-1542` | ✅ |
| FR-APB-014 | Đề gộp kèm phần Writing | Đề kỹ năng tự chấm (reading/listening/grammar/vocabulary) có thể đính 1 phần Writing (part/type theo catalog writing + nội dung prompt bắt buộc); `writing_part IS NOT NULL` đánh dấu đề gộp; gỡ Writing qua `writing=null` | P1 | unit + schema | `packages/api/src/contracts.ts:765-801,865-868`, `packages/db/src/schema/assignment-prompt.ts:51-54`, `apps/web/src/lib/repos/assignment-prompts.test.ts:122-169` | ✅ |
| FR-APB-015 | Giới hạn kích thước request ghi | POST/PATCH trên router assignments bị chặn body > 256KB (bodyLimit) | P2 | phân tích | `apps/server/src/routes/assignments/index.ts:63-68` | ✅ |
| FR-APB-016 | Đối chiếu trung thực sau lưu | Khi kết quả ghi là committed/outcome-unknown, UI chỉ báo thành công sau khi refresh snapshot và chứng minh được dữ liệu đã lưu thật (create: tìm row theo title+skill; edit: đối chiếu payload đã submit với row snapshot); ngược lại giữ form và báo lưu lại | P1 | unit | `apps/web/src/lib/use-kernel-form-submit.ts:66-113`, `apps/web/src/routes/_auth/assignments/new.tsx:909-921,992-1051` | ✅ |
| FR-APB-017 | Đề trộn nhiều dạng câu hỏi | Từng câu có thể khai `type` riêng (thuộc catalog của part); rule answer-choice/option-bank áp theo type hiệu dụng (type câu ?? type đề) | P1 | schema + unit | `packages/api/src/contracts.ts:728-734,899-908,1047-1059,1148-1164`, `apps/server/src/routes/assignments/index.ts:258-281` | ✅ |
| FR-APB-018 | Ngân hàng lựa chọn cho dạng matching | (skill,type) bankable (reading headings/info/sentend/features; listening map/match2; vocabulary match) có bank 0–8 mục lưu `option_bank`; rule 2..8 mục + phủ đủ câu + nhãn trong bank + sentend mỗi nhãn 1 lần chỉ gate ready | P1 | schema + E2E | `packages/api/src/contracts.ts:484-505,1060-1123`, `apps/e2e/specs/assignment-prompt-reading-types.spec.ts:203,290` | ✅ |
| FR-APB-019 | Ghim nhãn trên ảnh | Reading `diagram` + Listening `map` (skill-qualified) cần ảnh https khi ready và mỗi câu có pin toạ độ 0-100% trên ảnh | P1 | schema + E2E | `packages/api/src/contracts.ts:667-690,977-999`, `apps/e2e/specs/assignment-prompt-map-listening.spec.ts:12` | ✅ |
| FR-APB-020 | Giải thích đáp án từng câu | Mỗi câu có thể có `explanation` rich-text (≤2000 ký tự thường / 5000 ký tự raw), giữ qua preview + test-builder update, chuyển tới review học viên; không xuất hiện trên payload đang làm bài | P2 | E2E | `packages/api/src/contracts.ts:749-754`, `apps/e2e/specs/assignment-prompt-create.spec.ts:608-767` | ✅ |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-APB-001 | security | Mọi request ghi vào router assignments phải có Origin nằm trong danh sách cho phép (CSRF defense, SameSite=None cookie) và Content-Type JSON; form post chết ở content-type trước khi parse | P0 | API test (origin lạ → 403) | `apps/server/src/routes/kernel.ts:189-211`, `apps/server/src/routes/assignments/index.ts:80-89` | ✅ |
| NFR-APB-002 | security/privacy | Đề draft không bao giờ tới học viên: server chặn giao đề draft (400 "prompt not ready"); UI lớp chỉ liệt kê ready | P0 | API test | `apps/server/src/routes/kernel.ts:1540-1542`, `apps/web/src/components/classes/class-assignments-tab.tsx:221` | ✅ |
| NFR-APB-003 | security | Đáp án (answer key) không rò trong preview: E2E kiểm đếm bằng 0 chuỗi đáp án trên màn hình sau lưu; preview là mô phỏng client-side không lưu bài | P1 | E2E leak-check | `apps/e2e/specs/assignment-prompt-create.spec.ts:189-195`, `apps/web/src/routes/_auth/assignments/preview.tsx:66-72` | ✅ |
| NFR-APB-004 | usability | Bộ lọc và từ khóa tìm kiếm giữ nguyên qua reload/back/share (URL search params); giá trị mặc định không lên URL | P1 | E2E | `apps/web/src/routes/_auth/assignments/index.tsx:31-45,77-84,147-159` | ✅ |
| NFR-APB-005 | performance | Tìm kiếm debounce 300ms mới đẩy lên URL (không điều hướng mỗi phím); autosave debounce 1000ms | P1 | unit/E2E | `apps/web/src/routes/_auth/assignments/index.tsx:147-159`, `apps/web/src/routes/_auth/assignments/new.tsx:687-699` | ✅ |
| NFR-APB-006 | reliability/robustness | Dữ liệu hỏng không làm vỡ UI: questions/optionBank JSON hỏng → rỗng + warn log; status lạ → draft; optionBank hơn 8 mục cắt về 8; draft hỏng/hết hạn bị drop | P1 | unit | `apps/server/src/routes/snapshot.ts:155-232`, `apps/web/src/lib/repos/assignment-prompts.ts:27-30`, `apps/web/src/lib/assignment-draft-store.ts:159-183` | ✅ |
| NFR-APB-007 | compatibility | Tương thích đề legacy: cột `task`/`genre` giữ làm fallback hiển thị khi thiếu skill/part/type; giá trị thiếu được suy từ cột cũ cả khi đọc lẫn lưu | P1 | unit | `packages/db/src/schema/assignment-prompt.ts:15-16,25-26`, `apps/web/src/routes/_auth/assignments/index.tsx:58-65`, `apps/web/src/routes/_auth/assignments/new.tsx:602-605` | ✅ |
| NFR-APB-008 | accessibility | Danh sách dùng role listbox + aria-pressed, số đếm có aria-live="polite", thông báo thiếu mục là role="alert" với nút nhảy tới từng trường, chip trạng thái có aria-label | P1 | unit/E2E | `apps/web/src/routes/_auth/assignments/index.tsx:417-428,454-457`, `apps/web/src/routes/_auth/assignments/new.tsx:1143-1171`, `apps/e2e/specs/assignment-prompt-create.spec.ts:176-178` | ✅ |

## 5. Business Rules (BR)

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-APB-001 | Một đề thuộc đúng 1 tổ chức; xóa org xóa đề (FK cascade); không có FK student/class trên đề | Mọi thao tác | FR-APB-002 | `packages/db/src/schema/assignment-prompt.ts:11-16,22-24` | ✅ |
| BR-APB-002 | Trạng thái đề chỉ là "draft" hoặc "ready"; default "draft" | Tạo/mới tạo row | FR-APB-002/003 | `packages/db/src/schema/assignment-prompt.ts:50`, `packages/api/src/contracts.ts:864` | ✅ |
| BR-APB-003 | Band điểm mục tiêu chỉ nhận 5.0–8.0 bước 0.5, mặc định "7.0"; với form mới, band mặc định theo trình độ lớp (nếu đến từ ?classId của lớp IELTS) | Tạo/sửa đề | FR-APB-001 | `packages/api/src/contracts.ts:815-825`, `apps/web/src/components/assignments/assignment-presets.ts:12-58`, `apps/web/src/routes/_auth/assignments/new.tsx:550-556` | ✅ |
| BR-APB-004 | Đề 4 kỹ năng tự chấm (reading/listening/grammar/vocabulary) ở ready phải có đáp án cho mọi câu | Lưu ready | FR-APB-004 | `packages/api/src/contracts.ts:1006-1032`, `apps/web/src/routes/_auth/assignments/new.tsx:291-302` | ✅ |
| BR-APB-005 | Listening ở ready phải có tên file nghe | Lưu ready | FR-APB-004 | `packages/api/src/contracts.ts:959-965`, `apps/web/src/routes/_auth/assignments/new.tsx:233-243` | ✅ |
| BR-APB-006 | Reading `diagram` / Listening `map` ở ready cần ảnh (https) + ghim trên mỗi câu; writing task1 không bao giờ bị gate ảnh dù trùng type id `map` | Lưu ready | FR-APB-004/019 | `packages/api/src/contracts.ts:667-690,977-999` | ✅ |
| BR-APB-007 | Option bank chỉ hợp lệ cho (skill,type) bankable; tối đa 8 mục, mỗi mục 1–200 ký tự; ready cần ≥2 mục và phủ đủ số câu bankable; sentend mỗi nhãn dùng đúng 1 lần | Lưu (item-level cả draft, bank↔answers chỉ ready) | FR-APB-018 | `packages/api/src/contracts.ts:852-862,1060-1123`, `apps/web/src/components/assignments/composer-transitions.ts:161-212` | ✅ |
| BR-APB-008 | Câu dạng gap ở ready phải có đúng 1 chỗ trống `____` | Lưu ready | FR-APB-004 | `packages/api/src/contracts.ts:1014-1024`, `apps/web/src/components/assignments/composer-transitions.ts:236-241` | ✅ |
| BR-APB-009 | Writing cần nội dung đề; Reading cần passage + ≥1 câu có nội dung; Listening/Grammar/Vocabulary cần ≥1 câu; Speaking part2 cần cue topic, part khác cần prompt | Lưu (create) | FR-APB-004 | `packages/api/src/contracts.ts:926-976,1033-1046`, `apps/web/src/routes/_auth/assignments/new.tsx:165-217` | ✅ |
| BR-APB-010 | Phần Writing đính kèm chỉ hợp lệ trên kỹ năng tự chấm; writing part/type phải thuộc catalog writing; writing prompt bắt buộc | Gắn writing | FR-APB-014 | `packages/api/src/contracts.ts:770-801,920-925`, `apps/server/src/routes/assignments/index.ts:297-303` | ✅ |
| BR-APB-011 | Mảng questions chỉ hợp lệ cho kỹ năng auto (reading/listening/grammar/vocabulary) | Gửi questions | FR-APB-001 | `packages/api/src/contracts.ts:909-919`, `apps/server/src/routes/assignments/index.ts:282-292` | ✅ |
| BR-APB-012 | Tối đa 40 câu một đề; stem ≤500 ký tự; đáp án ≤200; alts ≤500; opts ≤6 mục | Gửi questions | FR-APB-001 | `packages/api/src/contracts.ts:722-762,851`, `packages/ui/src/components/assignments/editor/answer-key-grid.tsx:38-47` | ✅ |
| BR-APB-013 | URL ảnh chỉ https, ≤500 ký tự (chặn javascript:/data:/mixed content) | Gắn imageUrl | FR-APB-019 | `packages/api/src/contracts.ts:692-710`, `apps/web/src/routes/_auth/assignments/new.tsx:245-261` | ✅ |
| BR-APB-014 | skill và part khóa sau khi tạo (không nằm trong update schema); legacy task/genre derive từ chúng | PATCH đề | FR-APB-007 | `packages/api/src/contracts.ts:1129-1140`, `apps/server/src/routes/assignments/index.ts:195-199` | ✅ |
| BR-APB-015 | Metadata (title/band/source/status) không bao giờ bị khóa — sửa được cả trên đề đã khóa nội dung | PATCH đề có attempt | FR-APB-008 | `apps/server/src/routes/assignments/index.ts:465-471`, `apps/server/src/routes/assignments/prompt-content-lock.test.ts:401` | ✅ |
| BR-APB-016 | Lưu lại nội dung y nguyên (so trim 2 phía; questions/optionBank so cấu trúc chuẩn hóa) không tính là đổi — không ghi lại, không 409 | PATCH đề có attempt với payload không đổi | FR-APB-008 | `apps/server/src/routes/assignments/index.ts:376-427`, `apps/server/src/routes/assignments/prompt-content-lock.test.ts:425,464` | ✅ |
| BR-APB-017 | Đề ready mới được giao; giao đề tạo snapshot tên đề tại thời điểm giao (đổi tên sau không ảnh hưởng bài đã giao) | Giao bài (touchpoint) | FR-APB-013 | `apps/server/src/routes/kernel.ts:1540-1542`, `packages/db/src/schema/class-assignment.ts:4-9` | ✅ |
| BR-APB-018 | Đề đếm "Đã dùng N lớp" theo số lớp distinct đã giao; draft được ưu tiên hiển thị trước "đã dùng" | Hiển thị danh sách | FR-APB-012 | `apps/web/src/routes/_auth/assignments/index.tsx:162-170`, `apps/web/src/components/assignments/assignment-status.ts:198-206` | ✅ |
| BR-APB-019 | Ngân hàng giáo viên chỉ gồm đề tạo tay: loại trừ seed demo (id `demo-prompt:%`) và đề vật hóa từ thư viện (`library_ref` không null) | Load snapshot | FR-APB-005 | `apps/server/src/routes/snapshot.ts:338-347` | ✅ |
| BR-APB-020 | Trả lời dạng choice (TFNG/YNNG/Mcq...) phải thuộc bộ nhãn của kind hiệu dụng của câu | Gửi answer | FR-APB-017 | `packages/api/src/contracts.ts:450-479,1047-1059` | ✅ |

## 6. Error Matrix (wording thật từ code)

> Server gộp mọi lỗi schema thành `{"error":"invalid body"}` 400 (`apps/server/src/routes/assignments/index.ts:96-99`) — các message chi tiết của schema (vd "audio required when ready") chỉ sống trong catalog `packages/api/src/contracts.ts` và bản mirror client (Conflict-2). Cột Severity do phân tích viên gán (không có nguồn code).

| Error ID | Title (nguyên văn) | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|--------------------|---------|----------|------------|--------------|----------|-------|------|
| E-APB-001 | `unauthorized` (401) | Gọi route assignments khi chưa xác thực (không có kernelCtx) | major | FR-APB-002 | — (API) | Đăng nhập lại | `apps/server/src/routes/assignments/index.ts:70-72` | ✅ |
| E-APB-002 | `origin not allowed` (403) | POST/PATCH/DELETE với Origin ngoài allowlist | major | FR-APB-002/007 | — (API) | Truy cập từ app giáo viên hợp lệ | `apps/server/src/routes/kernel.ts:189-197` | ✅ |
| E-APB-003 | `content-type must be application/json` (415) | POST không kèm Content-Type JSON (router assignments và kernel guard) | minor | FR-APB-002 | — (API) | Gửi JSON | `apps/server/src/routes/kernel.ts:198-208`, `apps/server/src/routes/assignments/index.ts:80-89` | ✅ |
| E-APB-004 | `invalid json` (400) | Body không parse được JSON | minor | FR-APB-002 | — (API) | Sửa body | `apps/server/src/routes/assignments/index.ts:90-95` | ✅ |
| E-APB-005 | `invalid body` (400) | Payload không qua schema strict/superRefine (mọi message chi tiết của schema gộp về đây) | major | FR-APB-004 | Form giữ nguyên + lỗi chung "Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại." | Sửa theo gate client rồi lưu lại | `apps/server/src/routes/assignments/index.ts:96-99`, `apps/web/src/lib/use-kernel-form-submit.ts:11-12,77-79` | ✅ |
| E-APB-006 | `invalid type` (400) | PATCH: type không thuộc catalog của part của row (ready: bắt buộc hợp lệ; writing draft: chỉ chặn khi gửi type sai; kỹ năng khác: bắt buộc hợp lệ) | major | FR-APB-007 | Form + lỗi server | Chọn lại dạng đề | `apps/server/src/routes/assignments/index.ts:241-257` | ✅ |
| E-APB-007 | `invalid question type` + `question: <index>` (400) | PATCH questions: type của câu không thuộc catalog part | major | FR-APB-017 | Form + lỗi server | Sửa dạng câu tại index | `apps/server/src/routes/assignments/index.ts:261-268` | ✅ |
| E-APB-008 | `invalid answer choice` + `question: <index>` (400) | PATCH questions: đáp án không thuộc bộ nhãn của kind hiệu dụng | major | FR-APB-017/020 | Form + lỗi server | Khóa lại đáp án | `apps/server/src/routes/assignments/index.ts:269-280` | ✅ |
| E-APB-009 | `questions only apply to reading or listening` (400) | PATCH questions trên đề skill không phải reading/listening/grammar/vocabulary | major | FR-APB-011 | Form + lỗi server | Bỏ questions hoặc đổi kỹ năng (tạo đề mới) | `apps/server/src/routes/assignments/index.ts:282-292` | ✅ |
| E-APB-010 | `writing section only applies to auto-graded skills` (400) | PATCH gửi writing khác null trên đề kỹ năng KHÔNG tự chấm (writing/speaking) | major | FR-APB-014 | Form + lỗi server | Gỡ writing | `apps/server/src/routes/assignments/index.ts:297-303` | ✅ |
| E-APB-011 | `writing section locked` + code `WRITING_SECTION_LOCKED` (409) | Đổi/gỡ phần Writing trên đề thuộc class_assignment / assignment_test_part / study_pack_item | critical | FR-APB-009 | Form + thông báo: "Đề đã được giao hoặc đang dùng trong bộ đề nên không sửa được phần Writing. Hãy trả phần này về như cũ để lưu các thay đổi khác." | Hoàn tác phần Writing rồi lưu lại | throw: `apps/server/src/routes/assignments/index.ts:364-372`; catalog: `packages/api/src/contracts.ts:1174-1179`; web mapping: `apps/web/src/lib/use-kernel-form-submit.ts:23-24` | ✅ |
| E-APB-012 | `prompt content locked` + code `PROMPT_CONTENT_LOCKED` (409) | Đổi nội dung đề đã có quiz_attempt (cùng org) | critical | FR-APB-008 | Form + thông báo: "Đề đã có học viên làm bài nên không sửa được nội dung. Bạn vẫn có thể đổi tiêu đề, band, nguồn và trạng thái. Muốn đổi nội dung, hãy tạo đề mới." | Chỉ sửa metadata hoặc tạo đề mới | throw: `apps/server/src/routes/assignments/index.ts:454-462`; catalog: `packages/api/src/contracts.ts:1174-1179`; web mapping: `apps/web/src/lib/use-kernel-form-submit.ts:21-22` | ✅ |
| E-APB-013 | `prompt not found` (404) | PATCH đề không tồn tại hoặc không thuộc org | major | FR-APB-007 | Trang "Không tìm thấy đề này." khi mở ?promptId= không có trong snapshot | Quay lại danh sách | `apps/server/src/routes/assignments/index.ts:237,523`, `apps/web/src/routes/_auth/assignments/new.tsx:1052-1076` | ✅ |
| E-APB-014 | `prompt write conflict` (500) | INSERT đề không trả lại row (xung đột ghi) | critical | FR-APB-002 | Lỗi chung submit | Thử lại | `apps/server/src/routes/assignments/index.ts:151` | ✅ |
| E-APB-015 | "Cần hoàn thiện trước khi lưu (N mục):" + danh sách mục thiếu (client, role="alert", data-testid `assignment-save-missing-alert`) | Bấm lưu khi `missingRequirementsFor` khác rỗng; bấm vào mục nhảy focus tới trường | minor | FR-APB-004 | Form soạn, chưa lưu | Hoàn thiện mục thiếu | `apps/web/src/routes/_auth/assignments/new.tsx:836-844,1142-1172`, `apps/e2e/specs/assignment-prompt-create.spec.ts:32-38` | ✅ |
| E-APB-016 | "Đã tải lại dữ liệu nhưng chưa xác nhận được đề mới trong ngân hàng." | Reconcile sau create: snapshot mới không tìm thấy row khớp title+skill | major | FR-APB-016 | Form + notice | Lưu lại | `apps/web/src/routes/_auth/assignments/new.tsx:1001-1005` | ✅ |
| E-APB-017 | "Đã tải lại dữ liệu nhưng thay đổi của bạn chưa được lưu. Vui lòng lưu lại." | Reconcile sau edit: snapshot mới không chứa đúng payload đã submit | major | FR-APB-016 | Form + notice | Lưu lại | `apps/web/src/routes/_auth/assignments/new.tsx:1020-1039` | ✅ |
| E-APB-018 | "Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại." (generic failure, các mã lỗi khác ngoài 409 lock) | definite-failure 4xx/5xx không phải lock | major | FR-APB-002/007 | Form + role="alert" | Thử lại | `apps/web/src/lib/use-kernel-form-submit.ts:11-12,27-29` | ✅ |
| E-APB-019 | `prompt not ready` (400) | Giao đề draft cho lớp (touchpoint classes) | major | FR-APB-013 | Trang Lớp học | Chuyển đề sang ready rồi giao | `apps/server/src/routes/kernel.ts:1540-1542` | ✅ |
| E-APB-020 | "Assignment draft skipped: <n> chars exceed the 524288 cap." (console.warn) | Autosave draft vượt 512KB | minor | FR-APB-010 | Không có gì trên UI (chỉ console) | Rút gọn nội dung | `apps/web/src/lib/assignment-draft-store.ts:139-147` | ✅ |

Message chi tiết trong catalog schema (không lên wire, xem Conflict-2): "invalid part" (`packages/api/src/contracts.ts:876`), "invalid type" (`:881-897`), "prompt required" (`:926-931,1040-1045`), "passage required" (`:932-938`), "question stem required" (`:939-958,966-976`), "audio required when ready" (`:959-965`), "image required when ready" (`:982-988`), "pin required when ready" (`:989-998`), "imageUrl must be an https URL" (`:1000-1005,1142-1147`), "stem required when ready" (`:1008-1013`), "gap question requires exactly one blank (____)" (`:1015-1024`), "answer required when ready" (`:1025-1030`), "cue topic required" (`:1033-1039`), "writing prompt required" (`:794-800`), "invalid writing part"/"invalid writing type" (`:777-793`), "optionBank only applies to bankable matching types" (`:1072-1078`), "bank must have 2–8 items and cover every bankable question" (`:1088-1093`), "bankable types allow at most 8 questions (label alphabet size)" (`:1094-1099`), "answer must be a label inside the option bank" (`:1100-1110`), "duplicate answer — each option is used once" (`:1111-1121`). ✅

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-APB-01 | Đề ready tạo xong xuất hiện trong danh sách và tồn tại qua reload | E2E "create a ready prompt, list it, and survive reload" | Pass CI | `apps/e2e/specs/assignment-prompt-create.spec.ts:18-68` | ✅ |
| SC-APB-02 | Cả 2 trạng thái (ready + draft) tạo row thật trong kernel | E2E draft flow | Pass CI | `apps/e2e/specs/assignment-prompt-create.spec.ts:14-17,70-90` | ✅ |
| SC-APB-03 | Giáo viên tìm lại được đề nhờ bộ lọc + tìm kiếm; thấy trạng thái rỗng khi không khớp | E2E bank list | Pass CI | `apps/e2e/specs/assignment-bank.spec.ts:42-90` | ✅ |
| SC-APB-04 | Preview đúng góc nhìn học viên và round-trip không mất dữ liệu (kể transcript/optionBank) | E2E preview flow | Pass CI | `apps/e2e/specs/assignment-prompt-create.spec.ts:92-140,437-474` | ✅ |
| SC-APB-05 | Đề đã có học viên làm bài không thể bị sửa nội dung (409) nhưng vẫn sửa được metadata | API test content-lock (9 test case) | Pass CI | `apps/server/src/routes/assignments/prompt-content-lock.test.ts:272-580` | ✅ |
| SC-APB-06 | Form chỉnh sửa phản ánh trung thực kết quả lưu (không báo "Đã cập nhật" khi snapshot chưa chứa thay đổi) | unit new-submit/use-kernel-form-submit | Pass CI | `apps/web/src/routes/_auth/assignments/new-submit.test.tsx:260`, `apps/web/src/lib/use-kernel-form-submit.test.tsx:64-98` | ✅ |
| SC-APB-07 | Ngân hàng lựa chọn/ghim ảnh/đáp án hàng loạt đều hoạt động tới trang học viên (explanation round-trip #571) | E2E explanation | Pass CI | `apps/e2e/specs/assignment-prompt-create.spec.ts:608-767` | ✅ |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/assignment-prompt-bank-reverse-erd.md`)

- **assignment_prompt** — đề trong ngân hàng; org-scoped, không FK student/class; 24 cột nội dung + 3 cột legacy + `library_ref`; status draft|ready. ✅ [S2] `packages/db/src/schema/assignment-prompt.ts:18-67`
- **organization** — chủ sở hữu ngân hàng (FK cascade). ✅ [S2] `:22-24`
- **class_assignment / class_assignment_target** — lượt giao (touchpoint): tham chiếu `prompt_id` (cascade), snapshot `title` lúc giao. ✅ `packages/db/src/schema/class-assignment.ts:8-19`
- **assignment_test / assignment_test_part** — bộ đề (feature kế bên): part tham chiếu prompt theo slot; là 1 trong 3 điều kiện khóa Writing + đường khóa nội dung gián tiếp. ✅ [S1] `apps/server/src/routes/assignments/index.ts:330-343,428-453`
- **study_pack_item** — gói tự học tham chiếu đề nguồn `source_kind='org_prompt'`; điều kiện khóa Writing thứ ba. ✅ [S1] `apps/server/src/routes/assignments/index.ts:344-362`
- **quiz_attempt** — lượt làm bài (feature grading): sự tồn tại (cùng org, gắn lượt giao hoặc bộ đề chứa đề) kích hoạt khóa nội dung. ✅ [S1] `apps/server/src/routes/assignments/index.ts:428-453`
- **Dự liệu cục bộ ngoài DB:** `localStorage["assignment-draft"]` (autosave soạn) và `sessionStorage["teacher-os:assignment-preview-draft"]` (handoff xem trước) — tài sản của trình duyệt giáo viên, không phải server. ✅ `apps/web/src/lib/assignment-draft-store.ts:15`, `apps/web/src/lib/assignment-preview-draft.ts:4`

## 9. Flows (tóm tắt — chi tiết ở `srs/assignment-prompt-bank-reverse-flows.md`)

1. **F1 — Tạo đề & lưu vào ngân hàng (ready):** form → gate client → POST `/api/assignments/prompts` → schema → insert → 201 → refresh snapshot → card "Đã thêm vào ngân hàng". ✅ [S5] [S7]
2. **F2 — Lưu bị chặn thiếu yêu cầu:** alert + focus mục đầu; không gửi request. ✅ [S5] `:836-844`
3. **F3 — Chỉnh sửa đề (field-diff + khóa nội dung):** nạp đề → baseline mount → chỉ gửi field khác baseline → PATCH → 200 hoặc 409 lock → reconcile chứng minh lưu. ✅ [S5] `:846-926,992-1051`
4. **F4 — Xem trước:** handoff sessionStorage hoặc ?id=; quay lại soạn đề lấy (take) draft; quay lại danh sách giữ draft. ✅ [S6] [S19]
5. **F5 — Tự động lưu nháp & phục hồi:** autosave 1s → banner khi quay lại → Tiếp tục/Hủy; preview-draft thắng banner. ✅ [S5] `:556-568,687-699`
6. **F6 — Reconcile sau lưu (committed/unknown):** notice → refresh → chứng minh payload → thành công hoặc báo lưu lại. ✅ [S13] [S5]
7. **F7 — Giao đề cho lớp (touchpoint):** chỉ đề ready; POST `/api/classes/:id/assignments` tạo snapshot `class_assignment`. ✅ [S20]

## 10. Screens (tóm tắt)

| Screen | Đường dẫn | Thành phần chính | Nguồn |
|--------|-----------|------------------|-------|
| Danh sách ngân hàng đề | `/assignments` | PageHead "Ngân hàng đề / Bài tập", CTA "Bộ đề tự học" + "+ Tạo bài tập", tìm kiếm, chip lọc kỹ năng/phần thi có đếm, đếm kết quả, xóa bộ lọc, danh sách hàng đề (số thứ tự, tiêu đề, tags dạng, nguồn, ngày thêm, tag trạng thái, phần thi · Band), panel xem trước dính phải, trạng thái rỗng | `apps/web/src/routes/_auth/assignments/index.tsx:269-537` |
| Soạn/Tạo đề (đồng thời là sửa) | `/assignments/new` (?classId=, ?promptId=) | Breadcrumb, PageHead "Thêm đề vào ngân hàng"/"Chỉnh sửa đề bài", banner khôi phục nháp, PromptComposer, sticky footer: alert thiếu mục, notice submit, action copy, chọn trạng thái "Bản nháp/Sẵn sàng giao", nút Xem trước/Hủy/Lưu | `apps/web/src/routes/_auth/assignments/new.tsx:1078-1248` |
| Xem trước học viên | `/assignments/preview` (?id=) | Tab "Bài giấy" / "Làm thử & Soi bài", nhãn "Bản xem trước — bài làm không được lưu.", "Bài làm của học viên (mô phỏng)", nút quay lại | `apps/web/src/routes/_auth/assignments/preview.tsx:19-80`, `apps/e2e/specs/assignment-prompt-create.spec.ts:107-117` |
| Panel xem trước trong danh sách | (trong `/assignments`) | Aside "Xem trước phía học viên" + ghi chú "Đề này chưa giao lớp. Giao cho học viên ở trang Lớp học." + nút Xem trước / Chỉnh sửa | `apps/web/src/components/assignments/prompt-preview-aside.tsx:44-234` |
| Card thành công | (trong `/assignments/new`) | Heading "Đã lưu bản nháp" / "Đã cập nhật bài tập" / "Đã thêm vào ngân hàng" + tóm tắt + "Tạo đề khác" | `apps/web/src/components/assignments/create-success-card.tsx:53-63` |
| Trang Lớp học — giao bài | `/classes/:classId` (touchpoint) | Modal "Giao bài tập" chỉ liệt kê đề ready | `apps/web/src/components/classes/class-assignments-tab.tsx:221` |

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Route phải mount trong kernel router (Origin + JSON CSRF guard) — never mount standalone | kiến trúc server (#454 wave-6) | `apps/server/src/routes/assignments/index.ts:44-47`, `apps/server/src/routes/kernel.ts:3495` | ✅ |
| Body ghi ≤ 256KB | Hono bodyLimit trên router | `apps/server/src/routes/assignments/index.ts:63-68` | ✅ |
| Schema tạo đề `.strict()` — payload là toàn bộ body, không nhận field lạ | contract #218 | `packages/api/src/contracts.ts:870`, `apps/web/src/lib/repos/kernel.ts:187-193` | ✅ |
| skill/part bất biến sau tạo; task/genre là cột legacy không ghi lại khi PATCH | contract + route | `packages/api/src/contracts.ts:1129-1136`, `apps/server/src/routes/assignments/index.ts:195-199` | ✅ |
| D1/SQLite: không có transaction đa lệnh — dùng db.batch (prevalent ở tests route; khóa đề là read-then-write nên có cửa sổ race) | kiến trúc DB | `apps/server/src/routes/assignments/tests.ts:32-33`, `apps/server/src/routes/assignments/index.ts:428-463` | 🔵 |
| Draft autosave: localStorage key `assignment-draft`, schema v1, TTL 7 ngày, cap 512KB | web app (FR6 phase-01) | `apps/web/src/lib/assignment-draft-store.ts:15-23` | ✅ |
| Trục thời gian VN: ngày thêm hiển thị dd/mm/yyyy theo Asia/Ho_Chi_Minh; sắp xếp danh sách theo createdAt giảm dần | web app | `apps/web/src/components/assignments/assignment-status.ts:62-81`, `apps/web/src/routes/_auth/assignments/index.tsx:256` | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Kernel snapshot `GET /api/kernel` (case `assignmentPrompts`) | server kernel | Danh sách/sửa/xem trước không có dữ liệu | `apps/server/src/routes/kernel.ts:448`, `apps/server/src/routes/snapshot.ts:744-790` | ✅ |
| Contract zod `assignmentPromptCreateSchema/UpdateSchema` + hằng catalog | package `@teacher-os/api` | Cả 2 phía client/server không validate | `packages/api/src/contracts.ts:831-1181` | ✅ |
| Catalog UI `SKILLS`/`KIND`/bankable/image (package `@teacher-os/ui`) | package UI | Form không dựng được cây kỹ năng | `packages/ui/src/components/assignments/editor/assignment-presets.ts:45-120,133-358` | ✅ |
| Rich text helpers (`isEmptyRichText`, `normalizeLegacyRichText`) | `@teacher-os/api` + web lib | Gate nội dung rich-text vỡ | `apps/web/src/routes/_auth/assignments/new.tsx:15,61-64` | ✅ |
| Luồng giao bài (classes) tiêu thụ đề ready | feature classes | Đề không đến được học viên (feature vẫn chạy) | `apps/server/src/routes/kernel.ts:1511-1542` | ✅ |
| Material hóa đề từ thư viện gán `library_ref` | study-pack/library | Không ảnh hưởng feature (bị loại khỏi ngân hàng) | `apps/server/src/lib/study-pack-clone.ts:711,740-752`, `apps/server/src/routes/snapshot.ts:344` | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Đề trong ngân hàng không chứa dữ liệu cá nhân học viên (không FK student) | ERD + privacy claims | `packages/db/src/schema/assignment-prompt.ts:11-16` | ✅ |
| Mọi thành viên org (trừ student/admin) được phép quản lý ngân hàng | Actor table + OQ-9 | `apps/server/src/routes/kernel.ts:448-453` + `apps/server/src/routes/assignments/index.ts:199-201` (PATCH chỉ check kernelCtx), `apps/server/src/app.ts:222-240` | 🔵 |
| Cửa sổ race read-then-write ở khóa nội dung là chấp nhận được (không có lock DB) | BR-APB-016/F3 error handling | `apps/server/src/routes/assignments/index.ts:428-463` | 🔵 |
| Ưu tiên P0/P1/P2 do phân tích gán theo độ phủ E2E | Cột Priority mọi FR | bảng FR | 🟡 (OQ-6) |

## 12. Open Questions (blocking)

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] **OQ-1:** Ngân hàng đề không có chức năng xóa (không DELETE route, không nút UI) — đây là chủ ý thiết kế (đề sống mãi) hay thiếu sót cần bổ sung? Nếu không xóa, làm gì với đề rác/nháp sai?
- [ ] **OQ-2:** Đề đã giao ("Đã dùng N lớp") vẫn hạ được về "Bản nháp" vì status là metadata không khóa — UI thậm chí ưu tiên hiện "Bản nháp" trước "Đã dùng". Đây có phải hành vi mong muốn, hay cần chặn chuyển ready→draft trên đề đã dùng?
- [ ] **OQ-9:** Mọi thành viên org (role bất kỳ trừ student/admin) đều sửa được toàn bộ ngân hàng đề của org (route không có role gate riêng) — có cần phân quyền soạn/duyệt riêng không?
