---
phase: 2
title: "Tests — unit ChipMulti, contract regex, e2e guard"
status: pending
priority: P2
effort: "1h 15m"
dependencies: [1]
---

# Phase 2: Tests — unit ChipMulti, contract regex, e2e guard

## Goal

Khóa chặt behavior view-only bằng 4 tầng: unit render test prop `disabled` của `ChipMulti`, contract regex trên source modal (khóa 2 wiring `disabled={skillsLocked}` / `disabled={sessionsLocked}`), và 2 assert e2e phủ cả 2 chiều (khóa khi có dữ liệu — `syllabus-test-session-mark`; khóa theo field khi syllabus rỗng — `syllabus-detail-import-overwrite`). Thêm 1 dòng CHANGELOG.

Điều kiện chạy: #235 đã merge — các assert giá trị "5"/"12" mà #235 thêm là mốc chèn assert mới.

## Files to Create / Modify

- Create: `apps/web/src/components/ui/chip-multi.test.tsx` — unit render test `disabled`.
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` — thêm 1 test regex mới.
- Modify: `apps/e2e/specs/syllabus-test-session-mark.spec.ts` — assert disabled khi syllabus có đầy đủ dữ liệu.
- Modify: `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts` — assert khóa theo field (chips khóa, số buổi không).
- Modify: `CHANGELOG.md` — 1 dòng dưới mục `## 2026-09-22`.
- Không đụng: `add-class-modal.test.tsx` (test render đầu giữ nguyên — chips mặc định không disabled), helper `createSyllabusTemplate` của 2 specs, mọi assert có sẵn.

## Tasks & Steps

1. **Unit test `chip-multi.test.tsx`** (mới, cùng pattern `renderToStaticMarkup` như `field.test.tsx`):

   ```tsx
   import { renderToStaticMarkup } from "react-dom/server";
   import { describe, expect, it, vi } from "vitest";
   import { ChipMulti } from "./chip-multi";

   const options = [
   	{ value: "Writing", label: "Writing" },
   	{ value: "Speaking", label: "Speaking" },
   ];

   describe("ChipMulti view-only", () => {
   	it("renders disabled buttons while keeping aria-pressed values", () => {
   		const html = renderToStaticMarkup(
   			<ChipMulti
   				options={options}
   				value={["Writing"]}
   				onChange={() => undefined}
   				disabled
   			/>,
   		);
   		// disabled="" phân biệt được với chuỗi class "disabled:*" không render.
   		expect(html).toContain('disabled=""');
   		expect(html).toContain('aria-pressed="true"');
   		expect(html).toContain('aria-pressed="false"');
   	});

   	it("stays interactive when disabled is not set", () => {
   		const html = renderToStaticMarkup(
   			<ChipMulti
   				options={options}
   				value={["Writing"]}
   				onChange={() => undefined}
   			/>,
   		);
   		expect(html).not.toContain('disabled=""');
   	});
   });
   ```

   Lý do test ở tầng component thuần: `apps/web` chỉ có vitest + `renderToStaticMarkup` (không jsdom) nên không simulate được event; `ChipMulti` nhận props trực tiếp nên render test được — khác `AddClassModal` (state `templateId` mặc định "" không set được).

2. **Contract regex** trong `kernel-runtime.contract.test.ts` — thêm test mới ngay sau test `add-class modal wires templateId…` (`:150-155`):

   ```ts
   test("add-class syllabus-derived fields render view-only while a template is selected", () => {
   	const src = readSrc("../components/modals/add-class-modal.tsx");
   	expect(src).toMatch(/disabled=\{skillsLocked\}/);
   	expect(src).toMatch(/disabled=\{sessionsLocked\}/);
   });
   ```

3. **e2e `syllabus-test-session-mark.spec.ts`** — test 3 tạo lớp từ template v4 (2 module · 5 buổi, 2 buổi thi; template có `skills=["Writing"]` từ dialog tạo). Sau assert giá trị #235 (`toHaveValue("5")`) và trước click "T2", thêm:

   ```ts
   // View-only (#236): cả hai mục đã base theo syllabus → khóa.
   await expect(
   	classDialog.getByRole("button", { name: "Writing", exact: true }),
   ).toBeDisabled();
   await expect(classDialog.getByLabel("Tổng số buổi")).toBeDisabled();
   ```

   `getByLabel` khớp nhờ `Field` inject label-for id (`field.tsx:38-45`). Click "Writing" ở `:146-148` xảy ra TRƯỚC `selectOption` (khi chưa chọn template → chưa khóa) nên thứ tự hiện có không vỡ.

4. **e2e `syllabus-detail-import-overwrite.spec.ts`** — test 2 tạo lớp từ template rỗng (có `skills=["Writing"]`, 0 buổi). Sau assert `aria-pressed` (`:106-108`), thêm:

   ```ts
   // View-only (#236): khóa theo field — chips bị khóa vì có kỹ năng,
   // còn số buổi không base theo syllabus (0 buổi) thì vẫn editable.
   await expect(
   	classDialog.getByRole("button", { name: "Writing", exact: true }),
   ).toBeDisabled();
   await expect(classDialog.getByLabel("Tổng số buổi")).toBeEnabled();
   ```

   Cặp assert này là bằng chứng khóa tính theo từng field, không khóa nguyên form.

5. **CHANGELOG.md** — 1 dòng vào nhóm `### Added` của mục `## 2026-09-22`, ngay sau bullet auto-fill số buổi của #235, theo convention "(#issue)":

   ```markdown
   - Modal tạo lớp: hai mục Kỹ năng và Tổng số buổi hiển thị view-only khi giá trị đã lấy theo syllabus template (#236)
   ```

6. **Giữ nguyên mọi assert khác của 2 specs** — các bước đi trước (selectOption, click T2, kernel wait) và behavior sau submit không đổi.

## Verification

- `pnpm --filter web test` — unit ChipMulti + contract regex + test render đầu + skillsFromTemplate đều xanh.
- `pnpm check` — biome pass.
- E2E (playwright config tự boot webServer, không cần start tay):
  - `pnpm --filter e2e e2e specs/syllabus-test-session-mark.spec.ts`
  - `pnpm --filter e2e e2e specs/syllabus-detail-import-overwrite.spec.ts`
