---
feature: student-history
type: reverse-flows
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: "develop d6c0f6b5"
---

# Luồng nghiệp vụ đảo ngược — student-history

Nhãn trong biểu đồ viết không dấu để giữ cú pháp mermaid ổn định; tên gọi ở tiêu đề giữ dấu. Mỗi luồng liệt kê Nguồn trước, bằng chứng dạng gạch đầu dòng sau biểu đồ.

## F1 — Mở trang lịch sử

Nguồn: apps/student/src/routes/_auth/history.tsx; apps/student/src/components/layout/student-nav.tsx; apps/student/src/lib/repos/student.ts.

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant TR as Route /history
    participant RQ as React Query hooks
    participant SR as API lich su
    HV->>TR: Mo /history tu muc Lich su
    TR->>TR: validateSearch (week, skill, page)
    TR->>RQ: 4 truy van song song
    RQ->>SR: GET month (thang nay va thang truoc)
    RQ->>SR: GET week (theo week= neu co)
    RQ->>SR: GET list (theo skill= va page=)
    SR-->>RQ: JSON ngay / tuan / danh sach
    RQ-->>TR: data, loading, error
    TR-->>HV: The thong ke, heatmap, tuan, danh sach
```

```mermaid
flowchart TD
    A["Hoc vien mo /history"] --> B["Doc URL: week, skill, page"]
    B --> C{"Tham so hop le?"}
    C -->|"Sai dinh dang"| D["Bo qua, dung mac dinh"]
    C -->|"Hop le"| E["Goi 4 truy van song song"]
    D --> E
    E --> F{"Loi month/week/list?"}
    F -->|"Co"| G["Hien bao loi tai lich su"]
    F -->|"Khong"| H{"Co hoat dong nao?"}
    H -->|"Khong"| I["Empty state + CTA Bat dau luyen tap"]
    H -->|"Co"| J["Ve the thong ke, heatmap, tuan, danh sach"]
    G --> K["Ket thuc: cho nguoi dung thu lai"]
    I --> L["Hoan tat"]
    J --> L
```

- ✅ Mục nav "Lịch sử" → `/history` — apps/student/src/components/layout/student-nav.tsx:45-51 (cờ `HISTORY_ROUTES_LIVE` dòng 22).
- ✅ `validateSearch` đọc `week/skill/page`, giá trị sai → undefined (dùng mặc định) — apps/student/src/routes/_auth/history.tsx:29-42.
- ✅ 4 truy vấn: tháng này, tháng trước, tuần, danh sách — apps/student/src/routes/_auth/history.tsx:76-86.
- 🔵 Cập nhật dữ liệu nhờ staleTime 30s + nạp lại khi vào trang, không có invalidation sau nộp bài — apps/student/src/lib/repos/student.ts:653-720 và kiểm chứng âm NEG-02 (`_evidence.md`).
- ✅ Cổng lỗi chỉ xét monthNow/week/list — apps/student/src/routes/_auth/history.tsx:128-141 (E-11: lỗi tháng trước im lặng — stats vẫn tính với dữ liệu thiếu, 96-118).

## F2 — Gom dữ liệu phía máy chủ

Nguồn: apps/server/src/routes/student-history.ts.

```mermaid
sequenceDiagram
    participant FE as App hoc vien
    participant RT as student-history routes
    participant DB as SQLite drizzle
    FE->>RT: GET thang / tuan / danh sach
    RT->>DB: attemptRows mode practice (cua so gio VN)
    DB-->>RT: rows quiz_attempt + join de tu luyen
    RT->>DB: attemptRows mode assignment (cua so gio VN)
    DB-->>RT: rows quiz_attempt + join bai trong lop
    RT->>DB: vocabDayGroups (cua so gio VN)
    DB-->>RT: nhom ngay vocab_review_log chi review
    RT->>RT: entryGradeOf, attemptToEntry, mergeHistory
    RT-->>FE: days / week rows / entries
