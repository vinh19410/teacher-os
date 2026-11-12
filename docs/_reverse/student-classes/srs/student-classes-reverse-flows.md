---
type: reverse-srs-flows
feature: student-classes
status: draft
updated: "2026-11-12"
---

# student-classes — Luồng nghiệp vụ (flows)

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

Mỗi luồng có cả sơ đồ trình tự lẫn sơ đồ khối; mọi bước đều bám code, không thêm bước không có trong nguồn.

## F1 — Mở trang chi tiết lớp từ danh sách

Entry: card lớp ở trang danh sách (mở được chỉ khi ghi danh đã kích hoạt). Thoát: trang chi tiết, hoặc một trong các màn từ chối.

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant SPA as Cổng học viên
    participant G as Chuỗi chắn phiên và vai trò
    participant API as API học viên
    participant DB as Dữ liệu

    HV->>SPA: Bấm card lớp ở trang danh sách
    SPA->>G: Mở trang chi tiết lớp
    G->>G: Kiểm tra phiên đăng nhập
    alt Chưa đăng nhập
        G-->>HV: Về trang đăng nhập
    else Có phiên
        G->>API: Lấy hồ sơ học viên theo tổ chức đang chọn
        API->>API: Chặn vai trò giáo viên - tự nối hồ sơ nếu lần đầu
        alt Tài khoản bị chặn (giáo viên - chưa liên kết - chưa xác thực)
            API-->>SPA: 403 kèm mã lỗi hợp đồng
            SPA-->>HV: Màn lỗi tương ứng - hoặc về luồng khởi tạo hồ sơ
        else Học viên hợp lệ
            SPA->>API: Lấy chi tiết lớp
            API->>DB: Tra ghi danh đã kích hoạt + lớp + buổi + bài tập
            alt Không có ghi danh đã kích hoạt
                API-->>SPA: 404 không tìm thấy lớp
                SPA-->>HV: Màn Không tìm thấy lớp
            else Có ghi danh
                API->>API: Nạp giáo viên tổ chức - tính Buổi tới - sắp buổi theo ghi danh
                API-->>SPA: Bản chi tiết lớp
                SPA->>SPA: Kiểm định hình dạng dữ liệu
                alt Dữ liệu lệch hình dạng
                    SPA-->>HV: Trang lỗi chung cổng học viên
                else Dữ liệu hợp lệ
                    SPA-->>HV: Thẻ thông tin + vòng tiến độ + banner + 4 tab
                end
            end
        end
    end
```

```mermaid
flowchart TD
    A["Card lớp ở trang danh sách"] --> B{"Ghi danh đã kích hoạt?"}
    B -->|"Chưa"| C["Card không có liên kết - nút Tham gia lớp"]
    C --> C1["Ranh giới enrollment-lifecycle"]
    B -->|"Rồi"| D["Mở trang chi tiết lớp"]
    D --> E{"Phiên hợp lệ?"}
    E -->|"Không"| F["Về trang đăng nhập"]
    E -->|"Rồi"| G{"Hồ sơ học viên hợp lệ?"}
    G -->|"Giáo viên"| H["403 - màn lỗi riêng cho giáo viên"]
    G -->|"Chưa liên kết"| I["Màn lỗi: Tài khoản chưa được liên kết"]
    G -->|"Chưa xác thực"| I2["Màn lỗi email chưa xác thực"]
    G -->|"Hợp lệ"| J{"Có ghi danh đã kích hoạt trong tổ chức đang chọn?"}
    J -->|"Không"| K["404 - Màn Không tìm thấy lớp"]
    J -->|"Có"| L["Dựng chi tiết: giáo viên - Buổi tới - sắp buổi"]
    L --> M{"Dữ liệu qua kiểm định hình dạng?"}
    M -->|"Không"| N["Trang lỗi chung cổng học viên"]
    M -->|"Rồi"| O["Render thẻ thông tin + 4 tab"]
