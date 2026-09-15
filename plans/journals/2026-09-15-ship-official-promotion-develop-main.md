---
title: Ship official promotion develop main
date: 2026-09-15
summary: "ak-ship official --advice --merge: promote develop→main v0.0.1→v0.0.2, 17 commits/49 files/+3588−48 (4 beta PR #146 #143 #140 #139 + UAT r2 NO-GO→r2.1 GO); 677/677 xanh sau khi fix stale node_modules (ERR_MODULE_NOT_FOUND papaparse qua generic catch, pnpm install --frozen-lockfile); review 0 critical/2 informational defer; kongming GO/GO; merge PR qua ak:review-pr, deploy.yml lên production teacheros.io.vn"
---

# Ship official promotion develop main

Branch `develop` @ `decd984` → `main`, `ak-ship official --advice --merge`, ngày 2026-09-15. Version **0.0.1 → 0.0.2**. Merge PR kích hoạt `deploy.yml` — deploy production Cloudflare lên `teacheros.io.vn`; staging đã ship từng beta qua `deploy-staging.yml` nên đây là lần đầu batch này chạm prod.

## What happened

Promote **17 commits, 49 files, +3588/−48** — 4 beta PR đã merge vào develop:

- **#146** feat issue #144: import syllabus Excel/CSV — parser client papaparse/read-excel-file, cap 2MB/500 node, server tạo atomic bằng `db.batch`, modal UI + e2e
- **#143** fix issue #115: minimum gói học viên chặn cả client + contract
- **#140** fix issue #114: semantics validation sign-in
- **#139** feat issue #138: nút billing disabled + badge coming-soon

Kèm tài liệu UAT round 2 **NO-GO → round 2.1 GO** (issues #30 #41 #48 #28).

## Decision: dọn local develop trước khi promote

Local develop tụt **4 commits** phía sau, và các plan artefact untracked đụng đường với path sắp vào từ origin. Xử lý bằng **blob-SHA byte-compare** thay vì xóa mù:

- File trùng blob → xóa (fast-forward sẽ restore y nguyên)
- 4 draft khác nội dung → giữ làm `*.local-aside` (draft cũ hơn, giữ lại cho user)
- Report không liên quan → không đụng tới

Rồi merge `origin/main` vào develop để chứng minh **main ⊆ develop**: diff sau merge rỗng — không có nội dung duy nhất nào ở main bị bỏ lại.

## Sự cố test: ERR_MODULE_NOT_FOUND papaparse bị generic catch nuốt

Lần chạy đầu **3 test syllabus-import đỏ** — nhưng báo lỗi qua generic catch, che mất nguyên nhân thật. Trace ra `ERR_MODULE_NOT_FOUND: papaparse`: `node_modules` stale thiếu deps mà PR #146 vừa thêm. Fix không đụng code hay lockfile: `pnpm install --frozen-lockfile`. Full suite sau đó **677/677 xanh**, kể cả chạy lại `--force` bỏ cache.

Playwright e2e không chạy local (cần dev server + D1) — chấp nhận vì `e2e.yml` chạy trên PR vào main, coi là **hard merge gate**.

## Review: 2 informational bị cố tình defer

Pre-landing review **0 critical / 2 informational**:

1. Parser client thiếu length cap khớp server (zod title 500 / text 10_000) → file lố chỉ nhận generic 400
2. Ô "Số buổi dự kiến" vẫn edit được nhưng bị bỏ qua im lặng sau khi import thành công

Cả hai **không sửa trong promotion** — defer thành follow-up GitHub issues. Lý do kỷ luật: promotion phải ship byte-identical với code beta đã validate; nhét fix mới vào cửa promotion là tự tay vô hiệu hoá chứng cứ đã thu thập.

## Kongming

2 checkpoint advisory, cả hai **GO**. Lời khuyên đắt nhất: byte-compare trước khi xóa bất kỳ file untracked nào, và coi PR e2e CI là hard gate chứ không phải courtesy check.

## Evidence

- Tests **677/677** (bao gồm run `--force` no-cache)
- PR develop→main với body evidence **7 section**
- Merge review qua `ak:review-pr --fix --reply --merge`

## Next steps

- Merge PR → `deploy.yml` deploy production `teacheros.io.vn`; canh workflow chạy ngay sau merge
- Theo dõi 2 follow-up issues từ informational findings
- e2e trên PR→main phải xanh trước khi merge (hard gate, không override)

Cảm nhận thật: phần run tim nhất của ship này không phải diff +3588 dòng mà là 4 commit tụt kèm đống untracked đụng path — một vòng `git clean` bừa là mất draft của chính user. Còn ERR_MODULE_NOT_FOUND bị generic catch nuốt thì đủ câu: test đỏ báo sai bệnh, nếu tin message đầu chắc đã đi sửa code trong khi thực ra chỉ cần `pnpm install`. Hai informational để lại mà không vá nghe kém thoải mái, nhưng kỷ luật "promotion ship byte-identical" chính là thứ giữ cho chứng cứ beta/UAT còn giá trị khi nó vào prod.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
