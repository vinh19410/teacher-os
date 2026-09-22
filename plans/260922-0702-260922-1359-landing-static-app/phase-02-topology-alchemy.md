---
phase: 2
title: "Topology + Alchemy wiring"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Topology + Alchemy wiring

## Goal

Mở rộng `resolveDomainTopology` với `landingHost`/`landingAliases`, rút apex + www khỏi `appAliases` của web worker, và thêm `Cloudflare.Website.StaticSite("landing", ...)` vào stack `teacher-os` trong `alchemy.run.ts`. Sau phase này, một deploy (staging trước, prod sau) sẽ đưa landing lên apex domain và web thu hẹp về đúng `app.<domain>`.

## Files to Create / Modify

- Modify: `packages/infra/src/topology.ts` — thêm `landingHost`/`landingAliases`, `appAliases` về mảng rỗng, cập nhật docblocks.
- Modify: `packages/infra/alchemy.run.ts` — thêm landing StaticSite resource + output `landing`.

## Tasks & Steps

1. **`packages/infra/src/topology.ts`**:

   - Thêm 2 field vào `DomainTopology` (kèm docblock cùng style các field hiện có):

     ```ts
     /** Landing page hostname: the bare APP_DOMAIN itself (prod apex). */
     landingHost: string;
     /**
      * Additional hostnames attached to the landing Worker. Serves the same
      * content (no 301 to apex — Redirect Rules need the Rulesets API the CI
      * token lacks); duplicate content is handled by the page's canonical tag.
      */
     landingAliases: string[];
     ```

   - Trong `resolveDomainTopology`: thay logic `appAliases` 3 nhánh (`topology.ts:75-80`) bằng `const appAliases: string[] = [];` và thêm vào object trả về:

     ```ts
     landingHost: domain,
     landingAliases: [`www.${domain}`],
     ```

     Với mọi môi trường: prod → landing `teacheros.io.vn` + `www.teacheros.io.vn`; staging → `staging.teacheros.io.vn` + `www.staging.teacheros.io.vn`; zone lạ → tương tự theo domain đưa vào.

   - Cập nhật docblock của `appAliases` (`topology.ts:35-41`) cho đúng semantics mới: field giờ luôn rỗng — apex/www không còn gắn vào web Worker nữa mà thuộc landing Worker; giữ lại ghi chú lịch sử về việc chọn `aliases` thay vì `redirects` để tránh Rulesets API (tiền lệ vẫn đúng cho landing).

2. **`packages/infra/alchemy.run.ts`** — trong `Effect.gen` của stack, sau `webWorker` (`alchemy.run.ts:100-123`), thêm:

   ```ts
   const landingWorker = yield* Cloudflare.Website.StaticSite("landing", {
   	cwd: "../../apps/landing",
   	command: "pnpm build",
   	outdir: "dist",
   	assets: {
   		htmlHandling: "auto-trailing-slash",
   		notFoundHandling: "none",
   	},
   	...(topology && {
   		domain: {
   			name: topology.landingHost,
   			aliases: topology.landingAliases,
   		},
   		workersDev: false,
   	}),
   	dev: {
   		command: "pnpm dev",
   		url: "http://localhost:8002",
   	},
   });
   ```

   - **Dạng `domain` phải là object lồng `{ name, aliases }`** — `aliases` là field của `WorkerDomainConfig` (Alchemy `Worker.d.ts:166-181`), KHÔNG phải prop top-level của WorkerProps; `domain` string chỉ là shorthand của `{ name }` (`Worker.d.ts:647`). Web worker đang dùng đúng dạng lồng này (`alchemy.run.ts:107-113`).
   - Bỏ `main`/`script` → assets-only Worker: Alchemy không upload script, Cloudflare asset layer tự serve mọi request (`StaticSite.d.ts` — "no Worker code is uploaded, and Cloudflare's asset layer serves every request itself").
   - `dev.url` tường minh: serve.mjs là server tự viết, không đảm bảo in URL theo format Alchemy auto-detect từ stdout.
   - Cập nhật output của stack (`alchemy.run.ts:125-128`): thêm `landing: landingWorker.url`.

3. **Ràng buộc bảo vệ drift test**: KHÔNG thêm bất kỳ `withDefault("http://localhost:...")` nào vào `alchemy.run.ts`. Drift test lấy **first match** regex `withDefault\("(http://localhost:\d+)"\)` (`scripts/topology-drift.test.mjs:34-36`) và so với web dev port — match hiện tại là CORS default `http://localhost:8001` ở `alchemy.run.ts:56`; một `withDefault` mới đứng trước dòng đó sẽ làm test vỡ. `dev.url` ở trên là plain object property, không phải `withDefault` — an toàn.

## Risk — custom-domain handover

Detach apex/www khỏi web Worker và attach vào landing Worker xảy ra trong cùng lần `alchemy deploy`. Cert cho apex + www đã tồn tại sẵn trong zone (web đã giữ các hostname này từ trước qua `appAliases` cũ) nên re-attach nhanh; chấp nhận gap vài phút ở prod, và **buộc chạy staging trước** (staging apex không có traffic thật). Smoke poll 10 phút (phase 3) là lưới an toàn sau deploy. Nếu deploy prod lỗi giữa chừng: re-run deploy (Alchemy adopt resource theo state) hoặc rollback code (xem plan.md Rollback).

## Verification

- `pnpm --filter @teacher-os/infra check-types` — type pass, xác nhận dạng `domain` lồng hợp lệ.
- `pnpm --filter @teacher-os/infra test` — vitest infra xanh.
- `pnpm test:topology-drift` — các test HIỆN CÓ vẫn xanh (phase này chưa thêm test mới; đặc biệt test web dev port phải không vỡ).
- `pnpm check` — biome toàn repo.
- Local `alchemy dev` (tùy chọn, có Cloudflare credentials): landing sidecar chạy ở :8002 cùng server :8000 + web :8001.
