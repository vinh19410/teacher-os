---
type: reverse-srs
feature: students
status: draft
updated: 2026-11-11
confidence_summary: "✅227 🔵8 🟡16 — OQ 8 (đếm cơ học trên 12 file, loại dòng legend/front-matter/ghi-chú-nhãn)"
links:
  - ./reverse-sources.md
  - ./reverse-gaps.md
  - ./_evidence.md
  - ./srs/students-reverse-flows.md
  - ./srs/students-reverse-states.md
  - ./srs/students-reverse-erd.md
  - ./usecases/students-reverse-usecase-index.md
---

# students — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md).
- **Câu hỏi mở / khác biệt:** xem [`reverse-gaps.md`](./reverse-gaps.md).
- **Bằng chứng code→luồng:** xem [`_evidence.md`](./_evidence.md).

### 0.3 Khác biệt với tài liệu chính (chỉ khi feature trùng doc hiện có)

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md`) | Đề xuất |
|------|------------------------|-----------------------------------|---------|
| Tạo hồ sơ học viên | `POST /api/students` còn hoạt động, được UI "Thêm học viên" và unit test phủ (kernel.ts:463; kernel.test.ts:4982,4995,5027) | "teachers no longer create students manually" (PDR dòng 23) | `/gap` G-1 + OQ-1: quyết định nguồn chân lý trước khi duyệt SRS |
| Gắn học viên vào lớp | `POST /api/students` có nhận `classId` và tự tạo enrollment `invited` (kernel.ts:544-554) | "only enroll existing students into classes via POST /api/classes/:id/enroll" (PDR dòng 23) | `/gap` G-1: 2 đường ghi danh cùng tồn tại, cần 1 dòng ranh giới rõ |

## 1. Scope

Feature **students** là quản trị hồ sơ học viên phía **teacher portal**: xem danh sách org-scoped, xem chi tiết hồ sơ (lớp đang học, điểm đầu vào, phụ huynh, học phí, bài tập, lịch sử buổi), thêm học viên thủ công, gửi lại lời mời portal cho hồ sơ chưa liên kết. ✅ [S1][S2][S3]

- Danh sách học viên đọc từ kernel snapshot theo `orgId` của membership giáo viên, loại bỏ row seed `demo-student:%`. ✅ [S4] `apps/server/src/routes/kernel.ts:456-461` + `apps/server/src/routes/snapshot.ts:267-273`
- Hồ sơ là **org-scoped**: cùng email có thể tồn tại ở nhiều tổ chức; ràng buộc `UNIQUE(org_id, lower(trim(email)))` (partial index). ✅ [S5] `packages/db/src/schema/student.ts:66-70`; test `apps/server/src/student-multi-org-migration.test.ts:34-52`
- Điểm đầu vào (`entryScore`) là chuỗi tự do ≤50 ký tự, do giáo viên nhập lúc tạo hồ sơ hoặc do học viên nhập ở wizard onboarding portal. ✅ [S3][S6] `packages/api/src/contracts.ts:24-31`; `apps/server/src/routes/kernel.ts:526`; `apps/server/src/routes/student.ts:1274-1275`
- **KHÔNG có** endpoint cập nhật/xóa hồ sơ học viên phía giáo viên (negative search, xem G-2). ✅ (về sự vắng mặt) — grep toàn `apps/server/src` không thấy `kernel.patch/put/delete("/students…")`.
- **Boundary — ngoài scope feature này:**
  - Lời mời/chấp nhận vào tổ chức (`student_invitation`, `POST /api/students/invite`, `GET /api/students/invitations`, resend/hủy lời mời org) → feature `student-invitations`. Hand-off: `apps/server/src/routes/kernel.ts:696,912,925,1346`.
  - Vòng đời ghi danh lớp (`invited → active`, `POST /api/classes/:id/enroll`, kích hoạt) → feature `enrollment-lifecycle`. Hand-off: `apps/server/src/routes/kernel.ts:1383`.
  - Portal học viên (onboarding, portal quiz, portal học phí…) → các feature `student-*`. Hand-off: `apps/server/src/routes/student.ts`.
  - Timeline công nợ theo học viên `GET /api/students/:id/billing-timeline` → feature `tuition-invoicing` (chỉ nhắc vì path chứa `students`). `apps/server/src/routes/kernel.ts:3271-3277`.

## 2. Actors & Stakeholders

| Actor | Loại (người/hệ thống/ngoài) | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|-----------------------------|----------|--------------|-------|------|
| Giáo viên chủ tổ chức (membership `teacher`/`owner`) | người | Xem/quản lý danh sách + hồ sơ học viên, thêm học viên, theo dõi liên kết portal | Có | `apps/server/src/app.ts:279-296` (bootstrap membership teacher) | ✅ |
| Trợ giảng (`ta`) — membership phụ (`class_teacher` NẰM TRONG allowlist resend — xem FR-021) | người | Xem danh sách; `ta` bị chặn gửi lại lời mời (403) | Có (chỉ nhánh `ta` bị chặn) | `apps/server/src/routes/kernel.ts:219-231`; `packages/auth/src/role.ts:112-138` | ✅ |
| Học viên (tài khoản portal `student`) | người | — (chỉ xuất hiện dưới dạng "trạng thái liên kết" trong danh sách; self-serve onboarding) | Không (boundary `student-*`) | `apps/server/src/routes/student.ts:1241-1289` | 🔵 |
| Hệ thống gửi email (mailer) | hệ thống | Phát email mời portal khi tạo hồ sơ / gửi lại | Có (best-effort) | `apps/server/src/routes/kernel.ts:575-615` | ✅ |
| Dịch vụ Zalo (deep link `zalo.me`) | ngoài | Mở cửa sổ nhắn tin Zalo với phụ huynh/học viên | Có (client-side link) | `apps/web/src/routes/_auth/students/$studentId.tsx:209-217` | ✅ |

## 3. Functional Requirements (FR)

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-students-001 | Xem danh sách học viên org-scoped | GET `/api/students` trả đúng `students` của kernel snapshot theo `orgId`; loại row `demo-student:%`; sắp theo `createdAt` asc | P0 | test | `apps/server/src/routes/kernel.ts:456-461`; `apps/server/src/routes/snapshot.ts:267-273`; test `apps/server/src/kernel.test.ts:5027-5034`, `apps/web/src/routes/_auth/students/index.test.tsx:53-59` | ✅ |
| FR-students-002 | Badge trạng thái liên kết portal trên từng dòng | Row không email → badge "Chưa liên kết Portal"; row có email + `portalLinked=false` → badge "Chờ xác nhận" + nút "Gửi lại lời mời" | P1 | test | `apps/web/src/routes/_auth/students/index.tsx:177-194,233-242`; `apps/web/src/lib/repos/students.ts:97-102`; test `index.test.tsx:137-187` | ✅ |
| FR-students-003 | Lọc danh sách theo chip tiếng Việt | Chip "Tất cả / Sắp hết buổi / Nợ học phí / Viết / Nói"; lọc client-side theo `tags` của student | P2 | demo | `apps/web/src/routes/_auth/students/index.tsx:31-37,75-81,123-125`; test `index.test.tsx:126-135` (chỉ test présence chip, chưa test hành vi lọc) | 🟡 (hiệu lực lọc — tags luôn rỗng, xem OQ-3) |
| FR-students-004 | KPI header danh sách | Kicker "N học viên đang học · M lời mời đang chờ" + lead "K cần chú ý (nợ học phí / sắp hết gói)" tính từ dữ liệu live | P1 | test | `apps/web/src/routes/_auth/students/index.tsx:60-73,85-87`; test `index.test.tsx:95-124,189-257` | ✅ |
| FR-students-005 | Tab "Lời mời đang chờ" gộp 2 nguồn | Gộp học viên có email chưa xác nhận portal + lời mời org đang `pending`, khử trùng lặp theo email (lower/trim) | P1 | test | `apps/web/src/routes/_auth/students/index.tsx:45-60,128-132`; `apps/web/src/lib/repos/students.ts:108-116`; test `index.test.tsx:189-257` | ✅ |
| FR-students-006 | Mở chi tiết từ dòng danh sách | Click dòng → SPA navigate `/students/$studentId` | P0 | test (E2E) | `apps/web/src/routes/_auth/students/index.tsx:162-169`; `apps/e2e/specs/student-row-detail.spec.ts:13-32` | ✅ |
| FR-students-007 | Trang chi tiết: hồ sơ | Header liên hệ (phone/zalo/email + badge portal), tab Hồ sơ: lớp đang học (link + badge "Đã mời"), Điểm đầu vào ("Chưa có" nếu rỗng), phụ huynh, ghi chú nội bộ | P0 | demo | `apps/web/src/routes/_auth/students/$studentId.tsx:159-305` | ✅ |
| FR-students-008 | Chi tiết: id lạ → trang 404 thân thiện | id không khớp student nào → `notFound()` → card "Không tìm thấy học viên" + link về danh sách | P0 | test (E2E) | `apps/web/src/routes/_auth/students/$studentId.tsx:45-61,140-142`; `apps/e2e/specs/student-row-detail.spec.ts:34-47`; test `$studentId.test.tsx:56-67` | ✅ |
| FR-students-009 | Chi tiết: tab Lịch sử buổi | Bảng buổi học của student (thứ/giờ/loại/chủ đề/trạng thái) | P2 | demo | `apps/web/src/routes/_auth/students/$studentId.tsx:144,307-324` | ✅ |
| FR-students-010 | Chi tiết: tab Học phí | Tổng kết học phí theo enrollment + bảng hóa đơn; click dòng mở `/tuition/$invoiceId` | P1 | demo | `apps/web/src/routes/_auth/students/$studentId.tsx:326-368` (click: 344-349) | ✅ |
| FR-students-011 | Chi tiết: tab Bài tập | Bảng bài tập 2 nhánh: class assignment (trạng thái nộp) + grading (band đã chấm) | P2 | demo | `apps/web/src/routes/_auth/students/$studentId.tsx:79-129,370-380` | ✅ |
| FR-students-012 | Thêm học viên thủ công | POST `/api/students`: name bắt buộc; phone/parentPhone chỉ chữ số ≤20; email tùy chọn (hợp lệ + viết thường — lowercase); zalo copy phone; tạo ngay 201 + id server | P0 | test | `apps/server/src/routes/kernel.ts:463-528`; `packages/api/src/contracts.ts:33-65`; test `apps/server/src/kernel.test.ts:4982-4993`; UI `apps/web/src/components/modals/add-student-modal.tsx:66-113` | ✅ (+🟡 mâu thuẫn PDR — OQ-1) |
| FR-students-013 | Tạo kèm ghi danh lớp (tùy chọn) | Có `classId` hợp lệ → tạo enrollment `invited` cùng batch; `activateNow=true` (default) → kích hoạt ngay (sinh gói + buổi học); `activateNow=false` → chỉ "Đã mời" | P1 | test | `apps/server/src/routes/kernel.ts:473-477,544-554,617-651`; test `kernel.test.ts:7092-7110`; E2E `apps/e2e/specs/enroll-existing-student.spec.ts:174-300` | ✅ |
| FR-students-014 | Điểm đầu vào: nhập, giới hạn, hiển thị | `entryScore` trim ≤50 ký tự; `""`/vắng → lưu NULL; snapshot trả `""`; chi tiết hiển thị "Chưa có" khi rỗng | P1 | test | `packages/api/src/contracts.ts:24-31`; `apps/server/src/routes/kernel.ts:526`; `apps/server/src/routes/snapshot.ts:655`; `apps/web/src/routes/_auth/students/$studentId.tsx:275-281`; test `kernel.test.ts:4995-5025` | ✅ |
| FR-students-015 | Chặn trùng email trong cùng tổ chức | Tạo hồ sơ với email đã tồn tại trong org → 409 `ALREADY_IN_ORG` kèm `existingStudentId/Name/portalLinked` (pre-check + bắt lỗi race của unique index) | P0 | phân tích (code — chưa có test API trực tiếp cho 409 trên POST /api/students; unique index có test migration student-multi-org-migration.test.ts:34-63) | `apps/server/src/routes/kernel.ts:479-511,556-573`; `packages/db/src/schema/student.ts:66-70` | ✅ |
| FR-students-016 | Tự chấp nhận lời mời org khi tạo hồ sơ trùng email | Nếu có `student_invitation` `pending` cùng email trong org → chuyển `accepted` trong cùng batch | P2 | phân tích | `apps/server/src/routes/kernel.ts:530-543` | ✅ |
| FR-students-017 | Gửi email mời portal khi tạo hồ sơ (best-effort) | Có email → gửi mail mời portal sync (timeout 5s), thành công thì stamp `lastInviteEmailAt`; thất bại không làm fail request, trả `inviteEmailSent=false`; không nhập email → không gửi (`inviteEmailSent` vắng mặt) | P1 | test (API) | `apps/server/src/routes/kernel.ts:575-615,636-693`; `packages/api/src/contracts.ts:71-78`; UI cảnh báo `apps/web/src/components/modals/add-student-modal.tsx:106-110` | ✅ |
| FR-students-018 | Gửi lại lời mời portal từ danh sách/chi tiết | POST `/api/students/:id/resend-invite` cho học viên có email chưa liên kết; cooldown 60s → 429 + `Retry-After`; UI đếm ngược "Gửi lại (Ns)" | P1 | test | `apps/server/src/routes/kernel.ts:1073-1160,216,233-252`; `apps/web/src/components/students/pending-invite-callout.tsx:60-141`; test `apps/web/src/routes/_auth/students/index.test.tsx:175-187` | ✅ |
| FR-students-019 | Nhắn Zalo từ chi tiết | Nút mở `https://zalo.me/{zalo}` tab mới | P2 | demo | `apps/web/src/routes/_auth/students/$studentId.tsx:209-217` | ✅ |
| FR-students-020 | Tạo báo cáo phụ huynh (feature flag) | Nút "Tạo báo cáo" chỉ render khi `PARENT_REPORTS_ENABLED` — hiện `false` (ẩn hoàn toàn) | P2 | kiểm tra | `apps/web/src/lib/features.ts:7`; `apps/web/src/routes/_auth/students/$studentId.tsx:218-222`; test flag-on `apps/web/src/routes/_auth/students/$studentId.reports.test.tsx:31-39` | 🟡 (flag off — OQ-5 ghi nhận) |
| FR-students-021 | Role gate cho resend lời mời | Chỉ `teacher/owner/admin/class_teacher` được gửi lại lời mời; `ta` → 403 "Trợ giảng không có quyền quản lý lời mời học viên" | P1 | phân tích | `apps/server/src/routes/kernel.ts:219-231,1076`; `packages/auth/src/role.ts:112-138` | ✅ |
| FR-students-022 | Cập nhật hồ sơ học viên phía giáo viên | **Không tồn tại** trong code: không PATCH/PUT/DELETE `/api/students*` cho hồ sơ; modal chỉnh sửa không có (negative search G-2) | — | phân tích | negative search `apps/server/src` (chỉ `student.ts:1266` onboarding portal + update `lastInviteEmailAt`) | 🟡 (OQ-2) |
| FR-students-023 | Tách dữ liệu demo khỏi danh sách giáo viên | Row id dạng `demo-student:%` bị loại khỏi snapshot giáo viên và khỏi check trùng email khi tạo | P2 | phân tích | `apps/server/src/routes/snapshot.ts:271`; `apps/server/src/routes/kernel.ts:492,1102` | ✅ |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-students-001 | security/isolation | Kernel API chỉ cho teacher app: session role `student`/`admin` → 403 trước khi tới route; org context lấy từ membership sớm nhất | P0 | test | `apps/server/src/app.ts:227-246,279-296`; test `apps/server/src/kernel.test.ts:1485` (cross-org 404) | ✅ |
| NFR-students-002 | security/CSRF | Mọi write kernel: Origin phải nằm trong allowlist; POST bắt buộc `Content-Type: application/json` | P0 | test | `apps/server/src/routes/kernel.ts:186-207`; test `apps/server/src/student.test.ts:560` (cùng contract) | ✅ |
| NFR-students-003 | data-normalization | Email lưu `trim().toLowerCase()`; so khớp danh tính theo biểu thức `lower(trim(email))` (case-insensitive) | P0 | test | `apps/server/src/routes/kernel.ts:470,488-491`; `packages/db/src/schema/student.ts:66-70`; test `apps/server/src/student.test.ts:501` (portal cùng contract) | ✅ |
| NFR-students-004 | compatibility | `entryScore`/`portalLinked` là field tùy chọn trên wire để chịu deploy skew (server cũ không gửi vẫn parse được) | P2 | phân tích | `packages/api/src/contracts.ts:1585-1588`; `apps/web/src/lib/repos/students.ts:65-67` | ✅ |
| NFR-students-005 | performance | Danh sách đọc 1 lần từ snapshot (`/api/kernel`), không fetch thứ hai; lọc/đếm client-side | P2 | demo | `apps/web/src/lib/repos/use-students.ts:1-25` | 🔵 (không có ngưỡng hiệu năng định lượng trong nguồn) |
| NFR-students-006 | scalability | GET `/api/students` không có phân trang/tìm kiếm server-side — toàn bộ student org được trả trong snapshot | P2 | phân tích | `apps/server/src/routes/snapshot.ts:267-273` | 🟡 (OQ-8 — quy mô org lớn chưa được nguồn đề cập) |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-students-001 | Một email (chuẩn hóa `lower(trim)`) chỉ có 1 hồ sơ trong mỗi org; khác org được phép trùng | Tạo hồ sơ / provision portal | FR-012, FR-015 | `packages/db/src/schema/student.ts:66-70`; test `apps/server/src/student-multi-org-migration.test.ts:34-63` | ✅ |
| BR-students-002 | Index unique là partial: chỉ áp dụng khi `trim(email) != ''` | Tạo hồ sơ không email | FR-012 | `packages/db/src/schema/student.ts:67-70` | ✅ |
| BR-students-003 | Hồ sơ demo (`demo-student:%`) ẩn khỏi teacher view và khỏi check trùng email | Load snapshot / tạo hồ sơ | FR-001, FR-012, FR-023 | `apps/server/src/routes/snapshot.ts:271`; `apps/server/src/routes/kernel.ts:492` | ✅ |
| BR-students-004 | `entryScore` rỗng/vắng → NULL trong DB; read-side chiếu thành `""`; UI hiển thị "Chưa có" | Tạo/onboarding | FR-014 | `apps/server/src/routes/kernel.ts:526`; `snapshot.ts:655`; `$studentId.tsx:279-281`; test `kernel.test.ts:4995-5025` | ✅ |
| BR-students-005 | Onboarding portal KHÔNG xóa entryScore đã lưu (bỏ trống không đụng) | Học viên submit wizard | FR-014 | `apps/server/src/routes/student.ts:1274-1275`; test `apps/server/src/student.test.ts:968-995` | ✅ |
| BR-students-006 | `portalLinked` = (`onboardingCompletedAt != null`); chỉ học viên có MỚI email mới ở trạng thái "Chờ xác nhận" | Load snapshot | FR-002, FR-005 | `apps/server/src/routes/snapshot.ts:656`; `apps/web/src/lib/repos/students.ts:97-102` | ✅ |
| BR-students-007 | Số "lời mời đang chờ" = (học viên có email + portalLinked=false) + (invitation `pending` chưa trùng email với nhóm trên) | Render danh sách | FR-005 | `apps/web/src/routes/_auth/students/index.tsx:50-60`; `repos/students.ts:108-116`; test `index.test.tsx:189-257` | ✅ |
| BR-students-008 | "Cần chú ý" = có tag nợ học phí/sắp hết buổi, HOẶC gói active `total>0 && remaining<=4`, HOẶC có hóa đơn chưa `paid` | Render lead KPI | FR-004 | `apps/web/src/routes/_auth/students/index.tsx:64-73` | ✅ |
| BR-students-009 | Gói hiển thị = session_package `active` mới nhất theo `createdAt` của student; `done/remaining` derive từ lesson `completed` của đúng enrollment gói đó | mapStudents | FR-004, FR-007 | `apps/web/src/lib/repos/students.ts:34-91` | ✅ |
| BR-students-010 | Tạo hồ sơ kèm lớp → enrollment `invited`; chỉ `activateNow` mới sinh gói + chuỗi buổi học | POST /api/students | FR-013 | `apps/server/src/routes/kernel.ts:544-554,617-635`; test `kernel.test.ts:7092-7110` | ✅ |
| BR-students-011 | Gửi email mời là best-effort fail-open: lỗi mail không rollback hồ sơ, chỉ hạ `inviteEmailSent=false` + log | POST /api/students, resend | FR-017, FR-018 | `apps/server/src/routes/kernel.ts:607-615`; UI `add-student-modal.tsx:106-110` | ✅ |
| BR-students-012 | Cooldown gửi lại lời mời 60s (mặc định) kể từ `lastInviteEmailAt`; vi phạm → 429 kèm `Retry-After` | Resend | FR-018 | `apps/server/src/routes/kernel.ts:216,233-252,1092-1093`; UI `pending-invite-callout.tsx:90-96,105-109` | ✅ |
| BR-students-013 | Chỉ `teacher/owner/admin/class_teacher` quản lý lời mời (resend); `ta` bị chặn | Resend, invite org | FR-021 | `apps/server/src/routes/kernel.ts:219-231`; `packages/auth/src/role.ts:112-138` | ✅ |
| BR-students-014 | Tạo hồ sơ trùng email với lời mời `pending` → lời mời tự chuyển `accepted` | POST /api/students có email | FR-016 | `apps/server/src/routes/kernel.ts:530-543` | ✅ |
| BR-students-015 | Zalo copy giá trị SĐT lúc tạo (không có ô riêng) | POST /api/students | FR-012 | `apps/server/src/routes/kernel.ts:523` | ✅ |
| BR-students-016 | `tags`, `notes`, `targetBand`, `skills`, `examDate` trong view model web luôn rỗng/`"—"` (kernel không cung cấp) — các khối UI đọc chúng luôn rỗng | mapStudents | FR-003, FR-007 | `apps/web/src/lib/repos/students.ts:70-73,85-86` | 🟡 (OQ-3/OQ-4 — UI trông như có tính năng nhưng dữ liệu không bao giờ có) |

