# Red-team plan #303 (tfng choices + navigator full-width)

Phạm vi: plan.md + phase-01..04 tại `plans/261002-1228-tfng-choices-full-width-navigator/`. Read-only, không sửa code. Các Key Decisions đã chốt không bị đảo ngược.

Tổng: 9 finding (1 Critical, 4 High, 4 Medium). Đã kiểm và loại trừ: xem cuối báo cáo.

---

## Critical

### F1. Helper hijack `tablecomp` / `shortans` / `diagram` / promptType rỗng
- Lens: Failure Mode Analyst (+ Assumption Destroyer)
- Severity: Critical
- Claim bị phá: phase-01 Contract ("còn lại: câu ứng viên = không opts, stem không marker, answer canonical") và Success Criteria "câu đã khai type riêng, đề choice-type: không đổi hành vi". Key Decision 1 nói "khi type đề là dạng điền chữ" nhưng contract thực tế áp cho MỌI promptType không có choice kind.
- Evidence:
  - `packages/ui/src/lib/cloze.ts:272` (`buildTableStem` tạo stem `[table] r1 c1: ... / ...`, không có `____`) và `packages/ui/src/lib/cloze.ts:462` (comment "marker-EXEMPT `[table]` stems").
  - `packages/ui/src/components/assignments/cloze-stem.tsx:101` (nhánh `TABLECOMP_TYPE` render input nhập cho stem không có marker).
  - `packages/api/src/contracts.ts:287` (tablecomp thuộc p2) và `apps/server/src/routes/student.ts:1224` (`promptType: header?.type ?? ""`).
  - `packages/ui/src/lib/cloze.ts:36-45` (`CLOZE_EDITOR_TYPES`, tập type thật sự dùng cloze editor, không gồm tablecomp/shortans/diagram).
- Failure scenario: đề `tablecomp` có ô bảng đáp án `YES` hoặc `NO` (bảng "Available: YES/NO" là thật). Stem `[table] r2 c3: ...` markerless, không opts, answer canonical, nên helper trả `ynng`. Học viên đang có ô nhập chữ chạy tốt thì bị đổi thành 3 radio YES/NO/NOT GIVEN. Đây là regression trên tính năng đang hoạt động, xảy ra trên take và review, chỉ trên server (không có test nào bắt vì fixture chỉ dùng `note`). Tương tự, review của prompt bị xoá (`header` null, promptType `""`) bị suy luận thay vì giữ nguyên.
- Suggested fix:
  - phase-01-infer-question-types-helper.md, mục Contract: thêm điều kiện "promptType phải ∈ tập cloze-completion" và chuyển hằng `CLOZE_EDITOR_TYPES` (cloze.ts:36-45) sang `packages/api/src/lib/infer-question-types.ts` cùng `CLOZE_MARKER_SOURCE`; ui import lại. promptType ngoài tập (tablecomp, shortans, diagram, "", type lạ) trả nguyên promptType.
  - Cùng file, loại ứng viên có `pin != null` (đề image-based, `contracts.ts` ép pin cho diagram/map).
  - Steps 1 (test): thêm 3 case: `tablecomp` + stem `[table] r1 c1: a / b` + answer `YES` giữ `tablecomp`; promptType `""` không suy luận; câu có pin không suy luận.

---

## High

### F2. Run trộn họ TRUE/FALSE với YES/NO làm câu không thể đáp đúng
- Lens: Failure Mode Analyst (+ Security/Data: sai lệch chấm điểm im lặng)
- Severity: High
- Claim bị phá: phase-01 "run có YES/NO → cả run là ynng, ngược lại tfng" (Key Decision 2 chỉ giải quyết mơ hồ của `NOT GIVEN`, không nói gì về run chứa cả hai họ).
- Evidence:
  - `packages/api/src/lib/grade-quiz.ts:54` (verdict `correct` chỉ khi giá trị gửi lên bằng answer/alts sau normalize) và `packages/api/src/contracts.ts:346-351` (tfng và ynng là hai bộ giá trị rời nhau).
  - `packages/api/src/lib/quiz-parts.ts:99-135` (đề có intro tách nhiều section "Questions X–Y", mỗi section thuộc cụm riêng nhưng helper không biết ranh giới).
