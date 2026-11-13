---
type: reverse-srs-flows
feature: auth-signin
updated: 2026-11-11
---

# auth-signin — Flows tái lập (reverse)

Mọi bước vẽ đều có trong code (không vẽ bước suy đoán). Đường dẫn tính từ gốc repo.

## Flow: F1 — Đăng nhập email/mật khẩu

### Sequence — F1 Đăng nhập email/mật khẩu
```mermaid
sequenceDiagram
    actor U as Nguoi dung
    participant W as Web /login
    participant A as Better-Auth (bien /api/auth)
    U->>W: Nhap email + mat khau, bam Dang nhap
    W->>W: Kiem tra bat buoc tung truong (thieu thi bao ngay, khong kiem do dai mat khau)
    alt Thieu du lieu
        W-->>U: "Email is required" / "Password is required" / "Invalid email address"
    else Du lieu du
        W->>A: sign-in/email (email da trim)
        alt Server tu choi
            A-->>W: loi dang nhap
            W-->>U: Toast "Couldn't sign you in. Check your email and password, then try again."
        else Server OK nhung khong co phien
            W->>A: doc phien tang 2
            W-->>U: Toast "We couldn't start your session. Please try signing in again."
        else OK co phien
            W->>W: Kiem tra phien tang 2 (OK)
            W->>W: validateReturnUrl (khong hop le ve /dashboard)
            W-->>U: Chuyen den trang dich (mac dinh /dashboard)
        end
    end
```

### Activity — F1 Đăng nhập email/mật khẩu
```mermaid
flowchart TD
    A["Nguoi dung nhap email + mat khau"] --> B{"Du du lieu?"}
    B -->|"Khong"| E1["Bao loi tuyeng theo truong (E-SIGNIN-001..003)"]
    B -->|"Co"| C["Goi dang nhap, email da trim"]
    C --> D{"Ket qua?"}
    D -->|"Tu choi"| E2["Toast chung, khong lo truong nao sai (E-SIGNIN-004)"]
    D -->|"OK nhung mat phien"| E3["Bao mat phien (E-SIGNIN-005)"]
    D -->|"OK co phien"| F["Kiem duyet returnUrl (duong dan cung app)"]
    F --> G["Chuyen trang dich, mac dinh /dashboard"]
```

Nguồn: `apps/web/src/components/sign-in-form.tsx:32-66`, `apps/web/src/lib/sign-in-schema.ts:3-17`, `apps/web/src/lib/kernel-load-state.ts:149,175-212`.

## Flow: F2 — Đăng nhập Google OAuth

### Sequence — F2 Đăng nhập Google OAuth
```mermaid
sequenceDiagram
    actor U as Nguoi dung
    participant W as Web /login
    participant A as Better-Auth
    participant G as Google
    U->>W: Bam nut Google
    W->>A: sign-in/social (callbackURL = origin hien tai + returnUrl hop le)
    A->>A: Dong dau "cong" vao OAuth state truoc khi dan sang Google
    A->>G: Dan sang Google (bat buoc chon tai khoan moi lan)
    U->>G: Chon tai khoan Google
    G->>A: Callback GET (khong co Origin, doc state)
    A->>A: Phan loai cong tu state → gan vai luc tao user
    alt Vai khong khop cong
        A-->>G: Chuyen ve /login kem error=ROLE_MISMATCH (khong tao phien)
        G->>W: Mo /login?error=ROLE_MISMATCH
        W-->>U: Toast cau tieng Viet tu server (chi tin ma ROLE_MISMATCH)
    else Vai khop
        A->>G: Tao phien (cookie)
        G->>W: Ve callbackURL
        W-->>U: Vao vung lam viec
    end
    Note over A,G: Neu callback kem ma loi khac → toast "Đăng nhập Google thất bại. Vui lòng thử lại."
```

### Activity — F2 Đăng nhập Google OAuth
```mermaid
flowchart TD
    A["Bam nut Google"] --> B["Server dong dau cong vao state"]
    B --> C["Google hoi chon tai khoan"]
    C --> D{"Vai tu origin khop cong?"}
    D -->|"Khong"| E1["Chan tao phien, chuyen ve /login?error=ROLE_MISMATCH (E-SIGNIN-006..008)"]
    D -->|"Co"| F["Tao phien, cookie phien"]
    F --> G["Ve callbackURL, vao vung lam viec"]
    C --> H["Nguoi dung huy / loi Google"]
    H --> I["Ve /login kem ma loi, toast chung (E-SIGNIN-009)"]
```