```

```mermaid
flowchart TD
    A["Nhan yeu cau GET"] --> B["Guard hoc vien + doc tham so"]
    B --> C{"Tham so hop le?"}
    C -->|"Khong"| D["Tra 400"]
    C -->|"Co"| E["Tinh cua so theo gio VN"]
    E --> F["Quet quiz_attempt practice (toi da 500)"]
    E --> G["Quet quiz_attempt assignment (toi da 500)"]
    E --> H["Gom ngay vocab review (toi da 2000 nhom)"]
    F --> I["Suy ra diem, ky nang, trang thai moi row"]
    G --> I
    H --> I
    I --> J["Gop 3 nguon, sap moi nhat len dau"]
    J --> K["Loc theo thang / ky nang, phan trang"]
    K --> L["Tra JSON khop hop zod strict"]
    D --> M["Ket thuc: tra 400"]
    L --> N["Hoan tat"]
```

- ✅ Hai nhánh join riêng cho practice (254-278) và assignment (279-317) — apps/server/src/routes/student-history.ts:230-333.
- ✅ Chỉ `submitted_at` khác null được tính (loại bài làm dở, loại học viên khác) — apps/server/src/routes/student-history.test.ts:399-416.
- ✅ Từ vựng gom theo ngày VN trong SQL, chỉ phiên `review` — apps/server/src/routes/student-history.ts:182-220.
- ✅ Gộp và sắp mới nhất lên đầu — apps/server/src/routes/student-history.ts:362-402 (400).
- 🟡 Vượt giới hạn quét bị cắt im lặng → OQ-01 — apps/server/src/routes/student-history.ts:85-86.

## F3 — Heatmap tháng và chọn tuần

Nguồn: apps/student/src/components/history/month-heatmap.tsx; week-table.tsx; apps/student/src/routes/_auth/history.tsx.

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant HM as MonthHeatmap
    participant TR as Route /history
    participant SR as API tuan
    HV->>HM: Bam o ngay dd/mm
    HM->>TR: onWeek (thu Hai cua tuan chua ngay)
    TR->>TR: updateSearch (week= ngay do)
    TR->>SR: GET week?monday=
    SR-->>TR: 5 ky nang x 7 ngay + minutes
    TR-->>HV: WeekTable lam moi
```

```mermaid
flowchart TD
    A["Xem panel Hoat dong: 2 heatmap"] --> B{"O ngay la tuong lai?"}
    B -->|"Phai"| C["O vo hieu hoa"]
    B -->|"Khong"| D["Bam o: aria Ngay dd/mm N bai"]
    D --> E["Tinh thu Hai cua tuan chua ngay"]
    E --> F["Ghi week= vao URL"]
    F --> G["Nap bang tuan theo week moi"]
    G --> H{"La tuan hien tai?"}
    H -->|"Phai"| I["Tieu de: Tuan nay"]
    H -->|"Khong"| J["Tieu de: Tuan tu dd/mm"]
    C --> K["Ket thuc: giu nguyen bang tuan"]
    I --> L["Hoan tat"]
    J --> L
```

- ✅ aria-label "Ngày dd/mm: N bài" theo giờ VN — apps/student/src/components/history/month-heatmap.tsx:90; test apps/student/src/components/history/month-heatmap.test.tsx:19-40.
- ✅ Bấm ô ngày đặt đúng Thứ Hai của tuần — apps/student/src/components/history/month-heatmap.test.tsx:42-59; e2e apps/e2e/specs/student-history.spec.ts:148-151.
- ✅ Ô của tuần đang chọn có aria-pressed; ngày tương lai disabled — apps/student/src/components/history/month-heatmap.test.tsx:61-84.
- ✅ "Tuần này"/"Tuần từ dd/mm" — apps/student/src/routes/_auth/history.tsx:257-269.

## F4 — Danh sách: lọc kỹ năng và phân trang

