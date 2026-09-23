---
title: "Phase 5: Infra topology + docs"
status: todo
priority: P2
effort: 4h
dependencies: [1, 2]
---

# Phase 5: Infra topology + docs

## Context Links

- `reports/scout-report.md` (mục 1, 8 — CI, topology, alchemy, ports)
- `packages/infra/src/topology.ts` — `resolveDomainTopology()` single source of truth
- `packages/infra/alchemy.run.ts` — web Worker (`Cloudflare.Website.Vite`, dòng ~102–123), landing StaticSite, guard CORS_ORIGIN (dòng 44–48)
- `docs/production-release-runbook.md`, `README.md` (ports, cấu trúc project, OAuth setup)

## Overview

- Priority: P2 · Status: todo
- Đưa student portal vào deploy topology: derive `student.<domain>` + origin, định nghĩa Worker/Vite site cho `apps/student`, mặc định CORS_ORIGIN gồm cả 2 origin app, cập nhật guard + drift test + README/docs.

## Key Insights

- Topology là derived-all-from-APP_DOMAIN: thêm field `studentHost`/`studentOrigin` vào `DomainTopology` là mọi nơi (cookie domain, prefix, Google redirect) giữ nguyên logic — student là thành viên của prod cookie zone nên tự nhận prefix `teacheros-staging` khi chạy staging (điều kiện `inProdCookieZone` đã theo domain, không cần sửa).
- Worker student = `Cloudflare.Website.Vite` như web: cần `apps/student/src/worker.ts` (worker mỏng: chặn dotfile, security headers, SPA fallback index.html; KHÔNG robots.txt/host-redirect của web — non-goal plan.md).
- `CORS_ORIGIN` hiện single-origin có guard "explicit phải khớp topology.appOrigin" (`alchemy.run.ts:44-48`) — phải nới thành "chứa appOrigin + studentOrigin".
- Deploy staging/prod là workflow_dispatch/manual — phase này KHÔNG deploy thật, chỉ đảm bảo `pnpm build` + alchemy typecheck/gates xanh và drift test cập nhật.

## Requirements

