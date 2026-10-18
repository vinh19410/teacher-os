---
title: "Phase 4: Teacher UI"
status: completed
priority: P2
effort: 6h
dependencies: ["phase-03"]
---

# Phase 4: Teacher UI

## Overview

Dialog "Thêm từ thư viện" trong tab Từ vựng của trang lớp: duyệt 2 bước course → lesson, search + multi-select, confirm rồi clone qua command bus. Kèm badge "Thư viện" cho deck có `sourceLibraryDeckId` và cảnh báo khi lớp đã có bài đó. Chỉ đụng apps/web.

## Context Links

- Scout report mục 2 (UI hiện trạng).
- Entry point: `apps/web/src/routes/_auth/classes/$classId.tsx:289` render `<VocabDeckList classId={classId} />` (tab vocab khai :282); component `apps/web/src/components/vocab/vocab-deck-list.tsx:17` (hàng deck :75-110, nút "Tạo bộ từ" :63-65, modal patterns :114-177).
- Fetch ngoài snapshot precedent: `vocab-deck-editor.tsx:36-51` — fetch thẳng kernel sub-route với `credentials: "include"`, state loading/error tay.
- Command bus: action union `apps/web/src/lib/data-actions.ts:242-269`; wire mapping `apps/web/src/lib/repos/kernel.ts:278-303` (case `create-vocab-deck` :278-283); result semantics `refreshed/committed/definite-failure/outcome-unknown` (`repos/kernel.ts:357-362`, guard `result.kind !== "refreshed"` trong `vocab-deck-list.tsx:39`); snapshot adapter `vocabDecks` `repos/kernel.ts:333`; envelope parse `repos/kernel.ts:391-397`, `parseErrorReason` `:415`.
- Field mới từ Phase 1/3: `KernelVocabDeckRow.sourceLibraryDeckId` (contracts.ts:2166-2173), `vocabTeacherWord.audioUrl`.
- DESIGN.md: Modal (overlay `bg-black/60 backdrop-blur-sm`, panel `neu rounded-md`), nút chính = mực (`bg-fg`), secondary = `neu-sm`, badge mono 10px uppercase tracking-widest, chip chọn = nền chìm + chữ cam, focus ring cam 2px, motion 150ms.
- REVIEW.md: verify 3 viewport + keyboard focus (AGENTS.md quy ước UI).

## Key Insights

- **Clone đi qua command bus, browse đi fetch trực tiếp**: mutation cần semantics trung thực (refreshed = snapshot đã cập nhật, deck mới hiện ngay kèm badge) và outcome-unknown cần chặn double-clone; browse là read thoáng nên dùng pattern `vocab-deck-editor.tsx` (useEffect + loading/error state), không nhét catalog vào snapshot.
- **"Đã có trong lớp" suy diễn client + xác nhận server**: so `snapshot.vocabDecks` theo `sourceLibraryDeckId` cho chip khi mở dialog, NHƯNG snapshot có thể stale (2 giáo viên cùng org mở dialog song song) — response clone của Phase 3 trả `duplicates: string[]` (existence check server-side) nên dialog hiện cảnh báo hậu-hợp từ chính kết quả, snapshot-free.
- **Search trong dialog là state cục bộ, không đẩy URL**: quy ước filter-in-URL của AGENTS.md áp cho trang list dạng route (`/assignments`); dialog là modal thoáng (precedent: deck editor không dùng URL), tránh ô nền URL khi đóng mở.
- **Cap hiện ra trước khi bấm**: tổng từ của lựa chọn hiển thị ở footer; vượt **50 decks HOẶC decks + từ > 500** (cap tổng statements của server — Phase 3) thì nút clone disable kèm nhãn giải thích — error 422 của server vẫn xử lý như definite-failure để phòng lệch.
- **Course lớn (130 decks) clone theo lượt**: khi "chọn tất cả" vượt cap, dialog cho chọn tối đa một nhóm hợp lệ và gợi ý "còn N bài — clone thêm lượt nữa"; không tự loop nhiều request (giữ một hành động = một kết quả rõ).

## Requirements

