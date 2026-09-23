---
title: "Enrollment invite → accept flow"
description: "Thêm vòng đời trạng thái enrollment: 'Đã mời' khi thêm học viên vào lớp, chỉ chuyển 'Đang học' sau khi được đồng ý (portal API seam hoặc nút kích hoạt của teacher); kèm hủy lời mời và chặn hóa đơn/bài tập trên enrollment invited."
status: pending
priority: P1
effort: 15h
issue: 253
branch: vinh19410/feat/enrollment-invite-accept-flow
tags: [feature, backend, api, database, frontend]
blockedBy: []
blocks: []
created: 2026-09-23
---

# Enrollment invite → accept flow

## Overview

Hiện tại thêm học viên vào lớp là có ngay trạng thái đang học: bảng `enrollment` không có cột status, và enroll tạo luôn session package + chuỗi buổi học. Plan này tách làm 2 bước: khi teacher thêm học viên, enrollment ở trạng thái **`invited` (Đã mời)** — chưa có gói/buổi học; enrollment chuyển **`active` (Đang học)** khi được "đồng ý tham gia" qua endpoint accept — caller hiện tại là nút "Kích hoạt" trên roster admin, sau này là student portal (đang phát triển riêng) — và lúc đó mới sinh gói + buổi học.

## Scope Challenge (HOLD)

- Tồn tại sẵn: enroll endpoint atomic batch (`apps/server/src/routes/kernel.ts:601-672`), contract-first 4 tầng, unique `(classId, studentId)`. Chưa từng có status/invite.
- Scope yêu cầu (bảo toàn đủ): status lifecycle invited→active, accept API seam, admin UI hiển thị trạng thái, sĩ số chỉ đếm đang học. Mở rộng sau red-team (user chốt 2026-09-23): nút "Kích hoạt" của teacher + hủy lời mời (xem D4, D5).

## Decisions

| # | Quyết định | Nội dung |
|---|-----------|----------|
| D1 | API seam cho portal | Student portal (phát triển riêng) gọi accept API qua contract này; plan này không xây portal/auth học viên. |
| D2 | Sinh gói/buổi khi accept | `invited` = chưa có session package/lessons/hóa đơn/bài tập. Chỉ khi `active` mới sinh. |
| D3 | Sĩ số chỉ đếm đang học | Roster vẫn hiện học viên "Đã mời" (badge), KPI sĩ số chỉ đếm `active`. |
| D4 | Nút "Kích hoạt" của teacher (red-team critical) | Teacher kích hoạt invited→active ngay trên roster qua CHÍNH endpoint accept (1 endpoint, 2 caller) — đóng "cửa sổ chết" trước khi portal ra mắt. Không cần endpoint thứ hai. |
| D5 | Hủy lời mời (red-team high) | `DELETE /api/enrollments/:enrollmentId` CHỈ cho status `invited` (vùng an toàn: chưa có package/buổi/hóa đơn tham chiếu). |

## Non-goals

- Student portal UI + student auth (login, link `student`↔`user`) — project riêng, xem `open-design/student-portal-prompt.md`. Lưu ý bắt buộc cho project đó: xem "Portal integration constraints" dưới đây.
- Flow học viên "từ chối lời mời" (D5 là hủy bởi teacher, không phải từ chối bởi học viên).
- Re-enroll sau khi rời lớp (unique `(classId, studentId)` giữ nguyên).

## Portal integration constraints (ghi chú ràng buộc cho `260923-0641-student-portal-app`)

Plan portal đã tồn tại (`plans/260923-0641-student-portal-app/plan.md`, v1 read-only). Khi portal làm flow "đồng ý tham gia lớp" (write follow-up), gọi activation qua các ràng buộc sau:

