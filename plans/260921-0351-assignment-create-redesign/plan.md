---
title: "Trình dựng lại trang tạo bài tập theo thiết kế v5 — 4 kỹ năng IELTS + đáp án chấm tự động"
description: "Dựng lại /assignments/new theo assignment-create-5.html: 4 kỹ năng Writing/Reading/Listening/Speaking (preset 3 cấp), q-editor + đáp án chấm tự động, audio metadata, preview/success card mở rộng, migration 0019 + contract v2 cho assignment_prompt."
status: pending
priority: P1
effort: 20h
issue: 218
branch: vinh19410/issue-218-assignment-create-redesign
tags: [feature, frontend, backend, database, api]
created: 2026-09-21
---

# Trình dựng lại trang tạo bài tập theo thiết kế v5 — 4 kỹ năng IELTS + đáp án chấm tự động

## Overview

Trang `/assignments/new` hiện chỉ soạn đề Writing (task1/task2 + genre, contract 8 field). Thiết kế v5 (`assignment-create-5.html`) mở thành đủ 4 kỹ năng IELTS: mỗi kỹ năng có parts và question types (catalog preset 3 cấp), Reading/Listening có **q-editor + answer key** để chấm tự động, Listening có **metadata file nghe** + transcript, Speaking có cue card; preview phía học viên, card ngân hàng và success card đều mở rộng theo. Plan này thay model dữ liệu (`assignment_prompt` + migration 0019), contract wire v2 (`.strict()` + superRefine theo skill), snapshot/mapper, catalog preset client, trang tạo + 5 component, và các surface tiêu thụ (`bank.tsx`, `class-assignments-tab.tsx`, `bank-preview-aside.tsx`).

## Design Source

- Chuẩn: `assignment-create-5.html` — "Tạo đề · đáp án chấm tự động" (cập nhật 2026-09-21 10:40) trong project Open Design `f2f4d498-7ea3-403c-89e9-6ac3099ac79b`, đường dẫn đầy đủ: `~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/f2f4d498-7ea3-403c-89e9-6ac3099ac79b/assignment-create-5.html`. v5 ≡ v4 về nội dung, thay cho v1–v3.
- Spec hiển thị (copy verbatim + state machine + KIND map): [research/design-spec.md](./research/design-spec.md).

## Key Decisions

