---
title: "Mini project apps/admin — CRUD bộ đề IELTS Reading & Listening"
status: completed
created: 2026-10-22
branch: develop
mode: hard
issue: https://github.com/vinh19410/teacher-os/issues/413
---

# Mini project `apps/admin` — CRUD bộ đề IELTS Reading & Listening

## Mục tiêu

Thêm app thứ năm `apps/admin` (admin.<domain>) vào monorepo. Feature đầu tiên: admin tạo / xem / sửa / xóa **thư viện bộ đề IELTS Reading (3 passage) và Listening (4 section)** dùng chung toàn hệ thống, kèm upload audio Listening lên R2.

## Quyết định đã chốt với user (2026-10-22)

| # | Quyết định | Hệ quả |
|---|---|---|
| D1 | Role `admin` mới + origin admin riêng, không tự đăng ký tự do | `AppRole` thêm `admin`; gate 3 lớp giống plan #260 |
| D2 | Thư viện đề toàn hệ thống, bảng riêng không có `orgId` | 2 bảng `library_test`, `library_test_part`; không đụng `assignment_test`/`assignment_prompt` của giáo viên |
| D3 | Audio Listening upload lên R2 bucket mới `library-audio` | thêm `MediaStore` thứ hai, route upload/stream, adapter e2e |

## Non-goals (đợt này KHÔNG làm)

- Teacher/student đọc hoặc clone đề từ thư viện (đợt sau, mô hình giống `vocab_library_*` clone).
- Writing / Speaking trong thư viện.
- Quản lý user, org, billing trong admin (admin chỉ có một menu "Thư viện đề").
- Import hàng loạt từ file.
- Phân quyền nhiều cấp admin; mọi admin ngang quyền.

## Kiến trúc tóm tắt

```
admin.<domain> (apps/admin, Vite SPA + worker)
   │  cookie .<domain>, Origin = adminOrigin
   ▼
api.<domain>  /api/admin/*  ── requireAdmin (role=admin ∧ email ∈ ADMIN_EMAILS ∧ emailVerified)
   │                             tách khỏi kernel tree (không org-scoped, không bootstrap org)
   ├─ D1: library_test ─< library_test_part   (nội dung passage/section nằm inline trong part)
   └─ R2: LIBRARY_AUDIO  (key = library/<testId>/<part>/<uuid>)
```

Mô hình dữ liệu **một cấp**: `library_test_part` chứa nội dung passage/section (passage, transcript, questions JSON, optionBank, imageUrl, audio) thay vì trỏ sang ngân hàng prompt. Lý do: thư viện không cần tái sử dụng một passage giữa nhiều test, một cấp rút editor còn một trang và việc lưu nguyên tử theo part. Khi làm clone sau này, mỗi part map 1-1 thành một `assignment_prompt` và test map thành `assignment_test` + `assignment_test_part`.

## Phases

| # | Phase | Phụ thuộc | Status |
|---|---|---|---|
| 1 | [Role `admin`, topology, gate xác thực](phase-01-admin-role-topology-auth.md) | — | pending |
| 2 | [Schema + migration + contract thư viện đề](phase-02-library-schema-contracts.md) | 1 | pending |
| 3 | [Route `/api/admin/library` + kho audio R2](phase-03-admin-library-routes-audio.md) | 1, 2 | pending |
| 4 | [Trích editor đề từ `apps/web` sang `packages/ui`](phase-04-extract-shared-editors.md) | — (làm song song được với 1–3 nhưng thứ tự plan là tuần tự) | pending |
| 5 | [Scaffold `apps/admin` + infra + dev/e2e/CI wiring](phase-05-admin-app-scaffold.md) | 1, 4 | pending |
| 6 | [UI CRUD bộ đề (list, create, edit, publish, delete, audio)](phase-06-admin-ui-crud.md) | 3, 4, 5 | pending |
| 7 | [E2E, verify UI 3 viewport, docs](phase-07-e2e-verify-docs.md) | 6 | pending |

Phase 4 là refactor thuần cơ học và là rủi ro lớn nhất về khối lượng; tách riêng để review/merge độc lập, không đổi hành vi `apps/web`.

## Acceptance criteria