- [ ] `resolveDomainTopology` trả thêm `studentHost: student.<domain>`, `studentOrigin: https://student.<domain>`
- [ ] `alchemy.run.ts` định nghĩa `studentWorker` (dev port 8003, env VITE_SERVER_URL = api origin) + output `student`
- [ ] CORS_ORIGIN default **cả 2 nhánh**: topology = `appOrigin,studentOrigin`; dev = `http://localhost:8001,http://localhost:8003`
- [ ] Guard explicit CORS_ORIGIN **giữ fail-loud (throw)** khi thiếu origin bắt buộc — không hạ xuống warning (red-team #11)
- [ ] `scripts/topology-drift.test.mjs` assert thêm port 8003 trong `apps/student/vite.config.ts` **và** sửa regex default CORS (regex cũ chỉ khớp single-origin, sẽ vỡ với list — red-team #7)
- [ ] README + docs: ports (8003), cấu trúc apps/, mục student portal (login qua email trùng `student.email` — email phải verified), bước `cp apps/student/.env.example .env`

## Architecture

```
packages/infra/src/topology.ts        # + studentHost/studentOrigin vào interface + resolveDomainTopology
packages/infra/alchemy.run.ts         # + studentWorker (Website.Vite), CORS_ORIGIN default mới, guard mới, outputs.student
apps/student/src/worker.ts            # worker mỏng phục vụ SPA trên Cloudflare
scripts/topology-drift.test.mjs       # + assert student port
README.md, docs/index.md              # cập nhật ports/structure/portal note
```

Worker mỏng (draft hành vi): mọi request → nếu dotfile 404 text; nếu path khớp asset → ASSETS fetch + security headers; còn lại GET/HEAD html → trả index.html (200) cho SPA route, 404 text cho request không phải html; thêm https redirect như server app.ts (301 khi http không phải localhost).

## Related Code Files

- Create: `apps/student/src/worker.ts`
- Modify: `packages/infra/src/topology.ts`, `packages/infra/alchemy.run.ts`, `scripts/topology-drift.test.mjs`, `README.md`, `docs/index.md`
- Không đổi: `packages/auth/src/topology.ts` (cookie prefix logic theo domain đã đúng sẵn)

## Implementation Steps

1. Thêm `studentHost`/`studentOrigin` vào `DomainTopology` + `resolveDomainTopology` (`topology.ts`); chạy `pnpm --filter @teacher-os/auth test` (có `topology.test.ts`) để chắc không phá assert hiện có.
2. Viết `apps/student/src/worker.ts` mỏng (tham khảo `apps/web/src/worker.ts` nhưng bỏ robots.txt + host-redirect map; giữ security headers + dotfile 404 + SPA fallback).
3. `alchemy.run.ts`: thêm `studentWorker` block sau `webWorker` (rootDir `../../apps/student`, main `src/worker.ts`, dev port 8003, env VITE_SERVER_URL như web); outputs thêm `student: studentWorker.url`.
4. CORS defaults + guard (giữ fail-loud): nhánh topology default `CORS_ORIGIN = `${topology.appOrigin},${topology.studentOrigin}``; nhánh dev default `http://localhost:8001,http://localhost:8003` (nếu không sẽ khóa toàn bộ login/fetch từ :8003 local — red-team #7). Guard explicit: **vẫn throw trước khi đụng resource** khi explicit value không chứa đủ origin bắt buộc (app + student; local: 8001 + 8003), message hướng dẫn clear env như hiện tại (`alchemy.run.ts:37-50`).
5. Mở rộng `scripts/topology-drift.test.mjs`: đọc `apps/student/vite.config.ts` assert port 8003; cập nhật regex/assertion của CORS default để khớp chuỗi list (regex cũ `withDefault("http://localhost:\d+")` chỉ single-origin) — assert cả hai nhánh chứa đúng cặp origin.
6. README: ports (8000/8001/8002/8003), Project Structure thêm `apps/student`, section "Student portal" ngắn (login bằng email trùng `student.email`, email phải verified, read-only), bước setup `cp apps/student/.env.example .env`; `docs/index.md` trỏ thêm.

## Todo

- [ ] topology studentHost/studentOrigin + test auth package xanh
- [ ] student worker.ts mỏng
- [ ] alchemy studentWorker + CORS default/guard mới
- [ ] topology-drift test mở rộng
- [ ] README/docs cập nhật
- [ ] Gates: pnpm test (bao gồm scripts tests) + check-types + build

## Success Criteria

- `pnpm test` xanh (bao gồm `test:topology-drift` mới); `pnpm build` build được apps/student; `alchemy` typecheck (đi kèm check-types infra) không lỗi.
- `resolveDomainTopology("teacheros.io.vn").studentOrigin === "https://student.teacheros.io.vn"` (assert trong test auth/infra nếu phù hợp).

## Risk Assessment

- Explicit `CORS_ORIGIN` cũ (persist trong worker env từ deploy trước) thiếu origin student → guard **throw** ngay khi deploy (fail-loud, đúng chủ đích thiết kế hiện tại `alchemy.run.ts:37-50`), message rõ hướng fix (clear env hoặc cập nhật đủ 2 origin). Không có kịch bản "deploy xanh mà portal chết".
- Worker mỏng thiếu case (ví dụ trailing slash) → hành vi auto-trailing-slash của `Website.Vite` assets config đã lo; giữ `htmlHandling: "auto-trailing-slash"`, `notFoundHandling: "none"` như web.
- Sửa regex drift test trễ hơn bước đổi default → `pnpm test` đỏ ngay, bắt được trong phase (test chạy cùng gates).

## Security Considerations

- Student origin tham gia CORS/trustedOrigins chỉ đọc/ghi qua credential cookies SameSite=None — đúng cơ chế web hiện có; không thêm origin wildcard (`*`).
- Không in secret vào outputs/logs của alchemy (giữ pattern redacted Config hiện có).

## Next Steps

- Khi sẵn sàng ship: chạy `workflow_dispatch` deploy staging rồi verify `https://student.staging.teacheros.io.vn` login được (runbook production-release-runbook.md); prod follow sau UAT.
