---
title: "Student Portal: thêm app học viên vào monorepo (login + tổng quan)"
description: "Thêm apps/student (React SPA tái dùng packages/ui + Better-Auth), trang login học viên và trang tổng quan sau login; server thêm API student-scoped bridge qua student.email; infra derive student.<domain>."
status: pending
priority: P1
effort: 29h
issue: 254
branch: vinh19410/feat/student-portal-app
tags: [feature, frontend, backend, api, auth, infra]
blockedBy: []
blocks: []
created: 2026-09-23
---

# Student Portal: thêm app học viên vào monorepo (login + tổng quan)

## Overview

Thêm app thứ 4 vào monorepo: `apps/student` — student portal cho học viên (SPA Vite + React 19 + TanStack Router/Query, port 8003), tái dùng `@teacher-os/ui`, `@teacher-os/auth` (client), `@teacher-os/env`, `@teacher-os/api`. Scope: (1) scaffold app, (2) server bridge danh tính học viên qua `student.email` + API student-scoped read-only, (3) trang login học viên, (4) trang tổng quan ("Tổng quan" — lớp đang học + bài tập) theo design contract `open-design/student-portal-prompt.md`, (5) infra topology + docs. Toàn bộ chi tiết kỹ thuật dựa trên `reports/scout-report.md`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `apps/student` boot được ở :8003, qua được CI (biome/test/check-types/build) | P1 |
| 2 | Học viên login được (Google + email/password) bằng đúng backend Better-Auth hiện có | P1 |
| 3 | Server nhận diện user↔student qua email khớp (`student.email`) với điều kiện email đã **verified**; fail-closed khi mơ hồ; 403 `STUDENT_NOT_LINKED`/`STUDENT_AMBIGUOUS` | P1 |
| 4 | Trang tổng quan hiển thị lớp đang học + bài tập (4 trạng thái) read-only, mobile-first, tiếng Việt | P1 |
| 5 | CORS/trustedOrigins multi-origin + topology `student.<domain>` deploy được | P2 |

### Non-goals

- Không có trang submit bài / tương tác write nào của học viên (read-only).
- Không đụng DB schema (không unique index cho `student.email`, không cột role — ghi risk, để plan sau).
- Không xây flow gửi email verification (cần infra gửi mail) — vì vậy **chỉ user có `emailVerified=true`** (Google) mới bridge được; account email/password chưa verify sẽ thấy "chưa liên kết". Bật verification flow là plan follow-up.
- Không xây bảng link `user_id↔student_id` do teacher phê duyệt (chốt danh tính chắc chắn nhất) — follow-up nếu cross-org collision thực tế xảy ra.
- Không chặn role ở kernel routes (user học viên vẫn là "teacher" hợp lệ trên org rác tự tạo của mình khi gọi API trực tiếp) — accepted-risk có ghi nhận, role-guard là follow-up.
- Không thêm e2e Playwright cho student app (follow-up); unit/contract test có trong từng phase.
- Không dựng SPA 404 branded + robots.txt như web (worker mỏng là đủ cho v1).
- Không refactor web dùng chung auth-client factory (student tự giữ bản local, extraction để sau).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Scaffold app `apps/student`](./phase-01-start.md) | Pending |
| 2 | [Server: student bridge + API student-scoped](./phase-02-server-student-bridge.md) | Pending |
| 3 | [Trang login học viên](./phase-03-student-login.md) | Pending |
| 4 | [Trang tổng quan học viên](./phase-04-student-overview.md) | Pending |
| 5 | [Infra topology + docs](./phase-05-infra-topology.md) | Pending |

## Success Criteria

- [ ] `pnpm dev:student` chạy `apps/student` ở http://localhost:8003; `pnpm check`, `pnpm check-types`, `pnpm build`, `pnpm test` xanh.
- [ ] Login bằng Google hoặc email/password trên :8003 → vào trang tổng quan; user không khớp `student.email` (hoặc email chưa verified, hoặc mơ hồ nhiều row) thấy màn hình lỗi tương ứng + đăng xuất.
- [ ] Tổng quan hiển thị đúng lớp (progress "Buổi 12/24", buổi tới) và bài tập (Sắp đến hạn/Quá hạn/Đã nộp/Điểm) từ API `/api/student/*`, chỉ data của học viên đó.
- [ ] `CORS_ORIGIN` chấp nhận danh sách origin (cả nhánh topology lẫn nhánh dev local); trustedOrigins gồm origin student; topology derive `student.<domain>`; deploy định nghĩa được worker student.

## Dependencies

