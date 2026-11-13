# auth-student-signup — Câu hỏi mở, khoảng trống, mâu thuẫn

## Open Questions (OQ)

| ID | Câu hỏi | Vì sao mở | Ảnh hưởng |
|----|---------|-----------|-----------|
| OQ-1 | Chính sách mật khẩu phía server: tối thiểu 8 có được better-auth ép không, có yêu cầu chữ hoa/số không? | grep `minPassword|password` trong packages/auth/src/index.ts không thấy cấu hình; chỉ thấy client ≥8 | FR-026, BR-017, bảo mật tài khoản |
| OQ-2 | Thời gian sống phiên đăng nhập (session TTL)? | không thấy session.expiresIn trong repo | bảo mật, tần suất đăng nhập lại |
| OQ-3 | Gửi lại mail xác thực (/send-verification-email) có cooldown không? | OTP và forgot-password có 60s, đường verification không thấy | chống spam mail |
| OQ-4 | Đăng nhập Google lần đầu: emailVerified được đặt thế nào (Google trả verified không)? | không thấy mã xử lý; chỉ thấy khiếu nại gián tiếp qua gate STUDENT_EMAIL_UNVERIFIED | học viên Google có vào portal ngay được không |
| OQ-5 | Vì sao "org sớm nhất toàn cục (createdAt, id)" là đích đúng (org sớm nhất = trung tâm chính?) | code có chú thích kỹ thuật D2 (student-provisioning.ts:13) và PDR:23 nêu "earliest global org" nhưng thiếu lời giải thích nghiệp vụ | mọi học viên tự đăng ký sẽ vào org đó |
| OQ-6 | `POST /api/students` còn nghiệp vụ nào không? | PDR nói GV không còn tự tạo hồ sơ nhưng route+test vẫn tồn tại | phạm vi feature, Conflict C1 |
| OQ-7 | ~~Chỉ dùng staging?~~ ĐÃ GIẢI QUYẾT: packages/infra/src/topology.ts:140-149 (resolveAssumeEmailVerified) throw khi bật trên prod domain; apps/server/src/session.ts:20 ghi chú "staging QA only, infra blocks it on prod". Câu hỏi còn: guard có áp trên mọi đường deploy không? | negative-search ban đầu chỉ quét apps/server/src nên missed tầng infra | đã có chống chỉ định prod |
| OQ-8 | Học viên đổi email bằng đường nào? | các endpoint email-otp change-email bị chặn (packages/auth/src/index.ts:366-379); không thấy UI đổi email | FR tương lai, quy trình hỗ trợ |
| OQ-9 | STUDENT_ORIGINS có nhiều origin — cổng học viên chuẩn là origin nào? | parseCORSOrigins trả mảng, studentOrigin lấy phần tử đầu (apps/server/src/index.ts:166) | cấu hình mail link, callback |
| OQ-10 | Học viên có lời mời pending nhưng chưa accept: vào portal thấy gì? | provisioning bị skip; BE trả STUDENT_NOT_LINKED → màn lỗi "chưa liên kết" hướng về chuông thông báo | trải nghiệm lần đầu |
| OQ-11 | ~~Token hết hạn hiển thị gì?~~ ĐÃ GIẢI QUYẾT: nhánh không-success render "Liên kết không hoạt động" + "Liên kết xác thực không hợp lệ, đã được sử dụng hoặc đã hết hạn. Hãy yêu cầu liên kết mới hoặc đăng nhập để tiếp tục." kèm nút gửi lại (apps/student/src/components/auth/verify-email-view.tsx:94-104) | đọc lại view thấy nhánh else đầy đủ | không còn mở |
| OQ-12 | Signup/OTP có captcha hoặc chống abuse ngoài cooldown không? | grep không thấy captcha/turnstile/recaptcha | chống spam tài khoản |

## Gaps (code câm / nghi ngờ)

* Chính sách mật khẩu server — *(negative-search: grep `minPassword|passwordLength` trong packages/auth/src → 0 hit · loại: code-câm)*
* Session TTL + refresh — *(negative-search: grep `session` config trong packages/auth/src/index.ts → không thấy expiresIn · loại: code-câm)*
* Cooldown gửi lại mail xác thực — *(negative-search: cooldown chỉ thấy ở OTP 380-424 và forgot-password 60s · loại: code-câm)*
* emailVerified khi đăng nhập Google — *(negative-search: không thấy code set emailVerified cho social; phụ thuộc mặc định better-auth · loại: code-câm)*
* Chi tiết rate-limit OTP server-side (số lần thử tối đa) — *(chỉ thấy client bắt TOO_MANY_ATTEMPTS, không thấy ngưỡng cấu hình · loại: code-câm)*
* ~~Guard môi trường cho AUTH_ASSUME_EMAIL_VERIFIED~~ — ĐÃ GIẢI QUYẾT: guard ở packages/infra/src/topology.ts:140-149 (throw trên prod domain); negative-search cũ chỉ quét apps/server/src
* ~~Wording lỗi khi gửi lại mail xác thực thất bại ở UI~~ — ĐÃ GIẢI QUYẾT: student-error-view.tsx:67,78 "Không thể gửi lại email. Vui lòng thử lại sau."; verify-email-view.tsx:125 "Không gửi được email mới. Vui lòng thử lại." (nhãn test-skip cũ cũng sai — không có test skip nào liên quan)
* Điều kiện hiển thị org switcher (bao nhiêu org mới hiện) — *(GET /orgs có, ngưỡng UI chưa đọc được rõ · loại: code-câm)*

## Conflicts

* **C1** — docs/project-overview-pdr.md:23 "giáo viên không còn tự tạo hồ sơ học viên" vs apps/server/src/routes/kernel.ts:463-530 `POST /api/students` vẫn tạo hồ sơ + test apps/server/src/routes/student-auth-otp.test.ts:100 phủ kịch bản teacher pre-create. Không chọn bên — chờ BA quyết (OQ-6).
* **C2** — README.md:56-57 mô tả đăng nhập email/mật khẩu + Google, không nêu OTP email — trong khi OTP là tab mặc định của portal học viên (apps/student/src/routes/login.tsx:32-42). Đề xuất cập nhật README.

## Inferred (suy ra từ code, chưa có văn bản nghiệp vụ)

* Mô hình multi-org: học viên một email có thể thuộc nhiều org, có org switcher — suy từ GET /orgs + header x-student-org-id.
* Luồng lời mời (bell + accept) là đường "vào org thứ hai" — suy từ skip-provision khi pending + POST /invitations/:id/accept.
* phone/zalo/parentName/parentPhone để trống lúc tạo là chủ đích cho GV bổ sung sau — suy từ giá trị rỗng khi insert.
* Mailer log-only là fallback môi trường dev/staging khi chưa có Resend — suy từ mailer.ts.
* `?org=` và header đều được chấp nhận là cách chọn org — suy từ createStudentGuard 177-208.
