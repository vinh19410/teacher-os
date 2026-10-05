# QC Test Case Report: TeacherOS (vinh19410/teacher-os)

Target: product durable contracts — auth/role, kernel CSRF, enrollment, invoice, quiz, topology cookies, SPA 404.
Mode: ak-scenario one-shot, `--domain software`, `--focus security` (authz/tenancy first).
Dimension authority: `~/.zcode/skills/ak-scenario/SKILL.md` (cùng `~/.grok/skills/ak-scenario/SKILL.md`).
Converter: local skill `qc-test-case` + `references/test-case-contract.md`.
Clone: `/Users/vinhtran/Documents/project/personal/teacher-os` @ 2026-10-02.
Existing tests: Vitest `apps/server`, `packages/{api,auth,infra}`, Playwright `apps/e2e/specs`.
Không chạy suite. Không implement. Không mở GitHub issue.

Actors: teacher (org mới / org có data), student (unverified / verified / multi-org), guest, bot/curl không Origin, co-tenant org khác.
Surfaces: `POST` kernel `/api/*`, student `/api/student/*`, Better Auth `/api/auth/*`, teacher web, student portal, landing.

## Scenario filter (ak-scenario)

Dimensions analyzed: User Types, Input Extremes, Timing, Scale, State Transitions, Environment, Error Cascades, Authorization, Data Integrity, Integration, Compliance, Business Logic.
Dimensions skipped: không — SaaS class-ops có auth, tenancy, money, quiz, mail, cookie zone.

---

## QC Test Case Report: TeacherOS kernel + portal

