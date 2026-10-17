---
title: "Student Vocab SRS Game — port logic Flinto (5 level, minigames, Learn/Review)"
description: "Port hệ thống game ôn tập từ vựng + spaced repetition của Flinto (5 memory level, interval [1,3,7,14,30], 5 minigames, vòng Learn/Review) vào teacher-os: engine pure TS + conformance vectors, schema D1 + API server, UI student học + teacher quản lý deck."
status: pending
priority: P1
effort: 40h
issue: 359
branch: develop
tags: [feature, frontend, backend, database, api]
blockedBy: []
blocks: []
created: 2026-10-18
---

# Student Vocab SRS Game — port logic Flinto

> GitHub issue: [#359](https://github.com/vinh19410/teacher-os/issues/359) (labels `ai-handle`, `ready to review`)

## Overview

Port trọn bộ logic game ôn tập từ vựng + SRS đã ship của **Flinto** (repo local `/Users/vinhtran/Documents/project/personal/flinto`, branch `dev` @ `b9ec13c`) vào **teacher-os** để học sinh học + ôn từ vựng do giáo viên tạo. Nguồn chân lý của mọi rule là `docs/srs-spec.md` của Flinto (400 dòng, v2 memory levels) — được cô đọng trong handoff [`plans/handoffs/game-review-logic-teacher-os-20261018-0225.md`](file:///Users/vinhtran/Documents/project/personal/flinto/plans/handoffs/game-review-logic-teacher-os-20261018-0225.md) (section "Tổng hợp logic"). Scoped theo 6 phases: (1) engine core + conformance vectors, (2) schema + migration + contracts, (3) server API, (4) session engines + minigame generator, (5) UI student, (6) UI teacher + e2e + verification.

Bối cảnh teacher-os: feature **hoàn toàn mới** — grep toàn repo không có vocabulary/SRS/deck/minigame nào (chỉ false positives `syllabus-import.ts:51`, test string). Evidence: [scout report](./reports/scout-report.md).

## Key Decisions

1. **Giữ nguyên toàn bộ rule + hằng số Flinto**: 5 level, `LEVEL_INTERVAL_DAYS = [1,3,7,14,30]`, warning = 1 ngày, requeue vị trí 4–5, evict sau 2 forgot, cờ `isWarning` chỉ ở L5, `choiceOptionCount = 4`, typing ≤ 30 code points. Nếu sau này đổi hằng số → **PHẢI regen vectors** bằng generator đã port, không reuse nguyên `level-vectors.json` (handoff risk #3). Lưu ý mapping cap (red-team F13): Flinto có 2 loại phiên — global daily **capped 20 + user chỉnh** (§3 spec) và course-lesson review **uncapped** (§87); teacher-os v1 chỉ có phiên per-deck (≈ course lesson) → **uncapped**; engine vẫn giữ tham số `cap` cho fidelity/vectors nhưng global capped session + user setting là Out of Scope.
2. **Engine pure TS tại `packages/api/src/srs/`**, dùng chung server + student client (precedent `packages/api/src/lib/grade-quiz.ts` — shared lib sống ở packages/api, cả 2 app parse cùng nguồn). Kèm bộ **conformance vectors** copy từ Flinto: `docs/srs-spec.md` → `docs/srs-spec.md` (teacher-os), `shared/srs/{generate-level-vectors.mjs, level-vectors.json}` → `packages/api/src/srs/vectors/`. Test engine chạy chống các section `answers`, `typing`, `eligibility`, `hints`, `intervals`, `learnSteps`, `learnQueue`, `learnCommit`; **bỏ section `legacy`** (teacher-os không có data cũ cần migrate). Vectors copy byte-identical từ Flinto `dev` @ `b9ec13c`.
3. **Chia trách nhiệm server/client theo mẫu "server = nguồn chân lý data, client = runtime"**: server lưu cards + logs, persist first-result **atomic** qua `db.batch` (D1 batch — precedent `kernel.ts` import `BatchItem` từ `drizzle-orm/batch`); client chạy session runtime (queue, requeue, kind choice, wrong-streak overlay) bằng engine port — đúng mô hình Flinto on-device. Server **không chấm lại đáp án** (không biết prompt options) — honor-policy như precedent audio P1; anti-cheat không phải goal (app học, không phải exam có điểm — Flinto còn tin client 100%). Guard cross-session rẻ (red-team F6): nếu card `state=review && dueAt > now` → trả card hiện tại, không apply (spec §1 "due iff dueAt <= now").
4. **Idempotent first-result bằng `clientLogId`**: client sinh UUID cho mỗi dòng log sắp ghi; log row lấy đó làm PK. Guard anti-TOCTOU (red-team F6): insert dùng `ON CONFLICT DO NOTHING`/bắt UNIQUE constraint → khi conflict re-read log + trả 200 replay — **không bao giờ trả 500** cho retry đồng thời cùng id; SELECT-then-insert đơn thuần là race window. Áp cho cả `answer` (Review) lẫn `learn-commit` (Learn).
5. **Model teacher-os hoá — 4 bảng**: `vocab_deck` (per class, teacher authoring), `vocab_word` (word/translation/ipa/audioKey/sortOrder), `vocab_card` (SRS state per student, **lazy provision** khi student mở deck lần đầu, unique `(studentId, wordId)`), `vocab_review_log` (grade good|again, durationMs, sessionKind, **word/translation snapshot** — không FK cascade tới card/deck để history sống sót khi deck bị xoá, đúng Flinto "delete deck giữ log"). Mapping Flinto → teacher-os: deck lớp ≈ Course lesson (còn card `new` → **Learn** §3b; hết `new` → **Review** §3 lấy due uncapped, rỗng → ôn lại toàn bộ deck). Xoá deck **KHÔNG dựa FK cascade** — xoá `deck + words + cards` trong 1 `db.batch` (red-team F7: PRAGMA foreign_keys theo-connection, e2e libsql không set — precedent `routes/assignments/tests.ts:131-132`).
6. **Enrollment check mọi endpoint đọc deck** (red-team F1 Critical): session-data + audio stream join `enrollment` (org + studentId + class của deck + status active) trước khi trả/provision — 404 nếu không enroll, đúng guard `/classes/:classId` (`student.ts:833-849`). Lazy provision dùng **mốc ổn định** `vocab_deck.createdAt` làm base cho `dueAt = base − (n−1) + i` (red-team F8: `Date.now()` per-request làm 2 request đồng thời đảo thứ tự Learn vĩnh viễn).
7. **KHÔNG port** Personal/Community deck + catalog import, sync LWW/tombstone offline-first (teacher-os online, server là single source), seed migration `legacy` mapping. Đây là adaptation đúng bối cảnh web online, không phải cắt scope game.
8. **Contracts Zod `.strict()`** → **server + student CÙNG release train** (precedent #304 — bundle student cũ vỡ với payload server mới); teacher web deploy sau server được; **migration chạy TRƯỚC worker** (lesson #319). Không pin số migration: dùng số kế tiếp trong `packages/db/src/migrations/meta/_journal.json` lúc generate (plan P1 #358 cũng định chiếm 0036 — ai cook trước lấy số trước).
9. **Audio từ vựng optional**: `vocab_word.audioKey` nullable, **server-set sau upload** (client không gửi key tự chế — red-team F3); upload route teacher kernel-gated `PUT .../vocab/words/:wordId/audio` (MIME allowlist audio/*, size cap theo media-store, key server sinh `vocab/{orgId}/{wordId}/{uuid}` đúng convention org-scoped `quiz-media/${orgId}/...` `student.ts:1383`); GET stream dùng `mediaObjectResponse` (nosniff + sandbox — `student.ts:1513-1517`). Minigame `listeningChoice` chỉ eligible khi `audioKey != null` (đúng Flinto §4) — **audio hỏng/thiếu không làm gãy plan**: kind tự ẩn khỏi eligibility, Learn listen-step fallback `meaningChoice` (§3b rule 3).
10. **Teacher quản lý vocab qua kernel**: sub-route mới `routes/vocab-teacher.ts` mount vào `kernelRoutes` (pattern `routes/assignments/` — mount thật ở `kernel.ts:2099-2105`) + read-path snapshot **chỉ thêm `vocabDecks` (kèm đếm từ aggregate)** — `vocabWords` KHÔNG vào snapshot (red-team F11: full-org text payload mỗi lần fetch); editor đọc words per-deck qua GET sub-route. Student endpoints khai báo **bên trong `studentRoutes()`** (RT#1 `student.ts:586-588`: bootstrapMiddleware bỏ qua `/api/student/*`, router mount riêng KHÔNG có auth; cấm `app.route` ở app.ts), đăng ký guard per-path theo đúng precedent `#320`: `path` **và** `path/*`; POST thêm writeGuard (Origin + bodyLimit) — mọi guard đăng ký TRƯỚC handler.
11. **RNG injectable** (`RandomSource.nextInt(bound)`): prod = `crypto.getRandomValues`, test = seeded deterministic; distractor draw = **partial Fisher–Yates** đúng pseudo-code spec §4, same-deck trước other-deck. Pool distractor chỉ cần text: `{ wordId, word, translation, lang, deckId }` (red-team F10 — audio eligibility của `listeningChoice` thuộc card đang hỏi, không thuộc distractor).
12. **Ngày local cho streak/forecast = Asia/Ho_Chi_Minh** server-side (server không biết tz device; toàn bộ user VN — dùng precedent `packages/api/src/vietnam-date.ts` `vietnamTodayISO`). Streak đúng spec §5: chuỗi ngày liên tiếp **kết thúc ở hôm nay HOẶC hôm qua** (hôm nay chưa học → giữ streak của hôm qua); retention = mọi log; forecast loại card overdue. **Due metrics chỉ tính card `state="review"`** (red-team F5 — spec §5 global review pool loại card `new` khỏi Home queue; lazy provision cho card new dueAt quá khứ, không lọc thì overview nổ "50 từ đến hạn" khi chưa học chữ nào).
13. **Session runtime in-memory, không autosave-mirror**: first-result POST atomic ngay tại thời điểm trả lời (đúng Flinto "persist ngay lập tức") — refresh giữa chừng chỉ mất queue, card đã persist thì session build lại từ due mới. KHÔNG dựng store kiểu `quiz-attempt-store.ts`. **Failure path bắt buộc** (red-team F9): POST fail → giữ feedback, **chặn Continue**, banner lỗi + retry (giữ nguyên `clientLogId`); chỉ advance queue sau 200. Session instance tạo đúng 1 lần trong `useRef`/`useState` initializer keyed theo (deckId, load nonce) — cấm module-level store (red-team F14: singleton dính state xuyên session).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Engine SRS pure TS port chuẩn Flinto, unit test pass toàn bộ conformance vectors (trừ `legacy`) | P1 |
| 2 | Data model D1 (deck/word/card/log) + API server: teacher CRUD deck/word (+ audio), student overview/session/answer — atomic, idempotent, guard đúng pattern | P1 |
| 3 | Vòng Learn đúng spec §3b: intro → listen → produce, sai nối cuối queue, commit `learned()` + 1 log/từ | P1 |
| 4 | Vòng Review đúng spec §3: due → sort → cap 20 → shuffle, first-result-only, requeue 4–5, evict 2 forgot, wrong-streak overlay, summary recall % | P1 |
| 5 | 5 minigames đúng spec §4: eligibility theo level/audio/translation, strict priority không lặp kind, distractor partial Fisher–Yates k=3, typing rules NFC/30 code points/hint theo level | P1 |
| 6 | UI student + teacher theo DESIGN.md; gate local pass (`pnpm check`, `check-types`, test 4 app, e2e ports 8100/8101/8103) | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [SRS Engine Core + Conformance Vectors](./phase-01-srs-engine-core.md) | Pending |
| 2 | [Schema + Migration + Contracts](./phase-02-schema-migration-contracts.md) | Pending |
| 3 | [Server Vocab API](./phase-03-server-vocab-api.md) | Pending |
| 4 | [Session Engines + Quiz Generator](./phase-04-session-engines-quiz-generator.md) | Pending |
| 5 | [Student Vocab UI](./phase-05-student-vocab-ui.md) | Pending |
| 6 | [Teacher UI + E2E + Verification](./phase-06-teacher-ui-e2e-verification.md) | Pending |

## Dependencies

- Phase 1 đứng đầu (engine + vectors) — Phase 4 (session engines) chỉ phụ thuộc Phase 1, chạy song song được với Phase 2/3.
- Phase 2 → Phase 3 (API cần schema + contracts) → Phase 5 (UI cần contracts) → Phase 6 (e2e cần cả teacher UI lẫn student UI).
- Thứ tự tối ưu: 1 → (2 ∥ 4) → 3 → 5 → 6.
- **Deploy order**: migration D1 prod TRƯỚC worker (lesson #319); server + student **cùng release train** (precedent #304, `.strict()` parse client-side); apps/web (teacher) deploy sau server được.

## Success Criteria

- [ ] `pnpm --filter @teacher-os/api run test` pass toàn bộ vector sections `answers`/`typing`/`eligibility`/`hints`/`intervals`/`learnSteps`/`learnQueue`/`learnCommit` — engine ra kết quả identical với reference Flinto.
- [ ] Vectors + spec copy byte-identical từ Flinto `dev` @ `b9ec13c`; generator port chạy `--check` exit 0.
- [ ] Server: first-result answer + learn-commit ghi **đúng 1 dòng log + update card trong 1 batch**; retry cùng `clientLogId` (kể cả đồng thời — test `Promise.all`) trả 200 replay, không 500, không apply lần 2; student không enroll lớp chứa deck → session-data/audio 404; student không đọc/ghi được card của student khác (404).
- [ ] Overview due metrics chỉ đếm card `state="review"` (test: 3 card new chưa học → dueCount 0); streak giữ chuỗi hôm qua khi hôm nay trống (test).
- [ ] Student flow e2e: teacher tạo deck 3 từ (1 từ có audio upload) → student mở deck → Learn session (intro + scored steps) hoàn tất → card `state=review`, `dueAt=now+1d` hiển thị countdown; review sai 2 lần từ bị evict, sai requeue vị trí 4–5 (assert engine test), overlay wrong-streak xuất hiện ở streak 5.
- [ ] Minigame: typing chấm `normalizeAnswer` (NFC, dấu biến âm có nghĩa: `cafe` ≠ `café`), hint `i__ c____` ở L1; listeningChoice chỉ hiện khi word có audio; distractor không bao giờ trùng normalized key đáp án; deck detail hiển thị hint next-review bằng `formatInterval`.
- [ ] Teacher: tạo/sửa/xoá deck + word (kèm audio upload) qua kernel; xoá deck → words + cards bị xoá trong 1 batch, **0 row orphan** (test), review_log + stats streak/retention sống sót.
- [ ] Gate local pass: `pnpm check`, `pnpm check-types`, `pnpm --filter server run test`, `pnpm --filter student run test`, `pnpm --filter web run test`, `pnpm --filter @teacher-os/api run test` (packages/ui KHÔNG có script test — khỏi gate), `pnpm --filter e2e e2e` (ports 8100/8101/8103), `node packages/api/src/srs/vectors/generate-level-vectors.mjs --check`.
- [ ] UI verify 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo REVIEW.md; PR kèm screenshot.

## Out of Scope (ghi rõ)

- Personal/Community deck, catalog import (§7 spec Flinto) — teacher-os chỉ có deck do giáo viên tạo cho lớp.
- **Global daily session capped 20 + user setting "Words per session"** (§3 spec Flinto) — v1 chỉ có phiên per-deck uncapped (§87); engine giữ tham số `cap` cho fidelity.
- Sync offline LWW + tombstone + bảng `sync_rows` dumb-server (§8 kiến trúc Flinto) — teacher-os online, server là single source of truth.
- Section vectors `legacy` (migration từ scheduler cũ) — không có data cũ.
- Trang history/calendar học chi tiết, chart tăng trưởng "words learned", personal-best streak (Flinto §5) — chỉ lấy Due/Streak/Retention/Forecast/Level distribution vào overview; history đầy đủ làm follow-up nếu cần.
- Teacher analytics tiến độ học sinh per student (chỉ authoring + đếm tổng quan deck); leaderboard/gamification khác; AI pre-grade (P2 report Step IELTS).
- Chỉnh hằng số interval (dùng nguyên bộ Flinto — đổi = follow-up kèm regen vectors).
- PWA offline cho session vocab.

## Red Team Review

### Session — 2026-10-18
**Reviewer:** 4 persona (Security Adversary/Fact Checker, Failure Mode Analyst/Flow Tracer, Assumption Destroyer/Scope Auditor, Scope & Complexity Critic/Contract Verifier) — Full tier.
**Findings:** 22 thô → 15 sau dedup/cap (15 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 8 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `session-data` thiếu enrollment check → IDOR chéo org/lớp: provision + lộ toàn bộ từ của deck lớp khác; provision chạy trong GET (side-effect ghi DB qua GET) | Critical | Accept | Phase 3 (join enrollment + 404 + test), plan.md KD6 |
| 2 | RT#1: `requireStudent` là closure của `studentRoutes()`, bootstrapMiddleware bỏ qua `/api/student/*` (`student.ts:586-588`, `app.ts:86-93`) — vocab router mount ngoài sẽ KHÔNG có auth; đăng ký guard precedent #320 là `path` + `path/*` (không phải trailing-slash); guard phải đăng ký TRƯỚC handler | High | Accept | Phase 3 Architecture, plan.md KD10 |
| 3 | Audio pipeline thiếu: không có route upload teacher nào tồn tại để reuse; `audioKey` client-supplied không validate → trỏ key org khác (MediaStore flat, không org-scoping `media-store.ts:14-26`); key đề xuất thiếu org segment; GET stream nằm ngoài guard block + thiếu `mediaObjectResponse` | High | Accept | Phase 3 (PUT upload kernel-gated + MIME/size + server-set key `vocab/{orgId}/{wordId}/{uuid}` + GET vào Requirements/guard + mediaObjectResponse), plan.md KD9 |
| 4 | CSRF: `quizWriteGuard` (Origin + JSON-only + bodyLimit) chỉ đăng ký 2 prefix quiz/attempt (`student.ts:643-644`) — POST `/vocab/answer`, `/vocab/learn-commit` không kế thừa; cookie SameSite=None (`student.ts:234`) | High | Accept | Phase 3 Architecture (writeGuard per-path + test POST không Origin → 403) |
| 5 | Due metrics (dueCount/nextDueAt/forecast/deck-due) thiếu filter `state='review'` — lazy provision cho card new dueAt quá khứ → overview "50 từ đến hạn" khi chưa học gì (spec §5:234, :86 "never flood"); Phase 4 Review build input cũng phải lọc | High | Accept | Phase 3 + Phase 4, plan.md KD12, Success Criteria |
| 6 | Idempotency SELECT-then-batch là TOCTOU: 2 request đồng thời cùng `clientLogId` → UNIQUE constraint 500; test chỉ sequential; cross-session 2 tab apply 2 lần (spec §1 guard `dueAt <= now` rẻ chưa dùng) | High | Accept | Phase 3 (ON CONFLICT/catch UNIQUE → replay 200 + guard dueAt + test Promise.all), plan.md KD4 |
| 7 | Xoá deck dựa FK cascade — trái precedent repo (PRAGMA foreign_keys theo-connection; `routes/assignments/tests.ts:131-132` ghi "không dựa FK cascade"; e2e boot không set pragma) → e2e xanh prod vỡ/orphan | High | Accept | Phase 3 (xoá deck+words+cards trong 1 db.batch + test 0 orphan), plan.md KD5 |
| 8 | Lazy provision race: base `Date.now()` per-request → 2 request đồng thời xen mốc, đảo thứ tự Learn vĩnh viễn (Flinto dùng mốc sự kiện đơn `addedAtMs`) | High | Accept | Phase 2 + 3 (base = `vocab_deck.createdAt`), plan.md KD6 |
| 9 | POST first-result fail (mạng/5xx) không có failure path — engine đã advance queue, server thiếu log → mất tiến độ im lặng; "mỗi đáp án là 1 request bền" chỉ đúng khi thành công | High | Accept | Phase 5 (POST fail → chặn Continue + banner retry giữ clientLogId; chỉ advance sau 200), plan.md KD13 |
| 10 | Contract session-data lệch giữa Phase 3/4: pool thiếu `hasAudio` (P4 yêu cầu); `cards[]` không có field list; pool thật chỉ cần text (audio eligibility thuộc card đang hỏi) | Medium | Accept | Phase 2 (chốt field list cards[] + pool, bỏ hasAudio pool), Phase 3/4 đồng bộ, plan.md KD11 |
| 11 | `vocabWords` vào kernel snapshot: full-org text payload mỗi lần fetch + blast radius `KernelSnapshot` (22 file non-test, 12 test fixture, factory `kernel-harness.tsx:19`) chưa enumerate; required-vs-optional không chốt | Medium | Accept | Phase 3 (snapshot chỉ `vocabDecks` + aggregate; words GET per-deck), Phase 6 (fixture factory default `vocabDecks: []`), plan.md KD10 |
| 12 | Streak under-specify: thiếu rule "today or yesterday" (spec §5:243), personal best, retention range, forecast overdue bucket — test duy nhất pass với cả 2 cách tính sai/đúng | Medium | Accept | Phase 3 (pseudocode đầy đủ + test hôm-nay-trống/đứt-ngày/nửa-đêm), plan.md KD12; personal best → Out of Scope |
| 13 | `durationMs` cap 360_000 **reject** thay vì clamp — learn-commit là tổng nhiều bước + intro dwell, học sinh treo máy 7 phút → 400, card kẹt `new` vĩnh viễn; `gradeGood` chưa pin định nghĩa (= firstTryCorrect mọi scored step, §3b rule 7) | Medium | Accept | Phase 2 (server clamp min(durationMs, CAP), test boundary; comment gradeGood), Phase 3 |
| 14 | Session instance lifetime chưa chốt: module-level store = singleton dính state xuyên session/tab; render-body instantiation = mỗi re-render reset queue → double first-result; 404 giữa phiên (deck bị teacher xoá) không có UI path | Medium | Accept | Phase 5 (useRef/useState initializer keyed (deckId, nonce) + test re-render + dialog 404 → thoát an toàn), Phase 4 (engine expose `removeCard(id)` cho UI gọi) |
| 15 | Misc: KD1 "cap 20 user chỉnh được" sai mapping (teacher-os chỉ có deck-review uncapped §87); `upcomingCount` thiếu trong overview contract dù P5 render; `formatInterval` port mà không consumer (handoff §7: hint next-review); e2e "hoặc call server helper" = rủi ro backdoor (khoá seed libsql trực tiếp — precedent `account-seed.ts:8-13`); filter chip "theo nhãn" không có field nhãn; gate `pnpm e2e` không tồn tại (đúng: `pnpm --filter e2e e2e`); "52 specs" thật là 48; citations drift (kernel mount thật `kernel.ts:2099-2105`, `routes/assignments/` là directory, web route có `_auth/`) | Medium | Accept | plan.md KD1 + Out of Scope, Phase 2 (upcomingCount), Phase 3, Phase 5 (hint formatInterval), Phase 6 (gate + seed + bỏ nhãn), citations các phase |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…06 (sau khi áp 15 findings)
- Decision deltas checked: 15 (enrollment guard, RT#1 mount, audio server-set key, writeGuard, state='review' filter, idempotency TOCTOU, batch delete, provision base deck.createdAt, POST fail path, pool contract, snapshot vocabDecks-only, streak rule, durationMs clamp, session lifetime, cap mapping + gates)
- Reconciled stale references: 11 (KD1/3/4/5/6/9/10/11/12/13 viết lại; Success Criteria; Out of Scope thêm global capped session + personal best; Phase 2–6 cập nhật tại chỗ)
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-10-18 (auto, hard mode)

**Verification Results (Full tier, gộp từ 4 red-team reviewer):**
- Tier: Full (6 phases, 4 roles)
- Claims checked: ~70 (Fact Checker 34 + Flow Tracer 3 path trace + Scope Auditor 6 lifetime + Contract Verifier 4 consumer groups)
- Verified: 64 | Failed: 2 (gate `pnpm e2e` không tồn tại → `pnpm --filter e2e e2e`; "52 specs" → 48) — cả 2 đã áp vào plan | Unverified/PARTIAL: 4 (line-drift citation `app.ts:28/49`, `kernel.ts:78-83` là import không phải mount, `routes/assignments.ts` là directory, `student-nav.tsx` không tồn tại — đã sửa citations)
- Assumptions sống sót sau verify (không thành finding): vitest include `src/**/*.test.ts` pickup test mới (`packages/api/vitest.config.ts:7`); `resolveJsonModule: true` (`packages/config/tsconfig.base.json:15`); `@teacher-os/api` exports `./*` subpath + apps/student đã depend `workspace:*` (import engine vào client OK); generator `.mjs` resolve outPath theo `import.meta.url` chạy được mọi cwd (`--check` chạy thật exit 0); `.onConflictDoNothing()` có precedent (`ingest-transaction.ts:133`); web KHÔNG zod-parse snapshot runtime → "web deploy sau server" HOLD; `crypto.getRandomValues`/`randomUUID` có ở Workers + browser; 4 bảng riêng đúng (syllabus_lesson là curriculum template machinery — không tái dùng được cho SRS lifecycle delete-giữ-log).

**Câu hỏi validation + quyết định (autonomous — chọn theo phương án recommended từ evidence):**
1. *Audio listeningChoice: giữ pipeline R2 đầy đủ hay defer?* → GIỮ (HOLD SCOPE — handoff yêu cầu đủ 5 minigames; eligibility gate `audioKey != nil` + Learn listen-step fallback `meaningChoice` cho phép degrade an toàn nếu audio trục trặc; ghi rõ risk ở KD9).
2. *Cap 20 global session?* → KHÔNG port v1 (teacher-os chỉ có per-deck session — §87 uncapped; global capped + user setting → Out of Scope; engine giữ `cap` param cho fidelity) — theo finding F13/F15.
3. *Snapshot có vocabWords?* → KHÔNG — chỉ `vocabDecks` + aggregate; words GET per-deck (payload + blast radius fixture).
4. *Idempotency chống race?* → ON CONFLICT/catch UNIQUE → replay 200 + guard dueAt cross-session.
5. *Provision base?* → `vocab_deck.createdAt` (mốc ổn định, không per-request).
6. *Streak personal best?* → Out of Scope (follow-up nếu cần).
7. *E2e seeding?* → seed trực tiếp libsql từ spec (pattern `account-seed.ts`), CẤM server helper.
8. *durationMs vượt cap?* → server clamp, không reject.

### Whole-Plan Consistency Sweep (post-apply)
- Files reread: plan.md + phase-01…06 (sau khi áp toàn bộ)
- Decision deltas checked: 15
- Reconciled stale references: 11
- Unresolved contradictions: 0

<!-- slug: student-vocab-srs-game -->
