# Brainstorm: Form đăng ký học trên apps/profile

Ngày: 2026-10-30 · Trạng thái: contract đã chốt, chờ plan

## Hiện trạng (đã kiểm chứng)

- `apps/profile/public/index.html` (#dang-ky-tu-van, script ~dòng 3098): form `consultForm` **không lưu đi đâu** — chỉ ghép text rồi copy clipboard, nhờ học viên tự dán vào Zalo. Học viên không dán là mất lead.
- Trường trên trang: Tên*, SĐT*, Lộ trình (3 lộ trình marketing + "Chưa rõ"), Hình thức lớp, Mục tiêu. Thiếu email, ngày sinh, ngày học, khung giờ.
- Quiz đầu vào trên trang (`placementQuizForm`) đã đổ kết quả vào form qua `applyQuizToFormBtn`.
- Google Form cũ (`forms.gle/9e7KB9Xjf5ujMhvZA`), 3 trang:
  - Trang 1: Họ tên*, Email*, SĐT Zalo*, Ngày sinh*; khóa IELTS (Foundation 0–3.0 / First Step 3.0–3.5 / Pre IELTS 4.0–4.5 / Advanced 5.0–7.5+ / Speaking & Writing cấp tốc / Cấp tốc 1 kỹ năng / Khác) và Giao tiếp 1–5 là **hai câu radio tách rời, không bắt buộc** → có thể chọn cả hai hoặc không chọn gì; Ngày học* (MT/TF/WS/SS/Khác); Khung giờ* (9:00, 13:30, 15:45, 18:15, 20:00 / Khác).
  - Trang 2 (lớp giao tiếp): link test examenglish Grammar + Listening, ô điền kết quả — **câu hỏi bị lặp** (2 ô riêng + 1 ô gộp).
  - Trang 3: thông tin chuyển khoản TPBank + Facebook.
- teacher-os chưa có intake lead công khai. Tiền lệ route không cần đăng nhập: `app.route("/public/pay", …)` trong `apps/server/src/app.ts`. Chưa có rate limit / chống spam nào trong server. `lib/payment-instructions.ts` + `@teacher-os/api/lib/vietqr` đã sinh được VietQR.
- `apps/profile` chưa deploy, chưa commit (untracked).

## Quyết định của người dùng

1. Lưu trữ: **endpoint mới trong teacher-os** (không POST sang Google Form, không chỉ copy Zalo).
2. Danh mục khóa: **theo Google Form** (lớp thật), gộp thành một lựa chọn có nhóm.
3. Bắt buộc: **chỉ Tên + SĐT Zalo**.

## Contract

**Outcome:** Học viên điền form trên trang profile trong < 1 phút; mỗi lần gửi tạo một bản ghi đăng ký (lead) trong teacher-os thuộc org của cô Mỹ; giáo viên xem và xử lý danh sách đăng ký trong app web (teacher). Sau khi gửi, học viên thấy màn hình xác nhận kèm bước tiếp theo (Zalo, thông tin chuyển khoản/VietQR).

**Constraints:**
- Endpoint công khai, không đăng nhập → bắt buộc chống spam: honeypot + giới hạn tần suất theo IP (băm) + giới hạn độ dài/whitelist giá trị enum ở server; CORS chỉ mở cho origin profile.
- Org đích cấu hình qua env (không tin `orgId` từ client).
- Schema mới qua migration Drizzle; backup DB trước khi migrate theo rule repo.
- Profile giữ zero-dependency, zero-framework; test `node --test` hiện có phải xanh (không `<script src>` ngoài).
- Dữ liệu cá nhân (SĐT, email, ngày sinh): không log thô (dùng `log-redaction`), không đưa vào URL.
- UI web theo `DESIGN.md`, chip-filter/URL filter như `/assignments`; verify 3 viewport.

**Non-goals:**
- Không tự động tạo `student`/`enrollment` từ lead (chỉ có thể thêm nút "chuyển thành học viên" nếu plan thấy rẻ — mặc định để sau).
- Không thanh toán online/đối soát cho lead (chỉ hiển thị thông tin chuyển khoản tĩnh/VietQR).
- Không sửa hay tắt Google Form cũ; không migrate dữ liệu Sheet cũ.
- Không deploy apps/profile trong phạm vi này (chỉ cấu hình URL API qua biến build).
- Không thay quiz đầu vào trên trang.

**Acceptance criteria:**
1. Form profile có: Tên*, SĐT Zalo* (chuẩn hóa VN, `inputmode="tel"`, `autocomplete`), Email, Ngày sinh, Khóa học (dropdown nhóm IELTS / Giao tiếp 1–5 / "Chưa rõ – cần test 1-1"), Ngày học (MT/TF/WS/SS/Linh hoạt), Khung giờ (5 khung + Linh hoạt), Ghi chú/mục tiêu, kết quả test (tự điền từ quiz trên trang; ô tùy chọn cho kết quả examenglish, không lặp).
2. Bỏ trống mọi trường trừ Tên + SĐT vẫn gửi thành công; lỗi validate hiện tại chỗ, focus vào trường lỗi đầu tiên.
3. `POST` hợp lệ → 201 và một dòng lead trong DB đúng org cấu hình; honeypot có giá trị → bị bỏ (trả 2xx giả, không ghi); vượt ngưỡng tần suất → 429; giá trị enum lạ → 400.
4. Mất mạng/API lỗi → form không mất dữ liệu đã nhập và đưa phương án dự phòng copy + mở Zalo (giữ hành vi cũ làm fallback).
5. Màn hình thành công: tóm tắt đăng ký, nút Zalo, thông tin chuyển khoản (+ VietQR nếu lấy từ org bank link được).
6. App web có trang danh sách đăng ký: lọc trạng thái (mới / đã liên hệ / đã ghi danh / bỏ) qua URL, đổi trạng thái, xem chi tiết; chỉ thành viên org thấy.
7. Test server cho route công khai (happy path, honeypot, 429, 400, CORS) + test profile + e2e luồng gửi → thấy trong web; `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` xanh.

## Trade-offs

- **Endpoint teacher-os (đã chọn)** — phụ thuộc nhiều nhất vào giả định: profile sẽ được deploy cùng hạ tầng Cloudflare và gọi được API production. Hỏng đầu tiên khi: chưa deploy API/CORS cho domain profile → form không gửi được (đỡ bằng fallback Zalo ở tiêu chí 4). Đổi lại lead nằm cạnh học viên/lớp, sau này chuyển thành học viên không cần nhập lại.
- **POST vào Google Form** — giả định endpoint `formResponse` của Google ổn định; hỏng đầu tiên khi Google đổi/chặn hoặc khi ai đó sửa câu hỏi bắt buộc trong Form (bị từ chối âm thầm, response opaque không xác nhận được). Rẻ nhất nhưng không tích hợp.
- **Chỉ copy Zalo** — giả định học viên luôn dán gửi; hỏng ngay khi học viên bỏ ngang → mất lead (tình trạng hiện tại).

Better approaches: none — hướng người dùng chọn phù hợp với mục tiêu tích hợp; rủi ro chính (chưa deploy) đã có fallback.

## Domain & CORS (cập nhật 2026-10-30)

- Profile chạy production tại `https://msmy.io.vn`; API ở `api.teacheros.io.vn` → **khác site**, gọi cross-origin.
- **Không** thêm msmy.io.vn vào `CORS_ORIGIN` chung: biến đó cũng nuôi better-auth `trustedOrigins` và bị `alchemy.run.ts` kiểm theo topology. Dùng biến riêng `PUBLIC_LEAD_ORIGINS` (mặc định `https://msmy.io.vn,https://www.msmy.io.vn`) và CORS **chỉ gắn trên route lead**, không gửi credentials/cookie.
- Profile đọc URL API từ cấu hình build (prod `https://api.teacheros.io.vn`, dev `http://localhost:8000`).

## Chống spam (đề xuất đã chọn hướng)

Lớp 1 + 2 làm ngay, lớp 3 chỉ bật khi có bằng chứng spam.

1. **Lọc rẻ ở form + server:** honeypot ẩn; thời gian điền tối thiểu ~3 giây (timestamp lúc render gửi kèm); whitelist enum khóa/ngày/giờ; giới hạn độ dài; SĐT VN 10 số (chuẩn hóa `+84`→`0`); body ≤ 4 KB. Bot dính honeypot/quá nhanh nhận 201 giả, không ghi DB.
2. **Giới hạn tần suất bằng chính bảng lead trong D1:** lưu `ip_hash = SHA-256(CF-Connecting-IP + secret)` (không lưu IP thô). Trước khi ghi: ≤ 3 lần/IP/10 phút, cùng SĐT trong 24 giờ thì cập nhật bản ghi cũ thay vì tạo mới, trần toàn hệ thống ~100 lead/ngày làm cầu dao. Vượt → 429, form chuyển sang fallback Zalo. Chọn D1 thay vì Workers Rate Limiting binding vì e2e boot Hono trên libsql (không có binding Cloudflare) — cách này test được ở mọi môi trường và không thêm bảng mới.
3. **Cloudflare Turnstile (tùy chọn):** thêm khi lớp 1–2 không đủ. Cần script ngoài `challenges.cloudflare.com` (phải nới test "no external script" của profile), site key + secret. Bỏ ngỏ trong phạm vi này.

Bổ trợ ngoài code (tùy chọn): một rule WAF rate limiting trên zone teacheros cho path `/public/leads`.

## Rủi ro còn mở

- Chưa biết msmy.io.vn có dùng `www` không → mặc định cho phép cả hai.
