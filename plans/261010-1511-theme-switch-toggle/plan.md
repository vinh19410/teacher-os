---
title: "ThemeToggle: đổi nút sáng/tối thành switch icon mặt trời/mặt trăng"
description: "Thay nút pill (chấm tròn + chữ Tối/Sáng) bằng switch có núm trượt mang icon mặt trời/mặt trăng, role=switch, dùng chung cho web + student."
status: completed
priority: P3
effort: 1h
issue: 356
branch: feat/theme-switch-toggle
tags: [frontend, ui, theme, a11y]
blockedBy: []
blocks: []
created: 2026-10-10
---

# ThemeToggle dạng switch mặt trời/mặt trăng

## Overview

`ThemeToggle` ([theme-toggle.tsx](../../packages/ui/src/components/theme-toggle.tsx)) hiện là nút
pill `neu-sm` gồm một chấm tròn (cam khi tối, mực khi sáng) và chữ mono "Tối"/"Sáng". Nút này
được dùng ở 7 chỗ: topbar web
([topbar.tsx:214](../../apps/web/src/components/layout/topbar.tsx)), login web, shell student
([student-shell.tsx:35](../../apps/student/src/components/layout/student-shell.tsx)) và các trang
login, forgot-password, reset-password, verify-email của student.

Yêu cầu là đổi sang dạng switch có icon mặt trời/mặt trăng. Logic theme (`useTheme`, `/theme-init.js`,
`localStorage.theme`, đồng bộ giữa tab) **giữ nguyên**, chỉ đổi phần hiển thị và semantics ARIA
trong một file component, nên cả 7 chỗ dùng đổi theo mà không phải sửa call site.

## Quyết định đã chốt với user (2026-10-10)

| Câu hỏi | Lựa chọn |
|---|---|
| Kiểu switch | Track có cả hai icon (màu `text-meta`); núm tròn trượt và mang icon của theme hiện tại. Tối: núm bên phải, icon mặt trăng. Sáng: núm bên trái, icon mặt trời. |
| Nhãn chữ "Tối"/"Sáng" | Bỏ, chỉ còn icon. Tên cho screen reader đi qua `aria-label`. |
| Màu núm | Mực (`bg-fg`, icon `text-bg`). Không dùng cam, vì cam chỉ dành cho hành động/trạng thái cần chú ý. |

## Quyết định kỹ thuật

- **ARIA:** đổi từ "action button" (aria-label đổi theo đích đến) sang `role="switch"` với
  `aria-checked={theme === "dark"}` và `aria-label="Giao diện tối"` cố định. Hình thức giờ là
  switch nên semantics phải khớp: screen reader đọc "Giao diện tối, switch, bật/tắt". Comment
  docstring cũ ("not aria-pressed — this is an action button, not a switch") phải viết lại.
- Phần tử vẫn là `<button type="button">`, nên Enter và Space hoạt động sẵn.
- Icon dùng `Sun`/`Moon` của `lucide-react` (đã là dependency của `packages/ui`), `aria-hidden`.

## Outcome

- Ở cả 7 chỗ, nút theme hiện thành switch: track pill có viền mảnh, núm tròn màu mực trượt qua lại
  và mang icon của theme đang dùng.
- Bấm (chuột, Enter, Space) đổi theme như cũ; núm trượt 150ms theo `--ease-standard`, tắt animation
  khi `prefers-reduced-motion`.
- Screen reader đọc được trạng thái bật/tắt.

## Constraints

- Theo `DESIGN.md`: pill `rounded-full` được phép cho toggle; motion 150ms, chỉ animate
  transform/color; focus ring `--focus-ring`; không hard-code màu ngoài token.
- Kích thước không cao hơn control topbar hiện tại (`h-8`/`h-9`) để topbar 375px không vỡ.
- Không đổi API của component (`className?` vẫn giữ) để call site không phải sửa.

## Non-goals

- Không đổi `useTheme`, `lib/theme.ts`, `/theme-init.js`, cách lưu và đồng bộ theme.
- Không thêm chế độ "theo hệ thống" (system).
- Không đổi vị trí đặt toggle ở các layout.

