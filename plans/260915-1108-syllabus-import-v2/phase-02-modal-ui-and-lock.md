---
phase: 2
title: "Modal preview UI + khóa giữ-state + e2e"
status: pending
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Modal preview UI + khóa giữ-state + e2e

## Goal

Preview import trong `AddSyllabusModal` hiển thị bảng chi tiết từng buổi học, nút gỡ file dạng icon ở header card (cả nhánh OK lẫn nhánh lỗi), và behavior "đóng modal giữ nguyên dữ liệu" được khóa bằng contract test + e2e.

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/add-syllabus-modal.tsx`
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (chỉ thêm test mới, không sửa test cũ)
- Modify: `apps/e2e/specs/syllabus-excel-csv-import.spec.ts`

**Không đụng:** `apps/web/src/components/ui/data-table.tsx` (dùng chung 9 callers — preview dùng bảng riêng trong modal), các modal khác, routes khác.

**Ràng buộc bắt buộc (contract-test pins hiện có — giữ nguyên trong khi sửa modal):** `onClose={saving ? () => undefined : onClose}`; `disabled={saving || submitBlocked` (giữ nguyên prefix, có thể thêm điều kiện phía sau); `result?.kind === "refreshed"`; `if (result.id && onCreated) onCreated(result.id)`; comment `refreshed result — a committed`; `<KernelSubmitNotice` + `onReconcile=`; `async function submit` + `const result = await run(`.

## Tasks & Steps

### Task 2.1 — Preview card + bảng buổi học + nút gỡ file icon

- Goal: nhánh `importResult.ok` render card [summary + bảng buổi học scrollable + nút X]; nhánh lỗi render card [tên lỗi + nút X] cùng cấu trúc.
- Target files: `apps/web/src/components/modals/add-syllabus-modal.tsx`.
- Steps:
  1. Thêm import: `import { X } from "lucide-react";` và `import { Tag } from "@/components/ui/tag";`.
  2. Thêm const (cạnh `SKILL_OPTIONS`):
     ```ts
     const STATUS_LABELS: Record<
       "done" | "current" | "upcoming",
       string
     > = { done: "Đã dạy", current: "Đang học", upcoming: "Sắp tới" };
     ```
  3. Thay const `removeFileButton` hiện tại bằng icon-button (giữ tên biến):
     ```tsx
     const removeFileButton = (
       <Button
         type="button"
         variant="ghost"
         size="sm"
         className="px-1.5 text-muted-fg hover:text-danger"
         onClick={() => setImportResult(null)}
         disabled={saving || parsing}
         aria-label="Gỡ file"
         title="Gỡ file"
       >
         <X className="size-4" aria-hidden="true" />
       </Button>
     );
     ```
  4. Thay khối `{importResult?.ok && (…)}` bằng card:
     ```tsx
     {importResult?.ok && (
       <div className="rounded-md border border-line-soft border-solid bg-surface">
         <div className="flex items-center justify-between gap-2 px-3 py-2">
           <span className="text-xs">
             {importResult.modules.length} module · {importResult.lessonCount}{" "}
             buổi học
           </span>
           {removeFileButton}
         </div>
         <div className="max-h-64 overflow-y-auto border-line-soft border-t">
           <table className="w-full border-collapse text-xs">
             <thead>
               <tr>
                 {["#", "Module", "Mục tiêu", "Tài liệu", "Trạng thái"].map(
                   (h) => (
                     <th
                       key={h}
                       className="border-line border-b px-2 py-1.5 text-left font-mono text-[11px] tracking-[0.04em] text-muted-fg uppercase"
                     >
                       {h}
                     </th>
                   ),
                 )}
               </tr>
             </thead>
             <tbody>
               {importResult.modules.map((m, mi) =>
                 m.lessons.map((l, li) => (
                   <tr
                     key={`${mi}-${li}-${l.title}`}
                     className="border-line-soft border-b"
                   >
                     <td className="px-2 py-1.5 font-mono text-muted-fg">
                       {lessonNumber(importResult.modules, mi, li)}
                     </td>
                     <td className="px-2 py-1.5">
                       <span
                         className="block max-w-[7rem] truncate"
                         title={m.title}
                       >
                         {li === 0 ? m.title : ""}
                       </span>
                     </td>
                     <td className="px-2 py-1.5">
                       <span
                         className="block max-w-[9rem] truncate"
                         title={l.objectives}
                       >
                         {l.objectives}
                       </span>
                     </td>
                     <td className="px-2 py-1.5">
                       <span
                         className="block max-w-[7rem] truncate"
                         title={l.materials}
                       >
                         {l.materials}
                       </span>
                     </td>
                     <td className="px-2 py-1.5">
                       <Tag>{STATUS_LABELS[l.status]}</Tag>
                     </td>
                   </tr>
                 )),
               )}
             </tbody>
           </table>
         </div>
       </div>
     )}
     ```
     Helper `lessonNumber` (function thường trong component, trước `return`): cộng dồn `lessons.length` của các module trước `mi` rồi `+ li + 1` — trừu tượng hóa "số thứ tự buổi toàn file" cho cột `#`, không parse từ title.
  5. Thay khối `{importResult && !importResult.ok && (…)}` bằng card cùng cấu trúc:
     ```tsx
     {importResult && !importResult.ok && (
       <div className="rounded-md border border-line-soft border-solid bg-surface">
         <div className="flex items-center justify-between gap-2 px-3 py-2">
           <span className="text-danger text-xs">
             File có {importResult.errors.length} lỗi
           </span>
           {removeFileButton}
         </div>
         <ul
           role="alert"
           className="text-danger text-xs list-disc pl-8 pr-3 py-2"
         >
           {importResult.errors.map((err, i) => (
             <li key={`${i}-${err}`}>{err}</li>
           ))}
         </ul>
       </div>
     )}
     ```
     (Kết quả: mọi lúc chỉ đúng 1 nút `aria-label="Gỡ file"` trong DOM.)
  6. Không đổi gì khác trong file (submit, resetForm, disabled prefix… giữ nguyên).
- Success criteria: `pnpm --filter web check-types` exit 0; `pnpm check` (biome) không report lỗi ở file này; các pin liệt kê ở "Ràng buộc bắt buộc" vẫn match.
- Verify: `pnpm --filter web check-types` → **exit 0**.

### Task 2.2 — Contract test khóa giữ-state

- Goal: regression "ai đó thêm reset-on-open hoặc đổi route sang conditional mount" bị bắt ngay ở `pnpm test`.
- Target files: `apps/web/src/lib/kernel-runtime.contract.test.ts`.
- Steps:
  1. Thêm 1 test mới vào `describe("kernel-backed store wiring")` (đặt sau test `"add-syllabus navigates only on the refreshed result with the server id"`):
     ```ts
     test("add-syllabus keeps form state across close: no reset-on-open effect and unconditional route mount", () => {
       // Đóng (Hủy/Esc/overlay) phải GIỮ dữ liệu — ngược chủ đích với
       // AddInvoiceModal (reset-on-open). Modal luôn mounted; state sống ở
       // AddSyllabusModal, không phải trong Modal (Modal return null khi đóng).
       const modal = readSrc("../components/modals/add-syllabus-modal.tsx");
       // Pin phủ cả biến thể thiếu dấu ";": effect phụ thuộc [open] là chỗ
       // reset-on-open trú ngụ (focus management của Modal nằm ở ui/modal.tsx,
       // không phải ở đây).
       expect(modal).not.toMatch(/\}, \[open\]\)/);
       const route = readSrc("../routes/_auth/syllabus/index.tsx");
       expect(route).toMatch(/<AddSyllabusModal/);
       expect(route).not.toMatch(/modalOpen &&\s*<AddSyllabusModal/);
       expect(route).not.toMatch(/open &&\s*<AddSyllabusModal/);
     });
     ```
  2. Không sửa test nào khác trong file.
- Success criteria: test mới pass, toàn bộ file contract test còn lại pass.
- Verify: `pnpm --filter web test -- kernel-runtime.contract` → **exit 0**, stdout chứa test name trên với `passed`/`✓`.

### Task 2.3 — E2E: cập nhật 2 test cũ + thêm test giữ-state

- Goal: e2e phản ánh preview bảng mới; behavior đóng/mở giữ dữ liệu được chứng minh trên cả 3 đường đóng (Hủy, Esc, click overlay).
- Target files: `apps/e2e/specs/syllabus-excel-csv-import.spec.ts`.
- Steps:
  1. Trong cả 2 test CSV/XLSX hiện có, sau `setInputFiles` giữ assert `await expect(dialog.getByText("2 module · 3 buổi học")).toBeVisible();` và thêm:
     ```ts
     await expect(dialog.getByRole("table")).toBeVisible();
     await expect(
       dialog.getByRole("cell", { name: "Hiểu cấu trúc đề" }),
     ).toBeVisible();
     ```
     (Phần sau — click "Tạo", waitForURL, assert detail page `Buổi 1/2/3` — giữ nguyên; title auto `Buổi {n}` cho ra cùng giá trị như trước.)
  2. Thêm test mới (fixture CSV, helper `signUpViaUi` như cũ):
     ```ts
     test("đóng popup tạo syllabus rồi mở lại giữ nguyên dữ liệu đã nhập", async ({
       page,
     }) => {
       await signUpViaUi(page);
       await page.goto("/syllabus");
       await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
       const dialog = page.getByRole("dialog");
       await dialog
         .getByPlaceholder("VD: IELTS Writing 7.0")
         .fill("E2E Keep State");
       await page.setInputFiles(
         "input[type=file]",
         "fixtures/syllabus-import.sample.csv",
       );
       await expect(dialog.getByText("2 module · 3 buổi học")).toBeVisible();

       // Đóng bằng Hủy → mở lại: name + preview còn nguyên.
       await dialog.getByRole("button", { name: "Hủy" }).click();
       await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
       await expect(
         page.getByRole("dialog").getByPlaceholder("VD: IELTS Writing 7.0"),
       ).toHaveValue("E2E Keep State");
       await expect(
         page.getByRole("dialog").getByText("2 module · 3 buổi học"),
       ).toBeVisible();

       // Đóng bằng Esc → mở lại: vẫn còn.
       await page
         .getByRole("dialog")
         .getByPlaceholder("VD: IELTS Writing 7.0")
         .press("Escape");
       await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
       await expect(
         page.getByRole("dialog").getByPlaceholder("VD: IELTS Writing 7.0"),
       ).toHaveValue("E2E Keep State");

       // Đóng bằng click overlay → mở lại: vẫn còn.
       await page.mouse.click(15, 400); // ngoài modal (modal max-w 480px giữa màn hình)
       await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
       await expect(
         page.getByRole("dialog").getByPlaceholder("VD: IELTS Writing 7.0"),
       ).toHaveValue("E2E Keep State");
       await expect(
         page.getByRole("dialog").getByText("2 module · 3 buổi học"),
       ).toBeVisible();
     });
     ```
  3. Không đổi file e2e khác.
- Success criteria: cả 3 test compile; selector không vi phạm Playwright strict mode (mọi `getByText`/`getByRole` đều scoped trong `dialog` hoặc unique).
- Verify (máy có env e2e): `pnpm --filter e2e e2e -- syllabus-excel-csv-import` → **exit 0**. Nếu port 8000 bị dev env giữ (disposition như phase-03 của plan #144: e2e enforce ở CI PR): ghi rõ vào commit message `e2e deferred to CI PR (port 8000 held)` và thay thế bằng Verify: `pnpm --filter e2e exec tsc --noEmit` → **exit 0** (type-level check của spec), không được tự ý bỏ qua mà không ghi chú.

### Task 2.4 — Full gate

- Goal: toàn bộ local gate xanh trước khi chuyển `/ak:ship`.
- Steps:
  1. `pnpm check` (biome --write toàn repo) → exit 0.
  2. `pnpm check-types` (turbo tất cả package) → exit 0.
  3. `pnpm test` (turbo unit + contract) → exit 0.
  4. `pnpm --filter web build` → exit 0.
- Success criteria: 4 lệnh đều exit 0.
- Verify: lần lượt chạy 4 lệnh trên, mỗi lệnh **exit 0**; bất kỳ lệnh non-zero nào → Failure Protocol.

## Phase Verification (chạy sau khi đủ Task 2.1–2.4)

- `pnpm test` exit 0 (bao gồm contract test mới).
- `pnpm --filter e2e e2e -- syllabus-excel-csv-import` exit 0 (hoặc disposition CI như Task 2.3, ghi chú rõ).
- Thủ công 30 giây (nếu dev server đang chạy): mở `/syllabus` → Tạo syllabus → điền + import → Hủy → mở lại → dữ liệu còn; preview hiện bảng; nút X gỡ được file.

## Risk Assessment

- Strict mode: "Buổi 1" có thể xuất hiện cả trong preview lẫn (sau submit) trên detail page — mọi assert trong modal đều scope qua `dialog`; cột `#` hiển thị số nên không assert text "Buổi 1" trong preview.
- Playwright `mouse.click(15, 400)` phụ thuộc viewport mặc định (1280×720) — modal max-w 480px luôn để lề trái ≥ 400px ở viewport đó; nếu CI viewport khác, đổi thành click tọa độ từ bounding box overlay (`page.locator("div.fixed.inset-0")` không có — overlay là `fixed inset-0`, dùng `page.mouse.click` theo bounding box của `page.getByRole("dialog").boundingBox()` trừ 40px).
- Sửa modal có thể vỡ contract-test regex pins hiện có → danh sách "Ràng buộc bắt buộc" ở đầu phase này là checklist bắt buộc đọc lại trước khi commit.

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
