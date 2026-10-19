---
title: "Phase 3: Server Student Library Routes, Overview & Teacher Progress"
status: todo
---

# Phase 3: Server Student Library Routes, Overview & Teacher Progress

## Context Links

- Student vocab routes: [`apps/server/src/routes/vocab.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/server/src/routes/vocab.ts)
- Teacher vocab routes: [`apps/server/src/routes/vocab-teacher.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/server/src/routes/vocab-teacher.ts) (lines 154, 240, 488–675, 723, 761)
- Teacher library routes: [`apps/server/src/routes/vocab-library.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/server/src/routes/vocab-library.ts) (lines 113–126)
- Server tests: [`apps/server/src/routes/vocab.test.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/server/src/routes/vocab.test.ts)

## Overview

Mở 2 endpoint duyệt khóa học từ vựng trên nhánh student (`GET /api/student/vocab/library/courses` và `GET /api/student/vocab/library/courses/:courseId/decks`), cập nhật `loadOwnedSessionCard` + `GET /api/student/vocab/decks/:deckId/session-data` + `GET /api/student/vocab/audio/:wordId` + `GET /api/student/vocab/overview` trong `apps/server/src/routes/vocab.ts`, cập nhật `GET /api/kernel/vocab/progress` + cô lập lệnh xóa `vocab_card` trong `apps/server/src/routes/vocab-teacher.ts`, và loại bỏ truy vấn `inArray` vượt 100 biến D1 trên các khóa học lớn (`libcourse-6` 120 bài, `libcourse-15` 140 bài).

## Key Insights

- **Đủ 6 điểm chạm trên server cho luồng học `libdeck-*`**:
  1. `ensureDeckCards` (`vocab-provision.ts` — Phase 2): mở bài `libdeck-*` và lazy-provision `vocab_card` (chunk 10 từ/lần).
  2. `loadPool(db, s.id, orgId, deckId)` (`vocab-provision.ts` — Phase 2, gọi tại `vocab.ts:662`): nạp từ của `deckId` + distractor pool giới hạn `LIMIT 100`.
  3. `loadOwnedSessionCard` (`vocab.ts:54`): phục vụ `POST /vocab/answer` và `POST /vocab/learn-commit`. Khi `cardId` không match nhánh `vocab_word` + `vocab_deck`, fallback sang query `vocab_card` innerJoin `vocab_library_word` + `vocab_library_deck` với điều kiện `eq(vocabCard.id, cardId)` và `eq(vocabCard.studentId, studentId)`.
  4. `GET /vocab/audio/:wordId` (`vocab.ts:921` — RT-F7): khi `wordId` bắt đầu bằng `libword-` (hoặc không thuộc `vocab_word`), query `vocab_library_word` **innerJoin `vocab_card`** với `and(eq(vocabLibraryWord.id, wordId), eq(vocabCard.wordId, vocabLibraryWord.id), eq(vocabCard.studentId, s.id))` (đảm bảo chỉ học viên đã mở bài học mới tải qua proxy), kiểm tra `if (libRow.audioUrl !== null && libRow.audioUrl.trim().length > 0)` rồi gọi `proxyRemoteAudio(c, libRow.audioUrl)`.
  5. `GET /vocab/overview` (`vocab.ts:301`): dùng `loadWordsAndCardsForAccessibleDecks` (Phase 2) để thống kê `dueCount`, `learnedCount`, `matureCount`, `levelDistribution`, `forecast`, và danh sách `decks[]` bao gồm cả các bài `libdeck-*` học viên đã bắt đầu.
  6. `GET /api/kernel/vocab/progress` (`vocab-teacher.ts:488` — RT-F2, RT-F9):
     - Dùng `loadWordsAndCardsForAccessibleDecks` (Phase 2).
     - Thay `inArray(vocabReviewLog.deckId, deckIds)` (`vocab-teacher.ts:571`) bằng query `WHERE student_id = ? GROUP BY deck_id` (chỉ 1 biến bind, không bao giờ nổ giới hạn 100 biến của D1 khi học viên học > 100 bài).
     - Trả thêm `className: d.className` trong từng phần tử của `progress.decks` (`vocab-teacher.ts:651`).
- **Bảo vệ chống xóa chéo dữ liệu SRS & ID shadowing trong `vocab-teacher.ts` (RT-F1)**:
  - Tại `vocab-teacher.ts:240` (xóa deck) và `761` (xóa từ), thêm điều kiện `sql`${vocabCard.wordId} NOT LIKE 'libword-%'`` vào `db.delete(vocabCard)` để dù có bất kỳ dữ liệu bất thường nào, giáo viên của một org không bao giờ xóa được `vocab_card` thư viện của học viên.
