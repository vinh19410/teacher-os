---
title: "Ship #526: Self study plan — tự động giao đề hằng ngày cho lớp theo khung giờ"
date: 2026-10-31
summary: "Hoàn tất hiện thực, kiểm thử unit + E2E 3 viewport, review local và đóng gói PR cho module Self Study Plan (#526)."
---

## What happened
- Thực thi đầy đủ 4 phase của kế hoạch `261031-2220-526-self-study-plan` theo quy trình `--tdd --advice`.
- Sinh migration `0059_self_study_plan.sql` + `meta/0059_snapshot.json` bằng `drizzle-kit generate` và xác nhận chạy lại `drizzle-kit generate` báo `No schema changes`.
- Vượt qua toàn bộ unit test (`apps/student`, `apps/server`, `apps/web`), typecheck 14 packages, Biome check và E2E `specs/self-study-plan.spec.ts` trên 3 viewport (`1440×900`, `768×1024`, `375×812`).

## Decision
- Áp dụng đầy đủ các khuyến nghị từ `KongmingPostImpl` (`0059_snapshot.json` và `orderBy` ưu tiên `notifiedAt IS NULL` trong Bước 2 của `runSelfStudyPlanTick`).

## Next steps
- Mở PR vào nhánh `develop`, chạy `/ak-review-pr --fix --reply --advice`, gắn nhãn `ready to ship beta`, merge vào `develop` và theo dõi CI `develop` xanh.
