---
title: "Ship #624: Sửa nhãn nút \"Gốc học viên\" thành \"Góc học viên\" trên trang profile (beta)"
date: 2026-11-05
summary: "Sửa lỗi chính tả nhãn nút #studentPortalLink trên header apps/profile, cập nhật 5 assertion/fixture trong test, đồng bộ codebase summary và changelog"
---

# Ship #624: Sửa nhãn nút "Gốc học viên" thành "Góc học viên" trên trang profile (beta)

## Bối cảnh & Hiện tượng (#624)
- Nút dẫn tới cổng học viên trên header trang profile công khai (`apps/profile`, `#studentPortalLink`) bị ghi sai chính tả thành "Gốc học viên".
- Nhãn này ban đầu được thêm ở #560 theo nguyên văn yêu cầu của issue đó.
- Cần sửa thành "Góc học viên", giữ nguyên toàn bộ id, href, rel, class, cơ chế thay `STUDENT_PORTAL_URL` và bố cục header.

## Thay đổi kỹ thuật
1. `apps/profile/public/index.html`:
   - Dòng 914: Sửa text nhãn nút `#studentPortalLink` từ "Gốc học viên" thành "Góc học viên".
2. `apps/profile/tests/index.test.mjs`:
   - Cập nhật 5 vị trí fixture và assertion khoá cứng nhãn "Góc học viên" (dòng 294, 320, 325, 332, 340).
3. `docs/codebase-summary.md`:
   - Dòng 40: Cập nhật dòng mô tả `apps/profile` cho nút `#studentPortalLink` thành "Góc học viên".
4. `CHANGELOG.md`:
   - Thêm dòng `### Fixed` dưới ngày 2026-11-05 ghi nhận sửa chính tả nhãn nút (#624). Bảo toàn nguyên vẹn dòng lịch sử của #560.
5. Kiểm chứng:
   - TDD Red → Green: `pnpm --filter profile test` (30/30 passed).
   - `grep -rn "Gốc học viên" apps packages docs` → 0 kết quả.
   - `pnpm exec biome check .` → 0 errors (105 warnings, 14 infos, exit 0).
   - `pnpm check-types` → 12/12 packages successful.
   - Root test suites (`ci-workflow`, `topology-drift`, `devserver-watchdog`, `design-compare`) → 57/57 passed.
   - Kiểm tra 4 viewports (`1440×900`, `768×1024`, `375×812`, `320×812`) qua Playwright browser eval: header hiển thị đúng nhãn và không tràn ngang.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
