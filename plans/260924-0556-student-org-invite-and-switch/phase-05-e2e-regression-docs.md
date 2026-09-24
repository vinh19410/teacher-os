---
title: "Phase 5: E2E Regression & Documentation"
status: todo
priority: P1
effort: 2h
---

# Phase 5: E2E Regression & Documentation

## Context Links
- E2E Playwright specs: `apps/e2e/specs/`
- Helper E2E: `apps/e2e/specs/helpers.ts`
- Tài liệu kiến trúc dự án: `docs/project-overview-pdr.md`
- Runbook phát hành: `docs/production-release-runbook.md`

## Overview
Phase 5 đảm bảo chất lượng toàn diện của tính năng thông qua E2E testing tự động trên trình duyệt thật (Playwright) và cập nhật tài liệu kiến trúc:
1. Viết spec E2E `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts` kiểm thử toàn bộ hành trình end-to-end:
   - Giáo viên A gửi lời mời cho học viên qua email.
   - Học viên mở Student Portal, thấy icon Chuông có badge đỏ.
   - Học viên mở Chuông và bấm "Chấp nhận".
   - Học viên thấy dữ liệu lớp của Giáo viên A.
   - Giáo viên B gửi lời mời cho cùng học viên đó.
   - Học viên chấp nhận lời mời của Giáo viên B.
   - Học viên sử dụng OrgSwitcher để chuyển đổi qua lại giữa Tổ chức A và Tổ chức B.
   - Cả Giáo viên A và Giáo viên B đều thấy học viên đó trong danh sách học viên của riêng mình.
2. Chạy toàn bộ regression test suite của monorepo (`biome`, `typescript`, `vitest`, `playwright`).
3. Cập nhật tài liệu dự án phản ánh mô hình Multi-Org Student và luồng mời học viên.

## Key Insights
- E2E spec này kiểm chứng toàn bộ chuỗi mắt xích: Database -> Server API -> Teacher Web App -> Student Portal App.
- Cần chú ý xử lý cookies/storage giữa 2 trình duyệt hoặc 2 browser context độc lập (một context cho Giáo viên, một context cho Học viên) để mô phỏng tương tác thời gian thực giữa 2 người dùng.
- Cập nhật tài liệu kiến trúc `project-overview-pdr.md` để ghi nhận quyết định thay thế heuristic "tổ chức sớm nhất" bằng cơ chế lời mời trực tiếp và đa tổ chức.

## Requirements
- [ ] Spec E2E mới: `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`:
  - Bao quát kịch bản 2 giáo viên (Org A, Org B) và 1 học viên.
  - Kiểm thử lời mời, chuông thông báo, chấp nhận, từ chối, và chuyển đổi tổ chức.
- [ ] Toàn bộ bộ test hiện có không bị regression (đặc biệt là `student-portal-provisioning.spec.ts` và `student-portal-email-verification.spec.ts`).
- [ ] Cập nhật tài liệu:
  - `docs/project-overview-pdr.md`: Bổ sung mô hình Student Multi-Org và Invitation Flow.
  - `docs/production-release-runbook.md`: Ghi chú migration 0024.

## Related Code Files
- **Create:** `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`
- **Modify:** `docs/project-overview-pdr.md`
- **Modify:** `docs/production-release-runbook.md`

## Implementation Steps
1. Xây dựng E2E test `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`:
   - Dùng 2 browser contexts riêng biệt: `teacherContext` và `studentContext`.
   - Bước 1: Teacher A đăng nhập web app (`http://localhost:8001`), vào `/students`, bấm "Mời học viên", nhập `student.test@example.com`, gửi thành công.
   - Bước 2: Student đăng nhập portal (`http://localhost:8003`), verify thấy icon Chuông có badge `1`.
   - Bước 3: Student bấm Chuông, thấy card lời mời từ Teacher A, bấm "Chấp nhận".
   - Bước 4: Kiểm tra màn hình Student hiển thị tên Org của Teacher A.
   - Bước 5: Teacher B đăng nhập web app ở Org B, vào `/students`, gửi lời mời tới cùng email `student.test@example.com`.
   - Bước 6: Student thấy Chuông hiện badge `1`, bấm "Chấp nhận".
   - Bước 7: Mở `OrgSwitcher`, kiểm tra hiển thị cả Org A và Org B.
   - Bước 8: Bấm chuyển về Org A -> màn hình cập nhật đúng Org A.
   - Bước 9: Bấm chuyển sang Org B -> màn hình cập nhật đúng Org B.
   - Bước 10: Teacher A và Teacher B kiểm tra danh sách học viên của mình đều có học viên `student.test@example.com`.
2. Chạy kiểm tra E2E:
   ```bash
   pnpm --filter e2e exec playwright test specs/student-org-invitation-and-switcher.spec.ts
   ```
3. Chạy toàn bộ regression suite:
   ```bash
   pnpm check
   pnpm check-types
   pnpm test
   pnpm build
   pnpm --filter e2e e2e
   ```
4. Cập nhật tài liệu:
   - `docs/project-overview-pdr.md`: Mô tả tính năng mời học viên và mô hình học viên thuộc nhiều tổ chức.

## Todo List
- [ ] Viết kịch bản E2E `student-org-invitation-and-switcher.spec.ts`
- [ ] Chạy và tinh chỉnh E2E test đến khi đạt 100% pass
- [ ] Chạy full regression test suite toàn dự án
- [ ] Cập nhật tài liệu kiến trúc và runbook phát hành

## Success Criteria
- [ ] E2E spec chạy thành công ổn định không bị flaky.
- [ ] Không có bất kỳ regression test nào bị đỏ trong toàn bộ suite.
- [ ] Tài liệu mô tả rõ ràng kiến trúc mới và hướng dẫn vận hành.

## Risk Assessment
- **Rủi ro:** Flakiness do độ trễ mạng hoặc animation popover khi test tương tác chuông thông báo.
- **Giảm thiểu:** Sử dụng selector `data-testid` rõ ràng và các helper chờ hiển thị (`waitForSelector`, `toBeVisible`) thay vì timeout cứng.

## Security Considerations
- Đảm bảo E2E test dọn dẹp dữ liệu test hoặc sử dụng database cô lập để không gây ô nhiễm môi trường.
