## Summary

Milestone 0: chứng minh Teacher OS chạy an toàn trên Cloudflare Workers + D1 thật trước pilot. Scope: topology app/API subdomain, staging/recovery drill, readiness, UI fail-safe và UAT evidence.

- Branch: `develop`
- Plan: `plans/260819-2034-production-readiness/plan.md`
- Brainstorm report: None found
- Open questions: None; topology/staging/UAT authority đã xác nhận trong plan.

## Child issues

1. #34 — production configuration, app/API subdomain and support runbook
2. #29 — D1 migration safety and recovery rehearsal
3. #31 — schema-aware readiness endpoint
4. #33 — first-snapshot fail-safe
5. #32 — truthful retry-safe mutation outcomes
6. #30 — live UAT and release evidence

## Acceptance criteria

- [ ] Google sign-in, cross-subdomain session/CORS và bootstrap org pass trên origin đã chốt.
- [ ] D1 migration + recovery drill pass trên staging; không sửa migration đã apply.
- [ ] `/readyz` chứng minh Worker + required D1 schema; initial snapshot failure không render workspace rỗng.
- [ ] Mọi kernel mutation có outcome commit/refresh rõ ràng; không blind-retry outcome chưa biết.
- [ ] UAT thực tế pass: Google sign-in → bootstrap → syllabus/class → add student vào class → reload → sign-out/sign-in.

## Non-goals

Không gồm browser E2E đầy đủ, CI/CD deploy, schedule/invoice creation, RBAC, payment gateway, alerting/Sentry hoặc backup scheduler.
