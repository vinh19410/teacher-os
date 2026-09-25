---
title: "Phase 2: Update-Unit-Tests"
status: todo
---

# Phase 2: Update-Unit-Tests

## Context Links

- Test trang gộp: `apps/web/src/routes/_auth/assignments/index.test.tsx` (hiện test bảng cũ, Issue #166)
- Test bank bị xoá: `apps/web/src/routes/_auth/assignments/bank.test.tsx` (#218 v5) — các case được port sang index.test.tsx
- Test matcher: `apps/web/src/routes-matcher.test.ts`

## Overview

- **Priority**: P1
- **Status**: todo
- Viết lại unit test của `AssignmentsRoute` theo trang gộp (fixture prompts từ bank.test.tsx),
  xoá `bank.test.tsx`, cập nhật `routes-matcher.test.ts`. Tái lập trạng thái xanh cho
  `pnpm --filter web test` sau khi Phase 1 làm test cũ fail tạm thời.

## Key Insights

- `index.test.tsx` render qua `renderToStaticMarkup` + mock `@tanstack/react-router`
  (`createFileRoute`, `useNavigate` → `mockNavigate`, `Link`) + mock `@/lib/data-store` — giữ nguyên pattern.
- Fixture `bankFixture` trong bank.test.tsx gồm 4 prompts (draft/used/ready/reading) + `ClassAssignment`
  để test trạng thái "Đã dùng N lớp" — port nguyên fixture.
- 4 case bank.test.tsx hiện có: render list + preview aside, preview KHÔNG lộ answer key,
  filter theo kỹ năng, count "Đang hiện X / Y". Tất cả phải sống sót sau khi port.
- Mock data-store mới cần `assignmentPrompts` + `classAssignments`; không cần `students`/`assignments`.

## Requirements

- [ ] `index.test.tsx` phủ: empty state, CTA navigate, render list + StatusTag, preview không lộ answer key, filter kỹ năng, count
- [ ] `bank.test.tsx` bị xoá (không còn import `AssignmentBankPage`)
- [ ] `routes-matcher.test.ts` không còn assert `"/assignments/bank"` là valid exact route
- [ ] `pnpm --filter web test` pass

## Architecture

Không đổi kiến trúc. Chỉ thay đổi test files.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/assignments/index.test.tsx` — viết lại toàn bộ
- Delete: `apps/web/src/routes/_auth/assignments/bank.test.tsx`
- Modify: `apps/web/src/routes-matcher.test.ts` — bỏ/kép assertion cho `/assignments/bank`

## Implementation Steps

1. Trong `index.test.tsx`: thay mock data-store bằng `{ assignmentPrompts: bankFixture, classAssignments: [...] }`; xoá helper `createStudent` và type `Assignment` không còn dùng.
2. Port 4 case từ `bank.test.tsx` (render + preview, answer key ẩn, filter kỹ năng, count) — đổi import component sang `AssignmentsRoute` từ `./index`.
3. Thêm 2 case mới: (a) 0 prompts → heading "Chưa có bài tập nào" + nút "Tạo bài tập đầu tiên"; (b) click `+ Tạo bài tập` → `mockNavigate` gọi với `to: "/assignments/new"`.
4. Xoá `bank.test.tsx`.
5. Mở `routes-matcher.test.ts`, cập nhật case liên quan `/assignments/bank` theo `VALID_EXACT_ROUTES` mới (entry exact đã xoá; lưu ý `VALID_DYNAMIC_PREFIXES` vẫn match `/assignments/<1-segment>`).
6. Chạy `pnpm --filter web test`, sửa tới khi xanh.

## Todo

- [ ] Viết lại `index.test.tsx` (6 case như trên)
- [ ] Xoá `bank.test.tsx`
- [ ] Cập nhật `routes-matcher.test.ts`
- [ ] `pnpm --filter web test` pass

## Success Criteria

- `pnpm --filter web test` exit 0, không còn test nào import `./bank`
- Không mất case test nào khi port: mọi case của bank.test.tsx cũ đều có case tương ứng mới trong index.test.tsx

### Verification
```bash
pnpm --filter web test
grep -rn "from \"./bank\"" apps/web/src | grep -v routeTree.gen
```

## Risk Assessment

- Test dùng `renderToStaticMarkup` (không có event) — case click CTA phải assert qua mock `useNavigate` giống pattern case #166 cũ; nếu cần fireEvent thì theo pattern của test khác trong apps/web.

## Security Considerations

- Case "preview không lộ answer key" là ràng buộc bảo mật nội dung đề — không được bỏ khi port.

## Next Steps

- Phase 3: cập nhật e2e + verify toàn diện.
