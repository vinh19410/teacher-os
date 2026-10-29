---
title: "Dashboard giáo viên: sửa layout lịch bị chồng chữ sau redesign"
description: "Giờ học mono 40px tràn cột 80px đè lên tên lớp ở /dashboard; đưa cỡ chữ về đúng tỉ lệ design, gộp hàng lịch thành 1 component, bỏ dấu · thừa khi thiếu chủ đề."
status: completed
priority: P1
effort: 2h
issue: 373
branch: ai-handle-issue-373
tags: [bug, frontend, web, dashboard, ui]
blockedBy: []
blocks: []
created: 2026-10-20
---

# Dashboard giáo viên: sửa layout lịch bị chồng chữ

## Overview

Ở `/dashboard` (apps/web) khối **Lịch hôm nay** và **Lịch sắp tới** bị vỡ: giờ học `19:00` đè lên tên lớp (`Lớp Test 1`, `[TEST] Foundation 2`) và dòng meta (`90' · 1:1 ·`).

### Nguyên nhân (đã kiểm chứng)

- Mỗi hàng lịch là `grid grid-cols-[80px_1fr]` với giờ học `font-mono text-2xl` (`apps/web/src/routes/_auth/dashboard.tsx:101` và `:137`).
- Redesign #350 đặt token `--text-2xl: 40px` (`packages/ui/src/styles/globals.css:59`, `:280`). Trong khi đó bản design gốc (`teacheros-design@fcf60a5`, `src/pages/Teacher.tsx:25-26`) dùng `text-2xl` **mặc định của Tailwind** (1.5rem × 15px ≈ 22.5px).
- DM Mono ở 40px: 5 ký tự × ~0.6em ≈ 120px, lớn hơn cột cố định 80px. Chữ tràn sang cột tên lớp (cột 1fr bắt đầu ở 80px + 16px gap) nên chồng chữ.
- Tiêu đề section `Lịch hôm nay` / `Cần kiểm tra` cũng dùng `text-2xl` nên to gần bằng tiêu đề trang (40px so với 22.5px trong design). Thứ bậc chữ bị dẹt.
- Dòng meta ghép cứng `{dur}' · {type} · {topic}` nên khi `topic` rỗng thì còn dấu `·` treo ở cuối (`90' · 1:1 ·`).

Lỗi nằm ở chỗ dashboard dùng token, không phải ở token. Không đổi `--text-2xl` toàn cục vì có khoảng 20 file khác đang dùng token này với cỡ 40px có chủ đích (StatCard, tiêu đề số liệu…).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Giờ học không bao giờ tràn hay đè lên tên lớp, ở cả 3 viewport, kể cả tên lớp dài | P1 |
| 2 | Cỡ chữ theo đúng thứ bậc design: giờ học `text-lg` (21px, gần nhất 22.5px của design), tiêu đề section `text-xl` (28px) | P1 |
| 3 | Gộp 2 khối JSX hàng lịch bị lặp thành 1 component `ScheduleRow` | P2 |
| 4 | Dòng meta chỉ nối các phần có giá trị, không còn `·` thừa | P2 |

## Non-goals

- Không đổi token type scale trong `globals.css`. Không sửa các trang khác dùng `text-2xl`.
- Không thêm hàng StatCard, khối "Waiting for your pen" như design: đó là tính năng, không phải sửa lỗi.
- Không đổi dữ liệu và logic trong `dashboard-from-kernel.ts` (lọc lịch, học viên rủi ro).
- Không đổi nhãn ngày `T4`/`T6` (`lessonDayLabel`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Sửa layout hàng lịch + thứ bậc chữ](./phase-01-schedule-row-layout.md) | Pending |
| 2 | [Tests và verify 3 viewport](./phase-02-tests-verify.md) | Pending |

## Acceptance criteria

- [ ] Ở 1440×900, 768×1024, 375×812: giờ học và tên lớp không chồng nhau; tên lớp dài (vd `[TEST] Foundation 2 nâng cao buổi tối`) xuống dòng hoặc cắt gọn trong cột của nó
- [ ] Giờ học `font-mono text-lg tabular-nums whitespace-nowrap`; cột giờ co theo nội dung (`grid-cols-[auto_1fr]` với `min-w` đủ cho `00:00`), không dùng độ rộng px cố định mà chữ có thể vượt
- [ ] `Lịch hôm nay` và `Cần kiểm tra` dùng `text-xl`, nhỏ hơn rõ so với tiêu đề trang
- [ ] Lesson không có topic hiển thị `90' · 1:1`, không có `·` ở cuối
- [ ] Hàng lịch ở cả "Lịch hôm nay" và "Lịch sắp tới" render bằng cùng một `ScheduleRow`
- [ ] Dark và light theme đều đúng; `pnpm check`, `pnpm check-types`, `pnpm --filter web test` pass; PR kèm screenshot 3 viewport

## Risks

- `dashboard.test.tsx` assert theo `textContent` (vd `toContain("19:00")`, `getByText(/Bar chart/)`). Nếu đổi cấu trúc meta, dùng matcher lỏng để test không gãy do khoảng trắng.
- Font DM Mono load chậm (FOUT) có thể làm cột giờ đổi độ rộng một chút. `min-w` cố định theo `ch` giúp tránh nhảy layout.

## Red Team Review

### Session — 2026-10-20
**Findings:** 5 (0 accepted, 5 rejected) — reviewers ran inline (subagent model unavailable in env); lenses: Security Adversary/Fact Checker + Assumption Destroyer/Scope Auditor.
**Severity breakdown:** 0 Critical, 0 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Plan line-number claims (dashboard.tsx:101/:137, globals.css:59/:280, --text-xl 28px) | — | Reject: verified correct (dashboard.tsx:99/:135 rows, spans :101/:137; globals.css:58-59, :279-280) | — |
| 2 | `formatClassSessionMeta` output as injection surface | Medium | Reject: rendered via JSX text interpolation (React escapes); Lesson fields typed | — |
| 3 | Third copy of meta row pattern missed by helper extraction | Medium | Reject: `grid-cols-[80px` unique to dashboard.tsx:99,:135 | — |
| 4 | `min-w-[5ch]` FOUT width shift | Low | Reject: covered by plan Risks section; nowrap prevents wrap regardless | — |
| 5 | Existing tests assert textContent — restructure may break them | Medium | Reject as plan change: already covered by plan Risks + phase-02 step 2 (loose matchers) | — |

### Whole-Plan Consistency Sweep
- Token claims (`--text-2xl: 40px`, `--text-xl: 28px`) khớp `packages/ui/src/styles/globals.css:58-59,279-280`.
- 2 phase files nhất quán với plan.md goals/acceptance criteria; không có mâu thuẫn còn lại.
