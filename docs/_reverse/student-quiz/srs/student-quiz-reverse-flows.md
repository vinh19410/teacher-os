---
type: reverse-srs-flows
feature: student-quiz
status: draft
updated: 2026-11-12
---

# student-quiz — Flows tái lập (reverse)

> Quy ước: mọi nhãn đều truy vết được trong code (cite ở `_evidence.md`). Không vẽ bước không có trong code. Trong sơ đồ, văn bản bỏ dấu theo tập ký tự ASCII an toàn cho Mermaid.

## Flow 1: Mở quiz và bắt đầu bài làm (F1 / UC-01)

> Nguồn: [S1] `apps/server/src/routes/student.ts:1333-1549`, [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-62`, [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:110-150`. — ✅

### Sequence — Mở quiz và bắt đầu

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant OV as Dong tong quan
    participant RT as Route /learn/quizzes/:assignmentId
    participant API as API /api/student
    participant DB as D1 quiz_attempt
    HV->>OV: Bam "Lam bai: ..." hoac "Xem lai ket qua: ..."
    OV->>RT: Danh huong sang route quiz
    RT->>API: GET /assignments/:id/quiz
    alt Khong thuoc lop hoac chua toi gio mo
        API-->>RT: 404 assignment not found
        RT-->>HV: Bao khong tim thay bai
    else Co bai
        API-->>RT: De sach + attempt hien tai neu co
        alt Chua co attempt
            RT-->>HV: Card gioi thieu + dialog "Bat dau lam bai"
            HV->>API: POST .../quiz/start
            API->>DB: INSERT attempt + questions_snapshot + answers {}
            API-->>RT: 201 attemptId
        else attempt in_progress
            RT-->>HV: Dialog "Tiep tuc bai lam"
            HV->>API: POST .../quiz/start
            API-->>RT: 200 attemptId cu - resume
        else attempt submitted
            RT->>RT: Xoa mirror localStorage
            RT-->>HV: Danh huong thang man summary
        end
        RT-->>HV: Vao man lam bai
    end
```

### Activity — Mở quiz và bắt đầu

```mermaid
flowchart TD
    A["Bam Lam bai tu dong tong quan"] --> B{"GET quiz tra 404?"}
    B -->|"Co"| C["Bao khong tim thay bai - dung"]
    B -->|"Khong"| D{"Trang thai attempt?"}
    D -->|"Chua co"| E["Dialog Bat dau lam bai"]
    E --> F["POST quiz start"]
    F --> G{"Insert dung unique?"}
    G -->|"Co - race"| H["Re-read - resume attempt thang cuoc 200"]
    G -->|"Khong"| I["201 attemptId moi + snapshot de"]
    D -->|"in_progress"| J["Dialog Tiep tuc bai lam - POST start 200"]
    D -->|"submitted"| K["Xoa mirror - danh huong man summary"]
    I --> L["Vao man lam bai"]
    H --> L
    J --> L
    K --> M["Man summary sau nop"]
```

## Flow 2: Trả lời câu hỏi và tự lưu (F2 / UC-02)

> Nguồn: [S12] `apps/student/src/lib/quiz-attempt-store.ts:108-360`, [S1] `apps/server/src/routes/student.ts:1552-1686`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:495-505`. — ✅

### Sequence — Trả lời và tự lưu

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant V as Man lam bai
    participant S as quiz-attempt-store
    participant LS as localStorage mirror
    participant API as API /api/student
    participant DB as D1 quiz_attempt
    HV->>V: Chon dap an cau q hoac go bai viet
    V->>S: setAnswer q value / setEssay text
    S->>LS: Ghi mirror quiz-attempt:id va :essay
    S->>S: Xep hang + debounce 600ms
    alt Co PATCH dang bay cung cau
        S->>S: Bo qua luot nay - hen gui gia tri moi nhat sau khi xong
    else Khong conflict
        S->>API: PATCH answer q value hoac PATCH essay
        API->>DB: json_set 1 key hoac UPDATE essay WHERE in_progress
        alt ok
            API-->>S: ok - Da luu
            S-->>V: Header hien "Da luu"
        else 401
            S->>S: halt auth - dung may luu
            S-->>V: Banner het han - chuyen dang nhap - bai duoc giu
        else 409
            S->>S: halt submitted
            S-->>V: Bai da nop o cho khac
        else Mat ket noi
            S->>S: Giu pending - thu lai luot sau
        end
    end
    opt Tab dong ho an di
        V->>S: pagehide / visibilitychange
        S->>API: Flush pending voi keepalive
    end
    opt Mo lai bai dang lam
        S->>LS: Doc mirror
        S->>S: Mirror moi hon thang - ghi de server
        S->>API: Drain dong bo lai
    end
```

### Activity — Trả lời và tự lưu

```mermaid
flowchart TD
    A["Sua dap an hoac bai viet"] --> M["Ghi mirror localStorage"]
    M --> D{"Co PATCH dang bay cung cau?"}
    D -->|"Co"| W["Hen gui gia tri moi nhat sau khi request xong"]
    D -->|"Khong"| T["Cho 600ms debounce"]
    W --> T
    T --> G["PATCH answer hoac essay"]
    G --> H{"Ket qua?"}
    H -->|"ok"| I["Da luu - rut khoi hang doi"]
    H -->|"401"| J["halt auth - banner - chuyen dang nhap"]
    H -->|"409"| K["halt submitted"]
    H -->|"mang loi"| L["Giu pending - thu lai luot sau"]
    L --> D
    I --> Z["Cho thay doi tiep"]
    Z --> A
```

## Flow 3: Nộp bài (F3 / UC-03)

> Nguồn: [S1] `apps/server/src/routes/student.ts:1911-2051`, [S17] `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:160-181`, [S16] `apps/student/src/components/quiz/quiz-take-view.tsx:288-310`, [S8] `packages/api/src/lib/grade-quiz.ts:56-72`. — ✅

### Sequence — Nộp bài

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant V as quiz-take-view
    participant DG as Dialog con cau chua lam
    participant API as API /api/student
    participant G as gradeQuiz tu snapshot
    participant TG as class_assignment_target
    participant AI as ai-grading - boundary
    HV->>V: Bam "Nop bai"
    V->>DG: Dem cau chua tra loi
    alt Con cau trong
        DG-->>HV: "Ban con N cau hoi chua lam... Sau khi nop, ban khong the thay doi dap an."
        HV->>DG: Xac nhan nop
    end
    V->>API: POST /attempts/:id/submit
    API->>API: Doc skill - requiresMedia neu speaking
    alt Speaking ma chua co file
        API-->>V: 400 MEDIA_REQUIRED
        V-->>HV: Toast "Ban can tai file bai noi len truoc khi nop"
    else Flip that bai - da nop truoc do
        API-->>V: 409 ATTEMPT_SUBMITTED
        V-->>HV: Thong bao bai da nop
    else Thua CAS media - file vua doi
        API-->>V: 409 MEDIA_CONFLICT
        V-->>HV: Toast "File bai noi vua thay doi - hay thu nop lai"
    else Flip thanh cong
        API->>G: Cham correct/wrong/skipped tu snapshot + answers
        G-->>API: Ket qua + total
        API->>API: db.batch ghi correctCount + stamp TG.submittedAt ISO
        alt Batch that bai ma stamp chua co
            API->>TG: Self-heal - stamp lai idempotent
        end
        opt Bai co phan cham duoc
            API->>AI: scheduleAiGrading - nen background
        end
        API-->>V: 200 correctCount + submittedAt
        V-->>HV: Chuyen man summary
    end
```

### Activity — Nộp bài

```mermaid
flowchart TD
    A["Bam Nop bai"] --> B{"Con cau chua tra loi?"}
    B -->|"Co"| C["Dialog xac nhan voi so cau con lai"]
    C --> D{"Hoc vien xac nhan?"}
    D -->|"Khong"| E["Quay lai lam bai"]
    D -->|"Co"| F["POST submit"]
    B -->|"Khong"| F
    F --> G{"Speaking va chua co file?"}
    G -->|"Co"| H["400 MEDIA_REQUIRED + toast nhac tai file"]
    G -->|"Khong"| I["UPDATE flip in_progress thanh submitted"]
    I --> J{"Flip 0 rows?"}
    J -->|"Co"| K{"Doc lai status?"}
    K -->|"chua nop - thieu file"| H
    K -->|"chua nop - co file"| L["409 MEDIA_CONFLICT"]
    K -->|"da nop"| M["409 ATTEMPT_SUBMITTED"]
    J -->|"Khong - thang CAS"| N["Cham tu snapshot"]
    N --> O["db.batch correctCount + stamp target"]
    O --> P{"Stamp co trong batch?"}
    P -->|"Loi - chua co"| Q["Self-heal stamp lai"]
    P -->|"Co"| R["200 ket qua"]
    Q --> R
    R --> S["Man summary sau nop"]
```

## Flow 4: Xem kết quả và chờ điểm giáo viên (F4 / UC-04)

> Nguồn: [S1] `apps/server/src/routes/student.ts:2053-2405`, [S11] `apps/student/src/lib/repos/quiz.ts:188-248`, [S14] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:126-300`, [S15] `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`. — ✅

### Sequence — Xem kết quả và chờ điểm

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant SM as Man summary
    participant Q as TanStack Query
    participant API as API /api/student
    actor GV as Giao vien - gian tiep
    SM->>API: GET /attempts/:id
    alt Attempt con in_progress
        API-->>SM: 409 attempt not yet submitted
        SM->>SM: Danh huong ve trang truoc
    else Da nop
        API-->>SM: summary - correct/wrong/skipped + tung cau + media/essay
        alt Co grade giao vien roi
            SM-->>HV: Diem + band + nhan xet + highlight bai viet
        else Speaking hoac Writing chua cham
            SM-->>HV: "Da nop - Dang cho giao vien cham"
            loop moi 15 giay toi da 40 lan khi tab mo
                Q->>API: GET summary lai
                API-->>Q: summary moi
            end
            opt GV cham xong trong luc mo trang
                Q-->>SM: grade ve - hien diem + band
            end
        end
        HV->>SM: Bam "Xem chi tiet bai lam"
        SM->>API: GET /attempts/:id/detail
        API-->>SM: De + dap an hoc vien + verdict + giai thich + note
        SM-->>HV: Man xem lai chi tiet
    end
```

### Activity — Xem kết quả và chờ điểm

```mermaid
flowchart TD
    A["Mo man summary sau nop"] --> B{"Attempt da nop?"}
    B -->|"Chua"| C["409 - danh huong ve trang truoc"]
    B -->|"Roi"| D{"Co grade giao vien?"}
    D -->|"Co"| E["Hien diem + band + nhan xet"]
    D -->|"Chua co"| F{"Bai co phan cham tay?"}
    F -->|"Khong"| G["Hien ket qua tu cham - dung"]
    F -->|"Co"| H["Nhan Da nop - Dang cho giao vien cham"]
    H --> I{"Con duoi 40 lan poll?"}
    I -->|"Co"| J["Poll moi 15 giay"]
    J --> K{"Grade da ve?"}
    K -->|"Chua"| I
    K -->|"Roi"| E
    I -->|"Het"| L["Dung poll - hoc vien tai lai trang khi quay lai"]
    E --> M{"Bam xem chi tiet?"}
    M -->|"Co"| N["GET detail - man xem lai"]
    M -->|"Khong"| O["Ve dong tong quan - Xem lai ket qua"]
    N --> O
```

## Flow 5: Tải lên và nghe lại file bài nói (F5 / UC-05)

> Nguồn: [S1] `apps/server/src/routes/student.ts:1691-1909`, [S18] `apps/student/src/components/quiz/speaking-submission-panel.tsx:316-578` + `apps/student/src/components/quiz/speaking-upload-state.ts:14-110`, [S19] `apps/student/src/components/quiz/quiz-media-player.tsx`, [S26] `apps/server/src/lib/r2-media-store.ts:14-48`. — ✅

### Sequence — File bài nói

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant P as Speaking panel
    participant ST as speaking-upload-state
    participant API as API /api/student
    participant R2 as R2 bucket
    HV->>P: Keo tha hoac chon file
    P->>P: Kiem tra MIME allowlist + ten file
    P->>ST: state uploading - tien do XHR
    ST->>API: PUT /attempts/:id/media - raw body + X-File-Name
    alt Thieu Content-Length hoac file rong
        API-->>ST: 411 / 400 empty file
    else Vuot 50MB
        API-->>ST: 413
    else MIME khong hop le
        API-->>ST: 415
    else Ten file khong hop le
        API-->>ST: 400 invalid file name
    else Hop le
        API->>R2: put object key moi - stream + FixedLengthStream
        API->>API: CAS ghi DB media_* theo key cu WHERE in_progress
        alt Thua CAS - bai da nop hoac file doi tab khac
            API->>R2: Xoa object moi - bu
            API-->>ST: 409 ATTEMPT_SUBMITTED hoac MEDIA_CONFLICT
            ST->>P: Refetch trang thai media
        else Thang
            API->>R2: Xoa object cu - best effort background
            API-->>ST: ok - processing xong
        end
    end
    ST-->>P: Thong bao loi theo uploadFailure neu co
    opt Xem lai file
        HV->>P: Bam "Nghe lai bai noi" hoac "Xem lai bai noi"
        P->>API: GET media - fetch blob voi header org
        API-->>P: Stream + nosniff + CSP sandbox + no-store
        P-->>HV: Phat tu blob URL
    end
```

### Activity — File bài nói

```mermaid
flowchart TD
    A["Chon hoac keo tha file"] --> B{"MIME trong allowlist 12 loai?"}
    B -->|"Khong"| C["Tu choi tai client - goi y dinh dang"]
    B -->|"Co"| D["state uploading - XHR tien do"]
    D --> E{"Server tra gi?"}
    E -->|"411 hoac 400 empty"| F["Bao loi file rong hoac thieu do dai"]
    E -->|"413"| G["File vuot qua 50 MB"]
    E -->|"415"| H["Dinh dang khong ho tro"]
    E -->|"400 ten file"| I["File khong hop le - chon file khac"]
    E -->|"409 ATTEMPT_SUBMITTED"| J["Bai da nop - chuyen man summary"]
    E -->|"409 MEDIA_CONFLICT"| K["File vua doi tab khac - refetch"]
    E -->|"ok"| L["put R2 key moi + CAS DB"]
    L --> M{"Thang CAS?"}
    M -->|"Khong"| N["Xoa object moi bu + bao loi"]
    M -->|"Co"| O["Xoa object cu background - state done"]
    O --> P["Nop bai duoc mo khoa"]
    K --> D
    P --> Q{"Hoc vien bam nghe lai?"}
    Q -->|"Co"| R["GET media - blob URL - player"]
    Q -->|"Khong"| S["Dung"]
    R --> S
```