- Không bị plan khác chặn. Dựa trên nền có sẵn: Better-Auth cross-subdomain cookie (#125), `student.email` (migration 0021), design contract trong `open-design/`.

## Red Team Review

### Session — 2026-09-23
**Findings:** 25 thô → 13 cụm sau dedup (13 accepted — phần lớn Accept (modified), 0 rejected sau evidence filter)
**Severity breakdown:** 2 Critical, 6 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Bridge email không kiểm tra `emailVerified` → impersonation qua signup email/password | Critical | Accept | Phase 2, 3, plan Non-goals |
| 2 | Resolver email GLOBAL không scope org → cross-org pick / email planting | Critical | Accept (modified) | Phase 2 (fail-closed `STUDENT_AMBIGUOUS`), Non-goals (link-table follow-up) |
| 3 | Claim "bootstrap vô hại / không write" sai; student user giữ session teacher trên org rác | High | Accept | Phase 2 (skip bootstrap cho /api/student), Non-goals (accepted-risk) |
| 4 | Google callbackURL phải absolute (`window.location.origin`), không phải relative "/" | High | Accept | Phase 3 |
| 5 | `kernel.ts` là consumer thứ 3 của corsOrigin (CSRF check `!==`) — bỏ sót sẽ chết write giáo viên | High | Accept | Phase 2 |
| 6 | `SessionUser` không có email/emailVerified — middleware như đặc tả không chạy được | High | Accept | Phase 2 |
| 7 | Dev default CORS chỉ :8001; drift-test regex vỡ với list; server không có script dev riêng | High | Accept | Phase 1 (script `dev`), Phase 3, 5 |
| 8 | Grading rows: không classId, `due` free-text/`""` → derive sai "Quá hạn" | High | Accept | Phase 2 (nullable contract), Phase 4 (luật derive) |
| 9 | Email match không lower/trim — student hợp lệ bị 403 | Medium | Accept | Phase 2 |
| 10 | 401 giữa session không được đưa về login (guard chỉ chạy lúc navigate) | Medium | Accept | Phase 1 (query-client 401 handler) |
| 11 | Hạ guard CORS từ throw xuống warning là rollback hole | Medium | Accept | Phase 5 (giữ throw) |
| 12 | Không có `.env`/`.env.example` cho apps/student — fresh clone không boot | Medium | Accept | Phase 1, 5 |
| 13 | "vitest + testing-library như web" là precedent không tồn tại (web dùng renderToStaticMarkup, node env) | Medium | Accept | Phase 3 |

Kiểm chứng chính đã thực hiện trong session: verified `student.email` docblock (`packages/db/src/schema/student.ts:18-21`), `trustedOrigins: [input.corsOrigin]` (`packages/auth/src/index.ts:53`), bootstrapMiddleware write (`apps/server/src/app.ts:63-77`), kernel CSRF origin check (`apps/server/src/routes/kernel.ts:131,137-145`), `SessionUser` chỉ userId/userName (`apps/server/src/session.ts:3-6`), dev CORS default 8001 (`packages/infra/alchemy.run.ts:52-58`), absolute callbackURL comment (`apps/web/src/components/google-oauth-button.tsx:44-48`), web test pattern (`apps/web/src/components/sign-in-form.test.tsx:1-13`).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-05, reports/scout-report.md.
- Decision deltas checked: 13 (emailVerified gate, fail-closed ambiguity, bootstrap skip cho /api/student, absolute callbackURL, kernel corsOrigins array, SessionUser mở rộng, dev CORS list, nullable classId, due "" luật, band derive client-side, throw guard giữ nguyên, .env.example, test pattern web).
- Reconciled stale references: toàn bộ Key Insights/Requirements/Steps/Risk của 5 phase đã viết lại theo deltas; plan.md Goals/Non-goals/Success Criteria đồng bộ.
- Unresolved contradictions: 0.

## Validation Log

### Session — 2026-09-23 (autonomous)
- Verification pass: thực hiện qua red-team (Full-tier fact-check với file:line trên mọi claim load-bearing — xem Red Team Review); spot-check bổ sung xác nhận `packages/api/src/vietnam-date.ts`, `packages/api/src/contracts.ts`, `packages/ui/src/components/empty.tsx`, `packages/auth/src/topology.test.ts` tồn tại.
- Claims checked: ~40 (qua 3 reviewer) · Verified: ~40 · Failed: 0 (sau khi áp findings) · Unverified: 0
- Session phỏng vấn validate thay bằng ghi nhận quyết định (chạy autonomous, không chặn user):
  1. **Bridge email chỉ với `emailVerified=true`** — cân bằng bảo mật/usability; email/password chưa verify không đọc được data (thấy màn hình hướng dẫn). Alternative bị loại: bật requireEmailVerification (cần infra gửi mail — follow-up).
  2. **Fail-closed `STUDENT_AMBIGUOUS`** khi >1 row email khớp — an toàn hơn pick-earliest (tránh cross-org pick). Alternative bị loại: bảng link teacher-approve (scope lớn — Non-goals).
  3. **Skip bootstrap cho `/api/student`** — tránh bơm org rác từ portal; rủi ro còn lại (student user = teacher session hợp lệ khi gọi API trực tiếp) là accepted-risk có ghi nhận.
- Whole-plan consistency sweep: sạch (0 unresolved — xem Red Team Review).
