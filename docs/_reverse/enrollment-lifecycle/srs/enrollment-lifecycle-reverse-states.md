---
type: reverse-srs-states
feature: enrollment-lifecycle
updated: 2026-11-11
---

# enrollment-lifecycle — States tái lập (reverse)

## State: ENROLLMENT

> Nguồn: ✅ [S1 `packages/db/src/schema/enrollment.ts:30-34`] (comment lifecycle), ✅ [S2 `contracts.ts:1615-1616`] (enum), ✅ [S4 `enrollment-activation.ts:733-743`] (CAS), ✅ [S3 `kernel.ts:1480-1505`] (DELETE). DB chỉ ghi `invited` | `active` — ✅ [S6 `student-class.ts:134`].

```mermaid
stateDiagram-v2
    [*] --> Invited: GV them vao lop (kernel.ts 551 1426)
    Invited --> Active: Kich hoat GV - accept (CAS status = invited)
    Invited --> Active: HV tham gia lop - portal accept (CUNG ham)
    Invited --> [*]: Huy loi moi - DELETE xoa row (chi invited)
    Active --> Active: Accept lai - idempotent khong tao them
    Active --> [*]: Khong co duong API nao ra khoi (OQ-3)
```

**Ghi chú trạng thái:**

| Trạng thái | Ý nghĩa | Vào bằng | Ra bằng | Nguồn | Nhãn |
|-----------|---------|----------|---------|-------|------|
| Invited | "Đã mời" — giáo viên đã thêm vào lớp, học viên chưa xác nhận; CHƯA có gói/buổi/hóa đơn hợp lệ | POST enroll / POST students+classId (insert `status:"invited"`) | accept (2 đường) hoặc DELETE | S3 `kernel.ts:551,1426`; S19 `kernel.test.ts:7112-7134` | ✅ |
| Active | "Đang học" — đã có session_package + chuỗi lesson; được lập hóa đơn + giao bài | accept giáo viên HOẶC portal (CAS, idempotent) | KHÔNG có (không API un-enroll) | S4 `enrollment-activation.ts:733-776`; S19 `kernel.test.ts:7136-7171` | ✅ |
| (đã xóa) | Terminal không-phải-trạng-thái: hủy lời mời xóa hẳn row; mời lại tạo enrollment MỚI (idempotency key notify mới theo enrollmentId) | — | DELETE khi invited | S3 `kernel.ts:1499-1503`; S26 `templates.ts:67`; S19 `kernel.test.ts:7271-7303` | ✅ |
| default 'active' (legacy) | Giá trị default cột DB chỉ để backfill row trước Wave invitation; code mới luôn ghi tường minh | migration cũ | — | S1 `enrollment.ts:30-34` | 🟡 OQ-2 |

**Chuyển tiếp KHÔNG tồn tại (negative):** `active → invited` (không code), `invited → cancelled` (không có status cancelled — hủy là DELETE), `active → bất kỳ` ngoài tự-idempotent. ✅ negative-search [S3, S4].

## State: SESSION_PACKAGE (đính kèm vòng đời)

```mermaid
stateDiagram-v2
    [*] --> Parked: chua vao lop (enrollmentId null)
    Parked --> Active: gan vao enrollment / kich hoat
    [*] --> Active: sinh luc kich hoat enrollment
    Active --> Active: accept lai khong nhan doi (unique enrollment)
```

> ✅ [S25 `session-package.ts:45,48-50`] unique theo enrollment; gói "parked" khi enrollmentId null [S2 `contracts.ts:1626-1630`]. 🔵 Tên trạng thái "Parked" suy từ comment + partial unique index, không phải enum code.
