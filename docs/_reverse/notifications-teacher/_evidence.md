# _evidence — notifications-teacher

Nhật ký bằng chứng thô. Mỗi mục ghi: khẳng định → nguồn (path:line) → cách xác minh. Quy ước glyph như spec.

## A. Xác minh source_commit

- Nhiệm vụ đặt `source_commit: d6c0f6b5`; HEAD thực tế khi soạn là `8277bfb4` (develop).
- Xác minh: `git merge-base --is-ancestor d6c0f6b5 HEAD` → ok (d6c0f6b5 là tổ tiên); `git diff d6c0f6b5 HEAD -- apps/server/src/routes/notification-logs.ts packages/db/src/schema/notification-record.ts packages/db/src/schema/notif.ts apps/web/src/routes/_auth/notifications/index.tsx` → rỗng (4 file chính byte-identical). Cite path:line đọc tại working tree (62005971). contracts.ts / student.ts / app.ts có diff so với d6c0f6b5 — cite cho 3 file này kiểm chứng bằng `git show d6c0f6b5:<path>`; cite các file còn lại hợp ở cả hai commit.

## B. Đếm dòng nguồn (wc -l thật)

- Lệnh chuẩn: `awk 'END{print NR}' <file>` cho từng S1..S52 (bảng reverse-sources.md). Ví dụ kết quả: notification-logs.ts 242; enqueue.ts 80; deliver.ts 232; emit.ts 91; requeue.ts 233; templates.ts 193; org-mail-sender.ts 43; notification-record.ts 72; notif.ts 26; contracts.ts 4801; index.tsx (web) 647; repos/notifications.ts 103; kernel.ts 3523; app.ts 472; student.ts 2468; notification-logs.test.ts 802; kernel.test.ts 7844.

## C. Schema DB (S9, S10, S28, S29)

- Bảng `notification_record`: khai báo notification-record.ts:19, cột :24-54 (21 cột), enum status `queued|sent|read|failed` (notification-record.ts:44-47), default channels "in_app" (notification-record.ts:39). Unique + index: notification-record.ts:57-71 → DDL tương ứng migrations/0048_small_champions.sql:1-25, :27-29 (unique index org_id+idempotency_key; index org_id+created_at; index org_id+student_id+created_at).
- Comment plan ngay trong schema: notification-record.ts:17-18 ("plan TOS-21 D1 ... Cột failed/retry_count/last_error có sẵn cho TOS-22/23").
- Bảng `notif` (đối chiếu): notif.ts:11-26 + migrations/0005_mature_sasquatch.sql:11-25; comment "Read-only notification feed" (notif.ts:1-10).
- GHI bảng notif duy nhất: holidays.ts:594 (INSERT khi apply), holidays.ts:970 (xóa khi undo) — đọc qua reporting/loaders.ts:30-50, snapshot.ts:350.

## D. Nơi GHI + pipeline phát (S2, S4, S6, S19)

- DUY NHẤT `.insert(notificationRecord)` = enqueue.ts:73 (NEG-5).
- enqueue.ts:31-38 resolve email theo chunk 50; :59 `channels: hasEmail ? "email,in_app" : "in_app"`; :64 status "sent" ngay khi không email (sent_at = now); :75 onConflictDoNothing; deliver chạy nền ở emit.ts:80-83 (S4 — emitNotifications), không phải trong enqueue.ts
- emit.ts:61-91 emitNotifications bọc try/catch nuốt lỗi (fail-open); :27-31 resolveMailer; :45-60 notificationDepsFrom (mailer, runInBackground, studentOrigin, retryDelaysMs).
- notify() trong kernel.ts:337-345 — cùng fail-open.
- Callsite phát sự kiện: kernel.ts:638-660 (class_invite), 1228 (assignment), 3103-3110 (invoice), 3392-3480 (holiday/debt ngoài fail-open — debt gọi enqueue+deliver trực tiếp để trả `{queued, skipped}`), grading.ts:1113-1131, assignments/index.ts:180-191, holidays.ts:636-671.
- Templates 7 builder + khóa chống trùng: templates.ts:40-193 — khóa nguyên văn: `tuition_reminder:<invoiceId>:<vnDate>` (templates.ts:47), `class_enrolled:<enrollmentId>` (:68), `assignment_published:<classAssignmentId>:<studentId>` (:95), `grade_returned:<attemptId>` (:120), `invoice_issued:<invoiceId>` (:139), `schedule_changed:<classId>:<date>:<editedAtMs>:<studentId>` (:162), `holiday_created:<holidayId>:<studentId>` (:185).
- debt-reminders không fail-open + requireFinanceRole: kernel.ts:3393 (`kernel.post("/debt-reminders", requireFinanceRole, ...)`) dựng `tuitionReminderEvent` (kernel.ts:3453-3462) rồi gọi thẳng enqueueNotifications (kernel.ts:3464-3468) + deliverNotifications (kernel.ts:3469-3480) để trả đúng `{queued, skipped}`; event type trên dòng nhật ký là `tuition_reminder`.

