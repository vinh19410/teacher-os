# Luồng nghiệp vụ — leads (mỗi luồng: sequenceDiagram + flowchart TD)

## F1 — Gửi đăng ký từ trang landing công khai

Bằng chứng chính: [S19] apps/profile/public/index.html:1614-1712; [S1] apps/server/src/routes/public-leads.ts:92-367; [S11] apps/server/src/lib/lead-notify.ts:23-109.

```mermaid
sequenceDiagram
    autonumber
    actor K as Khách truy cập
    participant L as Trang landing
    participant S as Máy chủ API
    participant DB as CSDL
    participant M as Bộ gởi thư
    K->>L: Điền form và bấm gửi
    L->>L: Kiểm tra tên và SĐT phía trình duyệt
    L->>S: POST /public/leads (JSON)
    S->>S: Kiểm tra cấu hình org đích
    alt Thiếu cấu hình org đích
        S-->>L: 503 LEAD_INTAKE_DISABLED
    else Origin không thuộc danh sách cho phép
        S-->>L: 403 LEAD_ORIGIN_FORBIDDEN
    else Body vượt 4KB
        S-->>L: 413 payload too large
    else Dữ liệu sai hoặc có khoá lạ
        S-->>L: 400 LEAD_INVALID kèm danh sách trường
    else Bot dính trường bẫy hoặc gửi dưới 3 giây
        S-->>L: 201 giả với mã định danh ngẫu nhiên (không ghi DB)
    else
        S->>DB: INSERT nguyên tử kèm 3 điều kiện giới hạn
        alt Vượt 3 lượt mỗi 10 phút theo địa chỉ mạng
            S-->>L: 429 LEAD_RATE_LIMITED + Retry-After 600
        else Đã đủ 100 đăng ký mới trong ngày
            S-->>L: 429 LEAD_DAILY_CAP + Retry-After 600
        else SĐT đã có trong 24 giờ
            S->>DB: UPDATE dòng cũ tăng số lần gửi (tối đa 5)
            S-->>L: 201 kèm số lần gửi (không gửi email lại)
        else Ghi thành công
            S->>M: Gửi thư nền cho các thành viên có quyền (nuốt lỗi)
            S-->>L: 201 kèm mã định danh và số lần gửi 1
            L->>K: Màn thành công kèm nút nhắn Zalo
        end
    end
    opt Mọi nhánh lỗi mạng hoặc lỗi 5xx ở phía landing
        L->>K: Hiện phiếu đăng ký dạng văn bản để copy gửi Zalo (giữ nguyên dữ liệu đã điền)
    end
```

```mermaid
flowchart TD
    A["Khách gửi form landing"] --> B{"Cấu hình org đích đã có?"}
    B -->|"Chưa có"| B1["Trả 503 LEAD_INTAKE_DISABLED"]
    B -->|"Có"| C{"Origin thuộc danh sách cho phép?"}
    C -->|"Không hoặc thiếu"| C1["Trả 403 LEAD_ORIGIN_FORBIDDEN"]
    C -->|"Có"| D{"Body vượt 4KB?"}
    D -->|"Có"| D1["Trả 413 payload too large"]
    D -->|"Không"| E{"Dữ liệu hợp lệ theo hợp đồng?"}
    E -->|"Sai hoặc khoá lạ"| E1["Trả 400 LEAD_INVALID kèm danh sách trường"]
    E -->|"Hợp lệ"| F{"Bot: điền trường bẫy hoặc gửi dưới 3 giây?"}
    F -->|"Có"| F1["Trả 201 giả, không ghi DB, không gửi thư"]
    F -->|"Không"| G{"Địa chỉ mạng gửi dưới 3 lượt trong 10 phút?"}
    G -->|"Vượt"| G1["Trả 429 LEAD_RATE_LIMITED, nhắc thử lại sau 10 phút"]
    G -->|"Còn trong hạn mức"| H{"Còn dưới 100 đăng ký mới trong ngày?"}
    H -->|"Đã đủ"| H1["Trả 429 LEAD_DAILY_CAP, nhắc thử lại sau 10 phút"]
    H -->|"Còn"| I{"SĐT đã tồn tại trong 24 giờ?"}
    I -->|"Chưa"| J["INSERT dòng mới, trạng thái mới, số lần gửi 1"]
    I -->|"Đã có"| K{"Số lần gửi còn dưới 5 và còn trong hạn mức mạng?"}
    K -->|"Vượt"| K1["Trả 429 theo thứ tự ưu tiên phân loại"]
    K -->|"Còn"| L["UPDATE dòng cũ: giữ tên email gốc, điền chỗ trống, tăng số lần gửi"]
    J --> M["Gửi thư nền cho thành viên có quyền, lỗi nuốt"]
    L --> N["Không gửi thư lại"]
    M --> O["Trả 201 cho khách, hiện màn thành công"]
    N --> O
```

