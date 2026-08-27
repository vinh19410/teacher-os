---
phase: 4
title: "AddSyllabusModal UI"
status: pending
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: AddSyllabusModal UI

## Overview

Refactor `add-syllabus-modal.tsx` để mirror UX của `add-class-modal.tsx`: thêm chip `Loại lớp` (ielts/communication) trước chip `Kỹ năng` (multi ChipMulti). Communication ẩn field kỹ năng, ielts require ≥1 skill. Validation client song song với contract `superRefine` của Phase 2.

## Requirements

- Functional: chip "Loại lớp" (ChipMulti single-select pattern như AddClassModal L155-164) hiển thị trước chip "Kỹ năng"
- Functional: `classType === "communication"` → ẩn "Kỹ năng", submit với `skills=[]`
- Functional: `classType === "ielts"` → hiện "Kỹ năng" (ChipMulti multi), validation client "Chọn ít nhất một kỹ năng"
- Functional: field `level` dùng `Select` giữ nguyên (nhưng mặc định `"Band 7.0"` cho khớp add-class); label / thứ tự khớp mental model add-class
- Non-functional: UX responsive `max-app:grid-cols-1` giữ nguyên

## Architecture

Bố cục field mirror AddClassModal theo thứ tự:
1. Tên syllabus *
2. Loại lớp (ChipMulti single-choice)
3. Grid 2 cột: Trình độ | (không có Hình thức — syllabus không có mode)
4. Kỹ năng (ChipMulti multi) — chỉ khi `classType === "ielts"`
5. Mô tả
6. Số buổi dự kiến

Reset form: `name=""`, `description=""`, `skills=[]`. Không reset `classType`, `level`, `total` (giữ default cho next entry) — theo pattern add-class `resetForm`.

## Related Code Files

- Modify: `apps/web/src/components/modals/add-syllabus-modal.tsx`
- Reference (không sửa): `apps/web/src/components/modals/add-class-modal.tsx` (mẫu UX)

## Implementation Steps

1. Import bổ sung:
   ```ts
   import { CLASS_TYPES, type ClassType, IELTS_SKILLS } from "@teacher-os/api/contracts";
   import { ChipMulti } from "@/components/ui/chip-multi";
   import { CLASS_TYPE_LABELS } from "@/lib/mock-data";
   ```
2. Thêm constants đầu file (bên ngoài component):
   ```ts
   const CLASS_TYPE_OPTIONS = CLASS_TYPES.map((v) => ({ value: v, label: CLASS_TYPE_LABELS[v] }));
   const SKILL_OPTIONS = IELTS_SKILLS.map((v) => ({ value: v, label: v }));
   ```
3. State thay đổi:
   - Xóa: `const [skill, setSkill] = useState("Writing")`
   - Thêm: `const [classType, setClassType] = useState<ClassType>("ielts")`
   - Thêm: `const [skills, setSkills] = useState<string[]>([])`
4. Handler `submit` validation:
   ```ts
   if (!name.trim()) { setError("Vui lòng nhập tên syllabus."); return; }
   if (classType === "ielts" && skills.length === 0) {
     setError("Chọn ít nhất một kỹ năng.");
     return;
   }
   ```
5. Payload dispatch:
   ```ts
   const result = await run({
     type: "add-syllabus",
     payload: {
       id: "",
       name: name.trim(),
       type: classType,
       level,
       skills: classType === "ielts" ? skills : [],
       description: description.trim(),
       totalLessons: Number.parseInt(total, 10) || 10,
     },
   });
   ```
6. Reset form:
   ```ts
   function resetForm() {
     setName("");
     setDescription("");
     setSkills([]);
   }
   ```
   Gọi trong `if (result?.kind === "refreshed")` và `reconcileAndFinish`.
7. JSX:
   ```tsx
   <Field label="Tên syllabus *" error={error}>...</Field>
   <Field label="Loại lớp">
     <ChipMulti
       options={CLASS_TYPE_OPTIONS}
       value={[classType]}
       onChange={(next) => {
         const other = next.find((v) => v !== classType);
         if (other) setClassType(other as ClassType);
       }}
     />
   </Field>
   <div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
     <Field label="Trình độ"><Select ... /></Field>
   </div>
   {classType === "ielts" && (
     <Field label="Kỹ năng *">
       <ChipMulti options={SKILL_OPTIONS} value={skills} onChange={setSkills} />
     </Field>
   )}
   <Field label="Mô tả">...</Field>
   <Field label="Số buổi dự kiến">...</Field>
   ```
8. Test manual (Chrome preview) — Phase 5 acceptance đầy đủ:
   - Chọn ielts → chip skill hiện, chọn Writing+Speaking → submit → detail hiện 2 Tag skill.
   - Chọn communication → chip skill ẩn → submit → detail hiện 1 Tag "Giao tiếp" (`CLASS_TYPE_LABELS.communication`). Không dùng "—" / ẩn hết tag.

## Success Criteria

- [x] Chip "Loại lớp" hiển thị TRƯỚC chip "Kỹ năng" trong DOM order
- [x] Chọn communication ẩn field "Kỹ năng" hoàn toàn (không chỉ disable)
- [x] Chọn ielts + chưa tick skill → click "Tạo" hiển thị error "Chọn ít nhất một kỹ năng."
- [x] Chọn ielts + tick ≥1 skill → submit thành công, modal đóng, navigate sang detail
- [x] Chọn communication → submit thành công, `skills=[]` được gửi
- [x] Modal đóng + navigate sang detail khi submit thành công. **Không** yêu cầu `apps/web` typecheck/build xanh ở phase này — consumer UI còn đọc `.skill` đến Phase 5.

## Risk Assessment

- **Risk:** `CLASS_TYPE_LABELS` — đã export `mock-data.ts:159`. Import an toàn.
- **Risk:** Phase 4 typecheck đỏ vì Phase 5 chưa chạy — chấp nhận; không giữ dual field `skill`+`skills`.
- **Risk:** `ChipMulti` single-select pattern copy từ AddClassModal L159-162, đã production.

