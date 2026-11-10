---
phase: 3
title: "Chạy audit DB thật (sau beta merge) + ghi số liệu vào issue"
status: pending
priority: P1
effort: "45m"
dependencies: [2]
---

# Phase 3: Chạy audit DB thật (sau beta merge) + ghi số liệu vào issue

## Goal
Sau khi PR beta được merge vào `develop` (step merge của pipeline `--ship`), chạy audit trên D1 thật: thử dispatch workflow từ `develop` (GitHub có thể từ chối vì workflow chỉ được đăng ký từ default branch `main` — red-team A1/F3); nếu từ chối → chuyển path operator chạy local. Số liệu tổng hợp được ghi comment vào issue #663 theo đúng chính sách repo PUBLIC.

## Files to Create / Modify
- Không tạo/sửa file repo. Số liệu ghi thẳng vào issue #663 qua `gh`.

## Context kỹ thuật

- **Điều kiện vào phase:** PR đã merge vào `develop` (workflow + script có mặt trên `develop`).
- **Thử dispatch (path 1):**
  1. `gh workflow run audit-663.yml --ref develop -f stage=staging`
  2. Nếu lỗi "could not find any workflows named" (workflow chưa trên `main` — kịch bản kỳ vọng) → KHÔNG thử thêm fallback API (cùng cơ chế resolve, sẽ 404 tương tự — red-team A1) → chuyển path 2 ngay.
  3. Nếu chấp nhận: watch `gh run list --workflow=audit-663.yml --branch develop --limit 1` → `gh run watch <id>` → `gh run view <id> --log`, lấy summary. Staging xanh mới dispatch prod (`-f stage=prod`); prod có thể chờ approval Environment `production` — chờ tối đa 15 phút rồi ping user với link run; KHÔNG đánh giá là fail.
- **Path 2 — operator local (khi path 1 bị từ chối):** đăng comment trên issue #663 kèm lệnh chạy chính xác cho operator có credential:
  ```bash
  CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
    pnpm --filter @teacher-os/db exec tsx scripts/audit-663-orphan-materials.ts --d1 --d1-stage staging
  # rồi với prod:
  CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
    pnpm --filter @teacher-os/db exec tsx scripts/audit-663-orphan-materials.ts --d1 --d1-stage prod
  ```
  (script read-only ở mode audit; token KHÔNG dán vào issue). Số liệu operator trả về (qua chat/issue) được ghi comment tổng hợp. Pipeline chờ user cung cấp số liệu; nếu user không có mặt → ghi trạng thái "chờ số liệu operator" lên issue và kết thúc phase với blocker có chủ.
- **Staging gần như chắc chắn 0 dòng** (DB staging hậu tố random per-deploy, không giữ legacy — counsel kongming A3): run staging chỉ validate plumbing; TUYỆT ĐỐI không suy ra prod sạch từ staging sạch.
- **Chính sách public (red-team S1):** comment issue CHỈ chứa số tổng hợp (`manual_total`, `cleanup_eligible`, breakdown lý do loại, `auto_total`) + bất biến đối chiếu `manual_total = cleanup_eligible + Σ(loại)` phải khớp. Không ID dòng, không token, không dữ liệu cá nhân.
- KHÔNG chạy cleanup trong phase này (`--apply` là quyết định owner sau review — Post-plan decision trong plan.md).

## Tasks & Steps

### Task 3.1 — Thử dispatch từ develop (staging)
- Goal: xác định path khả dụng và (nếu được) có summary staging.
- Steps: sau merge → dispatch staging `--ref develop` → nếu "could not find" → ghi nhận + chuyển Task 3.3 (path 2). Nếu được → watch tới conclusion.
- Success criteria: run staging `completed/success` với summary, HOẶC ghi nhận path 1 bị từ chối (log đúng thông báo lỗi) và chuyển path 2.
- Verify: `gh run view <id> --json status,conclusion` cho `conclusion=success`, hoặc transcript ghi đúng thông báo "could not find" + bước chuyển path.

### Task 3.2 — Dispatch prod (chỉ khi staging xanh)
- Goal: số prod về đúng kênh (run hoặc operator).
- Steps: dispatch prod tương tự Task 3.1; chờ approval nếu Environment đòi; path 2 thì đưa lệnh prod cho operator.
- Success criteria: run prod `completed/success` với summary, HOẶC operator cung cấp số prod, HOẶC trạng thái chờ được ghi rõ trên issue.
- Verify: `gh run view <prod-id> --json conclusion` = `success`, hoặc issue có số prod từ operator, hoặc comment ghi nhận pending.

### Task 3.3 — Ghi số liệu vào issue #663
- Goal: issue có comment số liệu tổng hợp kèm breakdown, đúng chính sách public.
- Steps: viết comment (body-file): nguồn số liệu (run link hoặc operator local), số từng stage, breakdown + bất biến đối chiếu, diễn giải theo phân loại issue (manual = ứng viên mồ côi; auto = review riêng #645 scenario B), ghi chú rõ `--apply` chờ quyết định owner. Đăng `gh issue comment 663 --body-file`.
- Success criteria: comment trên issue #663 với số liệu có breakdown; nếu path 2 đang chờ operator → comment trạng thái + lệnh chạy, phase kết thúc blocker có chủ.
- Verify: `gh issue view 663 --comments | grep -c "manual_total"` ≥ 1.

## Regression gate
Không áp dụng (không sửa code).

## Tests Before / Refactor / Tests After
Không áp dụng.

## Verification (tổng phase)
- [ ] Đã xác định path (dispatch OK hoặc path operator)
- [ ] Staging: run xanh hoặc lệnh đã giao operator
- [ ] Prod: số liệu về hoặc trạng thái chờ được ghi trên issue
- [ ] Issue #663 có comment số liệu tổng hợp (hoặc trạng thái chờ)

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
