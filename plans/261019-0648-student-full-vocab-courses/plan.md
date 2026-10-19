---
title: "Student Full Vocabulary Courses (Học viên tự truy cập toàn bộ khóa học từ vựng)"
description: "Mở toàn bộ 20 khóa học / 968 bài từ vựng dùng chung cho học viên tự duyệt và học SRS trực tiếp trên Student Portal mà không cần đợi giáo viên giao hoặc gợi ý."
status: pending
priority: P1
effort: 16h
issue: 366
branch: vinh19410/feat/student-full-vocab-courses
tags: [feature, backend, frontend, database, vocab, srs, student-app]
blockedBy: []
blocks: []
created: 2026-10-19
---

# Student Full Vocabulary Courses (Học viên tự truy cập toàn bộ khóa học từ vựng)

## Overview

Hiện tại danh mục 20 khóa học / 968 bài / 10.160 từ vựng dùng chung (`vocab_library_course`, `vocab_library_deck`, `vocab_library_word` — #361) chỉ mở ở nhánh giáo viên (`/api/kernel/vocab-library/*`). Học viên trên Student Portal (`apps/student`) buộc phải đợi giáo viên clone bài vào lớp đang học hoặc gửi gợi ý (`vocab_suggestion` — #363) thì mới thấy bộ từ trong `/vocab`.

Kế hoạch này cho phép **học viên truy cập trực tiếp toàn bộ 20 khóa học từ vựng có sẵn** ngay trên Student Portal (`/vocab`) mà **không cần đợi giáo viên assign/suggest**, đồng thời **không nhân bản dữ liệu sang `vocab_deck`/`vocab_word` của từng org** (tránh phình DB D1 và không làm bẩn danh sách bộ từ trong Teacher Hub `snapshot.ts`):

1. **DB Schema & Migration `0039` (`vocab_card`)**: Bỏ ràng buộc FK cứng `vocab_card.word_id → vocab_word.id` (recreate bảng `vocab_card` có audit theo precedent `0011`/`0038`) để `vocab_card.word_id` trỏ được tới cả `vocab_word.id` (bộ từ lớp/gợi ý) lẫn `vocab_library_word.id` (`libword-*` thuộc 20 khóa học). Chặn tiền tố `libcourse-*`/`libdeck-*`/`libword-*` trên API giáo viên, khóa lệnh xóa `vocab_card` của giáo viên không đụng tới `libword-%`, và dọn thẻ mồ côi khi chạy `seedVocabLibrary --prune`.
2. **Dual-source SRS & Access (`vocab-provision.ts` + `vocab.ts`) an toàn với giới hạn 100 biến SQL của D1**: Mở rộng toàn bộ luồng đọc/ghi SRS của student (`ensureDeckCards` chia lô 10 từ/lần, `loadPool` giới hạn 100 distractors + khử trùng lặp, `loadOwnedSessionCard`, `GET /vocab/audio/:wordId` kèm check `vocab_card`, `loadStudentAccessibleDecks`, `loadWordsAndCardsForAccessibleDecks` chia lô 50 deck/lần) để nhận diện trực tiếp `libdeck-*` / `libword-*` bên cạnh `vocab_deck` / `vocab_word`.
3. **API duyệt khóa học cho học viên**: Thêm `GET /api/student/vocab/library/courses` và `GET /api/student/vocab/library/courses/:courseId/decks` (bảo vệ bởi `requireStudent`, dùng `JOIN` theo `courseId` để chạy an toàn trên khóa 120–140 bài), trả danh sách 20 khóa học và các bài học kèm số liệu tiến độ cá nhân (`reviewWordCount`, `learnedWordCount`, `dueWordCount`, `newCount`, `reviewCount`, `dueCount`, `learnedCount`).
4. **Student Portal UI (`/vocab`) & Teacher Progress (`/vocab`)**: Thêm khu vực **"Khóa học từ vựng"** trên `/vocab` của học viên (duyệt 20 khóa → xem bài học trong khóa, lưu `courseId` & từ khóa tìm kiếm debounce 300ms trên URL search params, bấm vào bài mở thẳng `/vocab/$deckId` và vào phiên học SRS Learn/Review). Khi học viên đã mở/học một bài `libdeck-*`, bài đó tự động xuất hiện trong danh sách đang học (`source: "library"`, badge tên khóa học) ở cả `/vocab` của học viên lẫn tab **"Tiến độ"** của giáo viên.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Migration `0039` gỡ FK `vocab_card.word_id → vocab_word.id` an toàn (recreate bảng, bảo toàn dữ liệu và 3 index) để `vocab_card` lưu được `libword-*` | P1 |
| 2 | Học viên học trực tiếp `libdeck-*` qua đầy đủ vòng đời SRS (`session-data`, `learn-commit`, `answer`, `audio`, `pool`, `overview`) không cần clone sang `vocab_deck` và không vượt giới hạn 100 biến SQL của Cloudflare D1 | P1 |
| 3 | API `GET /api/student/vocab/library/courses` và `GET /api/student/vocab/library/courses/:courseId/decks` kèm tiến độ học cá nhân (`reviewWordCount`/`reviewCount`, `learnedWordCount`/`learnedCount`, `dueWordCount`/`dueCount`) | P1 |
| 4 | UI Student Portal `/vocab` duyệt 20 khóa học + tìm kiếm (URL search params debounce 300ms) + vào bài học ngay; hiển thị nguồn `"library"` kèm tên khóa trên Student Overview & Teacher Progress | P1 |
| 5 | Giữ nguyên 100% luồng bộ từ theo lớp (#359), clone thư viện của giáo viên (#361) và gợi ý bộ từ (#363); pass toàn bộ unit + E2E gates ở 3 viewport với `PRAGMA foreign_keys = ON` | P1 |

## Non-goals

- Không cho phép học viên tự tạo/sửa/xóa khóa học hoặc từ vựng.
- Không tự động đổ toàn bộ 968 bài chưa học vào mảng `overview.decks` ("Bộ từ đang học") — chỉ những bài `libdeck-*` mà học viên đã mở/bắt đầu học (có `vocab_card`) mới xuất hiện trong `overview.decks` và `progress.decks`.
- Không thay đổi thuật toán SRS 5 cấp độ trí nhớ (`docs/srs-spec.md`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [DB Schema & Migration 0039 (vocab_card polymorphic word_id)](./phase-01-start.md) | Pending |
| 2 | [API Contracts & Dual-Source Student Provisioning](./phase-02-api-contracts-library-access.md) | Pending |
| 3 | [Server Student Library Routes, Overview & Teacher Progress](./phase-03-server-student-library-routes.md) | Pending |
| 4 | [Student Portal Courses UI & Teacher Progress Badge](./phase-04-student-web-ui.md) | Pending |
| 5 | [Tests, E2E Spec & Local Verification Gates](./phase-05-tests-e2e-gates.md) | Pending |

## Dependencies

- Phase 1 là nền tảng cho Phase 2 & 3 (cho phép `vocab_card.word_id` nhận `libword-*` khi `PRAGMA foreign_keys = ON`).
- Phase 2 định nghĩa Zod contracts và helper dual-source trong `vocab-provision.ts`, mở đường cho Phase 3 (routes) và Phase 4 (UI).
- Phase 5 kiểm chứng tích hợp toàn trình sau khi Phase 1–4 hoàn tất.
- **Deploy order**: Chạy `db:migrate:deploy` (migration `0039`) TRƯỚC khi deploy worker; deploy đồng bộ `apps/server` + `apps/web` + `apps/student` trong cùng release train (precedent #304, #361, #363).

## Success Criteria

- [ ] Học viên mới (chưa ghi danh lớp nào có bộ từ, chưa có gợi ý nào từ giáo viên) vào `/vocab` thấy đầy đủ 20 khóa học từ vựng (`EXPECTED_COUNTS.course = 20`), chọn khóa → thấy danh sách bài học, bấm vào bài `libdeck-*` → vào `/vocab/libdeck-*` và hoàn thành phiên Learn + Review + nghe audio bình thường.
- [ ] Không có bất kỳ dòng mới nào sinh thêm trong `vocab_deck` hoặc `vocab_word` khi học viên tự học bài `libdeck-*`; snapshot của giáo viên (`data.vocabDecks`) không bị phình hoặc lẫn bộ từ tự học của học viên.
- [ ] Sau khi học viên mở/học bài `libdeck-*`, bài đó xuất hiện ngay trong mục "Bộ từ đang học" (`overview.decks` với `source: "library"`, `className` là tên khóa học) và trong tab "Tiến độ" của giáo viên (`/api/kernel/vocab/progress`) mà không bị kẹt stale cache 60s.
- [ ] Chạy lại `seedVocabLibrary` (kể cả với `prune: true`) không làm mất `vocab_card` của học viên trên các từ `libword-*` còn trong CSV, và tự dọn sạch `vocab_card` của từ đã xóa khỏi CSV.
- [ ] Không có truy vấn nào vượt giới hạn 100 biến SQL của Cloudflare D1 (kể cả khóa `libcourse-15` 140 bài, bài > 20 từ, hoặc học viên mở > 200 bài).
- [ ] Toàn bộ gates local pass với `PRAGMA foreign_keys = ON`: `pnpm check`, `pnpm check-types`, `pnpm --filter @teacher-os/db test`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test`, và E2E (`E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`).
- [ ] UI đạt chuẩn `DESIGN.md` và không tràn ngang ở 3 viewport (`1440×900`, `768×1024`, `375×812`).

## Red Team & Validation Summary

Kế hoạch đã được phản biện độc lập bởi 3 Red-Team reviewers (`Security Adversary & Fact Checker`, `Failure Mode Analyst & Flow Tracer`, `Assumption Destroyer & Contract Verifier`) và đối chiếu 39 tuyên bố thực tế trong codebase:

| # | Mức độ | Phát hiện | Trạng thái & Giải pháp đã tích hợp vào Plan |
|---|--------|-----------|---------------------------------------------|
| RT-F1 | Critical | `vocabDeckCreateSchema.id` & `vocabWordUpsertSchema.id` cho phép truyền `id` tùy ý; `vocab-teacher.ts:240,761` xóa `vocab_card` không chặn `libword-%` gây nguy cơ xóa dữ liệu SRS liên tổ chức hoặc che khuất ID thư viện | **Accepted**: Chặn tiền tố `/^(libcourse\|libdeck\|libword)-/i` trong `contracts.ts` (Phase 2) và thêm `word_id NOT LIKE 'libword-%'` vào lệnh xóa `vocab_card` tại `vocab-teacher.ts:240,761` (Phase 3). |
| RT-F2 | Critical | Giới hạn 100 biến bind SQL trên Cloudflare D1 (`D1_ERROR: too many SQL variables`) tại 4 điểm: `inArray` trên khóa 120–140 bài (`libcourse-6`, `libcourse-15`), `ensureDeckCards` insert ≥ 12 từ (`12×9=108` biến), `loadWordsAndCardsForAccessibleDecks` và `vocab_review_log` khi học viên mở ≥ 100 bài | **Accepted**: Dùng `INNER JOIN vocab_library_deck WHERE course_id = ?` (1 biến) ở cả `vocab.ts` và `vocab-library.ts`; chia lô insert 10 từ/lần (`90` biến) trong `ensureDeckCards`; chia lô 50 `deckId`/query trong `loadWordsAndCardsForAccessibleDecks`; bỏ `inArray` trên `vocab_review_log` trong `vocab-teacher.ts:571` (Phase 2 & 3). |
| RT-F3 | Critical | React Query `staleTime: 60_000` không được invalidate khi mở `/vocab/$deckId` rồi bấm `"← Danh sách bộ từ"`, và `GET /session-data` thiếu kiểm tra `Sec-Fetch-Site: cross-site` | **Accepted**: Invalidate `["student", "vocab-overview"]` + `["student", "vocab-library"]` ngay khi `useVocabSessionData` hoàn tất và trong `handleExit` (Phase 4); chặn `Sec-Fetch-Site: cross-site` trái phép trên `GET /session-data` (Phase 3). |
| RT-F4 | High | `PRAGMA foreign_keys=ON` bên trong transaction của Drizzle `migrate()` bị SQLite bỏ qua, khiến `vocab.test.ts` và E2E `boot.ts` chạy với `foreign_keys = 0` | **Accepted**: Gọi tường minh `await client.execute("PRAGMA foreign_keys = ON;")` ngay sau `await migrate(...)` trong `packages/db/src/schema/vocab.test.ts`, `apps/server/src/routes/vocab.test.ts`, và `apps/e2e/src/boot.ts` (Phase 1, 3, 5). |
| RT-F5 | High | `seedVocabLibrary --prune` xóa và insert lại `vocab_library_deck` làm đổi `created_at`, để sót `vocab_card` mồ côi nếu từ bị xóa khỏi CSV, và làm lệch thứ tự sort trong `loadStudentAccessibleDecks` | **Accepted**: Dùng hằng số `LIBRARY_DECK_BASE_MS` trong `ensureDeckCards`, lấy `MIN(vocab_card.created_at)` làm mốc `createdAt` cho `libraryRows` trong `loadStudentAccessibleDecks`, và thêm lệnh dọn `vocab_card` mồ côi ở cuối `buildVocabLibraryUpsertStatements` khi `prune: true` (Phase 1 & 2). |
| RT-F6 | High | `loadPool` phình tới 10.160 từ nếu không có `LIMIT`, bị trùng từ khi giáo viên clone `sourceLibraryDeckId`, và thiếu tham số `currentDeckId` cho fallback cùng khóa | **Accepted**: Truyền `currentDeckId` vào `loadPool(db, studentId, orgId, currentDeckId)`, luôn nạp từ của `currentDeckId` trước, giới hạn distractors `LIMIT 100` (kèm fallback cùng `courseId`), và khử trùng lặp theo `(word, definitionVi)` (Phase 2 & 3). |
| RT-F7 | High | `GET /vocab/audio/:wordId` thiếu kiểm tra học viên đã có `vocab_card` và thiếu null guard cho `libRow.audioUrl` | **Accepted**: `INNER JOIN vocab_card` của `s.id` và kiểm tra `libRow.audioUrl !== null && libRow.audioUrl.trim().length > 0` trước khi gọi `proxyRemoteAudio` (Phase 3). |
| RT-F8 | High | Sau phiên Learn, `learned()` đặt `state = "review", level = 1, dueAt = +1d` nên `learnedWordCount` (`level >= 2`) và `dueWordCount` đều bằng `0`; `newCount` chưa được clamp `Math.max(0, ...)` | **Accepted**: Bổ sung `reviewWordCount` / `reviewCount` (`state === "review"`) vào contracts, routes và UI thẻ khóa học/bài học; clamp `newCount = Math.max(0, wordCount - reviewCount)` (Phase 2, 3, 4). |
| RT-F9 | Medium | `VocabProgressTab` (`apps/web`) ép kiểu `as VocabStudentProgressResponse` mà không gọi `.parse()` và `GET /api/kernel/vocab/progress` làm rơi tên khóa học (`className`) | **Accepted**: Thêm `className: z.string().catch("")` vào `vocabStudentProgressDeckSchema`, trả `className: d.className` ở `vocab-teacher.ts`, gọi `.parse()` ở `vocab-progress-tab.tsx:160` và hiển thị `Khóa ${deck.className}` (Phase 2, 3, 4). |
| RT-F10 | Medium | `VocabCourseCatalog` lưu `selectedCourseId` và từ khóa tìm kiếm trong local state thay vì URL search params (`AGENTS.md` / `DESIGN.md`) | **Accepted**: Lưu `courseId` và `q` (debounce 300ms) trong URL search params (`validateSearch`) của `/_auth/vocab/` (Phase 4 & 5). |

<!-- slug: student-full-vocab-courses -->