## 6. Error Matrix

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-students-001 | Thiếu/tên rỗng | Submit modal không có họ tên | minor | FR-012 | Modal mở, lỗi inline "Vui lòng nhập họ tên học viên." | Người dùng nhập tên rồi lưu lại | `apps/web/src/components/modals/add-student-modal.tsx:74-79` | ✅ |
| E-students-002 | Email sai định dạng (client) | Email nhập khác rỗng và không khớp regex | minor | FR-012 | Lỗi inline "Email không đúng định dạng." | Sửa email | `add-student-modal.tsx:15,81-87` | ✅ |
| E-students-003 | Body không hợp lệ (server) | Zod `studentCreateSchema` fail (name rỗng/ >120, phone chữ, email sai, entryScore >50, field lạ do `.strict()`) | major | FR-012, FR-014 | Modal hiện thông báo fail chung | Sửa dữ liệu; wording wire là "invalid body" (400) — các message zod tiếng Việt KHÔNG xuống wire | `apps/server/src/routes/kernel.ts:368-394`; `packages/api/src/contracts.ts:26-65`; test `kernel.test.ts:5017-5024` | ✅ |
| E-students-004 | Lớp không tồn tại | `classId` gửi lên không thuộc org | major | FR-013 | Modal fail | Chọn lại lớp | `apps/server/src/routes/kernel.ts:473-477` (HTTP 404, wording "class not found") | ✅ |
| E-students-005 | Email đã có trong org | Tạo hồ sơ trùng email (kể cả race unique index) | major | FR-012, FR-015 | portalLinked=false → callout "Chờ xác nhận" + nút gửi lại; portalLinked=true → dòng "Email này đã tham gia cổng học viên ({tên})." | Gửi lại lời mời hoặc dùng hồ sơ sẵn có | `apps/server/src/routes/kernel.ts:499-511,556-573`; `add-student-modal.tsx:121-137,255-265`; `pending-invite-callout.tsx:143-169` | ✅ |
| E-students-006 | Kích hoạt enrollment thất bại | `activateNow` nhưng `activateEnrollment` lỗi (mất lớp giữa chừng) | major | FR-013 | 500 "enrollment activation failed" — hồ sơ ĐÃ tạo, modal báo fail | Tạo lại yêu cầu ghi danh từ chi tiết lớp | `apps/server/src/routes/kernel.ts:617-622` | ✅ |
| E-students-007 | Gửi mail mời tạo hồ sơ thất bại | Mailer lỗi/timeout 5s/thiếu mailer | minor | FR-017 | Toast cảnh báo "Đã lưu hồ sơ học viên nhưng chưa gửi được email lời mời — …" | Bấm "Gửi lại lời mời" trong danh sách | `apps/server/src/routes/kernel.ts:607-615`; `add-student-modal.tsx:106-110` | ✅ |
| E-students-008 | Không có mailer khi resend | `resolveMailer` trống | major | FR-018 | 503 `INVITATION_EMAIL_UNAVAILABLE` "Hệ thống gửi email chưa sẵn sàng. Vui lòng thử lại sau." | Thử lại sau khi cấu hình mail | `apps/server/src/routes/kernel.ts:1079-1088` | ✅ |
| E-students-009 | Resend cooldown | Gửi lại trong 60s từ lượt trước | minor | FR-018 | 429 `INVITATION_RESEND_COOLDOWN` "Vui lòng đợi {n} giây trước khi gửi lại lời mời." + `Retry-After`; nút đếm ngược | Chờ hết cooldown | `apps/server/src/routes/kernel.ts:233-252`; `pending-invite-callout.tsx:90-96` | ✅ |
| E-students-010 | Resend: không tìm thấy học viên | id lạ hoặc row demo | major | FR-018 | 404 `INVITATION_NOT_FOUND` "Không tìm thấy học viên" | Danh sách tự refresh | `apps/server/src/routes/kernel.ts:1095-1115` | ✅ |
| E-students-011 | Resend: hồ sơ chưa có email | Hồ sơ email rỗng | minor | FR-018 | 400 "Học viên chưa có địa chỉ email" (không mã) | Bổ sung email (hiện không có UI — OQ-2) | `apps/server/src/routes/kernel.ts:1117-1120` | ✅ |
| E-students-012 | Resend: thất bại gửi mail | SMTP/Resend lỗi | major | FR-018 | 502 `INVITATION_EMAIL_FAILED` "Không gửi được email lời mời. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau." | Thử lại | `apps/server/src/routes/kernel.ts:1314-1337` (rollback 1320-1328, trả 502 tại 1329-1336; nhánh kèm lớp: 1264-1271) | ✅ |
| E-students-013 | Resend: lời mời lớp không hợp lệ | `enrollmentId` gửi kèm không phải enrollment `invited` của student này | minor | FR-018 | 404 `INVITATION_NOT_FOUND` "Lời mời vào lớp không tồn tại hoặc đã được xử lý" | Bỏ enrollmentId và gửi lại | `apps/server/src/routes/kernel.ts:1122-1153` | ✅ |
| E-students-014 | Resend: role không đủ quyền | `ta` gọi resend/invite org | major | FR-021 | 403 "Trợ giảng không có quyền quản lý lời mời học viên" (`FORBIDDEN`) | Liên hệ giáo viên chủ | `apps/server/src/routes/kernel.ts:219-231,1076` | ✅ |
| E-students-015 | CSRF/Origin chặn | Write từ origin lạ / content-type không JSON | major | FR-012 | 403 "origin not allowed" / 415 "content-type must be application/json" | Gọi từ app chính thống | `apps/server/src/routes/kernel.ts:186-207` | ✅ |
| E-students-016 | Session không hợp lệ | Không đăng nhập | major | FR-001 | 401 "unauthorized" | Đăng nhập lại | `apps/server/src/routes/kernel.ts:213-215` | ✅ |
| E-students-017 | Sai vai trò app | Session `student`/`admin` gọi teacher API | major | FR-001 | 403 `ACCOUNT_STUDENT_ROLE` / `ACCOUNT_ADMIN_ROLE` (khóa catalog `STUDENT_ON_TEACHER_APP`/`ADMIN_ON_TEACHER_APP`, contracts.ts:1982,1985) | Dùng portal tương ứng | `apps/server/src/app.ts:227-246` | ✅ |
| E-students-018 | id học viên không tồn tại (UI) | Mở `/students/:id` lạ (hoặc demo bị reset) | minor | FR-008 | Card "Không tìm thấy học viên" + "Học viên này không tồn tại hoặc dữ liệu demo đã được reset." + link về danh sách | Bấm link về `/students` | `apps/web/src/routes/_auth/students/$studentId.tsx:45-61`; E2E `student-row-detail.spec.ts:34-47` | ✅ |
| E-students-019 | Danh sách rỗng / lọc khớp 0 | Org chưa có học viên; hoặc chip lọc không khớp row nào | minor | FR-001, FR-003 | Empty state "Chưa có học viên nào" + CTA; hoặc "Không có học viên nào phù hợp với bộ lọc." | Thêm học viên / đổi chip | `apps/web/src/routes/_auth/students/index.tsx:133-157` | ✅ |
| E-students-020 | Snapshot phản hồi không đúng shape | 2xx nhưng JSON lệch hợp đồng | major | FR-001 | `MalformedSnapshotError` — store báo lỗi thay vì render sai | Reload | `apps/web/src/lib/kernel-load-state.ts:42-48` | 🔵 |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-students-01 | Học viên tự tạo hiện ngay trong danh sách sau khi lưu (số liệu từ snapshot post-write, không tự vẽ ở client) | Snapshot sau POST chứa row mới | Ngay sau 201 | `apps/web/src/lib/data-store-reducer.ts:96-105`; test `index.test.tsx:75-90` | ✅ |
| SC-students-02 | Giáo viên nhận biết học viên chưa vào portal và đẩy họ vào portal bằng resend | Badge "Chờ xác nhận" + nút "Gửi lại lời mời" hoạt động, có cooldown | Mỗi lượt resend <= 1 lần/60s | test `index.test.tsx:137-187`; BR-012 | ✅ |
| SC-students-03 | Không bao giờ tạo trùng 2 hồ sơ cùng email trong 1 org (kể cả double-submit) | 409 ALREADY_IN_ORG trên cả pre-check và race | 100% trường hợp trùng | FR-015 + unique index | ✅ |
| SC-students-04 | Danh sách sạch dữ liệu demo | Không row `demo-student:%` trên UI giáo viên | Luôn | FR-023 | ✅ |

