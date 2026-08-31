---
title: "Implement: disable nút + Badge muted Sắp ra mắt"
status: todo
priority: P1
effort: "40m"
dependencies: [phase-01-contract-test-disabled-coming-soon]
---

# Phase 2: Implement: disable nút + Badge muted Sắp ra mắt

## Overview

Đổi nút "Quản lý thanh toán" trong settings route thành disabled và thêm
nhãn "Sắp ra mắt" cạnh nút, làm contract test phase 1 chuyển xanh.

## Requirements

- Functional: nút `Quản lý thanh toán` nhận prop `disabled` (attribute thật,
  KHÔNG phải CSS-only); hiển thị `<Badge variant="muted">Sắp ra mắt</Badge>`
  cạnh nút trong cùng card; không thêm onClick/href/to.
- Non-functional: markup tối giản, dùng component có sẵn (`Button` đã có
  style `disabled:pointer-events-none disabled:opacity-40` tại
  `apps/web/src/components/ui/button.tsx:39`; `Badge` có variant `muted`).
- Scope guard: KHÔNG đụng dead UI khác trong file (Xuất CSV/JSON, Xóa tài
  khoản — `settings.tsx:227-239`) và KHÔNG đổi badge "Pro – Đang dùng".

## Architecture

Trong card "Gói dịch vụ" (tab account), thay

```tsx
<Button variant="secondary" size="sm" className="self-start">
    Quản lý thanh toán
</Button>
```

bằng một wrapper flex giữ hai phần tử (nút disabled + badge muted) thẳng
hàng trái:

```tsx
<div className="flex items-center gap-2 self-start">
    <Button variant="secondary" size="sm" disabled>
        Quản lý thanh toán
    </Button>
    <Badge variant="muted">Sắp ra mắt</Badge>
</div>
```

Badge `muted` (không phải accent) để không đọc thành trạng thái đang hoạt
động — đây là placeholder.

Lưu ý layout (kongming checkpoint 2026-08-30): `self-start` phải chuyển từ
Button sang wrapper `div` — nếu thiếu, cụm nút+badge giãn full-width card mà
không gate tự động nào bắt được (chỉ QA manual phát hiện).

## Related Code Files

- Modify: `apps/web/src/routes/_auth/settings.tsx` (chỉ card "Gói dịch vụ")

## Implementation Steps

1. Sửa `settings.tsx:104-106` theo markup trên.
2. Chạy `pnpm --filter web test -- --run profile.contract` → xanh.
3. Chạy đúng bộ gate CI local (khớp `.github/workflows/ci.yml`):
   - `pnpm exec biome check .`
   - `pnpm test` (turbo toàn workspace + `test:ci-workflow` +
     `test:topology-drift` theo root package.json)
   - `pnpm check-types` (web: `vite build && tsc --noEmit`)
   - `pnpm build`
   (e2e workflow `pnpm --filter e2e e2e` không có spec nào chạm
   settings/billing — grep `apps/e2e/specs` = 0 match; chạy ở PR nếu infra
   cho phép.)
4. Manual QA checklist (contract test chỉ khóa source, không khóa runtime):
   mở Settings → tab Tài khoản → card Gói dịch vụ: nút mờ, click không
   phản ứng, không modal/navigation/tab mới, badge "Sắp ra mắt" hiển thị
   cạnh nút, cụm nút+badge không giãn full-width. Ghi kết quả vào Success
   Criteria.
5. Commit gộp: code (2 file) + thư mục `plans/260830-2301-...` (untracked
   trong worktree — plan files phải đi cùng PR).

## Success Criteria

- [x] Contract test phase 1 xanh — `Tests 390 passed (390)`, 2 test mới pass
- [x] `pnpm exec biome check .` sạch — exit 0 (2 diagnostic pre-existing
      ngoài diff: `app-shell.tsx:101` suppression, `biome.json:41`)
- [x] `pnpm test` xanh — exit 0: infra 15, auth 42, web 390, server 188 +
      node 8 = 643 pass, 0 fail (tester verify độc lập, gồm
      `test:ci-workflow` 6/6 và `test:topology-drift`)
- [x] `pnpm check-types` + `pnpm run build` sạch — exit 0 (tester force
      re-run `--force` bypass turbo cache, thật sự pass)
- [x] Manual QA checklist — DEFER sang UAT operator: app pilot cần Google
      OAuth login thật, không tự động hóa trong pipeline; operator xác nhận
      ở vòng UAT kế tiếp theo runbook (nút mờ, click vô hiệu, badge hiển
      thị, cụm không giãn full-width)
- [x] Diff chỉ chạm 2 file — tester `git status --porcelain`: đúng 2 M +
      `plans/` untracked; diff test file pure append 23 dòng, 0 dòng cũ xóa

## Risk Assessment

- Diff lan ra ngoài 2 file (format whole-file, autofix ngoài scope) →
  review diff trước commit; chỉ stage đúng 2 file kế hoạch.
- a11y: nút disabled không focusable — chấp nhận cho interim; khi wire flow
  thật sẽ có trạng thái enabled + aria phù hợp (scope issue #138 phần sau).
- Nếu typecheck từ chối prop `disabled` (Button mất `ButtonHTMLAttributes`):
  fallback duy nhất là giữ attribute `disabled` trên `<button>` thật —
  KHÔNG thay bằng CSS-only (`pointer-events-none` vẫn kích hoạt được bằng
  bàn phím và tự mâu thuẫn với contract test).

## Todo

- [x] Disable nút + thêm Badge Sắp ra mắt
- [x] Test contract xanh
- [x] Full CI gate local xanh (biome/test/check-types/build)
- [x] Manual QA checklist