| ID | Dimension | Title | Layer | Severity | Given | When | Then | Covered |
|----|-----------|-------|-------|----------|-------|------|------|---------|
| TC-USR-01 | User Types | Teacher mới bootstrap org rỗng | integration | High | Sign-up teacher Origin web, 0 membership | GET `/api/kernel` | 1 org + 1 membership `teacher`; snapshot rỗng; lần 2 không tạo org thứ hai | yes — `first request bootstraps an empty org with a teacher membership, idempotently` (`apps/server/src/kernel.test.ts:381`) |
| TC-USR-02 | User Types | Student role không vào teacher API | integration | Critical | Session stamp `student` (portal Origin) | GET `/api/kernel` Origin web | 403 `ACCOUNT_STUDENT_ROLE`; 0 org/membership mới | yes — `student-role session gets 403 ACCOUNT_STUDENT_ROLE…` (`apps/server/src/role-gates.test.ts:103`) + e2e `account-role-separation.spec.ts` |
| TC-USR-03 | User Types | Teacher cookie trên portal | integration | Critical | Session `teacher` | Gọi `/api/student/*` | 403 `ACCOUNT_TEACHER_ROLE` trước provision | partial — role-gates + `requireStudent`; e2e portal chặn teacher chưa đọc hết |
| TC-USR-04 | User Types | Guest / curl không cookie | integration | High | Không session | GET `/api/kernel` Origin đúng | 401 `unauthorized` | yes — `unauthenticated kernel request is 401` (`kernel.test.ts:376`) |
| TC-USR-05 | User Types | Co-tenant IDOR occurrence | integration | Critical | Org A có buổi; session org B | POST occurrence/edit id của A | 404; row A không đổi | yes — `co-tenant protection: second org sees neither bucket nor class` (`kernel-occurrence.test.ts:410`) |
| TC-INP-01 | Input Extremes | Tạo lớp end ≤ start | unit | High | Body `schedule.end <= start` | POST `/api/classes` | 400; message giờ kết thúc phải sau giờ bắt đầu | yes — `classCreateSchema` (`packages/api/src/contracts.ts:66`) + `invalid time format is 400; end before start is 400` + e2e `create-class-validation.spec.ts` |
| TC-INP-02 | Input Extremes | sessionsTotal 0 không coerce 12 | unit | High | `sessionsTotal: 0` | POST `/api/classes` | 400; không persist lớp 12 buổi | yes — schema `.min(1).max(52)` (`contracts.ts:57`) + `sessionsTotal 0 is 400` (`kernel.test.ts:514`) + e2e #105 |
| TC-INP-03 | Input Extremes | Invoice amount 0 / non-int | unit | High | `amount: 0` hoặc `1.5` | POST `/api/invoices` | 400 `invalid body`; 0 row | yes — `invoiceCreateSchema` `.int().min(1)` (`contracts.ts:1137`) |
| TC-INP-04 | Input Extremes | due 2026-02-30 | unit | High | `due: "2026-02-30"` regex pass | POST invoice | 400 calendar reject (`parseStartDateStrict`) | partial — comment `contracts.ts:1128-1132`; test calendar occurrence có, invoice due chưa grep riêng |
| TC-INP-05 | Input Extremes | POST kernel không JSON | integration | High | Origin đúng, `Content-Type: text/plain` | POST `/api/classes` | 415 `content-type must be application/json` | yes — `kernel.ts:97-104` + invitation CSRF test (`student-invitation.test.ts:374`) |
| TC-INP-06 | Input Extremes | Quiz PATCH quá lớn | integration | Medium | Attempt in_progress | PATCH value ~4500 + Content-Length 5000 | 413 `payload too large` | yes — `student-quiz.test.ts` oversized 413 |
| TC-INP-07 | Input Extremes | Syllabus replace > 2 MiB | integration | High | Template tồn tại | POST replace-content body > 2MiB | 413/400; cây cũ nguyên | yes — `create rejects requests above 2 MiB without persisting` (`kernel.test.ts:708`) |
| TC-TIM-01 | Timing | Accept enrollment song song | integration | High | Enrollment `invited` | 2× POST accept cùng id | 1 package + lessons; cả hai ok (CAS) | partial — comment CAS (`enrollment-activation.ts:95-100`); chưa thấy test concurrent thật |
| TC-TIM-02 | Timing | Quiz submit vs autosave | e2e | High | Attempt in_progress, answer trước autosave | Submit rồi reload | Answer đếm; không mất; không leak key | yes — e2e `does not leak the answer key…submitted before autosave` (`student-quiz-take-review.spec.ts`) |
| TC-TIM-03 | Timing | Check-in bulk upcoming | integration | Medium | Nhiều row upcoming cùng bucket | POST check-in | Mọi upcoming → completed; skipped settled | yes — `check-in bulk marks every upcoming row completed` (`kernel-occurrence.test.ts:275`) |
| TC-SCL-01 | Scale | Org 0 lớp / 0 HV | e2e | Medium | Teacher sign-up mới | Mở dashboard | Empty-state thật, không mock; KPI 0 | yes — bootstrap snapshot rỗng + `login.smoke.spec.ts` |
| TC-SCL-02 | Scale | sessionsTotal 52 biên, 53 reject | unit | Medium | `sessionsTotal: 53` | POST class | 400; 52 pass | partial — schema max 52 (`contracts.ts:57`); test 0 có, 53 chưa thấy tên riêng |
| TC-SCL-03 | Scale | Lớp chưa HV vẫn chiếu buổi dự kiến | e2e | Medium | Lớp có lịch, 0 enrollment active | Mở schedule | Buổi dự kiến đúng tuần, không CTA điểm danh | yes — `projected-sessions.spec.ts` |
| TC-ST-01 | State Transitions | Enroll → invited, 0 package | integration | High | HV có sẵn + lớp | POST `/api/classes/:id/enroll` | Enrollment `invited`; 0 package; 0 lesson | yes — `POST /classes/:id/enroll creates enrollment invited…` (`kernel.test.ts:6183`) |
| TC-ST-02 | State Transitions | Accept → active + package | integration | High | Enrollment invited | POST `/api/enrollments/:id/accept` | status `active`; package `sessionsTotal`; lessons sinh | yes — `POST /api/enrollments/:id/accept transitions invited -> active…` (`kernel.test.ts:6207`) |
| TC-ST-03 | State Transitions | Accept lần 2 idempotent | integration | High | Enrollment đã `active` | POST accept lại | 200 ok; không nhân đôi package | partial — `activateEnrollment` early return (`enrollment-activation.ts:129-131`); test tên riêng chưa grep |
| TC-ST-04 | State Transitions | Quiz 1 attempt / assignment | integration | Critical | Attempt in_progress hoặc submitted | POST start lần 2 | Không tạo attempt thứ hai; take payload không key | yes — schema quiz_attempt + `student-quiz.test.ts` take payload |
| TC-ST-05 | State Transitions | Email chưa verify teacher | e2e | High | Sign-up teacher | Chưa bấm link | Không workspace đầy đủ; verify → `email_verified=1` + CTA | yes — `web-email-verification.spec.ts` |
| TC-ST-06 | State Transitions | Portal provision lần đăng nhập đầu | e2e | High | Student verified, 0 hồ sơ | Login portal | Tạo `student` org sớm nhất; teacher sign-up không tạo student row | yes — `student-portal-provisioning.spec.ts` + `student-portal-email-verification.spec.ts` |
| TC-ENV-01 | Environment | Teacher unknown path HTTP 404 branded | e2e | High | Guest/teacher | GET `/this-page-does-not-exist` Accept HTML | HTTP 404 + UI "Trang không tồn tại" | yes — `404-branded-status.spec.ts` + `worker.ts` + `routes-matcher.ts:3-24` |
| TC-ENV-02 | Environment | Dotfile không SPA | e2e | Critical | Any | GET `/.env` | 404 text/plain, không HTML | yes — `worker.ts:51-63` + 404 spec |
| TC-ENV-03 | Environment | Student SPA fallback cần Accept HTML | e2e | High | Prod student | GET `/login` không `Accept: text/html` | Worker: 404 text nếu asset miss (`apps/student/src/worker.ts:83-101`); HTML GET phải SPA 200 index, không 307 `/` | no — UAT 2026-10-02 prod `/login` HTML 307 `/`; lệch contract worker |
| TC-ENV-04 | Environment | Staging teacher auth routes | e2e | High | Staging app `v0.0.6` vs repo `0.0.12` | GET `/forgot-password` `/reset-password` `/verify-email` HTML | 200 SPA (matcher `routes-matcher.ts:6-8`); 404 branded = staging thiếu route | no — UAT staging 404 SPA not-found; prod 200. BLOCKED version |
| TC-ENV-05 | Environment | Student staging DNS | manual | High | `student.staging.teacheros.io.vn` | Resolve + GET | DNS phải có nếu UAT portal staging; hiện NXDOMAIN | no — UAT BLOCKED 2026-10-02 |
| TC-ENV-06 | Environment | Sidebar mobile <921px | e2e | Low | Viewport hẹp, collapsed=true | Mở drawer | Full-label 280px, không mất nav | yes — `sidebar-collapse.spec.ts` |
| TC-ERR-01 | Error Cascades | Mailer down lúc reset | integration | High | Sign-up ok; mailer throw | POST `/api/auth/request-password-reset` Origin đúng | Không oracle email; user thấy copy trung tính; không 500 lộ stack | partial — `auth-reset-password.test.ts` happy-path; outage chưa thấy |
| TC-ERR-02 | Error Cascades | replace-content org khác | integration | High | Syllabus org A | Session org B POST replace | 404; cây A nguyên | yes — `replace-content from another org is 404 and leaves the tree intact` (`kernel.test.ts:908`) |
| TC-ERR-03 | Error Cascades | Occurrence bucket emptied | integration | Medium | Bucket đã empty | POST edit | 404 not-found, không 200 giả | yes — `edit on an EMPTIED bucket is a 404` (`kernel-occurrence.test.ts:364`) |
| TC-ERR-04 | Error Cascades | HTTPS redirect không loop | unit | Medium | `x-forwarded-proto: http` trên HTTPS | GET `/readyz` | 200, không Location | yes — `security.test.ts:40` |
| TC-AUTH-01 | Authorization | Kernel POST thiếu Origin | integration | Critical | Session cookie hợp lệ | POST `/api/classes` không Origin | 403 `origin not allowed` | yes — `kernel.ts:91-96`; CSRF invitation; UAT staging 403 (live) |
| TC-AUTH-02 | Authorization | Kernel POST Origin lạ | integration | Critical | Session cookie | Origin `https://evil.example` | 403 `origin not allowed` | yes — cùng guard; UAT staging 403 |
| TC-AUTH-03 | Authorization | Origin đúng, không session | integration | High | Origin app staging/prod | POST `/api/classes` | 401 `unauthorized` (sau Origin) | yes — `kernel.ts:110-111`; UAT staging 401 |
| TC-AUTH-04 | Authorization | CSRF middleware trước mọi POST | unit | Critical | Kernel router | Inspect registration | `kernel.use("*")` Origin check trước mọi `kernel.post` | yes — `CSRF ordering contract…` (`kernel-occurrence.test.ts:507`) |
| TC-AUTH-05 | Authorization | Sign-out Origin lạ | integration | Critical | Session staging | POST `/api/auth/sign-out` thiếu/lạ Origin | Kỳ vọng fail-closed 403; không xóa cookie | no — UAT staging 200 success + clear cookie. Hở Better Auth vs kernel |
| TC-AUTH-06 | Authorization | request-password-reset Origin lạ | integration | High | Known email | POST reset Origin evil | 403 origin, không 400 VALIDATION_ERROR | no — UAT staging 400 VALIDATION_ERROR |
| TC-AUTH-07 | Authorization | Cookie prefix staging vs prod | integration | Critical | `APP_DOMAIN=staging.teacheros.io.vn` | Sign-up | Cookie `teacheros-staging`; prod `better-auth` không shadow | yes — `topology.ts:97-100` + `cookie-prefix.test.ts` + `topology.test.ts:38` |
| TC-AUTH-08 | Authorization | Sign-up không Origin → student least privilege | e2e | High | POST sign-up/email không Origin | Dùng session trên teacher app | Classify student; teacher API 403 | yes — comment `account-role-separation.spec.ts:25-26` |
| TC-DI-01 | Data Integrity | Unique enrollment (class, student) | integration | High | Đã invited cùng lớp | Enroll lại | Reject/unique; không 2 row | yes — uniqueIndex `enrollment_class_student_uq` (`enrollment.ts:40`) + DELETE invited cho re-enroll (`kernel.test.ts:6342`) |
| TC-DI-02 | Data Integrity | Unique student email per org | integration | High | Org A đã có email | Invite cùng email org A | Duplicate blocked; org B cùng email được | yes — PDR + `student-invitation.test.ts` prevent duplicates |
| TC-DI-03 | Data Integrity | Invoice enrollment org khác | integration | Critical | enrollmentId org B | POST invoice session A | 404; 0 invoice | yes — kernel.test foreign enrollment 404 trước `rejects invoice for invited` (`kernel.test.ts:1491`) |
| TC-INT-01 | Integration | Assignments mount trong kernel CSRF | unit | Critical | Router tree | POST `/api/assignments/*` Origin lạ | 403 origin; không mount standalone | yes — architecture rule + kernel `assignmentRoutes` (`kernel.ts:58`) |
| TC-INT-02 | Integration | Google OAuth Origin + state app | e2e | High | Teacher Google | `/sign-in/social` | State stamp app; callback classifies teacher; CORS trustedOrigins | partial — README + architecture; e2e Google skip nếu không credential |
| TC-INT-03 | Integration | Mail reset + UI `/reset-password` | e2e | High | Teacher forgot | Request → link | Mail có; token set password; UI `/reset-password` 200 trên web matcher | yes unit `auth-reset-password.test.ts:118` + e2e `password-reset.spec.ts`; staging UI BLOCKED TC-ENV-04 |
| TC-INT-04 | Integration | Student quiz CSRF cùng Origin | integration | Critical | Student session | PATCH quiz Origin lạ | 403 `origin not allowed` | yes — `student-quiz.test.ts:390` + `student.ts:211` |
| TC-CMP-01 | Compliance | Reset token không log trần | unit | High | Log line `/api/auth/reset-password/<token>` | `redactResetToken` | Token `[redacted]`; POST không token giữ nguyên | yes — `log-redaction.test.ts`; gap: verify-email `?token=` không redact (`log-redaction.test.ts:27-28`) |
| TC-CMP-02 | Compliance | Verify-email token trong log | unit | Medium | GET verify-email?token= | Redact pipeline | Token không vào log prod | no — test cố ý `keep` token verify-email |
| TC-CMP-03 | Compliance | Parent reports ẩn | e2e | Medium | `PARENT_REPORTS_ENABLED = false` | Nav teacher | Không mục "Báo cáo phụ huynh"; `/reports` không cluster | yes — `features.ts:5` |
| TC-CMP-04 | Compliance | Quiz take không leak key/transcript | integration | Critical | Attempt in_progress | GET `/api/student/assignments/:id/quiz` | Body không `"answer"`/`alts`/transcript/note giáo viên | yes — `student-quiz.test.ts:431` |
| TC-BL-01 | Business Logic | Invoice enrollment invited → 409 | integration | High | Enrollment invited | POST invoice | 409 `Học viên chưa đồng ý tham gia lớp` | yes — `kernel.test.ts:1499` |
| TC-BL-02 | Business Logic | Assign invited student → 400 | integration | High | Mix invited + active ids | POST class assignment | 400; không giao bài invited | yes — `assignments rejects studentIds containing invited student with 400` (`kernel.test.ts:6422`) |
| TC-BL-03 | Business Logic | DELETE enrollment chỉ invited | integration | High | Enrollment active | DELETE `/api/enrollments/:id` | Từ chối; package/lesson giữ | yes — comment `kernel.ts:673` + tests DELETE invited |
| TC-BL-04 | Business Logic | Gói derive từ lớp lúc accept | e2e | High | Class sessionsTotal + tuitionFee | Accept enrollment | Package total = class; không input gói trên enroll modal | yes — e2e `student-package-validation.spec.ts` D1/D4 |
| TC-BL-05 | Business Logic | tuitionFee min 1, null xóa | unit | Medium | PATCH tuitionFee 0 | Update class | 400; null xóa học phí | yes — `classTuitionFeeUpdateSchema` (`contracts.ts:109`) |
| TC-BL-06 | Business Logic | IELTS cần skill; giao tiếp cấm skill | unit | High | type ielts skills=[] / communication skills≠[] | POST class | 400 | yes — `contracts.ts:73-85` + kernel tests |
| TC-BL-07 | Business Logic | Sửa đề sau giao không đổi attempt | integration | High | Attempt started; teacher sửa prompt | Student GET take | Snapshot lúc start; grading theo snapshot | yes — PDR + quiz_attempt schema; student-quiz tests |

