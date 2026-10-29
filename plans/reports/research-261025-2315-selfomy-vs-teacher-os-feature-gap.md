# So sánh feature: Selfomy One vs Teacher OS

Ngày: 2026-10-25. Nguồn Selfomy: khám phá trực tiếp `one.selfomy.com` (chỉ đọc, dữ liệu test). Nguồn Teacher OS: routes `apps/web|student|admin`, `apps/server/src/routes`, `packages/db/src/schema`, `docs/project-overview-pdr.md`, `docs/project-roadmap.md`.

Ký hiệu: ✅ đã có · 🟡 có một phần · ❌ chưa có · ⛔ nằm ngoài phạm vi đã chốt (non-goal / đã gỡ).
Ưu tiên "nên làm giống": P1 (giá trị cao, hợp định hướng), P2 (cân nhắc), P3 (thấp / không cần).

Lưu ý định hướng: Teacher OS là app cho **một giáo viên** (roadmap loại trừ "mời/quản trị nhiều giáo viên", parent login, Zalo/GCal); Selfomy là hệ thống **trung tâm đa cơ sở, nhiều nhân sự**. Nhiều mục Selfomy vì vậy được đánh P3.

## 1. Bảng điều khiển

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Thẻ tổng quan (lớp hôm nay, tổng học viên, ca hôm nay, học viên mới) | `/dashboard` có "Lịch sắp tới", "Cần kiểm tra" (học viên rủi ro) từ dữ liệu thật | 🟡 | P2 |
| Nhóm Giáo dục (bài chờ chấm, lớp chưa điểm danh, vắng/nghỉ tuần này) | Chưa có widget bài chờ chấm / lớp chưa điểm danh trên dashboard (hàng chờ chấm ở `/grading`) | 🟡 | P1 |
| Danh sách học viên mới nhất, lớp sắp kết thúc, lớp sắp có bài kiểm tra | Chưa có | ❌ | P2 |
| Top lớp vắng/đi trễ cao | Chưa có | ❌ | P2 |
| Nhóm Tài chính (doanh thu/chi phí kỳ này, đơn chờ/thất bại) + biểu đồ dòng tiền thực tế vs dự kiến | `/tuition` có KPI đã thu / còn nợ; chưa có chi phí, dự kiến, biểu đồ | 🟡 | P2 |
| Banner trợ giảng AI + chat | Chưa có AI | ❌ | xem mục 8 |
| Chuyển cơ sở, đổi công ty, thiết lập công ty/cơ sở, gia hạn gói | Chỉ có org + switcher phía học viên; không có đa cơ sở / billing SaaS | ❌ | P3 |
| Hướng dẫn kết nối MCP cho AI client | Chưa có | ❌ | P3 |

## 2. Công việc

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Lịch tháng/tuần/ngày, tạo sự kiện, lịch nghỉ, màu theo khóa học | `/schedule` (nav tuần), tạo/sửa/hủy buổi học từ lịch lớp | 🟡 (thiếu chế độ tháng/ngày, sự kiện ngoài lớp, lịch nghỉ chung, màu theo khóa) | P1 |
| Máy chấm công / bảng công nhân sự | Không có nhân sự; một giáo viên | ❌ | P3 |