Nguồn: `packages/auth/src/index.ts:248-257,335-364,440-497,501-538`, `apps/web/src/components/google-oauth-button.tsx:44-58`, `apps/web/src/routes/login.tsx:51-61`.

## Flow: F3 — Quên / đặt lại mật khẩu

### Sequence — F3 Quên/đặt lại mật khẩu
```mermaid
sequenceDiagram
    actor U as Nguoi dung
    participant W as Web forgot/reset
    participant A as Better-Auth
    participant M as Mail (Resend)
    U->>W: Nhap email, bam gui link
    W->>A: forget-password (redirectTo cung origin)
    A-->>W: Phan hoi trung tinh (khong bac email ton tai)
    A->>M: Thu "Đặt lại mật khẩu Cô Mỹ Dạy Tiếng Anh của bạn" (han 1 gio, chay nen)
    M-->>A: OK / thu lai 1 lan khi 429-5xx
    W-->>U: "If an account exists for that email, we sent a reset link. It expires in 1 hour."
    U->>W: Mo link, nhap mat khau moi (toi thieu 8) + go lai
    W->>A: reset-password (token)
    alt Token khong hop le
        A-->>W: INVALID_TOKEN
        W-->>U: "This reset link is invalid or has expired." (ket thuc luong)
    else Loi mang-5xx-429
        W-->>U: "Couldn't update your password. Try again." (giu token, thu lai tren cung form)
    else OK
        A->>A: Thu hoi toan bo phien cu
        W-->>U: Thong bao thanh cong, dang nhap lai
    end
```

### Activity — F3 Quên/đặt lại mật khẩu
```mermaid
flowchart TD
    A["Nhap email"] --> B["Gui yeu cau, tra loi trung tinh"]
    B --> C["Thu co hieu luc 1 gio"]
    C --> D{"Nhan link trong 1 gio?"}
    D -->|"Het han / sai"| E1["This reset link is invalid or has expired. (E-SIGNIN-022)"]
    D -->|"Con"| F["Nhap mat khau moi >= 8 ky tu + go lai"]
    F --> G{"Khop va token OK?"}
    G -->|"Lech"| E2["Passwords do not match (E-SIGNIN-024)"]
    G -->|"OK"| H["Doi mat khau + thu hoi phien cu"]
    F --> I["Gui lai lan thu >= 2 trong 60 giay"]
    I --> J["Nut bi vo hieu hoa 60 giay, 429 thi bao rieng (E-SIGNIN-020)"]
```

Nguồn: `packages/auth/src/index.ts:258-297`, `apps/web/src/components/auth/forgot-password-form.tsx:13-50`, `apps/web/src/components/auth/reset-password-form.tsx:14-29,42-75`, `packages/auth/src/mail/reset-password-email-template.ts`.

## Flow: F4 — Xác thực email (tạo tài khoản → bấm link)

### Sequence — F4 Xác thực email
```mermaid
sequenceDiagram
    actor U as Nguoi dung
    participant W as Web
    participant A as Better-Auth
    participant M as Mail
    U->>W: Dang ky (co bat) hoac duoc tao tai khoan
    A->>M: Tu gui thu "Xác thực email Cô Mỹ Dạy Tiếng Anh của bạn" (han 1 gio)
    Note over A: Gui that bai tren duong tao tai khoan thi KHONG chan viec tao (tha thu); gui lai thi bao loi ro (bao to)
    M-->>U: Thu chua link xac thuc
    U->>A: Bam link (verify-email)
    alt Token hop le, cung cong
        A->>A: emailVerified = true + TU DANG NHAP (tao phien)
        A-->>U: Ve /verify-email?verified=ok, vao lam viec duoc
    else Token hong / het han / da dung
        A-->>U: /verify-email chi con error → "This link didn't work" + gui lai link
    else Cheo vai (link dung cho cong khac)
        A-->>U: Chuyen ve /login?error=ROLE_MISMATCH, khong tao phien
    end
```

