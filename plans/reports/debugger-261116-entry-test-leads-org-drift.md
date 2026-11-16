# Báo cáo Debug: Bài nộp Entry Test (`/kiem-tra-dau-vao/`) không hiển thị tại `/leads` trên Staging (`LEAD_ORG_ID` vs `TEACHER_EMAILS` Organization Drift)

- **Ngày điều tra:** 2026-11-16
- **Nhánh:** `vinh19410/Debug-entry-test` (đồng bộ từ `origin/develop` tại `af383f35`)
- **Môi trường mục tiêu:** `https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao/` → `https://api.staging.teacheros.io.vn` → `https://app.staging.teacheros.io.vn/leads`

---

## 1. Triệu chứng thực tế

Khi thí sinh hoàn thành và nộp bài kiểm tra đầu vào tại `https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao/`, các API công khai (`POST /public/leads`, `POST /public/placement-test/submissions`) phản hồi thành công, nhưng khi giáo viên đăng nhập `https://app.staging.teacheros.io.vn/leads` (bằng tài khoản duy nhất được allowlist `msthucmy@gmail.com`) thì **không thấy dòng lead hay bài nộp Entry Test vừa gửi**.

---

## 2. Bằng chứng thực nghiệm thu thập được

### 2.1. Kiểm tra điểm cuối Live Staging (Read-Only)

- `GET https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao/` → `200 OK`, thẻ meta `<meta name="lead-api" content="https://api.staging.teacheros.io.vn">` trỏ đúng API staging.
- `OPTIONS https://api.staging.teacheros.io.vn/public/leads` (`Origin: https://profile.staging.teacheros.io.vn`) → `204`, header `access-control-allow-origin: https://profile.staging.teacheros.io.vn`.
- `GET https://api.staging.teacheros.io.vn/public/placement-test` (`Origin: https://profile.staging.teacheros.io.vn`) → `200 OK`, trả về bộ đề `version: 1` đã backfill đủ 5 kỹ năng (Listening 15 câu, G&V 15 câu, Reading 15 câu, Writing 50–80 từ, Speaking 8 câu).

### 2.2. Đối chiếu GitHub Environment Variables (`staging` & `production`)

Kiểm tra cấu hình biến môi trường qua `gh api repos/vinh19410/teacher-os/environments/{staging,production}/variables`:

- Trên **`staging`**:
  - `LEAD_ORG_ID = "7772e636-0ab9-424d-bb55-b5ec66c08baa"` — được cập nhật lúc `2026-11-03T06:41:12Z` (tạo từ tài khoản QA tự động trước khi siết allowlist đơn tổ chức, và đang là org phát hành bộ đề `version: 1`).
  - `TEACHER_EMAILS = "msthucmy@gmail.com"` — được thiết lập **9,5 giờ sau** lúc `2026-11-03T16:10:02Z`.
- Trên **`production`** cũng tồn tại đúng trình tự thời gian tương tự (`LEAD_ORG_ID` cập nhật `06:37:41Z`, `TEACHER_EMAILS = "msthucmy@gmail.com"` cập nhật `16:05:53Z` ngày `2026-11-03`).

### 2.3. Phân tích luồng code (`bootstrapMiddleware` vs Public Routes)

1. **`bootstrapMiddleware` (`apps/server/src/app.ts:282-312`):**
   - Khi `msthucmy@gmail.com` đăng nhập vào `https://app.staging.teacheros.io.vn`, hệ thống kiểm tra allowlist `TEACHER_EMAILS`, truy vấn `membership WHERE userId = session.userId`.
   - Vì user mới đăng nhập chưa có `membership` (tài khoản QA trước đó là một `user` khác), middleware tự sinh một `organization` mới (`crypto.randomUUID()`, tạm gọi `org-co-my` != `7772e636-...`) và gán `ctx.orgId = org-co-my`. Mọi tài khoản ngoài `TEACHER_EMAILS` (kể cả tài khoản QA cũ sở hữu `7772e636-...`) bị chặn `403 ACCOUNT_TEACHER_NOT_ALLOWED` ở dòng 264.
