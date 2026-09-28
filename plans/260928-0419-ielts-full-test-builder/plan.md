---
title: "IELTS Full Test Builder — bộ đề hoàn chỉnh trên nền assignment prompt"
description: "Thêm tầng entity 'assignment_test' nhóm nhiều part thành 1 bộ đề IELTS hoàn chỉnh (Reading 3 passages/40 câu/60 phút trước, mở rộng Listening/Writing/Speaking sau), kèm Answers Checking soát đáp án 40 câu."
status: pending
priority: P1
effort: 3d
branch: vinh19410/feat/ielts-full-test-builder
tags: [feature, frontend, backend, database, api]
blockedBy: []
blocks: []
created: 2026-09-28
---

# IELTS Full Test Builder

## Overview

Ánh xạ cấu trúc Quiz Builder của Selfomy (đã tổng hợp từ trang soạn đề "Reading - Test 5 - Trainer 2") vào form builder bài tập hiện tại của teacher-os. Hiện `assignment_prompt` chỉ là **1 part đơn lẻ**; plan này thêm **1 tầng entity "test"** phía trên: bảng `assignment_test` (metadata bộ đề: title, description, timeLimit, preset theo skill, collection, group) + bảng join `assignment_test_part` (slot part theo preset, thứ tự, qStart override). Toàn bộ composer part hiện tại được **tái sử dụng 100%** — không đổi `assignmentPromptCreateSchema`, không phá luồng single-part đang sống.

Trọng tâm: giáo viên soạn được **đủ 1 bộ IELTS Reading** (3 passages × ~13–14 câu = 40 câu, 60 phút) với đánh số liên tục 1–40, preview trọn bộ, và panel Answers Checking (paste key → compare → apply) theo hành vi Selfomy. Extensibility cho 3 skill còn lại là **config-only** qua `ASSIGNMENT_TEST_PRESETS` (Listening 4 section, Writing 2 task, Speaking 3 part).

## Key Design Decisions (đã qua kongming review)

1. **2 bảng mới** (`assignment_test` + `assignment_test_part`) thay vì JSON partIds hoặc gom client-side — nhất quán precedent cây syllabus 3 bảng, snapshot join bằng FK, FK `promptId` với `onDelete: "restrict"`.
2. **KHÔNG lưu qStart tính sẵn.** Đánh số liên tục là hàm thuần `computeTestRanges(test, prompts)` tính từ `questions.length` thực tế; chỉ lưu `qStartOverride` nullable khi giáo viên chủ động ghi đè. Lý do: sửa p1 từ 13→12 câu làm lệch toàn bộ số đã lưu (drift âm thầm).
3. **Unique index `(testId, part)`** — mỗi slot IELTS đúng 1 prompt, DB chặn trùng slot.
4. **`ASSIGNMENT_TEST_PRESETS` đặt trong `packages/api/src/contracts.ts`** cạnh `ASSIGNMENT_PART_TYPES` (dòng 271) — server và web cùng 1 nguồn, không để slot config chỉ ở web.
5. **Preview (phase 4) đứng trước Answers Checking (phase 5)** — đánh số liên tục là logic rủi ro nhất, phải lộ sớm.
6. Collection/Group là **cột text + datalist** lấy distinct client-side, không dựng entity riêng.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tạo/lưu/mở được 1 bộ đề IELTS Reading 3 passages, 40 câu, timeLimit 60 phút | P1 |
| 2 | Đánh số câu liên tục 1–40 đúng trong mọi view (outline, preview, answers panel) kể cả khi part lệch 13 câu | P1 |
| 3 | Answers Checking: xem 40 đáp án, paste key hàng loạt, compare diff, apply vào prompts | P1 |
| 4 | Full-test preview render 3 passages liền mạch đúng format đề thi | P1 |
| 5 | Extensibility config-only cho Listening/Writing/Speaking (preset slots, không code per-skill) | P2 |
| 6 | Luồng single-part hiện tại (ngân hàng + giao lớp) không đổi hành vi | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema & Contracts](./phase-01-schema-and-contracts.md) | Done |
| 2 | [Server Routes & Snapshot](./phase-02-server-routes-snapshot.md) | Done |
| 3 | [Test Builder UI](./phase-03-test-builder-ui.md) | Done |
| 4 | [Full-Test Preview](./phase-04-full-test-preview.md) | Done |
| 5 | [Answers Checking](./phase-05-answers-checking.md) | Pending |
| 6 | [E2E & Extensibility](./phase-06-e2e-extensibility.md) | Pending |

## Success Criteria

- [ ] Playwright e2e: tạo bộ Reading 3 part (2 part từ ngân hàng + 1 part soạn mới inline), gán vào 3 slot, dán key 40 dòng, Compare ra diff đúng, Apply ghi được, Preview hiển thị đánh số 1–40.
- [ ] Đánh số đúng khi p1 chỉ có 12 câu (case test riêng cho `computeTestRanges`).
- [ ] E2E hiện hữu `assignment-prompt-create` + `assignment-bank` + `class-assign` vẫn xanh (không phá luồng cũ).
- [ ] `pnpm check-types` + `pnpm test` xanh ở **mỗi** phase.
- [ ] Có source-parse contract test cấm dùng `qStartOf` tĩnh trong code test-builder.

