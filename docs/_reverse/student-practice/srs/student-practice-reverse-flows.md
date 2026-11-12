---
feature: student-practice
type: reverse-srs-flows
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/student-practice-reverse-flows — student-practice

Mỗi luồng có đủ 2 sơ đồ: sequence (tương tác) + flowchart (hoạt động). Số liệu trên nút
lấy từ code thật. Nhãn: ✅ code khẳng định, 🔵 suy luận ≥2 bằng chứng, 🟡 kèm OQ.

## F1 — Xem tổng quan luyện từ vựng

Nguồn: apps/student/src/routes/_auth/practice/vocabulary/index.tsx:1-333;
apps/server/src/routes/vocab.ts:562-743; apps/student/src/lib/repos/vocab.ts:1-234.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant SPA as Trang tong quan
    participant API as Route vocab
    participant DB as D1
    HV->>SPA: mo /practice/vocabulary
    SPA->>API: GET /vocab/overview (key ["student","vocab-overview"])
    API->>DB: doc cards + logs + suggestions + decks
    API->>API: newCount = max(0, wordCount - reviewCount)
    API->>API: dueCount chi dem state review va dueAt <= now
    API->>API: upcomingCount trong cua so 3.600.000 ms
    API->>API: forecast 7 ngay VN + streak + retention %
    API-->>SPA: 200 overview JSON
    SPA->>HV: 5 the chi so + countdown + goi y + luoi bo tu
    SPA->>API: dong ho tick 1s, het han -> refetch
```

```mermaid
flowchart TD
    A["Mo trang tong quan"] --> B["GET overview"]
    B --> C{"Co the den han — state review va dueAt <= now?"}
    C -->|"Co"| D["Hien dong ho dem nguoc + N tu sap den han"]
    C -->|"Khong"| E["An countdown"]
    D --> F{"Co goi y cho xu ly?"}
    E --> F
    F -->|"Co"| G["Danh sach goi y: dong y / an"]
    F -->|"Khong"| H["An khoi goi y"]
    G --> I["Luoi bo tu: nhan nguon Lop / Goi y / Khoa"]
    H --> I
    I --> J{"Co bo tu?"}
    J -->|"Khong"| K["Trang rong: Chua co bo tu dang hoc"]
    J -->|"Co"| L["Xac dinh bo Bat dau tu day"]
```

- ✅ dueCount chỉ đếm thẻ state review (vocab.ts:617-619); cửa sổ upcoming 3.600.000 ms
  (vocab.ts:58, vocab.ts:624-630).
- ✅ Chuỗi ngày theo ngày VN, mốc hôm nay hoặc hôm qua (vocab.ts:666-686).
- ✅ Wording empty: "Chưa có bộ từ đang học" (index.tsx:253-267); lỗi tải
  "Không tải được dữ liệu từ vựng. Vui lòng thử lại." (index.tsx:96-100).
- 🔵 refetch khi hết giờ: onExpired của vocab-countdown (vocab-countdown.tsx:12-24) +
  invalidation qua query key (repos/vocab.ts).

## F2 — Vào bộ từ: cấp thẻ + dữ liệu phiên

Nguồn: apps/server/src/routes/vocab.ts:887-916; apps/server/src/lib/vocab-provision.ts:81-108,
:368-594, :592-756; apps/student/src/routes/_auth/practice/vocabulary/$deckId.tsx:1-224.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant DECK as Trang bo tu
    participant API as Route vocab
    participant PRO as Provision
    participant DB as D1
    HV->>DECK: mo /practice/vocabulary/:deckId
    DECK->>API: GET /vocab/decks/:deckId/session-data
    API->>API: Sec-Fetch-Site cross-site + Origin la -> 403 FORBIDDEN_ORIGIN
    API->>PRO: ensureDeckCards(studentId, orgId, deckId)
    PRO->>PRO: deckId bat dau "libdeck-" -> nhanh thu vien
    alt Deck khong truy cap duoc
        PRO-->>API: null
        API-->>DECK: 404 VOCAB_DECK_NOT_FOUND
        DECK->>HV: "Khong tim thay bo tu vung"
    else Deck hop le
        PRO->>DB: doc toan bo tu cua deck
        PRO->>DB: chen the thieu theo lo <= 10 (INSERT OR IGNORE)
        PRO->>PRO: dueAt moc theo deck.createdAt hoac moc thu vien
        PRO-->>API: deck + cards
        API->>PRO: loadPool (gioi han 100, fallback khoa 50)
        PRO-->>API: pool
        API-->>DECK: 200 {deck, cards, pool}
        DECK->>HV: nut "Bat dau hoc (N)" / "On tap (N)" + "Dot on tiep theo sau ..."
    end
```

