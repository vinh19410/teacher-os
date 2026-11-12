# classes — Flows tái lập (reverse)

> Mỗi flow có CẢ Sequence và Activity. Chỉ vẽ các bước có trong code; bước suy đoán gắn nhãn 🔵/🟡.

## Flow: Tạo lớp học (kèm cảnh báo trùng lịch)

### Sequence — Tạo lớp học

```mermaid
sequenceDiagram
    actor T as Giáo viên
    participant M as Modal Tạo lớp
    participant K as Kernel server
    T->>M: Nhập tên, loại, lịch tuần, giờ, tổng buổi, ngày bắt đầu
    M->>M: Kiểm tra trùng lịch realtime với các lớp đang có
    alt Lịch trùng lớp khác
        M-->>T: Cảnh báo "Lịch bị trùng với lớp đang học" (không chặn nút Tạo)
    end
    T->>M: Bấm Tạo lớp
    alt Thiếu dữ liệu hoặc sai định dạng
        M-->>T: Lỗi validation (E-classes-001 đến E-classes-009)
    else Dữ liệu hợp lệ
        M->>K: POST /api/classes
        alt Có template
            K->>K: Tìm template trong org
            K-->>M: 404 "syllabus not found" nếu template lạ (E-classes-010)
            K->>K: Kiểm tra 500 nút tối đa
            K-->>M: 422 "Template quá lớn để import" nếu vượt (E-classes-011)
        end
        K->>K: Chốt chế độ lịch (có template = tự động, không = thủ công 0 buổi)
        K->>K: Một batch — chèn dòng lớp + copy giáo trình
        K-->>M: Tạo lớp thành công
        M->>K: Tải lại snapshot
        K-->>T: Lớp mới xuất hiện trong danh sách
    end
```

### Activity — Tạo lớp học

```mermaid
flowchart TD
    A["Mở modal Tạo lớp"] --> B["Nhập thông tin + lịch tuần"]
    B --> C{"Trùng lịch với lớp đang có?"}
    C -->|Có| D["Hiện cảnh báo, nút Tạo vẫn bật"]
    C -->|Không| E["Tiếp tục"]
    D --> E
    E --> F{"Validation client đạt?"}
    F -->|Không| G["Báo lỗi tương ứng (E-001 đến E-009)"]
    G --> B
    F -->|Có| H["POST /api/classes"]
    H --> I{"Template hợp lệ và <= 500 nút?"}
    I -->|Không| J["404 syllabus not found / 422 Template quá lớn (E-010, E-011)"]
    J --> B
    I -->|Có| K["Batch: chèn lớp + copy giáo trình"]
    K --> L["Tải lại danh sách — thấy lớp mới"]
```

## Flow: Sửa ghi chú / học phí lớp

### Sequence — Sửa ghi chú / học phí lớp

```mermaid
sequenceDiagram
    actor T as Giáo viên
    participant C as Trang chi tiết lớp
    participant K as Kernel server
    T->>C: Mở tab Ghi chú (hoặc modal Sửa học phí)
    C-->>T: Hiển thị giá trị hiện tại
    T->>C: Nhập ghi chú (hoặc học phí mới / xóa trắng)
    C->>K: POST /api/classes/:id/notes (hoặc tuition-fee)
    alt Học phí không hợp lệ (0, âm, quá 12 chữ số)
        C-->>T: "Học phí phải là số nguyên dương." (E-classes-009)
    else Hợp lệ
        K->>K: Cập nhật cột ghi chú (hoặc học phí, null khi xóa trắng)
        K-->>C: Lưu thành công
        C-->>T: Toast "Đã lưu ghi chú." (học phí cập nhật tab Học viên)
    end
```

### Activity — Sửa ghi chú / học phí lớp

```mermaid
flowchart TD
    A["Mở tab Ghi chú hoặc modal Sửa học phí"] --> B["Nhập giá trị mới"]
    B --> C{"Là học phí và giá trị không hợp lệ?"}
    C -->|Có| D["Chặn: Học phí phải là số nguyên dương (E-009)"]
    D --> B
    C -->|Không| E["Gửi lệnh ghi"]
    E --> F{"Ghi thành công?"}
    F -->|Có| G["Toast xác nhận + dữ liệu mới hiển thị"]
    F -->|Không| H["Toast Không lưu được (E-030)"]
```

## Flow: Thêm buổi học thủ công (lớp manual)

### Sequence — Thêm buổi học thủ công

