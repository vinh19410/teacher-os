# dashboard — Evidence chi tiết (reverse)

> Mọi cite theo working tree develop @ d6c0f6b5, repo-relative. Quote nguyên văn khi là chuỗi lỗi/hằng số khóa (R2).

## §1 Endpoints

| Endpoint | Phương thức | Vai trò | Cite |
|----------|-------------|---------|------|
| `/api/dashboard/reminders` | GET | Bộ đếm 3 thẻ "Việc cần làm hôm nay" — endpoint DUY NHẤT của feature | apps/server/src/routes/dashboard-reminders.ts:285 (`routes.get("/reminders", ...)`), mount apps/server/src/routes/kernel.ts:3509 (`kernel.route("/dashboard", dashboardReminderRoutes(deps))`), chú thích kernel.ts:3508 "TOS-6 (#439): bộ đếm 3 thẻ..."; mount dưới `/api` → path đầy đủ `/api/dashboard/reminders` |
| `/api/kernel` | GET | Snapshot org — nguồn KPI + lịch + risk phía client (đọc chéo, không phải endpoint của feature) | apps/web/src/lib/repos/kernel.ts:633 (`fetch(\`${baseUrl}/api/kernel\`...)`); dashboard đọc qua `useData()` apps/web/src/routes/_auth/dashboard.tsx:69 |
| `/`, `/dashboard`, `/login`, `/attendance`, `/grading`, `/tuition`, `/schedule` | (router web) | Điều hướng trong scope dashboard | apps/web/src/routes/index.tsx:5; apps/web/src/routes/_auth/dashboard.tsx:38, apps/web/src/routes/_auth/dashboard.tsx:71, apps/web/src/routes/_auth/dashboard.tsx:200-205; apps/web/src/components/dashboard/reminder-cards.tsx:54-55, apps/web/src/components/dashboard/reminder-cards.tsx:64-66, apps/web/src/components/dashboard/reminder-cards.tsx:74-75 |

Không có endpoint ghi nào thuộc feature (negative-search §7).

## §2 Validation

| Luật | Bằng chứng | Cite |
|------|-----------|------|
| Hợp đồng response `.strict()` 4 khối: `date`, `attendance{pending, items}`, `overdueGrading{count, writing, speaking}`, `tuition?{students, outstanding}`; item = `{classId, className, time, dur}` | zod schema | packages/api/src/contracts.ts:2680-2716 (`.strict()` tại 2685, 2700, 2707, 2713-2714, 2716) |
| Server parse lại qua contract trước khi trả | `dashboardRemindersResponseSchema.parse(data)` | apps/server/src/routes/dashboard-reminders.ts:294-296 |
| Web parse zod trước khi dùng | `return dashboardRemindersResponseSchema.parse(await res.json())` | apps/web/src/lib/repos/dashboard-reminders.ts:40 |
| Chưa có snapshot thì chưa fetch (tránh fetch thừa với key 0) | `enabled: kernelUpdatedAt > 0` | apps/web/src/routes/_auth/dashboard.tsx:92-96 |
| Bài tập hiển thị theo thời điểm mở bài trong truy vấn thẻ 2 | `visibleAssignmentFilter(now)` = `availableAt IS NULL OR availableAt <= now` | apps/server/src/lib/assignment-visibility.ts:11-16; dùng tại apps/server/src/routes/dashboard-reminders.ts:193 |
| Gate trước route: student/admin/email-allowlist/email-verified | Middleware bootstrap | apps/server/src/app.ts:224-268; set kernelCtx apps/server/src/app.ts:296-300 |
| Bài "quá hạn chấm" khớp hàng chờ grading `?status=awaiting` (grade === null) | comment khớp nguồn | apps/server/src/routes/dashboard-reminders.ts:70-79; apps/web/src/components/dashboard/reminder-cards.tsx:64-66 (`search={{ status: "awaiting" }}`) |
| Hóa đơn khớp rule trang sổ học phí (`status !== "paid" || paidAmount < amount`, clamp trả thừa) | comment khớp nguồn | apps/server/src/routes/dashboard-reminders.ts:76-78; apps/web/src/lib/tuition-from-kernel.ts:28-48 |