```mermaid
flowchart TD
    A["Mo bo tu"] --> B{"Sec-Fetch-Site cross-site?"}
    B -->|"Co, Origin la"| C["403 FORBIDDEN_ORIGIN"]
    B -->|"Khong"| D["ensureDeckCards"]
    D --> E{"deckId la libdeck-?"}
    E -->|"Co"| F["Nhanh thu vien: truy cap theo the da cap"]
    E -->|"Khong"| G{"enrollment active hoac goi y accepted?"}
    F --> H{"Con tu chua co the?"}
    G -->|"Khong"| I["404 VOCAB_DECK_NOT_FOUND"]
    G -->|"Co"| H
    H -->|"Co"| J["Chen the lo <= 10, dueAt neo moc nguon"]
    H -->|"Khong"| K["Giu nguyen the cu"]
    J --> L["loadPool: gom the org + thu vien, dedupe, gioi han 100"]
    K --> L
    L --> M{"Pool < 20?"}
    M -->|"Co"| N["Bu them tu khoa hoc (den 50)"]
    M -->|"Khong"| O["Tra {deck, cards, pool}"]
    N --> O
```

- ✅ Access predicate org deck: enrollment active HOẶC suggestion accepted
  (vocab-provision.ts:81-108); nhánh libdeck- (vocab-provision.ts:374).
- ✅ Chèn lô ≤10 — giới hạn 100 tham số bind của D1 (vocab-provision.ts:24-30); lazy
  INSERT OR IGNORE, race test (vocab.test.ts:304-321).
- ✅ Mốc dueAt org (vocab-provision.ts:419-431), thư viện (vocab-provision.ts:520-532).
- ✅ loadPool gộp + dedupe (vocab-provision.ts:599-608), giới hạn 100 (:686, :698),
  fallback khóa <20 → 50 (:721-740).
- ✅ UI: nút + disabled title "Chưa có từ nào để ôn"/"Đã học hết từ mới"
  ($deckId.tsx:130-176); "Đợt ôn tiếp theo sau X" ($deckId.tsx:123-130).

## F3 — Phiên học từ mới (Learn)

Nguồn: packages/api/src/srs/learn-session.ts:1-444; apps/server/src/routes/vocab.ts:1046-1161;
packages/api/src/srs/scheduler.ts:70-79; apps/student/src/components/vocab/vocab-session-view.tsx:102-334.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant ENG as LearnSession (client)
    participant SPA as View phien
    participant API as Route vocab
    participant DB as D1
    SPA->>ENG: khoi tao tu session-data (queue new dueAt asc, id asc)
    loop Moi tu trong phien
        ENG-->>SPA: buoc intro (the chua lat)
        HV->>SPA: lat the
        ENG-->>SPA: buoc nghe-chon hoac chon-nghia
        HV->>SPA: tra loi
        ENG-->>SPA: dung -> buoc tiep; sai -> thong bao + tu o cuoi hang doi
        ENG-->>SPA: buoc go tu hoac chon tu
        HV->>SPA: tra loi cuoi
        ENG-->>SPA: hoan tat tu -> onCommit(gradeGood = dung ngay lan dau)
        SPA->>API: POST /vocab/learn-commit {clientLogId uuid, cardId, gradeGood, durationMs}
        API->>API: clamp durationMs <= 3.600.000; 404 neu the khong thuoc HV
        API->>API: idempotency theo clientLogId (409 "log id conflict" neu clientLogId thuoc hoc vien khac)
        API->>API: learned(): level 1, state review, dueAt = now + 1 ngay
        API->>DB: batch: ghi log + cap nhat the (nguyen tu)
        API-->>SPA: 200 {card} — race replay tra lai ket qua cu
    end
    ENG-->>SPA: het queue -> tong ket phien
