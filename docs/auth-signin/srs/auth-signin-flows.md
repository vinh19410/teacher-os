---
type: srs-flows
feature: auth-signin
updated: 2026-11-12
---

# auth-signin — Sơ đồ luồng nghiệp vụ (Sequence & Activity Flows)

Tài liệu mô hình hóa 5 luồng tương tác chính từ `docs/auth-signin/srs/auth-signin-spec.md` (Mục 9), đối chiếu trực tiếp tới các yêu cầu `FR-auth-signin-*` và mã lỗi `E-auth-signin-*`.

---

## Flow: F1 — Đăng nhập bằng email và mật khẩu
__Trigger__: Người dùng nhập email và mật khẩu trên trang `/login` rồi bấm Đăng nhập
__Related UC__: [[../usecases/uc-signin-email-password.md]]
__Related FR__: FR-auth-signin-001, FR-auth-signin-002, FR-auth-signin-003, FR-auth-signin-004, FR-auth-signin-008, FR-auth-signin-009, FR-auth-signin-021, FR-auth-signin-022, FR-auth-signin-023
__Related E__: E-auth-signin-001, E-auth-signin-002, E-auth-signin-003, E-auth-signin-004, E-auth-signin-005, E-auth-signin-006, E-auth-signin-008, E-auth-signin-012, E-auth-signin-013, E-auth-signin-029

### Sequence — F1 Đăng nhập bằng email và mật khẩu

```mermaid
sequenceDiagram
    actor U as Giao vien
    participant W as Ung dung Giao vien (/login)
    participant S as He thong Xac thuc va Du lieu

    U->>W: Nhap email va mat khau, bam Dang nhap
    W->>W: Cat khoang trang email, kiem tra bat buoc va dinh dang email
    alt Thieu truong hoac sai dinh dang email
        W-->>U: Bao loi duoi truong nhap (E-auth-signin-001..003)
    else Du lieu hop le
        W->>S: Gui yeu cau dang nhap email va mat khau
        alt Sai thong tin hoac loi mang
            S-->>W: Tu choi xac thuc
            W-->>U: Thong bao chung tieng Viet (E-auth-signin-004)
        else Sai vai tro cong (Hoc vien hoac Quan tri)
            S-->>W: Tu choi khoi tao phien
            W-->>U: Thong bao huong dan dung cong (E-auth-signin-006 / E-auth-signin-008)
        else Xac thuc hop le va dung vai Giao vien
            S-->>W: Xac nhan dang nhap va cap phien lam viec
            W->>S: Kiem tra xac nhan phien buoc hai
            alt Khong ghi nhan duoc phien lam viec
                W-->>U: Thong bao loi khoi tao phien (E-auth-signin-005)
            else Phien hop le
                W->>W: Kiem duyet returnUrl (chi nhan duong dan noi bo)
                W->>S: Nap khong gian lam viec trung tam
                S->>S: Tu khoi tao trung tam neu la lan dau Giao vien truy cap
                S-->>W: Du lieu khong gian lam viec
                W-->>U: Dieu huong vao returnUrl hoac /dashboard
            end
        end
    end
```

### Activity — F1 Đăng nhập bằng email và mật khẩu

