---
title: "TOS-25: Phát hiện tệp đề trùng mã băm và mở lại bản đề nháp cũ với chi phí 0 Credit"
description: "Trước khi tạm giữ Credit, tra content_fingerprint (SHA-256) của tệp trong cùng tổ chức; trùng job completed thì không gọi AI, không giữ/trừ Credit và hiện thanh thông báo kèm nút Mở lại bản nháp cũ (0 Cr)."
status: completed
priority: P0
effort: 1d
issue: 471
branch: ai-handle-issue-471
tags: [feature, backend, frontend, e2e]
blockedBy: [470]
blocks: []
created: 2026-10-27
---

# Plan: TOS-25 — Chống trùng mã băm, mở lại bản nháp cũ 0 Credit

## Overview

AC-002 của US-005 (FR-selfomy-alignment-015, BR-selfomy-alignment-005):

> Tệp "Cambridge-18-Test-2.pdf" đã từng bóc tách thành công trong cùng tổ chức → người dùng tải lại tệp có cùng `content_fingerprint` lên màn `[6]` → hệ thống **không gọi AI, không tạm giữ/khấu trừ 5 Credit** (0 Credit) → hiện **thanh thông báo phát hiện đề trùng** kèm nút **"Mở lại bản nháp cũ (0 Cr)"** để chỉnh sửa tiếp ngay.

Nguồn: Jira [TOS-25](https://teacher-os.atlassian.net/browse/TOS-25) (subtask của TOS-20 / US-005 · AC-002), `docs/selfomy-alignment/userstories/us-005.md`, UC ext 3a (`docs/selfomy-alignment/usecases/uc-ai-exam-import.md`), wireframe `ai-teaching-assistant-flow.md#Screen: ai-exam-import-workspace` mục 3–4.

## Scope Challenge

- **Phụ thuộc TOS-24:** bảng `exam_import_job` đã có `content_fingerprint` + index `(org_id, content_fingerprint)`, `POST /api/exam-imports`, màn `[6]`, `GET /api/exam-imports/:id`.
- **Việc còn lại:** tra trùng trước reserve, endpoint kiểm tra trùng sớm (không upload lại), banner + nút mở lại.
- **Mode:** fast + scout, HOLD SCOPE.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Mã băm = SHA-256 trên byte tệp gốc**, tính ở **cả client** (`crypto.subtle.digest` trước khi upload) **và server** (nguồn sự thật, chống client giả mạo). Dedupe phía client là **best-effort fail-open**: `crypto.subtle` vắng (non-secure context) hay lookup lỗi/network fail → log + upload thẳng như TOS-24, KHÔNG bao giờ chặn luồng upload (lớp POST của server vẫn bảo đảm 0 Credit). | Client tính để không phải upload lại 15 MB khi trùng; server tính lại để không tin input. |
| D2 | **Định nghĩa "trùng"**: cùng `org_id` + cùng `content_fingerprint` + job `import_status = 'completed'` (mới nhất) **và `draft_json` parse được (không NULL)**. Job `failed_refunded` / `processing` **không** tính là trùng; job `completed` thiếu draft (cửa sổ crash-sau-settle, `exam-imports.ts` nhánh `settled` retry) cũng **không** tính — cho import lại thay vì khoá vĩnh viễn. | BR-005 nói "đã trích xuất thành công"; job lỗi phải cho bóc tách lại (TOS-27); job completed-mất-draft không có gì để "mở lại". |
| D3 | **Endpoint kiểm tra sớm** `GET /api/exam-imports/lookup?fingerprint=<hex>` → `{ duplicate: { jobId, title, completedAt } | null }` (`title` lấy từ `draft_json`, fallback `fileName`, nullable); client gọi trước upload. `POST /api/exam-imports` **cũng** tra trùng sau khi tính fingerprint server-side, trước `reserveCredits`: trùng → 200 `{ duplicateOf: { jobId, title, completedAt } }` (CÙNG shape lookup — thống nhất một contract, không dùng `{ duplicateOf: jobId }`), không lưu R2, không tạo job, không ghi `credit_usage_log`. Response POST success từ nay là union: job DTO **hoặc** `{ duplicateOf }` — client parse union, không parse cứng job DTO. Cả lookup lẫn nhánh dedupe trong POST đều yêu cầu role `canImportExam` (teacher/owner, như POST) — chống oracle dò fingerprint từ role chỉ-xem. | Hai lớp: UX nhanh + bảo đảm 0 Credit kể cả khi bỏ qua bước lookup. |
| D4 | **Mở lại bản nháp** = điều hướng `/assignments/tests/import?job=<jobId cũ>` (luồng hiển thị của TOS-24 đọc `draft_json` hiện tại — gồm cả chỉnh sửa đã lưu ở TOS-26). Không clone job. | "Chỉnh sửa tiếp" trên đúng bản nháp; không phát sinh dữ liệu trùng. |
| D5 | **Banner** (`Alert` tone info): "Phát hiện tệp trùng mã băm với đề "<title>" đã bóc tách ngày <dd/MM/yyyy>." (`<title>` = `draft_json.title`, fallback `fileName`; hiếm khi null → hiển thị "đã bóc tách trước đó" không kèm tên) + nút secondary **"Mở lại bản nháp cũ (0 Cr)"**; không tự điều hướng. | Wireframe mục 3–4. |
| D6 | Fingerprint là định danh nội dung, không phải bí mật, nhưng lookup **org-scoped** để không dò được đề của tổ chức khác. | Cô lập dữ liệu giữa tổ chức. |

## Non-goals

- So khớp gần đúng (cùng đề nhưng scan khác) — chỉ khớp byte chính xác.
- Chia sẻ bản nháp giữa các tổ chức.

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-dedupe-api.md](phase-01-dedupe-api.md): `findCompletedImportByFingerprint`, lookup endpoint, nhánh trùng trong POST | 3h | completed | TOS-24 |
| 2 | [phase-02-duplicate-banner-ui.md](phase-02-duplicate-banner-ui.md): hash client, banner + nút mở lại | 3h | completed | 1 |
| 3 | [phase-03-e2e-ac-002.md](phase-03-e2e-ac-002.md): E2E tải lại cùng tệp → 0 Credit | 2h | completed | 2 |

