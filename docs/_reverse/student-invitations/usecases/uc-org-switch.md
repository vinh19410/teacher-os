```markdown
---
type: reverse-usecase
feature: student-invitations
uc: UC-05 — Học viên chuyển đổi giữa các tổ chức đã tham gia (multi-org)
status: draft
updated: 2026-11-11
links:
  - docs/_reverse/student-invitations/student-invitations-reverse-spec.md
  - docs/_reverse/student-invitations/usecases/student-invitations-reverse-usecase-index.md
  - docs/_reverse/student-invitations/_evidence.md
---

# UC-05 — Học viên chuyển đổi tổ chức đang hoạt động (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## a. Tổng quan

| Hạng mục | Nội dung | Nguồn | Nhãn |
|----------|----------|-------|------|
| UC ID | UC-05 | S10 | ✅ |
| Tên nghiệp vụ | Học viên có hồ sơ ở ≥2 tổ chức chọn org nào là "đang hoạt động"; mọi dữ liệu portal (lớp, bài tập, học phí) theo org đó | S7, S10 | ✅ |
| Actor chính | Học viên (đã tham gia ≥2 org) | apps/server/src/student.test.ts:417-448 | ✅ |
| Actor phụ | OrgSwitcher (UI), createStudentGuard (server) | apps/student/src/components/layout/org-switcher.tsx:15-52 | ✅ |
| Tiền điều kiện | User có ≥2 hàng `student` ở 2 org khác nhau; header `x-student-org-id` hoặc query `?org=` được gửi | apps/server/src/routes/student.ts:177-189 | ✅ |
| Hậu điều kiện | Org active đổi (localStorage + header); các query portal refetch theo org mới | apps/student/src/lib/repos/student.ts:45-67 | ✅ |

## b. Trigger

HV bấm OrgSwitcher trên shell portal → chọn org khác. ✅ apps/student/src/components/layout/org-switcher.tsx:41-45 (onOrg).

## c. Điều kiện vào

1. Session hợp lệ; user có ≥1 hàng student. ✅ apps/server/src/routes/student.ts:124-210
2. Org đích nằm trong danh sách org của user (từ GET /api/student/orgs). ✅ apps/server/src/routes/student.ts:676-711
3. CORS cho phép header `x-student-org-id`. ✅ apps/server/src/app.ts:387
4. localStorage `active_student_org_id` LƯU lựa chọn nhưng KHÔNG phải nguồn chân lý — server luôn tự re-resolve từ header/query rồi mới tin. ✅ apps/student/src/lib/repos/student.ts:45-67; apps/server/src/routes/student.ts:177-189 | 🔵

## d. Luồng chính

| # | Bước nghiệp vụ | Nguồn | Nhãn |
|---|----------------|-------|------|
| 1 | HV đăng nhập portal → createStudentGuard đọc `x-student-org-id` (header) ?? `?org=` (query) ?? mặc định hàng student mới nhất | apps/server/src/routes/student.ts:177-189 | ✅ |
| 2 | Guard kiểm tra hàng student tương ứng org được chọn có thuộc user hay không; nếu KHÔNG → fallback im lặng về hàng student mới nhất (không lỗi) | apps/server/src/routes/student.ts:177-189; apps/server/src/student.test.ts:450-488 | ✅ |
| 3 | OrgSwitcher lấy danh sách org của user qua GET /api/student/orgs | apps/student/src/components/layout/org-switcher.tsx:15-52; apps/server/src/routes/student.ts:676-711 | ✅ |
| 4 | HV chọn org khác → onOrg: setActiveStudentOrgId(org mới) vào localStorage | apps/student/src/components/layout/org-switcher.tsx:41-45; apps/student/src/lib/repos/student.ts:45-53 | ✅ |
| 5 | Tất cả request sau đó gắn header `x-student-org-id: <org mới>` (getStudentHeaders) | apps/student/src/lib/repos/student.ts:55-67 | ✅ |
| 6 | Client invalidate toàn bộ query portal (classes, assignments, tuition...) → refetch theo org mới | apps/student/src/components/layout/org-switcher.tsx:41-45 | 🔵 |
| 7 | Portal hiển thị dữ liệu của org mới (lớp, bài tập, thông báo) | apps/student/src/components/layout/student-shell.tsx:57 | ✅ |
| 8 | E2E xác minh chuyển org qua switcher → nội dung thay đổi (classes và assignments theo org mới) | apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:222-230 | ✅ |

### e. Ràng buộc

1. Org được chọn được persist ở localStorage nhưng KHÔNG được ghi vào DB/session — server resolve độc lập mỗi request. ✅ apps/student/src/lib/repos/student.ts:45-67; apps/server/src/routes/student.ts:177-189 | 🔵
2. Fallback im lặng: nếu `x-student-org-id` không thuộc user, server không trả lỗi — dùng hàng mới nhất. ✅ apps/server/src/student.test.ts:450-488
3. GET /api/student/orgs trả về: id (org), name (tên org), isCurrent (org đang active — khớp header/query, nếu không thì hồ sơ mới nhất). KHÔNG có learning manager, KHÔNG có role. ✅ packages/api/src/contracts.ts:2954-2958; apps/server/src/routes/student.ts:676-711
4. `?org=` query chỉ dùng cho URL share/edge case; chính là cơ chế ưu tiên dưới header. ✅ apps/server/src/routes/student.ts:177-189 | 🔵

## f. Luồng thay thế & ngoại lệ

| # | Kịch bản | Xử lý | Nguồn | Nhãn |
|---|----------|--------|-------|------|
| A1 | Header `x-student-org-id` chứa org mà user không thuộc | Fallback im lặng về hàng student mới nhất (200, không lỗi) | apps/server/src/student.test.ts:450-488 | ✅ |
| A2 | Không có header, không có query → dùng hàng student mới nhất theo createdAt | apps/server/src/routes/student.ts:177-189 | ✅ |
| A3 | User mới accept org thứ 2 (UC-03 d.8-d10) | setActiveStudentOrgId + invalidate query → switcher tự cập nhật | apps/student/src/lib/repos/student.ts:249-274 | ✅ |
| A4 | localStorage empty (máy mới / clear cache) | getActiveStudentOrgId trả null → header không set → server dùng hàng mới nhất | apps/student/src/lib/repos/student.ts:45-53 | ✅ |
| A5 | HV rời org / bị xóa hồ sơ ở org đang active (ngoài scope feature) | Server fallback im lặng về org khác | apps/server/src/routes/student.ts:177-189 | 🔵 |
| A6 | 2 tab trên cùng trình duyệt chọn org khác nhau | localStorage chung → tab sau ghi đè tab trước (không sync realtime giữa 2 tab) | apps/student/src/lib/repos/student.ts:45-53 | 🔵 |

## g. NFR liên quan

| ID | Yêu cầu | Nguồn | Nhãn |
|----|---------|-------|------|
| NFR-STUDENT-INVITATIONS-009 | Chuyển org KHÔNG reload trang (SPA invalidate + refetch) | apps/student/src/components/layout/org-switcher.tsx:41-45 | 🔵 |
| NFR-STUDENT-INVITATIONS-010 | Header `x-student-org-id` được cho phép trong CORS allow-headers | apps/server/src/app.ts:387 | ✅ |

## h. Truy vết

### UC-05 ↔ FR ↔ Error ↔ Test

| FR | Điểm UC | Error | Test phủ | Nguồn | Nhãn |
|----|---------|-------|----------|-------|------|
| FR-STUDENT-INVITATIONS-015 (danh sách org của HV) | d3, e3 | — | apps/server/src/student.test.ts:417-448 | S6 | ✅ |
| FR-STUDENT-INVITATIONS-015 (chuyển org active) | d4-d7, e1-e2, A1-A2, A4 | — (fallback im lặng nên không có lỗi; 0 hàng student mới rơi E-012) | apps/server/src/student.test.ts:417-488; apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:222-230 | S6, S10 | ✅ |
| BR-STUDENT-INVITATIONS-001 (multi-org: 1 email - nhiều hồ sơ org) | c1, e1, A3 | — | apps/server/src/student.test.ts:417-448; apps/server/src/student-multi-org-migration.test.ts:34-94 | S6 | ✅ |
| — (org header/query override, gộp trong FR-015; FR-016 trong spec là auto-accept tạo HV thủ công) | d1-d2, e4 | — | apps/server/src/student.test.ts:417-488 | S6 | ✅ |

### Ghi chú reverse

- Không có thông báo cho GV khi HV chuyển org (chuyển org chỉ là chọn góc nhìn dữ liệu). 🔵
- Ranh giới: feature `student-classes`/`student-tuition` đọc dữ liệu theo org active — không thuộc scope UC-05 ngoài việc cho chọn org. ✅
```
