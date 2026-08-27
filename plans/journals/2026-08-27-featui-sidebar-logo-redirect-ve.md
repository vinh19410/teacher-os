---
title: "feat(ui): sidebar logo redirect ve /"
date: 2026-08-27
summary: "Logo sidebar thanh Link '/' dong drawer mobile, giu nguyen geometry pt-8 baseline"
---

# feat(ui): sidebar logo redirect ve /

## What happened
Chuyen block logo sidebar ("T" + "Teacher OS") tu div tinh thanh TanStack Router `<Link to="/" onClick={onNavigate} title="Về trang chủ">` trong `apps/web/src/components/layout/sidebar.tsx`. Click logo gio dieu huong ve `/` (route `/` tai `apps/web/src/routes/index.tsx` beforeLoad-redirect sang `/dashboard`) va dong mobile drawer qua contract `onNavigate` chung voi nav items.

## Decision
Giu geometry pixel-equivalent: `-mt-2` trieu tieu p-2 top padding de content van nam tren baseline `pt-8` cua aside (bao toan intent cua commit 98d6e96 vua fix breathing room); `mb-3` + p-2 bottom = 20px giu dung gap cu (thay pb-5). Them comment invariant canh bao -mt-2 va pt-8 phai di cung nhau. `self-start` shrink-wrap hover/hit-area quanh logo thay vi full-width nhu nav links.

## Verification
Tester subagent: biome check file PASS, `pnpm --filter web check-types` (vite build + tsc --noEmit) PASS, vitest web 309/309 PASS. Code-reviewer subagent: APPROVE — du 8 acceptance criteria gom so hoc geometry; khong regression nav/profile/sign-out; public contract ({open, onNavigate}) khong doi.

## Next steps
Follow-up non-blocking tu reviewer: profile Link (sidebar.tsx ~dòng 256) thieu `onClick={onNavigate}` nen bam profile trong mobile drawer chua dong drawer — lam ticket rieng. Sidebar hien 0% coverage test; cân nhắc component test render + assert logo la Link `to="/"`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
