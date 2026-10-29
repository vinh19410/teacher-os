---
title: "Phase 1: segmentsToItems answer-key merge (TDD)"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: segmentsToItems answer-key merge (TDD)

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

## Goal

`segmentsToItems(segments, existing?)` merge metadata (`explanation`/`answerSet`/`pin`/`type`) theo **khoá nội dung `answer.trim()`** (nearest-index-unused khi trùng answer, cộng **pass 2 fallback theo vị trí khi cấu trúc không đổi**) — blank dịch chuyển không bám metadata sai; sửa lỗi chính tả answer không mất explanation.

## Files to Create / Modify

- Modify: `packages/ui/src/lib/cloze.ts` — hàm `segmentsToItems` (dòng ~226-240, ký hiệu `existing?: readonly AssignmentQuestion[]`).
- Modify: `packages/ui/src/lib/cloze.test.ts` — thêm `describe("segmentsToItems answer-key merge (#425)")` + import `buildClozeSegments`, `parseClozeRaw`, `tableSegments`, type `ClozeBlankEntry` (file này CHƯA có các import/helper đó — red-team RT3#4).
- Modify: `apps/web/src/lib/cloze.test.ts` — mirror 2 test case vào `describe("segmentsToItems ...")` hiện có (dòng ~281; file này đã sẵn helper).

## Hiện trạng (đã xác minh)

```ts
// packages/ui/src/lib/cloze.ts:226-240 (feat/424 tip 0ed7cfea)
export function segmentsToItems(
	segments: ClozeSegment[],
	existing?: readonly AssignmentQuestion[],
): AssignmentQuestion[] {
	return segments.map((segment, index) => {
		const base = existing?.[index];
		const applied = {
			stem: segment.stem,
			opts: null,
			answer: segment.answer.trim(),
			alts: segment.alts,
		};
		return base ? { ...base, ...applied } : applied;
	});
}
```

Call sites giữ nguyên, không đổi: `cloze-editor.tsx:189`, `table-grid-editor.tsx:70` (đều truyền `items` hiện tại; editor luôn rebuild segments qua `buildClozeSegments` trước khi apply — `cloze-editor.tsx:132`; raw mode qua `parseClozeRaw`).

**Vì sao KHÔNG dùng stem làm khoá** (red-team Critical, 3/3 reviewer + kongming rút counsel): stem = `gap + CLOZE_MARKER + trailing` với `gap = text.slice(previous.blank.end, token.start)` (`cloze.ts:209,215`). Xóa blank liền kề làm gap của segment sau hấp thụ từ vừa xóa → stem đổi → khoá stem-based miss → metadata bị drop đúng ở kịch bản chính của issue.

## Tests Before (viết TRƯỚC, phải ĐỎ đúng loại)

Thêm vào đầu file test (NẾU chưa có): import `{ buildClozeSegments, parseClozeRaw, tableSegments, ... type ClozeBlankEntry }` từ `./cloze` và helper:

```ts
const TEXT5 = "one two three four five";
function blanks5(): ClozeBlankEntry[] {
	return ["one", "two", "three", "four", "five"].map((answer, tokenIndex) => ({
		tokenIndex,
		answer,
		alts: "",
	}));
}
// items gốc: explanation trên q2/q3/q4 (index 1..3), answerSet "s" trên q4/q5 (index 3,4) — kịch bản issue #425.
function items5() {
	return segmentsToItems(buildClozeSegments(TEXT5, blanks5())).map((item, i) => ({
		...item,
		...(i >= 1 && i <= 3 ? { explanation: `giải thích q${i + 1}` } : {}),
		...(i >= 3 ? { answerSet: "s" } : {}),
	}));
}
```

Các test bắt buộc (luôn rebuild segments qua `buildClozeSegments`/`parseClozeRaw`/`tableSegments` như luồng thật — KHÔNG splice mảng segments):

1. **xóa blank giữa — metadata theo nội dung**: `blanks5().filter(b => b.answer !== "two")` → `merged[1]` có `answer "three"` + `explanation "giải thích q3"`, không `answerSet`; `merged[2]` ("four") giữ `explanation "giải thích q4"` + `answerSet "s"`; `merged[3]` ("five") giữ `answerSet "s"`; không item nào còn `explanation "giải thích q2"`.
2. **apply lại không đổi — giữ nguyên metadata**: `segmentsToItems(buildClozeSegments(TEXT5, blanks5()), items5())` deep-equal `items5()`.
3. **chèn blank trước — blank mới sạch, metadata theo nội dung**: chèn blank "zero" token 0 → `merged[0]` ("zero") KHÔNG có explanation/answerSet; `merged[2]` ("two") giữ `explanation "giải thích q2"`; các câu sau dịch đúng.
4. **trùng answer, không đổi cấu trúc — giữ metadata của từng câu**: 3 blank ["the","cat","the"] với explanation "the-1"/"cat"/"the-2" → apply lại không đổi → cả 3 giữ đúng metadata của mình.
5. **trùng answer, xóa 1 phần tử của nhóm**: blank ["the","the","cat"] xóa blank "the" đầu → metadata của twin còn lại KHÔNG đảm bảo đúng twin (mơ hồ cố hữu — answer giống nhau); assert chỉ những gì thuật toán đảm bảo: `merged[1]` ("cat") giữ `explanation "cat"`; `merged[0]` ("the") nhận explanation nằm TRONG {"the-1","the-2"} (không nhận "cat", không rơi ngoài nhóm).
6. **đổi answer một blank, cấu trúc không đổi — GIỮ metadata** (fallback vị trí — kongming plan-gate; sửa lỗi chính tả không được mất explanation): đổi answer blank q3 ("three"→"banana") → `merged[2]` ("banana") vẫn giữ `explanation "giải thích q3"`; các câu khác giữ nguyên.
7. **đổi answer + xóa blank cùng lúc — metadata blank đổi answer rơi**: đổi "three"→"banana" VÀ xóa blank "two" → độ dài đổi → không fallback vị trí → "banana" KHÔNG có explanation; "three" đã biến mất; "four"/"five" giữ metadata.
8. **xóa + chèn cùng lúc, số lượng không đổi — blank mới sạch** (fixture: q1 có `explanation "giải thích q1"` để test phân biệt guard `consumed`): xóa "two", chèn "zero" (5 blank như cũ) → "zero" KHÔNG có metadata (q1 đã bị "one" dùng ở pass 1); "one" giữ "giải thích q1"; "three" giữ "giải thích q3".
9. **`existing` không truyền → behavior cũ**: `segmentsToItems(segments)` trả `{stem, opts: null, answer: trim, alts}` thuần — test cũ "maps segments to wire items with opts null" phải vẫn pass.
10. **tablecomp xóa ô — realign theo answer**: ô (r1c1 "cat", r2c1 "dog") có explanation riêng, xóa blank r1c1 → ô "dog" giữ explanation của nó, không nhận "cat".
11. **trùng answer ổn định ở raw mode + tablecomp** (risk watch kongming plan-gate): (a) `parseClozeRaw` passage 2 blank cùng answer "the" + explanation riêng → apply lại không đổi giữ đúng từng câu; (b) `tableSegments` 2 hàng cùng answer → apply lại không đổi giữ đúng từng câu.

Mirror sang `apps/web/src/lib/cloze.test.ts`: test 1 + test 6 với comment `// mirror #425`.

**Verify (đỏ)** — `cd packages/ui && pnpm vitest run src/lib/cloze.test.ts`:
- **RED (fail vì assertion misassignment, KHÔNG phải import/type/ReferenceError)**: test 1 (`merged[1].explanation` nhận nhầm "giải thích q2"), test 3 (`merged[2]` "two" nhận nhầm "giải thích q3"), test 5 (`merged[1]` "cat" nhận nhầm "the-2"), test 7 (độ dài đổi → "banana" vẫn giữ metadata cũ trên code hiện tại), test 8 ("zero" nhận explanation q1), test 10 ("dog" nhận explanation "cat").
- **GREEN từ đầu (regression baseline — pass trên code hiện tại là ĐÚNG)**: test 2, 4, 6, 9, 11 (không đổi cấu trúc index-merge giữ đúng) và toàn bộ 4 test cũ describe "#420 Task 4.1b" (pass-2 fallback giữ hành vi mà test cũ khóa).
- **Erratum dự đoán (kongming plan-gate 2026-10-23)**: dự đoán ban đầu sai ở test 5 (đoán GREEN, thực tế RED — index-merge gán nhầm "the-2" vào "cat", đúng bản chất bug) và test 8 (đoán RED, thực tế GREEN với fixture cũ — đã sửa fixture gắn explanation cho q1 để test có sức phân biệt guard `consumed`; mutation check: bỏ `consumed` → test 8 phải đỏ, xong khôi phục).
- Tổng thể: exit ≠ 0 với đúng các assertion trên.

## Refactor (thuật toán chốt — cài đúng theo đây)

```ts
/** Segments → existing wire shape (`opts: null` — text kinds have no options).
 * `existing` (#420 Task 4.1b): merge metadata (`explanation`/`answerSet`/`pin`/
 * `type`) của item cũ vào segment theo KHOÁ NỘI DUNG `answer.trim()` (#425 —
 * trước đây merge theo index nên xóa/chèn blank làm bám sai metadata; stem
 * KHÔNG dùng làm khoá vì gap hấp thụ từ bị xóa khi xóa blank liền kề).
 * Trùng answer: chọn base UNUSED có |baseIdx − segIdx| nhỏ nhất (tie → baseIdx
 * nhỏ) — mơ hồ cố hữu trong run trùng answer, grading không đổi. Pass 2: khi
 * `segments.length === existing.length`, segment chưa khớp kế thừa metadata
 * `existing[i]` (nếu chưa dùng) — sửa answer/typo không mất explanation
 * (kongming plan-gate). Blank mới (answer chưa có) → item sạch; blank bị xóa
 * → metadata tự rơi; xóa+chèn cùng lúc (độ dài giữ) → blank mới vẫn sạch vì
 * base cùng vị trí đã bị pass 1 dùng. */
export function segmentsToItems(
	segments: ClozeSegment[],
	existing?: readonly AssignmentQuestion[],
): AssignmentQuestion[] {
	const toApplied = (segment: ClozeSegment) => ({
		stem: segment.stem,
		opts: null,
		answer: segment.answer.trim(),
		alts: segment.alts,
	});
	if (!existing || existing.length === 0) return segments.map(toApplied);
	const used = existing.map(() => false);
	const matched = segments.map((segment) => {
		const applied = toApplied(segment);
		const answer = segment.answer.trim();
		let bestIndex = -1;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const [index, base] of existing.entries()) {
			if (used[index] || base.answer.trim() !== answer) continue;
			const distance = Math.abs(index - segments.indexOf(segment));
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = index;
			}
		}
		if (bestIndex >= 0) used[bestIndex] = true;
		return { applied, baseIndex: bestIndex };
	});
	if (segments.length === existing.length) {
		return matched.map(({ applied, baseIndex }, i) => {
			const index = baseIndex >= 0 ? baseIndex : used[i] ? -1 : i;
			if (index < 0) return applied;
			return { ...existing[index], ...applied };
		});
	}
	return matched.map(({ applied, baseIndex }) =>
		baseIndex >= 0 ? { ...existing[baseIndex], ...applied } : applied,
	);
}
```

(Chi tiết cài được phép tinh gọn — vd precompute `segments.indexOf` thành map, `Number.POSITIVE_INFINITY` — MIỄN giữ đúng ngữ nghĩa: unused-only, nearest-index tie→nhỏ hơn, pass 2 chỉ khi độ dài bằng và base tại i chưa dùng.)

## Tests After (Regression gate)

- [x] `cd packages/ui && pnpm vitest run src/lib/cloze.test.ts` — exit 0, toàn bộ test mới + cũ pass.
- [x] `cd apps/web && pnpm vitest run src/lib/cloze.test.ts` — exit 0 (mirror + test cũ).
- [x] `cd packages/ui && pnpm exec tsc --noEmit` — không lỗi type mới (gate types đầy đủ ở phase 3).

## Tasks & Steps

1. **Task 1.1 — Viết test đỏ**: thêm import + helper `blanks5`/`items5` + 11 test ở mục Tests Before vào `packages/ui/src/lib/cloze.test.ts`; mirror test 1 + 6 vào `apps/web/src/lib/cloze.test.ts`.
   - Success criteria: test mới compile; RED đúng bộ (1,3,7,8,10) và GREEN đúng bộ (2,4,5,6,9,11) như mô tả ở "Verify (đỏ)".
   - Verify: `cd packages/ui && pnpm vitest run src/lib/cloze.test.ts` exit ≠ 0 với đúng pattern assertion nêu trên.
2. **Task 1.2 — Cài thuật toán**: thay `segmentsToItems` trong `packages/ui/src/lib/cloze.ts` theo mục Refactor (giữ comment khối).
   - Success criteria: toàn bộ test phase này pass; không hàm nào khác đổi.
   - Verify: `cd packages/ui && pnpm vitest run src/lib/cloze.test.ts && cd ../../apps/web && pnpm vitest run src/lib/cloze.test.ts` — cả hai exit 0.
3. **Task 1.3 — Kiểm call sites**: mở `cloze-editor.tsx:189`, `table-grid-editor.tsx:70` xác nhận chữ ký không đổi (chỉ đọc, không sửa).
   - Success criteria: không diff ở 2 file này.
   - Verify: `git diff --stat packages/ui/src/components/assignments/editor/` — rỗng.

## Risk Assessment

- Mơ hồ cố hữu trong run trùng answer khi xóa 1 phần tử (test 5): metadata exchange trong run, grading không đổi — chấp nhận có chủ đích, test khóa biên.
- Pass 2 chỉ khi độ dài bằng: xóa+chèn cùng lúc đã được test 8 khóa (blank mới sạch).
- Metadata drop khi xóa blank: metadata của blank xóa không có carrier — đúng bản chất; `answerSet` cụm <2 câu bị superRefine chặn khi save.

## Security Considerations

Không đụng network/payload; metadata chỉ giữ lại trên item đã tồn tại — student payload vốn chỉ `{stem, opts, type, pin}` (`contracts.ts:2091-2094`), không rò rỉ trường mới.
