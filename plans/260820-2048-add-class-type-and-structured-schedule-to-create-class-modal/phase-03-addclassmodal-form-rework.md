---
phase: 3
title: "AddClassModal form rework"
status: todo
priority: P2
effort: "0.5d"
dependencies: [1, 2]
---

# Phase 3: AddClassModal form rework

## Overview

Làm lại form modal Tạo lớp mới: chọn loại lớp (chip IELTS/Giao tiếp), kỹ năng đa chọn điều kiện, lịch học chips T2–CN + time picker start/end với end mặc định = start + 90 phút. Cập nhật payload `data-actions.ts` + các test fixture hardcode.

## Requirements

- Functional: loại lớp mặc định "ielts"; IELTS hiện `ChipMulti` 4 kỹ năng (≥1 bắt buộc), Giao tiếp ẩn hoàn toàn field kỹ năng (submit `skills: []`); lịch học = 7 chip T2–CN (≥1 bắt buộc) + 2 `<Input type="time">`; đổi start mà end chưa bị sửa tay → end = start + 90 phút; end sửa tay được giữ nguyên; submit payload `{name, type, level, skills, mode, syllabusId, schedule: {days, start, end}, sessionsTotal, startDate}`.
- Non-functional: giữ nguyên pattern `useKernelFormSubmit` + `KernelSubmitNotice` (contract test parse source phụ thuộc); không thêm thư viện UI; lỗi validation tiếng Việt, hiện qua `Field error` / `role="alert"` như hiện tại.

## Architecture

```
ChipMulti<ClassType> {value:"ielts"|"communication", label:"IELTS"|"Giao tiếp"} ──▶ type
type==='ielts' ? ChipMulti<string>(skills, 4 option) : ẩn
ChipMulti<number>(dayNames index 0=T2 … 6=CN) ──▶ days: number[]
Input[type=time] start ──onChange──▶ !endTouched && setEnd(addMinutes(start, 90))
submit ──▶ run({type:"add-class", payload:{... , schedule:{days,start,end}}})
```

- `ChipMulti` (mới, `apps/web/src/components/ui/chip-multi.tsx`): **generic `ChipMulti<T extends string | number>`**, props `{options: {value: T; label: string}[], value: T[], onChange(next: T[])}` — toggle thêm/bớt, clone style từ `chip-filter.tsx` (aria: `role="group"` + `aria-pressed` per button). Dùng chung cho cả 3 picker: loại lớp (T=string, 2 option), kỹ năng (T=string, 4 option), ngày (T=number, value = index dayNames). KHÔNG dùng `ChipFilter` cho loại lớp — props của nó là `options: string[]` với value = label chuỗi hiển thị, sẽ gửi nhầm `"IELTS"` thay vì `"ielts"` lên wire (red-team).
- State modal: `classType`, `skills: string[]`, `days: number[]`, `startTime` (default `"19:00"`), `endTime` (default `"20:30"`), `endTouched: boolean`.
- Reset khi submit thành công / reconcile: name, skills, days, endTouched=false, start/end về default.
- Optimistic state: `data-store-reducer.ts:124-134` case `add-class` đang spread `...action.payload` vào `ClassGroup` — payload mới có `schedule` là object trong khi `ClassGroup.schedule` là string. Sửa: build row thủ công, map `schedule: JSON.stringify(action.payload.schedule)`, `type`, `skills` tường minh (không spread mù).

## Related Code Files

- Create: `apps/web/src/components/ui/chip-multi.tsx`
- Modify: `apps/web/src/components/modals/add-class-modal.tsx` (form fields + validation + payload)
- Modify: `apps/web/src/lib/data-actions.ts:21-33` (payload `add-class`: `type`, `skills`, `schedule` object)
- Modify: `apps/web/src/lib/data-store-reducer.ts:124-134` (case `add-class`: optimistic row map `schedule: JSON.stringify(...)`, `type`, `skills` — red-team F1)
- Modify: `apps/web/src/lib/repos/kernel.test.ts:317-332` (fixture "add-class posts the payload as-is" → payload mới)
- Modify: `apps/web/src/lib/data-store-reducer.test.ts:303-322` (fixture add-class + assert optimistic row có schedule JSON string)
- Verify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (parse source modal — giữ pattern để không vỡ)

## Implementation Steps