1. **Mở rộng `assignment_prompt` bằng migration 0019 additive, giữ cột legacy `task`/`genre`** — 10 cột mới: `skill`, `part`, `type`, `intro`, `passage`, `transcript`, `cue_topic`, `cue_points`, `audio_name`, `questions` (JSON text). Migration kèm UPDATE backfill `skill='writing', part=task, type=genre` (mọi row hiện tại là Writing; id part/type map 1:1 preset cũ). Không destructive migration.
2. **Cột legacy vẫn được ghi bởi server như giá trị phái sinh compat** (writing: `task=part`, `genre=type`; skill khác: `'task2'`/`''`) vì SQLite bỏ NOT NULL phải rebuild bảng — không đáng. Consumer nào cũng đọc `skill`/`part`/`type` mới.
3. **Contract v2 thay `task`/`genre` bằng `skill`/`part`/`type` + bộ trường tường minh full-field** (`prompt`, `passage`, `intro`, `transcript`, `cueTopic`, `cuePoints`, `audioName`, `questions[]`, giữ `title/band/source/note/status`) — luôn gửi đủ trường, chuỗi rỗng khi không áp dụng (precedent `reportCreateSchema` gửi `content` cả draft). `superRefine` theo skill mirror đúng `canSave` của design: **reading cần `passage` + ≥1 stem ở cả draft lẫn ready**; draft R/L chưa cần answer/audio; **ready** R/L cần mọi stem + answer; listening ready cần `audioName`; writing cần `prompt`; speaking p2 cần `cueTopic`, mọi part khác cần `prompt`. `part`/`type` phải thuộc tập id hợp lệ của skill (hằng số id export từ `packages/api/src/contracts.ts` làm nguồn duy nhất); với type có dạng đáp án choice, `answer` phải thuộc bộ lựa chọn của kind đó.
4. **`questions` lưu JSON text, `audioName` sentinel `""`** — snapshot parse JSON an toàn (try/catch → `[]`) đưa mảng object lên wire; `audioName` chuỗi rỗng = chưa đính (precedent `source`), không nullable.
5. **Phase 1 gộp cả DB + contract + server route + snapshot + server tests** (điều chỉnh so với gợi ý tách DB/contract riêng) vì route import trực tiếp schema và `db.insert(...).values(...)` type-buộc cột notNull legacy — tách riêng sẽ làm `pnpm check-types` đỏ giữa chừng. Theo đúng precedent phase 1 của #208.
6. **Catalog preset 3 cấp rewrite `assignment-presets.ts`** (SKILLS → parts với `qStart/spec/help/source` → types với template title/prompt/passage/intro/items/transcript/cue, port verbatim copy design; `KIND` map type→dạng đáp án). Giữ export compat (`TASK_PRESETS`, `taskOf`, `genreOf`) suy ra từ catalog mới cho tới phase 4 dọn consumer xong — mọi phase giữ compile xanh.
7. **Giữ useState + `useKernelFormSubmit`, không đưa react-form vào** (pattern mọi form của app). `new.tsx` orchestrates state; UI tách: rework `prompt-composer`, **mới** `question-key-editor`, extend `student-preview-paper` / `bank-context-card` / `create-success-card`; action bar state machine đúng thứ tự ưu tiên 6 bậc của design §5.
8. **Audio là metadata-only trong milestone này** — picker chỉ lấy tên file, "Dùng file mẫu Cambridge 10" set tên cứng; không upload/playback (chưa có hạ tầng R2/multipart, kernel JSON-only). Ghi Non-Goal.
9. **Bank card filter theo skill** (`Đề {Skill} đã có`), grade banner (X/Y đáp án) + key-scan chỉ hiện R/L; trang `/assignments/bank` đổi filter task→skill, `/classes` picker đổi theo — mọi consumer đọc `skill` mới.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Migration 0019 + contract v2 `.strict()`/superRefine + POST route + snapshot row mở rộng + server tests (201/400/401, org-scoped, ma trận theo skill) | P1 |
| 2 | Catalog preset 3 cấp (port verbatim design) + web data layer v2 (action payload, mapper, UI type) + unit tests | P1 |
| 3 | Trang `/assignments/new` đủ thiết kế v5: skill/part/type picker, fields theo skill, q-editor + answer key + key-scan, audio metadata + transcript, cue card, preview live không hiện đáp án, grade banner, bank card filter skill, action bar 6 bậc, success card meta mở rộng | P1 |
| 4 | Consumer: `/assignments/bank` filter skill + preview 4 kỹ năng, picker `/classes` filter skill; dọn compat exports | P1 |
| 5 | E2E: 2 test Writing hiện tại giữ xanh + Reading ready (khóa đáp án, sống qua reload, hiện ở bank) + Listening draft (chặn ready thiếu file/đáp án) | P1 |
| 6 | `pnpm check && pnpm check-types && pnpm test` xanh toàn repo | P1 |

## Non-Goals

- Không upload/playback file nghe thật (chỉ lưu tên file — metadata); hạ tầng R2/multipart là plan riêng.
- Không làm phía học viên (nộp bài, chạy chấm tự động runtime) — chỉ khóa đáp án để chấm sau.
- Không edit/delete đề đã lưu (thiết kế không có).
- Không đính kèm ảnh biểu đồ Task 1 (giữ nguyên note_help design).
- Không seed dữ liệu BANK mẫu của mock vào production.
- Không đụng bảng `assignment` (grading) hay luồng giao bài #208 ngoài filter chip.

## Assumptions

