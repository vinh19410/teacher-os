# exam-import-ai — Reverse Flows

Mỗi flow có CẢ sequenceDiagram (tác nhân) LẪN flowchart (nhánh quyết định). Nhánh lỗi AI vẽ đúng theo code. Lưu ý mô hình: KHÔNG có hàng đợi — request POST giữ mở tối đa 120s; "chờ — xem kết quả" là mở lại `?job=` (GET job) và sweep lười chạy ở request kế tiếp (xem F7).

## F1 — Nhập đề bằng AI (hạnh phúc)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant UI as Man Nhap de AI
    participant API as POST /api/exam-imports
    participant WAL as Vi Credit
    participant AI as Workers AI
    participant R2 as Kho file MEDIA

    GV->>UI: chon tep PDF/anh
    UI->>UI: kiem tep tai cho (MIME, 15MB, 20 trang, mat khau)
    UI->>UI: SHA-256 + GET lookup
    API->>API: kiem MIME, size khai bao, byte that, PDF sau (unpdf)
    API->>API: quet job treo + tra trung fingerprint
    API->>WAL: tao vi lazy + INSERT job processing
    API->>WAL: reserve 5 Credit (held +5)
    alt thieu Credit
        API->>API: xoa job + xoa file R2
        API-->>UI: 402 E-001 (balance, available)
        UI-->>GV: hop thoai Het Credit
    else reserve thanh cong
        API->>R2: put file exam-imports/org/job
        API->>AI: toMarkdown + run json_schema (timeout 120s)
        alt extract hop le (co nhom cau hop le)
            API->>WAL: settle 5 Credit (balance -5)
            API->>API: mark completed + draft_json (needsReview server tinh)
            API-->>UI: 200 job DTO
            UI-->>GV: doi chieu 2 cot, URL ?job=<id>, vi refresh
        else AI loi / timeout / 0 cau hop le
            API->>WAL: release 5 Credit (hoan)
            API->>API: mark failed_refunded E-004 + reason
            API-->>UI: 502 E-004 (reason, jobId)
            UI-->>GV: panel that bai + nut Thu boc tach lai AI
        end
    end
```

```mermaid
flowchart TD
    A["GV chọn tệp"] --> B{"Client kiểm tệp đạt?"}
    B -->|"Không"| B1_stop["Alert E-003, không gọi API"]
    B -->|"Có"| C["SHA-256 + lookup trùng"]
    C --> D{"Server thấy trùng?"}
    D -->|"Có"| D1_done["Banner trùng + mở lại nháp cũ, 0 Credit"]
    D -->|"Không"| E["POST raw-body tệp"]
    E --> F{"Server kiểm đạt? (MIME, size, byte, PDF)"}
    F -->|"Không"| F1_stop["400 E-003, không job, không giữ Credit"]
    F -->|"Có"| G["INSERT job processing + reserve 5 Credit"]
    G --> H{"Đủ Credit khả dụng?"}
    H -->|"Không"| H1_stop["Xóa job + file R2, 402 E-001"]
    H -->|"Có"| I["Put file R2, gọi AI timeout 120s"]
    I --> J{"Bóc tách hợp lệ?"}
    J -->|"Có"| K["Settle 5 Credit, job completed + draft"]
    K --> L_done["Đối chiếu 2 cột, URL ?job=<id>"]
    J -->|"Không"| M["Release 5 Credit, job failed_refunded"]
    M --> N_that_bai["502 E-004 + nút Thử bóc tách lại AI"]
```

## F2 — Chặn tệp không hợp lệ, 2 lớp (E-003)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant DZ as Dropzone
    participant API as POST /api/exam-imports

    GV->>DZ: chon tep 21 trang / 18MB / co mat khau / sai dinh dang
    DZ->>DZ: checkExamFile (pdfjs)
    DZ-->>GV: alert E-003 + ly do cu the, KHONG goi API
    GV->>API: (goi thang API bo qua client)
    API->>API: kiem MIME + Content-Length + byte that
    API->>API: unpdf: so trang / mat khau / hong
    API-->>GV: 400 E-003 (reason) — khong job, khong log, khong file
```

