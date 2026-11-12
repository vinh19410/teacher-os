# Sổ bằng chứng — leads

## §Endpoints

| Endpoint | Phương thức | Ai gọi được | Auth | Mã trả | Bằng chứng |
|---|---|---|---|---|---|
| `/public/leads` | POST | Khách (Origin phải thuộc allowlist) | Không (org đích từ cấu hình) | 201/400/403/413/429/503 | [S1] apps/server/src/routes/public-leads.ts:92-367 |
| `/public/leads` | OPTIONS | Trình duyệt (preflight) | Không | 204 + ACAO origin profile, không credentials | [S1] apps/server/src/routes/public-leads.ts:82-90; [S6] apps/server/src/routes/public-leads.test.ts:176-204 |
| `/api/leads` | GET | Thành viên org | Phiên + vai trò tài chính | 200/400/401/403 | [S2] apps/server/src/routes/leads.ts:64-142; [S10] apps/server/src/routes/kernel.ts:3505 |
| `/api/leads/:id` | PATCH | Thành viên org | Phiên + vai trò tài chính | 200/400/401/403/404 | [S2] apps/server/src/routes/leads.ts:144-187 |

Mount: kênh công khai ngoài `/api/*` (bootstrap middleware không chạy) [S9] apps/server/src/app.ts:424-427; CORS toàn cục được bỏ qua cho đúng đường này [S9] apps/server/src/app.ts:391-406. API quản lý trong vùng kernel, thừa hưởng guard Origin/CSRF [S10] apps/server/src/routes/kernel.ts:186-207, mount tại dòng 3505.

## §Validation (máy chủ)

