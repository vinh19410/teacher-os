---
phase: 1
title: "Selector bài tập theo học viên + unit tests"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Selector bài tập theo học viên + unit tests

## Goal

Thêm một pure selector trả về danh sách bài tập của một học viên, merge nguồn class assignment (#208) và legacy grading, kèm unit tests đầy đủ — tách biệt hoàn toàn khỏi UI để test được mà không cần render.

## Context Links

- Root cause & evidence: [plan.md](./plan.md) mục "Root Cause"
- Pattern tham chiếu: `apps/web/src/lib/repos/enrollments.ts:24` (`classesByStudent` — pure, nhận `Pick<KernelHydratedData, ...>`)
- Mapping nguồn: `apps/web/src/lib/repos/class-assignments.ts`, `apps/web/src/lib/repos/assignments.ts`
- Helper status (phase 2 dùng): `apps/web/src/components/assignments/assignment-status.ts`

## Files to Create / Modify

- Create: `apps/web/src/lib/repos/student-assignments.ts`
- Create: `apps/web/src/lib/repos/student-assignments.test.ts`

## Key Insights

- `KernelHydratedData` (mock-data.ts:219–240) đã có đủ `assignments`, `classAssignments`, `classes`, `assignmentPrompts` — selector không cần fetch thêm.
- `ClassAssignment.targets` là mảng `{ studentId, submittedAt: string | null }` liên kết thẳng student (không qua enrollment); `submittedAt === null` nghĩa là chưa nộp.
- Theo convention "wave repos": pure by design, không side effect, nhận data qua tham số.

## Requirements

- Row class: 1 row cho **mỗi** `(classAssignment, target)` mà `target.studentId === studentId` — học viên được giao cùng đề 2 lần (reassign) phải ra 2 row riêng.
- Row grading: mọi `data.assignments` với `sid === studentId`, giữ nguyên `status`/`scores`.
- Tra cứu phụ: skill label từ `data.assignmentPrompts` (theo `promptId`) qua **inline map strict** — prompt missing HOẶC skill id không thuộc `SKILLS` thì `null`, không throw (không dùng `skillOf`: hàm này fallback im lặng sang `SKILLS[0]` "Writing" cho id lạ — `assignment-presets.ts:308–315` — và `SkillPreset` không có field `.label`); tên lớp từ `data.classes` (theo `classId`) — missing thì `""`, không throw.
- Normalize `typeLabel`: grading `type` rỗng `""` (schema default — `packages/db/src/schema/assignment.ts:30`) → `null` để UI render `—` thống nhất.

## Architecture

```ts
// apps/web/src/lib/repos/student-assignments.ts
import { SKILLS } from "@/components/assignments/assignment-presets";
import type { KernelHydratedData, Scores } from "@/lib/mock-data";

export interface StudentAssignmentRow {
	/** React key ổn định: `ca:<classAssignmentId>` | `grading:<assignmentId>`. */
	key: string;
	kind: "class" | "grading";
	id: string;
	title: string;
	/** Cột "Loại": class row = tên skill từ prompt; grading row = legacy `type`. null khi không tra được hoặc `""`. */
	typeLabel: string | null;
	/** Tên lớp chứa bài giao; "" khi class không tra được hoặc là grading row. */
	className: string;
	/** Class row: ISO yyyy-mm-dd. Grading row: có thể `""` hoặc định dạng legacy (vd "20/08") — KHÔNG có contract ISO (`assignment.due` `default ""`, schema assignment.ts:31). */
	due: string;
	/** class row: từ target.submittedAt; grading row: null. */
	submittedAt: string | null;
	/** grading row: "graded" | "late" | "not-submitted"; class row: null. */
	gradingStatus: string | null;
	scores: Scores | null;
}

export function studentAssignmentRows(
	data: Pick<
		KernelHydratedData,
		"assignments" | "classAssignments" | "classes" | "assignmentPrompts"
	>,
	studentId: string,
): StudentAssignmentRow[];
```

- Duyệt `data.classAssignments`; với mỗi target khớp `studentId`, push row `kind: "class"`.
- Duyệt `data.assignments` khớp `sid`, push row `kind: "grading"` (`typeLabel: a.type === "" ? null : a.type`, `className: ""`, `gradingStatus: a.status`, `scores: a.scores`).
- Sort: `due` khớp ISO `yyyy-mm-dd` (regex `^\d{4}-\d{2}-\d{2}$`) tăng dần; row `due` rỗng/không ISO (chỉ grading legacy) **xuống cuối**; tie-break bằng `key` cho thứ tự ổn định.
- Skill label: inline map từ `SKILLS` (id → label) — lookup strict, id lạ → `null` (xem Requirements).

## Implementation Steps

1. Tạo `student-assignments.ts` với interface + hàm như Architecture ở trên.
2. Tạo `student-assignments.test.ts` theo pattern fixture của `repos/class-assignments.test.ts`.

## Todo

- [x] Viết test trước (thấy fail), phủ: merge 2 nguồn đúng kind; filter đúng studentId; reassign cùng đề → 2 row; **grading row `due: ""` → sort xuống cuối**; **grading row `type: ""` → `typeLabel` null**; **skill id lạ (không thuộc `SKILLS`) → `typeLabel` null**; **enrollment đã xoá nhưng target còn → row vẫn render kèm `className`** (parity với student portal `student.ts:756` — không filter qua enrollment); prompt/class lookup miss → `typeLabel` null / `className` "" (defensive, unreachable-by-design do FK cascade — `class-assignment.ts:24–30`); sort due tăng dần; data rỗng → []; grading row map đúng `gradingStatus`/`scores`/`typeLabel`.
- [x] Implement `studentAssignmentRows` cho tất cả test xanh.
- [x] `pnpm --filter web test -- student-assignments` pass.

## Success Criteria

- Tất cả test case trên pass; selector không phụ thuộc React/store/network.
- `pnpm check` + `pnpm check-types` pass.

## Risk Assessment

- Thấp: code thuần chức năng mới, chưa wire vào UI nên không thể regress màn hiện có.

## Security Considerations

- Không có: chỉ đọc in-memory snapshot đã được server scope theo org.

## Next Steps

- Phase 2 nối selector vào tab Bài tập.