- `assignment-create-5.html` là bản chuẩn (mới nhất; v5 ≡ v4). Issue GitHub: **#218** (https://github.com/vinh19410/teacher-os/issues/218 — tạo 2026-09-21; #210–217 đã bị chiếm: PR 214 syllabus, PR 215 pilot, issue 216 nợ học phí, PR 217 feature flag, xác minh `gh issue list` + `gh pr list`). Branch `vinh19410/issue-218-assignment-create-redesign`.
- **Xung đột plan #213** (`plans/260921-0400-assignment-create-single-column-preview`, "ready to cook") cùng rewrite trang `/assignments/new` (bố cục một cột + trang xem trước làm bài của học viên). Thứ tự thực hiện do user quyết định ở Validation — mặc định: plan này (v5 hai cột) đi trước, #213 rebase lên kết quả.
- qStart theo part (R: 1/14/27, L: 1/11/21/31) và số câu hỏi chỉ là **hiển thị + resize danh sách** client-side; không lưu qStart.
- Words/minutes trong `spec` là display-only từ catalog, không lưu DB.
- "Dùng file mẫu Cambridge 10" set tên file cứng theo mock; không phát được — honest UI ghi rõ "Sẽ phát cho học viên khi được giao".
- **Deploy là breaking cutover cho POST** (schema `.strict()` đổi field): web cũ gửi payload v1 lên server v2 nhận 400 và ngược lại → **deploy server + web trong cùng một release, sát nhau**; không rollback server đơn chiều. Chiều đọc (snapshot thêm field) mới là additive. Phase 3 + phase 4 phải land trong cùng PR/release để tránh cửa sổ đề R/L/S bị consumer cũ xếp nhầm "Task 2/Biểu đồ".

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Kernel: schema 0019, contract v2 & POST API](./phase-01-kernel-schema-contract-api.md) | Pending |
| 2 | [Web data layer & catalog preset 3 cấp](./phase-02-web-data-layer-presets.md) | Pending |
| 3 | [Trang tạo đề 4 kỹ năng + components](./phase-03-create-page-components.md) | Pending |
| 4 | [Consumer surfaces: bank, class picker, preview](./phase-04-consumer-surfaces.md) | Pending |
| 5 | [E2E & verification sweep](./phase-05-e2e-verification.md) | Pending |

## Success Criteria

- [ ] Tạo được đề đủ 4 kỹ năng; Reading/Listening có answer key; listening draft lưu được không cần file, ready bị chặn client + server khi thiếu file hoặc thiếu đáp án
- [ ] Đề Reading ready lưu xong sống qua reload, hiện trong bank list với filter skill; org khác không thấy
- [ ] Preview phía học viên không bao giờ hiện đáp án/answer key; cue card + audio row + tags mới đúng design
- [ ] Success card đủ meta rows (Kỹ năng, Phần thi, Band, Chi tiết, Chấm điểm R/L, Nguồn, Trạng thái, Giao lớp)
- [ ] Migration 0019 apply sạch trên DB fresh (server test harness) và backfill đúng cho row Writing cũ
- [ ] `pnpm check && pnpm check-types && pnpm test` xanh; 4 spec E2E (2 cũ + 2 mới) xanh

## Verification Commands

```bash
pnpm --filter db db:generate
cd apps/server && npx vitest run
cd apps/web && npx vitest run
cd apps/e2e && npx playwright test assignment-prompt-create
pnpm check && pnpm check-types && pnpm test
```

## Dependencies

