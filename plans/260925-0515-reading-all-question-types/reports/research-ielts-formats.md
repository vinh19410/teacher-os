# Research: Format đáp án của 8 dạng IELTS Reading còn thiếu

- Nguồn chính: [IELTS.org Academic Reading Sample Tasks 2023 PDF](https://ielts.org/cdn/Sample-tests/ielts-academic-reading-sample-tasks-2023.pdf) (trích nguyên văn + answer key chính thức), đối chiếu [IDP](https://ielts.idp.com), [British Council](https://takeielts.britishcouncil.org), [IELTS Liz](https://ieltsliz.com).
- Kết luận chính: 8 dạng chỉ có **3 kiểu đáp án**: (1) MỘT chữ cái từ danh sách lựa chọn, (2) từ/số chép từ passage, (3) chữ cái từ word box. "Choose TWO letters" KHÔNG thuộc matching features — nó thuộc Multiple choice nhiều đáp án (không nằm trong scope 8 dạng này).

| Dạng | Câu lệnh chính thức (nguyên văn) | Đáp án học viên | Số câu điển hình | Nội dung cần thêm | Chọn trùng chữ cái? |
|---|---|---|---|---|---|
| Matching features | "Write the correct letter A-E in boxes 7-10... NB You may use any letter more than once." | 1 chữ cái / câu, từ danh sách tên người/tổ chức | 2–5 (thường 4) | Danh sách tên A–E…A–H (nhiều hơn số câu) | **Có** |
| Matching sentence endings | "Complete each sentence with the correct ending, A-F, below." | 1 chữ cái / câu, từ ngân hàng nửa câu | 4–6 | Ngân hàng endings A–? (luôn nhiều hơn số câu) | Không — mỗi ending dùng đúng 1 lần |
| Summary completion | 2 biến thể: từ passage ("Choose NO MORE THAN TWO WORDS from the passage") hoặc từ box ("using the list of words, A-G") | Từ/số chép từ passage, hoặc 1 chữ cái | 3–8 | Đoạn summary có chỗ trống; biến thể box cần word box | Box: không |
| Note completion | "Choose ONE WORD ONLY from the passage for each answer." | Từ/số từ passage | 3–8 | Outline dạng notes (tiêu đề + bullet) | N/A |
| Table completion | "Choose NO MORE THAN THREE WORDS from the passage for each answer." | Từ/số từ passage | 3–5 | Lưới bảng có ô trống | N/A |
| Flow-chart completion | "Choose NO MORE THAN TWO WORDS from the passage for each answer." | Từ từ passage | 3–6 | Các box quy trình + mũi tên | N/A |
| Diagram label completion | "Label the diagram below. Choose NO MORE THAN THREE WORDS from the passage for each answer." | Từ từ passage | 2–5 | **BẮT BUỘC ảnh diagram có nhãn số** | N/A |
| Short-answer questions | "Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage." | Từ và/hoặc số từ passage | 3–5 | Không | N/A |

Các biến thể giới hạn từ chính thức: `ONE WORD ONLY`, `ONE WORD AND/OR A NUMBER`, `NO MORE THAN TWO WORDS`, `NO MORE THAN THREE WORDS`, `NO MORE THAN THREE WORDS AND/OR A NUMBER`.

## Quy tắc chấm (bằng chứng chính thức)

- Vượt giới hạn từ = mất điểm dù nội dung đúng (IDP).
- Đáp án phải chép nguyên văn từ passage — không paraphrase, không synonym.
- Số: viết chữ hoặc số đều được (key chính thức: "two to five / 2-5").
- Chính tả phải đúng; chuẩn Anh-Anh/Anh-Mỹ đều chấp nhận (key: "tunneling/tunnelling").
- Từ có gạch nối tính 1 từ; mạo từ thường tùy chọn (key: "(a/the) condenser").
- Thứ tự từ trong đáp án nhiều từ linh hoạt (key: "hot dry air ■ dry hot air"); phương án thay thế ngăn cách bằng `/`.
- Không trừ điểm viết hoa trong Reading (consensus prep, không phải trang chính thức).
- Mỗi câu 1 điểm; tổng 40 câu / 3 passage.

## Hệ quả thiết kế schema

- `answer_mode` ∈ {single_letter, words_from_text, letter_from_box} — trong app hiện tại quy về 2 answer kind sẵn có: `letter` (features, sentend) và `text` (6 dạng còn lại).
- Giới hạn từ: không structured field trong iteration này — nhúng vào hint/câu lệnh (ô "Hướng dẫn đề" `intro` đã có sẵn).
- Đáp án text hỗ trợ phương án thay thế: cột `alts` ("a/b/c") đã có sẵn đúng mục đích này.
- Ảnh diagram: cần thêm trường URL ảnh (app chưa có hạ tầng upload — precedent `audio_name` chỉ lưu tên file).

## Hạn chế

- Số câu trên/dưới mức sample là consensus từ Cambridge books (prep sites), IELTS không công bố thống kê per-type.
- Biến thể "select from box" của flow-chart/diagram (sách Cambridge cũ) không đưa vào iteration này — chỉ hỗ trợ dạng words-from-text hiện đại.
- URL PDF General Training chưa xác minh được (GT dùng cùng bộ task types theo định dạng chính thức).
