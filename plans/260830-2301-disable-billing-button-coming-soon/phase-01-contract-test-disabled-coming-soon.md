---
title: "Contract test trước: khóa trạng thái disabled + Sắp ra mắt"
status: todo
priority: P1
effort: "20m"
dependencies: []
---

# Phase 1: Contract test trước: khóa trạng thái disabled + Sắp ra mắt

## Overview

Thêm assertion contract-test (source-parse style, không render React) khóa
trạng thái interim của nút "Quản lý thanh toán" trong settings route: disabled,
có nhãn "Sắp ra mắt" trong cùng card, và không có handler nào. Test phải ĐỎ
trước khi phase 2 implement (chạy local, lưu evidence — xem Implementation
Steps).

## Requirements

- Functional: `apps/web/src/lib/profile.contract.test.ts` thêm describe
  `billing button (interim — issue #138)` pin, với mọi assertion **scope vào
  block card "Gói dịch vụ"** chứ không toàn file (file còn chứa
  `to="/profile"` mà test cũ ở dòng 114 bắt buộc phải có):
  1. Capture card block: `/Gói dịch vụ[\s\S]*<\/Card>/` (từ SectionLabel
     đến thẻ đóng Card).
  2. Trong capture đó, capture attrs của đúng nút billing:
     `/<Button\b([^>]*)>\s*Quản lý thanh toán\s*<\/Button>/` rồi:
     - assert attrs match `/(^|\s)disabled(\s|=|$)/` — token `disabled`
       đứng độc lập (KHÔNG match `disabled:opacity-40` hay `aria-disabled`
       — theo sau `disabled` phải là whitespace/`=`/kết thúc).
     - assert attrs NOT match `/\bonClick\b|\bhref\b|\bto\s*=/` — chống
       wire handler giả trên chính nút này (nút khác trong file không sao).
  3. Trong card capture: assert match `/>\s*Sắp ra mắt\s*</` — "Sắp ra mắt"
     là text node render thật, không phải comment/aria-label/dead string.
- Comment đánh dấu vòng đời ngay trên describe mới:
  `// INTERIM (issue #138): delete/replace this block when the real billing
  portal lands (issue #138 — "Scope khi mở lại monetization")`.
- Non-functional: giữ nguyên assertion hiện có ("Gói dịch vụ", `unitPrice` —
  dòng 116-117); chỉ thêm, không sửa cũ.

## Architecture

Test source-parse hiện có của repo: `readFileSync` file route rồi
`expect(src).toMatch(regex)`. Không thêm dependency, không render React.
Regex scoping hai tầng (card → button attrs) là cơ chế chống cả false-positive
(substring `disabled:` trong className) lẫn false-negative (`to=` của Link
profile ở dòng 73 khiến negative toàn-file đỏ vĩnh viễn).

## Related Code Files

- Modify: `apps/web/src/lib/profile.contract.test.ts`

## Implementation Steps

1. Thêm describe/test mới theo Requirements.
2. Chạy `pnpm --filter web test -- --run profile.contract` → test mới phải
   ĐỎ (nút chưa disabled, chưa có "Sắp ra mắt"). **Lưu output làm evidence**
   trong file này (mục Success Criteria) — commit gộp test+impl trên PR nên
   CI không bao giờ thấy trạng thái đỏ; bằng chứng đỏ chỉ tồn tại local.
3. Commit: một commit duy nhất chứa cả test lẫn implementation (phase 2) —
   không push commit test-only đỏ lên CI.

## Success Criteria

- [x] Test mới tồn tại và fail (đỏ) trên code hiện tại — evidence local
      output ghi lại dưới đây
- [x] Các test cũ trong file vẫn pass (không sửa assertion cũ)
- Evidence (dán output đỏ): `pnpm --filter web test -- --run profile.contract`
  → `Tests 2 failed | 388 passed (390)` — 2 test mới của describe
  `billing button (interim — issue #138)` fail đúng lý do (nút chưa
  disabled / chưa có "Sắp ra mắt"), toàn bộ test cũ xanh. Implement dùng
  card-capture non-greedy `[\s\S]*?<\/Card>` (chốt sau red-team: an toàn
  hơn greedy khi file thêm card mới sau này).

## Risk Assessment

Regex quá chặt → false positive khi format lại JSX. Chỉ pin hành vi
(disabled + text node + không handler trên đúng nút), không pin thứ tự
attribute. Pattern `[^>]*` không chịu được attribute chứa `>` (ví dụ
`disabled={a > b}`) — chấp nhận được: markup hiện tại không có, và nếu ai
viết thế thì test đỏ chủ động báo hiệu markup bất thường trong đúng nút
đang được khóa.

## Todo

- [x] Viết test contract trạng thái interim (scoped capture)
- [x] Chạy test xác nhận đỏ + lưu evidence
