---
title: "Phase 6: Teacher UI + E2E + Verification"
status: todo
---

# Phase 6: Teacher UI + E2E + Verification

## Context Links

- Kernel store teacher app: `apps/web/src/lib/data-provider.tsx`, `kernel-state.ts` (snapshot-once; mutation qua data-actions gọi kernel commands).
- List + filter convention (AGENTS.md): filter sống URL, debounce ~300ms, chip theo `apps/web/src/components/ui/chip-filter.tsx`, mẫu trang `/assignments`.
- Upload component có sẵn: `packages/ui` `media-dropzone` (mục scout #8).
- E2E: `apps/e2e/specs/` (48 specs `*.spec.ts`; boot 3 webServer port 8100/8101/8103; tz Asia/Ho_Chi_Minh; workers 1); seed trực tiếp libsql precedent `apps/e2e/src/account-seed.ts:8-13`.
- Verdict/testid convention: `verdict-correct/wrong` token; testid pattern hiện có (vd. `attempt-grade-body`).

## Overview

Phần giao diện giáo viên (quản lý deck + từ + audio) và lớp verification cuối: e2e spec vocab SRS + full gate local. Đây là phase đóng gói để cook xong ship được.

## Key Insights

- **Teacher UI tối giản**: 1 section "Từ vựng" trong class detail (danh sách deck + đếm từ) + 1 màn soạn deck (bảng từ: word/translation/IPA/sortOrder/audio, thêm/sửa/xoá inline). KHÔNG làm analytics per student (Out of Scope plan.md).
- **Mutation qua kernel commands** (vocab-teacher routes Phase 3) + optimistic update theo pattern data-actions hiện có; snapshot chỉ thêm `vocabDecks` (Phase 3) — words editor load per-deck qua GET sub-route (KHÔNG qua snapshot). `KernelSnapshot` thêm key required → cập nhật factory `apps/web/src/test/kernel-harness.tsx:19` (default `vocabDecks: []`) + rà 12 file test fixture tham chiếu `KernelSnapshot` (red-team F11).
- **E2E không time-travel được** (không thể đợi 1/3/7 ngày): spec xác nhận (a) Learn flow đầy đủ → commit → countdown hiện "1d 0h"; (b) Review flow trên card đã due bằng cách **seed trực tiếp `dueAt` quá khứ vào libsql `local.db` từ spec process** (pattern `apps/e2e/src/account-seed.ts:8-13` — mở connection riêng, an toàn nhờ `workers: 1`; red-team F15: **CẤM "server helper" route test-only** — nguy cơ backdoor mutate prod). Toán applyAnswer đã có unit test vectors phủ.
- **Migration numbering thực tế lúc cook**: chạy `pnpm db:generate` lấy số kế tiếp; nếu P1 #358 đã chiếm thì vocab lấy số sau — journal tự xếp.

## Requirements

- [ ] Web: section "Từ vựng" trong class detail (`routes/_auth/classes/$classId.tsx`) — list deck + đếm từ, nút tạo deck; màn soạn deck CRUD từ + upload audio (media-dropzone → PUT kernel Phase 3) + sắp xếp (sortOrder); words load per-deck qua GET sub-route.
- [ ] Kernel store: consumer hooks + data-actions cho vocab mutations; factory `kernel-harness.tsx` + fixture tests cập nhật cho key `vocabDecks` mới (required).
- [ ] E2E spec `vocab-srs.spec.ts`: teacher tạo deck 3 từ (1 từ có audio upload) → student join → Learn session hoàn tất (intro lật, trả lời scored steps) → summary Learned 3 → overview countdown; seed card due quá khứ → Review session: đúng/sai/wrong-streak visible, requeue, evict 2 forgot; teacher xoá deck → student overview mất deck nhưng streak giữ.
- [ ] Gate local pass toàn bộ (danh sách ở Success Criteria plan.md).

## Architecture

```
apps/web/src/
├── components/vocab/
│   ├── vocab-deck-list.tsx        # section trong class detail
│   ├── vocab-deck-editor.tsx      # bảng từ CRUD + audio + reorder
│   └── vocab-word-row.tsx
├── routes/... (nếu route riêng — theo cấu trúc routes của class detail hiện có; ưu tiên section trong routes/classes/$classId.tsx)
└── lib/data-actions.ts (thêm action vocab*) hoặc data-actions-vocab.ts tách riêng
apps/e2e/specs/vocab-srs.spec.ts
```

## Related Code Files

- Create: components.vocab trên, `apps/e2e/specs/vocab-srs.spec.ts`.
- Modify: route class detail (thêm section), kernel data-actions/mapper (nếu file chung), có thể `apps/e2e/src/boot.ts` (helper seed card due quá khứ).

## Implementation Steps

1. Thêm vocab vào kernel consumer/mapper (rows từ snapshot — Phase 3 đã thêm payload;这边 chỉ type + store).
2. Viết `vocab-deck-list` + `vocab-deck-editor` theo DESIGN.md; filter chip theo convention (URL param, debounce 300ms); bảng từ dùng input inline + media-dropzone cho audio; xoá deck có confirm dialog (destructive dùng `--destructive`).
3. Nối data-actions → kernel commands (deck create/rename/delete, word upsert/remove, audio set).
4. Viết e2e spec theo kịch bản Requirements; seed helper cho card due quá khứ; chờ audio upload xong trước khi student flow (play pause không cần assert âm thanh — chỉ assert player render + không lỗi).
5. Chạy toàn gate: `pnpm check` && `pnpm check-types` && `pnpm --filter server run test` && `pnpm --filter student run test` && `pnpm --filter web run test` && `pnpm --filter @teacher-os/api run test` && `pnpm --filter e2e e2e` (E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103) && `node packages/api/src/srs/vectors/generate-level-vectors.mjs --check`.
6. Chụp screenshot teacher (deck editor) + student (session, summary) 3 viewport đính PR; viết DEPLOY ORDER note vào PR body (migration trước worker; server+student cùng release train).

## Todo

- [ ] Kernel consumer + mapper vocab
- [ ] Deck list + editor + data-actions
- [ ] E2E spec vocab (learn + review + delete deck)
- [ ] Full gate pass + screenshots

## Success Criteria

- Gate local toàn bộ pass (không skip test).
- E2e spec xanh ổn định 2 lần chạy liên tiếp (vocab không flake — dùng seeded data, không đợi thời gian thực).
- PR body có screenshot + deploy order; các testid mới đặt tên `vocab-*` nhất quán.

## Risk Assessment

- **Kernel snapshot phình** (payload thêm 2 entity): decks/words nhỏ (hàng trăm row); mapper tách — theo dõi kích thước payload snapshot sau khi thêm, nếu lớn thì lazy-load riêng endpoint (follow-up).
- **E2e audio upload**: media-store e2e dùng local dir (MEDIA_DIR) — boot e2e đã dựng sẵn; chỉ cần upload qua UI teacher đúng flow (lesson #15 P1: không seed file ngoài media API).
- **Flake listeningChoice e2e**: không assert audio played (autoplay policy) — chỉ assert player + chọn option.

## Security Considerations

- Teacher mutation qua kernel Origin check (middleware sẵn); student KHÔNG có route teacher.
- Upload audio: giới hạn MIME audio/* + size theo media-store hiện có; không serve executable.
- Xoá deck là destructive — confirm dialog + cascade đã test server (Phase 3).
