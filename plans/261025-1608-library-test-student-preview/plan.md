---
title: "Thư viện đề: nút Xem trước theo giao diện học viên"
description: "Trang soạn bộ đề admin có nút Xem trước mở overlay toàn màn hình, render đề (kể cả bản nháp) bằng chính component take screen của học viên."
status: completed
priority: P2
effort: "1.5-2d"
tags: [admin, library, ui, quiz, shared-ui]
created: 2026-10-25
branch: develop
issue: https://github.com/vinh19410/teacher-os/issues/433
blockedBy: []
blocks: []
---

# Thư viện đề: nút "Xem trước" theo giao diện học viên

## Mục tiêu

Ở trang soạn bộ đề admin (`/library/tests/$testId`, app `apps/admin`, port 8004), admin bấm **Xem trước** để thấy bộ đề đúng như học viên sẽ thấy ở màn làm bài: cùng `QuizPaper`, `QuizNavigator`, bố cục split-pane Reading, header nhóm câu, option bank, ô cloze, pin trên ảnh. Admin làm thử được (chọn/điền) nhưng không có gì được lưu.

## Quyết định đã chốt (2026-10-25)

| # | Quyết định | Hệ quả |
|---|---|---|
| D1 | Nguồn dữ liệu = **bản đã lưu + overlay bản nháp** (cùng nguồn `effectivePartsFor` với cây đề và bảng đáp án) | Chuyển đổi chạy ở client, **không thêm API**. Part có bản nháp hỏng schema thì xem trước dùng bản đã lưu kèm cảnh báo |
| D2 | **Overlay toàn màn hình** trong trang soạn, không route/tab mới | Bản nháp, part đang chọn, vị trí cây giữ nguyên khi đóng; Esc / nút Đóng để quay lại |
| D3 | **Làm thử, không lưu**: answers giữ trong state cục bộ của overlay | Không tạo attempt, không gọi API ghi; đóng overlay là mất |
| D4 | **Tab theo part** (Passage 1–3 / Section 1–4); mỗi part render riêng với passage của nó; số câu liên tục toàn đề; mặc định mở part đang soạn | Reading dùng split-pane như học viên; part chưa có nội dung hiện trạng thái rỗng. Lưu ý (RT16): shell multi-part theo tab là **quy ước mới** cho luồng clone — take screen học viên hiện tại hiển thị một đề/liên tục, chưa có tab; banner preview ghi chú điều này khi đề >1 part |
| D5 | Hàm chuyển đổi `LibraryPartInput → { detail, parts }` đặt trong `packages/api` (pure, có unit test) | Đây cũng là hợp đồng hiển thị cho luồng clone thư viện → học viên sau này, tránh hai bản mapping lệch nhau |
| D6 | Nhóm câu (`groups`) map 1-1 thành `QuizPart` (type, instruction, nhãn `Questions X–Y`); **option bank theo nhóm** cần mở rộng `QuizPart.optionBank` + `QuizPaper` | Thay đổi nhỏ, tương thích ngược ở `packages/ui`; student hiện tại không truyền field mới nên hành vi không đổi |
| D7 | Cờ nhóm `answersInline` / `splitContent` / `dragDrop` **chưa** có hiệu ứng ở take screen học viên → xem trước không giả lập, chỉ hiện ghi chú "học viên hiện chưa thấy hiệu ứng này" | Xem trước trung thực với runtime thật, không hứa thứ học viên chưa thấy |

## Bối cảnh đã khảo sát

