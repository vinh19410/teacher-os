---
title: "fix-115-student-package-min-validation"
description: "Chặn min client-side + lỗi theo field cho Số buổi/Đơn giá trong AddStudentModal; nâng server contract total lên min(1) — QC P1 issue #115"
status: completed
priority: P1
effort: "4h"
tags: [bugfix, qc, validation]
created: 2026-08-31
issue: 115
branch: fix/115-student-package-min-validation
---

# fix-115-student-package-min-validation

## Overview

QC P1 #115: trên `/students`, form thêm học viên nhận **Số buổi gói = 0** và **Đơn giá âm** mà pass client; server từ chối giá âm bằng banner chung *"Không lưu được — dữ liệu chưa được ghi lên máy chủ…"* không chỉ field nào. Expected theo issue: chặn min client-side, lỗi hiển thị theo field.

Root cause 3 lớp (fact, đã đối chiếu code trên develop):

1. **Client ép kiểu im lặng** — `apps/web/src/components/modals/add-student-modal.tsx:101-102,126-127` dùng `Number.parseInt(total, 10) || 10` và `|| 400000`: nhập `0` buổi bị âm thầm thành `10`; nhập `-500` gửi thẳng server. Chỉ `name`/`phone` có per-field error state; `total`/`price` không có.
2. **Server contract cho phép gói 0 buổi** — `packages/api/src/contracts.ts:13,27`: `studentCreateSchema` và `enrollStudentSchema` đều `total: z.number().int().min(0)` → `total=0` hợp lệ qua API (giá âm thì đã bị `price.min(0)` chặn, nên banner chung của QC case là do price).
3. **Banner chung là đúng ngữ nghĩa** — `apps/web/src/lib/use-kernel-form-submit.ts:37-41` hiển thị lỗi chung cho mọi `definite-failure` server; giữ nguyên, không nằm trong scope.

Tiền lệ nội bộ: **issue #105** đã fix đúng failure mode này ở `add-class-modal.tsx:107-118` — strict parse thay cho `|| default`, báo lỗi khi `< 1`, mirror server `min(1)`. Fix này áp dụng đúng pattern đó cho student package, cộng thêm per-field error prop (Field component đã hỗ trợ `error`).

Quyết định ngưỡng:
- `total`: **≥ 1** ở client VÀ server (gói 0 buổi vô nghĩa; server `min(0)` là lỗ hổng data-integrity — qua API vẫn persist được).
- `price`: **≥ 0** cả hai nơi (0 = miễn phí/học bổng là hợp lệ; chỉ âm là sai). Server đã đúng, client thiếu chặn.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Client chặn min theo field (total ≥ 1, price ≥ 0), lỗi hiển thị dưới từng field, không gửi request khi sai — cả 2 mode (tạo mới + enroll học viên có sẵn) | P1 |
| 2 | Server contract `total` nâng `min(0)` → `min(1)` cho cả `studentCreateSchema` + `enrollStudentSchema` | P1 |
| 3 | Test phủ đủ 3 lớp: unit contract, server route 400, e2e UI theo pattern `create-class-validation.spec.ts` | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Contract min(1) + server tests](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Client per-field validation and e2e](./phase-02-client-per-field-validation-and-e2e.md) | Pending |
| 3 | [Phase 3: Full local gates and wrapup](./phase-03-full-local-gates-and-wrapup.md) | Pending |

## Success Criteria