```mermaid
flowchart TD
    A["Người dùng nhập email + mật khẩu và bấm Đăng nhập"] --> B{"Đủ trường bắt buộc và email đúng định dạng?"}
    B -->|"Không"| E1["Hiển thị lỗi dưới trường nhập (E-auth-signin-001..003)"]
    B -->|"Có"| C["Cắt khoảng trắng + chuẩn hóa chữ thường email và gửi xác thực"]
    C --> D{"Kết quả đối chiếu xác thực?"}
    D -->|"Sai thông tin / lỗi kết nối"| E2["Hiện một thông báo chung duy nhất (E-auth-signin-004)"]
    D -->|"Tài khoản lệch vai trò cổng"| E3["Không tạo phiên, báo chuyển đúng cổng (E-auth-signin-006 / 008)"]
    D -->|"Đúng thông tin + đúng vai Giáo viên"| F{"Kiểm tra xác nhận phiên bước hai?"}
    F -->|"Không thấy phiên"| E4["Báo không thể khởi tạo phiên làm việc (E-auth-signin-005)"]
    F -->|"Có phiên hợp lệ"| G{"Giáo viên đủ điều kiện truy cập trung tâm?"}
    G -->|"Ngoài danh sách / chưa xác thực email"| E5["Chuyển sang màn hình bị chặn (E-auth-signin-012..013)"]
    G -->|"Hợp lệ"| H["Tự tạo trung tâm nếu chưa có + kiểm duyệt returnUrl nội bộ"]
    H --> I["Vào trang đích nội bộ hoặc /dashboard"]
```

---

## Flow: F2 — Đăng nhập bằng tài khoản Google (Google OAuth)
__Trigger__: Người dùng bấm nút Đăng nhập bằng Google trên trang `/login`
__Related UC__: [[../usecases/uc-signin-google-oauth.md]]
__Related FR__: FR-auth-signin-005, FR-auth-signin-006, FR-auth-signin-007, FR-auth-signin-008, FR-auth-signin-009, FR-auth-signin-019, FR-auth-signin-020, FR-auth-signin-021
__Related E__: E-auth-signin-006, E-auth-signin-007, E-auth-signin-008, E-auth-signin-009, E-auth-signin-012, E-auth-signin-013, E-auth-signin-016, E-auth-signin-017, E-auth-signin-018

### Sequence — F2 Đăng nhập bằng Google OAuth

```mermaid
sequenceDiagram
    actor U as Giao vien
    participant W as Ung dung Giao vien (/login)
    participant S as He thong Xac thuc
    participant G as Dich vu Dinh danh Google

    U->>W: Bam nut Dang nhap bang Google
    W->>S: Yeu cau bat dau luong Google (kem returnUrl noi bo)
    S->>S: Ghi dau cong ung dung khoi phat vao phien giao dich
    S-->>U: Chuyen sang Google (bat buoc hien man chon tai khoan)
    U->>G: Chon tai khoan Google va xac nhan
    alt Nguoi dung huy hoac Google bao loi
        G-->>W: Quay ve /login kem ma loi
        W-->>U: Thong bao chung Dang nhap Google that bai (E-auth-signin-009)
    else Google xac thuc thanh cong
        G->>S: Tra ket qua ve he thong
        S->>S: Doc dau cong khoi phat de phan loai cong (khong nhan dien -> Hoc vien)
        alt Tao moi nhung vi pham danh sach email cho phep
            S-->>W: Tu choi tao tai khoan (E-auth-signin-016..018)
            W-->>U: Hien thi thong bao tu choi tuong ung
        else Tai khoan da co nhung vai tro khong khop cong
            S-->>W: Chuyen ve /login kem ma sai vai tro (khong tao phien)
            W-->>U: Hien thi thong bao sai vai tro tu he thong (E-auth-signin-006..008)
        else Hop le (tao moi dung vai hoac gop tai khoan da xac minh)
            S-->>W: Tao phien lam viec va chuyen ve duong dan dich
            W-->>U: Mo khong gian lam viec trung tam
        end
    end
```

### Activity — F2 Đăng nhập bằng Google OAuth

