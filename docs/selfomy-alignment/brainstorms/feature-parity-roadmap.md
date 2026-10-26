---
type: brainstorm
feature: selfomy-alignment
status: draft
updated: 2026-10-26
links:
  - plans/reports/research-261025-2315-selfomy-vs-teacher-os-feature-gap.md
  - plans/reports/advise-261025-2328-ai-model-selection-cost-and-pricing.md
  - docs/project-roadmap.md
  - docs/project-overview-pdr.md
  - docs/_shared/project-profile.md
---

# Kế hoạch thu hẹp khoảng cách tính năng với Selfomy One (Lộ trình A0 → A → B → C)

## 1. Idea Seed

Lập kế hoạch đồng bộ và thu hẹp khoảng cách tính năng giữa Teacher OS hiện tại với đối thủ Selfomy One (`one.selfomy.com`), kết hợp mô hình gói cước thuê bao tháng (Subscription), cơ chế tính phí bằng Credit AI, bộ công cụ Trợ giảng AI, mở rộng vận hành lớp học (Phòng thi ảo công khai cho khách vãng lai, điểm danh theo ngày, lịch nghỉ chung, sổ công nợ học viên, thông báo Email/In-app) và lộ trình nâng cấp lên mô hình trung tâm nhiều nhân sự.

## 2. Context

Teacher OS đã hoàn thiện luồng lõi cho một giáo viên độc lập qua các mốc M1–M3 (quản lý lớp, giáo trình, buổi học, điểm danh theo buổi, hóa đơn học phí và đối soát ngân hàng tự động, ngân hàng bài tập 4 kỹ năng IELTS, chấm Writing/Speaking có chú thích, cổng học viên và thư viện đề chung của quản trị viên).

Khi đặt cạnh đối thủ trực tiếp là **Selfomy One**, khoảng cách cạnh tranh lớn nhất nằm ở 3 trụ cột:
1. **Năng suất từ AI (Giai đoạn A0 & A):** Giáo viên mất rất nhiều thời gian nhập đề thủ công từ file PDF/ảnh và chấm chi tiết từng bài Writing/Speaking. Để cung cấp AI bền vững mà không lỗ vốn, hệ thống cần nền tảng đo lường mức sử dụng AI, gói thuê bao tháng và ví Credit AI (`A0`) đi trước một bước so với cụm tính năng Trợ giảng AI (`A`).
2. **Thu hút học viên mới & Vận hành hàng ngày (Giai đoạn B):** Giáo viên và trung tâm cần Phòng thi ảo công khai để khách vãng lai làm đề thử (vừa tạo phễu tuyển sinh vừa kiểm soát chặt trần chi phí AI), màn hình điểm danh tổng theo ngày, lịch nghỉ chung tự động dời buổi, sổ công nợ chi tiết theo từng học viên và kênh gửi thông báo thật qua Email + In-app.
3. **Mở rộng quy mô lên Trung tâm nhiều nhân sự (Giai đoạn C):** Khi giáo viên phát triển thành trung tâm có giáo vụ, nhiều giáo viên đứng lớp và trợ giảng, hệ thống cần cơ chế mời nhân sự, phân quyền 4 vai trò chuẩn, gán giáo viên cho lớp và dùng chung quỹ Credit AI của tổ chức.

Toàn bộ chương trình `A0 → A → B → C` được xếp nối tiếp ngay sau khi đóng mốc M5 (Ổn định & quyết định sau self-pilot), trong đó cụm `A0 + A` là ưu tiên triển khai đầu tiên.

## 3. User Types (preliminary)

| User Type | Pain Point | Primary Need |
|-----------|-----------|--------------|
| Giáo viên độc lập (Solo Teacher) | Tốn hàng giờ nhập lại đề thi từ file PDF/ảnh và chấm từng bài Writing/Speaking; thiếu công cụ cho học viên tiềm năng thi thử để tuyển sinh; khó nhìn tổng quan các lớp chưa điểm danh hoặc bài tồn đọng trong ngày | Nhập đề và chấm nháp Writing/Speaking bằng AI với chi phí gói cước minh bạch (200k–500k/tháng); mở phòng thi thử công khai thu thập thông tin học viên tiềm năng; bảng điều khiển nhắc việc và điểm danh nhanh theo ngày |
| Chủ trung tâm (Center Owner — Giai đoạn C) | Không thể chia sẻ tài khoản cá nhân cho nhiều giáo viên và giáo vụ; sợ nhân sự lạm dụng tính năng AI làm đội chi phí; thiếu bức tranh công nợ tổng thể theo từng học viên | Mời nhân sự theo 4 vai trò phân quyền rõ ràng; gán giáo viên phụ trách từng lớp; quản lý một ví Credit AI chung cho toàn trung tâm kèm hạn mức trần cho từng giáo viên |
| Quản lý / Giáo vụ (Admin / Staff — Giai đoạn C) | Phải vào từng lớp riêng lẻ mới điểm danh được; khi trung tâm nghỉ Lễ/Tết phải sửa tay lịch từng buổi học; theo dõi học viên nợ phí rời rạc theo từng hóa đơn | Màn hình điểm danh tổng hợp theo ngày (lọc các lớp chưa điểm danh); công cụ tạo lịch nghỉ chung tự động hủy hoặc đẩy lùi lịch học; sổ công nợ gom theo từng học viên |
| Giáo viên đứng lớp & Trợ giảng (Teacher & TA — Giai đoạn C) | Trợ giảng chấm sơ bộ nhưng không có luồng trình giáo viên chính duyệt; giáo viên đứng lớp bị nhiễu thông tin bởi các lớp không do mình phụ trách | Không gian làm việc chỉ hiển thị đúng các lớp được phân công; trợ giảng điểm danh và chấm nháp kết hợp gợi ý từ AI để giáo viên đứng lớp rà soát và bấm "Chốt trả bài" |
| Học viên chính thức (Enrolled Student) | Không nhận được thông báo qua Email khi có bài tập mới, khi giáo viên trả điểm hoặc khi buổi học đổi lịch; lúc làm bài tự luyện không có giải thích đáp án tức thì | Nhận thông báo tức thì qua Email và chuông thông báo trong cổng học viên; xem giải thích đáp án chi tiết và nhận bài chấm Writing/Speaking đã được giáo viên kiểm duyệt chất lượng |
| Học viên vãng lai (Guest / Lead — Giai đoạn B) | Muốn làm thử đề IELTS của giáo viên/trung tâm để đánh giá chất lượng trước khi đăng ký học nhưng ngại thủ tục tạo tài khoản phức tạp | Vào đường dẫn Phòng thi công khai, chỉ cần điền Họ tên + Email + Số điện thoại là bắt đầu làm bài thi thử có bấm giờ và nhận kết quả ngay (với Reading/Listening) |

## 4. Capabilities Breakdown

### P0 — must have
- **Nền tảng Gói thuê bao & Ví Credit AI theo tổ chức (Giai đoạn A0):**
  - 4 bậc gói cước cho giáo viên/tổ chức: **Dùng thử** (`0đ` — `30 credit` một lần), **Cơ bản** (`200.000đ/tháng` — `70 credit`), **Chuyên nghiệp** (`350.000đ/tháng` — `130 credit`), **Nâng cao** (`500.000đ/tháng` — `200 credit`); gói mua thêm **Top-up** (`149.000đ / 100 credit`, hạn dùng `12 tháng`).
  - Thanh toán gói tháng và mua thêm credit tự động qua mã QR chuyển khoản ngân hàng (đối soát tự động qua Bank-Hub); cơ chế ân hạn `3 ngày` khi gói tháng hết hạn.
  - Bộ đếm sử dụng AI theo thời gian thực, cảnh báo ở ngưỡng `80%` và `100%` credit, tự động chặn/hạ cấp tác vụ khi hết credit.
