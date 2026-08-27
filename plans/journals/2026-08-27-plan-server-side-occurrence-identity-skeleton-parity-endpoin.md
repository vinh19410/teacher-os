---
title: "Plan server-side occurrence identity: skeleton parity + endpoint occurrence mutation"
date: 2026-08-27
summary: "Kế thừa #93 DEFERRED — plan 5 phase (~7.5d) làm lesson.date thành identity thật; kongming GO-WITH-CHANGES rồi GO sau red-team 20/20 findings áp; issue #98 ready-to-review"
---

# Plan server-side occurrence identity: skeleton parity + endpoint occurrence mutation

## What happened
- `/ak:plan --github --advice` theo đề xuất #93 (Scope Decision: SessionActionsModal DEFERRED chờ plan server-side). Plan mới: `plans/260827-1340-server-side-occurrence-identity-session-actions/`.
- Research: scout codebase (kernel routes, schema lesson, transport, migration house style) + đọc tư liệu DEFERRED (pins C1–C5) của plan 260827-0941.
- Thiết kế cốt: `lesson.date` (yyyy-mm-dd) persist làm occurrence identity; skeleton pure-fn ở packages/api (twin `buildClassSessions`); backfill offline SQL-generator từ dump wrangler, quyết-NULL theo class qua conforms() 4 điều kiện; generator ghi-date gộp cùng migration một deploy unit (kongming K1); endpoints `sessions/:date/{edit,check-in,cancel}` atomic guarded UPDATE + advisory pre-read; dual-mode read-path web; SessionActionsModal dạng giảm (C2/C3 behind-head XÓA vì dated-identity làm vô nghĩa).
- Gates: kongming #1 GO-WITH-CHANGES (8 changes K1–K8 áp hết) → red-team 2 reviewer song song 21 raw findings → dedup 20 (1 Critical / 5 High / 7 Med / 7 Low), 20/20 accepted áp vào files. Nặng nhất: parity tests trong packages/api không chạy dưới gates (chuyển sang apps/server); slotIndex-overload phá sessionStatus/sessionStudents/sidStateAt (dual-mode tường minh cả 4); K3 day-change phải 409 use-occurrence-endpoint; {updated,skipped} vs atomic mâu thuẫn → advisory pre-read.
- Whole-plan consistency sweep sạch; kongming #2 GO (+2 nit doc đã áp).
- Publish: issue vinh19410/teacher-os#98 label `ready to review`; plan pointer set `ak plan use`.

## Decision
- Chọn dated-identity thay occ-index (kongming Q1): moveDate là fact mutable ⇒ persist là modeling trung thực; carve-out docs "derived-until-user-mutable".
- Backfill medium = sinh SQL offline từ dump JSON wrangler thay vì script đụng D1 trực tiếp (không thêm dep, audit được artifact).
- Trình tự production có gate cứng: migrate → deploy → backfill → verify queries PASS → unique index → CUỐI mới enable endpoint P2.

## Next steps
- Requester review plan trên issue #98 → chọn `/ak:plan validate` hoặc cook thẳng `/ak:cook plans/260827-1340-server-side-occurrence-identity-session-actions` (--advice forward).
- P5 phải post supersession comment lên #93 hai chiều khi ship.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
