# Research: Cấu trúc UI/UX màn hình tạo bài tập IELTS theo từng dạng — tối ưu nhập liệu cho giáo viên

- Thời điểm nghiên cứu: 2026-09-25
- Câu hỏi: Với 26 dạng đề hiện có trong teacher-os (14 Reading, 8 Listening, Writing, Speaking), cấu trúc UI/UX authoring nào giúp giáo viên nhập đề nhanh và ít lỗi nhất?
- Phạm vi: pattern authoring có bằng chứng từ sản phẩm thật (H5P, Moodle, Canvas, Wordwall, ISLCollective, Wayground/Quizizz), đối chiếu với data model và editor hiện tại của repo. Không bao gồm luồng học viên làm bài.
- Báo cáo format IELTS chính thức (câu lệnh, quy tắc chấm, số câu) đã có sẵn: [research-2026-09-25-ielts-reading-question-types.md](research-2026-09-25-ielts-reading-question-types.md) và `plans/260925-0515-reading-all-question-types/reports/research-ielts-formats.md` — báo cáo này không lặp lại, chỉ dùng làm cơ sở ràng buộc.

## TL;DR

26 dạng đề hiện có không cần 26 form riêng. Chúng quy về **4 họ nhập liệu + 1 dạng đặc biệt (ảnh ghim nhãn)**, và điểm nghẽn lớn nhất hiện không phải thiếu form mà là **nhập kép**: giáo viên gõ nội dung (summary/bảng/stem) rồi phải gõ lại đáp án vào ô `answer` riêng. Năm đầu tư có tác động lớn nhất:

1. **Cloze editor "click-vào-chữ-để-tạo-chỗ-trống"** — phục vụ 10/26 dạng; đáp án tự sinh từ từ được chọn, xóa bỏ nhập kép.
2. **Answer-key grid dạng lưới** (một hàng/câu, chip chọn) — phục vụ 8 dạng 3-state và trắc nghiệm; nhập bằng phím là chính.
3. **Bank lựa chọn có cấu trúc cho matching** — thay vì nhét ngân hàng A–H vào ô text `intro` như hiện tại; dropdown chọn chữ cái + highlight chữ đã dùng.
4. **Ảnh + ghim nhãn số** cho diagram (Reading) và map (Listening) — pattern Wordwall.
5. **Chống mất dữ liệu + validation on blur + autosave draft** — đang có rủi ro thật: đổi dạng là xóa sạch nội dung đã soạn, và editor là `useState` thuần nên refresh là mất.

## 1. Bối cảnh hiện tại của repo

- Editor duy nhất tại `/assignments/new` (`apps/web/src/routes/_auth/assignments/new.tsx`, form chính `prompt-composer.tsx`, key editor `question-key-editor.tsx`), state là `useState` thủ công (`@tanstack/react-form` có trong deps nhưng chưa dùng).
- Đổi part/type **reset** intro/imageUrl/items (`new.tsx:205-237`) — cố ý chống leak URL nhưng là mất dữ liệu thật cho giáo viên.
- Mỗi câu lưu `{stem, opts, answer, alts}` trong JSON `questions`; 2 dạng matching mới (`features`, `sentend`) lấy ngân hàng lựa chọn từ **text tự do `intro`**, không validate giữa bank và đáp án.
- `qStart` cố định theo part (1/14/27); chưa có đánh số lại khi thêm/xóa câu; chưa có field `explanation`.
- Đã có split-pane preview phía học viên và placeholder hint theo dạng (`TYPE_HINTS` trong `assignment-presets.ts`).
- Writing/Speaking chỉ là đề văn bản (prompt/cue card), chưa có câu hỏi.

## 2. Nguyên tắc xuyên suốt (có bằng chứng)

**P1 — Progressive disclosure, hiện đúng thứ dạng đó cần.** NN/g (7/2025) chỉ ra form phức tạp nên chỉ hiển thị những gì liên quan tại từng bước để giảm tải nhận thức. Editor hiện tại đã làm đúng chiều này (ẩn/hiện field theo skill) — giữ nguyên tắc, mở rộng xuống từng dạng: mỗi dạng chỉ thấy đúng bộ field của mình (xem §3).

