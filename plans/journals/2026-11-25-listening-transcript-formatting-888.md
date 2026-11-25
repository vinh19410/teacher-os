---
title: "Định dạng transcript bài nghe IELTS theo đoạn văn và người nói (#888)"
date: 2026-11-25
summary: "Xây dựng bộ phân tích transcript thuần không phụ thuộc DOM và component <TranscriptBody> dùng chung cho QuizPaper và StudyPackItemViewer, xử lý đồng bộ toàn bộ 558 bài nghe và bảo toàn biên bảo mật DOMPurify/SSR (#888)."
---

# Journal: Định dạng transcript bài nghe IELTS theo đoạn văn và người nói (#888)

- **Date:** 2026-11-25
- **Issue:** #888 (`fix(listening): transcript là một khối chữ, không chia đoạn hay người nói`)
- **Branch:** `vinh19410/fix-listening-transcript-l-m-t-kh-i-ch-kh-ng-chi` (target: `develop`)

## Bối cảnh & thực tế điều tra
- Trang xem lại chi tiết bài nghe (`/student/learn/quizzes/attempt/:attemptId/detail`) đang đổ thẳng `{transcript}` vào một khối `<div className="mt-2 whitespace-pre-line text-muted-foreground leading-relaxed">` trong `packages/ui/src/components/quiz/quiz-paper.tsx:864-877`.
- Khảo sát toàn bộ **558** bài nghe trong kho (`498` file `docs/listening_ielts/*.json` + `60` bài nghe trong `packages/db/seed-data/study-packs/`) cho thấy dữ liệu có đủ 6 dạng dị biệt:
  1. `361/498` file chỉ có `\n` đơn không dòng trống (`City Health Services`: 37 dòng, 0 dòng trống) kèm `180` file có tiền tố kép `Speaker 1: Agent:` và `15` file bị **ASR diarization drift** (cùng `Speaker 1` gán cho nhiều vai trò khác nhau).
  2. `137/498` file có 0 ký tự xuống dòng: `15` file chuyển người nói ngay trong dòng (*Talking about the history of bikes* có 14 dấu `NARRATOR:`, *Apartment in Arillas* có 44 lượt) và `122` bài độc thoại dài 3.000–5.000 ký tự (có file dính câu thiếu khoảng trắng như `.Many`, `.Puffins`).
  3. `7` file dính dấu câu sát tên người nói nội dòng (`.MARY:`, `?CUSTOMER:`, `?Dr.Twain:`, `.HENRY:`, `?Man:`), `13` file có dòng tiêu đề người nói đứng riêng (`LISA:\n\n...`, `Lectuerer:\nSpeaker 1:...`), và các file study pack có glossary `(Adj):` / `(Note:` dễ bị bắt nhầm thành nhãn người nói.
  4. Do `library-test-sync.ts` nhân bản đề sang bản sao theo org (`INF-03`) mà không ghi đè, xử lý tại tầng hiển thị trong `@teacher-os/ui` khắc phục ngay toàn bộ lượt làm cũ, bản sao org, study packs và đề giáo viên tự dán/soạn bằng Tiptap mà không cần migration DB.

## Thay đổi & Quyết định kỹ thuật
- **Bộ phân tích thuần không phụ thuộc DOM (`packages/ui/src/lib/transcript.ts`):**
  - `classifyTranscriptInput`: tách an toàn HTML phẳng chỉ chứa `<p>`/`<br>` không thuộc tính và các entity đã biết thành văn bản thuần để đi qua parser; giữ mọi HTML giàu định dạng, entity lạ, thẻ thuộc `<head>` (`<script>`, `<style>`) và thẻ nguy hiểm chưa đóng (`<svg onload=...>`) đi qua nhánh `RichTextBody` duy nhất.
  - `parseTranscript`: pipeline 5 pass tuyến tính O(N) có giới hạn roster (`MAX_INLINE_ROSTER_SIZE = 24`) chống ReDoS — phân loại & chuẩn hoá dòng, phát hiện người nói nội dòng (hỗ trợ Unicode `\p{L}`, biến thể hoa/thường và `Speaker N:` trần), gỡ tiền tố kép ở cả đầu dòng lẫn nội dòng, ánh xạ `Speaker N → Role` chỉ khi không nhập nhằng (bảo toàn `Speaker N` nếu bị drift), ẩn nhãn `Speaker 1` đơn lẻ ở bài độc thoại, gộp đoạn liền kề cùng người nói và tách đoạn dài (`> 550` ký tự, `>= 5` câu) qua `splitMonologueParagraphs` bảo toàn viết tắt (`Dr.`, `U.S.`, `a.m.`), số thập phân và trích dẫn.
- **Component `<TranscriptBody>` (`packages/ui/src/components/quiz/transcript-body.tsx`):**
  - Một `useMemo` vô điều kiện (tuân thủ Rules of Hooks qua mọi lần rerender chuyển nhánh plain ↔ HTML), giữ `RichTextBody` là `dangerouslySetInnerHTML` sink duy nhất trong repo (`docs/system-architecture.md:60`), nhãn người nói in đậm nội dòng theo neutral oklch tokens của `DESIGN.md`, chống tràn ngang ở 320px (`min-w-0 break-words`, `[&_table]:block [&_table]:overflow-x-auto`).
  - Tích hợp vào `QuizPaper` (kèm `min-w-0` trên `<details>` và focus ring trên `<summary>`, giữ tuyệt đối không lộ ở `mode="take"`) và `StudyPackItemViewer` tab `"Đề & Đáp án"`.

## Xác minh & Review
- **TDD + 558-corpus invariants (`packages/ui/src/lib/transcript.test.ts`):** 19 test chạy dưới `// @vitest-environment node`, kiểm tra bất biến không mất từ trên toàn bộ 558 bài nghe và benchmark chống ReDoS 25 KB / 1.600 dòng.
- **Component, SSR & Leak Canary:** `quiz-paper.test.tsx` (42/42), `apps/student/test/quiz-paper.test.tsx` (Node SSR `renderToStaticMarkup`), `study-pack-item-viewer.test.tsx`, `preview-quiz-simulation.test.tsx` (take-mode leak canary + review-mode).
- **Code Review độc lập (`code-reviewer`):** 0 Critical / 4 Important / 3 Minor — đã sửa dứt điểm cả 7/7 (tách `Speaker N:` trần nội dòng, tiền tố kép nội dòng, biến thể hoa/thường, test ASR drift chặt hơn, Unicode `\p{L}`, giải mã entity HTML phẳng + fallback entity lạ, dọn biến thừa và `min-w-0`).
- **UI 3 viewport & a11y:** Chụp và kiểm tra trực quan 5 ảnh Playwright (1440×900 Light/Dark, 768×1024 Light, 375×812 Light/Dark) trong `plans/reports/888-listening-transcript-*.png`, kiểm tra 320px reflow (token dài + bảng rộng: `scrollWidth === 320`) và đóng/mở `<details>` bằng phím `Enter`/`Space`.

## Bài học & Bước tiếp theo
- **Bài học:** Kiểm chứng tự động trên toàn bộ corpus thật (558 file) phát hiện ra nhiều dị biệt thực tế (`][1]} Peter:`, `.MARY:`, ASR drift, solo `Speaker 1` sau gộp, HTML phẳng từ Tiptap) mà kiểm thử thủ công trên 2 ví dụ mẫu chắc chắn bỏ sót.
- **Bước tiếp theo:** Hợp nhất PR vào `develop`, theo dõi CI và Staging deploy xanh, xác minh trực tiếp bài *Talking about the history of bikes* và *City Health Services* trên Staging.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
