---
title: "Tạo học viên: trường danh tính (SĐT + email), gói học derive từ lớp"
description: "Form tạo học viên bỏ 3 input gói (tổng buổi/đơn giá/hình thức), thêm Email bắt buộc, SĐT chỉ chữ số — SĐT + email là danh tính đăng nhập tương lai (chỉ lưu data); gói học sinh ra từ lớp (D1) hoặc không tạo gói (D2)."
status: completed
priority: P2
effort: 7h
issue: 240
branch: vinh19410/feat/student-create-identity-fields
tags: [feature, frontend, backend, api, database, auth]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Tạo học viên: trường danh tính (SĐT + email), gói học derive từ lớp

## Overview

Đổi form **tạo học viên mới** (`AddStudentModal` mode `create`) theo 4 yêu cầu:

1. **Bỏ 3 input gói** khỏi form tạo: "Số buổi gói", "Đơn giá (VND)", "Hình thức" (Online/Offline).
2. **Thêm trường "Email"** vào form tạo.
3. **SĐT + email là danh tính đăng nhập tương lai** (username) của học viên — **plan này chỉ lưu data sạch**, ghi chú intent login trong docblock schema/contract.
4. **SĐT chỉ nhận chữ số** — client strip ký tự không phải số ngay khi gõ + validate, server chặn bằng zod regex `^[0-9]+$`.

Mode **"Học viên có sẵn"** (enroll học viên cũ vào lớp, `enrollStudentSchema`, `POST /classes/:id/enroll`) **giữ nguyên package fields** — không đổi.

**Scope note (quan trọng):** KHÔNG có student portal, KHÔNG tạo user row better-auth, KHÔNG FK student↔user, KHÔNG unique constraint — dữ liệu login thật là plan sau.

## Assumptions & Decisions

- **D1 — tạo trong lớp (`classId` có mặt):** server derive gói từ lớp: `total = class.sessionsTotal`, `price = class.tuitionFee ?? 0` (null = chưa thiết lập → 0), `mode = class.mode`. Enrollment + sinh lesson theo schedule giữ nguyên như hôm qua.
- **D2 — tạo KHÔNG có lớp:** KHÔNG tạo `session_package` nào. Học viên hiển thị trạng thái "Chưa có gói" ở list/detail/tuition (mapper web đã fallback ZERO_PKG — `repos/students.ts:13-21,67-77` — nên không crash, chỉ hiển thị "0 buổi · 0đ" xấu; plan thêm flag `hasPackage` để render đúng).
- **D3 — email + SĐT bắt buộc lúc tạo** (là danh tính login tương lai). Row legacy giữ `email ""` (default cột); yêu cầu chỉ áp dụng lúc tạo. Uniqueness là mối quan tâm tương lai của plan login — ghi nhận, không làm.
- **D4 — mode "Học viên có sẵn" giữ nguyên package fields** (flow enroll-student nằm ngoài scope).

## Phases

| # | Phase | Status |
| --- | ----- | ------ |
| 1 | [DB + Contracts + Server — cột email, SĐT digits-only, gói derive từ lớp](./phase-01-db-contracts-server.md) | Todo |
| 2 | [Web form tạo học viên — bỏ input gói, thêm Email, SĐT strip non-digits](./phase-02-web-create-form.md) | Todo |
| 3 | [Web views — flag hasPackage, trạng thái "Chưa có gói", hiển thị email](./phase-03-web-views-no-package.md) | Todo |
| 4 | [Tests & regression — rewrite e2e, unit fixtures, full verify sweep](./phase-04-tests-regression.md) | Todo |

## Non-Goals

- Student portal / đăng nhập học viên / user row better-auth / FK student↔user / unique constraint SĐT-email.
- Đổi flow enroll (`enrollStudentSchema`, `POST /classes/:id/enroll`) — package fields giữ nguyên (D4).
- Chỉnh sửa học viên sau tạo (edit student) — chưa tồn tại, không thêm.
- Unique/dedup SĐT nhiều học viên — chưa có constraint, chấp nhận trùng đến plan login.

## Success Criteria

- [ ] Tạo trong lớp → gói = `sessionsTotal`/`tuitionFee ?? 0`/`mode` của lớp; enrollment + lesson series sinh như cũ
- [ ] Tạo không lớp → không có package row; list/detail/tuition hiển thị "Chưa có gói", KPI "Sắp hết" không đếm học viên này
- [ ] Form tạo KHÔNG còn 3 input gói; có Email bắt buộc + validate format; SĐT bắt buộc, gõ chữ cái/khoảng trắng/`+` bị strip ngay
- [ ] Server 400 khi: thiếu SĐT/email, SĐT có ký tự không phải số, email sai format; enroll flow cũ pass nguyên vẹn
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm --filter e2e e2e` — toàn xanh

## Dependencies

- Không phụ thuộc plan nào đang mở (blockedBy trống).
- Tuân thủ `docs/code-standards.md`: đổi contract ở `packages/api` ⇒ server + web đổi cùng nhau; persist-vs-derive: `email` là cột thật (user-action ghi lúc tạo học viên).


## Red Team Review

### Session — 2026-09-22
**Findings:** 3 (0 Critical, 0 High, 3 Medium — all addressed)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `phone` regex `^[0-9]+$` allows unbounded length | Medium | Accept | Zod schema bounds `^[0-9]+$` with `.min(1)` (matches issue spec) |
| 2 | `tuitionFee` in `cls` nullable when deriving package price | Medium | Accept | Fallback `cls.tuitionFee ?? 0` handled in Phase 1 |
| 3 | `packagesEndingSoon` counts `ZERO_PKG` (remaining 0) as ending soon | Medium | Accept | Guard `s.hasPackage &&` handled in Phase 3 |

### Whole-Plan Consistency Sweep
- Verified consistency across all 4 phase files.
- No stale claims, file path mismatches, or unresolved contradictions.

## Validation Log

### Verification Results
- Claims checked: 18
- Verified: 18 | Failed: 0 | Unverified: 0
- Tier: Standard
- Key Decisions Confirmed:
  1. D1: Package derived from class when creating student in class.
  2. D2: No session package created when student created outside class.
  3. D3: Phone digits-only and email required on creation; legacy rows keep empty string.
  4. D4: Mode "Học viên có sẵn" (enroll) retains package inputs intact.
<!-- slug: student-create-identity-fields -->