```mermaid
flowchart TD
    A["Người dùng bấm nút Đăng nhập bằng Google"] --> B["Hệ thống ghi dấu cổng khởi phát vào giao dịch"]
    B --> C["Google hiển thị màn bắt buộc chọn tài khoản"]
    C --> D{"Người dùng hoàn tất trên Google?"}
    D -->|"Hủy hoặc lỗi Google"| E1["Quay về /login, hiện thông báo lỗi chung (E-auth-signin-009)"]
    D -->|"Hoàn tất"| F["Hệ thống đọc lại dấu cổng (không rõ cổng -> mặc định Học viên)"]
    F --> G{"Tài khoản mới hay đã tồn tại?"}
    G -->|"Tài khoản mới"| H{"Thỏa danh sách email được phép của cổng?"}
    H -->|"Không"| E2["Từ chối tạo tài khoản (E-auth-signin-016..018)"]
    H -->|"Có"| I["Gán vai cố định 1 lần theo cổng"]
    G -->|"Trùng email mật khẩu sẵn có"| J{"Cả hai phía đã xác minh email?"}
    J -->|"Chưa"| E1
    J -->|"Đã xác minh"| K["Gộp chung vào một hồ sơ người dùng"]
    I --> L{"Vai trò tài khoản khớp cổng hiện tại?"}
    K --> L
    L -->|"Không khớp"| E3["Chặn tạo phiên, về /login báo sai vai trò (E-auth-signin-006..008)"]
    L -->|"Khớp"| M{"Thỏa danh sách email được phép hiện hành?"}
    M -->|"Đã bị gỡ khỏi danh sách"| E4["Hiện màn hình bị chặn (E-auth-signin-012)"]
    M -->|"Thỏa điều kiện"| N["Tạo phiên làm việc và đưa vào không gian làm việc"]
```

---

## Flow: F3 — Quên và đặt lại mật khẩu
__Trigger__: Người dùng nhập email tại màn `/forgot-password` để yêu cầu đặt lại mật khẩu
__Related UC__: [[../usecases/uc-reset-password.md]]
__Related FR__: FR-auth-signin-014, FR-auth-signin-015, FR-auth-signin-024
__Related E__: E-auth-signin-001, E-auth-signin-003, E-auth-signin-019, E-auth-signin-020, E-auth-signin-021, E-auth-signin-022, E-auth-signin-023, E-auth-signin-024

### Sequence — F3 Quên và đặt lại mật khẩu

```mermaid
sequenceDiagram
    actor U as Khach chua dang nhap
    participant W as Man Quen va Dat lai mat khau
    participant S as He thong Xac thuc
    participant M as Dich vu Gui thu dien tu

    U->>W: Nhap email tai /forgot-password va bam Gui yeu cau
    alt Bo trong email hoac sai dinh dang
        W-->>U: Bao loi duoi o email (E-auth-signin-001 / E-auth-signin-003)
    else Email dung dinh dang
        W->>S: Gui yeu cau dat lai mat khau cung cong
        alt Vuot qua 3 lan trong 60 giay
            S-->>W: Tu choi do vuot nguong tan suat
            W-->>U: Bao doi 1 phut roi thu lai (E-auth-signin-020)
        else Loi he thong luc gui bieu mau
            S-->>W: Bao loi xu ly
            W-->>U: Bao khong the gui email dat lai (E-auth-signin-021)
        else Tiep nhan hop le
            S-->>W: Phan hoi trung tinh tuc thi (<= 150ms)
            W-->>U: Hien thong bao trung tinh (E-auth-signin-019) va khoa nut gui lai 60 giay
            opt Email ton tai va vai tro khop cong yeu cau
                S->>M: Chuyen phat thu dat lai mat khau (hieu luc 1 gio, thu lai 1 lan neu ban)
                M-->>U: Gui thu chua lien ket dat lai mat khau
            end
        end
    end

    U->>W: Mo lien ket /reset-password, nhap mat khau moi (>= 8 ky tu) va nhap lai
    alt Mat khau ngan hon 8 ky tu hoac nhap lai lech
        W-->>U: Bao loi duoi truong nhap (E-auth-signin-024)
    else Du dieu kien do dai va trung khop
        W->>S: Gui yeu cau cap nhat mat khau moi kem ma lien ket
        alt Lien ket het han 1 gio, da dung hoac khong hop le
            S-->>W: Tu choi ma lien ket
            W-->>U: Dong bieu mau va bao lien ket het han (E-auth-signin-022)
        else Loi mang hoac may chu tam thoi
            S-->>W: Loi tam thoi
            W-->>U: Giu ma lien ket tren bieu mau de thu lai (E-auth-signin-023)
        else Cap nhat thanh cong
            S->>S: Luu mat khau moi va thu hoi toan bo phien cu tren moi thiet bi
            S-->>W: Xac nhan thanh cong
            W-->>U: Thong bao thanh cong va chuyen ve /login de dang nhap lai
        end
    end
```