```

Bằng chứng từng nhánh: guard phiên apps/student/src/routes/_auth/route.tsx:4-13 ✅; chặn vai trò apps/server/src/routes/student.ts:506-516 + apps/server/src/role-gates.test.ts:190-217 ✅; chưa liên kết → màn lỗi apps/student/src/routes/_auth/classes/$classId.tsx:32-38; chưa hoàn tất onboarding → về onboarding :42-44 ✅; guard ghi danh apps/server/src/routes/student.ts:1048-1063 ✅; 404 đồng nhất apps/server/src/student.test.ts:840-856 ✅; kiểm định client apps/student/src/lib/repos/student.ts:187-218 ✅.

## F2 — Xem "Bạn cùng lớp"

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant SPA as Trang chi tiết lớp
    participant API as API bạn cùng lớp
    participant DB as Dữ liệu

    HV->>SPA: Mở tab Bạn cùng lớp
    SPA->>SPA: Chỉ cho phép truy vấn khi tab đang mở
    SPA->>API: Lấy danh sách bạn
    API->>API: Guard bản thân: ghi danh đã kích hoạt + đúng tổ chức
    alt Guard không qua
        API-->>SPA: 404 không tìm thấy lớp
        SPA-->>HV: Khối lỗi trong tab
    else Guard qua
        API->>DB: Tra roster đã kích hoạt - sắp theo tên rồi định danh
        DB-->>API: Dòng dữ liệu 2 trường: định danh + tên
        API->>API: Suy ký hiệu 2 chữ cái - cờ chính là người xem
        API-->>SPA: Roster 4 trường đã khóa
        alt Roster rỗng
            SPA-->>HV: Khối trống Lớp chưa có học viên nào
        else Có dữ liệu
            SPA-->>HV: Lưới thẻ bạn học - thẻ riêng gắn dấu bạn
        end
    end
```

```mermaid
flowchart TD
    A["Tab Bạn cùng lớp được mở"] --> B{"Tab còn mở khi truy vấn chạy?"}
    B -->|"Không"| Z["Không gọi API"]
    B -->|"Rồi"| C["Gọi API bạn cùng lớp"]
    C --> D{"Guard ghi danh đã kích hoạt + đúng tổ chức?"}
    D -->|"Không"| E["404 - khối lỗi Không tải được danh sách lớp"]
    D -->|"Rồi"| F["Truy vấn roster sắp theo tên"]
    F --> G{"Roster rỗng?"}
    G -->|"Rồi"| H["Khối trống Lớp chưa có học viên nào"]
    G -->|"Không"| I["Lưới thẻ bạn học + dấu bạn"]
    E --> X["Lỗi bất định: thêm câu Vui lòng thử lại sau ít phút"]
```

Bằng chứng: truy vấn có điều kiện theo tab apps/student/src/lib/repos/student.ts:438-445 ✅; guard + 404 apps/server/src/routes/student-classmates.ts:42-57 ✅; roster + ánh xạ :59-78 ✅; hình dạng khóa cứng packages/api/src/contracts.ts:2222-2232 + test :196-204 ✅; ký hiệu :17-22 + test :228-232 ✅; các khối UI apps/student/src/components/class/classmates-tab.tsx:35-62 ✅.

## F3 — Xem "Hành trình học" và suy luận Buổi tới / Đã kết thúc

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant API as API chi tiết lớp
    participant SPA as Tab Hành trình học

    HV->>API: Mở chi tiết lớp (gồm danh sách buổi theo ghi danh)
    API->>API: Sắp buổi: đủ ngày giữ thứ tự - thiếu ngày thì nhóm slot và xen kẽ
    API->>API: Tính Buổi tới: buổi đầu từ hôm nay giờ VN chưa qua giờ kết thúc
    API-->>SPA: Danh sách buổi + Buổi tới của lớp
    SPA->>SPA: Với từng buổi: suy trạng thái hiển thị theo giờ VN
    SPA->>SPA: Tìm buổi gắn huy hiệu Buổi tới trong danh sách
    SPA-->>HV: Dải buổi với nhãn trạng thái - huy hiệu - tài liệu kèm
