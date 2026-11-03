---
title: "#544: Nút Thêm học viên dư dấu +"
description: "Bỏ ký tự + thừa trong nhãn nút Thêm học viên ở trang Học viên, giữ icon Plus, cập nhật test."
status: pending
priority: P3
effort: 0.5h
issue: 544
branch: fix/544-student-add-button-double-plus
tags: [frontend, ui, bug]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #544 — Nút "Thêm học viên" dư dấu +

## Outcome

Nút primary "Thêm học viên" ở `/students` chỉ có một dấu `+` (icon `Plus`), nhãn đọc là "Thêm học viên", giống cách nút "Mời học viên" dùng icon + nhãn thuần.

## Nguyên nhân (đã scout)

`apps/web/src/routes/_auth/students/index.tsx` render `<Plus className="h-4 w-4" />+ Thêm học viên` ở 2 chỗ (header `PageHead` dòng ~84 và empty state dòng ~130): icon `Plus` cộng ký tự `+` trong nhãn nên hiện "+ + Thêm học viên". Accessible name cũng thành "+ Thêm học viên", nên test dùng regex `/\+ Thêm học viên/`.

## Hướng sửa

Giữ icon, bỏ ký tự `+` trong nhãn ở cả 2 nút; đổi regex trong test sang `/Thêm học viên/` (anchor `^` nếu cần để không trùng "Thêm học viên vào lớp", nhưng trang này không có nút đó).

## Non-goals

- Không đổi nút "+ Thêm học viên vào lớp" ở `classes/$classId.tsx` (không có icon, `+` là dấu duy nhất; e2e nhiều spec dựa vào tên này).
- Không đổi API/variant của `Button`, không sửa modal.

## Acceptance criteria

1. Cả 2 nút ở `/students` (header và empty state) chỉ hiện một dấu `+`.
2. `students/index.test.tsx` pass với tên nút mới; e2e không còn selector `+ Thêm học viên` cho trang này (đã grep: không có).
3. Biome, check-types, test web pass; screenshot 3 viewport trong PR.

Chi tiết: [phase-01-remove-duplicate-plus.md](phase-01-remove-duplicate-plus.md)
