---
title: "Fix #406 — dọn 3 comment trỏ route /syllabi đã gỡ"
date: 2026-10-22
summary: "Root cause: PR #405 gỡ alias /api/syllabi/* nhưng 3 comment còn trỏ route chết (contracts.ts:1133, kernel.ts:1082, student.ts:363). Fix: thay bằng POST /api/syllabus-templates (syllabus.ts:411); student.ts sửa thêm precedent bodyLimit sang syllabus.ts (sửa luôn lỗi trỏ sai file cũ). Verify: grep 0 hit; biome scoped 3 file exit 0 (pnpm check toàn repo đỏ pre-existing do plans/reports brainstorm HTML — follow-up #409, counsel kongming chọn hướng scoped gate); check-types exit 0; server test 738/738. Review fresh-context: 0 Critical/0 Important/0 Minor. Ship beta vào develop."
---

# Fix #406 — dọn 3 comment trỏ route /syllabi đã gỡ

Root cause: PR #405 gỡ alias /api/syllabi/* nhưng 3 comment còn trỏ route chết (contracts.ts:1133, kernel.ts:1082, student.ts:363). Fix: thay bằng POST /api/syllabus-templates (syllabus.ts:411); student.ts sửa thêm precedent bodyLimit sang syllabus.ts (sửa luôn lỗi trỏ sai file cũ). Verify: grep 0 hit; biome scoped 3 file exit 0 (pnpm check toàn repo đỏ pre-existing do plans/reports brainstorm HTML — follow-up #409, counsel kongming chọn hướng scoped gate); check-types exit 0; server test 738/738. Review fresh-context: 0 Critical/0 Important/0 Minor. Ship beta vào develop.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
