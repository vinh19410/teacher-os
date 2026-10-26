# Flow 3: Nhập đề PDF/Ảnh bằng AI, Rà soát chấm bài AI 4 kỹ năng & Trợ giảng Chat AI (`ai-teaching-assistant-flow`)

> Thuộc bộ đặc tả giao diện của tính năng **selfomy-alignment**. Liên kết ngược: [[selfomy-alignment-wireframe-index.md|Wireframe Index]] · [[../srs/selfomy-alignment-userflow.md|User Flow]] · [[../html-wireframe/ai-teaching-assistant-flow.html|HTML Wireframe]].

---

## Screen: ai-exam-import-workspace

- **Screen number**: `[6]`
- **Screen name**: Không gian Nhập đề thi từ PDF/Ảnh bằng AI
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Giáo viên đứng lớp (`Teacher`), Trợ giảng (`TA`), Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-013`, `FR-selfomy-alignment-015`, `FR-selfomy-alignment-016`, `FR-selfomy-alignment-017`, `FR-selfomy-alignment-030`
- **Related UC**: [[../usecases/uc-ai-exam-import.md|uc-ai-exam-import]]
- **HTML Wireframe**: [[../html-wireframe/ai-teaching-assistant-flow.html|ai-teaching-assistant-flow.html#screen-ai-exam-import-workspace]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| NHAP DE THI TU PDF / ANH BANG AI             [1] Chi phi: 5 Credit (Tam giu) | Vi: 245 Cr        |
|--------------------------------------------------------------------------------------------------|
| [2] Khu vuc tai tep: [Keo tha tep PDF/JPG/PNG (<= 15 MB, <= 20 trang, khong mat khau) hoac Chon] |
| [3] (info) Phat hien tep trung ma bam voi de "Cambridge 18 Test 2" -> [4][Mo lai ban nhap (0 Cr)]|
|--------------------------------------------------------------------------------------------------|
| COT TRAI: TAI LIEU GOC (PDF / ANH)            | COT PHAI: CAU HOI & DAP AN BOC TACH TU AI        |
| [5] Trang: [< 1 / 12 >]  Zoom: [- 100% +]     | [6] Ten de thi *: [ IELTS Reading Cam 18 Test 2 ]|
| +-------------------------------------------+ | [7] Ky nang *: [Reading v] | Thoi gian: [60 phut]|
| | READING PASSAGE 1                         | |--------------------------------------------------|
| | You should spend about 20 minutes on      | | [8] Doan van (Passage 1): [Chinh sua van ban...] |
| | Questions 1-13, which are based on        | |--------------------------------------------------|
| | Reading Passage 1 below...                | | [9] Cau 1 (Multiple Choice)       [Do tin cay cao]|
| |                                           | |     Noi dung: [What is the main purpose of...  ] |
| | [Hinh anh / Van ban trang PDF goc         | |     Dap an dung *: [ B ] | Giai thich: [Doan 1 ] |
| |  duoc hien thi ro net de doi chieu...]    | |--------------------------------------------------|
| |                                           | | [10] Cau 2 (True/False/Not Given) (!) CAN RA SOAT|
| | Questions 1-5                             | |     Noi dung: [The author claims that urban... ] |
| | Do the following statements agree with... | |     Dap an dung *: [ NOT GIVEN v ]               |
| +-------------------------------------------+ | [11] [x] Toi da kiem tra 01 cau gắn nhan (!)     |
| [12] [Thu boc tach lai AI]                    | [13] [Luu ban nhap]   [14] [Luu vao Ngan hang de]|
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Huy hiệu chi phí & Số dư Ví Credit | Status badge | Integer | Hiển thị rõ định mức **`5 credit / lượt nhập đề`** (`FR-selfomy-alignment-013`) cùng cơ chế tạm giữ (`reserved`) trước khi gọi AI và chỉ khấu trừ chính thức (`settled`) khi sinh bản đề nháp thành công (`BR-selfomy-alignment-004`). |
| 2 | Khu vực kéo-thả tệp (`Dropzone`) | File upload dropzone | File (`PDF/JPG/PNG`) | Chỉ chấp nhận tệp `PDF`, `JPG`, `PNG` có dung lượng **`<= 15 MB`**, số trang **`<= 20 trang`** và không đặt mật khẩu bảo vệ (`FR-selfomy-alignment-015`, `E-selfomy-alignment-003`). Hiển thị thanh tiến trình bóc tách trong thời gian mục tiêu `<= 120 giây` (`NFR-selfomy-alignment-002`). |
| 3 | Thanh cảnh báo phát hiện trùng tệp đề thi | Alert banner | String | Khi mã băm tệp (`file_hash`) trùng với một đề thi đã trích xuất thành công trước đó trong cùng tổ chức (`BR-selfomy-alignment-005`), hệ thống không gọi lại AI và không trừ `5 credit`, đồng thời hiển thị cảnh báo kèm nút mở lại bản đề nháp cũ. |
| 4 | Nút `Mở lại bản nháp (0 Cr)` | Secondary button | Action | Tải ngay cấu trúc đề thi đã bóc tách trước đó lên cột phải để giáo viên chỉnh sửa miễn phí (`0 credit`, `BR-selfomy-alignment-005`). |
| 5 | Trình xem tài liệu gốc (Cột trái) | Document viewer | PDF / Image | Hiển thị trang tài liệu PDF/ảnh gốc kèm điều khiển lật trang (`< Trang x/y >`) và phóng to/thu nhỏ (`Zoom`) để đối chiếu trực tiếp với câu hỏi bên cột phải (`FR-selfomy-alignment-016`). |
| 6 | Ô `Tên đề thi *` | Text input | String (`1..200 chars`) | Tên đề thi được AI gợi ý tự động từ tiêu đề tài liệu; cho phép chỉnh sửa trước khi lưu. |
| 7 | Bộ chọn `Kỹ năng *` & `Thời gian làm bài` | Select + Number input | Enum + Integer | Chọn kỹ năng (`Reading`, `Listening`, `Writing`, `Speaking` hoặc `Đề tổng hợp`) và thời lượng làm bài tính bằng phút. |
| 8 | Khung chỉnh sửa `Đoạn văn / Ngữ liệu (Passage / Prompt)` | Rich text editor | Markdown / HTML | Hiển thị nội dung bài đọc hoặc đề bài do AI bóc tách; cho phép sửa trực tiếp lỗi chính tả hoặc định dạng đoạn văn (`FR-selfomy-alignment-016`). |
| 9 | Thẻ câu hỏi độ tự tin cao | Question editor card | Object | Cho phép sửa loại câu hỏi, nội dung câu hỏi, các phương án lựa chọn, đáp án đúng và giải thích đáp án (`FR-selfomy-alignment-016`). |
| 10 | Thẻ câu hỏi gắn nhãn vàng `(!) Cần rà soát lại` | Highlighted editor card | Object | Tự động đánh dấu nổi bật các câu hỏi mà AI nhận diện mờ, thiếu đáp án hoặc có độ tự tin thấp (`confidence < 0.80`) để giáo viên ưu tiên kiểm tra (`FR-selfomy-alignment-016`). |
| 11 | Hộp kiểm xác nhận rà soát câu cảnh báo | Checkbox | Boolean | Bắt buộc tích chọn khi đề thi có ít nhất 1 câu gắn nhãn `(!) Cần rà soát lại` trước khi mở khóa nút `Lưu vào Ngân hàng đề` (`FR-selfomy-alignment-017`). |
| 12 | Nút `Thử bóc tách lại AI` | Ghost button | Action | Hiển thị khi tiến trình AI gặp lỗi hoặc quá hạn `120 giây` (`E-selfomy-alignment-004`, lúc này `5 credit` tạm giữ đã được giải tỏa về ví). |
| 13 | Nút `Lưu bản nháp` | Secondary button | Action | Lưu trạng thái đề thi đang chỉnh sửa (`draft`) để tiếp tục rà soát sau mà không xuất bản cho học viên. |
| 14 | Nút `Lưu vào Ngân hàng đề` | Primary button | Action | Chuyển đề thi sang trạng thái chính thức (`published`) trong Ngân hàng đề để sẵn sàng giao cho lớp học hoặc gắn vào Phòng thi ảo công khai (`FR-selfomy-alignment-017`). |

### Screen Actions & Validation Rules

- **Kiểm tra tệp trước khi giữ Credit (`E-selfomy-alignment-003`)**: Nếu tệp `> 15 MB`, `> 20 trang`, sai định dạng hoặc bị khóa mật khẩu, hệ thống chặn ngay từ trình duyệt, báo lỗi rõ ràng và không tạo giao dịch giữ Credit.
- **Kiểm tra Ví Credit (`E-selfomy-alignment-001`) & Trần cá nhân nhân sự (`E-selfomy-alignment-007`)**: Nếu ví tổ chức `< 5 credit`, hiển thị hộp thoại báo thiếu Credit kèm nút chuyển sang `[10] subscription-and-credit-wallet`. Nếu nhân sự bấm nhập đề đã chạm trần Credit cá nhân trong tháng (`BR-selfomy-alignment-011`), hiển thị thông báo `E-selfomy-alignment-007` hướng dẫn liên hệ Chủ trung tâm nâng trần trên `[11]`.
- **Responsive (`768px` & `375px`)**: Trên màn hình `< 1024px`, bố cục 2 cột tự động chuyển thành **2 Tab ngang** (`[Tab 1: Tài liệu gốc]` | `[Tab 2: Câu hỏi bóc tách]`) kèm thanh hành động cố định dưới đáy (`sticky bottom bar`).

---

## Screen: ai-grading-review-workspace

- **Screen number**: `[7]`
- **Screen name**: Không gian Rà soát chấm bài AI 4 kỹ năng & Trợ giảng Chat AI
- **Application**: `apps/web`
- **Actors**: Giáo viên độc lập, Giáo viên đứng lớp (`Teacher`), Trợ giảng (`TA`), Chủ trung tâm (`Owner`)
- **Related FR**: `FR-selfomy-alignment-013`, `FR-selfomy-alignment-014`, `FR-selfomy-alignment-018`, `FR-selfomy-alignment-019`, `FR-selfomy-alignment-020`, `FR-selfomy-alignment-027`, `FR-selfomy-alignment-028`, `FR-selfomy-alignment-029`, `FR-selfomy-alignment-030`
- **Related UC**: [[../usecases/uc-ai-grading-review.md|uc-ai-grading-review]]
- **HTML Wireframe**: [[../html-wireframe/ai-teaching-assistant-flow.html|ai-teaching-assistant-flow.html#screen-ai-grading-review-workspace]]

### Layout (ASCII — Desktop 1024px)

```text
+--------------------------------------------------------------------------------------------------+
| RA SOAT CHAM BAI AI: Nguyen Minh Anh - IELTS 6.5A | [1] Trang thai: [AI da cham nhap - An voi HV]|
| [2] Nhan che do: (Bản nháp chấm nhanh Writing - Còn 22/30 lượt tháng) | [3] [Mo Chat AI Tro giang]|
|--------------------------------------------------------------------------------------------------|
| COT TRAI: BAI LAM GOC CUA HOC VIEN            | COT PHAI: DIEM THANH PHAN & NHAN XET (BR-001)    |
| [4] Chuyen ky nang: [Writing Task 2] [Speaking]| [8] Bang diem 4 tieu chi IELTS (0.0 - 9.0, 0.5):|
| +-------------------------------------------+ |   - Task Response (TR) *:       [ 6.5 v ]        |
| | [5] Trình phát âm thanh (nếu là Speaking):| |   - Coherence & Cohesion (CC) *:[ 6.0 v ]        |
| |     [|> Play 01:15 / 02:10] Toc do:[1.25x]| |   - Lexical Resource (LR) *:    [ 6.5 v ]        |
| | [6] (info) Gợi ý từ AI (dựa trên văn bản  | |   - Grammatical Range (GRA) *:  [ 6.0 v ]        |
| |     ghi âm — chưa đánh giá tiêu chí       | |   => DIEM TONG (OVERALL BAND):  [ 6.5 ]          |
| |     phát âm) (BR-selfomy-alignment-006)   | |--------------------------------------------------|
| |-------------------------------------------| | [9] Nhan xet chi tiet & Goi y sua cau:           |
| | [7] Noi dung bai viet / Van ban go bang:  | |   [ Bai viet co bo cuc 4 doan ro rang. Tuy nhien |
| | "Nowadays, many people believe that       | |     can bo sung vi du cu the o doan than bai 2...|
| |  [governments should invest] (Goi y AI:   | |--------------------------------------------------|
| |  allocate more public funding) in public  | | [10][Tao bai tap nhanh tu loi sai] (100 luot/ngay|
| |  transport..."                            | | [11][Thu cham lai AI] [12][Luu nhap] [13][Chot]  |
+--------------------------------------------------------------------------------------------------+
| [14] NGAN KEO TRO GIANG CHAT AI (100 luot mien phi/ngay - Con 84 luot | Vuot tran: 0,5 Cr/luot): |
|   GV: "Tom tat cac loi ngu phap chinh cua Minh Anh va viet nhap nhan xet gui phu huynh"          |
|   AI: "Minh Anh hay sai mao tu 'the' va chia dong tu so it. Day la doan nhan xet mau..." [Chep]  |
+--------------------------------------------------------------------------------------------------+
```

### Screen Description

| # | Items | Control type | Data type | Description |
|---|-------|--------------|-----------|-------------|
| 1 | Huy hiệu trạng thái bài chấm | Status badge | Enum | Hiển thị trạng thái hiện tại trong máy trạng thái `SubmissionGrading` (`Đã nộp chờ xử lý`, `Chờ chấm tay`, `AI đã chấm nháp — Ẩn với học viên`, `Đang rà soát`, `Đã trả kết quả`). Khẳng định quy tắc `BR-selfomy-alignment-001`: kết quả AI nháp bị khóa hoàn toàn với học viên cho tới khi bấm **"Chốt trả bài"**. |
| 2 | Nhãn chế độ chấm / Cảnh báo đặc biệt | Info badge | String | Hiển thị thông tin ngữ cảnh của bản chấm:<br/>• Nếu tổ chức ở gói tháng hết Credit chính và hệ thống tự động hạ cấp mềm bài Writing sang chế độ **Chấm nhanh** (`FR-selfomy-alignment-014`, `BR-selfomy-alignment-007`): hiển thị nhãn **`"Bản nháp chấm nhanh (Còn X/30 lượt tháng — 0 credit)"`**.<br/>• Nếu bản thu Speaking `< 15 từ` (`BR-selfomy-alignment-006`, `E-selfomy-alignment-009`): hiển thị nhãn cảnh báo đỏ `"Bản ghi âm quá ngắn (< 15 từ) — Không trừ Credit, vui lòng chấm tay hoặc yêu cầu nộp lại"`. |
| 3 | Nút `Mở Chat AI Trợ giảng` | Secondary button | Drawer trigger | Đóng/mở ngăn kéo **Khung Trợ giảng Chat AI** (`[14]`) ngay trong không gian làm việc (`FR-selfomy-alignment-028`). |
| 4 | Thanh chuyển đổi phần bài làm (`Task / Part`) | Segmented tabs | Enum | Chuyển nhanh giữa các phần của bài nộp (`Writing Task 1`, `Writing Task 2`, `Speaking Part 1/2/3`). |
| 5 | Trình phát âm thanh Speaking | Audio player | Audio (`MP3/WAV/WebM`) | Chỉ hiển thị với bài Speaking (`FR-selfomy-alignment-019`). Cho phép phát/tạm dừng, kéo thanh thời gian và chỉnh tốc độ phát (`1x`, `1.25x`, `1.5x`). |
| 6 | Nhãn giới hạn đánh giá phát âm Speaking (`BR-006`) | Mandatory notice banner | Static text | Bắt buộc hiển thị cố định trên mọi bài chấm Speaking có gợi ý AI (`FR-selfomy-alignment-019`, `BR-selfomy-alignment-006`): **`"Gợi ý từ AI (dựa trên văn bản ghi âm — chưa đánh giá tiêu chí phát âm)"`**. |
| 7 | Khung bài làm gốc / Văn bản gỡ băng (`Transcript`) | Annotated text viewer | String | Hiển thị bài viết của học viên (hoặc văn bản chuyển từ giọng nói đối với Speaking) kèm các đoạn gạch chân/tô sáng câu có lỗi ngữ pháp, từ vựng và gợi ý câu viết lại nâng band (`FR-selfomy-alignment-018`). |
| 8 | Bảng điểm 4 tiêu chí IELTS & Điểm tổng | Score inputs (`0.0–9.0`) | Decimal (step `0.5`) | Cho phép chỉnh sửa điểm của 4 tiêu chí thành phần (`TR/TA`, `CC`, `LR`, `GRA` đối với Writing; `FC`, `LR`, `GRA`, `P` đối với Speaking — trong đó tiêu chí Phát âm `P` do giáo viên tự nghe và quyết định điểm). Hệ thống tự động tính điểm tổng (`Overall Band`) làm tròn theo quy chuẩn IELTS (`0.5`). |
| 9 | Khung `Nhận xét chi tiết & Gợi ý sửa câu` | Rich text editor | Markdown / String | Chứa nhận xét tổng quan, điểm mạnh, điểm cần cải thiện do AI khởi tạo sẵn; cho phép Trợ giảng và Giáo viên chỉnh sửa toàn phần trước khi lưu (`FR-selfomy-alignment-018`, `FR-selfomy-alignment-020`). |
| 10 | Nút `Tạo bài tập nhanh từ lỗi sai` | Ghost button | Action | Gọi công cụ **Tạo bài tập nhanh bằng AI** (`FR-selfomy-alignment-027`, dùng chung hạn mức `100 lượt AI nhẹ miễn phí/ngày` theo `BR-selfomy-alignment-012`) để sinh 5 câu bài tập củng cố đúng phần ngữ pháp/từ vựng học viên vừa sai. |
| 11 | Nút `Thử chấm lại AI` | Outline button | Action | Chỉ hiển thị khi bài đang ở trạng thái `Chờ chấm tay (manual_pending)` do lỗi dịch vụ AI (`E-selfomy-alignment-004`) hoặc sau khi giáo viên vừa nạp thêm Credit (`E-selfomy-alignment-001`, `E-selfomy-alignment-002`). |
| 12 | Nút `Lưu nháp` (`Lưu bản nháp rà soát`) | Secondary button | Action | Lưu các chỉnh sửa điểm và lời phê vào trạng thái `Đang rà soát (teacher_reviewing)`. Cho phép cả Trợ giảng (`TA`), Giáo viên đứng lớp và Chủ trung tâm thực hiện (`FR-selfomy-alignment-020`, `FR-selfomy-alignment-029`). |
| 13 | Nút **`Chốt trả bài`** (`Publish`) | Primary button | Action | Chuyển trạng thái bài nộp sang `Đã trả kết quả (published)`, mở khóa điểm & lời phê trên cổng học viên và phát thông báo tự động (`FR-selfomy-alignment-020`, `BR-selfomy-alignment-001`, `FR-selfomy-alignment-010`). **Quy tắc phân quyền (`FR-selfomy-alignment-029`)**: Nếu người dùng là Trợ giảng (`TA`), nút này bị khóa (`disabled`) kèm chú thích *"Chỉ Giáo viên đứng lớp hoặc Chủ trung tâm mới có quyền Chốt trả bài"*. |
| 14 | Ngăn kéo `Trợ giảng Chat AI` | Slide-over chat panel | Chat stream | Cho phép giáo viên/trợ giảng hỏi đáp bằng tiếng Việt để tra cứu nhanh học viên vắng/nợ phí, tóm tắt lỗi sai của lớp hoặc soạn nháp nhận xét gửi phụ huynh (`FR-selfomy-alignment-028`). Hiển thị bộ đếm **`100 lượt miễn phí/ngày/tổ chức`** (`BR-selfomy-alignment-012`); khi chạm trần `100 lượt/ngày` hoặc chọn chế độ *Phân tích sâu*, hiển thị hộp thoại xác nhận `E-selfomy-alignment-005` (chờ qua `00:00` ngày mai hoặc xác nhận trừ **`0,5 credit/lượt`**). |

### Screen Actions & Validation Rules

- **Chống ghi đè đồng thời (`Optimistic Concurrency Control` — `E-selfomy-alignment-011`)**: Khi bấm `[12] Lưu nháp` hoặc `[13] Chốt trả bài`, hệ thống kiểm tra `version` của bản ghi bài chấm. Nếu một nhân sự khác vừa lưu phiên bản mới hơn, hệ thống chặn ghi đè và hiển thị cảnh báo `E-selfomy-alignment-011` để tải lại dữ liệu mới nhất.
- **Bắt buộc đủ 4 điểm thành phần trước khi `Chốt trả bài`**: Nếu bất kỳ tiêu chí nào trong 4 tiêu chí đang để trống (ví dụ tiêu chí Phát âm `Pronunciation` của bài Speaking chưa được giáo viên điền điểm), hệ thống tô viền đỏ ô điểm trống và chặn thao tác `Chốt trả bài`.
- **Responsive (`768px` & `375px`)**: Trên màn hình `< 1024px`, 2 cột tự động gom thành **2 Tab ngang** (`[Tab 1: Bài làm & Ghi âm]` | `[Tab 2: Điểm & Nhận xét]`), ngăn kéo `Trợ giảng Chat AI` mở dạng toàn màn hình di động (`bottom sheet`), thanh nút `Lưu nháp` / `Chốt trả bài` ghim cố định dưới đáy màn hình.

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