- **Bảo vệ Cross-Site GET trên `GET /vocab/decks/:deckId/session-data` (`vocab.ts:656` — RT-F3)**:
  - Vì `session-data` thực hiện ghi `ensureDeckCards` và cookie dùng `SameSite=None`, nếu request gửi kèm header `Sec-Fetch-Site: cross-site` mà `Origin` không nằm trong `isAllowedStudentOrigin(origin, c.env)` thì trả `403 FORBIDDEN_ORIGIN` (chặn `<img src=".../session-data">` từ trang web bên thứ ba).
- **Tránh lỗi D1 > 100 bound params trên khóa học 120–140 bài (`libcourse-6`, `libcourse-15` — RT-F2)**:
  - Trong `lessons.csv`, `libcourse-6` có 120 bài và `libcourse-15` có 140 bài. Nếu đếm từ bằng `inArray(vocabLibraryWord.deckId, deckIds)`, câu SQL bind 120–140 biến và crash trên Cloudflare D1!
  - Do đó, trong cả `GET /api/student/vocab/library/courses/:courseId/decks` (`vocab.ts`) VÀ `GET /api/kernel/vocab-library/courses/:courseId/decks` (`vocab-library.ts:113-126`), đếm từ và thẻ bằng `INNER JOIN vocab_library_deck ON vocab_library_word.deck_id = vocab_library_deck.id WHERE vocab_library_deck.course_id = ?` (chỉ tốn **1–2 bound parameters**!).
- **Tính toán tiến độ cá nhân trên danh mục khóa học (`GET /vocab/library/courses` và `GET /vocab/library/courses/:courseId/decks` — RT-F8)**:
  - Trong `GET /vocab/library/courses`:
    - Đếm số bài (`deckCount`) và tổng số từ (`wordCount`) mỗi khóa.
    - Đếm số thẻ của `studentId` (join qua `vocab_library_word` + `vocab_library_deck`):
      - `reviewWordCount`: số thẻ `state === "review"` (đã hoàn thành phiên Learn, cấp độ ≥ 1)
      - `learnedWordCount`: số thẻ `state === "review" && level >= 2`
      - `dueWordCount`: số thẻ `state === "review" && dueAt <= now`
  - Trong `GET /vocab/library/courses/:courseId/decks`:
    - Kiểm tra `courseId` tồn tại trong `vocab_library_course` (nếu không → `404` với `code: VOCAB_ERROR_CODES.LIBRARY_COURSE_NOT_FOUND`).
    - Tính cho từng deck:
      - `wordCount`: tổng từ trong `vocab_library_word` của deck
      - `reviewCount`: số thẻ `state === "review"` của `studentId` trên các từ hiện hữu của deck
      - `newCount = Math.max(0, wordCount - reviewCount)` (luôn clamp `>= 0`)
      - `dueCount`: số thẻ `state === "review" && dueAt <= now`
      - `learnedCount`: số thẻ `state === "review" && level >= 2`

## Requirements

- [ ] Đăng ký `requireStudent` cho `/vocab/library/courses` và `/vocab/library/courses/*` trong `registerVocabRoutes` (`apps/server/src/routes/vocab.ts`).
- [ ] Thêm `GET /api/student/vocab/library/courses` trả về `VocabStudentLibraryCoursesResponse` (dùng `JOIN` + `GROUP BY course_id`, ≤ 2 bind params).
- [ ] Thêm `GET /api/student/vocab/library/courses/:courseId/decks` trả về `VocabStudentLibraryDecksResponse` (dùng `INNER JOIN vocab_library_deck WHERE course_id = ?`, ≤ 2 bind params; đồng thời sửa luôn `inArray` tại `apps/server/src/routes/vocab-library.ts:113-126`).
- [ ] Mở rộng `loadOwnedSessionCard`, `GET /api/student/vocab/decks/:deckId/session-data` (truyền `deckId` vào `loadPool` + check cross-site fetch), và `GET /api/student/vocab/audio/:wordId` (innerJoin `vocab_card` + null guard `audioUrl`).
- [ ] Cập nhật `GET /api/student/vocab/overview` (`vocab.ts`) và `GET /api/kernel/vocab/progress` (`vocab-teacher.ts` — bỏ `inArray` trên `vocab_review_log`, thêm `className: d.className`) dùng `loadWordsAndCardsForAccessibleDecks`.
- [ ] Thêm điều kiện `sql`${vocabCard.wordId} NOT LIKE 'libword-%'`` vào lệnh xóa `vocab_card` trong `apps/server/src/routes/vocab-teacher.ts:240,761`.
- [ ] Trong `apps/server/src/routes/vocab.test.ts`, bật `await client.execute("PRAGMA foreign_keys = ON;")` ngay sau `await migrate(...)`.

## Architecture

```
GET /api/student/vocab/library/courses
  -> requireStudent
  -> courses (20) + deckCount + wordCount + student's reviewWordCount, learnedWordCount, dueWordCount

GET /api/student/vocab/library/courses/:courseId/decks
  -> requireStudent
  -> 404 if course not found
  -> JOIN vocab_library_deck WHERE course_id = ? (1-2 SQL params, safe for 140-deck courses)
  -> course metadata + decks[] with { wordCount, newCount, reviewCount, dueCount, learnedCount }
```