- [x] Nút "Thêm từ thư viện" (secondary) cạnh "Tạo bộ từ" trong `vocab-deck-list.tsx`.
- [x] Dialog 2 bước: (1) list course (search, hiển thị `deckCount`), (2) list deck của course (search debounce ~300ms, checkbox multi-select, `wordCount`, dấu "đã có trong lớp").
- [x] Footer confirm: đếm decks/từ đã chọn, disable + giải thích khi vượt cap (50 decks hoặc decks+từ > 500), nút "Thêm vào lớp" gọi command `clone-vocab-library-decks`; trạng thái loading/error/committed đúng bus semantics; response `duplicates` không rỗng → toast cảnh báo bài trùng.
- [x] Badge "Thư viện" (mono 10px uppercase, `neu-in`) trên hàng deck có `sourceLibraryDeckId != null`.
- [x] Word editor hiển thị "Đã có audio" khi `audioKey || audioUrl` (`vocab-word-row.tsx:87`).
- [x] Web vitest cho dialog: filter course/deck, chọn/limit cap, cảnh báo trùng, dispatch payload đúng.
- [x] DESIGN.md compliance + keyboard (focus trap modal sẵn của `Modal`, focus ring, Enter/Space trên checkbox) + 3 viewport screenshot.

## Architecture

Component tree (mọi file mới dưới `apps/web/src/components/vocab/`):

```
VocabDeckList (sửa: thêm nút + badge + truyền classId)
└── VocabLibraryDialog (mới; Modal, title "Thêm từ thư viện")
    ├── Bước 1 — CourseListStep
    │   ├── fetch GET /api/kernel/vocab-library/courses (mỗi lần mở dialog)
    │   ├── Input search (state, lọc theo name)
    │   └── danh sách hàng course: tên + description rút gọn + deckCount (font-mono) + nút Chọn
    ├── Bước 2 — DeckListStep
    │   ├── fetch GET /api/kernel/vocab-library/courses/:courseId/decks
    │   ├── Input search (debounce 300ms, lọc theo title) + nút Quay lại
    │   ├── checkbox hàng deck: title + wordCount + chip "Đã có trong lớp" khi snapshot trùng sourceLibraryDeckId
    │   └── "Chọn tất cả (trang này)" subject cap
    └── ConfirmFooter
        ├── nhãn "x bộ · y từ" (x > 50 hoặc x + y > 500 → disable + chữ cam giải thích)
        └── Button "Thêm vào lớp" → dispatch({ type: "clone-vocab-library-decks", payload: { classId, deckIds } })
            (response `duplicates` không rỗng → toast cảnh báo "N bài đã có trong lớp từ trước")
```

Command mapping thêm vào `commandToRequest` (`repos/kernel.ts` sau case :297): `{ path: "/api/kernel/vocab-library/clone", body: { ...action.payload } }`. Action type thêm vào `data-actions.ts` cạnh :269.

## Related Code Files

- Create: `apps/web/src/components/vocab/vocab-library-dialog.tsx`, `apps/web/src/components/vocab/vocab-library-dialog.test.tsx`.
- Modify: `apps/web/src/components/vocab/vocab-deck-list.tsx` (nút + badge + dialog mount), `apps/web/src/components/vocab/vocab-word-row.tsx` (:87 điều kiện audio), `apps/web/src/lib/data-actions.ts` (action mới), `apps/web/src/lib/repos/kernel.ts` (case wire mới).
- Fixture nếu compile đòi: `apps/web/src/lib/kernel-state.test.ts`, `apps/web/src/lib/repos/kernel.test.ts` (chỉ khi fixture dựng `KernelVocabDeckRow` đầy đủ — đã có `sourceLibraryDeckId` bắt buộc trong type).

## Implementation Steps

