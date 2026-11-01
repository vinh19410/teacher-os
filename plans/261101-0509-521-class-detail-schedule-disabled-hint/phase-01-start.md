---
phase: 1
title: "Phase 1: TDD Empty-Curriculum Session Management Modal, E2E & Design Verification"
status: pending
priority: P3
effort: "1h"
dependencies: []
---

# Phase 1: TDD Empty-Curriculum Session Management Modal, E2E & Design Verification

<!-- Updated: Red Team & Validation Session 1 - Guarded setTab("sessions-practice") on Sắp xếp buổi click behind if (sy), made onOpenCurriculum required, added key={`manage-sessions-${cls.id}`} and gated child modals behind {sy && (...)}, moved E2E 3-viewport & keyboard Enter checks inside open dialog, added CHANGELOG.md, deleted outFile dir before design:compare, and removed --keep-design -->

## Goal

Enable the **"Sắp xếp buổi"** button on `/classes/$classId` when a class has no curriculum attached (`!sy`), display a clear explanation (`"Gắn giáo trình cho lớp để sắp xếp buổi."`) with a **"Mở tab Giáo trình"** CTA inside `ClassSessionsManageModal`, and verify via unit tests, Playwright E2E (3 viewports + keyboard focus/activation while modal is open), and `design:compare`.

## Overview

1. **`apps/web/src/routes/_auth/classes/$classId.test.tsx` (TDD Red)**:
   - Add a unit test in `describe("class detail → Buổi học tab")` verifying that when a class has no attached curriculum (`syllabusId: null`), the `"Sắp xếp buổi"` button is enabled (`disabled === false`), opening and closing `"Quản lý buổi của lớp"` from another tab (`"Học viên"`) preserves the active `"Học viên"` tab, and clicking `"Sắp xếp buổi"` (including from `assignmentsView === "assign"`) then clicking `"Mở tab Giáo trình"` closes the dialog, selects the `"Giáo trình"` tab (`aria-selected="true"`), shows `"Nhập từ template"`, and resets `assignmentsView` to `"list"`.
2. **`apps/web/src/routes/_auth/classes/$classId.tsx` & `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` (TDD Green)**:
   - Remove `disabled={!sy}` from the `"Sắp xếp buổi"` `<Button>` in `$classId.tsx`, and update its `onClick` so `if (sy) { setTab("sessions-practice"); setAssignmentsView("list"); }` only runs when `sy` is present before calling `setManageOpen(true)`.
   - Pass `key={\`manage-sessions-${cls.id}\`}` and required `onOpenCurriculum={() => { setManageOpen(false); handleTabChange("curriculum"); }}` to `<ClassSessionsManageModal>`.
   - In `ClassSessionsManageModal`, require `onOpenCurriculum: () => void`, render the dashed empty-state card (`rounded-lg border border-dashed p-6 text-center`) with `"Gắn giáo trình cho lớp để sắp xếp buổi."` and `<Button size="sm" className="mt-4" onClick={onOpenCurriculum}>Mở tab Giáo trình</Button>` when `!sy`, and gate child mutation modals (`AddModuleModal`, `EditModuleModal`, `AddLessonModal`, `EditLessonModal`, `mutations.confirmModal`) behind `{sy && (...)}`.
3. **E2E, Documentation, Changelog & Visual Baseline (`apps/e2e/specs/syllabus-class-curriculum.spec.ts`, `DESIGN.md`, `CHANGELOG.md`, `t-class-detail` screenshots)**:
   - In `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (Test B, empty class created with `"— Lớp trống —"`), focus `"Sắp xếp buổi"` and activate via keyboard `Enter` to open `"Quản lý buổi của lớp"`, assert `"Gắn giáo trình cho lớp để sắp xếp buổi."` and `"Mở tab Giáo trình"` visibility and zero horizontal overflow across 3 viewports (`1440×900`, `768×1024`, `375×812`) while the modal is open, and focus + press `Enter` on `"Mở tab Giáo trình"` to switch to the `"Giáo trình"` tab before importing the template.
   - Update `DESIGN.md` line 149–150 and add a `### Fixed` entry under `## 2026-11-01` in `CHANGELOG.md` to document `#521`.
   - Delete `scripts/design-compare/.state/raw/new/t-class-detail` and `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail`, then run `pnpm design:compare --screens t-class-detail --side both --label new` to regenerate the 6 `t-class-detail` composite screenshots.

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/classes/$classId.test.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`
- Modify: `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`
- Modify: `apps/e2e/specs/syllabus-class-curriculum.spec.ts`
- Modify: `DESIGN.md`
- Modify: `CHANGELOG.md`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/desktop-light.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/desktop-dark.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/tablet-light.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/tablet-dark.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/phone-light.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/phone-dark.png`

