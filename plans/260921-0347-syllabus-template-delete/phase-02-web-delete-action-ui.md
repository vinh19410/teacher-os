---
title: "Phase 2: web-delete-action-ui"
status: todo
---

# Phase 2 — Web action và UI nút xóa

## Goal

Thêm action `delete-syllabus` vào kernel command bus và nút "Xóa" kèm confirm modal (nêu đúng 2 vế semantics) trên mỗi card template ở trang danh sách syllabus.

## Bối cảnh & căn cứ

Tất cả line number đã được đọc và verify trực tiếp. Phase này phụ thuộc Phase 1 (endpoint `POST /api/syllabi/:id/remove` đã tồn tại).

- **Command bus flow (đã trace)**: UI → `useDirectKernelAction().run` (`apps/web/src/lib/use-direct-kernel-action.ts:28-52`, gọi `useData().dispatch`) → `dispatch` (`apps/web/src/lib/data-provider.tsx:105-118`) → bus `run` → `postKernelCommand` → `kernelCommand(action)` mapping (`apps/web/src/lib/repos/kernel.ts:37-230`) → POST → snapshot refetch → `templates` là filter `classId === null` trên snapshot mới (`apps/web/src/lib/repos/use-syllabus.ts:24`) → template đã xóa tự biến khỏi danh sách. KHÔNG cần optimistic reducer — `data-store-reducer.ts` là fixture-only (comment dòng 37) có `default: return state` (dòng 379-380); action "remove-curriculum" hiện tại cũng không có case.
- **Action union**: `KernelAction` (`apps/web/src/lib/data-actions.ts:7-219`) — "import-syllabus" (148-153), "remove-curriculum" (154-158), "delete-module" (197-201). Mỗi action có JSDoc comment mô tả semantics.
- **Mapping convention**: case "remove-curriculum" (`apps/web/src/lib/repos/kernel.ts:100-106`) với comment "Body must stay exactly {} — same CSRF-safe convention as check-in/cancel"; case "delete-module" (kernel.ts:209-213). Switch kết thúc ở dòng 229 — KHÔNG có exhaustiveness default, nhưng TS sẽ bắt case thiếu khi union mở rộng (switch không cover → implicit fallthrough `undefined`, hàm khai báo trả `KernelRequest` → TS error nếu thiếu case).
- **UI list page**: `apps/web/src/routes/_auth/syllabus/index.tsx` (145 dòng) — `inUse = classesForSyllabus(sy.id).length` (dòng 74), Card là 1 link navigate: `onKeyDown` Enter/Space (81-89) và `onClick` navigate (91-96); footer chứa Badge "Đang dùng {inUse} lớp" (125-129). `classesForSyllabus` là provenance join theo `sourceTemplateId` (`apps/web/src/lib/data-provider.tsx:139-144`).
- **Confirm modal pattern**: `apps/web/src/components/class-detail/curriculum-management-section.tsx:303-339` — `Modal` + 2 nút ("Để lại" secondary / action danger), busy-guard `busy || isPending(key)` (319, 326), gọi `run("remove-curriculum", { type: "remove-curriculum", classId: cls.id }, "Đã gỡ giáo trình.")` (329-333), label pending "Đang gỡ…" (336). Interface `run`/`isPending` lấy từ `useDirectKernelAction` (`apps/web/src/lib/use-direct-kernel-action.ts:7-15`: `run(key, action, successText)`, `isPending(key)`, `busy`; outcome được report qua toast bởi `reportDirectOutcome`, dòng 45).
- **Modal render inline KHÔNG portal** (`apps/web/src/components/ui/modal.tsx:61-98`): Modal render ngay tại vị trí trong DOM tree. Vì nó nằm trong Card có `onClick` navigate + `onKeyDown`, click/keydown từ nội dung modal sẽ bubble lên Card → navigate trong khi modal đang mở. Phải chặn bubble ở wrapper.
- **Components**: `Modal` props `{ open, onClose, title, children, footer? }` (modal.tsx:3-6); `Button` có `variant: "primary" | "secondary" | "ghost" | "danger"` (button.tsx:4).
- **Test mapping convention**: `apps/web/src/lib/repos/kernel-command.test.ts` — describe + test, assert `request.path` và `request.body` (pattern create-report dòng 10-26).
- **KHÔNG sửa**: `add-class-modal.tsx` (template select dòng 201-213 tiêu thụ `useSyllabus().templates` — tự đúng sau refresh), `ImportSyllabusModal`, data-store-reducer, kernel-runtime.contract.test.

