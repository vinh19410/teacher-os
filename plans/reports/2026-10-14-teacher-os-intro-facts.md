# Facts report — video giới thiệu Teacher OS

Video: 60s, VO tiếng Việt, master 1920×1080 + edition 9:16. Project: `assets/videos/teacher-os-intro/`.

Mọi fact trên màn hình phải trace được về một trong các nguồn sơ cấp dưới đây.

## Định vị sản phẩm

| Fact | Nguồn |
|---|---|
| Tên: Teacher OS — "Run your teaching business from one workspace" | `apps/landing/public/index.html` (title, hero h1) |
| Đối tượng: giáo viên IELTS tự do và trung tâm nhỏ (2–10 giáo viên) | landing hero lead + FAQ "Who is it for?" |
| Tagline: "The operations layer for teachers who still want to teach." | landing footer |
| 6 module, cùng một roster: lớp học, syllabus & bài giảng, ngân hàng đề + chấm tự động, hoá đơn, báo cáo tiến độ, thông báo & feedback | landing section #features (feat-grid) |
| Cách bắt đầu 3 bước: tạo workspace → nhân bản syllabus thành lớp → dạy/chấm/hoá đơn trên một dashboard | landing section #how-it-works (step-grid) |
| Beta miễn phí, giữ founder pricing, không cần thẻ | landing #pricing |
| Domain: teacheros.io.vn | landing canonical + og:url |

## Pain points (scene hook)

| Fact | Nguồn |
|---|---|
| Lịch học nằm rải rác: calendar, sổ tay, nhóm chat | landing #problem, card "Schedules scattered across tools" |
| Chấm bài và xuất hoá đơn bằng tay: bài Writing nằm trong Drive, thông tin ngân hàng trong sheet | landing #problem, card "Grading and invoicing by hand" |
| Học viên/phụ huynh phải hỏi ngược tiến độ | landing #problem, card "Students chasing updates" |

## Tính năng nói trong video (kèm bằng chứng code, không chỉ marketing)

| Fact | Nguồn |
|---|---|
| Syllabus template nhân bản vào lớp, track tiến độ từng buổi | landing feature card 2; `docs/project-overview-pdr.md` (durable decisions về syllabus/lesson) |
| Ngân hàng đề IELTS 4 kỹ năng có đáp án (`assignment_prompt` org-scoped); giao đề snapshot thành `class_assignment` | `docs/project-overview-pdr.md` durable decision #8 |
| Quiz chấm server-side, học viên làm qua portal (`quiz_attempt`), speaking nộp file audio/video | PDR durable decisions #10, #11 |
| Màn chấm Writing: prompt + bài học viên + key + band điểm (TR/CC/LR/GRA → Overall) một màn hình | landing #product-deep-dive (grade-frame mockup) |
| Hoá đơn theo học viên + trạng thái đã thu/còn lại; tuition summary 3 thẻ | landing feature card 4; issue #347/#340 đã ship (memory, code `rosterDebtByStudent`) |
| Đối soát chuyển khoản tự động (SePay/BankHub webhook) | memory `sepay-bankhub-320-shipped-beta`; panel ở /profile (issue #338) |
| Student portal: học viên tự đăng ký, nộp bài, nhận thông báo, xem điểm | landing FAQ "Do students need accounts?"; PDR "Student Multi-Org and Invitation Model" |
| Báo cáo tiến độ per-student/per-class, band history | landing feature card 5 |

## Con số proof (scene stats)

Landing section proof-row: **1,200+ classes managed · 8,500+ assignments graded · 40+ syllabus templates · 4 skills in the IELTS bank**.

Đây là marketing copy do chủ sản phẩm công bố trên landing chính thức — được phép dùng làm số trên màn hình, ghi nguồn landing. Không tự sáng tạo con số khác.

## Cần tránh

- Không nói "hơn X giáo viên đang dùng" (không có nguồn).
- Không hứa ngày ra mắt chính thức (landing chỉ nói waitlist/beta).
- Không dùng logo/font/asset thương hiệu nào; màu accent `#0071e3` của landing chỉ tham khảo palette.