```mermaid
sequenceDiagram
    actor T as Giáo viên
    participant M as Modal Thêm buổi
    participant K as Kernel server
    T->>M: Mở modal — hệ thống gợi ý ngày học kế tiếp theo lịch lớp
    T->>M: Nhập/chọn ngày, giờ, thời lượng, chủ đề, Zoom, tài liệu
    alt Trùng ngày đã có buổi
        M-->>T: "Lớp đã có buổi học vào ngày này." (E-classes-015)
    else OK
        M->>K: POST /api/classes/:id/sessions
        alt Lớp có giáo trình
            K-->>M: 409 class-has-syllabus (E-classes-016)
        else Lớp không ở chế độ thủ công
            K-->>M: 409 not-manual-class (E-classes-017)
        else Tài liệu lạ
            K-->>M: 422 material-not-found (E-classes-018)
        else Hợp lệ
            K->>K: Một batch — chèn dòng buổi + dòng bài cho mỗi đăng ký đang hoạt động + gắn tài liệu + cập nhật tổng buổi và tổng gói
            K-->>M: Thêm buổi thành công
            M->>K: Tải lại snapshot
            K-->>T: Buổi mới hiện trên lịch lớp
        end
    end
```

### Activity — Thêm buổi học thủ công

```mermaid
flowchart TD
    A["Mở modal Thêm buổi"] --> B["Hệ thống gợi ý ngày kế tiếp"]
    B --> C{"Ngày đã có buổi?"}
    C -->|Có| D["Chặn: Lớp đã có buổi học vào ngày này (E-015)"]
    D --> B
    C -->|Không| E["Gửi POST sessions"]
    E --> F{"Lớp manual và không có giáo trình?"}
    F -->|Không| G["409 class-has-syllabus hoặc not-manual-class (E-016, E-017)"]
    F -->|Có| H{"Tài liệu đều tồn tại trong org?"}
    H -->|Không| I["422 material-not-found (E-018)"]
    H -->|Có| J["Batch: buổi + bài theo học viên active + tài liệu + tổng buổi + tổng gói"]
    J --> K["Tải lại — buổi mới hiện trên lịch"]
```

## Flow: Điều chỉnh buổi học (sửa / dời / xóa)

### Sequence — Điều chỉnh buổi học

```mermaid
sequenceDiagram
    actor T as Giáo viên
    participant C as Modal Điều chỉnh buổi
    participant K as Kernel server
    T->>C: Chọn buổi — sửa chủ đề/giờ/thời lượng/Zoom hoặc dời ngày hoặc xóa
    alt Dời ngày
        C->>K: POST sessions/:date/edit kèm ngày mới
        K->>K: Pre-check ngày đích
        K-->>C: 409 date-occupied nếu đích đã có buổi (E-classes-020)
        K->>K: Khóa nếu bucket nghỉ lễ (E-classes-021)
        K->>K: Batch di chuyển khối + kéo tài liệu và cặp bù lịch nghỉ
        K->>K: Re-check sau ghi chặn race
        K->>K: Gửi thông báo thay đổi lịch cho học viên trong buổi (fail-open)
    else Xóa buổi
        C->>K: DELETE sessions/:date
        K-->>C: 409 cannot-delete-completed nếu đã hoàn thành/điểm danh (E-classes-023)
        K-->>C: 409 class-has-syllabus nếu lớp còn giáo trình (E-classes-024)
        K->>K: Xóa dòng buổi + dòng bài + tài liệu, cập nhật tổng buổi và tổng gói
    else Sửa nội dung
        C->>K: POST sessions/:date/edit
        K->>K: Guarded UPDATE áp cho mọi dòng bài của buổi (kể cả dòng đã chốt)
    end
    K-->>C: Kết quả kèm số updated/skipped
    C-->>T: Toast trung thực ("Đã dời buổi." / "Đã xóa buổi học." / "Đã cập nhật buổi.")
```

### Activity — Điều chỉnh buổi học

```mermaid
flowchart TD
    A["Chọn buổi — Điều chỉnh"] --> B{"Hành động?"}
    B -->|Sửa nội dung| C["POST edit — guarded UPDATE cả bucket"]
    B -->|Dời ngày| D{"Ngày đích còn trống?"}
    D -->|Không| E["409 date-occupied (E-020)"]
    D -->|Có| F{"Bucket nghỉ lễ?"}
    F -->|Có| G["409 holiday-locked (E-021)"]
    F -->|Không| H["Batch dời khối + tài liệu + cặp bù"]
    H --> I{"Re-check sau ghi còn trống?"}
    I -->|Không| J["Hoàn tác an toàn — 409 date-occupied (E-020)"]
    I -->|Có| K["Ghi xong + thông báo học viên"]
    B -->|Xóa| L{"Đã hoàn thành hoặc đã điểm danh?"}
    L -->|Có| M["409 cannot-delete-completed (E-023)"]
    L -->|Không| N{"Lớp còn giáo trình?"}
    N -->|Có| O["409 class-has-syllabus (E-024)"]
    N -->|Không| P["Xóa buổi + bài + tài liệu, cập nhật tổng"]
    C --> Q["Toast trung thực theo kết quả server"]
    K --> Q
    P --> Q
```

## Flow: Đổi trạng thái buổi (hoàn thành / hủy cả ca) và điểm danh

### Sequence — Đổi trạng thái buổi

