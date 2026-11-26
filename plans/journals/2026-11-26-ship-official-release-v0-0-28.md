# Ship official release v0.0.28 (develop → main)

**Date:** 2026-11-26

## Phạm vi

Promote 19 PR đã merge vào `develop` kể từ v0.0.27 (#934–#991): dashboard giáo viên và học viên được thiết kế lại, lịch tháng, điểm danh quá hạn, sửa ngày khai giảng, chú thích Reading, chấm Choose TWO/THREE không theo thứ tự, backfill thư viện Reading, sửa harness `design:compare`.

## Quá trình

- Gộp `origin/main` vào `develop` (chỉ có merge commit của PR #933), không xung đột.
- Gate local: `pnpm exec biome check .` exit 0 (153 warning / 16 info có sẵn), `pnpm check-types` 14/14, `pnpm test` 13/13 task thành công. Không chạy full E2E (chạy trên GitHub Actions khi deploy production).
- Bump `package.json` 0.0.27 → 0.0.28, bổ sung changelog (#939) và mục runbook cho migrations 0091–0094.

## Điểm cần lưu ý

- `0094` là migration dữ liệu lớn (~80 KB): ghi bookmark Time Travel của D1 trước khi deploy.
- Cả ba migration `0091`, `0092`, `0094` không đổi schema nên rollback Worker vẫn qua `/readyz`.
