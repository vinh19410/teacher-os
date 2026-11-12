---
feature: student-practice
type: reverse-evidence
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# _evidence — student-practice

Bằng chứng thô theo hạng mục. Cite dạng `repo-relative/path:line`; range đã kiểm EOF bằng
awk và nội dung bằng sed.

## §Endpoints (9 route, mount dòng cuối)

| Endpoint | Hành vi | Nguồn |
|---|---|---|
| GET `/vocab/library/courses` | Danh mục khóa thư viện, phân trang 12, search, learned/due per course | apps/server/src/routes/vocab.ts:353-443 |
| GET `/vocab/library/courses/:courseId/decks` | Chi tiết khóa + decks; 404 LIBRARY_COURSE_NOT_FOUND | apps/server/src/routes/vocab.ts:444-561, apps/server/src/routes/vocab.ts:461-469 |
| GET `/vocab/overview` | Metrics: newCount = max(0, wordCount - reviewCount); review-pool-only dueCount/nextDueAt/upcomingCount (window 3_600_000); learned L2+; mature L5; forecast 7 ngày VN; streak VN; retention % | apps/server/src/routes/vocab.ts:562-743, apps/server/src/routes/vocab.ts:543-545 |
| POST `/vocab/suggestions/:id/accept` | 404 nếu thiếu/đã dismissed; idempotent khi đã accepted; trả {status:"accepted", respondedAt} | apps/server/src/routes/vocab.ts:744-816 |
| POST `/vocab/suggestions/:id/dismiss` | 409 SUGGESTION_ALREADY_ACCEPTED nếu accepted | apps/server/src/routes/vocab.ts:818-885 |
| GET `/vocab/decks/:deckId/session-data` | Sec-Fetch-Site guard → ensureDeckCards (404 nếu !ensured) → loadPool → {deck, cards, pool} | apps/server/src/routes/vocab.ts:887-916 |
| POST `/vocab/answer` | 400 parse → clamp durationMs ≤ 3_600_000 → 404 CARD_NOT_FOUND → idempotency (409 "log id conflict") → cross-session guard (state="new" hoặc dueAt>now → không ghi, trả card) → CARD_NOT_DUE 409 khi state="new" → applyAnswer → db.batch(log+card) → race replay | apps/server/src/routes/vocab.ts:918-1044 |
| POST `/vocab/learn-commit` | Như answer nhưng apply `learned()` (L1, +1 ngày, state review); gradeGood = firstTryCorrect | apps/server/src/routes/vocab.ts:1046-1161, packages/api/src/srs/scheduler.ts:70-79 |
| GET `/vocab/audio/:wordId` | libword-* → vocab_library_word.audioUrl → proxyRemoteAudio; word org → audioKey (mediaStore) hoặc audioUrl (proxy); mọi lỗi → 404 AUDIO_NOT_FOUND; 503 nếu thiếu store | apps/server/src/routes/vocab.ts:1163-1245 |
| Mount | `registerVocabRoutes(router, deps, requireStudent, allowedOrigins)` trong kernel học viên | apps/server/src/routes/student.ts:2407, apps/server/src/app.ts:440 |

## §Lõi SRS (packages/api/src/srs)