## Requirements

- [ ] Write a failing unit test (TDD Red) in `apps/web/src/routes/_auth/classes/$classId.test.tsx` asserting that `"Sắp xếp buổi"` is enabled when `syllabusId: null`, dismissing `"Quản lý buổi của lớp"` preserves the active tab, and clicking `"Mở tab Giáo trình"` closes the modal, resets `assignmentsView`, and activates the `"Giáo trình"` tab.
- [ ] Implement the fix in `apps/web/src/routes/_auth/classes/$classId.tsx` and `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` (TDD Green).
- [ ] Update `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (including 3-viewport `1440×900`, `768×1024`, `375×812` and keyboard `Enter` checks while the modal is open), `DESIGN.md`, and `CHANGELOG.md`, regenerate `t-class-detail` screenshots via `pnpm design:compare`, and verify all unit/type/lint/E2E gates pass.

## Tasks & Steps

### Task 1.1 — Add TDD Red unit test for `"Sắp xếp buổi"` on a class without curriculum
- **Goal**: Add a unit test in `apps/web/src/routes/_auth/classes/$classId.test.tsx` that fails against the current `disabled={!sy}` implementation.
- **Target files and symbols**:
  - `apps/web/src/routes/_auth/classes/$classId.test.tsx` (`describe("class detail → Buổi học tab")`)
- **Steps**:
  1. In `apps/web/src/routes/_auth/classes/$classId.test.tsx`, at the end of `describe("class detail → Buổi học tab")` (after line 378), add:
     ```tsx
     it("opens the manage sessions modal with an empty-state explanation and switches to the Giáo trình tab when the class has no syllabus (#521)", async () => {
       startKernelServer(
         snapshotFixture({
           classes: [classRow({ id: "cl-1", syllabusId: null })],
           syllabi: [syllabusRow({ id: "sy-t", name: "Template A" })],
         }),
       );
       renderWithKernel(<ClassDetail />);
       const manageBtn = (await screen.findByRole("button", {
         name: "Sắp xếp buổi",
       })) as HTMLButtonElement;
       expect(manageBtn.disabled).toBe(false);

       // Opening and dismissing the modal from another tab preserves that tab.
       fireEvent.click(screen.getByRole("tab", { name: "Học viên" }));
       fireEvent.click(manageBtn);
       const dismissedDialog = screen.getByRole("dialog", {
         name: "Quản lý buổi của lớp",
       });
       fireEvent.click(
         within(dismissedDialog).getByRole("button", { name: "Đóng" }),
       );
       expect(
         screen.queryByRole("dialog", { name: "Quản lý buổi của lớp" }),
       ).toBeNull();
       expect(
         screen
           .getByRole("tab", { name: "Học viên" })
           .getAttribute("aria-selected"),
       ).toBe("true");

       // Enter assign view on Buổi học & luyện tập to verify switching to curriculum resets assignmentsView.
       fireEvent.click(
         screen.getByRole("tab", { name: "Buổi học & luyện tập" }),
       );
       fireEvent.click(screen.getByRole("button", { name: "Giao bài tập" }));
       expect(screen.queryByRole("button", { name: "Giao bài tập" })).toBeNull();

       fireEvent.click(manageBtn);
       const dialog = screen.getByRole("dialog", {
         name: "Quản lý buổi của lớp",
       });
       expect(
         within(dialog).getByText("Gắn giáo trình cho lớp để sắp xếp buổi."),
       ).toBeTruthy();

       fireEvent.click(
         within(dialog).getByRole("button", { name: "Mở tab Giáo trình" }),
       );
       expect(
         screen.queryByRole("dialog", { name: "Quản lý buổi của lớp" }),
       ).toBeNull();
       expect(
         screen
           .getByRole("tab", { name: "Giáo trình" })
           .getAttribute("aria-selected"),
       ).toBe("true");
       expect(
         screen.getByRole("button", { name: "Nhập từ template" }),
       ).toBeTruthy();
       expect(
         screen.getByRole("button", { name: "Giao bài tập" }),
       ).toBeTruthy();
     });
     ```
- **Success criteria**: Running Vitest on `$classId.test.tsx` fails with an assertion error because `manageBtn.disabled` is `true`.
- **Verify**:
  - `pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.test.tsx'` exits non-zero with assertion failure (`expected true to be false`; passing test is a failure).

