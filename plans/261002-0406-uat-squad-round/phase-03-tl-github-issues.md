---
title: "Phase 3 — Tech Lead GitHub issues only"
status: pending
owner: Tech Lead
---

# Phase 3 — Tech Lead GitHub issues only

## Context

Chạy sau BUG confirmed từ QE, sau BA Q&A nếu concern bị reclassify thành bug.

Repo: `vinh19410/teacher-os`.

## Requirements

Tạo GitHub issue cho từng BUG. **Cấm implement, cấm PR, cấm commit, cấm deploy.**

Mỗi issue:

- Title mô tả symptom, không mã finding nội bộ.
- Body: repro, expected, actual, môi trường (staging/prod), evidence path, severity.
- Labels phù hợp nếu repo đã có (`bug`, milestone M4/M5 khi fit).
- Không secret, cookie, token, PII, D1 id.

## Files

`plans/261002-0406-uat-squad-round/reports/uat-github-issues-2026-10-02.md` — bảng bug → issue URL.

## Validation

Mỗi BUG QE có đúng một issue URL. 0 diff code từ phase này.

## Rollback

Đóng issue tạo nhầm; không revert code vì không được đụng code.
