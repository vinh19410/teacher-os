# Phân tích nghiệp vụ game học từ vựng Knowt (REA)

- **Ngày:** 2026-10-19
- **Mục tiêu:** https://knowt.com/flashcards/85aba543-7d71-4ca8-8c12-b26eebfc780a (bộ "Main Vocabulary", 17 thẻ EN–VI)
- **Phương pháp:** Reverse-engineer tĩnh JS bundle công khai (Next.js + Turbopack). Tải 241 chunk (19.7MB) từ trang flashcard + 6 route `/study/flashcards/{id}/{learn,match,test,spaced,review,call}` + các chunk lazy-reference. Phân tích bằng REA CLI `analyze-javascript-application` + đọc trực tiếp code đã beautify.
- **REA Evidence:** `ev_0d8c11265302d92d7913239894e281552b3bab0d5e569b5bf050278507fff807` (241 files, 3,347,719 AST nodes, 651 findings, 0 parse failure). Snapshot: `/tmp/knowt-rea/app`, evidence: `/tmp/knowt-rea/app-evidence-final.json`.
- **Giới hạn:** phân tích tĩnh client. Thuật toán sinh câu hỏi/lịch SRS gốc chạy trên server — client chỉ nhận kết quả (`questions[]`, `spacing{}`); các con số intervals mặc định và công thức điểm Play theo thời gian là suy luận từ dữ liệu client nhận được, không quan sát được server code.

## 1. Kiến trúc tổng quan: server-driven, client render

- Mọi game mode là **session do server điều phối**: client gọi `StartFlashcardSetStudySessionRound` → server trả `questions[]` đã sinh sẵn (flashcardId, `distractors`, `questionType`, `answerSide`, `buttons`, `tfIsCorrect`, `spacing{AGAIN,HARD,GOOD,EASY}`); client chấm sơ bộ local rồi batch nộp `GradeFlashcardSetStudySessionV2` → server trả về `studySession` + `studyStates` mới (nextDue, interval, eFactor, progress).
- Realtime: Knowt Play dùng **GraphQL subscription `onPlayUpdate`** broadcast toàn bộ session state (participants, câu hỏi, leaderboard, timestamps).
- Route: `/study/flashcards/{setId}/{learn|test|spaced|match|review|call-with-kai}`; Knowt Play là session riêng có `sessionId` + mã join.

## 2. Data model lõi (GraphQL)

`StudySessionType` = LEARN, MATCH, SPACED, REVIEW (flashcards + card sorting), TEST, PLAY, CALL_WITH_KAI.

**FlashcardStudyState** (mỗi user × mỗi thẻ — chính là state SRS):

| Field | Ý nghĩa |
|---|---|
| `eFactor` | ease factor kiểu SM-2 |
| `interval` | số ngày đến lần ôn kế |
| `difficulty` | độ khó thẻ |
| `nextDue` | hạn ôn tiếp theo |
| `distractors` | danh sách ID thẻ nhiễu (server chọn sẵn theo thẻ) |
| `mastery` | mức thành thạo |
| `blank` | vị trí ô trống (câu FILL_BLANK) |
| `progress` | NEW → LEARNING → REVIEWING → MASTERED |
| `history[]` | timestamp, timeTaken, mode, questionType, selectedFlashcardId, side, **button**, isCorrect, answer |

**StudySession** per set: `settings` từng mode, `progress {NEW,LEARNING,REVIEWING,MASTERED}`, `newCards`, `nextDue`, `nextNewDue`, `examDate`, `practiceTests[] {timeTaken,timestamp,score}`, `callWithKaiRounds[] {chatId,timeTaken,timestamp,score}`.

## 3. Nghiệp vụ từng game

