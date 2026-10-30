# Phase 4.2-4.3: UAT lõi trên staging

Ngày chạy: 2026-10-29 (giờ VN, 12:40-13:05). Commit staging: `d6bf93a8` (develop), AI_ENABLED tắt.
Web `https://app.staging.teacheros.io.vn`, student `https://student.staging.teacheros.io.vn`, api `https://api.staging.teacheros.io.vn`.
Công cụ: Playwright (chromium headless 1.62) chạy script ngoài repo, UI thật; không sửa code, không tạo issue, không đụng prod.
Ảnh: `reports/phase-4-screens/` (121 file, tên theo bước `s1-*` ... `s6-*`, `ai-*`, `vp-<viewport>-<màn>`, `kbd-*`).

## Kết quả tóm tắt

| Bước | Kết quả |
| --- | --- |
| 1. Đăng ký/đăng nhập email + bootstrap org | PASS |
| 2. Lớp có lịch, học viên, enroll, syllabus, buổi sinh ra | PASS có lỗi (F1: buổi cuối sai thứ khi lớp bắt đầu vào thứ Năm) |
| 3. Lịch Tháng/Tuần/Ngày + kỳ nghỉ dời/bù/hủy/hoàn tác | PASS |
| 4. Điểm danh theo buổi và theo ngày, tất cả Có mặt, reload | PASS |
| 5. Invoice, thu một phần/toàn bộ, sổ công nợ + KPI, timeline, nhắc học phí | PASS (ghi chú O3, O4) |
| 6. Nhật ký thông báo, gửi lại/retry | PARTIAL: nhật ký + bộ lọc PASS; retry KHÔNG kiểm được (không có dòng lỗi gửi trên staging) |
| AI không lộ trên UI | PASS (một phần: panel chấm nháp không thấy trên màn chấm bài, xem mục AI) |
| 3 viewport + keyboard focus | PASS (không tràn ngang, focus ring đủ), ghi chú O5, O6 |
| Safari private | CẦN NGƯỜI KIỂM SAFARI PRIVATE. Không tự động hóa được, chưa kiểm. |

0 lỗi 500. 0 pageerror. Console: chỉ có 403 trên cổng học viên và một 503 `bank-link` (mục Console).

## Dữ liệu test (để dọn sau, UI không có đường xóa an toàn)

Không có chức năng xóa tài khoản/org/lớp trên UI nên không dọn được. Ghi lại để dọn:
- Giáo viên: `uat-phase4-1029a@e2e.test` (mật khẩu `UatPhase4-Pass!29`), org tự tạo lúc đăng ký (tên theo tên GV "UAT Phase4 Teacher"; id không lộ qua UI/`/api/kernel`, tra theo email trong D1 staging).
- Học viên: `uat-hv-an-1029@e2e.test`, `uat-hv-binh-1029@e2e.test`, `uat-bounce-1029@bounce.test` (mật khẩu `UatStudent-Pass!29`).
- Trong org: syllabus "UAT IELTS Writing 6.5", lớp "UAT Lớp Writing 6.5" (`a79f95dd-3820-4bad-b917-b3ec939a8729`), lớp "UAT Lớp Điểm danh Hôm nay" (`f6c1e2ed-6ca1-4f6a-a002-4c4b09f3a42b`), lớp "UAT Lớp D bắt đầu thứ Năm" (`06e37f56-b656-4f48-a27a-6a2c3b736170`), 2 hóa đơn (2.000.000đ), 1 bài Writing và 1 bài nộp, 12 bản ghi thông báo. Email gửi tới các địa chỉ `@e2e.test`/`@bounce.test` (Resend staging).
- Ngoại lệ về cách tạo: lớp "Điểm danh Hôm nay" tạo qua `POST /api/classes` bằng session đăng nhập thật (header `Origin` = web staging), vì UI chặn ngày bắt đầu không sau hôm nay (xem O1). Mọi bước khác qua UI.

## Bước 1. Đăng ký/đăng nhập + bootstrap org

- Kỳ vọng: tab "Create account" -> tạo tài khoản -> vào `/dashboard`, org được bootstrap, reload giữ phiên, đăng xuất rồi route bảo vệ về `/login?returnUrl=`, đăng nhập lại về `/dashboard`.
- Kết quả: đúng hết. Dashboard hiện sau ~3 giây, KPI 0, không có mục Credit/AI trong nav. Đăng xuất nằm ở trang Hồ sơ.
- Ảnh: `s1-01-login`, `s1-02-dashboard-after-signup`, `s1-03a-after-reload`, `s1-03-profile`, `s1-04-after-signout`, `s1-05-signed-in-again`.

