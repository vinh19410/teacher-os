---
title: "Phase 1: Merge-Assignments-Page"
status: done
---

# Phase 1: Merge-Assignments-Page

## Context Links

- Route hiện tại: `apps/web/src/routes/_auth/assignments/index.tsx` (bảng tracking cũ)
- Route bank: `apps/web/src/routes/_auth/assignments/bank.tsx` (nội dung được port sang index)
- Tham chiếu route bank: `apps/web/src/routes-matcher.ts:16`, `apps/web/src/components/layout/app-shell.tsx:21`, `apps/web/src/components/assignments/create-success-card.tsx:95`, `apps/web/src/routes/_auth/assignments/new.tsx:347-355`

## Overview

- **Priority**: P1
- **Status**: todo
- Ghi đè `AssignmentsRoute` để `/assignments` hiển thị duy nhất **danh sách bài tập đã tạo**
  (port toàn bộ UI danh sách prompts từ `bank.tsx`), xoá route `/assignments/bank` và mọi
  liên kết điều hướng tới nó. Không đụng backend.

## Key Insights

- Nội dung "danh sách bài tập đã tạo" đã tồn tại hoàn chỉnh trong `bank.tsx`: filter card
  (search + kỹ năng + phần thi), listbox prompts với `StatusTag` theo `promptStatus(status, used)`,
  cột phải sticky `BankPreviewAside`, count "Đang hiện X / Y đề".
- `usedByPromptId` (số lớp đã giao mỗi đề) được tính từ `data.classAssignments ?? []` — giữ nguyên.
- Bảng cũ trong `index.tsx` đọc `data.assignments` + `averageBand` từ `mock-data.ts` — bỏ toàn bộ,
  nhưng KHÔNG xoá field `assignments` trong snapshot (`data-provider.tsx:147` và
  `routes/_auth/students/$studentId.tsx:78` vẫn dùng). Row-click của bảng (`index.tsx:113-117` →
  `/assignments/$assignmentId`) bị xoá theo; luồng chấm bài vẫn vào được qua
  `students/$studentId.tsx:256` (điểm vào còn lại — xem Red Team Review plan.md).
- E2E `assignment-prompt-create.spec.ts:14` click nút `+ Tạo bài tập` trên trang này → bắt buộc giữ nguyên label.
- `routeTree.gen.ts` do TanStack Router plugin sinh lại khi chạy vite build/dev — không sửa tay.

## Requirements

- [x] `/assignments` chỉ hiển thị danh sách prompts đã tạo (kèm filter/search/preview)
- [x] Không còn route `/assignments/bank` và không còn liên kết nào trỏ tới nó trong app code
- [x] App vẫn type-check pass sau khi xoá route (routeTree regenerated)

## Architecture

Trang gộp (1 cột content, giữ layout 2 cột của bank khi có prompts):

```
/assignments (index.tsx — AssignmentsRoute)
├── PageHead  title="Bài tập"  lead="Danh sách bài tập đã tạo. Lọc theo kỹ năng rồi giao cho lớp ở trang Lớp học."
├── Button "+ Tạo bài tập"  → /assignments/new          (label giữ nguyên cho e2e)
├── [0 prompts]  Empty state Card "Chưa có bài tập nào" + Button "Tạo bài tập đầu tiên" → /assignments/new
└── [có prompts] grid lg:grid-cols-[1.35fr_0.95fr]
    ├── Filter Card: search input · ChipFilter kỹ năng · ChipFilter phần thi · count · "Xóa bộ lọc"
    ├── Listbox rows: title · Tag loại · source · "Thêm {fmtDate}" · StatusTag · "part · Band N"
    └── BankPreviewAside (sticky, prompt đang chọn)
```

