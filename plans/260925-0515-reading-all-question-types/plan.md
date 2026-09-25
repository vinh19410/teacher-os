---
title: "Reading: đủ 14 dạng câu hỏi IELTS cho flow tạo bài tập"
description: "Thêm 8 dạng Reading còn thiếu (matching features/sentence endings, summary/note/table/flow-chart completion, diagram label, short-answer) vào contracts, UI soạn đề, preview và tests — đủ bộ 14 dạng chính thức."
status: pending
priority: P1
effort: 12h
issue: 269
branch: vinh19410/feat/reading-all-question-types
tags: [feature, frontend, api, database]
blockedBy: []
blocks: []
created: 2026-09-25
---

# Reading: đủ 14 dạng câu hỏi IELTS cho flow tạo bài tập

## Overview

Mở rộng catalog Reading từ 6 lên đủ 14 dạng câu hỏi IELTS Academic chính thức (nguồn: [IELTS.org sample tasks 2023](https://ielts.org/cdn/Sample-tests/ielts-academic-reading-sample-tasks-2023.pdf); nghiên cứu chi tiết trong [reports/research-ielts-formats.md](./reports/research-ielts-formats.md), scout codebase trong [reports/scout-codebase.md](./reports/scout-codebase.md)). Scope là **flow tạo bài tập mới** — đúng mức hỗ trợ hiện có của 6 dạng cũ (soạn đề + khóa đáp án + preview + ngân hàng đề; chưa có luồng học viên nộp bài và chưa có auto-grading cho bất kỳ dạng nào).

**Ràng buộc thực thi:** 3 phase chạy tuần tự trên 1 branch và nhập **1 PR duy nhất** — contracts và web catalog sync-couple qua test (`assignment-presets.test.ts:66-78`), CI/deploy gates chạy `pnpm test` nên không được merge Phase 1 riêng lẻ.

Phân bổ 8 dạng mới theo part (5/5/4), id không đụng id skills khác:

| Part | Dạng hiện có | Dạng mới | Answer kind |
|---|---|---|---|
| p1 | `tfng`, `sent` | `note` (Note completion), `shortans` (Short-answer), `diagram` (Diagram label completion) | text, text, text |
| p2 | `headings`, `info` | `summary` (Summary completion), `sentend` (Matching sentence endings), `tablecomp` (Table completion) | text, letter, text |
| p3 | `ynng`, `mcq` | `features` (Matching features), `flowchart` (Flow-chart completion) | letter, text |

## Key Design Decisions

1. **2 dạng matching mới (`features`, `sentend`) dùng kind `letter` sẵn có** — đáp án A–H chọn qua ChipFilter; ngân hàng lựa chọn (danh sách tên / nửa câu) giáo viên liệt kê trong ô "Hướng dẫn đề" (`intro`) qua placeholder hướng dẫn theo dạng. **Giới hạn đã ghi nhận:** không có ràng buộc validate giữa độ dài ngân hàng trong `intro` và khóa đáp án (khác `info` nơi passage tự nhiên chứa các đoạn A–H) — follow-up `sharedOpts` nếu sau này cần chặt hơn.
2. **6 dạng completion/short-answer dùng kind `text` fallback** — giống hệt `sent`: đáp án tự do + `alts` "a/b/c" cho phương án thay thế (khớp quy tắc chấm IELTS: "hot dry air / dry hot air", "tunneling/tunnelling"). Không cần entry trong `answerKindByType`.
3. **`diagram` cần ảnh** → thêm 1 cột `image_url` (TEXT, default `''`) vào `assignment_prompt` + trường `imageUrl` trong create schema và snapshot. **Chỉ chấp nhận `https://`** (theo precedent `SAFE_AVATAR_SRC_PATTERN` https-only tại `packages/auth/src/avatar-policy.ts:20-21`; server ép HTTPS qua redirect+HSTS tại `apps/server/src/app.ts:128-145`). `ready` khi type `diagram` bắt buộc có URL (mirror listening `audioName`).
4. **Scheme policy một nguồn duy nhất:** pattern `https://` export từ `packages/api` contracts (hàm/const dùng chung), được contracts validation, `new.tsx` và renderer preview cùng import — không rải regex tại 3 chỗ.
5. **Preview là đường client-side thuần** (draft qua sessionStorage, `preview.tsx:19` `readPreviewDraft()`, KHÔNG qua contract server) → renderer preview tự verify scheme https trước khi render `<img>`; đây là lớp bảo vệ chính cho preview, contract chỉ bảo vệ đường server.
6. **Giới hạn từ IELTS** (ONE WORD ONLY…) đưa vào hint text per-type, không làm field có cấu trúc (non-goal).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Contracts & Storage](./phase-01-contracts-storage.md) | Done |
| 2 | [Web Catalog & Editor](./phase-02-web-catalog-editor.md) | Pending |
| 3 | [Preview, Bank Surfaces, E2E & Docs](./phase-03-preview-e2e-docs.md) | Pending |

## Out of Scope (non-goals)

- Luồng học viên làm bài / nộp bài / auto-grading kernel — chưa tồn tại cho 6 dạng cũ, giữ parity.
- Ngân hàng lựa chọn có cấu trúc (`sharedOpts`) cho matching — dùng `intro`; ràng buộc độ dài ngân hàng ↔ đáp án là hạn chế đã ghi nhận (Decision 1).
- Hạ tầng upload ảnh — chỉ dán URL https.
- Field có cấu trúc cho giới hạn từ — hint text.
- Biến thể "word box" của summary/flow-chart (sách cũ) — chỉ dạng words-from-text hiện đại.
- General Training Reading — dự án nhắm Academic.
- Tạo section docs mới đếm số dạng — chỉ cập nhật docs nếu nội dung tương ứng đã tồn tại.
- Đổi hành vi reset `intro` khi đổi type/part (`new.tsx:175-185`) — hành vi hiện có, giữ nguyên.

## Success Criteria

- [ ] Tổng 14 type id Reading hợp lệ qua cả server validation và web catalog; `pnpm test` xanh (presets test cập nhật 14/37; test sync KIND ↔ `answerKindByType` cho mọi type có kind).
- [ ] Soạn được đề `ready` cho từng dạng mới: letter kinds chọn đáp án A–H; text kinds nhập đáp án + alts; `diagram` bắt buộc URL https khi ready.
- [ ] Preview hiển thị **passage + intro (ngân hàng lựa chọn/câu lệnh) + câu hỏi + ảnh diagram**; không leak đáp án — assertion e2e leak-check chạy trên cả trang preview.
- [ ] Ảnh diagram nhìn thấy được ở ngân hàng đề (mapper + aside chi tiết), không chỉ preview.
- [ ] Đề mới + cũ roundtrip qua snapshot không mất dữ liệu; `pnpm check-types` và `pnpm check` sạch.

## Red Team Review

### Session — 2026-09-25
**Findings:** 15 unique sau dedup (8 accepted, 7 accepted-modified/rejected) — reviewers: Security Adversary, Failure Mode Analyst, Assumption Destroyer
**Severity breakdown:** 1 Critical, 5 High, 9 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `intro` prop của StudentPreviewPaper là prop chết — ngân hàng matching không render ở preview | Critical | Accept | Phase 3 |
| 2 | `imageUrl` thiếu trong `PreviewDraft` + `savePreviewDraft` — tính năng chết âm thầm ở preview | High | Accept | Phase 2, 3 |
| 3 | "Lưới an toàn" kind-map không tồn tại (`answerKindByType` không export; sync test chỉ so ids) | High | Accept | Phase 1 (export), 2 (sync test) |
| 4 | Step verification migration mô tả quy trình không có thật (drizzle config là d1-http remote; alchemy apply lúc deploy) | High | Accept | Phase 1 |
| 5 | Reset `intro` khi đổi type xóa ngân hàng; `imageUrl` ngược lại không được reset → dính sang đề khác | High | Accept (modified: reset imageUrl; giữ nguyên semantics intro hiện có) | Phase 2 |
| 6 | Cho phép `http://` yếu hơn precedent https-only + tracking pixel | Medium | Accept (modified: https-only + referrerPolicy no-referrer + lazy) | Phase 1, 3 |
| 7 | Security rationale sai — preview không qua contract | Medium | Accept (sửa wording, renderer là lớp chính) | plan.md, Phase 3 |
| 8 | URL policy tái phát minh 3 chỗ thay vì single source | Medium | Accept (modified: export pattern từ contracts, không đụng avatar-policy) | Phase 1, 2, 3 |
| 9 | Gate Phase 1 tự mâu thuẫn (test đỏ tạm thời) + CI/deploy chạy `pnpm test` | Medium | Accept (modified: ràng buộc 1 PR duy nhất) | plan.md |
| 10 | Không ràng buộc ngân hàng intro ↔ khóa đáp án ("same fidelity as info" là claim sai lệch) | Medium | Accept (modified: ghi nhận hạn chế tường minh + hint tĩnh, follow-up sharedOpts) | plan.md |
| 11 | E2E leak-check không hề visit preview; diện tích stale lớn hơn (dòng 132, 186-193, 209) | Medium | Accept | Phase 3 |
| 12 | Mirror validation thiếu khối `actionCopyFor` (test pin copy) | Medium | Accept | Phase 2 |
| 13 | imageUrl không thấy ở surface ngân hàng (mapper, `AssignmentPrompt` type, PromptPreviewAside) | Medium | Accept (mapper + type + aside thumbnail) | Phase 3 |
| 14 | Docs task dựa trên nội dung không tồn tại (grep rỗng) | Medium | Accept (modified: chỉ cập nhật nếu nội dung đã có) | plan.md, Phase 3 |
| 15 | `.strict()` + payload verbatim → rollback phải đồng bộ web+server | Medium | Accept (risk note) | Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi áp findings).
- Decision deltas: https-only (thay http(s)), export kind map, 1-PR constraint, intro render bắt buộc, imageUrl pipeline draft đầy đủ, migration qua db:generate + alchemy deploy.
- Kết quả: không còn mâu thuẫn giữa các file — các mention http(s), "test sync là lưới an toàn", "renderer đã phủ 8 dạng", "migration dev DB cục bộ" đã được xóa/sửa thống nhất ở mọi nơi xuất hiện.

