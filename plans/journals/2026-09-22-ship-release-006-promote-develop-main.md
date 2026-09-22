---
title: Ship v0.0.6 — promote develop → main (official PR)
date: 2026-09-22
summary: "Promote develop→main v0.0.6 qua PR: 31 commits (#227/#230/#232/#235/#236/#239/#240/#243 + da50f28), test 1,050 GREEN, e2e 75 passed/1 skip, review 0 critical/8 informational, bỏ merge origin/main vì main chỉ còn merge commit #226"
---

# Ship v0.0.6 — promote develop → main (official PR)

## What happened
- Ship official 2026-09-22 (mode: official): promote `develop` → `main` qua PR theo convention promotion của repo (như PR #226), release v0.0.5 → v0.0.6. Bundle 31 commits kể từ promotion #226: landing static app tách riêng deploy apex teacheros.io.vn qua Cloudflare StaticSite (#239); flow tạo học viên siết danh tính — bắt buộc email + SĐT digits-only, migration 0021, gói derive từ lớp, bỏ 3 input gói khỏi form (#240/#243); modal tạo lớp tự động theo syllabus — skills auto-defined (#232), tổng buổi auto-fill (#235), view-only khi derive (#236); CurrencyInput VND nhóm nghìn dấu phẩy (#230); học phí theo học viên (#227); ci(staging) tắt auto-deploy, chỉ manual dispatch (da50f28).
- Evidence: `pnpm test` GREEN — 1,050 passed / 0 failed (server 266, web 709, auth 42, infra 17, landing 5, ci-workflow 3, topology-drift 8). E2E Playwright 75 passed / 1 intentional skip — phải override `E2E_API_PORT`/`E2E_WEB_PORT` vì một dev server workerd local đang ngồi trên ports 8000/8001.
- Pre-landing review: 0 critical, 8 informational, secrets scan clean. Docs cập nhật 2 dòng: `docs/system-architecture.md` (rule package-always-with-enrollment) + `docs/project-overview-pdr.md` (quyết định danh tính học viên).

## Decision
- BỎ qua bước merge `origin/main` vào develop: main chỉ có đúng 1 commit duy nhất là merge commit của promotion #226 (`34e3f11`), zero content delta — kiểm chứng bằng `git log` trước khi quyết. Khác v0.0.5 phải `-s ours` dọn 27 squash-orphan conflicts, lần này không merge hẳn cho sạch lịch sử.
- 6 informational đáng chú ý, không block release: migration 0021 chỉ strip space và `'+'` khỏi phone legacy (row có separator khác vẫn non-conforming — follow-up cleanup); POST /api/students đổi contract (PWA client cache cũ thấy 400 tạm thời); học viên tạo ngoài lớp không còn parked package (D2); lớp legacy `NULL tuitionFee` derive giá gói 0; apex/www đổi chủ web→landing trong 1 alchemy run; staging auto-deploy giờ manual.
- Version giữ 0.0.6 (bump đã commit trên develop, main đang 0.0.5). `ak plan resolve` fail với "plan index needs attention" → finalize plan bị skip kèm warning, không chặn ship.

## Vướng mắc & bài học
- Đợt này "chán" đúng nghĩa tốt: sau cú sốc squash-orphan 27 conflicts của v0.0.5, promotion lần chạy suôn sẻ — bằng chứng là có thể kiểm chứng, không phải cảm tính. Đó là bài học của v0.0.5 được áp dụng đúng chỗ.
- Cái ấm ớt thật sự nằm ở 8 informational: không cái nào chặn release, nhưng migration 0021 chưa phủ hết phone legacy và contract change impacting PWA cache cũ là 2 quả bom hẹn giờ để lại cho người kế thừa. Ship không phải xong — chỉ là chuyển nợ có ghi chép.
- Bài học môi trường: workerd chiếm 8000/8001 gần làm nổ e2e; run e2e local nên check port trước hoặc override `E2E_*_PORT` thay vì suspend process của ai đó.

## Next steps
- Theo dõi CI trên `main` sau promote; staging/prod deploy giờ phải dispatch tay — nhớ nhắc trong chu kỳ tới.
- Follow-up cleanup phone legacy mà migration 0021 bỏ sót (separator khác space/`+`) — owner: server, trước release 0.0.7.
- Sửa plan index (`ak plan resolve` fail "plan index needs attention") để finalize plan không phải skip nữa.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