### 3.1 Learn ("A personalized and smart learning plan")
- Settings: questionTypes (Flashcards/MCQ/Written/True-False), answerSide (Term/Definition/Both), **cards per round mặc định 7, tối thiểu 4**, starred only, shuffle, **smart grading (fuzzy)**, **re-type answers** (sai câu Written phải gõ lại), **allow override wrong answers**.
- Luật vòng: trả lời sai → thẻ **đưa về cuối hàng đợi**, phải trả lời đúng mới kết thúc round. Câu đúng ngay lần đầu mới tính "correct" cho XP; câu "previouslyIncorrect" hoặc skip không được thưởng.
- Hoàn thành set khi `progress.MASTERED === tổng thẻ`. Master hết set → action `FULLY_MASTER_SET` (100 XP + 2 XP/thẻ mastered).
- AnswerSide mặc định do client đo: random sample 10 thẻ, **side nào ngắn hơn trung bình làm câu hỏi**.
- Ngắt giữa chừng: guard `usePreventPageClose` khi còn dữ liệu chưa commit.

### 3.2 Spaced Repetition ("Scientifically backed study method")
- Đánh giá 4 nút **AGAIN / HARD / GOOD / EASY** (kiểu Anki). Sau mỗi câu, server trả `spacing{}` — mỗi nút kèm khoảng thời gian "Show in X" (ms offset do server tính); focus mặc định = GOOD nếu đúng, AGAIN nếu sai; phím 1–4 + arrow + Enter.
- Settings: cardsPerSession ("new cards per day"), **4 intervals tùy chỉnh (mặc định 0 = để server quyết) — paywall Ultra**, questionTypes, answerSide, starred, shuffle, fuzzy. Exam date picker (mặc định +7 ngày).
- Due logic client: `min(nextDue, nextNewDue) − SHOW_EARLY_BY(20 phút) ≤ now` thì mới cho "Continue to next round"; chưa đến giờ → nút **"Notify when to continue"** (push STUDY_REMINDER). Toast khi chưa due: "Spaced repetition uses time intervals to optimize learning…".
- State thẻ SM-2 (eFactor/interval/nextDue) cập nhật qua `GradeFlashcardSetStudySessionV2`.

### 3.3 Match (matching game)
- Mỗi thẻ sinh 2 ô (term + definition, kèm ảnh nếu có) → **shuffle toàn bộ**. Chọn 2 ô: cùng flashcardId → match, animation ẩn đi; khác → viền đỏ, reset sau 150ms.
- **Không tính điểm, không phạt — thước đo duy nhất là thời gian hoàn thành** (count-up timer, hiển thị mm:ss + "12.3s").
- Mỗi cặp ghép (đúng/sai) đều ghi history `questionType: MATCHING, side: BOTH, mode: MATCH` và submit ngay (`submitImmediately`) → ảnh hưởng SRS state của thẻ.
- Settings: số thẻ (min 4), starred only, grid (kích thước lưới). End screen: "You finished matching all your terms in MM:SS" + quảng cáo (free user) + feedback + next: Learn / Practice Test / Try Match again.

### 3.4 Practice Test ("Test on your terms and definitions")
- Settings: số câu (min 4), **difficulty Easy/Medium/Hard**, language, answerSide, questionTypes (MCQ/Written/TF), starred, shuffle, fuzzy.
- Chấm local: MCQ = đúng index hoặc text khớp chuẩn hoá; TF = "True"/"False"; Written = so chuỗi chuẩn hoá (NFKC, lowercase, collapse space, strip markdown `*`/`_`, normalize quote/ellipsis) — bật fuzzy thì **ignoreAccent + `token_sort_ratio > 80`** hoặc chấp nhận biến thể "a/b/(c)" (user gõ bất kỳ phương án trong ngoặc/không ngoặc đều đúng).
- Kết quả: điểm %, màu teal ≥75%, sunset >50%, đỏ ≤50%; có retake; lưu `practiceTests[] {timeTaken, timestamp, score}`.

### 3.5 Flashcards + Card Sorting (REVIEW)
- Flashcards: carousel (Swiper), lật thẻ Space/↑/↓, S star, A audio, R restart; cuối carousel gợi ý chuyển Learn/Spaced.
- **Card Sorting**: duyệt từng thẻ bấm **Know (→) / Still learning (←)** (`FlashcardSortingEnum KNOW/D_KNOW`); cuối vòng applaud + điểm, tuỳ chọn replay **chỉ nhóm "Still learning"** hoặc restart đầy đủ, hoặc chuyển Learn/Practice Test. Kết quả sync vào `sort` của study state.