**P2 — Cloze bằng cách đánh dấu trên văn bản, không phải ô riêng lẻ.** H5P Fill in the Blanks cho giáo viên gõ/dán văn bản và đánh dấu đáp án ngay trong dòng: `*đáp án/phương án khác*`, dấu `+` chỉ định gợi ý hiển thị sẵn, tự động gợi ý dropdown từ toàn bộ từ trong bài, không phân biệt hoa/thường. H5P Drag the Words dùng cùng cú pháp `*từ*` để đánh dấu từ kéo-thả. Các công cụ cloze đơn giản hơn (Cloze Generator, lextutor) đi tiếp bước nữa: **kéo chọn từ bằng chuột là thành chỗ trống, đáp án tự sinh**. ISLCollective áp đúng pattern này lên transcript video cho bài nghe. Đây là pattern nền cho Family D.

**P3 — Matching = bảng cặp + dropdown, bank là dữ liệu có cấu trúc.** Moodle và Canvas New Quizzes đều author matching bằng danh sách cặp (prompt ↔ đáp án) + mục nhiễu; học viên trả lời qua dropdown. Điểm mấu chốt cho authoring: ngân hàng lựa chọn là **một danh sách dòng riêng**, nhãn A/B/C… sinh tự động, và key được chọn bằng dropdown/chip — không phải gõ chữ cái tay vào ô text. Với dạng không cho dùng lại (sentend: mỗi ending đúng 1 lần — theo nghiên cứu format trong repo), UI nên **làm mờ chữ cái đã dùng**.

**P4 — Answer key dạng lưới compact.** Pattern bảng đáp án kiểu phiếu scantron (một hàng/câu, tick lựa chọn) là cách nhập nhanh nhất cho các dạng đáp án đóng: không cần mở rộng từng câu. Áp cho tfng/ynng (chip 3 trạng thái T/F/NG) và mcq (chip A/B/C/D), kèm phím tắt.

**P5 — Ảnh + ghim nhãn số.** Wordwall "Label the diagram": giáo viên tải ảnh lên, **click lên ảnh để đặt điểm nhãn**, mỗi điểm gắn text; điểm gắn với ô trống của học viên. Áp cho diagram label completion và map labeling, có kéo dời điểm, toạ độ lưu theo % để responsive.

**P6 — Validation inline khi blur, không chặn phím gõ.** NN/g: validate theo thời gian thực tại blur thay vì mỗi keystroke; lỗi hiển thị cạnh field. Hiện repo đã mirror validation 3 nơi (contract zod / new.tsx / preview) — giữ nguyên tắc "lỗi hiện ngay tại dòng câu đang sai", không popup chặn.

**P7 — Chống mất dữ liệu là yêu cầu cứng.** Đổi dạng reset sạch nội dung hiện tại là lỗi authoring phổ biến nhất kiểu "mất trắng". Cần: (a) dialog xác nhận, (b) giữ các field dùng chung (title, passage/intro, transcript) chỉ reset phần đặc thù (items, imageUrl), (c) autosave draft (localStorage/sessionStorage) vì state `useState` thuần mất khi refresh.

**P8 — Nhập hàng loạt từ paste + AI draft (giai đoạn sau).** Wayground (Quizizz) AI cho tạo bộ câu hỏi từ tài liệu/PDF/passage rồi giáo viên sửa lại; ISLCollective/Edpuzzle cho gắn câu hỏi vào nội dung có sẵn. Với giáo viên IELTS vốn có sẵn đề trong Word/PDF, pattern "dán nhiều dòng → tách thành câu" (vd `1. B`, `2. tunnel / tunneling`) cho key grid là bước hữu ích, chi phí thấp; AI sinh draft là giai đoạn sau.

## 3. Cấu trúc nhập liệu theo từng dạng

### Family A — Đáp án 3 trạng thái: `tfng`, `ynng`