```

```mermaid
flowchart TD
    A["Bat dau phien Learn"] --> B["Hang doi tu moi: sap dueAt roi id, khong cap"]
    B --> C["Buoc intro: the chua lat"]
    C --> D{"HV da lat the?"}
    D -->|"Chua"| E["Chan + nhac lat the truoc khi luyen"]
    E --> C
    D -->|"Roi"| F["Buoc 2: nghe-chon hoac chon-nghia (4 phuong an)"]
    F --> G{"Dung?"}
    G -->|"Sai"| H["Bao Chua dung + day xuong cuoi hang doi"]
    H --> C
    G -->|"Dung"| I["Buoc 3: go tu hoac chon tu"]
    I --> J{"Dung?"}
    J -->|"Sai"| H
    J -->|"Dung"| K{"Dung ngay lan dau o moi buoc?"}
    K -->|"Co"| L["gradeGood = true"]
    K -->|"Khong"| M["gradeGood = false"]
    L --> N["POST learn-commit -> learned(): level 1, +1 ngay, state review"]
    M --> N
    N --> O{"Con tu trong queue?"}
    O -->|"Co"| C
    O -->|"Khong"| P["Tong ket: Da thuoc N tu moi + Dot on tiep theo sau 1d"]
```

- ✅ Chuỗi bước + chặn chưa lật thẻ (learn-session.ts:70-83, learn-session.ts:194-230,
  wording intro tại vocab-session-view.tsx:631-694).
- ✅ gradeGood = first-try-correct, từ chỉ intro thì true (learn-session.ts:376-411,
  contracts.ts:3595-3607).
- ✅ `learned()` luôn về mức 1, 1 ngày, state review (scheduler.ts:70-79); e2e countdown
  /^(1d 0h|23:59)/ + "Đợt ôn tiếp theo sau 1d" (vocab-srs.spec.ts:359-486).
- ✅ Sai → đẩy cuối hàng đợi trong phiên (learn-session.ts:279-302); commit idempotent +
  batch + replay (vocab.ts:1046-1161, vocab.test.ts:421-487, vocab.test.ts:488-539).

## F4 — Phiên ôn tập (Review)

Nguồn: packages/api/src/srs/review-session.ts:1-394; apps/server/src/routes/vocab.ts:918-1044;
packages/api/src/srs/scheduler.ts:27-65.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant ENG as ReviewSession (client)
    participant SPA as View phien
    participant API as Route vocab
    participant DB as D1
    SPA->>ENG: khoi tao tu pool (state review, dueAt asc, xao tron)
    alt Khong con the den han
    HV->>SPA: nhan "On tap" khi dem = 0
    Note over ENG: fallback cho phep on som: lay toan bo pool theo dueAt
    end
    loop Moi the
        ENG-->>SPA: prompt minigame (4 lua chon / go tu / tu danh gia)
        HV->>SPA: tra loi
        ENG-->>SPA: verdic "Chinh xac" / "Chua dung" / "Chua nho"
        SPA->>API: POST /vocab/answer {clientLogId, cardId, correct, durationMs}
        API->>API: clamp durationMs <= 3.600.000
        alt The chua den han (dueAt > now) hoac state new
            API-->>SPA: 200 tra card, KHONG ghi log, KHONG doi lich
        else Den han binh thuong
            API->>API: applyAnswer: dung +1; sai L2-4 giu 1; sai L5 -> warning; sai L5 warning -> L1
            API->>DB: batch log + card
            API-->>SPA: 200 {card} (replay neu rac)
        end
        ENG-->>ENG: sai 5 cau lien tiep -> overlay khich le
        ENG-->>ENG: "Chua nho" lan 1 -> requeue vi tri 4-5, lan 2 -> loai khoi phien (done +1)
    end
    ENG-->>SPA: tong ket phien review
```