---

### Gaps (QC pass)

- Authorization: Better Auth `/api/auth/sign-out` và `/request-password-reset` không cùng fail-closed Origin với kernel (`kernel.ts:87-96`). UAT staging chứng minh.
- Environment: student worker SPA (`apps/student/src/worker.ts:83-93`) không classifier route như teacher (`routes-matcher.ts`); HTML unknown path = 200 index, curl không Accept = 404 9-byte.
- Environment: staging teacher thiếu `/forgot-password` trên worker đang live (404 branded) dù matcher repo có route — lệch version `v0.0.6` vs `0.0.12`.
- Timing: `activateEnrollment` CAS chưa có test hai request song song thật.
- Compliance: `redactResetToken` không che `verify-email?token=`.
- Input: invoice due calendar (`2026-02-30`) comment có, test tên riêng chưa thấy.
- Scale: sessionsTotal=53 chưa có test tên riêng (schema max 52).
- Integration: Google OAuth UAT phụ thuộc credential; e2e skip.
- Student staging DNS NXDOMAIN chặn portal UAT.

### Coverage matrix (dimension × highest kept severity)

| Dimension | Critical | High | Medium | Low |
|-----------|----------|------|--------|-----|
| User Types | 3 | 2 | 0 | 0 |
| Input Extremes | 0 | 6 | 1 | 0 |
| Timing | 0 | 2 | 1 | 0 |
| Scale | 0 | 0 | 3 | 0 |
| State Transitions | 1 | 5 | 0 | 0 |
| Environment | 1 | 4 | 0 | 1 |
| Error Cascades | 0 | 2 | 2 | 0 |
| Authorization | 5 | 3 | 0 | 0 |
| Data Integrity | 1 | 2 | 0 | 0 |
| Integration | 2 | 2 | 0 | 0 |
| Compliance | 1 | 1 | 2 | 0 |
| Business Logic | 0 | 6 | 1 | 0 |