1. Viết `ChipMulti<T extends string | number>` theo style `ChipFilter` (kebab-case file, props như Architecture).
2. `data-actions.ts`: đổi payload `add-class` — `type: ClassType`, `skills: string[]`, `schedule: {days: number[]; start: string; end: string}`; import type từ contracts.
3. `data-store-reducer.ts`: sửa case `add-class` — build optimistic `ClassGroup` tường minh (bỏ spread payload): `schedule: JSON.stringify(action.payload.schedule)`, `type: action.payload.type`, `skills: action.payload.type === 'ielts' ? action.payload.skills : []`.
4. Modal: thay state cũ (`skill`, `schedule` string) bằng state mới; render `ChipMulti` loại lớp (2 option value/label), `ChipMulti` kỹ năng khi `type==='ielts'`, `ChipMulti` 7 ngày (value = index `dayNames`, kiểu number), 2 `Input type="time"`; bỏ Input free-text Lịch học và Select Kỹ năng cũ.
5. Logic end-time: `onChange` start → nếu `!endTouched` thì `setEndTime(addMinutes(next, 90))`; `onChange` end → `setEndTouched(true)`.
6. Validation trước submit (giữ `setError` hiện tại): name rỗng (có sẵn); `type==='ielts' && skills.length===0` → "Chọn ít nhất một kỹ năng."; `days.length===0` → "Chọn ít nhất một ngày học."; `start===end` → "Giờ kết thúc phải khác giờ bắt đầu." (state time luôn có default nên không cần nhánh "thiếu giờ"; `end < start` là overnight qua ngày hôm sau — hợp lệ, không chặn).
7. Submit: `run({type:"add-class", payload:{name: name.trim(), type: classType, level, skills: classType==='ielts' ? skills : [], mode, syllabusId, schedule:{days, start: startTime, end: endTime}, sessionsTotal, startDate}})`; reset theo Architecture khi thành công.
8. Cập nhật 2 fixture test web; chạy lại `kernel-runtime.contract.test.ts` — nếu assertion parse source vỡ do đổi cấu trúc form, cập nhật assertion pattern nhưng giữ nguyên tinh thần lock wiring.
9. Kiểm tra thủ công (dev server): tạo 2 lớp (IELTS 2 kỹ năng + Giao tiếp), kiểm tra list/detail hiển thị đúng kết quả Phase 2.

## Todo

- [ ] ChipMulti generic component
- [ ] data-actions.ts payload type
- [ ] data-store-reducer.ts optimistic row map
- [ ] Modal: loại lớp + kỹ năng điều kiện + days + time picker + end+90
- [ ] Validation + reset
- [ ] Fixture tests + contract test verify

## Success Criteria

- [ ] Chọn "Giao tiếp" → field kỹ năng biến mất, submit được không cần kỹ năng
- [ ] Chọn "IELTS" không chọn kỹ năng → block với thông báo lỗi
- [ ] Chọn start 19:00 lần đầu → end hiện 20:30 tự động; sửa end 21:00 rồi đổi start 18:00 → end giữ 21:00
- [ ] Payload POST đúng shape mới — `days` là mảng number (test assert `typeof days[0] === "number"`, đỏ-team F7), `type` là `"ielts"`, không phải label
- [ ] Optimistic row trong store có `schedule` là JSON string (không vỡ `formatSchedule`)
- [ ] Tạo lớp thành công, modal đóng, list refresh
- [ ] `pnpm check` / `pnpm test` / `pnpm check-types` / `pnpm build` pass toàn workspace

## Risk Assessment

- **`kernel-runtime.contract.test.ts` parse source modal** có thể match chuỗi cụ thể → vỡ khi đổi form. Tín hiệu: test fail sau bước 4. Phản ứng: đọc assertion, cập nhật pattern match tối thiểu — không weaken intent của test.
- **`data-store-reducer.ts` spread payload** (đã bắt bởi red-team): nếu implementer quên bước 3, typecheck đỏ ngay — không silently wrong, nhưng phải sửa đúng hướng `JSON.stringify`, không nới kiểu `ClassGroup.schedule`.
- **Lap trong Grid layout**: 7 chip ngày có thể tràn cột hẹp (`max-app:grid-cols-1`) — cho chip container `flex flex-wrap gap-2`.