```mermaid
sequenceDiagram
    actor T as Giáo viên
    participant C as Modal Quản lý buổi
    participant K as Kernel server
    T->>C: Bấm Hoàn thành (check-in) hoặc Hủy cả ca
    alt Buổi diễn ra sau hôm nay
        C-->>T: Ẩn hành động — "Buổi diễn ra sau hôm nay — Hoàn thành mở khi đến buổi." (E-classes-022)
    else Hôm nay hoặc đã qua
        C->>K: POST sessions/:date/check-in (hoặc cancel) — thân rỗng
        K->>K: Guarded UPDATE mọi dòng "sắp tới" của bucket (lớp + ngày)
        alt Có dòng đã chốt trước đó
            K-->>C: Trả updated + skipped
        end
        alt Hủy
            K->>K: Gửi thông báo thay đổi lịch cho học viên trong buổi (fail-open)
        end
        K-->>C: Kết quả
        C-->>T: Toast "Đã hoàn thành buổi." / "Đã hủy buổi." — kèm "(x/y học viên — z đã chốt)" nếu có
    end
    opt Điểm danh chi tiết cả ca
        T->>C: Đánh dấu từng học viên (có mặt/đi muộn/vắng có phép/vắng không phép)
        C->>K: PUT sessions/:date/attendance
        alt Thiếu học viên / lessonId lạ
            K-->>C: 422 incomplete-roster hoặc unknown-lesson (E-classes-025)
        else Roster đổi giữa lúc đọc và ghi
            K-->>C: 409 roster-changed — cả batch về 0 dòng (E-classes-026)
        else OK
            K->>K: Ghi điểm danh + trạng thái bài theo mapping
            K-->>C: Lưu thành công
        end
    end
```

### Activity — Đổi trạng thái buổi

```mermaid
flowchart TD
    A["Chọn buổi"] --> B{"Ngày buổi <= hôm nay (VN)?"}
    B -->|Không| C["Chặn: Chưa tới ngày học (E-022)"]
    B -->|Có| D{"Hành động?"}
    D -->|Hoàn thành| E["POST check-in — dòng sắp tới thành hoàn thành"]
    D -->|Hủy| F["POST cancel — dòng thành đã hủy + thông báo học viên"]
    D -->|Điểm danh| G{"Đủ roster và id hợp lệ?"}
    G -->|Không| H["422 incomplete-roster / unknown-lesson (E-025)"]
    G -->|Có| I{"Roster còn nguyên khi ghi?"}
    I -->|Không| J["409 roster-changed (E-026) — tải lại và lưu lại"]
    I -->|Có| K["Ghi điểm danh + mapping trạng thái bài"]
    E --> L["Toast trung thực updated/skipped"]
    F --> L
    K --> L
```

## Flow: Gán học viên vào lớp (tóm tắt — chi tiết lifecycle ở feature `enrollment-lifecycle`)

### Sequence — Gán học viên

```mermaid
sequenceDiagram
    actor T as Giáo viên
    participant P as Modal Thêm học viên
    participant K as Kernel server
    T->>P: Mở từ tab Học viên
    P->>K: Đọc danh sách học viên của org
    K-->>P: Danh sách (đã loại người đang học/đang mời ở lớp này)
    alt Không còn ứng viên
        P-->>T: "Tất cả học viên đã được thêm vào lớp."
    else Có ứng viên
        T->>P: Chọn học viên có sẵn (hoặc tạo nhanh học viên mới)
        P->>K: POST /api/classes/:id/enroll
        alt Học viên đã vào lớp (race 2 tab)
            K-->>P: 409 "student already enrolled" (E-classes-029) — modal giữ mở
        else OK
            K->>K: Tạo đăng ký trạng thái được mời (chưa có gói/buổi)
            K-->>P: Thành công
            P-->>T: Toast "Đã thêm {tên} vào lớp" + roster tải lại
        end
    end
```

### Activity — Gán học viên

```mermaid
flowchart TD
    A["Mở modal Thêm học viên"] --> B{"Còn học viên chưa trong lớp?"}
    B -->|Không| C["Hiện Tất cả học viên đã được thêm vào lớp"]
    B -->|Có| D["Chọn học viên có sẵn hoặc tạo mới"]
    D --> E["POST enroll"]
    E --> F{"Đã trùng đăng ký?"}
    F -->|Có| G["409 student already enrolled (E-029) — modal giữ mở"]
    F -->|Không| H["Tạo đăng ký được mời"]
    H --> I["Toast Đã thêm + roster tải lại"]
    I --> J["Kích hoạt sau (active) — thuộc feature enrollment-lifecycle"]
```

> Ranh giới: toàn bộ vòng đời sau khi tạo đăng ký (kích hoạt → sinh chuỗi buổi tự động, hủy mời, chấp nhận từ portal) thuộc feature `enrollment-lifecycle` (/root/projects/teacher-os/docs/project-overview-pdr.md:24).


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