- [ ] `pnpm dev:admin` chạy app ở cổng 8004; `pnpm test`, `pnpm check`, `pnpm check-types`, `pnpm build` xanh với workspace mới.
- [ ] Đăng nhập admin chỉ thành công khi `user.role='admin'`, email thuộc `ADMIN_EMAILS` và đã verify. Tài khoản teacher/student bị chặn ở admin origin; tài khoản admin bị chặn ở teacher/student origin và ở `/api/*` của kernel/student (không bao giờ bootstrap org cho admin).
- [ ] Không thể tạo tài khoản role `admin` qua sign-up (email/password hay Google) nếu email không nằm trong `ADMIN_EMAILS`.
- [ ] Admin tạo được test Reading (3 passage) và Listening (4 section) với đủ các dạng câu hỏi hiện có của catalog (`ASSIGNMENT_PART_TYPES`), sửa, xóa; list có lọc skill/status/search qua URL param.
- [ ] Upload audio mp3/m4a/wav (≤ 50MB) cho từng section Listening, phát lại được trong editor; xóa part/test thì object R2 bị dọn.
- [ ] Chuyển `ready` bị chặn (400 kèm lý do) nếu thiếu slot, thiếu passage/câu hỏi, hoặc Listening thiếu audio.
- [ ] Teacher/student không có đường đọc `/api/admin/*` (test 403 cho từng role).
- [ ] E2E: spec đăng nhập admin + CRUD Reading + CRUD Listening (kèm upload audio) pass với cổng 8104.
- [ ] `docs/system-architecture.md`, `docs/production-release-runbook.md`, `docs/codebase-summary.md` cập nhật; `topology-drift` test phủ origin admin.

## Rủi ro chính và cách xử lý (red-team nội bộ)

| Persona | Phát hiện | Xử lý trong plan |
|---|---|---|
| Security | `user.create.before` hiện gán `role = appRole`; admin origin sẽ cấp `admin` cho **bất kỳ ai** đăng ký trên đó | Phase 1: ném `FORBIDDEN` khi `appRole==='admin'` và email ∉ `ADMIN_EMAILS` |
| Security | Email/password sign-up chưa verify trùng email admin → kẻ tấn công có session admin trước chủ thật | Phase 1: `requireAdmin` đòi `emailVerified` **và** kiểm lại allowlist mỗi request, không tin role một mình |
| Security | `bootstrapMiddleware` tạo org + membership `teacher` cho mọi role khác `student` → admin sẽ có org giả | Phase 1: chặn role `admin` trên kernel tree (403 mới), mount `/api/admin` ngoài kernel như `/api/student` |
| Security | Upload audio: MIME giả, file khổng lồ, XSS qua file phát lại | Phase 3: allowlist MIME audio, đếm byte thật (`enforceDeclaredSize`), header `nosniff` + CSP sandbox như `mediaObjectResponse` |
| Failure | Cổng/CORS lệch: thêm origin thứ ba dễ làm `CORS_ORIGIN` default và drift test lệch | Phase 1 + 5: sửa cùng lúc `topology.ts` (infra + auth), `alchemy.run.ts`, `topology-drift.test.mjs`, `.env.example`, runbook |
| Failure | Xóa test nhưng R2 object mồ côi | Phase 3: xóa row trong `db.batch`, dọn R2 qua `runInBackground`; upload mới ghi key mới rồi mới xóa key cũ |
| Failure | Trích editor (phase 4) làm vỡ `apps/web` | Phase 4: `git mv` + shim re-export, không đổi API component; bộ test hiện có và e2e `assignment-*` là gate |
| Scope | Sa đà làm thêm clone/teacher view | Non-goals ghi rõ; chỉ chuẩn bị mô hình dữ liệu map 1-1 |
| Assumption | Giả định `admin` và `teacher` là hai tài khoản riêng (một cột `role`) | Ghi vào câu hỏi mở bên dưới |

## Câu hỏi mở

1. Chủ sản phẩm dùng chung một email cho teacher và admin được không? Hiện `user.role` là một cột đơn, nên admin cần một tài khoản (email) riêng nằm trong `ADMIN_EMAILS`. Nếu cần một người làm cả hai vai thì phải đổi sang mô hình nhiều role, ngoài phạm vi plan này.
2. Giới hạn dung lượng audio: plan dùng 50MB theo precedent Speaking (#305). Một đề Listening IELTS mp3 128kbps khoảng 30–40MB, đủ; cần xác nhận nếu có file lossless.
3. Domain admin `admin.<domain>` cần thêm bản ghi custom domain trên Cloudflare ở lần deploy đầu (cùng cơ chế `student.<domain>`); người vận hành có token đủ quyền không?

## Validation

- Verify nguồn: mọi đường dẫn và hành vi trích dẫn trong plan được đọc từ code ngày 2026-10-22 (xem từng phase, mục "Files").
- Mỗi phase có lệnh test hẹp nhất chạy trước, rồi mới mở rộng (đúng `development-rules.md`).
- Không dùng mock/dữ liệu giả để qua gate; e2e chạy trên server thật + D1 local.