Nguồn: apps/student/src/components/history/history-list.tsx; apps/student/src/routes/_auth/history.tsx; apps/server/src/routes/student-history.ts:505-551.

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant HL as HistoryList
    participant TR as Route /history
    participant SR as API danh sach
    HV->>HL: Chon tab ky nang
    HL->>TR: onSkillChange (skill hoac rong)
    TR->>TR: updateSearch (skill, page = 1)
    TR->>SR: GET list?skill=&page=1
    SR-->>TR: entries, page, pages, total
    TR-->>HL: Bang lam moi
    HV->>HL: Bam Trang sau
    HL->>TR: onPageChange (page + 1)
    TR->>SR: GET list?skill=&page=2
    SR-->>TR: trang ke tiep
    TR-->>HL: Bang trang 2
```

```mermaid
flowchart TD
    A["Bang hoat dong"] --> B{"Doi tab ky nang?"}
    B -->|"Co"| C["Reset page = 1"]
    B -->|"Khong"| D{"Bam Truoc / Sau?"}
    C --> E["Ghi skill va page vao URL"]
    D -->|"Co"| E
    D -->|"Khong"| F["Ket thuc: giu nguyen bang"]
    E --> G["GET list voi skill, page moi"]
    G --> H{"Trang con du lieu?"}
    H -->|"Co"| I["Ve bang trang moi"]
    H -->|"Vuot gioi"| J["Ve bang rong"]
    I --> K["Hoan tat"]
    J --> K
```

- ✅ Đổi tab → reset trang 1 + cập nhật URL — apps/student/src/routes/_auth/history.tsx:272-292 (277-283).
- ✅ "Tất cả" trả chuỗi rỗng; tab "Từ vựng" → `vocabulary` — apps/student/src/components/history/history-list.test.tsx:110-119.
- ✅ Phân trang "Trước"/"Trang x / y"/"Sau" — apps/student/src/components/history/history-list.tsx:197-222; trang vượt giới hạn trả `entries` rỗng — apps/server/src/routes/student-history.test.ts:468-513.
- ✅ Lọc Writing bao gồm bài ghép có phần Writing (#574) — apps/server/src/routes/student-history.ts:531-538.

## F5 — Xem lại nhận xét Writing

Nguồn: apps/student/src/components/history/history-list.tsx:39-46; writing-review.tsx; apps/student/src/lib/repos/quiz.ts; apps/server/src/routes/student.ts:2228.

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant HL as HistoryList
    participant WR as WritingReview
    participant QR as repo quiz
    participant SR as GET attempts/:id
    HV->>HL: Bam Xem nhan xet
    HL->>WR: Mo WritingReview (attemptId)
    WR->>QR: useAttemptSummary (attemptId)
    QR->>SR: GET /api/student/attempts/:attemptId
    SR-->>QR: summary, grade, annotations
    QR-->>WR: data
    WR-->>HV: Band tong, tieu chi, essay highlight
    HV->>HL: Bam An nhan xet
    HL-->>HV: Dong khoi nhan xet
```

```mermaid
flowchart TD
    A["Dong entry chip Da cham"] --> B{"canReview?"}
    B -->|"Khong phai Writing hoac thieu attempt"| C["Khong hien nut"]
    B -->|"Du dieu kien"| D["Hien nut Xem nhan xet"]
    D --> E{"Loi tai summary?"}
    E -->|"Co"| F["Bao loi tai nhan xet"]
    E -->|"Khong"| G{"Co grade?"}
    G -->|"Khong"| H["Giao vien chua cham bai nay"]
    G -->|"Co"| I["Ve Band tong, tieu chi, highlight"]
    I --> J["Hoan tat"]
    F --> K["Ket thuc: hien loi"]
    H --> K
    C --> L["Ket thuc: khong co nut"]
```

- ✅ Điều kiện `canReview`: `graded` + kỹ năng Writing (kể cả `hasWriting`) + có attemptId — apps/student/src/components/history/history-list.tsx:39-46.
- ✅ Mở/đóng "Xem nhận xét"/"Ẩn nhận xét" — apps/student/src/components/history/history-list.test.tsx:129-182.
- ✅ Ba trạng thái khối: spinner, lỗi nguyên văn, "Giáo viên chưa chấm bài này." — apps/student/src/components/history/writing-review.tsx:23-29, 75-79.
- ✅ "Band tổng" + tiêu chí IELTS theo part + highlight ghi chú — apps/student/src/components/history/writing-review.test.tsx:53-73.