## 3. Giáo dục

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Lớp học (lớp chính thức, ca học, trạng thái, khóa học) | `/classes`, `/classes/$classId`, lịch structured, loại lớp | ✅ | — |
| Lớp qua video | Không có loại lớp video | ❌ | P2 |
| Chương trình học (syllabus: phần → bài) | `/syllabus` CRUD module → lesson, copy template, `kind` lesson/midterm/final | ✅ | — |
| Bố cục chương trình học cho học viên (lộ trình / phân cấp) | Chưa thấy cấu hình bố cục | ❌ | P3 |
| Học viên (chính thức) + chi tiết | `/students`, `/students/$studentId`; học viên tự provision qua portal + lời mời (`student_invitation`) | ✅ | — |
| Học viên vãng lai, danh sách chờ xếp lớp, lưu trữ | Chưa có trạng thái vãng lai / chờ / lưu trữ (có enrollment `invited` → `active`) | 🟡 | P2 |
| Tạo học viên hàng loạt | Cố ý không (giáo viên không tạo học viên thủ công); chỉ mời qua email | ⛔ | P3 |
| Phòng thi ảo (mock room công khai, chế độ thi, thời gian, lượt thi) | Chưa có phòng thi công khai; có `assignment_test` giao cho lớp + `quiz_attempt` | ❌ | P1 |
| Đề thi: thư viện lớn, nhóm đề/bộ đề, tạo/soạn đề | Admin console `/library/tests` (Reading/Listening, publish); ngân hàng `assignment_prompt` 4 kỹ năng; `assignment_test` ghép part | ✅ | — |
| Nhập đề bằng AI | Chưa có | ❌ | P1 |
| "Xem như học viên" (preview) | `/assignments/preview` + preview-sim-tab | ✅ | — |
| Bài tập + bộ bài tập, hiển thị trên website | `/assignments` (4 kỹ năng, giao cho lớp, snapshot); chưa có "bộ bài tập" cấp cao và cờ hiển thị công khai | 🟡 | P2 |
| Tạo bài tập bằng AI | Chưa có | ❌ | P1 |
| Điểm danh theo ngày, chọn lớp, lọc chưa xong | Check-in/điểm danh buổi học trong lịch lớp (M1); chưa có màn điểm danh tổng theo ngày | 🟡 | P1 |
| Chấm bài: Mock Test IELTS theo kỹ năng, nhập tay điểm bài giấy | `/grading`, `/grading/$attemptId`: chấm Writing/Speaking, chú thích bài luận, band IELTS; auto-grade Reading/Listening; Speaking nộp audio R2 | ✅ (chưa có nhập tay điểm bài giấy) | P2 |
| Chấm bằng AI (Writing/Speaking, cho học viên vãng lai) | Chưa có | ❌ | P1 |
| Báo cáo học tập hằng ngày/tuần/tháng cấu hình theo khóa | `/reports` + bảng `report`; cụm parent-reports tắt bằng `PARENT_REPORTS_ENABLED=false`, chưa gửi thật | 🟡 (ship tắt) | P2 |
| Bảng điểm (lọc lớp/cột/thời gian) | Có `/students/$id` + lịch sử học viên; chưa có bảng điểm tổng theo lớp | 🟡 | P2 |
| Luyện tập hằng ngày | Portal học viên: `/practice`, từ vựng SRS (deck, course, session) và `/vocab` phía giáo viên | ✅ (hướng từ vựng/luyện kỹ năng) | — |
| Giáo viên (danh sách, email, lớp đang dạy) | Một giáo viên sở hữu org; không có quản lý nhiều giáo viên (non-goal) | ⛔ | P3 |

## 4. Bán hàng

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Mục tiêu bán hàng theo tháng, nhân viên chăm sóc, danh sách chưa thanh toán | Không có module bán hàng/CRM; chỉ có "còn nợ" ở `/tuition` | ❌ | P3 (một giáo viên không cần nhân viên chăm sóc; có thể làm nhẹ "mục tiêu doanh thu" ở P2) |