## Related Code Files

- Modify: `apps/server/src/routes/vocab.ts`
- Modify: `apps/server/src/routes/vocab-teacher.ts`
- Modify: `apps/server/src/routes/vocab-library.ts`
- Modify: `apps/server/src/routes/vocab.test.ts`

## Implementation Steps

1. Trong `apps/server/src/routes/vocab.ts`:
   - Cập nhật `loadOwnedSessionCard` thêm nhánh fallback join `vocabLibraryWord` + `vocabLibraryDeck`.
   - Đăng ký middleware `requireStudent` cho `/vocab/library/courses` và `/vocab/library/courses/*`.
   - Cài đặt `GET /vocab/library/courses` và `GET /vocab/library/courses/:courseId/decks` (dùng `JOIN` theo `courseId`, clamp `newCount = Math.max(0, wordCount - reviewCount)`).
   - Cập nhật `GET /vocab/decks/:deckId/session-data`: kiểm tra `Sec-Fetch-Site: cross-site` / `Origin`, gọi `loadPool(db, s.id, orgId, deckId)`.
   - Cập nhật `GET /vocab/overview` dùng `loadWordsAndCardsForAccessibleDecks`.
   - Cập nhật `GET /vocab/audio/:wordId` fallback sang `vocabLibraryWord` innerJoin `vocabCard` của `s.id` + kiểm tra `audioUrl` khác null/rỗng.
2. Trong `apps/server/src/routes/vocab-library.ts`:
   - Thay `inArray(vocabLibraryWord.deckId, deckIds)` ở dòng 113–126 bằng `innerJoin(vocabLibraryDeck, eq(vocabLibraryWord.deckId, vocabLibraryDeck.id)).where(eq(vocabLibraryDeck.courseId, courseId))` để không vượt 100 biến D1 trên khóa 120–140 bài.
3. Trong `apps/server/src/routes/vocab-teacher.ts`:
   - Bảo vệ `db.delete(vocabCard)` ở dòng 240 và 761 với `sql`${vocabCard.wordId} NOT LIKE 'libword-%'``.
   - Cập nhật `GET /progress`: dùng `loadWordsAndCardsForAccessibleDecks`, bỏ `inArray(vocabReviewLog.deckId, deckIds)` ở dòng 571 (chỉ lọc `eq(vocabReviewLog.studentId, studentId)`), và trả thêm `className: d.className`.
4. Trong `apps/server/src/routes/vocab.test.ts`:
   - Bật `await client.execute("PRAGMA foreign_keys = ON;")` sau `await migrate(...)`.
   - Thêm test cho `GET /api/student/vocab/library/courses`, `GET /api/student/vocab/library/courses/:courseId/decks`, luồng học viên (0 lớp) học bài có `>= 15` từ (`libdeck-*`) → `session-data` → `learn-commit` (`reviewWordCount` & `reviewCount` tăng ngay lập tức) → `answer` → `audio` → `overview` → teacher `progress`, và test bảo vệ không cho giáo viên tạo/xóa `libword-*`.
5. Chạy `pnpm --filter server test` để xác nhận toàn bộ tests xanh.

## Todo

- [ ] Mở rộng `loadOwnedSessionCard`, `GET /vocab/decks/:deckId/session-data`, `GET /vocab/audio/:wordId`, `GET /vocab/overview` trong `apps/server/src/routes/vocab.ts`
- [ ] Thêm `GET /vocab/library/courses` và `GET /vocab/library/courses/:courseId/decks` trong `apps/server/src/routes/vocab.ts` (và sửa `inArray` trong `vocab-library.ts`)
- [ ] Cập nhật `GET /api/kernel/vocab/progress` và khóa an toàn `db.delete(vocabCard)` trong `apps/server/src/routes/vocab-teacher.ts`
- [ ] Bật `PRAGMA foreign_keys = ON` và viết server tests trong `apps/server/src/routes/vocab.test.ts`

## Success Criteria

- `pnpm --filter server test` pass với `PRAGMA foreign_keys = ON`.
- Mọi truy vấn trong `vocab.ts`, `vocab-library.ts`, `vocab-teacher.ts` dùng ≤ 51 SQL bound parameters, chạy an toàn với khóa học 140 bài và bài học > 20 từ.

## Risk Assessment

- **Vượt 100 biến SQL trên khóa học lớn (`libcourse-6`, `libcourse-15`)**: Đã thay thế `inArray(..., deckIds)` bằng `INNER JOIN vocab_library_deck WHERE course_id = ?` (1 biến bind).

## Security Considerations

- Chặn cross-tenant `vocab_card` deletion, chặn cross-site GET `session-data`, bắt buộc `requireStudent` cho mọi route `/api/student/vocab/library/*`, và yêu cầu học viên đã có `vocab_card` mới được proxy audio `libword-*`.
