---
title: "Refactor trang soạn đề thư viện theo bố cục Quiz Builder (Selfomy)"
description: "Trang sửa đề admin chuyển từ tab part sang khung hai cột: cây Part → Nhóm → Câu bên trái, thẻ lồng nhau có tab bên phải, hàng câu thu gọn kèm chip tóm tắt."
status: pending
priority: P1
effort: "3d"
tags: [admin, library, ui, refactor]
created: 2026-10-23
branch: develop
blockedBy: [261022-1329-library-question-groups]
issue: https://github.com/vinh19410/teacher-os/issues/424
source: plans/reports/rea-261023-1420-selfomy-quiz-builder-ui-structure.md
---

# Refactor trang soạn đề thư viện theo bố cục Quiz Builder

## Overview

Trang `apps/admin/src/routes/_auth/library/tests/$testId.tsx` hiện là một cột `max-w-4xl`: thẻ thông tin bộ đề, `PartTabs` theo slot, và một `PartForm` dài cho part đang chọn. Plan này dựng lại trang theo cấu trúc trong report Selfomy:

- Thẻ thông tin bộ đề gọn ở trên, thanh hành động (lưu part đang mở, kiểm tra đáp án, xuất bản).
- Cột trái: cây điều hướng ba tầng **Part (slot) → Nhóm câu → Câu**, số câu tuyệt đối chạy liên tục qua các part (**đánh số fold theo số câu thật** — quyết định red-team A1/S1, không dùng `qStartOf` tĩnh), cuộn độc lập, thu gọn được.
- Cột phải: thẻ Part có tab **Nội dung / Câu hỏi (n)**; trong tab Câu hỏi là các thẻ Nhóm có tab **Hướng dẫn / Thiết lập / Câu hỏi (n)**; trong nhóm là các hàng câu thu gọn được, hàng thu gọn hiện chip tóm tắt.
- Một bộ nút điều khiển dùng chung cho mọi cấp (mở/đóng, lên/xuống, xóa).

## Quyết định đã chốt (2026-10-23)

