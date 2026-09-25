---
title: "Authoring UX: soạn đề IELTS theo họ nhập liệu"
description: "Tái cấu trúc màn hình soạn đề theo 4 họ nhập liệu dùng chung (answer-key grid, option bank có cấu trúc, cloze click-to-blank, ảnh ghim nhãn) để giáo viên nhập 37 loại đề IELTS nhanh và ít lỗi nhất."
status: in-progress
priority: P1
effort: 23h
issue: 271
branch: vinh19410/feat/assignment-authoring-ui-ux
tags: [feature, frontend, api, database]
blockedBy: []
blocks: []
created: 2026-09-25
---

# Authoring UX: soạn đề IELTS theo họ nhập liệu

## Overview

Đầu tư UI/UX màn hình soạn đề (`/assignments/new`) theo kết quả nghiên cứu [reports/research-authoring-ui-ux.md](./reports/research-authoring-ui-ux.md) (pattern H5P/Moodle/Wordwall/Wayground) và scout codebase [reports/scout-codebase.md](./reports/scout-codebase.md). 37 loại đề hiện có (22 dạng reading/listening có câu hỏi + 15 dạng prompt-only writing/speaking) quy về 4 họ nhập liệu + 1 dạng ảnh đặc biệt; điểm nghẽn lớn nhất là **nhập kép** (gõ nội dung rồi gõ lại đáp án) và **mất dữ liệu** khi đổi dạng. Plan gồm 4 phase theo thang ưu tiên của research: quick wins không đổi schema → option bank có cấu trúc (`sharedOpts`) → cloze click-to-blank → ảnh ghim nhãn cho diagram/map.

**Ràng buộc thực thi:** 4 phase chạy tuần tự trên 1 branch `vinh19410/feat/assignment-authoring-ui-ux`, **1 PR per phase** vào `develop` (Phase 1 không đổi contract nên merge độc lập được; Phase 2 đổi contract+DB nên phải merge trước Phase 3/4 vì key-dropdown của Phase 2 và pin-editor của Phase 4 dựng trên family editors của Phase 1).

**Ngoài scope (theo research, đầu tư lớn xếp sau):** upload ảnh/audio thật (vẫn URL-only), AI sinh draft câu hỏi, import Word/PDF, field `explanation`, luồng học viên nộp bài, auto-grading.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Xóa nhập kép: đáp án tự sinh khi giáo viên đánh dấu nội dung (grid chips, cloze click-to-blank) | P1 |
| 2 | Hết mất dữ liệu: xác nhận khi đổi skill/part/type + giữ transcript + autosave draft (ưu tiên rõ với preview draft) | P1 |
| 3 | Bank lựa chọn có cấu trúc cho 5 dạng matching + listening map, validate đồng bộ contract/web/preview/snapshot | P1 |
| 4 | Diagram/map (reading/listening) nhập bằng ghim nhãn trên ảnh (toạ độ %) thay vì key text mù | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Authoring quick wins: key grid, chống mất dữ liệu, autosave](./phase-01-authoring-quick-wins.md) | Done |
| 2 | [Option bank có cấu trúc cho matching + map](./phase-02-option-bank.md) | Done |
| 3 | [Cloze click-to-blank cho dạng completion](./phase-03-cloze-editor.md) | Done |
| 4 | [Ảnh ghim nhãn cho diagram + map](./phase-04-image-pins.md) | Pending |

## Success Criteria

- [ ] Giáo viên khóa đáp án tfng/ynng/mcq bằng grid chips + phím tắt, không gõ chữ tay.
- [ ] Đổi skill/part/type có dialog xác nhận (kể cả nhánh skill); giữ `transcript` trong cùng skill; có autosave draft phục hồi sau refresh, ưu tiên rõ với preview draft.
- [ ] 6 cặp (skill, type) bankable (5 matching + listening map) nhập bank A–H (headings: i–viii) qua danh sách dòng có cấu trúc; contract validate bank ≥ câu hỏi và answer ∈ bank; dữ liệu round-trip qua snapshot không mất.
- [ ] 10 dạng completion có cloze editor click-vào-chữ; đáp án tự sinh; marker `____` render đúng preview; cap stem 500/40 câu enforce tại web.
- [ ] diagram (reading) + map (listening) đặt đáp án bằng ghim trên ảnh; contract bắt buộc pin khi ready (skill-qualified, không đụng writing task1 map); pin round-trip qua snapshot.
- [ ] `pnpm test` xanh; e2e mở rộng pass; validation contract/web/preview/snapshot không lệch nhau.

## Dependencies

- Kế thừa state sau plan #269 (14 dạng Reading + gate audio/ảnh trong schema strict).
- Phase 2 dựng thêm cột DB + trường contract; Phase 3 chỉ dùng convention dữ liệu trong `questions` JSON hiện có; Phase 4 thêm `pin` vào question item (contract + snapshot read-path), phụ thuộc Phase 2 cho bank của map.

## Red Team Review