## F2 — Cổng bài kiểm tra đầu vào & đồng bộ kết quả

Bằng chứng chính: [S20] apps/profile/public/kiem-tra-dau-vao/lead-gate.js:132-284; [S21] apps/profile/public/kiem-tra-dau-vao/test.js:1029-1135, 1478-1512; [S1] apps/server/src/routes/public-leads.ts:230-235.

```mermaid
sequenceDiagram
    autonumber
    actor T as Thí sinh
    participant G as Cổng bài test
    participant S as Máy chủ API
    participant DB as CSDL
    T->>G: Mở trang bài kiểm tra đầu vào
    G->>G: Thu thập thông tin (email bắt buộc)
    G->>S: POST /public/leads với nguồn là bài test
    alt Thiếu hoặc sai email
        S-->>G: 400 LEAD_INVALID với trường email
        G-->>T: Đánh dấu lỗi ở ô tương ứng
    else Chạm giới hạn tần suất
        S-->>G: 429 kèm Retry-After 600
        G-->>T: Thông báo quá nhiều lượt, nhắn Zalo cô Mỹ
    else Ghi thành công
        S-->>G: 201
        G->>T: Vào phần làm bài
    end
    T->>G: Trả lời các phần và nộp bài
    G->>G: Chấm bài ngay trên trình duyệt và tổng hợp kết quả
    G->>S: POST /public/leads kèm kết quả (cùng SĐT, gửi cả khi rời trang)
    S->>DB: UPDATE dòng cũ: điền kết quả, tăng số lần gửi
    S-->>G: 201 (không gửi email thứ hai)
    G->>T: Hiện kết quả, dải xếp lớp và khoá đề xuất
```

```mermaid
flowchart TD
    A["Thí sinh mở cổng bài test"] --> B{"Thông tin cá nhân hợp lệ và đủ email?"}
    B -->|"Thiếu hoặc sai"| B1["Chặn nộp, đánh dấu lỗi từng ô"]
    B -->|"Đạt"| C["POST cổng thông tin với nguồn là bài test"]
    C --> D{"Máy chủ chấp nhận?"}
    D -->|"400 sai trường"| D1["Hiện lỗi theo trường từ danh sách máy chủ trả"]
    D -->|"429 quá nhiều lượt"| D2["Hiện thông báo chờ và hướng dẫn Zalo"]
    D -->|"Lỗi khác hoặc mạng đứt"| D3["Hiện thông báo hệ thống bận"]
    D -->|"201"| E["Cho vào phần làm bài"]
    E --> F["Nộp bài, chấm trên trình duyệt"]
    F --> G{"Đã từng ghi đăng ký ở bước cổng?"}
    G -->|"Có"| H["Gửi đồng bộ kết quả kèm SĐT, cả khi rời trang"]
    G -->|"Không có đăng ký"| I["Chỉ hiện kết quả cục bộ"]
    H --> J{"Máy chủ nhận được?"}
    J -->|"201"| K["Đánh dấu đã đồng bộ, không gửi lại"]
    J -->|"Lỗi"| L["Giữ trạng thái chưa đồng bộ"]
```

## F3 — Giáo viên tra cứu danh sách đăng ký

Bằng chứng chính: [S12] apps/web/src/routes/_auth/leads/index.tsx:147-279, 286-465; [S2] apps/server/src/routes/leads.ts:64-142; [S16] apps/web/src/lib/use-finance-route-guard.ts:12-31.