```mermaid
flowchart TD
    A["Vao phien Review"] --> B{"Con the den han?"}
    B -->|"Co"| C["Pool: the dueAt <= now, sap dueAt asc, xao tron crypto"]
    B -->|"Khong"| D{"HV nhan On tap?"}
    D -->|"Co"| E["On som: toan bo pool, KHONG ghi lich"]
    D -->|"Khong"| F["Ket thuc"]
    C --> G["Prompt: sinh 3 phuong an nhieu cung deck uu tien"]
    E --> G
    G --> H{"Tra loi?"}
    H -->|"Dung"| I["applyAnswer: level +1 (toi da 5); warning -> ha 1 va tat"]
    H -->|"Sai, L2-L4"| J["level -1"]
    H -->|"Sai, L5 chua warning"| K["Bat warning, on lai sau 1 ngay"]
    H -->|"Sai, L5 dang warning"| L["Rot ve level 1"]
    H -->|"Sai, L1"| M["Giu level 1"]
    I --> N["Sai o level >= 2 -> lapses +1"]
    J --> N
    K --> N
    L --> N
    M --> N
    N --> O{"Sai 5 cau lien tiep?"}
    O -->|"Co"| P["Overlay khich le -> HV dong de tiep tuc"]
    O -->|"Khong"| Q{"Chua nho lan thu 2 cung the?"}
    P --> Q
    Q -->|"Co"| R["Lan 2: loai khoi phien (done +1)"]
    Q -->|"Khong"| R2["Lan 1: chen lai vi tri 4-5"]
    R2 --> S{"Con the?"}
    R --> S
    S -->|"Co"| G
    S -->|"Khong"| T["Tong ket: Da on N tu vung"]
```

- ✅ Pool chỉ state review, sort hạn, fallback ôn sớm (review-session.ts:96-119).
- ✅ Chuyển đổi applyAnswer đủ nhánh (scheduler.ts:27-65) + bất biến warning chỉ ở mức 5
  (schema/vocab.ts:84-94); vectors 14 ca đáp án (level-vectors.json, scheduler.test.ts:14).
- ✅ Cross-session guard: state new hoặc dueAt > now → trả card, không log, không đổi lịch
  (vocab.ts:962-977) — BR-04 🟡 OQ-04.
- ✅ Encouragement 5 (review-session.ts:55, :183-247); forgot-cap 2 + requeue splice(4 +
  rng.nextInt(2)) (:253-286, :368-371); verdict whitelist 3 chuỗi (vocab-feedback-panel.tsx:50-66).
- ✅ Persist lỗi → "Không lưu được kết quả học do lỗi kết nối..." + Thử lại/Bỏ qua
  (vocab-feedback-panel.tsx:92-118).

## F5 — Gợi ý bộ từ của giáo viên

Nguồn: apps/server/src/routes/vocab.ts:744-885; apps/student/src/routes/_auth/practice/vocabulary/index.tsx:55-82;
apps/student/src/components/vocab/vocab-suggestion-list.tsx:93-108.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant SPA as Tong quan
    participant API as Route vocab
    participant DB as D1
    HV->>SPA: xem danh sach goi y (phan cua overview)
    alt Dong y
        SPA->>API: POST /vocab/suggestions/:id/accept
        alt Goi y da an hoac khong ton tai
            API-->>SPA: 404 VOCAB_SUGGESTION_NOT_FOUND
            SPA->>HV: "Khong the mo bo tu goi y. Vui long thu lai."
        else Goi y cho xu ly
            API->>DB: status = accepted, respondedAt = now
            API-->>SPA: 200 {status:"accepted", respondedAt}
        else Da accepted truoc do
            API-->>SPA: 200 idempotent (khong doi gi)
        end
        SPA->>API: invalidate ["student","vocab-overview"]
        SPA->>HV: mo trang bo tu cua goi y
    else An
        SPA->>API: POST /vocab/suggestions/:id/dismiss
        alt Goi y da dong y
            API-->>SPA: 409 VOCAB_SUGGESTION_ALREADY_ACCEPTED
        else Goi y cho xu ly
            API->>DB: status = dismissed, respondedAt = now
            API-->>SPA: 200 {status:"dismissed"}
        end
    end