- **Nhập đề & Tạo bài tập bằng AI (Giai đoạn A):**
  - Nhập đề từ file PDF/ảnh (tối đa `20 trang` hoặc `15 MB`) thành đề có cấu trúc đoạn văn, câu hỏi và đáp án trên màn hình soạn đề (`5 credit/lần`, hoàn credit nếu trích xuất lỗi hoàn toàn; sửa tay sau trích xuất miễn phí).
  - Tạo bài tập nhanh (từ vựng, điền từ, câu hỏi ôn tập) và giải thích đáp án tự động (`0 credit` ở chế độ tiêu chuẩn trong hạn mức công bằng `100 lượt/ngày/tổ chức`; trừ `0,5 credit` khi nâng lên chế độ phân tích sâu).
- **Chấm nháp Writing & Speaking bằng AI (Giai đoạn A):**
  - Chấm Writing theo 4 tiêu chí IELTS kèm gợi ý sửa lỗi chi tiết (`1 credit/bài`); khi hết credit cho phép hạ xuống chế độ "Chấm nhanh" tối đa `30 bài/tháng`.
  - Chấm Speaking qua bước chuyển giọng nói thành văn bản kết hợp chấm nội dung/từ vựng/ngữ pháp (`2 credit/bài`, gắn nhãn rõ "Gợi ý nội dung & ngữ pháp, chưa đánh giá phát âm"), độ lệch trung bình mục tiêu `≤ 0,5 band` so với giáo viên.
  - Lưu kết quả AI vào vùng "Bản nháp AI" chỉ dành cho giáo viên/trợ giảng; học viên chỉ nhìn thấy điểm và nhận xét sau khi giáo viên bấm **"Chốt trả bài"**.

### P1 — should have
- **Trợ giảng Chat AI cho giáo viên (Giai đoạn A):**
  - Khung chat trợ giảng hỗ trợ giáo viên tra cứu nhanh tình hình lớp, học viên vắng/nợ phí, nháp nhận xét báo cáo phụ huynh và soạn nhanh nội dung giao bài (`0 credit` trong hạn mức `100 lượt/ngày/tổ chức`, nâng cấp bước phức tạp trừ `0,5 credit`).
- **Phòng thi ảo công khai cho khách vãng lai (Giai đoạn B):**
  - Đường dẫn công khai theo từng phòng thi của tổ chức; thu thập **Họ tên + Email + Số điện thoại** trước khi vào thi và lưu thành hồ sơ **Học viên vãng lai**.
  - Mặc định chỉ mở đề Reading/Listening tự chấm (`0 credit`); chỉ chạy chấm AI cho Writing/Speaking khi giáo viên chủ động bật cho phòng thi đó, kèm trần cứng `1 lượt AI/khách` và tối đa `20 credit/ngày/phòng thi`.
- **Mở rộng vận hành lớp hàng ngày (Giai đoạn B):**
  - Bảng điều khiển bổ sung thẻ **Bài chờ chấm** và **Lớp chưa điểm danh**; màn hình **Điểm danh tổng theo ngày** cho phép lọc nhanh các lớp trong ngày và đánh dấu điểm danh hàng loạt.
  - Lịch dạy hỗ trợ chế độ xem **Tháng / Tuần / Ngày**, màu sắc theo khóa học, sự kiện ngoài lớp và công cụ tạo **Lịch nghỉ chung** (cho phép chọn "Hủy buổi" hoặc "Dời lịch — tự động đẩy lùi các buổi học sau thêm 1 buổi").
  - **Sổ công nợ học viên**: theo dõi tổng phải thu, đã đóng, còn nợ và lịch sử hóa đơn/thanh toán gom theo từng học viên.
  - **Hệ thống thông báo gửi thật**: gửi qua **Email** và **In-app** cho 4 sự kiện chính (mời vào lớp, giao/trả bài tập, thông báo hóa đơn học phí, thay đổi lịch học) kèm trạng thái *Đã gửi / Đã xem / Lỗi gửi*.
- **Mô hình Trung tâm nhiều nhân sự (Giai đoạn C):**
  - Mời nhân sự qua Email và phân quyền theo **4 vai trò chuẩn**: *Chủ trung tâm (Owner)*, *Quản lý/Giáo vụ (Admin/Staff)*, *Giáo viên đứng lớp (Teacher)*, *Trợ giảng (TA)*.
  - Gán Giáo viên đứng lớp và Trợ giảng phụ trách từng lớp học; dùng chung ví Credit AI của tổ chức kèm tùy chọn đặt hạn mức trần credit mỗi tháng cho từng giáo viên.

### P2 — nice to have
- Bảng điểm tổng hợp theo lớp (lọc theo cột bài kiểm tra và khoảng thời gian) và nhập tay điểm bài kiểm tra trên giấy.
- Chấm công tự động theo ca dạy của giáo viên/trợ giảng và theo dõi mục tiêu doanh thu tháng cho trung tâm (Giai đoạn C mở rộng).
- Quản lý đa cơ sở trực thuộc cùng một tổ chức trung tâm (Giai đoạn C mở rộng).
- Các mục để sau (ngoài phạm vi hiện tại): Lớp học qua video tự lưu trữ, ví tiền thừa bảo lưu học phí, sổ thu chi kế toán đầy đủ, công cụ thiết kế biểu mẫu khảo sát, hệ thống quản trị website riêng (CMS) và tổng đài cuộc gọi.

## 5. Core Flows (Happy Path)

### 5.1 Luồng Giai đoạn A0: Giáo viên mua gói cước / nạp thêm Credit AI qua QR & Xử lý chu kỳ gói

1. **Giáo viên / Chủ trung tâm** mở màn hình **Gói cước & Credit AI**, xem số dư credit hiện tại và chọn nâng cấp gói tháng (*Cơ bản 200.000đ / Chuyên nghiệp 350.000đ / Nâng cao 500.000đ*) hoặc mua gói **Nạp thêm 100 credit (149.000đ)**.
2. **Hệ thống** tạo đơn thanh toán gói ở trạng thái *Chờ thanh toán* (hiệu lực `15 phút`), sinh mã QR chuyển khoản ngân hàng với số tiền chính xác và nội dung chuyển khoản định danh duy nhất.
3. **Giáo viên** quét mã QR trên ứng dụng ngân hàng và xác nhận chuyển khoản.
4. **Dịch vụ Bank-Hub** nhận thông báo biến động số dư và gửi sang **Hệ thống Teacher OS** để đối soát số tiền và mã định danh đơn hàng.
5. **Hệ thống** xác nhận khớp lệnh, chuyển đơn sang *Đã thanh toán*, kích hoạt gói thuê bao mới (chu kỳ `30 ngày`) hoặc cộng thêm `100 credit` (hạn `12 tháng`) vào ví của tổ chức, đồng thời hiển thị thông báo thành công và gửi Email xác nhận.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Giáo viên / Chủ trung tâm]                                                  │
│ 1. Mở màn Gói cước & Credit AI -> Chọn gói tháng (200k/350k/500k)            │
│    hoặc Gói mua thêm (149k = 100 credit)                                     │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Hệ thống Teacher OS]                                                        │
│ 2. Tạo yêu cầu thanh toán (trạng thái: Chờ thanh toán, giữ 15 phút)          │
│    Sinh mã QR chuyển khoản ngân hàng kèm nội dung định danh duy nhất         │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Dịch vụ Ngân hàng / Bank-Hub]                                               │
│ 3. Giáo viên quét QR chuyển khoản -> Ngân hàng gửi thông báo giao dịch về    │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
                       ┌───────────────────────────────┐
                       │ [D1] Số tiền & nội dung khớp? │
                       └───────┬───────────────┬───────┘
                    CÓ (Đúng)  │               │ KHÔNG (Thiếu tiền / Quá 15p)
                               ▼               ▼
