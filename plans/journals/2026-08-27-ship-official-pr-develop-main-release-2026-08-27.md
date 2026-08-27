---
title: "Ship official PR: develop → main (release 2026-08-27)"
date: 2026-08-27
summary: "ak:ship official: release-promotion PR develop(1b3a47f)→main, 172 commits/~570 files/+73.6k−2.5k lines; tests 510/0 (web 321, server 136, auth 35, infra 11), review 0 critical/6 informational, secrets sạch; deploy.yml mới push-to-main (Cloudflare Workers/D1 stage→prod); #93 mới ship một phần"
---

# Ship official PR: develop → main (release 2026-08-27)

Branch `develop` @ `1b3a47f` → `main`, `/ak:ship official`, ngày 2026-08-27. Đây là lần promote lớn nhất của repo tới giờ: `main` tụt sau **172 commits**, ~570 files đổi, **+73.6k/−2.5k dòng**. Không phải một feature — đây là cả một giai đoạn phát triển được đập vào prod cùng lúc.

## What happened

Tạo release-promotion PR develop → main gom các workstream đã hoàn tất trên develop:

- e2e Playwright infra (#59) và schedule weekly grid + URL week nav (#56)
- Syllabus template-import per-class curriculum (#79) + fix duplicate-render (#81); delete+reorder module/lesson (#101)
- Persist class type & skills (#78); chronological dates + syllabus topics trong tab lịch (#84)
- Merge tab Buổi học trong class-detail (#89/#90); điểm danh in-place tuần tự (#91/#92)
- Profile page: avatar upload, rename, Google linking (#94/#96)
- Collapsible desktop sidebar icon-rail 64px (#97/#100)

Kèm hạ tầng ship mới: workflow **`deploy.yml`** kích hoạt khi push lên `main` — quality-gated, concurrency serialized (không hai deploy giành nhau), target Cloudflare Workers/D1 qua stage rồi prod. Và **migration `0009_syllabus_template_discriminator.sql`** với backfill data + restore runbook (`docs/production-release-runbook.md`). Migration có backfill nghĩa là chạy trên prod là mệnh lệnh một chiều nếu không có snapshot.

#93 đáng nói riêng: issue vẫn **mở** — session actions đã vào nhưng phần drop cột Học viên trên tab Buổi học thì chưa. Promote cả batch không đồng nghĩa close-all; điều này đã ghi rõ trong PR body để reviewer sau này không nhầm trạng thái.

## Decision

Promote làm **một** release duy nhất thay vì phủ từng feature PR sang main lý do thực dụng: mọi feature đã sống chung qua CI develop đủ lâu, tách nhỏ chỉ sinh nhiều cửa sổ deploy rủi ro hơn chứ không giảm rủi ro nào. Trước khi mở PR đã chạy deploy-safety check: không có destroy path nào với tới được, migration 0009 theo pattern copy-then-drop nên safe về schema. Pre-landing review cho **0 critical / 6 informational**, secrets sweep sạch — 6 informational được ghi lại trong PR body thay vì sửa ngay.

## Evidence

Tests **510 passed / 0 failed** qua turbo: web 321, server 136, auth 35, infra 11 (+ node:test suites). Biome/check-types/build chạy trong cùng gate.

## Next steps

- Merge PR → push lên `main` tự trigger `deploy.yml`.
- **Bắt buộc trước lần apply đầu tiên của migration 0009 trên prod D1: snapshot D1** theo đúng runbook. Backfill không rollback ngược nổi thiếu snapshot — đây là bước duy nhất trong chuỗi ship mà con người phải làm tay.
- Theo dõi phần còn lại của #93 và các informational findings từ pre-landing review sau merge.

Cảm nhận thật: 172 commits lao vào prod trong một cú là cảm giác vừa nhẹ nhàng vừa khó chịu — toàn bộ niềm tin dồn vào các gate đã chạy, còn khoảng an toàn duy nhất nằm ở một dòng lệnh snapshot ai đó nhớ chạy hay không.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