### Task 1.2 — Enable `"Sắp xếp buổi"` and add empty-state CTA in `ClassSessionsManageModal` (TDD Green)
- **Goal**: Update `apps/web/src/routes/_auth/classes/$classId.tsx` and `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` so the unit test in Task 1.1 passes.
- **Target files and symbols**:
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (`ClassDetailRoute`)
  - `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx` (`ClassSessionsManageModalProps`, `ClassSessionsManageModal`)
- **Steps**:
  1. In `apps/web/src/routes/_auth/classes/$classId.tsx`:
     - At lines 239–248, remove `disabled={!sy}` from `<Button size="sm" ...>Sắp xếp buổi</Button>` and guard `setTab("sessions-practice"); setAssignmentsView("list");` behind `if (sy)`:
       ```tsx
       <Button
         size="sm"
         onClick={() => {
           if (sy) {
             setTab("sessions-practice");
             setAssignmentsView("list");
           }
           setManageOpen(true);
         }}
       >
         Sắp xếp buổi
       </Button>
       ```
     - At lines 440–447, add `key={\`manage-sessions-${cls.id}\`}` and pass `onOpenCurriculum` to `<ClassSessionsManageModal>`:
       ```tsx
       <ClassSessionsManageModal
         key={`manage-sessions-${cls.id}`}
         open={manageOpen}
         onClose={() => setManageOpen(false)}
         onOpenCurriculum={() => {
           setManageOpen(false);
           handleTabChange("curriculum");
         }}
         cls={cls}
         run={run}
         isPending={isPending}
         busy={busy}
       />
       ```
  2. In `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`:
     - Add required `onOpenCurriculum: () => void;` to `ClassSessionsManageModalProps` (line 20) and destructure `onOpenCurriculum` in `ClassSessionsManageModal` (line 39).
     - Replace the `!sy` branch at lines 68–72 with:
       ```tsx
       {!sy ? (
         <div className="rounded-lg border border-dashed p-6 text-center">
           <p className="text-muted-foreground text-sm">
             Gắn giáo trình cho lớp để sắp xếp buổi.
           </p>
           <Button
             size="sm"
             className="mt-4"
             onClick={onOpenCurriculum}
           >
             Mở tab Giáo trình
           </Button>
         </div>
       ) : (
       ```
     - Gate the child modals at lines 185–211 (`<AddModuleModal>`, `<EditModuleModal>`, `<AddLessonModal>`, `<EditLessonModal>`, `{mutations.confirmModal}`) inside `{sy && (<>...</>)}`.
- **Success criteria**: All unit tests in `$classId.test.tsx` and `$classId.sessions.test.tsx` pass.
- **Verify**:
  - `pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.test.tsx' 'src/routes/_auth/classes/$classId.sessions.test.tsx'` exits 0.

### Task 1.3 — Update E2E spec, `DESIGN.md`, `CHANGELOG.md`, and refresh `t-class-detail` visual comparison screenshots
- **Goal**: Extend `apps/e2e/specs/syllabus-class-curriculum.spec.ts` to verify the empty-class `"Sắp xếp buổi"` flow (including 3 viewports while the modal is open and keyboard `Enter` activation), update `DESIGN.md` and `CHANGELOG.md`, and run `pnpm design:compare` on `t-class-detail`.
- **Target files and symbols**:
  - `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (Test B: `"B: gán sau — lớp trống nhập từ template; nhập lần hai bằng API là 409"`)
  - `DESIGN.md` (`## Lệch có chủ đích so với design v2 — trang chi tiết lớp teacher (#391)`)
  - `CHANGELOG.md` (`## 2026-11-01` → `### Fixed`)
  - `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/*.png`
