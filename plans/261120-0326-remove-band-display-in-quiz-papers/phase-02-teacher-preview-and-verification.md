---
phase: 2
title: "Phase 2: Đồng bộ Xem trước phía học viên, E2E & Kiểm chứng"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Đồng bộ Xem trước phía học viên, E2E & Kiểm chứng

## Goal

Loại bỏ toàn bộ hiển thị `Band` (cả dòng spec dưới tiêu đề lẫn chip `<Tag>Band ...</Tag>`) trên cả 3 bề mặt "Xem trước phía học viên" (`StudentPreviewPaper`, `PromptPreviewAside`, `SelectedPromptPreviewContent` trong `AssignClassPromptModal`), siết và chạy kiểm chứng spec E2E `hybrid-multi-skill-assignment.spec.ts`, rồi chạy đầy đủ cổng chất lượng local.

## Files to Create / Modify

<!-- Updated: Validation Session 1 & Red-Team Findings 1, 2, 3 -->

- Modify: `apps/web/src/components/assignments/student-preview-paper.tsx` (line 28 `band?: string`, line 88 bỏ ` · Band {props.band}`, line 210 bỏ `<Tag>Band ...</Tag>`)
- Modify: `apps/web/src/components/assignments/student-preview-paper.test.tsx`
- Modify: `apps/web/src/components/assignments/prompt-preview-aside.tsx` (line 54 bỏ ` · Band {prompt.band}`, line 190 bỏ `<Tag>Band ...</Tag>`)
- Modify: `apps/web/src/components/assignments/prompt-preview-aside.test.tsx`
- Modify: `apps/web/src/components/classes/assign-class-prompt-modal.tsx` (line 1096 bỏ `<Tag>Band ...</Tag>` trong `SelectedPromptPreviewContent`; giữ nguyên danh sách chọn đề ở line 629)
- Modify: `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx` (nếu có; hoặc thêm test kiểm chứng vùng preview không chứa `Band`)
- Modify: `apps/web/src/routes/_auth/assignments/preview.test.tsx` (line 84)
- Modify: `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts` (line 219 + assertion phủ định `Band 7.0`)

## TDD Test Matrix

<!-- Updated: Validation Session 1 & Red-Team Findings 1, 3 -->

| # | Target | Test Case | Expected Before (Red) | Expected After (Green) |
|---|--------|-----------|-----------------------|------------------------|
| 1 | `StudentPreviewPaper` (`apps/web`) | Render đề có `band: "7.0"` | Chứa `${part.spec} · Band 7.0` và `<Tag>Band 7.0</Tag>` | Chứa `${part.spec}`, hoàn toàn `not.toContain("Band 7.0")` |
| 2 | `PromptPreviewAside` (`apps/web`) | Render đề có `band: "7.0"` và `level: "IELTS Academic"` | Chứa `${part.spec} · Band 7.0 · IELTS Academic` và `<Tag>Band 7.0</Tag>` | Chứa `${part.spec} · IELTS Academic`, hoàn toàn `not.toContain("Band 7.0")` |
| 3 | `SelectedPromptPreviewContent` trong `AssignClassPromptModal` (`apps/web`) | Mở vùng "Xem trước phía học viên" cho đề `band: "7.0"` | Chứa chip `Band 7.0` trong khối preview | Khối preview không chứa `Band 7.0` (trong khi dòng danh sách chọn đề vẫn giữ `Band 7.0`) |
| 4 | `PreviewAssignmentRoute` (`apps/web`) | Render draft Writing Task 2 `band: "7.0"` | Chứa `Academic · 250 từ · 40 phút · Band 7.0` và `Band 7.0` | Chứa `Academic · 250 từ · 40 phút`, hoàn toàn `not.toContain("Band 7.0")` |
| 5 | `hybrid-multi-skill-assignment.spec.ts` (`apps/e2e`) | Start Gate và `QuizPaper` sau khi bấm Bắt đầu | Assert `2 câu hỏi + Bài viết · Band 7.0` | Assert `getByText("2 câu hỏi + Bài viết", { exact: true })` + `getByText(/Band 7\.0/i)` có count `0` ở Start Gate & `QuizPaper` (giữ nguyên assertions `Band 6.5` cho điểm đã chấm phía dưới) |

## Implementation Steps