## Acceptance criteria (từ AC-002)

- [x] Tải lại tệp cùng byte trong cùng tổ chức → extractor không được gọi (spy = 0 lần), không có dòng `credit_usage_log` mới, số dư ví không đổi.
- [x] Màn `[6]` hiện banner trùng + nút "Mở lại bản nháp cũ (0 Cr)"; bấm → mở đúng job cũ với nội dung nháp.
- [x] Cùng tệp ở tổ chức khác → không bị coi là trùng (bóc tách bình thường).
- [x] Job cũ `failed_refunded` → không coi là trùng.

## Validation

- `pnpm --filter server test -- exam-imports`, `pnpm --filter web test -- import`, `pnpm check`, `pnpm check-types`.
- `pnpm --filter e2e e2e -- ai-exam-import-ac-002` (port 8100/8101/8103/8104), 3 viewport + focus.

## Rủi ro

- Hai upload cùng tệp song song lần đầu → cả hai đều bóc tách (chưa có job `completed`). Chấp nhận cho v1 (mỗi lần vẫn trừ đúng 5 Credit hợp lệ); có thể thêm khóa `processing` sau (ứng viên TOS-27). Giảm nhẹ đã áp dụng: lookup chọn job "mới nhất" deterministic với tiebreaker `ORDER BY completed_at DESC, started_at DESC, id` — "Mở lại" luôn mở đúng một job xác định kể cả khi 2 job cùng `completed_at` (ms).

## Red Team Review

### Session — 2026-10-27
**Reviewer:** 3 hostile reviewers (Security Adversary + Assumption Destroyer/Contract Verifier + Failure Mode Analyst), Standard tier (3 phases), mỗi finding bắt buộc có evidence `file:line`.
**Findings:** 20 thô → 12 sau dedupe (8 accepted, 1 partial, 1 rejected, 2 merged vào accepted khác)
**Severity breakdown (sau dedupe):** 2 Critical, 3 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | POST `{duplicateOf}` nổ strict Zod parse client (`repos/exam-imports.ts:49`) — banner không bao giờ hiện qua nhánh POST | Critical | Accept | plan D3, phase-01, phase-02 (thêm `repos/exam-imports.ts` + union schema) |
| 2 | Dedupe khớp job `completed` `draft_json` NULL (nhánh settled-retry `exam-imports.ts:321`) → khoá vĩnh viễn tệp, mất 5 Cr | Critical | Accept | plan D2, phase-01 (`draft_json IS NOT NULL`) |
| 3 | `title` không có cột DB — chỉ trong `draft_json`; plan không chỉ nguồn | High | Accept | plan D3/D5, phase-01 (parse draft, fallback `fileName`) |
| 4 | Thứ tự đăng ký route `/lookup` vs `/:id` chưa pin | High | Accept (phòng thủ; priority static-vs-param sẽ được test khóa) | phase-01 (đăng ký trước `/:id` + test 200) |
| 5 | Lookup chưa gate role → `ta` oracle dò fingerprint, không rate limit | Medium | Accept | plan D3 (gate `canImportExam`) |
| 6 | `crypto.subtle` cần secure context; lookup fail có thể chết luồng upload | Medium | Accept | plan D1 (fail-open), phase-02 (try/catch + feature-detect) |
| 7 | E2E chỉ đi lookup — nhánh POST `{duplicateOf}` không được chứng minh runtime | Medium | Accept | phase-03 (`page.route` abort lookup) |
| 8 | Race double-submit → 2 job processing, 10 Cr cùng nội dung; tie chọn job không deterministic | High | Partial — tiebreaker deterministic accept; khóa `processing` giữ non-goal (plan đã khai báo chấp nhận v1, tiền vẫn đúng giá mỗi lần bóc tách) | plan Rủi ro, phase-01 (ORDER BY tiebreaker) |
| 9 | `?job=` trỏ job draft null → màn trắng dead-end | Medium | Accept (tối thiểu) | phase-02 (ErrorNotice + trả dropzone) |
| 10 | `import.test.tsx` mock full-module vỡ khi thêm hàm lookup | Medium | Accept | phase-02 files (update mock) |
| 11 | GET 404 sau khi job bị xoá → idle im lặng | Medium | Reject — hành vi pre-existing TOS-24, chưa có DELETE endpoint (follow-up ngoài scope) | — |
| 12 | "3 viewport + focus" hứa trong Validation nhưng không có step | Medium | Accept | phase-03 (3 viewport + role="status" + keyboard) |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-dedupe-api.md, phase-02-duplicate-banner-ui.md, phase-03-e2e-ac-002.md (sau khi áp findings).
- Decision deltas checked: 6 (D1 fail-open, D2 draft NOT NULL, D3 union+role gate, D5 title fallback, Rủi ro tiebreaker, files list phase-02).
- Reconciled stale references: shape `{ duplicateOf: jobId }` cũ đã xoá khỏi mọi file; "3 viewport" thống nhất 1440×900/768×1024/375×812 + focus.
- Unresolved contradictions: 0.
