---
phase: 1
title: "BandSlider + GradeForm dùng slider"
status: pending
effort: "1.5h"
dependsOn: []
---

# Phase 01 — BandSlider + GradeForm dùng slider

## Context

- [grade-form.tsx](../../apps/web/src/components/grading/grade-form.tsx): state `scores: Record<string, string>`, `""` = chưa chọn; mỗi tiêu chí là `Field > Select` với `id="grade-${key}"`, 19 option từ `BAND_OPTIONS`.
- [field.tsx](../../apps/web/src/components/ui/field.tsx): `Field` clone child duy nhất và tiêm `id`, `aria-describedby`, `aria-invalid`. Component con phải forward các prop này xuống `<input>`.
- `formatBand`, `ieltsOverallBand`, `criteriaForSkill`, `criterionLabel` ở `@teacher-os/api/lib/ielts-band`.
- Token: `--fg` (mực, dùng cho selection theo `DESIGN.md`), `--meta`, `--focus-ring`. Motion 150ms.

## Files

| Path | Action | Change |
|------|--------|--------|
| `apps/web/src/components/grading/band-slider.tsx` | create | Component `BandSlider` (range 0–9 step 0.5, trạng thái chưa chọn, số hiển thị, vạch chia) |
| `apps/web/src/components/grading/grade-form.tsx` | modify | Dùng `BandSlider`, state `number \| null`, bỏ `BAND_OPTIONS` và import `Select` |

## Steps

1. Tạo `band-slider.tsx`:

   ```tsx
   export function BandSlider({ id, value, onChange, ...aria }: {
     id?: string;
     value: number | null;
     onChange(value: number): void;
     "aria-describedby"?: string;
     "aria-invalid"?: boolean;
   })
   ```

   - Render `<input type="range" min={0} max={9} step={0.5}>` với `id` và `aria` forward từ `Field`.
   - `value={value ?? 4.5}`: khi chưa chọn, thumb nằm giữa thanh làm placeholder.
   - `aria-valuetext={value === null ? "Chưa chấm" : formatBand(value)}`.
   - `data-unset={value === null || undefined}`; khi chưa chọn thì `opacity-40`, có transition opacity 150ms.
   - `onChange={(e) => onChange(Number(e.currentTarget.value))}`.
   - `onPointerUp={(e) => { if (value === null) onChange(Number(e.currentTarget.value)); }}`: bấm đúng vị trí placeholder không bắn `change`, nên commit ở đây.
   - Class: `w-full h-8 cursor-pointer accent-[var(--fg)] rounded-full focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`. Không custom pseudo-element thumb/track.
   - Bên phải thanh: `<span aria-hidden className="w-10 text-right font-mono text-lg tabular-nums">` hiện `—` hoặc `formatBand(value)`. Đặt `aria-hidden` vì screen reader đã đọc `aria-valuetext`.
   - Dưới thanh: dải vạch `0 1 … 9`, `aria-hidden`, `flex justify-between font-mono text-[10px] text-meta`, đệm ngang bằng nửa bề rộng thumb (khoảng `px-[7px]`) để số nằm thẳng dưới vị trí thumb. Chỉnh lại theo screenshot ở phase 02.
   - Layout: một `div` bọc dòng `[slider | số]`, dòng vạch chia đặt bên dưới, cùng bề rộng với slider (không tính cột số).

2. Sửa `grade-form.tsx`:
   - `useState<Record<string, number | null>>(() => Object.fromEntries(keys.map((k) => [k, initial?.scores[k] ?? null])))`.
   - `complete = keys.every((k) => scores[k] !== null)`; `values = keys.map((k) => scores[k] as number)`.
   - `onSave({ scores: Object.fromEntries(keys.map((k) => [k, scores[k] as number])), feedback })`.
   - Mỗi tiêu chí: `<Field label={criterionLabel(...)}><BandSlider id={`grade-${key}`} value={scores[key]} onChange={(v) => setScores((p) => ({ ...p, [key]: v }))} /></Field>`.
   - Xoá `BAND_OPTIONS` và import `Select`. Cập nhật JSDoc: nói rõ là slider, chưa chọn thì `null`.

## Validation

- `pnpm --filter web check-types` (hoặc `pnpm check-types`) xanh.
- Chạy `pnpm --filter web test -- grade-form`: các test chọn điểm bằng `fireEvent.change` vẫn chạy (range nhận `change` giống select). Test kiểm `select.value` sẽ đỏ cho tới khi phase 02 sửa.

## Risk / Rollback

- Chỉ đụng 2 file web. Rollback bằng revert commit; không có migration hay thay đổi contract.
