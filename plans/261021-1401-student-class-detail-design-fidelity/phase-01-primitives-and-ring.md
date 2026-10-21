---
phase: 1
title: "Primitive Tabs/Badge/Avatar cho student + sửa Ring"
status: completed
effort: "1.5h"
dependencies: []
---

# Phase 1: Primitive và Ring

<!-- Updated: Validation & Red Team Session 1 - Handover task decomposition + Failure Protocol -->

## Goal

Cung cấp bộ primitive chuẩn design v2 (`Tabs`, `Badge`, `AvatarInitials`) cho `apps/student`, sửa token/class xung đột của `RingStat` và `TeacherAvatar`, và kiểm chứng bằng unit test riêng.

## Files

- Create: `apps/student/src/components/ui/tabs.tsx`
- Create: `apps/student/src/components/ui/badge.tsx`
- Create: `apps/student/src/components/ui/avatar-initials.tsx`
- Modify: `apps/student/src/components/class/ring-stat.tsx`
- Modify: `apps/student/src/components/class/teacher-avatar.tsx`
- Create: `apps/student/test/class-primitives.test.tsx`

## Tasks

### Task 1.1 — Tạo primitive `Tabs`, `Badge`, `AvatarInitials` cho `apps/student`
- **Goal:** Tạo 3 component UI chuẩn design v2 trong `apps/student/src/components/ui/`.
- **Target files and symbols:**
  - `apps/student/src/components/ui/tabs.tsx` (`Tabs`, `TabsProps`)
  - `apps/student/src/components/ui/badge.tsx` (`Badge`, `BadgeProps`, `BadgeVariant`)
  - `apps/student/src/components/ui/avatar-initials.tsx` (`AvatarInitials`, `AvatarInitialsProps`)
- **Steps:**
  1. Tạo `apps/student/src/components/ui/tabs.tsx` dựa trên `apps/web/src/components/ui/tabs.tsx`: nhận `{ tabs: readonly { id: string; label: string }[]; active: string; onChange: (id: string) => void; ariaLabel?: string; testIdPrefix?: string; className?: string }`. Render `div[role="tablist"]` với `aria-label={ariaLabel}` và class `"no-scrollbar mb-6 inline-flex h-9 max-w-full items-center overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground"`. Mỗi nút `button[type="button"][role="tab"]` có `aria-selected={t.id === active}`, `data-testid={testIdPrefix ? `${testIdPrefix}-${t.id}` : undefined}`, và class active `"bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"`.
  2. Tạo `apps/student/src/components/ui/badge.tsx` chỉ gồm 4 variant v2 `default | secondary | outline | destructive` (+ prop `dot?: boolean`), không mang alias v1. Class cơ sở: `"inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-xs"`.
  3. Tạo `apps/student/src/components/ui/avatar-initials.tsx` theo `Avatar` của design v2: `<span aria-hidden="true" className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground text-xs", className)}>{initials}</span>` (không thêm khoảng trắng quanh `{initials}` để giữ `textContent === "HHoa"` trong `classmates-tab.test.tsx`).
- **Success criteria:** Cả 3 file tồn tại, compile sạch, không dùng token v1.
- **Verify:** no verification needed (được kiểm chứng trực tiếp ở Task 1.3).

### Task 1.2 — Sửa token SVG và dọn class xung đột trong `RingStat` & `TeacherAvatar`
- **Goal:** Xoá bỏ token không tồn tại (`stroke-surface`, `stroke-hot`) và class bo góc xung đột (`rounded-lg rounded-xl`, `rounded-full rounded-md`).
- **Target files and symbols:**
  - `apps/student/src/components/class/ring-stat.tsx` (`RingStat`)
  - `apps/student/src/components/class/teacher-avatar.tsx` (`TeacherAvatar`)
- **Steps:**
  1. Trong `apps/student/src/components/class/ring-stat.tsx`: đổi container sang `"flex flex-col items-center rounded-xl border bg-card p-5 text-center text-card-foreground shadow-sm"` (bỏ `rounded-lg` thừa); đổi vòng tròn track từ `stroke-surface` sang `stroke-muted`; đổi vòng tròn tiến độ từ `stroke-hot` sang `stroke-primary`.
  2. Trong `apps/student/src/components/class/teacher-avatar.tsx`: đổi fallback `<span>` từ `rounded-full rounded-md` sang `rounded-full`.
- **Success criteria:** Grep `stroke-surface|stroke-hot|rounded-lg rounded-xl|rounded-full rounded-md` trong `ring-stat.tsx` và `teacher-avatar.tsx` trả về rỗng.
- **Verify:** no verification needed (được kiểm chứng trực tiếp ở Task 1.3).

### Task 1.3 — Viết unit test `class-primitives.test.tsx` và chạy kiểm chứng Phase 1
- **Goal:** Kiểm chứng `Tabs`, `Badge`, `AvatarInitials`, và `RingStat` bằng unit test.
- **Target files and symbols:**
  - `apps/student/test/class-primitives.test.tsx`
- **Steps:**
  1. Tạo `apps/student/test/class-primitives.test.tsx` kiểm tra:
     - `Tabs`: render `role="tablist"` với `aria-label`, các nút `role="tab"` có `aria-selected` và `data-testid` đúng, click tab gọi `onChange(id)`.
     - `Badge`: render đủ 4 variant (`default`, `secondary`, `outline`, `destructive`) và chấm `dot`.
     - `AvatarInitials`: render chữ tắt trong `rounded-full bg-muted size-8` với `aria-hidden="true"`.
     - `RingStat`: render `stroke-muted` và `stroke-primary`, không chứa `stroke-surface` hay `stroke-hot`, xử lý `max={0}` không sinh `NaN`.
  2. Chạy `pnpm --filter student test -- class-primitives`.
- **Success criteria:** Toàn bộ test trong `class-primitives.test.tsx` pass.
- **Verify:** `pnpm --filter student test -- class-primitives` exits 0 and prints `passed`.

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
