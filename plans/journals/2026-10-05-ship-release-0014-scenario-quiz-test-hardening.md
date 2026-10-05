---
title: "Ship release v0.0.14 — scenario test coverage cho quiz attempt lifecycle"
date: 2026-10-05
summary: "Promotion develop → main test-only cho #313: vitest packages/api 0→21 test, student-quiz integration 15→19 (IDOR cross-org, start race, raw-key 3.0), mutation spot-check 5/5, zero thay đổi runtime."
---

# Ship release v0.0.14

## What happened
Promotion `develop` → `main` (0.0.13 → 0.0.14) theo convention PR, tracking #313. 2 commit test-only (+749/−3), không đụng runtime src:

- `ba66c22` — vitest unit cho `packages/api` (package trước đây 0 test): `grade-quiz` 8, `infer-question-types` 8, `word-count` 5; +4 integration tests trong `apps/server/src/routes/student-quiz.test.ts` (15 → 19): IDOR cross-org qua header `x-student-org-id` (A2), start race bất biến 1×201 + 1×200 cùng attemptId / 1 row DB (T1), input extremes q âm/lẻ/ngoài range + value >500 (I1/I3), JSON escape round-trip + raw-key "3.0" (I4/D1).
- `789bc05` — docs: scenario report 42 case, test-report (coverage matrix), QC test-cases.

Motivation (#313): quiz attempt lifecycle (start/snapshot → autosave → submit → review) là vùng code mới nhất (#283/#303/#304/#308), giữ invariant không giao dịch vì D1 không có transaction, nhưng coverage còn gap. Coverage matrix trước → sau (`plans/261002-1409-scenario-test-cases/test-report.md`): A2/T1/I1/I3/I4/I5/I7/D1 ❌→✅, B3/B4 từ 1 case → 8, I6 pin hành vi (NFD không khớp NFC).

Evidence: `pnpm test` 2038 passed / 0 failed / 0 skipped (api 21/21 — trước: 0; server 497/497; web 1184; student 233; auth 70; infra 17; landing 5; scripts 11), `check-types` 7/7, biome sạch. Mutation spot-check 5/5 bắt được (ALT_SEPARATOR `" / "`→`"/"`, `"ynng"`→`"tfng"`, `${String(q)}`→`${q}`, bỏ bound `q >= questions.length`, bỏ `.trim()`) — mọi mutation đã revert. E2e do CI của PR (base main) sở hữu.

## Decision
- Test-only ship: mutation chỉ dùng chứng minh test bắt được regression rồi revert; `student.ts` không còn diff.
- Pre-landing review (code-reviewer + tester xác nhận độc lập) bắt 1 critical: literal NFD `"Ha\u0323 No\u0323i"` là từ khác ("Hạ Nọng") — pin I6 pass kể cả khi grader thêm NFC. Fix `6baed42`: `.normalize("NFD")` + precondition, magic numbers → constants, hạ claim A2 còn cross-identity. Mutation check T1: bỏ catch re-read ở start handler → test fail ⇒ backstop được phủ thật.
- Bỏ có lý do: ST3 (pin hành vi enrollment thu hồi giữa chừng có thể khoá sai — cần quyết định sản phẩm), T2 (nhánh CAS phòng thủ, invariant đã pin bởi patch-after-submit 409), S1–S3 (e2e đề lớn đắt, để CI).
- I6 giữ nguyên grader (không normalize NFC) — pin hiện trạng làm open question, không tự quyết định sản phẩm bằng test.

## Next steps
- ST3: product quyết định enrollment thu hồi có chặn autosave/submit của attempt đang dở không — xong trước khi pin bằng test.
- I6: quyết định có thêm `normalize("NFC")` cho tiếng Việt gõ dạng NFD.
- E2e scale S1–S3 để CI của PR phủ; backlog nhóm sau: D3 (xoá assignment sau submit), B5 (invoice biên), E1 (mailer nuốt lỗi — cần feature surface lỗi), E3 (R2, chờ #305).
- Human review PR (#313): verify assertion pin đúng invariant (A2/T1/D1), xác nhận không thay đổi runtime code.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
