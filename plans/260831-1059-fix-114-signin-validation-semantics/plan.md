---
title: "fix-114-signin-validation-semantics"
description: "Sửa validation form Sign-in (/login): thông điệp required khi để trống và gỡ rule min-8 ký tự (rule sign-up) khỏi sign-in — issue #114 QC P1"
status: completed
priority: P1
effort: "2h"
tags: [bugfix, auth, login, qc]
created: 2026-08-31
issue: 114
branch: fix/114-signin-validation-semantics
route: bugfix
mode: beta
---

# fix-114-signin-validation-semantics

## Overview

Form Sign in tại `/login` đang dùng đúng các rule nhưng sai **ngữ nghĩa form**: validator `onSubmit` áp `z.email("Invalid email address")` và `z.string().min(8, "Password must be at least 8 characters")` — hai rule của **sign-up** — lên **sign-in** (`apps/web/src/components/sign-in-form.tsx:70-75`). Hậu quả (QC #114):

1. Submit để trống → "Invalid email address" + "Password must be at least 8 characters" thay vì thông điệp required.
2. Password ngắn (vd `abc`) bị chặn client-side trên sign-in dù chiều dài password là chính sách **tạo tài khoản**, không phải chính sách đăng nhập — server mới là nơi thẩm định credentials (luồng toast lỗi auth sẵn có từ #125).

## Root Cause (đã xác minh bằng đọc code, không đoán)

- `sign-in-form.tsx:70-75`: `validators.onSubmit = z.object({ email: z.email("Invalid email address"), password: z.string().min(8, "Password must be at least 8 characters") })`.
- `sign-up-form.tsx:72-77` dùng bộ rule tương tự — **đúng nơi của nó**, giữ nguyên.
- Không có test nào hiện khóa thông điệp validation sign-in (`login.smoke.spec.ts` test luồng sign-up; `auth-fail-loudly.spec.ts` test toast với input hợp lệ).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Submit Sign in để trống → "Email is required" + "Password is required" | P1 |
| 2 | Password bất kỳ độ dài (vd `abc`) KHÔNG bị chặn client; client gửi request sign-in tới server, sai credentials hiện toast lỗi sẵn có | P1 |
| 3 | Email non-empty sai format vẫn bị chặn client với "Invalid email address" | P2 |
| 4 | Regression test khóa hai ngữ nghĩa trên (unit + e2e), kể cả bảo vệ min-8 của sign-up | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| [Phase 1](./phase-01-start.md) | Sign-in validation semantics — test-first fix | Pending |

## Success Criteria

- [ ] Trên `/login` tab Sign in, submit để trống hiện "Email is required" và "Password is required" (không còn "Invalid email address"/"at least 8 characters" khi trống).
- [ ] Điền email hợp lệ + password `abc` → không có lỗi validation client; client gửi `POST /api/auth/sign-in/email` (e2e interceptor chứng minh — request bị chặn client-side chính là bug).
- [ ] Email non-empty sai format (vd `not-an-email`) → "Invalid email address".
- [ ] Sign-up form giữ nguyên semantics hiện tại, được bảo vệ bằng e2e: password `abc` ở tab Sign up vẫn bị chặn client với "Password must be at least 8 characters".
- [ ] Email có whitespace 2 đầu (vd `" a@b.com "`) pass validation VÀ payload gửi đi đã trim (không tạo bug "sai password" một tầng sâu hơn).
- [ ] `pnpm test` xanh (kể cả unit test schema mới); spec e2e mới chạy xanh local lẫn CI.

## Scope Boundary / Non-goals

- Không đổi ngôn ngữ UI (tiếng Việt hóa là issue #116 riêng). Thông điệp mới viết tiếng Anh cho nhất quán với copy hiện tại của form.
- Không sửa semantics sign-up trong PR này (empty-field copy của sign-up là follow-up riêng — xem Follow-ups).
- Không đụng forgot-password, tab UX, server-side validation, error-message mapping của `authErrorMessage`.

## Related Code Files

- Modify: `apps/web/src/components/sign-in-form.tsx` (validators.onSubmit + trim payload email tại onSubmit)
- Create: `apps/web/src/lib/sign-in-schema.ts` (schema dùng chung + hằng số thông điệp)
- Create: `apps/web/src/lib/sign-in-schema.test.ts` (unit, TDD red-first)
- Create: `apps/e2e/specs/signin-validation.spec.ts` (regression e2e)
- Tham chiếu, không sửa: `apps/web/src/components/sign-up-form.tsx`, `apps/e2e/specs/auth-fail-loudly.spec.ts`, `apps/web/src/components/auth/auth-field.tsx`, `apps/web/src/routes/login.tsx` (tab mặc định là signup + localStorage `teacher-os-auth-tab` — e2e bắt buộc click tab Sign in trong context mới), `apps/web/src/components/auth/auth-tabs.tsx`, `apps/web/src/components/auth/submit-button.tsx` (cơ chế `disabled={!canSubmit}`)

## Follow-ups (ngoài scope PR này)

- Sign-up form cùng bug empty-field copy (submit trống hiện "Invalid email address"/"at least 8 characters" thay vì required) — tạo issue riêng khi close #114, link lại đây.

## Risks

- TanStack Form (form-core 1.33.5): sau lần submit fail, `canSubmit` giữ `false` cho tới lần submit kế tiếp (validator `onSubmit` chỉ chạy ở event submit, `isValid` không hồi phục khi user sửa input) — hành vi định nghĩa của thư viện. Hệ quả: mỗi scenario e2e phải là `test()` riêng với page mới; không phải regression, không file issue.
- Zod 4.4.3 đã xác nhận hỗ trợ `.pipe()` (lockfile); fallback `refine` nếu unit test đỏ do API — contract test không đổi.
- `trim()` trong schema CHỈ tác dụng lên validation output (TanStack Form đọc `issues`, vứt parsed value) — payload thật phải trim tay tại `onSubmit` (`value.email.trim()`), nếu không email có padding sẽ pass client rồi fail auth với toast sai ngữ nghĩa. Password KHÔNG trim (space là ký tự hợp lệ).

## Red Team Review

### Session — 2026-08-31
**Findings:** 9 (8 accepted, 1 rejected)
**Severity breakdown:** 1 High, 8 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | canSubmit kẹt disabled sau submit fail (form-core 1.33.5: onSubmit validator chỉ chạy event submit) → e2e (b) bất khả thi trên cùng page với (a); Risk Assessment gốc dán nhãn sai "regression timing" | High | Accept | Phase 1 (e2e steps, Risk Assessment) |
| 2 | `trim()` transform bị form-core discard (chỉ đọc `issues`) → email padding pass client, fail server, toast sai nghĩa | Medium | Accept | Phase 1 (Requirements/Architecture/Steps) |
| 3 | E2e 401 underspecified: pattern tham chiếu hardcode 200, thiếu CORS → verify nhầm nhánh catch; mệnh đề "đi tới server" sai (interceptor chứng minh client gửi, không phải server nhận) | Medium | Accept | Phase 1 (e2e step 4) |
| 4 | Mâu thuẫn nội bộ: 6 case liệt kê vs "7 case" ở Success Criteria | Medium | Accept | Phase 1 |
| 5 | Criterion "sign-up vẫn chặn <8" không có test bảo vệ (login.smoke + auth-fail-loudly đều dùng password 8 ký tự) | Medium | Accept | Phase 1 (thêm e2e case c) |
| 6 | Gates local không chạy spec e2e mới (apps/e2e không có script `test`; e2e chỉ chạy CI) | Medium | Accept | Phase 1 (step 5) |
| 7 | Related Code Files thiếu login.tsx (tab mặc định signup + localStorage), auth-tabs.tsx, submit-button.tsx | Medium | Accept | plan.md + Phase 1 |
| 8 | Đề xuất thêm unit case shape lỗi better-auth cho `authErrorMessage` | Medium | Reject | — |
| 9 | Sign-up cùng bug empty-field copy, de-scope không track → chắc chắn refile QC | Medium | Accept | Follow-ups section |

**Rejection rationale #8:** error-message mapping là mối quan tâm riêng, đã có `auth-error.test.ts` phủ fallback; e2e mới assert toast hiện diện không pin text nên không phụ thuộc mapping — thêm case shape mở scope ngoài #114.

### Whole-Plan Consistency Sweep

- Đối chiếu lại plan.md ↔ phase-01-start.md sau khi áp: số case unit (6) đồng bộ; ba scenario e2e (a/b/c) mô tả nhất quán ở cả hai file; thuật ngữ "request đi tới server" đã thay bằng "client gửi request" ở mọi chỗ (Goals #2, Success Criteria, phase steps); trim-semantics xuất hiện nhất quán ở Requirements/Architecture/Steps/Risks; danh sách file tham chiếu khớp.
- Không còn mâu thuẫn chưa giải quyết.

<!-- slug: fix-114-signin-validation-semantics -->