## Validation Log

### Verification Results
- **Tier:** Standard (3 phases) — Fact Checker + Contract Verifier đã chạy bởi 3 red-team reviewers kèm adversarial lens.
- **Claims checked:** ~40 (file paths, symbols, line numbers, số test pin, commit history)
- **Verified:** 37 | **Failed:** 3 (đã sửa trong plan: claim "lưới an toàn kind-map", claim "renderer phủ 8 dạng", claim "preview qua contract") | **Unverified:** 0
- **Key verified anchors:** `contracts.ts:271-329,335-462,450-461,773-802`; `assignment-prompt.ts` (`audio_name`:33); `assignments/index.ts:60-93`; `snapshot.ts:74-108`; `assignment-presets.ts:40-55,93-134,261-289`; `question-key-editor.tsx:96-156`; `new.tsx:135-185,323-341`; `preview.tsx:19,86-95`; `student-preview-paper.tsx:21,57-71`; `assignment-preview-draft.ts:4-23`; `assignment-presets.test.ts:57,61,63,66-78,100-102,139-153`; e2e spec `:129-145,139,179,209`; migrations `packages/db/src/migrations` (precedent `0019` ADD COLUMN audio_name); `drizzle.config.ts:1-9` d1-http; `alchemy.run.ts:94-96`; id mới zero-collision; apps/student không tiêu thụ prompts.

## Dependencies

- Không có plan chặn trước;`packages/db` migration là ADD COLUMN tương thích ngược.