## §3 Errors (R2 — quote nguyên văn throw-site + catalog)

| Mã / chuỗi | Throw site (nguyên văn) | Catalog / handler | Cite |
|------------|------------------------|-------------------|------|
| 401 `unauthorized` | ``if (!ctx) return c.json({ error: "unauthorized" }, 401);`` | test: `expect(res.status).toBe(401)` | apps/server/src/routes/dashboard-reminders.ts:286-287; apps/server/src/routes/dashboard-reminders.test.ts:597-602 |
| 403 `ACCOUNT_STUDENT_ROLE` | throw site middleware: `return c.json({ error: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP, code: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP }, 403);` | catalog: `STUDENT_ON_TEACHER_APP: "ACCOUNT_STUDENT_ROLE"` | apps/server/src/app.ts:224-232; packages/api/src/contracts.ts:1981-1982; test: apps/server/src/routes/dashboard-reminders.test.ts:604-611 (`expect(body.code).toBe("ACCOUNT_STUDENT_ROLE")`); e2e blocked view: apps/e2e/specs/account-role-separation.spec.ts:137-145 |
| 403 `ACCOUNT_ADMIN_ROLE` | `return c.json({ error: ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP, code: ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP }, 403);` | catalog: `ADMIN_ON_TEACHER_APP: "ACCOUNT_ADMIN_ROLE"` | apps/server/src/app.ts:235-242; packages/api/src/contracts.ts:1984-1985 |
| 403 `ACCOUNT_TEACHER_NOT_ALLOWED` / `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` | `return c.json({ error: ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED, code: ... }, 403);` / tương tự EMAIL_UNVERIFIED | catalog: `TEACHER_NOT_ALLOWED: "ACCOUNT_TEACHER_NOT_ALLOWED"`, `TEACHER_EMAIL_UNVERIFIED: "ACCOUNT_TEACHER_EMAIL_UNVERIFIED"` | apps/server/src/app.ts:246-268; packages/api/src/contracts.ts:1990-1995 |
| Lỗi fetch bộ đếm (web) | ``throw new HttpError(res.status, `Failed to load dashboard reminders: ${res.status}`);`` | UI: "Không tải được bộ đếm nhắc việc." + nút "Thử lại" | apps/web/src/lib/repos/dashboard-reminders.ts:34-39; apps/web/src/routes/_auth/dashboard.tsx:150-160; class `HttpError` apps/web/src/lib/kernel-load-state.ts:22-40 |
| Snapshot sai dạng (200 nhưng shape sai) | `throw new MalformedSnapshotError("GET /api/kernel 200 response did not match the snapshot shape");` / `throw new MalformedSnapshotError("GET /api/kernel returned invalid JSON", { cause });` | shape guard `isSnapshotShape` | apps/web/src/lib/repos/kernel.ts:648-661; apps/web/src/lib/repos/kernel.ts:601-619 |
| 404 `class not found` (nhánh scope assigned — dead) | `return c.json({ error: "class not found", reason: "not-found" }, 404);` | Chỉ chạy khi `scope.kind === "assigned"` — hiện unreachable | apps/server/src/routes/kernel.ts:2916-2919; resolver apps/server/src/routes/dashboard-reminders.ts:273-280 |

## §4 Rules + hằng số

