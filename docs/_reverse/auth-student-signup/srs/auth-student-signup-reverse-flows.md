---
type: reverse-srs-flows
feature: auth-student-signup
updated: 2026-11-11
---

# auth-student-signup — Flows tái lập (reverse)

> Mỗi flow: sequence + flowchart. Chỉ vẽ bước có trong code; suy đoán ghi 🔵/🟡.

## Flow: F1 — Đăng ký email + mật khẩu → xác thực email → tự đăng nhập

### Sequence — F1 Đăng ký và xác thực

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant UI as Cổng học viên
    participant AUTH as Auth API
    participant MAIL as Dịch vụ mail
    HV->>UI: Điền tên, email, mật khẩu ở tab Đăng ký
    UI->>UI: Kiểm tra tên >= 2, email hợp lệ, mật khẩu >= 8
    UI->>AUTH: POST /api/auth/sign-up/email (callbackURL /verify-email?verified=ok)
    AUTH->>AUTH: Tạo USER, role = student theo origin
    AUTH->>MAIL: Gửi mail "Xác thực email Cô Mỹ Dạy Tiếng Anh của bạn" (hiệu lực 1 giờ)
    Note over AUTH,MAIL: Lỗi gửi mail lúc đăng ký chỉ ghi log - đăng ký vẫn thành công
    AUTH-->>UI: Đăng ký thành công
    HV->>MAIL: Mở mail, bấm nút xác thực
    MAIL-->>AUTH: GET /api/auth/verify-email?token
    AUTH->>AUTH: Đánh dấu emailVerified = true
    AUTH->>AUTH: Tạo phiên (auto sign-in sau xác thực)
    AUTH-->>UI: Chuyển về /verify-email?verified=ok - màn xác nhận thành công
```

### Activity — F1

```mermaid
flowchart TD
    A["Học viên mở tab Đăng ký"] --> B{"Form hợp lệ<br/>tên >= 2, email đúng, mật khẩu >= 8"}
    B -->|Không| E1["Báo lỗi ngay dưới ô nhập"]
    B -->|Có| C["POST sign-up/email"]
    C --> D{"Server chấp nhận"}
    D -->|Email đã tồn tại| E2["Báo lỗi tài khoản tồn tại"]
    D -->|OK| F["Tạo USER role student<br/>gửi mail xác thực 1 giờ"]
    F --> G["Học viên mở mail bấm link"]
    G --> H{"Token còn hạn"}
    H -->|Hết hạn| I["Bấm gửi lại link xác thực"]
    H -->|Còn| J["emailVerified = true<br/>tự tạo phiên"]
    J --> K["Về /verify-email?verified=ok<br/>màn xác nhận thành công"]
```

- Nguồn chính: packages/auth/src/index.ts:298-326 (sendOnSignUp, autoSignInAfterVerification, expiresIn 3600); apps/student/src/components/auth/sign-up-form.tsx:43 (callbackURL); apps/student/src/components/auth/verify-email-view.tsx:25 (điều kiện thành công); apps/e2e/specs/student-portal-email-verification.spec.ts:30-133. ✅
- Gửi lại link: POST /send-verification-email — lỗi được ném về client (khác đường sign-up nuốt lỗi). ✅ packages/auth/src/index.ts:299-322

## Flow: F2 — Đăng nhập Google lần đầu (cổng học viên)

### Sequence — F2 Google lần đầu

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant UI as Cổng học viên
    participant AUTH as Auth API
    participant GG as Google
    HV->>UI: Bấm nút Tiếp tục với Google
    UI->>AUTH: POST /api/auth/sign-in/google
    AUTH-->>HV: Chuyển sang trang chọn tài khoản Google
    HV-->>AUTH: Chọn tài khoản và đồng ý
    AUTH->>GG: Xác minh mã ủy quyền
    GG-->>AUTH: Hồ sơ Google (email, tên)
    AUTH->>AUTH: user.create.before - role = student theo origin portal
    AUTH->>AUTH: Tạo ACCOUNT google + phiên đăng nhập
    AUTH-->>UI: Về cổng học viên (lỗi thì về /login kèm error)
    Note over UI: Nếu lần đầu - luồng F3 sẽ tự tạo hồ sơ khi gọi API portal
```

### Activity — F2

