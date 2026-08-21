---
title: "Unblock production UAT operator inputs"
description: "Cung cấp 5 operator inputs còn thiếu của blocker #41 (domain, Google redirect, UAT account, Safari runner, sign-off), dọn + harden env topology cho deploy, rồi re-run phase 6 UAT của plan Production readiness từ Step 1 trên release commit mới đến quyết định GO/NO-GO có evidence."
status: pending
priority: P1
effort: "1-2d (chờ operator inputs)"
issue: 41
branch: develop
tags: [infra, auth, release, uat, critical]
blockedBy: []
blocks: [260819-2034-production-readiness]
created: 2026-08-21
---

# Unblock production UAT operator inputs

## Overview

Phase 6 (live UAT) của plan [Production readiness](../260819-2034-production-readiness/plan.md) đã chạy pre-deploy gates ngày 2026-08-20 và kết thúc **NO-GO trước khi deploy** — không thiếu code, chỉ thiếu 5 operator inputs (blocker [#41](https://github.com/vinh19410/teacher-os/issues/41)). Plan này cung cấp đúng 5 inputs đó, dọn + harden configuration mà topology gate yêu cầu, rồi **re-run phase 6 từ Step 1 trên release commit mới theo đúng procedure đã được red-team** (13 findings applied 2026-08-20; các blocker nằm ở Step 2 trở đi) đến quyết định GO/NO-GO có evidence.

Không đổi procedure UAT, không thêm product feature, không thay kernel/API contract.

## Scope Challenge

- Existing: toàn bộ hạ tầng cần thiết đã có và xanh — topology derivation `packages/infra/src/topology.ts` (+ tests), deploy wiring `packages/infra/alchemy.run.ts`, runbook deploy/preflight/sign-off, procedure phase-06 đã harden, local gates xanh ở release base gần nhất, Cloudflare auth verified, rehearsal `0006` có recorded proof. Không có gì cần xây lại.
- Requested: xử lý 5 blockers của #41 để unblock phase-06 — đúng scope, không hơn.
- Complexity: ~5 file repo (hardening `alchemy.run.ts` ~20 dòng + runbook + `.env.example` + README + drift assertion) + 1 file env local (gitignored) + 2 file plan; 0 service/abstraction mới; 2 phase.
- Selected mode: **HOLD SCOPE**. Auto-detected **Fast** (phần rủi ro lớn — procedure UAT — đã được red-team 24 giờ trước; phần mới là orchestration mỏng + hardening CORS fail-loud theo red-team 2026-08-21 của chính plan này).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Cả 5 checklist items của #41 được resolve và ghi nhận (domain + `APP_DOMAIN`, Google redirect URI, UAT account, Safari runner, sign-off row) | P1 |
| 2 | Topology gate của phase-06 (Step 2) pass ở lần chạy tới: env sạch, zone in-account, redirect đã register | P1 |
| 3 | Phase-06 UAT re-run từ Step 1 trên release commit mới, UAT chạy trên origin production `app.<APP_DOMAIN>` → GO hoặc NO-GO có evidence, cả hai Chrome và Safari | P1 |
| 4 | Roadmap, runbook, issues #28/#30/#41 và trạng thái 2 plan phản ánh đúng sự thật sau quyết định | P1 |

## Bối cảnh NO-GO 2026-08-20 (tóm tắt từ evidence)

Evidence: [uat-evidence-phase-06.md](../260819-2034-production-readiness/reports/uat-evidence-phase-06.md). Local gates PASS, Cloudflare auth PASS, rehearsal PASS (recorded throwaway-D1 proof). FAIL duy nhất: topology gate — `APP_DOMAIN` không có ở bất kỳ env file nào, và `apps/server/.env` còn `CORS_ORIGIN` dev-localhost (dotenv precedence, warn-only — override âm thầm default derived). Không deploy. Issue #41 bị GitHub auto-close khi merge PR #42 (đóng sau merge đúng 1 giây, trái với ghi chú "keep #41 open" trong chính PR đó) — checklist của nó chưa item nào xanh.

## Design decisions

| Decision | Chọn | Rationale |
|---|---|---|
| `APP_DOMAIN` placement | Inline trên lệnh deploy từ `packages/infra/`, theo pattern không rơi vào shell history (`read -rs APP_DOMAIN` + `env "APP_DOMAIN=$APP_DOMAIN" pnpm alchemy deploy --stage prod`) | dotenv không override process env (`alchemy.run.ts:23` đọc sau dotenv) nên dev không bao giờ thấy nó. Nếu persist trong `packages/infra/.env` thì `pnpm dev` (alchemy dev) sẽ flip sang prod topology và kéo custom domain vào dev worker — xung đột prod. Pattern `read -rs` giữ hostname production khỏi shell history (red-team 2026-08-21); README + rollback runbook được cập nhật đồng bộ. |
| Dọn `CORS_ORIGIN` dev | (a) Xóa dòng `CORS_ORIGIN` khỏi `apps/server/.env` (file local, gitignored) + (b) harden code: nhánh topology-unset của `alchemy.run.ts` nhận default `http://localhost:8001` **chỉ khi `ALCHEMY_DEV=true`** (signal alchemy set cho process con của `alchemy dev` — argv rỗng trong process con nên argv check không dùng được, code-review 2026-08-21); deploy/plan thiếu explicit vẫn fail-loud như cũ; kèm **throw** thay `console.warn` khi topology set + explicit ≠ `appOrigin` | Không có (b) thì `pnpm dev` vỡ (`Config.string` bắt buộc khi không có topology — `alchemy.run.ts:53-57`). Port 8001 chính là web dev port của alchemy dev và là origin mà kernel/readiness tests dùng. Nhánh topology-unset không chỉ là dev — staging deploy và `--stage prod` thiếu inline `APP_DOMAIN` cũng đi vào nó; default vô điều kiện sẽ khiến chúng deploy âm thầm sai (red-team 2026-08-21, findings High). Warn-only mismatch đã góp phần NO-GO 2026-08-20 → harden thành throw; staging bootstrap chuyển sang inline `CORS_ORIGIN` (không còn persist vào `.env`). |
| Phase-06 procedure | Re-run **by reference** — không copy, không sửa file phase-06 đã red-team | Tránh churn artifact đã review và tránh dual-maintenance GO table. File phase-06 là authority duy nhất của procedure. |
| Sign-off row | Theo đúng cột runbook: Release / Commit / Operator (deploy) / Restore authority / Staging rehearsal / Smoke / GO; ghi vào runbook **trước** khi chạy deploy command (phase-06 Step 4) | Phase-06 nói "(operator, approver, domain)" — domain đi vào evidence (redacted), operator + approver đi vào cột Operator/Restore authority của runbook. |
| Runner Chrome | Agent trên máy operator (browser-use) hoặc operator thủ công — runner identity được ghi trong evidence theo từng browser leg | Evidence phase-06 yêu cầu ghi runner; NO-GO run trước cũng do agent chạy. Cookie attribute check cần DevTools/CDP — cả hai đường đều khả thi. |
| Runner Safari | USER-ACTION: operator (hoặc người operator chỉ định) chạy incognito Safari theo runner kit | Safari chỉ có trên macOS của operator; đây là blocker #4 nguyên bản. Không bao giờ thay bằng Chrome-only. |
| GitHub tracking | Plan issue mới label `ready to review`; #41 **đã được reopen 2026-08-21** và giữ mở làm blocker-input tracker đến khi checklist xanh; comment cross-link | Fix auto-close nhầm (bằng chứng: merge time == close time ± 1s; PR #42 ghi "keep #41 open"; reopen đã diễn ra trước khi plan này cook). Không tracker kép cho cùng 5 items. |

## Operator gates (USER-ACTION — agent không được thay thế)

4 trong 5 blocker là đầu vào chỉ operator cung cấp được. Mỗi gate là điểm dừng bắt buộc: thiếu input → dừng, yêu cầu operator, giữ #41 mở với status từng item. Không bao giờ substitute staging/local, không weaken check:

1. **Domain production** — chọn từ các zone đang active trong tài khoản Cloudflare (zone phải in-account; Alchemy tự provision DNS + certificate). Hostname không bao giờ ghi vào repo/issues/evidence (hostname policy).
2. **Google OAuth redirect URI** — `https://api.<APP_DOMAIN>/api/auth/callback/google` register trong Google Cloud console của đúng client tương ứng `GOOGLE_CLIENT_ID` đang có trong `apps/server/.env`. Chỉ làm được sau gate 1.
3. **Google UAT account chuyên dụng** — out of band (không repo, không GitHub, không evidence).
4. **Safari runner** — xác nhận ai chạy incognito Safari leg (và ai chạy/ xác nhận Chrome leg).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Resolve operator inputs (blocker #41)](./phase-01-resolve-operator-inputs.md) | Pending |
| 2 | [Re-run phase 6 UAT to GO or NO-GO](./phase-02-re-run-phase-6-uat-to-go-or-no-go.md) | Pending |

## Cross-plan dependencies

- Plan này `blocks: [260819-2034-production-readiness]`; plan Production readiness được cập nhật `blockedBy: [260821-0935-unblock-production-uat-operator-inputs]` (đồng thời bỏ ref stale đến plan tanstack-query đã hoàn thành).
- Hoàn thành Phase 2 của plan này = phase-06 của Production readiness hoàn thành: `ak plan check` phase-06 bên kia cùng lúc, plan đó `status: completed` khi checklist Success Criteria của nó xanh.

## External references

- Procedure authority: [phase-06-execute-live-uat-and-record-release-evidence.md](../260819-2034-production-readiness/phase-06-execute-live-uat-and-record-release-evidence.md) (unified GO table, sanitize allowlist, negative-origin matrix)
- Evidence NO-GO: [uat-evidence-phase-06.md](../260819-2034-production-readiness/reports/uat-evidence-phase-06.md)
- Runbook: [docs/production-release-runbook.md](../../docs/production-release-runbook.md)
- Blocker: issue #41; parent: #30, #28

## Success Criteria

- [ ] Cả 5 items trong body #41 được tick kèm bằng chứng/bản ghi (verdict-only, không hostname/secrets), issue đóng có evidence.
- [ ] Topology gate pass khi re-run: `APP_DOMAIN` set trong deploy env (inline), `CORS_ORIGIN` absent-or-prod ở cả 3 env file Alchemy loads, zone in-account (Cloudflare API verdict), redirect URI đã register (attestation + authorize precheck).
- [ ] `pnpm dev` vẫn hoạt động sau khi xóa `CORS_ORIGIN` khỏi `apps/server/.env` (dev default argv-gated trong code); deploy/plan thiếu explicit khi topology unset vẫn fail-loud; topology set + explicit mismatch throw.
- [ ] Phase-06 Steps 1–9 chạy trên release commit được pin, origin production thật, cả Chrome và Safari incognito; kết quả GO hoặc NO-GO được ghi theo unified GO table trong evidence report mới (giữ nguyên file NO-GO cũ).
- [ ] Roadmap milestone, runbook sign-off row, issues #28/#30/#41 và 2 plan phản ánh đúng kết quả; không bao giờ đánh dấu hoàn thành khi thiếu evidence.

## Open questions

None ở mức plan. Bốn operator gates là điểm chờ input có chủ đích (by design), không phải câu hỏi mở về cách làm. Nếu operator không có zone phù hợp trong tài khoản: dừng gate 1, mua/chuyển zone về Cloudflare rồi tiếp tục — không đổi plan.

## Advice log (kongming, `--advice`)

- 2026-08-21 checkpoint 1 (post-analysis, pre-plan): **GO** cho design 2-phase, inline `APP_DOMAIN`, CORS dev default, re-run by reference, reopen #41. Risk watch: Safari runner không sẵn sàng ở Phase 2 — signal: Step 6 không complete được Safari leg; response: dừng, yêu cầu runner, không Chrome-only, không weaken.
- 2026-08-21 checkpoint 2 (post-red-team, vibe pipeline): **GO** áp dụng đủ 14 dispositions (không reject finding nào); xác nhận design fork hardening `alchemy.run.ts` (argv-based dev-only default + throw-on-mismatch) là bắt buộc theo fail-loud. Risk watch thêm: argv dev-detection miss → fail-closed (không bao giờ silently sai); risk lớn nhất tiếp theo vẫn là Safari runner ở Phase 2.

## Red Team Review

### Session — 2026-08-21 (vibe pipeline, 2 reviewers: Security Adversary + Assumption Destroyer; Light tier)
**Findings:** 14 (14 accepted, 0 rejected) — 17 raw findings → 14 sau dedup
**Severity breakdown:** 3 High, 11 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Dev default vô điều kiện ở nhánh topology-unset phá fail-fast của staging deploy và `--stage prod` thiếu `APP_DOMAIN` → deploy âm thầm với localhost:8001 (S1+AD3) | High | Accept | Phase 1 |
| 2 | Topology set + explicit `CORS_ORIGIN` ≠ `appOrigin` vẫn chỉ `console.warn` rồi deploy sai (warn-only đã góp phần NO-GO 2026-08-20); runbook staging two-step persist `CORS_ORIGIN` vào `.env` tạo leftover (AD2) | High | Accept | Phase 1 |
| 3 | `pnpm alchemy plan` dry-run không validate Cloudflare zone (zone inference chỉ xảy ra lúc provision) — "dry-run xanh" không phải evidence zone in-account (AD1) | High | Accept | Phase 1+2 |
| 4 | Premise "staging vẫn set CORS_ORIGIN tường minh" sai trên máy operator (`packages/infra/.env` không có key); success criterion "3 env file sạch" mâu thuẫn staging procedure hiện行 (S2) | Medium | Accept | Phase 1 |
| 5 | Sign-off row "(operator, approver, domain)" của phase-06 mâu thuẫn hostname policy + bảng runbook không có cột domain; phase-02 "theo phase-06" có thể dẫn tới ghi hostname thật vào repo (S3) | Medium | Accept | Phase 2 |
| 6 | Gate 2 Google redirect chỉ attestation không kiểm chứng được; không audit URI dev cũ trên client; phát hiện `redirect_uri_mismatch` bị hoãn tới sau deploy (S4) | Medium | Accept | Phase 1 |
| 7 | Inline `APP_DOMAIN=<domain>` literal ghi hostname production vào shell history + process env (S5) | Medium | Accept | Phase 1 |
| 8 | plan.md nói "re-run từ Step 2" trong khi phase-02 chạy từ Step 1 — executor theo plan.md có thể bỏ local gates trên release commit chứa code change (S6+AD7) | Medium | Accept | plan.md |
| 9 | Dry-run topology gate không chỉ định checkout; worktree không có env files → nguy cơ copy secrets sang worktree hoặc chạy trên code cũ (S7) | Medium | Accept | Phase 1 |
| 10 | Release commit không pin — deploy từ HEAD develop ngầm ship PR chưa UAT (#46/#47); main checkout có thể lệch SHA so với gates (S8+AD9) | Medium | Accept | Phase 1+2 |
| 11 | Claim "(read-only)" cho `alchemy plan` quá mạnh — state-store bootstrap có thể deploy/abort; thiếu precondition (AD4) | Medium | Accept | Phase 1 |
| 12 | README:118 vẫn chỉ dẫn persist `APP_DOMAIN` vào `packages/infra/.env` — mâu thuẫn design inline, tái tạo hazard (AD5) | Medium | Accept | Phase 1 |
| 13 | Phase-1 gates thiếu CI parity `VITE_SERVER_URL` — worktree không có `apps/web/.env` làm gates divergence theo máy (AD6) | Medium | Accept | Phase 1 |
| 14 | Dev web origin bị định nghĩa ở 3 nơi (alchemy dev.port, vite.config, default mới) không có drift assertion — repo có tiền lệ remap port (AD8) | Medium | Accept | Phase 1 |

## Validation Log

- 2026-08-21 `ak plan validate`: **PASS** (plan directory format valid).
- 2026-08-21 `/ak:plan red-team` (vibe pipeline): 17 raw findings → 14 deduplicated → **all accepted**. Verification (Fact Checker, 2 reviewers): 51 claims checked — 47 VERIFIED, 3 FAILED (premise staging-explicit-CORS; "reopen #41" stale; sign-off domain ambiguity), 1 UNVERIFIED ("read-only" của `alchemy plan` — xử lý bằng rewording "no-apply dry-run"). Cả 3 FAILED đều được resolve bởi findings tương ứng phía trên.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-resolve-operator-inputs.md, phase-02-re-run-phase-6-uat-to-go-or-no-go.md
- Decision deltas checked: 14 (hardening alchemy.run.ts argv-gated + throw; inline no-history APP_DOMAIN; staging inline CORS_ORIGIN; zone check bằng Cloudflare API; redirect audit + authorize precheck; Step-1 re-run; SHA pinning; approved deviations so phase-06; README + drift assertion; reopen-#41 stale fix)
- Reconciled stale references: 6 (frontmatter description; Overview + Goal 3 "từ Step 2"; D1 persist-in-file alternative; D2 staging-explicit rationale; D6 reopen tense; Success Criteria #2/#3/#4)
- Unresolved contradictions: 0