```mermaid
flowchart TD
    A["Tệp vào"] --> B{"MIME thuộc PDF/PNG/JPEG?"}
    B -->|"Không"| Z["reason type"]
    B -->|"Có"| C{"size vượt 15 MB?"}
    C -->|"Có"| Z2["reason size"]
    C -->|"Không"| D{"Là PDF?"}
    D -->|"Không (ảnh)"| OK_done["Đạt — 1 trang"]
    D -->|"Có"| E{"pdfjs/unpdf parse được?"}
    E -->|"Không"| Z3["reason type (hỏng)"]
    E -->|"Có"| F{"Có mật khẩu?"}
    F -->|"Có"| Z4["reason password"]
    F -->|"Không"| G{"Số trang vượt 20?"}
    G -->|"Có"| Z5["reason pages"]
    G -->|"Không"| OK_done
    Z --> H_stop["Chặn: client không POST; server 400 E-003 trước tạo job/giữ Credit"]
    Z2 --> H_stop
    Z3 --> H_stop
    Z4 --> H_stop
    Z5 --> H_stop
```

## F3 — Thiếu Credit (E-001) + reserve thua

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant UI as Man import
    participant API as Route import
    participant WAL as Vi Credit

    GV->>UI: upload tep hop le
    UI->>API: POST raw-body
    API->>API: kiem tep + tra trung + INSERT job processing
    API->>WAL: reserve 5 Credit
    WAL-->>API: InsufficientCreditsError (guard balance - held >= 5)
    API->>API: DELETE job row (+ xoa file R2 voi POST)
    API->>WAL: doc vi (balance, held)
    API-->>UI: 402 E-001 (balance, available)
    UI-->>GV: modal "Khong du Credit" — Dong / Soan de thu cong
```

```mermaid
flowchart TD
    A["Reserve 5 Credit"] --> B{"balance - held >= 5?"}
    B -->|"Không"| C["InsufficientCreditsError"]
    C --> D{"Đang ở luồng nào?"}
    D -->|"POST"| E["Xóa job row + xóa file R2"]
    D -->|"Retry"| F["Chỉ xóa job row mới, giữ file job cũ"]
    E --> G["402 E-001 kèm balance + available"]
    F --> G
    G --> H["Modal 'Không đủ Credit'"]
    H --> I{"Người dùng chọn?"}
    I -->|"Đóng"| J_done["Về màn import (idle)"]
    I -->|"Soạn đề thủ công"| K_exit["Điều hướng tests/new"]
    B -->|"Có"| L_done["Tiếp tục bóc tách (F1)"]
```

## F4 — AI thất bại → hoàn Credit → Thử bóc tách lại AI (E-004)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant UI as Panel loi
    participant JOB as runImport
    participant WAL as Vi Credit
    participant R2 as Kho file

    JOB->>JOB: AI loi / timeout 120s / 0 cau hop le
    JOB->>WAL: release 5 Credit (log released +5)
    JOB->>JOB: mark failed_refunded E-004 + reason (update co dieu kien processing)
    JOB-->>UI: 502 E-004 (reason, jobId)
    UI-->>GV: thong diep E-004 + nhan ly do + nut "Thu boc tach lai AI"
    GV->>UI: bam retry
    UI->>R2: POST /:id/retry (server doc lai file cu)
    alt job khong o failed_refunded
        R2-->>UI: 409 not_retryable
    else file mat tren R2
        R2-->>UI: 410 file_missing
    else dung dieu kien
        R2->>R2: tao JOB MOI dung lai fileKey + fingerprint (putFile false)
        R2->>WAL: reserve lai 5 Credit
        R2->>R2: extract lai → settle hoac release nhu F1
        R2-->>UI: 200 job DTO moi
    end
```

