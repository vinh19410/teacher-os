---
title: "API tạo/sửa/hủy buổi học từ lịch lớp (issue #55)"
description: "Sinh lesson từ structured schedule khi enroll (mở rộng POST /students) + endpoint POST /lessons/:id/edit có conditional-write guard; 0 schema change, 0 migration"
status: completed
priority: P1
effort: 6h
branch: feat/55-lesson-crud-api-from-class-schedule
tags: [backend, api, m1]
created: 2026-08-21
---

# API tạo/sửa/hủy buổi học từ lịch lớp (issue #55)

## Overview

Issue #55 yêu cầu contract (`packages/api`) + route (`apps/server`) cho tạo/sửa/hủy buổi học (lesson) sinh từ structured schedule của lớp (flow lịch PR #47), guard race condition giống check-in hiện có, KHÔNG đổi schema lớn.

**Quyết định kiến trúc đã chốt (advisory-approved) — Generation at enrollment time (Option B):** lessons sinh ra trong **POST /students khi có `classId`** (enrollment), KHÔNG phải lúc POST /classes. Lý do cốt lõi:

- `lesson.enrollmentId` NOT NULL (packages/db/src/schema/lesson.ts:26-28) — lớp mới tạo có 0 enrollment (POST /classes chỉ insert classTable, apps/server/src/routes/kernel.ts:223-257). Sinh lesson lúc tạo lớp buộc phải nullable `enrollmentId` → table-rebuild migration SQLite (~12+ file) → vi phạm ràng buộc "no big schema change" của chính issue.
- Nullable enrollmentId phá mọi layer đã verify: `mapLessons` drop row không resolve được sid (apps/web/src/lib/repos/lessons.ts:46-49), `findLessonAction` innerJoin → 404 (kernel.ts:129-141), invariant 6 derive done theo enrollmentId (apps/web/src/lib/repos/students.ts:41-52), UI render tên học viên trên mọi lesson card (apps/web/src/routes/_auth/schedule.tsx:84-90).
- Enrollment chỉ tồn tại ở MỘT nơi: POST /students với `classId` (kernel.ts:156-208, insert enrollment tại :187). Thêm N lesson insert vào **cùng `db.batch`** (kernel.ts:173-206) → atomic trên D1 (implicit transaction) và libsql test — không có trạng thái "student có enrollment nhưng thiếu lessons".

**Diễn giải "sinh lessons khi tạo lớp" (Scope note — must read):** Issue nói "sinh lessons từ lịch lớp"; M1 DOD (docs/project-roadmap.md:41) nói "tạo lớp có lịch → sinh buổi tương ứng". Với Option B, DOD flow tường minh thành: **tạo lớp có lịch → thêm học viên (enroll) → lessons xuất hiện trên /schedule** qua snapshot có sẵn (GET /kernel, kernel.ts:143-147; loader snapshot.ts:139-141). Đây chính là flow M1 DOD E2E (roadmap :44: login → tạo lớp → thấy buổi → check-in) vốn bắt buộc enroll trước khi check-in, và trùng mục "thêm học viên + enroll vào lớp" (roadmap :32). Việc diễn giải này đã được advisory chấp thuận — [báo cáo phán quyết kongming](./reports/advise-kongming-design-forks.md); diễn giải cũng được ghi lại vào issue #55 trước khi implement. Lưu ý (red-team A5): week-grid /schedule hiện tĩnh (schedule.tsx:31 hardcode, mock-data.ts:156-157) — generated lessons xuất hiện trong **snapshot** không cần đổi code, nhưng "hiển thị đúng" đầy đủ (nav tuần) thuộc #56.

**Thành phần kế hoạch:**