1. **Red (Tests first):**
   - Thêm test case kiểm tra hoàn toàn `not.toContain("Band 7.0")` vào `apps/web/src/components/assignments/student-preview-paper.test.tsx` và `apps/web/src/components/assignments/prompt-preview-aside.test.tsx` (kiểm tra cả khi có `level`).
   - Kiểm tra test hiện có cho `AssignClassPromptModal` (`apps/web/src/components/classes/assign-class-prompt-modal.test.tsx` hoặc tương đương) và thêm test kiểm chứng vùng preview mở rộng không chứa `Band 7.0`.
   - Cập nhật `apps/web/src/routes/_auth/assignments/preview.test.tsx:84` để kiểm tra `"Academic · 250 từ · 40 phút"` và `expect(html).not.toContain("Band 7.0")`.
   - Chạy vitest hẹp ở `apps/web` xác nhận test mới FAIL trước khi sửa.
2. **Green (Implementation):**
   - Trong `apps/web/src/components/assignments/student-preview-paper.tsx`:
     - Đổi prop `band: string` thành `band?: string` (line 28) để giữ tương thích ngược với caller `preview.tsx:244` và các test fixture.
     - Line 87–89: bỏ ` · Band {props.band}`, chỉ giữ `{part.spec}`.
     - Line 210: xoá `<Tag>{\`Band ${props.band}\`}</Tag>`.
   - Trong `apps/web/src/components/assignments/prompt-preview-aside.tsx`:
     - Line 53–56: bỏ ` · Band {prompt.band}`, chỉ giữ `{part.spec}{prompt.level?.trim() ? \` · ${prompt.level.trim()}\` : ""}`.
     - Line 190: xoá `<Tag>{\`Band ${prompt.band}\`}</Tag>`.
   - Trong `apps/web/src/components/classes/assign-class-prompt-modal.tsx`:
     - Line 1096 (`SelectedPromptPreviewContent`): xoá `<Tag>{\`Band ${prompt.band}\`}</Tag>`. Giữ nguyên line 629 trong danh sách chọn đề.
   - Trong `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts`:
     - Line 219: đổi thành `await expect(studentPage.getByText("2 câu hỏi + Bài viết", { exact: true })).toBeVisible();` và `await expect(studentPage.getByText(/Band 7\.0/i)).toHaveCount(0);`.
     - Sau line 223 (sau khi bấm Bắt đầu và vào `QuizPaper`): thêm `await expect(studentPage.getByText(/Band 7\.0/i)).toHaveCount(0);`.
     - Giữ nguyên toàn bộ assertions điểm đã chấm `Band 6.5` (lines 312, 328, 332, 337).
3. **Verify:**
   - Chạy unit tests ở `apps/web`, sau đó chạy toàn bộ cổng chất lượng local: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
   - Chạy spec E2E lẻ `hybrid-multi-skill-assignment.spec.ts` với port override theo `AGENTS.md`, rồi khôi phục các file screenshot có sẵn của #574 (`git checkout -- plans/reports/574-*.png`) để không làm bẩn diff.

## Todo

- [x] Viết/cập nhật unit tests Red ở `apps/web` (`student-preview-paper.test.tsx`, `prompt-preview-aside.test.tsx`, `assign-class-prompt-modal`, `preview.test.tsx`)
- [x] Sửa `apps/web/src/components/assignments/student-preview-paper.tsx` (line 28, 88, 210)
- [x] Sửa `apps/web/src/components/assignments/prompt-preview-aside.tsx` (line 54, 190)
- [x] Sửa `apps/web/src/components/classes/assign-class-prompt-modal.tsx` (line 1096)
- [x] Cập nhật `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts` (line 219 & sau line 223)
- [x] Chạy toàn bộ cổng chất lượng local (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`)
- [x] Chạy spec E2E lẻ `hybrid-multi-skill-assignment.spec.ts` với port override và khôi phục `plans/reports/574-*.png`

## Verification

<!-- Updated: Red-Team Finding 3 - chạy spec E2E lẻ & khôi phục 574-*.png -->

```bash
pnpm --filter web test src/components/assignments/student-preview-paper.test.tsx src/components/assignments/prompt-preview-aside.test.tsx src/routes/_auth/assignments/preview.test.tsx && \
pnpm exec biome check . && \
pnpm check-types && \
pnpm test && \
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/hybrid-multi-skill-assignment.spec.ts && \
git checkout -- plans/reports/574-*.png
```

## Success Criteria

- Toàn bộ unit tests ở `packages/ui`, `apps/student`, `apps/web`, `apps/admin` và toàn monorepo (`pnpm test`) đều pass.
- `pnpm exec biome check .` và `pnpm check-types` thoát mã 0 không lỗi.
- Spec E2E lẻ `hybrid-multi-skill-assignment.spec.ts` pass tại local với `{ exact: true }` + phủ định `Band 7.0`, không để lại diff rác ở `plans/reports/574-*.png`.