## Yêu cầu

- [ ] Thêm `{ type: "delete-syllabus"; syllabusId: string }` vào `KernelAction` với JSDoc tiếng Việt, đặt sau "remove-curriculum" (nhóm syllabus actions)
- [ ] Thêm case "delete-syllabus" vào `kernelCommand`: path `/api/syllabi/${action.syllabusId}/remove`, body `{}` (CSRF-safe)
- [ ] Component mới `apps/web/src/components/syllabus/delete-syllabus-button.tsx`: nút "Xóa" (variant danger) + confirm modal 2 vế semantics + "không thể hoàn tác"; busy-guard pattern mirror
- [ ] Nút và modal KHÔNG trigger navigation của card (chặn cả click và Enter/Space keydown bubble)
- [ ] Tích hợp nút vào footer card ở `apps/web/src/routes/_auth/syllabus/index.tsx` cạnh Badge "Đang dùng"
- [ ] Test mapping mới trong `kernel-command.test.ts`
- [ ] `pnpm --filter web test` pass và `pnpm check-types` (hoặc `pnpm --filter web check-types`) pass

## Files tạo/sửa

| Đường dẫn | Action | Mô tả | Phụ thuộc |
|-----------|--------|-------|-----------|
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/lib/data-actions.ts` | modify | Thêm member "delete-syllabus" vào union `KernelAction` sau dòng 158 | Phase 1 |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/lib/repos/kernel.ts` | modify | Thêm case "delete-syllabus" vào switch `kernelCommand` (cạnh case "delete-module", dòng 209-213) | data-actions.ts |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/components/syllabus/delete-syllabus-button.tsx` | create | Nút "Xóa" + confirm modal (component mới) | data-actions.ts, repos/kernel.ts |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/routes/_auth/syllabus/index.tsx` | modify | Import + đặt `DeleteSyllabusButton` trong footer card (dòng 125-129) | delete-syllabus-button.tsx |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/lib/repos/kernel-command.test.ts` | modify | Thêm describe "kernelCommand delete-syllabus" | repos/kernel.ts |

## Các bước triển khai

1. **data-actions.ts** — thêm sau member "remove-curriculum" (dòng 154-158):

   ```ts
   | {
   		/** Xóa một syllabus template (hard delete cây module/lesson). Các lớp
   		 * đã import KHÔNG bị ảnh hưởng (giữ nguyên bản copy của mình); lớp mới
   		 * không thể chọn template này nữa. */
   		type: "delete-syllabus";
   		syllabusId: string;
     }
   ```

2. **repos/kernel.ts** — thêm case vào switch `kernelCommand` (đặt cạnh nhóm syllabi writes, sau case "delete-module" dòng 209-213):

   ```ts
   case "delete-syllabus":
   	// Body phải stay exactly {} — same CSRF-safe convention as
   	// remove-curriculum (server schema là z.object({}).strict()).
   	return {
   		path: `/api/syllabi/${action.syllabusId}/remove`,
   		body: {},
   	};
   ```

3. **delete-syllabus-button.tsx** (file mới). Semantics confirm theo đúng 2 vế yêu cầu user + cảnh báo hoàn tác; chặn bubble cả click và keydown vì Card là link navigate (index.tsx:81-96) và Modal render inline không portal (modal.tsx:61-98):

   ```tsx
   import { useState } from "react";
   import { Button } from "@/components/ui/button";
   import { Modal } from "@/components/ui/modal";
   import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

   export function DeleteSyllabusButton({
   	syllabusId,
   	name,
   	inUse,
   }: {
   	syllabusId: string;
   	name: string;
   	inUse: number;
   }) {
   	const { run, isPending, busy } = useDirectKernelAction();
   	const [confirmOpen, setConfirmOpen] = useState(false);

   	return (
   		// Card là 1 link navigate (onClick + onKeyDown Enter/Space,
   		// syllabus/index.tsx:81-96) và Modal render inline không portal
   		// (ui/modal.tsx:61-98) — chặn cả click và keydown bubble tại wrapper
   		// này để mở modal / bấm nút trong modal không navigate.
   		// biome-ignore lint/a11y/noStaticElementInteractions: wrapper chỉ
   		// stopPropagation, hành vi điều hướng do Card đóng vai trò.
   		<div
   			onClick={(e) => e.stopPropagation()}
   			onKeyDown={(e) => e.stopPropagation()}
   		>
   			<Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
   				Xóa
   			</Button>
   			<Modal
   				open={confirmOpen}
   				onClose={busy ? () => undefined : () => setConfirmOpen(false)}
   				title="Xóa template giáo trình?"
   			>
   				<p className="text-muted-fg text-sm">
   					{inUse > 0
   						? `${inUse} lớp đang dùng template "${name}" sẽ KHÔNG bị ảnh hưởng — mỗi lớp đã nhập giữ nguyên bản sao giáo trình của riêng mình (cả tiến độ buổi học).`
   						: `Chưa có lớp nào đang dùng template "${name}".`}
   				</p>
   				<p className="text-muted-fg text-sm">
   					Lớp mới sẽ không thể chọn template này nữa. Hành động không thể hoàn tác.
   				</p>
   				<div className="mt-4 flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
   					<Button
   						variant="secondary"
   						size="sm"
   						onClick={() => setConfirmOpen(false)}
   						disabled={busy || isPending("delete-syllabus")}
   					>
   						Để lại
   					</Button>
   					<Button
   						variant="danger"
   						size="sm"
   						disabled={busy || isPending("delete-syllabus")}
   						onClick={() => {
   							setConfirmOpen(false);
   							void run(
   								"delete-syllabus",
   								{ type: "delete-syllabus", syllabusId },
   								"Đã xóa template.",
   							);
   						}}
   					>
   						{isPending("delete-syllabus") ? "Đang xóa…" : "Xóa template"}
   					</Button>
   				</div>
   			</Modal>
   		</div>
   	);
   }
   ```

   Ghi chú hành vi sau khi bấm "Xóa template": `run` → POST → bus refetch snapshot → `templates` filter (`use-syllabus.ts:24`) không còn template → card biến mất. Modal đóng trước khi `run` (mirror curriculum-management-section.tsx:328-333); nếu write fail, outcome hiển thị qua toast (`reportDirectOutcome`, use-direct-kernel-action.ts:45) — card vẫn còn vì snapshot không đổi.

4. **syllabus/index.tsx** — import component mới và đặt cạnh Badge trong footer card (dòng 125-129):

   ```tsx
   import { DeleteSyllabusButton } from "@/components/syllabus/delete-syllabus-button";
   // ...
   <div className="mt-4 flex flex-wrap items-center gap-2">
   	<Badge variant={inUse > 0 ? "accent" : "muted"}>
   		Đang dùng {inUse} lớp
   	</Badge>
   	<DeleteSyllabusButton syllabusId={sy.id} name={sy.name} inUse={inUse} />
   </div>
   ```

   (Tùy chọn cosmetic: thêm `ml-auto` vào wrapper trong component để nút dồn phải card.)

5. **kernel-command.test.ts** — thêm describe theo convention hiện có (mirror dòng 10-26):

   ```ts
   describe("kernelCommand delete-syllabus", () => {
   	test("maps to /api/syllabi/:id/remove with an empty body", () => {
   		const request = kernelCommand({
   			type: "delete-syllabus",
   			syllabusId: "sy-1",
   		});
   		expect(request.path).toBe("/api/syllabi/sy-1/remove");
   		expect(request.body).toEqual({});
   	});
   });
   ```

6. Chạy `pnpm --filter web test` và `pnpm --filter web check-types`; sửa đến khi xanh.

## Todo

- [ ] Thêm action type "delete-syllabus" vào data-actions.ts
- [ ] Thêm case mapping vào repos/kernel.ts
- [ ] Tạo delete-syllabus-button.tsx (nút + confirm modal 2 vế + stopPropagation)
- [ ] Tích hợp vào syllabus/index.tsx footer card
- [ ] Thêm test mapping vào kernel-command.test.ts
- [ ] `pnpm --filter web test` + `pnpm --filter web check-types` pass

## Verification

```bash
pnpm --filter web test        # vitest run (apps/web/package.json:12) — gồm kernel-command.test.ts case mới
pnpm --filter web check-types # vite build && tsc --noEmit (apps/web/package.json:10) — bắt union chưa cover / props sai
```

Mong đợi: toàn bộ test cũ pass + test mới "maps to /api/syllabi/:id/remove with an empty body" pass; type-check xanh (TS xác minh switch `kernelCommand` cover đủ union và props component khớp `ModalProps`/`Button`).

Verify thủ công (dev server): mở `/syllabus` → nút "Xóa" hiện trên card → bấm mở modal (KHÔNG navigate sang detail) → bấm "Xóa template" → toast "Đã xóa template." → card biến mất; nhấn Tab focussing nút rồi Enter cũng chỉ mở modal (không navigate); kiểm tra modal của 1 template có badge "Đang dùng N lớp" hiển thị đúng message N lớp.

## Rủi ro & mitigations

| Rủi ro | Khả năng | Tác động | Mitigation |
|--------|----------|----------|------------|
| Click/Enter/Space trên nút hoặc trong modal bubble lên Card → navigate sang detail page thay vì mở/thao tác modal | Cao nếu quên (Card có onClick 91-96 + onKeyDown 81-89; Modal không portal) | UX hỏng — người dùng bị đá sang trang detail | Wrapper `stopPropagation` CẢ onClick và onKeyDown quanh nút + modal (bước 3); verify thủ công bằng keyboard |
| Người dùng hiểu nhầm "Xóa template" sẽ xóa giáo trình của lớp | Trung bình | Mất niềm tin / hỗn loạn | Confirm modal nêu tường minh 2 vế: "N lớp... sẽ KHÔNG bị ảnh hưởng" và "Lớp mới sẽ không thể chọn" + "không thể hoàn tác" |
| Double-click "Xóa template" gửi 2 POST | Trung bình | Lần 2 trả 404, toast lỗi gây nhiễu | `useDirectKernelAction` busy-guard trả trước khi dispatch (use-direct-kernel-action.ts:36-41) + bus dedupe identical in-flight action (repos/kernel.ts:566-574) |
| Write committed nhưng refresh fail (`committed` outcome) | Thấp | Card vẫn hiển thị dù DB đã xóa — stale UI | Command-bus sẵn có: outcome "committed" được toast báo, caller reconcile qua `refresh()` (repos/kernel.ts:558-561); KHÔNG auto-retry vì write đã chắc chắn lưu |
| Biome a11y lint phàn nàn wrapper div có event handlers | Trung bình | `pnpm check` fail | Đã thêm biome-ignore comment với lý do (mirror pattern modal.tsx:64-65); nếu rule khác flag, bổ sung ignore tương tự |

## Security

- **Auth/CSRF**: POST qua `postKernelCommand` với `credentials: "include"` + body rỗng `{}` — server schema `.strict()` từ chối mọi field lạ (CSRF-safe convention như check-in/cancel, repos/kernel.ts:100-106).
- **Không có surface mới phía web**: action chỉ gọi endpoint đã org-scoped phía server (Phase 1); UI không đọc/ghi gì ngoài snapshot hiện có.
- **Id từ snapshot, không từ user input**: `syllabusId` lấy từ row template đang render (`templates` của `useSyllabus`), không phải từ URL hay input tự do.
