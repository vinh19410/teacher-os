---
type: project-profile
status: draft
updated: 2026-10-26
links:
  - plans/reports/research-261025-2315-selfomy-vs-teacher-os-feature-gap.md
  - plans/reports/advise-261025-2328-ai-model-selection-cost-and-pricing.md
  - docs/project-overview-pdr.md
  - docs/project-roadmap.md
---

# Project Profile

## Domain

Teacher OS là nền tảng quản lý vận hành lớp học và luyện thi tiếng Anh (trọng tâm IELTS 4 kỹ năng) dành cho giáo viên độc lập và trung tâm quy mô vừa/nhỏ. Hệ thống hợp nhất quản lý lớp học, lịch dạy, giáo trình, ngân hàng đề thi 4 kỹ năng, chấm bài (tự động kết hợp trợ giảng AI và giáo viên duyệt), cổng học viên tự phục vụ và đối soát học phí qua ngân hàng trong một không gian làm việc theo tổ chức (org).

## Người dùng & thuật ngữ

| Nhóm user | Gọi là gì trong doc | Ghi chú | Ngày |
|---|---|---|---|
| Giáo viên độc lập | Giáo viên | Người sở hữu tổ chức (org) khi vận hành solo, trực tiếp dạy, giao bài, chấm bài và thu học phí | 2026-10-26 |
| Chủ trung tâm | Chủ trung tâm (Owner) | Người sở hữu tổ chức ở mô hình trung tâm (Giai đoạn C), quản lý gói cước, ví Credit AI và phân quyền nhân sự | 2026-10-26 |
| Quản lý / Giáo vụ | Giáo vụ (Admin/Staff) | Nhân sự vận hành trung tâm (Giai đoạn C): xếp lớp, điểm danh tổng, quản lý công nợ và hóa đơn học phí | 2026-10-26 |
| Giáo viên đứng lớp | Giáo viên đứng lớp | Nhân sự giảng dạy trong trung tâm (Giai đoạn C): chỉ truy cập lớp được phân công, giao bài và duyệt chốt điểm | 2026-10-26 |
| Trợ giảng | Trợ giảng (TA) | Nhân sự hỗ trợ lớp được giao (Giai đoạn C): điểm danh và chấm nháp, chờ Giáo viên đứng lớp duyệt chốt | 2026-10-26 |
| Học viên chính thức | Học viên | Người học đã nhận lời mời và kích hoạt tham gia lớp học trên cổng học viên (`apps/student`) | 2026-10-26 |
| Khách làm đề thử | Học viên vãng lai (Khách vãng lai) | Người học chưa vào lớp chính thức, để lại Họ tên + Email + SĐT để thi thử tại Phòng thi ảo công khai (Giai đoạn B) | 2026-10-26 |
| Quản trị viên hệ thống | Quản trị viên nền tảng (Platform Admin) | Người vận hành Teacher OS trên `apps/admin`, quản lý thư viện đề chung toàn hệ thống | 2026-10-26 |

## Đối thủ / benchmark

| Tên | Mạnh về | Monetization | Nguồn / ngày |
|---|---|---|---|
| Selfomy One (`one.selfomy.com`) | Hệ thống quản trị trung tâm đa cơ sở & nhiều nhân sự; phòng thi ảo IELTS công khai cho khách vãng lai; nhập đề, tạo bài tập và chấm Writing/Speaking bằng AI; bảng điều khiển giáo dục & tài chính chi tiết | Gói thuê bao phần mềm (SaaS subscription) theo quy mô trung tâm / cơ sở kèm tính năng AI | `plans/reports/research-261025-2315-selfomy-vs-teacher-os-feature-gap.md` (2026-10-25) |

## Thị trường & ngôn ngữ

- **Thị trường mục tiêu:** Giáo viên dạy tiếng Anh / luyện thi IELTS độc lập và các trung tâm ngoại ngữ quy mô vừa và nhỏ tại Việt Nam.
- **Ngôn ngữ giao diện & tài liệu:** Tiếng Việt là ngôn ngữ mặc định; giữ nguyên thuật ngữ chuyên môn tiếng Anh đã quen thuộc trong bối cảnh luyện thi IELTS (Reading, Listening, Writing, Speaking, Band, Rubric, Credit).

