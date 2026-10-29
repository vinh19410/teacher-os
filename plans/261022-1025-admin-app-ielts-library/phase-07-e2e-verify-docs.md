# Phase 7 — E2E, verify UI và tài liệu

## Context

E2E chạy qua Playwright trong `apps/e2e` với server thật dưới Node + D1 local (`boot.ts`), cổng override 8100/8101/8103; thêm 8104 cho admin. Helper đăng nhập hiện có trong `specs/helpers.ts`, origin trong `specs/origins.ts`. `AGENTS.md`: bộ lệnh local là gate chính; CI develop chỉ là lưới an toàn; `design:compare` bắt buộc khi đụng hình ảnh; verify UI ở 3 viewport (1440×900, 768×1024, 375×812) + focus bàn phím theo `REVIEW.md`.

## Requirements

Spec mới (`apps/e2e/specs/`):
- `admin-auth.spec.ts`: admin vào được; teacher và student bị chặn ở admin origin; admin bị chặn ở web/student origin; sign-up admin origin với email ngoài allowlist bị từ chối (mở rộng `account-role-separation.spec.ts` nếu hợp lý hơn tạo file mới).
- `admin-library-reading.spec.ts`: tạo → thêm 3 passage nhiều dạng câu → xuất bản → sửa → hạ nháp → xóa.
- `admin-library-listening.spec.ts`: tạo → 4 section, upload audio (fixture mp3 nhỏ do repo tự sinh, không nhúng file lớn) → phát (`<audio>` có `src` hợp lệ, GET trả 200 đúng `Content-Type`) → xuất bản bị chặn khi thiếu audio → xóa test và kiểm API trả 404 cho audio.
- Fixture tài khoản admin: seed qua helper e2e (ghi trực tiếp row `user` role `admin` + account, `ADMIN_EMAILS` đặt trong env boot).

Tài liệu (chỉ cập nhật phần bị ảnh hưởng, đọc trước khi sửa):
- `docs/system-architecture.md`: dòng boundary map cho admin app + `/api/admin/library` + kho `library-audio`; thêm quy tắc kiến trúc: admin ngoài kernel tree, ba lớp gate, admin không bootstrap org.
- `docs/production-release-runbook.md`: topology có `admin.<domain>`, bảng setting thêm `ADMIN_ORIGINS`, `ADMIN_EMAILS`; quy trình cấp admin đầu tiên; bucket `library-audio`; kiểm domain custom. Giữ test `topology-drift` xanh (chuỗi bắt buộc của runbook không bị đổi).
- `docs/codebase-summary.md`, `docs/project-roadmap.md` (đánh dấu mini project admin), `AGENTS.md` (cổng 8004/8104, nơi cấp admin).
- `CHANGELOG.md` theo định dạng hiện có.

## Steps

1. Viết helper seed admin và spec auth trước (đỏ), rồi các spec CRUD.
2. Chạy e2e cục bộ với cổng override; xử lý theo `AGENTS.md` nếu gặp `[dev-watchdog]` (hạ tầng, không phải lỗi test).
3. Chụp screenshot 3 viewport cho list, create, editor Reading, editor Listening; kiểm tab bàn phím và focus.
4. Chạy `pnpm design:compare` nếu harness hỗ trợ app admin; nếu chưa, ghi rõ giới hạn trong PR và đính screenshot thủ công.
5. Cập nhật tài liệu, chạy lại `node --test scripts/topology-drift.test.mjs`.
6. Gate cuối: chạy **toàn bộ** suite Playwright (không chỉ spec mới) theo memory "full e2e before merge", và chạy lại trên `develop` nếu develop đã di chuyển.

## Validation

```bash
pnpm check && pnpm check-types && pnpm test && pnpm build
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e
```

Pass khi: toàn bộ lệnh xanh; ba spec admin xanh; không spec cũ nào hồi quy; docs khớp code (đối chiếu từng tên binding, cổng, đường dẫn bằng `grep`).

## Risks / Rollback

- Fixture mp3: sinh buffer tối thiểu hợp lệ trong test (header MPEG frame) thay vì commit binary; nếu allowlist chỉ kiểm `Content-Type` thì bytes bất kỳ qua được, nhưng test vẫn dùng bytes mp3 hợp lệ để gần thực tế.
- Rollback: spec và docs độc lập, revert từng commit.

## Sau khi plan được duyệt

Theo `AGENTS.md`: chạy `ak-git cp` để commit và push plan/journal. Triển khai bằng `/ak:cook plans/261022-1025-admin-app-ielts-library/plan.md`, từng phase một PR hoặc một PR theo phase, base `develop`.
