# Gap, câu hỏi mở, xung đột & suy diễn — leads

## 1. Open Questions (OQ)

| OQ | Câu hỏi | Vì sao code không trả lời được | Mục tiêu | Priority |
|---|---|---|---|---|
| OQ-L01 | Khi đăng ký được đánh dấu "đã ghi danh", có cần chức năng chuyển thành hồ sơ học viên (tạo tài khoản cổng, lớp, ghi danh) không? | Code chỉ đổi nhãn trạng thái; không tìm thấy bất kỳ đường chuyển đổi lead→student nào (NS-L02). | Đóng vòng bán hàng trong hệ thống hay để giáo viên tự tạo hồ sơ thủ công? | High |
| OQ-L02 | Có cần xóa/ẩn đăng ký không? SĐT gõ nhầm sẽ chiếm chỗ gộp trùng 24 giờ, chặn luôn dòng đúng từ SĐT thật trong ngày. | Không có lệnh xóa ở API lẫn UI (NS-L01); BR-L08 chặn lượt thứ 6. | Vận hành dọn dữ liệu bẩn/spam còn sót qua bộ lọc. | High |
| OQ-L03 | Kiến trúc chỉ hỗ trợ đúng 1 org đích cho toàn bộ kênh công khai (biến môi trường đơn giá trị). Đa trung tâm cần mô hình nào? | Deps nhận 1 chuỗi org đích duy nhất. [S1] apps/server/src/routes/public-leads.ts:44-46 | Có cần route theo org hay token công khai per-org? | Medium |
| OQ-L04 | Có cần ràng buộc máy trạng thái (ví dụ: không đi lùi từ "đã ghi danh" về "mới", không bỏ nhầm) cho cập nhật trạng thái? | PATCH nhận mọi giá trị enum, không kiểm tra trạng thái cũ. [S2] apps/server/src/routes/leads.ts:171-181 | Bảo vệ dữ liệu thống kê phễu bán hàng. | Medium |
| OQ-L05 | Khi header nhận diện địa chỉ mạng vắng mặt, mọi yêu cầu rơi vào một bucket chung; môi trường ngoài Workers (proxy riêng, NAT lớn) có cần xử lý riêng? | Fallback giá trị cố định khi thiếu header. [S1] apps/server/src/routes/public-leads.ts:170-174 | Nền tảng chạy thật luôn có header (Cloudflare), nhưng cần khẳng định không chạy elsewhere. | Low |
| OQ-L06 | Khi trung tâm chạm trần 100 đăng ký/ngày, giáo viên không nhận được bất kỳ cảnh báo nào (chỉ người gửi nhận 429). Có cần cảnh báo vận hành? | Không có notify cho sự kiện chạm trần trong code. | Tránh bỏ sót khách vì trần ngầm. | Medium |
| OQ-L07 | Secret băm địa chỉ mạng tái dùng secret xác thực; xoay secret làm mọi bộ đếm tần suất đang chạy mất tác dụng ngay lập tức. Có cần secret riêng + chính sách xoay? | [S27] apps/server/src/index.ts:171-173 | An toàn vận hành khi sự cố buộc xoay secret. | Medium |
| OQ-L08 | Người điền thật nhưng nhanh hơn 3 giây (ví dụ autofill trình duyệt) nhận mã thành công giả mà không biết đăng ký không được lưu. Có chấp nhận tổn thất này? | Nhánh trường bẫy trả 201 giả. [S1] apps/server/src/routes/public-leads.ts:158-166 | Cân bằng chống spam vs trải nghiệm. | Medium |
| OQ-L09 | Có cần xuất dữ liệu đăng ký (CSV/áo cáo phễu) không? | Không tìm thấy endpoint xuất dữ liệu cho lead. | Báo cáo bán hàng ngoài hệ thống. | Medium |
| OQ-L10 | Ứng dụng học viên và web admin không chứa form công khai nào — mọi kênh dẫn khách đều nằm ở trang landing tĩnh riêng. Có cần nhúng form vào ứng dụng chính? | NS-L03: grep `public/leads` chỉ trỏ profile + server. | Định hướng sản phẩm. | Low |

> Cột Priority là phân loại của nhà phân tích (đề xuất, tương đương nhãn cần xác nhận) — code/test không mang thông tin ưu tiên; cần chủ trì chốt.

## 2. Gaps (đặc tả thiếu — code có nhưng ý nghĩa nghiệp vụ chưa rõ)

| Gap | Diễn giải | Bằng chứng |
|---|---|---|
| Gap-L01 | Mốc "thời điểm đổi trạng thái gần nhất" được lưu nhưng không hiển thị ở bất kỳ màn hình nào và không dùng trong tính toán nào khác. | [S2] apps/server/src/routes/leads.ts:171-179; [S12] apps/web/src/routes/_auth/leads/index.tsx:488-603 (modal không render mốc này) |
| Gap-L02 | Trường "nguồn" hiển thị ở modal chi tiết dạng mã thô (không có bản đồ nhãn tiếng Việt như các danh mục khác). | [S12] apps/web/src/routes/_auth/leads/index.tsx:551 |
| Gap-L03 | Bộ đếm chip trạng thái chỉ có nghĩa khi không có lọc trạng thái; đang lọc một trạng thái thì các chip khác vẫn hiển thị số đếm toàn bộ (theo thiết kế "đếm trên q") — cần xác nhận đây là hành vi mong muốn của UI. | [S2] apps/server/src/routes/leads.ts:92-98; [S12] apps/web/src/routes/_auth/leads/index.tsx:246-254 |
| Gap-L04 | Nháp form landing lưu trong bộ nhớ trình duyệt của máy khách — đổi máy/dọn dữ liệu là mất; không đồng bộ về máy chủ. | [S19] apps/profile/public/index.html:1493-1533 |