## NOT in Scope (deferred, HOLD)

- Thumbnail upload cho bộ đề; rich text editor (textarea + marker convention giữ nguyên).
- Topics tags per question group; per-question feedback/explanation (field `note` per part tạm đủ).
- Giao bài theo test (exam vs luyện tập, hạn nộp, retake) — `class_assignment.testId` nullable là việc của plan sau.
- Student runtime / làm bài / auto-grading.
- Section Feedback (Transcript) per part — field `transcript` của prompt đã có chỗ chứa.

## Context Links

- Tổng hợp cấu trúc Selfomy Quiz Builder: session 2026-09-28 (quiz "Reading - Test 5 - Trainer 2", Trainer 2 Academic, TEST 5).
- Plan tiền nhiệm: `plans/260925-0724-assignment-authoring-ui-ux/` (composer 37 types, cloze, option bank, image pins, bulk key paste).
- Kongming advisory log: checkpoint #1 (approach, 2026-09-28) — các quyết định 1–6 ở trên xuất phát từ đây.

## Validation Log

### Verification Results (2026-09-28, planner pass)
- Claims checked: 24 (file paths, symbols, line anchors trong toàn bộ phase files)
- Verified: 24 | Failed: 0 | Unverified: 0
- Tier: Full (6 phases)
- Phương pháp: grep/ls trực tiếp từng cite — `emptyKernelData` (kernel-state.ts:3 ✓), `KernelAction` (data-actions.ts:8 ✓), `VALID_EXACT_ROUTES` (routes-matcher.ts:4 ✓), `PASTE_LINE_PATTERN` (bulk-key-paste.ts:10 ✓), contracts anchors (ASSIGNMENT_PART_TYPES:271, assignmentPromptCreateSchema:410, AssignmentQuestion:958, KernelSnapshot:1031 ✓), kernel mount (kernel.ts:2119 ✓), routes verbs (assignments/index.ts: chỉ GET/, POST /prompts:60, POST /:id/grade:102 ✓ — xác nhận CHƯA có PATCH prompt), migration 0028 pattern DEPLOY ORDER ✓, qStart tĩnh 1/14/27 (assignment-presets.ts:178-206 ✓), e2e specs tồn tại ✓, `apps/server` có vitest (`pnpm -F server test` ✓), draft store schemaVersion ✓, student-preview-paper/prompt-preview-aside ✓.

### Kongming Checkpoint #2 — Final Review (2026-09-28): NEEDS-FIX → đã áp dụng đủ 8 edit
1. Phase 1 thêm `apps/web/src/lib/mock-data.ts` (`KernelHydratedData` dòng 218 phải mở rộng TRƯỚC khi thêm key vào `emptyKernelData`, nếu không check-types đỏ ở chính phase 1). ✅
2. Phase 2 Task 2.4 thêm bước wire `mapAssignmentTests` vào `mapKernelSnapshot` (`apps/web/src/lib/repos/kernel.ts:252`). ✅
3. Phase 2 Task 2.1: "transaction" → `db.batch([...])` (D1/`DrizzleD1Database` không có `.transaction()`, precedent kernel.ts:793) + tạo `tests.test.ts` với Verify có filter. ✅
4. Phase 5: `alts: string[]` → `alts: string` join `" / "` (đúng `AssignmentQuestion.alts` contracts.ts:964 + bulk-key-paste.ts:106). ✅
5. Phase 6 Task 6.1: playwright filter positional (không `--`) + e2e tự soạn prompt qua UI (boot.ts wipe DB, không có seed). ✅
6. Phase 6 Task 6.3: "không file mới" → "không file logic mới; file test shell được phép". ✅
7. Phase 3 Task 3.4: "MM:SS:SS" → "HH:MM:SS"; Task 3.3 câu preset viết lại rõ (bật cả 4 skill). ✅
8. Anchor `VALID_EXACT_ROUTES` :13 → :4 (đồng bộ plan.md + phase-02). ✅
Baseline kongming đã chạy: `pnpm -F web test` = 90 file / 990 test xanh trước khi bắt đầu.

### Interview (2026-09-28) — user chưa phúc đáp, áp dụng phương án Recommended
1. **PATCH /api/assignments/prompts/:id** (nguyên liệu Apply): THÊM — Task 2.2. *(Override: chọn "Không thêm" → bỏ Task 2.2 + Task 5.3-apply.)*
2. **Preset UI 4 skill**: BẬT cả 4 (slot từ config) — Task 6.3 unit test 4 preset. *(Override: disable 3 skill → sửa Task 3.3 bước 1.)*
3. **Collection/Group**: datalist + free text, không bảng entity. *(Override: dựng bảng → thêm 1 phase DB trước phase 1.)*
4. **timeLimitSeconds**: nullable (null = không giới hạn). *(Override: bắt buộc → đổi zod Task 1.3 + required field form Task 3.4.)*

<!-- slug: ielts-full-test-builder -->
