---
title: "Phase 2: Trang /assignments/new + data layer web"
description: "Dựng trang tạo đề theo design v3 'Thêm đề vào ngân hàng' (composer Task 1/2 + dạng đề + band + preview học viên + sticky action bar + success state), kernel action create-assignment-prompt, navigation wiring, xóa AddAssignmentModal placeholder."
status: completed
---

# Phase 2: Trang /assignments/new + data layer web

## Goal

Giáo viên mở trang tạo bài tập, soạn đề Writing Task 1/2 theo đúng thiết kế mới, xem trước đúng cái học viên sẽ thấy, và lưu đề thật vào ngân hàng — đầy đủ validate, nháp/sẵn sàng, và success state.

## Key Insights

- **Nguồn thiết kế**: `assignment-create-3.html` (bản mới nhất 13:59, `primary: true`) trong project Open Design `f2f4d498-7ea3-403c-89e9-6ac3099ac79b`. v1/v2 ("Tạo bài tập Writing IELTS" — giao thẳng lớp + học viên) là lịch sử iterate; v3 đổi hướng **bank-first**: đề chỉ vào ngân hàng, giao bài là việc trang Lớp học (link "Mở trang Lớp học" ở success state).
- Trang render **bên trong app shell hiện có** (sidebar + topbar + PageHead). Topbar title lấy từ `routeTitles` (apps/web/src/components/layout/app-shell.tsx:9-25); phần khung shell trong design (sidebar, search "Tìm đề trong ngân hàng") là ngữ cảnh lý tưởng — không tái tạo shell riêng, không đổi topbar toàn cục.
- TanStack Router file-based: `routes/_auth/assignments/new.tsx` (static) **ưu tiên hơn** `$assignmentId.tsx` (dynamic) — không xung đột route. Service worker matcher cần `/assignments/new` trong `VALID_EXACT_ROUTES` (apps/web/src/routes-matcher.ts:4-18) để precache/điều hướng đúng.
- UI kit khớp thiết kế sẵn: `ChipFilter` (single-select chip — dùng cho Dạng bài/Dạng đề/Band/Trạng thái), `Field`/`Input`/`Textarea`, `Tag`, `Card`, `SectionLabel`, `Button`. Chip trong design dùng `role="radiogroup"`; ChipFilter là button thường — giữ pattern repo, thêm `aria-pressed` không bắt buộc.
- Submit theo chuẩn kernel: `useKernelFormSubmit` (apps/web/src/lib/use-kernel-form-submit.ts) — chỉ `refreshed` mới chuyển success state; `definite-failure` giữ form + inline error; `committed`/`outcome-unknown` dùng `KernelSubmitNotice` (apps/web/src/components/modals/kernel-submit-notice.tsx) như các modal khác.
- Catalog dạng đề (Task 1: Biểu đồ/Bảng/Bản đồ/Quy trình — Task 2: Discuss/Opinion/Advantages/Problem) kèm default title + prompt mẫu là **preset phía client** (design hardcode trong `<script>`) — tách thành module pure để unit test được.
- **Trung thực dữ liệu**: mục "Đề đã có" trong design có tag "Đã dùng 2 lớp" — chưa có dữ liệu link đề→lớp nên **không hiển thị** số lần dùng (convention "honest UI" của repo, cf. #172). Chỉ hiện Tag "Sẵn sàng"/"Bản nháp" + nguồn đề.

## Files to Create / Modify

- Create: `apps/web/src/routes/_auth/assignments/new.tsx` — trang chính (layout 2 cột, state form, submit, success state)
- Create: `apps/web/src/components/assignments/assignment-presets.ts` — catalog TASKS + `wordCount()` + logic default/dirty (pure)
- Create: `apps/web/src/components/assignments/prompt-composer.tsx` — card "Đề bài / Writing Academic"
- Create: `apps/web/src/components/assignments/bank-context-card.tsx` — card "Ngân hàng / Chưa giao lớp" + "Đề đã có"
- Create: `apps/web/src/components/assignments/student-preview-paper.tsx` — paper "Xem trước phía học viên"
- Create: `apps/web/src/components/assignments/create-success-card.tsx` — success state
- Modify: `apps/web/src/lib/data-actions.ts` — case `create-assignment-prompt` (payload đủ 8 field của contract)
- Modify: `apps/web/src/lib/repos/kernel.ts` — `kernelCommand` case → `POST /api/assignments/prompts`
- Modify: `apps/web/src/components/layout/app-shell.tsx` — `routeTitles["/_auth/assignments/new"] = "Tạo bài tập"`
- Modify: `apps/web/src/routes-matcher.ts` — `"/assignments/new": true` trong `VALID_EXACT_ROUTES`
- Modify: `apps/web/src/routes/_auth/assignments/index.tsx` — nút "+ Tạo bài tập" → `navigate({ to: "/assignments/new" })`, bỏ state modal
- Delete: `apps/web/src/components/modals/add-assignment-modal.tsx` — placeholder chết, thay bằng trang thật
- Modify: `apps/web/src/routes/_auth/assignments/index.test.tsx` — bỏ 2 test render `AddAssignmentModal` (dòng 134-152), thêm assert CTA điều hướng

## Implementation Steps

1. **Presets** (`assignment-presets.ts`) — chuyển nghĩa `TASKS` từ design sang typed module:

   ```ts
   export interface GenrePreset { id: string; label: string; title: string; prompt: string }
   export interface TaskPreset { id: "task1" | "task2"; label: string; words: number; minutes: number; help: string; genres: GenrePreset[] }
   export const TASK_PRESETS: TaskPreset[] = [ /* chart/table/map/process + discuss/opinion/advantage/problem — copy nguyên label/title/prompt từ design */ ];
   export function wordCount(text: string): number;
   export function genreOf(taskId, genreId): GenrePreset; // fallback genres[0]
   ```

   State form giữ theo design: `{ task, genre, band, status, dirtyTitle, dirtyPrompt }` + `title/prompt/note/source`. Chuyển task → reset genre về đầu danh sách + áp lại default (trừ field đang dirty); chuyển genre → áp default title/prompt của genre đó (trừ field đang dirty).

2. **Trang `new.tsx`** — khung trang:

   - Crumb: `Bài tập (/assignments) / Tạo mới` (bỏ nấc "Ngân hàng" — chưa có trang list ngân hàng riêng, không link chết);
   - `h1` "Thêm đề vào ngân hàng" + lead "Soạn đề Writing Task 1 hoặc Task 2. Đề lưu trong ngân hàng; giao cho lớp ở trang Lớp học.";
   - Grid 2 cột `lg:grid-cols-[1.45fr_0.9fr]` (collapse 1 cột < lg): trái = PromptComposer, phải = stack BankContextCard + StudentPreviewPaper;
   - Sticky action bar dưới cùng (`sticky bottom-0`, nền blur `backdrop-blur`, border-t): trái = action copy 3 trạng thái, phải = Hủy (btn-secondary, reset) + submit (btn-primary).

3. **PromptComposer** — card "Đề bài":
   - `SectionLabel` "Đề bài" + h2 "Writing Academic";
   - Dạng bài: ChipFilter `["Task 1 · 150 từ", "Task 2 · 250 từ"]` (default Task 2);
   - Dạng đề: ChipFilter theo label của genre thuộc task hiện tại;
   - Tiêu đề: Input, required, lỗi inline "Nhập tiêu đề bài tập." (chỉ hiện sau khi submit hoặc khi touched);
   - Grid 2 cột: Band mục tiêu (ChipFilter 6.0/6.5/7.0/7.5, default 7.0) + Nguồn đề (Input, placeholder "Cambridge IELTS 10, Test 2" — không prefill giá trị, prefill chỉ là ví dụ design);
   - Nội dung đề: Textarea min-h ~168px, required, đếm từ (mono, "N từ") + help text theo task (`help` trong preset), lỗi "Dán hoặc soạn đề trước khi lưu.";
   - Hướng dẫn thêm (không bắt buộc): Textarea min-h ~88px, placeholder theo design ("Ví dụ: lập dàn ý 4 đoạn, nêu rõ lập luận đối lập ở đoạn 3.").

4. **BankContextCard** — card "Ngân hàng":
   - `SectionLabel` "Ngân hàng" + h2 "Chưa giao lớp" + note "Đề này chỉ được thêm vào ngân hàng bài tập. Giao cho lớp và học viên ở trang Lớp học." (chữ "Lớp học" là Link `/classes` underline);
   - Trạng thái: ChipFilter `["Bản nháp", "Sẵn sàng giao"]` (default "Sẵn sàng giao");
   - "Đề đã có": từ `data.assignmentPrompts` — mỗi item: `<strong>{title}</strong>` + hàng `<Tag>{Sẵn sàng|Bản nháp}</Tag>` + `<span className="meta">{source || "Chưa ghi nguồn"}</span>`; mới nhất trước, tối đa 5 + "còn N đề khác"; rỗng → "Chưa có đề nào trong ngân hàng." (empty state trung thực).

5. **StudentPreviewPaper** — paper nền `surface-warm`:
   - Kicker "Xem trước phía học viên"; title = `title.trim() || genreOf(...).title`;
   - Spec: `Academic · {words} từ · {minutes} phút · Band {band}`;
   - Body: `prompt.trim()` hoặc placeholder "Đề sẽ hiện ở đây khi bạn soạn." (render dạng text, **không** innerHTML);
   - Tags: Task label · genre label · `Band {band}` · source (nếu có) · "Có hướng dẫn thêm" (nếu note) · trạng thái.

6. **Action bar + submit**:
   - Action copy: thiếu title/prompt → "Thiếu tiêu đề hoặc đề bài / Soạn xong rồi lưu vào ngân hàng. Chưa giao lớp."; status draft → "Lưu bản nháp / Bản nháp chưa hiện khi giao từ trang Lớp học."; ready → "Sẵn sàng lưu vào ngân hàng / Chưa giao lớp. Giao sau ở trang Lớp học.";
   - Submit disabled khi thiếu field bắt buộc hoặc `saving`; label "Lưu vào ngân hàng" / "Lưu bản nháp" theo status;
   - Submit → `useKernelFormSubmit.run({ type: "create-assignment-prompt", payload })`; `refreshed` → ẩn form, hiện CreateSuccessCard; `definite-failure` → inline error giữ form; `committed`/`outcome-unknown` → KernelSubmitNotice (reconcile path có sẵn).

7. **CreateSuccessCard** (thay form, không đổi route):
   - Check mark (success-soft), h2 "Đã thêm vào ngân hàng" / "Đã lưu bản nháp";
   - Lead: `"{title}" chưa được giao lớp. Giao bài tập ở trang Lớp học khi cần.`;
   - `saved-meta`: Dạng bài (`Task 2 · Discuss both views`), Band mục tiêu, Nguồn (hoặc "Không ghi nguồn"), Trạng thái, Giao lớp — "Chưa giao";
   - CTA: "Tạo đề khác" (reset toàn bộ state về default) + ghost Link "Mở trang Lớp học" → `/classes`.

8. **Data layer + navigation**:
   - `data-actions.ts`: case `create-assignment-prompt` với payload 8 field đúng contract (task/genre/title/band/source/prompt/note/status);
   - `kernelCommand`: trả `{ path: "/api/assignments/prompts", body: action.payload }`;
   - `app-shell.tsx` routeTitles + `routes-matcher.ts` exact route;
   - List page: `<Button onClick={() => navigate({ to: "/assignments/new" })}>+ Tạo bài tập</Button>`; xóa import + render `AddAssignmentModal` + `useState` modal; xóa file modal; dọn test tương ứng.

## Verification

```bash
cd apps/web && npx vitest run          # unit/component hiện hữu phải xanh
pnpm check-types && pnpm check
pnpm dev:web                           # mở /assignments/new soi tay theo design
```

- Soi tay với `assignment-create-3.html` (mở trực tiếp file design): đủ 2 cột, đủ field, chip active đúng, preview cập nhật realtime, action bar sticky.
- Lưu ready + lưu draft: cả hai tạo row ( soi "Đề đã có" có item mới, reload còn nguyên — cần server phase 1 chạy `pnpm dev:server`).
- Submit thiếu tiêu đề/đề: field error, không POST.
- "+ Tạo bài tập" từ /assignments dẫn tới /assignments/new; không còn modal placeholder.