- Failure scenario: (a) một typo `YES` giữa các câu `TRUE/FALSE/...` đẩy toàn run sang `ynng`, các câu có key `TRUE` chỉ còn radio YES/NO/NOT GIVEN, học viên không thể chọn đúng, và attempt bị chấm `wrong` im lặng. (b) Intro có hai section liền nhau, "Questions 1–4 True/False/NG" và "Questions 5–8 Yes/No/NG", đều markerless: run 8 câu thành `ynng`, câu 1–4 mất khả năng đúng.
- Suggested fix:
  - phase-01 Contract: phân họ theo từng câu: `TRUE/FALSE` thuộc họ tfng, `YES/NO` thuộc họ ynng, `NOT GIVEN` trung tính. Run = các ứng viên liên tiếp cùng họ; gặp câu đổi họ thì cắt run. Run chỉ gồm `NOT GIVEN` mặc định `tfng` (giữ Key Decision 2: cụm quyết định, không phải từng câu).
  - phase-01 thêm tham số tuỳ chọn `breakBefore?: ReadonlySet<number>` (index câu bắt đầu section intro, server lấy từ `splitQuizIntro(intro, n)`) và phase-02 truyền vào ở 2 handler + sim.
  - Steps 1 (test): thêm case `[TRUE, YES, FALSE]` cho ra 3 run độc lập, và case hai section intro liền kề.

### F3. Nút 1-click gán type ngoài catalog của part, server trả 400 khi lưu
- Lens: Assumption Destroyer
- Severity: High
- Claim bị phá: phase-03 "nút giữ nguyên stem và đáp án (đáp án đã hợp lệ với kind mới)... Runtime đã an toàn nên không cần ready-gate"; nút ghi `type: inferred[i]` không điều kiện.
- Evidence:
  - `packages/api/src/contracts.ts:286-288` (p1 chỉ có `tfng`, `ynng` chỉ có ở p3; p2 không có cả hai) và `packages/api/src/contracts.ts:294-297` (listening không có tfng/ynng).
  - `packages/api/src/contracts.ts:679-685` (create) và `apps/server/src/routes/assignments/index.ts:171-175` (PATCH): type của câu không thuộc catalog part bị reject (`invalid type` / `invalid question type`).
  - Select "Dạng bài câu N" của grid chỉ liệt kê `typeCatalog` của part (`apps/web/src/components/assignments/answer-key-grid.tsx`, biến `typeCatalog`), tức nút mới vượt qua ràng buộc mà dropdown tôn trọng.
- Failure scenario: đề reading p1 type `note` có run `YES/NO/NOT GIVEN`: grid cảnh báo `ynng`, giáo viên bấm nút, grid đổi sang chip YES/NO, bấm Lưu thì server 400 vì `ynng` không thuộc p1. Với đề listening (form/notes markerless) mọi lần bấm đều 400. Giáo viên kẹt trong trạng thái draft không lưu được.
- Suggested fix: phase-03, Steps 2: chỉ render nút khi `typeCatalog.some(e => e.id === inferred[i])`. Nếu không, hiện cảnh báo thuần text kèm hướng dẫn ("dạng này không có trong part, hãy đổi dạng đề"). Steps 1 (test): thêm case reading p1 + run YES/NO (không có nút), listening s1 (không có nút), p1 + TFNG (có nút).

### F4. Layout split mới có thể phá e2e/test về pane cuộn độc lập vì contract `data-testid`
- Lens: Failure Mode Analyst (e2e flake)
- Severity: High
- Claim bị phá: phase-04 Steps 3 ("mỗi pane `lg:min-h-0 lg:overflow-y-auto`, bỏ chiều cao cố định riêng từng pane") không nói pane nào giữ `data-testid`.
- Evidence:
  - `apps/student/src/components/quiz/quiz-reading-layout.tsx:44-47`: `data-testid="reading-work-pane"` hiện nằm trên `div` BÊN TRONG `section aria-label="Bài làm"`, và chính div đó mới là phần tử có `overflow-y-auto`.
  - `apps/e2e/specs/student-quiz-take-review.spec.ts:713-741`: spec đọc `workPane.evaluate(el => el.scrollTop)` và đòi `> 0` sau wheel; cũng đòi `x` của passage pane nhỏ hơn work pane.
- Failure scenario: dev đặt `overflow-y-auto` lên `section` (theo đúng câu chữ plan), để div testid thành phần tử không cuộn. `scrollTop` của div luôn 0 nên `expect.poll(...).toBeGreaterThan(0)` timeout 15s, test vỡ và có vẻ như flake. Thêm nữa, phase-04 test layout mới chỉ kiểm navigator "ngoài section Bài làm" mà không kiểm phần tử cuộn nào.
- Suggested fix: phase-04, Steps 3 ghi rõ: giữ `data-testid="reading-passage-pane"` và `reading-work-pane` trên đúng phần tử mang `lg:overflow-y-auto`; `section aria-label="Bài làm"` chỉ là wrapper `lg:min-h-0 lg:flex lg:flex-col`. Steps 1 thêm assert unit: html của testid `reading-work-pane` chứa `lg:overflow-y-auto`.

