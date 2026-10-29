---
phase: 2
title: "Admin: overlay Xem trước + nút trên toolbar"
status: completed
priority: P2
effort: "0.5-0.75d"
dependsOn: [1]
---

# Phase 2 — Overlay Xem trước trong trang soạn đề

## Mục tiêu

Nút **Xem trước** trên toolbar trang soạn mở overlay toàn màn hình render bộ đề theo giao diện học viên, dùng dữ liệu đã lưu + bản nháp; làm thử được, không lưu.

## File sở hữu

| File | Hành động |
|---|---|
| `apps/admin/src/components/library/effective-parts.ts` | sửa — tách `resolveEffectivePart(slot, …) → { input \| null, state }` dùng chung (C4 bắt buộc); `effectivePartsFor` gọi lại |
| `apps/admin/src/components/library/test-preview-model.ts` | tạo — `buildTestPreview({ skill, slots, partsBySlot, drafts, savedInputs })` trả danh sách tab: `{ label, view: { detail, parts } \| null, state: PreviewTabState }` — `PreviewTabState = "ok" \| "saved-fallback" \| "draft-invalid" \| "groups-corrupt" \| "empty"` với `qOffset` theo fold toàn đề. **Tab KHÔNG mang `LibraryPartInput` raw (RT6)** — input full-key (answer/alts/explanation/transcript/note) chỉ sống nội bộ trong model, không qua ranh giới props của overlay |
| `apps/admin/src/components/library/test-preview-model.test.ts` | tạo |
| `apps/admin/src/components/library/test-preview-overlay.tsx` | tạo — UI overlay |
| `apps/admin/src/components/library/test-preview-overlay.test.tsx` | tạo |
| `apps/admin/src/routes/_auth/library/tests/$testId.tsx` | sửa — nút toolbar + state `previewOpen` + mount overlay + **guard autosave header khi preview mở (RT4)** |

## Tham chiếu UI

