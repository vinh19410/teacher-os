# Dogfood QA Report

**Target:** https://app.staging.teacheros.io.vn  
**Date:** 2026-09-17  
**Scope:** Vòng 1 first-run + vòng 2 full-flow (syllabus/module/lesson, lớp, enroll, hóa đơn, mark-paid, lịch, báo cáo, search, profile, settings, logout)  
**Tester:** Hermes Agent (exploratory QA trên staging)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 6 |
| 🟡 Medium | 8 |
| 🔵 Low | 4 |
| **Total** | **18** |

**Overall Assessment:** Kernel write chính (học viên, lớp, enroll, syllabus+module+lesson, hóa đơn, mark-paid, ghi chú lớp, rename profile, logout/signin) **chạy được**. Báo cáo tuần / xóa tài khoản / cài đặt / bài tập là UI giả hoặc thiếu CTA. Điểm danh buổi chỉ hiện sau khi có học viên; buổi tương lai không hoàn thành được (đúng design, copy rõ).

---

## Issues

### Issue #1: Form Sign in / Create account disable nút submit, không hiện lỗi field

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | UX / Functional |
| **URL** | https://app.staging.teacheros.io.vn/login |

**Description:**  
`SubmitButton` `disabled={!canSubmit}`. Schema chỉ chạy `onSubmit`. User không bấm được nút khi form invalid, nên **không bao giờ thấy** “Invalid email address” / “Name must be at least 2 characters”. Email `not-an-email` và tên `A` không có viền đỏ; chỉ password trống hiện lỗi nếu submit được force. Zod trong repo **có reject** các giá trị này — bug nằm ở UX validation, không phải schema.

**Steps to Reproduce:**
1. Mở `/login` (tab Create account hoặc Sign in).
2. Để trống, hoặc nhập `not-an-email` / tên `A`.
3. Quan sát nút Create account / Sign in (màu nhạt, `disabled`).

**Expected Behavior:**  
Bấm submit được và thấy lỗi dưới từng field; hoặc validate onBlur/onChange rồi disable.

**Actual Behavior:**  
Nút chết, không giải thích. User không biết thiếu gì.

**Screenshot:**  
`dogfood-output/screenshots/03-signup-invalid-email.png`  
`dogfood-output/screenshots/06-signin-invalid-email.png`

---

### Issue #2: Trang Bài tập không có cách tạo bài tập

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | Functional |
| **URL** | https://app.staging.teacheros.io.vn/assignments |

**Description:**  
First-run: `0 bài tập · 0 cần xử lý`, filter Chưa nộp/Trễ/Đã chấm, bảng trống. **Không có** nút “+ Tạo bài tập” (khác Lớp/Học viên/Học phí/Syllabus/Báo cáo). Source `assignments/index.tsx` chỉ list snapshot.

**Steps to Reproduce:**
1. Đăng ký tài khoản mới.
2. Mở Bài tập.

**Expected Behavior:**  
CTA tạo bài, hoặc empty state chỉ chỗ tạo (từ lớp/học viên).

**Actual Behavior:**  
Trang chết cho giáo viên chưa có data.

**Screenshot:**  
`dogfood-output/screenshots/18-auth-assignments.png`

---

### Issue #3: Cài đặt trông editable nhưng không lưu — tab Dữ liệu nhận là demo

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | Functional |
| **URL** | https://app.staging.teacheros.io.vn/settings |

**Description:**  
Đơn giá mặc định, mẫu Zalo, quy tắc vắng/nhắc là `useState` local, **không có Save**, không gọi kernel. Tab Dữ liệu ghi *“Đây là bản demo — dữ liệu hiển thị là dữ liệu mẫu, chưa có xuất file thật.”* Nút Xuất CSV/JSON/Xóa tài khoản không có confirm/side-effect rõ. Gói **Pro · Đang dùng · 99.000đ/tháng** hardcode cho user mới; “Quản lý thanh toán” disabled + badge Sắp ra mắt.

**Steps to Reproduce:**
1. Vào Cài đặt → sửa đơn giá / mẫu tin.
2. Đổi tab hoặc reload.

**Expected Behavior:**  
Lưu được, hoặc field disabled/ghi “chưa mở”.

**Actual Behavior:**  
Form giả; giáo viên tưởng đã cấu hình workspace.

**Screenshot:**  
`dogfood-output/screenshots/22-auth-settings.png`

---

### Issue #4: Dashboard luôn “Chào buổi sáng” (kể cả tối)

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | UX / Content |
| **URL** | https://app.staging.teacheros.io.vn/dashboard |

**Description:**  
Copy cứng `Chào buổi sáng, ${displayName}` trong `dashboard.tsx`. Test ~19:56 ICT ngày 2026-09-17 vẫn chào buổi sáng. Empty state không CTA “Thêm học viên / Tạo lớp”.