| Trường | Luật | Bằng chứng |
|---|---|---|
| Họ tên | bắt buộc; cắt khoảng trắng; 2–80 ký tự | [S4] packages/api/src/lead-contracts.ts:10-11, 207 |
| Số điện thoại | bắt buộc; chuẩn hoá: chỉ chữ số, `84`→`0`; phải khớp `^0\d{9}$` | [S4] packages/api/src/lead-contracts.ts:161-169, 208-214 |
| Email | tuỳ chọn; rỗng → bỏ; tối đa 120; đúng khuôn dạng; bắt buộc khi nguồn = bài test | [S4] packages/api/src/lead-contracts.ts:12, 193-199, 228-236 |
| Ngày sinh | tuỳ chọn; `yyyy-mm-dd` là ngày thật; năm 1940..năm hiện tại (giờ VN) | [S4] packages/api/src/lead-contracts.ts:171-191 |
| Khoá / hình thức / cặp ngày / khung giờ | enum đóng (15 mã khoá, 3 hình thức, 5 cặp ngày, 6 khung giờ) | [S4] packages/api/src/lead-contracts.ts:21-129, 217-220 |
| Ghi chú | ≤ 500 ký tự | [S4] packages/api/src/lead-contracts.ts:13, 221 |
| Kết quả test | ≤ 300 ký tự | [S4] packages/api/src/lead-contracts.ts:14, 222; [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:221-223 |
| Nguồn | enum: `profile` hoặc `placement-test` | [S4] packages/api/src/lead-contracts.ts:146-148, 223 |
| Thời gian điền | số nguyên ≥ 0, bắt buộc | [S4] packages/api/src/lead-contracts.ts:225 |
| Trường bẫy | ≤ 80 ký tự, tuỳ chọn | [S4] packages/api/src/lead-contracts.ts:224 |
| Khoá lạ | schema `.strict()` — từ chối cả object | [S4] packages/api/src/lead-contracts.ts:226-227; [S5] packages/api/src/lead-contracts.test.ts:53-59 |
| Body | tối đa 4096 byte, kiểm cả header lẫn nội dung thật | [S1] apps/server/src/routes/public-leads.ts:39-40, 114-129 |
| Query danh sách | `q` ≤ 100; `status` enum; `page` số nguyên ≥ 1 (tự ép kiểu); `.strict()` | [S4] packages/api/src/lead-contracts.ts:16-17, 239-247 |
| Body PATCH | `status` enum bắt buộc; `teacherNote` ≤ 1000 tuỳ chọn; `.strict()` | [S4] packages/api/src/lead-contracts.ts:15, 249-256 |

Validation phía client trang công khai (tiền kiểm, cùng tinh thần):
tên/SĐT bắt buộc, email bắt buộc ở cổng bài test — [S19] apps/profile/public/index.html:1596-1622; [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:132-191; [S22] apps/profile/tests/index.test.mjs:67-79.

## §Errors (nguyên văn + throw-site)

Xem bảng đầy đủ trong `leads-reverse-spec.md` Mục 8.3. Bổ sung ngữ cảnh:

- ✅ 400 của kênh công khai trả `fields` = danh sách tên trường lỗi (đã khử
  trùng lặp), không kèm giá trị. [S1] apps/server/src/routes/public-leads.ts:134-156; [S6] apps/server/src/routes/public-leads.test.ts:206-221
- ✅ JSON không phân tích được cũng đi vào nhánh 400 `LEAD_INVALID` với danh
  sách trường rỗng. [S1] apps/server/src/routes/public-leads.ts:144-146
- ✅ 401/403/404 của API quản lý được web admin ánh xạ thành hành vi riêng
  (đăng nhập lại / toast / invalidate). [S12] apps/web/src/routes/_auth/leads/index.tsx:174-208
- ✅ Trang bài test phân loại lỗi máy chủ thành 3 nhóm: sai trường (đánh dấu
  từng ô), quá nhiều lượt (thông báo chờ), còn lại (thông báo bận).
  [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:250-284

## §Business Rules (tóm tắt có bằng chứng)

1. Fail-closed khi thiếu cấu hình org đích: 503, không ghi. [S1] apps/server/src/routes/public-leads.ts:95-102
2. Origin bắt buộc thuộc allowlist; thiếu header coi như sai. [S1] apps/server/src/routes/public-leads.ts:104-112
3. Trường bẫy + thời gian điền < 3 giây: 201 giả, không ghi, không thư. [S1] apps/server/src/routes/public-leads.ts:158-166
4. Tần suất theo địa chỉ mạng: ≤ 3 lượt / 10 phút; địa chỉ băm HMAC; vết rỗng thì bỏ kiểm này. [S1] apps/server/src/routes/public-leads.ts:26-29, 56-74, 170-174, 222-225
5. Trần ngày theo org: < 100 đăng ký mới trong ngày lịch VN; gộp trùng không tính. [S1] apps/server/src/routes/public-leads.ts:30-31, 226-229, 246
6. Gộp trùng theo SĐT 24 giờ/org: cập nhật dòng mới nhất, tối đa 5 lần, giữ tên/email gốc, không gửi thư lại. [S1] apps/server/src/routes/public-leads.ts:34-37, 247-290
7. Phân loại 429 theo thứ tự: tần suất mạng → trần ngày → ngưỡng gửi lại; kèm header thử lại 600 giây. [S1] apps/server/src/routes/public-leads.ts:292-329
8. Vai trò tài chính mới được đọc/sửa; org khác → 404 chung. [S2] apps/server/src/routes/leads.ts:30-37, 161-169
9. Không trả vết băm mạng cho client. [S2] apps/server/src/routes/leads.ts:38-62
10. Lỗi thư không đổi kết quả tiếp nhận. [S11] apps/server/src/lib/lead-notify.ts:16-22, 92-108

## §Entities

### lead (bảng `lead`, migration 0057)

20 cột — chi tiết trong `srs/leads-reverse-erd.md`. Bằng chứng schema:
[S3] packages/db/src/schema/lead.ts:15-60; migration: [S8] packages/db/src/migrations/0057_exotic_vulture.sql:1-27; đăng ký trong nhật ký migration: [S29] packages/db/src/migrations/meta/_journal.json:408.

### organization (khóa ngoại)

3 cột: id, name, created_at. [S30] packages/db/src/schema/organization.ts:3-10. Quan hệ: một tổ chức có nhiều đăng ký; xóa tổ chức xóa dây chuyền đăng ký. [S3] packages/db/src/schema/lead.ts:19-21

## §Cross-repo hops

| Từ | Đến | Nội dung hop | Bằng chứng |
|---|---|---|---|
| apps/server | packages/api | Hợp đồng zod + hằng danh mục + mã lỗi | [S1] apps/server/src/routes/public-leads.ts:1-5; [S2] apps/server/src/routes/leads.ts:1-8 |
| apps/server | packages/db | Schema bảng lead (drizzle) | [S2] apps/server/src/routes/leads.ts:10; [S3] packages/db/src/schema/lead.ts:15 |
| apps/server | packages/auth | Kiểm vai trò tài chính | [S2] apps/server/src/routes/leads.ts:9; [S11] apps/server/src/lib/lead-notify.ts:9; [S18] packages/auth/src/role.ts:85-89 |
| apps/server | packages/api | Ngày VN cho trần ngày | [S1] apps/server/src/routes/public-leads.ts:6; [S26] packages/api/src/vietnam-date.ts |
| apps/web | packages/api | Kiểu + nhãn danh mục cho màn quản lý | [S12] apps/web/src/routes/_auth/leads/index.tsx:7-17; [S14] apps/web/src/lib/repos/leads.ts:8-13 |
| apps/web | apps/server | Gọi `/api/leads` (fetch) | [S14] apps/web/src/lib/repos/leads.ts:26-70 |
| apps/profile | apps/server | POST `/public/leads` (landing + bài test) | [S19] apps/profile/public/index.html:1652-1662; [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1066-1078, 1490-1497 |
| apps/profile | packages/api | Danh mục khớp hợp đồng (bản sao JS thuần, chống drift bằng test) | [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:14-73; [S24] apps/server/src/lead-catalog-drift.test.ts:82-127 |
| packages/infra | apps/server | Biến môi trường org/origin/secret | [S27] apps/server/src/index.ts:168-176; [S28] packages/infra/alchemy.run.ts:125-140, 221-222 |

## §Gaps

Trỏ về `reverse-gaps.md` (10 OQ, 4 Gap, 4 Conflict, 5 Inferred, 6 Negative-search).
