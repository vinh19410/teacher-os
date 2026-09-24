---
title: "Plan student onboarding wizard (#264)"
date: 2026-09-24
summary: "Plan wizard onboarding 4 buoc sau verify: scout, planner, red-team 15 findings (CSRF critical), issue #264"
---

# Plan student onboarding wizard (#264)

## Bối cảnh
User yeu cau plan (--github): sau dang ky thanh cong, hien wizard theo step thu thap IELTS/TOEIC, band target, muc tieu hoc tieng Anh, gio hoc/ngay.

## Da lam
1. **Scout** (Explore agent): repo Better-T-Stack monorepo — student portal (TanStack Router/Form/Query), Hono server + better-auth, Drizzle D1 (migrations den 0023), bridge provisioning `/api/student/*` gate `emailVerified`. KHONG co wizard/stepper/field muc tieu nao hien huu; "toeic" chua ton tai. Report: `plans/260924-0533-student-onboarding-wizard/reports/scout-report.md`.
2. **Planner**: 4 phase — (1) DB 6 cot nullable + migration 0024 + contracts enums; (2) POST /api/student/onboarding + mo rong studentMeSchema + unit tests; (3) portal /onboarding + wizard UI + gate 2 chieu; (4) e2e + cap nhat spec cu + gates.
3. **Red-team** (3 reviewer hostile): 24 raw -> 15 accepted. Nang nhat:
   - **Critical**: POST moi thieu guard CSRF (Origin + content-type) — kernel bat buoc cho moi mutation vi cookie SameSite=None; form text/plain cross-site vuot qua c.req.json(). Fix: middleware CSRF truoc middleware session + unit tests (Phase 2).
   - **High**: (a) gate dat sau nhanh overviewQuery.error ket user khi overview loi -> chuyen giua 2 nhanh error; (b) race invalidate->navigate doc cache cu, bounce ve wizard mat state -> setQueryData DTO moi truoc navigate; (c) collision migration 0024 voi plan #260 (cung claim 0024) -> quy trinh re-read journal + delete/regenerate; (d) cohort hoc vien hien huu bi ep wizard vinh vien -> D8 chu y thu thap tu cohort hien huu, kill-switch SQL.
   - Medium: version-skew `.catch(null)` read-side; Google OAuth path; validate read-side 4 phia; Textarea co san trong packages/ui; snippet navigate; effort phase 4.
4. **Verification** Standard tier: 64 claims, 58 V / 5 F (deu fix qua findings); Contract Verifier liet ke du consumer studentMeSchema/StudentMe//me — khong bo sot.
5. Consistency sweep: 5 stale references reconciled, 0 contradictions. `ak plan validate` OK. Pin active plan. Issue #264 + label "ready to review".

## Ket qua
- Plan: `plans/260924-0533-student-onboarding-wizard/` (plan.md + 4 phase files + scout report), effort 11h, P2.
- Issue: https://github.com/vinh19410/teacher-os/issues/264

## Bai hoc
- Endpoint ghi dau tien tren router "read-only" phai keo theo phong thu CSRF cua kernel — middleware provisioning chi check session, khong chane cross-site POST; kiem tra invariant posture (comment contracts "Read-only endpoints") truoc khi mo rong.
- Hai plan song song cung claim so migration ke tiep la mac dinh, khong phai bien co — quy trinh phai re-read journal ngay truoc generate + co buoc re-check truoc mo PR.
- invalidateQueries fire-and-forget + navigate ngay tao cua so stale-cache ma gate doc — setQueryData tu DTO mutation tra ve la fix co dinh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