**Steps to Reproduce:**
1. Login sau 18:00 ICT.
2. Mở Tổng quan.

**Expected Behavior:**  
Chào theo buổi (chiều/tối) hoặc chào trung tính.

**Actual Behavior:**  
“Chào buổi sáng, QA Dogfood” lúc tối.

**Screenshot:**  
`dogfood-output/screenshots/14-auth-dashboard.png`  
`dogfood-output/screenshots/30-mobile-dashboard.png`

---

### Issue #5: Login tiếng Anh, app tiếng Việt (`lang=vi`)

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | Content / Accessibility |
| **URL** | https://app.staging.teacheros.io.vn/login |

**Description:**  
`<html lang="vi">` nhưng login: “Create your account”, “Continue with Google”, “Forgot password?”. Settings lead: “Giao diện tiếng Việt.” Sidebar/workspace VI. Giáo viên Việt Nam first-run lệch hẳn.

**Screenshot:**  
`dogfood-output/screenshots/01-login-default.png`

---

### Issue #6: Empty states thiếu copy/CTA (trừ Báo cáo)

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | /students, /classes, /schedule, /tuition, /syllabus, /assignments |

**Description:**  
Học viên/Lớp/Học phí: header bảng + hàng trống, không “Chưa có học viên”. Syllabus: trắng, chỉ filter + “+ Tạo syllabus”. Lịch: tuần trống, legend Trial/Mock/Review tiếng Anh, không CTA. Báo cáo làm đúng (empty card + hướng dẫn).

**Screenshot:**  
`dogfood-output/screenshots/15-auth-students.png`  
`dogfood-output/screenshots/16-auth-schedule.png`  
`dogfood-output/screenshots/19-auth-classes.png`  
`dogfood-output/screenshots/20-auth-syllabus.png`  
`dogfood-output/screenshots/21-auth-reports.png`

---

### Issue #7: Badge thông báo đỏ khi workspace trống

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | mọi trang authenticated |

**Description:**  
Chuông topbar luôn chấm đỏ trên tài khoản mới, 0 học viên / 0 lớp.

**Screenshot:**  
`dogfood-output/screenshots/14-auth-dashboard.png`

---

### Issue #8: Sidebar truncate tên + badge PRO hardcode

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | Visual |
| **URL** | App shell |

**Description:**  
“QA Dogfood” → “QA Do…”. Email cũng cắt. Badge `PRO` hardcode trong `sidebar.tsx` (mọi user mới).

**Screenshot:**  
`dogfood-output/screenshots/20-auth-syllabus.png`

---

### Issue #9: CSP `script-src 'self'` chặn Cloudflare Insights beacon

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | Console |
| **URL** | https://app.staging.teacheros.io.vn/login |

**Description:**  
Console:  
`Loading the script 'https://static.cloudflareinsights.com/beacon.min.js/...' violates CSP directive "script-src 'self'".`  
Analytics Web Analytics không chạy sau security headers.

**Expected Behavior:**  
Bỏ beacon, hoặc thêm domain vào CSP.

---

### Issue #10: KPI học phí “Còn nợ” đỏ với 0đ; filter EN/VI lẫn

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX / Visual |
| **URL** | /tuition, /students, /syllabus |

**Description:**  
Học phí: “Còn nợ (VND)” 0đ kiểu danger dù không nợ. Chip Writing/Speaking/Online/Offline/Syllabus title tiếng Anh trong UI Việt.

**Screenshot:**  
`dogfood-output/screenshots/17-auth-tuition.png`

---

### Issue #11: Brand panel login ngày demo cố định “Thu, Aug 20”

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | Content |
| **URL** | /login |

**Description:**  
Marketing card “Today · Thu, Aug 20 · 3 classes” không theo ngày thật (test 17/09/2026).

**Screenshot:**  
`dogfood-output/screenshots/01-login-default.png`

---

### Issue #12: Password hint trùng placeholder (“At least 8 characters”)

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | UX |
| **URL** | /login (signup) |

**Description:**  
Placeholder + hàng hint (circle) cùng một câu. Mobile trông giống radio thừa.

**Screenshot:**  
`dogfood-output/screenshots/32-mobile-login.png`

---

### Issue #13: “Gửi qua Zalo OA” trên Báo cáo khi chưa kết nối kênh

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | UX |
| **URL** | /reports |

**Description:**  
Empty state vẫn CTA Zalo OA, không trạng thái kết nối / disable.

**Screenshot:**  
`dogfood-output/screenshots/21-auth-reports.png`

---

## Issues Summary Table