- Hằng số: `LEVEL_INTERVAL_DAYS = [1,3,7,14,30]`, `WARNING_INTERVAL_DAYS = 1`, `DAY_MS` — packages/api/src/srs/scheduler.ts:1-7.
- `applyAnswer(correct, card)`: đúng → level+1 (đang warning → −1 và tắt warning); sai L5 chưa warning → bật warning (level giữ 5); sai L5 đang warning → level 1; sai L2-4 → −1; sai L1 → giữ 1; interval = LEVEL_INTERVAL_DAYS[level−1], đang warning → 1 ngày; lapses+1 khi sai và level ≥2 — packages/api/src/srs/scheduler.ts:27-65.
- `learned(card)`: level 1, warning tắt, state "review", dueAt = now + 1 ngày — packages/api/src/srs/scheduler.ts:70-79.
- Review session: ENCOURAGEMENT_STREAK = 5 (dòng 55); selectReviewCards chỉ state "review" sắp theo hạn, rỗng thì fallback toàn pool khi cho phép ôn sớm — packages/api/src/srs/review-session.ts:55, packages/api/src/srs/review-session.ts:96-119; respond + wrongStreak :183-247; forgot-cap 2 + requeue splice(4 + rng.nextInt(2)) :253-286, :368-371; skipCurrentPrompt không phạt :296-316.
- Learn session: bước intro → (listeningChoice | meaningChoice) → (typing | wordChoice) — packages/api/src/srs/learn-session.ts:15-83; reveal chốt introRevealedOnce :194-199; continueIntro chặn nếu chưa lật :204-230; sai → đẩy cuối hàng đợi :279-302; completeIfLast → `learned()`, gradeGood = first-try-correct :376-411.
- Sinh đề: drawDistractors Fisher-Yates một phần :104-132; cùng-deck → khác-deck :134-163; eligibleKinds :165-206; chooseAndBuildPrompt hạng A/B/C → selfCheck :244-271 — packages/api/src/srs/quiz-generator.ts.
- Gõ từ: `normalizeAnswer` NFC + dấu nháy/gạch + lowercase; `typingEligible` ≤30 code points; `typingHint` giữ ký tự đầu khi level ≤2, không gợi ý level 5; `matchTyping` — packages/api/src/srs/quiz-rules.ts:12-61.
- RNG crypto + shuffle — packages/api/src/srs/rng.ts:10-57.
- Format: `formatInterval` m/h/d/w/mo/y :5-13; `formatCountdown` m:ss / h:mm:ss / Nd Nh :26-42 — packages/api/src/srs/format.ts.
- Ngày VN: `vietnamTodayISO` Intl Asia/Ho_Chi_Minh :27-29; `addDaysISO` neo UTC :33-38 — packages/api/src/vietnam-date.ts.

## §Validation + hợp đồng

- `vocabAnswerSchema` {clientLogId uuid, cardId, correct boolean, durationMs ≥0} `.strict()` — packages/api/src/contracts.ts:3585-3593.
- `vocabLearnCommitSchema` {clientLogId, cardId, gradeGood boolean, durationMs} — chú thích gradeGood = firstTryCorrect (`docs/srs-spec.md` §3b rule 7) — packages/api/src/contracts.ts:3595-3607.
- `VOCAB_DURATION_MAX_MS = 3_600_000` (clamp, không từ chối) :3097; `LIBRARY_AUDIO_MAX_BYTES = 5 MB` :3100; `VOCAB_ERROR_CODES` :3102-3116; `RESERVED_LIBRARY_ID_PREFIX_REGEX /^(libcourse|libdeck|libword)-/i` :3137-3138 — packages/api/src/contracts.ts.
- Suggestion item/mutation schemas :3469-3491; overview schema :3493-3535; session data schemas :3537-3583; card mutation response :3609-3616 — packages/api/src/contracts.ts.
- PRACTICE_SKILLS :347-355; PRACTICE_CATALOG_PAGE_SIZE = 12 :2238; HISTORY_SKILLS gộp vocab theo ngày :2296-2306, :2352-2362 — packages/api/src/contracts.ts.

## §Bảo vệ + giới hạn kỹ thuật