- **Steps**:
  1. In `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (around lines 149–156, inside Test B right after `await openClassFromList(page, \`E2E 394 Trống ${stamp}\`);`), replace the manual tab click `await page.getByRole("tab", { name: "Giáo trình", exact: true }).click();` with the full Issue #521 verification flow:
     ```ts
     const manageBtn = page.getByRole("button", {
       name: "Sắp xếp buổi",
       exact: true,
     });
     await expect(manageBtn).toBeEnabled();
     await manageBtn.focus();
     await expect(manageBtn).toBeFocused();
     await page.keyboard.press("Enter");
     const emptyManageDialog = page.getByRole("dialog", {
       name: "Quản lý buổi của lớp",
     });
     await expect(
       emptyManageDialog.getByText("Gắn giáo trình cho lớp để sắp xếp buổi."),
     ).toBeVisible();
     const openCurriculumBtn = emptyManageDialog.getByRole("button", {
       name: "Mở tab Giáo trình",
       exact: true,
     });
     for (const vp of [
       { width: 1440, height: 900 },
       { width: 768, height: 1024 },
       { width: 375, height: 812 },
     ]) {
       await page.setViewportSize(vp);
       await expect(emptyManageDialog).toBeVisible();
       await expect(openCurriculumBtn).toBeVisible();
       const overflow = await page.evaluate(
         () =>
           document.documentElement.scrollWidth >
           document.documentElement.clientWidth,
       );
       expect(overflow, `Overflow at ${vp.width}x${vp.height}`).toBe(false);
     }
     await page.setViewportSize({ width: 1280, height: 720 });
     await openCurriculumBtn.focus();
     await expect(openCurriculumBtn).toBeFocused();
     await page.keyboard.press("Enter");
     await expect(emptyManageDialog).toBeHidden();
     await expect(
       page.getByRole("tab", { name: "Giáo trình", exact: true }),
     ).toHaveAttribute("aria-selected", "true");
     ```
  2. In `DESIGN.md` at lines 149–150, update the `"Add session" = nút primary "Sắp xếp buổi"` bullet to:
     ```markdown
     - **"Add session" = nút primary "Sắp xếp buổi"** mở modal Quản lý buổi: kernel không có action
       add-session theo ngày riêng; thêm buổi = thêm bài vào module giáo trình (#221). Khi lớp chưa gắn
       giáo trình, nút vẫn bấm được và modal hiển thị lý do kèm nút "Mở tab Giáo trình" (#521).
     ```
  3. In `CHANGELOG.md` under `## 2026-11-01` → `### Fixed` (above the `#520` bullet at line 17), add:
     ```markdown
     - Cho phép bấm nút **"Sắp xếp buổi"** trên trang chi tiết lớp giáo viên (`apps/web/src/routes/_auth/classes/$classId.tsx`) ngay cả khi lớp chưa gắn giáo trình: mở modal **Quản lý buổi của lớp** (`apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`) hiển thị lý do *"Gắn giáo trình cho lớp để sắp xếp buổi."* kèm nút **"Mở tab Giáo trình"** chuyển thẳng sang tab Giáo trình mà không tự ý đổi tab nền nếu giáo viên đóng modal (#521).
     ```
  4. Run `pnpm check-types`, `pnpm exec biome check .`, `pnpm --filter web test`, the E2E specs (`syllabus-class-curriculum.spec.ts`, `class-sessions-manage-modal.spec.ts`, `syllabus-test-session-mark.spec.ts`), and `rm -rf scripts/design-compare/.state/raw/new/t-class-detail plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail && pnpm design:compare --screens t-class-detail --side both --label new`.
- **Success criteria**: All unit tests, type checks, lint checks, Playwright E2E specs, and `design:compare` exit 0, and `git status --porcelain plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail` shows the updated screenshots.
- **Verify**:
  - `pnpm check-types && pnpm exec biome check . && pnpm --filter web test` exits 0.
  - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/syllabus-class-curriculum.spec.ts specs/class-sessions-manage-modal.spec.ts specs/syllabus-test-session-mark.spec.ts` exits 0.
  - `rm -rf scripts/design-compare/.state/raw/new/t-class-detail plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail && pnpm design:compare --screens t-class-detail --side both --label new && test -n "$(git status --porcelain plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail)"` exits 0.

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

## Verification

- `pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.test.tsx' 'src/routes/_auth/classes/$classId.sessions.test.tsx'` exits 0.
- `pnpm check-types && pnpm exec biome check . && pnpm --filter web test` exits 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/syllabus-class-curriculum.spec.ts specs/class-sessions-manage-modal.spec.ts specs/syllabus-test-session-mark.spec.ts` exits 0.
- `rm -rf scripts/design-compare/.state/raw/new/t-class-detail plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail && pnpm design:compare --screens t-class-detail --side both --label new && test -n "$(git status --porcelain plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail)"` exits 0.
