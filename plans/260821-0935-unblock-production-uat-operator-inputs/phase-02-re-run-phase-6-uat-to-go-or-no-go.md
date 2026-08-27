---
title: "Re-run phase 6 UAT to GO or NO-GO"
status: todo
priority: P1
effort: "0.5-1d"
dependencies: [1]
---

# Phase 2: Re-run phase 6 UAT to GO or NO-GO

## Overview

Thực thi procedure phase-6 đã harden **nguyên văn bằng reference** — từ Step 1 (gates trên release commit mới) qua topology gate, deploy, probes, browser UAT cả hai trình duyệt, negative-origin matrix, fault path, đến quyết định GO/NO-GO theo unified GO table — rồi cập nhật evidence, runbook, roadmap, issues và trạng thái cả hai plan cho đúng sự thật.

## Requirements

- Functional: mọi bước và tiêu chí lấy từ [phase-06-execute-live-uat-and-record-release-evidence.md](../260819-2034-production-readiness/phase-06-execute-live-uat-and-record-release-evidence.md); file đó là authority — nếu plan này mâu thuẫn với nó, theo nó, NGOẠI TRỪ các độ lệch được phê duyệt dưới đây.
- Non-functional: sanitize allowlist của phase-06 (status, hostname redacted, request-id, SHA, migration/readiness result, timestamp, runner, pass/fail); evidence mới là file riêng, không đè file NO-GO 2026-08-20.

### Approved deviations so với phase-06 (red-team 2026-08-21)

- **Sign-off row (phase-06:22 "(operator, approver, domain)"):** runbook sign-off table không có cột domain (Release/Commit/Operator/Restore authority/Staging rehearsal/Smoke/GO — runbook:272); hostname production không bao giờ được ghi literal vào repo — domain chỉ tồn tại dạng redacted `<domain>` trong evidence. Diễn giải này override chữ "domain" trong phase-06:22.
- **Topology gate:** zone-in-account được chứng minh bằng Cloudflare API check riêng (phase 1 gate 1), không suy từ "dry-run xanh" — `alchemy plan` không validate zone (zone inference chỉ xảy ra lúc provision).

## Architecture

Không có thay đổi kiến trúc. Điểm khác biệt duy nhất so với lần NO-GO: operator inputs đã có (phase 1) và deploy env dùng `APP_DOMAIN` inline trên lệnh deploy thay vì mong nó nằm trong `.env`. UAT data là `fixture-*`; roster proof là row counts/masked DOM, không screenshot.

## Related Code Files

- Create: `plans/260819-2034-production-readiness/reports/uat-evidence-phase-06-r2-<date>.md` — evidence run mới (cho run NO-GO cũ nguyên vẹn)
- Modify: `docs/production-release-runbook.md` — sign-off row điền **trước** khi deploy (Release/Commit/Operator/Restore authority/Staging rehearsal/Smoke/GO), cập nhật Smoke + GO sau khi có kết quả
- Modify: `docs/project-roadmap.md` — milestone Production readiness: GO → cập nhật trạng thái + gate link evidence; NO-GO → giữ Blocked + blocker issue mới
- Modify: `plans/260819-2034-production-readiness/plan.md` + phase-06 status (qua `ak plan check`) khi GO
- GitHub: #30 (P0 UAT), #41 (blocker inputs — đóng khi checklist xanh kèm evidence), #28 (plan cha) — comment/cập nhật/close theo kết quả

## Implementation Steps

