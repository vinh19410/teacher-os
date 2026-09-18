# Project Progress: 2026-09-18 10:36 +07

**Surface:** [Teacher OS project #8](https://github.com/users/vinh19410/projects/8) · repo `vinh19410/teacher-os` · `origin/develop` `@5610c5c` (PR #188)

## Outcome

Board and plan statuses now match live GitHub evidence. M4 is in progress (self-pilot onboard #67). #168 closed after PR #188. Production (`main`) is still v0.0.3 from PR #158 — the 2026-09-17/18 QC wave is on `develop`/staging only.

## Board

| Status | Count |
|--------|------:|
| Done | 71 |
| In progress | 3 |
| Backlog | 11 |
| **Total** | **85** |

### In progress

| Item | Evidence |
|------|----------|
| [#53](https://github.com/vinh19410/teacher-os/issues/53) M4 milestone | Child #67 started; board moved Backlog → In progress this session |
| [#67](https://github.com/vinh19410/teacher-os/issues/67) Self-pilot onboard | Label `in progress` + 2026-09-17 start comment; board synced this session |
| [#170](https://github.com/vinh19410/teacher-os/issues/170) KPI Còn nợ + chip copy | Worktree `vinh19410/issue-170-kpi-debt-chips` at `5610c5c`, no commits yet; label `in progress` added |

### Done this wave (already on board Done; verified closed)

| Issue | PR | Merged |
|-------|----|--------|
| #168 sidebar PRO badge | [#188](https://github.com/vinh19410/teacher-os/pull/188) | 2026-09-18 |
| #166 assignments empty CTA | [#187](https://github.com/vinh19410/teacher-os/pull/187) | 2026-09-18 |
| #120 dashboard greeting | [#186](https://github.com/vinh19410/teacher-os/pull/186) | 2026-09-18 |
| #110 bell popover | [#185](https://github.com/vinh19410/teacher-os/pull/185) | 2026-09-18 |
| #179 settings persist | [#184](https://github.com/vinh19410/teacher-os/pull/184) | 2026-09-18 |
| #169 CSP Insights | [#183](https://github.com/vinh19410/teacher-os/pull/183) | 2026-09-18 |
| #174 delete-account no-op | [#182](https://github.com/vinh19410/teacher-os/pull/182) | 2026-09-17 |
| #173 weekly report persist | [#180](https://github.com/vinh19410/teacher-os/pull/180) | 2026-09-17 |

CI on `develop` after #188: CI, E2E, Deploy Staging all **success**.

## Plans

| Plan | Status | Note |
|------|--------|------|
| `260917-1215-m4-pilot-operations` | in-progress | Only active plan. Body still describes external-teacher recruitment vs current self-pilot scope |
| `260917-1930-fix-173-report-persist` | completed | PR #180 merged; AC checkboxes backfilled |
| `260917-2000-fix-174-no-delete-button` | completed | PR #182 merged; AC checkboxes backfilled |
| `260821-0935-unblock-production-uat-operator-inputs` | completed | Issue #48 closed 2026-08-31; frontmatter synced |
| `260915-1108-syllabus-import-v2` | completed | Issue #150 closed; **phase checkboxes not backfilled** |
| `260826-1611-merge-class-detail-schedule-and-curriculum-tabs` | completed | Issue #89 closed; **phase checkboxes not backfilled (112 items)** |

## Mutations this session

- Project #8: #53 and #67 Backlog → In progress (verified read-back).
- #168 auto-moved In progress → Done on close (PR #188).
- Issue #170: added label `in progress`. Issue #53: added label `in progress`.
- `docs/project-roadmap.md`: M4 **Chưa bắt đầu** → **Đang thực hiện**.
- Plan frontmatter/AC as in table above.

## Docs-impact decision

- Updated: roadmap M4 status line (evergreen status source).
- Not updated: M4 "CHƯA DÙNG ĐƯỢC" for assignment/report/settings persist — those shipped on `develop` but **not** on production `main` yet.

## Next steps

1. Finish #170 (worktree exists, no commits) or return it to Backlog if abandoned.
2. Continue M4: reconcile plan body to self-pilot; start #68 pilot log; production Google sign-in + ≥2 classes evidence for #67.
3. Decide when to promote `develop` → `main` (QC wave #165–#188 is staging-only).
4. Optional: checkbox backfill for import-v2 and merge-tabs (unresolved mapping; do not treat checkbox % as progress).

## Unresolved questions

- Should M4 plan files be rewritten for self-pilot, or is the 2026-09-17 roadmap note enough?
- Promote `develop` to `main` before self-pilot, or pilot on current production v0.0.3?
- #118 empty-state overlap with shipped #166 — still a real bug on other list pages?