2. **`GET /api/leads` (`apps/server/src/routes/leads.ts:267`):**
   - Truy vấn `WHERE lead.org_id = ctx.orgId` → chỉ đọc các dòng thuộc `org-co-my`.
3. **Các route công khai (`apps/server/src/routes/public-leads.ts` & `apps/server/src/routes/public-placement-test.ts`):**
   - `PublicLeadRouteDeps` và `PublicPlacementTestRouteDeps` hoàn toàn **không nhận/không dùng `teacherEmails`** dù `buildApp(deps)` trong `apps/server/src/app.ts:435,437` đã truyền `deps` có `teacherEmails`.
   - Cả 2 router ghi trực tiếp vào `deps.leadOrgId?.trim()` (`7772e636-...`) thay vì phân giải org đang hoạt động của `TEACHER_EMAILS` (trái ngược với cách Student Portal đã xử lý triệt để vấn đề single-org ở `packages/auth/src/student-provisioning.ts:43-73`, PR #718).
   - Email `notifyNewLead` cũng bị gửi vào thành viên của org QA cũ (`7772e636-...`) thay vì `msthucmy@gmail.com`.
4. **Cảnh báo ở `/placement-test` (`apps/server/src/routes/placement-test.ts:167-170`):**
   - So sánh thô `trimmedLeadOrgId === ctx.orgId`, báo sai lệch tổ chức cho giáo viên chính chủ `TEACHER_EMAILS`.

---

## 3. Các ràng buộc & Bất biến cần bảo toàn khi sửa

1. **Giữ cầu dao fail-closed `LEAD_ORG_ID` (`503`):** Nếu `deps.leadOrgId?.trim()` rỗng, route công khai phải trả ngay `503 LEAD_INTAKE_DISABLED` / `503 PLACEMENT_DISABLED` mà không chạm DB (kể cả khi `TEACHER_EMAILS` có giá trị).
2. **Không lọc `user.email_verified = 1` trong SQL:** Staging bật `AUTH_ASSUME_EMAIL_VERIFIED="true"` tại session (`apps/server/src/session.ts:36`); bản ghi trong D1 có thể để `email_verified = 0`. Truy vấn chỉ lọc `membership.role IN ('teacher', 'owner', 'admin')` (`FINANCE_ROLES`) và `lower(trim(user.email)) IN (normalizedEmails)`, sắp theo thứ tự ưu tiên `teacherEmails` rồi `membership.createdAt ASC, membership.id ASC`.
3. **Fallback đọc bộ đề & audio đã phát hành từ `LEAD_ORG_ID` (`A2` đã chốt):**
   - Trên staging, org của `msthucmy@gmail.com` có thể chưa tự bấm "Phát hành" đề mới trong khi `7772e636-...` đang giữ đề `version: 1`.
   - Vì vậy: mọi thao tác **GHI** (`POST /public/leads`, `POST /public/placement-test/submissions`, dedupe, rate-limit theo org, R2 `speaking-media` key, `notifyNewLead`) luôn đi vào `targetOrgId` (org active của `TEACHER_EMAILS`, fallback `LEAD_ORG_ID` nếu giáo viên chưa đăng nhập lần nào). Trong khi đó, các thao tác **ĐỌC đề & audio công khai** (`GET /public/placement-test`, snapshot khi chấm `POST /submissions`, `GET /public/placement-test/audio/:id`, `PUT .../speaking-media`, `GET /public/placement-test/results/:token`) ưu tiên `targetOrgId` trước và fallback sang `LEAD_ORG_ID` nếu `targetOrgId` chưa có bản `published` hợp lệ.
   - Khi giáo viên chủ động bấm Phát hành đề riêng tại `/placement-test` trong `targetOrgId`, bản phát hành mới tự động ghi đè fallback ngay lập tức.
   - Không gộp hay làm lộ các dòng lead QA/smoke cũ nằm trong org `7772e636-...`.
4. **Dùng `sub.orgId` khi ghi file & CAS update `speaking-media`:** Trong `PUT /submissions/:id/speaking-media` và `GET /results/:token`, phải truy vấn với `inArray(placementTestSubmission.orgId, resolved.allowedOrgIds)` và dùng chính `sub.orgId` cho R2 key + điều kiện `WHERE`.