```mermaid
flowchart TD
    A["Bấm Google ở trang login"] --> B["POST sign-in/google"]
    B --> C{"Google xác minh thành công"}
    C -->|Không| E1["Về /login kèm error<br/>toast Đăng nhập Google thất bại"]
    C -->|Có| D{"USER với email này đã có"}
    D -->|Chưa| E["Tạo USER role student theo origin"]
    D -->|Có rồi| F["Tạo phiên cho USER cũ"]
    E --> G["Tạo ACCOUNT google + phiên"]
    F --> G
    G --> H["Vào cổng - gọi API portal"]
    H --> I["Tiếp tục F3 provisioning nếu chưa có hồ sơ"]
```

- Nguồn chính: apps/student/src/components/auth/google-oauth-button.tsx:48 (errorCallbackURL /login); apps/student/src/routes/login.tsx:59-63 (toast lỗi); packages/auth/src/index.ts:436-498 (role theo origin, chặn allowlist teacher/admin). ✅
- Google có đặt emailVerified cho học viên ngay không — chưa thấy trong code (OQ-4); nếu chưa, portal trả STUDENT_EMAIL_UNVERIFIED. 🟡

## Flow: F3 — Lần đầu vào portal → tự tạo hồ sơ trong org sớm nhất toàn cục

### Sequence — F3 Provisioning lần đầu

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant UI as Cổng học viên
    participant API as /api/student
    participant PRV as Provisioning
    participant DB as CSDL
    HV->>UI: Vào trang tổng quan lần đầu
    UI->>API: GET /api/student/me (cookie phiên)
    API->>API: Kiểm tra role = student và emailVerified
    API->>DB: Tìm hồ sơ theo lower(trim(email)) = email phiên
    alt Đã có hồ sơ
        DB-->>API: Trả hồ sơ hiện có
    else Chưa có hồ sơ
        API->>PRV: provisionStudentForUser
        PRV->>DB: Tìm lời mời pending của email
        alt Có lời mời pending
            Note over PRV,DB: Bỏ qua tự tạo - học viên tự accept lời mời (chuông thông báo)
        else Không có lời mời
            PRV->>DB: Tìm org sớm nhất toàn cục (createdAt ASC, id ASC, limit 1)
            PRV->>DB: Tạo hồ sơ - tên từ tài khoản - SĐT và thông tin PH rỗng
            Note over PRV,DB: Lỗi CSDL chỉ ghi log - không chặn vào portal (fail-open)
            API->>DB: Đọc lại hồ sơ vừa tạo
            DB-->>API: Hồ sơ mới trong org sớm nhất
        end
    end
    API-->>UI: 200 hồ sơ học viên + onboardingCompletedAt
    alt onboardingCompletedAt trống
        UI->>HV: Mở wizard onboarding 5 bước (UC-06)
    else Đã hoàn tất
        UI->>HV: Hiện nội dung tổng quan
    end
```

### Activity — F3

```mermaid
flowchart TD
    A["GET /api/student/me"] --> B{"role = student"}
    B -->|Không| X1["403 ACCOUNT_TEACHER_ROLE - F4"]
    B -->|Có| C{"emailVerified"}
    C -->|Chưa| X2["403 STUDENT_EMAIL_UNVERIFIED<br/>màn gửi lại link xác thực"]
    C -->|Có| D["Tìm hồ sơ theo email lower trim"]
    D --> E{"Số hồ sơ trùng"}
    E -->|Nhiều hơn 1| X3["403 STUDENT_AMBIGUOUS<br/>liên hệ trung tâm"]
    E -->|0| F["Thử tự tạo hồ sơ"]
    F --> G{"Lời mời pending"}
    G -->|Có| H["Bỏ tự tạo<br/>STUDENT_NOT_LINKED kèm hướng dẫn chuông"]
    G -->|Không| I["Chọn org sớm nhất toàn cục"]
    I --> J{"Có org"}
    J -->|Không| K["Bỏ tạo im lặng - trả NOT_LINKED"]
    J -->|Có| L["Tạo hồ sơ tên từ tài khoản<br/>liên hệ rỗng"]
    L --> M{"Lỗi CSDL"}
    M -->|Có| N["Chỉ ghi log - fail-open"]
    M -->|Không| O["Đọc lại hồ sơ"]
    E -->|1| O
    O --> P{"onboardingCompletedAt"}
    P -->|Trống| Q["Wizard onboarding 5 bước"]
    P -->|Có| R["Nội dung tổng quan"]
