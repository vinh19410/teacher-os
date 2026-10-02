---
name: worktree-review-setup
description: Feature-branch reviews for teacher-os run in sibling worktrees under personal/worktrees/, not the main checkout
metadata:
  type: project
---

Code reviews are delegated against a feature worktree at
`/Users/vinhtran/Documents/project/personal/worktrees/teacher-os-vinh<id>-issue-<n>-<slug>`,
while the main checkout (`personal/teacher-os`) may sit on another branch.

**Why:** the user isolates feature work in numbered worktrees per issue; the
main repo's git state is irrelevant to the reviewed diff.

**How to apply:** always run `git -C <worktree> diff develop...HEAD` (or the
given base) inside the worktree path from the task; verify file/line findings
against worktree files, never against the main checkout. Reviewer role is
read-only for code — report findings, do not edit source. The review report
itself goes to the exact path the parent task names (typically
`<worktree>/plans/reports/code-review-security-*.md`), and the same findings
are repeated in the final text message.

Ops notes: unit tests, `pnpm check`, and the e2e suite all run fine inside the
worktree; e2e self-boots API + vite via playwright webServer (no docker), use
the port overrides from AGENTS.md (8100/8101/8103) so it never fights the dev
stack on 8000/8001/8003. When a claim depends on a node_modules package
(reading it is hook-blocked), verify against the exact version tag on GitHub
instead of trusting plan text.
