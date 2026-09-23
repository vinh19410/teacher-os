---
title: "Học viên gốc từ đăng ký portal: bỏ tạo thủ công ở admin/teacher"
description: "Xoá đường tạo học viên thủ công (POST /api/students + UI) và chuyển nguồn gốc student row sang đăng ký tự do trên student portal: bridge /api/student tự provision học viên ở lần đầu đăng nhập (email verified, org sớm nhất) kèm unique index lower(trim(student.email)); e2e chuyển sang seed DB."
status: pending
priority: P1
effort: 15h
issue: 257
branch: vinh19410/feat/students-from-portal-registration
tags: [feature, backend, api, database, auth, frontend]
blockedBy: []
blocks: []
created: 2026-09-23
---

# Học viên gốc từ đăng ký portal: bỏ tạo thủ công ở admin/teacher

## Overview

Hiện tại học viên chỉ tồn tại khi teacher tạo tay qua `POST /api/students` (`apps/server/src/routes/kernel.ts:531-588`) — nơi duy nhất ghi `student.email` (seam đăng nhập tương lai). Student portal đã merge (`0972f99`, PR #255: `apps/student` + bridge `apps/server/src/routes/student.ts`), nên plan này hoàn tất việc đảo chiều nguồn gốc dữ liệu: **teacher không còn tạo học viên thủ công**; student row tự sinh ở **lần đầu đăng nhập portal** — middleware bridge thấy 0 row khớp email + `emailVerified === true` → tự provision → resolve lại. UI admin/teacher mất nút/modal tạo học viên (modal ở lớp còn lại đúng 1 mode "Học viên có sẵn"), và toàn bộ test vốn tạo học viên qua UI/API chuyển sang seed DB trực tiếp.

## Scope Challenge (HOLD)

- Tồn tại sẵn: bridge `requireStudent` fail-closed đã merge (`student.ts:44-110`), enroll-existing picker + `POST /api/classes/:id/enroll` (không đụng), docblock `student.email` (`packages/db/src/schema/student.ts:18-21`).
- Scope yêu cầu (user chốt 2026-09-23): (1) học viên vào danh sách tự động từ đăng ký portal; (2) ~~blockedBy #254~~ — #254 ĐÃ merge nên plan này sửa trực tiếp code bridge; (3) xoá hẳn endpoint create, giữ rows legacy; (4) đăng ký chỉ capture name + email, phone/parent để rỗng.

## Decisions

| # | Quyết định | Nội dung |
|---|-----------|----------|
| D1 | Provision tại bridge portal, KHÔNG ở auth hook | Trong middleware `requireStudent` (`apps/server/src/routes/student.ts`): có session + email non-empty + `emailVerified === true` + **0 row** khớp `lower(trim(email))` → gọi `provisionStudentForUser(db, sessionUser)` → chạy resolve lại trong cùng request. Lý do (red-team): `databaseHooks.user.create.after` không phân biệt được teacher vs student (nút Google có ở `apps/web/src/routes/login.tsx:94` — teacher signup sẽ thành student row); đường email→Google-link đi qua `updateUser` không fire create-hook; helper nằm ở `apps/server` đủ deps (drizzle + libsql) không cần thêm vào packages/auth. |
| D2 | Org đích = org sớm nhất TOÀN CỤC | `SELECT id FROM organization ORDER BY created_at, id LIMIT 1` — heuristic RIÊNG của plan này, KHÔNG tương đương "first wins" của bootstrapMiddleware (đó là membership per-user, `app.ts:62-83`). Assumption: deployment = 1 trung tâm (teacher chính là user đầu tiên). Accepted-risk: junk signup trước teacher sẽ khiến provisioning vào org sai; deployment đa-org cần link-table teacher-approve (follow-up chung với non-goal của #255). |
| D3 | Legacy coexistence | Resolve email đã có đúng 1 row → link sẵn (không tạo); >1 row → giữ fail-closed `STUDENT_AMBIGUOUS` (không provision); 0 row → tạo mới `{name: user.name, email: lower(trim(user.email)), phone/zalo/parent: ""}`. |
| D4 | Xoá hẳn create path | Xoá `studentCreateSchema` (`packages/api/src/contracts.ts:9-18`), route `POST /students` (cả nhánh classId — `kernel.ts:531-588`), web command `add-student` + reducer case + UI (nút/modal tạo, mode "Tạo học viên mới", empty-state cũ). `GET /students`, `POST /classes/:id/enroll` (enroll-existing) giữ nguyên. Modal rename `AddStudentModal` → `EnrollStudentModal`. Server tests: helper `addStudent` (POST vào route bị xoá, `kernel.test.ts:285-305`; `addActiveStudent` :307-330 bọc nó + accept) rewrite thành direct-drizzle seed — mirror behavior hiện hành: classId → enrollment `invited`, KHÔNG sinh package/lessons (đã chuyển sang accept từ #253). |
| D5 | Unique expression index + deploy cùng nhau | Migration 0023 (0022 đã bị #253 lấy): dedupe non-destructive (blank email row trùng, giữ row `created_at, id` cũ nhất + normalize `lower(trim(email))`), rồi `CREATE UNIQUE INDEX student_email_uq ON student(lower(trim(email))) WHERE trim(email) != ''` (index trên BIỂU THỨC — khớp đúng luật tra cứu của bridge/provisioning; raw-index sẽ cho qua case-variant `"Anna@X.com"` vs `"anna@x.com"`). Phase 1+2 merge/deploy CÙNG NHÁNH — giữa 2 phase nếu tách rời, POST /students còn sống sẽ 500 cho email trùng. Không xoá row nào. |
| D6 | E2E seed DB trực tiếp, đúng org theo teacher | Helper `seedStudent()` mở `@libsql/client` vào `apps/e2e/local.db` (cùng file với boot shim) → resolve org từ **teacher đang đăng nhập của spec** (email user → membership → orgId; khớp cách `createStudentViaUi` cũ hoạt động org-scoped), fallback earliest org cho spec 1-teacher. Thay `createStudentViaUi` ở 12 spec files. Guard `org.rows.length === 0` + busy_timeout/retry. |
| D7 | Fail-open, tự retry mỗi request portal | Lỗi provisioning bị nuốt + log — signup/login KHÔNG bao giờ fail; user thấy màn hình `STUDENT_NOT_LINKED` hiện có; vì middleware chạy mỗi request `/api/student/*`, lần truy cập portal kế tự retry (idempotent theo email). Không có đường kẹt vĩnh viễn. |

## Non-goals

- Không dựng thêm UI portal mới (login/overview đã có từ #255); không thêm form thu SĐT — student row mới có phone/parentName rỗng, portal profile editing là follow-up.
- Email verification flow (cần infra gửi mail) — đồng bộ non-goal của #255: signup email/password chưa verify không được provision và không vào được portal.
- Không cho sửa phone/parentName của học viên tự đăng ký (không có edit UI từ trước).
- Không đụng enrollment lifecycle invited→accept (#253 — đã merge `9f98d6c`, PR #256; enroll-existing giờ tạo enrollment `invited`, Kích hoạt mới sinh package).
- Không chặn open sign-up; không dọn/xoá dữ liệu học viên legacy; không dựng link-table teacher-approve đa-org (follow-up).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [DB unique index + provisioning ở bridge portal](./phase-01-start.md) | Pending |
| 2 | [Xoá create path: contract, server, UI, server tests](./phase-02-remove-create-path.md) | Pending |
| 3 | [E2E seed DB + regression + docs](./phase-03-e2e-regression-docs.md) | Pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| Built-on (đã merge, plan này sửa tiếp `student.ts`) | `260923-0641-student-portal-app` — code ở commit `0972f99` (PR #255) | completed (code), plan metadata stale |
| Related (premise nguồn học viên) | `260922-0716-student-create-identity-fields` | completed |
| Related (enroll vào lớp sau khi có trong danh sách) | `260923-0550-enrollment-invite-accept-flow` — đã merge `9f98d6c` (PR #256) | completed |

## Success Criteria

- [ ] Học viên đăng ký portal bằng Google (emailVerified) → lần đầu mở portal, student row tự sinh vào org sớm nhất với name/email từ user, phone/parent rỗng; `/students` (web giáo viên) hiện học viên mới sau refresh snapshot.
- [ ] Teacher đăng ký Google trên web app → KHÔNG bao giờ sinh student row (không gọi `/api/student/*`); signup email/password chưa verify → không sinh row, không lỗi.
- [ ] Email trùng student row có sẵn → không tạo duplicate; >1 row trùng email → không tạo, bridge vẫn fail-closed `STUDENT_AMBIGUOUS`; provisioning lỗi transient → lần vào portal sau tự phục hồi.
- [ ] Migration 0023 dedupe không mất row học viên nào; expression unique index chặn cả case-variant (`Anna@X.com` vs `anna@x.com`).
- [ ] `POST /api/students` → 404; `studentCreateSchema` + command `add-student` + modal tạo học viên biến mất khỏi codebase; modal ở lớp chỉ còn picker "Học viên có sẵn"; `/students` không còn nút thêm, empty state ghi nguồn học viên mới.
- [ ] Rows học viên legacy giữ nguyên (id, email, enrollment, hóa đơn không đổi); server tests (kernel.test.ts, kernel-occurrence, lesson-date-integration) xanh với helper seed mới.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build` xanh; `pnpm --filter e2e e2e` xanh với helper seed mới.

## Reports

- [reports/scout-report-student-menu.md](./reports/scout-report-student-menu.md)

## Red Team Review

### Session — 2026-09-23
**Findings:** 23 thô → 12 cụm sau dedup (12 accepted: 11 Accept, 1 Accept-modified; 0 rejected sau evidence filter)
**Severity breakdown:** 4 Critical, 5 High, 3 Medium
**Reviewers:** Security Adversary + Failure Mode Analyst + Assumption Destroyer (3 reviewer song song, tier Standard)
**User decision từ findings:** chuyển provisioning từ auth-hook sang bridge portal (chốt 2026-09-23).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Hook `user.create.after` không phân biệt teacher/student → teacher Google signup thành student row trong org #1, PII dồn 1 tenant | Critical | Accept → D1 chuyển sang bridge | plan.md D1, Phase 1 |
| 2 | D7 cũ hứa "re-provision lần đăng nhập sau" sai — hook create chỉ fire 1 lần, lỗi transient = mất vĩnh viễn | High | Accept → middleware chạy mỗi request = retry tự nhiên | plan.md D7, Phase 1 |
| 3 | Email/password → link Google đi qua updateUser, create-hook không fire → không bao giờ provision | Critical | Accept → bridge provision sau khi emailVerified đã true | plan.md D1, Phase 1 |
| 4 | `seedStudent` vào earliest-org toàn cục sai org với 3 spec 2-teacher (class-operations:138,174; session-occurrence:80,91; student-package-validation:113,119) | Critical | Accept → resolve org theo teacher của spec | plan.md D6, Phase 3 |
| 5 | `addStudent` (kernel.test.ts:285-320) là API-helper POST vào route bị xoá, ~33 call sites, sót 2 file test server | Critical | Accept → rewrite direct-drizzle + liệt kê đủ 3 file | Phase 2 |
| 6 | Unique index raw-email cho qua case-variant → ambiguous vĩnh viễn; phase 1 deploy riêng → 500 cho email trùng | High | Accept → expression index + note deploy cùng nhau | plan.md D5, Phase 1, 2 |
| 7 | D2 claim "cùng heuristic bootstrapMiddleware" sai (per-user membership ≠ global earliest) + tenant-isolation chưa nói thẳng | High | Accept → viết lại trung thực + accepted-risk | plan.md D2 |
| 8 | Negative e2e assert qua UI là vô nghĩa (row ở org khác không bao giờ hiện) | High | Accept → assert DB count | Phase 3 |
| 9 | Số liệu sai: 13→12 spec files; "10 spec" thực liệt kê 9; kernel-command.test.ts là mục tiêu ma | Medium | Accept → sửa số + bỏ mục tiêu ma | Phase 2, 3 |
| 10 | Grep gate "0 hit" bất khả thi (use-classes.ts:4 comment, $classId.tsx:407 key, dist artifacts) | Medium | Accept → thêm 2 việc + scope gate source-only | Phase 2 |
| 11 | packages/auth thiếu drizzle-orm + @libsql/client cho helper/test | High | Accept → helper chuyển apps/server (hết cần) | plan.md D1, Phase 1 |
| 12 | Dedupe tie-break `id` UUID arbitrary khi trùng ms → silent binding | Medium | Accept (modified): giữ `created_at, id` deterministic + ghi nhận accepted (legacy dupes vốn fail-closed, không ai login được; cả 2 row vẫn hiện trong danh sách để đối soát) | Phase 1 |

Deploy sequencing (đã verify): D1 migrations apply forward-only trong deploy (`.github/workflows/deploy.yml:7`, alchemy.run.ts:60-62) — phase 1+2 trong cùng PR nên không có cửa sổ index-sống-route-còn.

### Verification Results (gộp 3 reviewer, tier Standard)
- Claims checked: ~89 (có trùng giữa reviewer) · Verified: ~66 · Failed: 18 (mỗi failed map vào 1 finding, đã xử lý) · Unverified: 4
- Unverified đã xử lý: (1) WAL cross-process — giữ kèm mitigation busy_timeout/retry trong D6; (2) Google trả `email_verified=true` trên deployment thật — không test được với dummy creds, cover bằng unit test trên helper; (3) số liệu duplicate email production — không kiểm chứng được, dedupe non-destructive là an toàn cả 2 chiều; (4) metadata `blockedBy: 254` stale — reviewer phát hiện #255 đã merge, planner tự xác nhận qua `git log` (commit `0972f99`) và đã sửa frontmatter.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-03 (sau khi áp 12 findings + quyết định bridge-provisioning).
- Decision deltas checked: 12 (bridge provisioning, retry-per-request, expression index, deploy-cùng-nhánh, seedStudent theo teacher org, addStudent rewrite, negative-spec DB assert, số liệu 12/9, grep gate scope, D2 viết lại, packages/auth không đổi, tie-break note).
- Reconciled stale references: Overview, Decisions D1-D7, Non-goals, Cross-Plan Dependencies (bỏ blockedBy), Success Criteria, toàn bộ 3 phase viết lại; đã xoá mọi đề cập đến `databaseHooks` và `packages/auth` change.
- Unresolved contradictions: 0.

## Validation Log

### Pre-draft decisions (interview) — 2026-09-23
1. Cơ chế vào danh sách: **tự động khi đăng ký** (org sớm nhất + unique index) → D2.
2. Phụ thuộc portal: ~~blockedBy #254~~ (đã moot — #255 merge trước khi plan hoàn thiện, phát hiện ở red-team).
3. Cleanup: **giữ rows cũ, xoá hẳn endpoint**, e2e seed DB → D4, D6.
4. Dữ liệu đăng ký: **name + email đủ v1** → Non-goals.

### Post-red-team decisions (interview) — 2026-09-23
5. Provisioning chuyển sang bridge portal (lần đầu đăng nhập portal thay vì lúc signup) → D1, D7.

### Refresh sau merge #253 (pre-commit) — 2026-09-23
6. Commit `9f98d6c` (PR #256, invite→accept flow) merge vào develop sau khi plan soạn xong → đã rà và cập nhật: migration mới nhất giờ là `0022_neat_quicksilver` (migration của plan đổi thành **0023**); line refs `kernel.ts` (POST /students 531-588, GET 524-529, enroll 592-650, contracts 9-18); helper test `addStudent` (285-305) mirror behavior mới (classId → enrollment `invited`, không sinh package/lessons); `addActiveStudent` (307-330, bọc helper + accept) không đụng; phase-3 spec without-class thêm bước Kích hoạt. Số spec `createStudentViaUi` giữ nguyên 12 + helpers (grep lại xác nhận).
