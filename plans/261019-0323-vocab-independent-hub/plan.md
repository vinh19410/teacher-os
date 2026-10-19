---
title: "Vocab độc lập lớp học — Teacher Hub + Gợi ý deck + Theo dõi tiến độ"
description: "Tách từ vựng khỏi lớp học: deck không bắt buộc thuộc lớp, teacher hub riêng (quản lý deck, gợi ý deck optional cho học viên, theo dõi tiến độ SRS), student nhận gợi ý trong /vocab"
status: pending
priority: P1
effort: 3d
issue: 363
branch: vinh19410/ai-handle-vocab-independent-hub
tags: [vocab, srs, db-migration, kernel, teacher-web, student-app]
blockedBy: []
blocks: []
created: 2026-10-19
---

# Vocab độc lập lớp học — Teacher Hub + Gợi ý deck + Theo dõi tiến độ

## Overview

Hiện tại `vocab_deck.class_id NOT NULL` nên mọi bộ từ vựng phải thuộc một lớp; teacher quản lý vocab qua tab "Từ vựng" trong trang chi tiết lớp và **không có bất kỳ endpoint/view theo dõi tiến độ học nào** (#359 đã ship SRS per-student, #361 đã ship library clone-on-assign). Plan này:

1. Nới `vocab_deck.class_id` thành nullable → deck "riêng" không thuộc lớp, vẫn thuộc org.
2. Thêm bảng `vocab_suggestion` — teacher gợi ý deck cho học viên (pending → accepted/dismissed, chỉ hiển thị, không bắt buộc).
3. Mở rule truy cập deck của student: enrolled lớp **hoặc** đã accepted suggestion (mở rộng rule IDOR #359, không phá luồng cũ).
4. Teacher web: sidebar mục "Từ vựng" riêng → hub 2 tab (Bộ từ vựng / Tiến độ), tạo + clone library không cần lớp, gợi ý deck, xem tiến độ SRS per-student (phân bố level 1–5, due, hoạt động 7 ngày).
5. Student `/vocab`: mục "Gợi ý cho bạn" — Bắt đầu học (accept) / Ẩn (dismiss), deck nhận thêm badge nguồn.

Brainstorm contract (đã chốt hướng A — deck org-scoped + bảng suggestion) ở session 2026-10-19; REA report đối thủ Knowt: `plans/reports/2026-10-19-knowt-vocab-games-rea.md`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Deck vocab tồn tại không cần lớp (classId nullable — migration recreate có audit + rehearse staging) | P1 |
| 2 | Vòng đời suggestion: teacher gợi ý (idempotent) → student accept (học được) / dismiss (ẩn); teacher thu hồi soft | P1 |
| 3 | Teacher hub menu riêng: quản lý deck + gợi ý + tiến độ per-student | P1 |
| 4 | Giữ nguyên toàn bộ luồng vocab-in-class hiện có (tab lớp, SRS session, e2e cũ) | P1 |
| 5 | Rule IDOR mở rộng có test âm tính (student ngoài lớp + không nhận gợi ý → 403/404) | P1 |

## Non-goals

- Học viên tự duyệt thư viện (self-serve), deck public, gamification, đổi thuật toán SRS.
- **Progress per-deck (roster deck)** — cắt sau red-team RT-F18: request chỉ cần per-student; thêm khi có UI thật.
- Notification khi có gợi ý mới.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Khởi tạo branch & chốt quyết định kỹ thuật](./phase-01-start.md) | Pending |
| 2 | [DB schema: classId nullable + bảng vocab_suggestion](./phase-02-db-schema-suggestion.md) | Pending |
| 3 | [API contracts + student access rule & suggestion lifecycle](./phase-03-api-contracts-student-access.md) | Pending |
| 4 | [Server teacher hub: kernel commands + progress endpoints](./phase-04-teacher-kernel-hub.md) | Pending |
| 5 | [Web teacher: sidebar + hub UI (Deck / Tiến độ / Gợi ý)](./phase-05-web-teacher-hub-ui.md) | Pending |
| 6 | [Student: mục Gợi ý cho bạn trong /vocab](./phase-06-student-suggestion-ui.md) | Pending |
| 7 | [Tests, e2e mới & gates local](./phase-07-tests-e2e-gates.md) | Pending |

## Success Criteria

- [ ] Teacher tạo/clone deck mà không chọn lớp → deck hiện ở hub với badge "Riêng", KHÔNG xuất hiện ở tab vocab của lớp nào.
- [ ] Teacher gợi ý deck (kèm ghi chú) cho học viên A → A thấy "Gợi ý cho bạn" ở `/vocab`; "Bắt đầu học" → provision card + vào session và **học trọn card qua answer/learn-commit** (predicate 5 call sites); "Ẩn" → gợi ý biến mất, teacher gợi ý lại được (flip pending); gợi ý trùng pending là idempotent (double-click an toàn).
- [ ] Học viên B (không được gợi ý, không enrolled) gọi API deck/suggestion → 403/404; Origin lạ trên POST suggestion → 403 (CSRF).
- [ ] Teacher thu hồi suggestion đã accepted (soft flip) → deck rời overview học viên; teacher xoá deck → suggestion được dọn trong batch (không mồ côi).
- [ ] Teacher mở Tiến độ cho A: đúng tổng từ đang học, phân bố level 1–5, số từ đến hạn, hoạt động 7 ngày theo ngày VN — khớp dữ liệu sau khi A học 1 session (e2e).
- [ ] Luồng cũ nguyên vẹn: tab vocab trong lớp, student /vocab với deck lớp, SRS session — `vocab-srs.spec.ts` + `vocab-library-clone.spec.ts` pass.
- [ ] Gates local pass: `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test`, e2e ports 8100/8101/8103.

## Dependencies

- Đặc tả SRS: `docs/srs-spec.md` (5 levels, `dueAt` single source) — không đổi thuật toán.
- Release train: migration 0038 (recreate `vocab_deck` — audit + rehearse staging) deploy trước worker; **server trả snapshot field mới trước, web tiêu thụ sau**; server + web + student cùng promotion (bài học #319, #361).
- Kernel store pattern: web đọc snapshot `data.vocabDecks` qua `useData()` + `dispatch` (snapshot-once — progress KHÔNG đưa vào snapshot, dùng endpoint riêng, bài học #343).

## Red Team Review

### Session — 2026-10-19
**Findings:** 19 (19 accepted, 0 rejected) — 4 reviewer (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic), tier Full.
**Severity breakdown:** 2 Critical, 6 High, 11 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Access predicate chỉ nêu 3/5 call sites — thiếu `loadOwnedSessionCard` (answer/learn-commit), audio, `loadPool` → deck riêng 404 ngay card đầu tiên | Critical | Accept | Phase 3 |
| 2 | Claim "`.strict()` additive — client cũ bỏ qua field mới" sai cơ chế; `className` nullable trên wire giết bundle cũ → dùng `.catch()`/default + giữ type cũ, an toàn thật do release train | Critical | Accept | Phase 3 |
| 3 | Migration 0038 là recreate bảng (SQLite), không phải ALTER additive — audit theo precedent 0011 + rehearse staging + bỏ wording "additive" | High | Accept | Phase 1, 2, plan.md |
| 4 | POST suggestion thiếu `vocabWriteGuard` → CSRF hole (cookie SameSite=None) — đăng ký cặp guard + test Origin 403 | High | Accept | Phase 3 |
| 5 | FK CASCADE trái doctrine F7 (PRAGMA foreign_keys không bật) — xoá deck phải batch-xoá suggestion | High | Accept | Phase 2, 4 |
| 6 | Transition matrix underspecified — dismiss chỉ từ pending (409 khi accepted), teacher thu hồi = soft flip giữ respondedAt, fate vocab_card ghi rõ | High | Accept | Phase 2, 3, 4, 6 |
| 7 | SQL `date(reviewedAt)` sai (epoch-ms → NULL) + thiếu +7h — group activity bằng JS theo `vietnamTodayISO` | High | Accept | Phase 4 |
| 8 | Snapshot `vocabSuggestions` blast radius ~15 file web + deploy skew làm workspace trắng → field optional + default [] + chỉ pending + order server-trước | High | Accept | Phase 4, 5 |
| 9 | Snapshot build ở `snapshot.ts` không phải `kernel.ts`; `KernelVocabDeckRow.classId` phải nới cùng PR + asserts | Medium | Accept | Phase 1, 2 |
| 10 | Union deck thiếu dedupe → deck 2 nhánh hiện 2 lần/stats đếm đôi — precedence source class > suggested | Medium | Accept | Phase 3 |
| 11 | Suggest conflict → 500 unhandled — pre-check pending idempotent + test double-suggest | Medium | Accept | Phase 4, 7 |
| 12 | Teacher snapshot stale sau student accept/dismiss — modal gợi ý fetch fresh khi mở + nhãn trạng thái | Medium | Accept | Phase 4, 5 |
| 13 | Clone library dedupe `eq(classId, null)` luôn FALSE — dùng `isNull()` + copy UI ngữ cảnh hub | Medium | Accept | Phase 4, 5 |
| 14 | Success criteria grep `innerJoin(enrollment` vacuous (multi-line) — đổi sang đếm call sites đối chiếu danh sách 5 | Medium | Accept | Phase 3 |
| 15 | "packages/db thiếu vitest" stale — packages/db CÓ runner; test schema tại chỗ | Medium | Accept | Phase 2 |
| 16 | Nới `VocabDeckList` là 4 điểm (filter `===undefined` trống lặng lẽ, `data-actions.ts` payload, tên lớp lookup `data.classes`, copy modal) | Medium | Accept | Phase 5 |
| 17 | Phase 7 sai tham chiếu editor flow (nằm ở vocab-srs.spec, không phải library-clone; helper copy-pattern không import) | Medium | Accept | Phase 7 |
| 18 | Endpoint progress per-deck không consumer — cắt (non-goal) | Medium | Accept | Phase 4, plan.md |
| 19 | Partial unique index không tiền lệ + history rows write-only — đảo mặc định: UNIQUE(student,deck) thường + upsert flip; teacherId FK user chuẩn pattern membership | Medium | Accept | Phase 1, 2 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-07 (sau khi apply)
- Decision deltas checked: 19 (bảng trên)
- Reconciled stale references: "additive migration" (plan.md G1, phase-02), "3 call sites" (phase-03), "badge pending từ snapshot" (phase-04 → pending-only + fetch fresh), "D1 partial index" (phase-01/02), "thiếu vitest" (phase-02), tham chiếu kernel.ts → snapshot.ts (phase-01/04), per-deck progress (phase-04/todo + phase-05 reference), fallback D1 trong phase-03 test (e)
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Full (4 vai trò, phân bổ qua 4 red-team reviewer)
- **Claims checked:** 40+ (mỗi reviewer verify độc lập các claim trong phạm vi lens + role)
- **Verified:** 35+ | **Failed:** 8 (thành findings #1–#19 ở trên, đã sửa vào plan) | **Unverified:** 0
- Failures tiêu biểu (đã xử): "3 call sites" thực tế 5; ".strict() additive" sai; "additive migration" thực tế recreate; "packages/db thiếu vitest" stale; "snapshot build ở kernel.ts" sai file; precedent "vocab_review_log không FK teacher" không tồn tại; "xoá lớp xoá deck là hành vi cũ" không có flow xoá lớp; grep success criteria vacuous.

<!-- slug: vocab-independent-hub -->
