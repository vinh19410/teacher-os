---
title: "Plan builtin-vocab-courses: thư viện từ vựng dùng chung + clone-on-assign"
date: 2026-10-18
summary: "ak:plan --github hard mode: 5 phases, red-team 15 findings (1 Critical redirect CDN), issue #361"
---

# Plan builtin-vocab-courses: thư viện từ vựng dùng chung + clone-on-assign

## What happened
- `ak:plan --github` cho yêu cầu: master data `raw-data/` (3 CSV: 20 courses / 968 lessons / 10.160 từ, audio 100% URL CDN mochidemy) → courses built-in toàn hệ thống, mọi org đọc được, clone về org khi teacher thêm vào lớp.
- Hard mode: scout (Explore agent) xác nhận vocab SRS #359 đã ship với `vocab_deck.orgId/classId` NOT NULL + org-scoping bằng query filter; repo CHƯA có cơ chế content global xuyên org nào (syllabus template vẫn org-scoped). Planner viết plan 5 phases tại `plans/261017-2326-builtin-vocab-courses/`.
- Red-team 3 personas (Security/Failure-Mode/Assumption) phát hiện 15 findings, 14 accepted + 1 accepted-modified, đáng chú ý:
  - **Critical**: CDN mochidemy đang 301 redirect cross-host NGAY HÔM NAY (curl verify: `mochien3.1-api...` → 301 → `mochien-server...` → 200 audio/mpeg, response đầu text/html) — proxy audio phải `redirect:"follow"` + content-type response cuối, không thì 10.160 audio trả 404.
  - High: gate `!store` 503 đứng trước nhánh proxy (thiếu R2 = giết audio library); `hasAudio` chỉ additive 1 chiều — student `.strict()` runtime parse vỡ TOÀN BỘ vocab khi lệch release train; "drizzle d1-http chứng minh D1 multi-statement" là evidence sai (thực tế loop per-statement); cap rời 50+500=550 statements vượt precedent 500; Learn ưu tiên listeningChoice → CDN chết làm méo SRS học sinh; packages/db không có vitest/test script.
- Validation Full tier ~45 claims: 42 verified, 3 failed (đã fix qua red-team edits). Consistency sweep 0 contradictions. `ak plan validate` pass (54 tasks).

## Decision
- Catalog = 3 bảng `vocab_library_*` riêng (không orgId, PK deterministic `libword-<csvId>`) thay vì nullable-hóa vocab_deck — bảo vệ flow #359 đã ship.
- Clone = UUID mới trong 1 `db.batch` theo precedent `buildImportBatch`, cap TỔNG decks+từ ≤ 500 statements + dedupe deckIds + `duplicates[]` server-side.
- Audio = server proxy với allowlist host + redirect follow + timeout 10s + cap 5MB riêng + Cache-Control max-age=86400 (không dùng mediaObjectResponse no-store); CDN lỗi → nút "Bỏ qua" không phạt SRS.
- Seed: CSV committed trong repo (repo PRIVATE — verified), core một code path 3 transport (libsql local/e2e boot + D1 REST per-statement prod), `--prune` + verify theo id-set; **gate giấy phép**: seed `--d1` PROD chờ Open Question 1.
- `lessonDetailId` KHÔNG unique (8.728/10.160) — key là cột `id`; seed assert uniqueness.

## Next steps
- Issue #361 (label ai-handle + ready to review) chờ người duyệt kéo card sang Ready trên board Teacher OS, rồi `/ak:cook plans/261017-2326-builtin-vocab-courses/plan.md`.
- Open decisions cho owner: giấy phép nội dung mochidemy trước seed prod; mirror audio R2 hay chấp nhận phụ thuộc CDN.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
