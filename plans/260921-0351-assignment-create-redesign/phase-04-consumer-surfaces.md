---
phase: 4
title: "Consumer surfaces: bank, class picker, preview"
status: completed
priority: P1
effort: "2h"
dependencies: ["3"]
---

# Phase 4: Consumer surfaces — bank page, class picker, bank preview

## Goal

Chuyển 3 surface đang tiêu thụ `task`/`genre` (legacy) sang `skill`/`part`/`type`: filter trang `/assignments/bank`, picker đề trong tab Bài tập của lớp, preview sticky ở bank — rồi xóa compat exports khỏi `assignment-presets.ts`. Kết phase: không còn code đọc `task`/`genre` ngoài legacy column trong DB; toàn test web xanh.

## Context Links

- Spec: [../research/design-spec.md](../research/design-spec.md) (§3 bank card — tham chiếu filter theo skill)
- Scout: [../reports/scout-report.md](../reports/scout-report.md) (mục 10 surfaces tiêu thụ)
- Code hiện tại: `apps/web/src/routes/_auth/assignments/bank.tsx:26-127` (taskFilter/genreFilter/TASK_PRESETS), `apps/web/src/components/classes/class-assignments-tab.tsx:32,59-81,134-143,341-343` (PICKER_TASK_OPTIONS + filter `p.task`), `apps/web/src/components/assignments/bank-preview-aside.tsx:11-30` (taskOf/genreOf), fixture `apps/web/src/routes/_auth/assignments/bank.test.tsx`

## Key Insights

