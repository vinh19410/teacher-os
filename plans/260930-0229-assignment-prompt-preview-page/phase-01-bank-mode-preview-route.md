---
title: "Phase 1: Bank-mode preview route (?id=)"
status: done
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Bank-mode preview route (`?id=`)

## Goal

Route `/assignments/preview` nhận search param `?id=<promptId>`; resolve đề đã lưu
từ snapshot và render trang "góc nhìn học viên" đầy đủ — đồng thời giữ nguyên
hành vi draft mode hiện tại khi không có `id`.

## Context Links

- Route hiện tại: `apps/web/src/routes/_auth/assignments/preview.tsx` (chỉ đọc `readPreviewDraft()` từ sessionStorage)
- Component render giấy bài: `apps/web/src/components/assignments/student-preview-paper.tsx` (`StudentPreviewPaper`)
- Type đề: `AssignmentPrompt` trong `apps/web/src/lib/mock-data.ts:59-85`
- Snapshot → prompt: `apps/web/src/lib/repos/assignment-prompts.ts` (`mapAssignmentPrompts`)
- Data store: `useData()` từ `apps/web/src/lib/data-store.tsx` (re-export `data-provider`; `data.assignmentPrompts: AssignmentPrompt[]`)
- Tiền lệ resolve theo id: `apps/web/src/routes/_auth/assignments/tests/preview.tsx` (`resolveRefDraft`)
- Pattern `validateSearch`: `apps/web/src/routes/login.tsx:20-24`, `_auth/schedule.tsx:32-34`
- Type compat: `QuestionItem = AssignmentQuestion` (`assignment-presets.ts:21`) → `items: prompt.questions` typecheck thẳng.

## Key Insights

- `?id=` hiện diện phải thắng draft cũ trong sessionStorage — draft stale không
  được phép chiếm trang khi người dùng bấm "Xem trước" từ bank.
- `?id=` không tìm thấy → empty state trung thực riêng (copy khác trạng thái
  "Chưa có bản nháp"), có link về `/assignments`. Không `notFound()` throw — đây
  là dữ liệu runtime, đề có thể bị xóa sau khi link được mở; empty state trong
  page thân thiện hơn trang 404.
