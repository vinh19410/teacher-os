---
phase: 1
title: "Trang tạo một cột — gỡ cột phải, chips Trạng thái vào action bar"
status: todo
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Trang tạo bài tập một cột

## Context Links

- Plan: [plan.md](./plan.md) — Key Decisions 1, 2 (một cột; chips vào action bar).
- Evidence: [reports/scout-report.md](./reports/scout-report.md) — mọi file:line dưới đây đã verify 2026-09-21.
- Code hiện tại: `apps/web/src/routes/_auth/assignments/new.tsx` (grid 2 cột :194, BankContextCard :202-206, StudentPreviewPaper :207-216, action bar :220-256); `apps/web/src/components/assignments/bank-context-card.tsx` (chips :52-58).

## Overview

Đổi `/assignments/new` từ grid 2 cột sang một cột chỉ còn `PromptComposer`: xóa usage + import `BankContextCard` và `StudentPreviewPaper`, xóa file `bank-context-card.tsx`, bỏ `useData`. Block "Trạng thái" (chips `Bản nháp` / `Sẵn sàng giao` — giữ nguyên nhãn) dời vào sticky action bar. Cập nhật unit test + sửa các assert E2E đang dựa vào card "Ngân hàng" trên trang tạo, và append addendum override vào design-spec của plan redesign pending. Phase này shippable độc lập (chưa có nút "Xem trước").

## Key Decisions

1. **Một cột** — bỏ `grid lg:grid-cols-[1.45fr_0.9fr]` (new.tsx:194); form nhận `className="max-w-3xl"` để composer + sticky action bar cùng thẳng cột; chỉ còn `PromptComposer`.
2. **Xóa hẳn card Ngân hàng** — `bank-context-card.tsx` có đúng 1 consumer là new.tsx (new.tsx:7,202) → xóa file; `useData()` (new.tsx:55) không còn mục đích sử dụng nào khác → bỏ luôn import (new.tsx:14).
3. **Chips Trạng thái dời vào action bar, giữ đúng nhãn** — tái dùng nguyên markup block label + `ChipFilter` của card cũ (bank-context-card.tsx:50-59): label `Trạng thái`, options `["Bản nháp", "Sẵn sàng giao"]`, map label → `"draft"|"ready"`. Đặt giữa actionCopy (new.tsx:234-237) và cụm nút trong hàng `flex flex-wrap` (new.tsx:233) — mobile tự xuống hàng. 3 spec E2E click `getByRole("button", { name: "Bản nháp" })` trên trang này (assignment-prompt-create.spec.ts:50, assignment-bank.spec.ts:25, class-assign.spec.ts:64) nên **tuyệt đối không đổi copy**.
4. **StudentPreviewPaper rời trang tạo nhưng giữ file** — component này sẽ được phase 2 tái dùng cho `/assignments/preview`; chỉ gỡ khỏi new.tsx.
5. **Sửa E2E vỡ trong cùng phase** — xóa card làm 3 cụm assert trong `assignment-prompt-create.spec.ts` vỡ (:36-39 list "Đề đã có" sau "Tạo đề khác", :42-43 reload, :60-62 draft + TITLE). Chuyển các assert đó sang trang `/assignments/bank` (nơi trung thực để kiểm chứng đề đã lưu) — không đợi phase 3, tránh để spec đỏ giữa các phase.

## Related Code Files

| Action | File |
|--------|------|
| Modify | `apps/web/src/routes/_auth/assignments/new.tsx` |
| Modify | `apps/web/src/routes/_auth/assignments/new.test.tsx` |
| Modify | `apps/e2e/specs/assignment-prompt-create.spec.ts` |
| Modify | `plans/260921-0351-assignment-create-redesign/research/design-spec.md` (append addendum — đã apply khi lập plan, bước chỉ verify) |
| Delete | `apps/web/src/components/assignments/bank-context-card.tsx` |
| Create | không |

## Implementation Steps

