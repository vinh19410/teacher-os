---
title: "SRS đảo-ngược — Tiếp nhận & quản lý khách hàng tiềm năng (leads)"
status: draft
mode: reverse-engineering
source_commit: "d6c0f6b5"
generated: "2026-11-12"
confidence_summary: "✅83 🔵3 🟡8 (trong spec; toàn bộ 13 file: ✅83 🔵3 🟡8 — đếm theo luật batch sau audit) — OQ 10"
companion:
  - reverse-sources.md
  - reverse-gaps.md
  - _evidence.md
  - srs/leads-reverse-flows.md
  - srs/leads-reverse-states.md
  - srs/leads-reverse-erd.md
  - usecases/leads-reverse-usecase-index.md
---

# SRS đảo-ngược — Tiếp nhận & quản lý khách hàng tiềm năng (leads)

Tài liệu tái tạo yêu cầu từ source code tại commit `d6c0f6b5` (nhánh `develop`).
Mọi khẳng định mang nhãn độ tin cậy và trỏ về dòng code làm bằng chứng; các câu
hỏi chưa chắc đưa vào `reverse-gaps.md` thay vì suy diễn.

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## Mục 0 — Nguồn bằng chứng & dấu vết

| S-id | Đường-dẫn | Vai trò trong đặc tả | Dòng kiểm (`wc -l`) |
|---|---|---|---|
| S1 | apps/server/src/routes/public-leads.ts | Route tiếp nhận công khai + toàn bộ chống spam | 370 |
| S2 | apps/server/src/routes/leads.ts | API quản lý lead nội bộ (danh sách + cập nhật) | 190 |
| S3 | packages/db/src/schema/lead.ts | Bảng dữ liệu lead | 60 |
| S4 | packages/api/src/lead-contracts.ts | Hợp đồng dữ liệu dùng chung (validation + danh mục + mã lỗi) | 288 |
| S5 | packages/api/src/lead-contracts.test.ts | Test hợp đồng dữ liệu | 251 |
| S6 | apps/server/src/routes/public-leads.test.ts | Test route công khai (kể cả song song) | 636 |
| S7 | apps/server/src/routes/leads.test.ts | Test API quản lý | 366 |
| S8 | packages/db/src/migrations/0057_exotic_vulture.sql | Migration tạo bảng lead | 27 |
| S9 | apps/server/src/app.ts | Ghép route công khai ngoài vùng API + CORS riêng | 481 |
| S10 | apps/server/src/routes/kernel.ts | Vùng API nội bộ: guard Origin + mount /leads | 3523 |
| S11 | apps/server/src/lib/lead-notify.ts | Email báo lead mới | 109 |
| S12 | apps/web/src/routes/_auth/leads/index.tsx | Màn quản lý "Đăng ký mới" trên web admin | 603 |
| S13 | apps/web/src/routes/_auth/leads/index.test.tsx | Test màn quản lý | 271 |
| S14 | apps/web/src/lib/repos/leads.ts | Lớp gọi API phía web admin | 70 |
| S15 | apps/web/src/components/layout/sidebar.tsx | Điều hướng menu + ẩn mục theo quyền | 214 |
| S16 | apps/web/src/lib/use-finance-route-guard.ts | Chặn route theo quyền tài chính | 31 |
| S17 | apps/web/src/routes-matcher.ts | Danh sách route hợp lệ web admin | 154 |
| S18 | packages/auth/src/role.ts | Định nghĩa nhóm vai trò được quyền tài chính | 177 |
| S19 | apps/profile/public/index.html | Trang landing công khai chứa form đăng ký | 1782 |
| S20 | apps/profile/public/kiem-tra-dau-vao/lead-gate.js | Module cổng thông tin + dựng payload gửi bài test | 284 |
| S21 | apps/profile/public/kiem-tra-dau-vao/test.js | Trang bài kiểm tra đầu vào công khai | 1826 |
| S22 | apps/profile/tests/index.test.mjs | Test trang landing (honeypot, form bắt buộc) | 556 |
| S23 | apps/profile/tests/placement-test.test.mjs | Test cổng bài test + payload đồng bộ điểm | 410 |
| S24 | apps/server/src/lead-catalog-drift.test.ts | Test chống lệch danh mục giữa landing và hợp đồng | 128 |
| S25 | apps/e2e/specs/profile-lead-intake.spec.ts | E2E toàn tuyến form → quản lý | 286 |
| S26 | packages/api/src/vietnam-date.ts | Ngày hiện tại theo múi giờ Việt Nam | — (tiện ích chung) |
| S27 | apps/server/src/index.ts | Nối biến môi trường vào phụ ứng dụng | 177 |
| S28 | packages/infra/alchemy.run.ts | Cấu hình hạ tầng: mặc định org đích + origin | 428 |
| S29 | packages/db/src/migrations/meta/_journal.json | Nhật ký migration (bản ghi 0057) | 488 |
| S30 | packages/db/src/schema/organization.ts | Bảng tổ chức (khóa ngoại của lead) | 10 |

Sổ bằng chứng chi tiết (endpoint, validation, lỗi, thực thể): `_evidence.md`.

## Mục 1 — Tổng quan & mục tiêu