| # | Quyết định | Hệ quả |
|---|---|---|
| Q1 | Plan này **thay phase 4–5** của plan #420 | Phụ thuộc #420 phase 2–3 (schema `groups`, migration `0044`, route). Phần UI nhóm của #420 phase 4 được làm theo layout mới ở đây; các task helper/test của #420 phase 4 được tái dùng nguyên văn |
| Q2 | Giữ **lưu từng part** (PUT theo slot) + PATCH header | Không đổi API. Thanh hành động lưu part đang mở; cây đánh chấm part chưa lưu; `useBlocker` giữ nguyên |
| Q3 | Giữ **slot cố định** (D4 của #420) | Cây luôn hiện đủ slot của skill; không có "Add Section"; slot trống có nút "Thêm nội dung" |
| Q4 | Màu phân cấp của Selfomy (tím/xanh dương/xanh lá) **không chép** | `DESIGN.md` cấm thêm màu ngoài trạng thái. Phân cấp bằng thụt lề, kiểu badge (Part: nền mực; Nhóm: viền; Câu: nền muted) và viền `ring` cho mục đang mở. Ghi vào mục "Lệch có chủ đích" của `DESIGN.md` |
| Q5 | "Answers Checking" = panel **xem toàn bộ đáp án** chỉ đọc, theo số câu tuyệt đối, đánh dấu câu thiếu đáp án | Dán đáp án hàng loạt vẫn dùng `BulkKeyPastePanel` theo từng nhóm (không mở rộng). Không sửa chéo part từ panel này |

## Non-goals

- Section tự do, đổi API lưu thành một lệnh "Save Quiz", nhập đề bằng AI.
- Kéo-thả sắp xếp (dùng nút lên/xuống như Selfomy).
- Cú pháp `@answer[[n;; …]]` nhúng đáp án trong passage (giữ marker `____` theo D7 của #420).
- Đổi web composer (`apps/web`) hay màn làm bài học viên. Mọi prop mới ở `packages/ui` là optional, web không truyền thì hành vi không đổi.
- Nút "Xem trước".

## Phases

| # | Phase | Phụ thuộc | Status |
|---|---|---|---|
| 1 | [Primitive editor dùng chung](./phase-01-shared-editor-primitives.md) | #420 phase 1 | Pending |
| 2 | [Model nhóm và model cây đề](./phase-02-builder-models.md) | #420 phase 2–3, phase 1 | Pending |
| 3 | [Cây điều hướng và thẻ Part/Nhóm](./phase-03-outline-and-cards.md) | 2 | Pending |
| 4 | [Bố cục trang hai cột](./phase-04-page-layout.md) | 3 | Pending |
| 5 | [E2E, verify 3 viewport, docs](./phase-05-e2e-verify-docs.md) | 4 | Pending |

Một PR (PR2 của #420 mở rộng) gồm #420 phase 2–3 + phase 1–5 của plan này, nhánh cắt từ `develop`.

## Acceptance criteria

- [ ] Trang sửa đề Reading hiện cây với đủ 3 passage; passage có 2 nhóm (3 + 2 câu) hiện "Nhóm câu 1", "Nhóm câu 2" và "Câu 1"…"Câu 5"; passage sau bắt đầu đánh số tiếp ngay sau số câu thật của part trước (fold — part trước 5 câu thì part sau bắt đầu "Câu 6").
- [ ] Bấm "Câu 4" trên cây mở đúng part, đúng nhóm, mở hàng câu 4 và cuộn tới nó; bấm mục của part khác khi part hiện tại còn nháp không làm mất nháp.
- [ ] Hàng câu thu gọn hiện đoạn trích đề và chip tóm tắt (số lựa chọn, có/thiếu đáp án); mở ra hiện editor đầy đủ kèm "Giải thích câu n".
- [ ] Thẻ Part tab "Câu hỏi" có badge đếm số nhóm; thẻ Nhóm tab "Câu hỏi" có badge đếm số câu; badge `aria-hidden`.
- [ ] Panel "Kiểm tra đáp án" liệt kê mọi câu theo số tuyệt đối, đánh dấu câu thiếu đáp án.
- [ ] Mọi acceptance còn lại của #420 (lưu/tải lại nhóm, đề cũ hiện như một nhóm, chặn xuất bản nhóm inline sai) vẫn đạt trên layout mới.
- [ ] 3 viewport (1440×900, 768×1024, 375×812): không cuộn ngang; dưới `lg` cây nằm trên và thu gọn mặc định.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test`, Playwright `admin-library-*.spec.ts` pass ở local.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `AnswerKeyGrid`/`QuestionKeyEditor` dùng chung với web composer | Mọi prop mới optional, mặc định giữ hành vi cũ; chạy test `@teacher-os/ui` + `apps/web` sau phase 1 |
| Cây cần dữ liệu của mọi part nhưng chỉ một `PartForm` được mount | Cây đọc `drafts` (nháp đã báo lên) rồi mới tới DTO đã lưu, qua helper thuần `buildTestOutline` |
| Đổi part khi đang có nháp | Nháp đã được giữ trong `drafts` và khôi phục qua `initialValue` (cơ chế sẵn có); test e2e khóa hành vi này |
| E2E hiện chọn part bằng `getByRole("tab")` | Phase 5 đổi helper `openEmptySlot` sang mục cây; giữ tên slot ("Passage 1", "Section 1") làm accessible name |
| Trang rộng hơn (`max-w-4xl` → khung rộng) làm vỡ form header | Verify 3 viewport ở phase 5 |

## Dependencies

- Plan #420 `plans/261022-1329-library-question-groups/` phase 2–3 phải xong trước phase 2 của plan này. Phase 4–5 của #420 được đánh dấu "thay bằng plan này".
- Report nguồn: `plans/reports/rea-261023-1420-selfomy-quiz-builder-ui-structure.md`.

## Validation Log

### Session — 2026-10-23 (vibe ai-handle #424, autonomous)

#### Verification Results
- **Tier:** Full (5 phases + #420 phase 2–3 tái dùng)
- **Claims checked:** 27 — Verified: 26 | Failed: 0 | Unverified: 1 (dependency theo đúng thứ tự: `countClozeMarkers`/`librarySkillTypes` chưa tồn tại — do #420 phase 2 tạo trong cùng PR này)
- Contract Verifier: 10 hợp đồng interface đếm tường minh mọi caller (QuestionKeyEditor/AnswerKeyGrid/segmentsToItems/PartForm/PartTabs/libraryPartUpsertSchema/symbol mới/htmlToPlainText/qStartOf/migration 0044) — 0 FAILED, 3 finding rủi ro bỏ sót caller (VC1–VC3, đã áp).
- Fact Checker: 17 nhóm claim — 16 VERIFIED, 1 UNVERIFIED (dependency đúng dự kiến).

## Red Team Review

### Session — 2026-10-23 (vibe ai-handle #424)

3 reviewer (Security Adversary + Fact Checker, Failure Mode Analyst + Flow Tracer, Assumption Destroyer + Scope Auditor) + 1 Contract Verifier, 23 findings gốc → 21 duy nhất sau dedupe. Autonomous: adjudicate bằng evidence codebase; mọi finding Accept đều đã áp vào phase files.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Đánh số theo `qStartOf` tĩnh sai cơ chế — trùng số/hụt số khi part lệch khối canonical; repo cấm static qStart (test-ranges precedent) | Critical | Accept | phase-02 Task 2.3 (fold `computeLibraryTestRanges`), plan.md Overview + Acceptance |
| 2 | `AnswerKeyGrid` tự tính `qStartOf` nội bộ, không có đường override — hàng câu nhóm ≥2 đánh số sai | Critical | Accept | phase-01 Task 1.1 (prop `qStartOverride` cho grid) |
| 3 | `useImperativeHandle` stale closure `value` — Lưu part ghi đè mất nội dung đã gõ; nút enable khi slot trống | High | Accept | phase-03 Task 3.4 b5 (no dep array), phase-04 Task 4.1 (disable), phase-05 Task 5.2 b4 |
| 4 | `focusTarget` scroll trước khi DOM render + object identity re-fire mỗi render | High | Accept | phase-03 Task 3.4 b3 (nonce + consume-once + effect scroll) |
| 5 | `onMoveRow` không remap `blurred`/`openRow` — lỗi dán nhầm hàng sau move | High | Accept | phase-01 Task 1.6 b4 (move bên trong grid như `remove()`) |
| 6 | Force-open hàng lỗi theo `rowErrors` thay vì lỗi đang hiện; blur-khi-thu-gọn; đổi tab mất state | High | Accept | phase-01 Task 1.3 (hidden, không unmount) + 1.6 b2 (errorEntries, clear blurred), phase-03 Task 3.3 b3 (một instance QKE) |
| 7 | Hàng thu gọn mặc định làm e2e cũ vỡ; chưa chốt auto-open "Thêm câu"; "Dạng bài" chưa rõ tab | High | Accept | phase-03 Task 3.4 b1 (flat không collapsibleRows; Dạng bài ở tab Câu hỏi), phase-05 Task 5.1 b4 + 3.3 b3 (auto-open hàng mới) |
| 8 | "Tái dùng nguyên văn Task 4.4" che fix data-loss `normalizeQuestions` strip `explanation`/`answerSet` | High | Accept | phase-02 Task 2.2 (callout bước 5 + round-trip test) |
| 9 | `selection` trùng nguồn sự thật với `openGroup`/`openRow`; index không invalidation khi remove/move | High | Accept | phase-03 Task 3.4 b4 (`onActivePositionChange` + clamp), phase-04 Task 4.2 b4 (owner duy nhất) |
| 10 | `resolvePartValues` draft không kiểm `dirty` — cây hiển thị cũ hơn DTO đã lưu | High | Accept | phase-02 Task 2.3 b2 (dirty-gate mirror `effectiveParts`) |
| 11 | `openRow` một số chia sẻ mọi nhóm — mở nhầm hàng nhóm khác | Medium | Accept | phase-03 Task 3.3 b1 (`openRowByGroup`) |
| 12 | E2E panel chỉ phủ happy path "0 thiếu" — regression nhánh missing không bị bắt | Medium | Accept | phase-05 Task 5.2 b5 |
| 13 | `docs/system-architecture.md:54` "7 authoring HTML fields" lệch sau khi thêm field | Medium | Accept | phase-05 Task 5.5 b3 |
| 14 | Excerpt hướng dẫn nhóm rich HTML không chỉ định `htmlToPlainText` — rác/XSS sink | Medium | Accept | phase-03 Task 3.3 b2 |
| 15 | `questionSummary.choiceCount` theo `typeId` bỏ qua `item.type`; letter-kind trả hằng số A–H | Medium | Accept | phase-01 Task 1.5 (`kindOf(item.type ?? typeId)` + `optionBank`, null khi không xác định) |
| 16 | Mục Security phase-01 sai ("không đổi dữ liệu"); thiếu gate single-sink | Medium | Accept | phase-01 Security (viết lại + grep gate) |
| 17 | `alts` tách theo `"/"` thay vì `" / "` của grader — panel nói khác thứ được chấm | Medium | Accept | phase-02 Task 2.4 b2 (ALT_SEPARATOR) |
| 18 | Outline coi draft sạch là dữ liệu — slot vừa "Thêm nội dung" hiện "1 nhóm · 1 câu" | Medium | Accept | phase-02 Task 2.3 b2 (predicate empty) |
| 19 | Tab "Câu hỏi" trùng accessible name 3 cấp — e2e strict-mode violation | Medium | Accept | phase-05 Task 5.1 b3 (helper scoping) |
| 20 | `table-grid-editor.tsx:70` là caller thứ 2 của `segmentsToItems` không được plan nêu | Medium | Accept | phase-01 Task 1.2 + Related files |
| 21 | CardTabs/part-tabs mâu thuẫn văn bản; enumeration caller PartForm chưa đủ | Medium | Accept | phase-03 Task 3.1 b1 (file mới), Task 3.4 b6 (liệt kê 8+1+2 chỗ) |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-05 (sau khi apply toàn bộ 21 findings)
- Decision deltas checked: 21 (fold numbering lan sang Overview/Acceptance/phase-02/phase-04/phase-05; grid qStartOverride lan sang phase-01/03; flat-no-collapsible lan sang phase-03/05)
- Reconciled stale references: 3 ("qStart của slot" ở acceptance; "collapsibleRows" ở tab phẳng phase-03; Task 4.3 panel "số tuyệt đối" → fold)
- Unresolved contradictions: 0