- Preview giáo viên `apps/web/src/components/assignments/preview-quiz-simulation.tsx` (#285): cách ghép `QuizPaper` + `QuizNavigator` + dòng "Bản mô phỏng — bài làm không được lưu." Overlay admin theo cùng bố cục phần take (không có nút nộp/review theo D3).

## Dữ liệu

- **HAI nguồn tách bạch (RT3 — quyết định red-team):**
  - **Nguồn ĐẾM số (qOffset):** `resolvePartValues` + `computeLibraryTestRanges` từ `test-outline-model.ts` — CÙNG NGUỒN với cây đề (`buildTestOutline`), đếm `value.questions.length` cả khi draft hỏng schema. Đảm bảo `qOffset` khớp `sections[].qStart` trong MỌI trường hợp, kể cả draft hỏng.
  - **Nguồn NỘI DUNG (view):** `resolveEffectivePart` (refactor từ `effectivePartsFor` — C4, bắt buộc): draft dirty và parse OK → draft (`ok`); draft hỏng → bản đã lưu kèm cờ `saved-fallback`; draft hỏng + chưa lưu → `draft-invalid`; `saved.groupsCorrupt` → `groups-corrupt` kèm cờ; slot trống → `empty`/`view: null`. Một bản luật duy nhất, không nhân đôi.
- `qOffset` của mỗi tab = `ranges[i].qStart - 1` từ `computeLibraryTestRanges` (part trống count 0 giữ mốc). Test đối chiếu `sections[].qStart` + case "draft hỏng + saved khác độ dài" (RT3) + case "draft ngắn hơn bản lưu" (C1) + case `draft-invalid` (RT12) + case `groups-corrupt` (RT10) + **R6:** `JSON.stringify(tabs)` không chứa canary nào (chặn lộ đáp án ở ranh giới props).
- Tính bằng `useMemo` trên `deferredDrafts`, chỉ khi overlay đang mở.
- **C1 — answers theo tab:** overlay dùng `Record<slot, Record<number, string>>` (mỗi tab một answers riêng), KHÔNG dùng chung một record — tab `saved-fallback` render bản lưu (n câu) trong khi qOffset theo draft (m câu, m≠n) sẽ đè key sang tab kế nếu chung namespace. Reset toàn bộ khi overlay unmount. Banner tab fallback ghi rõ "số câu theo bản nháp, nội dung theo bản đã lưu".
- **C4 — bắt buộc refactor `effective-parts.ts`:** tách `resolveEffectivePart(slot, …) → { input: LibraryPartInput \| null, state: "ok" \| "saved-fallback" \| "draft-invalid" \| "empty" }` dùng chung; `effectivePartsFor` gọi lại hàm này (một bản luật duy nhất). `buildTestPreview` đọc `saved.groupsCorrupt` để nâng state thành `groups-corrupt`. KHÔNG tự viết lại luật trong model.

## UI overlay

- Container `fixed inset-0 z-50 flex flex-col bg-muted/30`, `role="dialog"`, `aria-modal="true"`, `aria-label="Xem trước bộ đề <title>"`. Admin không có thư viện dialog — theo precedent `apps/admin/src/components/library/delete-test-dialog.tsx`: Esc bắt ở `document`, focus nút đầu khi mở; bổ sung trả focus về nút Xem trước khi đóng và giữ Tab trong overlay.
- Header cao `h-14`: tiêu đề đề, nhãn "Xem trước", nút **Đóng**.
- **Khử overflow split-pane (RT13):** banner + tablist là khối flow bình thường; vùng nội dung bọc `flex-1 min-h-0`, `QuizReadingSplitLayout` nhận `fillParent` (phase 1) để chiếm đúng phần còn lại thay vì calc cứng `100svh - 3.5rem` — banner cao bao nhiêu pane cũng không tràn, navigator không bị đẩy ra viewport.
- Banner ngay dưới header: "Bản xem trước — học viên sẽ thấy giao diện này. Đáp án bạn chọn không được lưu." + cảnh báo part fallback/draft-invalid/groups-corrupt **nêu tên part** (RT12) + ghi chú cờ nhóm chưa hỗ trợ (D7) + khi đề >1 part: nhãn "Bố cục nhiều part là quy ước cho luồng clone sắp tới" (RT16 — không bán preview như bằng chứng parity với take screen hiện tại).
- Thanh tab part (`role="tablist"`, phím mũi tên chuyển tab). Tab `draft-invalid` vẫn hiện nhưng chọn được → trạng thái riêng "Bản nháp hiện không hợp lệ nên chưa hiện trong xem trước" (khác "Part này chưa có nội dung" của slot trống — RT12); tab `groups-corrupt` hiện cấu trúc blob + cảnh báo tương ứng.
- Nội dung tab: `skill === "reading"` và passage không rỗng → `QuizReadingSplitLayout fillParent` + `QuizPaper hidePassage`; còn lại 1 cột `max-w-[720px]` như học viên. Navigator: `QuizNavigator` với parts của tab.
- Part trống (`empty`): trạng thái rỗng "Part này chưa có nội dung".
- Answers: `useState<Record<number,string>>` trong overlay; reset khi overlay unmount.
- **Không có request ghi (RT4):** overlay không mutation/fetch; route guard `onBlur` header — khi `previewOpen` thì HOÃN lưu header (không PATCH), blur sau khi đóng vẫn lưu như cũ. Không gọi `useBlocker`.

## Trang soạn

- Nút `Xem trước` (icon `Eye`, variant outline, size sm) đặt cạnh "Kiểm tra đáp án". Luôn bật khi `detail` đã tải.
- Mở overlay mặc định tab = `currentSlot`.
- Khi overlay mở, khóa cuộn body.

## Các bước

1. Test-first cho `buildTestPreview`: draft hợp lệ được ưu tiên, draft hỏng rơi về saved + cờ `saved-fallback`, draft hỏng + chưa lưu → `draft-invalid`, `groupsCorrupt` → `groups-corrupt`, slot trống → `empty` + `view: null`, `qOffset` khớp `buildTestOutline` (gồm case draft hỏng + saved khác độ dài — RT3).
2. Hiện thực model (tab không mang raw input — RT6).
3. Overlay + test component (Testing Library): mở/đóng, Esc, focus trả về nút, chuyển tab, gõ đáp án không gọi fetch (mock `fetch` assert 0 lần), anti-leak bằng **canary** (RT8): fixture dùng chuỗi unique per field ("CANARY-KEY-42", "CANARY-TRANSCRIPT", "CANARY-NOTE"…) và assert các canary không có trong DOM — không assert chuỗi thật ("TRUE"/"FALSE"/nhãn bank "i" trùng hợp lệ); guard autosave header khi preview mở (RT4).
4. Gắn vào route.

## Verify

```bash
pnpm --filter admin test
pnpm check-types
pnpm check
```

Thủ công: dev stack (`localhost:8004`), mở một bộ đề Reading và một Listening, kiểm tra split-pane, nhóm câu, option bank, pin.

## Rủi ro / rollback

- Overlay chỉ thêm UI, không đụng dữ liệu → rollback bằng revert.