### Session — 2026-09-25
**Findings:** 27 raw → 15 sau dedup (12 accepted, 3 rejected/cosmetic)
**Severity breakdown:** 2 Critical, 9 High, 4 Medium
**Reviewers:** Security Adversary + Failure Mode Analyst + Assumption Destroyer (Standard tier: Fact Checker + Contract Verifier/Scope Auditor)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `map` trùng type-id writing task1 — rule gate thiếu skill-qualifier chặn nhầm đề writing | Critical | Accept | Phase 4 (FR2 skill-qualified, pairs set) |
| 2 | Đường đọc snapshot strip im lặng `optionBank`/`pin` (`parseQuestions`, destructure, KernelAssignmentPromptRow, repo projection, mock-data, PreviewDraft); claim "server pass-through" sai | Critical | Accept | Phase 2 + 4 (file lists, FR7, e2e round-trip) |
| 3 | Draft localStorage mới va chạm preview draft sessionStorage (`takePreviewDraft` destructive), thiếu precedence/clear-on-cancel/TTL; gọi `savePreviewDraft` bỏ sót transcript | Critical | Accept | Phase 1 (FR6) |
| 4 | Xóa dòng bank renumber nhãn → answer re-bind âm thầm, key chấm sai không có signal | High | Accept | Phase 2 (FR3 reset rule + e2e) |
| 5 | `optionBank.max(10)` mâu thuẫn bank ≥ số câu (questions max 40) + nhãn chỉ có 8 giá trị | High | Accept | Phase 2 (cap 8 + questions ≤ 8 cho bankable) |
| 6 | Phase 4 đòi map bankable nhưng Phase 2 không có map trong set; `dependencies` thiếu Phase 2 | High | Accept | Phase 2 + 4 (bankablePairs, deps [1,2]) |
| 7 | Cloze/tablecomp bỏ qua cap stem 500 + 40 câu → 400 mù "invalid body" | High | Accept | Phase 3 (FR2/FR4/FR7 caps) |
| 8 | Confirm đặt trong `setValue` updater — StrictMode double-fire | High | Accept | Phase 1 (step 4 hoist) |
| 9 | Paste key "map theo thứ tự" bỏ qua số dòng → misalignment chấm sai | High | Accept | Phase 1 (FR7 map theo số) |
| 10 | FR5 giữ `intro` khi đổi type → leak câu lệnh/bank chéo dạng, đảo ngược guard #269 | High | Accept | Phase 1 (FR5: chỉ giữ transcript) |
| 11 | Skill-change nhánh `emptyComposer` xóa sạch không confirm | High | Accept | Phase 1 (FR5 + e2e) |
| 12 | `.strict()` inner KHÔNG có → `pin` bị strip im lặng; risk model "400" sai; DB migration thiếu thứ tự deploy/rollback | High | Accept | Phase 4 (Key Insights, Risk) + Phase 2 (step 1 deploy order) |
| 13 | FR7 Phase 4 dựng trên edit flow không tồn tại (route insert-only) — phantom criterion, rủi ro scope creep | Medium | Accept | Phase 4 (FR7 viết lại) + Phase 2 (non-functional) |
| 14 | Mâu thuẫn marker-count Phase 3: FR7 cấm 0 marker trong khi tablecomp/đề cũ cần 0 | High | Accept | Phase 3 (FR7: ≥2 lỗi, 0 hợp lệ) |
| 15 | Đếm "26 dạng" sai (catalog 37 loại: 22 auto + 15 prompt-only) | Medium | Accept (cosmetic) | plan.md, phase-03 |

**Rejected:** 0 finding thiếu bằng chứng (cả 27 đều có file:line); 3 phát hiện trùng lặp gộp vào #2/#6; 2 nhận xét lệch dòng ±3 không đáng kể (Fact Checker: ChipFilter guard offset).

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier/Scope Auditor)
- **Claims checked:** ~24 (file paths, symbols, line refs, behavioral claims)
- **Verified:** 20 | **Failed:** 4 | **Unverified:** 0
- **Failures (đã sửa trong plan):**
  1. [Fact Checker] "persist/snapshot trong `apps/server/src/routes/assignments/index.ts`" — sai, snapshot ở `apps/server/src/routes/snapshot.ts:351-396`, `parseQuestions` tại 76-110
  2. [Contract Verifier] `optionBank`/`pin` consumers thiếu 5-6 điểm: `KernelAssignmentPromptRow` (`contracts.ts:816-851`), `repos/assignment-prompts.ts:7-31`, `mock-data.ts:55-80`, `assignment-preview-draft.ts:4-24`, gọi site `new.tsx:373-392`
  3. [Flow Tracer] "server route pass-through zod" — sai: insert map tường minh `index.ts:65-93`, `.returning({id})`
  4. [Scope Auditor] localStorage draft xung đột sessionStorage preview draft (`assignment-preview-draft.ts:60-66`, `new.tsx:131`)

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-04 (sau khi áp accepted findings)
- Decision deltas checked: 7 (skill-qualified gates; bankablePairs gồm map; chỉ giữ transcript; confirm mọi nhánh skill/part/type; cap bank 8/questions ≤ 8; marker 0-hợp-lệ; pin `.strict()` inner + snapshot read-path)
- Reconciled stale references: mô tả phase 2/4 trong plan.md, success criteria, "26 dạng" → 37 loại/22 auto
- Unresolved contradictions: 0