```

```mermaid
flowchart TD
    A["Nhan goi y giao vien"] --> B{"HV chon?"}
    B -->|"Dong y"| C{"Trang thai goi y?"}
    B -->|"An"| D{"Trang thai goi y?"}
    C -->|"Da an (dismissed) hoac khong ton tai"| E["404 VOCAB_SUGGESTION_NOT_FOUND"]
    C -->|"Cho xu ly"| F["accepted + respondedAt -> mo bo tu"]
    C -->|"Da accepted"| G["200 idempotent, khong doi du lieu"]
    D -->|"Da dong y"| H["409 VOCAB_SUGGESTION_ALREADY_ACCEPTED"]
    D -->|"Cho xu ly"| I["dismissed + respondedAt"]
    D -->|"Da an"| J["200 idempotent"]
    F --> K["Lam moi tong quan"]
    G --> K
    I --> K
    J --> K
```

- ✅ Trạng thái suggestion: pending → accepted | dismissed, kèm respondedAt
  (schema/vocab.ts:159-203, contracts.ts:3469-3491).
- ✅ Accept: 404 khi thiếu/đã dismissed (vocab.ts:773-781), idempotent khi đã accepted
  (:783-796). Dismiss: 409 khi accepted (vocab.ts:857-865).
- ✅ Wording lỗi client: "Không thể mở bộ từ gợi ý. Vui lòng thử lại." (index.tsx:61-63),
  "Không thể ẩn gợi ý. Vui lòng thử lại." (index.tsx:77-79).
- 🔵 Sau accept client mở thẳng trang bộ từ (index.tsx:55-63 navigate) + invalidate overview.

## F6 — Khóa học từ vựng thư viện

Nguồn: apps/server/src/routes/vocab.ts:353-561; apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx:1-227;
apps/student/src/routes/_auth/practice/vocabulary/courses/$courseId.tsx:1-266; packages/db/src/schema/vocab-library.ts:1-83.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant CAT as Danh muc khoa hoc
    participant DET as Chi tiet khoa
    participant API as Route vocab
    participant DB as D1
    HV->>CAT: mo /practice/vocabulary/courses
    CAT->>API: GET /vocab/library/courses?page&search (debounce, 12/trang)
    API->>DB: doc khoa thu vien + dem learned/due per khoa
    API-->>CAT: 200 danh muc
    CAT->>HV: luoi khoa hoc
    HV->>DET: chon khoa
    DET->>API: GET /vocab/library/courses/:courseId/decks
    alt Khoa khong ton tai
        API-->>DET: 404 LIBRARY_COURSE_NOT_FOUND
        DET->>HV: "Khong tim thay bai hoc phu hop."
    else Khoa co
        API-->>DET: 200 decks cua khoa
        DET->>HV: auto-scroll 1 lan den bai "Bat dau tai day"
    end
    HV->>API: mo bo tu khoa -> chay F2 (nhanh libdeck-, cap the lan dau)
```