## E. Deliver + retry (S3, S31)

- MAX_EMAIL_ATTEMPTS = 3 (contracts.ts:3940, deliver.ts:16); retry delays mặc định [2000, 5000] (deliver.ts:17, kernel.ts:345).
- deliver.ts:140-231 vòng từng lượt, :174-228 vòng từng bản ghi; :211-223 sau đủ lượt → status failed + last_error "E-selfomy-alignment-010: ..." (≤500 ký tự, deliver.ts:36-52 sanitize redact "Bearer "/"re_").
- deliver.ts:175 `if (!row.channels.includes("email")) continue;` — dòng in_app thuần không qua mailer.
- deliver.ts:193-207 CASE status khi đã read: read_at có giá trị → status "read" (read_at nguồn chân lý — TOS-21 D7, plan 261026-2054/plan.md).
- render email + Idempotency-Key: deliver.ts:135-158 → mailer.ts:19-40 (MailInput: to, subject, html, text, replyTo, fromName, idempotencyKey, timeoutMs), endpoint Resend mailer.ts:60-90.
- org-mail-sender.ts:14-43: sender_name = org.name; reply_to = email teacher/owner sớm nhất theo createdAt.

## F. GET /api/notification-logs (S1, S11, S13)

- Mount trong kernelRoutes: kernel.ts:3502-3503 + comment notification-logs.ts:25-31 (thừa hưởng Origin guard + role gate).
- GET: notification-logs.ts:71-189 — auth 401 `unauthorized` (:73-74); zod 400 `invalid query` (:83-84); 3 query song song (:96-152): rows join student sort createdAt desc, id desc LIMIT 20 OFFSET; total; counts GROUP BY status trên q+event KHÔNG status (:89-90 comment "counts (chip trạng thái): q + event, KHÔNG status").
- q filter escape `% _ \` + lower LIKE trên student.name, recipient_email, title (notification-logs.ts:28-46); student.email chỉ khớp khi recipientEmail IS NOT NULL (:38-44).
- Response: rows + total + counts → contracts notificationLogResponseSchema (contracts.ts:4000-4016); PAGE_SIZE 20 (notification-logs.ts:26, repos/notifications.ts:17).

## G. Resend 1 + loạt (S1, S5, S11)

- POST /:id/resend: notification-logs.ts:221-239 — 404 `not_found` (:228-229), 409 `not_failed` (:231-232); gọi triggerResendDelivery :50-69 (deliver nền, catch nuốt).
- requeueSingle reset nguyên tử: requeue.ts:61-142 (UPDATE status queued, retry_count 0, last_error NULL, recipient_email = correlated subquery student.email hiện tại, channels CASE nâng cấp; RETURNING id).
- POST /resend-failed: notification-logs.ts:191-219; body strict `{q?, event?}` (contracts.ts:3992-3996); RESEND_BATCH_LIMIT = 50 (contracts.ts:3989, requeue.ts:145); skip no_email vào `skipped`, không tính `remaining` (requeue.ts:195-226); chế độ khớp email hiện tại `matchCurrentStudentEmail = true` (requeue.ts:150-190 đối chiếu GET).

## H. Màn web [5] (S12-S15, S16)

- Route + guard đăng nhập: routes/_auth/notifications/index.tsx gắn trong _auth/route.tsx (beforeLoad redirect).
- validateSearch :56-85; debounce q 300ms :279-292; 401 → reauth :200-204; toast 409 "Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi." :220-228; formatResendToast :147-168 (4 wording nguyên văn — trích trong spec FR-15).
- PageHead kicker "{total} thông báo" + title "Nhật ký gửi thông báo (Email & In-app)" + lead "Lịch sử gửi thông báo cho học viên qua email và trong ứng dụng: trạng thái gửi, thời gian gửi và lỗi nếu có." :347-356; nút header "Gửi lại tất cả mục lỗi (N)" :357-366; global empty "Chưa có thông báo nào" + "Khi hệ thống gửi thông báo mời vào lớp, trả điểm, học phí hoặc đổi lịch cho học viên, nhật ký gửi sẽ xuất hiện tại đây." :368-387; ô tìm "Tìm theo học viên, email hoặc tiêu đề…" :386-393; chip nhóm sự kiện — 5 lựa chọn "Tất cả" / "Mời vào lớp" / "Giao bài / Trả điểm" / "Học phí" / "Đổi lịch / Nghỉ lễ" (:92-105) + chip trạng thái (Tất cả / Đang chờ / Đã gửi / Đã xem / Lỗi gửi :107-114) :399-450; bảng cột "Thời gian, Người nhận, Sự kiện, Kênh, Trạng thái, (Thao tác)" + emptyMessage "Chưa có thông báo." :455-553; phân trang "Trang {page} / {pageCount} · {total} thông báo" + "Trang trước"/"Trang sau" :556-595; dialog chi tiết :597-606; modal bulk "Gửi lại tất cả thông báo lỗi?" + mô tả "Đưa {N} thông báo lỗi trong bộ lọc hiện tại về hàng đợi để gửi lại Email. Thông báo In-app trên cổng học viên không bị gửi trùng." :612-644.
- Nhãn trạng thái dùng chung: notification-detail-dialog.tsx:8-16 (`queued` "Đang chờ", `sent` "Đã gửi", `read` "Đã xem", `failed` "Lỗi gửi"); "N/3 lần thử" :82-84; formatDeliveryError notification-error.ts:14-31 (short ≤80 + tooltip đầy đủ, fallback "Không gửi được email").
- Sidebar "Nhật ký thông báo" → /notifications, active prefix: sidebar.tsx:76-90, 185-205.

## I. Boundary học viên (S21, S37)

- GET /api/student/inbox: student.ts:755-810 — 50 dòng, KHÔNG trả recipient_email/reply_to_email/last_error; POST /inbox/:id/read: student.ts:812-841 — read_at truth, chỉ sent→read, 404 "Không tìm thấy thông báo".
- Hệ quả màn GV: "Đã xem" chỉ đến từ học viên đọc (BR-03); bản ghi failed vẫn đọc được in-app (student-inbox.test.ts giữ status failed).

## J. Contracts + mã lỗi verbatim (S11, S20)

- NOTIFICATION_EVENT_TYPES 7: class_enrolled, assignment_published, grade_returned, invoice_issued, tuition_reminder, schedule_changed, holiday_created (contracts.ts:3896-3904); EVENT_GROUPS 4 (nhóm chip): class_invite, assignment, tuition, schedule (contracts.ts:3907-3914); GROUP_BY_TYPE (contracts.ts:3918-3929); STATUSES 4 (contracts.ts:3931-3936).
- Mã lỗi: 401 `unauthorized`; 400 `invalid query` | `invalid json` | `invalid body`; 404 `not_found`; 409 `not_failed`; 403 `origin not allowed` + `{error: "ACCOUNT_STUDENT_ROLE"|"ACCOUNT_ADMIN_ROLE"}` (kernel.ts:193, app.ts:226-239, contracts.ts:1984-1987); 415 `content-type must be application/json` (kernel.ts:199-201); 404 "Không tìm thấy thông báo" (student.ts:822-824); sentinel `E-selfomy-alignment-010` (deliver.ts:47-52); NOTIFICATION_ERROR_CODES chỉ chứa "DELIVERY_FAILED" (contracts.ts:3941-3943); 7 event types nằm ở NOTIFICATION_EVENT_TYPES (:3896-3904).

## K. Tests — R1 (đếm active test()/it())

Lệnh mẫu: `grep -c "test(" <file>` / `grep -c "it(" <file>` sau khi loại test bị skip (không thấy skip trong các file này).

| File | test()/it( active |
|---|---|
| apps/server/src/routes/notification-logs.test.ts | 17 test( |
| apps/server/src/lib/notifications/notifications.test.ts | 17 test( |
| apps/server/src/lib/notifications/templates.test.ts | 7 test( |
| apps/server/src/kernel.test.ts | 9 test( trong describe 7446-7844 (+ các test khác ngoài feature) |
| apps/server/src/routes/student-inbox.test.ts | 11 test( |
| apps/server/src/routes/debt-reminders.test.ts | 4 test( |
| apps/web/src/routes/_auth/notifications/index.test.tsx | 14 it( |
| apps/web/src/lib/repos/notifications.test.ts | 9 it( |
| apps/web/src/lib/notification-error.test.ts | 4 it( |
| apps/e2e/specs/notifications-ac-001.spec.ts | 1 test( (AC-001 #454 phase 6) |
| apps/e2e/specs/notifications-ac-002.spec.ts | 1 test( (AC-002 #463) |
| apps/e2e/specs/notifications-ac-003.spec.ts | 1 test( (AC-003 #464) |

E2E boot: recordingMailer boot.ts:54-80; nhánh `@bounce.test` giả lỗi SMTP/Resend boot.ts:73-84 → cho phép tái hiện failed mà không gửi ra outside.

## L. Plans (plan-ref)

- TOS-21 #454: plans/261026-2054-tos-21-notification-queue-email-inapp/plan.md (D1 bảng + unique khóa idempotency; D2 nội dung thư; D3 kênh; D5 emit sau ghi; D7 read_at truth; D8 màn dùng chung; D9 chunk 50); phase-05...screen.md = màn [5].
- TOS-22 #463: plans/261027-0127-tos-22-notification-auto-retry-failed/plan.md:19-49 (3 lượt, E-010, dòng lỗi đỏ + Gửi lại disabled khi đang chạy).
- TOS-23 #464: plans/261027-0127-tos-23-notification-manual-resend/plan.md:30-49 (D1 reset nguyên tử SQL verbatim; D2 email hiện tại + skip no_email; D3 API; D4 nền; D5 read_at giữ; D6 quyền = mọi thành viên org; D7 UI).
- Ranh giới: parent-report #173 contracts.ts:1300-1312 `channel: z.enum(["Zalo OA", "Email"])` — "metadata only, no real delivery" → không thuộc feature này (NEG-1).

## M. Self-check đã chạy trước khi giao

1. Đếm glyph (script python3 -I, loại trừ dòng chứa `chắc chắn|confidence_summary|mỗi mệnh đề mang nhãn|Toàn bộ nhãn` + dòng legend đầu `> 🟡`): số đếm ghi ở confidence_summary của spec — phần (1) chỉ spec, phần "tổng" cả 14 file.
2. mermaid-verify: `node /root/.claude/scripts/mermaid-verify.mjs --file <tệp>` cho 3 tệp srs/* → flows 14/14 PASS (25 cảnh báo = dead-end terminal nodes trong flowchart, đã giải thích trong file), states 4/4 PASS 0 cảnh báo, erd 1/1 PASS 0 cảnh báo.
3. Quét cite: mọi path:line trong corpus ≤ số dòng thật (cột "Số dòng" reverse-sources.md); không cite nào vượt EOF.
4. Ma trận UC↔FR↔BR↔E (usecase index): FR-01..20, BR-01..13, E-01..15 đều ≥1 UC — không dòng mồ côi.
5. KHÔNG front-matter author ở mọi file.
