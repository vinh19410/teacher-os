---
phase: 2
title: "Tests — unit helper và e2e guard"
status: completed
priority: P2
effort: "1h 15m"
dependencies: [1]
---

# Phase 2: Tests — unit helper và e2e guard

## Goal

Khóa chặt hành vi auto-fill số buổi bằng: unit test pure helper (case đếm qua module + tính buổi thi + rỗng), và 2 assert e2e trên ô "Tổng số buổi" trong 2 specs tạo lớp từ template sẵn có — một assert "auto-fill đúng tổng gồm buổi thi" (template 5 buổi, 2 buổi thi) và một assert "template 0 buổi giữ mặc định". Ghi changelog theo convention repo.

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/add-class-modal.test.tsx` — thêm describe unit test `sessionsFromTemplate`.
- Modify: `apps/e2e/specs/syllabus-test-session-mark.spec.ts` — thêm assert auto-fill "5" (gồm 2 buổi thi) sau `selectOption`.
- Modify: `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts` — thêm assert giữ "12" khi template 0 buổi.
- Modify: `CHANGELOG.md` — 1 dòng dưới mục ngày `## 2026-09-22`.
- Không đụng: `kernel-runtime.contract.test.ts`, các test render đầu hiện có của modal, helper `createSyllabusTemplate` của 2 specs.

## Tasks & Steps

1. **Unit test helper** trong `add-class-modal.test.tsx` — import thêm `sessionsFromTemplate` từ `./add-class-modal` và type `Syllabus`, `SyllabusLesson`, `SyllabusLessonKind` từ `@/lib/mock-data`; thêm describe mới. `apps/web` chỉ có vitest + `renderToStaticMarkup` (không jsdom) nên test event change là không thể — helper là điểm test được (cùng lý do với `skillsFromTemplate`, describe hiện có `:118-138`):

   ```tsx
   const lesson = (kind: SyllabusLessonKind): SyllabusLesson => ({
   	id: `l-${kind}-${Math.random()}`,
   	title: "",
   	objectives: "",
   	materials: "",
   	kind,
   	status: "upcoming",
   });

   describe("sessionsFromTemplate", () => {
   	it("counts lessons across all modules including midterm and final sessions", () => {
   		const modules = [
   			{
   				id: "m1",
   				title: "Module 1",
   				lessons: [lesson("lesson"), lesson("lesson"), lesson("midterm")],
   			},
   			{
   				id: "m2",
   				title: "Module 2",
   				lessons: [lesson("lesson"), lesson("final")],
   			},
   		] satisfies Syllabus["modules"];
   		expect(sessionsFromTemplate(modules)).toBe(5);
   	});

   	it("returns 0 for a syllabus without modules", () => {
   		expect(sessionsFromTemplate([])).toBe(0);
   	});
   });
   ```

   Case "giữ nguyên số buổi khi 0 buổi" không test được ở tầng này (cần event) — do e2e ở bước 3 phủ. Fixture lesson dùng `SyllabusLesson` thật (mock-data.ts:167-174) để `satisfies` bắt đủ shape; case 3+2 với 1 midterm + 1 final mã hóa thẳng yêu cầu "tính luôn cả các buổi test".

2. **e2e `syllabus-test-session-mark.spec.ts`** — test thứ 3 "màn hình lớp không có select Loại…" (`:120-194`) đã tạo template rồi import v4 CSV ("2 module · 5 buổi học" tại `:131`, copy có 2 buổi thi Buổi 3 giữa kỳ + Buổi 5 cuối kỳ theo comment `:188-189`) và tạo lớp từ template này (`:139-158`). Thêm assert ngay sau `:152` (dòng `expect Kỹ năng giáo trình`):

   ```ts
   await classDialog
   	.getByLabel("Template giáo trình")
   	.selectOption({ value: templateId });
   await expect(classDialog.getByText("Kỹ năng giáo trình")).toBeVisible();
   // Auto-fill số buổi (#235): template v4 có 5 buổi (2 buổi thi Buổi 3
   // giữa kỳ + Buổi 5 cuối kỳ) → "Tổng số buổi" tự điền "5", tính cả buổi thi.
   await expect(classDialog.getByLabel("Tổng số buổi")).toHaveValue("5");
   ```

   `getByLabel` khớp nhờ `Field` tự inject label-for id vào control đơn (`field.tsx:41` — `target = htmlFor ?? childId ?? id`); số buổi kế tiếp lớp submit với `sessionsTotal: 5` — không assert nào sau đó phụ thuộc con số này (deep-copy cây syllabus độc lập `sessionsTotal`). Assert `toHaveValue("5")` là bằng chứng "tính cả buổi thi": nếu đếm thiếu buổi thi sẽ ra "3" và fail.

3. **e2e `syllabus-detail-import-overwrite.spec.ts`** — test "bản copy của lớp không có nút import ghi đè" tạo lớp từ template rỗng (helper `createSyllabusTemplate` chỉ tạo qua dialog — có skills, 0 buổi). Thêm assert ngay sau khối assert auto-fill skills (`:105-108`):

   ```ts
   await expect(
   	classDialog.getByRole("button", { name: "Writing", exact: true }),
   ).toHaveAttribute("aria-pressed", "true");
   // Auto-fill số buổi (#235): template rỗng (0 buổi) → giữ giá trị
   // mặc định "12", không xóa trắng.
   await expect(classDialog.getByLabel("Tổng số buổi")).toHaveValue("12");
   ```

4. **Giữ nguyên mọi assert khác của 2 specs** — các bước đi trước (`selectOption`, click T2, kernel wait) và behavior sau submit không đổi.

5. **CHANGELOG.md**: thêm 1 dòng vào nhóm `### Added` của mục `## 2026-09-22` (hiện có 3 bullet `:17-19`, thêm vào cuối nhóm), theo convention "(#issue)":

   ```markdown
   - Modal tạo lớp: chọn template giáo trình tự động điền "Tổng số buổi" theo tổng số buổi của syllabus, tính cả buổi thi giữa kỳ/cuối kỳ (#235)
   ```

## Verification

- `pnpm --filter web test` — helper tests + render-đầu test + contract test đều xanh.
- `pnpm check` — biome pass.
- E2E (playwright config tự boot webServer, không cần start tay):
  - `pnpm --filter e2e e2e specs/syllabus-test-session-mark.spec.ts`
  - `pnpm --filter e2e e2e specs/syllabus-detail-import-overwrite.spec.ts`
