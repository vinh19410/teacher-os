---
title: "Trang tạo bài tập một cột + trang xem trước làm bài của học viên"
description: "Gỡ cột phải (card Ngân hàng + preview inline) khỏi /assignments/new, dời chips Trạng thái vào action bar, và tách 'Xem trước' thành trang riêng /assignments/preview mô phỏng đề đúng như học viên đọc — kèm vùng làm bài mô phỏng và khôi phục nháp khi quay lại."
status: pending
priority: P2
effort: 4h
issue: 213
branch: vinh19410/feat/assignment-create-single-column-preview
tags: [feature, frontend]
created: 2026-09-21
---

# Trang tạo bài tập một cột + trang xem trước làm bài của học viên

## Overview

Trang `/assignments/new` đang là grid 2 cột (`new.tsx:194`): trái là composer, phải là card "Ngân hàng" (`BankContextCard`) + paper "Xem trước phía học viên" (`StudentPreviewPaper`). Teacher **không giao bài tại màn này** (giao ở trang Lớp học) nên cột phải chỉ gây nhiễu. Yêu cầu: (1) gỡ hẳn cột phải, còn một cột composer; (2) chips Trạng thái dời vào sticky action bar; (3) "Xem trước" trở thành nút redirect sang trang riêng `/assignments/preview` render đề đúng như học viên đọc khi làm — kèm vùng làm bài mô phỏng (không lưu) và khôi phục form khi teacher quay lại soạn. Không đụng server/API/DB.

## Key Decisions

1. **Một cột** — bỏ grid 2 cột, container `max-w-3xl` chỉ còn `PromptComposer`; xóa usage + import `BankContextCard`/`StudentPreviewPaper`; **xóa file** `bank-context-card.tsx` (chỉ có 1 consumer — `new.tsx:7,202`); bỏ `useData` (chỉ feeds card đó — `new.tsx:55`).
2. **Chips Trạng thái dời vào action bar** — giữ nguyên label `Trạng thái` + `ChipFilter ["Bản nháp", "Sẵn sàng giao"]` (nhãn giữ đúng từng chữ — 3 spec E2E click chip này), đặt giữa actionCopy và cụm nút. Submit label theo status như cũ.
3. **Nút "Xem trước"** (secondary, type button) cạnh "Hủy": ghi snapshot draft vào `sessionStorage` rồi `navigate({ to: "/assignments/preview" })` (dùng `_navigate` đã có — `new.tsx:54`). Luôn enabled (preview có fallback text).
4. **Snapshot contract** — module thuần `apps/web/src/lib/assignment-preview-draft.ts`, key `teacher-os:assignment-preview-draft`, JSON 8 string field `{task, genre, title, band, source, prompt, note, status}`; API `savePreviewDraft` / `readPreviewDraft` (không xóa) / `takePreviewDraft` (đọc + xóa). Guard `typeof window === "undefined"` + try/catch + type-check từng field, fail → null. Có unit test riêng.
5. **Restore một lần** — mount `/assignments/new` gọi `takePreviewDraft()` trong useState initializer (app không dùng StrictMode — `main.tsx:31-40` — nên initializer chạy 1 lần); "Hủy"/"Tạo đề khác" vẫn reset về defaults.
6. **Route preview flat** — `apps/web/src/routes/_auth/assignments/preview.tsx` (không nested dưới `new` để tránh thêm Outlet vào new.tsx); tái dùng nguyên `StudentPreviewPaper` + vùng làm bài mô phỏng (Textarea + word count + dòng "Bản xem trước — bài làm không được lưu."); empty state trung thực khi không có snapshot.
7. **Non-goals** — không đổi trang bank/`bank-preview-aside.tsx`, không đổi contracts/API/DB, không preview đề đã lưu (`?id=` là future), không implement redesign 4-skill của plan `260921-0351`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `/assignments/new` một cột, không còn card "Ngân hàng" + preview inline; file `bank-context-card.tsx` bị xóa; chips Trạng thái hoạt động trong action bar; các test unit + E2E liên quan cập nhật theo | P1 |
| 2 | Nút "Xem trước" đưa teacher sang `/assignments/preview`: paper đề + vùng làm bài mô phỏng (không lưu), empty state trung thực; quay lại soạn không mất form (restore một lần qua sessionStorage); route đăng ký routeTitles + VALID_EXACT_ROUTES | P1 |
| 3 | E2E phủ trọn flow preview (soạn → xem trước → quay lại còn form → lưu ready → reload), 3 spec phụ thuộc chip "Bản nháp" vẫn xanh; full gate xanh | P1 |

## Cross-Plan Dependencies