### Activity — F3 Quên và đặt lại mật khẩu

```mermaid
flowchart TD
    A["Nhập email tại /forgot-password và gửi yêu cầu"] --> A1{"Email không rỗng và đúng định dạng?"}
    A1 -->|"Không"| E0["Hiện lỗi dưới ô email (E-auth-signin-001 / E-auth-signin-003)"]
    A1 -->|"Có"| B{"Vượt ngưỡng 3 lần / 60 giây?"}
    B -->|"Có"| E1["Hiện thông báo chờ 1 phút (E-auth-signin-020)"]
    B -->|"Lỗi gửi trực tiếp"| E2["Hiện lỗi không thể gửi yêu cầu (E-auth-signin-021)"]
    B -->|"Hợp lệ"| C["Hiện ngay thông báo trung tính (E-auth-signin-019) + khóa nút 60 giây"]
    C --> D{"Email tồn tại và đúng vai trò cổng?"}
    D -->|"Không"| Z["Bỏ qua gửi thư ở nền (không lộ ra giao diện)"]
    D -->|"Có"| F["Gửi thư nền chứa liên kết hiệu lực 1 giờ"]
    F --> G["Người dùng mở liên kết /reset-password"]
    G --> H{"Liên kết còn hạn 1 giờ và chưa dùng?"}
    H -->|"Hết hạn / đã dùng / hỏng"| E3["Kết thúc biểu mẫu, báo liên kết hết hạn (E-auth-signin-022)"]
    H -->|"Còn hiệu lực"| I["Nhập mật khẩu mới (>= 8 ký tự) và xác nhận lại"]
    I --> J{"Đủ độ dài và hai ô trùng khớp?"}
    J -->|"Không"| E4["Báo lỗi tại trường nhập (E-auth-signin-024)"]
    J -->|"Có"| K{"Lưu mật khẩu mới thành công?"}
    K -->|"Lỗi mạng tạm thời"| E5["Giữ nguyên biểu mẫu để thử lại (E-auth-signin-023)"]
    K -->|"Thành công"| L["Hủy mã liên kết + thu hồi toàn bộ phiên cũ + về /login"]
```

---

## Flow: F4 — Xác thực địa chỉ email và gửi lại liên kết
__Trigger__: Tài khoản mới được tạo tự động phát thư xác thực hoặc người dùng bấm liên kết xác thực email
__Related UC__: [[../usecases/uc-verify-email.md]]
__Related FR__: FR-auth-signin-008, FR-auth-signin-013, FR-auth-signin-016, FR-auth-signin-024
__Related E__: E-auth-signin-013, E-auth-signin-025, E-auth-signin-026, E-auth-signin-027

### Sequence — F4 Xác thực địa chỉ email