| Thành phần | Đề xuất |
|---|---|
| Nội dung | Danh sách statement, mỗi dòng một textarea tự giãn; Enter tạo dòng mới; kéo sắp xếp thứ tự |
| Answer key | Grid: một hàng/câu hiển thị `Q{qStart+n}`, chip toggle 3 giá trị (T/F/NG hoặc Yes/No/NG) |
| Micro-UX | Phím tắt 1/2/3 hoặc ←/→ đổi trạng thái; đếm số câu so với khuyến nghị của dạng; paste nhiều dòng → tách thành nhiều statement |
| Lỗi | Statement trống hoặc chưa chốt key → highlight tại hàng khi blur/save |

### Family B — Trắc nghiệm chọn 1: `mcq`, `mcq1`, `mcq3`

| Thành phần | Đề xuất |
|---|---|
| Nội dung | Stem (textarea) + đúng số option theo dạng (mcq4: 4, mcq3: 3), mỗi option một input ngang, radio đánh đáp án đúng |
| Micro-UX | Nhấn `1..4` khi focus câu để chốt key; nút xáo trộn vị trí option (lưu thứ tự hiển thị riêng nếu cần); support paste khối `stem + A) … B) … C) …` để điền nhanh cả 4 ô |
| Khác biệt Listening | `mcq1`/`mcq3` hiển thị cùng khối bên transcript panel (xem Listening) vì đề nghe cần stem ngắn, option ngắn |

### Family C — Matching chọn chữ cái: `headings`, `info`, `sentend`, `features`, `match2`

| Thành phần | Đề xuất |
|---|---|
| Bank lựa chọn | **Field có cấu trúc mới** (thay `intro` text tự do): mỗi dòng một input, auto gán nhãn A, B, C…; thêm/xóa dòng tự đánh số lại. `headings` hiển thị nhãn dạng số La Mã I, II, III (chuẩn IELTS) nhưng key vẫn là chữ cái |
| Danh sách câu | Headings: danh sách đoạn tóm tắt + dropdown chọn heading; `info`: danh sách thông tin + dropdown; `sentend`: nửa câu đầu + dropdown endings; `features`: tên người/tổ chức là **nhãn của bank** (không đánh A–H lên người, chỉ đánh lên bank), câu hỏi là mệnh đề + dropdown |
| Micro-UX | Chip letter đã chọn hiện màu; với `sentend` (mỗi lựa chọn dùng 1 lần) làm mờ chữ cái đã dùng ở câu khác; validate bank ≥ số câu; NB "You may use any letter more than once" chỉ bật cho `features`/`info` (theo nghiên cứu format: chỉ features cho phép trùng) |
| Nguồn | Pattern pairs+dropdown Moodle/Canvas (P3) |

Đây chính là follow-up `sharedOpts` mà plan #269 đã ghi nhận — bằng chứng bên ngoài (Moodle/Canvas) xác nhận đúng hướng.

### Family D — Completion điền từ/số: `sent`, `note`, `summary`, `tablecomp`, `flowchart`, `shortans` (Reading) và `form`, `notes`, `sent4`, `flow` (Listening)