1. **Step 1 — local gates trên release commit mới** (bao gồm PR cleanup của phase 1): `pnpm test`, `pnpm check-types`, `pnpm exec biome check .`, `pnpm build` (CI parity `VITE_SERVER_URL` khi build web). Ghi SHA.
2. **Step 2 — topology gate (re-run):** như phase-06 — `APP_DOMAIN` trong deploy env (inline), `CORS_ORIGIN` absent-or-prod ở cả 3 env file, zone in-account (Cloudflare API verdict từ phase 1 gate 1 — dry-run plan không tự chứng minh được), redirect URI đã register (attestation + authorize precheck từ phase 1 gate 2). Nếu fail lại → NO-GO + blocker issue mới, dừng.
3. **Step 3 — staging rehearsal gate:** reference recorded throwaway-D1 proof (ledger 2026-08-20) — không đổi so với lần trước.
4. **Step 4 — deploy:** điền sign-off row vào runbook trước tiên (theo approved deviations — không hostname literal); verify main checkout `git rev-parse HEAD` == release SHA đã chạy gates ở Step 1 (checkout SHA đó nếu trôi — không deploy từ HEAD develop ngầm mang feature chưa UAT); từ `packages/infra/`: `APP_DOMAIN=<domain> pnpm alchemy deploy --stage prod`; ghi SHA. Deploy fail giữa chừng → dừng, cleanup partial-prod chỉ với restore-authority approval, không improvice.
5. **Steps 5–8 — theo phase-06 nguyên văn:** `/readyz` + liveness + CORS probes; browser UAT incognito Chrome **và** Safari theo runner kit (sign-in → cookie attributes → bootstrap org → syllabus/class `fixture-*` → Add Student → roster → hard reload → sign-out/in); negative-origin matrix (POST rows, expected statuses); fault path (block rule → reload → blocking error → retry → recover).
6. **Step 9 — quyết định:** so từng hàng với unified GO table; GO chỉ khi mọi hàng pass với evidence. GO hoặc NO-GO đều phải: evidence file mới (r2), runbook row hoàn chỉnh, roadmap cập nhật, issues xử lý, `ak plan check` phase-06 (Production readiness) + phase 2 (plan này) khi GO.
7. **Đóng tracker:** #41 đóng với comment tổng hợp verdict 5 items + link evidence r2 (chỉ khi tất cả xanh); #30 đóng khi UAT pass trên production origin; #28 cập nhật theo trạng thái milestone.

## Todo

- [ ] Step 1: 4 gates xanh trên release commit mới, SHA ghi nhận
- [ ] Step 2: topology gate xanh (re-run)
- [ ] Step 3: staging rehearsal gate reference ghi nhận
- [ ] Step 4: sign-off row điền trước deploy (không hostname literal); main checkout verify/pin release SHA; deploy prod từ main checkout; SHA ghi nhận
- [ ] Step 5: post-deploy probes xanh (readyz/liveness/CORS)
- [ ] Step 6: Chrome incognito leg pass + cookie attributes đúng contract
- [ ] Step 7: Safari incognito leg pass + cookie attributes đúng contract
- [ ] Step 8: negative-origin matrix khớp expected statuses
- [ ] Step 9: fault path pass (blocking error → retry → recover, server luôn up)
- [ ] Quyết định GO/NO-GO ghi theo unified GO table trong evidence r2
- [ ] Runbook sign-off row + roadmap + issues #30/#41/#28 cập nhật đúng kết quả
- [ ] `ak plan check` phase-06 (Production readiness) + phase 2 (plan này) khi GO

## Success Criteria

- [ ] Evidence r2 ghi đủ: sanitized URL (redacted), SHA, migration/readiness result, timestamp, runner, per-step result — theo allowlist, không secrets/PII/hostname thật.
- [ ] GO chỉ khi toàn bộ unified GO table pass trên production `app.<APP_DOMAIN>` origin với cả Chrome và Safari; mọi kết quả thiếu/failed → NO-GO + blocker issue mới (không pilot trên kết quả mơ hồ).
- [ ] Runbook có sign-off row hoàn chỉnh (điền trước deploy, Smoke/GO cập nhật sau); roadmap không bao giờ thành "Hoàn thành" chỉ vì merge.
- [ ] Sau GO: cả hai plan đánh dấu hoàn thành đồng thời; #41 và #30 đóng có evidence. Sau NO-GO: mọi tracker giữ mở/blocker đúng sự thật.

## Risk Assessment

- **Safari runner vắng mặt đúng lúc:** signal — todo Safari leg không chạy được; response — dừng Step 6, NO-GO một phần với blocker riêng, không bao giờ lấy Chrome-only làm evidence.
- **Deploy lần đầu fail giữa chừng:** signal — alchemy deploy lỗi nửa vời (resource partial); response — dừng hẳn, cleanup chỉ với restore-authority approval (đã có trong phase-06), không retry mù.
- **Auth callback fail trên production** (sai redirect/origin/cookie): signal — sign-in không quay về app hoặc cookie host-only; response — chẩn đoán từ Worker logs + topology derivation, sửa config rồi re-run từ Step 1 (gates trên commit sửa); không weaken CORS/cookie để qua.
- **Evidence vô tình lộ hostname/secret:** signal — self-check allowlist trước khi post bắt được dòng vi phạm; response — redact, ghi lại policy violation là lesson trong report, không post bản chưa sạch.
- **Áp lực "cho nó xanh" khi một hàng fail:** policy — mọi hàng fail/thiếu = NO-GO + blocker issue; kế hoạch pilot dời, không dĩa lại evidence.