## 8. Data Entities (tóm tắt — chi tiết ở `srs/students-reverse-erd.md`)

- **student** — hồ sơ org-scoped: `id, org_id (FK cascade), name, phone, email (unique theo org + lower/trim, partial), zalo, parent_name, parent_phone, entry_score (text ≤50, NULL=chưa có), exam_interest, current_level, target_score, learning_goals, learning_goals_note, daily_study_hours, onboarding_completed_at, last_invite_email_at, created_at`. ✅ [S5]
- **organization** — tổ chức sở hữu hồ sơ. ✅ [S5]
- **enrollment** — gắn học viên vào lớp, trạng thái `invited`/`active` (chi tiết ở feature enrollment-lifecycle). ✅ [S4]
- **session_package** — gói buổi học theo student/enrollment; nguồn `pkg` trên danh sách. ✅ [S3]
- **invoice** — hóa đơn của student; nguồn tab Học phí. ✅ [S3]
- **student_invitation** — lời mời org (liên kết nhẹ qua `org_id + email`); trạng thái `pending/accepted/rejected/canceled`. ✅ [S4]

## 9. Flows (tóm tắt — chi tiết ở `srs/students-reverse-flows.md`)

1. Xem danh sách + lọc (đọc snapshot, KPI, tab lời mời chờ). ✅
2. Xem chi tiết học viên (hồ sơ/lớp/entry score/học phí/bài tập). ✅
3. Thêm học viên thủ công (tạo hồ sơ + tùy chọn ghi danh + mail mời + 409 trùng email). ✅
4. Gửi lại lời mời portal (cooldown 429). ✅
5. **Không có flow "cập nhật hồ sơ"** — code không có đường này (xem G-2/OQ-2). ✅ (về sự vắng mặt)