┌────────────────────────────────────┐   ┌─────────────────────────────────────┐
│ [Hệ thống Teacher OS]              │   │ [Hệ thống Teacher OS]               │
│ 4a. Chuyển đơn -> Đã thanh toán    │   │ 4b. Đánh dấu Hết hạn hoặc Lệch tiền │
│ - Kích hoạt gói tháng (30 ngày)    │   │ - Giữ nguyên gói cũ                 │
│ - Cộng số dư Credit AI vào tổ chức │   │ - Hiện thông báo hướng dẫn tạo lại  │
│ - Gửi thông báo xác nhận           │   │   hoặc liên hệ đối soát             │
└────────────────────────────────────┘   └─────────────────────────────────────┘

  * Quy tắc khi gói tháng đến ngày hết hạn mà chưa gia hạn:
  [Đúng ngày hết hạn] -> Chuyển sang "Đang ân hạn (3 ngày)": hiện băng rôn nhắc gia hạn,
                         vẫn cho dùng số Credit còn lại.
  [Quá 3 ngày ân hạn] -> Chuyển sang "Hết hạn gói": khóa tính năng AI, đóng băng số dư
                         gói tháng (giữ nguyên dữ liệu lớp & học viên để vận hành thường).
```

### 5.2 Luồng Giai đoạn A: Nhập đề từ PDF/Ảnh bằng AI & Chấm bài Writing/Speaking AI (Bản nháp giáo viên duyệt)

1. **Nhập đề bằng AI:** Giáo viên vào màn hình **Soạn đề**, bấm **Nhập đề bằng AI** và tải lên file PDF hoặc ảnh chụp đề thi (tối đa `20 trang`, dung lượng `≤ 15 MB`).
2. **Hệ thống** kiểm tra điều kiện file và số dư (`≥ 5 credit`), tạm giữ `5 credit` rồi gửi tài liệu qua dịch vụ AI để bóc tách đoạn văn, danh sách câu hỏi và đáp án thành bản nháp có cấu trúc.
3. Sau khi AI trả kết quả hợp lệ, **Hệ thống** chốt trừ `5 credit` và mở màn hình chỉnh sửa đề. **Giáo viên** kiểm tra, sửa tay các chi tiết chưa chuẩn (không tốn thêm credit) và bấm **Lưu / Xuất bản đề**.
4. **Chấm bài Writing/Speaking bằng AI:** Khi **Học viên** nộp bài luận Writing hoặc file ghi âm Speaking, **Hệ thống** kiểm tra quỹ Credit AI của tổ chức (Writing cần `1 credit`, Speaking cần `2 credit`).
5. Với bài Speaking, **Hệ thống** chuyển file ghi âm thành văn bản trước, sau đó gửi sang dịch vụ AI chấm theo 4 tiêu chí IELTS kèm nhận xét sửa lỗi chi tiết và gắn nhãn *"Gợi ý nội dung & ngữ pháp, chưa đánh giá phát âm"*. Kết quả được lưu vào vùng **Bản nháp AI** (ẩn với học viên).
6. **Giáo viên** mở màn hình **Chấm bài**, xem điểm band gợi ý và các chú thích của AI, điều chỉnh điểm hoặc lời phê nếu cần, rồi bấm **"Chốt trả bài"**. Lúc này **Học viên** mới nhận được thông báo và xem được điểm chính thức.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ A. LUỒNG NHẬP ĐỀ BẰNG AI (5 CREDIT)                                          │
│ [Giáo viên] Tải file PDF/Ảnh lên màn Soạn đề                                 │
└──────────────────┬───────────────────────────────────────────────────────────┘
                   ▼
     ┌────────────────────────────────────────────────────────┐
     │ [D2] File <= 20 trang, <= 15 MB & Số dư >= 5 credit?   │
     └─────────────┬──────────────────────────────────────────┴────┐
        ĐẠT        │                                               │ KHÔNG ĐẠT
                   ▼                                               ▼
┌─────────────────────────────────────────────┐     ┌──────────────────────────┐
│ [Hệ thống + Dịch vụ AI (Chế độ xử lý lô)]   │     │ Chặn ngay & báo lỗi:     │
│ - Tạm giữ 5 credit của tổ chức              │     │ - Quá 20 trang / 15 MB   │
│ - Tách đoạn đọc, câu hỏi, đáp án vào bản    │     │ - Hoặc mời nạp thêm      │
│   nháp trên màn Soạn đề                     │     │   Credit AI              │
└──────────────────┬──────────────────────────┘     └──────────────────────────┘
                   ▼
     ┌────────────────────────────────────────┐
     │ [D3] AI trích xuất ra cấu trúc đề hợp lệ?│
     └─────────────┬──────────────────────────┴────┐
        THÀNH CÔNG │                               │ LỖI HOÀN TOÀN / QUÁ GIỜ
                   ▼                               ▼
┌─────────────────────────────────────────────┐ ┌──────────────────────────────┐
│ - Chốt trừ 5 credit (ghi nhật ký sử dụng)   │ │ - Hoàn trả 5 credit tạm giữ  │
│ - Giáo viên sửa tay thoải mái (0 credit)    │ │ - Báo lỗi để giáo viên thử   │
│   rồi bấm Lưu / Xuất bản đề                 │ │   lại hoặc nhập thủ công     │
└─────────────────────────────────────────────┘ └──────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ B. LUỒNG CHẤM WRITING (1 CREDIT) / SPEAKING (2 CREDIT)                       │
│ [Học viên] Nộp bài luận hoặc file ghi âm -> [Hệ thống] Kiểm tra hạn mức AI   │
└──────────────────┬───────────────────────────────────────────────────────────┘
                   ▼
     ┌────────────────────────────────────────────────────────┐
     │ [D4] Tổ chức còn đủ Credit AI?                         │
     └─────────────┬──────────────────────────────────────────┴────┐
        CÒN CREDIT │                                               │ HẾT CREDIT
                   ▼                                               ▼
┌─────────────────────────────────────────────┐     ┌──────────────────────────┐
│ - Nếu là Speaking: gọi dịch vụ chuyển giọng │     │ - Speaking: Chặn chấm AI,│
│   nói thành văn bản trước                   │     │   chuyển thẳng chờ giáo  │
│ - Gọi dịch vụ AI chấm theo 4 tiêu chí IELTS │     │   viên chấm tay          │
│   (Speaking gắn nhãn "Chưa chấm phát âm")   │     │ - Writing: Hạ xuống chế  │
│ - Trừ 1 hoặc 2 credit (báo động nếu >=80%)  │     │   độ "Chấm nhanh" (tối   │
│ - Lưu vào vùng "Bản nháp AI" (Học viên      │     │   đa 30 bài/tháng)       │
│   CHƯA thấy điểm này)                       │     └──────────────────────────┘
└──────────────────┬──────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Giáo viên] Mở màn Chấm bài -> Xem điểm/nhận xét nháp của AI -> Chỉnh sửa    │
│             nếu cần -> Bấm "Chốt trả bài" -> [Học viên] Nhận thông báo & điểm│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Luồng Giai đoạn B: Khách vãng lai thi thử tại Phòng thi ảo công khai & Kiểm soát trần Credit

1. **Giáo viên** tạo một **Phòng thi ảo công khai** từ bộ đề có sẵn, thiết lập thời gian làm bài và cấu hình cho phép khách vãng lai tham gia (mặc định chỉ bật tự chấm cho Reading/Listening; giáo viên có thể gạt nút bật chấm AI cho Writing/Speaking kèm trần bảo vệ).
2. **Khách vãng lai** truy cập đường dẫn phòng thi công khai, điền **Họ tên + Email + Số điện thoại** vào biểu mẫu đăng ký trước khi vào phòng thi.
3. **Hệ thống** lưu thông tin vào danh sách **Học viên vãng lai** của tổ chức, mở giao diện làm bài có đồng hồ đếm ngược.
4. Khi **Khách vãng lai** nộp bài:
   - Nếu là đề **Reading / Listening**: hệ thống chấm tự động ngay lập tức (`0 credit`), hiển thị điểm band cùng lời giải thích đáp án đã được lưu đệm sẵn.
   - Nếu có phần **Writing / Speaking** và phòng thi đang bật chấm AI (chưa vượt trần `1 lượt/khách` và `20 credit/ngày/phòng thi`): hệ thống gọi AI tạo bản nháp chấm bài, trừ credit của giáo viên và báo khách vãng lai chờ giáo viên duyệt gửi kết quả chi tiết qua Email.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Khách vãng lai] Mở đường dẫn Phòng thi công khai của giáo viên              │
│ 1. Nhập Họ tên + Email + Số điện thoại trước khi vào phòng thi               │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Hệ thống Teacher OS]                                                        │
│ 2. Lưu/cập nhật hồ sơ "Học viên vãng lai" thuộc tổ chức của giáo viên        │
│    Khởi tạo lượt thi thử công khai và giao diện làm bài có đồng hồ đếm ngược │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Khách vãng lai] Hoàn thành bài thi & Bấm Nộp bài                            │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │ [D5] Kỹ năng vừa nộp là gì & Phòng thi có bật chấm AI không?    │
     └─────────────┬──────────────────────────────────┬────────────────┘
  READING/LISTENING│                                  │ WRITING/SPEAKING
  (Tự chấm, 0 cr)  ▼                                  ▼ (Chỉ khi giáo viên bật)
┌──────────────────────────────────┐   ┌───────────────────────────────────────┐
│ - Chấm tự động ngay lập tức      │   │ [D6] Khách chưa quá 1 lượt AI VÀ      │
│ - Hiển thị điểm & giải thích     │   │      Phòng thi chưa quá 20 credit/ngày│
│   đáp án đã lưu sẵn              │   │      VÀ Giáo viên còn Credit?         │
└──────────────────────────────────┘   └──────────────┬───────────────┬────────┘
                                           ĐẠT        │               │ VƯỢT TRẦN
                                                      ▼               ▼
                                       ┌────────────────────┐ ┌────────────────┐
                                       │ - Chạy chấm nháp AI│ │ - Ghi nhận bài │
                                       │ - Trừ credit của   │ │   nộp thành    │
                                       │   giáo viên        │ │   công, không  │
                                       │ - Chờ giáo viên    │ │   gọi AI; báo  │
                                       │   duyệt trả kết quả│ │   chờ giáo viên│
                                       │   qua Email        │ │   chấm & liên  │
                                       └────────────────────┘ │   hệ sau       │
                                                              └────────────────┘
```

