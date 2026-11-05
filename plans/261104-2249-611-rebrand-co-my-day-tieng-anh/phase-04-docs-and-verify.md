---
phase: 4
title: "Docs, rà soát và xác minh"
status: completed
dependencies: [1, 2, 3]
---

# Phase 4: Docs, rà soát và xác minh

## Context

Docs và README gọi sản phẩm là "Teacher OS". Cần đổi tên hiển thị nhưng không đụng định danh kỹ thuật, và chứng minh bằng một lần grep có allowlist.

## Files được sửa

- `README.md` (tiêu đề `# teacher-os` đổi thành tên mới kèm ghi chú "tên repo và package vẫn là `teacher-os`"), `DESIGN.md` (dòng 1 và 7 chỗ nhắc tên), `CHANGELOG.md` (thêm mục mới, không sửa mục cũ), `docs/index.md`, `docs/project-overview-pdr.md`, `docs/project-roadmap.md`, `docs/system-architecture.md`, `docs/tech-debt.md`, `docs/production-release-runbook.md` (dòng 4, 618, 633, 809, 888)
- `.cursor/skills/verify-teacher-os/` giữ tên thư mục và id skill; chỉ đổi chuỗi hiển thị trong `SKILL.md`/`launch.sh` nếu có, không đổi đường dẫn script

## Bước

1. Đọc từng file trước khi sửa. Đổi tên hiển thị; giữ nguyên `teacher-os` khi là tên repo/package/đường dẫn và `teacheros.io.vn` khi là domain.
2. Runbook: cập nhật ví dụ `MAIL_FROM` thành `Cô Mỹ Dạy Tiếng Anh <no-reply@teacheros.io.vn>` và ghi thao tác đổi biến GitHub environment (phase 2).
3. `CHANGELOG.md`: một mục "Đổi tên thương hiệu hiển thị thành Cô Mỹ Dạy Tiếng Anh (#611)", nêu rõ định danh hạ tầng không đổi.
4. Chạy grep cổng:
   ```bash
   grep -rnE "Teacher ?OS" apps packages .github docs README.md DESIGN.md CHANGELOG.md -I \
     --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=journals
   ```
   Kết quả còn lại chỉ được thuộc allowlist: câu giải thích tên cũ trong README/CHANGELOG, và `.cursor/skills/verify-teacher-os`. Mọi dòng khác phải sửa.
5. Chạy gate đầy đủ: `pnpm exec biome check .`, `pnpm check-types`, test của các package đã sửa, e2e 3 spec đã nêu ở plan.md.
6. Đối chiếu với Acceptance criteria trong `plan.md` rồi cập nhật trạng thái các phase.

## Kiểm chứng

Grep cổng sạch ngoài allowlist; mọi lệnh ở bước 5 xanh; PR đính kèm ảnh chụp 3 viewport và `pnpm design:compare` (AGENTS.md yêu cầu với thay đổi hình ảnh).

## Rủi ro và lui

Rủi ro chính là rebase với plan #600 ở `docs/production-release-runbook.md` và `CHANGELOG.md`; giải quyết bằng cách làm phase này sau khi #600 merge, hoặc rebase thủ công. Docs không có tác động runtime.