| Tên | Giá trị | Ý nghĩa | Cite |
|-----|---------|---------|------|
| `HOUR_MS` | 60*60*1000 | Đơn vị giờ | apps/server/src/routes/dashboard-reminders.ts:37 |
| `OVERDUE_GRADING_MS` | 24 * HOUR_MS | Ngưỡng "quá hạn chấm" (comment "AC-001") | apps/server/src/routes/dashboard-reminders.ts:38-39 |
| `TUITION_DUE_WINDOW_DAYS` | 7 | Hóa đơn hạn trong 7 ngày tới hoặc đã quá hạn | apps/server/src/routes/dashboard-reminders.ts:40-41 |
| `ATTENDANCE_PREVIEW_LIMIT` | 3 | Số mục xem trước thẻ điểm danh | apps/server/src/routes/dashboard-reminders.ts:42-43 |
| `ABSENT_WINDOW_DAYS` | 14 | Cửa sổ cảnh báo vắng (TOS-7), chỉ buổi có ngày | apps/web/src/lib/dashboard-from-kernel.ts:117-122 |
| `lessonWeekdayOf` | ISO → weekday 1–7, Mon=1 | Thứ suy từ ISO giờ VN (UTC-anchored), không getDay() | apps/server/src/routes/dashboard-reminders.ts:56-62 |
| Bucket gom ca | dated: `dated:{classId}\0{date}`; legacy: `legacy:{classId}\0{time}` | Khớp bucket vật lý GET/PUT attendance | apps/server/src/routes/dashboard-reminders.ts:136-155 |
| Loại demo attempt | `notLike(quizAttempt.id, "demo-attempt:%")` | #508 — bài nộp mẫu không phải việc giáo viên | apps/server/src/routes/dashboard-reminders.ts:220 |
| Hybrid Writing tính là writing | `essayTaskOf(row) !== null ? "writing" : row.skill` | Đề tự chấm có phần Writing vào thẻ chấm Writing | apps/server/src/routes/dashboard-reminders.ts:224-229; packages/api/src/lib/ielts-band.ts:61-85 |
| Scope bỏ key tuition | `...(tuition ? { tuition } : {})` | Không trả null/0 khi thiếu quyền tài chính | apps/server/src/routes/dashboard-reminders.ts:268-270 |
| `resolveReminderScope` | luôn `{kind:"org", finance: role===undefined ? true : canAccessFinance(role)}` | Mọi teacher là toàn org (Phase 5 cắm sau) | apps/server/src/routes/dashboard-reminders.ts:273-280 |
| `canAccessFinance` | FINANCE_ROLE_MAP: teacher/owner/admin = true | Allowlist least-privilege | packages/auth/src/role.ts:75-87 |
| Query key reminders | `["kernel","dashboard","reminders", dataUpdatedAt]` | Nối vòng đời snapshot → refetch | apps/web/src/lib/repos/dashboard-reminders.ts:10-24 |
| `kernelQueryKey` | `["kernel"]`, staleTime Infinity ở observer dashboard | 1 cache entry dùng chung | apps/web/src/lib/repos/kernel.ts:669-677; apps/web/src/routes/_auth/dashboard.tsx:87-91 |
| Greeting | 05–11 sáng, 12–17 chiều, còn lại tối; tz "Asia/Ho_Chi_Minh" | Issue #120 | apps/web/src/lib/dashboard-from-kernel.ts:190-214 |
| Zero inbox | `DONE_TODAY_LABEL = "Đã hoàn tất hôm nay"` | Đếm 0 → không hiện số | apps/web/src/components/dashboard/reminder-cards.tsx:6, apps/web/src/components/dashboard/reminder-cards.tsx:97-112 |
| Preview thẻ | `lines.slice(0, 3)` | Tối đa 3 dòng/trên cả 3 thẻ | apps/web/src/components/dashboard/reminder-cards.tsx:113-117 |
| Upcoming tuần | legacy: `day > todayDay`; dated: `date ∈ {mai..CN}`; loại cancelled/holiday | Phần còn lại của tuần | apps/web/src/lib/dashboard-from-kernel.ts:88-108 |
| missed-check-in | `status==="upcoming" && day < today` (Mon=1) | Thứ Hai luôn 0 miss (no wrap) | apps/web/src/lib/dashboard-from-kernel.ts:138-166 |
| isRecentAbsence | date≠null ∧ attendance≠"excused" ∧ (unexcused ∨ (null ∧ status="absent")) ∧ date ≥ cutoff 14 ngày | Vắng có phép không cảnh báo | apps/web/src/lib/dashboard-from-kernel.ts:124-136 |
| Định dạng tiền | `fmtVND` = `toLocaleString("vi-VN") + "đ"` | — | apps/web/src/lib/mock-data.ts:330-332 |
| Nhãn risk | `absent: "Vắng"`, `"missed-check-in": "Miss check-in"` | — | apps/web/src/routes/_auth/dashboard.tsx:42-45 |
| Ngày e2e mốc test | `NOW = new Date("2026-10-26T03:00:00Z")` (10:00 VN thứ Hai) | Chứng minh suy weekday từ ISO | apps/server/src/routes/dashboard-reminders.test.ts:23-27 |

