# Phase 6 — UI CRUD bộ đề (list, create, edit, publish, delete, audio)

## Context

Trang list có bộ lọc trong repo theo mẫu: filter sống trong URL (search param), ô search debounce ~300ms, chip lọc, badge đếm `aria-hidden` (`apps/web/src/components/ui/chip-filter.tsx`, `/assignments`). Dữ liệu qua TanStack Query (không dùng kernel snapshot — admin không có snapshot). Editor nội dung dùng bộ trích ở phase 4; hiển thị rich text luôn qua `RichTextBody` (một sink DOMPurify duy nhất, quy tắc kiến trúc), không thêm `dangerouslySetInnerHTML`.

## Requirements

Routes (TanStack file-based, dưới `_auth/library/tests/`):

| Route | Nội dung |
|---|---|
| `index.tsx` | Bảng: tiêu đề, skill, bộ sưu tập/nhóm, trạng thái, số part/câu, cập nhật; lọc skill + status + search qua URL; nút "Tạo bộ đề"; hành động xóa có xác nhận (modal) |
| `new.tsx` | Form header: tiêu đề, skill (Reading/Listening, không đổi được sau), mô tả, thời gian (mặc định 60 phút), collection, testGroup → POST rồi chuyển sang trang edit |
| `$testId.tsx` | Editor: header (PATCH khi blur/lưu), tab theo slot (`Passage 1..3` hoặc `Section 1..4`), mỗi tab form part, nút Lưu part (PUT), thanh trạng thái "Draft/Ready" với nút **Xuất bản** (PATCH `ready`, hiển thị danh sách lý do nếu 400) và **Hạ về nháp** |

Form part (reading): type (theo `ASSIGNMENT_PART_TYPES`), title, band, source, passage (`RichTextEditor`), `QuestionKeyEditor` (câu hỏi + đáp án + option bank + pin), image URL cho dạng diagram. Listening: tương tự + transcript (rich text), **upload audio** (dropzone, tiến độ, hiển thị tên/size, `<audio controls>` phát qua `GET …/audio`, nút xóa/thay).

Hành vi:
- `canSave` dùng chính `validatePartForReady` (phase 2) để nút Xuất bản không lệch với server.
- Part chưa lưu có dấu chấm cảnh báo; rời trang khi còn thay đổi chưa lưu → xác nhận.
- Test `ready` hiển thị khóa xóa part/audio với giải thích; sửa nội dung vẫn được (server re-validate).
- Tab part chưa có dữ liệu hiển thị trạng thái rỗng + nút "Thêm nội dung".
- Lỗi mạng/4xx hiển thị toast (sonner) kèm thông điệp tiếng Việt; copy toàn UI tiếng Việt.
- A11y: tab bằng bàn phím, focus ring, nhãn form, trạng thái `aria-live` cho kết quả lưu.

## Files

Tạo trong `apps/admin/src/`: `routes/_auth/library/tests/{index,new,$testId}.tsx`, `lib/repos/library.ts` (hàm fetch + query options + mutation, zod parse bằng DTO từ `library-contracts`), `components/library/{test-table,test-header-form,part-tabs,part-form,audio-uploader,publish-bar,delete-test-dialog}.tsx`, test cho từng component logic chính (`part-form`, `audio-uploader`, `publish-bar`, filter URL).
Sửa: `routeTree.gen.ts` (tự sinh).

## Steps

1. Repo layer + test (mock fetch ở biên mạng theo pattern test web hiện có, không mock logic nghiệp vụ).
2. List + filter URL + xóa.
3. Create + header form.
4. Editor part Reading (rich text + QuestionKeyEditor), rồi Listening + audio.
5. Publish/unpublish và hiển thị lỗi `ready`.
6. Rà `DESIGN.md`, kiểm 3 viewport thủ công trên dev server.

## Validation

```bash
pnpm --filter admin test
pnpm --filter admin check-types && pnpm check
```

Cộng với kiểm tay: tạo một đề Reading 3 passage nhiều dạng câu và một đề Listening 4 section có audio thật 10MB; xuất bản; hạ nháp; xóa.

Pass khi: mọi acceptance criterion liên quan UI trong `plan.md` thỏa; không có `dangerouslySetInnerHTML` mới (`grep` kiểm).

## Risks / Rollback

- Payload part lớn (passage 20k ký tự + 40 câu) trong một PUT: nằm trong giới hạn Worker; không phân trang.
- Upload dài: dùng `XMLHttpRequest` hoặc `fetch` với `duplex` để có tiến độ; chọn một cách, ghi lý do vào code nếu khác pattern student (speaking upload là precedent, đọc `packages/ui/src/components/quiz/media-dropzone.tsx` trước).
- Rollback: toàn bộ nằm trong `apps/admin`, revert commit.
