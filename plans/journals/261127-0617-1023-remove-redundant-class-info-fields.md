# Journal: Gỡ 2 mục dư thừa `Khoá` và `Số buổi đã học` trên `ClassInfoCard` (#1023)

- **Date:** 2026-11-27 06:17 (Europe/London)
- **Severity:** Low
- **Issue:** [#1023](https://github.com/vinh19410/teacher-os/issues/1023) — `refactor(student): gỡ 2 mục Khoá và Số buổi đã học trên thẻ thông tin chung của lớp`
- **Branch:** `vinh19410/Remove-thông-tin-chung-dư`
- **Plan:** `plans/261127-0511-remove-redundant-class-info-fields/plan.md`
- **Component:** `ClassInfoCard` — Student Class Detail (`/classes/$classId` — `apps/student`, `apps/e2e`, `DESIGN.md`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Sau khi #1013 gỡ thanh footer thừa ở đáy `ClassInfoCard`, thẻ thông tin chung của lớp trên `/classes/$classId` vẫn còn 2 mục lặp thông tin ngay cùng màn hình: **Khoá** (`cls.level`, đã hiện ở `JourneySummitCard` và `ClassCard`) và **Số buổi đã học** (`{held}/{totalSessions} buổi`, trùng thẳng với vòng `RingStat` đầu tiên `"Buổi học"` / `"Buổi đã diễn ra"` và bộ đếm `{heldCount}/{totalTeachingCount} buổi` trên `JourneySummitCard`).

Thay đổi đã triển khai:
- **`apps/student/src/components/class/class-info-card.tsx`:** Gỡ 2 `<InfoItem>` (`Khoá` và `Số buổi đã học`), xoá 2 unused icon imports (`BookOpen`, `ClipboardCheck`) và 2 unused props (`held`, `totalSessions`); giữ 4 mục (`Lịch`, `Hình thức`, `Giáo viên` kèm `mailto:`, `Khai giảng`) gọn thành 1 hàng trong `<dl>` (`grid-cols-2 md:grid-cols-4`).
- **Callers & giữ nguyên vùng dữ liệu thật:** Cập nhật đủ cả 2 caller (`apps/student/src/components/class/class-detail-view.tsx` và `apps/student/test/class-detail.test.tsx`); bảo toàn nguyên vẹn `RingStat` (`Buổi học` / `Buổi đã diễn ra`) và `JourneySummitCard` (`cls.level` và `{heldCount}/{totalTeachingCount} buổi`).
- **E2E & chụp POT (`apps/e2e/specs/helpers-quiz.ts`, `apps/e2e/specs/student-class-detail.spec.ts`):** Sửa lỗi percent-encoding trên worktree UTF-8 (`new URL(...).pathname` → `fileURLToPath`) ở `openDb()` và biến `screenshots`; bổ sung `classMeta?` tương thích ngược qua static column allowlist trong `seedQuizFixture` (giữ nguyên DB default `mode = "Online"`); siết browser assertions cho cả negative trên `ClassInfoCard` lẫn positive trên `RingStat` / `JourneySummitCard`; thêm luồng opt-in `CAPTURE_POT=1` + `POT_PREFIX` kiểm chứng keyboard `Tab` focus, `ThemeToggle` giữ dark mode qua `page.reload()` (`localStorage.theme`), và reflow `320px–1440px` không tràn ngang.
- **Tài liệu (`DESIGN.md:111-119`):** Đồng bộ mô tả `ClassInfoCard` còn tối đa 4 mục và ghi rõ đánh đổi có chủ đích cho lớp 0 buổi (`lessons.length === 0`, nơi `ClassLessonList` trả sớm `<OverviewEmptyState />` trước `JourneySummitCard`).

## Thực tế triển khai

Nhìn bề ngoài đây là một thay đổi xoá 2 ô `<InfoItem>` nhỏ, nhưng quá trình rà soát và kiểm định đã phát hiện 3 điểm vướng hạ tầng và test quan trọng. Worktree mang tên tiếng Việt có dấu `Remove-thông-tin-chung-dư` làm lộ lỗi `new URL(...).pathname` cũ trong `helpers-quiz.ts` và `student-class-detail.spec.ts`, vốn sẽ gây `SQLITE_CANTOPEN` và âm thầm tạo thư mục percent-encoded `Remove-th%C3%B4ng-tin-chung-d%C6%B0` xả `student-nav-*.png` ra ngoài git worktree nếu không được Red Team phát hiện trước. Ở bước viết assertion E2E, `page.getByText("Buổi đã diễn ra")` gặp strict mode violation vì Playwright khớp chuỗi con không phân biệt hoa/thường theo mặc định; đồng thời lượt `design:compare --force` ban đầu ghi nhận 2 ảnh dark bị blank-frame pixel check và đã pass sạch khi chạy lại.

## Quyết định kỹ thuật & Đánh đổi

1. **Gỡ dứt khoát `Khoá` (`cls.level`) khỏi `ClassInfoCard` kể cả với lớp 0 buổi (`lessons.length === 0`) và tab phụ (`?tab=assignments`, `?tab=materials`):**
   - *Bác bỏ:* Giữ nhánh điều kiện hiện lại `Khoá` khi `lessons.length === 0` hoặc khi rời tab `Hành trình học`.
   - *Lý do:* Nhánh điều kiện làm layout thẻ nhảy từ 4 lên 5 ô và giữ lại đúng mục cần gỡ của #1023; `cls.level` vẫn hiển thị trên `ClassCard` ở `/` và `/classes`. Chấp nhận đánh đổi này và ghi rõ tại `DESIGN.md:111-119`.
2. **Mở rộng `seedQuizFixture` bằng `classMeta?` đi qua static column allowlist (`level`, `mode`, `schedule`, `start_date`) với tham số `?`:**
   - *Bác bỏ:* Luôn truyền cứng cả 4 cột với fallback rỗng (sẽ ghi đè DB default `mode = "Online"`) hoặc dựng SQL từ `Object.keys(...)`.
   - *Lý do:* Giữ nguyên tương thích ngược cho các spec cũ không truyền `classMeta` đồng thời loại trừ rủi ro ghép tên cột động vào SQL.
3. **Không đụng `mailto:` RFC 6068 và không nới `truncate` trên `ClassInfoCard` trong #1023:**
   - *Bác bỏ:* Sửa kiểm định URI cho `mailto:` (finding Red Team #6) và đổi breakpoint `md:grid-cols-4` → `lg:grid-cols-4` ở cuối vòng review.
   - *Lý do:* Cả hai đều là hành vi sẵn có ngoài phạm vi #1023 (nối tiếp tiền lệ #1013).

## Chi tiết kỹ thuật & Điểm vướng đã xử lý

- **Lỗi đường dẫn UTF-8 (`URL.pathname` vs `fileURLToPath`):** Theo chuẩn WHATWG URL, `new URL("../local.db", import.meta.url).pathname` biến `Remove-thông-tin-chung-dư` thành `Remove-th%C3%B4ng-tin-chung-d%C6%B0`, gây lỗi `SQLITE_CANTOPEN` trong `openDb()` (`apps/e2e/specs/helpers-quiz.ts:86-91`) và làm `screenshots` (`apps/e2e/specs/student-class-detail.spec.ts:445-450`) ghi `student-nav-*.png` ra ngoài worktree. Chuyển cả hai điểm (và `reportsDir` cho `CAPTURE_POT=1`) sang `fileURLToPath(new URL(...))`.
- **Playwright strict mode với `getByText`:** Khác Testing Library (`exact: true`), Playwright `getByText(string)` mặc định là case-insensitive substring (`exact: false`), nên `page.getByText("Buổi đã diễn ra")` cho `RingStat` đụng với chuỗi `"buổi đã diễn ra"` bên trong `JourneySummitCard`. Chốt bằng `page.getByText("Buổi đã diễn ra", { exact: true })` (`apps/e2e/specs/student-class-detail.spec.ts:180-182`).
- **Transient blank frame khi chạy `design:compare --force`:** Pixel check phát hiện 2 ảnh dark chụp ra khung hình trống; không tắt check mà chạy lại `pnpm design:compare --screens s-class-detail`, kết quả hoàn tất sạch (`8 ảnh, 0 lỗi`).

## Bài học rút ra

1. **Không bao giờ dùng `new URL(...).pathname` làm đường dẫn filesystem trên Node.js:** Luôn bọc qua `fileURLToPath(new URL(...))`, đặc biệt khi repo/worktree có thể mang tên tiếng Việt có dấu hoặc khoảng trắng.
2. **Không mang giả định `getByText` của Testing Library sang Playwright:** Khi trang có cụm từ tiếng Việt chỉ khác chữ hoa/thường (`"Buổi đã diễn ra"` vs `"buổi đã diễn ra"`), luôn truyền `{ exact: true }` để tránh strict mode crash.
3. **Tôn trọng pixel check của `design:compare`:** Gặp báo ảnh trắng/rỗng ở chế độ dark thì chạy lại thay vì vô hiệu hoá chốt chặn chất lượng.

## Bước tiếp theo

- **Ship dual-stage (`--both`):** Đẩy nhánh `vinh19410/Remove-thông-tin-chung-dư`, mở & merge Beta PR vào `develop` chờ CI xanh, sau đó ship Stable PR vào `main` chờ CI xanh và đăng bình luận POT lên `#1023`.
- **Follow-up không chặn (từ re-review Minor #1 & #1013):** Mở issue riêng tinh chỉnh responsive cho `ClassInfoCard` để xử lý `truncate` ở mục `Lịch` và `Khai giảng` trên Tablet/Mobile (cân nhắc `md:grid-cols-4` vs `lg:grid-cols-4`).
