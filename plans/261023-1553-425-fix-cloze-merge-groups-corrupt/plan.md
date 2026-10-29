---
title: "Fix 2 finding defer #420/#424: segmentsToItems merge nhầm metadata + parseGroups fail-soft mất groups"
description: "Chặn gán nhầm explanation/answerSet khi blank dịch chuyển và chặn lưu im lặng xóa groups corrupt trong admin library — điều kiện trước PR3."
status: pending
priority: P1
effort: "7h"
tags: [bugfix, admin, api, ui, library]
blockedBy: []
blocks: []
created: 2026-10-23
issue: https://github.com/vinh19410/teacher-os/issues/425
branch: ai-handle-issue-425
---

# Fix 2 finding defer #420/#424 — điều kiện trước PR3

## Overview

Issue #425 defer 2 finding Medium từ code review #420/#424, **phải fix trước PR3** (web học viên làm đề thư viện) vì sai `answerSet` làm grader chấm sai bộ "Choose TWO":

1. **Finding 1** — `segmentsToItems` (`packages/ui/src/lib/cloze.ts:226`, nhánh `feat/424-quiz-builder-page-refactor`) merge `{ ...base, ...applied }` theo vị trí index. Chèn/xóa blank trước các blank đã soạn → `explanation`/`answerSet`/`pin`/`type` của câu cũ bám vào nội dung text mới. **Đã repro**: xóa blank 2 trong chuỗi 5 blank → item nội dung "three" nhận `explanation` của q2 cũ.
2. **Finding 2** — `parseGroups` (`apps/server/src/routes/admin-library.ts:130`) fail-soft all-or-nothing: JSON hỏng/phần tử sai shape → `[]` không log không cờ. Admin mở part (thấy `groups: []`), sửa field khác rồi lưu → PUT ghi `[]` đè JSON cũ → mất groups thật, không dấu hiệu; đề vẫn publish được vì `validatePartForReady` coi `groups.length === 0` là "nhóm ngầm" hợp lệ.

Nhánh làm việc `ai-handle-issue-425` đặt trên tip `feat/424-quiz-builder-page-refactor` (`0ed7cfea`) vì code bug chỉ tồn tại ở đó. PR mở vào `develop`; **PR này phụ thuộc #427** (PR của #424, cùng 11 commits nền) — xem "Thứ tự merge".

## Quyết định đã chốt (kongming + red-team 2026-10-23)

