```markdown
# student-invitations — Evidence base (truy vết code → luồng)

## §1. Endpoints (điểm vào)

| Method | Path | Màn/route gọi | Auth | Mục đích nghiệp vụ | Nguồn (file:line) |
|--------|------|---------------|------|--------------------|-------------------|
| POST | /api/students/invite | Web GV: modal "Mời học viên vào tổ chức" (`apps/web/src/components/modals/invite-student-modal.tsx:51`, `apps/web/src/lib/repos/invitations.ts:78`) | Session kernel + role `canPublishGrade` (teacher/owner/admin/class_teacher) | Tạo lời mời org pending + gửi email đồng bộ | `apps/server/src/routes/kernel.ts:696` |
| GET | /api/students/invitations | Web GV: tab "Lời mời đang chờ" (`apps/web/src/lib/repos/invitations.ts:63`) | Session kernel (không gate role) | Danh sách toàn bộ lời mời của org | `apps/server/src/routes/kernel.ts:912` |
| POST | /api/students/invitations/:id/resend | Web GV: nút "Gửi lại lời mời" (`apps/web/src/lib/repos/invitations.ts:123`) | Session kernel + role gate | Gửi lại email lời mời pending (cooldown CAS) | `apps/server/src/routes/kernel.ts:925` |
| DELETE | /api/students/invitations/:id | Web GV: nút "Thu hồi" (`apps/web/src/lib/repos/invitations.ts:100`) | Session kernel + role gate | Hủy lời mời pending → status canceled | `apps/server/src/routes/kernel.ts:1346` |
| POST | /api/students | Web GV: modal "Thêm học viên" | Session kernel | Tạo hồ sơ học viên thủ công; auto-accept pending invitation cùng email; gửi mời portal | `apps/server/src/routes/kernel.ts:463` |
| POST | /api/students/:id/resend-invite | Web GV: nút "Gửi lại lời mời" (target=student) (`apps/web/src/lib/repos/invitations.ts:149`) | Session kernel + role gate | Gửi lại mời portal/lớp cho hồ sơ có sẵn | `apps/server/src/routes/kernel.ts:1073` |
| GET | /api/student/notifications | Student portal: NotificationBell (`apps/student/src/lib/repos/student.ts:223`) | Session role student + email verified (KHÔNG cần hồ sơ) | Lời mời pending của email session (mọi org) | `apps/server/src/routes/student.ts:548` |
| POST | /api/student/invitations/:id/accept | Student portal: nút "Chấp nhận" (`apps/student/src/lib/repos/student.ts:253`) | Session student + CSRF origin/JSON | Chấp nhận lời mời → accepted + tạo hồ sơ org đích | `apps/server/src/routes/student.ts:579` |
| POST | /api/student/invitations/:id/reject | Student portal: nút "Từ chối" (`apps/student/src/lib/repos/student.ts:280`) | Session student + CSRF origin/JSON | Từ chối lời mời → rejected | `apps/server/src/routes/student.ts:641` |
| GET | /api/student/orgs | Student portal: org switcher (`apps/student/src/lib/repos/student.ts:331`) | Session student (KHÔNG cần hồ sơ) | Danh sách org có hồ sơ + cờ isCurrent | `apps/server/src/routes/student.ts:676` |
| GET | /api/student/me | Student portal: gate mọi trang (`apps/student/src/lib/repos/student.ts:70`) | Session student + guard hồ sơ | Ngữ cảnh học viên theo org active | `apps/server/src/routes/student.ts:922` (guard: `apps/server/src/routes/student.ts:124-210`) |

## §2. Validation (ràng buộc field)

| Field | Rule | Giá trị exact | Lỗi khi vi phạm | Nguồn (file:line) | Nhãn |
|-------|------|---------------|-----------------|-------------------|------|
| email (invite) | Zod email + trim | `z.string().trim().email("Email không hợp lệ")` | 400 "invalid body" — message zod bị readBody nuốt, không xuống client | `packages/api/src/contracts.ts:2925-2927` · `apps/server/src/routes/kernel.ts:392` | 🟡 |
| email (invite, client) | Regex trước khi gọi API | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | "Email không đúng định dạng." dưới field | `apps/web/src/components/modals/invite-student-modal.tsx:17,41-45` | ✅ |
| email (mọi tra cứu) | Chuẩn hóa lower(trim()) 2 phía DB và session | `sql`lower(trim(email)) = normalizedEmail`` | So khớp lệch → coi như không tồn tại | `apps/server/src/routes/kernel.ts:702,718`, `apps/server/src/routes/student.ts:140-146` | ✅ |
| POST origin (kernel + student) | Origin phải thuộc allowlist | `origin not allowed` | 403 | `apps/server/src/routes/kernel.ts:177-207`, `apps/server/src/routes/student.ts:471-482` | ✅ |
| POST content-type | JSON-only | `content-type must be application/json` | 415 | `apps/server/src/routes/kernel.ts:187-199`, `apps/server/src/routes/student.ts:477-480` | ✅ |
| enrollmentId (resend-invite) | Optional; nếu gửi phải là enrollment `invited` của đúng HV trong org | — | 404 "Lời mời vào lớp không tồn tại hoặc đã được xử lý" | `apps/server/src/routes/kernel.ts:1122-1153` | ✅ |
| org header | Chỉ nhận giá trị khớp hồ sơ của chính session; không khớp → fallback hồ sơ mới nhất | `x-student-org-id` hoặc `?org=` | Không có lỗi — lặng lẽ fallback | `apps/server/src/routes/student.ts:177-189`, `apps/server/src/student.test.ts:466-481` | ✅ |
| cooldown param | DI `inviteResendCooldownMs` ≥ 0; mặc định 60_000ms; client chỉ phản ứng khi `retryAfterSeconds > 0` | 60000 | 429 + Retry-After | `apps/server/src/routes/kernel.ts:166-167,216`, `apps/web/src/components/students/pending-invite-callout.tsx:38-44` | ✅ |

## §3. Errors (lỗi + wording thật)

| Error ID | Trigger | Wording exact (câu thật) | Recovery | Nguồn throw + catalog (file:line) | Nhãn |
|----------|---------|--------------------------|----------|-----------------------------------|------|
| E-001 | Mời email đã có hồ sơ trong org | "Học viên này đã ở trong tổ chức của bạn" + code STUDENT_ALREADY_IN_ORG (+ existingStudentId/existingStudentName/portalLinked) | UI callout gửi lại mời portal hoặc chặn | throw `apps/server/src/routes/kernel.ts:748-755,826-833` · catalog `packages/api/src/contracts.ts:2914` | ✅ |
| E-002 | Mời email đang có lời mời pending | "Lời mời đang chờ học viên phản hồi" + code INVITATION_ALREADY_PENDING (+ invitationId/updatedAt) | UI callout gửi lại lời mời | throw `apps/server/src/routes/kernel.ts:762-768,839-845` · catalog `packages/api/src/contracts.ts:2915` | ✅ |
| E-003 | Gửi lại trong cooldown | `Vui lòng đợi ${retryAfterSeconds} giây trước khi gửi lại lời mời.` + code INVITATION_RESEND_COOLDOWN + Retry-After header | Nút đếm ngược N giây | throw `apps/server/src/routes/kernel.ts:233-252` · catalog `packages/api/src/contracts.ts:2919` | ✅ |
| E-004 | Mailer không sẵn sàng | "Hệ thống gửi email chưa sẵn sàng. Vui lòng thử lại sau." + code INVITATION_EMAIL_UNAVAILABLE | Thử lại sau khi cấu hình mail | throw `apps/server/src/routes/kernel.ts:803,933,1083` · catalog `packages/api/src/contracts.ts:2918` | ✅ |
| E-005 | Gửi email thất bại (invite/resend) | "Không gửi được email lời mời. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau." + code INVITATION_EMAIL_FAILED | Xóa pending row (invite) / hoàn nguyên updatedAt (resend); thử lại | throw `apps/server/src/routes/kernel.ts:896-898,1058-1060,1266-1268,1331-1333` · catalog `packages/api/src/contracts.ts:2917` | ✅ |
| E-006 | Accept/reject/cancel/resend lời mời không pending | "Lời mời không tồn tại hoặc đã được xử lý" + code INVITATION_NOT_FOUND | Refresh danh sách; thông báo cho GV/HV | throw `apps/server/src/routes/student.ts:599,661` · `apps/server/src/routes/kernel.ts:959,1005,1110,1367` · catalog `packages/api/src/contracts.ts:2916` | ✅ |
| E-007 | Gửi lại mời portal cho HV đã onboarding | "Học viên này đã tham gia cổng học viên" + code STUDENT_ALREADY_JOINED | Không gửi nữa | throw `apps/server/src/routes/kernel.ts:1178` · catalog `packages/api/src/contracts.ts:2920` | ✅ |
| E-008 | TA thao tác lời mời | "Trợ giảng không có quyền quản lý lời mời học viên" + code FORBIDDEN | Không có (phân quyền) | throw `apps/server/src/routes/kernel.ts:226` | ✅ |
| E-009 | Tạo HV thủ công trùng email trong org | `Email này đã được dùng cho học viên ${existingStudentName}` + code STUDENT_ALREADY_IN_ORG | GV chọn email khác | throw `apps/server/src/routes/kernel.ts:503,563` · test `apps/server/src/student.test.ts:1902-1916` | ✅ |
| E-010 | resend-invite: không tìm thấy HV | "Không tìm thấy học viên" + code INVITATION_NOT_FOUND | Kiểm tra lại học viên | throw `apps/server/src/routes/kernel.ts:1110` | ✅ |
| E-011 | resend-invite: HV không có email | "Học viên chưa có địa chỉ email" (không kèm code) | Bổ sung email cho hồ sơ | throw `apps/server/src/routes/kernel.ts:1119` | ✅ |
| E-012 | Portal: HV chưa có hồ sơ (chưa accept) | 403 code STUDENT_NOT_LINKED → UI: title "Tài khoản chưa được liên kết", mô tả "Email (...) hiện chưa tham gia lớp học nào. Nếu giáo viên đã gửi lời mời, vui lòng bấm vào biểu tượng Chuông thông báo ở góc trên để chấp nhận tham gia lớp." | HV bấm chuông để accept | throw `apps/server/src/routes/student.ts:166-174` · UI `apps/student/src/components/overview/student-error-view.tsx:104-107` | ✅ |
| E-013 | Portal: email chưa verify | 403 code STUDENT_EMAIL_UNVERIFIED → UI: "Email chưa được xác thực" + hướng dẫn mở email xác thực | Gửi lại email xác thực | throw `apps/server/src/routes/student.ts:529-537` · UI `apps/student/src/components/overview/student-error-view.tsx:108-112` | ✅ |
| E-014 | Portal: session giáo viên vào portal | 403 code ACCOUNT_TEACHER_ROLE → UI: "Đây là tài khoản giáo viên" | Chuyển cổng giáo viên / đăng xuất | throw `apps/server/src/routes/student.ts:508-516` · UI `apps/student/src/components/overview/student-error-view.tsx:98-103` | ✅ |

**Toast/labels client (wording hiển thị, không phải throw):** "Đã gửi lời mời tới {email}" (`apps/web/src/components/modals/invite-student-modal.tsx:52`); "Đã có lời mời đang chờ gửi tới email này." (`.tsx:105`); "Email này đã tham gia cổng học viên ({name})." (`.tsx:84-85`); "Không thể gửi lời mời. Vui lòng thử lại sau." (`.tsx:108`); "Đã gửi lại lời mời tới {recipient}" (`apps/web/src/components/students/pending-invite-callout.tsx:88`); "Gửi lại (Ns)" (`.tsx:105-109`); "Đã thu hồi lời mời tới {email}" (`apps/web/src/components/students/pending-invitations-list.tsx:43`); "Không thể thu hồi lời mời." (`.tsx:46`); "Đã tham gia {orgName}" / "Đã tham gia tổ chức" (`apps/student/src/components/layout/notification-bell.tsx:73`).

## §4. Business Rules (rule + hằng số + state transition)

| Rule | Trigger | Hằng số/ngưỡng | Có test phủ? | Nguồn (file:line) | Nhãn |
|------|---------|----------------|--------------|-------------------|------|
| Unique pending per (org, lower(trim(email))) | Insert lời mời | partial unique index WHERE status='pending' | có (`apps/server/src/student-multi-org-migration.test.ts:63-94`) | `packages/db/src/schema/student-invitation.ts:38-40` | ✅ |
| Unique hồ sơ per (org, lower(trim(email))) WHERE trim(email) != '' | Tạo hồ sơ (accept/provision/manual) | partial unique index | có (`apps/server/src/student-multi-org-migration.test.ts:34-61`) | `packages/db/src/schema/student.ts:66-69` | ✅ |
| Cooldown gửi lời mời | invite sau cancel / resend | DEFAULT_INVITE_COOLDOWN_MS = 60_000; DI `inviteResendCooldownMs` | có (`apps/server/src/student-invitation.test.ts:486-507,595-609`) | `apps/server/src/routes/kernel.ts:216,704-705,773-797` | ✅ |
| Mail sync timeout | mỗi lần gọi mailer | SYNC_INVITE_MAIL_TIMEOUT_MS = 5_000 | có (gián tiếp qua failNextSend test `apps/server/src/student-invitation.test.ts:611-637`) | `apps/server/src/routes/kernel.ts:217` | ✅ |
| CAS resend lời mời | resend pending | UPDATE ... WHERE status='pending' AND updatedAt = previous; fail → 404 hoặc 429(min 1s) | có (`apps/server/src/student-invitation.test.ts:611-656`) | `apps/server/src/routes/kernel.ts:978-1017` | ✅ |
| Hoàn nguyên updatedAt khi resend mail lỗi | mailer throw | set updatedAt = previousUpdatedAt | có (`apps/server/src/student-invitation.test.ts:611-637`) | `apps/server/src/routes/kernel.ts:1046-1055` | ✅ |
| Không để row ma khi invite mail lỗi | mailer throw lần đầu | DELETE WHERE id + status='pending'; nếu đã accepted → trả 201 settled | có (`apps/server/src/student-invitation.test.ts:509-535`) | `apps/server/src/routes/kernel.ts:876-893` | ✅ |
| Không auto-provision khi còn pending invitation | đăng nhập portal | check pending trước khi chọn earliest org | có (`apps/server/src/routes/student-auth-otp.test.ts:160-199`) | `apps/server/src/student-provisioning.ts:37-51` | ✅ |
| Guard org header chỉ match hồ sơ session | mọi request portal | header → query fallback → rows[0] (createdAt desc, id asc) | có (`apps/server/src/student.test.ts:417-488`) | `apps/server/src/routes/student.ts:177-189` | ✅ |
| Role quản lý lời mời = canPublishGrade | invite/resend/cancel | teacher, owner, admin, class_teacher (ta bị chặn) | có (`apps/server/src/student-invitation.test.ts:567-577`) | `apps/server/src/routes/kernel.ts:219-231`, `packages/auth/src/role.ts:116-138` | ✅ |
| Accept idempotent theo hồ sơ tồn tại | accept | select hồ sơ trước, chỉ insert khi thiếu; name fallback userName → email local-part → "Học viên" | có (`apps/server/src/student-invitation.test.ts:346-375`) | `apps/server/src/routes/student.ts:606-638` | ✅ |
| Mời lại sau rejected không cooldown (chỉ quét canceled) | invite | status='canceled' mới tính cooldown | không (chỉ test canceled) | `apps/server/src/routes/kernel.ts:773-785` | 🔵 |

## §5. Entities (đối tượng dữ liệu nghiệp vụ)

| Entity | Field nghiệp vụ chính | Quan hệ | Nguồn (file:line) |
|--------|-----------------------|---------|-------------------|
| Lời mời học viên (student_invitation) | org đích, người mời, email (đã lower/trim), status pending/accepted/rejected/canceled, createdAt, updatedAt | N-1 org (cascade), N-1 user người mời (cascade) | `packages/db/src/schema/student-invitation.ts:12-42` |
| Hồ sơ học viên (student) | org, tên, email, phone, portalLinked (đạo hàm từ onboardingCompletedAt), lastInviteEmailAt | N-1 org; không có FK tới lời mời (liên kết logic theo email + org) | `packages/db/src/schema/student.ts:9-70`, `apps/server/src/routes/snapshot.ts:656` |
| Tổ chức (organization) | id, name (làm tên người gửi email) | 1-N lời mời, 1-N hồ sơ, 1-N membership | `packages/db/src/schema/student-invitation.ts:16-18`, `apps/server/src/lib/notifications/org-mail-sender.ts:20-25` |
| Tài khoản người mời (user) | name (dòng "Giáo viên {tên}" trong email/notification) | 1-N lời mời; 1-N membership | `apps/server/src/routes/kernel.ts:254-264`, `apps/server/src/routes/student.ts:558-567` |
| Thành viên org (membership) | role teacher/owner/admin/class_teacher/ta → phân quyền lời mời | N-1 org, N-1 user | `apps/server/src/app.ts:278-298`, `packages/auth/src/role.ts:116-129` |
| Thông báo in-app (notification_record) | eventType, title, body, linkPath, status queued/sent/read/failed | KHÔNG liên kết lời mời org; dùng cho mời vào lớp (`class_enrolled`) và thông báo khác | `packages/db/src/schema/notification-record.ts:19-55`, `apps/server/src/routes/kernel.ts:1226-1253` |

## §6. Cross-repo hops (điểm nghiệp vụ → luồng liên quan)

| Điểm khởi phát | → tới đâu | Cơ chế (đọc/ghi/gọi) | Luồng nghiệp vụ liên quan | Nguồn 2 đầu (file:line) |
|----------------|-----------|----------------------|---------------------------|-------------------------|
| Web GV: modal "Mời học viên vào tổ chức" | API kernel: POST /api/students/invite | fetch POST JSON credentials include; lỗi map theo `code` + field phụ | GV mời HV qua email | `apps/web/src/components/modals/invite-student-modal.tsx:51` · `apps/web/src/lib/repos/invitations.ts:74-93` · `apps/server/src/routes/kernel.ts:696-909` |
| API kernel: invite/resend | Hệ thống email ngoài (Resend) + DB lời mời | mailer.send đồng bộ (timeout 5s) với idempotencyKey; thất bại → xóa/hoàn nguyên row | Gửi email lời mời | `apps/server/src/routes/kernel.ts:850-869,1019-1039` · `apps/server/src/lib/notifications/invite-email.ts:31-47` · `apps/server/src/lib/notifications/emit.ts:27-38` |
| Email lời mời (hộp thư HV) | Student portal: đăng nhập/đăng ký | Link tĩnh {studentOrigin}/login (không có token trong link — HV tự đăng nhập bằng đúng email) | HV nhận thông báo + chấp nhận | `apps/server/src/lib/notifications/invite-email.ts:40-45` · `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:153-176` |
| Student portal: chuông thông báo | API portal: GET /api/student/notifications | fetch GET + poll 15s; badge = pending invites + inbox chưa đọc | HV nhận thông báo | `apps/student/src/components/layout/notification-bell.tsx:39-51` · `apps/student/src/lib/repos/student.ts:220-247,724-731` · `apps/server/src/routes/student.ts:548-577` |
| Portal: nút "Chấp nhận" | API portal: POST /api/student/invitations/:id/accept | fetch POST JSON (CSRF origin/JSON); response `{ ok, orgId }` | HV chấp nhận → tạo hồ sơ org đích | `apps/student/src/components/layout/notification-bell.tsx:65-79` · `apps/student/src/lib/repos/student.ts:249-274` · `apps/server/src/routes/student.ts:579-639` |
| Accept thành công (portal state) | localStorage `active_student_org_id` = orgId mới + invalidate query `["student"]` | client state; server sau đó tự resolve hồ sơ theo email + header | Chuyển org active sau accept | `apps/student/src/lib/repos/student.ts:783-794` · `apps/student/src/components/layout/org-switcher.tsx:26-45` |
| Portal chưa có hồ sơ (chưa accept) | Màn NOT_LINKED + chuông vẫn truy cập được | guard trả 403 NOT_LINKED; routes notifications/invitations/orgs đăng ký TRƯỚC guard hồ sơ nên vẫn gọi được với 0 hồ sơ | HV nhận thông báo khi chưa có hồ sơ | `apps/server/src/routes/student.ts:547,716-739` · `apps/student/src/routes/_auth/index.tsx:64-75` · `apps/student/src/components/layout/student-shell.tsx:57` |
| Provisioning portal | DB lời mời | provisionStudentForUser kiểm tra pending invitation trước khi cấp hồ sơ vào earliest org | Không dập hồ sơ khi đang có lời mời chờ | `apps/server/src/student-provisioning.ts:37-51` · `apps/server/src/routes/student.ts:148-175` |
| Org switcher (portal) | Header `x-student-org-id` trên mọi request portal | localStorage → getStudentHeaders gắn header; guard server khớp với hồ sơ session | HV chuyển org đang hoạt động | `apps/student/src/lib/repos/student.ts:45-67` · `apps/student/src/components/layout/org-switcher.tsx:41-45` · `apps/server/src/routes/student.ts:180-189` |
| Media/download portal | Query `?org=` dự phòng | thẻ audio/video không gửi được header → dùng query param, server vẫn chỉ match hồ sơ session | Xem tài liệu/bài nói trong đúng org | `apps/server/src/routes/student.ts:177-181` · `apps/student/src/lib/repos/student.ts:460` |
| Web GV tạo HV thủ công có email | DB lời mời (auto-accept) + mailer mời portal | batch: insert student + UPDATE invitation pending → accepted; gửi email mời portal best-effort | Tạo hồ sơ thủ công cùng email | `apps/server/src/routes/kernel.ts:516-543,575-615` · `apps/server/src/student.test.ts:1871-1917` |
| Portal onboarding gate sau accept | Wizard /onboarding | me.student.onboardingCompletedAt == null → Navigate /onboarding; xong mới thấy overview + org switcher | Hoàn tất tham gia org | `apps/student/src/routes/_auth/index.tsx:77-79` · `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:206-231` |

## §7. Gaps / Ambiguities (code câm hoặc nghi ngờ)

* Không có thông báo nào cho GV khi HV accept/reject — *(nguồn/negative-search: `grep -n "notify\|emitNotifications" apps/server/src/routes/student.ts` chỉ xuất hiện ở nhánh enrollment/onboarding, không có trong handler accept (579-639) và reject (641-674) · loại: code-câm — OQ-4)*
* `GET /api/students/invitations` không gate role trong khi invite/resend/cancel gate — *(nguồn: so sánh `apps/server/src/routes/kernel.ts:912-914` với `928`, `1349` · loại: dead-code-nghi/nhất quán — OQ-2)*
* Không có TTL/hết hạn lời mời pending, không có job dọn dẹp — *(nguồn/negative-search: `grep -rn "studentInvitation" apps/server/src --include=*.ts | grep -v test` — chỉ có routes/kernel.ts + student.ts + provisioning.ts, không có scheduler · loại: code-câm — OQ-1)*
* Accept/reject update thiếu điều kiện status trong WHERE (resend có CAS, accept/reject không) — *(nguồn: `apps/server/src/routes/student.ts:607-610,668-671` so với `kernel.ts:978-989` · loại: test-skip/race-nghi — OQ-7)*
* Cooldown mời lại chỉ quét status='canceled' (bỏ qua rejected/accepted) — *(nguồn: `apps/server/src/routes/kernel.ts:773-785`; test chỉ phủ canceled `apps/server/src/student-invitation.test.ts:486-507` · loại: code-câm — OQ-5, BR-012 🔵)*
* UI giáo viên không hiển thị lịch sử lời mời đã xử lý dù API trả đủ — *(nguồn/negative-search: `grep -rn "rejected\|canceled" apps/web/src --include=*.tsx` không có UI tương ứng · loại: code-câm — OQ-9)*
* Không có unit test cho `NotificationBell` (student app) và không có e2e "Từ chối" — *(nguồn/negative-search: `find apps/student/src -name "*.test.*"` không có file bell; `grep -rn "Từ chối" apps/e2e/specs` không có kịch bản lời mời · loại: test-skip)*
* Route GET /api/student/notifications trả nguyên object lời mời kèm email + inviterUserId cho chính session — đúng phạm vi email của session nên không lộ chéo; không phân trang — *(nguồn: `apps/server/src/routes/student.ts:553-576`; khối lượng thực tế thấp vì chỉ lọc pending · loại: ghi chú, không phải lỗi)*
```
