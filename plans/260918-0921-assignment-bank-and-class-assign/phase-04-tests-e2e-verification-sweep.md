---
phase: 4
title: "Component tests, E2E & verification sweep"
status: complete
priority: P1
effort: "3h"
dependencies: ["phase 1", "phase 2", "phase 3"]
---

# Phase 4: Component tests, E2E & verification sweep

## Goal

Khoá chặt cả 2 surface bằng test đủ ba lớp: unit (mapper + status helpers), component (SSR render), E2E Playwright persist thật (bank page + giao bài trên lớp), rồi chạy toàn bộ verification sweep của repo.

## Context Links

- Pattern component test SSR: `apps/web/src/routes/_auth/assignments/new.test.tsx:1-108`, `index.test.tsx:1-137` (mock router + data-store + use-kernel-form-submit).
- Pattern E2E: `apps/e2e/specs/assignment-prompt-create.spec.ts` (#202), helpers `apps/e2e/specs/helpers.ts:9-37` (`signUpViaUi`, `openClassScheduleTab`), flow lớp/học viên: `apps/e2e/specs/enroll-existing-student.spec.ts`.
- Pattern mapper test: `apps/web/src/lib/repos/assignment-prompts.test.ts:6-57`.

## Key Insights

- E2E không có UI đánh dấu nộp → trạng thái "Đã nộp" chỉ assert được ở **unit/component level với fixture** có `submittedAt`; E2E chỉ thấy `Chưa nộp` / `Đang mở` / `0/N đã nộp` — đúng honest state.
- E2E cần seed: signup → tạo học viên → tạo lớp (AddClassModal) → enroll → tạo đề ready (`/assignments/new`). Tái dùng các flow UI sẵn có thay vì seed API (chuẩn #202).
- Component test tab lớp phải mock đủ: router param `$classId`, `useData` (class + students + prompts + classAssignments fixture), `useKernelFormSubmit`.

## Requirements

- **Unit** (`apps/web/src/lib/repos/class-assignments.test.ts`): mapper field-for-field; `submittedAt` null → null; targets đúng thứ tự; `createdAt` ISO string giữ nguyên. Thêm assert mapper prompts có `createdAt` (`assignment-prompts.test.ts`).
- **Unit** (`apps/web/src/components/assignments/assignment-status.test.ts`): ma trận rollup (Đã nộp hết / Quá hạn / Đang mở + guard 0-target → Đang mở) + 4 trạng thái học viên (kèm biên: submittedAt đúng ngày due = không trễ; due = hôm nay = chưa quá hạn; "hôm nay" theo ngày VN) + `fmtWhen`.
- **Component** `bank.test.tsx`: render hàng đề với tag đúng ưu tiên (draft > used > ready); filter Task 1 → chỉ hàng task1 + genre chips đổi; search input lọc theo title/source; count N/M; "Xóa bộ lọc" chỉ hiện khi có filter và clear cả query; empty filter state; preview hiển thị đề được chọn với copy tĩnh đúng design.
- **Component** tab lớp (file test cạnh `class-assignments-tab` hoặc qua `$classId` với mock): view list render thẻ + rollup từ fixture (1 item đã nộp hết, 1 item quá hạn, 1 đang mở); view assign: submit disabled khi thiếu đề/học viên; chọn đủ → nút mở; tag `Đã giao lớp này` + warn-note khi prompt trùng; 2 stat động đúng giá trị từ fixture; view success sau `refreshed` (mock run resolve).
- **E2E** `apps/e2e/specs/assignment-bank.spec.ts`: signup → tạo 2 đề (1 ready Task 2, 1 draft Task 1) qua UI → `/assignments` → click `Ngân hàng đề` → thấy 2 hàng (`Sẵn sàng`, `Bản nháp`) + count `Đang hiện 2 / 2 đề` → filter `Task 1 · 150 từ` → chỉ còn draft + genre chips của task1 → gõ vào ô search chuỗi không khớp → empty state `Không có đề khớp bộ lọc` → `Xóa bộ lọc` → đủ 2 hàng → click hàng draft → preview hiện title → reload vẫn đúng.
- **E2E** `apps/e2e/specs/class-assign.spec.ts`: signup → tạo học viên + lớp + enroll (flow `enroll-existing-student.spec.ts`) → tạo đề ready → vào class detail → tab `Bài tập` → empty `Chưa giao bài nào cho lớp này.` + stat `bài đang mở` = 0 → `Giao bài tập` → picker hiện đề ready (không hiện draft) → chọn đề → kiểm preview + action copy `Giao cho 1 học viên` → submit → success `Đã giao bài tập` + `Đã nộp 0/1` → `Xem bài đã giao` → thẻ `Hạn … · 0/1 đã nộp` + tag `Đang mở` + sub-row `Chưa nộp` → reload vẫn còn → sang `/assignments/bank` thấy tag `Đã dùng 1 lớp` → quay lại lớp giao lại cùng đề → có 2 item + warn-note reassign hiển thị → **quay lại bank: tag vẫn `Đã dùng 1 lớp`** (khóa giả định distinct-classId, red-team F9).
- **Sweep**: `pnpm check && pnpm check-types && pnpm test` xanh toàn repo; cập nhật docs nếu behaviour doc thay đổi (docs/codebase-summary.md chỉ khi thêm entry point mới — trang bank không phải entry trung tâm, cân nhắc; roadmap M5 nếu cần ghi feature đã lên).

## Related Code Files

- Create: `apps/web/src/lib/repos/class-assignments.test.ts`, `apps/web/src/components/assignments/assignment-status.test.ts`, `apps/web/src/routes/_auth/assignments/bank.test.tsx`, component test tab lớp, `apps/e2e/specs/assignment-bank.spec.ts`, `apps/e2e/specs/class-assign.spec.ts`
- Modify: `apps/web/src/routes-matcher.test.ts` (case `/assignments/bank` — nếu phase 2 chưa thêm)
- Delete: không

## Implementation Steps

1. Viết unit tests (mapper + status helpers) — chạy trước, nhanh nhất.
2. Viết 2 component test bank + tab lớp theo pattern mock của `new.test.tsx`.
3. Viết 2 E2E spec theo Key Insights; chạy cục bộ `npx playwright test assignment-bank class-assign`.
4. Chạy full sweep; sửa regression nếu có.
5. Cập nhật plan checkboxes + `ak plan status` các phase về done khi xong.

## Todo

- [ ] Unit: mapper class-assignments
- [ ] Unit: assignment-status ma trận + biên ngày
- [ ] Component: bank page (tag ưu tiên, filter, count, preview, empty)
- [ ] Component: tab lớp (list rollup, validation gating, reassign, success)
- [ ] E2E: assignment-bank.spec.ts
- [ ] E2E: class-assign.spec.ts (persist + reassign + used ở bank)
- [ ] Full sweep `pnpm check && pnpm check-types && pnpm test`

## Success Criteria

- Cả 3 lớp test xanh, phủ mọi trạng thái derived (kèm fixture submittedAt/trễ hạn).
- E2E persist thật qua reload; cross-check `Đã dùng 1 lớp` xuất hiện ở bank sau khi giao.
- Repo-wide verification xanh.

## Verification

```bash
cd apps/web && npx vitest run
cd apps/e2e && npx playwright test assignment-bank class-assign
pnpm check && pnpm check-types && pnpm test
```

## Risk Assessment

- **R1: E2E dài (nhiều bước seed)** — tách helper tạo (student, class, enrollment, prompt) vào `apps/e2e/specs/helpers.ts` nếu lặp; giữ mỗi spec độc lập signup.
- **R2: Flaky do date input** — dùng `page.fill` với giá trị ISO cố định trong tương lai (vd `2030-01-15`), không phụ thuộc "hôm nay + 7".
- **R3: Component SSR test không cover tương tác chip** — mức assert copy + disabled state là đủ (precedent #202); tương tác thật do E2E giữ.

## Security Considerations

- E2E dùng DB local riêng (boot server app + fresh D1) — không chạm production; không seed secret.

## Next Steps

- Sau merge: viết plan riêng cho write-path đánh dấu "đã nộp" + link target → grading row (đã ghi Non-Goal).
