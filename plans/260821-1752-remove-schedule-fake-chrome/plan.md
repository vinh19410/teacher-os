---
title: "Gỡ GCal badge hardcode / chrome giả trên schedule (issue #58)"
description: "Gỡ hoàn toàn các phần tử UI nói dối trên luồng classes/schedule: Badge 'GCal · Đã bật' hardcode, chip nav tuần no-op, highlight 'hôm nay' giả (todayIdx), lead 'Tuần 19–25/08 · 11 buổi học' hardcode, ngày giả (dayDates + '/08') trên schedule grid, lesson modal và class detail. Không thay bằng stub/no-op nào khác — Zalo/GCal là non-goal roadmap (issue #56 riêng sẽ wire data thật + nav tuần thật)."
status: pending
priority: P1
effort: 2h
branch: feat/58-remove-schedule-fake-chrome
issue: 58
tags: [frontend, cleanup, m1]
created: 2026-08-21
---

# Gỡ GCal badge hardcode / chrome giả trên schedule (issue #58)

## Overview

Issue #58 (M1): schedule hiện hiển thị nhiều phần tử UI **không gắn data thật** —
vi phạm tinh thần DOD M1 "0 CTA no-op trong luồng classes/schedule". Plan này chỉ
**gỡ sạch** các phần tử giả; KHÔNG thêm stub/no-op thay thế, KHÔNG wire data thật
(scope issue #56). Xuất phát từ `apps/web/src/routes/_auth/schedule.tsx` nhưng
cùng pattern ngày giả (`dayDates` + "/08") xuất hiện ở lesson modal và class
detail — cùng luồng classes/schedule nên dọn cùng lúc cho nhất quán.

## Bối cảnh evidence (đã xác minh trên develop @ bdf71b0)

- `apps/web/src/routes/_auth/schedule.tsx:48-50` — `<Badge variant="success" dot>GCal · Đã bật</Badge>`: không có integration GCal nào tồn tại → badge nói dối.
- `apps/web/src/routes/_auth/schedule.tsx:33-46` — chip "← Trước / Tuần này / Sau →": `<span>` trang trí, không handler → CTA no-op (nav tuần thật là #56).
- `apps/web/src/routes/_auth/schedule.tsx:27,61-63,70-78` — `todayIdx = 1` hardcode + class `today` + số ngày từ `dayDates` mock (`[18..24]`) → "hôm nay" và ngày tháng giả.
- `apps/web/src/routes/_auth/schedule.tsx:31` — `lead="Tuần 19–25/08 · 11 buổi học"` hardcode (`PageHead.lead` là optional — bỏ an toàn).
- `apps/web/src/components/schedule/lesson-modal.tsx:38` — `T{lesson.day + 1} {dayDates[lesson.day - 1]}/08`: ngày giả; thêm nữa `day=7` render "T8" trong khi `dayNames[6]="CN"` → sai cả nhãn thứ.
- `apps/web/src/routes/_auth/classes/$classId.tsx:193` — cùng chuỗi ngày giả `T{l.day + 1} {dayDates[l.day - 1]}/08` trong luồng classes.
- `apps/web/src/lib/mock-data.ts:157` — `export const dayDates = [18,19,20,21,22,23,24]`: sau khi gỡ 3 usage trên sẽ hết người dùng → xóa export.
- Test audit (red-team verified): không có test nào assert sự tồn tại của các phần tử sẽ gỡ. Có đúng 1 match "Tuần này" trong test — `kernel-runtime.contract.test.ts:171`, là **negative assertion bảo vệ dashboard** (giữ nguyên). QUAN TRỌNG: `kernel-runtime.contract.test.ts:195-208` dùng `readSrc()` đọc trực tiếp source `$classId.tsx` + `lesson-modal.tsx`, assert pattern `useDirectKernelAction()`/`disabled={busy || isPending(lesson.id)}` — plan không đụng vùng này nhưng PHẢI giữ các assertion đó xanh. Chuỗi "Tuần này" còn xuất hiện hợp lệ ở `settings.tsx:29` (template Zalo thật, non-goal) → mọi grep gate PHẢI scope theo file cụ thể, không grep toàn `apps/web/src`.
- Repo không có component/DOM test infra (vitest `environment: node`, chưa có E2E — #59); convention là test logic trong `src/lib/*.test.ts` (vd `format-schedule.test.ts`, `dashboard-from-kernel.test.ts`). Repo đã có pattern **source-contract test** khóa "0 hardcode" cho dashboard (`kernel-runtime.contract.test.ts:160-180`, readSrc + `.not.toMatch(/19–25\/08/)` v.v.) — plan này thêm contract test tương tự cho schedule (xem phase 1) để DOD M1 có enforcement sống sót sau merge.

## Quyết định scope

- **Trong scope:** 3 bề mặt cùng pattern ngày giả (schedule, lesson-modal, class-detail) + xóa `dayDates`. Lý do gồm `$classId.tsx`: DOD M1 nói "luồng classes/schedule" và đây là đúng 1 dòng cùng chuỗi giả — để lại nghĩa là UI vẫn nói dối sau khi PR merge.
- **Ngoài scope (đừng làm):**
  - Wire lesson thật / tuần thật / nav tuần hoạt động → issue #56.
  - Bất kỳ stub/no-op thay thế GCal/Zalo (non-goal roadmap).
  - Thêm jsdom/testing-library hay E2E infra → issue #59.
  - Legend loại buổi dưới grid schedule: giữ nguyên — ánh xạ thật tới `typeBlockClass`/lesson types có thật.
  - `dayNames` giữ nguyên (cấu trúc thứ trong tuần generic, còn được `add-class-modal`, `format-schedule` dùng).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Schedule không còn badge GCal, chip nav no-op, "hôm nay" giả, ngày hardcode, lead hardcode | P1 |
| 2 | Lesson modal + class detail hiển thị thứ/ngày giờ trung thực (dayName thật, không "/08" giả, không "T8" sai) | P1 |
| 3 | `dayDates` bị xóa khỏi codebase (0 usage); mọi gate xanh | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| [1](./phase-01-remove-fake-elements.md) | Gỡ phần tử giả + TDD helper label | Pending |
| [2](./phase-02-verification-gates.md) | Verification gates + evidence | Pending |

## Success Criteria

- [ ] `/schedule` không render "GCal · Đã bật" (badge xóa hẳn, không thay bằng gì).
- [ ] `/schedule` không còn chip "← Trước / Tuần này / Sau →".
- [ ] `/schedule` không còn highlight cột "hôm nay" giả và số ngày hardcode `dayDates`.
- [ ] `PageHead` của schedule chỉ còn title "Lịch dạy" (bỏ lead hardcode).
- [ ] Lesson modal hiển thị `{dayName} · {time} ({dur} phút)`; class detail cột "Ngày" hiển thị `{dayName}` (cột "Giờ" đã có riêng) — không "/08", không "T8"; `day=7` → "CN".
- [ ] `grep -rn "dayDates\|todayIdx\|GCal\|19–25\|11 buổi học\|← Trước\|Sau →" apps/web/src/routes/_auth/schedule.tsx apps/web/src/components/schedule/lesson-modal.tsx "apps/web/src/routes/_auth/classes/\$classId.tsx" apps/web/src/lib/mock-data.ts` trả về 0 kết quả.
- [ ] Contract test mới trong `kernel-runtime.contract.test.ts` (schedule không còn fake chrome) pass cùng toàn bộ test hiện hữu — không weaken test nào.
- [ ] Không thêm component/CTA/stub mới thay thế phần tử bị gỡ.
- [ ] Gates xanh (mirror CI): `pnpm test`, `pnpm check-types`, `pnpm exec biome check .` (read-only, không `--write`), build web.

## Risk Assessment

- **Layout trống sau khi gỡ row chips+badge** — row `mb-4 flex justify-between` chỉ chứa 2 phần tử bị gỡ → xóa cả row; grid tuần ngay sau PageHead, không vỡ layout (verified class structure).
- **Import thừa KHÔNG bị biome/tsc bắt** (red-team verified: `noUnusedImports` không bật, tsconfig không có `noUnusedLocals`; `schedule.tsx:5-6` đang có dead import `Button`/`Card` vẫn pass mọi gate) → phase 1 có checklist xóa import thủ công: `Badge` (sau khi gỡ JSX), dọn luôn dead `Button`/`Card` có sẵn (verify 0 usage trước khi xóa). Chỉ import `dayDates` là bị tsc bắt thật (export bị xóa → TS2305).
- **$classId.tsx ngoài chữ "trên schedule" của issue title** — đã justify bằng DOD M1 "luồng classes/schedule" + same-pattern 1 dòng; nếu red-team phản đối thì tách phần đó ra (xem phase 1 fallback).
- **#56 build trên nền này** — việc gỡ today/nav/lead không phá contract nào #56 cần (data flow `useData` giữ nguyên); chỉ làm sạch JSX. **Merge-conflict cấu trúc (kongming counsel):** #56 sẽ thêm code vào đúng các vị trí plan này xóa → conflict gần như chắc chắn ở `schedule.tsx`/`lesson-modal.tsx`/`$classId.tsx`. Hiện chưa có branch #56 (verified `git branch -a`) → #56 NÊN rebase trên develop sau khi PR này merge; nếu #56 chạy song song thì simulate merge local trước khi ship #56.

## Red Team Review

### Session — 2026-08-21
**Findings:** 8 (sau dedup từ 2 reviewer: Security Adversary + Assumption Destroyer, Light tier — Fact Checker) — **8 accepted, 0 rejected**
**Severity breakdown:** 1 Critical, 3 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Grep gate `Tuần này` không thể đạt 0 toàn `apps/web/src` (match hợp lệ ở contract test + settings template); claim evidence "không có test nào tham chiếu" sai | Critical | Accept | plan.md evidence + SC, phase-01/02 grep scope theo 4 file |
| 2 | Thiếu regression guard sống sót sau merge — repo có convention source-contract test cho dashboard; plan phải thêm contract test tương tự cho schedule | High | Accept | phase-01 thêm bước TDD contract test trong `kernel-runtime.contract.test.ts` |
| 3 | Bẫy 1-based (`lesson.day`) vs 0-based (`schedule.days`) cùng file `format-schedule.ts` — phải có JSDoc phân biệt (mirror `kernel.ts:79-84`) | High | Accept | phase-01 Requirements + bước 2 bắt buộc JSDoc |
| 4 | Premise "biome/tsc bắt import thừa" sai (không noUnusedImports/noUnusedLocals; Button/Card đang dead vẫn pass) | Medium | Accept | plan.md Risk Assessment + phase-01 checklist import thủ công |
| 5 | Grep không cover lead "19–25/08", "11 buổi học", chip "← Trước"/"Sau →" | Medium | Accept | SC + phase-02 mở rộng pattern, scope theo file |
| 6 | Mô tả CI thiếu (CI còn `biome check .`, `check-types`, `build`); local `pnpm check` là `--write`, CI là read-only → verify bằng `pnpm exec biome check .` | Medium | Accept | phase-02 Architecture + bước verify |
| 7 | plan.md SC mâu thuẫn phase-01 về output class detail (cột "Giờ" đã có riêng) | Medium | Accept | plan.md SC tách 2 mệnh đề modal / class detail |
| 8 | Fallback "bỏ bước 5" đứt logic (không thể xóa export `dayDates` khi `$classId.tsx` còn dùng) | Medium | Accept | phase-01 Risk Assessment sửa fallback |

**Fact-check note:** reviewer đã xác minh `lesson.day` là 1-based trong data thật (`kernel.ts:96` sinh `day = days[...]+1`, contract `min(1).max(7)` tại `contracts.ts:167`) → thiết kế helper `dayNames[day-1]` đúng; và legend schedule ánh xạ thật 5 `LessonType` (`repos/lessons.ts:17-32` coerceType).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-remove-fake-elements.md, phase-02-verification-gates.md
- Decision deltas checked: 8 (scan tất cả file plan sau khi apply)
- Reconciled stale references: 3 (bỏ grep toàn-cũ khỏi SC/phase-02; bỏ claim biome-bắt-import khỏi plan.md+phase-01; sửa fallback phase-01)
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-08-21 (chạy trong pipeline ak:vibe tự hành, issue #58)
- **Verification Results** (per validate-workflow Step 2.5 guard — covered bởi Red Team Review session cùng ngày, Light tier, 2 Fact Checker reviewers): Claims checked: 15 — Verified: 13, Failed: 2 (cả 2 failure là claim sai của plan, đã sửa trong red-team session: grep "Tuần này" + premise biome-bắt-import). [UNVERIFIED] tags: 0.
- **CLI format validate:** `ak plan validate` → valid:true (chạy trước và sau red-team edits).
- **Decision points (tự quyết theo ràng buộc issue, không cần interview vì đề nguồn đã chốt):**
  1. Gồm `$classId.tsx` trong scope? → **Có** — DOD M1 nói "luồng classes/schedule", cùng chuỗi giả 1 dòng; fallback đã ghi ở phase-01 Risk.
  2. Lead PageHead: gỡ hẳn hay compute "N buổi học" từ data? → **Gỡ hẳn** — issue cấm "thay bằng stub/no-op khác"; tuần "19–25/08" vẫn giả dù compute count; #56 sẽ thêm label thật cùng nav thật.
  3. Thêm contract test schedule-chrome? → **Có** — đúng convention dashboard của repo, enforcement sống cho DOD M1 sau merge.
- **Phases propagated:** cả 2 phase file đồng bộ với quyết định trên (marker ngầm qua red-team apply; không còn mâu thuẫn).
- **Whole-Plan Consistency Sweep (sau validation):** reread 3 file; 0 unresolved contradictions.