- Trang soạn: `apps/admin/src/routes/_auth/library/tests/$testId.tsx` — đã có `effectiveParts` (saved + draft), `sections` (qStart theo fold toàn đề), toolbar "Lưu part" / "Kiểm tra đáp án".
- Take screen học viên: `apps/student/src/components/quiz/quiz-take-view.tsx` dùng `QuizPaper`, `QuizNavigator` (`packages/ui/src/components/quiz/`), `buildQuizParts` (`packages/api/src/lib/quiz-parts.ts`), `QuizReadingSplitLayout` (**đang nằm ở app student**).
- Server practice (`apps/server/src/routes/student-practice.ts`) dựng `StudentQuizDetail` bằng `buildMergedQuestions` + `inferQuestionTypes` — xem trước tái dùng cùng `inferQuestionTypes` để type hiệu dụng khớp.
- Thư viện đề hiện **chưa** có đường tới học viên (non-goal của plan `261022-1025-admin-app-ielts-library`). "Giao diện học viên" ở đây = take screen dùng chung, không phải một route học viên cụ thể đang phục vụ đề thư viện.
- Giáo viên đã có tiền lệ "làm thử như học viên" ở `apps/web` (#285: `preview-quiz-simulation.tsx`, `lib/assignment-quiz-sim.ts`) — plan theo cùng cách ghép component và strip đáp án.
- Admin và student cùng import `@teacher-os/ui/globals.css` → token giống nhau, render component chung không lệch theme.

## Phases

| # | Phase | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [Shared: hàm chuyển đổi + mở rộng QuizPaper](phase-01-shared-preview-mapping.md) | pending | — |
| 2 | [Admin: overlay Xem trước + nút trên toolbar](phase-02-admin-preview-overlay.md) | pending | 1 |
| 3 | [E2E, verify 3 viewport, docs](phase-03-e2e-verify-docs.md) | pending | 2 |

## Acceptance criteria

- [ ] Trang `/library/tests/$testId` có nút **Xem trước** trên toolbar "Thao tác soạn đề"; bật được kể cả khi đề còn draft hoặc có thay đổi chưa lưu.
- [ ] Overlay toàn màn hình, có `role="dialog"` + `aria-modal`, focus vào overlay khi mở, Esc và nút Đóng trả focus về nút Xem trước; trang soạn bên dưới giữ nguyên bản nháp và part đang chọn.
- [ ] Banner cố định "Bản xem trước — đáp án không được lưu"; nếu có part dùng bản đã lưu thay cho bản nháp hỏng thì banner nêu tên part đó; part bản nháp hỏng + chưa lưu có trạng thái riêng "bản nháp không hợp lệ" (không lẫn "chưa có nội dung"); part `groupsCorrupt` có cảnh báo riêng.
- [ ] Tab part theo preset skill (Reading 3, Listening 4); mặc định mở part đang soạn; part chưa có nội dung hiện trạng thái rỗng thay vì ẩn tab.
- [ ] Mỗi part render bằng `QuizPaper` + `QuizNavigator` của `packages/ui`; Reading có passage dùng split-pane giống học viên (không tràn viewport khi banner nhiều dòng); số câu đánh liên tục toàn đề (khớp cây đề — kể cả khi part fallback bản lưu).
- [ ] Nhóm câu hiển thị đúng nhãn `Questions X–Y`, instruction rich text của nhóm, option bank của nhóm; part không có nhóm hiển thị như `buildQuizParts` hiện tại; grouped bankable KHÔNG hiện alert "Thiếu ngân hàng lựa chọn".
- [ ] Pin trên ảnh: điền pin ở part có qOffset > 0 ghi đúng key `answers[q]` (không đè đáp án part khác), nhãn pin theo số câu toàn đề.
- [ ] Không có đáp án, `alts`, `explanation`, `transcript`, `note` nào xuất hiện trong DOM của overlay (assert bằng canary per-field, cùng chính sách với payload học viên).
- [ ] Admin chọn/điền đáp án được; không có request ghi nào bắn ra trong lúc xem trước — kể cả autosave header qua blur (được hoãn khi overlay mở); đóng rồi mở lại thì answers trống.
- [ ] Take screen học viên không đổi hành vi (unit test student + e2e quiz hiện có vẫn xanh; `PinOverlay` giữ hành vi cũ khi `q === offset`).
- [ ] Verify ở 1440×900, 768×1024, 375×812 + điều hướng bàn phím; `pnpm check`, `pnpm check-types`, test `packages/api`, `packages/ui`, `apps/admin`, `apps/student`, `apps/web` xanh; e2e admin library xanh.

## Non-goals

- Không thêm API/route server, không tạo attempt, không chấm điểm trong xem trước.
- Không làm chế độ "Hiện đáp án" / review (người dùng chọn chỉ làm thử).
- Không hiện thực `answersInline` / `splitContent` / `dragDrop` ở take screen học viên.
- Không làm luồng clone thư viện → giáo viên/học viên.
- Không phát audio thật trong xem trước: học viên hiện chỉ thấy nhãn `🔊 <tên file>` trong `QuizPaper`, xem trước giữ đúng như vậy.

## Rủi ro

| Loại | Rủi ro | Giảm thiểu |
|---|---|---|
| Parity | Mapping thư viện → paper lệch cách server sẽ dựng khi clone | Hàm đặt ở `packages/api`, dùng `inferQuestionTypes` giống server (infer per-group khi có nhóm); ghi rõ là hợp đồng cho clone |
| Regression | Sửa `QuizPaper` (bank theo part, ảnh/pin per-part) + `PinOverlay` (key theo `item.q ?? offset`) làm đổi take screen học viên | Field mới đều optional; `q === offset` với caller truyền full mảng nên hành vi cũ giữ nguyên; test student hiện có + test mới cho nhánh per-part và pin qOffset>0 |
| Lộ đáp án | Truyền nhầm `answer`/`explanation` vào DOM | Hàm map trả `StudentQuizQuestion` (strict schema không có answer), pure không mutate input; tab model không mang raw input qua props; test canary per-field |
| Hiệu năng | Mở overlay khi đang gõ làm render nặng | Overlay chỉ mount khi mở; tính map bằng `useMemo` trên `deferredDrafts` |
| UX | Bố cục split-pane tính `100svh - 3.5rem` theo header học viên | `QuizReadingSplitLayout` thêm `fillParent` — overlay bọc nội dung `flex-1 min-h-0`, không phụ thuộc chiều cao banner |
| Ghi ngầm | Mở overlay kích hoạt autosave header qua blur | Guard `onBlur` khi `previewOpen` — hoãn lưu đến khi đóng overlay; e2e assert 0 write request |

## Câu hỏi còn mở

- Khi luồng clone thư viện ra đời, take screen practice hiện chỉ lấy passage của part đầu (`toPracticeQuizDetail` dùng `parts[0]`); đề Reading 3 passage sẽ cần hiển thị theo part như bản xem trước này. Việc đó thuộc plan clone, không thuộc plan này.

## Red Team Review

### Session — 2026-10-25 (tự động, ak-vibe --advice gate trước implement)
**Reviewers:** Security Adversary + Assumption Destroyer + Failure Mode Analyst (3 subagent độc lập, mọi finding bắt buộc cite `file:line`) + Fact Checker (12 claims: 11 VERIFIED, 1 FAILED → đã sửa).
**Findings:** 17 sau dedup (0 rejected vì thiếu evidence; 17 accepted).
**Severity breakdown:** 2 Critical, 3 High, 11 Medium, 1 Low (sửa claim FactCheck).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| RT1 | `PinOverlay` key answers theo offset mảng (`pin-overlay.tsx:86,111,114`), `QuizPaper` hardcode `qStart={1}` → pin ở tab qOffset>0 ghi đè đáp án tab khác | Critical | Accept — key theo `item.q ?? offset`; `QuizPaper` truyền `qStart={part.qStart}` | Phase 1 |
| RT2 | Grouped bankable render alert giả "Thiếu ngân hàng lựa chọn" (`quiz-paper.tsx:205` + `option-bank-list.tsx:29-38`) | Critical | Accept — detail bank chỉ render khi `length > 0` | Phase 1 |
| RT3 | qOffset hai nguồn đếm: outline đếm draft raw (`test-outline-model.ts:78-84`), preview parse-gate (`effective-parts.ts:39-59`) → lệch khi draft hỏng | High | Accept — qOffset từ `resolvePartValues` (cùng nguồn outline), parse chỉ quyết view/banner | Phase 2 |
| RT4 | Mở overlay bắn PATCH autosave header qua blur (`$testId.tsx:529-531`) — phá assertion "không có request ghi" | High | Accept — guard onBlur khi previewOpen, hoãn lưu | Phase 2, 3 |
| RT5 | Model ảnh cấp-part vs nhóm image-based không phải nhóm đầu (`quiz-paper.tsx:87-90` vs `library-contracts.ts:333-345`) | High | Accept — ảnh/pin gate theo `part.typeId` | Phase 1 |
| RT6 | Tab props mang nguyên `LibraryPartInput` full-key (answer/alts/explanation/transcript) | Medium | Accept — tab chỉ mang `{label, view, state}` | Phase 2 |
| RT7 | Mapping phải pure, cấm mutate object dùng chung từ `savedInputs` | Medium | Accept — điều khoản + test deep-equal | Phase 1 |
| RT8 | Test anti-leak substring trùng nhãn hợp lệ (TRUE/FALSE/"i") | Medium | Accept — canary per-field | Phase 2 |
| RT9 | `inferQuestionTypes` cấp part sai cho nhóm không phải nhóm đầu | Medium | Accept — infer per-group | Phase 1 |
| RT10 | `saved.groupsCorrupt` (fallback `[]` phía server) lọt qua mọi cảnh báo D1 | Medium | Accept — state `groups-corrupt` + banner nêu tên part | Phase 2 |
| RT11 | Phương án "chỉ split khi intro chứa marker" là bẫy (tương đương hành vi cũ, vẫn nuốt preamble) | Medium | Accept — chốt cờ `source`, bỏ phương án B | Phase 1 |
| RT12 | Draft hỏng + chưa lưu → empty-state "chưa có nội dung" nói dối; corrupt saved tương tự | Medium | Accept — state `draft-invalid` riêng | Phase 2, 3 |
| RT13 | Banner + tablist > 3.5rem chắc chắn tràn split-pane calc cứng (`quiz-reading-layout.tsx:29`) | Medium | Accept — prop `fillParent`, overlay bọc `flex-1 min-h-0` | Phase 1, 2 |
| RT14 | Copy `buildQuizSim` lọc stem rỗng → lệch q/group.startIndex toàn bộ | Medium | Accept — cấm lọc, giữ 1-1 index | Phase 1 |
| RT15 | Sót `quiz-reading-layout.test.tsx` khi dời component | Medium | Accept — chuyển test cùng component | Phase 1 |
| RT16 | "Đúng như học viên" — shell tab multi-part là quy ước mới, chưa có runtime student nào như vậy | Medium | Accept — wording D4 + banner note | Plan.md |
| RT17 | Claim "QuizPaperDetail không có note" SAI (Pick có `note`, optional — FactCheck #7) | Low | Accept — sửa claim, intent strip giữ nguyên | Phase 1 |

**Điểm đã thử phá nhưng KHÔNG finding:** XSS rich text (mọi đường qua `RichTextBody`/DOMPurify duy nhất); authz admin (không thêm API); `audioName` text node thuần; `imageUrl` allowlist https; take-mode QuizPaper/Navigator không đọc answer/alts; theme 3 app dùng chung `globals.css`; `inferQuestionTypes` pure client-side; tiền lệ #285 khả chuyển; precedent dialog Esc/focus có cleanup đúng.

### Kongming checkpoint sau plan gates — 2026-10-25
**Verdict: GO** kèm 4 điều kiện chốt (đã áp vào phase files):
- **C1** answers theo tab (`Record<slot, Record<number,string>>`) — tránh đè key khi tab fallback bản lưu dài/ngắn hơn draft → Phase 2.
- **C2** PinOverlay giữ MỘT overlay cấp paper; key `item.q ?? offset`; nhãn `item.number ?? qStart+offset`; không đổi qStart theo part → Phase 1.
- **C3** gate ảnh mới chỉ áp khi part `source === "group"`; take screen giữ `isImageBasedType(skill, detail.type)` → Phase 1.
- **C4** refactor bắt buộc `resolveEffectivePart` trong `effective-parts.ts`, một bản luật → Phase 2.
Rủi ro canh chừng: R1 (set `source:"intro"` trong buildQuizParts), R2 (qOffset sau split), R3 (PinOverlay items nới kiểu — caller web không có `q`), R4 (dời cả `isReadingSplitPane`), R5 (`part.optionBank ?? detail.optionBank`), R6 (`JSON.stringify(tabs)` canary test).

### Whole-Plan Consistency Sweep
- Áp finding xong đã rà lại `plan.md` + 3 phase file: bảng File sở hữu phase-01 đồng bộ với RT1/RT5/RT13/RT15 (PinOverlay, fillParent, test layout); AC plan.md đồng bộ RT1/RT2/RT3/RT4/RT12; phase-02 model 5 trạng thái đồng bộ phase-03 e2e case; bảng Rủi ro đồng bộ RT1/RT4/RT5/RT13.
- Không còn Finding nào chưa phản ánh vào file phase tương ứng. Từ khóa cũ đã quét: "hoặc chỉ split khi intro" (đã xóa khỏi phase-01), "prop offset nếu cần" (đã thay bằng fillParent bắt buộc), "usedSavedFallback" đơn lẻ (đã thay bằng `PreviewTabState` 5 giá trị).
- Claim FactCheck #7 (note) đã sửa ở phase-01; #9 (`optionBankKindFor` nằm ở `contracts.ts`) không mâu thuẫn text plan (plan không quy định vị trí).
- Không còn mâu thuẫn chưa giải quyết → plan sẵn sàng implement.