## Compliance

- **Bảo vệ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP & Luật Bảo vệ dữ liệu cá nhân Việt Nam):** Dữ liệu bài làm văn bản và file ghi âm giọng nói của học viên (bao gồm học viên dưới 18 tuổi) khi gửi qua nhà cung cấp dịch vụ AI và chuyển giọng nói thành văn bản bên thứ ba phải có sự đồng ý rõ ràng trong điều khoản sử dụng, cam kết không dùng dữ liệu người học để huấn luyện mô hình công cộng, và có chính sách lưu giữ/xóa định kỳ.

## Mô hình kinh doanh

- **Thuê bao tháng (Subscription) dành cho Giáo viên / Tổ chức kèm hạn mức Credit AI** (chi phí AI do hệ thống chi trả và gói gọn trong ≤ 30% giá gói):
  - **Dùng thử:** `0đ` — tặng `30 credit` (một lần duy nhất, hết là dừng).
  - **Cơ bản:** `200.000đ/tháng` — `70 credit/tháng`.
  - **Chuyên nghiệp:** `350.000đ/tháng` — `130 credit/tháng`.
  - **Nâng cao:** `500.000đ/tháng` — `200 credit/tháng`.
  - **Gói mua thêm (Top-up):** `149.000đ / 100 credit` (hạn sử dụng `12 tháng`; credit định kỳ trong gói tháng reset mỗi tháng, không cộng dồn).
- **Phương thức thanh toán gói:** Tự động qua mã QR chuyển khoản ngân hàng và đối soát tự động qua Bank-Hub; ân hạn `3 ngày` khi gói tháng đến hạn trước khi khóa tính năng AI.

## Ghi chú khác

| Câu hỏi | Trả lời | Ngày | Skill hỏi |
|---|---|---|---|
| Khi nào bắt đầu lộ trình Align Selfomy và theo thứ tự nào? | Triển khai nối tiếp ngay sau mốc M5 theo **Phương án 1 (4 chặng thực dụng)**: Chặng 1 (`B-core`: Thông báo Email/In-app thật, Dashboard nhắc việc & Điểm danh ngày, Lịch nghỉ chung, Sổ công nợ học viên) → Chặng 2 (`A0-lite + A-core`: Ví/bộ đếm Credit AI cấp qua quản trị, Nhập đề PDF/ảnh AI, Chấm nháp Writing/Speaking AI) → Chặng 3 (`B-growth + A0-billing + A-mở rộng`: Phòng thi công khai, Thanh toán gói QR tự động, Tạo bài nhanh & Chat AI) → Chặng 4 (`C-core`: Trung tâm nhiều nhân sự 4 vai trò) | 2026-10-26 | `/ba-prd-epic` |
| Kết quả AI chấm Writing/Speaking có hiển thị ngay cho học viên không? | Không; chỉ lưu làm bản nháp cho giáo viên/trợ giảng rà soát và chỉ hiển thị cho học viên sau khi giáo viên bấm "Chốt trả bài" | 2026-10-26 | `/ba-brainstorm` |
| Kênh gửi thông báo thật ở Giai đoạn B gồm những kênh nào và dùng tên miền nào? | Gửi qua Email (từ 1 tên miền chung đã xác thực của Teacher OS kèm Tên người gửi và `Reply-To` theo giáo viên/trung tâm; không làm tên miền Email riêng) và Thông báo trong cổng học viên (In-app) cho 4 sự kiện chính; giữ Zalo ngoài phạm vi | 2026-10-26 | `/ba-prd-epic` |
| Tổ hợp nhà cung cấp AI & chuyển giọng nói mặc định cho Chặng 2? | Anthropic Claude (`Claude Sonnet 5.5` cho chấm chuẩn & nhập đề; `Claude Haiku 5.5` cho tác vụ nhẹ & Chấm nhanh) kết hợp `Groq Whisper Large v3 Turbo` (dự phòng `OpenAI Transcribe`), cho phép đổi qua cấu hình sau kiểm thử `100–200 bài` thật | 2026-10-26 | `/ba-prd-epic` |
