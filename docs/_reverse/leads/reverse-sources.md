# Nguồn bằng chứng — S1..S30 (liên tục)

Mỗi S-id một đường-dẫn; mọi trích dẫn `file:line` trong bộ tài liệu này đều
trỏ vào các file dưới đây và nằm trong giới hạn số dòng đã kiểm bằng `wc -l`.

- **S1** `apps/server/src/routes/public-leads.ts` (370 dòng) — Route tiếp nhận
  công khai. Hằng chống spam 26-40; deps 42-54; băm IP 56-74; CORS 79-90;
  handler POST 92-367: fail-closed 95-102, origin 104-112, giới hạn body
  114-129, validation 131-156, trường bẫy + thời gian 158-166, lấy IP 170-174,
  INSERT nguyên tử 176-237, UPDATE gộp trùng 239-290, phân loại 429 292-329,
  email nền 331-366.
- **S2** `apps/server/src/routes/leads.ts` (190 dòng) — API quản lý. Guard vai
  trò 30-37; ánh xạ dòng → wire (bỏ vết băm) 38-62; GET danh sách 64-142
  (escape mẫu 82-90, đếm chip 92-131); PATCH 144-187 (404 org khác 161-169,
  mốc đổi trạng thái 171-179).
- **S3** `packages/db/src/schema/lead.ts` (60 dòng) — Bảng `lead`: enum trạng
  thái 7; nhận định độc lập với học viên 9-14; 20 cột 15-46; 3 chỉ mục 47-59.
- **S4** `packages/api/src/lead-contracts.ts` (288 dòng) — Hợp đồng dùng chung.
  Hằng độ dài 10-17; danh mục khoá + nhãn + nhóm 19-82; hình thức 84-97; cặp
  ngày 99-109; khung giờ 111-129; trạng thái + nhãn 131-144; nguồn 146-148; mã
  lỗi 150-159; chuẩn hoá SĐT 161-169; ngày sinh 171-191; email 193-199; schema
  gửi 201-237; query 239-247; patch 249-256; dòng trả client 258-279; response
  danh sách 281-288.
- **S5** `packages/api/src/lead-contracts.test.ts` (251 dòng) — Test hợp đồng:
  chuẩn hoá SĐT 22-40; schema gửi 42-196 (khoá lạ 53-59, email theo nguồn
  144-195); query/patch 198-230; drift nhãn 232-251.
- **S6** `apps/server/src/routes/public-leads.test.ts` (636 dòng) — Test route
  công khai: seed deps 62-76; tạo mới 110-150; fail-closed 152-161; origin
  163-204; validation 206-221; 413 223-229; trường bẫy 231-247; tần suất IP
  249-270; trần ngày 272-290; gộp trùng 292-356; email 358-405; song song
  407-496; chống lách vết băm 498-524; luồng bài test 526-635.
- **S7** `apps/server/src/routes/leads.test.ts` (366 dòng) — Test API quản lý:
  danh sách + không lộ vết 138-171; lọc + đếm 173-208; phân trang 210-237;
  401/400 239-251; guard vai trò 253-269; PATCH 272-365.
- **S8** `packages/db/src/migrations/0057_exotic_vulture.sql` (27 dòng) — Tạo
  bảng `lead` (20 cột, khóa ngoại org xóa dây chuyền) + 3 chỉ mục.
- **S9** `apps/server/src/app.ts` (481 dòng) — Deps lead 168-190; bỏ qua CORS
  toàn cục cho đường công khai 391-406; mount `/public/leads` 424-427; mount
  `/api` = kernel 478.
- **S10** `apps/server/src/routes/kernel.ts` (3523 dòng) — Guard Origin/CSRF
  vùng API 186-207; mount `/leads` 3505.
- **S11** `apps/server/src/lib/lead-notify.ts` (109 dòng) — Thiết kế không PII
  16-22; người nhận theo vai trò tài chính 42-61; nội dung thư 63-91; gửi nền
  nuốt lỗi 92-108.
- **S12** `apps/web/src/routes/_auth/leads/index.tsx` (603 dòng) — Màn quản lý:
  shape search 45-114; chip + màu trạng thái 84-101; guard quyền 148-172; PATCH
  mutation + toast 180-208; bảng + liên kết Zalo 357-423; phân trang 426-464;
  modal chi tiết 488-603.