## F6 — Vào lịch sử từ trang luyện tập

Nguồn: apps/student/src/components/practice/history-button.tsx; apps/student/src/routes/_auth/practice/$skill.tsx; apps/e2e/specs/student-history.spec.ts:175-192.

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant PS as Trang /practice/:skill
    participant RQ as useHistoryList
    participant SR as API danh sach
    HV->>PS: Mo trang luyen tap
    PS->>RQ: useHistoryList (skill, page 1)
    RQ->>SR: GET /api/student/history?skill=&page=1
    SR-->>RQ: total
    RQ-->>PS: historyCount
    PS-->>HV: Nut Lich su (N)
    HV->>PS: Bam nut
    PS-->>HV: Den /history?skill=
```

```mermaid
flowchart TD
    A["Mo trang luyen tap"] --> B["Tai count tu list page 1"]
    B --> C["Ve nut Lich su (N)"]
    C --> D{"Bam nut?"}
    D -->|"Co"| E["Den /history?skill=ky nang hien tai"]
    D -->|"Khong"| F["Ket thuc: o lai trang"]
    E --> G["Hoan tat"]
```

- ✅ Nút hiển thị "(1)" và dẫn `/history?skill=reading` — apps/e2e/specs/student-history.spec.ts:175-192.
- ✅ Đếm lấy `total` của trang 1 — apps/student/src/routes/_auth/practice/$skill.tsx:61-68.
- 🟡 Tải nguyên trang 20 entry chỉ để lấy tổng → OQ-11 — packages/api/src/contracts.ts:2305.
- 🔵 Comment "caller chưa mount" đã lỗi thời: component được mount thật — apps/student/src/components/practice/history-button.tsx:6-8 và apps/student/src/routes/_auth/practice/$skill.tsx:118-126 (GAP-5).

## F7 — Dữ liệu mới chảy vào lịch sử (read-model)

Nguồn: packages/db/src/schema/quiz-attempt.ts; packages/db/src/schema/vocab.ts; apps/server/src/routes/student-history.ts. Bề mặt viết tham chiếu bộ `docs/_reverse/student-practice/`.

```mermaid
sequenceDiagram
    actor HV as Hoc vien
    participant PR as Phase truoc (nop bai, on tu)
    participant DB as SQLite
    participant HS as Lich su doc sau
    HV->>PR: Nop bai / on the tu
    PR->>DB: Ghi quiz_attempt submitted / vocab_review_log review
    HV->>HS: Mo /history
    HS->>DB: Quet quiz_attempt + vocab_review_log
    DB-->>HS: Du lieu moi tu xuat hien
    HS-->>HV: Heatmap, tuan, danh sach cap nhat
```

```mermaid
flowchart TD
    A["Nop bai luyen tap / bai lop"] --> B["quiz_attempt status submitted"]
    C["On the tu"] --> D["vocab_review_log sessionKind review"]
    B --> E["Doc lan sau cua lich su tu thay"]
    D --> E
    E --> F{"Nam trong cua so dang xem?"}
    F -->|"Trong thang / tuan xem"| G["Hien trong heatmap, tuan, danh sach"]
    F -->|"Ngoai cua so hoac vuot gioi han quet"| H["Khong hien, khong bao hieu thieu"]
    G --> I["Hoan tat"]
    H --> J["Ket thuc: du lieu im lang"]
```

- ✅ Lịch sử không ghi gì: chỉ SELECT — apps/server/src/routes/student-history.ts:404-411 (INF-1).
- ✅ Bài nộp tạo `quiz_attempt` với `submitted_at` — packages/db/src/schema/quiz-attempt.ts:83; nhật ký ôn tạo `vocab_review_log` — packages/db/src/schema/vocab.ts:133-157.
- 🔵 Không có invalidation — cập nhật phụ thuộc nạp lại trang (staleTime 30s): NEG-02 + apps/student/src/lib/repos/student.ts:653-720.
- 🟡 Dữ liệu ngoài cửa sổ hoặc vượt giới hạn quét biến mất im lặng → OQ-01.
