---
title: "Plan student vocab courses & lessons UI kiểu MochiVocab (issue #369)"
date: 2026-10-19
summary: "Lập plan 261019-2239 (issue #369): tách route /vocab/courses + lesson grid ảnh bìa kiểu mochivocab, migration 0040 thêm deck description"
---

# Plan student vocab courses & lessons UI kiểu MochiVocab (issue #369)

## What happened
Hoàn tất `ak-plan --github` cho yêu cầu "phần chọn courses và lesson học ở page student triển khai giống mochivocab". REA phân tích tĩnh learn.mochidemy.com/learn (không cần login — guest view render đầy đủ): HTML → `__NEXT_DATA__` → webpack chunk map → beautify các chunk nóng (1077 learn page, 4095 lesson card login, 8165 course modal, 2340 FlowLearningGame). Report: `plans/reports/2026-10-19-mochivocab-learn-rea.md`. Plan: `plans/261019-2239-student-vocab-mochivocab-lessons-ui/`, issue #369 (`ai-handle` + `ready to review`).

Phát hiện then chốt:
1. **Mochivocab `/learn/[courseId]` là trang lưới bài**: ribbon tên khóa (click mở modal đổi khóa) + 100 lesson card có ảnh bìa CDN + tên EN + "N.Tên VI" + trạng thái GREEN (checked_feet)/YELLOW (start here)/LOCK (free 3 bài), auto-scroll tới `last_learn.lesson_id`, click bài mở **overlay FlowLearningGame** (không phải route).
2. **Dữ liệu Teacher OS đã sẵn 90%**: `vocab_library_deck.image_url` ĐÃ seed từ CSV (#361, URL CDN mochidemy ~4.7KB/ảnh, tải OK qua redirect 301) và contract student deck ĐÃ expose `imageUrl` — chỉ thiếu UI dùng. Thiếu duy nhất `description` VI đánh số → migration 0040.
3. **CSV `lessonDescription` đã chứa prefix số "N."** (917/968 dòng) — red-team bắt được bug nhân đôi số "84. 84.Nhận thức…" nếu render `{sortOrder}. {description}` → chốt render nguyên văn; 47 deck CSV có description rác "N từ vựng" → fallback chỉ hiện title.

## Decision
- **D1 (Route tách theo mô hình mochivocab)**: `/vocab` = dashboard (bỏ inline catalog #366, thay CTA); `/vocab/courses` = catalog 20 khóa; `/vocab/courses/$courseId` = lưới bài học. TanStack Router static-beats-dynamic đã verify source (`isFrameMoreSpecific`) — `/vocab/courses` không bị `$deckId` nuốt.
- **D2 (Lesson card kiểu mochivocab trên design system neu)**: ảnh bìa object-contain + fallback onError, subtitle nguyên văn CSV, trạng thái Hoàn thành/Đang học x/y suy từ SRS counts, "Bắt đầu tại đây" ở bài chưa hoàn thành đầu tiên + auto-scroll 1 lần. KHÔNG port FlowLearningGame overlay — giữ engine SRS #359 + route session.
- **D3 (Chuỗi `?course=` xuyên suốt)**: lesson card → `/vocab/$deckId?course=` → session route preserve → `handleExit` preserve → back-link về đúng course page (red-team B2: không xử lý sẽ chết ngay khi qua session).
- **D4 (Deploy strict-parse)**: client `.parse()` strict — server + student bắt buộc cùng release train sau migration 0040 + re-seed (bỏ claim sai "nullable nên không cần").
- **Non-goals đã cắt**: premium lock, multi-path lộ trình, 2 khóa mới mochidemy (25/26), self-host ảnh, shortcut dashboard→course bằng className name-matching (heuristic mỏng — overview deck item không có courseId).

## Lessons learned
- **REA Next.js pages-router không cần login**: `__NEXT_DATA__` chứa toàn bộ courseData/courseList SSR; guest view vẫn render UI đầy đủ, click handler guest chỉ mở login modal — đủ suy ra behavior logged-in từ chunk JS.
- Chunk lazy của page tìm qua `t.e(N)` trong chunk page → map id→hash trong `webpack-*.js` runtime (map `{571:"..."}` đầu tiên là lazy chunks).
- Red-team verifier bằng subagent + grep đối chiếu có giá trị cao: bắt được 1 Critical (double numbering), 2 High (deploy claim sai, param chết qua session) mà plan draft bỏ sót — toàn bộ bằng chứng file:line cụ thể.
- packages/ui KHÔNG có dialog primitive — QuizDialog là overlay local tự viết; precedent để follow là `quiz-lifecycle-dialogs.tsx`.
- E2E boot (`apps/e2e/src/boot.ts:84-87`) tự migrate + `seedVocabLibrary` từ CSV mỗi lần chạy — không cần seed thủ công khi test.

## Next steps
- Review plan: `plans/261019-2239-student-vocab-mochivocab-lessons-ui/plan.md` hoặc issue #369 (kéo card sang **Ready** trên board Teacher OS để agent nhận việc).
- Cook: `/ak:cook plans/261019-2239-student-vocab-mochivocab-lessons-ui/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