```

- Nguồn chính: apps/server/src/routes/student.ts:124-210 (guard + provision + requery + chọn org), 500-536 (gate toàn router); apps/server/src/student-provisioning.ts:27-83 (tất cả nhánh); apps/e2e/specs/student-portal-provisioning.spec.ts:11-36. ✅
- "Org sớm nhất" tính TOÀN CỤC (không theo domain email) — code rõ, ý định nghiệp vụ để mở (OQ-5). ✅ (code) / 🟡 (ý định)

## Flow: F4 — Teacher bị chặn vào cổng học viên

### Sequence — F4 Chặn teacher

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant UI as Cổng học viên
    participant AUTH as Auth API
    participant API as /api/student
    GV->>UI: Đăng nhập bằng email teacher ở cổng học viên
    AUTH->>AUTH: session.create.before - role teacher != app student
    alt Đăng nhập tại form
        AUTH-->>UI: Từ chối kèm ROLE_MISMATCH
        UI-->>GV: "Tài khoản giáo viên không thể đăng nhập vào cổng học viên."
    else Đã có phiên (Google hoặc verify-email trễ)
        AUTH-->>UI: Chuyển hướng callbackURL + error=ROLE_MISMATCH
        UI-->>GV: Toast "Đăng nhập Google thất bại. Vui lòng thử lại."
    end
    GV->>API: Gọi API portal với phiên teacher (trường hợp lọt)
    API-->>GV: 403 ACCOUNT_TEACHER_ROLE
    UI-->>GV: Màn "Đây là tài khoản giáo viên" + nút sang cổng giáo viên
```

### Activity — F4

```mermaid
flowchart TD
    A["Teacher chạm cổng học viên"] --> B{"Ở tầng nào"}
    B -->|Form đăng nhập| C{"role khớp app"}
    C -->|Không| D["Từ chối ROLE_MISMATCH<br/>thông điệp theo vai"]
    C -->|Có| W["Đăng nhập bình thường<br/>chuyển F1/F5"]
    B -->|Verify email trễ| E["Redirect callbackURL<br/>error=ROLE_MISMATCH"]
    B -->|API portal| F{"Gate router /api/student"}
    F -->|role != student| G["403 ACCOUNT_TEACHER_ROLE"]
    F -->|role = student| W2["Vào portal bình thường<br/>chuyển F3"]
    G --> H["Kết thúc - màn lỗi 4 trạng thái<br/>nút chuyển sang cổng giáo viên"]
    D --> H
    E --> H
```

