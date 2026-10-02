---
title: "Phase 1 — QE execute UAT"
status: in-progress
owner: Quantity Engineer
---

# Phase 1 — QE execute UAT

## Context

- Plan: `plans/261002-0406-uat-squad-round/plan.md`
- Runbook smoke: `docs/production-release-runbook.md` (Post-deploy smoke)
- Roadmap core flow: `docs/project-roadmap.md` M1–M2
- Latest user-facing: CHANGELOG 2026-10-01 (#292, #297)
- Prior evidence format: `plans/260819-2034-production-readiness/reports/uat-evidence-phase-06-r2-2026-08-30.md`

## Requirements

Chạy UAT, ghi evidence, phân loại finding. Không implement. Không tạo GitHub issue.

## Files to create

- `plans/261002-0406-uat-squad-round/reports/uat-qe-2026-10-02.md`

## Test matrix

Dùng cửa sổ ẩn danh. Tài khoản throwaway `fixture-uat-*`. Không dùng dữ liệu lớp thật.

### A. Readiness (no browser)

1. Staging `/readyz` 200 `{"ok":true}` + `cache-control: no-store`
2. Staging `GET /` 200
3. Prod `/readyz` cùng kỳ vọng (so sánh, không CRUD prod trừ khi staging thiếu feature)

### B. Teacher web — staging `https://app.staging.teacheros.io.vn`

1. Sign-up email/password throwaway **hoặc** Google UAT nếu có session sẵn. Ghi method.
2. Session sống sau hard reload; sign-out rồi sign-in lại.
3. Bootstrap org; workspace không rỗng giả.
4. Tạo syllabus → tạo lớp có lịch → thêm/enroll học viên → thấy buổi trên schedule/class detail → check-in → hard reload giữ data.
5. Tạo invoice → mark-paid → KPI tuition khớp sau reload (nếu CTA còn trên staging).
6. Origin sai: POST mutation không Origin / Origin lạ → 403; Origin đúng không session → 401.

### C. Auth mới — #292 #297

Xác nhận UI có trên môi trường trước khi pass.

1. Teacher: "Forgot password?" → `/forgot-password` → copy trung tính, không oracle email.
2. Link reset (nếu lấy được từ mail/log hợp lệ) → `/reset-password` đúng cổng; token hết hạn/sai → card lỗi.
3. Teacher sign-up → verify link → `/verify-email` trên origin web, không response trần API; CTA vào workspace.
4. Link verify hết hạn/sai/dùng lại → card lỗi + resend khi còn session chưa verify.

### D. Student portal

Staging student DNS không resolve. Ghi BLOCKED cho staging. Prod `https://student.teacheros.io.vn` chỉ với tài khoản throwaway:

1. Đăng ký học viên + verify-email landing tiếng Việt.
2. Forgot/reset password tiếng Việt.
3. Không đụng lớp production thật; dừng nếu cần data thật.

### E. Regression nhanh

CTA no-op trên classes/schedule/tuition. Snapshot fail không hiện workspace rỗng.

## Classification

| Type | Khi nào | Owner tiếp theo |
|------|---------|-----------------|
| PASS | Đúng expected documented | — |
| BUG | Lệch expected, tái hiện được | Tech Lead tạo issue |
| CONCERN | Ambiguous requirement/UX, chưa đủ để gọi bug | BA Q&A |
| BLOCKED | Môi trường/thiếu credential | PM |

## Validation

Report phải có: môi trường + cách xác nhận version/feature; bảng case; GO/NO-GO; danh sách BUG (repro, expected, actual, severity); danh sách CONCERN (câu hỏi cho BA).

## Risks

- Staging có thể thiếu #292/#297 vì auto-deploy off. Verify UI trước; nếu thiếu, test prod throwaway và ghi lệch version.
- Student staging DNS missing.
- Google OAuth UAT account có thể không có trong session này — dùng email/password throwaway như r2.

## Rollback

Không đổi code. Xóa fixture `fixture-uat-*` nếu tạo trên staging. Không DELETE tay trên membership/user production.
