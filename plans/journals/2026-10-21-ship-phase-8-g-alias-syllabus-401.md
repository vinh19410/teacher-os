---
title: "Ship phase 8 gỡ alias syllabus (#401)"
date: 2026-10-21
summary: "Gỡ 7 cặp method-path alias (/api/syllabi GET+POST, /api/syllabi/:id/{modules,replace-content,remove}, /api/classes/:id/{import-syllabus,remove-curriculum}); findSyllabus giữ cho POST /classes. TDD đảo id-thật: red đúng 1 test trước khi gỡ, green sau (server 738/738, web 1551/1551, e2e 178 pass/1 skip). Review: spec 6/6 PASS, quality 0C/0I/1Minor đã fix. kongming: post-plan GO, post-review conditional-GO (PNG noise restore + e2e xanh) đã thỏa. pnpm check root đỏ pre-existing trên develop (19+ diagnostics plans/reports html của #400) — gate scoped biome apps+packages xanh theo precedent #400."
---

# Ship phase 8 gỡ alias syllabus (#401)

Gỡ 7 cặp method-path alias (/api/syllabi GET+POST, /api/syllabi/:id/{modules,replace-content,remove}, /api/classes/:id/{import-syllabus,remove-curriculum}); findSyllabus giữ cho POST /classes. TDD đảo id-thật: red đúng 1 test trước khi gỡ, green sau (server 738/738, web 1551/1551, e2e 178 pass/1 skip). Review: spec 6/6 PASS, quality 0C/0I/1Minor đã fix. kongming: post-plan GO, post-review conditional-GO (PNG noise restore + e2e xanh) đã thỏa. pnpm check root đỏ pre-existing trên develop (19+ diagnostics plans/reports html của #400) — gate scoped biome apps+packages xanh theo precedent #400.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
