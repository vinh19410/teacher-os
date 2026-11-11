---
title: "fix(classes): đồng bộ chuyển đổi chế độ lớp manual/auto khi nhập hoặc gỡ giáo trình (#670)"
description: "Chuyển lớp manual (0 buổi thủ công) sang auto + sinh bù buổi cho học viên active khi nhập giáo trình, trả về manual (kèm reset gói học phí 0 buổi) khi gỡ giáo trình lúc chưa có buổi thật, khóa race song phương với thêm/xóa buổi thủ công và kích hoạt học viên, đồng bộ nguồn sự thật syllabus.classId + isManual trên Web và xóa dead code ClassSessionsManageModal."
status: completed
priority: P1
effort: "4h"
issue: 670
branch: fix/670-manual-class-curriculum-import
tags: [bugfix, backend, database, frontend, e2e]
blockedBy: []
blocks: []
created: 2026-11-11
---

# fix(classes): đồng bộ chuyển đổi chế độ lớp manual/auto khi nhập hoặc gỡ giáo trình (#670)

## Overview

Khi giáo viên tạo lớp trống (`templateId: ""`, `schedulingMode = "manual"`, `sessionsTotal = 0` theo #649 tại `apps/server/src/routes/kernel.ts:1685-1705`) rồi sau đó vào tab **Giáo trình** bấm **Nhập từ template**, route `POST /api/classes/:id/curriculum/import` (`apps/server/src/routes/syllabus.ts:282-343`) hiện chỉ tạo bản sao giáo trình và cập nhật `class.syllabus_id = copyId` mà giữ nguyên `schedulingMode = "manual"` và `sessionsTotal = 0`, đồng thời không sinh `lesson` hay cập nhật `session_package.total` cho các học viên đã `active` trong lớp.

Do Server (`isManualClass` tại `apps/server/src/lib/class-mode.ts:23`) coi lớp có giáo trình là `auto`, trong khi Web (`apps/web/src/components/class-detail/class-sessions-section.tsx:113-114` và `apps/web/src/lib/schedule-week.ts:206`) coi mọi lớp có `cls.schedulingMode === "manual"` là `manual`, lớp rơi vào trạng thái lưng chừng:
1. `PageHead` (`apps/web/src/routes/_auth/classes/$classId.tsx:248`) hiện lại nút **Sắp xếp buổi**, nhưng tab **Buổi học & luyện tập** rơi vào Empty State của lớp chưa có giáo trình với 0 buổi chiếu, `/schedule` không chiếu lịch tuần, và bấm thêm buổi thủ công bị Server chặn `409 class-has-syllabus`.
2. Ở chiều ngược lại (`POST /api/classes/:id/curriculum/remove` tại `apps/server/src/routes/syllabus.ts:345-405`), gỡ giáo trình trên lớp `auto` không trả lớp `0 lesson` về `manual`/`0 buổi`, còn lớp `auto` đã có `lesson` thật vừa gỡ giáo trình lại bị `PageHead` (`$classId.tsx:260`) và `ClassSessionsSection` (`:225`) hiển thị nút **+ Thêm buổi học** dẫn thẳng vào lỗi `409 not-manual-class`.
3. Nhánh `!sy` và prop `onOpenCurriculum` trong `ClassSessionsManageModal` (`apps/web/src/components/class-detail/class-sessions-manage-modal.tsx:24,44,71-80`) không còn đường vào từ UI kể từ #649.

Điều tra root cause (`/ak-debug`), tư vấn `kongming` Checkpoint 1 (GO) và phiên Red Team 3 chiều xác lập 6 nguyên tắc thiết kế:
1. **Tách helper sinh lịch dùng chung (`materializeScheduleForEnrollment`) từ `apps/server/src/routes/enrollment-activation.ts:366-691` với khóa nguyên tử hai chiều**:
   - Đọc tươi `cls` và `isManualClass` ngay bên trong vòng retry `for (let attempt = 1; attempt <= 3; attempt += 1)` sau CAS `UPDATE enrollment SET status = 'active'`.
   - Đặt **Statement 0** guard trên `enrollment.status` cho **cả `mode === "activate"` lẫn `mode === "backfill"`**: kiểm tra `enrollment.status = 'active'`, `NOT EXISTS (SELECT 1 FROM lesson WHERE enrollment_id = :eid AND org_id = :orgId)`, và `EXISTS (SELECT 1 FROM class WHERE id = :cid AND org_id = :orgId AND scheduling_mode = :expectedMode AND sessions_total = :expectedTotal)` kèm điều kiện khớp sự tồn tại của bản sao `syllabus(class_id = :cid, org_id = :orgId)` (chống TOCTOU với `curriculum/import`, `curriculum/remove`, và `POST`/`DELETE /sessions`).
   - Trên `Statement 1` (`mode === "backfill"`), upsert `sessionPackage` với guard cô lập `org_id` (`total: sql\`CASE WHEN ${sessionPackage.orgId} = ${orgId} THEN ${packageValues.total} ELSE NULL END\``, `setWhere: eq(sessionPackage.orgId, orgId)`) để không bao giờ rò rỉ sang dòng ngoại lai trên unique index toàn cục `session_package_enrollment_uq`.
   - Bổ sung `AND ${holidaySessionShift.orgId} = ${orgId}` và `AND ${holidaySessionCancel.orgId} = ${orgId}` vào hai subquery `SELECT count(*)` trên `lesson.status` (`enrollment-activation.ts:671`). Không hoist `loadClassShifts`/`loadClassCancels`/`existingClassLessons` ra ngoài vòng lặp nhiều học viên. Trong `catch`, xử lý hoàn tất idempotent cho cả `activate` (để `backfillStudyPackTargetsForStudent` luôn chạy đủ) lẫn `backfill` (dừng êm nếu lớp đã gỡ giáo trình về `manual` hoặc học viên đã được ghi buổi).
2. **Chuyển `manual → auto` nguyên tử + kiểm tra biên + tự hồi phục an toàn ở `POST /api/classes/:id/curriculum/import` (`apps/server/src/routes/syllabus.ts`)**:
   - Kiểm tra `const tpl = await findTemplate(db, body.data.templateId, ctx.orgId)` (`404 "syllabus not found"`) **trước** nhánh `existing` để không bao giờ trả `201` cho `templateId` ngoại lai/không tồn tại.
   - Ở nhánh `existing` (`findClassCurriculum` khác `null`): nếu lớp đang kẹt ở trạng thái tiền-#670 (`cls.schedulingMode === "manual" && cls.sessionsTotal === 0` với `0 class_session`, `0 lesson`) thì tự nâng cấp `schedulingMode = "auto"` + `sessionsTotal` theo số bài của `existing` (`1..52`); tiếp đó nếu lớp ở chế độ `auto` (`sessionsTotal > 0`), gọi `backfillStuckEnrollments` (`LEFT JOIN session_package ON enrollment_id = enrollment.id AND session_package.org_id = enrollment.orgId`, lọc `NOT EXISTS lesson AND (pkg.id IS NULL OR pkg.total = 0)`) — nếu vừa chữa lành thì trả `201 { id: existing.id }`, ngược lại trả `409 { error: "Lớp đã có giáo trình", code: "CURRICULUM_ALREADY_EXISTS" }`.
   - Kiểm tra `tree.modules.length + tree.lessons.length + tree.links.length > MAX_IMPORT_NODES` (`422 { error: "Template quá lớn để import", code: "CURRICULUM_TEMPLATE_TOO_LARGE" }`) đứng đầu để bảo toàn `kernel.test.ts:3007` và tính đủ `syllabus_lesson_material` (#655).
   - Nếu lớp đã có `class_session >= 1`: trả `409 { error: "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.", reason: "has-manual-sessions", code: "MANUAL_SESSIONS_EXIST" }`.
   - Nếu lớp chưa có dòng `lesson` thật (`!hasLesson`): chặn `422` khi `tree.lessons.length > 52` (`reason: "too-many-lessons"`, `code: "CURRICULUM_TOO_MANY_LESSONS"`) và chặn `422` khi `cls.schedulingMode === "manual" && cls.sessionsTotal === 0 && tree.lessons.length === 0` (`reason: "empty-template"`, `code: "CURRICULUM_EMPTY_TEMPLATE"`). Lớp vốn đã là `auto` có `cls.sessionsTotal > 0` nhập template `0` bài vẫn giữ nguyên `cls.sessionsTotal` (`kernel.test.ts:3677`).
   - Trong `buildImportBatch`, cập nhật `classTable` nguyên tử: `syllabusId = copyId`, `sessionsTotal = sql\`CASE WHEN EXISTS (SELECT 1 FROM lesson WHERE org_id = :orgId AND class_id = :classId) THEN sessions_total ELSE :candidateTotal END\``, và `schedulingMode = sql\`CASE WHEN EXISTS (SELECT 1 FROM class_session WHERE class_id = :classId AND org_id = :orgId) THEN NULL ELSE 'auto' END\``.
   - Trong `catch (err)`: kiểm tra `after = await findClassCurriculum(...)` — nếu `after?.id === copyId` (batch đã commit nhưng mất ACK mạng) thì tiếp tục chạy backfill và trả `201 { id: copyId }`; nếu `!isRollbackableConstraintError(err)` thì rethrow `500`; nếu `/FOREIGN KEY/i` trên `tree.links` thì kiểm tra `findExistingMaterialIds` trả `422 material-not-found`; phân loại `after` / `foreign` cùng cấu trúc `409 CURRICULUM_ALREADY_EXISTS` (không lộ oracle cross-org) và `hasClassSession` trả `409 has-manual-sessions`. Sau khi batch commit, luôn gọi `backfillStuckEnrollments` khi `effectiveSessionsTotal > 0` (bỏ điều kiện `&& !hasLesson` để cứu cả học viên còn kẹt sau chu kỳ gỡ-rồi-nhập-lại).
3. **Đồng bộ nguồn sự thật `syllabus.classId` và khóa race cả hai route thêm/xóa buổi thủ công (`apps/server/src/lib/class-mode.ts`, `apps/server/src/routes/kernel.ts`)**:
   - Trong `isManualClass` (`class-mode.ts`) và pre-check của `POST /classes/:id/sessions` (`kernel.ts:2424`) + `DELETE /classes/:id/sessions/:date` (`kernel.ts:2641`), kiểm tra giáo trình lớp qua `findClassCurriculum(db, classId, orgId)` (nguồn sự thật #394, không bị chặn nhầm bởi con trỏ template mồ côi).
   - Chuyển `syllabus` sang value import và import `findClassCurriculum` trong `kernel.ts`; đặt SQL guard `EXISTS (SELECT 1 FROM syllabus WHERE class_id = :classId AND org_id = :orgId)` trên `classTable.schedulingMode` cho **cả `POST /classes/:id/sessions` lẫn `DELETE /classes/:id/sessions/:date`**, phân loại rollback khi có bản sao giáo trình thành `409 class-has-syllabus` trước `date-occupied`.
4. **Đối xứng chiều `POST /api/classes/:id/curriculum/remove` kèm đồng bộ `session_package.total` (`apps/server/src/routes/syllabus.ts:345-405`)**:
   - Khi `copy` tồn tại, trong cùng batch xóa giáo trình: đặt `syllabusId = null`, đồng thời qua biểu thức SQL `CASE WHEN EXISTS (SELECT 1 FROM lesson ...) OR EXISTS (SELECT 1 FROM class_session ...) THEN ... ELSE 'manual' / 0 END` đưa `class.schedulingMode = "manual"`, `class.sessionsTotal = 0`, **và `session_package.total = 0`** cho các enrollment thuộc `(ctx.orgId, classId)` khi lớp chưa có buổi học nào (tránh để `session_package.total` kẹt ở `K > 0` trên lớp có lịch legacy không parse được). Nhánh `!copy` giữ nguyên idempotent.
5. **Đồng bộ `isManual`, nguồn sự thật `splitSyllabi`, allowlist lỗi `ImportSyllabusModal`, trạng thái đóng modal và dọn dead code trên Web (`apps/web`)**:
   - `ClassSessionsSection` (`class-sessions-section.tsx:113,120,225`): `isManual = (classSessions?.length ?? 0) > 0 || (!syllabus && cls.schedulingMode === "manual")`; suy ra `effectiveSessionsTotal` từ số bài của `syllabus` khi `!isManual && cls.sessionsTotal === 0 && syllabus`; nút `+ Thêm buổi` chỉ hiện khi `!syllabus && (isManual || lessons.length === 0) && onAddSession`.
   - `$classId.tsx` (`:160,188,248,360,466`): dùng chung `classLessonsForClass` và `classSessionsForClass`; `PageHead` hiện **Sắp xếp buổi** khi `Boolean(sy)`, hiện **+ Thêm buổi học** khi `canAddManualSession` (`!sy && (isManual || classLessonsForClass.length === 0)`), ẩn cả hai khi `!sy && !isManual && classLessonsForClass.length > 0`; đóng sạch `manageOpen` / `addSessionOpen` khi điều kiện hiển thị tương ứng đổi sang `false`.
   - `schedule-week.ts` (`:195,281`) + `schedule-day.ts` (`:119`) + `schedule-month.ts` (`:237`): truyền `data.syllabi` xuống `selectProjectedWeekBlocks` để tra giáo trình lớp qua `splitSyllabi` (`syllabus.classId === cls.id`, fallback `Boolean(cls.syllabusId)` khi unit test cũ không truyền `syllabi`) và dùng `effectiveSessionsTotal` từ bản sao giáo trình khi `cls.sessionsTotal === 0`.
   - `ImportSyllabusModal` (`import-syllabus-modal.tsx`): do `useKernelFormSubmit` (`use-kernel-form-submit.ts:77-80`) gọi `lockFailureMessage` (`:18-30`) ghi đè `error` bằng câu chung, ánh xạ theo **allowlist `failureError?.code`** (`MANUAL_SESSIONS_EXIST`, `CURRICULUM_TOO_MANY_LESSONS`, `CURRICULUM_EMPTY_TEMPLATE`, `CURRICULUM_TEMPLATE_TOO_LARGE`, `CURRICULUM_ALREADY_EXISTS`, `CURRICULUM_MATERIAL_NOT_FOUND`) sang thông báo tiếng Việt chuẩn; khi mở lại modal chỉ gọi `setError(undefined)` (không gọi `reset()` để không xóa `notice` / `submitBlocked` theo mẫu `add-class-session-modal.tsx:115`).
   - `ClassSessionsManageModal` (`class-sessions-manage-modal.tsx`): xóa prop `onOpenCurriculum` và nhánh `!sy`, đặt `if (!sy) return null;` sau các hooks.
6. **Cập nhật E2E, tài liệu, ảnh `design:compare` (`t-class-detail,t-attendance`) & ảnh POT**: Mở rộng Test B của `syllabus-class-curriculum.spec.ts` với locator `StatCard` neo theo nhãn, cập nhật `DESIGN.md:150-152`, `CHANGELOG.md`, `verdict.md:228`, chạy `pnpm design:compare --screens t-class-detail,t-attendance --side both --label new --force`, và chụp bộ ảnh POT 3 viewport × light/dark lưu tại `plans/reports/670-*.png`.

Plan này tuân thủ hợp đồng bàn giao `--advice` và quy trình `--tdd`: mọi phase đều phân rã thành các task độc lập có điều kiện kiểm chứng cơ học và nhúng nguyên văn khối `## Failure Protocol`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope**:
  - `apps/server/src/routes/enrollment-activation.ts`, `apps/server/src/routes/syllabus.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/lib/class-mode.ts`.
  - `apps/web/src/components/class-detail/class-sessions-section.tsx`, `apps/web/src/routes/_auth/classes/$classId.tsx`, `apps/web/src/lib/schedule-week.ts`, `apps/web/src/lib/schedule-day.ts`, `apps/web/src/lib/schedule-month.ts`, `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`, `apps/web/src/components/modals/import-syllabus-modal.tsx`.
  - Tests: `apps/server/src/manual-sessions.test.ts`, `apps/web/src/components/modals/import-syllabus-modal.test.tsx`, `apps/web/src/routes/_auth/classes/$classId.test.tsx`, `apps/web/src/lib/schedule-week.test.ts`, `apps/e2e/specs/syllabus-class-curriculum.spec.ts`.
  - Docs, visual baseline & POT artifacts: `DESIGN.md`, `CHANGELOG.md`, `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`, `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/*.png`, `plans/261020-1446-378-redesign-design-v2/screenshots/t-attendance/*.png`, `plans/reports/670-*.png`.
- **Explicit Non-Goals**:
  - Không hỗ trợ chế độ lai `manual + có syllabus`.
  - Không tự động xóa các dòng `class_session` đã tạo khi nhập giáo trình.
  - Không sinh lại, thêm hoặc cắt bớt các dòng `lesson` đã tồn tại khi lớp đang dạy dở gỡ/gắn lại giáo trình hoặc sửa bài trong `ClassSessionsManageModal`.
  - Không tạo migration schema DB mới; không đổi chính sách phân quyền RBAC `ctx.role` hiện hành của toàn bộ nhóm route syllabus/class; không thay đổi hành vi `parseErrorOptions` dùng chung trong `apps/web/src/lib/repos/kernel.ts`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Đồng bộ vòng đời `manual ↔ auto` nguyên tử trên Server (`curriculum/import`, `curriculum/remove`, `isManualClass`, race guard `POST`/`DELETE /classes/:id/sessions`) và sinh bù lịch học + gói buổi cho học viên `active` (TDD) | P1 |
| 2 | Đồng bộ công thức `isManual`, nguồn sự thật `splitSyllabi`, điều kiện hiển thị nút hành động, allowlist lỗi tiếng Việt của `ImportSyllabusModal` và dọn sạch dead code `ClassSessionsManageModal` trên Web (TDD) | P1 |
| 3 | Khóa bằng E2E (`syllabus-class-curriculum.spec.ts` + hồi quy), cập nhật `DESIGN.md` + `CHANGELOG.md` + `verdict.md` + ảnh `design:compare` (`t-class-detail,t-attendance`) + ảnh POT, và vượt qua toàn bộ cổng chất lượng | P1 |

## Phases

| # | Phase | Status |
|---|------|--------|
| 1 | [Phase 1: Server — Helper sinh lịch, chuyển đổi manual/auto & khóa race (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Web — Đồng bộ isManual, nút hành động, lỗi modal & dọn dead code (TDD)](./phase-02-web-ui-and-dead-code.md) | Pending |
| 3 | [Phase 3: E2E, cập nhật DESIGN.md / CHANGELOG.md, design:compare, POT & cổng kiểm tra](./phase-03-e2e-docs-and-gates.md) | Pending |

## Success Criteria

- [ ] `pnpm --filter server test` và `pnpm --filter server check-types` exit 0, bao phủ đủ 6 nhóm kịch bản #670 trong `apps/server/src/manual-sessions.test.ts` (chuyển `manual → auto` cập nhật `sessionsTotal`; backfill học viên `active` kèm kỳ nghỉ lễ tương lai và cập nhật `session_package.total`; tự hồi phục backfill dở dang kể cả sau chu kỳ gỡ-rồi-nhập-lại và trả `409` ở lần tiếp theo, nhưng trả `404` cho `templateId` lạ; chặn `409 has-manual-sessions` kể cả đua `Promise.all` song phương với `POST`/`DELETE /classes/:id/sessions`; biên `422` cho template `0` bài và `> 52` bài mà vẫn giữ `"Template quá lớn để import"` cho `> 500` node; `curriculum/remove` trả về `manual`/`0` buổi kèm reset `session_package.total = 0` khi `0 lesson` và giữ nguyên `auto` khi đã có `lesson`).
- [ ] `pnpm --filter web test` và `pnpm --filter web check-types` exit 0, bao phủ công thức `isManual` (kể cả fallback `effectiveSessionsTotal` khi `sessionsTotal = 0`), ẩn nút `+ Thêm buổi học` / `+ Thêm buổi` trên lớp `auto` đã có `lesson` thật vừa gỡ giáo trình, đóng sạch state modal khi `sy` đổi trạng thái, chiếu lịch tuần ở `selectProjectedWeekBlocks` theo `splitSyllabi`, hiển thị thông báo tiếng Việt qua allowlist `code` trong `ImportSyllabusModal` mà không xóa `notice` khi mở lại modal, và `! grep -rnE "Gắn giáo trình cho lớp để sắp xếp buổi|onOpenCurriculum" apps/web/src` exit 0.
- [ ] E2E (`syllabus-class-curriculum.spec.ts`, `projected-sessions.spec.ts`, `class-sessions-manage-modal.spec.ts`), `pnpm design:compare --screens t-class-detail,t-attendance --side both --label new --force`, chụp ảnh POT `plans/reports/670-*.png`, `pnpm exec biome check .`, và `pnpm check-types` đều exit 0; `DESIGN.md`, `CHANGELOG.md`, và `verdict.md` được cập nhật đồng bộ.

## Advisory Log

- **Checkpoint 1 (sau điều tra `/ak-debug`)**: `kongming` (`KongmingInvestigate670`) **GO** — xác nhận root cause và cả 3 bẫy Trap A (race `POST /sessions`), Trap B (intra-batch visibility trên `lesson`), Trap C (`useKernelFormSubmit` / `parseErrorOptions`); chỉ ra thêm Trap D (`if (!sy) return null;` trong `ClassSessionsManageModal` khi `open={false}`) và Trap E (`t-class-detail` trong `design:compare` có thay đổi hình ảnh thật do `fixture.classId` là lớp `auto` 10 `lesson` không gắn giáo trình).
- **Checkpoint 2 (sau cổng `/ak-plan validate` + `red-team` + consistency sweep)**: `kongming` (`KongmingPlanGate670` + đánh thức `KongmingInvestigate670`) trả lỗi hạ tầng `Cursor USAGE_PRICING_REQUIRED` (Opus 5.5 hết hạn mức tuần). Ghi nhận non-fatal advisory miss theo đúng `advisory-supervision.md`; các cổng chính thức đều đã đạt (`ak plan validate` valid, Fact-Check 36/36 + Contract Verifier 7/7, Red Team 3 reviewer với 12 accepted / 1 rejected out-of-scope, Whole-Plan Consistency Sweep `0` mâu thuẫn).

## Validation Log

### Verification Results — 2026-11-11
- **Tier:** Standard (3 phases — Fact Checker + Contract Verifier)
- **Claims checked:** 36 Fact-Check claims + 7 Contract-Verifier surfaces
- **Verified:** 33 | **Failed:** 3 (đã sửa triệt để trong bản cập nhật bên dưới) | **Unverified:** 0
- **Resolved claims:**
  1. `apps/server/src/routes/kernel.ts:69-73` import `syllabus` dạng `import type` → đã ghi tường minh bước chuyển `syllabus` sang value import trong `phase-01-start.md` Task 1.3 Step 2.
  2. `apps/server/src/routes/kernel.ts:113-119` chưa import `findClassCurriculum` → đã ghi tường minh bước import `findClassCurriculum` từ `../lib/syllabus-curriculum` trong `phase-01-start.md` Task 1.3 Step 2.
  3. `apps/web/src/lib/use-kernel-form-submit.ts:18-30` vs `:77-80` → đã sửa trích dẫn rõ `lockFailureMessage` (`:18-30`) được gọi tại `setError(lockFailureMessage(result.error))` (`:77-80`).
- **Key decisions confirmed (từ Confirmed Reframing `#issuecomment-6786344865` + Kongming Checkpoint 1):**
  1. Chuyển `manual → auto` nguyên tử khi lớp `0 class_session` nhập giáo trình, chặn `409 has-manual-sessions` khi `class_session >= 1`, chặn `422` cho template `> 52` bài hoặc `0` bài trên lớp `manual` (`sessionsTotal = 0`).
  2. Tách helper dùng chung từ `enrollment-activation.ts` để backfill tuần tự per-enrollment (tôn trọng trần batch D1), tự hồi phục idempotent, và đối xứng chiều `curriculum/remove`.
  3. Dọn sạch dead code `!sy` / `onOpenCurriculum` trong `ClassSessionsManageModal` và cập nhật bộ ảnh đối chiếu `design:compare` + POT.

### Whole-Plan Consistency Sweep (Validation)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-web-ui-and-dead-code.md`, `phase-03-e2e-docs-and-gates.md`
- Decision deltas checked: 3
- Reconciled stale references: 3
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-11 (3 reviewers: Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Findings:** 24 thô → 13 sau gộp trùng (12 accepted, 1 rejected do ngoài phạm vi hợp đồng)
**Severity breakdown:** 4 Critical, 4 High, 4 Medium (accepted) + 1 High (rejected)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Thiếu cô lập `org_id` trên `LEFT JOIN session_package` và `ON CONFLICT(enrollment_id) DO UPDATE`, đồng thời `removeCurriculumHandler` quên reset `session_package.total = 0` khi lớp có lịch legacy 0 `lesson` (S1+A3) | Critical | Accept | `plan.md`, Phase 1 Task 1.1, 1.2 & 1.3 |
| 2 | TOCTOU giữa `activateEnrollment` (`mode: "activate"`), `backfillStuckEnrollments` và `curriculum/remove` + thiếu `org_id` trên 2 subquery đếm shift/cancel (S3+S4+S5+F2+A1) | Critical | Accept | `plan.md`, Phase 1 Task 1.2 (đọc `cls` trong retry loop, Statement 0 guard cho cả 2 mode kiểm tra cả `classTable`, idempotent `catch`) |
| 3 | Bỏ sót SQL guard trên `DELETE /api/classes/:id/sessions/:date`, tính `nextSessionsTotal` ngoài SQL, và thiếu value import `syllabus` + `findClassCurriculum` trong `kernel.ts` (F3+A2+S8) | Critical | Accept | `plan.md`, Phase 1 Task 1.1 & 1.3 (`CASE WHEN EXISTS lesson`, khóa cả `POST` và `DELETE /sessions`, cập nhật import `kernel.ts`) |
| 4 | Nhánh tự hồi phục chạy trước `findTemplate` (`404`), điều kiện `&& !hasLesson` bỏ rơi học viên kẹt sau chu kỳ gỡ-rồi-nhập-lại, và chưa nâng cấp lớp kẹt tiền-#670 (`manual` + `sessionsTotal = 0` + có copy) (F1+F5+F8) | Critical | Accept | `plan.md`, Phase 1 Task 1.1 & 1.3 (đưa `findTemplate` lên trước `existing`, tự nâng cấp lớp kẹt tiền-#670, bỏ `&& !hasLesson`) |
| 5 | `MAX_IMPORT_NODES` bỏ sót `tree.links.length` (#655) và `catch` của `importCurriculumHandler` biến lỗi mất ACK thành `409` giả + biến lỗi FK tài liệu thành `500` (S7+F4) | High | Accept | `plan.md`, Phase 1 Task 1.3 (`+ tree.links.length`, kiểm tra `after?.id === copyId`, `isRollbackableConstraintError`, `/FOREIGN KEY/i` → `422 material-not-found`) |
| 6 | `Test 670-2` hướng dẫn tạo kỳ nghỉ lễ trước khi có lớp và chưa neo `startDate` vào thứ Hai tương lai theo `vietnamTodayISO()` (A4) | High | Accept | Phase 1 Task 1.1 (`startDate` thứ Hai tương lai `>= today + 7`, tạo lớp trước rồi insert `organizationHoliday` trực tiếp vào `t.libsql`) |
| 7 | `selectProjectedWeekBlocks` đọc con trỏ dẫn xuất `cls.syllabusId` thay vì nguồn sự thật `syllabus.classId` (`splitSyllabi`) và thiếu fallback `effectiveSessionsTotal` cho dữ liệu kẹt `sessionsTotal = 0` (S8+F5+A5) | High | Accept | `plan.md`, Phase 1 (`isManualClass` + `kernel.ts` dùng `findClassCurriculum`), Phase 2 Task 2.1 & 2.2 (`splitSyllabi` ở `schedule-week/day/month` + `effectiveSessionsTotal`) |
| 8 | Gọi `reset()` khi mở lại `ImportSyllabusModal` xóa mất `notice` (`submitBlocked`) và dùng denylist 1 chuỗi dễ lộ lỗi nội bộ / oracle cross-org (S6+F6) | High | Accept | `plan.md`, Phase 1 (`code` tường minh, đồng nhất `409`), Phase 2 Task 2.1 & 2.2 (allowlist `failureError?.code` + chỉ gọi `setError(undefined)` khi mở lại) |
| 9 | `if (!sy) return null;` trong `ClassSessionsManageModal` để lại zombie state `manageOpen = true` / `addSessionOpen = true` trên `$classId.tsx` (F7+A6) | Medium | Accept | `plan.md`, Phase 2 Task 2.1 & 2.2 (ràng buộc `open` và đồng bộ đóng state trong `$classId.tsx`) |
| 10 | Mô tả locator `StatCard` `"0/3"` và `"3"` trong E2E `syllabus-class-curriculum.spec.ts` dễ đụng strict-mode với badge số thứ tự buổi 3 (A7) | Medium | Accept | `plan.md`, Phase 3 Task 3.1 (scope locator theo thẻ `StatCard` chứa nhãn `"buổi đã học"` / `"bài trong syllabus"`) |
| 11 | Phase 3 thiếu bước chụp ảnh POT cụ thể và chưa cập nhật `t-attendance` + `verdict.md` cùng dùng `/classes/{seed.classId}` (A8) | Medium | Accept | `plan.md`, Phase 3 Files & Task 3.2 (`--screens t-class-detail,t-attendance`, cập nhật `verdict.md`, chụp POT `plans/reports/670-*.png`) |
| 12 | Trích dẫn nhầm dòng `use-kernel-form-submit.ts:18-30` cho lệnh `setError` ở `:77-80` trong `plan.md` (S8) | Medium | Accept | `plan.md` Overview |
| 13 | Thêm cổng RBAC `canPublishGrade(ctx.role)` (`403`) lên các route `syllabus.ts` và `POST`/`DELETE /classes/:id/sessions` (S2) | High | Reject | Ngoài phạm vi Issue #670 (hiện toàn bộ route tạo lớp, quản lý giáo trình và buổi thủ công không chặn `ta`; tự ý đổi chính sách phân quyền xuyên miền có nguy cơ phá luồng vận hành trợ giảng hiện có) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-web-ui-and-dead-code.md`, `phase-03-e2e-docs-and-gates.md`
- Decision deltas checked: 12 (`session_package` org-scoping + reset `0` on remove; retry-loop `cls` read + dual-mode Statement 0 guard + shift/cancel `orgId`; `DELETE /sessions` guard + `kernel.ts` runtime imports + SQL `sessionsTotal`; `findTemplate` before `existing` + heal pre-#670 stuck classes + drop `&& !hasLesson`; `tree.links.length` + `after.id === copyId` + FK `422`; future Monday + direct DB holiday in `Test 670-2`; `splitSyllabi` + `findClassCurriculum` + `effectiveSessionsTotal`; allowlist `failureError?.code` + `setError(undefined)` keeping `notice`; zombie modal state reset; scoped `StatCard` E2E locators; `t-attendance` + `verdict.md` + POT `670-*.png`; `use-kernel-form-submit.ts:77-80` citation)
- Reconciled stale references: 12 (đã xóa toàn bộ tham chiếu tới `reset()` khi mở lại `ImportSyllabusModal`, denylist `!== "class already has a curriculum"`, `!cls.syllabusId` đơn độc trong `schedule-week.ts`, và điều kiện `&& !hasLesson` ở bước gọi `backfillStuckEnrollments`)
- Unresolved contradictions: 0

<!-- slug: 670-manual-class-curriculum-import -->