1. **Org-isolation**: `bootstrapMiddleware` (`apps/server/src/app.ts:66-76`) tự tạo org + membership `teacher` cho MỌI user mới → gọi thẳng accept org-scoped của kernel sẽ luôn 404 với student-user. Portal plan đã chọn hướng "skip bootstrap cho `/api/student/*`" — flow accept của portal phải đi qua bridge student-scoped của họ (resolve danh tính qua `student.email` verified) và TÁI SỬ DỤNG logic activation (flip status + sinh package/lessons) của plan này, không viết riêng.
2. **CORS/Origin**: POST kernel yêu cầu Origin === corsOrigin (`kernel.ts:137-148`) — portal plan đã có mục trustedOrigins multi-origin; giữ đồng bộ khi bật flow write.
3. **Ownership**: chấp nhận kết quả resolve email của bridge portal làm bằng chứng quyền sở hữu enrollment (student chỉ thấy/accept enrollment của mình). Hiện tại (trước portal) mọi teacher trong org gọi được accept qua nút Kích hoạt — chấp nhận có chủ đích.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [DB schema & API contract](./phase-01-db-contract.md) | Pending |
| 2 | [Server: enroll tạo invited + accept/cancel + guards](./phase-02-server-invited-and-accept.md) | Pending |
| 3 | [Web: roster status UI, kích hoạt, sĩ số](./phase-03-web-roster-status-ui.md) | Pending |
| 4 | [E2E, regression & docs](./phase-04-e2e-regression-docs.md) | Pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| Related (tiền đề dữ liệu) | `260922-0716-student-create-identity-fields` (email/SĐT danh tính login tương lai) | completed |
| Depended-on-by | `260923-0641-student-portal-app` — flow write "đồng ý tham gia lớp" của portal sẽ tái dùng contract activation của plan này | pending |

## Success Criteria

- [ ] Thêm học viên vào lớp (cả 2 đường: enroll-existing và tạo-mới-có-lớp) → enrollment `invited`, KHÔNG sinh package/lessons; KPI sĩ số không đổi.
- [ ] `POST /api/enrollments/:enrollmentId/accept` (portal seam + nút Kích hoạt dùng chung) chuyển `invited`→`active`, sinh đúng 1 package + chuỗi buổi học; idempotent kể cả khi gọi SONG SONG (không 500).
- [ ] `DELETE /api/enrollments/:enrollmentId` xóa được enrollment `invited`; bị chặn (409) khi `active`.
- [ ] Không tạo được hóa đơn (`POST /invoices` → 409) và không gán được bài tập cho học viên `invited`.
- [ ] Roster hiển thị badge "Đã mời"/"Đang học" + nút Kích hoạt/Hủy lời mời cho invited; picker "Học viên có sẵn" và picker hóa đơn loại invited.
- [ ] Enrollment cũ sau migration tự động là `active` — dữ liệu hiện hữu không đổi hành vi.
- [ ] Toàn bộ vitest + contract tests + e2e (12 spec liên quan) xanh.

## Reports

- [reports/scout-report-enrollment.md](./reports/scout-report-enrollment.md)
- [reports/scout-report-auth-portal.md](./reports/scout-report-auth-portal.md)

## Validation Log

### Pre-draft decisions (interview) — 2026-09-23
1. Phạm vi portal: **API seam, portal làm riêng** (→ D1).
2. Thời điểm sinh gói/buổi học: **khi accept** (→ D2).
3. Sĩ số: **chỉ đếm đang học** (→ D3).

### Verification Results (gộp từ red-team session 2026-09-23)
- **Tier:** Standard (Fact Checker + Contract Verifier, 3 reviewer song song)
- **Claims checked:** ~85 (có trùng lặp giữa reviewer) — **Verified:** ~68 | **Failed:** 13 (mỗi failed map 1-1 vào finding, đã fix) | **Unverified:** 4 (đã xử lý: migration SQL syntax OK với SQLite/D1; scripts root xác minh tồn tại)
- **Failures đã xử lý:** skeleton.ts là nhiệm-vụ-ma (bỏ, đổi thành verify-only); invoice/assignments thiếu guard (thêm); reducer sót action `add-student` (thêm); điểm vỡ type là fixtures (sửa phase 1); e2e blast radius 12 spec (liệt kê đủ); note "lịch lớp có thể đổi" sai (sửa + pin tuitionFee).
- **Deploy sequencing:** an toàn (migration default `active` + Alchemy apply trong deploy) — không phải finding.