## §5 Entities (cột mà feature dashboard đọc)

| Entity | Cột feature đọc | Cite |
|--------|-----------------|------|
| class (classTable) | id, orgId, name | apps/server/src/routes/dashboard-reminders.ts:101-113 (select + join); apps/web/src/routes/_auth/dashboard.tsx:213-215 (`classById(...)?.name`) |
| enrollment | id, classId, orgId, status ("active") | apps/server/src/routes/dashboard-reminders.ts:114-122 |
| lesson | id, orgId, classId, enrollmentId, day, time, dur, date (nullable), status ("upcoming"/"completed"/"cancelled"/"holiday"/"absent"), attendance ("excused"/"unexcused"/null), topic, type | apps/server/src/routes/dashboard-reminders.ts:99-132; apps/web/src/lib/dashboard-from-kernel.ts:13-25, apps/web/src/lib/dashboard-from-kernel.ts:124-136; apps/web/src/lib/dashboard-from-kernel.ts:27-34 (interface `DashboardClassSession`); seed test apps/server/src/routes/dashboard-reminders.test.ts:172-243 |
| invoice | id, orgId, studentId, enrollmentId, amount, paidAmount, status ("paid"/"unpaid"), due (yyyy-mm-dd hoặc "") | apps/server/src/routes/dashboard-reminders.ts:233-250; e2e INSERT apps/e2e/specs/dashboard-reminders.spec.ts:42-54 |
| quiz_attempt | id, orgId, assignmentId, testId, studentId, mode ("assignment"/"practice"), status ("submitted"), submittedAt, gradeScores (null = chờ chấm) | apps/server/src/routes/dashboard-reminders.ts:162-222; seed apps/server/src/routes/dashboard-reminders.test.ts:353-423 |
| assignment_prompt | id, orgId, skill, writingPart, status | apps/server/src/routes/dashboard-reminders.ts:162-181 |
| assignment_test | id, orgId, skill, status | apps/server/src/routes/dashboard-reminders.ts:200-222 |
| class_assignment | id, orgId, classId, promptId, due, availableAt | apps/server/src/routes/dashboard-reminders.ts:167-198; apps/server/src/lib/assignment-visibility.ts:3-16 |
| organization / membership | orgId (mọi predicate), membership.role → finance | apps/server/src/app.ts:296-300; apps/server/src/routes/dashboard-reminders.ts:273-280; packages/auth/src/role.ts:75-87 |
| student (client) | id, name, avatar, pkg.remaining (derived) | apps/web/src/routes/_auth/dashboard.tsx:271-289 |

## §6 Cross-repo hops