```mermaid
sequenceDiagram
    actor U as Giao vien
    participant W as Ung dung Giao vien
    participant S as He thong Xac thuc
    participant M as Dich vu Gui thu dien tu

    S->>M: Tu dong phat thu xac thuc (han 1 gio) ngay khi tao tai khoan
    Note over S,M: Neu loi gui thu luc tao tai khoan thi van giu tai khoan vua tao
    M-->>U: Thu xac thuc dia chi email

    U->>S: Bam lien ket xac thuc trong thu
    alt Lien ket hong hoac qua 1 gio
        S-->>W: Chuyen toi /verify-email kem trang thai loi
        W-->>U: Hien man Lien ket khong kha dung va nut Gui lai (E-auth-signin-025)
        opt Nguoi dung bam Gui lai lien ket va gap loi
            W->>S: Yeu cau gui lai thu xac thuc
            S-->>W: Loi dich vu gui thu
            W-->>U: Bao loi ro rang khong the gui lien ket moi (E-auth-signin-026)
        end
    else Lien ket hop le nhung mo cheo sang cong sai vai tro
        S->>S: Van danh dau Da xac thuc email nhung chan tao phien sai cong
        S-->>W: Chuyen toi trang ket qua kem co loi ROLE_MISMATCH
        W-->>U: Hien man thong bao va loi ve dang nhap dung cong (E-auth-signin-025)
    else Lien ket hop le va dung vai tro cong
        S->>S: Danh dau Da xac thuc email va tu dong tao phien dang nhap
        S-->>W: Chuyen toi /verify-email xac nhan thanh cong
        W-->>U: Hien trang xac nhan thanh cong kem nut vao khong gian lam viec
    end
```

### Activity — F4 Xác thực địa chỉ email

```mermaid
flowchart TD
    A["Tài khoản mới tạo -> hệ thống tự gửi thư xác thực 1 giờ"] --> B["Người dùng mở liên kết xác thực"]
    B --> C{"Trạng thái liên kết và vai trò cổng?"}
    C -->|"Hỏng / quá hạn 1 giờ"| E1["Hiện màn liên kết không khả dụng + nút Gửi lại (E-auth-signin-025)"]
    C -->|"Hợp lệ nhưng chéo vai trò cổng"| E2["Đánh dấu Đã xác thực email + chặn tạo phiên + báo lỗi (E-auth-signin-025)"]
    C -->|"Hợp lệ + đúng cổng"| D["Đánh dấu Đã xác thực email + tự động tạo phiên làm việc"]
    D --> F["Hiện trang xác nhận /verify-email kèm nút vào không gian làm việc"]
    E1 --> G["Người dùng bấm Gửi lại liên kết (từ /verify-email hoặc màn bị chặn)"]
    G --> H{"Kết quả gửi lại?"}
    H -->|"Tài khoản đã xác thực rồi"| I["Tự động tải lại trang vào không gian làm việc"]
    H -->|"Lỗi gửi thư"| E3["Báo lỗi gửi lại rõ ràng (E-auth-signin-026 / E-auth-signin-027)"]
    H -->|"Thành công"| J["Phát thư xác thực mới hiệu lực 1 giờ"]
```

---

## Flow: F5 — Chặn chéo vai trò 3 lớp giữa các cổng ứng dụng
__Trigger__: Người dùng đăng nhập tại cổng sai vai trò hoặc mở cổng ứng dụng khác bằng phiên dùng chung
__Related UC__: [[../usecases/uc-role-cross-block.md]]
__Related FR__: FR-auth-signin-008, FR-auth-signin-009, FR-auth-signin-010, FR-auth-signin-011, FR-auth-signin-012, FR-auth-signin-013, FR-auth-signin-017
__Related E__: E-auth-signin-006, E-auth-signin-007, E-auth-signin-008, E-auth-signin-010, E-auth-signin-011, E-auth-signin-012, E-auth-signin-013, E-auth-signin-014, E-auth-signin-015, E-auth-signin-028

### Sequence — F5 Chặn chéo vai trò (Học viên vào ứng dụng giáo viên & các cổng chéo)