- Bank mode đổi chrome: breadcrumb `Bài tập › Xem trước` (bỏ nút "Tạo mới" giữa),
  nút back `Quay lại danh sách` → `/assignments`. Draft mode giữ breadcrumb
  `Bài tập › Tạo mới › Xem trước` + nút `Quay lại soạn đề` → `/assignments/new`.

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/assignments/preview.tsx` — thêm `validateSearch`, resolve bank mode, mapping, chrome theo mode, empty state unknown id
- Modify: `apps/web/src/routes/_auth/assignments/preview.test.tsx` — mock `useSearch`, thêm case bank mode
- Không tạo file mới. Không đổi `routeTree.gen.ts` bằng tay (dev server regen).

## Requirements

- [x] FR1: `validateSearch: (search) => ({ id: typeof search.id === "string" ? search.id : undefined })` theo pattern `login.tsx`.
- [x] FR2: Có `id` → `data.assignmentPrompts.find((p) => p.id === id)`; tìm thấy → render `StudentPreviewPaper` + answer sheet mô phỏng (giữ nguyên layout `max-w-3xl`, answer sheet với word count).
- [x] FR3: Mapping `AssignmentPrompt` → props giấy bài (field-for-field, `items: p.questions`, `note: p.note ?? ""`); tất cả field rich-text/passage/intro/cueTopic/cuePoints/audioName/imageUrl/optionBank truyền qua đầy đủ.
- [x] FR4: `id` không hợp lệ → empty state "Không tìm thấy đề…" + link `Link to="/assignments"` về bank.
- [x] FR5: Không `id` → đúng hành vi hiện tại (đọc sessionStorage draft, empty state "Chưa có bản nháp nào để xem trước").
- [x] FR6: NFR — không thêm dependency, không route mới; tôn trọng chuẩn Biome (tab, double-quote theo file hiện tại).

## Implementation Steps

1. Thêm `validateSearch` vào `createFileRoute("/_auth/assignments/preview")`.
2. Trong component: `const { id } = Route.useSearch(); const { data } = useData();`
3. Viết hàm module-level `previewDraftFromPrompt(p: AssignmentPrompt): PreviewDraft` — map field-for-field:
   ```ts
   function previewDraftFromPrompt(p: AssignmentPrompt): PreviewDraft {
     return {
       task: p.task, genre: p.genre, title: p.title, band: p.band,
       source: p.source, prompt: p.prompt, note: p.note ?? "",
       status: p.status, skill: p.skill, part: p.part, type: p.type,
       passage: p.passage, intro: p.intro, transcript: p.transcript,
       cueTopic: p.cueTopic, cuePoints: p.cuePoints, audioName: p.audioName,
       imageUrl: p.imageUrl, optionBank: p.optionBank, items: p.questions,
     };
   }
   ```
4. Resolve theo thứ tự ưu tiên: `id` → bank prompt → tìm thấy thì `draft = previewDraftFromPrompt(prompt)`, `mode = "bank"`; không tìm thấy → render empty state unknown-id. Không `id` → `draft = readPreviewDraft()` (giữ `useState(() => …)` hiện tại), `mode = "draft"`.
5. Điều chỉnh breadcrumb + nút back theo `mode` (xem Key Insights); tiêu đề trang giữ "Xem trước bài tập", lead giữ nguyên — cả hai mode cùng mô tả đúng.
6. Answer sheet mô phỏng + word count giữ nguyên cho cả hai mode (học viên viết bài → xem số từ).

## Todo

- [x] Thêm `validateSearch` + `Route.useSearch` vào preview route
- [x] Viết `previewDraftFromPrompt` + resolve ưu tiên id > draft
- [x] Bank-mode breadcrumb/back button + empty state unknown id
- [x] Unit tests (xem dưới)

## Verification

Unit tests trong `preview.test.tsx` (mock router hiện tại thiếu `useSearch` — mở rộng factory):

```ts
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
  useSearch: () => mockSearch,           // thêm
  Link: (props) => <a href={props.to}>{props.children}</a>,
}));
```

Cases bắt buộc:

- [x] Bank mode: `mockSearch = { id: "p-1" }`, mock `useData` trả fixture prompt (reading có passage + optionBank + questions) → HTML chứa title, passage text, "Ngân hàng lựa chọn", câu hỏi; KHÔNG chứa empty-state copy.
- [x] Ưu tiên id: sessionStorage có draft stale + `mockSearch = { id: "p-1" }` → render đề theo id, không render draft title.
- [x] Unknown id: `mockSearch = { id: "nope" }` → chứa "Không tìm thấy đề" + link `/assignments`.
- [x] Draft mode hồi quy: `mockSearch = {}` + storage draft → các test hiện tại (#213, #269) vẫn pass nguyên.

Chạy:

```bash
pnpm --filter web run test src/routes/_auth/assignments/preview.test.tsx
```

## Risk Assessment

- **Risk**: `routeTree.gen.ts` lệch khi `validateSearch` thêm vào mà không chạy dev/build. **Mitigation**: chạy `pnpm --filter web run check-types` sau khi sửa — vite build kích hoạt regen route tree.
- **Risk**: mock router thiếu `useSearch` làm toàn bộ file test fail. **Mitigation**: bước mở rộng factory trên; test hồi quy draft mode xác nhận không vỡ.

## Security Considerations

- Không có surface mới: route đã nằm sau `_auth`; `imageUrl` đã được `ASSIGNMENT_IMAGE_SRC_PATTERN` chặn bên trong `StudentPreviewPaper` (https-only). Không log, không secret.

## Next Steps

- Phase 2 thêm nút "Xem trước" trong aside ở `/assignments` + e2e.