1. **Generation** (Phase 1): pure generator schedule→lesson rows + gắn vào POST /students batch; contract addition `lessonEditSchema`.
2. **Edit** (Phase 2): `POST /lessons/:id/edit` upcoming-only, conditional-write guard copy từ `lessonStatusAction` (kernel.ts:312-352).
3. **Cancel**: `POST /lessons/:id/cancel` đã có (Wave 4, kernel.ts:358-360) — chỉ thêm test xác minh "sửa/hủy không làm hỏng buổi khác".
4. **0 schema change, 0 migration**: chỉ thêm zod schema vào contracts.ts (packages/api không có build step — `exports` trỏ thẳng TS source, packages/api/package.json:4-7).

## Scope notes

- **Quy ước day (đã tự verify từ code, có mâu thuẫn được hóa giải):**
  - Schedule JSON của lớp: `days` 0-6, **0 = Monday** (packages/api/src/contracts.ts:47 comment "0 = Monday … 6 = Sunday").
  - `lesson.day`: 1-7, **1 = Monday** — verify từ apps/web/src/routes/_auth/schedule.tsx:53-56 (`dayNames.map((dn, i) => … l.day === i + 1)`, `dayNames = ["T2"…"CN"]` apps/web/src/lib/mock-data.ts:156), apps/web/src/components/schedule/lesson-modal.tsx:38 (`T{lesson.day + 1}`, `dayDates[lesson.day - 1]`).
  - **Mapping generator: `lessonDay = scheduleDay + 1`.** KHÔNG dùng JS `getDay()` (0=Sunday).
  - Lưu ý: plan 260820-2048/docs cũ ghi "days 1–7" là sai với contract đã ship (0-6) — code thắng.
