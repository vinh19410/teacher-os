---
phase: 3
title: "Nối CTA và form đăng ký"
status: pending
priority: P2
effort: "0.4d"
dependencies: [2]
---

# Phase 3: Nối CTA và form đăng ký

## Goal

Trang profile dẫn thẳng sang bài kiểm tra mới, không còn quiz cũ, và nhận kết quả vào form đăng ký.

## Files to Create / Modify

- Modify: `apps/profile/public/index.html`
- Modify: `apps/profile/tests/index.test.mjs`

## Tasks & Steps

1. Đổi mọi CTA đang trỏ `#lam-test-mien-phi` sang `kiem-tra-dau-vao/` (D7), gồm cả link menu.
2. Thay `form#placementQuizForm` và `aside#quizResultPanel` bằng phần giới thiệu ngắn: 30 câu, hai phần, khoảng 25–30 phút, không cần đăng nhập, cần tai nghe, kèm nút "Bắt Đầu Làm Bài". Giữ nguyên nội dung quyền lợi buổi 1-1 đang có.
3. Sửa toàn bộ chữ còn nói "2 phút" hoặc "5 câu", gồm nút hero và tiêu đề section. Rà bằng `grep -n -i "2 phút\|5 câu" apps/profile/public/index.html`.
4. Xóa JS mục "9. Interactive Placement Quiz Grading" và CSS `quiz-*` không còn dùng. Giữ `quizPlacementInput`, `quizPlacementBanner`, `quiz-applied-banner`, `getCombinedPlacement` và phần lưu nháp vì form vẫn dùng.
5. Thêm xử lý D8 ngay sau `restoreDraft()`: đọc `ketqua` và `khoa`, gán `quizPlacementInput`, hiện banner bằng `textContent`, chỉ gán khóa nếu có option khớp, gọi `saveDraft()`, rồi `history.replaceState` xóa query và giữ hash. Giá trị từ link thắng giá trị trong nháp.

## Verification

- Thêm test vào `index.test.mjs`: không còn `placementQuizForm`; số `href="#lam-test-mien-phi"` bằng 0; có CTA `kiem-tra-dau-vao/`; `id="lam-test-mien-phi"` vẫn còn; không còn "2 Phút".
- `pnpm --filter profile test`
- `pnpm --filter server test` để chắc catalog khóa trong `lead-catalog-drift.test.ts` không bị ảnh hưởng.

## Risks

Xóa CSS `quiz-*` theo tiền tố có thể xóa nhầm class của form. Chỉ xóa sau khi `grep` xác nhận class không còn được dùng trong HTML hoặc JS.