| Thành phần | Đề xuất |
|---|---|
| Nội dung | **Editor cloze hai tầng** (P2): tầng mặc định — dán text/summary/outline rồi click hoặc kéo chọn từ trong văn bản, từ biến thành chỗ trống đánh số `{1}`, đáp án **tự sinh từ từ được chọn** (xóa nhập kép); tầng fallback — chế độ "text thô" với cú pháp `*đáp án/alt1/alt2*` cho power user, cùng họ với H5P |
| Bảng (tablecomp) | Grid bảng nhập trực tiếp: click ô → thành ô trống; ô còn lại là dữ liệu cho sẵn. Không cần trình vẽ bảng phức tạp — bảng N×M với ô text là đủ |
| Flowchart/`flow` | Danh sách box dạng dòng văn bản + ký hiệu mũi tên (`→` hoặc `->`); click từ trong box để tạo blank. Không canvas kéo-thả (YAGNI với phạm vi hiện tại) |
| `shortans` | Không có khối nội dung: chỉ grid key dạng text (một hàng/câu: ô đáp án + nút thêm alt) |
| `alts` | Tooltip trên chỗ trống: thêm phương án thay thế, ngăn cách `/` — khớp quy tắc chính thức "dry hot air / hot dry air" đã xác minh trong nghiên cứu format |
| Word limit | Dải chip preset một-chạm: `ONE WORD ONLY`, `ONE WORD AND/OR A NUMBER`, `NO MORE THAN TWO WORDS`, `NO MORE THAN THREE WORDS`, `NO MORE THAN THREE WORDS AND/OR A NUMBER` — chèn câu lệnh chuẩn vào `intro` (giai đoạn sau nâng thành field có cấu trúc phục vụ auto-chấm) |
| Listening | Tất cả dạng completion trên **transcript panel**: click-vào-chữ trên transcript tạo blank (pattern ISLCollective P2). Blank thứ n ứng câu `qStart+n`. Transcript chưa có thì dùng template dòng trống |

### Family E — Ảnh ghim nhãn: `diagram` (Reading), `map` (Listening)

| Thành phần | Đề xuất |
|---|---|
| Ảnh | Ô URL ảnh hiện tại giữ nguyên (https-only đã có validator); về sau nâng cấp upload thật |
| Ghim | Sau khi có ảnh, **click lên ảnh đặt pin đánh số** (số = `qStart+n`), mỗi pin một ô đáp án text bên cạnh; kéo dời được; toạ độ lưu theo % |
| Micro-UX | Xem ảnh ngay khi gắn (thumbnail đã có trong bank); nếu chưa có ảnh, hiện danh sách key text thuần như `shortans` để không chặn nhập |
| Lưu ý schema | Toạ độ pin chưa có chỗ lưu — có thể nhúng theo convention trong `stem` (string JSON tự do) hoặc thêm cột; đánh dấu là thay đổi schema |
| Nguồn | Pattern Wordwall label-the-diagram (P5) |

### Writing — prompt-only (task1: `chart`, `table`, `map`, `process`; task2: `discuss`, `opinion`, `advantage`, `problem`)

- Task1 **cần ảnh đề** (biểu đồ/bản đồ) — hiện `imageUrl` chỉ gắn với diagram Reading; mở rộng gate ảnh cho cả 4 type task1 là thay đổi nhỏ, tác dụng thật vì không có ảnh thì đề task1 không dùng được.
- Template khung câu lệnh chuẩn theo type (mô tả what the task asks) — giáo viên chỉ điền phần biến số, tương tự hướng đi cue card của Speaking.
- Word-limit + thời gian gợi ý hiển thị cạnh prompt (hiện `band` đã có).
- Giai đoạn sau (ngoài scope): rubric band-descriptor checklist phục vụ chấm tay.

### Speaking — cue card

- Part2: builder cue card chuẩn IELTS — topic + 3–4 bullet gợi ý **thêm/xóa/sắp xếp được** (hiện `cuePoints` là text); phần khung cố định ("You should say:", "and explain…") do template tự điền.
- Part1/Part3: danh sách câu hỏi follow-up dạng dòng (tương tự Family A nhưng không có key).

## 4. Ảnh hưởng schema và thứ tự ưu tiên

**Không cần đổi schema (làm ngay):**
1. Answer-key grid + phím tắt cho Family A/B (chỉ cách render `questions` hiện có).
2. Chống mất dữ liệu khi đổi dạng: dialog xác nhận + giữ field dùng chung.
3. Autosave draft (localStorage) cho `/assignments/new`.
4. Paste-tách-dòng cho key text và statement (thêm button, không đổi model).
5. Validation on blur tại hàng câu; chip preset word-limit chèn vào `intro`.