### 3.6 Call with Kai ("Voice tutor for students")
- **Gemini Live voice call** (token qua `GenerateGeminiEphemeralToken`), ~23 ngôn ngữ hỗ trợ (có tiếng Việt), settings: language, **questions per round**, starred, shuffle; chơi theo "Round N", mỗi round ghi `callWithKaiRounds {chatId, timeTaken, timestamp, score}` qua `GradeFlashcardCallWithKaiRound`.
- **Safety bắt buộc với học sinh**: transcript/message được moderation, phân loại SELF_HARM > VIOLENCE > PROFANITY (ưu tiên theo severity), sinh incident notification cho teacher dạy chung ("Kai, the AI tutor, generated violent content in…" / "… expressed intent to harm…").

### 3.7 Knowt Play (live multiplayer classroom) — 5 loại game
`PlayGameType` = **CLASSIC, RACE, JEOPARDY ("Clash"), SURVIVAL, BLITZ**.
- Vòng đời: `PlaySessionStatus LOBBY → IN_PROGRESS → COMPLETED`; `PlayGameState ACTIVE → GAMEBOARD/LEADERBOARD/PAUSED → FINALIZING → FINISHED`; participant `JOINED/KICKED/LEFT/TEAM/ELIMINATED` (SURVIVAL loại trực tiếp). Timing server đồng bộ: `timestamps {countdownStart/End, preQuestionStart/End, questionAnswerStart/End, globalStart/End}`.
- Cấu hình host: requireSignIn, showQuestionOnStudentDevice, groupMode (đội), groupType **RANDOM/SELF_CHOOSE**, 2 team mặc định, **max 4 người/đội**, gameboardSize (Clash), numQuestions, questionTypeCounts; cho phép **late join / kick / pause**.
- **Điểm: tối đa 1000/câu** (`KNOWT_LIVE_MAX_SCORE`), BLITZ đáp sai **−300** (`BLITZ_PENALTY_POINTS`); leaderboard lưu `totalScore, rank, correctAnswers, currentStreak/longestStreak, xp, coins` — chơi Play thưởng luôn XP + coins.
- Chấm câu: MCQ/TF so index; **SHORT_ANSWER fuzzy `ratio ≥ 85%`** sau clean/normalize.
- Validation trước start: đủ câu cho participant (RACE/BLITZ đội cần ≥ 2×ceil(n/teams) câu MCQ — mỗi người một câu riêng, distractor chia theo `getMemberQuestionsOptionsChunkSize`); Clash cần đủ câu cho board ("The board requires X questions but only Y are configured").
- Nguồn câu hỏi: từ **flashcard set / note / assignment** (originContentItem), có filter theo loại câu.

## 4. Gamification (XP / Level / Streak / Coins / Badge)

- **Công thức round**: `roundXP = (10 XP nếu round đầu) + 2 XP × câu đúng-lần-đầu` (dùng chung cho Learn/Match/Spaced/Test qua `calculateStudyRoundXP`, action `FINISH_LEARN_MODE_ROUND`).
- XP khác: FULLY_MASTER_SET **100** + 2/thẻ; FINISH_EXAM_PRACTICE 10 + 2/đúng; tạo nội dung AI (flashcard/test từ notes/video/PDF) **25**; CREATE_CLASS 25, JOIN_CLASS 10, INVITE_STUDENT 10, FILL_DPA 100; CHAT_WITH_AI 5; rating 5/10.
- **Level**: 150 mốc XP hard-code (50, 110, 180, 260, 350, 460, 590, 740, 920, 1130…); quá level 150 thì mỗi level +10% tích lũy. `getDeltaXPForLevel`, `getAccumulatedXPForLevel`.
- **Streak**: hành động mỗi ngày (`ListDailyActivity` per-day: xp, items[], streakAction, badgesEarned, coinsEarned); item store mua **STREAK_FREEZE / STREAK_REVIVAL / LONG_PAUSE**; **hồi streak tối đa 14 ngày** (`MAX_DAYS_TO_REVIVE_STREAK`); coins thưởng theo mốc streak ngày {0:100, 6:125, 11:150, 26:175, 51:200}.
- **Badge** 5 tier quest (ngưỡng XP 0/500/1125/3375/7750/12750), claim qua `ClaimBadgeReward`; `WatchAd` — xem quảng cáo đổi thưởng cho free user.