- Xây trên #202 (trang new + `assignment_prompt`) và #208 (bank list + class assign) đã merge. Không blocked-by plan nào đang mở.
- **Blocks `project:260921-0400-assignment-create-single-column-preview` (#213)**: plan #213 (một cột + preview học viên) cùng rewrite `/assignments/new` — user đã chốt thực hiện **plan này trước, #213 rebase lên kết quả** (Validation Q2); không cook #213 song song.

## Validation Log

### Session 1 — 2026-09-21 (sau red-team)

**Verification (Full tier):** kết quả gộp từ 3 reviewer red-team — xem `## Red Team Review → Verification Results`. Failed: 0 còn sót (9 failed ban đầu đã thành findings 1–15 và được áp hết vào plan files).

**Câu hỏi & quyết định (user):**

| # | Câu hỏi | Quyết định |
|---|---------|------------|
| Q1 | Dirty-flag khi đổi Dạng bài/Dạng đề: giữ nội dung đã sửa (app hiện tại) hay theo mock v5 (template đè)? | **Giữ nội dung đã sửa** — đổi skill reset toàn bộ (theo mock), đổi part/type giữ field dirty (deviation có chủ đích khỏi mock, ghi ở phase-02/03). |
| Q2 | Thứ tự với plan #213 (single-column-preview) cùng chạm `/assignments/new`? | **Plan này trước, #213 rebase sau** — đã ghi vào Dependencies (blocks). |
| Q3 | Xác nhận adjudicate red-team (14 Accept đã áp, 1 chuyển Q1)? | **Giữ nguyên các sửa đổi đã áp.** |

**Propagation:** Q1 → phase-02 (compositionDefaults + test), phase-03 (Key Insights + R3); Q2 → plan.md Dependencies + Assumptions; Q3 → không đổi thêm. Marker: `<!-- Updated: Validation Session 1 -->`.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-05, research/design-spec.md
- Decision deltas checked: 10 (issue 211→214→218 — số bị session song song chiếm lần lượt, 26→29 type, mock line refs, mcq4/mcq3→mcq/mcq1, deploy breaking cutover, dirty-flag preserve, whitelist id, parseQuestions spec, compat words/minutes, phase 3+4 cùng release)
- Reconciled stale references: 1 (phase-02 dòng mock `emptyItem` 675–680 → 743–749)
- Unresolved contradictions: 0 — `ak plan validate` [OK]

<!-- Updated: Validation Session 1 - dirty-flag preserve, #213 ordering, red-team confirmed -->


## Red Team Review

### Session — 2026-09-21
**Reviewers:** Security Adversary (Fact Checker) · Failure Mode Analyst (Flow Tracer) · Assumption Destroyer (Scope Auditor)
**Findings:** 16 raw → 15 sau dedup (14 accepted, 1 chuyển thành câu hỏi Validation)
**Severity breakdown:** 1 Critical, 7 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Contract v2 là wire break cứng cho POST — claim "additive/rollback an toàn" sai cả hai chiều deploy (`.strict()` từ chối payload v1/v2 chéo) | Critical | Accept | plan.md Assumptions, phase-01 R4 |
| 2 | Backfill UPDATE trong 0019 không được test — mọi harness migrate DB rỗng; precedent `comment-bank-existing-data-migration.test.ts` (applyThrough) bị bỏ qua | High | Accept | phase-01 bước 6 + file test mới |
| 3 | Append UPDATE tay thiếu separator `--> statement-breakpoint` → drizzle migrator gộp statement, migration chết mọi môi trường (precedent 0007 có marker) | High | Accept | phase-01 bước 2 |
| 4 | Catalog "26 type" sai (thực tế **29**); design-spec §2.3 ghi id `mcq4`/`mcq3` thay vì id thật của mock `mcq`/`mcq1` → port theo §2.3 làm MCQ render sai dạng đáp án | High | Accept | design-spec §2.3/§2.6, phase-02 |
| 5 | E2E assert preview không chứa "NOT GIVEN" tự mâu thuẫn — intro template tfng chứa nguyên văn "NOT GIVEN" (preview hiện intro theo §4) | High | Accept (modified) | phase-05 |
| 6 | `part`/`type` free-form + superRefine speaking bỏ nhánh part lạ → save được ready rỗng; helper catalog không fallback → row lỗi crash cả trang bank (`partOf(...).label` trên undefined) | High | Accept | phase-01 (whitelist id + default-require), phase-02 (fallback helpers) |
| 7 | Answer key không validate theo alphabet kind ở server (tfng nhận "BANANA") — dữ liệu chấm tự động là deliverable của milestone | High | Accept | phase-01 superRefine + test |
| 8 | Citation giả "#208 F3" cho reconcile row-check — pattern không tồn tại trong code; nguy cơ success card cho đề không tồn tại sau outcome-unknown | High | Accept (modified) | phase-03 |
| 8b | Phase 2 đổi action payload sang v2 nhưng `new.tsx` cũ vẫn gửi payload v1 inline → `pnpm check-types` đỏ cuối phase 2 | High | Accept | phase-02 (bước shim new.tsx) |
| 9 | `parseQuestions` chỉ try/catch — `JSON.parse('null')` không throw → `questions: null` xuyên qua type, `.length` nổ toàn kernel data; precedent `parseSkills` có `Array.isArray` | Medium | Accept | phase-01 bước 5 |
| 10 | Snapshot phình không bound tổng (mỗi GET /api/kernel trả toàn bộ đề, refetch sau mỗi write; ~200KB/đề × không edit/delete) | Medium | Accept (modified) | phase-01 Non-functional/R3 — ghi định lượng + trigger revisit, không tái cấu trúc milestone này |
| 11 | Citation dòng mock sai hệ thống (emptyItem 743, answerChoices 750, answersReady 766, applyDefaults 779, canSave 889 — plan ghi lệch 30–90 dòng); KD3 bỏ sót passage cho reading draft | Medium | Accept | plan.md KD3, phase-01/02/03/05 Context Links |
| 12 | Compat `TASK_PRESETS` thiếu `words`/`minutes` mà `bank-preview-aside` + `student-preview-paper` đang tiêu thụ ("Academic · 0 từ · 0 phút") | Medium | Accept | phase-02 compat block |
| 13 | Cửa sổ phase 3→4: đề R/L/S mới bị legacy-write `task='task2'` → bank/class picker xếp nhầm "Task 2/Biểu đồ" nếu deploy lệch phase | Medium | Accept | plan.md Assumptions + phase-04 |
| 14 | `class-assignments-tab` còn tiêu thụ task/genre ở dòng 320-322/363/385 (preview panel + meta card) + fixtures test — phase 4 thiếu spec các chỗ này | Medium | Accept | phase-04 |
| 15 | Issue #211 đã bị chiếm (xóa syllabus template); #213 "single-column-preview" cùng chạm /assignments/new | Medium | Accept | plan.md frontmatter/Assumptions + câu hỏi Validation |
| — | Ngữ nghĩa dirty-flag: mock reset dirty khi đổi skill/part/type (đè nội dung user), app hiện tại giữ field dirty — hai nguồn mâu thuẫn | High | Accept → chuyển câu hỏi Validation | phase-02/03 (đã chốt ở Validation Log Q1) |

**Evidence filter:** mọi finding trên có citation file:line từ codebase (xem báo cáo reviewer trong session log). Không finding nào bị reject vì thiếu evidence; 2 suggestion phụ bị gộp (union schema tạm → chọn cùng-release deploy; light projection snapshot → ghi risk định lượng vì preview bank cần full questions).

### Verification Results (Full tier — gộp từ 3 reviewer)
- Claims/flows kiểm tra: ~45 · Verified: 33 · Failed: 9 (toàn bộ thành findings 1–15) · Unverified: 3 (ngoài repo: artifact Open Design, trạng thái GitHub tại thời điểm planner — đã resolve: issue cuối là #218, lịch sử merge #202/#208)
- Đã xác minh an toàn: route kế thừa CSRF Origin + JSON content-type guard (`kernel.ts:132-142`, mount `:1991`); guard giao bài chặn status≠ready (`kernel.ts:706-708`) nên draft/không đáp án không giao được; command bus serialized + double-submit guard; không `dangerouslySetInnerHTML` trong render path web; compat-bridge bao phủ đủ 8 importer TASK_PRESETS/taskOf/genreOf.


<!-- slug: assignment-create-redesign -->