```

```mermaid
flowchart TD
    A["Danh sách buổi theo ghi danh"] --> B{"Mọi buổi đều có ngày?"}
    B -->|"Không (lớp cũ)"| C["Nhóm slot ngày+giờ - sắp theo bậc trạng thái - xen kẽ slot"]
    B -->|"Rồi"| D["Giữ thứ tự truy vấn"]
    C --> E["Lớp cũ: không có Buổi tới của lớp"]
    D --> F{"Có buổi từ hôm nay chưa qua giờ kết thúc?"}
    F -->|"Rồi"| G["Ghi nhận Buổi tới của lớp"]
    F -->|"Không / giờ hỏng"| H["Không có Buổi tới"]
    D --> I["Client: với từng buổi"]
    I --> J{"Buổi nghỉ lễ dời lịch?"}
    J -->|"Rồi"| K["Nhãn Nghỉ lễ - Đã dời lịch"]
    J -->|"Không"| L{"Đã qua giờ kết thúc?"}
    L -->|"Rồi"| M["Nhãn Đã kết thúc"]
    L -->|"Không"| N["Nhãn theo trạng thái: Đã học / Sắp tới / Vắng / Đã huỷ"]
    I --> O{"Là buổi kế tiếp chưa học?"}
    O -->|"Rồi"| P["Cắm huy hiệu Buổi tới + aria-current"]
    O -->|"Không"| R["Không cắm huy hiệu"]
    E --> Q["Vòng tiến độ: nghỉ lễ không trừ tổng"]
```

Bằng chứng: sắp buổi apps/server/src/routes/student-class.ts:236-278 + test apps/server/src/student.test.ts:858-907 ✅; Buổi tới :77-117 + test :1487-1731 ✅; suy "Đã kết thúc" apps/student/src/components/class/class-lesson-list.tsx:57-67 + test :66-83 ✅; huy hiệu :69-85, :197-203 ✅; vòng tiến độ apps/student/src/components/class/class-detail-view.tsx:66-105 ✅. Ghi chú: Buổi tới của lớp (server) và huy hiệu trên buổi (client) là hai phép tính độc lập cùng quy ước thời gian 🔵 [apps/server/src/routes/student-class.ts:77-82 bình luận "đồng bộ isLessonEnded client" + apps/student/src/components/class/class-lesson-list.tsx:57-67 + test :48-64].

## F4 — Xem và mở bài tập từ trang lớp

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant API as API chi tiết lớp
    participant SPA as Trang lớp

    HV->>API: Mở chi tiết lớp
    API->>API: Lọc bài tập tới hạn của riêng lớp này
    API->>API: Nối bản ghi làm bài: điểm 4 tiêu chí - thời điểm chốt - trạng thái
    API-->>SPA: Danh sách bài tập lớp
    SPA->>SPA: Đếm bài chưa làm cho banner
    alt Còn bài chưa làm
        SPA-->>HV: Banner đếm bài + nút Làm ngay
    else Hết bài chưa làm
        SPA-->>HV: Không có banner
    end
    SPA->>SPA: Suy nhãn trạng thái từng bài
    SPA-->>HV: Bảng bài tập + cột thao tác
    HV->>SPA: Bấm thao tác mở bài
    SPA->>SPA: Chỉ bài của lớp này có đường mở
    SPA-->>HV: Sang màn làm bài (ranh giới student-quiz)
```

```mermaid
flowchart TD
    A["Chi tiết lớp trả danh sách bài"] --> B{"Bài đã tới hạn?"}
    B -->|"Không"| C["Không đưa vào bảng"]
    B -->|"Rồi"| D["Ghi nhận vào danh sách lớp"]
    D --> E{"Còn bài chưa làm?"}
    E -->|"Rồi"| F["Banner đếm bài + nút Làm ngay"]
    E -->|"Không"| G["Không banner"]
    D --> H["Suy nhãn: Đã chấm / Nộp trễ / Quá hạn / Sắp đến hạn / Chưa nộp"]
    H --> I{"Bài thuộc lớp này và có đường mở?"}
    I -->|"Rồi"| J["Cột thao tác có liên kết"]
    I -->|"Không"| K["Chỉ xem, không liên kết"]
    J --> L["Sang màn làm bài - ranh giới student-quiz"]
```

Bằng chứng: lọc tới hạn apps/server/src/lib/assignment-visibility.ts:8-16 ✅; truy vấn + nối bản ghi làm bài apps/server/src/routes/student-class.ts:145-233 ✅; suy nhãn apps/student/src/lib/assignment-status.ts:119-256 ✅; banner apps/student/src/components/class/class-detail-view.tsx:107-162 ✅; điều kiện liên kết apps/student/src/components/class/class-assignment-table.tsx:99-115 ✅.
