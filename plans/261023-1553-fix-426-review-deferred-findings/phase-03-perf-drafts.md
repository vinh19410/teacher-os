---
phase: 3
title: "Perf — giảm work mỗi keystroke (memo per-slot + deferred)"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 3: Perf trang soạn đề

## Goal

Ở quy mô 4 part × 40 câu, một keystroke không còn kích hoạt zod-parse cho MỌI part + rebuild outline/answers/ready sync trong cùng frame vẽ. Thước đo (kongming gate #2): **số lần gọi `partInputFromValue` mỗi keystroke 4 → 1** và **work-per-keystroke = số lần gọi × chi phí 1 lần** (không đo thời gian từng hàm thuần — các hàm không đổi, chỉ đổi số lần gọi). Hành vi UI và dữ liệu KHÔNG đổi, có lưới an toàn unit test cho phần overlay.

## Files to Create / Modify

- Create: `apps/admin/src/components/library/effective-parts.ts` (helper thuần `effectivePartsFor`)
- Create: `apps/admin/src/components/library/effective-parts.test.ts`
- Modify: `apps/admin/src/routes/_auth/library/tests/$testId.tsx` (dùng helper + memo per-slot + `useDeferredValue`)
- Modify: `apps/admin/src/components/library/part-form.tsx` (memo baseline canonical)
- Create (tạm, xóa trước khi commit): `apps/admin/src/components/library/perf-bench.test.ts`

## Tasks & Steps

### Task 3.1 — Đo TRƯỚC (baseline) theo call-count + thời gian khối derived
- Goal: con số "work mỗi keystroke" hiện tại để so sánh — đếm LẦN GỌI, không chỉ ms.
- Target files: tạo `apps/admin/src/components/library/perf-bench.test.ts` (throwaway, viết SẠCH chuẩn biome ngay từ đầu — file nằm trong apps/admin nên bị `pnpm check` quét cho tới khi xóa — RT-5).
- Steps:
  1. Fixture 4 part × 40 câu (dùng `emptyPartValue`/`partValueFromDto` để tạo `PartFormValue`; 1 part đang dirty draft, 3 part đã lưu).
  2. Trong bench: bọc `partInputFromValue` bằng wrapper đếm lần gọi (proxy/wrap trước khi import vào logic cũ — sao chép khối derived hiện tại của `$testId.tsx:363-407` vào bench thành hàm `derivedBefore(drafts)` để đếm được), đo: (a) số lần gọi `partInputFromValue` / `partValueFromDto` mỗi lần tính derived; (b) wall-time trung bình 50 lần của khối derived (effectiveParts + `validateTestReady` + `buildTestOutline` + `buildAnswersOverview`).
  3. Chạy, chép số vào `plans/261023-1553-fix-426-review-deferred-findings/bench-results.md` (bảng before: calls + ms).
- Success criteria: có bảng before với (a) call counts, (b) ms/khối.
- Verify: `pnpm --filter @teacher-os/admin test -- perf-bench` chạy được và in số; `bench-results.md` tồn tại với bảng before.

### Task 3.2 — Tách helper thuần `effectivePartsFor` + unit tests (lưới an toàn)
- Goal: logic overlay ready tách khỏi component để test được — kongming gate #4 (hiện KHÔNG có test nào cho `$testId.tsx`).
- Target files: `apps/admin/src/components/library/effective-parts.ts` (mới), `effective-parts.test.ts` (mới).
- Steps:
  1. Chuyển khối `effectiveParts` hiện tại thành `export function effectivePartsFor(skill, slots, partsBySlot, drafts, opts?)` — nhận thêm `savedInputs?: ReadonlyMap<string, LibraryPartInput>` (precomputed) và tham số `parse` có default `partInputFromValue` (seam cho test đếm lần gọi); tham số thứ hai của opts là `savedBaseline` builder nếu cần. KHÔNG đổi logic nhánh.
  2. Unit test so hành vi: draft hợp lệ overlay lên bản đã lưu; draft HỎNG schema (built not ok) → lùi về bản đã lưu; slot trống (không saved, không draft) → bỏ qua; listening → `audioName` từ saved được giữ override.
  3. Test đếm: cho 4 slot (1 dirty + 3 saved, `savedInputs` cung cấp sẵn) → helper gọi `parse` (spy) ĐÚNG 1 lần.
- Success criteria: 4 case hành vi + 1 case đếm pass.
- Verify: `pnpm --filter @teacher-os/admin test -- effective-parts` exit 0.

### Task 3.3 — $testId dùng helper + memo per-slot
- Goal: keystroke ở part A không zod-parse lại 3 part còn lại.
- Target files: `apps/admin/src/routes/_auth/library/tests/$testId.tsx` (:363-392).
- Steps:
  1. Thêm `const savedInputsBySlot = useMemo(...)` deps `[skill, slots, partsBySlot]`: mỗi slot đã lưu → `partInputFromValue(slot, partValueFromDto(saved))` (kèm override `audioName` như logic hiện tại), cache Map.
  2. `effectiveParts = useMemo(() => effectivePartsFor(skill, slots, partsBySlot, deferredDrafts, { savedInputs: savedInputsBySlot }), [...])` — giữ nguyên thứ tự parts theo `slots`.
- Success criteria: per-keystroke chỉ 1 lần `partInputFromValue` (part đang sửa — ứng với test đếm của Task 3.2); hành vi không đổi (4 case unit + suite admin xanh).
- Verify: `pnpm --filter @teacher-os/admin test` exit 0 (suite admin toàn phần).

### Task 3.4 — useDeferredValue cho derived nặng
- Goal: outline + answers + ready-check không chặn frame gõ phím.
- Target files: `apps/admin/src/routes/_auth/library/tests/$testId.tsx` (:363-407).
- Steps:
  1. `const deferredDrafts = useDeferredValue(drafts);` (import từ react).
  2. `readyIssues`, `sections`, `answerRows` đổi dep `drafts` → `deferredDrafts` (effectiveParts đã dùng deferredDrafts qua Task 3.3). `dirtySlots` GIỮ `drafts` tươi (chấm "Có thay đổi chưa lưu" phải tức thời).
  3. Không đổi logic build bên trong các useMemo.
- Success criteria: tính đúng đắn giữ nguyên (chỉ trễ 1 frame — RT-4: `currentQStart` derive từ `sections` trễ 1 frame khi thêm/bớt câu là cosmetic, publish luôn re-validate server-side).
- Verify: `pnpm --filter @teacher-os/admin test` exit 0.

### Task 3.5 — Memo baseline canonical STRING trong PartForm
- Goal: bỏ 1 trong 2 lần `JSON.stringify` passage 20k mỗi render — kongming gate #3: `arePartValuesEqual` stringify CẢ HAI đối số, memo object baseline không đỡ được.
- Target files: `apps/admin/src/components/library/part-form.tsx` (caller dirty :462, `canonicalPartValue` :194-206).
- Steps:
  1. `const baseline = useMemo(() => (saved ? partValueFromDto(saved) : emptyPartValue(skill, slot)), [saved, skill, slot]);`
  2. `const baselineKey = useMemo(() => canonicalPartValue(baseline), [baseline]);`
  3. `const dirty = baselineKey === canonicalPartValue(value);` (thay `isPartDirty(...)` — export `isPartDirty` giữ nguyên cho callers khác/tests).
- Success criteria: mỗi render chỉ stringify `value` (baseline stringify 1 lần/baseline); suite part-form xanh.
- Verify: `pnpm --filter @teacher-os/admin test -- part-form` exit 0.

### Task 3.6 — Đo SAU + dọn throwaway
- Goal: ghi nhận cải thiện theo CÙNG thước đo Task 3.1, xóa file bench tạm.
- Steps:
  1. Chạy lại bench (call counts + wall-time khối derived dùng code mới) → append bảng after vào `bench-results.md` kèm ghi chú môi trường. Kỳ vọng: `partInputFromValue` 4 → 1 lần/keystroke; `partValueFromDto` 4 → 0 trong derived path.
  2. Xóa `apps/admin/src/components/library/perf-bench.test.ts` (throwaway — KHÔNG commit).
- Success criteria: `bench-results.md` có before/after cùng đơn vị; không còn file bench trong tree.
- Verify: `git status --short` không thấy `perf-bench.test.ts`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