## 10. Screens (tóm tắt)

- **/students** — danh sách: kicker KPI, 2 tab (Học viên / Lời mời đang chờ), chip lọc, bảng (Học viên | Lớp học | Tags), badge portal, nút "Mời học viên" + "Thêm học viên", empty states. ✅ [S2]
- **/students/$studentId** — chi tiết: header liên hệ + avatar + tags + nút Zalo/Gửi lại lời mời/(Tạo báo cáo — flag off), 4 tab Hồ sơ | Lịch sử buổi | Học phí | Bài tập, not-found card. ✅ [S2]
- **Modal "Thêm học viên mới"** — form name/phone/email/parent/entryScore/lớp/activateNow, callout xung đột email. ✅ [S2]

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Ghi qua kernel là POST-only, id do server cấp, org context từ membership (không tenant header) | Kiến trúc kernel | `packages/api/src/contracts.ts:13-16` | ✅ |
| Chỉ session teacher app (role khác student/admin) mới chạm được kernel | Plan #260/#413 | `apps/server/src/app.ts:227-246` | ✅ |
| Single-org mode: khi `TEACHER_EMAILS` cấu hình, chỉ email allowlist + đã verify vào được kernel | #513/#524 | `apps/server/src/app.ts:247-269` | ✅ |
| D1 (Cloudflare/D1 test double) không có transaction đa câu — dùng `db.batch` + pre-check/CAS | Kiến trúc DB | `apps/server/src/routes/kernel.ts:516-573`; `apps/server/src/routes/student.ts:1559-1626` (precedent CAS) | ✅ |
| Email phải verify mới được provision/link portal (bên portal) | PR #255 + #257 | `packages/db/src/schema/student.ts:24-27`; `apps/server/src/routes/student.ts:124-210` | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Mailer (`resolveMailer`) | Hạ tầng app (env) | Email mời không gửi được (fail-open, vẫn tạo hồ sơ) | `apps/server/src/routes/kernel.ts:579-580` | ✅ |
| Onboarding portal (feature `student-*`) | Feature khác | `portalLinked` không bao giờ sang true; entryScore portal-side không có | `apps/server/src/routes/student.ts:1241-1289` | ✅ |
| Kích hoạt enrollment (`enrollment-activation.ts`) | Feature enrollment-lifecycle | `activateNow` lỗi → 500 | `apps/server/src/routes/kernel.ts:617-622` | ✅ |
| Org bootstrap (membership teacher) | Auth/tenant | Không có kernelCtx → mọi route students 401 | `apps/server/src/app.ts:279-296` | ✅ |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Một user có tối đa 1 membership có hiệu lực (kernelCtx lấy membership sớm nhất) | Nếu user thuộc nhiều org với vai khác nhau, mọi route students chỉ nhìn org đầu tiên — KPI/list sai org | `apps/server/src/app.ts:279-296` | 🔵 |
| `tags/notes` rỗng là trạng thái tạm của việc chuyển từ mock sang kernel (view model giữ shape cũ) | Nếu là quyết định bỏ hẳn, chip lọc + khối ghi chú cần gỡ bỏ thay vì chờ dữ liệu | `apps/web/src/lib/repos/students.ts:85-86` | 🟡 |
| `entryScore` giáo viên nhập lúc tạo là "điểm đầu vào" duy nhất cho đến khi học viên tự onboarding | Nếu giáo viên cần sửa điểm sau, hiện không còn đường nào (OQ-2/OQ-7) | FR-014, FR-022 | 🟡 |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [`reverse-gaps.md`](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] OQ-1: PDR nói "teachers no longer create students manually" nhưng `POST /api/students` + nút "Thêm học viên" còn sống và được test — bên nào là nguồn chân lý cho SRS chính thức? (blocking)
- [ ] OQ-2: Không có cập nhật/xóa hồ sơ học viên phía giáo viên (email/SĐT/entryScore nhập sai không sửa được) — chấp nhận hay thiếu tính năng? (blocking)
- [ ] OQ-3: Chip lọc "Sắp hết buổi/Nợ học phí/Viết/Nói" lọc trên `tags` vốn luôn rỗng — giữ, xóa hay nối dữ liệu thật?
