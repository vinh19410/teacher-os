---
phase: 2
title: "Web read and display layer"
status: todo
priority: P2
effort: "0.5d"
dependencies: [1]
---

# Phase 2: Web read and display layer

## Overview

Cập nhật display shape + read mapping của web cho `type`/`skills`/schedule có cấu trúc, thêm helper `formatSchedule` (fallback legacy free-text), sửa hiển thị ở classes list và class detail theo loại lớp.

## Requirements

- Functional: `ClassGroup` có `type: ClassType` + `skills: string[]`; `mapClasses` map từ `KernelClassRow`; danh sách lớp hiển thị tag loại lớp (IELTS/Giao tiếp), meta kỹ năng chỉ hiện khi IELTS và không rỗng (join ", "); schedule render "T2 & T5 · 19:00–20:30" khi là JSON mới, nguyên văn chuỗi cũ khi legacy.
- Non-functional: helper thuần (pure) dễ unit test; không kéo dependency mới.

## Architecture

```
KernelClassRow.skills: string[] ──mapClasses──▶ ClassGroup { type, skills, schedule(raw) }
ClassGroup.schedule ──formatSchedule──▶ "T2 & T5 · 19:00–20:30" | legacy raw string
```

- `apps/web/src/lib/format-schedule.ts` (mới): `parseSchedule(raw): {days,start,end} | null` (try JSON.parse + shape check) và `formatSchedule(raw): string` — JSON mới: join `dayNames[day]` bằng " & " + " · " + `start–end` (en-dash); parse fail → trả nguyên `raw`. Export kèm `addMinutes(hhmm, 90): string` (Phase 3 tái dùng; modulo 24h khi vượt nửa đêm, vd 23:00+90 → 00:30).
- `dayNames` import từ `mock-data.ts` (không duplicate).

## Related Code Files

- Modify: `apps/web/src/lib/mock-data.ts` (`ClassGroup`: `skill: string` → `type: ClassType` + `skills: string[]` — file này CHỈ chứa interface + helpers, không có seed)
- Modify: `apps/web/test/fixtures/mock-data.ts` (`seedData: MockData` — seed class thật nằm ở đây, đang có `skill: ""`/`schedule: ""` ở ~136,151; cập nhật theo shape mới)
- Modify: `apps/web/src/lib/repos/kernel.test.ts:15,35-50` (fixture `const snapshot: KernelSnapshot` có class `skill: "Writing"` — bắt buộc sửa cùng lúc đổi `KernelClassRow`, nếu không typecheck web đỏ ngay Phase 1)
- Create: `apps/web/src/lib/format-schedule.ts`
- Create: `apps/web/src/lib/format-schedule.test.ts`
- Modify: `apps/web/src/lib/repos/classes.ts:20-51` (`mapClasses`: `type: row.type`, `skills: row.skills`)
- Modify: `apps/web/src/lib/repos/classes.test.ts` (fixture + case mới)
- Modify: `apps/web/src/routes/_auth/classes/index.tsx:67,89-91` (meta + cột Lịch)
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx:76,79` (header + dòng Lịch)

## Implementation Steps

1. `src/lib/mock-data.ts`: đổi interface `ClassGroup` (`type`, `skills: string[]` thay `skill`); import `ClassType` từ `@teacher-os/api/contracts`. Đồng thời sửa `apps/web/test/fixtures/mock-data.ts`: seed classes (lớp mock Giao tiếp → `type:"communication", skills:[]`; lớp IELTS → mảng skills; `schedule` seed = `'{"days":[1,3],"start":"19:00","end":"20:30"}'`); và sửa fixture snapshot `repos/kernel.test.ts:35-50` (class row đổi `skill` → `type`+`skills`).
2. Viết `format-schedule.ts` + unit test: JSON hợp lệ, JSON sai shape, chuỗi legacy "T3 & T5 · 19:00–20:30", `addMinutes` (thường + wrap nửa đêm).
3. `mapClasses`: map 2 field mới; xóa field `skill`.
4. `classes/index.tsx`: card meta từ `[c.level, c.skills.join(", "), c.mode].filter(Boolean).join(" · ")` (communication tự rỗng); thêm tag loại lớp dùng `Tag` component ("IELTS" / "Giao tiếp"); cột Lịch dùng `formatSchedule(c.schedule)`.
5. `$classId.tsx`: header tương tự (tag loại lớp + meta); dòng `Lịch:` dùng `formatSchedule`.
6. `classes.test.ts`: fixture row có `type`/`skills`; assert map đúng; case communication `skills: []`.

## Todo

- [ ] ClassGroup interface (src/lib/mock-data.ts) + seedData (test/fixtures/mock-data.ts) + snapshot fixture kernel.test.ts:35-50
- [ ] format-schedule.ts + tests (parse, format, addMinutes, wrap)
- [ ] mapClasses + classes.test.ts
- [ ] classes/index.tsx + $classId.tsx display

## Success Criteria

- [ ] Class IELTS nhiều kỹ năng hiển thị "Band 7.0 · Writing, Speaking · Online"; class Giao tiếp hiển thị "Giao tiếp" tag, không có kỹ năng trong meta
- [ ] Class tạo trước migration (schedule free-text) hiển thị nguyên chuỗi cũ
- [ ] Class JSON mới hiển thị "T2 & T5 · 19:00–20:30"
- [ ] `pnpm --filter web check-types` + `pnpm --filter web test` pass (kể cả format-schedule.test.ts mới và 3 fixture đã sửa)

## Risk Assessment

- **Quên một call-site hiển thị `skill`** → runtime undefined không lỗi type (template string). Tín hiệu: hiển thị "undefined" trên UI. Phòng: grep `\.skill\b` toàn `apps/web/src` sau khi đổi type — compiler sẽ bắt hầu hết vì `ClassGroup` đổi shape; checklist gồm 2 display file đã biết.
- **Seducing scope**: display detail có tab "Lịch học" render từ `data.lessons` (không dùng `class.schedule`) — KHÔNG đụng vào (ngoài scope).
