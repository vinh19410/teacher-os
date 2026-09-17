---
title: "Fix #165: Auth submit deadlock sau lần submit invalid đầu tiên"
description: "TanStack Form v1 giữ errorMap cause onSubmit vĩnh viễn → sau 1 lần submit invalid, canSubmit=false mãi mãi dù user sửa đúng → nút submit khóa cứng + handleSubmit silent no-op. Fix: clear errorMap của field khi user edit (clear-error-on-edit), giữ validation onSubmit-only."
status: completed
priority: P1
effort: 3h
issue: 165
branch: fix/165-auth-form-hidden-validation
tags: [frontend, bugfix, auth]
blockedBy: []
blocks: [142]
created: 2026-09-17
---

# Fix #165: Auth submit deadlock sau lần submit invalid đầu tiên

## Overview

Issue #165 mô tả "nút submit disabled che mất validation — user không thấy lỗi field". Điều tra thực tế (spike headless với `FormApi` thật, TanStack Form v1.33.2) **sửa lại root cause**:

1. **Fresh form: nút KHÔNG disabled** (`canSubmit=true` khi untouched) — mô tả "chết từ đầu" trong issue không đúng.
2. **Deadlock thật**: sau MỘT lần submit invalid — `canSubmit=false`, lỗi render đúng — nhưng khi user sửa giá trị, errorMap cause `onSubmit` **không bao giờ được re-validate/clear** (TanStack chỉ re-validate từng cause đúng cause của nó; không có validator onChange/onBlur) → `canSubmit=false` vĩnh viễn → nút disabled mãi, và `handleSubmit()` **early-return khi `canSubmit=false`** (đã đo: submitted=0 sau khi sửa đúng) → ngay cả khi force-enable nút, submit vẫn silent no-op.
3. Kết quả quan sát của QA ("nút chết, không giải thích") khớp với deadlock: user bấm submit với data invalid → lỗi hiện 1 lần → mọi nỗ lực sửa + bấm lại đều vô hiệu.

Fix đã được xác chứng headless end-to-end (spike pass): giữ validation `onSubmit`-only (giữ nguyên semantics required-first của #114), thêm **clear errorMap của field khi user edit field đó** (pattern clear-error-on-edit). Kết quả: edit 1 field → lỗi field đó biến mất + `canSubmit` hồi phục khi mọi field hợp lệ → resubmit thành công.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Hết deadlock: sau submit invalid, user sửa được và resubmit thành công (không reload) | P1 |
| 2 | Bảo toàn UX hiện có: required-first messages khi submit (#114, #142), lỗi hiển thị per-field qua AuthField, nút chỉ disable khi đang submitting hoặc form đang invalid-với-lỗi-hiển-thị | P1 |
| 3 | Không đổi schema auth, không đổi authClient, không đổi lỗi hiển thị (chi profile khác) | P2 |

## Non-Goals

- Không thêm validation live onChange/onBlur (noise khi gõ; đã thử — errorMap cause onSubmit vẫn kẹt, không phá được deadlock).
- Không đổi copy lỗi hay bilingual hóa (#116, #118 là issue riêng).
- Không động vào #142 (copy required-first) — fix này chỉ mở khóa acceptance của nó.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Extract signUpSchema + helper reset-field-errors + wire 2 form + tests](./phase-01-deadlock-fix.md) | Pending |

## Success Criteria

- [ ] Headless regression test: submit invalid → edit (helper) → `canSubmit=true` → `handleSubmit()` submit được (đo được `onSubmit` callback chạy).
- [ ] SSR static test: cả 2 form render nút submit **không có attr `disabled`** khi fresh mount.
- [ ] `pnpm --filter web test` xanh toàn bộ; `biome check` + `tsc` không lỗi mới.
- [ ] Manual verify `/login`: submit trống → thấy required errors; sửa email/password → lỗi biến mất theo field, nút bật lại, resubmit thành công.

## Verification Commands

```bash
pnpm --filter @teacher-os/web test        # apps/web vitest
cd apps/web && npx biome check src        # lint
cd apps/web && npx tsc --noEmit           # typecheck
```

## Red-Team Record (4 personas, 2026-09-17)

**Assumptions** — "fresh canSubmit=true" và "handleSubmit early-return khi !canSubmit" đều đã đo headless (spike), không phải suy diễn. Riêng generic `FormApi<TFormData, never, ...>` trong helper là giả định chưa đối chiếu signature v1.33 → xác minh lúc implement, fallback `any`-scoped có comment (đã ghi trong phase-01). Không blocker.

**Failure** — (F1) clear errorMap giữa chừng không xung đột state async (form không có async validator). (F2) double-click khi submitting vẫn được chặn bởi `isSubmitting`. (F3) Residual: wiring onChange→resetFieldErrors (3 dòng/form) không cover bởi unit test do env node không DOM — bù bằng headless test của helper + manual smoke + review. Chấp nhận, không blocker.

**Scope** — extract signUpSchema phục vụ testability + #142: in scope. onBlur/onChange live validation: de-scope có căn cứ (đã thử, errorMap cause onSubmit vẫn kẹt — không phá được deadlock). Không scope creep.

**Security** — không đổi auth flow; validation client chỉ là UX, server (better-auth) vẫn source of truth; test mock không chứa dữ liệu thật. Không blocker.

**Verdict: GO** — 0 blocker, 2 residual notes (generic signature, wiring coverage).