1. **`new.tsx` — dọn cột phải**: xóa import `BankContextCard` (new.tsx:7), `StudentPreviewPaper` (new.tsx:10), `useData` (new.tsx:14) và `const { data } = useData()` (new.tsx:55). Thay grid 2 cột (new.tsx:194) bằng `max-w-3xl`: `<form onSubmit={handleSubmit} noValidate className="max-w-3xl">` bọc cả composer lẫn action bar; trong form chỉ còn `<PromptComposer … />` (giữ nguyên props new.tsx:195-200).
2. **`new.tsx` — chips vào action bar**: import `ChipFilter` từ `@/components/ui/chip-filter`; trong hàng `flex flex-wrap` của action bar (new.tsx:233), chèn giữa actionCopy và cụm nút một block: label `Trạng thái` (`<span className="font-medium text-muted-fg text-xs">`) + `<ChipFilter options={["Bản nháp", "Sẵn sàng giao"]} value={status === "draft" ? "Bản nháp" : "Sẵn sàng giao"} onChange={(label) => setStatus(label === "Bản nháp" ? "draft" : "ready")} />`. Giữ nguyên cụm nút "Hủy" + submit và toàn bộ logic submit/reset/actionCopy (new.tsx:94-131, 147-160, 238-254).
3. **Xóa file** `apps/web/src/components/assignments/bank-context-card.tsx`. Sau đó grep `BankContextCard` toàn `apps/` — kỳ vọng 0 kết quả.
4. **`new.test.tsx`**: bỏ 2 test bank ("lists existing prompts…" :88-94, "shows the empty-bank honest copy…" :96-101) và các fixture không còn dùng (`bank`, `dataFixture`, `vi.mock("@/lib/data-store")` :53-55). Trong test structure (:70-86): bỏ dòng assert `"Academic · 250 từ · 40 phút · Band 7.0"` (:77 — thuộc preview paper đã gỡ); giữ assert `"Sẵn sàng lưu vào ngân hàng"` + submit enabled; **thêm** assert: html chứa `Trạng thái`, `Bản nháp`, `Sẵn sàng giao`; html **không** chứa `Xem trước phía học viên`, `Đề đã có`, `Chưa giao lớp`. Test server error (:103-109) giữ nguyên.
5. **`assignment-prompt-create.spec.ts` — dời assert sang bank**: test 1 (:36-43): sau khi bấm "Tạo đề khác", thay các assert list trên trang tạo bằng `page.goto("/assignments/bank")` rồi assert TITLE (`getByText(TITLE).first()`) + `getByText("Sẵn sàng").first()` visible; bước reload (:42-43) đổi thành reload trang bank và assert TITLE vẫn visible. Test 2 (:60-62): sau "Đã lưu bản nháp" + "Tạo đề khác", `page.goto("/assignments/bank")` và assert `"QC-202 Bản nháp"` + tag `"Bản nháp"` visible. Không đụng dòng click chip (:50) và 2 spec kia.
6. **Addendum design-spec** (đã apply khi lập plan — chỉ verify): `tail -10 plans/260921-0351-assignment-create-redesign/research/design-spec.md` phải thấy section `## Addendum 2026-09-21 — layout override` ghi rõ: cột phải bị gỡ, chips status sang action bar, preview tách trang riêng `/assignments/preview`.
7. Chạy gate + tự kiểm tay: `pnpm dev`, mở `/assignments/new` — một cột, chips đổi label submit đúng ("Lưu bản nháp" khi chọn Bản nháp), action bar sticky còn hoạt động.

## Todo

- [ ] new.tsx: một cột max-w-3xl, gỡ 3 import + useData
- [ ] new.tsx: block Trạng thái + ChipFilter trong action bar
- [ ] Xóa `bank-context-card.tsx` + grep sạch tham chiếu
- [ ] new.test.tsx: bỏ 2 test bank + fixture, sửa structure test, thêm assert chips
- [ ] assignment-prompt-create.spec.ts: dời 3 cụp assert sang /assignments/bank
- [ ] Verify addendum design-spec của plan `260921-0351`
- [ ] Gate xanh (xem Verification)

## Success Criteria

- [ ] `/assignments/new` render một cột; DOM không còn "Ngân hàng"/"Chưa giao lớp"/"Đề đã có"/"Xem trước phía học viên"; file bank-context-card.tsx đã xóa
- [ ] Action bar chứa label `Trạng thái` + chips `Bản nháp`/`Sẵn sàng giao`; đổi chip đổi label submit ("Lưu bản nháp"/"Lưu vào ngân hàng")
- [ ] `pnpm --filter web test` xanh với new.test.tsx đã cập nhật; `pnpm check-types` không còn import lơ lửng
- [ ] E2E `assignment-prompt-create` xanh với assert dời sang bank; `assignment-bank` + `class-assign` xanh không cần sửa

## Risk Assessment

- **R1 (Medium): import/type tham chiếu mồ côi sau khi xóa file** — `pnpm check-types` + biome bắt được; mitigation bước 3 grep.
- **R2 (Medium): E2E đỏ giữa chừng nếu dời việc sửa spec sang phase 3** — đã đưa việc sửa vào phase này (Key Decision 5), chạy spec trong Verification.
- **R3 (Low): chips chen action bar làm chật mobile** — hàng đã là `flex flex-wrap` (new.tsx:233), block tự xuống hàng; kiểm tay ở viewport hẹp.
- **R4 (Low)**: `pnpm check` là `biome check --write` (package.json:19) — tự format file vừa sửa; chạy gate lại sau format.

## Security Considerations

- Không thêm mutation hay input mới. Bỏ `useData` khỏi trang tạo giảm surface hiển thị snapshot ngân hàng — chỉ tốt hơn. Không đổi gì server/CSRF.

## Verification Commands

```bash
cd apps/web && npx vitest run new
cd apps/e2e && npx playwright test assignment-prompt-create
pnpm check && pnpm check-types && pnpm test
```

## Next Steps

- Phase 2 tái dùng `StudentPreviewPaper` cho trang `/assignments/preview` và thêm nút "Xem trước" vào action bar (cụm nút sẽ thành: Xem trước | Hủy | Lưu).