- Nguồn chính: packages/auth/src/index.ts:92-99 (2 thông điệp vai), 501-538 (gate + redirect verify-email #299); apps/server/src/routes/student.ts:511-512 (403); apps/student/src/components/overview/student-error-view.tsx:98-103 (màn teacher + nút cổng GV); apps/e2e/specs/account-role-separation.spec.ts:63-157; apps/server/src/role-gates.test.ts:190-283. ✅

## Flow: F5 — Đăng nhập bằng mã OTP email (tab mặc định)

### Sequence — F5 OTP email

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant UI as Form OTP
    participant AUTH as Auth API
    participant MAIL as Dịch vụ mail
    HV->>UI: Nhập email - bấm gửi mã
    UI->>UI: Kiểm tra email hợp lệ (regex)
    UI->>AUTH: POST /api/auth/email-otp/send-verification-otp
    AUTH->>AUTH: Chặn teacher - chặn cooldown 60 giây
    AUTH->>MAIL: Gửi mã 6 số (lưu băm - hiệu lực 5 phút)
    MAIL-->>HV: Mail "Mã có hiệu lực trong 5 phút"
    HV->>UI: Nhập mã 6 số
    UI->>AUTH: POST /api/auth/sign-in/email-otp
    alt Mã sai hoặc hết hạn
        AUTH-->>UI: Lỗi - toast "Mã xác thực không đúng hoặc đã hết hạn."
    else Mã đúng
        AUTH->>AUTH: Đặt emailVerified = true - xóa account mật khẩu chưa xác thực
        AUTH-->>UI: Tạo phiên - vào cổng học viên
        Note over UI: Lần đầu vào portal - tiếp tục F3
    end
```

### Activity — F5

```mermaid
flowchart TD
    A["Tab OTP mặc định"] --> B{"Email hợp lệ"}
    B -->|Không| E1["Báo lỗi dưới ô email"]
    B -->|Có| C["Gửi mã OTP"]
    C --> D{"Teacher hoặc gửi dồn"}
    D -->|Teacher| E2["Tài khoản giáo viên không thể đăng nhập vào cổng học viên"]
    D -->|Dồn 60 giây| E3["Chặn - đếm ngược"]
    D -->|OK| F["Mail mã 6 số hiệu lực 5 phút"]
    F --> G["Nhập mã"]
    G --> H{"Mã đúng còn hạn"}
    H -->|Không| E4["Mã xác thực không đúng hoặc đã hết hạn"]
    H -->|Sai quá nhiều| E5["Vui lòng gửi lại mã mới"]
    H -->|Có| I["emailVerified = true<br/>xóa mật khẩu chưa xác thực"]
    I --> J["Tạo phiên - vào portal"]
```

- Nguồn chính: packages/auth/src/index.ts:564-596 (OTP plugin 300 giây, hashed), 366-424 (block paths + cooldown + chặn teacher); packages/auth/src/auth-email-otp.test.ts:268-317 (chống hijack); apps/server/src/routes/student-auth-otp.test.ts:100-199 (kịch bản A/B/C); apps/student/src/components/auth/otp-sign-in-form.tsx:51-63,87,100-108,129-158 (validate + countdown + 4 nhóm toast); mail wording packages/auth/src/mail/otp-email-template.ts:43,88. ✅
- Ngưỡng "sai quá nhiều lần" server-side không thấy cấu hình (Gap). 🟡

## Flow: F6 — Quên mật khẩu / đặt lại mật khẩu

### Sequence — F6 Quên và đặt lại

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant UI as Form quên/đặt lại
    participant AUTH as Auth API
    participant MAIL as Dịch vụ mail
    HV->>UI: Nhập email ở trang quên mật khẩu
    UI->>AUTH: POST /api/auth/forget-password
    AUTH->>MAIL: Gửi link đặt lại (token hiệu lực 1 giờ)
    AUTH-->>UI: Thông điệp trung tính bất kể email có tồn tại
    UI-->>HV: "Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ."
    HV->>UI: Mở link - nhập mật khẩu mới
    UI->>AUTH: POST /api/auth/reset-password (token, mật khẩu mới)
    alt Token hết hạn hoặc sai
        AUTH-->>UI: INVALID_TOKEN
        UI-->>HV: Màn link không còn hiệu lực
    else Token hợp lệ
        AUTH->>AUTH: Đổi mật khẩu - thu hồi mọi phiên cũ
        AUTH-->>UI: Thành công - mời đăng nhập lại
    end
```

### Activity — F6

```mermaid
flowchart TD
    A["Trang quên mật khẩu"] --> B["Gửi link đặt lại"]
    B --> C{"Mailer trả gì"}
    C -->|Rate limit| E1["Bạn thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại."]
    C -->|Lỗi gửi| E2["Không gửi được email đặt lại. Vui lòng thử lại."]
    C -->|OK| D["Thông điệp trung tính + cooldown 60 giây"]
    D --> F["Mở link nhập mật khẩu mới"]
    F --> G{"Token"}
    G -->|Hết hạn sai| E3["Màn link không còn hiệu lực"]
    G -->|Hợp lệ| H["Đổi mk + thu hồi phiên"]
    H --> I["Về trang đăng nhập"]
```

- Nguồn chính: apps/student/src/components/auth/forgot-password-form.tsx:13-18 (60 giây + 3 thông điệp); apps/student/src/components/auth/reset-password-form.tsx:56-70 (INVALID_TOKEN → InvalidLinkView 63-66); packages/auth/src/index.ts (resetPasswordTokenExpiresIn 3600, revokeSessionsOnPasswordReset); packages/auth/src/auth-reset-password.test.ts. ✅
- TTL phiên sau đặt lại và các trạng thái trung gian khác — repo không mô tả thêm. 🔵
