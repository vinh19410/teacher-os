---
phase: 1
title: "Helper suy luận type câu (packages/api)"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Helper suy luận type câu

## Goal
Một hàm thuần dùng chung trả về type hiệu dụng cho từng câu, kể cả trường hợp câu không khai type nằm trong đề type điền chữ nhưng đáp án là TFNG/YNNG. Server và web cùng gọi hàm này, nên không có hai bản logic lệch nhau.

## Bối cảnh
- `answerKindByType` (`packages/api/src/contracts.ts:362`) không có các type điền chữ (`note`, `flow`, `sent`, `summary`…). Type không có kind thì widget là cloze/text.
- `ASSIGNMENT_ANSWER_CHOICES.tfng = ["TRUE","FALSE","NOT GIVEN"]`, `.ynng = ["YES","NO","NOT GIVEN"]` (`contracts.ts:349`).
- Marker ô trống `_{4,}` hiện chỉ có ở `packages/ui/src/lib/cloze.ts:16` (`CLOZE_MARKER_SOURCE`, không export). `packages/api` không được import `packages/ui`, mà `ui` thì đã import `api`. Vì vậy chuyển nguồn regex sang `api` và để `ui` import lại (DRY, chỉ một nguồn).
- `packages/api` không có script test. Test lib api đặt ở `apps/server/src/lib/*.test.ts` (tiền lệ: `grade-quiz.test.ts`).

## Files
- Create: `packages/api/src/lib/infer-question-types.ts`
- Modify: `packages/ui/src/lib/cloze.ts` (import `CLOZE_MARKER_SOURCE` và `CLOZE_EDITOR_TYPES` từ api thay vì khai báo cục bộ; giữ nguyên export public của ui) <!-- Updated: Red Team - helper chỉ suy luận cho type thuộc CLOZE_EDITOR_TYPES -->
- Create: `apps/server/src/lib/infer-question-types.test.ts`

## Contract

```ts
// packages/api/src/lib/infer-question-types.ts
/** Nguồn regex marker ô trống (≥ 4 gạch dưới) — nguồn duy nhất cho api + ui. */
export const CLOZE_MARKER_SOURCE = "_{4,}";

/** Các type điền chữ có editor cloze (chuyển từ ui sang api, ui re-export).
 * Chỉ các type này mới được suy luận; `tablecomp`, `shortans`, `""` (prompt đã
 * xoá) và mọi type khác giữ nguyên. */
export const CLOZE_EDITOR_TYPES: ReadonlySet<string> = new Set([
	"sent", "note", "summary", "flowchart", "form", "notes", "sent4", "flow",
]);

/**
 * Type hiệu dụng cho từng câu (cùng index với `questions`).
 * - câu có `type` → giữ nguyên;
 * - promptType không thuộc CLOZE_EDITOR_TYPES (kể cả choice kind, tablecomp,
 *   shortans, "") → promptType, không suy luận gì;
 * - còn lại: câu "ứng viên" = không có opts (null/[]), không có `pin`, stem
 *   không có marker, answer.trim() ∈ {"TRUE","FALSE","NOT GIVEN","YES","NO"}
 *   (phân biệt hoa thường).
 *   Mỗi ứng viên thuộc một họ: TF ("TRUE"/"FALSE"), YN ("YES"/"NO"), hoặc
 *   trung tính ("NOT GIVEN"). Gom ứng viên LIÊN TIẾP thành run, run bị cắt khi
 *   đổi họ TF <-> YN. Run có họ YN → "ynng"; run họ TF hoặc chỉ trung tính →
 *   "tfng". Câu không phải ứng viên → promptType.
 */
export function inferQuestionTypes(
	questions: readonly {
		stem: string;
		opts: readonly string[] | null;
		answer: string;
		type?: string | null;
		pin?: unknown;
	}[],
	promptType: string,
): string[];
```

## Steps
1. Viết test trước (red) trong `apps/server/src/lib/infer-question-types.test.ts`:
   - Fixture "Wooden buildings": promptType `note`, 4 câu markerless với đáp án FALSE/TRUE/NOT GIVEN/FALSE, rồi 4 câu có `____`. Kỳ vọng `["tfng"×4, "note"×4]`.
   - Run có `YES` + `NOT GIVEN` → cả run là `ynng`.
   - Run chỉ có `NOT GIVEN` → `tfng`.
   - Câu đã khai `type: "mcq"` giữ nguyên `mcq` dù đáp án là `TRUE`.
   - promptType `tfng` → mọi câu không type giữ `tfng`.
   - Đáp án `true` (viết thường), hoặc stem có `____`, hoặc `opts` khác rỗng, hoặc có `pin` → không suy luận.
   - promptType `tablecomp` với stem `[table] r1 c1: …` và đáp án `YES` → giữ `tablecomp`. promptType `""` và `shortans` → giữ nguyên.
   - Run `TRUE, YES, FALSE` (hai họ) → cắt thành `tfng`, `ynng`, `tfng` theo họ từng câu; run `NOT GIVEN` đứng giữa hai câu `YES` → `ynng` cho cả run.
   - Hai run TFNG cách nhau bởi một câu cloze → hai run độc lập (run sau có YES thì chỉ run sau là `ynng`).
2. Implement helper. Loop một lượt, giữ buffer index của run hiện tại, flush khi gặp câu không phải ứng viên hoặc khi hết mảng.
3. `packages/ui/src/lib/cloze.ts`: thay `const CLOZE_MARKER_SOURCE = "_{4,}"` và định nghĩa `CLOZE_EDITOR_TYPES` bằng import từ `@teacher-os/api/lib/infer-question-types` (ui giữ export `CLOZE_EDITOR_TYPES` bằng re-export để không đổi caller).

## Verify
- `pnpm --filter server test infer-question-types` xanh (đã thấy red trước khi implement).
- `pnpm --filter web test cloze` và `pnpm --filter student test` xanh (cloze không hồi quy).
- `pnpm check-types` xanh.

## Risk / Rollback
Hàm thuần, chưa có caller ở phase này. Rollback bằng cách xoá file và revert import ở cloze.ts.