```mermaid
sequenceDiagram
    actor U as Nguoi dung lech vai tro
    participant W as Giao dien Ung dung Giao vien
    participant A as Lop Khoi tao Phien
    participant K as Cong Du lieu Giao vien

    alt Truong hop 1 - Dang nhap truc tiep tai cong sai vai tro
        U->>W: Gui dang nhap tai /login ung dung giao vien bang tai khoan Hoc vien
        W->>A: Yeu cau khoi tao phien
        A->>A: Lop 1 phat hien vai student khong khop cong Giao vien
        A-->>W: Tu choi khoi tao phien
        W-->>U: Thong bao chuyen sang cong hoc vien (E-auth-signin-006)
    else Truong hop 2 - Da co san phien chung tren mien phu va mo ung dung giao vien
        U->>W: Mo ung dung giao vien voi phien san co
        W->>K: Goi du lieu khong gian lam viec
        K->>K: Lop 2 kiem tra vai tro, danh sach email va trang thai xac thuc email
        alt Phien Hoc vien
            K-->>W: Tu choi ACCOUNT_STUDENT_ROLE (khong khoi tao trung tam)
            W->>W: Lop 3 chuyen mot lan sang man hinh bi chan
            W-->>U: Man bi chan Day la tai khoan hoc vien + nut Dang xuat (E-auth-signin-010)
        else Giao vien ngoai danh sach cho phep
            K-->>W: Tu choi ACCOUNT_TEACHER_NOT_ALLOWED
            W-->>U: Man bi chan bao khong co quyen + nut Dang xuat (E-auth-signin-012)
        else Giao vien chua xac thuc email
            K-->>W: Tu choi ACCOUNT_TEACHER_EMAIL_UNVERIFIED
            W-->>U: Man bi chan kem nut Gui lai xac thuc va Kiem tra lai (E-auth-signin-013)
        else Phien Quan tri vien
            K-->>W: Tu choi ACCOUNT_ADMIN_ROLE, khong tra du lieu (E-auth-signin-011)
        end
    end
```

### Activity — F5 Chặn chéo vai trò giữa 3 cổng

```mermaid
flowchart TD
    A["Yêu cầu truy cập vào một trong 3 cổng ứng dụng"] --> B{"Đang ở bước tạo phiên hay gọi dữ liệu?"}
    B -->|"Bước tạo phiên / gọi OTP"| C{"Phương thức và vai trò có khớp cổng?"}
    C -->|"Giáo viên / Quản trị gọi OTP"| End1["Chặn gửi và xác minh OTP (E-auth-signin-028)"]
    C -->|"Lệch vai trò cổng"| End2["Từ chối tạo phiên, báo đúng cổng (E-auth-signin-006..008)"]
    C -->|"Khớp vai trò cổng"| End0["Cho phép khởi tạo phiên làm việc"]
    B -->|"Bước gọi dữ liệu khi đã có phiên"| D{"Cổng đích đang được gọi?"}
    D -->|"Cổng Học viên"| F{"Vai trò là Học viên?"}
    F -->|"Không"| End3["Từ chối dữ liệu cổng học viên (E-auth-signin-014)"]
    F -->|"Có"| EndF["Cho phép truy cập cổng học viên"]
    D -->|"Cổng Quản trị"| G{"Vai Quản trị + đã xác thực email + trong danh sách quản trị?"}
    G -->|"Thiếu bất kỳ điều kiện nào"| End4["Từ chối tức thì trên từng yêu cầu (E-auth-signin-015)"]
    G -->|"Đủ cả 3 điều kiện"| EndG["Cho phép truy cập cổng quản trị"]
    D -->|"Ứng dụng Giáo viên"| H{"Kiểm tra điều kiện Giáo viên"}
    H -->|"Vai Học viên"| End5["Chặn dữ liệu + hiện màn bị chặn Học viên + nút Đăng xuất (E-auth-signin-010)"]
    H -->|"Email ngoài danh sách giáo viên"| End6["Chặn dữ liệu + hiện màn không có quyền + nút Đăng xuất (E-auth-signin-012)"]
    H -->|"Chưa xác thực email"| End7["Chặn dữ liệu + hiện màn gửi lại thư xác thực (E-auth-signin-013)"]
    H -->|"Vai Quản trị"| End8["Chặn dữ liệu và không tạo trung tâm (E-auth-signin-011)"]
    H -->|"Giáo viên hợp lệ + đã xác thực email"| EndH["Cho phép vào không gian làm việc trung tâm"]
```

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
