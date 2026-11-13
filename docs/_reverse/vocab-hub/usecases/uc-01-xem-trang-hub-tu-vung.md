---
feature: vocab-hub
type: reverse-usecase
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Xem trang hub từ vựng

## a. Tên use case

Xem trang hub từ vựng (hub "Từ vựng" với 2 tab "Bộ từ vựng" / "Tiến độ").

## b. Mã UC / phạm vi

UC-01 — feature vocab-hub; phạm vi: hiển thị tổng quan và điều hướng vào các
tính năng con (F1). Không bao gồm hành động ghi.

## c. Tác nhân

Giáo viên (đã đăng nhập app giáo viên; học viên/admin bị chặn ở tầng
bootstrap). ✅ apps/server/src/app.ts:224-241.

## d. Luồng chính (truy vết FR)

1. Giáo viên bấm mục "Từ vựng" nhóm "IELTS" trên điều hướng — mục luôn hiển
   thị, không có công tắc. ✅ FR-01 (sidebar.tsx:88-105; routes-matcher.ts:33).
2. Trang /vocab mở: tiêu đề "Từ vựng" + kicker thống kê "{n} BỘ TỪ · {n}
   RIÊNG · {n} GỢI Ý CHỜ" tính từ bản chụp tổ chức. ✅ FR-02 (index.tsx:16-36;
   snapshot.ts:386-410).
3. Tab mặc định "Bộ từ vựng" liệt kê toàn bộ bộ từ của tổ chức: mỗi dòng có
   huy hiệu nguồn ("Riêng"/"Lớp {tên}"), "Thư viện" nếu nhân bản, "{n} chờ"
   nếu có gợi ý chờ, dòng phụ "{n} từ · {lang}", và 3 nút "Gợi ý" / "Soạn từ
   vựng" / "Xoá". ✅ FR-03 (vocab-deck-list.tsx:102-218).
4. Đầu mục "Từ vựng SRS" có nút "Thêm từ thư viện" và "Tạo bộ từ". ✅ FR-03
   (vocab-deck-list.tsx:178-191).
5. Chuyển tab "Tiến độ" → sang UC-08 (không đổi địa chỉ). ✅ FR-02.

## e. Luồng thay thế (mã lỗi)

- 3a. Chưa đăng nhập → 401 ở tầng route. ✅ E-01.
- 4a. Tổ chức chưa có bộ từ → câu rỗng hub: "Chưa có bộ từ vựng nào. Tạo bộ
  từ mới hoặc thêm từ thư viện để gợi ý cho học viên." ✅ E-31
  (vocab-deck-list.tsx:194-199).
- 4b. Ở trang lớp chưa có bộ từ → câu rỗng khác: "Chưa có bộ từ vựng nào cho
  lớp này. Tạo bộ từ để học sinh học và ôn tập theo 5 cấp độ trí nhớ." ✅
  E-31 (cùng dòng).
- 5a. Không có breadcrumb cho /vocab trong cấu hình shell. ✅ Mục 10 spec;
  negative-search #8; 🟡 OQ-09.

## f. Hậu điều kiện

- Không có thay đổi dữ liệu (chỉ đọc). Bản chụp tổ chức đã nạp để các UC sau
  dùng chung.

## g. Quy tắc liên quan

BR-02 (hai dạng bộ từ), BR-07 (snapshot chỉ phơi gợi ý pending).

## h. Truy vết

FR-01, FR-02, FR-03, FR-04, FR-18; E-01, E-31; F1; SM-01, SM-02;
Nguồn: index.tsx:16-40; vocab-hub-decks.tsx:1-10; vocab-deck-list.tsx:96-218;
snapshot.ts:386-410,833-848; sidebar.tsx:88-105.