```mermaid
flowchart TD
    A["Extract lỗi / timeout / 0 câu hợp lệ"] --> B["Release 5 Credit"]
    B --> C["Mark failed_refunded + E-004 + reason"]
    C --> D["UI panel lỗi + nút retry"]
    D --> E{"Người dùng bấm retry?"}
    E -->|"Không"| F_done["Nhập đề mới / rời màn"]
    E -->|"Có"| G{"Job còn failed_refunded?"}
    G -->|"Không"| H_stop["409 not_retryable"]
    G -->|"Có"| I{"File còn trên R2?"}
    I -->|"Không"| J_stop["410 file_missing"]
    I -->|"Có"| K["Job mới + reserve lại + extract lại"]
    K --> L{"Kết quả?"}
    L -->|"Thành công"| M_done["Settle + completed (F1)"]
    L -->|"Thất bại"| A
```

## F5 — Phát hiện tệp trùng, 0 Credit (lookup + POST) + mở lại bản nháp

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant UI as Man import
    participant LOOK as GET /exam-imports/lookup
    participant POST as POST /exam-imports

    GV->>UI: tha tep da tung nhap
    UI->>UI: SHA-256 tep (fail thi upload thang — fail-open)
    UI->>LOOK: ?fingerprint=<hex64>
    alt lookup tra duplicate
        LOOK-->>UI: jobId, title, completedAt
        UI-->>GV: banner trung + nut "Mo lai ban nhap cu (0 Cr)"
        GV->>UI: bam mo lai
        UI->>UI: navigate ?job=<jobId cu> (khong clone)
    else lookup null hoac loi
        UI->>POST: upload thuong
        POST->>POST: fingerprint server-side, tra trung TRUOC ensureWallet/reserve
        alt server thay trung (job completed co draft)
            POST-->>UI: 200 duplicateOf — khong AI, khong job, khong R2, khong vi
            UI-->>GV: banner trung giong luong lookup
        else khong trung
            POST-->>UI: job DTO (F1)
        end
    end
```

```mermaid
flowchart TD
    A["Tệp được chọn"] --> B{"Hash SHA-256 thành công?"}
    B -->|"Không"| E["Upload thẳng (fail-open)"]
    B -->|"Có"| C{"Lookup thấy trùng?"}
    C -->|"Có"| D["Banner trùng + Mở lại (0 Cr)"]
    C -->|"Không / lỗi"| E
    E --> F{"POST thấy trùng? (completed + draft đọc được)"}
    F -->|"Có"| D
    F -->|"Không"| G_done["Chạy import bình thường (F1)"]
    D --> H{"Mở lại?"}
    H -->|"Có"| I_done["?job=<jobId cũ> — đọc draft hiện tại"]
    H -->|"Không"| J_stop["Ở lại màn trống"]
```

## F6 — Chỉnh sửa → xác nhận rà soát → xuất bản vào Ngân hàng đề

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant UI as Panel ben phai
    participant DRAFT as PATCH /:id/draft
    participant PUB as POST /:id/publish
    participant BANK as Ngan hang de

    GV->>UI: sua ten/ky nang/thoi gian/passage/cau (0 Credit)
    UI->>DRAFT: {draft}
    DRAFT->>DRAFT: merge bao toan confidence + needsReview goc
    DRAFT-->>UI: 200 job DTO ("Da luu ban nhap (0 Credit).")
    UI->>UI: reviewCount > 0 → khoa nut "Luu vao Ngan hang de" + hop kiem xac nhan
    GV->>UI: tich "Toi da kiem tra va xac nhan (N cau)"
    UI->>PUB: {draft, reviewConfirmed: true}
    PUB->>PUB: gate 2 lop: max(count draft merge, count draft DB) > 0 va chua xac nhan → 422
    PUB->>PUB: mixed → 422; vuot slot → 422; cau loi → 422 (partIndex, questionIndex)
    PUB->>BANK: 1 batch: prompt tung part + test + test part + update job (id tinh dinh)
    alt skill listening
        BANK-->>UI: testId + status draft ("can bo sung file nghe")
    else ky nang khac
        BANK-->>UI: testId + status ready
    end
    UI->>UI: refresh kernel → navigate /assignments/tests/<testId>
```

