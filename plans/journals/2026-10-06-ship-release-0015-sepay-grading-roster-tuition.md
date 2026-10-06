---
title: "Ship release v0.0.15 — SePay Bank Hub, chấm Writing/Speaking, trạng thái học phí roster"
date: 2026-10-06
summary: "Promotion develop → main (0.0.14 → 0.0.15): 20 commit, 222 file (+24578/−1565) gồm #315 #318 #319 #320/#327 #321/#324 #325 #326/#328 + filter UX assignments. SePay ship ở trạng thái tắt (503 BANKHUB_DISABLED); deploy.yml chưa truyền SEPAY_BANKHUB_*; prod sẽ apply D1 migration 0033/0034."
---

# Ship release v0.0.15

## What happened
Promotion `develop` → `main` (0.0.14 → 0.0.15) — 20 commit, 222 file (+24578/−1565). Đây là release to nhất từ đầu, gom 7 PR feature/fix trong 2 ngày:

- #315 (`47e78f4`) cảnh báo trùng lịch trong modal tạo lớp. #318 (`5e658fe`, issue #317) tab Bài tập chi tiết học viên derive từ class assignments.
- #319 (`cafcacc`) giáo viên chấm Writing/Speaking — migration `0033` thêm cột `quiz_attempt.grade_*`.
- #320/#327 (`aa77b19`) SePay Bank Hub: liên kết ngân hàng, học phí qua VietQR, IPN tự gạch nợ, trang `/payments` + portal — migration `0034` (`org_bank_link`, ...).
- #321/#324 (`2a389ef`) gỡ `/settings` + API workspace settings. #325 (`4a695d9`, issue #322) badge trạng thái học phí ở tab Học viên của lớp.
- #326/#328 (`32ed6bc`) popup `/schedule` đọc đúng buổi legacy, server guard 422 `future-session`, backfill xếp theo trạng thái.
- `df98643` filter assignments: nhóm chip theo skill kèm count, state trên URL.

Evidence (develop @ `32ed6bc`): `biome check` 700 file 0 error · `check-types` 7/7 · `pnpm test` 2263/2263 (web 1278, server 599, student 237, auth 70, api 46, infra 17, scripts/landing 16) · e2e chạy trên CI của PR → main · pre-landing review: 0 critical, H1–H6 + M1–M5 đều thuộc SePay (feature tắt) → follow-up #329; sửa kèm runbook (migration SePay là 0034, link từ `/payments`, CI chưa truyền env).

## Decision
- SePay ship **tắt**: secret trống ⇒ mọi route Bank Hub trả 503 `BANKHUB_DISABLED`. Sandbox verification 6 điểm vẫn chờ credential SePay — không bật prod khi chưa chạy qua sandbox.
- Không sửa `.github/workflows/deploy.yml` trong release này: hiện workflow **không** truyền `SEPAY_BANKHUB_*` vào `pnpm alchemy deploy --stage prod`. Cố ý — bật feature là một quyết định riêng, không lén đi kèm promotion.
- Migration forward-only: prod deploy apply `0033` + `0034`. Header `0033` ghi rõ phải migrate TRƯỚC worker, thiếu cột `grade_*` thì mọi trang giáo viên và màn kết quả học viên 500 (`/readyz` không kiểm cột). Rollback worker không rollback schema.

## Brutal truth
Gom 7 PR + 2 migration vào một promotion là blast radius lớn — nếu prod đỏ, bisect sẽ đau. Và bài học từ #326 vẫn còn nhói: 3 suite server của #320 từng đỏ sẵn trên develop vì gọi route settings đã gỡ ở #324 mà không ai thấy, chính vì PR vào `develop` không có CI. Promotion lần này là lần đầu cả cụm này chạy chung trên CI.

## Next steps
- Owner repo: verify prod sau deploy — log migration 0033/0034 apply thành công, smoke trang giáo viên + kết quả học viên, `/payments` trả 503 `BANKHUB_DISABLED` đúng thiết kế.
- Follow-up bật SePay (#329, gồm lỗi H1 unlink, H2 ghi có trùng, H3 5xx, H4 đối soát xid cũ): thêm `SEPAY_BANKHUB_*` vào env của step deploy trong `deploy.yml` + tạo GitHub environment secrets `prod`; chỉ làm sau khi sandbox verification 6 điểm pass.
- Còn mở từ #326: row undated chưa có guard server; `moveDate` có thể đẩy buổi đã chốt sang tương lai; chạy backfill thật trên D1 prod là thao tác operator.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