## Bước 2. Lớp, học viên, enroll, syllabus, buổi học

- Syllabus: upload CSV `syllabus-import.v4.csv` -> preview "2 module · 5 buổi học" -> tạo, chi tiết đúng 2 module. Ảnh `s2-01`, `s2-02`.
- Lớp: T2+T5, 19:00-20:30, template syllabus, bắt đầu 2026-10-30, 5 buổi. Kỳ vọng buổi: 02/11, 05/11, 09/11, 12/11, 16/11 (Buổi 1-5, gắn Module 1/2). Kết quả đúng đủ 5 buổi, tiến độ 0/5. Ảnh `s2-03`..`s2-05`.
- Validation: ngày bắt đầu hôm nay bị chặn với "Vui lòng chọn ngày bắt đầu sau hôm nay." (ảnh `s2-03b-after-submit`).
- Học viên: giáo viên không có đường tạo học viên trực tiếp. Đường dùng: GV `/students` -> "Mời học viên" (email) -> học viên đăng ký trên cổng student (staging tự coi email đã xác minh, vào thẳng cổng) -> chuông thông báo -> "Chấp nhận" -> wizard onboarding -> portal. Sau đó GV vào lớp -> "+ Thêm học viên vào lớp" (trạng thái "Đã mời") -> "Kích hoạt" -> "Đang học", gói 5/5. Làm với 2 học viên. Ảnh `s2-06`..`s2-17`.
- Kết quả: PASS, trừ F1.

### F1. Buổi cuối sinh sai thứ khi ngày bắt đầu là thứ Năm (lỗi, chờ phân loại)
- Mô tả: lớp T2+T5, 5 buổi, bắt đầu Thứ Năm 05/11/2026 (tạo qua UI). Kỳ vọng: 05/11, 09/11, 12/11, 16/11, 19/11. Thực tế: 05/11, 09/11, 12/11, 16/11, **23/11 (Thứ Hai)**. Buổi thứ 5 nhảy qua Thứ Năm 19/11.
- Lặp lại: lớp "UAT Lớp Điểm danh Hôm nay" (T2+T5, bắt đầu Thứ Năm 29/10, 5 buổi) cũng ra 29/10, 02/11, 05/11, 09/11, **16/11** thay vì 12/11. Lớp bắt đầu thứ Sáu 30/10 (T2+T5) thì đúng. Dấu hiệu: lệch khi ngày đầu rơi vào thứ muộn hơn của tuần, buổi cuối bị lệch.
- Bằng chứng: ảnh `s2-18-bug-class-start-thursday.png`, và danh sách buổi lớp `f6c1e2ed` (`s3-09`/`s4-02` cho thấy 29/10, 02/11, 05/11, 09/11, 16/11).
- Mức độ: dữ liệu lịch sai ở buổi cuối, ảnh hưởng điểm danh/học phí theo buổi. Không chặn UAT nhưng nên phân loại trước release.

## Bước 3. Lịch Tháng/Tuần/Ngày + kỳ nghỉ

- Ba chế độ xem: Tháng, Tuần, Ngày render đúng (ảnh `s3-04`, `s3-05`, `s3-06`; mobile `vp-375-schedule-*`).
- Dời lịch (toàn tổ chức) 05/11: xem trước 2 dòng, "Dời sang Thứ 5, 19/11 · 19:00" cho cả hai lớp. Áp dụng: lớp "Writing 6.5" thành 6 dòng (05/11 "Nghỉ lễ - Đã dời lịch", buổi bù Thứ Năm 19/11 là Buổi 5), thẻ kỳ nghỉ hiện trên lịch tuần. Ảnh `s3-03`, `s3-07`..`s3-09`.
- Hoàn tác: dialog "Khôi phục 2 buổi gốc · Thu hồi 2 buổi bù"; sau đó 5 buổi nguyên trạng, 0 thẻ kỳ nghỉ. Ảnh `s3-10`.
- Hủy buổi (không bù) 09/11: xem trước "Đã hủy", buổi 09/11 thành "Đã hủy", không có buổi bù; hoàn tác trả buổi về "Sắp tới". Ảnh `s3-11`, `s3-12`.
- Kết quả: PASS. Nhật ký có 4 dòng "Nghỉ lễ" (2 học viên, mỗi học viên 2 dòng, ứng với hai lần áp dụng kỳ nghỉ). Tôi không xác minh từng dòng ứng với lần nào, và hoàn tác không thấy sinh thêm dòng.
- Lưu ý: lớp D (không học viên) không xuất hiện trong xem trước (chỉ lớp có học viên), phù hợp.