### 5.4 Luồng Giai đoạn C: Chủ trung tâm mời nhân sự, phân quyền lớp học & cấp hạn mức Credit AI

1. **Chủ trung tâm (Owner)** mở màn hình **Nhân sự**, gửi lời mời qua Email và chọn 1 trong 4 vai trò: *Chủ trung tâm*, *Quản lý/Giáo vụ*, *Giáo viên đứng lớp*, hoặc *Trợ giảng*.
2. Trên màn hình **Lớp học**, **Chủ trung tâm** hoặc **Giáo vụ** gán *Giáo viên đứng lớp* và *Trợ giảng* phụ trách từng lớp cụ thể; đồng thời có thể đặt hạn mức trần Credit AI mỗi tháng cho từng nhân sự.
3. Khi nhân sự đăng nhập:
   - **Giáo vụ** truy cập toàn bộ danh sách lớp để xếp lớp, điểm danh tổng theo ngày, thiết lập lịch nghỉ chung và quản lý sổ công nợ học viên.
   - **Giáo viên đứng lớp** chỉ nhìn thấy các lớp mình phụ trách, sử dụng AI trong phạm vi trần được cấp và duyệt **"Chốt trả bài"** cho học viên.
   - **Trợ giảng** điểm danh buổi học và chuẩn bị bản chấm nháp để trình Giáo viên đứng lớp duyệt chốt.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Chủ trung tâm (Owner)]                                                      │
