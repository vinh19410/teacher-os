---
title: "Phase 2: Update-Unit-Tests"
status: done
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
  `renderToStaticMarkup` KHÔNG gắn event handler → mọi case là assertion tĩnh trên chuỗi HTML;
  KHÔNG viết được case click/navigate (vitest env `node`, `vitest.config.ts:20`; không có pattern
  fireEvent/@testing-library nào trong apps/web).
- Fixture `bankFixture` trong bank.test.tsx gồm 4 prompts (draft/used/ready/reading) + `ClassAssignment`
  để test trạng thái "Đã dùng N lớp" — port nguyên fixture.
- 4 case bank.test.tsx thực tế (`bank.test.tsx:115-173`): (1) structure/copy + count (:115),
  (2) priority StatusTag draft > used > ready (:135), (3) preview KHÔNG lộ answer key (:147),
  (4) empty state (:162). KHÔNG có case "filter theo kỹ năng". Case 1 và 4 assert copy cũ
  ("Ngân hàng bài tập", "Tạo đề mới", "Chưa có đề nào trong ngân hàng") mà Phase 1 đã đổi
  → port kèm viết lại assertion theo copy mới; case 2 và 3 port nguyên assertion.
- `kernel-runtime.contract.test.ts` (test #106, :471-475) đọc TRỰC TIẾP source `index.tsx` và assert
  `${data.assignments.length} bài tập` + `${pendingCount} cần xử lý` — Phase 1 xoá cả hai → bắt buộc
  cập nhật khối #106 trong phase này, nếu không `pnpm --filter web test` không thể xanh.
- Mock data-store mới cần `assignmentPrompts` + `classAssignments`; không cần `students`/`assignments`.

## Requirements

- [x] `index.test.tsx` phủ (assertion tĩnh trên HTML): empty state mới, CTA render đúng label `+ Tạo bài tập`, render list + StatusTag, preview không lộ answer key, filter UI (search input + chips) render, count
- [x] `bank.test.tsx` bị xoá (không còn import `AssignmentBankPage`)
- [x] `routes-matcher.test.ts` bỏ entry `"/assignments/bank"` khỏi `validStaticRoutes` (không thêm assertion phủ định — dynamic prefix `/assignments/` vẫn match)
- [x] `kernel-runtime.contract.test.ts` khối #106 assignments assert trang gộp derive từ `data.assignmentPrompts` (không còn `data.assignments`/`pendingCount`)
- [x] `pnpm --filter web test` pass

## Architecture

Không đổi kiến trúc. Chỉ thay đổi test files.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/assignments/index.test.tsx` — viết lại toàn bộ
- Delete: `apps/web/src/routes/_auth/assignments/bank.test.tsx`
- Modify: `apps/web/src/routes-matcher.test.ts` — bỏ entry `"/assignments/bank"` khỏi `validStaticRoutes` (:27)
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` — cập nhật khối #106 (:471-475) cho trang gộp

## Implementation Steps

1. Trong `index.test.tsx`: thay mock data-store bằng `{ assignmentPrompts: bankFixture, classAssignments: [...] }`; xoá helper `createStudent` và type `Assignment` không còn dùng.
2. Viết lại 6 case theo bảng mapping (case cũ → case mới):
   - M1 (bank case 1, :115) structure/copy + count — assert copy MỚI: heading "Bài tập", CTA "+ Tạo bài tập", count "Đang hiện X / Y đề".
   - M2 (bank case 2, :135) StatusTag priority draft > used > ready — port nguyên assertion.
   - M3 (bank case 3, :147) preview không lộ answer key — port nguyên assertion.
   - M4 (bank case 4, :162) empty state — assert heading "Chưa có bài tập nào" + nút "Tạo bài tập đầu tiên".
   - M5 (mới) filter UI render: search input + ChipFilter kỹ năng + ChipFilter phần thi xuất hiện trong HTML (assertion tĩnh; hành vi filter tương tác do e2e `assignment-bank.spec.ts` phủ).
   - M6 (thay cho case click) CTA render đúng label "+ Tạo bài tập" (pattern case #166 cũ `index.test.tsx:135-138`) — KHÔNG assert navigate vì renderToStaticMarkup không fire event.
3. Xoá `bank.test.tsx`.
4. Mở `routes-matcher.test.ts`: bỏ `"/assignments/bank"` khỏi `validStaticRoutes` (:27); không thêm assertion phủ định (lưu ý `VALID_DYNAMIC_PREFIXES` vẫn match `/assignments/<1-segment>`).
5. Mở `kernel-runtime.contract.test.ts` khối #106 (:471-475): thay 2 `toMatch` của assignments (`${data.assignments.length} bài tập`, `${pendingCount} cần xử lý`) bằng assertion khớp trang gộp — source derive từ `data.assignmentPrompts` (ví dụ count "Đang hiện … đề"); chốt chuỗi regex chính xác theo JSX đã port ở Phase 1, giữ tinh thần anti-hardcode #106.
6. Chạy `pnpm --filter web test`, sửa tới khi xanh.

## Todo

- [x] Viết lại `index.test.tsx` (6 case như trên)
- [x] Xoá `bank.test.tsx`
- [x] Cập nhật `routes-matcher.test.ts`
- [x] `pnpm --filter web test` pass

## Success Criteria

- `pnpm --filter web test` exit 0, không còn test nào import `./bank`
- Mapping case đầy đủ: bank case 1/4 port kèm copy mới (M1, M4), case 2/3 port nguyên (M2, M3), 2 case mới (M5 filter UI render, M6 CTA label); empty-state #166 cũ (testid `assignments-empty-state` + CTA "Quản lý lớp học/học viên") bị thay thế có chủ đích bởi empty state mới của trang gộp (Red Team Review plan.md, finding 10)

### Verification
```bash
pnpm --filter web test
grep -rn "from \"./bank\"" apps/web/src | grep -v routeTree.gen
```

## Risk Assessment

- Test dùng `renderToStaticMarkup` (vitest env `node`, `vitest.config.ts:20`) — không fire event, không có pattern fireEvent/@testing-library nào trong apps/web. Mọi case là assertion tĩnh trên HTML; navigate/filter tương tác do e2e phủ.

## Security Considerations

- Case "preview không lộ answer key" là ràng buộc bảo mật nội dung đề — không được bỏ khi port.

## Next Steps

- Phase 3: cập nhật e2e + verify toàn diện.
