# Cấu trúc UI/UX của Quiz Builder (Selfomy One)

Nguồn: ảnh chụp do người dùng cung cấp và trang https://one.selfomy.com/education/quizzes/01kwyqja1bszq102840rd55m1m, đọc qua trình duyệt tích hợp (chỉ đọc, không lưu). Chỉ Section 1 được mở ra đọc. Tab Settings của Group và panel đáp án chưa được mở. Mọi nội dung dưới đây là quan sát giao diện, không phải suy đoán từ mã nguồn.

## 1. Khung trang
- Header: tiêu đề "Quiz Builder", nút **Save Quiz** (màu nhấn) và **Xem trước**.
- Sidebar trái gom nhóm theo module (GIÁO DỤC / TÀI CHÍNH / WEBSITE); mục "Đề thi" được highlight.
- Nút trợ giúp nổi "Hỗ trợ" ở góc dưới phải.

## 2. Thẻ thông tin quiz
- Trường: Quiz Title\*, Description, Thumbnail (upload kèm preview), Time Limit\*.
- Quiz Preset\*: dropdown theo loại bài IELTS (Reading, Listening, Writing, Speaking, Mixed).
- Quiz Collection và Quiz Group: dropdown kèm nút **Create** để tạo nhanh tại chỗ.
- Toggle "Visible outside syllabus".

## 3. Thanh hành động của builder
- **Add Section**: link văn bản.
- **Answers Checking**: nút viền có icon check, dùng để kiểm tra đáp án.

## 4. Bố cục hai cột
**Cột trái: cây điều hướng**
- Ba tầng: Section → Group → Question.
- Số câu hỏi chạy liên tục xuyên section (Q1–Q40); tên Group lặp lại theo từng section.
- Có nút thu gọn cây; mục đang chọn tô màu nhấn; cây cuộn độc lập với cột phải.

**Cột phải: editor của mục đang chọn**
- Thẻ Section: badge số thứ tự tròn, tiêu đề, phụ đề tóm tắt "2 groups, 13 questions"; nút đóng, lên/xuống, xoá (đỏ); hai tab **Content** và **Questions** (có badge đếm).
- Thẻ Question Group lồng trong tab Questions của Section: badge xanh "Question Group 1", đoạn trích hướng dẫn, nút đóng/lên/xuống/xáo trộn/xoá; ba tab **Content / Settings / Questions** (có badge đếm).
- Hàng câu hỏi trong tab Questions của Group: badge "Question N", đoạn trích đề, chip "3 ans", chip "1 correct", nút mở rộng, lên/xuống, xáo trộn, xoá. Hàng đang mở có viền xanh lá và đổ ra form chi tiết.

## 5. Form chi tiết một câu hỏi
- **Question Content**: rich-text editor đầy đủ: hoàn tác/làm lại, kiểu đoạn, đậm/nghiêng/gạch chân/gạch ngang, link, bullet/số, căn lề, thụt lề, ảnh, trích dẫn, bảng, media, màu chữ, highlight, xoá định dạng, công thức, chỉ số trên/dưới, ký tự đặc biệt, code, nhúng.
- **Answers**: ô nhập số lượng kèm nút **+ Add**.

## 6. Tab Content của Section
- Trường: Section Title, "Display Title on Website", **Content Format** (ví dụ "Matching headings"), **Section Content** (rich text).
- Đáp án được nhúng trực tiếp trong đoạn đọc bằng cú pháp `@answer[[n;; nội dung]]`, gắn theo số câu.

## 7. Mẫu tương tác chung
- Mỗi cấp (Section / Group / Question) dùng chung bộ nút: đóng/mở, lên/xuống, xoá; Group và Question có thêm xáo trộn.
- Tab nhỏ gắn badge đếm số con.
- Màu viền phân cấp: Section tím, Group xanh dương, Question xanh lá.
- Chip trạng thái ngay trên hàng đã thu gọn (số đáp án, số đáp án đúng).
- Phụ đề tóm tắt số con ở header giúp theo dõi quy mô bài.

## 8. Gợi ý áp dụng cho teacher-os
- Plan #420 (question group trong thư viện đề) khớp với mô hình Section → Group → Question; trường `explanation` và `answerSet` của PR1 tương ứng phần Answers.
- Cú pháp `@answer[[n;; …]]` là quyết định data model, nên chốt trước khi làm UI.
- Layout hai cột (outline + editor) và bộ nút điều khiển dùng chung cho mọi cấp là phần dễ tái sử dụng nhất.

## Câu hỏi chưa giải quyết
- Nội dung tab Settings của Group và cách form đổi theo từng loại câu hỏi.
- Hành vi của Answers Checking và Xem trước.
- Có kéo-thả sắp xếp hay không.
