---
type: reverse-usecase
feature: placement-test
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Nạp màn soạn đề và khởi tạo bộ đề

## a. Tên

Nạp màn soạn đề "Bài test đầu vào" và khởi tạo bộ đề khi chưa có nháp (nhập đề gốc hoặc tạo đề trống).

## b. Mã UC / phạm vi

- Mã: UC-01; feature `placement-test`. ✅
- Phạm vi: từ lúc GV mở mục menu đến khi màn hình sẵn nội dung soạn (đề rỗng được khởi tạo hoặc đề có sẵn được nạp). Không bao gồm hành động soạn/lưu (UC-02). ✅

## c. Tác nhân

- Giáo viên/Chủ trung tâm (vai trò thuộc nhóm được xem khu tài chính). ✅
- Trợ giảng/GV đứng lớp: bị chặn (luồng thay thế). ✅

## d. Luồng chính

1. GV mở mục "Bài test đầu vào" trong nhóm "Kinh doanh" trên thanh điều hướng, hoặc tìm qua phím tắt ⌘K. [FR-01]
2. Hệ thống kiểm tra vai trò; đủ quyền thì mở màn soạn đề với tiêu đề "Bài test đầu vào", huy hiệu trạng thái và nhãn phát hành. [FR-45]
3. Hệ thống tải trạng thái đề mới nhất của tổ chức (bản nháp, số hiệu, phiên bản phát hành, thời điểm phát hành, cờ thay đổi chưa phát hành, danh sách audio). [FR-47]
4. GV bấm "Nhập đề gốc (30 câu, 5 audio)": hệ thống tải bộ đề mẫu và 5 file audio mẫu, tải audio lên và gắn vào các đoạn nghe, rồi lưu nháp; hiện thông báo nhập thành công. [FR-04]
5. Cách khác: GV bấm "Tạo đề trống" nhận khung 1 câu Ngữ pháp/Từ vựng, 1 đoạn nghe và 1 ngưỡng CEFR mặc định. [FR-05, FR-03]
6. Khi tổ chức không phải tổ chức lead, màn hình hiện cảnh báo cấu hình để GV biết đề sẽ không hiện trên trang học viên. [FR-46]

## e. Luồng thay thế

- 2a. Không đủ quyền xem khu tài chính: bị điều về trang bảng điều khiển kèm thông báo không có quyền. [E-02]
- 3a. Chưa đăng nhập: nhận 401 và màn hình yêu cầu đăng nhập lại. [E-01]
- 3b. Request ghi có nguồn gốc lạ: nhận 403. [E-03]
- 4a. Tải đề gốc thất bại: hiện thông báo lỗi tải đề gốc, đề vẫn ở trạng thái rỗng. [E-36]
- 3c. Tải trạng thái thất bại: hiện thẻ lỗi (không có nút thử lại; tải lại trang để thử lại). [E-37]

## f. Hậu điều kiện

- Màn soạn đề hiển thị nội dung hiện có của tổ chức; nếu trước đó chưa có gì thì một bản nháp mới đã được lưu (nhập đề gốc) hoặc khung trống đang chờ lưu (tạo đề trống). ✅
- Trạng thái rỗng biến mất sau khi có bản nháp. ✅

## g. Quy tắc liên quan

BR-01 (một tổ chức một đề), BR-03 (vai trò được phép), BR-04 (chỉ tổ chức lead mới lên trang công khai), BR-15 (cảnh báo tổ chức thường). ✅

## h. Truy vết

| Loại | Giá trị |
|------|---------|
| Nguồn | apps/web/src/components/layout/sidebar.tsx:52-59,128-145; apps/web/src/components/command-search/search-index.ts:179-191; apps/web/src/lib/use-finance-route-guard.ts:1-31; apps/web/src/routes/_auth/placement-test/index.tsx:60-102,334-415,429-490,526-555; apps/web/src/components/placement-test/seed-empty-state.tsx:17-55; apps/server/src/routes/placement-test.ts:134-181,121-132; packages/auth/src/role.ts:75-85 |
| Luồng | F1, F2 |
| Test | apps/web/src/routes/_auth/placement-test/index.test.tsx (seed-empty-state it :151-164); apps/e2e/specs/placement-test-editor.spec.ts:74-112 |