```mermaid
sequenceDiagram
    autonumber
    actor G as Giáo viên
    participant W as Web admin
    participant S as Máy chủ API
    participant DB as CSDL
    G->>W: Mở màn Đăng ký mới
    W->>W: Kiểm tra quyền tài chính của người dùng hiện tại
    alt Vai trò không đủ quyền
        W-->>G: Chặn vào màn, toast không có quyền, về trang chính (không gọi API)
    else Đủ quyền
        W->>S: GET /api/leads với q, status, page từ URL
        alt Chưa đăng nhập
            S-->>W: 401 unauthorized
            W->>W: Điều hướng đăng nhập lại
        else Dư liệu query sai
            S-->>W: 400 invalid query
        else
            S->>DB: Truy vấn có phân trang + đếm theo trạng thái
            S-->>W: 200 danh sách + tổng + số đếm chip
            W-->>G: Bảng mới nhất trước, chip số đếm, liên kết Zalo từng dòng
            G->>W: Gõ từ khoá hoặc bấm chip lọc
            W->>W: Chờ 300ms rồi cập nhật URL
            W->>S: GET lại với bộ lọc mới
            S-->>W: 200 kết quả lọc
        end
    end
```

```mermaid
flowchart TD
    A["Giáo viên mở màn danh sách"] --> B{"Vai trò có quyền tài chính?"}
    B -->|"Không"| B1["Ẩn màn, toast và về trang chính"]
    B -->|"Có"| C{"Phiên đăng nhập còn hiệu lực?"}
    C -->|"Hết"| C1["Điều hướng đăng nhập lại"]
    C -->|"Còn"| D["Tải danh sách theo bộ lọc trên URL"]
    D --> E{"Có kết quả?"}
    E -->|"Trống toàn cục và chưa lọc"| E1["Hiện màn chưa có đăng ký nào"]
    E -->|"Trống do lọc"| E2["Hiện thông báo không có kết quả phù hợp"]
    E -->|"Có"| F["Render bảng, chip số đếm, phân trang"]
    F --> G{"Người dùng thay đổi bộ lọc?"}
    G -->|"Có"| H["Chờ 300ms, đẩy bộ lọc lên URL, tải lại"]
    H --> D
    G -->|"Không"| I["Kết thúc phiên xem"]
```

## F4 — Giáo viên cập nhật trạng thái và ghi chú

Bằng chứng chính: [S12] apps/web/src/routes/_auth/leads/index.tsx:180-208, 470-603; [S2] apps/server/src/routes/leads.ts:144-187.

```mermaid
sequenceDiagram
    autonumber
    actor G as Giáo viên
    participant W as Web admin
    participant S as Máy chủ API
    participant DB as CSDL
    G->>W: Bấm một dòng trong bảng
    W-->>G: Mở hộp thoại chi tiết đầy đủ thông tin
    G->>W: Chọn trạng thái mới, gõ ghi chú, bấm Lưu
    W->>S: PATCH /api/leads/:id
    alt Chưa đăng nhập
        S-->>W: 401
        W->>W: Điều hướng đăng nhập lại
    else Thiếu quyền tài chính
        S-->>W: 403 leads-forbidden
    else Dữ liệu sai hoặc JSON hỏng
        S-->>W: 400 invalid body
    else Đăng ký không tồn tại hoặc thuộc org khác
        S-->>W: 404 LEAD_NOT_FOUND
        W-->>G: Toast đăng ký không còn tồn tại, làm mới danh sách
    else
        S->>DB: UPDATE trạng thái + ghi chú + mốc đổi trạng thái
        S-->>W: 200 dòng đăng ký đã cập nhật
        W-->>G: Toast đã cập nhật, đóng hộp thoại, làm mới danh sách
    end
```

```mermaid
flowchart TD
    A["Giáo viên mở chi tiết một đăng ký"] --> B["Chọn trạng thái và gõ ghi chú"]
    B --> C{"Bấm Lưu thay đổi?"}
    C -->|"Đóng"| C1["Đóng hộp thoại, không đổi dữ liệu"]
    C -->|"Lưu"| D{"Máy chủ xác thực thế nào?"}
    D -->|"401"| D1["Điều hướng đăng nhập lại"]
    D -->|"403"| D2["Toast lỗi chung không cập nhật được"]
    D -->|"400"| D3["Toast lỗi chung không cập nhật được"]
    D -->|"404"| D4["Toast đăng ký không còn tồn tại, làm mới danh sách"]
    D -->|"200"| E["Toast thành công, đóng hộp thoại, làm mới danh sách và chip số đếm"]
    E --> F{"Trạng thái có khác cũ?"}
    F -->|"Có"| G["Ghi mốc thời điểm đổi trạng thái gần nhất"]
    F -->|"Không"| H["Giữ nguyên mốc cũ"]
```
