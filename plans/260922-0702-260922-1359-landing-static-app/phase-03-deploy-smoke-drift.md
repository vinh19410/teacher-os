---
phase: 3
title: "Deploy smoke + drift tests"
status: todo
priority: P2
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Deploy smoke + drift tests

## Goal

Bổ sung smoke check cho landing apex vào 2 workflow deploy (prod + staging) theo đúng style poll-retry hiện có, và mở rộng `scripts/topology-drift.test.mjs` khóa chặt topology mới (runtime import topology.ts + text assert LANDING_ORIGIN). Không đụng `ci.yml` (contract test `scripts/ci-workflow.test.mjs` khóa cứng các step PR pipeline).

## Files to Create / Modify

- Modify: `.github/workflows/deploy.yml` — env `LANDING_ORIGIN` + smoke step landing apex.
- Modify: `.github/workflows/deploy-staging.yml` — env `LANDING_ORIGIN` + smoke step landing apex.
- Modify: `scripts/topology-drift.test.mjs` — thêm 2 test mới.

## Tasks & Steps

1. **`.github/workflows/deploy.yml`** (prod):

   - Thêm vào khối `env` global (sau `APP_ORIGIN` ở `deploy.yml:33`): `LANDING_ORIGIN: https://teacheros.io.vn`.
   - Thêm step cuối job `deploy` (sau smoke stubs), mirror retry style `/readyz` (`deploy.yml:84-99`):

     ```yaml
      - name: Smoke check landing apex (/)
        # Apex handover (web → landing StaticSite): the first attach of the
        # custom domain may wait on DNS/cert provisioning; poll up to ~10
        # minutes like /readyz.
        run: |
          for attempt in $(seq 1 30); do
            code=$(curl -sS --connect-timeout 5 --max-time 30 \
              -D /tmp/landing-headers.txt -o /tmp/landing.html \
              -w '%{http_code}' "$LANDING_ORIGIN/" || true)
            if [ "$code" = "200" ] \
              && grep -qi '^content-type: text/html' /tmp/landing-headers.txt \
              && grep -q 'Teacher OS' /tmp/landing.html; then
              echo "landing apex OK after attempt $attempt"
              exit 0
            fi
            echo "attempt $attempt: HTTP $code, retrying in 20s"
            sleep 20
          done
          echo "::error::landing apex did not serve HTML within 10 minutes of deploy"
          exit 1
     ```

     Grep `"Teacher OS"` khớp title trang (`landing.html:6`). KHÔNG đụng `APP_DOMAIN`, các env và step hiện có.

2. **`.github/workflows/deploy-staging.yml`** (staging) — tương tự: `LANDING_ORIGIN: https://staging.teacheros.io.vn` (sau `APP_ORIGIN` ở `deploy-staging.yml:45`) + smoke step như trên đặt sau smoke stubs. Đây là lần chạy landing đầu tiên trên môi trường thật (rehearsal handover trước prod).

3. **`scripts/topology-drift.test.mjs`** — thêm 2 test:

   - Runtime import topology qua Node type-stripping (Node 24 chạy `.ts` chỉ chứa erasable syntax — interface/type annotations — được; topology.ts thỏa mãn):

     ```js
     test("topology derives landing host and frees app aliases", async () => {
     	const { resolveDomainTopology } = await import(
     		"../packages/infra/src/topology.ts"
     	);
     	const t = resolveDomainTopology("teacheros.io.vn");
     	assert.equal(t.landingHost, "teacheros.io.vn");
     	assert.deepEqual(t.appAliases, []);
     	assert.ok(t.landingAliases.includes("www.teacheros.io.vn"));
     });
     ```

   - Text assert workflow env, cùng style test APP_DOMAIN sẵn có (`topology-drift.test.mjs:76-87`):

     ```js
     test("workflow LANDING_ORIGIN matches each stage apex", () => {
     	const prod = read("../.github/workflows/deploy.yml").match(
     		/^\s*LANDING_ORIGIN:\s*(\S+)\s*$/m,
     	)?.[1];
     	assert.equal(prod, "https://teacheros.io.vn");

     	const staging = read("../.github/workflows/deploy-staging.yml").match(
     		/^\s*LANDING_ORIGIN:\s*(\S+)\s*$/m,
     	)?.[1];
     	assert.equal(staging, "https://staging.teacheros.io.vn");
     });
     ```

## Verification

- `pnpm test:topology-drift` — toàn bộ (cũ + mới) xanh.
- `pnpm test:ci-workflow` — contract CI không vỡ (2 workflow deploy ngoài scope contract ci.yml, nhưng chạy cho chắc).
- `node --test scripts/topology-drift.test.mjs` — chạy trực tiếp OK (đường import `.ts` hoạt động với Node 24).
- `pnpm test` — full quality gate xanh như trong job `quality` của cả 2 workflow.
- Sau merge develop: kiểm tra run Deploy Staging xanh, gồm step landing apex; `curl -s https://staging.teacheros.io.vn/ | grep "Teacher OS"` trả kết quả.