- **`startDate` KHÔNG dùng cho giá trị lesson row** (bảng lesson không có cột date) — chỉ #56 UI quan tâm. Generator bỏ qua hoàn toàn; lesson row chỉ mang weekday định kỳ.
- **`sessionsTotal` bị cap `.max(52)`** (red-team F1/A1 — Critical): không cap thì một lớp sessionsTotal lớn (UI là number tự do) khiến MỌI lần enroll dựng batch ~N statements → D1 reject → lớp chết vĩnh viễn (không có endpoint sửa/xóa lớp). 52 = weekly × 1 năm; boundary test 53 → 400.
- **Quan hệ `class.sessionsTotal` vs `package.total` (red-team S2/A2/F4 — quyết định domain):** 2 khái niệm ĐỘC LẬP — `sessionsTotal` là độ dài series lịch của lớp (lesson count sinh ra), `package.total` là entitlement học viên mua (input của POST /students, default 10). KHÔNG ràng buộc nhau; divergence là hợp lệ về domain (mua 10 buổi trong lớp 36 buổi). Pin bằng integration test (12 lessons + package total 10 cùng tồn tại trên wire). Hand-off #56: UI phải hiển thị 2 con số này đúng nghĩa riêng.
- **Legacy/invalid schedule JSON** (free-text pre-PR47, hoặc parse fail, hoặc `start === end`): sinh **0 lessons**, không throw — lớp cũ vẫn thêm được học viên (enrollment/package vẫn tạo — có test assert).
- **Defect KÍCH HOẠT bởi plan này (không phải pre-existing — red-team S2/A2/F4):** `sessionsDone` derive theo DISTINCT `day|time` (apps/web/src/lib/repos/classes.ts:28-46). Trước #55 không tồn tại production lesson-create path nào (lesson.ts:11-13) nên collapse chưa từng observable; generation sinh N rows trùng slot (weekly recurrence) → check-in đủ 12 buổi T3/T5 vẫn hiện 2/12. Pin test hành vi sai làm red-target; việc sửa derive thuộc #56 (web repo). M1 "tiến độ lớp derive từ lesson thật" (roadmap :34) KHÔNG đạt được bởi #55 một mình.
- **Race/idempotency:** generation đi cùng batch atomic (không có state "student mà thiếu lessons"); edit là full-replace idempotent (cùng body 2 lần → cùng state, lần 2 vẫn 200 khi upcoming) + optimistic concurrency (old values trong WHERE — red-team F2 — chống edit-vs-edit lost update); cancel replay → 409 (behavior hiện có, không đổi). **Edit là full-replace: omit topic/zoom sẽ WIPE giá trị đang có** — cảnh báo trong doc comment schema + hand-off #56 (red-team S4/F8).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | POST /students với `classId` (lớp có structured schedule) sinh đúng `sessionsTotal` lesson rows `status: "upcoming"` trong cùng `db.batch` — atomic; org-scoped (cross-org test) | P1 |
| 2 | `POST /lessons/:id/edit` upcoming-only với conditional-write guard + optimistic concurrency (old values trong WHERE — 404/409 matrix copy từ check-in), chỉ sửa đúng 1 row | P1 |
| 3 | Test chứng minh sửa/hủy 1 lesson không ảnh hưởng lesson khác (M1 DOD roadmap:42); multi-enrollment (group) không cross-contaminate | P1 |
| 4 | 0 schema change, 0 migration — chỉ additive contracts.ts (`lessonEditSchema` + cap `sessionsTotal ≤ 52`) | P1 |
| 5 | Trust boundary đóng: `topic`/`zoom` capped, `zoom` chỉ ""/https://, strict body | P1 |
| 6 | CI gates xanh: `pnpm test`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm build` | P1 |

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Contracts + schedule-driven lesson generation on enrollment](./phase-01-contracts-and-generation.md) | Pending | 3h |
| 2 | [Lesson edit endpoint with conditional-write guard](./phase-02-lesson-edit-endpoint.md) | Pending | 2h |
| 3 | [Regression gates + M1 DOD evidence](./phase-03-regression-gates-and-dod-evidence.md) | Pending | 1h |

Phases tuần tự (1 → 2 → 3): Phase 1 và 2 cùng chạm `packages/api/src/contracts.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/kernel.test.ts` — KHÔNG chạy song song. Phase 1 sở hữu mọi thay đổi contracts.ts để Phase 2 chỉ còn route + tests.

## Success Criteria

- [ ] Tạo lớp có lịch (schedule structured) → POST /students với `classId` → GET /kernel trả đúng `sessionsTotal` lessons: `day = scheduleDay + 1`, `time = schedule.start`, `dur` phút (wrap midnight), `status: "upcoming"`, `enrollmentId` trùng enrollment vừa tạo. (Issue acceptance "sinh buổi từ lịch lớp"; M1 DOD roadmap:41 phần API — phần hiển thị /schedule tự có qua snapshot.)
- [ ] Sửa 1 lesson (edit) và hủy 1 lesson (cancel) không thay đổi bất kỳ lesson row nào khác. (M1 DOD roadmap:42.)
- [ ] Edit: 200 happy path; 404 unknown id/org khác; 409 not-upcoming (sau check-in, sau cancel); 409 enrollment-class mismatch; 409 old-values mismatch (optimistic concurrency); guard Origin/content-type/strict-body kế thừa middleware; invalid body → 400 (kể cả topic quá 500, zoom không phải https).
- [ ] POST /students KHÔNG có `classId` → 0 lessons (regression behavior hiện có). Legacy/invalid schedule → 0 lessons, student/enrollment/package vẫn tạo 201. `sessionsTotal = 0` → 0 lessons. `sessionsTotal > 52` → 400 lúc tạo lớp.
- [ ] Cross-org: org B không enroll được vào lớp org A (404), snapshot org B không có lessons của org A; group class 2 học viên → 2×N lessons, enrollmentId phân biệt.
- [ ] Không file nào trong `packages/db/src/schema/` và `packages/db/src/migrations/` bị đổi.
- [ ] `pnpm test` + `pnpm exec biome check .` + `pnpm check-types` + `pnpm build` xanh (parity `.github/workflows/ci.yml:31-35`).

## Related docs

- Issue #55 "M1: API tạo/sửa/hủy buổi học từ lịch lớp" (GitHub, milestone M1).
- Advisory: [reports/advise-kongming-design-forks.md](./reports/advise-kongming-design-forks.md) (phán quyết design forks Option B / defer one-off create / edit guard).
- Research: [reports/researcher-domain-invariants.md](./reports/researcher-domain-invariants.md) (Option A/B/C/D, field semantics, off-by-one hazard), [reports/researcher-concurrency-test-patterns.md](./reports/researcher-concurrency-test-patterns.md) (conditional-write guard, db.batch semantics, test harness, CI gates).
- Roadmap M1: docs/project-roadmap.md:26-45 (DOD :41-45).
- Tiền lệ kernel: plans/260818-1101-persist-class-centric-domain-kernel/phase-05-wave-4-schedule-persist.md (lesson status actions + red-team #9 lesson↔enrollment pairing), plans/260820-2048 (structured schedule PR #47).
- Chuẩn code: docs/code-standards.md:15,18 (contracts.ts owns request schemas; kernel.ts owns kernel mutations), :29-31 (POST JSON-only org-scoped; CSRF ở route layer).

## NOT in scope

- **POST /lessons one-off create endpoint** (tạo 1 buổi thủ công ngoài lịch): M1 DOD và roadmap diễn giải lesson creation là "từ lịch lớp" (roadmap :34); chưa có UI consumer đến khi #56. Deferred — tránh mặt operationId migration; revisit nếu pilot đòi buổi thủ công.
- **operationId idempotency cho lesson generation** (pattern comment-bank contracts.ts:140-146 + unique index migration 0006): generation đã atomic trong batch; POST /students vốn không idempotent (mỗi call = student mới). Không thêm cột/index. **Đã cân nhắc rủi ro mới (red-team S7/A6):** sau #55, double-submit/outcome-unknown retry nhân bản N lessons + package (không có endpoint dọn) — chấp nhận + ghi hand-off #56; đổi sang dedupe thuộc follow-up nếu pilot evidence đòi.
- **Backfill lessons cho enrollment staging cũ** (pre-#55): M1 DOD chỉ yêu cầu org mới trên staging (roadmap :41); chấp nhận gap với data staging hiện có.
- **Web UI wiring** (form edit lesson, nav tuần, schedule UI, sửa derive sessionsDone) → issue #56.
- **Dashboard "buổi hôm nay"** → issue #57.
- **Browser E2E** → issue #59.
- **Regeneration policy khi schedule lớp thay đổi**: class schedule immutable sau create (không có edit-class endpoint — kernel.ts chỉ có assign-syllabus :259-283 và notes :285-304) → không tồn tại bài toán regenerate ở M1.
- **Fix sessionsDone distinct-(day,time) collapse** (repos/classes.ts:28-46): pre-existing derive limitation, thuộc #56.

## Red Team Review

### Session — 2026-08-21
**Findings:** 22 raw (3 reviewer: Security Adversary, Assumption Destroyer, Failure Mode Analyst) → 12 consolidated sau dedup
**Severity breakdown:** 1 Critical, 5 High, 6 Medium — **12 accepted, 0 rejected** (mọi finding đều có file:line evidence; auto-apply theo chế độ autonomous pipeline, adjudicated bởi orchestrator)
**Verification:** Fact Checker + Contract Verifier (Standard tier) — 67/72 claim VERIFIED, 2 FAILED (internal inconsistencies — findings 5, 6), 3 UNVERIFIED (docs-based claims về D1 runtime — xử lý bằng note verification ở phase 3 + ship-stage smoke).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `sessionsTotal` không cap → poison class (enroll batch nổ, lớp chết vĩnh viễn — không có endpoint sửa lớp) [F1+A1] | Critical | Accept | Phase 1 (cap `.max(52)` + boundary test 53→400), plan.md Scope notes |
| 2 | Edit-vs-edit lost update: guard `status='upcoming'` không chống được 2 edit concurrent khác body (status không đổi sau edit — khác check-in) [F2] | High | Accept | Phase 2 (optimistic concurrency: old values pre-read vào WHERE → 409 "lesson changed"; test limitation ghi nhận) |
| 3 | `topic`/`zoom` không `.max()` — vi phạm precedent contracts.ts; mọi client-writable string đều phải cap [S1+F5] | High | Accept | Phase 1 (`topic` max 500, `zoom` max 2048) + Phase 2 boundary tests |
| 4 | `zoom` không validate scheme — inject link độc vào Zalo template cho phụ huynh (settings.tsx:23) [S3] | High | Accept | Phase 1 (refine "" hoặc https://) + Phase 2 tests (javascript:/not-a-url → 400) |
| 5 | sessionsDone distinct-(day,time) collapse KHÔNG phải "pre-existing" — plan kích hoạt defect (lesson.ts:11-13 chưa từng có create path); 12 buổi T3/T5 → mãi 2/12 [S2+A2] | High | Accept | plan.md (relabel "defect kích hoạt bởi plan" + quyết định domain), Phase 1 (pin test web làm red-target), Phase 3 (DOD row known-broken, KHÔNG tick), hand-off #56 |
| 6 | Divergence `package.total` (10) vs `class.sessionsTotal` (12) không có quyết định ghi lại — mismatch xảy ra ngay flow mặc định [A2+F4] | High | Accept | plan.md Scope notes (quyết định: 2 khái niệm độc lập — series vs entitlement) + Phase 1 pin test |
| 7 | Phase 3 evidence map trỏ test "org B generation" không tồn tại trong Phase 1 [S5+A4+F6] | Medium | Accept | Phase 1 B5 (thêm cross-org generation test) + Phase 3 evidence map trỏ đúng |
| 8 | "Verify staging ở phase 3" nhưng Phase 3 không có bước staging; claim atomic-D1 là docs-based [S6+F3] | Medium | Accept | Phase 1/3 (reword: verify D1 thật tại ship-stage beta deploy + smoke; remediation SQL runbook note) |
| 9 | Full-replace wipe topic/zoom khi client omit — footgun không được truyền đạt qua contract cho #56 [S4+F8] | Medium | Accept | Phase 1 (doc comment cảnh báo wipe) + Phase 3 hand-off (d) |
| 10 | Double-submit/outcome-unknown retry POST /students nhân bản N lessons, không có đường dọn [S7+A6] | Medium | Accept | Phase 1 risk table + Phase 3 hand-off (e); operationId vẫn deferred (scope) |
| 11 | Snapshot amplification: lessons ~0 → hàng nghìn row, GET /kernel không phân trang [S8] | Medium | Accept | Phase 1 risk table (ước tính + follow-up note); không sửa ở #55 |
| 12 | Legacy test thiếu assert enrollment/package vẫn tạo; thiếu multi-enrollment (group) test [A7+F7] | Medium | Accept | Phase 1 B4/B5 (assert enrollment+package mirror :740-748; 2 addStudent → 2×N rows enrollmentId phân biệt) |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-contracts-and-generation.md, phase-02-lesson-edit-endpoint.md, phase-03-regression-gates-and-dod-evidence.md
- Decision deltas checked: 12 (cap sessionsTotal 52; optimistic concurrency WHERE; topic/zoom caps + zoom https; relabel collapse→activated defect; package.total independence; cross-org/multi-enrollment/divergence/legacy asserts tests; staging verify → ship-stage; wipe warning; double-submit + snapshot amplification risks; evidence map fix; hand-off mở rộng)
- Reconciled stale references: 4 ("pre-existing limitation" ở plan.md + phase-3 note (a); "verify staging phase 3" ở phase-1 risk; evidence map org-scoped row; bước C/D numbering phase-01)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-08-21
**Trigger:** ak:vibe pipeline gate (sau red-team + consistency sweep; verification pass bỏ qua theo guard — `## Red Team Review` đã có evidence, 0 tag `[UNVERIFIED]`)
**Questions asked:** 6 (chế độ autonomous: recommended option được áp dụng kèm rationale — mọi decision point đều có evidence từ research/red-team/advisory)

