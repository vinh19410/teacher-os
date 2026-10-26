---
title: "TOS-25: Phát hiện tệp đề trùng mã băm và mở lại bản đề nháp cũ với chi phí 0 Credit"
description: "Trước khi tạm giữ Credit, tra content_fingerprint (SHA-256) của tệp trong cùng tổ chức; trùng job completed thì không gọi AI, không giữ/trừ Credit và hiện thanh thông báo kèm nút Mở lại bản nháp cũ (0 Cr)."
status: pending
priority: P0
effort: 1d
issue: 471
branch: null
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
| D1 | **Mã băm = SHA-256 trên byte tệp gốc**, tính ở **cả client** (`crypto.subtle.digest` trước khi upload) **và server** (nguồn sự thật, chống client giả mạo). | Client tính để không phải upload lại 15 MB khi trùng; server tính lại để không tin input. |
| D2 | **Định nghĩa "trùng"**: cùng `org_id` + cùng `content_fingerprint` + job `import_status = 'completed'` (mới nhất). Job `failed_refunded` / `processing` **không** tính là trùng. | BR-005 nói "đã trích xuất thành công"; job lỗi phải cho bóc tách lại (TOS-27). |
| D3 | **Endpoint kiểm tra sớm** `GET /api/exam-imports/lookup?fingerprint=<hex>` → `{ duplicate: { jobId, title, completedAt } | null }`; client gọi trước upload. `POST /api/exam-imports` **cũng** tra trùng sau khi tính fingerprint server-side, trước `reserveCredits`: trùng → 200 `{ duplicateOf: jobId }`, không lưu R2, không tạo job, không ghi `credit_usage_log`. | Hai lớp: UX nhanh + bảo đảm 0 Credit kể cả khi bỏ qua bước lookup. |
| D4 | **Mở lại bản nháp** = điều hướng `/assignments/tests/import?job=<jobId cũ>` (luồng hiển thị của TOS-24 đọc `draft_json` hiện tại — gồm cả chỉnh sửa đã lưu ở TOS-26). Không clone job. | "Chỉnh sửa tiếp" trên đúng bản nháp; không phát sinh dữ liệu trùng. |
| D5 | **Banner** (`Alert` tone info): "Phát hiện tệp trùng mã băm với đề "<title>" đã bóc tách ngày <dd/MM/yyyy>." + nút secondary **"Mở lại bản nháp cũ (0 Cr)"**; không tự điều hướng. | Wireframe mục 3–4. |
| D6 | Fingerprint là định danh nội dung, không phải bí mật, nhưng lookup **org-scoped** để không dò được đề của tổ chức khác. | Cô lập dữ liệu giữa tổ chức. |

## Non-goals

- So khớp gần đúng (cùng đề nhưng scan khác) — chỉ khớp byte chính xác.
- Chia sẻ bản nháp giữa các tổ chức.

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-dedupe-api.md](phase-01-dedupe-api.md): `findCompletedImportByFingerprint`, lookup endpoint, nhánh trùng trong POST | 3h | pending | TOS-24 |
| 2 | [phase-02-duplicate-banner-ui.md](phase-02-duplicate-banner-ui.md): hash client, banner + nút mở lại | 3h | pending | 1 |
| 3 | [phase-03-e2e-ac-002.md](phase-03-e2e-ac-002.md): E2E tải lại cùng tệp → 0 Credit | 2h | pending | 2 |

## Acceptance criteria (từ AC-002)

- [ ] Tải lại tệp cùng byte trong cùng tổ chức → extractor không được gọi (spy = 0 lần), không có dòng `credit_usage_log` mới, số dư ví không đổi.
- [ ] Màn `[6]` hiện banner trùng + nút "Mở lại bản nháp cũ (0 Cr)"; bấm → mở đúng job cũ với nội dung nháp.
- [ ] Cùng tệp ở tổ chức khác → không bị coi là trùng (bóc tách bình thường).
- [ ] Job cũ `failed_refunded` → không coi là trùng.

## Validation

- `pnpm --filter server test -- exam-imports`, `pnpm --filter web test -- import`, `pnpm check`, `pnpm check-types`.
- `pnpm --filter e2e e2e -- ai-exam-import-ac-002` (port 8100/8101/8103/8104), 3 viewport + focus.

## Rủi ro

- Hai upload cùng tệp song song lần đầu → cả hai đều bóc tách (chưa có job `completed`). Chấp nhận cho v1 (mỗi lần vẫn trừ đúng 5 Credit hợp lệ); có thể thêm khóa `processing` sau.