## Bước 4. Điểm danh

- Theo buổi: Lịch -> buổi 29/10 lớp "Điểm danh Hôm nay" -> hộp thoại buổi -> "Điểm danh" của Học Viên An -> An thành "Hoàn thành". Ảnh `s4-02`, `s4-03`.
- Theo ngày: `/attendance?date=2026-10-29` -> mở ca -> An đã "Có mặt" (đồng bộ với thao tác theo buổi), Bình chưa chọn -> "Đánh dấu tất cả Có mặt" -> "Lưu điểm danh ca học" -> "Đã điểm danh (2/2 có mặt)", đếm "Chưa điểm danh 0 / Đã điểm danh 1". Reload: cả hai vẫn "Có mặt". Ảnh `s4-04`..`s4-07`.
- Hệ quả khác: trang Doanh thu hiện gói An/Bình "1/5, còn 4".
- Kết quả: PASS.

## Bước 5. Học phí

- Tạo 2 khoản thu (An 2.000.000đ hạn 08/11; Bình 2.000.000đ hạn 25/10 quá hạn) qua "+ Tạo khoản thu". KPI: phải thu 4.000.000đ, đã thu 0đ, quá hạn 2.000.000đ/1 học viên. Ảnh `s5-01`..`s5-03`.
- Thu một phần An 500.000đ tiền mặt: dialog báo "còn nợ sau giao dịch 1.500.000đ"; sổ: đã thu 500.000đ, còn 1.500.000đ. Thu toàn bộ phần còn lại: "Đã thu đủ", tổng đã thu 2.000.000đ, bộ lọc "Đã thu đủ 1". Reload giữ nguyên. Ảnh `s5-04`..`s5-07`.
- Dòng thời gian An: Phải đóng 2.000.000đ, Đã thu 2.000.000đ, Còn nợ 0đ, 2 giao dịch (500.000đ, 1.500.000đ) + phát hành hóa đơn. Ảnh `s5-08`.
- Nhắc học phí: An (đã thu đủ) checkbox bị khóa; chọn Bình, xác nhận "Gửi nhắc học phí cho 1 học viên (1 hóa đơn còn nợ)?" -> "Đã gửi nhắc học phí cho 1 hóa đơn." Ảnh `s5-09`..`s5-11`.
- Trang Doanh thu: Đã thu 2.000.000đ, còn phải thu 2.000.000đ, 2 hóa đơn khớp sổ. Ảnh `s5-13`.
- Kết quả: PASS. Ghi chú O3, O4 bên dưới.

## Bước 6. Nhật ký thông báo

- `/notifications`: 12 bản ghi (Mời vào lớp, Nghỉ lễ, Hóa đơn học phí, Nhắc học phí), tất cả "Đã gửi", 0 Đang chờ, 0 Lỗi gửi. Bộ lọc nhóm sự kiện và trạng thái hoạt động; lọc "Lỗi gửi" -> "Không có thông báo nào phù hợp với bộ lọc." Ảnh `s5-12`, `s6-01`, `s6-02`.
- Không có nút "Gửi lại" trên dòng đã gửi (0 nút). API: `POST /api/notification-logs/:id/resend` trên dòng đã gửi trả `409 not_failed`; `POST /api/notification-logs/resend-failed` khi không có lỗi trả `200 {"requeued":0}`.
- Chưa kiểm: gửi lại/retry trên dòng thật sự lỗi. Địa chỉ `@bounce.test` (mailer local đánh dấu lỗi) KHÔNG sinh lỗi trên staging, nó ra "Đã gửi". Không có cách an toàn để ép lỗi gửi trên staging. Cần cách khác (ví dụ bật lỗi từ phía Resend hoặc kiểm bằng e2e local `notifications-ac-003`).
- Kết quả: PARTIAL.

## AI không lộ trên UI staging