#### Questions & Answers

1. **[Tradeoffs]** Generation timing: giữ Option B (sinh lesson lúc enroll) dù issue nói "khi tạo lớp"?
   - Options: Option B enroll-time (Recommended) | Option A nullable enrollmentId tại class-create
   - **Answer:** Option B
   - **Rationale:** Option A phá 3 tầng kernel đã verify (mapLessons/findLessonAction/invariant 6) + table-rebuild migration ~12+ file, mâu thuẫn chính ràng buộc "no big schema change" của issue. Advisory kongming: "không có cách thứ ba thỏa cả literal text lẫn kernel constraints".
2. **[Scope]** Có thêm one-off `POST /lessons` create endpoint kèm operationId migration 0008?
   - Options: Defer khỏi #55 (Recommended) | Include + migration additive
   - **Answer:** Defer
   - **Rationale:** M1 DOD và roadmap diễn giải lesson creation là "từ lịch lớp"; không có UI consumer đến #56; advisory kongming GO-defer. Ghi NOT in scope + điều kiện revisit (pilot evidence).
3. **[Architecture]** Giá trị cap `sessionsTotal`?
   - Options: 52 (Recommended — 1 buổi/tuần × 1 năm) | 100 | 24
   - **Answer:** 52
   - **Rationale:** Red-team Critical F1/A1: không cap → poison class chết vĩnh viễn. 52 đủ cho mọi khóa học thực tế (weekly 1 năm); boundary test 53 → 400.