**Cần schema nhẹ — `sharedOpts` có cấu trúc (đã được plan #269 dự kiến):**
6. Bank lựa chọn A–H cho 5 dạng matching + validate bank/key + highlight chữ đã dùng.

**Cần convention dữ liệu mới (không nhất thiết đổi cột):**
7. Cloze click-to-blank: `stem` lưu text có `{n}` hoặc `*answer*`, đáp án vẫn map về `{stem, answer, alts}` — quyết định format là bước thiết kế tiếp theo.
8. Toạ độ pin cho diagram/map (nhúng trong JSON `stem` hoặc thêm cột).

**Đầu tư lớn hơn — xếp sau:**
9. Upload ảnh/audio thật (audio hiện chỉ lưu tên file, gate `audioName` đã có trong validation).
10. AI sinh draft câu hỏi từ passage (pattern Wayground), import Word/PDF có cấu trúc.

Lý do thứ tự: nhóm 1–2 giải trực tiếp hai rủi ro UX đã ghi nhận trong scout (mất dữ liệu, bank không validate) với chi phí thấp; nhóm 7 là thay đổi nhập liệu lớn nhất nhưng phục vụ nhiều dạng nhất (10/26).

## 5. Nguồn

- [H5P Fill in the Blanks Tutorial](https://h5p.org/tutorial/fill-in-the-blanks) — cú pháp `*đáp án/alt*`, `+gợi ý`, gợi ý dropdown tự động.
- [H5P Drag the Words Tutorial](https://h5p.org/content/drag-the-words) — đánh dấu từ bằng dấu sao.
- [MoodleDocs — Matching question type](https://docs.moodle.org/en/Matching_question_type) và [Drag and drop matching](https://docs.moodle.org/en/Drag_and_drop_matching_question_type) — bảng cặp + dropdown.
- [Canvas Instructor Guide — Matching question (New Quizzes)](https://community.canvaslms.com) — pairs + mục nhiễu.
- [Wordwall — How to Create an Image Quiz Activity](https://wordwall.zendesk.com) — ảnh + nhãn điểm.
- [Wayground/Quizizz AI Question Generator](https://wayground.com) — sinh câu hỏi từ Docs/PDF/passage.
- [ISLCollective video lesson guide (Hampshire EMTAS)](https://emtas.hias.hants.gov.uk) và [FAQ cộng đồng](https://sites.google.com/view/islcollective-video-lesson-faq/a-detailed-guide-to-creating) — gap-fill trên transcript video.
- [NN/g — 4 Principles to Reduce Cognitive Load in Forms](https://www.nngroup.com/articles/forms-cognitive-load/) (7/2025) — progressive disclosure; kèm nguyên tắc inline validation của NN/g.
- [AlternativeTo — Cloze Generator](https://alternativeto.net) và [Compleat Lexical Tutor](https://www.lextutor.ca) — kéo chọn từ để tạo chỗ trống.
- Nội bộ: `plans/260925-0515-reading-all-question-types/reports/research-ielts-formats.md` (format chính thức + quy tắc chấm), `plans/reports/research-2026-09-25-ielts-reading-question-types.md`, scout codebase 2026-09-25.

## 6. Câu hỏi chưa giải quyết

- Format lưu chỗ trống cloze trong `stem` (`{n}` vs `*answer*` nhúng trực tiếp) cần quyết thiết kế khi làm Family D — ảnh hưởng cả renderer preview và auto-chấm sau này.
- `headings` dùng nhãn số La Mã (I–X) theo chuẩn IELTS nhưng `ASSIGNMENT_ANSWER_CHOICES` hiện có kind `roman` chưa rõ đã wire cho headings hay chưa — cần kiểm tra trước khi làm Family C.
- Wordwall editor chỉ xác minh qua help center (không xem UI trực tiếp); h5p.org và docs.moodle.org chặn fetch trực tiếp (403/404), chi tiết lấy từ kết quả tìm kiếm của chính các trang đó.
- Tỷ lệ "choose TWO letters" của MCQ Reading (nhiều đáp án) chưa nằm trong `mcq4/mcq3` — nếu muốn hỗ trợ cần kind mới; chưa có dữ liệu mức độ cần thiết.