Tính năng tiếp nhận khách hàng tiềm năng cho phép người lạ để lại thông tin
đăng ký học qua trang landing công khai và qua cổng bài kiểm tra đầu vào, không
cần tạo tài khoản; trung tâm xem, lọc, liên hệ lại và đánh dấu tiến trình của
từng đăng ký trên ứng dụng quản lý.

- ✅ Khách truy cập gửi thông tin đăng ký từ trang landing công khai, máy chủ ghi
  vào sổ đăng ký chung của trung tâm. [S1] apps/server/src/routes/public-leads.ts:92-366
- ✅ Trang landing công khai là một ứng dụng tĩnh riêng, gửi dữ liệu thẳng tới
  điểm tiếp nhận của máy chủ qua giao thức HTTP. [S19] apps/profile/public/index.html:1652-1662
- ✅ Nhân viên trung tâm quản lý các đăng ký trên màn "Đăng ký mới" của ứng dụng
  web nội bộ. [S12] apps/web/src/routes/_auth/leads/index.tsx:286-293
- ✅ Đăng ký là một đối tượng độc lập với hồ sơ học viên: có vòng đời riêng và
  không được cấp tài khoản cổng học viên khi tạo. [S3] packages/db/src/schema/lead.ts:9-14; [S4] packages/api/src/lead-contracts.ts:4-8
- 🟡 Mục tiêu kinh doanh dài hạn sau khi một đăng ký được đánh dấu "đã ghi danh"
  chưa được code trả lời: không có bước chuyển thành hồ sơ học viên tự động —
  xem OQ-L01.

## Mục 2 — Phạm vi

### 2.1 Trong phạm vi

- ✅ Form đăng ký công khai trên trang landing: nhận họ tên, số điện thoại và
  các lựa chọn tuỳ chọn; hiển thị màn thành công kèm nút nhắn Zalo. [S19] apps/profile/public/index.html:1294-1320, 1667-1682