4. **[Assumptions]** Quan hệ `class.sessionsTotal` vs `package.total`?
   - Options: Độc lập — series vs entitlement (Recommended) | Ràng buộc generation = min(sessionsTotal, total) | Default total = sessionsTotal khi có classId
   - **Answer:** Độc lập
   - **Rationale:** 2 khái niệm domain khác nhau (độ dài lịch khóa vs số buổi học viên mua); ràng buộc sẽ sai với lớp 36 buổi/gói 10 buổi (hợp lệ thực tế). Pin test wire behavior; hand-off #56 hiển thị đúng nghĩa.
5. **[Architecture]** Edit semantics: full-replace + optimistic concurrency hay partial-update?
   - Options: Full-replace + old-values WHERE (Recommended) | Partial-update (.optional + spread)
   - **Answer:** Full-replace + optimistic concurrency
   - **Rationale:** Full-replace theo kernel upsert convention (moduleUpsert/lessonUpsert), idempotent replay đơn giản; optimistic concurrency (red-team F2) đóng lỗ lost update giữa 2 edit concurrent. Wipe-warning vào doc comment + hand-off #56.
6. **[Risks]** Xác minh claim "db.batch atomic trên D1" ở đâu?
   - Options: Ship-stage beta deploy + smoke trên D1 thật (Recommended) | Thêm bước deploy staging vào phase 3
   - **Answer:** Ship-stage
   - **Rationale:** Phase 3 là gate-only local (red-team S6/F3); vibe pipeline --ship beta sẽ deploy staging — smoke tự nhiên nằm đó. Remediation SQL runbook đã note ở phase 3.

#### Confirmed Decisions
- Generation: Option B enroll-time — advisory-approved, ghi issue #55 trước khi implement
- One-off create: deferred — NOT in scope
- sessionsTotal cap 52 — contracts.ts
- package.total độc lập sessionsTotal — pin test
- Edit: full-replace + optimistic concurrency — mirror check-in guard parity
- D1 verify: ship-stage smoke + SQL runbook note

#### Action Items
- [x] Không còn action item mở — mọi quyết định đã propagate vào plan.md + phase files ở bước red-team apply

#### Impact on Phases
- Không thay đổi thêm (validation xác nhận trạng thái hiện tại của plan sau red-team; 0 contradiction ở sweep trước)

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03
- Decision deltas checked: 0 mới (validation không thay đổi file — chỉ ghi nhận quyết định đã có)
- Reconciled stale references: 0
- Unresolved contradictions: 0
