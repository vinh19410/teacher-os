# Phase 2: Client Helper & UI Header Integration

## Goal
Xây dựng helper định dạng hạn nộp chuẩn Việt Nam, tích hợp vào `QuizRuntimeHeader` và `QuizTakeView` để hiển thị hạn nộp trên header làm bài, đồng thời đảm bảo không hiển thị khi bài không có hạn hoặc là bài tự luyện, không vỡ giao diện trên mobile 375px/320px.

## Files to Create / Modify
- `apps/student/src/lib/assignment-status.ts` (symbol: `formatQuizDueText`)
- `apps/student/src/components/quiz/quiz-runtime-header.tsx` (symbol: `QuizRuntimeHeader`)
- `apps/student/src/components/quiz/quiz-take-view.tsx` (symbol: `QuizTakeView`)
- `apps/student/test/assignment-status.test.ts`
- `apps/student/test/quiz-navigator.test.tsx`
- `apps/student/test/quiz-take-view.test.tsx`

## Tasks & Steps

### Task 2.1 — TDD Red & Green: Xây dựng helper `formatQuizDueText`
- Goal: Định dạng hạn nộp thành `"Hạn: HH:mm dd/mm"` (nếu có `dueAt`) hoặc `"Hạn: dd/mm"` (nếu chỉ có `due`). Trả về `""` nếu không có hạn.
- Target files:
  - `apps/student/src/lib/assignment-status.ts`
  - `apps/student/test/assignment-status.test.ts`
- Steps:
  1. Viết test case trong `assignment-status.test.ts`:
     - `{ due: "", dueAt: null }` -> trả về `""`.
     - `{ due: "2026-11-15", dueAt: null }` -> trả về `"Hạn: 15/11"`.
     - `{ due: "2026-11-15", dueAt: "2026-11-15T10:00:00.000Z" }` (17:00 giờ VN) -> trả về `"Hạn: 17:00 15/11"`.
     - Chú ý: Tránh lỗi kết hợp chéo (chimera) giữa ngày của `due` và giờ của `dueAt` — khi `dueAt` hợp lệ, cả ngày và giờ đều lấy từ `dueAt` theo múi giờ Việt Nam.
  2. Implement `formatQuizDueText`:
     ```ts
     export function formatQuizDueText(input: {
       due?: string | null;
       dueAt?: string | null;
     }): string {
       const deadline = evaluateAssignmentDeadline({
         due: input.due ?? "",
         dueAt: input.dueAt,
       });
      if (deadline.hasDueAt && deadline.dueAtMs !== null) {
        const time = formatVietnamTimeHHMM(deadline.dueAtMs);
        const parsed = parseISODate(deadline.dueDateISO);
        return parsed ? `Hạn: ${time} ${formatDayMonth(deadline.dueDateISO)}` : "";
      }
      if (deadline.dueDateISO) {
        const parsed = parseISODate(deadline.dueDateISO);
        return parsed ? `Hạn: ${formatDayMonth(deadline.dueDateISO)}` : "";
      }
      return "";
    }
     ```
- Success criteria: Mọi case của helper đều trả đúng chuỗi mong muốn.
- Verify: `pnpm --filter student test assignment-status` exits 0.

### Task 2.2 — TDD Red & Green: Thêm prop `dueText` vào `QuizRuntimeHeader`
- Goal: `QuizRuntimeHeader` nhận prop `dueText?: string | null` và hiển thị nó dưới hoặc bên cạnh tiêu đề với `data-testid="quiz-runtime-due"`. Ẩn hoàn toàn khi rỗng hoặc null.
- Target files:
  - `apps/student/src/components/quiz/quiz-runtime-header.tsx`
  - `apps/student/test/quiz-navigator.test.tsx`
- Steps:
  1. Trong `quiz-navigator.test.tsx`, viết unit test cho `QuizRuntimeHeader`:
     - Khi `dueText="Hạn: 17:00 15/11"`, HTML render chứa element có `data-testid="quiz-runtime-due"` với nội dung `"Hạn: 17:00 15/11"`.
     - Khi `dueText=""` hoặc `dueText={null}` hoặc không truyền `dueText`, HTML KHÔNG chứa `data-testid="quiz-runtime-due"`.
  2. Trong `quiz-runtime-header.tsx`:
     - Cập nhật interface props của `QuizRuntimeHeader` thêm `dueText?: string | null`.
     - Trong JSX bên trái (sau nút "Thoát"):
       Bọc `<h1>` và `dueText` trong container flex-col:
       ```tsx
       <div className="flex min-w-0 flex-col justify-center">
         <h1 className="truncate font-semibold text-[15px] tracking-tight">
           {title}
         </h1>
         {dueText ? (
          <span
            data-testid="quiz-runtime-due"
            className="font-mono text-[11px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
          >
            {dueText}
          </span>
         ) : null}
       </div>
       ```
- Success criteria: Unit test render đúng element khi có `dueText` và giấu sạch khi không có.
- Verify: `pnpm --filter student test quiz-navigator` exits 0.

### Task 2.3 — TDD Red & Green: Truyền `dueText` vào `QuizRuntimeHeader` trong `QuizTakeView`
- Goal: `QuizTakeView` tính `dueText` từ `detail.due` và `detail.dueAt` và truyền vào cả 2 vị trí gọi `QuizRuntimeHeader`.
- Target files:
  - `apps/student/src/components/quiz/quiz-take-view.tsx`
  - `apps/student/test/quiz-take-view.test.tsx`
- Steps:
  1. Trong `apps/student/src/components/quiz/quiz-take-view.tsx`:
     - Import `formatQuizDueText` từ `@/lib/assignment-status`.
     - Tính `const dueText = useMemo(() => detail ? formatQuizDueText({ due: detail.due, dueAt: detail.dueAt }) : "", [detail?.due, detail?.dueAt]);`
     - Truyền `dueText={dueText}` vào `QuizRuntimeHeader` ở màn start gate (dòng ~380).
     - Truyền `dueText={dueText}` vào `QuizRuntimeHeader` ở màn active attempt (dòng ~481).
  2. Trong `apps/student/test/quiz-take-view.test.tsx`:
     - Thêm test case: Khi detail có `due: "2026-11-15"` hoặc có `dueAt`, trang làm bài render header có hiển thị hạn nộp.
     - Thêm test case: Khi detail là bài tự luyện (practice) với `due: ""`, trang làm bài không render element hạn nộp.
- Success criteria: Toàn bộ test suite `quiz-take-view.test.tsx` pass.
- Verify: `pnpm --filter student test quiz-take-view` exits 0.

### Task 2.4 — Responsive Viewport & Text Overflow Verification
- Goal: Đảm bảo ở các viewport hẹp (375×812 và 320×568) với tiêu đề bài thi dài và hạn nộp có giờ phút:
  - Header không bị tràn ngang (`overflow-x`).
  - Tiêu đề được truncate hợp lý bằng `truncate min-w-0`.
  - Nút "Thoát" và "Nộp bài" giữ nguyên kích thước và khả năng bấm (`min-h-[44px]` target hoặc button chuẩn).
  - Không có khoảng trống dọc dư thừa làm đội chiều cao header vượt quá `h-14` (56px).
- Target files: `apps/student/test/quiz-navigator.test.tsx` (thêm test case DOM/classes kiểm tra `min-w-0` và `truncate`).
- Success criteria: Class styling đảm bảo co giãn và bảo toàn nút action.
- Verify: `pnpm --filter student test quiz-navigator` exits 0.

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
