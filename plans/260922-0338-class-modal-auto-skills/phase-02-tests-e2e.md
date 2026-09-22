---
phase: 2
title: "Tests — component test và e2e guard"
status: pending
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 2: Tests — component test và e2e guard

## Goal

Khóa chặt hành vi auto-fill bằng: unit test pure helper (mọi case biên), giữ nguyên test render đầu của modal, và chuyển e2e `syllabus-detail-import-overwrite` từ "bấm chip tay" sang "assert chip tự bật" để spec thành guard cho auto-fill thay vì che khuất nó. Ghi changelog theo convention repo.

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/add-class-modal.test.tsx` — thêm describe unit test helper.
- Modify: `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts` — bỏ click chip tay, thêm assert `aria-pressed`.
- Modify: `CHANGELOG.md` — 1 dòng dưới mục ngày `## 2026-09-22`.
- Không đụng: `apps/e2e/specs/syllabus-test-session-mark.spec.ts` (giữ làm guard combo chọn-tay + template), `kernel-runtime.contract.test.ts`.

## Tasks & Steps

1. **Unit test helper** trong `add-class-modal.test.tsx` — import thêm `skillsFromTemplate` từ `./add-class-modal`, thêm describe mới. `apps/web` chỉ có vitest + `renderToStaticMarkup` (không jsdom) nên test event change là không thể — helper là điểm test được:

   ```tsx
   describe("skillsFromTemplate", () => {
   	it("orders skills canonically and drops unknown values", () => {
   		expect(
   			skillsFromTemplate(["Reading", "Writing", "Pronunciation"]),
   		).toEqual(["Writing", "Reading"]);
   	});

   	it("dedupes repeated skills", () => {
   		expect(skillsFromTemplate(["Writing", "Writing"])).toEqual(["Writing"]);
   	});

   	it("returns all four skills unchanged for a full syllabus", () => {
   		expect(
   			skillsFromTemplate(["Listening", "Speaking", "Reading", "Writing"]),
   		).toEqual(["Writing", "Speaking", "Reading", "Listening"]);
   	});

   	it("returns an empty array for an empty syllabus", () => {
   		expect(skillsFromTemplate([])).toEqual([]);
   	});
   });
   ```

   Case "giữ nguyên selection khi rỗng" không test được ở tầng này (cần event) — do e2e ở bước 3 phủ.

2. **Giữ nguyên** describe `AddClassModal template options` (test render đầu `aria-pressed="false"` cho Writing/Speaking) — auto-fill chỉ chạy lúc change, render đầu vẫn trống. Các test `ClassTemplatePicker` giữ nguyên (component display-only không đổi).

3. **Sửa e2e `syllabus-detail-import-overwrite.spec.ts`** (đoạn tạo lớp từ template trong test "ghi đè sau xác nhận thay cây, hủy giữ nguyên dữ liệu hiện tại", ~`:100-108`): bỏ click chip "Writing" tay, thay bằng assert chip tự bật SAU `selectOption` — template do `createSyllabusTemplate` tạo có `skills=["Writing"]` (helper bấm chip Writing trong dialog syllabus tại `:13`):

   ```ts
   // Auto-fill: template có skills=["Writing"] → chip tự bật, thỏa
   // validation kỹ năng bắt buộc với lớp IELTS mà không cần bấm tay.
   await classDialog
   	.getByLabel("Template giáo trình")
   	.selectOption({ value: templateId });
   await expect(classDialog.getByText("Kỹ năng giáo trình")).toBeVisible();
   await expect(
   	classDialog.getByRole("button", { name: "Writing", exact: true }),
   ).toHaveAttribute("aria-pressed", "true");
   ```

   Lý do: nếu auto-fill vỡ, assert này fail ngay; kể cả nếu bị bỏ qua, submit sẽ dính "Chọn ít nhất một kỹ năng" và dialog không đóng → spec vẫn fail loud. Locator chip khớp `chip-multi.tsx:40` (`aria-pressed={value.includes(option.value)}`) và pattern click chip trong dialog đã có sẵn trong chính spec này.

4. **Giữ nguyên `syllabus-test-session-mark.spec.ts`** (~`:147-151`): spec bấm chip "Writing" tay TRƯỚC rồi `selectOption` — với auto-fill, ghi đè lên cùng giá trị `["Writing"]`, chip vẫn nhấn, spec xanh. Đây là guard cho combo "chọn tay + chọn template" không hồi quy.

5. **CHANGELOG.md**: thêm 1 dòng vào nhóm `### Added` của mục `## 2026-09-22` (đứng đầu file), theo convention "(#issue)":

   ```markdown
   - Modal tạo lớp: chọn template giáo trình tự động bật các chip kỹ năng của lớp theo kỹ năng syllabus (#232)
   ```

## Verification

- `pnpm --filter web test` — helper tests + render-đầu test + contract test đều xanh.
- `pnpm check` — biome pass.
- E2E (playwright config tự boot webServer, không cần start tay):
  - `pnpm --filter e2e e2e specs/syllabus-detail-import-overwrite.spec.ts`
  - `pnpm --filter e2e e2e specs/syllabus-test-session-mark.spec.ts`
