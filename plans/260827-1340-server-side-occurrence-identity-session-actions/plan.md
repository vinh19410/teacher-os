---
title: "Occurrence identity server-side + SessionActionsModal (per-occurrence edit & bulk actions)"
description: "Kế thừa issue #93 phần DEFERRED: thêm cột lesson.date làm occurrence identity thật ở server (schema + skeleton parity twin + backfill + generator rewrite gộp một đơn vị deploy), endpoint đột biến theo (classId, date), read-path v2 phía web với dual-path fallback, SessionActionsModal hoàn thành/hủy theo buổi + form per-occurrence edit (option 3 của requester), e2e + runbook."
status: pending
priority: P1
effort: "~7.5d"
issue: 98
predecessor-issue: 93
branch: develop
tags: [server, db, migration, kernel, web, class-detail, sessions, actions]
blockedBy: []
blocks: []
created: 2026-08-27
---

# Occurrence identity server-side + SessionActionsModal

## Overview

Plan kế thừa trực tiếp phần **DEFERRED** của issue #93 (Scope Decision 2026-08-27 — requester chọn option 3 "full per-occurrence edit"). Bài toán gốc: mỗi enrollment sinh ra chuỗi `sessionsTotal` row lesson thuần chu kỳ (`generateScheduleLessons`, apps/server/src/routes/kernel.ts:82-105) — **row không mang thông tin nào định danh buổi diễn ra thật** (UUID ngẫu nhiên, ngày được client tự dựng bằng heuristic từ lịch — comment class-sessions.ts:311-322). Hệ quả đã red-team trong plan cũ:

- Đổi chủ đề "buổi thứ 5" fan nhầm lên buổi 1 (`sessionTopic()` first-appearance, class-sessions.ts:256-269).
- Check-in/hủy dựa đoán sequential-head + min-UUID (`firstUpcomingLessonId` :333-342), hủy buổi tương lai không khả thi đúng nghĩa.
- Row dịch khỏi lịch (lesson-edit) ⇒ cả lớp rơi về bảng legacy (divergence guard :104-110).

Giải pháp này làm buổi học thành **thực thể có identity thật**: cột `lesson.date` (yyyy-mm-dd) persist ở server, mọi hàng cùng `(class_id, date)` là một occurrence; edit/check-in/hủy theo occurrence là MỘT statement atomic thay vì N×(POST+GET).

## Scope Challenge (Step 0)