### Post-red-team decisions (interview) — 2026-09-23
4. Cửa sổ chết sau merge: **thêm nút Kích hoạt admin** (→ D4).
5. Hoàn tác nhầm mời: **thêm DELETE invited-only** (→ D5).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01..04 sau khi áp 13 findings + D4/D5.
- Unresolved contradictions: 0.


## Red Team Review

### Session — 2026-09-23
**Findings:** 13 (13 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 5 High, 7 Medium
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst (3 reviewer song song, verification tier Standard)
**User decisions from findings:** D4 (nút kích hoạt admin), D5 (hủy lời mời) — chốt 2026-09-23.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Cửa sổ chết: không đường kích hoạt nào sau merge, enrollment kẹt invited vĩnh viễn | Critical | Accept (user chọn thêm nút Kích hoạt) | plan.md D4, Phase 2, Phase 3 |
| 2 | Org-scoping + bootstrap chặn portal gọi accept (student-user luôn 404) | High | Accept (document ràng buộc) | plan.md Constraints, Phase 2, Phase 4 |
| 3 | POST /invoices + AddInvoiceModal vẫn cho lập hóa đơn cho invited | High | Accept (guard 409 + lọc picker) | Phase 2, Phase 3 |
| 4 | Reducer còn action `add-student` (122-123) append studentIds; `enroll-student` bịa pkg | High | Accept | Phase 3 |
| 5 | Accept check-then-batch TOCTOU → double accept song song trả 500 | High | Accept (CAS UPDATE WHERE status='invited') | Phase 2 |
| 6 | Bước "sửa skeleton.ts" là nhiệm vụ ma (file không biết enrollment) | Medium | Accept (thay bằng verify + sửa invariant comment) | Phase 2 |
| 7 | Blast radius e2e là 12 spec, plan liệt kê 3; projected-sessions đổi semantics | High | Accept (liệt kê đủ + helper + quyết projection) | Phase 4 |
| 8 | Assignments route validate roster không lọc status → gán bài cho invited | Medium | Accept (predicate active + test) | Phase 2 |
| 9 | Nhầm mời không thể hoàn tác (không delete, 409 re-invite) | Medium | Accept (user chọn thêm DELETE invited) | plan.md D5, Phase 2 |
| 10 | Phase 1 chỉ sai điểm vỡ type (fixtures mới là chỗ vỡ); Phase 3 mâu thuẫn derive vs snapshot field | Medium | Accept | Phase 1, Phase 3 |
| 11 | Note "lịch lớp có thể đổi" sai (schedule immutable); tuitionFee drift lúc accept chưa pin | Medium | Accept (sửa note + test pin price) | Phase 2 |
| 12 | Rollback/recovery: invited rows sống qua rollback không có runbook | Medium | Accept (mục runbook Phase 4) | Phase 4 |
| 13 | lesson-date-integration.test.ts đảo premise; 34 setup addStudent cần helper chung | Medium | Accept (helper addActiveStudent) | Phase 2, Phase 4 |

Deploy sequencing (đã verify, không phải finding): migration trước code an toàn nhờ default `'active'` + Alchemy apply D1 migrations trong deploy (`packages/infra/alchemy.run.ts:60-62`, `docs/production-release-runbook.md:199-200`); code cũ + cột mới cũng an toàn.

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01..04 (sau khi áp 13 findings + D4/D5).
- Decision deltas checked: D4 (nút Kích hoạt = endpoint accept, không endpoint mới), D5 (DELETE invited-only), skeleton.ts bỏ khỏi scope, invoices/assignments guards, CAS idempotency, projection giữ "Dự kiến" đến khi accept, e2e 12 spec.
- Reconciled stale references: Non-goals bỏ "endpoint kích hoạt thủ công làm plan sau"; Success Criteria thêm accept-song-song/DELETE/guards; effort 12h→15h.
- Unresolved contradictions: 0.