| Từ | Đến | Nội dung | Cite |
|----|-----|----------|------|
| apps/server | packages/api | `DashboardReminders` + `dashboardRemindersResponseSchema` | apps/server/src/routes/dashboard-reminders.ts:1-4 |
| apps/server | packages/api | `vietnamTodayISO`, `addDaysISO` | apps/server/src/routes/dashboard-reminders.ts:6 |
| apps/server | packages/auth | `canAccessFinance` | apps/server/src/routes/dashboard-reminders.ts:7 |
| apps/server | packages/db | schema: assignmentPrompt, assignmentTest, classAssignment, classTable, enrollment, invoice, lesson, quizAttempt | apps/server/src/routes/dashboard-reminders.ts:8-17 |
| apps/server | packages/api | `essayTaskOf` (ielts-band) | apps/server/src/routes/dashboard-reminders.ts:5 |
| apps/web | packages/api | type `DashboardReminders` (client + component) | apps/web/src/lib/repos/dashboard-reminders.ts:2-5; apps/web/src/components/dashboard/reminder-cards.tsx:2 |
| apps/web | apps/web/lib | dashboard-from-kernel + tuition-from-kernel + week-grid + format-schedule | apps/web/src/routes/_auth/dashboard.tsx:21-36; apps/web/src/lib/dashboard-from-kernel.ts:2; apps/web/src/lib/dashboard-from-kernel.ts (week-grid import) |
| apps/e2e | apps/e2e/specs helpers | `isoInDaysFromTodayVN`, `orgIdForTeacherEmail`, `signUpViaApi`, `seedQuizFixture`, `seedSubmittedEssay` | apps/e2e/specs/dashboard-reminders.spec.ts:3-9 |
| feature khác tái dùng scope resolver | daily-attendance + kernel PUT attendance | `resolveReminderScope()` (không role) | apps/server/src/routes/daily-attendance.ts:22-23, apps/server/src/routes/daily-attendance.ts:186, apps/server/src/routes/daily-attendance.ts:325; apps/server/src/routes/kernel.ts:2916-2919 |

## §7 Gaps — negative-search

**NS-1 — Không ai sản xuất scope `kind:"assigned"` trong production.**
- Pattern: `kind: "assigned"` (kể cả nháy đơn).
- Scope grep: `grep -rn "kind: \"assigned\"\|kind: 'assigned'" apps packages --include=*.ts*` (loại dist).
- Kết quả (đầy đủ, 4 hit):
  - apps/server/src/routes/daily-attendance.test.ts:543 (test)
  - apps/server/src/routes/dashboard-reminders.test.ts:517, apps/server/src/routes/dashboard-reminders.test.ts:548 (test)
  - apps/server/src/routes/dashboard-reminders.ts:54 (type definition)
- Resolver luôn trả "org": apps/server/src/routes/dashboard-reminders.ts:273-280; callers: apps/server/src/routes/dashboard-reminders.ts:291, apps/server/src/routes/kernel.ts:2916, apps/server/src/routes/daily-attendance.ts:325. → OQ-1. 🟡

**NS-2 — Không có endpoint ghi nào dưới `/api/dashboard`.**
- Pattern: `dashboard` trong apps/server/src/routes (file .ts, loại test).
- Kết quả: chỉ `dashboard-reminders.ts` định nghĩa route (GET duy nhất, apps/server/src/routes/dashboard-reminders.ts:285-297) và 1 mount (apps/server/src/routes/kernel.ts:3509). Các file khác nhắc "dashboard" ngoài định nghĩa route: bank-hub-mock.ts (comment), daily-attendance.ts (import resolver); events/grading có 0 hit — không file nào khác có surface API của feature.

**NS-3 — Không có cờ tắt (feature flag) cho dashboard.**
- Pattern: `dashboard` × `features.ts`/`ENABLED`/`FLAG`.
- Kết quả: apps/web/src/lib/features.ts chứa `PARENT_REPORTS_ENABLED`, `AI_ENABLED`, `TEACHER_SIGNUP_ENABLED` — không có cờ nào điều khiển dashboard/reminders — tính năng luôn bật.

**NS-4 — PDR không mô tả dashboard.**
- Pattern: `dashboard|tổng quan|việc cần làm` trên docs/project-overview-pdr.md → 0 hit. → GAP-1.

**NS-5 — Test active (R1).**
- Đã soát 4 file test của feature (apps/server/src/routes/dashboard-reminders.test.ts, apps/web/src/routes/_auth/dashboard.test.tsx, apps/web/src/components/dashboard/reminder-cards.test.tsx, apps/e2e/specs/dashboard-reminders.spec.ts): KHÔNG có `.skip`/`.todo`/`.only` — toàn bộ test active, cite trực tiếp từng test trong spec.
