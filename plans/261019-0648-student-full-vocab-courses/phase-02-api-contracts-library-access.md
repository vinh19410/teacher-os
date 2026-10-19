---
title: "Phase 2: API Contracts & Dual-Source Student Provisioning"
status: done
---

# Phase 2: API Contracts & Dual-Source Student Provisioning

## Context Links

- Contracts: [`packages/api/src/contracts.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/api/src/contracts.ts) (lines 2200–2562)
- Contract tests: [`packages/api/src/vocab-contracts.test.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/packages/api/src/vocab-contracts.test.ts)
- Provision helper: [`apps/server/src/lib/vocab-provision.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/server/src/lib/vocab-provision.ts)

## Overview

Mở rộng Zod contracts trong `@teacher-os/api/contracts` cho phép học viên duyệt danh mục khóa học/bài học từ vựng kèm số liệu tiến độ cá nhân (`reviewWordCount`/`reviewCount`, `learnedWordCount`/`learnedCount`, `dueWordCount`/`dueCount`), mở rộng nguồn deck (`source: "class" | "suggested" | "library"`), và chặn tiền tố ID dành riêng (`libcourse-*`, `libdeck-*`, `libword-*`) trên các schema tạo deck/word của giáo viên. Refactor `apps/server/src/lib/vocab-provision.ts` để hỗ trợ song song (dual-source) cả `vocab_deck`/`vocab_word` lẫn `vocab_library_deck`/`vocab_library_word` với cơ chế bảo vệ cứng giới hạn 100 biến SQL của Cloudflare D1.

## Key Insights

- **Chống chiếm quyền / xung đột ID đa hình (`libcourse-*`, `libdeck-*`, `libword-*` — RT-F1)**:
  - Trong `vocabDeckCreateSchema` (`packages/api/src/contracts.ts:2206`) và `vocabWordUpsertSchema` (`packages/api/src/contracts.ts:2237`), trường `id` tùy chọn do client gửi lên phải chặn tiền tố dành riêng của thư viện: `.refine((id) => !id || !/^(libcourse|libdeck|libword)-/i.test(id), "Reserved library ID prefix")`.
- **Zod `.strict()` và tương thích release train (#319, #363 RT-F4, RT-F9)**:
  - Trong `vocabOverviewDeckSchema` (`packages/api/src/contracts.ts:2471`), mở rộng `source` thành `z.enum(["class", "suggested", "library"]).catch("class")`.
  - Trong `vocabStudentProgressDeckSchema` (`packages/api/src/contracts.ts:2401`), mở rộng `source` thành `z.enum(["class", "suggested", "library"]).catch("class")` VÀ thêm `className: z.string().catch("")` để tab "Tiến độ" của giáo viên hiển thị được tên khóa học (`Khóa ${deck.className}`).
- **Phản ánh tức thì tiến độ sau phiên Learn (`level = 1, state = "review"` — RT-F8)**:
  - Khi học viên hoàn thành phiên **Learn**, `learned(card, now)` (`packages/api/src/srs/scheduler.ts:70-79`) đặt `state = "review", level = 1, dueAt = now + DAY_MS`. Nếu chỉ có `learnedWordCount` (`level >= 2`) và `dueWordCount` (`dueAt <= now`), cả hai đều bằng `0` ngay sau khi học xong bài đầu tiên!
  - Do đó, `vocabStudentLibraryCourseSchema` bổ sung `reviewWordCount: z.number().int().min(0)` (tổng số từ đã qua phiên Learn, tức `state === "review"`), và `vocabStudentLibraryDeckSchema` bổ sung `reviewCount: z.number().int().min(0)`.
- **Dual-source cho `ensureDeckCards(db, studentId, orgId, deckId)` & bảo vệ giới hạn 100 biến SQL của D1 (`vocab-provision.ts:169` — RT-F2, RT-F5)**:
  - Nếu `deckId` bắt đầu bằng `libdeck-`, đi thẳng vào nhánh `vocab_library_deck` (không query `vocab_deck`). Ngược lại, thử `vocab_deck` thỏa `studentCanAccessDeckCondition(studentId, orgId)` trước.
  - Trên nhánh `vocab_library_deck`, dùng mốc thời gian cố định `LIBRARY_DECK_BASE_MS = 1_700_000_000_000` để tính `dueAt = LIBRARY_DECK_BASE_MS - (n - 1) + idx` (không phụ thuộc `vocabLibraryDeck.createdAt` vốn bị reset khi chạy `seedVocabLibrary --prune`).
  - **Chia lô insert (`chunkSize = 10`)**: Mỗi dòng `vocab_card` bind 9 cột; trên Cloudflare D1 (tối đa 100 biến SQL/statement), insert một bài ≥ 12 từ sẽ nổ `D1_ERROR: too many SQL variables`. Bắt buộc chia mảng `words` thành các lô tối đa **10 từ/statement** (`10 × 9 = 90 < 100` biến) cho cả nhánh `vocab_deck` và `vocab_library_deck`.
- **Dual-source cho `loadPool(db, studentId, orgId, currentDeckId?: string)` (`vocab-provision.ts:293` — RT-F2, RT-F6)**:
  - Cập nhật chữ ký `loadPool(db, studentId, orgId, currentDeckId?: string)`.
  - Luôn nạp toàn bộ từ của `currentDeckId` trước (`sameDeck`).
  - Nạp thêm tối đa `LIMIT 100` từ distractor từ: (1) các `vocab_deck` thỏa `studentCanAccessDeckCondition`, (2) các `vocab_library_word` mà `studentId` đã có `vocab_card`, và (3) nếu `currentDeckId` là `libdeck-*` và tổng số từ phân biệt `< 20`, lấy thêm từ cùng `courseId` (`LIMIT 50`).
  - Khử trùng lặp theo khóa chuẩn hóa `${word.trim().toLowerCase()}::${definitionVi.trim().toLowerCase()}` (giữ lại dòng thuộc `currentDeckId` trước) để khi giáo viên cũng clone cùng bài `libdeck-*` về lớp (`sourceLibraryDeckId`), trắc nghiệm không bao giờ sinh 2 đáp án trùng nhau và kích thước `pool` luôn gọn nhẹ (`≤ ~120` từ thay vì 10.160 từ).
- **Dual-source cho `loadStudentAccessibleDecks` + `loadWordsAndCardsForAccessibleDecks` (`vocab-provision.ts:74` — RT-F2, RT-F7)**:
  - Trong `loadStudentAccessibleDecks`: query `libraryRows` bằng `INNER JOIN vocab_library_word` và `INNER JOIN vocab_card` (`eq(vocabCard.studentId, studentId)`), `GROUP BY vocab_library_deck.id`, lấy `MIN(vocab_card.created_at)` làm `createdAt` của `AccessibleStudentDeck` (nhờ vậy trong "Bộ từ đang học", bài thư viện được sắp xếp đúng theo thời điểm học viên bắt đầu mở/học bài đó thay vì thời điểm seed DB, với tie-breaker theo `sortOrder`).
  - Trong `loadWordsAndCardsForAccessibleDecks(db, studentId, accessibleDecks)`: chia nhỏ (`chunk`) mọi truy vấn `inArray(..., deckIds)` theo lô tối đa **50 `deckId`/query** cho cả `orgDeckIds` và `libDeckIds` để không bao giờ chạm trần 100 biến bind của D1 kể cả khi học viên mở toàn bộ 968 bài.

## Requirements

- [ ] Trong `packages/api/src/contracts.ts`:
  - Chặn tiền tố `/^(libcourse|libdeck|libword)-/i` trên `vocabDeckCreateSchema.id` và `vocabWordUpsertSchema.id`.
  - Mở rộng `vocabOverviewDeckSchema.source` và `vocabStudentProgressDeckSchema.source` thành `z.enum(["class", "suggested", "library"]).catch("class")`, thêm `className: z.string().catch("")` vào `vocabStudentProgressDeckSchema`.
  - Thêm `vocabStudentLibraryCourseSchema`: `{ id, name, description, target, deckCount, wordCount, reviewWordCount, learnedWordCount, dueWordCount, sortOrder }` + `vocabStudentLibraryCoursesResponseSchema`.
  - Thêm `vocabStudentLibraryDeckSchema`: `{ id, courseId, title, imageUrl, wordCount, newCount, reviewCount, dueCount, learnedCount, sortOrder }` + `vocabStudentLibraryDecksResponseSchema`.
- [ ] Cập nhật `AccessibleStudentDeck` (`vocab-provision.ts`) với `source: "class" | "suggested" | "library"`, mở rộng `loadStudentAccessibleDecks` lấy thêm các `vocab_library_deck` mà học viên đã có `vocab_card` với `createdAt = MIN(vocab_card.created_at)`.
- [ ] Viết helper `loadWordsAndCardsForAccessibleDecks(db, studentId, accessibleDecks)` trong `vocab-provision.ts` với cơ chế chunk `≤ 50` deck IDs mỗi câu SQL (an toàn tuyệt đối với giới hạn 100 biến của D1).
- [ ] Mở rộng `ensureDeckCards` (chunk insert `≤ 10` thẻ/statement + `LIBRARY_DECK_BASE_MS`) và `loadPool(db, studentId, orgId, currentDeckId)` (ưu tiên `currentDeckId` + fallback cùng `courseId` + `LIMIT 100` + deduplicate `(word, definitionVi)`).
- [ ] Thêm unit tests cho các schemas và ràng buộc tiền tố mới trong `packages/api/src/vocab-contracts.test.ts`.

## Architecture

```
AccessibleStudentDeck.source: "class" | "suggested" | "library"

ensureDeckCards(db, studentId, orgId, deckId):
  1. If !deckId.startsWith("libdeck-"):
     Try vocab_deck WHERE id = deckId AND studentCanAccessDeckCondition(studentId, orgId)
  2. If deckId.startsWith("libdeck-") or not found:
     Try vocab_library_deck WHERE id = deckId
     -> load vocab_library_word WHERE deck_id = deckId
     -> chunk words by 10: INSERT OR IGNORE vocab_card (dueAt from LIBRARY_DECK_BASE_MS)
     -> SELECT vocab_card JOIN vocab_library_word

loadWordsAndCardsForAccessibleDecks(db, studentId, accessibleDecks):
  - orgDeckIds chunked by 50 -> query vocab_word + vocab_card
  - libDeckIds chunked by 50 -> query vocab_library_word + vocab_card
  - Return unified { words, cards } (never > 51 SQL bind variables per query)
```

## Related Code Files

- Modify: `packages/api/src/contracts.ts`
- Modify: `packages/api/src/vocab-contracts.test.ts`
- Modify: `apps/server/src/lib/vocab-provision.ts`

## Implementation Steps

1. Trong `packages/api/src/contracts.ts`:
   - Thêm refine chặn `/^(libcourse|libdeck|libword)-/i` cho `vocabDeckCreateSchema.id` và `vocabWordUpsertSchema.id`.
   - Cập nhật `vocabOverviewDeckSchema` và `vocabStudentProgressDeckSchema` (`source` thêm `"library"`, `vocabStudentProgressDeckSchema` thêm `className: z.string().catch("")`).
   - Định nghĩa và export `vocabStudentLibraryCourseSchema`, `vocabStudentLibraryCoursesResponseSchema`, `vocabStudentLibraryDeckSchema`, `vocabStudentLibraryDecksResponseSchema` cùng các TypeScript types tương ứng.
2. Trong `packages/api/src/vocab-contracts.test.ts`:
   - Thêm test parse `source: "library"`, fallback `.catch("class")`, chặn ID `libword-1`/`libdeck-1` trên `vocabDeckCreateSchema`/`vocabWordUpsertSchema`, và validate `vocabStudentLibraryCoursesResponseSchema` / `vocabStudentLibraryDecksResponseSchema`.
3. Trong `apps/server/src/lib/vocab-provision.ts`:
   - Cập nhật `loadStudentAccessibleDecks` lấy `libraryRows` kèm `MIN(vocab_card.created_at)` và `className: vocabLibraryCourse.name`.
   - Thêm `loadWordsAndCardsForAccessibleDecks(db, studentId, accessibleDecks)` có chia chunk `≤ 50` IDs.
   - Cập nhật `ensureDeckCards` hỗ trợ `vocab_library_deck`, dùng `LIBRARY_DECK_BASE_MS`, và chia chunk insert `≤ 10` thẻ/lần.
   - Cập nhật `loadPool(db, studentId, orgId, currentDeckId)` kèm fallback cùng `courseId`, giới hạn `LIMIT 100` và khử trùng lặp `(word, definitionVi)`.
4. Chạy `pnpm --filter @teacher-os/api test` và `pnpm check-types`.

## Todo

- [ ] Cập nhật Zod contracts và chặn tiền tố `lib*` trong `packages/api/src/contracts.ts`
- [ ] Thêm contract tests trong `packages/api/src/vocab-contracts.test.ts`
- [ ] Mở rộng `loadStudentAccessibleDecks`, `loadWordsAndCardsForAccessibleDecks`, `ensureDeckCards`, `loadPool` trong `apps/server/src/lib/vocab-provision.ts`

## Success Criteria

- `pnpm --filter @teacher-os/api test` pass.
- Không có bất kỳ truy vấn SQL hay câu lệnh `INSERT` nào trong `vocab-provision.ts` vượt quá 90 bound parameters trên Cloudflare D1 kể cả khi bài học có > 20 từ hoặc học viên mở > 200 bài học.

## Risk Assessment

- **Giới hạn 100 biến SQL trên Cloudflare D1**: Đã hóa giải hoàn toàn bằng chunk insert 10 dòng (`90` params) trong `ensureDeckCards` và chunk query 50 `deckId` (`51` params) trong `loadWordsAndCardsForAccessibleDecks`.

## Security Considerations

- Chặn triệt để client giáo viên truyền `id` trùng tiền tố `libcourse-*`, `libdeck-*`, `libword-*` ngay từ tầng Zod schema.

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