## 5. Tài chính

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Đơn hàng (lớp/video/gói thành viên) | Invoice theo enrollment (`/tuition`, tạo hóa đơn, mark-paid, `session_package`); không có "đơn hàng" độc lập hay gói thành viên | 🟡 | P2 |
| Thanh toán online / đối soát | Bank-hub (liên kết ngân hàng, webhook/IPN, đối soát), trang thanh toán công khai `/pay/$token`, `payment_transaction` | ✅ (mạnh hơn phần thấy trên Selfomy) | — |
| Học phí theo khóa học | Đơn giá theo invoice/gói; cấu hình mặc định đã gỡ cùng settings (#321) | 🟡 | P2 |
| Công nợ (số dư học viên, SĐT cha mẹ) | Tổng còn nợ ở `/tuition`; chưa có sổ công nợ riêng theo học viên | 🟡 | P1 |
| Sổ thu chi (phiếu thu/chi, hoàn tiền, giảm giá, điều chỉnh, tiền mặt/CK/cổng) | Chỉ ghi nhận thu học phí; không có phiếu chi, hoàn tiền, giảm giá | ❌ | P2 |
| Tài khoản ngân hàng | Có qua bank-link | ✅ | — |

## 6. Website (CMS)

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Thiết lập website (logo, tên miền riêng, giao diện, màu, ngôn ngữ, CSS/JS) | Chỉ có `apps/landing` tĩnh (marketing của chính Teacher OS), không phải website cho từng giáo viên | ❌ | P3 |
| Trang, thanh điều hướng, blog, popup, cảm nhận, thành tích, đội ngũ | Chưa có | ❌ | P3 |
| Cổng học viên tự phục vụ (đăng ký, làm bài, xem lớp, học phí) | `apps/student` đầy đủ: onboarding, lớp, bài tập, làm quiz, lịch sử, học phí, từ vựng | ✅ | — |
| Cho phép khách vãng lai làm đề thử công khai | Chưa có (cần đăng nhập học viên) | ❌ | P1 (đi cùng phòng thi ảo) |

## 7. Giao tiếp

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Thông báo gửi học viên/phụ huynh + trạng thái gửi/nhận | Bảng `notif` chỉ là feed đọc; thông báo trong portal (lời mời lớp); gửi báo cáo chưa nối kênh thật | 🟡 | P1 |
| Tổng đài, lịch sử cuộc gọi | Không có | ❌ | P3 |

## 8. Ứng dụng

| Feature Selfomy | Teacher OS | Trạng thái | Ưu tiên |
|---|---|---|---|
| Biểu mẫu (form thu thập đăng ký/phản hồi) | Chưa có | ❌ | P2 |
| Trợ giảng AI (chat, nhập/giao bài thay giáo viên) | Chưa có tích hợp LLM trong repo | ❌ | P1 |

## Tóm tắt

- **Đã tương đương hoặc tốt hơn:** lớp học, syllabus, học viên + lời mời, thư viện đề (admin) + bài tập 4 kỹ năng, preview như học viên, chấm Writing/Speaking có chú thích, portal học viên, từ vựng SRS, thanh toán + đối soát ngân hàng.
- **Làm giống ở mức P1 (khoảng cách lớn nhất, hợp định hướng giáo viên solo):**
  1. AI: nhập đề bằng AI, tạo bài tập bằng AI, chấm Writing/Speaking bằng AI, trợ giảng chat.
  2. Phòng thi ảo + cho phép khách vãng lai làm đề thử công khai.
  3. Dashboard: widget bài chờ chấm, lớp chưa điểm danh; màn điểm danh tổng theo ngày.
  4. Lịch: chế độ tháng/ngày, sự kiện ngoài lớp, lịch nghỉ.
  5. Công nợ theo học viên.
  6. Thông báo thật tới học viên/phụ huynh (nối kênh gửi).
- **P2:** lớp qua video, học viên vãng lai/chờ/lưu trữ, bộ bài tập + hiển thị công khai, bảng điểm theo lớp, sổ thu chi đầy đủ, biểu mẫu, bật lại báo cáo học tập, nhập tay điểm bài giấy, dashboard tài chính.
- **P3 / không nên theo:** đa cơ sở, chấm công, quản lý nhiều giáo viên, CRM bán hàng, tổng đài, CMS website, billing SaaS, MCP guide.

## Giới hạn

- Selfomy: nội dung bên trong các màn tạo/chi tiết (trình soạn đề, tạo đơn, tạo thông báo) chưa mở, nên mức phủ của chúng chỉ suy từ tên và danh sách.
- Teacher OS: đối chiếu qua tên route, schema và tài liệu; chưa chạy app để xác nhận từng tính năng. Dòng "chưa có AI" dựa trên việc không tìm thấy tích hợp LLM trong `apps/*/src` và `packages/*/src`.
- Vài mục đánh 🟡 (dashboard, lịch, thông báo) cần kiểm lại trên UI trước khi lập plan.

## Quyết định (2026-10-25)

1. **Mở rộng cho trung tâm nhiều nhân sự** — các mục ⛔/P3 liên quan nhân sự được nâng lên thành hướng dài hạn, làm sau giai đoạn B.
2. **Đưa AI vào roadmap** — các mục AI giữ P1, làm đầu tiên.

Phân giai đoạn sau quyết định:

| Giai đoạn | Nội dung | Ghi chú phụ thuộc |
|---|---|---|
| A — AI trợ giảng | Nhập đề bằng AI, tạo bài tập bằng AI, chấm Writing/Speaking bằng AI, trợ giảng chat | Cần chọn nhà cung cấp LLM, chi phí/quota theo org, lưu kết quả AI tách khỏi điểm giáo viên chốt |
| B — Vận hành lớp mở rộng | Phòng thi ảo + đề thử công khai, dashboard chờ chấm/chưa điểm danh, điểm danh theo ngày, lịch tháng/ngày + lịch nghỉ, công nợ theo học viên, thông báo gửi thật | Đề thử công khai cần luồng khách vãng lai (trạng thái học viên vãng lai) |
| C — Nhiều nhân sự | Mời giáo viên/nhân sự, phân quyền theo vai trò, gán giáo viên cho lớp; sau đó chấm công, nhân viên chăm sóc + mục tiêu bán hàng, đa cơ sở | Hiện bảng `class` chưa có cột giáo viên; portal học viên đang suy giáo viên = chủ org (membership `teacher` sớm nhất); `requireAdmin`/role gate phải mở rộng; mọi dữ liệu đã org-scoped nên đa cơ sở có thể là cấp dưới org |
| Để sau | CMS website, tổng đài, sổ thu chi đầy đủ, biểu mẫu | |

Đã cập nhật [project-roadmap.md](../../docs/project-roadmap.md): bỏ "mời/quản trị nhiều giáo viên" khỏi danh sách non-goal và thêm mục "Định hướng quý sau (đề xuất)".

## Quyết định bổ sung (2026-10-25)

- **Chi phí AI do hệ thống trả, tính vào gói subscription của giáo viên.** Hệ quả: giai đoạn A phải kèm (1) đo lượng dùng AI theo org (token/lượt chấm/lượt tạo đề), (2) hạn mức theo gói và chặn khi vượt, (3) chính hệ thống subscription/billing cho giáo viên. Repo hiện chỉ có thu học phí của giáo viên từ học viên, chưa có subscription của giáo viên với Teacher OS (mục "billing SaaS" trước đây xếp P3 nay thành phụ thuộc của giai đoạn A). Nên tách thành bước A0 (metering + gói) trước các tính năng AI.
- **Nhà cung cấp LLM chưa chốt.** Nên thiết kế lớp trừu tượng nhà cung cấp (một interface, cấu hình model theo tác vụ) để đổi được mà không sửa nghiệp vụ.
- **Chưa có trung tâm cụ thể.** Giữ thứ tự A → B → C; không có lý do kéo phần nào của C lên trước B.

## Câu hỏi còn mở

- Nhà cung cấp LLM nào, và ngân sách chi phí AI tối đa trên mỗi giáo viên mỗi tháng là bao nhiêu (để định hạn mức gói)?
- Các gói subscription: mấy bậc, giá, hạn mức AI từng bậc, có gói miễn phí/dùng thử không?
- Khi vượt hạn mức: chặn hẳn, hạ cấp tác vụ, hay cho mua thêm?