## Phases

| # | Phase | Status | Effort |
|---|---|---|---|
| 1 | [Switch component + test + docs](phase-01-theme-switch.md) | pending | 1h |

## Acceptance criteria

- [ ] `ThemeToggle` render `<button role="switch" aria-checked aria-label="Giao diện tối">` với icon
      mặt trời/mặt trăng, không còn chữ "Tối"/"Sáng".
- [ ] Tối: núm bên phải mang icon mặt trăng; sáng: núm bên trái mang icon mặt trời. Núm `bg-fg`.
- [ ] Bấm đổi theme và `aria-checked` đổi theo; trạng thái giữ qua reload như trước.
- [ ] Có `motion-reduce:transition-none` và focus ring `--focus-ring` khi focus bằng bàn phím.
- [ ] Unit test mới cho `ThemeToggle` trong `apps/web/src/lib/theme.test.tsx` pass.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter student test` pass.
- [ ] Full e2e (`pnpm --filter e2e e2e` với port override) pass trước khi merge.
- [ ] Screenshot 3 viewport (1440×900, 768×1024, 375×812) ở cả hai theme cho topbar web và login
      student, kèm focus bàn phím, đính vào PR.
- [ ] `DESIGN.md` mục Theme mô tả toggle là switch icon.

## Rủi ro

- Thấp. Chỉ một component, không có e2e nào chọn toggle theo chữ "Tối"/"Sáng" hay aria-label cũ
  (đã grep `apps/e2e`, `tests`, các file test).

## Red Team Review

### Session — 2026-10-10
**Findings:** 9 unique (dedup từ 2 reviewer: Security Adversary + Assumption Destroyer) —
7 accepted, 1 rejected, 1 merged vào finding khác.
**Severity breakdown:** 0 Critical, 2 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Track `inline-flex` + icon in-flow không thể cho Sun trái/Moon phải (icon cụm flex-start); tâm icon chưa khớp tâm quỹ đạo núm | High | Accept | Phase 1 step 1 |
| 2 | "Tái dùng `beforeEach`" sai — beforeEach scoped trong `describe("useTheme")`, phải tự viết gồm installStorage + reset `className`; assert qua `getItem` (shim không có property access) | High | Accept | Phase 1 step 3 |
| 3 | RTL auto-cleanup không chạy (vitest không `globals: true`) → thiếu `afterEach(cleanup)` | Medium | Accept | Phase 1 step 3 |
| 4 | Token viền `neu-sm` là `var(--border)`, không phải `--line`; hook trả `{ theme, setTheme, toggle }` | Medium | Accept | Phase 1 Context |
| 5 | Núm thiếu spec vị trí dọc → thêm `inset-y-0 my-auto` tường minh | Medium | Accept (gộp #1) | Phase 1 step 1 |
| 6 | `pnpm check` là fix-mode — cần kiểm `git status` chỉ còn 3 file phạm vi sau khi chạy | Medium | Accept | Phase 1 step 5 |
| 7 | AC screen reader thiếu bước verify → unit test `aria-checked` là proxy đủ | Medium | Accept | Phase 1 step 3 |
| 8 | Đổi chỗ test sang `apps/web/src/components/ui/` theo convention | Medium | Reject | — |
| 9 | Hình học icon nền chưa có tiêu chí validate | Medium | Accept (gộp #1) | Phase 1 step 1 |

Rationale reject #8: issue #356 (quyết định đã chốt với user) ghi rõ đích test là
`apps/web/src/lib/theme.test.tsx`; đặt `describe("ThemeToggle")` riêng với setup độc lập
sửa triệt để rủi ro kỹ thuật của finding, không cần đổi vị trí file.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-theme-switch.md (sau khi áp 7 finding).
- Decision deltas checked: 4 (icon absolute + tâm icon 15/39px; núm `inset-y-0 my-auto`;
  test setup tự viết + `getItem`; verify note `pnpm check` fix-mode).
- Reconciled stale references: Context hook signature + token `--border` đã khớp step 1/3;
  AC plan.md không đổi (vẫn đúng sau edits).
- Unresolved contradictions: 0.