- **Existing code:** guard chuyển trạng thái chỉ `upcoming→completed|cancelled` (kernel.ts:664-666); `/lessons/:id/edit` full-replace 5 trường upcoming-only conditional-write 409 (:704-749); transport client bỏ body lỗi (`HttpError`, repos/kernel.ts:214-216, kernel-load-state.ts:9-14); wire `KernelLessonRow` không có createdAt/anything định danh (contracts.ts:322-333); generation chỉ chạy tại POST /students (kernel.ts:367-402), **không có flow xóa enrollment/lesson nào** (grep toàn server — rowid đơn điệu mãi); invoice không tham chiếu lesson (contracts.ts:335-344).
- **Requested scope:** (1) identity server-side cho occurrence; (2) per-occurrence edit áp cả lớp; (3) `sessionTopic()` render theo identity; (4) đánh giá lại divergence guard; (5) SessionActionsModal consume identity (tư liệu phase-02/03 plan #93 giữ nguyên làm đầu vào); (6) migrate dữ liệu cũ; (7) contract pins song song server+web. Giao đủ 7 mục.
- **Complexity:** schema + 2 SQL migration + 1 backfill script + 1 shared pure lib + rewrite generator + 3 endpoint mới + mở rộng HttpError + dựng lại read-path client + 1 modal UI + e2e. Không đổi CSRF/auth (middleware `kernel.use("*")` :113-124 phủ route mới miễn phí).
- **Selected mode: HOLD SCOPE** (kongming checkpoint #1: **GO-WITH-CHANGES**, 8 thay đổi bắt buộc đã áp hết — xem Advisory Checkpoint).

## Advisory Checkpoint (kongming, 2026-08-27 — GO-WITH-CHANGES)

Cố vấn xác nhận hướng `lesson.date` làm identity (Q1 hợp lệ — precedent `lesson.topic`: persisted-khi-là-fact-mutable trong khi syllabus title chỉ derive render-only). Suy đoán bị bác occ-index-thay-date (không diễn tả được moveDate, không unique-groupable). Các phát hiện kiểm chứng trực tiếp khác biệt so với brief ban đầu:

1. Snapshot sort lesson là `asc(day, time, createdAt)` (snapshot.ts:137-141) chứ không thuần createdAt.
2. `createdAt` truncate millisecond (lesson.ts:36-38) → 26 row/batch **tie được** ⇒ ordering backfill phải `(created_at ASC, rowid ASC)`.
3. `parseStoredSchedule` dedup + sort days trước cycle (kernel.ts:48-61) — skeleton twin phải tái hiện đúng bước này.
4. UNIQUE index SQLite coi NULL phân biệt ⇒ plain unique `(class_id, enrollment_id, date)` chấp nhận vô hạn row date=NULL, không cần partial index.
5. Hai consumer thống kê sống: `done/remaining` (repos/students.ts:41-52) và `sessionsDone` (repos/classes.ts:32-45) thuần đếm row-completed ⇒ bulk theo occurrence giữ nguyên mỗi sid đếm 1:1.

### 8 thay đổi bắt buộc (đã áp vào phases)

| # | Thay đổi | Áp tại |
|---|----------|--------|
| K1 | Generator date-attach gộp cùng schema+backfill thành **một đơn vị deploy** (nhiều PR vẫn được) | Phase 1 |
| K2 | Backfill ordering `(created_at ASC, rowid ASC)`; quyết định NULL theo **từng class**; unique index tạo sau khi dữ liệu conform | Phase 1 |
| K3 | `/lessons/:id/edit` trở thành **occurrence-aware** khi row có date (apply nguyên bucket `(class_id, date)`); fallback vành đai khi bucket bất đồng `(day,time)` | Phase 2 |
| K4 | Gate phase web đọc = **pinned diff set**, không phải "zero visual diff" (fix mis-fan topic chính là diff có chủ đích) | Phase 3 |
| K5 | Endpoint chi tiết: `day` suy từ moveDate ở server; status-body `{}` chính xác; bucket trống → 404; 0 upcoming → 200 `{updated:0}`; edit yêu cầu ≥1 field; `:date`/`moveDate` validate bằng roundtrip-guard lịch thật (`parseStartDateStrict`, không regex-only); collision moveDate → 409 `{reason:"date-occupied"}`; thêm index thường `(class_id, date)`; org predicate + pairing pre-check như mọi write hiện hữu (RT7) | Phase 2 |
| K6 | Chuỗi contract đầy đủ một change set server+web: `KernelLessonRow.date` → projection snapshot → mapLessons → type Lesson → ClassSessionLesson | Phase 1–3 |
| K7 | `HttpError.reason` parse additive qua transport chung (test body-rác); skeleton twin đặt ở **packages/api** (packages/db là schema-only per ownership table); neo UTC-midnight như class-sessions.ts:27-28 | Phase 1–2 |
| K8 | Docs/supersession: docblock mới lesson.ts, carve-out code-standards ("derived-until-user-mutable"), supersession comment trên issue #93, mapping pin C1–C5 sang dạng giảm, runbook kèm verification SQL sau migrate | Phase 5 |

## Behavior Changes (sign-off bằng bước review plan)

> Là điều khoản kongming Q3: các thay đổi ngữ nghĩa sau được khai báo minh bạch tại đây; **reviewer duyệt plan trước cook chính là sign-off**.

1. **Topic mis-fan sửa thành công**: class đã từng sửa chủ đề sẽ hiển thị KHÁC trước-sau (đúng buổi ngay từ lần render đầu dùng date) — đây là mục tiêu của option 3, pinned test ở Phase 3.
2. **Hoàn thành/Hủy theo đúng ngày hiển thị**: trạng thái có thể "lệch tiến độ" theo đúng nghĩa thực tế (buổi sau completed còn buổi trước vẫn upcoming với một sid — trạng thái vốn biểu diễn được trong data từ trước, UI mới chỉ ngừng che giấu). Khái niệm behind-head + confirm "bù buổi trễ" (pin C2/C3 cũ) **bị xóa bỏ** vì target giờ là đúng hàng dated.
3. **Bulk check-in đánh dấu MỌI học viên của occurrence** (`completed`). Không có đường ghi `absent` tồn tại ở tầng server hiện tại (matrix kernel.ts:664-666) — điểm danh từng phần vẫn qua CTA per-sid (#91) giữ nguyên.
4. **Per-row edit legacy trở thành occurrence-aware CÓ POLICY** (RT3): row có date + đổi `day` khác weekday-bucket → **409 `use-occurrence-endpoint`** (chặn phá bất biến date↔weekday); đổi time/dur/topic/zoom → bucket-wide full-replace last-write-wins (không còn 409 conditional-guard cũ trên dated rows); row không date giữ nguyên mọi hành vi cũ.
5. **CTA check-in (#91) trỏ đúng row dated** của sid trong occurrence đang xem khi có date (trước: min-UUID tùy chọn trong bag).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `lesson.date` tồn tại, được ghi lúc generate, backfill khớp-heuristic-100% cho data cũ (parity tests chặn), divergent-rows ⇒ class NULL ⇒ fallback legacy như hôm nay | P1 |
| 2 | Endpoint occurrence `POST /api/classes/:id/sessions/:date/{edit,check-in,cancel}` atomic 1 statement + `{reason}` xuyên transport | P1 |
| 3 | Read-path v2: khi mọi row có date → group `(class_id, date)` chronology; còn lại fallback legacy đóng băng; `sessionTopic()` theo identity | P1 |
| 4 | SessionActionsModal: Hoàn thành/Hủy (bulk = 1 call), confirm liệt kê học viên + ngày; form per-occurrence edit (moveDate/time/dur/topic/zoom) | P1 |
| 5 | E2E hủy buổi tương lai + regression topic-on-occurrence-k; runbook + carve-out docs + supersession hai chiều với #93 | P2 |

## Non-goals (pinned)

- Không flow xóa học viên/enrollment, không hoàn tác completed/cancelled, không `reopen-lesson`.
- Không sửa class sau tạo (`schedule`/`startDate`/`sessionsTotal` coi như bất biến — nếu tương lai thêm class-edit, skeleton phải tính lại, ghi ràng buộc vào docblock).
- Không optimistic-concurrency field-guard 409 kiểu `/lessons/:id/edit` cho bulk edit (last-write-wins giữa 2 tab là conscious change ở quy mô này).
- Không đường ghi `absent`; không batch-cross-class; không phân trang/lazy skeleton.
- Không rename/di dời heuristic legacy path — nó đóng băng làm fallback-only.
- Trạng thái khác-buổi ("lệch tiến độ") không có nút sửa thứ tự — out-of-scope, remediation chỉ qua DB admin như Known Limitations #93.

## Phases

> Dependencies (frontmatter từng phase): 1←[] · 2←[1] · 3←[2] · 4←[3] · 5←[3,4]

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1: Skeleton twin + schema + backfill + generator](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Server endpoint occurrence mutations + {reason} transport](./phase-02-server-endpoints-occurrence-mutations.md) | Pending |
| 3 | [Phase 3: Web read-path v2 + contract chain](./phase-03-web-read-path-v2.md) | Pending |
| 4 | [Phase 4: SessionActionsModal + per-occurrence edit UI](./phase-04-session-actions-modal.md) | Pending |
| 5 | [Phase 5: E2E + runbook + docs carve-out + supersession](./phase-05-e2e-runbook-supersession.md) | Pending |

**Ràng buộc deploy tổng (K1):** Phase 1 là một release unit — migration + backfill idempotent + generator mới phải nằm cùng deploy để không có enrollment giữa-window rơi về legacy nhìn thấy được. **Gate thứ tự production:** backfill hoàn-all + verification queries PASS → tạo unique index → CHỈ SAO ĐÓ enable endpoint P2 trên production (moveDate là writer song song lên `date` — RT6/RT16). Phase 2–4 ship code-on-code an toàn theo gate đó.

## Red Team Review

### Session — 2026-08-27 (2 reviewer song song: Security Adversary + Failure Mode Analyst / Assumption Destroyer + Fact Checker)

**Findings:** 21 raw, dedup trùng-lặp 1 (slotIndex-overload) ⇒ **20 duy nhất: 1 Critical / 5 High / 7 Medium / 7 Low.** Anchor check: 36/41 citations khớp codebase thật, phần sai đã sửa ngay trong findings dưới đây (RT17). Disposition: **20 accepted, áp hết** vào phase files trước publish.

| # | Finding | Sev | Applied To |
|---|---------|-----|------------|
| RT1 | Parity/backfill tests đặt packages/api KHÔNG chạy dưới gates (api không có script/vitest; turbo bỏ qua workspace không-test) | Critical | P1: parity test chuyển `apps/server/src/skeleton-parity.test.ts` import `@teacher-os/api/skeleton` |
| RT2 | slotIndex-toàn-lớp phá prefix-math của sessionStatus/sessionStudents/sidStateAt/isSequentialHead ⇒ badge v2 sai (consumers schedule-table :152-153, attendance-modal :45,56) | High | P3 dual-mode tường minh cả 4 helper đọc trực tiếp row-bucket |
| RT3 | K3 mapping mơ hồ: day-change phá date↔weekday; topic="" full-replace xóa topic chéo-sid rộng hơn LWW declared | High | P2 policy chốt cứng: dated-row day-change → 409 use-occurrence-endpoint; trường hợp còn lại bucket-wide LWW |
| RT4 | conforms() không bắt day-within-schedule-shift (Tue→Fri cùng thuộc lịch) ⇒ multi-sid lệch count đâm thủng "1 row/sid by construction" | High | P1 conforms() thêm điều kiện count-vector == công thức generator |
| RT5 | `{updated, skipped}` vs "MỘT statement atomic" mâu thuẫn nội tại (skipped cần pre-read COUNT) | High | P2 reword "atomic UPDATE + advisory pre-read"; skipped=preCount−updated advisory-only |
| RT6 | R3 chain hở: pre-check 409 không chống race; window giữa P2-enable và bước cuối runbook cho dup `(enrollment,date)`; render/targeting khi dup chưa định nghĩa; thiếu heal SQL | High | plan R3 viết lại + P5 runbook gate-thứ-tự + heal SQL + client dedup deterministic id-sort |
| RT7 | Endpoint mới thiếu org_id predicate + pairing invariant như mọi write hiện hữu (:661-663, :763-764) | Med | P2 Requirements WHERE thêm orgId + pre-check pairing |
| RT8 | Transport wiring thiếu kernelCommand() mapper repos/kernel.ts ~:37 cho action types mới — dispatch snippet không chạy | Med | P4 Related Files + step dedicated |
| RT9 | strict-ISO pattern-only nhận lịch-không-tồn-tại (2026-02-30) ⇒ occurrence vô hình trên calendar | Med | P2 dùng parseStartDateStrict roundtrip cho :date & moveDate |
| RT10 | Effort tổng bất nhất (~5d vs tổng phases 7.5d) | Med | frontmatter chốt ~7.5d |
| RT11 | Tên migration tự chế lệch house convention (drizzle-kit generate quản meta/_journal.json) | Med | P1 dùng generate-flow; journal checklist ở P5 |
| RT12 | Regex pin not.toMatch(/session\.rows/) phủ cả class-schedule-table.tsx & session-attendance-modal.tsx — docblock rewrite nguy cơ tự bắn chân | Med | P3/P4 pin-file hygiene: literal chỉ trong class-sessions.ts |
| RT13 | CSRF coverage phụ thuộc trật tự đăng ký middleware, không có pin bảo vệ | Med | P2 contract test source-text ordering (`kernel.use("*"` trước mọi `kernel.post(`) |
| RT14 | Backfill medium tsx/không-precedent script đụng D1 remote | Med | P1 medium = offline SQL-generator từ dump JSON wrangler d1 execute --json |
| RT15 | skeletonOf ở packages/api lệch ownership docs (api = contract surface) | Low | P5 update ownership-table system-architecture.md |
| RT16 | Thiếu hard-order pin "backfill xong trước khi bật endpoint P2" | Low | gộp vào RT6 gate-thứ-tự |
| RT17 | Citation modalIndex :133-135 sai thật (:77 declare, :137 re-resolve) | Low | P4 sửa citation |
| RT18 | Fixture duplicate-days defensive-only unreachable-in-prod (server normalize :464-467 lúc tạo class) | Low | P1 ghi chú vai trò fixture rõ |
| RT19 | startDate-off-day label-shift BENIGN nhưng thiếu mirror-pin trong diff set K4 | Low | P3 thêm pin (d) |
| RT20 | Consumers "compile-level only" mâu thuẫn helper behavioral diffs | Low | P3 Non-functional reworded |

## Success Criteria

- [ ] Parity tests chạy dưới `pnpm test` (workspace server — RT1): output grouped-by-date == heuristic-legacy cho status/students/attendance trên toàn bộ fixture port từ class-sessions.test.ts (danh sách case đầy đủ trong phase-01); riêng topic pin hành vi MỚI.
- [ ] Data-migration vitest: backfill adversarial fixtures (gồm day-within-schedule-shift bị conforms chặn) + collision moveDate 409 rõ-ràng ở endpoint layer.
- [ ] Endpoint: guarded UPDATE `WHERE class_id AND org_id AND date AND status='upcoming'` + advisory pre-read; matrix 404/409/200 `{updated, skipped}` đúng bảng spec phase-02; `reason` parse có test body-rác.
- [ ] Read-path: class đủ-date đi v2 (group đúng chronology, CTA trỏ đúng dated row); 1 row NULL ⇒ nguyên class legacy y như hôm nay; pinned diff set (phase-03) xanh gồm BỐN mốc (chưa-edit giống hệt / đã-edit theo expectation mới / POST đúng row / startDate-off-day label-shift pinned).
- [ ] Modal: Hoàn thành date-gated VN, Hủy luôn available khi có target kể cả tương lai; confirm liệt kê tên; khóa modal khi chạy; MỘT toast summary; modal không import `useDirectKernelAction`/`dispatch` (thread callback như #91); form per-occurrence edit gọi đúng endpoint moveDate/time/dur/topic/zoom.
- [ ] E2E: hủy buổi tương lai persist reload; hoàn thành → badge flip; topic-occurrence-k hiển thị đúng row k.
- [ ] Gates `pnpm check` / `pnpm test` / `pnpm check-types` xanh từng phase (docs/code-standards.md).

## Known Limitations (declared)

- **Class divergent/legacy free-text giữ khoảng cách v2**: date=NULL theo class ⇒ tiếp tục bảng legacy thuần hiển thị (giống #89/#93), SessionActionsModal không lộ trên legacy. Heal chỉ bằng data-fix DB hoặc re-entry qua flow mới.
- **Trạng thái lệch tiến độ không có UI sửa** — xem Non-goals.
- **Backfill hai-file migration**: skeleton là logic walk nên không tô được trong 1 file SQL thuần; trình tự runbook = migrate(cột+index thường) → deploy worker mới → sinh SQL từ dump → áp backfill idempotent → verification queries PASS → tạo unique index → **enable endpoint P2 production**. Trong window display RƠI VỀ LEGACY (không hỏng, không sai số). Đây là chủ ý hoán đổi so với chữ "cùng 1 file" của kongming — bảo toàn tính healable + tránh unique-index-fail-vì-data-cửa-sổ; intent gốc (không có trạng thái thấy-sai môi giới) vẫn đạt.
- **Trùng `(enrollment, date)` có thể sinh trong window trước unique index** (RT6): client-side phòng thủ = bucket rows sort id asc + pick deterministic (row đầu upcoming per sid); heal SQL cung cấp sẵn trong runbook P5; unique index chặn permanent sau gate.
- **Mid-class enrollment vẫn "học như từ buổi 1"** về mặt hiển thị chiến dịch (kế thừa hành vi hôm nay — skeleton gán k-row của weekday-d vào k occurrence đầu của weekday-d bất kể join time). Not fixed here.
- **Bulk = every-student**: không absent (xem Behavior Change 3).
- ⚠️ **Chi phí v2 CTA/edit đường dẫn kép**: legacy path frozen-only — mọi refactor tương lai đụng class-sessions.ts phải giữ 2 chế độ; reviewer gate.

## Risk Assessment

**R1 (HIGH) — Backfill sai hơn heuristic hiện tại** ⇒ class nhìn thấy dữ liệu dịch chỗ.
Signal: đối chiếu screenshot/UAT trước-sau khác ngoài pinned diff set; parity fixture fail.
Response: parity tests bắt buộc trước merge P1 (case-list trong phase-01 step 3, gồm odd-total/quá-cap/multi-sid-lech/tie-created_at/startDate-off-day/duplicate-days); runbook query đếm NULL-before-backfill.

**R2 (HIGH) — Deploy seam tạo class NULL-mới sau migration** (pre-K1 detection).
Signal: enrollment tạo trong window date=NULL nhưng class từng fully-backed.
Response: K1 — generator + migration + backfill một deploy unit; client any-NULL-guard giữ đồng nhất hiển thị legacy trong window (an toàn mặc dù legacy-looking).

**R3 (HIGH) — Move race 2 tab**: hai tab move hai occurrence khác nhau về cùng đích `(enrollment, date)` khi chưa có unique index.
Signal: bucket một enrollment chứa 2 row cùng date.
Response: layer-1 endpoint pre-check 409 `date-occupied` (giảm xác suất, KHÔNG chống TOCTOU — thừa nhận trong RT6); layer-2 client dedup deterministic (id asc, pick-first-upcoming) giữ render/targeting ổn định nếu vẫn sinh trùng; layer-3 unique index tạo theo gate thứ-tự runbook (backfill → verify → index → P2-enable), kèm heal SQL trển. SQLite NULL-lenient nên index không kẹt legacy rows.

**R4 (MEDIUM) — Regex pins #91/#93 vỡ khi thêm nút "Điều chỉnh"/form trong cell Trạng thái**.
Signal: contract test kernel-runtime/class-detail-sessions-tab đỏ sau refactor JSX.
Response: giữ nguyên cả 2 nhánh "Điểm danh", Fragment wrap, label ≠ "Điểm danh"; cập nhật assertion cùng commit; negative-scoping của tab-src giữ nguyên kỹ thuật phase-01 #93.

**R5 (MEDIUM) — Doc-comment stale "never iterate session.rows in JSX"** (vẫn đúng cho slot-bag legacy nhưng SAI cho v2 rows 1-per-sid).
Signal: reviewer/Object/agent trích dòng cũ chặn implement modal.
Response: phase-03 bước cập nhật docblock dual-mode rõ ràng; sweeps toàn-plan check cụm "never iterate".

**R6 (LOW) — `sessionActionTargets` (tư liệu #93) du di nguyên bản gây targeting-paint-prefix chết khi đã có date**.
Signal: modal VẪN gọi firstUpcomingLessonId/min-UUID path trên class v2.
Response: phase-04 helper v2 phải lấy từng-row-dated-of-this-bucket; unit test assert KHÔNG min-UUID-sort chọn falsy; giữ function cũ chỉ serve legacy.

## Cross-Plan Supersession

- **Supersede tư liệu DEFERRED phase-02/03 của `plans/260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc`**: thiết kế SessionActionsModal tại đó được triển khai ở đây ở dạng GIẢM (K1–K8 + Behavior Changes). Pin C2 (behind-head paint) và C3 (confirm ngày đích behind-head) bị XÓA vì dated-identity làm chúng vô nghĩa; C1 thu thành `{updated}/{skipped}/{reason}` (atomic 1-call); C4 giữ (snapshot tên local, lock modal, một-toast, cấm reportDirectOutcome per-call); C5 giữ (entry theo có-target, date-gate chỉ disable nút Hoàn thành).
- Ghi chú 2 chiều khi ship PR đầu: comment trên issue #93 trỏ plan dir này; plan #93 giữ nguyên chữ đã declare "deferred → tư liệu plan server-side kế tiếp".
- Plan `260826-1611` phase-03 (inline-edit cũ) tiếp tục bị superseded bởi hệ mới (line-item của cùng phễu).

## Open Questions

None — mọi fork thiết kế đã chốt qua kongming checkpoint #1 (GO-WITH-CHANGES áp 8 items; Q3 sign-off cơ chế review-plan). 
