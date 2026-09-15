---
phase: 4
title: "Import ở màn hình detail + cảnh báo ghi đè"
status: todo
priority: P1
effort: "4h"
dependencies: [1, 3]
---

# Phase 4: Import ở màn hình detail + cảnh báo ghi đè

## Goal

Màn hình syllabus detail có nút "Nhập từ Excel/CSV": chọn file → parse client-side → preview → bấm "Ghi đè nội dung" → modal cảnh báo nêu rõ dữ liệu hiện tại sẽ bị xóa và thay bằng dữ liệu file → chỉ khi user xác nhận mới gọi `POST /api/syllabi/:id/replace-content`; hủy thì không đổi gì.

## Context Links

- Scout report: `reports/scout-report.md` (mục 1, 2)
- Quyết định D4, D5 trong `plan.md`
- Phase 1 (endpoint) và Phase 3 (parser v3 + `SyllabusImportPreview`) phải đã xong
- Pattern gọi action trực tiếp: `run(key, action, successText)` của `useDirectKernelAction` (`apps/web/src/lib/use-direct-kernel-action.ts:6-14`) — xem ví dụ `remove-curriculum` trong `curriculum-management-section.tsx` dòng 327–334

## Files to Create / Modify

- Modify: `apps/web/src/lib/data-actions.ts` (thêm action `replace-syllabus-content`)
- Modify: `apps/web/src/lib/repos/kernel.ts` (case mới trong `kernelCommand`)
- Modify: `apps/web/src/lib/use-direct-kernel-action.ts` (run trả `KernelCommandResult` — backward-compatible)
- Modify: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` (nút + preview + modal)
- Create: `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts`

## Tasks & Steps

### Task 4.1 — Action client `replace-syllabus-content`
- Goal: typed action + mapping sang endpoint mới.
- Target files: `apps/web/src/lib/data-actions.ts` (thêm vào union cạnh `add-syllabus` dòng 90–103), `apps/web/src/lib/repos/kernel.ts` (case mới trong `kernelCommand`, cạnh case `add-syllabus` dòng 80–92).
- Steps:
  1. `data-actions.ts` — thêm thành viên union:
     ```ts
     | {
         /** Ghi đè toàn bộ cây module/buổi học từ import Excel/CSV ở màn hình detail. */
         type: "replace-syllabus-content";
         syllabusId: string;
         modules: SyllabusModuleContent[];
       }
     ```
     (type `SyllabusModuleContent` đã được import sẵn ở đầu file.)
  2. `repos/kernel.ts` — thêm case:
     ```ts
     case "replace-syllabus-content":
       return {
         path: `/api/syllabi/${action.syllabusId}/replace-content`,
         body: { modules: action.modules },
       };
     ```
- Success criteria: typecheck qua; dispatch action tạo POST đúng path với body `{modules}`.
- Verify: `pnpm check-types` exit 0.

### Task 4.2 — UI import + modal cảnh báo ở trang detail
- Goal: đủ flow chọn file → preview → xác nhận → ghi đè (hoặc hủy) trên `/syllabus/:id` của **template** (`sy.classId === null`); bản copy của lớp không hiện nút import.
- Target files: `apps/web/src/lib/use-direct-kernel-action.ts`, `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`.
- Steps:
  1. **Hook trả kết quả**: trong `use-direct-kernel-action.ts`, đổi `run` để trả về `KernelCommandResult` (import type từ `@/lib/repos/kernel`):
     ```ts
     run: (key: string, action: KernelAction, successText: string) => Promise<KernelCommandResult>,
     ```
     phần thân: `const result = await dispatch(action); await reportDirectOutcome(result, successText, refresh, action.type); return result;`. Signature mở rộng là backward-compatible — các caller hiện có bỏ qua return.
  2. Imports trong `$syllabusId.tsx`: `useRef` thêm vào import react; `parseSyllabusFile`, `type SyllabusImportResult` từ `@/lib/syllabus-import`; `SyllabusImportPreview` từ `@/components/syllabus/import-preview`; `Modal` từ `@/components/ui/modal`. Lấy `refresh` từ `useData()` (đã có sẵn trong provider: `const { dispatch, refresh } = useData()`).
  3. Trong `SyllabusDetail`, thêm state + ref:
     ```ts
     const fileInputRef = useRef<HTMLInputElement>(null);
     const [importResult, setImportResult] = useState<SyllabusImportResult | null>(null);
     const [parsing, setParsing] = useState(false);
     const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
     ```
  4. Thêm `onFileChange` (mirror `add-syllabus-modal.tsx` dòng 68–80, không set total):
     ```ts
     async function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
       const file = e.target.files?.[0];
       e.target.value = "";
       if (!file) return;
       setParsing(true);
       try {
         setImportResult(await parseSyllabusFile(file));
       } finally {
         setParsing(false);
       }
     }
     ```
  5. Hàng nút "Nội dung giáo trình" (dòng 163–172): **chỉ khi `sy.classId === null`** thêm hidden input `<input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onImportFileChange} />` và nút `<Button type="button" variant="secondary" size="sm" disabled={parsing || busy} onClick={() => fileInputRef.current?.click()}>Nhập từ Excel/CSV</Button>` cạnh nút "+ Thêm module". (Bản copy của lớp KHÔNG có nút — ghi đè copy sẽ xóa tiến độ sống của lớp.)
  6. Dưới hàng nút, khi có kết quả parse render:
     - `{parsing && <p className="text-xs">Đang đọc file…</p>}`
     - `<SyllabusImportPreview result={importResult} onRemove={() => setImportResult(null)} disabled={busy || parsing} />`
     - Khi `importResult?.ok`: nút "Ghi đè nội dung" mở confirm modal QUA handler async (refresh snapshot trước để số liệu cảnh báo không stale đa-tab):
     ```ts
     async function openOverwriteConfirm() {
       await refresh(); // snapshot mới nhất → counts trong modal chính xác
       setConfirmOverwriteOpen(true);
     }
     ```
  7. Modal xác nhận (đặt cạnh các modal cuối file, mirror cấu trúc modal "Gỡ giáo trình" `curriculum-management-section.tsx` dòng 303–339). Trước JSX, thêm biến Derived để TypeScript narrowing giữ được qua closure:
     ```ts
     const pendingImport = importResult && importResult.ok ? importResult : null;
     const currentLessons = sy.modules.reduce((s, m) => s + m.lessons.length, 0);
     ```
     - `open={confirmOverwriteOpen}`, `onClose={busy ? () => undefined : () => setConfirmOverwriteOpen(false)}`, title `"Ghi đè nội dung giáo trình?"`.
     - Body:
       ```
       Toàn bộ nội dung hiện tại — {sy.modules.length} module · {currentLessons} buổi học — sẽ bị XÓA và thay bằng {pendingImport?.modules.length ?? 0} module · {pendingImport?.lessonCount ?? 0} buổi học từ file. Hành động này không thể hoàn tác. Các lớp đã nhập bản sao từ template này không bị ảnh hưởng.
       ```
       (Câu cuối luôn đúng vì nút chỉ tồn tại trên template.)
     - Nút "Hủy" (variant secondary, disabled `busy`) và nút "Ghi đè" (variant danger, disabled `busy || !pendingImport`) với `onClick`:
       ```ts
       if (!pendingImport) return;
       setConfirmOverwriteOpen(false);
       const result = await run(
         "replace-syllabus-content",
         {
           type: "replace-syllabus-content",
           syllabusId: sy.id,
           modules: pendingImport.modules,
         },
         "Đã ghi đè nội dung giáo trình.",
       );
       // Chỉ clear preview khi write chắc chắn đã land (refreshed/committed);
       // definite-failure (4xx) giữ nguyên preview để user sửa rồi retry.
       if (result.kind === "refreshed" || result.kind === "committed") {
         setImportResult(null);
       } else {
         setConfirmOverwriteOpen(true); // mở lại để retry sau khi toast lỗi
       }
       ```
  8. Đảm bảo khi `importResult` là nhánh lỗi: KHÔNG render nút "Ghi đè nội dung"; chỉ preview lỗi.
- Success criteria: flow đầy đủ hoạt động trên template; bản copy lớp không có nút; hủy ở modal không gửi request; xác nhận thay cây, toast thành công hiện; lỗi 4xx giữ preview và mở lại modal.
- Verify: Task 4.3 e2e khóa; trung gian `pnpm check-types` exit 0.

### Task 4.3 — E2E spec mới + gate toàn repo
- Goal: khóa hành vi ghi đè bằng e2e; toàn repo xanh.
- Target files: Create `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts`.
- Steps:
  1. Test "ghi đè sau xác nhận thay cây, hủy giữ nguyên":
     - `signUpViaUi(page)` → `/syllabus` → "+ Tạo syllabus" → điền tên + skill "Writing", KHÔNG file → "Tạo" (chờ URL `/syllabus/...`).
     - Trên detail: "+ Thêm module" → modal → điền title "Module thủ công" → lưu → thấy "Module thủ công".
     - Bấm "Nhập từ Excel/CSV" → `setInputFiles("input[type=file]", "fixtures/syllabus-import.sample.csv")` → thấy "2 module · 3 buổi học" → bấm "Ghi đè nội dung" → dialog "Ghi đè nội dung giáo trình?" hiện, chứa text "sẽ bị XÓA" và "1 module" (cây hiện tại).
     - Bấm "Hủy" → dialog đóng → "Module thủ công" VẪN hiển thị.
     - Bấm "Ghi đè nội dung" lại → "Ghi đè" (danger) → chờ toast/text "Đã ghi đè nội dung giáo trình." → "Module thủ công" biến mất, "Module 1 — Nền tảng" và "Buổi 1" hiển thị, và StatCard "tổng buổi" hiển thị "3" (khóa totalLessons qua UI).
  2. Chạy spec: `pnpm --filter e2e e2e` — toàn bộ (cũ + mới) exit 0.
- Success criteria: spec pass; không flake do chờ snapshot (dùng `expect(...).toBeVisible()` với timeout mặc định).
- Verify:
  1. `pnpm --filter e2e e2e` → exit 0
  2. `pnpm --filter web test` → exit 0
  3. `pnpm --filter server test` → exit 0
  4. `pnpm check-types` → exit 0
  5. `pnpm check` → exit 0

## Verification (regression gate toàn plan)

Sau khi phase 4 xong, chạy tổng từ root:
1. `pnpm test` → exit 0 (turbo: web + server + ci-workflow + topology-drift)
2. `pnpm check-types` → exit 0
3. `pnpm --filter e2e e2e` → exit 0

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