│ 1. Mời nhân sự qua Email -> Gán 1 trong 4 vai trò:                           │
│    Chủ trung tâm | Quản lý/Giáo vụ | Giáo viên đứng lớp | Trợ giảng          │
│ 2. Gán Giáo viên / Trợ giảng phụ trách từng Lớp học & đặt trần Credit/tháng  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Nhân sự đăng nhập]                                                          │
│ - Giáo vụ: Xếp lớp, điểm danh toàn trung tâm, quản lý công nợ & hóa đơn      │
│ - Giáo viên đứng lớp: Chỉ thấy lớp được giao, soạn bài, duyệt chốt điểm      │
│ - Trợ giảng: Điểm danh lớp được giao, soạn/chấm nháp (chờ Giáo viên chốt)    │
│ - Khi dùng AI: Kiểm tra đồng thời [Trần cá nhân] VÀ [Ví Credit chung của Org]│
└──────────────────────────────────────────────────────────────────────────────┘
```

## 6. System Behavior Deep Dive

### 6.1 Decision Points

| ID | Flow | Khi nào | YES (nhánh đồng ý) | NO (nhánh từ chối) |
|---|---|---|---|---|
| D1 | 5.1 Mua gói / Nạp Credit | Giao dịch chuyển khoản từ Bank-Hub khớp đúng số tiền và mã định danh đơn hàng trong vòng `15 phút` | Chuyển đơn sang *Đã thanh toán*, kích hoạt gói tháng (`30 ngày`) hoặc cộng thêm `100 credit` (hạn `12 tháng`), gửi thông báo thành công | Nếu quá `15 phút` chưa nhận tiền thì chuyển đơn sang *Hết hạn*; nếu số tiền chuyển bị lệch thì đánh dấu *Cần đối soát* và thông báo cho giáo viên |
| D2 | 5.2 Nhập đề bằng AI | File tải lên có định dạng PDF/PNG/JPG, `≤ 20 trang`, `≤ 15 MB` và tổ chức còn `≥ 5 credit` (gói chưa bị khóa) | Tạm giữ `5 credit` của tổ chức và bắt đầu tiến trình AI bóc tách đề | Chặn ngay tại màn tải file, hiển thị thông báo lỗi tương ứng (vượt kích thước/số trang hoặc không đủ credit) |
| D3 | 5.2 Nhập đề bằng AI | Dịch vụ AI trả về cấu trúc đề hợp lệ (có tối thiểu 1 đoạn nội dung hoặc 1 nhóm câu hỏi đọc được) trong thời gian cho phép | Chốt trừ `5 credit` (ưu tiên trừ credit gói tháng trước, credit mua thêm sau) và mở màn soạn đề nháp | Hoàn trả ngay `5 credit` đang tạm giữ về ví tổ chức và hiển thị thông báo lỗi trích xuất để giáo viên thử lại |
| D4 | 5.2 Chấm Writing/Speaking AI | Học viên nộp bài hoặc giáo viên bấm yêu cầu AI chấm nháp và ví tổ chức còn đủ credit (`1 credit` cho Writing, `2 credit` cho Speaking) | Chạy luồng chấm AI tiêu chuẩn, trừ credit tương ứng, lưu vào vùng *Bản nháp AI* và phát cảnh báo nếu tổng mức dùng chạm `80%` hoặc `100%` | Nếu là Speaking: chặn chấm AI, chuyển bài sang trạng thái *Chờ chấm thủ công*. Nếu là Writing và chưa vượt `30 lượt/tháng`: chạy chế độ *Chấm nhanh* miễn phí; nếu đã hết `30 lượt` thì chuyển sang *Chờ chấm thủ công* |
| D5 | 5.3 Phòng thi công khai | Khách vãng lai nộp bài tại phòng thi công khai có phần tự luận Writing hoặc ghi âm Speaking | Kiểm tra tiếp điều kiện bật AI của phòng thi và hạn mức bảo vệ tại điểm quyết định D6 | (Chỉ có Reading/Listening hoặc phòng thi tắt chấm AI): Chấm điểm trắc nghiệm tự động ngay lập tức (`0 credit`) và hiển thị kết quả kèm giải thích đáp án |
| D6 | 5.3 Phòng thi công khai | Phòng thi có bật chấm AI VÀ khách đó (theo Email/SĐT/địa chỉ mạng) chưa dùng quá `1 lượt AI` VÀ phòng thi chưa tiêu tốn quá `20 credit` trong ngày VÀ ví giáo viên còn đủ credit | Chạy chấm nháp AI, trừ credit vào ví của giáo viên, thông báo cho khách vãng lai chờ giáo viên duyệt và gửi kết quả qua Email | Ghi nhận bài nộp thành công nhưng không gọi AI, thông báo kết quả phần tự luận sẽ được giáo viên chấm và phản hồi qua Email sau |
| D7 | 5.4 Lịch nghỉ chung & Nhân sự dùng AI | Giáo viên/Giáo vụ tạo lịch nghỉ chung trùng với các buổi học sắp tới (hoặc nhân sự bấm dùng AI trong trung tâm ở Giai đoạn C) | Với lịch nghỉ chọn *Dời lịch*: đổi trạng thái buổi trùng sang *Nghỉ lễ* và tự động sinh bù 1 buổi vào cuối khóa. Với nhân sự dùng AI: cho phép chạy khi cả *Trần cá nhân* và *Ví chung tổ chức* đều còn hạn mức | Với lịch nghỉ chọn *Hủy buổi*: chỉ đánh dấu buổi học là *Đã hủy*, không tự động kéo dài ngày kết thúc khóa. Với nhân sự chạm trần cá nhân: chặn gọi AI và báo liên hệ Chủ trung tâm nâng hạn mức |

### 6.2 Scenario Matrix

| From State | To State | Rule | Action | Result |
|------------|----------|------|--------|--------|
| Giáo viên đang ở gói *Dùng thử* (`30 credit`) hoặc gói tháng *Đang hoạt động* | Yêu cầu chấm Writing (`1 credit`) hoặc Speaking (`2 credit`) | Ví tổ chức còn đủ credit và nhân sự chưa chạm trần cá nhân | Hệ thống gọi dịch vụ AI chấm nháp, lưu riêng kết quả AI | Trừ đúng số credit (ưu tiên trừ credit gói tháng trước, credit mua thêm sau); bài làm ở trạng thái *Đã có nháp AI* chờ giáo viên duyệt |
| Giáo viên đang ở gói tháng nhưng `Số dư Credit = 0` | Yêu cầu chấm Writing bằng AI | Đã hết credit chính thức nhưng số lượt *Chấm nhanh* trong tháng `< 30 lượt` | Hệ thống tự động chuyển sang mô hình nhẹ (*Chấm nhanh*) | Không trừ credit, tăng bộ đếm *Chấm nhanh* thêm 1, gắn nhãn *"Bản nháp chấm nhanh"* cho giáo viên duyệt |
| Giáo viên đang ở gói tháng nhưng `Số dư Credit = 0` | Yêu cầu chấm Speaking (`2 credit`) hoặc Nhập đề AI (`5 credit`) | Tác vụ chi phí cao không có chế độ hạ cấp khi hết credit | Hệ thống từ chối gọi AI và hiển thị hộp thoại mua thêm gói `100 credit` (`149.000đ`) | Bài Speaking chuyển sang *Chờ chấm thủ công*; giáo viên vẫn có thể chấm tay hoặc nhập đề thủ công bình thường |
| Gói tháng vừa quá ngày hết hạn `1–3 ngày` | Giáo viên sử dụng tính năng AI hoặc vận hành lớp | Đang trong thời gian **Ân hạn 3 ngày** | Hệ thống hiển thị băng rôn nhắc gia hạn đầu trang nhưng vẫn mở quyền dùng số credit còn dư | Mọi tính năng lớp học và AI (nếu còn credit) hoạt động bình thường trong 3 ngày ân hạn |
| Gói tháng quá hạn `> 3 ngày` (hết ân hạn) | Giáo viên bấm gọi tính năng AI vs. Vận hành lớp học thường | Tổ chức chuyển sang trạng thái **Hết hạn gói** | Hệ thống khóa các nút gọi AI nhưng giữ nguyên quyền đọc/ghi lớp học, điểm danh, hóa đơn | Giáo viên không bị gián đoạn việc dạy và thu học phí hiện tại; khi thanh toán gia hạn thì mở lại ngay tính năng AI |
| Trợ giảng (TA — Giai đoạn C) mở bài làm của học viên | Trợ giảng sửa nhận xét từ bản nháp AI và bấm lưu | Vai trò Trợ giảng chỉ có quyền chuẩn bị bản chấm nháp, không có quyền công bố điểm cuối cùng | Hệ thống lưu thay đổi vào trạng thái *Chờ giáo viên duyệt* (nút *Chốt trả bài* bị khóa với Trợ giảng) | Giáo viên đứng lớp hoặc Chủ trung tâm vào kiểm tra lần cuối và bấm *Chốt trả bài* để gửi điểm cho học viên |

### 6.3 State Transitions

```
Gói thuê bao tổ chức (OrgSubscription):
  trial (Dùng thử 30cr) ──[Mua gói tháng]──► active (Đang hoạt động)
  active ──[Đến ngày hết hạn]──► grace_period (Ân hạn 3 ngày)
  grace_period ──[Thanh toán gia hạn]──► active
  grace_period ──[Quá 3 ngày chưa thanh toán]──► expired (Hết hạn gói - khóa AI)
  expired ──[Thanh toán gói mới]──► active

Bản chấm bài có AI hỗ trợ (SubmissionGrading):
  submitted (Mới nộp) ──[AI chấm xong]──► ai_drafted (Đã có nháp AI - ẩn với học viên)
                      ↘ [Hết credit / Lỗi AI] ──► manual_pending (Chờ chấm thủ công)
  ai_drafted ──[Trợ giảng/Giáo viên lưu nháp]──► teacher_reviewing (Đang rà soát)
  ai_drafted / teacher_reviewing / manual_pending ──[Giáo viên bấm Chốt trả bài]──► published (Đã trả bài cho học viên)

Hồ sơ học viên vãng lai (GuestLead — Giai đoạn B):
  guest_registered (Mới điền thông tin thi thử) ──[Nộp bài thi thử]──► guest_tested (Đã có kết quả thi thử)
  guest_tested ──[Giáo viên gửi lời mời vào lớp]──► invited (Đã mời nhập học)
  invited ──[Học viên kích hoạt trên cổng]──► active_student (Học viên chính thức)