## 3. Conflicts (mâu thuẫn/căng thẳng trong code)

| K | Mô tả | Bằng chứng |
|---|---|---|
| Conflict-K01 | Hai ngưỡng thời gian điền khác nhau: máy chủ gạt yêu cầu nhanh hơn 3000ms, còn trang bài test tự nâng thời gian gửi lên tối thiểu 3500ms. Không mâu thuẫn về kết quả nhưng là hai hằng cần cùng nhịp khi sửa. | [S1] apps/server/src/routes/public-leads.ts:32-33; [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:12, 225-235 |
| Conflict-K02 | Trang landing chỉ cho chọn 4 khoá rút gọn trong khi hợp đồng có 15 mã; việc map khoá cũ→mới chỉ diễn ra phía client (bảng ánh xạ cứng trong HTML). Nếu danh mục đổi, bảng map dễ bị bỏ quên — hiện được chặn bởi bộ test drift. | [S19] apps/profile/public/index.html:1479-1492, 1560-1570; [S24] apps/server/src/lead-catalog-drift.test.ts:37-52 |
| Conflict-K03 | Form landing không gửi các trường hình thức/cặp ngày/khung giờ (chỉ khoá + kết quả test), dù hợp đồng và màn quản lý có đầy đủ cột hiển thị cho các trường đó — chúng chỉ được điền bởi luồng cổng bài test. | [S19] apps/profile/public/index.html:1637-1651; [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1053-1060 |
| Conflict-K04 | Cùng một HTTP 429 mang hai mã lỗi khác nhau (vượt tần suất / trần ngày) với cùng một header nhắc thử lại 600 giây; client trang landing chỉ phân biệt 400/429/còn lại, không tách hai mã 429. | [S1] apps/server/src/routes/public-leads.ts:319-329; [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:255-283 |

## 4. Inferred (nhận định suy ra từ ≥2 điểm code)

| I | Nhận định | Bằng chứng (≥2) |
|---|---|---|
| INF-L01 | Đăng ký là thực thể độc lập, không phải tiền-hồ-sơ học viên: schema nói rõ vòng đời riêng, và không có bất kỳ khóa ngoại/diễn tiến nào nối lead với bảng học viên. | [S3] packages/db/src/schema/lead.ts:9-14; NS-L02 |
| INF-L02 | Quy trình vận hành mong muốn: khách để lại SĐT Zalo → giáo viên bấm liên kết Zalo gọi lại → cập nhật trạng thái sau mỗi lần liên hệ; UI được tối ưu đúng cho chuỗi này (liên kết Zalo trên bảng, tiêu đề màn nhắc "gọi lại học viên qua Zalo"). | [S12] apps/web/src/routes/_auth/leads/index.tsx:291, 386-395 |
| INF-L03 | Số lần gửi được dùng làm chỉ báo spam đồng thời là dữ liệu hiển thị cho giáo viên ("N lần gửi") — không có ngưỡng cảnh báo tự động nào khác ngoài ngưỡng chặn 5. | [S1] apps/server/src/routes/public-leads.ts:260; [S12] apps/web/src/routes/_auth/leads/index.tsx:380-384, 545-547 |
| INF-L04 | Trần ngày tính theo ngày lịch Việt Nam để khớp giờ vận hành trung tâm (mốc 0h giờ VN, không phải 0h UTC) — nhất quán với tiện ích ngày VN dùng chung toàn hệ thống. | [S1] apps/server/src/routes/public-leads.ts:179-181; [S26] packages/api/src/vietnam-date.ts |
| INF-L05 | Kênh bài test tái dùng cùng bộ giới hạn của kênh landing một cách có chủ ý: cùng điểm cuối, cùng danh sách origin, cùng org đích — khác biệt duy nhất là email bắt buộc và trường kết quả. | [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:193-248; [S9] apps/server/src/app.ts:428-429 |

## 5. Negative-search (R3 — tìm không thấy, ghi lại phạm vi tìm)

| NS | Mẫu tìm | Phạm vi | Kết quả |
|---|---|---|---|
| NS-L01 | Lệnh xóa: `routes.delete|\.delete\(` trong file route lead; `DELETE` trong hợp đồng | apps/server/src/routes/leads.ts, packages/api/src/lead-contracts.ts | 0 hit — không có xóa đăng ký |
| NS-L02 | `convert.*lead|lead.*convert|leadToStudent|lead->student` | apps/server/src, packages (typescript) | 0 hit — không chuyển đổi lead→học viên |
| NS-L03 | `public/leads|leadSubmit|elapsedMs` | apps/web/src, apps/student/src | 0 hit trong 2 app — form công khai duy nhất là apps/profile |
| NS-L04 | `\.skip|\.todo|xit|xtest` | toàn bộ file test của tính năng (S5-S7, S13, S22-S25) | 0 hit — không test nào bị bỏ qua |
| NS-L05 | Đường ghi bảng: import `db/schema/lead` và raw SQL `INTO lead\|UPDATE lead` | apps/server/src, packages (không tính test) | Import schema chỉ S2; raw SQL chỉ S1 (INSERT 194-237, UPDATE 247-278) — không thành phần khác ghi bảng lead |
| NS-L06 | Migration có `lead` | packages/db/src/migrations/*.sql | 0057 tạo bảng `lead`; 0011 chỉ trúng từ tiếng Anh "leading" (comment dòng 9) — không có bảng lead nào khác |
