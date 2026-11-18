## Proof of Test (POT) — #806

### 1. Done-means / Acceptance Criteria

| Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|
| Biến `MAIL_FROM` trên GitHub environment `staging` mang tên "Cô Mỹ Dạy Tiếng Anh" | ĐẠT | `gh variable set MAIL_FROM --env staging --body '"Cô Mỹ Dạy Tiếng Anh" <no-reply@teacheros.io.vn>'` đã áp dụng. `gh variable list --env staging` xác nhận: `MAIL_FROM = "Cô Mỹ Dạy Tiếng Anh" <no-reply@teacheros.io.vn>`. |
| Better-Auth gửi mail đặt lại mật khẩu và xác thực email kèm `fromName: BRAND_NAME` | ĐẠT | `packages/auth/src/index.ts` cập nhật truyền tường minh `fromName: BRAND_NAME`. `pnpm --filter @teacher-os/auth test` pass toàn bộ 102/102 tests. |
| Tiêu đề tác giả thông báo release Discord dùng "Cô Mỹ Dạy Tiếng Anh Releases" | ĐẠT | `scripts/notify-discord-changelog.mjs` cập nhật `RELEASE_AUTHOR_NAME = "Cô Mỹ Dạy Tiếng Anh Releases"`. `node --test scripts/notify-discord-changelog.test.mjs` pass 11/11 tests. |
| Fixture syllabus generator cập nhật creator | ĐẠT | `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs` cập nhật `workbook.creator = "Cô Mỹ Dạy Tiếng Anh"`. |
| Hướng dẫn runbook staging cập nhật | ĐẠT | `docs/production-release-runbook.md` bổ sung lệnh `gh variable set MAIL_FROM --env staging`. |
| CI và Deploy Staging tự động xanh sau merge | ĐẠT | PR #807 merged. CI run [#44287771037](https://github.com/vinh19410/teacher-os/actions/runs/44287771037) (success). Deploy Staging run [#44287771151](https://github.com/vinh19410/teacher-os/actions/runs/44287771151) (success, bao gồm toàn bộ smoke checks và notify Discord). |

### 2. Bằng chứng kiểm thử

#### Cấu hình biến môi trường GitHub (`staging` & `production`)
```bash
$ gh variable list --env staging
NAME            VALUE                                     UPDATED
ADMIN_EMAILS    th.vinh102@gmail.com,admin@msmy.io.vn     about 1 day ago
LEAD_ORG_ID     7772e636-0ab9-424d-bb55-b5ec66c08baa      about 15 days ago
MAILER_IMPL     resend                                    about 14 days ago
MAIL_FROM       "Cô Mỹ Dạy Tiếng Anh" <no-reply@teach...  about 15 minutes ago
TEACHER_EMAILS  msthucmy@gmail.com                        about 14 days ago
```

#### Test Suite
```bash
$ pnpm --filter @teacher-os/auth test
 Test Files  9 passed (9)
      Tests  102 passed (102)

$ node --test scripts/notify-discord-changelog.test.mjs
ℹ tests 11
ℹ pass 11
ℹ fail 0

$ pnpm check-types
 Tasks:    12 successful, 12 total

$ pnpm exec biome check .
Checked 1854 files. No fixes applied. Found 0 errors.
```

#### GitHub Actions Run
- PR: #807 (merged commit `0682df0a` vào `develop`)
- CI Develop: https://github.com/vinh19410/teacher-os/actions/runs/44287771037 (Success)
- Deploy Staging: https://github.com/vinh19410/teacher-os/actions/runs/44287771151 (Success)