```

| Entity | Từ | Sang | Trigger | Quay lại được? |
|--------|------|----|---------|-------------|
| `OrgSubscription` (Gói cước tổ chức) | `trial` | `active` | Đối soát thành công giao dịch QR mua gói Cơ bản / Chuyên nghiệp / Nâng cao | Không |
| `OrgSubscription` (Gói cước tổ chức) | `active` | `grace_period` | Quá thời điểm hết hạn chu kỳ `30 ngày` mà chưa có giao dịch gia hạn mới | Có (về `active` ngay khi thanh toán) |
| `OrgSubscription` (Gói cước tổ chức) | `grace_period` | `expired` | Quá `72 giờ` (3 ngày ân hạn) kể từ lúc hết hạn mà vẫn chưa thanh toán | Có (về `active` khi mua gói mới) |
| `SubmissionGrading` (Trạng thái chấm bài) | `submitted` | `ai_drafted` | Dịch vụ AI hoàn tất chấm nháp Writing/Speaking và ghi kết quả nháp | Không |
| `SubmissionGrading` (Trạng thái chấm bài) | `ai_drafted` | `published` | Giáo viên đứng lớp hoặc Chủ trung tâm bấm nút **"Chốt trả bài"** | Có (Giáo viên có thể mở cập nhật lại lời phê và chốt lại) |
| `GuestLead` (Học viên vãng lai) | `guest_registered` | `guest_tested` | Khách vãng lai bấm nộp bài trong Phòng thi ảo công khai | Không |
| `GuestLead` (Học viên vãng lai) | `guest_tested` | `active_student` | Giáo viên mời vào lớp chính thức từ danh sách vãng lai và học viên chấp nhận lời mời | Không |
| `NotificationDelivery` (Thông báo gửi đi) | `queued` | `sent` / `failed` | Hệ thống gửi Email + In-app thành công (`sent`) hoặc dịch vụ gửi báo lỗi sau 3 lần thử (`failed`) | Có (Giáo viên bấm *Gửi lại* từ trạng thái `failed`) |

### 6.4 Interrupted Transactions

| Tình huống | Hệ thống còn lại gì | Resume | Cleanup |
|---|---|---|---|
| Giáo viên đóng trình duyệt khi đang mở mã QR mua gói / nạp Credit | Đơn thanh toán gói ở trạng thái *Chờ thanh toán* kèm mã định danh giao dịch | Nếu giáo viên đã quét chuyển khoản trên điện thoại, hệ thống nhận thông báo từ Bank-Hub ở chế độ nền và vẫn kích hoạt gói/cộng credit bình thường; khi mở lại ứng dụng sẽ thấy gói mới | Tự động chuyển các đơn *Chờ thanh toán* chưa nhận tiền sang *Hết hạn* sau `15 phút` |
| Giáo viên đóng trình duyệt hoặc rớt mạng khi AI đang trích xuất đề từ file PDF/ảnh (`5 credit`) | Yêu cầu trích xuất đề đang xử lý ngầm kèm `5 credit` tạm giữ | Tiến trình trích xuất vẫn chạy ngầm đến khi xong và lưu thành *Đề nháp mới nhập từ AI*; khi giáo viên mở lại màn *Soạn đề* sẽ thấy bản nháp sẵn sàng để kiểm duyệt | Nếu dịch vụ AI quá thời gian chờ (`> 120 giây`) hoặc lỗi, hệ thống tự động hủy tiến trình và hoàn trả `5 credit` tạm giữ |
| Dịch vụ AI hoặc dịch vụ chuyển giọng nói thành văn bản bị lỗi / quá thời gian chờ khi chấm bài học viên | Bài nộp của học viên đã được lưu an toàn; chưa có bản nháp AI | Hệ thống tự động thử lại tối đa `2 lần` ở chế độ nền; nếu thành công thì cập nhật vào vùng *Bản nháp AI* cho giáo viên | Nếu sau `2 lần` thử lại vẫn lỗi, hoàn trả ngay `1` hoặc `2 credit` cho tổ chức, gắn nhãn *"AI tạm thời gián đoạn — vui lòng chấm tay hoặc bấm Thử chấm lại bằng AI"* |
| 2 nhân sự (ví dụ Trợ giảng và Giáo viên đứng lớp) cùng mở chấm 1 bài làm hoặc cùng dùng những credit cuối cùng của tổ chức | Giao dịch trừ credit được khóa tuần tự theo ví tổ chức; màn chấm bài ghi nhận phiên cập nhật mới nhất | Với ví credit: người bấm trước được giữ credit, người bấm sau nhận thông báo hết credit ngay lập tức. Với màn chấm bài: hiển thị cảnh báo nếu bài vừa được người khác cập nhật trước khi lưu | Giải phóng khóa tạm giữ credit ngay khi tác vụ hoàn tất hoặc thất bại |
| Khách vãng lai làm bài trong Phòng thi công khai bị mất mạng hoặc tải lại trang giữa chừng | Lượt thi thử công khai đang ở trạng thái *Đang làm bài* kèm các câu trả lời đã lưu tạm trên trình duyệt và máy chủ | Khi khách mở lại đường dẫn phòng thi trên cùng trình duyệt (hoặc nhập lại đúng Email + SĐT khi chưa hết giờ), hệ thống khôi phục các câu đã chọn và thời gian đếm ngược còn lại | Tự động thu bài và khóa lượt thi ngay khi đồng hồ đếm ngược về `00:00` |

### 6.5 Other Edge Cases

- **Chống trừ tiền trùng khi nhập lại cùng một file đề thi:** Hệ thống kiểm tra mã nhận diện nội dung file PDF/ảnh khi giáo viên tải lên trong cùng tổ chức; nếu file đó đã được trích xuất thành công trước đó thì cảnh báo và mở lại bản đề nháp cũ thay vì trừ tiếp `5 credit`.
- **Thứ tự ưu tiên trừ Credit AI:** Khi tổ chức vừa có *Credit định kỳ theo gói tháng* (reset cuối kỳ) vừa có *Credit mua thêm Top-up* (hạn `12 tháng`), hệ thống luôn **trừ hết Credit gói tháng trước**, sau đó mới trừ sang Credit mua thêm để bảo toàn quyền lợi cho giáo viên.
- **Bài ghi âm Speaking không có tiếng hoặc quá ngắn (`< 10 giây`):** Nếu sau bước chuyển giọng nói thành văn bản có dưới `15 từ` có nghĩa, hệ thống không gọi AI chấm điểm IELTS, không trừ `2 credit` của giáo viên và gắn cờ *"Bản ghi âm quá ngắn hoặc không rõ tiếng"* trên màn hình chấm bài.
- **Trùng hồ sơ Học viên vãng lai với Học viên chính thức:** Nếu một học viên đã có trong danh sách chính thức của tổ chức nhập đúng Email đó vào Phòng thi công khai, hệ thống tự động gắn lượt thi thử đó vào lịch sử của học viên hiện hữu thay vì tạo bản ghi vãng lai trùng lặp.
- **Lịch nghỉ chung rơi vào lớp có học viên sắp hết gói buổi học:** Khi giáo viên chọn *"Dời lịch (+1 buổi)"*, hệ thống chỉ dời ngày học của buổi đó sang tuần kế tiếp mà không làm thay đổi số buổi đã học hay số buổi còn lại trong gói học phí của học viên.

## 7. Validation, Limits & Wording

### 7.1 Validation rules

| Field | Rule |
|---|---|
| File tải lên Nhập đề bằng AI | Bắt buộc định dạng `.pdf`, `.png`, `.jpg`, `.jpeg`; dung lượng tối đa `15 MB`; số trang PDF tối đa `20 trang`; không nhận file PDF đặt mật khẩu khóa |
| Thông tin Khách vãng lai vào Phòng thi công khai | **Họ và tên**: bắt buộc, `2–80 ký tự`. **Email**: bắt buộc, đúng định dạng email chuẩn. **Số điện thoại**: bắt buộc, số điện thoại Việt Nam hợp lệ (`10 chữ số`, bắt đầu bằng `0`) |
| Cấu hình Phòng thi công khai | Tên phòng thi: bắt buộc (`3–120 ký tự`); phải gắn với ít nhất 1 bộ đề đã xuất bản; thời gian làm bài từ `5` đến `180 phút`; nút bật chấm AI Writing/Speaking mặc định `TẮT` |
| Lịch nghỉ chung của tổ chức | Tên kỳ nghỉ: bắt buộc (`2–100 ký tự`); `Ngày bắt đầu ≤ Ngày kết thúc`; khoảng nghỉ tối đa `30 ngày` mỗi lần tạo; bắt buộc chọn 1 trong 2 phương án xử lý buổi trùng (*Hủy buổi* hoặc *Dời lịch*) |
| Mời nhân sự trung tâm (Giai đoạn C) | Email bắt buộc hợp lệ, không trùng với nhân sự đang hoạt động trong cùng tổ chức; bắt buộc chọn đúng 1 trong 4 vai trò (`Owner`, `Admin/Staff`, `Teacher`, `TA`); hạn mức trần Credit cá nhân (nếu đặt) là số nguyên `≥ 0` |

### 7.2 Limits & Quotas (exact values)

| Tham số | Giá trị | Window | Behavior khi vượt |
|---|---|---|---|
| Gói Dùng thử (Trial) | `30 credit` (`0đ`) | Một lần duy nhất cho mỗi tổ chức | Hết `30 credit` thì khóa toàn bộ tác vụ AI có phí, hiển thị lời mời chọn gói tháng (*Cơ bản / Chuyên nghiệp / Nâng cao*) |
| Gói Cơ bản / Chuyên nghiệp / Nâng cao | `70` / `130` / `200 credit` (`200k` / `350k` / `500k`) | Chu kỳ `30 ngày` (reset đầu chu kỳ mới, không cộng dồn) | Cảnh báo ở mốc `80%` và `100%`; khi về `0 credit` thì áp dụng quy tắc chạm trần bên dưới |
| Gói mua thêm (Top-up) | `100 credit` (`149.000đ`) | Hạn sử dụng `12 tháng` kể từ ngày mua | Chỉ bị trừ sau khi đã dùng hết số credit định kỳ của gói tháng hiện tại |
| Định mức trừ Credit theo tác vụ | Writing = `1 credit` · Speaking = `2 credit` · Nhập đề AI = `5 credit` · Nâng cấp tác vụ sâu = `0,5 credit` | Mỗi lần thực thi thành công | Tạm giữ trước khi gọi AI; hoàn trả tự động nếu dịch vụ AI lỗi hoặc quá thời gian chờ |
| Giới hạn công bằng cho tác vụ AI nhẹ (`0 credit`) | `100 lượt` (gồm tạo bài tập cơ bản, chat trợ giảng, nháp báo cáo, giải thích đáp án) | Mỗi ngày / mỗi tổ chức (reset lúc `00:00` giờ Việt Nam) | Chặn các lượt gọi miễn phí tiếp trong ngày hoặc đề xuất trừ `0,5 credit/lượt` nếu muốn tiếp tục dùng ngay |
| Chế độ "Chấm nhanh" Writing khi hết Credit | Tối đa `30 bài` Writing | Mỗi chu kỳ gói tháng / mỗi tổ chức | Khi hết credit chính, tự động hạ Writing xuống model chấm nhanh đến hết `30 bài`; từ bài thứ 31 thì chặn chấm AI và mời mua thêm credit |
| Thời gian ân hạn gói tháng (Grace Period) | `3 ngày` (`72 giờ`) | Sau thời điểm hết hạn gói tháng | Giữ nguyên quyền dùng số credit còn lại kèm băng rôn nhắc gia hạn; sau `72 giờ` chuyển sang *Hết hạn gói* và khóa AI |
| Trần bảo vệ Phòng thi công khai (khi bật chấm AI) | Tối đa `1 lượt AI / khách` VÀ tối đa `20 credit / ngày / phòng thi` | Theo từng khách (Email/SĐT/IP) và theo ngày (`00:00–23:59`) | Các lượt nộp bài vượt trần vẫn được lưu bài làm nhưng tự động bỏ qua bước gọi AI và báo chờ giáo viên chấm thủ công |

### 7.3 Wording samples (exact strings)

#### Error messages

| Tình huống | Wording | Code |
|---|---|---|
| Tổ chức đã hết sạch Credit AI khi bấm Nhập đề (`5 credit`) hoặc chấm Speaking (`2 credit`) | "Tổ chức của bạn đã dùng hết Credit AI trong kỳ. Vui lòng mua thêm gói 100 Credit (149.000đ) hoặc nâng cấp gói tháng để tiếp tục sử dụng tính năng này." | `E-AI-001` |
| Tổ chức hết cả Credit chính lẫn 30 lượt chấm nhanh Writing trong tháng | "Bạn đã sử dụng hết hạn mức Credit AI và 30 lượt chấm nhanh Writing hỗ trợ thêm trong tháng này. Vui lòng nạp thêm Credit để tiếp tục chấm tự động." | `E-AI-002` |
| File tải lên Nhập đề bằng AI vượt quá 20 trang hoặc 15 MB | "Tệp tải lên vượt quá giới hạn cho phép (tối đa 20 trang và 15 MB). Vui lòng tách nhỏ tệp đề thi trước khi tải lên." | `E-AI-003` |
| Dịch vụ AI trích xuất đề hoặc chấm bài thất bại sau khi đã thử lại | "Hệ thống AI đang phản hồi chậm hoặc không đọc được cấu trúc tệp này. Số Credit tạm giữ đã được hoàn lại đầy đủ vào ví của bạn. Vui lòng thử lại sau." | `E-AI-004` |
| Chạm giới hạn 100 lượt miễn phí/ngày cho trợ giảng chat & tạo bài nhẹ | "Tổ chức của bạn đã đạt giới hạn 100 lượt sử dụng miễn phí trong ngày hôm nay. Hạn mức sẽ được làm mới vào 00:00 ngày mai." | `E-AI-005` |
| Gói thuê bao đã quá 3 ngày ân hạn mà chưa thanh toán gia hạn | "Gói cước của bạn đã hết hạn sau 3 ngày ân hạn. Các tính năng AI hiện đang tạm khóa (dữ liệu lớp học vẫn hoạt động bình thường). Vui lòng gia hạn để mở lại." | `E-SUB-001` |
| Nhân sự trong trung tâm chạm trần Credit cá nhân do Chủ trung tâm cấp | "Bạn đã sử dụng hết hạn mức Credit AI được phân bổ trong tháng này. Vui lòng liên hệ Chủ trung tâm để được cấp thêm hạn mức." | `E-ORG-001` |

#### Success messages

| Tình huống | Wording |
|---|---|
| Đối soát thanh toán QR gói tháng hoặc gói nạp thêm 100 Credit thành công | "Thanh toán thành công! Gói cước và số dư Credit AI của bạn đã được cập nhật ngay lập tức." |
| AI trích xuất đề thi từ file PDF/ảnh hoàn tất | "Đã trích xuất đề thi thành công (-5 Credit). Vui lòng rà soát lại nội dung câu hỏi và đáp án trước khi xuất bản." |
| Giáo viên rà soát xong bản nháp AI và bấm "Chốt trả bài" | "Đã chốt điểm và trả bài thành công. Học viên đã nhận được thông báo kết quả." |
| Áp dụng lịch nghỉ chung và tự động đẩy lùi lịch học thành công | "Đã lưu lịch nghỉ chung và tự động dời lịch các buổi học bị trùng sang buổi kế tiếp." |

#### Info / neutral messages

| Tình huống | Wording |
|---|---|
| Cảnh báo khi tổ chức đã tiêu dùng đạt mốc 80% Credit trong tháng | "Lưu ý: Tổ chức của bạn đã sử dụng 80% quỹ Credit AI của tháng này. Bạn có thể nạp thêm gói 100 Credit dự phòng bất kỳ lúc nào để không bị gián đoạn." |
| Nhãn hiển thị trên bản chấm nháp AI của bài Speaking | "Gợi ý từ AI (dựa trên văn bản ghi âm — chưa đánh giá tiêu chí phát âm). Chỉ hiển thị cho giáo viên, học viên chưa thấy kết quả này." |
| Thông báo cho khách vãng lai khi nộp bài Writing/Speaking vượt trần AI của phòng thi công khai | "Bài làm của bạn đã được ghi nhận thành công! Giáo viên sẽ chấm chi tiết phần bài viết/nói và gửi kết quả qua Email bạn đã đăng ký." |
| Băng rôn nhắc nhở trong 3 ngày ân hạn gói tháng | "Gói cước tháng của bạn đã đến hạn thanh toán. Bạn còn trong thời gian ân hạn 3 ngày trước khi các tính năng AI tạm khóa — bấm vào đây để gia hạn nhanh qua mã QR." |

## 8. Assumptions

- Hạ tầng đối soát ngân hàng tự động (**Bank-Hub**) đang vận hành cho luồng thu học phí học viên ở mốc M2 có thể tái sử dụng trực tiếp để nhận thông báo thanh toán gói thuê bao và gói nạp thêm Credit của giáo viên mà không cần tích hợp cổng thanh toán thẻ quốc tế ở giai đoạn đầu.
- Tỷ lệ chi phí thực tế cho mỗi `1 credit` duy trì quanh ngưỡng `~690đ` (`~$0,027`), đảm bảo tổng chi phí AI không vượt quá `25–30%` doanh thu của từng gói (`200.000đ / 350.000đ / 500.000đ`).
- Mọi dữ liệu hiện có trong hệ thống đã được gắn chặt theo mã tổ chức (`org_id`), nên việc nâng cấp lên mô hình trung tâm nhiều nhân sự ở Giai đoạn C chủ yếu là mở rộng bảng thành viên, phân quyền truy cập và thêm thông tin giáo viên phụ trách vào lớp học.
- Việc lưu trữ kết quả giải thích đáp án dùng chung theo từng câu hỏi và lưu đệm hướng dẫn chấm chuẩn (Rubric IELTS) sẽ giúp giữ chi phí các tác vụ nhẹ ở mức gần như bằng không sau lần gọi đầu tiên.

## 9. Risks

| Rủi ro | Khả năng | Hậu quả nghiệp vụ | Cách phòng |
|--------|----------|-------------------|-----------|
| Điểm AI chấm nháp lệch quá `0,5 band` so với tiêu chuẩn của giáo viên hoặc nhận xét thiếu tự nhiên | Thỉnh thoảng | Giáo viên mất niềm tin vào chất lượng Trợ giảng AI, phải sửa lại toàn bộ lời phê và không gia hạn gói tháng | Chạy bộ kiểm thử mù trên `100–200 bài` Writing/Speaking thật đã chấm trước khi mở rộng; luôn giữ nguyên tắc "AI chỉ là bản nháp, giáo viên chốt điểm cuối" |
| Khách vãng lai hoặc đối thủ cố tình gửi bài hàng loạt vào Phòng thi công khai có bật chấm AI làm cạn kiệt ví Credit của giáo viên | Thường | Giáo viên bị đốt hết Credit AI trong vài giờ mà không thu được học viên thật, dẫn đến khiếu nại đòi hoàn tiền | Mặc định **TẮT** chấm AI cho phòng thi công khai (chỉ mở Reading/Listening tự chấm); khi giáo viên bật thì khóa cứng trần `1 lượt AI/khách` và tối đa `20 credit/ngày/phòng thi` |
| Rủi ro pháp lý và quyền riêng tư khi gửi bài viết và file ghi âm giọng nói của học viên (đặc biệt học viên dưới 18 tuổi) sang nhà cung cấp AI bên ngoài | Thỉnh thoảng | Vi phạm quy định bảo vệ dữ liệu cá nhân tại Việt Nam, gây mất uy tín thương hiệu với phụ huynh và trung tâm | Bổ sung điều khoản đồng ý xử lý dữ liệu rõ ràng trên cổng học viên; chỉ chọn nhà cung cấp AI cam kết không dùng dữ liệu gửi qua API để huấn luyện mô hình |
| Giáo viên có quy mô lớn (`> 40 học viên`, chấm mạnh tay `250+ credit/tháng`) thấy gói Nâng cao (`200 credit`) không đủ dùng hàng tháng | Thỉnh thoảng | Giáo viên cảm thấy bị ngắt quãng giữa tháng khi hết credit | Cung cấp gói nạp lẻ `100 credit = 149.000đ` (hạn dài `12 tháng`) ngay trên màn chấm bài và tự động hạ Writing xuống chế độ "Chấm nhanh" (`30 bài/tháng`) làm vùng đệm mềm |
| Mở rộng quá nhiều tính năng cùng lúc làm chậm tiến độ đóng mốc M5 hiện tại | Thỉnh thoảng | Phân tán nguồn lực phát triển của đội ngũ một người, làm trễ thời điểm đưa bộ tính năng tạo doanh thu (`A0 + A`) ra thị trường | Khóa cứng thứ tự triển khai tuần tự sau M5: làm dứt điểm `A0 → A` để có sản phẩm thu phí trước, sau đó mới sang `B` và `C` |

## 10. Success Criteria (preliminary)

- **Kiểm soát biên lợi nhuận AI (Giai đoạn A0):** `100%` lượt gọi AI được ghi nhận đầy đủ vào bộ đếm của tổ chức; tổng chi phí hạ tầng AI thực tế mỗi tháng luôn nằm trong ngưỡng `≤ 30%` doanh thu gói thuê bao và gói nạp thêm credit.
- **Chất lượng & Tốc độ Trợ giảng AI (Giai đoạn A):** Độ lệch điểm trung bình (MAE) của bản nháp AI so với điểm giáo viên chốt đạt `≤ 0,5 band` trên bộ mẫu đánh giá; thời gian giáo viên chấm xong 1 bài Writing/Speaking giảm tối thiểu `50%` so với chấm thủ công hoàn toàn; tỷ lệ giáo viên giữ lại trên `70%` nội dung câu hỏi sau khi Nhập đề bằng AI.
- **Hiệu quả thu hút học viên & Vận hành (Giai đoạn B):** `0` trường hợp giáo viên bị trừ lố quá trần `20 credit/ngày` từ phòng thi công khai; giáo viên hoàn tất điểm danh toàn bộ các lớp trong ngày chỉ trong `≤ 2 phút` từ màn hình Điểm danh tổng.
- **Sẵn sàng cho mô hình Trung tâm (Giai đoạn C):** Một tổ chức trung tâm có thể vận hành trơn tru với đủ 4 vai trò (*Chủ trung tâm, Giáo vụ, Giáo viên đứng lớp, Trợ giảng*) mà không rò rỉ dữ liệu lớp học hoặc học phí sang các giáo viên không được phân công.

## 11. Open Questions

* [x] OQ-1: Sau khi chạy bộ đánh giá thực nghiệm trên `100–200 bài` Writing và Speaking đã chấm của Teacher OS, nhà cung cấp dịch vụ AI và dịch vụ chuyển giọng nói thành văn bản nào đạt chuẩn độ lệch `≤ 0,5 band` với chi phí thấp nhất để chốt chính thức cho Giai đoạn A? — **Resolved (via `/ba-prd-epic`):** Chốt tổ hợp mặc định là Anthropic Claude (`Claude Sonnet 5.5` + `Claude Haiku 5.5`) kết hợp `Groq Whisper Large v3 Turbo` (dự phòng `OpenAI Transcribe`), cho phép đổi qua cấu hình sau khi chạy kiểm thử `100–200 bài` thật.
* [x] OQ-2: Ở Giai đoạn B (gửi thông báo Email thật cho học viên/phụ huynh), tổ chức sẽ gửi từ tên miền Email chung của hệ thống Teacher OS (kèm tên hiển thị của giáo viên/trung tâm) hay cần hỗ trợ cấu hình tên miền Email riêng cho từng trung tâm lớn ở Giai đoạn C? — **Resolved (via `/ba-prd-epic`):** Sử dụng một tên miền gửi Email chung đã xác thực của Teacher OS kèm Tên người gửi và địa chỉ trả lời (`Reply-To`) theo giáo viên/trung tâm; không hỗ trợ cấu hình tên miền Email riêng.

## 12. Next Steps

Sau brainstorm này (sau khi BA approve):
* `/urd selfomy-alignment` — capture user perspective
* `/brd selfomy-alignment` — business case
* `/prd-epic selfomy-alignment` — product scope