- Write guard: origin 403 :311-314; content-type 415 :315-318; bodyLimit 4096 → 413 :319-322 — apps/server/src/routes/vocab.ts.
- Audio allowlist: origin host `mochien3.1-api.mochidemy.com`; redirect hosts thêm `mochien-server.mochidemy.com`; timeout 10 s; ≤3 redirect — apps/server/src/routes/vocab.ts:167-176.
- proxyRemoteAudio: parse URL → https + host allowlist; redirect hop tiếp theo lọc host; content-type phải `audio/*`; content-length và byteLength ≤ 5 MB; trả buffer với `Cache-Control: private, max-age=86400`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`; mọi nhánh lỗi → cùng một 404 AUDIO_NOT_FOUND — apps/server/src/routes/vocab.ts:177-287.
- D1 chunks: MAX_CARD_INSERT_CHUNK = 10 (≤90 tham số), MAX_DECK_QUERY_CHUNK = 50 — apps/server/src/lib/vocab-provision.ts:24-30.

## §Provisioning + pool

- Access predicate: org + (classId NOT NULL và EXISTS enrollment active) HOẶC EXISTS suggestion accepted — apps/server/src/lib/vocab-provision.ts:81-108.
- `ensureDeckCards`: libdeck-* → nhánh thư viện (:374); org deck → kiểm access rồi chèn thẻ theo lô; mốc dueAt: org neo deck.createdAt (:419-431), thư viện neo thẻ đầu tiên hoặc LIBRARY_DECK_BASE_MS (:520-532); công thức baseMs − (n − 1) + idx chỉ để sắp xếp — apps/server/src/lib/vocab-provision.ts:368-594.
- `loadPool`: gộp thẻ org + thư viện, dedupe (599-608); giới hạn 100 (:686, :698); fallback khóa học khi pool < 20 → 50 (:721-740) — apps/server/src/lib/vocab-provision.ts:592-756.

## §Client wiring

- Engine key `${deck.id}:${sessionNonce}:${mode}`; LearnSession/ReviewSession gắn onCommit/onFirstResult → pendingTasks — apps/student/src/components/vocab/vocab-session-view.tsx:102-169; respond đệm khi đang pending :198-231; selfCheck 240 ms :279-300; Enter/Escape :302-334; dialog deck biến mất "Bộ từ đã bị xoá hoặc thay đổi" :524-551; exit confirm "Tạm dừng phiên học?" :553-586; LearnIntroCard "Lật thẻ xem nghĩa" / "Hãy lật thẻ để xem nghĩa trước khi chuyển sang bước luyện tập" :631-694.
- Panel phản hồi: verdict "Chính xác"/"Chưa đúng"/"Chưa nhớ" :50-66; persist lỗi + Thử lại/Bỏ qua :92-118 — apps/student/src/components/vocab/vocab-feedback-panel.tsx.
- Overlay: "Bạn vừa gặp 5 câu khó liên tiếp..." / "Đừng nản lòng nhé" / "Tiếp tục cố gắng" :12-40 — apps/student/src/components/vocab/wrong-streak-overlay.tsx.
- Tổng kết: learn "Đã thuộc N từ mới"; review "Đã ôn N từ vựng" :112-148; "Đợt ôn tiếp theo sau {formatInterval(1440)}"; "Missed first try" :25-34 — apps/student/src/components/vocab/vocab-summary.tsx.
- Countdown: tick 1 s, onExpired → refetch :12-24; "N từ sắp đến hạn" :33-51 — apps/student/src/components/vocab/vocab-countdown.tsx.
- Lesson card: subtitle :15-28; status completed/in-progress/new :30-48; findStartHereDeckId :49-68; WORD_COUNT_NOISE_RE lọc nhiễu đếm từ :70-90 — apps/student/src/components/vocab/vocab-lesson-card.tsx.
- Phát âm: nút "Nghe" / "Nghe chậm" 0.6x preservesPitch :7-20 — apps/student/src/components/vocab/vocab-pronunciation-buttons.tsx.
- Overview: totalNewCount :133-134; stat testids + nhãn "Từ mới"/"Đến hạn ôn"/"Chuỗi ngày (Streak)"/"Đã thuộc (L2+)"/"Thành thạo (L5) · Nhớ" :161-227; countdown render :216-227; empty state :253-267; suggestion errors :61-63, :77-79 — apps/student/src/routes/_auth/practice/vocabulary/index.tsx.
- Deck page: validateSearch course :15-19; 404 view "Không tìm thấy bộ từ vựng" :46-63; nextReviewIntervalLabel :78-90; "Đợt ôn tiếp theo sau X" :123-130; nút "Ôn tập (N)"/"Bắt đầu học (N)" + disabled title :130-176 — apps/student/src/routes/_auth/practice/vocabulary/$deckId.tsx.
- Session route: validateSearch mode learn|review :13-24; sessionNonce ổn định :37; handleExit invalidations :46-60 — apps/student/src/routes/_auth/practice/vocabulary/$deckId.session.tsx.
- Courses: debounce :44-57; empty "Không tìm thấy khóa học từ vựng phù hợp." :104-115 — apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx. Course detail: debouncedQuery :40-51; empty :86-96; auto-scroll "Bắt đầu tại đây" :74-95 — apps/student/src/routes/_auth/practice/vocabulary/courses/$courseId.tsx.
- Repos + query keys: ["student","vocab-overview"], ["student","vocab-session-data",deckId], ["student","vocab-library"] — apps/student/src/lib/repos/vocab.ts:1-234.
- Legacy redirect: normalization chống open-redirect — apps/student/src/lib/legacy-vocab-redirect.ts:1-32; e2e apps/e2e/specs/student-practice.spec.ts:232-237.

## §Tests (R1 — test là bằng chứng hạng nhất)

Không có test skip/todo/only/fails trong feature (quét grep). Các nhóm:

- API: apps/server/src/routes/vocab.test.ts:1-1501 — 16 test: auth 401 :264-270; CSRF 403 :271-284; IDOR 404 :366-385; provision race :304-321; due metrics :322-344; schema + audio headers :345-365; learn-commit clamp + transition :386-420; idempotency + race replay :421-487; batch atomicity :488-539; streak + forecast :540-625; CARD_NOT_DUE :626-657; positive states :658-698; audio proxy :699-812; suggestion lifecycle :813-1196; library courses :1197-1501.
- Biên giới: apps/server/src/routes/student-practice.test.ts:1-786 — catalog luyện đề (khác feature, cùng tiền tố).
- Đơn vị: S47 1-52 (14 vector đáp án + 3 learn-commit + 1 learned); S48 1-210 (6 test: chọn thẻ, encourage, forgot-cap, skip, remove, summary); S49 1-190; S50 1-186 (4 test); S51 1-40 (36 vector gõ); S52 1-41 (8 + 12); S53 1-262 (13); S54 1-491 (3 migration); S55 1-559 (12 view) + apps/student/src/components/vocab/vocab-session-view.e2e-loop.test.tsx (loop e2e nội bộ).
- E2E: S45 1-665 — 3 test serial: teacher tạo deck qua kernel UI; student Learn → countdown /^(1d 0h|23:59)/ + "Đợt ôn tiếp theo sau 1d" :359-486; seed thẻ quá hạn (INSERT vocab_card due_at quá khứ, comment dòng 12-18 giải thích không time-travel được) → due "1", streak "1 ngày", wrong-streak mirror, xóa deck giữ streak :488-665. S46 1-239 — test 4 :190-238: keyboard nav → /practice/vocabulary + 3 viewport + legacy redirect.
- Conformance vectors: packages/api/src/srs/vectors/level-vectors.json:1-1024 — answers 14, learnCommit 3, typing 14, eligibility 11, hints 11, intervals 8, learnSteps 9, learnQueue 6; script `verify:vectors` --check — packages/api/package.json:12; README gói vectors.

## §Entities + migration

- 5 bảng lõi: packages/db/src/schema/vocab.ts:1-203 (invariants vocab_card :84-124; vocab_review_log id = clientLogId + snapshot :126-157).
- 3 bảng thư viện: packages/db/src/schema/vocab-library.ts:1-83.
- Migrations: 0036 (4 bảng lõi) 1-66; 0037 (thư viện + audio_url + source_library_deck_id) 1-48; 0038 (vocab_suggestion + class_id nullable) 1-45; 0039 recreate vocab_card word_id đa hình (#366) 1-28; 0040 ALTER mô tả khóa 1-1 — packages/db/src/migrations/.
- Kết quả ghi answer: log (id = clientLogId, grade, durationMs, snapshot) + card (level/isWarning/state/intervalDays/dueAt/lapses/updatedAt) trong một batch — apps/server/src/routes/vocab.ts:979-1007.

## §Cross-repo hops

| Từ | Đến | Bằng chứng |
|---|---|---|
| Trang student (TanStack Router) | API server | apps/student/src/lib/repos/vocab.ts:1-234 (fetchers + keys) |
| Server route | contracts Zod | apps/server/src/routes/vocab.ts:1-10 (import VOCAB_ERROR_CODES + schemas) |
| Server | schema DB + provision | apps/server/src/routes/vocab.ts (import vocab-provision), apps/server/src/lib/vocab-provision.ts:1-30 |
| Client engine | packages/api thuần | apps/student/src/components/vocab/vocab-session-view.tsx:102-169 (new LearnSession/ReviewSession) |
| Lịch sử luyện tập | vocab log theo ngày | packages/api/src/contracts.ts:2296-2306, packages/api/src/contracts.ts:2352-2362 |
| Kernel học viên | app mount | apps/server/src/routes/student.ts:2407; apps/server/src/app.ts:440 |
| Catalog luyện đề | máy attempt dùng chung (student-quiz) | apps/student/src/lib/repos/quiz.ts:176-186 (submit /api/student/attempts/:id/submit); apps/server/src/routes/student.ts:1919; packages/db/src/schema/quiz-attempt.ts:28-66 (mode practice) |
| Điểm Viết/Nói luyện | hàng chờ chấm giáo viên + band IELTS | apps/server/src/routes/student-practice.test.ts:676-758; packages/api/src/lib/ielts-band.ts:143-152; apps/server/src/lib/media-response.ts:14-20 |

## §Luyện đề IELTS — phân hệ B (routes/student-practice.ts)

- Mount: `app.route("/api/student", studentPracticeRoutes(deps))` — apps/server/src/app.ts:440; router tự gắn
  `createStudentGuard` vì bootstrapMiddleware bỏ qua /api/student — apps/server/src/routes/student-practice.ts:205-209.
- GET `/practice?skill=&collection=&q=&page=`: 400 "invalid skill"/"invalid page" :236-245;
  filter org + status ready + skill + EXISTS part cùng org :247-267; instr(lower(title), q)
  chống wildcard :265; collection khớp chính xác :260-262; orderBy desc(createdAt), desc(id)
  :279-281; limit 12 :278; parts count + lastAttempt submitted mới nhất :285-316; nhãn điểm
  "Band x.x" (gradeScores + gradedAt) hoặc "đúng/tổng" từ snapshot :118-142; response
  {items, page, pages, total} :343-364 — apps/server/src/routes/student-practice.ts.
- GET `/practice/:testId/quiz`: 404 "test not found" khi đề thiếu/nháp/org khác/không part
  :374; resume lượt in_progress gần nhất :377-388; đề từ snapshot lượt dở hoặc gộp parts
  :390-392; shape sai → 404 (không xuống wire) :399-403 — apps/server/src/routes/student-practice.ts:367-410.
- POST `/practice/:testId/attempts`: guard CSRF/JSON/bodyLimit dùng chung factory quiz
  :212-221; 400 json/body :421-424; 404 :429; resume 200 cùng attemptId :435-449; tạo mới
  201 {attemptId uuid}, mode="practice", assignmentId null, snapshot gộp đủ key :450-469 —
  apps/server/src/routes/student-practice.ts:412-470.
- toPracticeQuizDetail: chrome từ part đầu, due rỗng (không hạn nộp), speaking lộ note,
  questions kèm type hiệu dụng — apps/server/src/routes/student-practice.ts:144-214.
- Tests (S44, 17 test): ready-only + shape :349-385; 400 :386-395 (skill=dictation → 400);
  collection/q :396-417; org isolation :418-430; 401 :431-437; tạo attempt :438-462;
  resume/retake :463-491; 404 draft/org khác/không part :492-503; CSRF 403/415 :504-536;
  đề sạch + resume answers :537-562; draft 404 quiz :563-573; submit KHÔNG stamp target
  :574-632; summary practice flag :633-645; không lọt attemptByTarget/bảng điểm :646-667;
  bài tập lớp không chứa đề practice :668-675; hàng chờ chấm nhãn "Luyện tập" :676-758;
  IDOR grading 404 :759-786 — apps/server/src/routes/student-practice.test.ts.
- E2E (S46): catalog → start → nộp → điểm "2/2" :120-158; KHÔNG lọt bảng điểm lớp
  :159-178; empty state :180-186; nav vocabulary :190-238 — apps/e2e/specs/student-practice.spec.ts.
- Client: startPractice + toast "Không bắt đầu được bài luyện tập" —
  apps/student/src/routes/_auth/practice/$skill.tsx:92-101; fetchPracticeCatalog parse
  practiceCatalogResponseSchema — apps/student/src/lib/repos/student.ts:521-620; nguồn đề
  assignment/practice + submit — apps/student/src/lib/repos/quiz.ts:32-48, :176-186; view
  làm bài dùng chung — apps/student/src/components/quiz/quiz-take-view.tsx (thuộc
  student-quiz, chỉ cross-ref).
- Band: ieltsOverallBand round(mean*2)/2 (nửa điểm), formatBand toFixed(1) —
  packages/api/src/lib/ielts-band.ts:143-152.
- Media bài nói: toQuizAttemptMedia — apps/server/src/lib/media-response.ts:14-20.
- Contracts: PRACTICE_SKILLS 4 kỹ năng :347-355; "KHÔNG có dictation" :2235;
  PRACTICE_CATALOG_PAGE_SIZE 12 :2238; practiceAttemptSummarySchema :2241-2253;
  practiceCatalogItemSchema :2256-2273; practiceCatalogResponseSchema :2276-2287;
  startPracticeResponseSchema :2290-2293; quizAttemptActionSchema (body rỗng strict)
  :2729-2730; studentQuizDetailSchema dùng chung :2765-2806 — packages/api/src/contracts.ts.
- quiz_attempt: mode "assignment"|"practice", CHECK DB assignment ⇒ assignment_id /
  practice ⇒ test_id, unique (assignmentId, studentId) không chặn retake (SQLite NULL khác
  nhau), test_id SET NULL khi xoá đề — packages/db/src/schema/quiz-attempt.ts:28-66.

## §Negative searches (R3/R2/R1)

- `VOCAB_WORD_NOT_FOUND`: chỉ contracts.ts + vocab-teacher.ts (phía giáo viên) — không route học viên nào trả (OQ-03).
- `VOCAB_INVALID_AUDIO`: không dùng trong surface học viên; dùng ở vocab-teacher/admin-library/placement-test (feature khác).
- `docs/srs-spec.md`: file không tồn tại; chỉ comment code + vectors README dẫn (OQ-02).
- i18n: không có catalog; wording literal trong TSX (GAP-1).
- skip/todo/only/fails: 0 kết quả trong mọi test của feature (GAP-6 rỗng).
- Dictation/Mock test: không nằm trong PRACTICE_SKILLS/HISTORY_SKILLS — comment hợp đồng
  "chưa có đề trong thư viện / chưa có dữ liệu thật" (contracts.ts:2235, contracts.ts:2296-2301);
  test phủ skill=dictation → 400 (student-practice.test.ts:386-395).
