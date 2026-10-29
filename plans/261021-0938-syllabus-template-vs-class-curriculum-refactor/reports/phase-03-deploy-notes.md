# Phase 3 deploy notes (user thực hiện — agent KHÔNG chạy wrangler)

Migration: `packages/db/src/migrations/0042_syllabus_class_pointer_reconcile.sql`
(một câu UPDATE idempotent, không xoá dòng nào, không NULL hoá con trỏ mồ côi/khác org
— quyết định theo phase-01-anomaly-report.md).

## Các bước user phải làm (theo docs/production-release-runbook.md)

1. **Lưu bookmark Time Travel trước bất kỳ thay đổi nào:**
   `wrangler d1 time-travel info teacher-os-db` — ghi lại bookmark hiện tại.
2. **Diễn tập trên staging trước:**
   - Áp migration lên staging (deploy staging hoặc `wrangler d1 migrations apply <staging-name> --remote`).
   - Chạy lại Q1a–Q4 từ `reports/phase-01-anomaly-queries.sql` trên staging:
     kỳ vọng **Q2 = 0**; Q3, Q4 không đổi so với trước khi áp.
3. **Lặp lại trên prod** ngoài giờ cao điểm, cùng trình tự (bookmark → apply → đo lại Q1a–Q4).
4. **Trước khi release lên prod, đo Q1b trên prod.** Nếu Q1b > 0 và user muốn chữa
   (khuyến nghị: có — tham chiếu chéo tenant chặn xoá template), cần migration `0043`
   NULL hoá các con trỏ khác org; phải có sự đồng ý của user trước khi viết.
5. Migration được Alchemy áp tự động lúc deploy theo runbook; thứ tự: server (Worker có
   route mới + alias) lên trước web.

## Ghi chú

- Agent không chạy `wrangler` trên staging/prod (hợp đồng ai-handle).
- Bỏ qua file migration đã áp dụng là hành vi của công cụ deploy — không sửa file cũ.
- `0042` idempotent: chạy lại không đổi gì (đã chứng minh bằng test
  `apps/server/src/syllabus-pointer-reconcile-migration.test.ts`).