- **Thứ tự xóa compat an toàn**: migrate từng consumer → grep `TASK_PRESETS|taskOf|genreOf` về 0 kết quả (trừ định nghĩa trong `assignment-presets.ts`) → xóa block compat + xóa field `task/genre` khỏi `AssignmentPrompt` UI type + mapper. Mỗi bước chạy `pnpm check-types` để type-check bắt chỗ sót.
- **Row backfill hiển thị đúng ngay**: đề Writing cũ có `skill='writing'`, `part` = task1/task2, `type` = chart…/discuss… — id trùng catalog mới nên `typeOf().label` cho label tiếng Việt giống hệt trước (filter + tag không đổi nhãn với dữ liệu cũ).
- **Filter bank 2 tầng mới**: chip Kỹ năng (Tất cả + 4) → chip Phần thi (theo skill đang chọn, "Tất cả" khi skill = all) → giữ ô search (match title + source + type label). Không thêm tầng type thứ 3 vào trang bank (thiết kế v5 không đổi trang bank; chỉ đổi维度 filter từ task/genre sang skill/part) — ghi recorded deviation nhẹ: filter part thay vì genre.
- **Class picker filter skill** thay "Task 2/Task 1": options "Tất cả/Writing/Reading/Listening/Speaking", filter `p.skill`; phần còn lại của luồng giao bài (#208) không đụng.
- **BankPreviewAside mở rộng theo §4** (đồng bộ StudentPreviewPaper phase 3): spec theo part, audio row (L), câu hỏi không đáp án (R/L), cue (S p2) — tái dùng cùng helper catalog; đây là preview của đề ĐÃ LƯU nên đọc từ `AssignmentPrompt` (passage/questions từ snapshot).

## Requirements

### Functional

- `bank.tsx`: thay `taskFilter` bằng `skillFilter: "all" | SkillId`; ChipFilter "Kỹ năng" options `["Tất cả","Writing","Reading","Listening","Speaking"]`; ChipFilter "Phần thi" options derive từ `SKILLS[skill].parts` (+ "Tất cả phần"), reset về all khi đổi skill; filter `p.skill`/`p.part`; search giữ (title + source + `typeOf(...).label`); hàng đề: Tag = type label, mono meta = `{partOf(...).label} · Band {band}`; "Xóa bộ lọc" reset cả 3 state.
- `class-assignments-tab.tsx`: `PICKER_TASK_OPTIONS` → skill options; `taskFilter` state → `skillFilter`; filter ready prompts theo `p.skill` (dòng 75-82); handler ChipFilter (dòng 134-143) đổi theo label skill; label chip hiện tại của lựa chọn đổi tương ứng. **Bổ sung finding R14 — các chỗ tiêu thụ task/genre còn lại của file**: preview panel chọn đề (dòng 320-322 `taskOf(selectedPrompt.task)`/`genreOf(...)`) chuyển sang `skillOf/partOf/typeOf(...).label` + tag skill; meta từng prompt card (dòng 363, 385 `{t.label} · Band {p.band}`) đổi thành `partOf(p.skill, p.part).label · Band {p.band}` + tag `skillOf(p.skill).name` — recorded deviation nhẹ: preview giao bài chỉ hiện title + spec + skill tag + câu hỏi (R/L, không đáp án), không dựng lại đầy đủ paper (thiết kế v5 không vẽ màn này; tái dùng helper catalog).
- `bank-preview-aside.tsx`: đọc `prompt.skill/part/type` qua catalog; spec line = `part.spec + " · Band {band}"`; R/L hiện intro + câu hỏi (số + stem, MCQ hiện opts, không đáp án) + tag "Chấm tự động"; L hiện audio row (`audioName` || "Chưa đính file nghe"); S p2 hiện cue preview; tags: Skill · Part label · Type label · Band · Nguồn; body theo skill (prompt/passage); giữ note "Đề này chưa giao lớp…" + link Lớp học.
- Dọn compat: xóa `TASK_PRESETS`/`taskOf`/`genreOf` khỏi `assignment-presets.ts`; xóa `task`/`genre` khỏi `AssignmentPrompt` (`mock-data.ts`) + mapper `assignment-prompts.ts` (snapshot vẫn trả — mapper bỏ, không break vì row type giữ legacy field, chỉ web không tiêu thụ; ghi comment mapper "legacy task/genre bỏ qua — đọc skill/part/type").
- Tests: `bank.test.tsx` update fixture (`skill/part/type`, bỏ `task/genre`) + assertion filter mới (chọn Reading chỉ còn đề reading; "Xóa bộ lọc" reset); thêm fixture 1 đề reading có `questions` để assert preview không hiện đáp án (assert chuỗi answer không xuất hiện trong markup). `class-assignments-tab.test.tsx` update fixture tương tự + assertion meta card theo part label/skill tag mới.

### Non-functional

- Không đổi route/URL; không đụng luồng giao bài (POST #208) ngoài chip filter.
- Giữ count "Đang hiện X / Y đề" + empty state filter hiện có.
- **Phase 3 + phase 4 phải land trong cùng một PR/release** (finding R13): nếu phase 3 deploy trước, đề R/L/S mới bị consumer cũ xếp nhầm "Task 2"/"Biểu đồ" (legacy-write `task='task2'`/`genre=''` + fallback `taskOf/genreOf`).

## Architecture (data flow)

```
snapshot → AssignmentPrompt (skill/part/type — phase 2, giờ không còn task/genre trên UI type)
bank.tsx / class-assignments-tab.tsx → filter theo p.skill (+ p.part ở bank)
bank-preview-aside.tsx → catalog helpers (partOf/typeOf) hiển thị 4 kỹ năng
```

## Related Code Files

- Modify: `apps/web/src/routes/_auth/assignments/bank.tsx`, `apps/web/src/components/classes/class-assignments-tab.tsx`, `apps/web/src/components/assignments/bank-preview-aside.tsx`, `apps/web/src/components/assignments/assignment-presets.ts` (xóa compat), `apps/web/src/lib/mock-data.ts` (xóa task/genre khỏi AssignmentPrompt), `apps/web/src/lib/repos/assignment-prompts.ts` (mapper bỏ legacy), `apps/web/src/routes/_auth/assignments/bank.test.tsx`
- Create: không
- Delete: không file (chỉ xóa export/field)

## Implementation Steps

1. `bank.tsx`: đổi state + 2 ChipFilter + filter/search/meta theo Requirements; chạy web test, fix `bank.test.tsx` fixture + assertion.
2. `class-assignments-tab.tsx`: đổi options/state/filter (dòng 32, 59-81, 134-143, 341-343) **+ preview panel (320-322) + meta card (363, 385)** theo Requirements; sửa `class-assignments-tab.test.tsx` fixture + assertion theo.
3. `bank-preview-aside.tsx`: mở rộng display 4 kỹ năng theo Requirements (tái dùng helper catalog).
4. Grep `TASK_PRESETS|taskOf|genreOf` trên `apps/web` — sau bước 1–3 chỉ còn trong `assignment-presets.ts` (định nghĩa compat) → xóa block compat + xóa `task/genre` khỏi `AssignmentPrompt` + mapper; `pnpm check-types` bắt mọi chỗ sót (kể fixture `new.test.tsx` nếu còn tham chiếu).
5. Chạy toàn `pnpm --filter web test` + `pnpm check-types` + `pnpm check`.

## Todo

- [ ] bank.tsx filter skill/part + search theo type label + meta hàng đề mới
- [ ] bank.test.tsx fixture + assertion filter/preview mới
- [ ] class-assignments-tab.tsx picker filter skill
- [ ] bank-preview-aside.tsx hiển thị 4 kỹ năng (audio/cue/questions không đáp án)
- [ ] Xóa compat exports + task/genre khỏi UI type & mapper; grep sạch
- [ ] web test + check-types + check xanh

## Success Criteria

- Filter Kỹ năng + Phần thi hoạt động trên bank; đề Writing cũ (backfill) hiện đúng label; "Xóa bộ lọc" reset sạch.
- Picker tab Bài tập của lớp filter theo skill; luồng giao bài #208 không đổi hành vi.
- Preview bank không hiện đáp án của đề reading (test assert).
- `grep -r "TASK_PRESETS\|taskOf\|genreOf" apps/web/src` chỉ còn 0 kết quả; `pnpm check-types` + `pnpm --filter web test` + `pnpm check` xanh.

## Verification

```bash
cd apps/web && npx vitest run
grep -rn "TASK_PRESETS\|taskOf\|genreOf" apps/web/src || echo "clean"
pnpm check-types && pnpm check
```

## Risk Assessment

- **R1: Surface sót đọc task/genre sau khi xóa field** — type-check + grep kép ở bước 4 bắt toàn bộ (compile error tức thì).
- **R2: bank.test fixture cũ crash** — fixture đổi cùng bước 1, assertion giữ phần còn đúng (count, empty state).
- **R3: Nhãn part filter gây hiểu nhầm trên đề Writing cũ** — part label writing = "Task 1 · 150 từ"/"Task 2 · 250 từ" (giữ nguyên nhãn catalog) → không đổi tên hiển thị với user cũ.

## Security Considerations

- Filter/search chỉ so chuỗi thường (toLowerCase includes) — không regex user input.
- Preview render text node (kế thừa phase 3) — stem/opts/passage khôngqua attribute.

## Next Steps

- Phase 5: E2E Reading/Listening mới + verification sweep toàn repo.