### F5. Navigator phẳng + sticky chiếm gần 40% màn hình mobile với đề 40 câu
- Lens: Failure Mode Analyst (mobile/overflow)
- Severity: High
- Claim bị phá: plan.md Risks "Bỏ tab làm navigator dài với đề 40 câu: `flex-wrap` xuống dòng; thanh full-width chứa ~25-30 nút mỗi dòng ở >= lg" chỉ tính desktop.
- Evidence:
  - `packages/ui/src/components/quiz/quiz-navigator.tsx:59` (`sticky bottom-0 z-20`, footer dính đáy ở mọi viewport) và `quiz-navigator.tsx:125` (nút `size-9`, gap 1.5).
  - `packages/api/src/contracts.ts:649` (`.max(40)` câu mỗi prompt) và `apps/e2e/specs/student-quiz-take-review.spec.ts:746` (e2e đã dùng viewport 375x667).
- Failure scenario: 375px rộng chứa 8 nút/hàng, 40 câu thành 5 hàng. Chiều cao footer khoảng 5x36 + 4x6 + status ~28 + padding 24, xấp xỉ 256px trên 667px (38%). Phần bài làm còn ~60% màn hình, câu cuối bị che, và `scrollToQuestion` (`block: "start"`) kết hợp `scroll-mt-24` không tính chiều cao footer này. Trước đây tab giới hạn mỗi lần ≤ một nhóm nên footer thấp.
- Suggested fix: phase-04 Steps 2: container nút thêm `max-h-[30svh] overflow-y-auto` ở dưới lg (hoặc `max-lg:`), để hộp progress luôn thấy. Steps 1: test markup có class đó; e2e thêm case viewport 375x667 với 40 câu đo `boundingBox().height` của footer nhỏ hơn 40% viewport. Cập nhật Risk table tương ứng.

---

## Medium

### F6. Lệnh verify `pnpm --filter <app> test -- <pattern>` không lọc, chạy toàn bộ suite
- Lens: Assumption Destroyer
- Severity: Medium
- Claim bị phá: phase-01 Verify (`pnpm --filter server test -- infer-question-types`, `--filter web test -- cloze`), phase-02 Verify, phase-03 Verify; "đã thấy red trước khi implement".
- Evidence: `apps/server/package.json:13` (`"test": "vitest run"`). Đã chạy thật trong worktree: `pnpm --filter server test -- grade-quiz` thực thi `vitest run -- grade-quiz` và chạy 27 file / 448 test (filter bị bỏ qua), còn `pnpm --filter server test grade-quiz` chạy đúng 1 file / 15 test.
- Failure scenario: bước "red trước" và "green sau" không cô lập được test mới, gate chậm và một test lạ fail có thể bị nhầm là của phase. Với web `--filter web test -- cloze` chạy cả suite jsdom.
- Suggested fix: thay mọi `test -- <pattern>` trong phase-01..03 bằng `test <pattern>` (bỏ `--`). Với e2e, xác minh `pnpm --filter e2e e2e student-quiz-take-review` trên môi trường thật trước khi ghi vào gate.

### F7. Phím Enter trên fieldset nuốt thao tác bàn phím của nút 1-click
- Lens: Failure Mode Analyst
- Severity: Medium
- Claim bị phá: phase-03 Steps 2 "mỗi run render một khối cảnh báo (đặt trên hàng đầu của run)" không nói đặt trong hay ngoài `<fieldset>` của hàng.
- Evidence: `apps/web/src/components/assignments/answer-key-grid.tsx:274` (`onKeyDown={(event) => handleKeyDown(event, index)}` trên fieldset) và `answer-key-grid.tsx:185` (`Enter` gọi `event.preventDefault()` rồi `onAddQuestion()`, chỉ bỏ qua khi target là INPUT/TEXTAREA).
- Failure scenario: nút 1-click đặt trong fieldset hàng 1. Người dùng bàn phím focus nút rồi Enter: keydown bị `preventDefault` (huỷ click) và thêm một câu rỗng mới thay vì áp dụng sửa. Space vẫn chạy, nhưng hành vi Enter ngược kỳ vọng và dễ đẩy đề vượt giới hạn 40 câu.
- Suggested fix: phase-03 Steps 2: render khối cảnh báo như sibling đứng TRƯỚC `<fieldset>` đầu run (bọc Fragment, chuyển `key` lên Fragment), ngoài phạm vi `onKeyDown`. Steps 1 thêm test `fireEvent.keyDown(button, {key: "Enter"})` không gọi `onAddQuestion`.