### Activity — F4 Xác thực email
```mermaid
flowchart TD
    A["Tai khoan duoc tao"] --> B["Tu gui thu xac thuc 1 gio"]
    B --> C{"Nguoi dung bam link"}
    C -->|"Token OK, dung cong"| D["Da xac thuc + tu dang nhap"]
    C -->|"Token hong"| E1["This link didn't work + nut gui lai (E-SIGNIN-025)"]
    C -->|"Cheo vai"| E2["Ve /login?error=ROLE_MISMATCH (E-SIGNIN-006..008)"]
    D --> F["Vao vung lam viec"]
    E1 --> G["Gui lai link, OK thi thu moi"]
    G -->|"Da xac thuc truoc do"| H["Bao da xac thuc, tai lai trang"]
```

Nguồn: `packages/auth/src/index.ts:298-326,501-538`, `apps/web/src/components/verify-email-view.tsx:29-67,96-127`, `packages/auth/src/auth-verification-email.test.ts:34-143`, `packages/auth/src/auth-verify-email-role.test.ts:77-113`.

## Flow: F5 — Chặn chéo vai trò (học viên vào trang giáo viên → 403)

### Sequence — F5 Chặn chéo vai trò học viên
```mermaid
sequenceDiagram
    actor U as Hoc vien
    participant W as Web giao vien /login
    participant A as Better-Auth
    participant K as API giao vien (kernel)
    U->>A: Dang nhap email-mat khau tai trang giao vien
    A->>A: Tang 1 — tao phien: vai student khong khop → 403, KHONG tao phien
    A-->>W: Thong diep "Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên."
    W-->>U: Toast nguyen van cau tren (E2E kiem chu dung)
    Note over U,K: Neu hoc vien da co phien tu truoc (cookie chung cheo sub-domain)
    U->>K: Goi API giao vien voi phien student
    K->>K: Tang 2 — bootstrap middleware: 403 ACCOUNT_STUDENT_ROLE, khong tao to chuc
    K-->>W: 403 ma ACCOUNT_STUDENT_ROLE
    W->>W: Doi toan bo vung lam viec bang man bi chan "Đây là tài khoản học viên" (danh dau 1 lan)
    W-->>U: Man chan + nut Dang xuat (hoac gui lai xac thuc neu la giao vien chua verify)
```

### Activity — F5 Chặn chéo vai trò học viên
```mermaid
flowchart TD
    A["Hoc vien dang nhap trang giao vien"] --> B{"Tang 1 — vai khop cong?"}
    B -->|"Khong"| C["403, khong tao phien, toast cau VI (E-SIGNIN-006)"]
    B -->|"Co phien cu (cookie chung)"| D{"Tang 2 — API kernel"}
    D -->|"student"| E["403 ACCOUNT_STUDENT_ROLE, khong sinh to chuc (E-SIGNIN-010)"]
    D -->|"teacher ngoai allowlist"| F["403 ACCOUNT_TEACHER_NOT_ALLOWED (E-SIGNIN-012)"]
    D -->|"teacher chua verify"| G["403 ACCOUNT_TEACHER_EMAIL_UNVERIFIED (E-SIGNIN-013)"]
    E --> H["UI: man bi chan "Đây là tài khoản học viên" + Dang xuat"]
    F --> H
    G --> I["Man chan nhanh chua verify + gui lai email xac thuc"]
    C --> J["Huong dan sang cong hoc vien"]
```

Nguồn: `packages/auth/src/index.ts:92-99,501-538`, `apps/server/src/app.ts:206-269`, `apps/web/src/lib/query-client.ts:31-47`, `apps/web/src/lib/role-block.ts:12-22`, `apps/web/src/lib/data-provider.tsx:73-76`, `apps/web/src/components/account-blocked-view.tsx:40-160`, `apps/e2e/specs/account-role-separation.spec.ts:63-157`.

Điểm chưa chắc chắn: mã `ACCOUNT_ADMIN_ROLE` (quản trị chạm API giáo viên) không nằm trong danh sách UI chuyển màn chặn tại `apps/web/src/lib/repos/kernel.ts:718-726` → 🟡 (G-5). Nền service giới hạn đặt lại mật khẩu 3 lần/60 giây chỉ được biết qua comment và nhánh 429 → 🔵 (I-2). OTP chỉ có UI ở cổng học viên; giao viên không có đường OTP → 🟡 (OQ-007).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