1. Thêm action `clone-vocab-library-decks` vào `data-actions.ts` (payload `{ classId, deckIds: string[] }`) và case wire vào `repos/kernel.ts`; chạy `pnpm --filter web test -- kernel` để xác nhận không vỡ test bus hiện có.
2. Viết `vocab-library-dialog.tsx` theo component tree: state máy `$step: "courses" | "decks"`, `$courses/$decks/$loading/$loadError`, `$selected: Map<deckId, wordCount>`; fetch helpers copy pattern `vocab-deck-editor.tsx:36-51` (đủ 2 endpoint GET).
3. Debounce search 300ms bằng `useEffect` + timer (không cần thư viện); footer tính `totalWords = sum(selected.values())`, disable khi `selected.size > 50 || selected.size + totalWords > 500` và hiển thị nhãn cam.
4. Wire confirm: `dispatch` → `result.kind === "refreshed"`: nếu envelope có `duplicates` không rỗng thì toast cảnh báo "một số bài đã có trong lớp" rồi đóng dialog, không thì toast thành công + đóng; `committed` → toast "đã lưu nhưng chưa xác nhận danh sách — tải lại trang"; `definite-failure` (422/404/400) → toast lỗi kèm `reason` từ envelope (`parseErrorReason`, `repos/kernel.ts:415`); `outcome-unknown` → banner khuyên kiểm tra trước khi thử lại.
5. Sửa `vocab-deck-list.tsx`: nút "Thêm từ thư viện" (`variant="secondary"`, `data-testid="vocab-add-from-library"`) cạnh nút tạo; badge trong hàng deck khi `deck.sourceLibraryDeckId != null`; mount dialog.
6. Sửa `vocab-word-row.tsx:87`: `row.audioKey || row.audioUrl` (label giữ "Đã có audio").
7. Viết `vocab-library-dialog.test.tsx` (testing-library + `renderWithKernel` harness `apps/web/src/test/kernel-harness.tsx`): mock fetch 2 endpoint (pattern test repos hiện có), assert lọc course, chọn 2 deck → payload dispatch đúng, vượt cap disable, chip "Đã có trong lớp" hiện khi fixture snapshot có `sourceLibraryDeckId` trùng.
8. Tự kiểm REVIEW.md: chạy web app (`pnpm dev:web` + `pnpm dev:server`), thử flow thật, chụp 3 viewport (1440×900, 768×1024, 375×812), kiểm tra keyboard-only mở dialog → chọn → clone.

## Todo

- [x] Action + wire command bus
- [x] Dialog 2 bước + search + cap footer
- [x] Badge "Thư viện" + "Đã có audio" theo audioUrl
- [x] Web test pass + screenshot 3 viewport

## Success Criteria

- `pnpm --filter web test` pass (dialog test + không vỡ test bus/snapshot hiện có).
- `pnpm check` sạch (biome).
- Thủ công trên dev stack: teacher tạo lớp → thêm 2 bài từ thư viện → deck hiện kèm badge; chọn bài đã có → chip cảnh báo; clone xong bấm "Soạn từ vựng" thấy từ + "Đã có audio".
- Screenshot 3 viewport đính kèm PR; điều hướng keyboard hoàn tất được flow không cần chuột.

## Risk Assessment

- **Dialog phình logic fetch + selection** (likelihood trung, impact thấp): giữ mọi fetch trong dialog, không đụng data-store reducer; nếu vượt ~400 dòng thì tách `useLibraryCatalog` hook cùng file domain.
- **Snapshot chưa refresh khi dialog đóng** (likelihood thấp, impact trung): chỉ đóng trên `refreshed` (bus đã đảm bảo snapshot mới); `committed` giữ dialog mở với banner — test bước 7 cover nhánh này.
- **Fixture type vỡ hàng loạt vì field bắt buộc mới** (likelihood trung, impact thấp): `sourceLibraryDeckId` nằm trong `KernelVocabDeckRow` (interface, không zod runtime cho snapshot web) — `pnpm check-types` chỉ ra chính xác các fixture literal; sửa kèm default `null`.

## Security Considerations

- Không render URL CDN trực tiếp trong UI teacher (audio/hình library không được nhúng iframe/img chéo origin trong web app — tránh mixed-content; chỉ tên + số đếm).
- Payload clone do server kiểm tra lại (Phase 3), client chỉ convenience — không tin đầu.
- Không thêm secret; `credentials: "include"` đúng precedent fetch kernel.

## Next Steps

Phase 5 khóa hết bằng e2e trên UI thật (boot đã seed thư viện từ Phase 2): teacher thật bấm nút thật, clone thật, student học được.