- **S13** `apps/web/src/routes/_auth/leads/index.test.tsx` (271 dòng) — Test
  màn: chuẩn hoá search 132-142; hiển thị 144-166; URL/debounce 167-185; modal
  + PATCH 186-236; empty state 237-248; 401 249-264; ẩn theo quyền 265-271.
- **S14** `apps/web/src/lib/repos/leads.ts` (70 dòng) — Gọi API phía web: fetch
  danh sách 26-52; PATCH 54-70; query key 19-24.
- **S15** `apps/web/src/components/layout/sidebar.tsx` (214 dòng) — Mục menu
  "Đăng ký mới" 51-52; bảng khoá quyền tài chính 128-134; lọc menu theo quyền
  136-146; ánh xạ active 190-196.
- **S16** `apps/web/src/lib/use-finance-route-guard.ts` (31 dòng) — Chặn route
  thiếu quyền: toast + điều hướng về trang chính 12-31.
- **S17** `apps/web/src/routes-matcher.ts` (154 dòng) — Route `/leads` hợp lệ
  trong web admin 28-29.
- **S18** `packages/auth/src/role.ts` (177 dòng) — Nhóm vai trò tài chính
  78-89; hàm kiểm 85-89.
- **S19** `apps/profile/public/index.html` (1782 dòng) — Thẻ meta điểm API 9;
  hộp thành công 1272; hộp fallback Zalo 1282-1292; form + trường bẫy
  1294-1303; bản đồ khoá cũ→mới + khoá nháp 1490-1533; khôi phục + map 1555-1583;
  kiểm client tên/SĐT 1596-1622; submit + payload + endpoint 1623-1662; thành
  công 1663-1688; fallback lỗi 1689-1712.
- **S20** `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` (284 dòng) — Hằng
  client 8-12; danh mục khớp hợp đồng 14-73; chuẩn hoá SĐT 75-85; ngày sinh
  87-122; validate cổng 124-191; dựng payload đồng bộ 193-248; ánh xạ thông
  điệp lỗi 250-284.
- **S21** `apps/profile/public/kiem-tra-dau-vao/test.js` (1826 dòng) — Nộp cổng
  thông tin 1029-1135 (payload 1053-1060, fetch + timeout 1066-1078, thành công
  1079-1090, ánh xạ lỗi 1091-1133); đồng bộ điểm sau chấm 1478-1512.
- **S22** `apps/profile/tests/index.test.mjs` (556 dòng) — Meta điểm API 47-55,
  404-463; form 2 trường bắt buộc 67-79; trường bẫy ẩn 81-86.
- **S23** `apps/profile/tests/placement-test.test.mjs` (410 dòng) — Meta 108,
  180-257; payload luôn gắn nguồn bài test + cắt kết quả 343-361.
- **S24** `apps/server/src/lead-catalog-drift.test.ts` (128 dòng) — Landing chỉ
  4 khoá rút gọn 37-52; nút chọn khoá 54-62; đề bài test khớp danh mục 64-80;
  cổng bài test khớp chính xác danh mục + hình thức 82-127.
- **S25** `apps/e2e/specs/profile-lead-intake.spec.ts` (286 dòng) — Kịch bản
  E2E toàn tuyến: AC-001 108; AC-002 gộp trùng 172; AC-003 trường bẫy + tần suất
  + fallback Zalo 207; cấu hình org/origin e2e 15-17; xoá vết băm giữa các lần
  chạy 53-60.
- **S26** `packages/api/src/vietnam-date.ts` — Ngày hiện tại theo múi giờ Việt
  Nam bằng Intl parts, dùng để xác định "một ngày" cho trần số lượng.
- **S27** `apps/server/src/index.ts` (177 dòng) — Nối env: mã org đích, origin
  profile, secret băm tái dùng secret xác thực, origin app cho liên kết email
  168-176.
- **S28** `packages/infra/alchemy.run.ts` (428 dòng) — Mặc định hạ tầng: mã org
  đích không có default (rỗng = tắt) 125-128; origin profile mặc định theo stage
  130-140; bơm vào deploy 221-222.
- **S29** `packages/db/src/migrations/meta/_journal.json` (488 dòng) — Bản ghi
  migration 0057 ở dòng 408.
- **S30** `packages/db/src/schema/organization.ts` (10 dòng) — Bảng tổ chức:
  3 cột (id, name, created_at).