### F8. Đáp án near-miss ("True", "Not given", khoảng trắng đôi) là câu chết không có tín hiệu nào
- Lens: Failure Mode Analyst (+ Security/Data: lệch giữa grader và helper)
- Severity: Medium
- Claim bị phá: phase-03 chỉ cảnh báo trên câu mà helper suy luận được (`!type && inferred !== typeId`); Key Decision 3 canonical-only đã chốt, nhưng hệ quả là near-miss không được báo ở đâu.
- Evidence:
  - `apps/web/src/components/assignments/answer-key-grid.tsx` (nhánh `choices && rowKind !== "text" ? chips : <Input>`): đề type `note` là kind text nên giáo viên gõ tự do.
  - `packages/api/src/lib/grade-quiz.ts:22` (`normalize` = collapse whitespace + lowercase, tức grader chấp nhận "true", "not  given").
  - `packages/ui/src/components/assignments/cloze-stem.tsx:119` (stem markerless in nguyên văn, không input).
- Failure scenario: giáo viên gõ `Not given` hoặc `True` vào ô text của đề note. Helper không match, phase-03 không cảnh báo, học viên vẫn không có widget nào. Đây chính là lớp lỗi của #303, chỉ khác chính tả. Quyết định canonical-only vẫn đúng cho runtime, nhưng authoring phải bắt được.
- Suggested fix: phase-03 thêm lớp cảnh báo thứ hai trong grid (không đổi runtime, không đảo Key Decision): câu markerless, không opts, không type, `answer` khi `trim().replace(/\s+/g," ").toUpperCase()` thuộc bộ canonical nhưng khác chữ canonical: "Đáp án 'True' không đúng chính tả — nhập TRUE/FALSE/NOT GIVEN". Có thể mở rộng thành cảnh báo chung "câu không có chỗ trống ____" cho mọi câu markerless thuộc type trong tập cloze. Thêm test tương ứng ở Steps 1.

### F9. Phase-04 hướng dẫn thêm CHANGELOG "Unreleased" nhưng file không có mục đó
- Lens: Assumption Destroyer
- Severity: Medium (thấp)
- Claim bị phá: phase-04 Files: "Modify: CHANGELOG.md (thêm entry Unreleased, theo tiền lệ commit a4f3487)".
- Evidence: `CHANGELOG.md:5-9` (quy ước: mục `## YYYY-MM-DD`, group `### Added/Changed/Fixed`, ghi `(#issue)`). Mục mới nhất là `## 2026-10-01`; không có `Unreleased`.
- Failure scenario: dev tạo heading "Unreleased" phá quy ước nhật ký theo ngày; hoặc nhét vào ngày cũ.
- Suggested fix: phase-04 Files + Steps: thêm mục `## 2026-10-02` (hoặc ngày merge) với `### Fixed` (câu T/F/NG trong đề note có lựa chọn, #303) và `### Changed` (navigator bỏ tab, trải full-width).

---

## Đã kiểm, không phải finding (để reviewer khác khỏi lặp)
- Grading không đổi: `grade-quiz.ts:54` so khớp sau normalize, radio `"FALSE"` khớp key `"FALSE"` (Key Decision 6 đúng).
- Import cycle: `packages/ui/package.json` đã phụ thuộc `@teacher-os/api`, api không import ui; chuyển `CLOZE_MARKER_SOURCE` sang api là một chiều hợp lệ. Export map `./*` của api (`packages/api/package.json`) resolve được `@teacher-os/api/lib/infer-question-types`, và `apps/server/vitest.config.ts` include `src/**/*.test.ts` nên test đặt ở `apps/server/src/lib` chạy được.
- Wire/client cũ: `studentQuizQuestionSchema.type` là optional string (`contracts.ts:1683`), client cũ + server mới an toàn.
- ReDoS: regex `_{4,}` tuyến tính, stem bị cap 500 ký tự (`contracts.ts` schema questions); không có regex mới nào từ input không tin cậy.
- Rò rỉ đáp án: type suy luận chỉ lộ "đáp án thuộc họ tfng/ynng", tức nội dung instruction; không lộ đáp án cụ thể. Sau khi sửa F2 (họ theo câu) thông tin này vẫn không vượt instruction.
- Snapshot đang làm: suy luận chạy trên `questionsSnapshot` nên ổn định qua các lần reload, không phụ thuộc prompt live.
- Grid đã giả định `stem`/`answer` là string (`answer-key-grid.tsx:57`, `:66`), nên gọi helper trên raw items không thêm rủi ro null.

## Unresolved Questions
- Legacy `shortans` markerless (stem in nguyên văn, không input, `cloze-stem.tsx:119`) bị cùng lỗi gốc nhưng nằm ngoài phạm vi; plan nên nêu rõ phạm vi này rộng hơn "đáp án không phải TFNG".
- Preview "Đề bài" tab của giáo viên (không phải tab mô phỏng) vẫn in stem thô cho câu markerless; plan có chủ đích bỏ qua chưa?