| Plan | Quan hệ | Xử lý |
|------|---------|-------|
| `plans/260921-0351-assignment-create-redesign` (pending, chưa implement) | **Override layout**: design-spec §1 (grid 2 cột, dòng 7), §3 (card "Ngân hàng", dòng 76), §4 (preview inline, dòng 84) mâu thuẫn quyết định 1-3 của plan này | Phase 1 append addendum cuối `research/design-spec.md` ghi rõ override; khi triển khai redesign phải giữ một cột + chips trong action bar + preview trang riêng |
| `plans/260918-0921-assignment-bank-and-class-assign` (đã hoàn thành) | E2E `assignment-bank.spec.ts:25`, `class-assign.spec.ts:64` click chip "Bản nháp" trên trang tạo | Giữ nguyên nhãn chip "Bản nháp"/"Sẵn sàng giao" ở vị trí mới — không đổi copy |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Trang tạo một cột — gỡ cột phải, chips vào action bar](./phase-01-single-column-create-page.md) | Pending |
| 2 | [Trang xem trước /assignments/preview + snapshot draft](./phase-02-student-preview-page.md) | Pending |
| 3 | [E2E preview flow & verification sweep](./phase-03-e2e-and-verification.md) | Pending |

## Success Criteria

- [ ] `/assignments/new` render một cột (`max-w-3xl`): không có "Ngân hàng", không có "Xem trước phía học viên", không còn "Đề đã có"; file `apps/web/src/components/assignments/bank-context-card.tsx` đã xóa khỏi repo và không còn import lơ lửng
- [ ] Action bar có block `Trạng thái` với chips `Bản nháp` / `Sẵn sàng giao` đúng nhãn cũ; chọn "Bản nháp" đổi label submit thành "Lưu bản nháp"; E2E `assignment-bank.spec.ts` + `class-assign.spec.ts` xanh mà không phải sửa 2 spec đó
- [ ] Nút "Xem trước" điều hướng tới `/assignments/preview`; trang render paper đề (title, spec `Academic · … phút · Band …`, prompt, tags) + card "Bài làm của học viên (mô phỏng)" với Textarea + word count + dòng "Bản xem trước — bài làm không được lưu."; reload trang preview vẫn hiện (read không xóa)
- [ ] Không có snapshot → empty state "Chưa có bản nháp nào để xem trước." + nút "Mở trang tạo bài tập"; JSON rác → cũng empty state (parse guard)
- [ ] Soạn dở → "Xem trước" → "Quay lại soạn đề": các field Tiêu đề/Nội dung đề… còn nguyên giá trị; "Hủy"/"Tạo đề khác" vẫn reset về defaults
- [ ] `routeTitles` có "Xem trước bài tập"; `VALID_EXACT_ROUTES` có `/assignments/preview` + test case mới xanh
- [ ] Unit: `assignment-preview-draft.test.ts` + `new.test.tsx` (đã bỏ assert bank/preview cũ, thêm assert chips + Xem trước) + `preview.test.tsx` xanh
- [ ] Full gate `pnpm check && pnpm check-types && pnpm test` xanh; E2E `assignment-prompt-create`, `assignment-bank`, `class-assign` xanh

## Verification Commands

```bash
pnpm --filter web test
cd apps/e2e && npx playwright test assignment-prompt-create assignment-bank class-assign
pnpm check && pnpm check-types && pnpm test
```

## Research & Reports

- [reports/scout-report.md](./reports/scout-report.md) — evidence codebase (file:line) nền tảng cho plan.

## Validation Log

### Verification Results (2026-09-21, tier Standard — Fact Checker + Contract Verifier)

- Claims checked: 14 (phân bố đều 3 phase: grid/import/useData new.tsx; chips + 3 spec E2E click "Bản nháp"; main.tsx không StrictMode; precedent Button+navigate bank.tsx:159-181; storage-guard sidebar-prefs.ts:1-22; routes-matcher.test.ts exact-routes list; title StudentPreviewPaper là `<p>` (student-preview-paper.tsx:37-39); các assert E2E vỡ khi xóa card — assignment-prompt-create.spec.ts:36-39,42-43,60-62; addendum design-spec đã apply)
- Verified: 14 | Failed: 0 | Unverified: 0
- Tier: Standard
- Failures: không có
- Ghi chú vận hành đã duyệt trong review: (1) sửa E2E vỡ đặt vào Phase 1 thay vì Phase 3 để mỗi phase shippable; (2) "Quay lại soạn đề" dùng Button+navigate theo precedent repo; (3) restore snapshot phải set dirtyTitle/dirtyPrompt=true (chống compositionDefaults ghi đè — new.tsx:80-89); (4) test stub phải bọc `window` chứa sessionStorage vì module guard `typeof window`.

### Whole-Plan Consistency Sweep (2026-09-21)

- Phases table plan.md khớp 3 file phase thực tế; Key Decisions plan.md ↔ phase files nhất quán (KD plan 1-2 ↔ phase 1, KD 3-6 ↔ phase 2); non-goals lặp lại nhất quán ở plan.md KD7, phase 2 KD7 ngầm (route preview không dùng useData), phase 3 Next Steps.
- Không phát hiện mâu thuẫn chưa xử lý. Sweep sạch — plan đủ điều kiện triển khai.

<!-- slug: assignment-create-single-column-preview -->