- [ ] Trên `/students`: nhập buổi `0` → thấy lỗi dưới field "Số buổi gói", **không có** request mạng nào tới `/api`; sửa lại `1` → lưu được
- [ ] Trên `/students`: nhập giá `-500` → thấy lỗi dưới field "Đơn giá", không request; `0` → lưu được (miễn phí hợp lệ); để trống → lỗi (không lọt thành 0đ)
- [ ] Nhập `10.5` buổi → lỗi field (không truncate thành 10)
- [ ] Mode "Học viên có sẵn" (từ class detail, issue #122) chặn tương tự — e2e enroll-mode case BẮT BUỘC (xem phase 2 Case D)
- [ ] API trực tiếp `total: 0` → 400 cho cả POST `/api/students` và POST `/api/classes/:id/enroll`
- [ ] Client không còn `|| 10` / `|| 400000` (không còn 0 buổi bị ép thành 10). Lưu ý ranh giới: server contract vẫn `.default(10)`/`.default(400000)` khi field bị OMIT — hành vi chủ đích từ #122, được pin bằng test riêng ở phase 1
- [ ] `pnpm test`, `pnpm check-types`, `pnpm exec biome check .`, `pnpm build` xanh
- [ ] E2E spec mới xanh trong CI

## Non-goals

- Không đổi banner chung của `useKernelFormSubmit` — đúng ngữ nghĩa cho lỗi server thật (network/5xx)
- Không thêm max cap cho `total`/`price` trong PR này (red-team đề xuất cap vì `.int()` nhận unsafe integers — tự hại trong chính org của user, không phải cross-tenant; từ chối vì scope creep, ghi follow-up hardening riêng khi có yêu cầu thật)
- Không bỏ `.default(10)`/`.default(400000)` của schema (chủ đích #122; chỉ pin bằng test)
- Không thêm aria/`role="alert"` vào `Field` error span (`field.tsx:48`) — dùng chung nhiều form, cần PR riêng; e2e PR này assert label-scoped text
- Không sửa `add-class-modal.tsx` dù nó có cùng lỗ hổng truncate thập phân (`Number.parseInt`) — follow-up riêng sau khi pattern mới ở student được nghiệm thu
- Không sửa các modal khác (invoice đã có validation riêng theo `.int().min(1)`)
- Không đụng dữ liệu `session_package` đã tồn tại (validation chỉ áp cho write mới; không migration)

## Related Code Files

- Modify: `packages/api/src/contracts.ts` (2 schema)
- Modify: `apps/server/src/kernel.test.ts` (thêm case 400)
- Modify: `apps/web/src/components/modals/add-student-modal.tsx` (strict parse + field errors)
- Create: `apps/e2e/specs/student-package-validation.spec.ts`
- Reference (không sửa): `apps/web/src/components/modals/add-class-modal.tsx:107-118` (pattern #105), `apps/e2e/specs/create-class-validation.spec.ts` (pattern e2e), `apps/e2e/specs/student-package-without-class.spec.ts` (helper thêm học viên)

## Risk Assessment

- **Đổi contract `min(1)` là thay đổi API công khai**: 3 reviewer red-team đã grep verify — đúng 2 call site (`kernel.ts:362` POST /students, `kernel.ts:457` enroll), không caller khác toàn repo (web + e2e đều không gửi total=0). Tín hiệu vỡ: CI đỏ ở kernel.test.ts — không có fixture total=0 nào tồn tại.
- **Empty input (`""`)**: `Number("") === 0` — phải chặn tường minh (đặc biệt price, không được lọt thành 0đ). Prefilled `10`/`400000` giúp người dùng bình thường không gặp.
- **Native number-input chrome**: thêm `noValidate` lên `<form>` như add-class-modal.
- **Source-format coupling**: 2 contract test web parse source text của modal — giữ `type:` kề `payload: {…}` (chi tiết ở phase 2).

## Red Team Review

### Session — 2026-08-31
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (tier Standard: Fact Checker + Contract Verifier; 3 code-reviewer agents chạy song song)
**Findings:** 14 sau dedupe (4 High, 9 Medium, 1 Low) — **13 accepted, 1 rejected**

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Claim "Field aria wiring sẵn" SAI (`field.tsx:48` span trơn) + pattern e2e cited dùng `getByRole("alert")` chỉ match banner → nguy cơ false-green hoặc route lỗi vào banner | High | Accept | Phase 2 (label-scoped locator, bỏ claim aria, follow-up field.tsx) |
| 2 | Kỹ thuật `page.on('request')` bịa/gán nhầm pattern (`create-class-validation.spec.ts` không dùng; tiền lệ thật là `countInvoicePosts` scope chặt); đếm global sẽ dính POST signup → false-red | High | Accept | Phase 2 (counter mirror countInvoicePosts, scope URL+method, register quanh action) |
| 3 | `Number.parseInt` không phát hiện non-integer ("10.5" → 10 im lặng) — tái tạo đúng lớp lỗi #115 | High | Accept | Phase 2 (Number + Number.isInteger + empty-check; Case E e2e) |
| 4 | Coverage enroll-mode để "tùy chọn/unit reasoning" — không phải gate; 2 parse site riêng (101-102 enroll, 126-127 create) dễ fix lệch 1 nhánh | High | Accept | Phase 2 (Case D e2e BẮT BUỘC + validate-before-branch constraint) |
| 5 | `.default(10)`/`.default(400000)` sống sót — omit field vẫn tạo gói im lặng; criterion "loại bỏ hoàn toàn" overclaim | Medium | Accept | plan.md criteria (client scope) + Phase 1 (pin test omitted-defaults) |
| 6 | `pnpm test --filter server` sai cú pháp (root script compound; flag dính lệnh cuối) | Medium | Accept | Phase 1/3 (`pnpm --filter server test` / `--filter server exec vitest run`) |
| 7 | `switchMode` không reset; lỗi stale trôi qua 2 mode vì packageFields shared; lỗi không clear khi gõ lại | Medium | Accept | Phase 2 (clear on change + switchMode; Case C assert) |
| 8 | E2e local không chỉ định command; port 8000/8001 conflict với dev server (`reuseExistingServer: false`); escape hatch "CI bắt" làm vô hiệu TDD evidence | Medium | Accept | Phase 2/3 (command + port precondition + TDD evidence rule) |
| 9 | Phase 1 sai route path (`/api/kernel/…`; thật: `/api/students` per `app.ts:103`) + sai error shape ("zod flatten"; thật: static `{error:"invalid body"}`) | Medium | Accept | Phase 1 |
| 10 | TDD đỏ-first bất khả thi cho case price (min(0) đã có) — criterion phải tách | Low | Accept | Phase 1 (red-first chỉ total=0; price = regression-lock) |
| 11 | Không upper bound — total/price nhận unsafe integers, tràn downstream | Medium | **Reject** — self-harm trong chính org, không cross-tenant; scope creep cho PR bugfix; ghi follow-up ở Non-goals |
| 12 | 2 contract test web parse SOURCE TEXT modal (`payloadObject` brace-match, regex locks) — refactor hoist payload có thể vỡ format coupling | Medium | Accept | Phase 2 (payload-literal adjacency constraint + cho phép update 2 test trong diff gate) |
| 13 | "Helper thêm học viên" không tồn tại dạng reusable; extract helpers.ts phá diff gate phase 3 | Medium | Accept | Phase 2 (spec self-contained inline setup) + Phase 3 (diff gate) |
| 14 | Fallback "evaluate set value" cho -500 trên controlled React input → state stale → xanh giả | Medium | Accept | Phase 2 (cấm evaluate; assert inputValue() trước submit) |

**Verdict reviewers đồng thuận:** fact-anchor của plan chính xác (16/18 claims vị trí verified) nhưng 3 điểm load-bearing sai (aria, cơ chế đếm, mặc định zod) — tất cả đã được corrective vào plan ở trên.

## Validation Log

### Verification Results — 2026-08-31
- **Tier:** Standard (3 phases → Fact Checker + Contract Verifier, do 3 reviewer red-team đảm nhiệm song song)
- **Claims checked:** 18 (mỗi reviewer) — consolidated: ~30 unique
- **Verified:** 27 | **Failed:** 3 (aria wiring, zod flatten, route path — tất cả đã sửa trong plan) | **Unverified:** 2 (biome baseline sẽ xác nhận khi chạy gate; issue mapping #122/#123 ngoài repo)

### Validation Decisions — 2026-08-31 (autonomous, vibe pipeline `--advice`)
Pipeline chạy autonomous (user không trả lời mid-run); 3 decision point được quyết theo evidence và ghi lại để review lại:
1. **Upper bound cho total/price**: từ chối trong PR này (finding #11) — self-harm scenario, theo nguyên tắc requested-scope là constraint. Follow-up khi có yêu cầu thật.
2. **Giữ `.default(10)`/`.default(400000)`**: đúng intent #122 (`kernel.test.ts:3148` đang assert); pin bằng test mới thay vì xóa.
3. **Không sửa `field.tsx` aria**: shared component nhiều form, cần PR riêng; e2e dùng label-scoped text nên không phụ thuộc aria.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-client-per-field-validation-and-e2e.md, phase-03-full-local-gates-and-wrapup.md
- Decision deltas checked: 9 (locator strategy, parse prescription, counter technique, enroll mandatory, defaults boundary, route paths, pnpm syntax, evaluate-fallback removal, diff gate widening)
- Reconciled stale references: 3 (bỏ "aria wiring sẵn" khỏi phase 2; bỏ "zod flatten" + path `/api/kernel/*` khỏi phase 1; bỏ "helper" reusable khỏi phase 2 + diff gate phase 3)
- Unresolved contradictions: 0
- **Post-sweep kongming catch (2026-08-31):** delta route-path chưa lan truyền hết — phase 2 counter vẫn dùng `/api/kernel/students` (URL không tồn tại → assertion phủ định vacuously green). Đã sửa thành `/api/students` + thêm yêu cầu Case C đếm khẳng định 1 POST để chứng minh counter sống trước khi tin các assertion phủ định. Sweep lại sau sửa: 0 mâu thuẫn.