- Điều hướng/nav giáo viên: Tổng quan, Điểm danh ngày, Lớp học, Học viên, Lịch dạy, Syllabus, Nhật ký thông báo, Bài tập, Chấm bài, Từ vựng, Doanh thu, Công nợ, Hồ sơ. Không có Credit/AI. Quét văn bản `/assignments`, `/assignments/new`, `/grading`, `/dashboard`, `/vocab`, `/profile`: không có "AI", "Credit", "Nhập đề" (chỉ "Bản nháp" là trạng thái đề, không liên quan AI).
- `/assignments`: chỉ "+ Tạo bài tập"; `/assignments/tests/new`: chỉ "Chọn từ ngân hàng", "Soạn mới", "Soát đáp án", "Xem trước", "Tạo bộ đề". Không có nút "Nhập đề AI".
- `/assignments/tests/import` điều hướng về `/assignments/tests/new`. Ảnh `ai-02`.
- Màn chấm bài: tạo bài Writing, giao lớp, học viên An nộp 400 từ, mở `/grading/<attempt>`: không có panel chấm nháp/AI/Credit (ảnh `ai-12`, `ai-13`). Giới hạn: không biết panel sẽ hiện ở đâu khi bật flag, nên đây là bằng chứng vắng mặt trên màn chấm chi tiết, không phải đảm bảo cho mọi trạng thái bài.
- Kết quả: PASS.

## Bước 4.3. 3 viewport + keyboard focus

- 10 màn x 3 viewport (dashboard, lớp, chi tiết lớp, lịch tuần, điểm danh, công nợ, doanh thu, học viên, nhật ký thông báo, syllabus) + lịch Tháng/Ngày ở 375: `scrollWidth <= clientWidth` ở cả 32 ca (không tràn ngang trang). Ảnh `vp-1440-*`, `vp-768-*`, `vp-375-*`.
- Keyboard: Tab 40 lần trên Công nợ, Điểm danh, Lịch, Chi tiết lớp, Nhật ký thông báo, Học viên: mọi điểm dừng có focus ring (box-shadow hoặc outline), 0 điểm dừng không nhìn thấy. Hộp thoại "Tạo khoản thu": Enter mở, focus vào hộp thoại, Esc đóng, focus quay về nút mở. Ảnh `kbd-*`.
- Chưa kiểm: theme tối, 320px (REVIEW.md có nhưng ngoài phạm vi yêu cầu).

## Console / HTTP lỗi

- 0 lỗi 500, 0 pageerror trên mọi luồng giáo viên.
- 403 `GET /api/student/me`, `/api/student/overview`, `/api/student/inbox` (mỗi cái 5 lần) trên cổng học viên khi tài khoản mới chưa được liên kết org (trước khi chấp nhận lời mời). Có thể là hành vi dự kiến nhưng sinh lỗi console đỏ; cần phân loại.
- 503 `GET /api/bank-link` khi mở `/profile` (SePay chưa cấu hình trên staging, đúng bảng gating). Console đỏ "Failed to load resource 503". Cần quyết định có chấp nhận hay để UI không gọi khi SePay tắt.

## Quan sát khác (không chắc là lỗi, chờ phân loại)

- O1. UI tạo lớp chặn ngày bắt đầu hôm nay, nên không thể tạo lớp có buổi hôm nay để điểm danh ngay từ UI. Có chủ ý ("sau hôm nay"), nhưng giáo viên mới không backfill được lớp đã chạy.
- O2. Lớp tạo không chọn "Trình độ" vẫn hiện "Band 7.0" ở danh sách lớp. Chưa xác minh mặc định nằm ở đâu.
- O3. Hóa đơn tạo từ "+ Tạo khoản thu" có loại "Khác" thay vì "Học phí" (dòng thời gian và bảng hóa đơn).
- O4. Trang Doanh thu gắn "Sắp hết" cho gói còn 4/5 buổi (cả hai học viên). Chưa rõ ngưỡng có chủ ý.
- O5. Công nợ ở 375px: bảng cuộn ngang trong thẻ, cột "Còn nợ", "Hạn đóng", nút "Thu" nằm ngoài khung nhìn đầu (ảnh `vp-375-debts`). Trang không tràn, nhưng thao tác Thu cần cuộn ngang.
- O6. Điểm danh ở 375px: nền trắng của vùng nội dung dừng ở khoảng 380px, phần dưới xám nhạt (ảnh `vp-375-attendance`). Thẩm mỹ.
- O7. Lúc chụp ngay sau khi bấm tên người dùng ở sidebar (điều hướng sang `/profile`), một ảnh chụp ra trắng hoàn toàn trong lúc chuyển trang; reload và chờ thì bình thường. Không lặp lại, đã bỏ ảnh đó.

## Giới hạn của lần chạy

- Chỉ Chromium headless. Chrome có giao diện và Safari private chưa kiểm (4.4 còn mở): CẦN NGƯỜI KIỂM SAFARI PRIVATE.
- Email thật: không đọc hộp thư, chỉ xác nhận trạng thái "Đã gửi" trong nhật ký.
- Thanh toán chuyển khoản/VietQR/SePay không thuộc phạm vi (SePay rỗng trên staging).
