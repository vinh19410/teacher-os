# dashboard — States (reverse)

> Feature dashboard chỉ ĐỌC, không sở hữu vòng đời ghi nào. Các entity dưới đây là entity multi-state mà dashboard quan sát và phân loại; transition do feature domain khác sở hữu (lịch/attendance/grading/tuition) — dashboard chỉ phản ánh đúng trạng thái hiện có. Có đủ entity multi-state nên KHÔNG lược.

## ST-1 — Ca học (lesson) theo lăng kính dashboard

Trạng thái đọc tại: apps/server/src/routes/dashboard-reminders.ts:99-132 (`status="upcoming"` mới đếm), apps/web/src/lib/dashboard-from-kernel.ts:13-25 (loại cancelled + holiday), apps/web/src/lib/dashboard-from-kernel.ts:124-136 (attendance excused/unexcused/null).

```mermaid
stateDiagram-v2
    direction LR
    state "upcoming (chua day)" as UP
    state "completed (da day)" as CO
    state "cancelled (da huy)" as CA
    state "holiday (buoi nghi le)" as HO
    state "absent (ket thuc khong diem danh)" as AB
    [*] --> UP : ca duoc xep lich
    UP --> CO : check-in ca
    UP --> CA : huy ca
    UP --> HO : le chiem ngay day
    UP --> AB : het buoi ma khong check-in
    CO --> [*]
    CA --> [*]
    HO --> [*]
    AB --> [*]
    note right of UP
        Dashboard: thoi diem danh chi dem UP hom nay
        Lich hom nay / sap toi loai CA va HO
    end note
    note right of AB
        Vang khong phep (unexcused hoac attendance NULL)
        trong cua so 14 ngay - tao canh bao "Vang"
    end note
```

- Trong scope dashboard: UP hiện ở thẻ 1 + "Lịch hôm nay"; CA/HO bị loại mọi khối (BR-005); AB/attendance phản ánh ở bảng "Cần kiểm tra". ✅ [apps/server/src/routes/dashboard-reminders.ts:126; apps/web/src/lib/dashboard-from-kernel.ts:17-22, apps/web/src/lib/dashboard-from-kernel.ts:124-136]

## ST-2 — Bài nộp (quiz_attempt) theo lăng kính thẻ "quá hạn chấm"

DB chỉ có `status="submitted"` + `submittedAt` + `gradeScores`; hai trạng thái giữa là phân loại thời gian của thẻ (không phải cột DB).

```mermaid
stateDiagram-v2
    direction LR
    state "submitted, chua cham, <= 24 gio" as FRESH
    state "submitted, chua cham, qua 24 gio" as OVER
    state "da cham (gradeScores co gia tri)" as GRADED
    [*] --> FRESH : hoc vien nop bai
    FRESH --> OVER : now - submittedAt > 24h
    FRESH --> GRADED : giao vien cham trong ngay
    OVER --> GRADED : giao vien cham
    GRADED --> [*] : ket thuc vong doi cham
    note right of OVER
        Dem vao the 2 (writing / speaking rieng)
        Loai bai demo-attempt:% (#508)
    end note
```

Nguồn: apps/server/src/routes/dashboard-reminders.ts:38-39, apps/server/src/routes/dashboard-reminders.ts:160-229 (isNull gradeScores + lt submittedAt cutoff + notLike demo), test apps/server/src/routes/dashboard-reminders.test.ts:299-431.

## ST-3 — Hóa đơn (invoice) theo lăng kính thẻ học phí

```mermaid
stateDiagram-v2
    direction LR
    state "chua thu du (unpaid / thanh toan mot phan)" as UNPAID
    state "den han trong 7 ngay toi" as SOON
    state "da qua han" as LATE
    state "da thu du (paid)" as PAID
    [*] --> UNPAID : phat hanh hoa don
    UNPAID --> SOON : due gan (den han trong 7 ngay)
    SOON --> LATE : qua han ma chua thu du
    UNPAID --> PAID : thu du tien
    SOON --> PAID : thu du tien
    LATE --> PAID : thu du tien
    PAID --> [*] : hoa don ket thuc chu ky thu
    note right of LATE
        The 3 dem hoc vien distinct + outstanding clamp
        (amount - min(paidAmount, amount))
        Hoa don due rong khong bao gio vao the
    end note
```

Nguồn: apps/server/src/routes/dashboard-reminders.ts:231-258 (ne due khác rỗng, lte due today+7, or status≠paid / paidAmount<amount, clamp 253-256); apps/web/src/lib/tuition-from-kernel.ts:28-48; test apps/server/src/routes/dashboard-reminders.test.ts:435-510.

## ST-4 — Bộ đếm trên web (query + thẻ) — trạng thái UI

Mỗi thẻ có trạng thái riêng `done` (đếm 0) trên nền query chung.

```mermaid
stateDiagram-v2
    direction TB
    state "pending - skeleton (aria-busy)" as P
    state "loaded - con viec" as ACTIVE
    state "loaded - 'Da hoan tat hom nay' (zero inbox)" as DONE
    state "error - 'Khong tai duoc bo dem'" as ERR
    [*] --> P : mount, doi kernel snapshot dau
    P --> ACTIVE : response co viec (dem > 0)
    P --> DONE : response dem = 0
    P --> ERR : fetch loi / HTTP loi
    ERR --> P : bam 'Thu lai' / 'Lam moi du lieu'
    ACTIVE --> P : kernel refresh (query key moi)
    DONE --> P : kernel refresh (query key moi)
```

Nguồn: apps/web/src/routes/_auth/dashboard.tsx:128-164 (pending/error/loaded), apps/web/src/components/dashboard/reminder-cards.tsx:97-112 (done → nhãn zero inbox), apps/web/src/lib/repos/dashboard-reminders.ts:16-24 (key đổi theo dataUpdatedAt).
