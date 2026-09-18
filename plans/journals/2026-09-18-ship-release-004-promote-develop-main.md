---
title: Ship release 0.0.4 promote develop main
date: 2026-09-18
summary: "ak-ship official promote develop→main v0.0.3→v0.0.4: 47 commits / 244 files / +16165−840 bundling QC wave #165–#175 (auth submit recovery, honest settings + kernel persist, report POST persist, CSP Insights, bell popover, greeting, assignments CTA + AddAssignmentModal, sidebar plan badge, tuition debt KPI + localized chips, class-create template reset, import hardening), a11y #118 (aria/required/empty states), settings tab deeplink #119, robots.txt + apex/www 301 + Alchemy domain aliases #117, login brand dynamic date #171; migrations 0015 report.content/channel + 0016 workspace_settings (additive); sự cố preflight: working tree chứa staged restore byte-identical pre-#187/#188/#189 → bảo toàn trên nhánh revert/auto-loop-qc-166-168-170, không ship; push race với PR #195 → rebase sạch; subagent delegation lỗi harness → chạy inline"
---

# Ship release 0.0.4 promote develop main

Branch `develop` @ release commit bump 0.0.4 (đứng trên `e478a29`, sau khi `origin/main` đã được merge vào và rebase qua push race) → `main`, ak-ship pipeline official, ngày 2026-09-18. Version **0.0.3 → 0.0.4** (root `package.json`). Promote này là câu trả lời cho next-step #3 trong PM board report 2026-09-18 10:36 — "Decide when to promote develop → main" — quyết định: promote trước self-pilot, QC wave #165–#188 không nằm mơ hồ trên staging thêm ngày nào.

Trong lúc pipeline chạy, PR #195 (#171 — login brand dynamic date) rơi xuống `origin/develop` → push bị reject lần đầu; `pull --rebase` sạch hoàn toàn (file rời nhau), hai merge commit rỗng bị flatten, release commit replay lại.

## What's inside (46 commits, 238 files, +15991/−836 vs main)

- **Auth/UX QC wave**: #165 submit recovery sau validation fail; #167 settings hết field giả; #173 báo cáo tuần persist qua POST /api/reports; #174 gỡ nút delete-account chết; #110 bell popover bounds + empty state + unread badge điều kiện; #120 greeting theo giờ Việt Nam; #166 assignments empty state + CTA + AddAssignmentModal; #168 sidebar plan badge động (bỏ PRO hardcode); #170 KPI "Còn nợ" trung tính 0đ + chip filter tiếng Việt; #175 reset selection template khi tạo lớp.
- **Cơ sở dữ liệu**: #145 import hardening (bodyLimit, zod chặt); #179 settings persist vào kernel — bảng `workspace_settings` mới.
- **A11y/UX nền**: #118 aria attributes, input required, list empty states (Field/data-table/tabs được test).
- **Infra/SEO**: #119 deep-link settings tab qua `?tab=`; #117 robots.txt tĩnh + 301 apex/www → app host + Alchemy `WorkerDomainConfig.aliases` (tránh Zone Ruleset API permission); #169 CSP cho Cloudflare Insights beacon; security headers (HSTS/XFO/CSP) áp cho mọi response worker kể cả static assets.

## Sự cố preflight: working tree chứa restore trạng thái cũ của 3 PR đã merge

Preflight bắt gặp 18 file staged (−953 dòng): xóa test files, xóa AddAssignmentModal, rollback chip filter về tiếng Anh, PRO badge hardcode — trùng byte với trạng thái `7dfec2d` (trước PR #187/#188/#189, đúng 3 feature auto-loop mới merge giờ dây). Không một issue/plan/journal nào ghi chủ ý rollback; cả 3 issue (#166/#168/#170) đã CLOSED, PM report 10:36 ghi Done, CI develop xanh. Kết luận: leftovers cơ học của session trước (reflog có dấu hiệu `reset` về `7dfec2d`), không phải ý định ship.

Xử lý: commit toàn bộ sang nhánh riêng `revert/auto-loop-qc-166-168-170` (commit `2db8d82`) — không mất, không ship — rồi fast-forward develop lên `origin/develop` (4 commits mới: #191–#194) và merge `origin/main` (chỉ topology merge-commit #158, diffstat rỗng). Bài học: ak-ship preflight phải đối chiếu working tree với cây commit trước khi tin bất kỳ dirty state nào; "staged" không đồng nghĩa "có chủ ý".

## Migration note (khác 0014 lần trước)

`0015` ADD `report.content`/`channel` (DEFAULT '') và `0016` CREATE TABLE `workspace_settings` — thuần additive, không đọc-ghi cột mới theo điều kiện, nên không cần pre-flight D1 drill như `kind` của 0014; deploy pipeline tự áp.

## Deviation: subagent delegation không khả dụng

Agent tool lỗi harness ("No reasoning level selected") với cả tester lẫn code-reviewer → chạy inline cùng checklist: `pnpm test` full + `pnpm check-types`, review 2-pass tay trên `origin/main...HEAD` ưu tiên surface bảo mật (worker, security-headers, kernel routes, reporting POST, auth forms, infra topology). Kết quả tương đương gate, nhưng ghi rõ đây là inline — không phải verdict của subagent độc lập.

## Evidence

- Tests: `pnpm test` → **886/886 pass** (chạy lại trên cây rebased cuối) — web 590 (57 files), server 229 (11 files, gồm multi-tenant isolation settings), auth 42, infra 17, ci-workflow 2, topology-drift 6. 0 fail.
- Type check: `pnpm check-types` → 6/6 tasks xanh.
- Review 2-pass: **0 critical**. Pass 1 quét secrets (sạch), open-redirect (chỉ host cố định), auth guard (POST /api/reports có `getKernelCtx` + org-scoped student lookup + zod), CSP/HSTS hợp lệ. Pass 2 informational: CSP giữ `style-src 'unsafe-inline'` (Tailwind pattern, pre-existing); robots.txt fallback `Disallow: /` (bảo thủ, an toàn hướng SEO); `workspace_settings` lưu giá trị số dạng text display-string (design choice của kernel).
- CI: pending (chạy trên PR).

## Next steps

- Merge PR develop→main → `deploy.yml` lên prod teacheros.io.vn; migration 0015/0016 additive chạy trong deploy.
- Post-ship smoke: gõ `teacheros.io.vn` và `www.teacheros.io.vn` (kỳ vọng 301 → app), `/robots.txt` 200, Insights beacon không bị CSP chặn.
- Nhánh `revert/auto-loop-qc-166-168-170`: giữ 1–2 tuần; nếu đúng là leftovers, xoá; nếu chủ ý thật, làm PR revert riêng có review.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