```mermaid
flowchart TD
    A["Mo danh muc"] --> B["Tim kiem debounce + phan trang 12 khoa / trang"]
    B --> C{"Co khoa khop?"}
    C -->|"Khong"| D["Khong tim thay khoa hoc tu vung phu hop."]
    C -->|"Co"| E["Chon khoa"]
    E --> F{"Khoa ton tai?"}
    F -->|"Khong"| G["404 LIBRARY_COURSE_NOT_FOUND"]
    F -->|"Co"| H["Hien cac bo theo khoa"]
    H --> I{"Da co bo Bat dau tai day?"}
    I -->|"Co"| J["Auto-scroll 1 lan"]
    I -->|"Khong"| K["Hien binh thuong"]
    J --> L["Mo bo tu -> F2 cap the (moc thu vien)"]
    K --> L
```

- ✅ Danh mục 12/trang (contracts.ts:2238), search debounce (courses/index.tsx:44-57),
  empty "Không tìm thấy khóa học từ vựng phù hợp." (:104-115).
- ✅ 404 LIBRARY_COURSE_NOT_FOUND (vocab.ts:461-469); chi tiết empty "Không tìm thấy bài
  học phù hợp." ($courseId.tsx:180-190); auto-scroll "Bắt đầu tại đây" ($courseId.tsx:74-95).
- ✅ Tiền tố dự phòng libcourse-/libdeck-/libword- (contracts.ts:3137-3147); khóa học
  dùng chung, không gắn org (schema/vocab-library.ts:1-83, migration 0037).
- 🟡 Truy cập bộ thư viện = đã có thẻ cấp cho học viên đó; "đăng ký" ngầm định là lần mở
  bộ từ đầu tiên — không có nút đăng ký tách biệt (liên quan OQ-10; xem BR-09/OQ-06 về mốc).

## F7 — Phát âm thanh

