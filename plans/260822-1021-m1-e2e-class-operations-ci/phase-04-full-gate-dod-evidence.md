---
title: "Phase 4: Full gate xanh + CI evidence + DOD tick + issue evidence"
status: todo
priority: P1
effort: 2h
dependencies: [phase-03-class-operations-spec-ci.md]
---

# Phase 4: Full gate xanh + CI evidence + DOD tick + issue evidence

## Overview

Verification & evidence gate cuối: full regression xanh local, push branch, quan sát job `e2e` xanh trên PR, rồi mới tick DOD `docs/project-roadmap.md:44` kèm evidence và comment evidence vào issue #59. Không code mới — chỉ evidence wiring (thứ tự quan trọng: tick SAU khi có run URL xanh).

## Requirements

- [ ] Full regression gate xanh local (kể cả e2e).
- [ ] Branch push, PR mở (hoặc branch chạy qua workflow push trigger), job `E2E` xanh trên GitHub Actions; job `quality` (ci.yml) cũng xanh và KHÔNG chứa playwright.
- [ ] `docs/project-roadmap.md:44` dòng `- [ ] E2E CI xanh: login → tạo lớp có lịch → thấy buổi → check-in → reload giữ data.` → `- [x] ...` kèm link run.
- [ ] Issue #59 comment evidence: link workflow run xanh + mô tả spec coverage.

## Architecture

Không đổi kiến trúc. Evidence flow: local gate → push → CI run URL → roadmap tick + issue comment (cùng PR).

## Related Code Files

| Action | Path |
|--------|------|
| Modify | `docs/project-roadmap.md` — tick checkbox dòng 44 + evidence link |
| Modify | Issue #59 (GitHub, qua `gh issue comment 59 ...`) — KHÔNG sửa file |

## Implementation Steps

1. Full gate local:

```bash
pnpm install --frozen-lockfile && pnpm exec biome check . && pnpm test && pnpm check-types && pnpm build && pnpm --filter e2e e2e
```

(thêm `pnpm build` một lần cuối vì ci.yml quality job có build — đảm bảo không vỡ ở khâu đó.)

2. Commit + push branch `feat/59-e2e-class-operations` (worktree đã ở branch này). Mở PR nếu chưa có (gh pr create). Workflow e2e.yml trigger bởi `pull_request` + `push`.
3. Quan sát: `gh run watch` hoặc Actions tab. Yêu cầu: job `E2E` xanh (cả 2 specs), job `quality`/CI xanh. Nếu e2e đỏ trên CI dù local xanh: tải artifact `playwright-report` (upload khi fail), đọc trace, fix, push lại — KHÔNG tick DOD khi chưa xanh.
4. Tick DOD — sửa dòng `docs/project-roadmap.md:44`:

```markdown
- [x] E2E CI xanh: login → tạo lớp có lịch → thấy buổi → check-in → reload giữ data. ([evidence: Actions run #<N>](<run-url>))
```

5. Evidence issue:

```bash
gh issue comment 59 --body "Evidence for M1 DOD 'E2E CI xanh': workflow run <run-url> (job E2E xanh trên PR). Spec: apps/e2e/specs/class-operations.spec.ts — login → tạo lớp có lịch (T2/T4, Writing, 12 buổi) → thêm học viên sinh 12 buổi 'Sắp tới' → Điểm danh → reload: trạng thái completed sống sót trên /schedule + tab 'Lịch học' thấy 1 'Đã học' + 11 'Sắp tới'. Roadmap ticked at docs/project-roadmap.md."
```

6. Re-run gate local lần cuối sau khi sửa roadmap (docs-only nhưng giữ kỷ luật):

```bash
pnpm install --frozen-lockfile && pnpm exec biome check . && pnpm test && pnpm check-types
```

### Regression Gate (final)

```bash
pnpm install --frozen-lockfile && pnpm exec biome check . && pnpm test && pnpm check-types && pnpm build && pnpm --filter e2e e2e
```

## Success Criteria

- [ ] Local gate + `pnpm build` + `pnpm --filter e2e e2e` xanh trong MỘT chuỗi lệnh.
- [ ] Run GitHub Actions job `E2E` xanh trên PR của branch (URL ghi lại).
- [ ] Job `quality` (ci.yml) xanh, output turbo task `test` không chứa package e2e.
- [ ] `docs/project-roadmap.md:44` = `[x]` với evidence link; `git diff docs/project-roadmap.md` chỉ đổi dòng đó (và không phá các dòng DOD khác).
- [ ] Issue #59 có comment evidence (run URL + coverage spec).

## Risk Assessment

| Risk (wrong assumption) | Observable signal | Pre-decided response |
|---|---|---|
| Local xanh nhưng CI đỏ (env差异: browser cache, timing, cold vite) | Job E2E đỏ; artifact playwright-report có trace | Tải artifact đọc trace screenshot; reproduce local với `CI=1 pnpm --filter e2e e2e` (reuseExistingServer tắt); fix selector/wait; KHÔNG lỏng assertion (đặc biệt count 12/1/11) |
| Tick DOD trước khi CI xanh (process risk) | Reviewer thấy tick nhưng không run URL | Quy trình phase này ép thứ tự: tick ở bước 4, SAU bước 3 xanh; nếu CI cần fix thêm → untick trước khi push tiếp |
| Workflow không trigger | Không thấy run E2E trên PR | Kiểm tra branches filter main/develop và PR target; push trực tiếp branch cũng trigger `push:` chỉ khi branch là main/develop — nếu PR target branch khác, tạm thêm branch vào `branches` list RỒI bỏ trước merge (hoặc merge vào develop trước) |
| `pnpm build` vỡ vì exports map mới của apps/server | Build đỏ ở tsdown/alchemy stage | Đã giữ entry `"."` → `src/index.ts`; nếu tsdown đọc `main` thay exports → giữ nguyên `main`, exports chỉ thêm (additive); kiểm tra `pnpm --filter server build` |
| Roadmap sửa nhầm dòng DOD khác | Diff roadmap nhiều dòng | Chỉ đổi dòng 44; xem diff trước commit |
