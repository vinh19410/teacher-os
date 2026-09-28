---
title: "Phase 1: Scaffold app apps/student"
status: todo
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Scaffold app `apps/student`

## Context Links

- `reports/scout-report.md` (mục 1, 2, 3, 7 — blueprint apps/web, workspace/catalog, packages/ui)
- `open-design/student-portal-prompt.md` (design contract tổng thể)
- Blueprint: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`

## Overview

- Priority: P1 · Status: todo
- Tạo app React SPA thứ 4 `apps/student` (port 8003) copy blueprint từ `apps/web`, boot được placeholder (guard login → tổng quan rỗng), đi qua đủ quality gates của monorepo. Chưa đụng auth/API thực — chỉ khung app + router + query + UI package.

## Key Insights

- `apps/landing` là static site — KHÔNG phải precedent; copy từ `apps/web` (Vite + TanStack Router file-based + Tailwind v4 + `@teacher-os/ui`).
- turbo/biome/CI bao phủ app mới tự động qua workspaces (`pnpm-workspace.yaml` globs `apps/*`); chỉ cần thêm script `dev:student` ở root `package.json`.
- Web có spa404Plugin + `src/routes-matcher` riêng; v1 của student KHÔNG copy (non-goal đã ghi trong plan.md).
- Env client tái dùng nguyên xi `@teacher-os/env/web` (`VITE_SERVER_URL`).

## Requirements

- [x] `apps/student` là workspace member, `build`/`test`/`check-types` chạy được qua turbo
- [x] Dev server :8003 strictPort; router có `/login` placeholder và `_auth` guard → `/` (tổng quan placeholder)
- [x] Query client có handler 401 → redirect `/login` (không phụ thuộc guard — guard chỉ chạy lúc navigation)
- [x] Fresh clone: copy `.env.example` → `.env` là `pnpm dev:student` boot được
- [x] Không chỉnh sửa hành vi hiện có của `apps/web`/`apps/server`

## Architecture

```
apps/student/
├── package.json          # name "student", deps mirror apps/web (bỏ papaparse, read-excel-file, next-themes; giữ sonner cho Phase 4)
├── index.html            # lang="vi", <div id="app">, title "Teacher OS · Học viên"
├── tsconfig.json         # như apps/web tsconfig (paths @/* + @teacher-os/ui/*)
├── vite.config.ts        # port 8003 strictPort; tailwindcss + tanstackRouter + react
├── vitest.config.ts      # node env + tsconfigPaths
├── components.json       # copy từ apps/web (shadcn alias về packages/ui)
└── src/
    ├── main.tsx          # QueryClientProvider + RouterProvider (chưa cần devtools)
    ├── index.css         # @import "@teacher-os/ui/globals.css";
    ├── lib/query-client.ts  # QueryClient + QueryCache onError: 401 → redirect /login?returnUrl= (pattern apps/web/src/lib/query-client.ts:29-35)
    ├── lib/auth-client.ts   # createAuthClient giống apps/web/src/lib/auth-client.ts (bản local)
    └── routes/
        ├── __root.tsx
        ├── index.tsx         # placeholder tổng quan (thật ở Phase 4)
        ├── login.tsx         # placeholder "Đăng nhập học viên" (thật ở Phase 3)
        └── _auth/route.tsx   # beforeLoad guard giống apps/web/src/routes/_auth/route.tsx
```

Ngoài ra: `apps/student/.env.example` (chứa `VITE_SERVER_URL=http://localhost:8000`) — `@teacher-os/env/web` throw lúc import nếu thiếu biến (`packages/env/src/web.ts:4-11`), và `apps/web/.env` không nằm trong git (`.gitignore` `.env*`), không có .env.example nào để tham chiếu khi fresh clone.

## Related Code Files

- Create: toàn bộ cây `apps/student/**` nêu trên (gồm `.env.example`)
- Modify: `package.json` (root — thêm `"dev:student": "turbo run dev -F student --"`)

## Implementation Steps

1. Tạo `apps/student/package.json` copy từ `apps/web`, giữ `@teacher-os/{api,auth,env,ui}`, tanstack, tailwind, vite, vitest; bỏ phụ thuộc chưa dùng (papaparse, read-excel-file, next-themes); giữ sonner cho toast Phase 4. **Script phải tên `dev`** (không `dev:bare` như web) để turbo task `dev` và `alchemy dev` nhận được — `apps/server` không có script dev riêng (chạy qua alchemy).
2. Tạo `tsconfig.json`, `vite.config.ts` (port 8003, strictPort), `vitest.config.ts`, `index.html`, `components.json`, `.env.example` — đối chiếu từng file blueprint.
3. Viết `src/main.tsx`, `src/index.css`, `src/lib/query-client.ts` (có QueryCache onError 401 → `redirect /login` giữ returnUrl), `src/lib/auth-client.ts`, `src/routes/{__root,index,login}.tsx`, `src/routes/_auth/route.tsx` — copy pattern web, brand text học viên, placeholder component nội tuyến.
4. Thêm script `dev:student` vào root `package.json`; `pnpm install` để lockfile cập nhật.
5. Chạy gates: `pnpm check` (biome viết lại format), `pnpm check-types`, `pnpm build`, `pnpm test`.

## Todo

- [x] Scaffold cây file `apps/student` theo Architecture (gồm `.env.example`)
- [x] `dev:student` script + `pnpm install` xanh
- [x] Query-client 401 handler
- [x] Gates xanh: check / check-types / build / test

## Success Criteria

- `pnpm dev:student` (sau `cp .env.example .env`) → http://localhost:8003 mở được placeholder login; truy cập `/` khi chưa có session bị redirect về `/login`.
- `pnpm check && pnpm check-types && pnpm build && pnpm test` xanh toàn monorepo; `apps/web` không đổi hành vi.

## Risk Assessment

- Version drift giữa deps copy và catalog → dùng `catalog:`/version giống hệt `apps/web/package.json`, không nâng phiên bản.
- Thiếu file nhỏ (components.json/postcss) gây build fail → đối chiếu checklist Architecture từng mục trước khi chạy gates.
- Quên copy `.env.example` → app crash lúc import env với error khó hiểu (t3-env throw) → README bước "cp .env.example .env" (Phase 5 ghi lại).

## Security Considerations

- Không nhúng secret vào app; `VITE_SERVER_URL` là biến public (pattern hiện có của web).

## Next Steps

- Phase 2 (server bridge) và Phase 3 (login thật) phụ thuộc khung này.