Nguồn: apps/server/src/routes/vocab.ts:167-287, :1163-1245;
apps/student/src/components/vocab/vocab-pronunciation-buttons.tsx:1-119.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant SPA as Nut phat am
    participant API as Route vocab
    participant SRC as Nguon am thanh
    participant DB as D1
    HV->>SPA: nhan "Nghe" / "Nghe cham 0.6x"
    SPA->>API: GET /vocab/audio/:wordId
    alt wordId la libword-
        API->>DB: doc vocab_library_word.audio_url (join card cua chinh HV)
    else Tu cua to chuc
        API->>DB: doc audioKey / audioUrl (kiem tra truy cap deck)
        alt Co audioKey
            API->>SRC: kho media (R2-compatible) — thieu cau hinh -> 503
        else Co audioUrl
            API->>SRC: proxyRemoteAudio
        end
    end
    SRC-->>API: buffer audio
    API->>API: https + host allowlist, <=3 redirect, audio/*, <=5MB, timeout 10s
    API-->>SPA: 200 buffer (nosniff + sandbox, cache private 1 ngay)
    SPA->>HV: phat (0.6x preservesPitch cho che do cham)
```

```mermaid
flowchart TD
    A["GET /vocab/audio/:wordId"] --> B{"wordId bat dau libword-?"}
    B -->|"Co"| C{"HV co the cua tu nay (join card)?"}
    C -->|"Khong / khong co audioUrl"| D["404 VOCAB_AUDIO_NOT_FOUND"]
    C -->|"Co"| E["proxyRemoteAudio(audioUrl)"]
    B -->|"Khong"| F{"Deck thuoc truy cap cua HV?"}
    F -->|"Khong"| D
    F -->|"Co"| G{"audioKey co khong?"}
    G -->|"Co"| H{"Kho media da cau hinh?"}
    H -->|"Khong"| I["503 media storage unavailable"]
    H -->|"Co"| J["Doc object kho media"]
    G -->|"Khong, co audioUrl"| E
    G -->|"Khong co ca hai"| D
    E --> K{"https + host trong allowlist?"}
    K -->|"Khong"| D
    K -->|"Co"| L{"<=3 redirect, deu host cho phep?"}
    L -->|"Khong"| D
    L -->|"Co"| M{"audio/* va <=5MB?"}
    M -->|"Khong"| D
    M -->|"Co"| N["200 buffer + nosniff + sandbox"]
    J --> N
```

- ✅ Allowlist 2 host cố định, timeout 10 s, ≤3 redirect (vocab.ts:167-176); mọi nhánh lỗi
  upstream đồng nhất 404 (vocab.ts:177-287) — INF-3.
- ✅ libword- join thẻ của chính học viên (chống đọc chéo) (vocab.ts:1221-1228); org word
  qua access predicate (vocab.ts:1173-1192); 503 khi thiếu store (vocab.ts:1183-1190).
- ✅ Nút "Nghe" / "Nghe chậm" 0.6x preservesPitch (vocab-pronunciation-buttons.tsx:7-20).

## F8 — Duyệt catalog luyện đề và bắt đầu đề (phân hệ B)

Nguồn: apps/server/src/routes/student-practice.ts:229-364, :412-470;
apps/student/src/routes/_auth/practice/$skill.tsx:1-191;
apps/student/src/components/practice/skill-catalog.tsx:1-197; apps/student/src/lib/repos/student.ts:521-620.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant CAT as Catalog $skill
    participant API as Route practice
    participant DB as D1
    HV->>CAT: mo /practice/reading?collection=&q=&page=
    CAT->>API: GET /practice?skill=reading
    alt skill la hoac page < 1
        API-->>CAT: 400 invalid skill / invalid page
    else Hop le
        API->>DB: assignment_test status ready + org + co part
        API->>DB: instr(lower(title), q) > 0, collection bang nhau
        API->>DB: parts count + attempt submitted moi nhat per test
        API-->>CAT: 200 {items, page, pages, total}
        CAT->>HV: the de: parts/collection/duration/lastAttempt (Band hoac d/tong)
    end
    HV->>CAT: click the de
    CAT->>API: POST /practice/:testId/attempts (guard CSRF/JSON/body)
    alt De draft / org khac / khong part
        API-->>CAT: 404 test not found
        CAT->>HV: toast "Khong bat dau duoc bai luyen tap"
    else Dang co luot lam dở
        API-->>CAT: 200 {attemptId} (resume)
    else Luot moi
        API->>DB: insert quiz_attempt mode=practice, assignmentId NULL, snapshot gop
        API-->>CAT: 201 {attemptId}
    end
    CAT->>HV: chuyen /learn/quizzes/practice/:testId
```

```mermaid
flowchart TD
    A["Mo catalog theo ky nang"] --> B{"Slug ky nang hop le?"}
    B -->|"Khong"| C["Redirect ve /practice/reading"]
    B -->|"Co"| D{"Co bo loc / tu khoa / trang?"}
    C --> D
    D -->|"Co"| E["GET catalog voi loc + tim khong phan biet hoa/thuong"]
    D -->|"Khong"| F["GET catalog trang 1"]
    E --> G{"Co de ready cung org?"}
    F --> G
    G -->|"Khong"| H["Giao vien chua co de luyen tap cho ky nang nay"]
    G -->|"Co"| I["Hien the de: parts, collection, thoi luong, ket qua gan nhat"]
    I --> J{"HV click de?"}
    J -->|"Khong"| I
    J -->|"Co"| K{"De ready cung org va co part?"}
    K -->|"Khong"| L["404 test not found -> toast loi"]
    K -->|"Co"| M{"Dang co luot lam dở?"}
    M -->|"Co"| N["200 resume cung attemptId"]
    M -->|"Khong"| O["201 tao luot moi: snapshot gop moi part"]
    N --> P["/learn/quizzes/practice/:testId"]
    O --> P
```

- ✅ 4 kỹ năng + không Dictation (contracts.ts:347-355, :2235; test skill=dictation → 400
  student-practice.test.ts:386-395); slug sai → redirect reading ($skill.tsx:31-38).
- ✅ instr thay LIKE chống wildcard (student-practice.ts:251-266); orderBy desc
  createdAt,id (:275-281); phân trang 12 (contracts.ts:2238).
- ✅ lastAttempt chỉ đếm lượt submitted của chính học viên, status "graded" khi có
  gradeScores + gradedAt (student-practice.ts:297-341; contracts.ts:2241-2253).
- ✅ Idempotent resume 200 / tạo mới 201 (student-practice.ts:412-470; test :438-491);
  test "Luyện tập › Reading: mở đề seed → nộp → thấy điểm" (e2e :120-158) — practice tự
  start không qua gate dialog như assignment.

## F9 — Làm và nộp đề luyện, xem điểm (phân hệ B)

Nguồn: apps/server/src/routes/student-practice.ts:367-410;
apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx:1-50;
apps/student/src/lib/repos/quiz.ts:32-48, :176-186; apps/server/src/routes/student.ts:1919;
apps/server/src/routes/student-practice.ts:118-142.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant TAKE as Man lam de
    participant API as Route practice + quiz chung
    participant DB as D1
    TAKE->>API: GET /practice/:testId/quiz
    API->>DB: de ready + attempt in_progress gan nhat
    alt Co luot da nop o tab khac
        API-->>TAKE: attempt status submitted
        TAKE->>HV: redirect thang trang tong ket
    else Chua co / dang lam
        API-->>TAKE: 200 StudentQuizDetail (khung part dau + cau gop moi part)
    end
    HV->>TAKE: tra loi tung cau (autosave qua may attempt chung)
    HV->>TAKE: Nop bai
    TAKE->>API: POST /api/student/attempts/:attemptId/submit (dung chung)
    API->>DB: cham tu snapshot -> correctCount
    API-->>TAKE: counters
    TAKE->>HV: tong ket: dung/tong (tu cham) — ghi am/noi cho giao vien cham -> Band
    Note over API: KHONG stamp bai tap lop; KHONG vao bang diem lop #378
```

```mermaid
flowchart TD
    A["Mo de luyen"] --> B{"Co luot da nop?"}
    B -->|"Co"| C["Xoa ban nhap cuc bo -> trang tong ket"]
    B -->|"Khong"| D["Lay de sach + answers luot dở (resume)"]
    D --> E{"Skill la writing?"}
    E -->|"Co"| F["Nap essay autosave neu co"]
    E -->|"Khong"| G["Nap answers per cau"]
    F --> H["HV lam bai: navigator tien do + luu tu dong"]
    G --> H
    H --> I{"HV nop?"}
    I -->|"Khong"| H
    I -->|"Co"| J["POST submit (endpoint dung chung may attempt)"]
    J --> K{"Loai cham?"}
    K -->|"Tu cham (doc/nghe)"| L["Hien dung/tong ngay"]
    K -->|"GV cham (viet/noi)"| M["Cho cham: hang cho cham nhan Luyen tap -> Band sau"]
    L --> N{"HV lam lai?"}
    M --> N
    N -->|"Co"| O["Start luot moi (khong 409)"]
    N -->|"Khong"| P["Ket thuc — ket qua khong vao bang diem lop"]
    O --> H
```

- ✅ Lượt submitted ở tab khác → redirect summary; không redirect khi chưa có lượt dở
  ($testId.tsx:6-26); writing nạp essay (photo :28-33).
- ✅ Nộp qua endpoint dùng chung /api/student/attempts/:attemptId/submit
  (repos/quiz.ts:176-186, student.ts:1919) — vòng đời attempt chi tiết thuộc feature
  student-quiz (cross-ref, không nhân bản).
- ✅ Đề Viết luyện vào hàng chờ chấm với nhãn "Luyện tập"; không lọt bảng điểm lớp /
  attemptByTarget (student-practice.test.ts:646-758); e2e KHÔNG lọt bảng điểm lớp
  (:159-178).
- ✅ Band: ieltsOverallBand = round(mean*2)/2; formatBand toFixed(1)
  (ielts-band.ts:143-152); nhãn "Band x.x" từ gradeScores + gradedAt
  (student-practice.ts:118-142).