| # | Title | Severity | Category | URL |
|---|-------|----------|----------|-----|
| 1 | Auth submit disabled, không hiện lỗi field | High | UX | /login |
| 2 | Bài tập không có CTA tạo | High | Functional | /assignments |
| 3 | Cài đặt không persist / demo | High | Functional | /settings |
| 4 | “Chào buổi sáng” cứng lúc tối | High | UX | /dashboard |
| 5 | Login EN vs app VI | Medium | Content | /login |
| 6 | Empty states thiếu copy/CTA | Medium | UX | list pages |
| 7 | Bell đỏ khi không có notif | Medium | UX | shell |
| 8 | Truncate tên + PRO hardcode | Medium | Visual | sidebar |
| 9 | CSP chặn CF beacon | Medium | Console | global |
| 10 | KPI nợ đỏ 0đ + filter EN | Medium | UX | /tuition |
| 11 | Brand panel ngày Aug 20 | Low | Content | /login |
| 12 | Password hint trùng | Low | UX | /login |
| 13 | Zalo OA CTA lúc chưa connect | Low | UX | /reports |

---

### Issue #14: “Gửi báo cáo tuần” chỉ đóng modal, không lưu

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | Functional |
| **URL** | https://app.staging.teacheros.io.vn/reports |

**Description:**  
`CreateReportModal.submit` = `onClose()`. Điền học viên + chu kỳ + nội dung + Gửi báo cáo → list vẫn trống, nhật ký gửi tin vẫn empty.

**Screenshot:** `dogfood-output/full/screenshots/21-after-send-report.png`

---

### Issue #15: Nút “Xóa tài khoản” không confirm, click không làm gì

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | UX |
| **URL** | https://app.staging.teacheros.io.vn/settings (tab Dữ liệu) |

**Description:**  
Nút danger không dialog, không xóa, không toast. Cùng tab ghi “bản demo”.

**Screenshot:** `dogfood-output/full/screenshots/30-delete-account-click.png`

---

### Issue #16: Chuông đỏ + panel “Thông báo” trống

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | App shell |

**Description:**  
Badge đỏ lúc 0 notif. Mở panel chỉ có title, không empty copy.

**Screenshot:** `dogfood-output/full/screenshots/24-notif-panel.png`

---

### Issue #17: Tạo lớp không gắn syllabus — phải “Nhập từ template” sau

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | /classes/$classId |

**Description:**  
Modal tạo lớp có “Template giáo trình”, nhưng lớp mới vẫn “Lớp chưa có giáo trình”, KPI bài syllabus = —. Buổi hiện “Dự kiến”, chủ đề —. Có CTA “Nhập từ template”.

**Screenshot:** `dogfood-output/full/retry/sess.png`

---

### Issue #18: Hóa đơn hiện UUID làm mã, loại “—”

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | UX |
| **URL** | /tuition |

**Description:**  
Cột MÃ = UUID đầy đủ. Loại “—”. Mark-paid **có** đổi sang Đã thu / CK, KPI Đã thu 450.000đ.

**Screenshot:** `dogfood-output/full/screenshots/17-after-mark-paid.png`

---

## Testing Coverage

### PASS (đã tạo/sửa data thật trên staging)
- Signup email, logout, signin lại
- Thêm học viên + enroll vào lớp
- Tạo lớp, tab Buổi học (12 buổi T6 19:00 từ 18/09), ghi chú lớp
- Tạo syllabus + module + lesson
- Tạo hóa đơn 450.000đ + **Đã nhận** (mark-paid)
- Search “Học viên Full” → student detail
- Profile đổi tên
- Schedule mở lesson modal (check-in disabled đến ngày buổi — copy đúng)
- Settings 4 tab (xem)

### FAIL / giả
- Bài tập: không CTA tạo, list 0 sau khi có lớp+HV
- Báo cáo tuần: submit không persist
- Xóa tài khoản: no-op
- Cài đặt mẫu/quy tắc/xuất file: local/demo

### SKIP / chưa làm hết
- Google OAuth / link Google full
- Avatar upload
- Hoàn thành/Hủy buổi ngày hôm nay (startDate = ngày mai; lớp không HV chỉ “Dự kiến”, không “Điều chỉnh”)
- Nhập syllabus vào lớp (“Nhập từ template”)
- Reorder/xóa module-lesson, import CSV
- Chấm bài (`grade-modal`) — không có assignment
- Xuất CSV/JSON file thật

### Blockers
- Không blocker auth. Điểm danh hôm nay bị chặn bởi rule startDate > hôm nay.

---

## Notes

**Đi được:** account → học viên → lớp → enroll → hóa đơn → mark-paid → syllabus/module/lesson → search → profile → logout.

**Giả / thiếu trước UAT:** báo cáo, bài tập, xóa TK, cài đặt persist, login EN, greeting sáng, bell đỏ.

Evidence vòng 2: `dogfood-output/full/` (32 ảnh + retry syllabus).