### Summary

- Critical: 14
- High: 35
- Medium: 10
- Low: 1
- Total: 60 cases across 12 dimensions
- Uncovered Critical/High (`Covered=no`): TC-AUTH-05, TC-AUTH-06, TC-ENV-03, TC-ENV-04, TC-ENV-05
- Uncovered Medium: TC-CMP-02
- Partial Critical/High: TC-USR-03, TC-INP-04, TC-TIM-01, TC-ST-03, TC-ERR-01, TC-INT-02, TC-SCL-02
- Ready for `ak:test`: TC-AUTH-05, TC-AUTH-06, TC-ENV-03, TC-CMP-02, TC-TIM-01, TC-INP-04, TC-SCL-02, TC-ST-03
- Block release nếu `Covered=no` Critical: TC-AUTH-05 (sign-out Origin fail-open)

### Residual uncertainty

- Suite không chạy lượt này; Covered dựa trên đọc tên test + `path:line`.
- Staging live lệch repo (auto-deploy off) — TC-ENV-04 là môi trường, không phải thiếu matcher trong source hiện tại.
- Better Auth trustedOrigins cho sign-out/reset: chưa đọc vendored handler line-by-line; UAT là evidence hành vi.
- Không đụng lớp production thật / PII.

### Unresolved questions

- BA: student portal `/login` 307 `/` là contract (canonical home) hay bug so với `worker.ts` SPA 200?
- BA: auth routes (`sign-out`, `request-password-reset`) có được phép Origin-optional vì Better Auth CSRF riêng?
- PM: khi nào deploy staging bắt kịp `0.0.12` (#292/#297) và DNS `student.staging`?