- ✅ Cổng bài kiểm tra đầu vào công khai: thu thông tin cá nhân (email bắt
  buộc) trước khi vào bài, chấm bài ngay trên trình duyệt và gửi kết quả về
  đăng ký đã có. [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:132-191, 206-248; [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1053-1122
- ✅ Bộ chống spam tự vận hành ở máy chủ: trường bẫy ẩn, thời gian điền tối
  thiểu, giới hạn tần suất theo địa chỉ mạng, trần số lượng trong ngày, và gộp
  trùng theo số điện thoại. [S1] apps/server/src/routes/public-leads.ts:26-40, 158-166, 194-330
- ✅ Màn quản lý đăng ký: tìm kiếm theo tên/số điện thoại, lọc theo trạng thái
  kèm số đếm, phân trang, xem chi tiết, đổi trạng thái, ghi chú nội bộ. [S12] apps/web/src/routes/_auth/leads/index.tsx:286-485
- ✅ Email thông báo đăng ký mới cho thành viên có quyền tài chính của trung
  tâm. [S11] apps/server/src/lib/lead-notify.ts:23-109

### 2.2 Ngoài phạm vi (code không có)

- ✅ Không có chức năng xóa một đăng ký — API quản lý chỉ có xem danh sách và
  cập nhật; tìm kiếm toàn vùng mã nguồn không thấy lệnh xóa. (negative-search NS-L01, `reverse-gaps.md`) [S2] apps/server/src/routes/leads.ts:64-187
- ✅ Không có chuyển đổi tự động đăng ký thành hồ sơ học viên; đánh dấu "đã ghi
  danh" chỉ là nhãn trạng thái. (negative-search NS-L02) [S4] packages/api/src/lead-contracts.ts:131-144
- ✅ Không có form đăng ký nào trong ứng dụng học viên; ứng dụng học viên không
  đụng đến tính năng này. (negative-search NS-L03) [S17] apps/web/src/routes-matcher.ts:28-29
- 🟡 Việc xuất dữ liệu đăng ký (báo cáo, danh sách gọi lại ngoài hệ thống) không
  thấy trong code — xem OQ-L09.

## Mục 3 — Thuật ngữ & vai trò

| Thuật ngữ | Nghĩa trong đặc tả này |
|---|---|
| Đăng ký (lead) | Bản ghi thông tin khách tiềm năng do khách tự điền ở kênh công khai. [S3] packages/db/src/schema/lead.ts:9-14 |
| Trang landing | Trang giới thiệu công khai của trung tâm, chứa form đăng ký. [S19] apps/profile/public/index.html:1294 |
| Cổng bài kiểm tra đầu vào | Trang công khai cho phép làm bài test xếp lớp sau khi để lại thông tin. [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1-40 |
| Trường bẫy (honeypot) | Ô nhập ẩn mà người thật không thấy; bot điền vào sẽ bị gạt. [S19] apps/profile/public/index.html:1299-1303 |
| Vai trò tài chính | Nhóm vai trò được xem số tiền và đăng ký: giáo viên độc lập, chủ trung tâm, quản trị viên. [S18] packages/auth/src/role.ts:78-89 |
| Gộp trùng (dedupe) | Cùng số điện thoại gửi lại trong 24 giờ thì cập nhật bản cũ thay vì tạo dòng mới. [S1] apps/server/src/routes/public-leads.ts:34-37 |

Vai trò và quyền thấy gì:

- ✅ Ba vai trò tài chính (giáo viên độc lập, chủ trung tâm, quản trị viên) được
  đọc và sửa đăng ký; trợ giảng và giáo viên đứng lớp bị từ chối. [S18] packages/auth/src/role.ts:78-89; [S2] apps/server/src/routes/leads.ts:30-37
- ✅ Khách chưa đăng nhập chỉ gửi được qua kênh công khai; mọi API quản lý đòi
  phiên đăng nhập. [S2] apps/server/src/routes/leads.ts:30-37
- ✅ Danh sách email nhận thông báo đăng ký mới lọc đúng theo nhóm vai trò tài
  chính của từng thành viên trung tâm. [S11] apps/server/src/lib/lead-notify.ts:42-61

## Mục 4 — Bối cảnh kiến trúc & điểm mount

- ✅ Điểm tiếp nhận công khai được gắn ngoài vùng API có phiên đăng nhập, cùng
  cách đối xử với trang dữ liệu thanh toán công khai — middleware khởi tạo
  phiên không chạy trên đường này. [S9] apps/server/src/app.ts:424-427
- ✅ Điểm tiếp nhận công khai có CORS riêng theo danh sách origin của trang
  landing, không cho phép gửi kèm thông tin đăng nhập trình duyệt; CORS toàn
  cục được cấu để bỏ qua đúng đường này. [S9] apps/server/src/app.ts:391-406; [S1] apps/server/src/routes/public-leads.ts:79-90
- ✅ API quản lý đăng ký gắn bên trong vùng API nội bộ để thừa hưởng guard
  chống CSRF theo Origin, rồi tự gắn thêm guard vai trò tài chính. [S10] apps/server/src/routes/kernel.ts:186-207; [S10] apps/server/src/routes/kernel.ts:3505; [S2] apps/server/src/routes/leads.ts:30-37
- ✅ Org đích của mọi đăng ký lấy từ biến môi trường tại thời điểm triển khai,
  không bao giờ tin dữ liệu client. [S1] apps/server/src/routes/public-leads.ts:95-102; [S27] apps/server/src/index.ts:168-176
- ✅ Chạy thiếu cấu hình org đích thì kênh tiếp nhận tự tắt với mã lỗi riêng —
  hợp đồng fail-closed, môi trường phát triển không cần cấu hình gì. [S28] packages/infra/alchemy.run.ts:125-128; [S1] apps/server/src/routes/public-leads.ts:95-102
- ✅ Ba biến môi trường điều khiển kênh tiếp nhận: mã tổ chức đích, danh sách
  origin được phép (mặc định theo stage từ cấu hình hạ tầng), và secret HMAC
  dùng chung với xác thực để băm địa chỉ mạng. [S27] apps/server/src/index.ts:168-176; [S28] packages/infra/alchemy.run.ts:125-140

## Mục 5 — Yêu cầu chức năng (FR)

> Mỗi mệnh đề mang nhãn độ tin cậy kèm trích dẫn dòng code.

- **FR-L01** ✅ Hệ thống chấp nhận đăng ký từ khách chưa có tài khoản qua một
  điểm tiếp nhận công khai, không đòi hỏi phiên đăng nhập hay mã thông báo.
  [S1] apps/server/src/routes/public-leads.ts:14-24; [S9] apps/server/src/app.ts:424-427
- **FR-L02** ✅ Hai thông tin bắt buộc của một đăng ký là họ tên (2–80 ký tự
  sau khi cắt khoảng trắng) và số điện thoại; mọi lựa chọn khác đều tuỳ chọn.
  [S4] packages/api/src/lead-contracts.ts:10-13, 205-226
- **FR-L03** ✅ Số điện thoại được chuẩn hoá trước khi lưu: bỏ mọi ký tự không
  phải chữ số, đổi đầu số quốc tế về dạng bắt đầu bằng 0, và chỉ nhận đúng
  10 chữ số bắt đầu bằng 0. [S4] packages/api/src/lead-contracts.ts:161-169
- **FR-L04** ✅ Ngày sinh (tuỳ chọn) phải là ngày thật theo định dạng năm-tháng-ngày
  và nằm trong khoảng năm 1940 đến năm hiện tại tính theo giờ Việt Nam.
  [S4] packages/api/src/lead-contracts.ts:171-191
- **FR-L05** ✅ Email là tuỳ chọn cho đăng ký từ trang landing; riêng đăng ký
  đi qua cổng bài kiểm tra đầu vào thì email bắt buộc. [S4] packages/api/src/lead-contracts.ts:193-199, 228-236
- **FR-L06** ✅ Các lựa chọn về khoá học, hình thức lớp, cặp ngày học và khung
  giờ chỉ nhận giá trị trong danh mục đóng đính kèm; giá trị lạ bị từ chối.
  [S4] packages/api/src/lead-contracts.ts:21-129
- **FR-L07** ✅ Hệ thống ghi lại nguồn của mỗi đăng ký: từ trang chủ hoặc từ
  cổng bài kiểm tra đầu vào; nguồn do người gửi khai trong payload và bị giới
  hạn trong hai giá trị đó. [S4] packages/api/src/lead-contracts.ts:146-148; [S1] apps/server/src/routes/public-leads.ts:185
- **FR-L08** ✅ Khi thí sinh nộp bài kiểm tra đầu vào, kết quả tự mô tả (tối đa
  300 ký tự, đã cắt bớt phía client) được ghi vào đăng ký tương ứng theo số
  điện thoại. [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:221-223; [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1486-1495; [S6] apps/server/src/routes/public-leads.test.ts:572-601
- **FR-L09** ✅ Cùng một số điện thoại gửi lại trong 24 giờ tại cùng trung tâm
  thì cập nhật đăng ký cũ (tăng số lần gửi) thay vì tạo dòng mới.
  [S1] apps/server/src/routes/public-leads.ts:230-235, 247-290
- **FR-L10** ✅ Khi có đăng ký mới, hệ thống gửi một email cho mỗi thành viên
  có quyền tài chính của trung tâm, chứa tên người đăng ký, khoá/hình thức/lịch
  đã chọn và liên kết mở thẳng màn danh sách ở bộ lọc đăng ký mới.
  [S11] apps/server/src/lib/lead-notify.ts:63-108
- **FR-L11** ✅ Màn quản lý hiển thị danh sách đăng ký mới nhất trước, hỗ trợ
  tìm theo tên hoặc số điện thoại, lọc theo trạng thái kèm số đếm trên từng
  nhãn lọc, và phân trang 20 dòng mỗi trang. [S2] apps/server/src/routes/leads.ts:64-142; [S12] apps/web/src/routes/_auth/leads/index.tsx:286-465
- **FR-L12** ✅ Người quản lý đổi được trạng thái của một đăng ký và ghi chú nội
  bộ; hệ thống ghi lại thời điểm thay đổi trạng thái gần nhất, giữ nguyên mốc cũ
  nếu trạng thái không đổi. [S2] apps/server/src/routes/leads.ts:171-186; [S7] apps/server/src/routes/leads.test.ts:273-304
- **FR-L13** ✅ Trên bảng danh sách, số điện thoại hiển thị dạng liên kết mở
  hội thoại Zalo; bấm vào dòng mở hộp thoại chi tiết toàn bộ thông tin đăng ký.
  [S12] apps/web/src/routes/_auth/leads/index.tsx:386-395, 470-483
- **FR-L14** ✅ Bộ lọc và trang được giữ trên địa chỉ trang web để tải lại, quay
  lại và chia sẻ đều giữ nguyên trạng thái xem; ô tìm kiếm chỉ tra sau khi người
  dùng ngừng gõ. [S12] apps/web/src/routes/_auth/leads/index.tsx:38-114, 232-240
- **FR-L15** ✅ Form landing lưu nháp tự động các trường đã điền vào bộ nhớ trình
  duyệt và khôi phục lại ở lần truy cập sau; khoá học cũ ngoài danh mục được tự
  đổi sang khoá mới tương ứng. [S19] apps/profile/public/index.html:1493-1533, 1560-1583
- **FR-L16** ✅ Khi không gửi được đăng ký (mạng lỗi hoặc máy chủ báo lỗi),
  trang landing giữ nguyên dữ liệu người dùng đã điền và hiện phiếu đăng ký
  dạng văn bản để copy gửi qua Zalo. [S19] apps/profile/public/index.html:1282-1292, 1690-1712

## Mục 6 — Quy tắc nghiệp vụ (BR)

- **BR-L01** ✅ Org đích của đăng ký luôn lấy từ cấu hình máy chủ; client không
  có cách nào chỉ định org (khoá lạ trong payload làm cả request bị từ chối).
  [S1] apps/server/src/routes/public-leads.ts:95-102, 131-156; [S6] apps/server/src/routes/public-leads.test.ts:206-221
- **BR-L02** ✅ Thiếu cấu hình org đích thì toàn bộ kênh tiếp nhận trả một mã
  lỗi riêng với mã HTTP 503, không ghi dữ liệu. [S1] apps/server/src/routes/public-leads.ts:95-102; [S6] apps/server/src/routes/public-leads.test.ts:152-161
- **BR-L03** ✅ Yêu cầu phải kèm header Origin thuộc danh sách cho phép; thiếu
  hoặc sai origin đều bị từ chối 403 — fail-closed với client lạ.
  [S1] apps/server/src/routes/public-leads.ts:104-112; [S6] apps/server/src/routes/public-leads.test.ts:163-174
- **BR-L04** ✅ Bot điền vào trường bẫy ẩn hoặc gửi quá nhanh (dưới 3 giây kể
  từ khi form hiển thị) nhận mã thành công giả với mã định danh ngẫu nhiên,
  nhưng không ghi dữ liệu và không gửi email. [S1] apps/server/src/routes/public-leads.ts:158-166; [S6] apps/server/src/routes/public-leads.test.ts:231-247
- **BR-L05** ✅ Một địa chỉ mạng gửi tối đa 3 đăng ký trong cửa sổ 10 phút;
  lượt thứ tư bị từ chối 429 kèm nhắc thử lại sau 10 phút. Địa chỉ mạng được
  băm một chiều trước khi lưu — không lưu địa chỉ thô. [S1] apps/server/src/routes/public-leads.ts:26-29, 56-74, 222-225; [S6] apps/server/src/routes/public-leads.test.ts:249-270
- **BR-L06** ✅ Thiếu secret băm thì phép kiểm tần suất theo địa chỉ mạng bị bỏ
  qua (mọi dòng có vết rỗng), nhưng trần ngày vẫn chạy. [S1] apps/server/src/routes/public-leads.ts:48-49, 170-174, 183
- **BR-L07** ✅ Mỗi trung tâm nhận tối đa 100 đăng ký mới trong một ngày lịch
  Việt Nam; đăng ký vượt trần bị từ chối 429 với mã lỗi riêng, riêng cập nhật
  đăng ký trùng số điện thoại vẫn được vì không tạo dòng mới.
  [S1] apps/server/src/routes/public-leads.ts:30-31, 226-229, 319-325; [S6] apps/server/src/routes/public-leads.test.ts:272-290, 487-496
- **BR-L08** ✅ Cùng số điện thoại gửi lại nhiều nhất 5 lần trong cửa sổ 24 giờ;
  lượt thứ sáu bị từ chối 429 và số lần gửi dừng ở 5. [S1] apps/server/src/routes/public-leads.ts:34-37, 270; [S6] apps/server/src/routes/public-leads.test.ts:326-356
- **BR-L09** ✅ Khi gộp trùng, danh tính ban đầu được bảo toàn: tên và email chỉ
  được điền nếu đang trống, còn các lựa chọn tuỳ chọn thì giá trị mới không
  rỗng sẽ đè giá trị cũ; trạng thái và ghi chú của giáo viên không bị đụng đến.
  [S1] apps/server/src/routes/public-leads.ts:247-261; [S6] apps/server/src/routes/public-leads.test.ts:292-324, 326-356
- **BR-L10** ✅ Gộp trùng không gửi email lại — giáo viên chỉ nhận thư ở lần
  tạo đầu tiên. [S1] apps/server/src/routes/public-leads.ts:281-290; [S6] apps/server/src/routes/public-leads.test.ts:394-398
- **BR-L11** ✅ Ba phép kiểm tần suất (theo địa chỉ mạng, trần ngày, gộp trùng)
  thực hiện trong các câu lệnh cơ sở dữ liệu nguyên tử để các yêu cầu đến đồng
  thời không vượt ngưỡng. [S1] apps/server/src/routes/public-leads.ts:176-178, 194-237; [S6] apps/server/src/routes/public-leads.test.ts:407-454, 456-496
- **BR-L12** ✅ Khi cả hai lệnh ghi đều không thành công, hệ thống phân loại nguyên nhân
  theo thứ tự ưu tiên: vượt tần suất địa chỉ mạng → chạm trần ngày với số điện
  thoại mới → vượt ngưỡng gửi lại của số điện thoại. [S1] apps/server/src/routes/public-leads.ts:292-329
- **BR-L13** ✅ Chỉ vai trò tài chính được đọc và sửa đăng ký; vai trò khác nhận
  403 với mã lỗi riêng. [S2] apps/server/src/routes/leads.ts:30-37; [S7] apps/server/src/routes/leads.test.ts:253-269, 345-365
- **BR-L14** ✅ Đăng ký của trung tâm khác hoặc không tồn tại đều trả cùng một
  mã 404 để không lộ sự tồn tại của mã định danh. [S2] apps/server/src/routes/leads.ts:161-169; [S7] apps/server/src/routes/leads.test.ts:306-315
- **BR-L15** ✅ Màn quản lý phía web cũng tự ẩn và chặn điều hướng với vai trò
  thiếu quyền trước khi bắn bất kỳ lời gọi API nào. [S12] apps/web/src/routes/_auth/leads/index.tsx:148-172, 261; [S15] apps/web/src/components/layout/sidebar.tsx:128-146; [S16] apps/web/src/lib/use-finance-route-guard.ts:12-31
- **BR-L16** ✅ Lỗi hệ thống gởi thư không bao giờ đổi kết quả của việc tiếp
  nhận: đăng ký vẫn lưu, phản hồi vẫn thành công, lỗi chỉ ghi log không có dữ
  liệu cá nhân. [S11] apps/server/src/lib/lead-notify.ts:16-22, 92-108; [S6] apps/server/src/routes/public-leads.test.ts:394-405
- **BR-L17** ✅ Dữ liệu vật chất chống spam (vết băm địa chỉ mạng) không bao giờ
  xuất hiện trong bất kỳ phản hồi API nào cho client. [S2] apps/server/src/routes/leads.ts:25, 38-62; [S7] apps/server/src/routes/leads.test.ts:158-161, 288-293
- **BR-L18** ✅ Body của điểm tiếp nhận công khai bị chặn ở 4 KB, kiểm cả khai
  báo độ dài lẫn số byte thật. [S1] apps/server/src/routes/public-leads.ts:39-40, 114-129; [S6] apps/server/src/routes/public-leads.test.ts:223-229
- **BR-L19** ✅ Payload của điểm tiếp nhận dùng chế độ từ chối khoá lạ: bất kỳ
  trường nào ngoài hợp đồng làm cả request bị từ chối 400 kèm danh sách tên
  trường lỗi, không bao giờ trả lại giá trị người gửi đưa vào.
  [S4] packages/api/src/lead-contracts.ts:201-227; [S1] apps/server/src/routes/public-leads.ts:131-156; [S6] apps/server/src/routes/public-leads.test.ts:206-221
- 🟡 Chưa có ràng buộc chuyển tiếp trạng thái: mọi vai trò tài chính có thể đặt
  đăng ký về bất kỳ trạng thái nào, kể cả đi lùi — xem OQ-L04.

## Mục 7 — Yêu cầu phi chức năng (NFR)

- **NFR-L01** ✅ Khả năng chống đua: giới hạn tần suất áp đúng khi nhiều yêu
  cầu đến đồng thời — bộ test bắn 10 yêu cầu song song cùng địa chỉ mạng và chỉ
  đúng 3 lượt được ghi. [S6] apps/server/src/routes/public-leads.test.ts:407-426
- **NFR-L02** ✅ Riêng tư dữ liệu cá nhân: thư thông báo không chứa số điện
  thoại, email hay ngày sinh (vì một chế độ gởi thư ghi nguyên nội dung ra log);
  phản hồi lỗi validation không phản chiếu giá trị probe.
  [S11] apps/server/src/lib/lead-notify.ts:19-22; [S6] apps/server/src/routes/public-leads.test.ts:358-374, 206-221
- **NFR-L03** ✅ Địa chỉ mạng nguồn chỉ tồn tại dưới dạng băm HMAC một chiều;
  bộ test khẳng định địa chỉ thô không xuất hiện trong bất kỳ dòng dữ liệu nào.
  [S1] apps/server/src/routes/public-leads.ts:56-74; [S6] apps/server/src/routes/public-leads.test.ts:110-127
- **NFR-L04** ✅ Phản hồi của kênh tiếp nhận và màn danh sách đều cấm bộ nhớ
  đệm trung gian. [S1] apps/server/src/routes/public-leads.ts:93; [S2] apps/server/src/routes/leads.ts:140
- **NFR-L05** ✅ CORS của kênh tiếp nhận cho đúng origin profile, đúng hai phương
  thức POST/OPTIONS, và không cấp quyền gửi kèm thông tin đăng nhập trình duyệt.
  [S1] apps/server/src/routes/public-leads.ts:79-90; [S6] apps/server/src/routes/public-leads.test.ts:176-204
- **NFR-L06** ✅ Trang bài kiểm tra đầu vào đặt giới hạn 10 giây cho mỗi lần
  gửi cổng thông tin và chống gửi trùng bằng bộ đếm thế hệ yêu cầu.
  [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1060-1066, 1074, 1116
- **NFR-L07** ✅ Gửi đồng bộ kết quả sau chấm dùng cơ chế "gửi cả khi rời trang"
  của trình duyệt để không mất điểm khi người dùng đóng tab.
  [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1490-1497
- **NFR-L08** ✅ Danh mục khóa học/hình thức trên trang landing và cổng bài test
  được hai bộ test đối chiếu trực tiếp với hợp đồng dùng chung, chặn lệch danh
  mục lúc build. [S24] apps/server/src/lead-catalog-drift.test.ts:36-128; [S5] packages/api/src/lead-contracts.test.ts:232-251
- **NFR-L09** 🔵 Điểm truy cập API của kênh công khai cấu hình qua thẻ meta trên
  trang tĩnh, cho phép trỏ môi trường dev khác nhau không cần sửa HTML.
  [S19] apps/profile/public/index.html:9, 1652-1655; [S22] apps/profile/tests/index.test.mjs:404-463; [S23] apps/profile/tests/placement-test.test.mjs:180-257

## Mục 8 — Hợp đồng API & thông báo lỗi

Chi tiết đầy đủ tại `_evidence.md` §Endpoints/§Validation/§Errors. Tóm tắt:

### 8.1 Điểm cuối

| # | Điểm cuối | Ai được gọi | Trạng thái trả | Bằng chứng |
|---|---|---|---|---|
| 1 | `POST /public/leads` | Khách công khai (origin allowlist) | 201 / 400 / 403 / 413 / 429 / 503 | [S1] apps/server/src/routes/public-leads.ts:92-367 |
| 2 | `OPTIONS /public/leads` (preflight) | Trình duyệt | 204 | [S6] apps/server/src/routes/public-leads.test.ts:176-204 |
| 3 | `GET /api/leads` (tham số: `q`, `status`, `page`) | Vai trò tài chính | 200 / 400 / 401 / 403 | [S2] apps/server/src/routes/leads.ts:64-142 |
| 4 | `PATCH /api/leads/:id` | Vai trò tài chính | 200 / 400 / 401 / 403 / 404 | [S2] apps/server/src/routes/leads.ts:144-187 |

### 8.2 Thân yêu cầu/đáp ứng chính

- ✅ Gửi đăng ký: bắt buộc tên + số điện thoại + thời gian điền (số nguyên ≥ 0);
  tuỳ chọn email, ngày sinh, khoá, hình thức, cặp ngày, khung giờ, ghi chú,
  kết quả test, nguồn, trường bẫy. Đáp ứng tạo mới: `{ id, submitCount: 1 }`;
  đáp ứng gộp trùng: `{ id, submitCount }`. [S4] packages/api/src/lead-contracts.ts:205-237; [S1] apps/server/src/routes/public-leads.ts:165, 283-290, 366
- ✅ Danh sách: `{ rows, total, page, pageSize, counts }` với `counts` gồm bốn
  trạng thái + tổng; `counts` tính trên bộ lọc từ khoá, không áp lọc trạng thái.
  [S4] packages/api/src/lead-contracts.ts:281-288; [S2] apps/server/src/routes/leads.ts:92-131
- ✅ Dòng đăng ký trả client không bao giờ chứa vết băm địa chỉ mạng.
  [S4] packages/api/src/lead-contracts.ts:258-279; [S2] apps/server/src/routes/leads.ts:38-62

### 8.3 Toàn bộ nhãn lỗi nguyên văn (quote tại throw-site, không có catalog i18n)

| Mã lỗi | HTTP | Nguyên văn | Bằng chứng (throw-site) |
|---|---|---|---|
| Tắt kênh tiếp nhận | 503 | `LEAD_INTAKE_DISABLED` (trường `error` lẫn `code`) | [S1] apps/server/src/routes/public-leads.ts:98-101 |
| Origin lạ | 403 | `LEAD_ORIGIN_FORBIDDEN` | [S1] apps/server/src/routes/public-leads.ts:108-111 |
| Body quá lớn | 413 | `payload too large` | [S1] apps/server/src/routes/public-leads.ts:118-119, 125-126 |
| Dữ liệu sai | 400 | `LEAD_INVALID` + `fields` (danh sách tên trường) | [S1] apps/server/src/routes/public-leads.ts:147-156 |
| Vượt tần suất | 429 | `LEAD_RATE_LIMITED` | [S1] apps/server/src/routes/public-leads.ts:326-329 |
| Trần ngày | 429 | `LEAD_DAILY_CAP` | [S1] apps/server/src/routes/public-leads.ts:323-325 |
| Nhắc thử lại | header | `Retry-After: 600` | [S1] apps/server/src/routes/public-leads.ts:319 |
| Chưa đăng nhập | 401 | `unauthorized` | [S2] apps/server/src/routes/leads.ts:32, 66, 146 |
| Thiếu quyền | 403 | `leads-forbidden` | [S2] apps/server/src/routes/leads.ts:34 |
| Query sai | 400 | `invalid query` | [S2] apps/server/src/routes/leads.ts:73 |
| Body sai | 400 | `invalid body` (cả JSON hỏng lẫn schema fail) | [S2] apps/server/src/routes/leads.ts:152, 155; [S7] apps/server/src/routes/leads.test.ts:334-343 |
| Không tìm thấy | 404 | `LEAD_NOT_FOUND` | [S2] apps/server/src/routes/leads.ts:168, 184 |

Thông điệp validation (máy chủ, nguyên văn trong hợp đồng):
`"Số điện thoại Việt Nam không hợp lệ"` [S4] packages/api/src/lead-contracts.ts:212 ·
`"Ngày sinh phải là yyyy-mm-dd hợp lệ"` [S4] packages/api/src/lead-contracts.ts:183 ·
`"Năm sinh phải trong khoảng 1940 đến năm hiện tại"` [S4] packages/api/src/lead-contracts.ts:190 ·
`"Email không hợp lệ"` [S4] packages/api/src/lead-contracts.ts:199 ·
`"Email là bắt buộc"` [S4] packages/api/src/lead-contracts.ts:233.

Thông điệp phía trang công khai (nguyên văn, không i18n):
`"Vui lòng nhập họ và tên của bạn (tối thiểu 2 ký tự, tối đa 80 ký tự)."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:147-149 ·
`"Vui lòng nhập địa chỉ email của bạn."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:152 ·
`"Vui lòng nhập địa chỉ email hợp lệ."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:154 ·
`"Vui lòng nhập số điện thoại Việt Nam hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84)."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:158-159 ·
`"Ngày sinh không hợp lệ (năm từ 1940 đến năm hiện tại)."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:163 ·
`"Khóa học đã chọn không hợp lệ."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:167 ·
`"Hình thức lớp đã chọn không hợp lệ."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:171 ·
`"Ghi chú không được vượt quá 500 ký tự."` [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:175 ·
`"Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu bên dưới."` (400) [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:261-266 ·
`"Có quá nhiều lượt đăng ký từ mạng này. Vui lòng thử lại sau ít phút hoặc nhắn Zalo cô Mỹ."` (429) [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:269-275 ·
`"Hệ thống đang bận, chưa thể lưu thông tin của bạn. Vui lòng thử lại hoặc nhắn Zalo cô Mỹ."` (còn lại) [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:277-283.

Thông điệp web admin (nguyên văn):
`"Đã cập nhật đăng ký."` [S12] apps/web/src/routes/_auth/leads/index.tsx:191 ·
`"Đăng ký không còn tồn tại hoặc thuộc tổ chức khác."` (404) [S12] apps/web/src/routes/_auth/leads/index.tsx:201 ·
`"Không thể cập nhật đăng ký. Vui lòng thử lại."` [S12] apps/web/src/routes/_auth/leads/index.tsx:206 ·
`"Không tải được danh sách đăng ký. Thử tải lại trang."` [S12] apps/web/src/routes/_auth/leads/index.tsx:275 ·
`"Chưa có đăng ký nào"` (empty state) [S12] apps/web/src/routes/_auth/leads/index.tsx:300-306 ·
`"Bạn không có quyền xem Sổ công nợ"` (toast chặn route) [S16] apps/web/src/lib/use-finance-route-guard.ts:6.

Tiêu đề email thông báo (nguyên văn khuôn mẫu): `Đăng ký học mới: {tên}` [S11] apps/server/src/lib/lead-notify.ts:97; dòng đầu nội dung: `Học viên tiềm năng: {tên}` [S11] apps/server/src/lib/lead-notify.ts:63.

## Mục 9 — Vòng đời & trạng thái

Xem chi tiết sơ đồ: `srs/leads-reverse-states.md`.

- ✅ Một đăng ký có đúng 4 trạng thái: mới, đã liên hệ, đã ghi danh, bỏ — khai
  báo trùng nhau ở hai lớp (hợp đồng và bảng dữ liệu). [S4] packages/api/src/lead-contracts.ts:131-144; [S3] packages/db/src/schema/lead.ts:7
- ✅ Đăng ký mới luôn khởi tạo ở trạng thái "mới" (giá trị mặc định cột và câu
  lệnh tạo đều ghi cứng trạng thái này). [S3] packages/db/src/schema/lead.ts:36; [S1] apps/server/src/routes/public-leads.ts:215
- ✅ Gộp trùng theo số điện thoại giữ nguyên trạng thái hiện có. [S6] apps/server/src/routes/public-leads.test.ts:292-324
- 🟡 Không có máy trạng thái cưỡng chế: cập nhật chấp nhận mọi cặp chuyển giữa
  4 trạng thái — hành vi này đúng như code nhưng có thể không phải mong muốn
  nghiệp vụ (OQ-L04).

## Mục 10 — Mô hình dữ liệu

Xem sơ đồ đầy đủ 20 cột: `srs/leads-reverse-erd.md`.

- ✅ Bảng `lead` tạo ở migration số 0057, khóa ngoại về bảng tổ chức với xóa
  dây chuyền; ba chỉ mục phục vụ: lọc theo trạng thái trong org, gộp trùng theo
  số điện thoại, và đếm tần suất theo vết băm mạng. [S8] packages/db/src/migrations/0057_exotic_vulture.sql:1-27; [S29] packages/db/src/migrations/meta/_journal.json:408
- ✅ 20 cột: định danh, tổ chức, họ tên, số điện thoại, email, ngày sinh, khoá,
  hình thức, cặp ngày, khung giờ, ghi chú, kết quả test, ghi chú giáo viên,
  nguồn, trạng thái, vết băm mạng, số lần gửi, ba mốc thời gian (tạo, cập nhật,
  đổi trạng thái). [S3] packages/db/src/schema/lead.ts:15-60
- ✅ Các mốc thời gian lưu kiểu mili-giây; mặc định do chính cơ sở dữ liệu điền
  khi tạo. [S3] packages/db/src/schema/lead.ts:39-45
- ✅ Chỉ có đúng một bảng và một migration cho tính năng này; không bảng phụ.
  (grep `lead` toàn bộ thư mục migration: 0057 + 1 hit vô quan "leading" ở comment 0011:9 — không bảng lead thứ hai)
- 🔵 Mọi đường ghi bảng lead trong code nằm ở route tiếp nhận công khai và
  route quản lý; không có thành phần nào khác ghi bảng. [S1] apps/server/src/routes/public-leads.ts:194-278; [S2] apps/server/src/routes/leads.ts:172-181

## Mục 11 — Use cases

Chỉ mục đầy đủ + ma trận: `usecases/leads-reverse-usecase-index.md`. Năm use
case fully-dressed: `usecases/uc-01-gui-form-dang-ky-cong-khai.md`,
`usecases/uc-02-lam-bai-kiem-tra-dau-vao-va-dong-bo-diem.md`,
`usecases/uc-03-tra-cuu-danh-sach-dang-ky.md`,
`usecases/uc-04-cap-nhat-trang-thai-dang-ky.md`,
`usecases/uc-05-thong-bao-email-dang-ky-moi.md`.

## Mục 12 — Gap, câu hỏi mở & rủi ro

Đầy đủ tại `reverse-gaps.md`. Tóm tắt các câu hỏi mở trọng yếu:

| OQ | Câu hỏi | Priority |
|---|---|---|
| OQ-L01 | Khi đánh dấu "đã ghi danh", có cần quy trình/chức năng chuyển đăng ký thành hồ sơ học viên không, hay làm thủ công ngoài hệ thống? | High |
| OQ-L02 | Có cần chức năng xóa/ẩn đăng ký (SĐT nhập nhầm sẽ chặn dòng đúng trong 24 giờ vì gộp trùng)? | High |
| OQ-L04 | Có cần ràng buộc máy trạng thái (chặn đi lùi, chặn bỏ nhầm) cho việc cập nhật trạng thái? | Medium |
| OQ-L05 | Bucket địa chỉ mạng dự phòng khi thiếu header nhận diện — có cần xử lý riêng cho proxy/NAT lớn? | Low |
| OQ-L09 | Có cần xuất dữ liệu đăng ký (CSV/báo cáo) cho trung tâm không? | Medium |

> Cột Priority là phân loại của nhà phân tích (đề xuất, tương đương nhãn cần xác nhận) — code/test không mang thông tin ưu tiên; cần chủ trì chốt.

Danh sách xung đột/nhận định suy ra từ code (K-id, I-id) xem `reverse-gaps.md`.
