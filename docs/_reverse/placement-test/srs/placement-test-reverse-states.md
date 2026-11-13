---
type: reverse-states
feature: placement-test
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# Sơ đồ trạng thái — feature `placement-test`

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

## SM-01 — Vòng đời bộ đề của tổ chức (nháp ↔ phát hành)

Nguồn: packages/db/src/schema/placement-test.ts:13-27; apps/server/src/routes/placement-test.ts:159-163,231-267,481-506; apps/server/src/routes/placement-test.test.ts:328-397. ✅

```mermaid
stateDiagram-v2
    state "Chua co de — draft null" as S0
    state "Co ban nhap — chua phat hanh" as S1
    state "Da phat hanh vN — dirty false" as S2
    state "Da phat hanh va co thay doi chua phat hanh — dirty true" as S3
    [*] --> S0: khoi tao
    S0 --> S1: luu nhap dau tien revision 0
    S1 --> S1: luu nhap tiep theo revision tang 1
    S1 --> S2: phat hanh thanh cong tao version 1
    S2 --> S3: luu nhap sau phat hanh
    S3 --> S3: luu nhap tiep theo
    S3 --> S2: phat hanh lai version tang 1
    S2 --> S2: phat hanh lai khi chua thay doi
```

Chứng thực: cờ dirty tính bằng so draft JSON với published (placement-test.ts:159-163); test "lưu nháp sau khi phát hành không làm đổi response công khai và bật lại dirty = true" (placement-test.test.ts:328-397); publishedVersion tăng mỗi lần phát hành (placement-test.ts:481-506). ✅

## SM-02 — Hành trình học viên trên trang công khai

Nguồn: apps/profile/public/kiem-tra-dau-vao/test.js:52,145-238,316-350,352-384,529-541,1076-1086,1472-1644,1646-1671. ✅

```mermaid
stateDiagram-v2
    state "Dang nap de cong khai" as LOAD
    state "Bao tri — 503 404 hoac API loi" as MAINT
    state "Trang chu gioi thieu de" as HOME
    state "Cong thong tin hoc vien" as GATE
    state "Phan 1 Vocab Grammar" as P1
    state "Phan 2 Listening" as P2
    state "Man ket qua CEFR" as RESULT
    [*] --> LOAD: mo trang
    LOAD --> MAINT: nap that bai hoac chua phat hanh
    LOAD --> HOME: nap snapshot thanh cong
    MAINT --> LOAD: tai lai trang khi co de moi
    HOME --> GATE: bam bat dau khong co bai lam do
    HOME --> P1: tiep tuc bai dang lam trong localStorage
    HOME --> GATE: tiep tuc nhung lead chua dang ky (phong thu)
    GATE --> GATE: loi xac thuc hoac 429 hien thong bao
    GATE --> P1: lead 200 hoac 201
    P1 --> P2: hoan thanh phan 1
    P2 --> RESULT: nop bai va cham diem
    RESULT --> HOME: lam lai xoa bai giu thong tin
```

Chứng thực: VALID_STEPS 5 bước (test.js:52); loadSavedAttempt + "Tiếp Tục Bài Đang Làm →" (test.js:145-238,529-541); bảo trì không xóa bài dở (test.js:316-350; e2e :74-97,:261-283); 200/201 mới sang Phần 1 (test.js:1076-1086); kết quả → làm lại về trang chủ (test.js:1625-1639). ✅

## SM-03 — Lượt nghe audio của học viên (mỗi đoạn nghe)

Nguồn: apps/profile/public/kiem-tra-dau-vao/test.js:1302-1349; packages/api/src/placement-test-contracts.ts:81-91. ✅

```mermaid
stateDiagram-v2
    state "San sang — con luot nghe" as READY
    state "Dang phat" as PLAYING
    state "Da het luot nghe" as EXHAUSTED
    [*] --> READY: vao Phan 2
    READY --> PLAYING: bam phat tru 1 luot
    PLAYING --> READY: phat het (ended) hoac bi dung khi bat dau clip khac
    PLAYING --> READY: tai audio loi hoan 1 luot
    READY --> EXHAUSTED: luot con lai ve 0
    EXHAUSTED --> [*]: vo hieu nut phat Da het luot nghe
```

Chứng thực: trừ lượt khi sự kiện playing (:1302-1310); hoàn lượt khi lỗi kèm thông điệp không trừ lượt (:1318-1337); reset currentTime về 0 (:1345-1349); nhãn "Còn X/Y lượt nghe" / "Đã hết lượt nghe" (:1275-1299). ✅