| # | Quyết định | Hệ quả |
|---|---|---|
| D1 | Finding 1: merge metadata theo **khoá nội dung `answer.trim()`**: mỗi segment chọn base UNUSED cùng answer có `|baseIdx − segIdx|` nhỏ nhất (tie → baseIdx nhỏ); **pass 2**: khi `segments.length === existing.length`, segment chưa khớp kế thừa metadata `existing[i]` nếu chưa dùng (sửa answer/typo không mất explanation — kongming plan-gate). Không dùng stem làm khoá — stem là `gap + marker + trailing`, gap hấp thụ từ bị xóa nên stem đổi khi xóa blank liền kề (red-team C1: `cloze.ts:209,215`) | Blank mới (answer chưa có) → item sạch; blank bị xóa → metadata của nó tự rơi; đổi answer + cấu trúc không đổi → giữ metadata; đổi answer + xóa/chèn cùng lúc → metadata của blank đổi answer rơi; trùng answer (chữ chức "the") → map nearest-index, không drop khi không đổi cấu trúc |
| D2 | Mơ hồ cố hữu trong run trùng answer khi xóa 1 phần tử: metadata exchange trong run (grading không đổi vì answer giống nhau) — chấp nhận có chủ đích, test khóa biên | Ghi comment + test 5 phase-01 |
| D3 | Finding 2: `parseGroups` trả `{groups, corrupt, reason}` (`malformed \| non-array \| shape \| over-cap`), corrupt → `console.error` kèm `testId/part/reason`; DTO thêm `groupsCorrupt: z.boolean().default(false)`; upsert schema thêm `discardCorruptGroups: z.literal(true).optional()` | `.default(false)` giúp admin mới parse được response server cũ (deploy-skew 1 chiều); server emit luôn set field |
| D4 | PUT part guard: (a) `discardCorruptGroups: true` khi row KHÔNG corrupt → 409 `GROUPS_NOT_CORRUPT` (chặn destructive-clear từ snapshot stale); (b) row corrupt + flag → cho qua + log (payload groups rỗng hay đã soạn lại đều được — ý định tường minh qua cờ); (c) row corrupt + KHÔNG có cờ → **luôn 409 `GROUPS_CORRUPT` bất kể payload groups** (advisory: `group-model.ts` `addGroup`/`splitIntoGroups` có thể sinh payload non-empty mà admin không hề thấy dữ liệu corrupt — không có xác nhận nào ngoài log là chưa đủ) | Không còn đường mất im lặng: mọi ghi đè corrupt đều cần cờ tường minh + log |
| D5 | **Guard cả đường publish**: route cập nhật header (`PATCH /tests/:id`) khi `status === "ready"`: có bất kỳ part nào corrupt → 409 `GROUPS_CORRUPT` | Chặn phát hành đề mất nhóm thật (red-team H: `toPartInput` → `[]` → "nhóm ngầm" → validate pass) |
| D6 | Merge order: **không tự merge PR #427** (đang do pipeline #424 chạy review). PR #425 mở với "Depends on #427"; #427 MERGED → `git fetch origin && git merge origin/develop` vào **chính nhánh `ai-handle-issue-425`** (merge thường, KHÔNG rebase, KHÔNG force-push, KHÔNG nhánh/PR mới — ràng buộc trigger), resolve conflict (không resolve sạch → STOP + kongming), **re-run toàn bộ gates**, `git push` thường | PR giữ nguyên head; diff tự co còn phần fix khi develop đã chứa 11 commits #424 |
| D7 | Merge bằng **merge commit, không squash** | Giữ hash 11 commits #424 để pipeline khác rebase sạch |
| D8 | Lỗi UI: một surface duy nhất — `PartForm.handleSave` catch narrow `LibraryHttpError.code`; thêm entry `CODE_MESSAGES` trong `library-error.ts`. KHÔNG thêm toast ở `$testId.tsx` (tránh double toast — red-team RT2#6) | |

## Lệch có chủ đích so với counsel kongming (vòng 1)

- Kongming đề xuất khoá `(stem, answer)` — red-team 3/3 chứng minh bất khả thi (stem đổi khi xóa blank liền kề → test chủ đạo không bao giờ xanh). Chuyển sang `answer.trim()` + nearest-index-unused + pass 2 fallback vị trí (kongming plan-gate duyệt GO với sửa đổi này).
- Kongming đề xuất guard chặn MỌI PUT khi corrupt trừ khi có cờ — bản draft giữa đã nới (payload non-empty qua + log), nhưng advisory đã rút lại: `group-model.ts` `addGroup`/`splitIntoGroups` sinh payload non-empty từ dữ liệu ngầm mà admin không nhìn thấy corrupt → luật nghiêm của kongming được khôi phục nguyên văn (D4c).
- Bổ sung so với kongming: guard đường publish (D5), `GROUPS_NOT_CORRUPT` precondition (D4a), `.default(false)` chống skew (D3).

## Non-goals

- Không sửa `normalizeGroups` client (salvage per-element) — chỉ thêm comment khoá semantics.
- Không đụng web composer học viên, `gradeQuiz`, student routes.
- Không thêm CAS `expectedUpdatedAt` toàn route PUT part (LWW hiện có là behavior chung của app; chỉ chặn destructive-clear qua D4a) — ghi nhận là follow-up cho người.
- Không hiển thị raw JSON corrupt trong UI hay salvage server-side — chỉ log `reason` + cờ (phạm vi issue: log + cờ + chặn).
- Không đổi hành vi khi dữ liệu không corrupt (mọi test hiện tại phải giữ nguyên pass).

## Phases

| # | Phase | Phụ thuộc | Status |
|---|---|---|---|
| 1 | [segmentsToItems answer-key merge (TDD)](./phase-01-segments-key-match-merge.md) | — | Pending |
| 2 | [parseGroups corrupt guard (TDD)](./phase-02-parsegroups-corrupt-guard.md) | — (chạy song song được với phase 1, file rời) | Pending |
| 3 | [Gates cục bộ + e2e + docs](./phase-03-gates-e2e-docs.md) | 1, 2 | Pending |

## Thứ tự merge (áp dụng ở bước ship, ngoài phạm vi phases)

1. Local gates xanh xong mới push/mở PR vào `develop`, body ghi `Depends on #427` + danh sách 11 commits nền.
2. Nếu PR #427 chưa MERGED: **không merge** PR #425; poll `gh pr view 427 --json state`.
3. #427 MERGED → trên **chính nhánh `ai-handle-issue-425`**: `git fetch origin && git merge origin/develop` → resolve conflict nếu có (không resolve sạch được → STOP + kongming theo Failure Protocol) → re-run `pnpm check && pnpm check-types && pnpm test` + e2e admin-library → `git push` (push thường, không force — merge commit tiến trên nhánh đã push).
4. Không bao giờ: force-push, mở nhánh/PR thứ hai cho issue này, merge vào main, deploy.
5. #427 không merge trong khung hợp lý (≈45 phút sau khi PR #425 sẵn sàng) → để PR open, báo blocker cho người.

## Acceptance criteria

- [ ] `segmentsToItems` không gán nhầm metadata khi blank dịch chuyển — unit test xóa/chèn blank giữa chuỗi có `answerSet` + `explanation` (packages/ui + apps/web mirror).
- [ ] Metadata theo đúng nội dung: xóa blank giữa chuỗi → explanation/answerSet của câu sau dịch theo nội dung của nó; trùng answer không drop khi không đổi cấu trúc.
- [ ] `parseGroups` corrupt được log (kèm reason) + cờ `groupsCorrupt` trên DTO; PUT corrupt-bằng-rỗng bị chặn 409 khi thiếu `discardCorruptGroups: true`; flag trên row sạch → 409 `GROUPS_NOT_CORRUPT`.
- [ ] Đề có part groups corrupt không publish được (409).
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test` pass toàn repo.
- [ ] e2e `admin-library-reading` + `admin-library-listening` pass local (port 8100/8101/8103/8104).
- [ ] CHANGELOG.md ghi 2 fix; runbook §deploy-skew bổ sung 2 key mới.

## Success Criteria (plan level)

- [ ] 3 phase Completed, mọi Verify đạt pass condition.
- [ ] Không test hiện có bị xóa/weaken; tổng số assertion tăng.

## Validation Log

### Verification Results (planner self-verify + gate)
- Tier: Standard (3 phases — Fact Checker + Contract Verifier)
- Claims checked: 20 | Verified: 20 | Failed: 0 | Unverified: 0 (trước red-team)
- Red-team Fact Checker/Contract Verifier kiểm thêm 37 claim: 3 FAILED → đã xử lý qua findings C1, M-runbook, M-seed (xem Red Team Review).

## Red Team Review

### Session — 2026-10-23
**Findings:** 17 unique (dedupe từ 24 thô / 3 reviewer) — **13 accepted, 1 partial, 3 declined**
**Severity breakdown:** 1 Critical, 5 High, 11 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Khoá `(stem, answer)` bất khả thi — stem hấp thụ từ xóa, test chủ đạo không bao giờ xanh (RT1#1=RT3#1=RT2#1) | Critical | Accept | D1, phase-01 |
| 2 | Answer trùng + strict-drop → mất metadata mỗi lần Apply (RT1#2=RT2#2) | High | Accept | D1 (k-th occurrence), phase-01 |
| 3 | Publish/ready path không guard — corrupt vẫn lên ready (RT3#2=RT2#3) | High | Accept | D5, phase-02 |
| 4 | Field bắt buộc vỡ 8+3 fixture `LibraryPartDto`, thiếu file trong danh sách (RT3#3=RT2#6) | High | Accept | D3 `.default(false)` + fixtures, phase-02 |
| 5 | Deploy-skew/rollback strict DTO — runbook phải cập nhật (RT1#6=RT3#6=RT2#5) | High | Accept | D3 + task 3.7 |
| 6 | Race stale-flag + bypass non-empty stale; đề xuất CAS (RT2#4=RT1#5) | High | Partial | D4a (GROUPS_NOT_CORRUPT chặn destructive-clear); CAS full → decline, follow-up |
| 7 | Red-phase sai — test 2 pass trên code hiện tại (RT1#3=RT3#5) | Medium | Accept | phase-01 Verify (đỏ) |
| 8 | Fixture đỏ không compile — thiếu import `buildClozeSegments`/`tableSegments`/helper `blanks5` (RT3#4) | High | Accept | phase-01 Tests Before |
| 9 | Đường non-empty đè corrupt không log — trái D4 (RT1#4) | Medium | Accept | phase-02 guard (d) |
| 10 | Merge-order vô lý: "PR cập nhật head" không tồn tại không force-push; thiếu re-run gates sau cherry-pick (RT2#8) | Medium | Accept | D6, Thứ tự merge |
| 11 | `CODE_MESSAGES` thiếu entry + `handleSave` catch nuốt error; double toast nếu thêm cả 2 nơi (RT3#7=RT2#6) | Medium | Accept | D8, phase-02 |
| 12 | Task 3.5 seed corrupt không khả thi — không chỉ định DB/cơ chế (RT2#10) | Medium | Accept | phase-03 task 3.5 |
| 13 | Phân loại corrupt quá rộng — log thiếu reason (RT2#9, phần log) | Medium | Accept | phase-02 `reason` |
| 14 | UI không báo số metadata bị drop (RT2#7) | Medium | Decline | Algorithm mới làm drop chỉ xảy ra khi deliberate edit (xóa/đổi answer); answerSet cụm <2 câu đã bị superRefine chặn khi save — đường "im lặng" nguy hiểm nhất đã có gate |
| 15 | Salvage per-element / hiển thị raw JSON corrupt (RT2#9 phần UI) | Medium | Decline | Ngoài phạm vi issue (log + cờ + chặn); follow-up |
| 16 | CAS `expectedUpdatedAt` toàn route (RT2#4) | Medium | Decline (follow-up) | LWW là behavior chung app; chỉ thêm D4a trong scope |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi áp findings).
- Decision deltas checked: 6 (khoá answer-kth; publish guard; default(false); GROUPS_NOT_CORRUPT; merge-order mới; single-surface UI error).
- Reconciled stale references: 4 (khoá stem trong phase-01; "$testId.tsx onError" trong phase-02; "docs không cần đổi" trong phase-03; whitelist phase-03).
- Unresolved contradictions: 0.