```mermaid
flowchart TD
    A["Draft có needsReview?"] --> B{"reviewCount > 0?"}
    B -->|"Không"| D["Không hiện hộp kiểm, nút mở sẵn"]
    B -->|"Có"| C{"Đã tích xác nhận?"}
    C -->|"Chưa"| C1["Khóa nút Xuất bản (aria-describedby lý do)"]
    C -->|"Có"| D
    C1 --> C
    D --> E{"Server gate (max nhãn client, DB)"}
    E -->|"Còn nhãn, chưa xác nhận"| F_stop["422 REVIEW_CONFIRMATION_REQUIRED"]
    E -->|"Đạt"| G{"Skill mixed?"}
    G -->|"Có"| H_stop["422 SKILL_MIXED_NOT_ALLOWED"]
    G -->|"Không"| I{"Part vượt slot preset?"}
    I -->|"Có"| J_stop["422 TOO_MANY_PARTS"]
    I -->|"Không"| K{"Câu hợp lệ? (stem, answer, opts)"}
    K -->|"Không"| L_stop["422 INVALID_DRAFT (partIndex, questionIndex)"]
    K -->|"Có"| M["Batch: prompt + test + parts + update job"]
    M --> N{"Skill?"}
    N -->|"listening"| O_done["status draft + báo cần file nghe"]
    N -->|"khác"| P_done["status ready"]
    M --> Q{"Job đã có publishedTestId?"}
    Q -->|"Có, draft không đổi"| R_done["Trả testId cũ, không nhân bản"]
    Q -->|"Có, draft đổi"| S_done["Cập nhật tại chỗ test cũ"]
    Q -->|"Chưa"| T_done["Tạo test-import-<jobId>"]
```

## F7 — Dọn job treo (lazy sweep, không cron)

```mermaid
sequenceDiagram
    participant REQ as Request bat ky (POST/GET job/GET vi)
    participant SW as releaseStaleImports
    participant WAL as Vi Credit
    participant JOB as exam_import_job

    REQ->>SW: chay dau request (cung org)
    SW->>JOB: select processing co started_at < now - 150s (toi da 20 job)
    alt khong co job treo
        SW-->>REQ: tra ve ngay
    else co job treo
        SW->>WAL: kiem log settle exam_import:id:settle
        alt settle da ton tai (crash sau settle)
            SW->>JOB: mark completed (khong hoan tien — da tru that)
        else chua settle
            SW->>WAL: release held (idempotency key chan hoan 2 lan)
            alt release thanh cong
                SW->>JOB: mark failed_refunded E-004 reason timeout
            else held da nha (luong khac dang xu ly)
                SW->>SW: bo qua, luong do tu chot
            end
        end
    end
```

```mermaid
flowchart TD
    A["Request chạm ví/job (cùng org)"] --> B{"Có job processing quá 150s?"}
    B -->|"Không"| C["Không làm gì"]
    B -->|"Có"| D{"Sổ cái đã có settle cho job?"}
    D -->|"Có"| E["Mark completed (crash-sau-settle)"]
    D -->|"Không"| F["Release held theo job.heldCredits"]
    F --> G{"Release thành công?"}
    G -->|"Có"| H["Mark failed_refunded, reason timeout"]
    G -->|"Không (held đã nhả)"| I["Bỏ qua — luồng khác đang xử lý"]
    E --> J_done["Tiếp tục request chính"]
    H --> J_done
    I --> J_done
    C --> J_done
```