## 5. Kiểm soát giáo viên & paywall

- Teacher **khoá từng mode** per set/class (`localBlockedStudyModes`, "This feature is blocked by your teacher") — áp cả CALL_WITH_KAI.
- Paywall Ultra: custom SRS intervals, nhạc nền study (10/13 track premium), xem lại session cũ, settings nâng cao; quảng cáo hiển thị ở end-screen Match (và các mode khác) cho user BASIC — user trong class của teacher đăng ký TEACHER_LIMITLESS thì được "trải nghiệm không quảng cáo".
- Analytics per mode cho teacher: "Send a link to your students to track their progress" — Learn/Test/Matching/Spaced/Call/Chat có bảng analytics riêng (`ListClassStudySessions`, `ListClassFlashcardStudyStates`).

## 6. Bài học cho Teacher OS (vocab SRS game #359, #361)

1. **Server sinh câu hỏi + distractors theo thẻ** (không sinh client) — chống cheat và tái dùng cho mọi mode; client chỉ chấm preview rồi batch nộp.
2. **Một state SRS dùng chung mọi mode**: Match/Practice Test cũng ghi history và cập nhật nextDue → tiến độ hợp nhất, đúng hướng thiết kế của #359.
3. Fuzzy grading 2 tầng đáng học: chuẩn hoá NFKC/strip markdown trước, fuzzy chỉ khi bật; ngưỡng **token_sort_ratio > 80** (viết) và **ratio ≥ 85%** (Play short answer) — 2 con số tham chiếu tốt cho grading tiếng Việt.
4. XP gắn "đúng lần đầu" (chống farm bằng cách trả lời lại); round đầu mới có base XP.
5. Match không cần điểm — **thời gian hoàn thành** là metric đủ mạnh và rẻ để implement.
6. Due gate "SHOW_EARLY_BY 20 phút" + notify khi đến hạn là chi tiết giữ người quay lại.
7. Teacher controls + AI moderation là điều kiện bắt buộc khi đưa AI voice/chat cho học sinh (Call Kai precedes).

## 7. Phụ lục: chỉ mục code

| Nội dung | Chunk |
|---|---|
| Enum barrel (tất cả enum nghiệp vụ) | `d1bf6411b94c75af.js` |
| Toàn bộ GraphQL documents | `b9973dec8b0e4152.js` |
| XP/level/streak tables, `calculateStudyRoundXP` | `279766b022d23d1d.js`, `ab78460583c8df60.js` |
| Grading local + fuzzy + distractors + default answerSide | `d708b598f87971b7.js` (module 684020/738937) |
| `useStudySession` hook (queue, commit, advance) | `4e7e192a00453153.js` |
| Learn mode UI + previouslyIncorrect + exam plan | `96ed4e20accf74a3.js` |
| Spaced UI (4 nút, due gate, notify) | `209ad981ee3a2702.js` |
| Match engine + timer + end screen | `a1ea56596fa610d6.js` |
| Practice Test (settings, score màu) | `22639bf1081b444d.js`, `66b95bd9b813e763.js` |
| Settings panel 4 mode + min length + exam date | `7d505698de743ded.js`, `d708b598f87971b7.js` |
| Knowt Play: hằng số, validation, correct check | `109c6b0671cb96fa.js` |
| Subscription onPlayUpdate + streak products + Gemini | `d7057376554057bc.js` |
| AI safety incidents | `9babda8bb219e794.js` |
| Study mode list + shortcuts (Card Sorting ←/→) | `84fda0e24cfe701b.js`, `c422a4bd96d1c793.js` |

*Các chunk lưu tại `/tmp/knowt-rea/app` (bản gốc) và `/tmp/knowt-rea/pretty` (đã beautify) — thư mục tạm, sẽ bị hệ thống dọn.*
