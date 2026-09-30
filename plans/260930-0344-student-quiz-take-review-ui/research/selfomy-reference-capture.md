# Selfomy reference capture — student quiz take + review

Source: live session on `https://test123456.hoc.sh` (Laravel Livewire app, separate
product — NOT a teacher-os deployment; see `scout-evidence.md`). Quiz:
"Reading - Test 5 - Trainer 2" (`/learn/quizzes/01k3thn76sm2kjbp36hn8h27a2?is_preview=1`).
Captured 2026-09-30 via authenticated browser session (student test account, DOM/aria
dump + computed styles). Raw screenshots expired with the browser temp dir; re-capture
is possible with the test account if needed during implementation.

## URL map (parity targets)

| Screen | Selfomy URL | teacher-os target |
|---|---|---|
| Take | `/learn/quizzes/{quizId}` | `/learn/quizzes/:assignmentId` |
| Result summary | `/learn/quizzes/attempt/{attemptId}` | same shape |
| Review detail | `/learn/quizzes/attempt/{attemptId}/detail` | same shape |

## Entry / lifecycle dialogs (SweetAlert2 modals)

1. Start: "Bạn có muốn bắt đầu làm bài ngay bây giờ không?" → `Bắt đầu` / `Quay Lại`.
2. Resume on re-entry with in-progress attempt: "Bạn có bài làm chưa hoàn thành. Bạn có
   muốn tiếp tục không?" → `Tiếp tục` / `Quay Lại` (answers restored from server).
3. Submit guard: "BẠN CÒN CÂU HỎI CHƯA LÀM, BẠN CÓ MUỐN NỘP BÀI KHÔNG? Ở bài thi thực tế,
   bạn không thể nộp bài trước khi hết giờ." → `Quay Lại` / `Nộp bài`.

## Take screen

Header (white, 51px, border-b, sticky tools row):
`Thoát` ghost btn + logo | quiz title | icon tools (My Notes, Font Size, Fullscreen) |
countdown `HH:MM:SS` (indigo, 600) | `Nộp bài` solid indigo button.

Paper (single column, Inter 16/24):
- `Part 1` H1 + italic rubric with bold "Questions 1-13" + passage H2 + rich-text
  paragraphs (superscripts, lists preserved).
- Question groups: H2 "Question 1 - 4" / "Question 5 - 8" / "Question 9 - 13" + per-group
  rubric ("Do the following statements agree…", "Write ONE WORD ONLY…").
- TFNG items: number + statement + 3 full-row radio pills (True / False / Not Given).
- Flow-chart / notes completion: inline text inputs (60px, 1px slate border, 4px radius,
  8x12 padding) embedded in prose/lists/arrows (↓), number prefix before each blank.

Footer navigator (white, border-t):
- `Part 1 | Part 2 | Part 3` tabs; current part's questions expanded as 32px square
  buttons, other parts collapsed to range labels ("1 - 13", "27 - 40").
- Button states: unanswered = white bg / gray-200 border; answered = solid indigo
  (`bg-primary-500 text-white`) or light indigo (`bg-primary-50 border-primary-500
  text-primary-700`). Click scrolls to the question.

Autosave: every interaction POSTs to `/livewire/message/lms.quiz.take-quiz`
(server-side persistence; nothing answer-related in localStorage). Timer was resumed
across sessions (40:00 test, re-entry showed ~39:58).

Reading tools: "Tô sáng" (text highlighter), "Thêm ghi chú" (selection → note), My Notes
side panel (count badge, "Clear Section Notes", per-section notes), Font Size, Fullscreen.

## Result summary (`/learn/quizzes/attempt/{id}`)

- Header: `Thoát` | title | `Tải bài làm` | `Làm lại`.
- Submitted-at timestamp + "Chúc mừng, bạn đã hoàn thành bài kiểm tra trong 00 giờ 22
  phút 32 giây!"
- Score card: `Điểm` big number + counters `Câu đúng: 1 · Câu sai: 1 · Câu bỏ qua: 38`.
- CTA `Xem giải thích chi tiết` → detail screen.
- Compact per-part list: `n → your answer ("-" if skipped) → "Đáp án X"`. Multi-answer
  alternates render as "major repairs / repairs"; two-letter answers order-insensitive
  ("B / E" matches "E / B").

## Review detail (`/learn/quizzes/attempt/{id}/detail`)

- The full paper re-rendered read-only (passage + groups + footer part navigator).
- Per question: your-answer chip colored by verdict (wrong = `bg-red-500` white text;
  skipped = "Chưa trả lời"), then `Đáp án` label + correct answer, then an `Explain`
  button per question. My Notes tools still available.

## Auto-grading semantics observed

- Text answers: trim + case-insensitive ("glue" == "glue"), alternates via " / "
  separator, multi-answer order-insensitive.
- Radio/choice answers stored as the option value (True/False/Not Given, letters,
  roman numerals for matching).
- Skipped counted separately (correct + wrong + skipped = total).