Data: `useData()` → `data.assignmentPrompts`, `data.classAssignments`. Loại bỏ: `data.assignments`,
`data.students`, `averageBand`, `DataTable`, `Badge`, `STATUS_MAP`, `statusBadge`, prop `initialFilter`.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/assignments/index.tsx` — ghi đè toàn bộ, port UI từ bank.tsx
- Modify: `apps/web/src/components/assignments/create-success-card.tsx` — link "Xem ngân hàng đề" → `to="/assignments"`, đổi label thành "Xem danh sách bài tập"
- Modify: `apps/web/src/routes/_auth/assignments/new.tsx` — breadcrumb bỏ middle link "Ngân hàng" (còn "Bài tập › Tạo mới")
- Modify: `apps/web/src/routes-matcher.ts` — xoá `"/assignments/bank": true` khỏi `VALID_EXACT_ROUTES`
- Modify: `apps/web/src/components/layout/app-shell.tsx` — xoá entry `"/_auth/assignments/bank": "Ngân hàng bài tập"`
- Generate locally, KHÔNG commit (gitignored tại `.gitignore:12`): `apps/web/src/routeTree.gen.ts` — KHÔNG sửa tay; regenerate bằng `pnpm --filter web check-types` (vite build chạy plugin)
- Delete: `apps/web/src/routes/_auth/assignments/bank.tsx`

## Implementation Steps

1. Mở `bank.tsx`, copy toàn bộ thân component (state, memos, JSX) làm nền cho `index.tsx`.
2. Ghi đè `index.tsx`: giữ `export const Route = createFileRoute("/_auth/assignments/")`, component tên `AssignmentsRoute` (test unit import tên này).
3. Trong JSX mới: bỏ breadcrumb (`Bài tập › Ngân hàng`), đổi `PageHead` title thành "Bài tập", lead như architecture; CTA trên phải là `+ Tạo bài tập` → `/assignments/new` (không còn nút "Ngân hàng đề").
4. Empty state khi `assignmentPrompts.length === 0`: Card "Chưa có bài tập nào" + mô tả + nút "Tạo bài tập đầu tiên" → `/assignments/new`.
5. Xoá file `bank.tsx`.
6. Cập nhật 4 file tham chiếu (create-success-card, new.tsx breadcrumb, routes-matcher, app-shell) như mục Related Code Files.
7. Chạy `pnpm --filter web check-types` để vite build regenerate `routeTree.gen.ts` (file gitignored — giữ local, KHÔNG commit) + tsc pass.

## Todo

- [x] Ghi đè `index.tsx` bằng UI danh sách prompts (port từ bank.tsx, đổi title/lead/CTA, thêm empty state)
- [x] Xoá `bank.tsx`
- [x] Cập nhật `create-success-card.tsx` + `new.tsx` (link/breadcrumb)
- [x] Cập nhật `routes-matcher.ts` + `app-shell.tsx` (bỏ entry bank)
- [x] `pnpm --filter web check-types` pass và `routeTree.gen.ts` đã regenerate

## Success Criteria

- `/assignments` render đúng layout architecture ở trên; `/assignments/bank` không còn route trong routeTree (mở trực tiếp → SPA shell HTTP 200 + router not-found, vì matcher dynamic prefix `/assignments/` vẫn match — xem Red Team Review plan.md)
- `grep -rn "assignments/bank\|_auth/assignments/bank" apps/web/src --include="*.tsx" --include="*.ts" | grep -v routeTree.gen | grep -v ".test."` → 0 kết quả
- `pnpm --filter web check-types` exit 0

### Verification
```bash
pnpm --filter web check-types
grep -rn "assignments/bank" apps/web/src --include="*.tsx" --include="*.ts" | grep -v routeTree.gen | grep -v ".test."
```

## Risk Assessment

- Unit test cũ `index.test.tsx` assert bảng cũ → sẽ fail tạm thời tới hết Phase 2 (đã lường trước, không block phase này).
- Quên xoá 1 tham chiếu `/assignments/bank` → TanStack Router build lỗi type trên `to=` literal; `check-types` sẽ bắt.

## Security Considerations

- `BankPreviewAside` phải giữ nguyên hành vi không lộ answer key ngoài nội dung dành cho giáo viên (đã có test riêng ở bank.test.tsx, được port ở Phase 2).

## Next Steps

- Phase 2: cập nhật unit test cho trang gộp.
