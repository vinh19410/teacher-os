---
title: Ship release 0.0.3 promote develop main
date: 2026-09-17
summary: "ak-ship promote develop→main v0.0.2→v0.0.3: 5 PR #151 #153 #155 #156 #157 (import syllabus v2 5 cột preview modal; bỏ status buổi học + POST /syllabi/:id/replace-content atomic D1 batch ghi đè 4 cột; buổi thi kind+highlight import cột Loại; gỡ mock reports + prefill tuần; branded 404 UI + HTTP 404 thật từ worker routes-matcher drift-guard); migration 0014 syllabus_lesson.kind DEFAULT 'lesson'; pnpm workspace catalog; sự cố biome gộp mất space giữa Tailwind class tint buổi thi — fix cn() + e2e computed-style guard"
---

# Ship release 0.0.3 promote develop main

Branch `develop` @ `55b78fe` → `main`, ak-ship pipeline, ngày 2026-09-17. Version **0.0.2 → 0.0.3** (commit `55b78fe`). Ship log ghi **34 commits / 5 PR**; git đếm `2225db7..develop` ra **30 non-merge, 37 gồm merge, 105 files, +10519/−513** — lệch do cách gộp merge commit, không phải mất commit, nhưng đủ để nhớ: đừng tin một con số duy nhất khi promote, luôn đối chiếu diffstat.

## What happened

- **#151** feat issue #150: import syllabus v2 — parser 5 cột, title tự sinh `Buổi {n}` theo thứ tự dòng, bắt lỗi template cũ thay vì parse ra rác, preview chi tiết trong modal
- **#153** fix issue #152: bỏ status buổi học khỏi màn hình syllabus; server đổi contract — status optional (edit preserve giá trị cũ, add default); import ghi đè **4 cột** ở màn hình syllabus detail qua endpoint mới **POST /syllabi/:id/replace-content** (atomic D1 `db.batch`)
- **#155** feat issue #154: buổi thi giữa kỳ/cuối kỳ — `syllabus_lesson.kind`, highlight riêng, import cột Loại
- **#156** fix issue #107: gỡ mock data khỏi reports + prefill báo cáo tuần — hết cảnh prod hiển thị số liệu giả
- **#157** fix issue #113: branded 404 UI + **HTTP 404 status code thật** từ worker; routes-matcher với drift-guard test

Infra kèm theo: pnpm workspace catalog, migration **0014_chunky_marvel_boy** — `ALTER TABLE syllabus_lesson ADD kind text DEFAULT 'lesson' NOT NULL`.

## Decision: replace-content thay vì gộp import vào update thường

Import đè lên syllabus đang có là phép **hủy dữ liệu**, không phải edit. Chọn endpoint riêng `replace-content` chạy trong một `db.batch` atomic thay vì reuse update từng lesson — tránh lộ trạng thái intermediate khi nửa đường thất bại. Endpoint chỉ ghi đè đúng 4 cột nội dung; status không nằm trong tầm — tách bạch "nội dung giảng dạy" khỏi "trạng thái dạy học" ngay ở tầng contract, không để UI tự quyết.

## Decision: status rời khỏi tay UI phải đổi contract tường minh

Gỡ field khỏi UI mà giữ contract cũ là công thức sinh dữ liệu mù: edit gửi thiếu status rồi server zero-value đè mất dữ liệu cũ. Nên server chuyển status sang optional với ngữ nghĩa rõ: edit preserve, add default. Bài học: bỏ field khỏi form phải đi kèm quyết định server-side, không bao giờ là chore frontend thuần.

## Sự cố: biome gộp mất space giữa Tailwind class — tint buổi thi biến mất câm lặng

Commit `2c37c4d` kể hết: tint buổi thi bị biome format **nuốt space giữa class khi nối chuỗi**, hai class dính liền thành class không tồn tại — không lỗi compile, không lỗi runtime, chỉ là UI mất highlight và không ai biết tại sao. Fix bằng `cn()` + thêm **e2e computed-style guard**. Đây là kiểu bug nguy hiểm nhất: formatter phá CSS một cách hợp lệ theo opini của nó. Luật từ nay: mọi Tailwind class nối động bắt buộc qua `cn()`, assert CSS computed thay vì assert string class.

## 404: hết thời soft-404

Trước #113, route lạ trả **200 kèm SPA shell** — soft 404, SEO và crawler đều bị lừa. Giờ `apps/web/src/worker.ts` + `routes-matcher.ts` (exact, dynamic prefix, static assets, dotfiles) trả HTTP 404 thật, `notFoundHandling: "none"`, Vite middleware mirror đúng hành vi cho dev/e2e (`404-branded-status.spec.ts` 92 dòng, `routes-matcher.test.ts` 154 dòng). Cái giá phải nhận: route list duplicate giữa tanstack route tree và matcher — drift-guard test là bãi mìn tự kích khi ai thêm route quên update matcher.

## Evidence

- 5 PR merge vào develop: #151 #153 #155 #156 #157; head `55b78fe` bump 0.0.3
- Migration 0014 + snapshot `meta/0014_snapshot.json` trong `packages/db`
- Replace-content wired ở `apps/server/src/routes/kernel.ts` + kernel.test.ts
- Diffstat `2225db7...develop`: 105 files, +10519/−513

## Next steps

- Merge PR develop→main → `deploy.yml` lên prod `teacheros.io.vn`; bảo đảm **migration 0014 chạy trên D1 prod trước** khi traffic chạm code đọc `kind`
- Watch post-ship: replace-content là nút hủy dữ liệu — nếu feedback user import nhầm file, ưu tiên confirm dialog mạnh hơn / undo
- Drift-guard: thêm route mới mà quên routes-matcher thì test đỏ — đừng bao giờ `.skip` nó

Cảm nhận thật: batch này không có cháy nào như ERR_MODULE_NOT_FOUND lần trước, nhưng cái bug biome nuốt space thì khó chịu theo kiểu riêng — mọi thứ xanh, chỉ có highlight biến mất, và thủ phạm là tool được tin tưởng nhất trong repo. Formatter phá giao diện mà không một warning nào là đủ để mất tin tưởng; computed-style guard là thứ giữ mình ngủ được. Phần run tim nhất còn lại là replace-content: một endpoint biên tập xóa nội dung user chỉ vì họ chọn nhầm file — ship được vì nó atomic và tách khỏi status, nhưng nó vẫn là khẩu súng có đạn, đừng quên điều đó ở prod.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
