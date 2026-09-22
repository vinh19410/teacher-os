---
title: "Phase 2: Cập nhật E2E + verification"
status: todo
---

# Phase 2: Cập nhật E2E + verification

## Context Links

- Plan: [plan.md](./plan.md)
- Spec cần sửa: `apps/e2e/specs/student-package-without-class.spec.ts` (bước 4, dòng 34–40), `apps/e2e/specs/student-package-validation.spec.ts` (test D1, dòng 206–217)
- Spec liên quan không cần sửa: `apps/e2e/specs/student-row-detail.spec.ts` (chỉ assert tabs + heading)

## Overview

- **Priority**: P1
- **Status**: todo
- Hai spec e2e đang assert card "Gói học" trên trang chi tiết học viên — cập nhật khớp hành vi mới (card "Lớp học"), giữ nguyên coverage cho list/tuition và derive gói #240, rồi chạy bộ verification đầy đủ.

## Key Insights

- Nav sidebar có item "Lớp học" (các spec click bằng `page.getByText("Lớp học", { exact: true }).first()`) → **đừng assert** `getByText("Lớp học", { exact: true })` không scope trên trang detail (strict-mode violation). Assert qua text duy nhất: empty state và tên lớp.
- Hàng danh sách học viên hiển thị `"${pkg.total} buổi · ${pkg.mode}"` và `fmtVND(pkg.price)` (`apps/web/src/routes/_auth/students/index.tsx:103-116`) → coverage giá trị derive (12 buổi, 500.000đ, Online) chuyển sang assert trên hàng list.
- List + tuition vẫn hiển thị "Chưa có gói" cho học viên không lớp → các assertion đó giữ nguyên.

## Requirements

- [ ] Không spec nào còn assert nội dung card "Gói học" trên trang detail học viên.
- [ ] Text asserted khớp 1:1 với Phase 1: empty state "Chưa tham gia lớp học nào.", tên lớp hiển thị trên detail.
- [ ] Cả 3 spec liên quan pass cùng bộ verification.

## Related Code Files

- Modify: `/Users/vinhtran/Documents/project/personal/teacher-os/apps/e2e/specs/student-package-without-class.spec.ts`
- Modify: `/Users/vinhtran/Documents/project/personal/teacher-os/apps/e2e/specs/student-package-validation.spec.ts`

## Implementation Steps

1. `student-package-without-class.spec.ts` — cập nhật docstring (bỏ claim về "Gói học" trên detail) và bước 4 (dòng 34–40) thành:
   ```ts
   // 4. Student detail: shows Email and the empty class card
   await studentRow.getByText(STUDENT_NAME).click();
   await expect(page.getByText(`Email: ${STUDENT_EMAIL}`)).toBeVisible();
   // "Lớp học" exact trùng nav sidebar — assert qua empty state (duy nhất)
   await expect(page.getByText("Chưa tham gia lớp học nào.")).toBeVisible();
   ```
   Giữ nguyên bước 3 (list) và bước 5 (tuition).
2. `student-package-validation.spec.ts` — test D1 (dòng 164–218): đổi tên test thành
   `"tạo học viên trong lớp → derive gói từ lớp, detail hiển thị lớp học (D1)"`.
   Sau khi tạo học viên trong lớp và thấy roster:
   ```ts
   // List học viên: derive gói từ lớp (12 buổi vì lớp không đặt sessionsTotal
   // riêng — kiểm tra giá trị thực tế khi chạy) + đơn giá 500.000đ
   await page.getByText("Học viên", { exact: true }).first().click();
   await expect(page).toHaveURL(/\/students$/);
   const row = page.locator("tr", { hasText: STUDENT_NAME });
   await expect(row.getByText(/buổi · Online/)).toBeVisible();
   await expect(row.getByText("500.000đ")).toBeVisible();

   // Vào detail học viên -> card "Lớp học" hiện lớp vừa tạo
   await row.getByText(STUDENT_NAME).click();
   await expect(page.getByText(CLASS_NAME)).toBeVisible();
   await expect(page.getByText("Email: derive@e2e.test")).toBeVisible();
   ```
   Bỏ khối `packageCard` + assert "Tổng buổi"/"Online" trên detail. Lưu ý: số buổi của lớp tạo từ modal (`class-modal`) cần xác minh giá trị render thực tế khi chạy — assert bằng regex `/buổi · Online/` để không hard-code sai.
3. Chạy verification (từ repo root):
   ```bash
   pnpm check-types
   pnpm --filter web test
   pnpm exec biome check apps/web/src apps/e2e/specs
   pnpm --filter e2e e2e specs/student-package-without-class.spec.ts specs/student-package-validation.spec.ts specs/student-row-detail.spec.ts
   ```

## Todo

- [ ] Cập nhật `student-package-without-class.spec.ts` (bước 4 + docstring)
- [ ] Cập nhật `student-package-validation.spec.ts` (test D1)
- [ ] `pnpm check-types` pass
- [ ] `pnpm --filter web test` pass (không đổi mapper nên kỳ vọng pass nguyên trạng)
- [ ] Biome check pass
- [ ] 3 spec e2e pass

## Success Criteria

- `grep -rn "Gói học" apps/e2e/specs` trả về rỗng.
- Tất cả lệnh verification ở bước 3 exit 0.

## Risk Assessment

- **E2E môi trường**: playwright tự boot dev server qua config hiện có — dùng đúng script `pnpm --filter e2e e2e` như CI, không tự chế lệnh boot.
- **Số buổi derive từ modal tạo lớp**: giá trị sessionsTotal do modal quyết định (`plans/260922-1107-class-modal-auto-sessions`) — dùng regex thay vì hard-code; nếu muốn hard-code thì đọc giá trị cấu hình modal trước.
- **Assertion "500.000đ"**: `fmtVND` render `500.000đ` (`vi-VN`) — đã khớp chuỗi trong test cũ, giữ nguyên.

## Security Considerations

- Chỉ sửa test; không đổi authz, không mock API (spec hiện hành dùng observe-only counters — giữ nguyên nguyên tắc).

## Next Steps

- Merge theo conventional commit, ví dụ `feat(student): show enrolled classes instead of package on profile tab`.
