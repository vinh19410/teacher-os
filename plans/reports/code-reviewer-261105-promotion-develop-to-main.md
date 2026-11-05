# Pre-landing review: promotion develop → main

## Phạm vi
- Diff: `git diff origin/main...HEAD` (126 commit, 503 file, +69.5k/-5.0k; bỏ qua churn `plans/`)
- Trọng tâm: rủi ro release xuyên suốt (migration D1, auth/OTP, endpoint học viên mới, email, workflow deploy, infra, rebrand)
- Đã chạy: `packages/auth` `auth-email-otp.test.ts` (8/8 pass); `apps/server` `student-auth-otp`, `student-schedule`, `study-pack-migration` (14/14 pass). Không chạy full suite/typecheck.

## Kết luận tổng quát
Nhìn chung diff an toàn để promote. Migration chỉ thêm (additive), chuỗi snapshot nhất quán, và việc nâng better-auth 1.7.16 tương thích schema. Còn **1 gate bắt buộc trước khi merge** (pre-flight dữ liệu trùng cho unique index 0061) và **1 điểm yếu trust-boundary mức High** (OTP không có rate limit theo IP/toàn cục) nên xử lý bằng cấu hình WAF cùng lúc release.

## Pass 1 — CRITICAL (chặn release)

### C1. `0061` unique index có thể FAIL trên D1 prod nếu đã có clone trùng
- `packages/db/src/migrations/0061_petite_dormammu.sql:1`: `CREATE UNIQUE INDEX study_pack_org_source_pack_uq ON study_pack (org_id, source_pack_id)`.
- Route clone hiện trên `main` theo kiểu check-then-insert không có ràng buộc: `origin/main:apps/server/src/routes/study-pack.ts:268-279` (SELECT existingClone) rồi `:326` (`db.batch` insert). Bấm đúp hoặc request song song lúc `0060` đã lên prod có thể tạo ra 2 dòng cùng `(org_id, source_pack_id)`.
- `deploy.yml` tự `alchemy deploy --stage prod` khi push `main`, nên migration chạy ngay lúc merge. Nếu có dòng trùng thì `CREATE UNIQUE INDEX` lỗi và deploy dừng: `0062–0064` không áp, Worker mới không lên. Không mất dữ liệu nhưng release đỏ.
- NULL không vi phạm (SQLite coi NULL là khác nhau). Các pack gốc/admin có `source_pack_id = NULL` (`study-pack.ts:143`, `admin-library.ts`) nên an toàn.
- Runbook đã có truy vấn pre-flight và cách dọn: `docs/production-release-runbook.md`, mục "Bộ đề tự học theo lịch (migrations 0060–0061)". **Bắt buộc chạy trên D1 prod và phải ra 0 dòng trước khi merge** (tôi không truy cập được D1 prod để tự xác minh):
  ```sql
  SELECT org_id, source_pack_id, COUNT(*) FROM study_pack
  WHERE source_pack_id IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1;
  ```
- Code mới trên develop đã xử lý race đúng: `apps/server/src/routes/study-pack.ts:348-364` bắt lỗi batch, đọc lại `racedClone` rồi trả 201.

## Pass 1 — HIGH (nên xử lý cùng release, không chặn merge)

### H1. OTP đăng nhập học viên chỉ có cooldown theo email, không có rate limit theo IP/toàn cục
- `packages/auth/src/index.ts:151-198` (`checkAndUpdateCooldown`, 60s/email) và `:406-415`. Không có cấu hình `rateLimit` của better-auth: grep `rateLimit` trong `packages/auth/src` và `apps/server/src` không ra kết quả nào. Rate limit mặc định của better-auth lưu trong memory, mà trên Workers memory là riêng từng isolate, nên coi như không có.
- Hệ quả 1, brute force có chủ đích: mỗi OTP 6 số cho 3 lần thử (mặc định `allowedAttempts = 3` của better-auth v1.7.16), cứ 60s lại xin được mã mới. Một email chịu ~4.320 lần đoán/ngày, xác suất trúng ~0,43%/ngày, ~12% sau 30 ngày cho một tài khoản học viên (nạn nhân sẽ nhận hàng nghìn email, nhưng chiếm tài khoản vẫn khả thi).
- Hệ quả 2, email bombing / cạn quota Resend: không giới hạn số địa chỉ khác nhau, mỗi địa chỉ 1 mail/60s. Cạn quota hoặc hỏng reputation domain gửi sẽ kéo theo reset password, xác thực email và mail mời lớp.
- Cooldown không nguyên tử: SELECT, rồi DELETE, rồi INSERT (`:162-196`). Request song song có thể cùng vượt qua, và lỗi insert bị nuốt (`:195`) khiến cooldown tắt kiểu fail-open.
- Header `Origin` là gate định tuyến chứ không phải biên bảo mật (curl tự đặt được).
- Đề xuất: (a) Cloudflare WAF rate-limit rule cho `api.<domain>/api/auth/email-otp/send-verification-otp` và `/api/auth/sign-in/email-otp` theo IP (ví dụ 5/phút), đây là thay đổi cấu hình, không đụng code; (b) bật `rateLimit` của better-auth với `storage: "database"` và `customRules` cho 2 path trên; (c) cân nhắc giới hạn số lần gửi OTP theo email mỗi ngày.

## Pass 2 — INFORMATIONAL

1. **Lộ email giáo viên/admin (enumeration)**: `packages/auth/src/index.ts:416-422` trả 403 `ROLE_MISMATCH` trước khi kiểm OTP nếu email thuộc tài khoản không phải student, nên đoán được email nhân sự. Mức thấp (single-org). Có thể trả lỗi giống hệt `INVALID_OTP`.
2. **Ép kiểu `as unknown as` trên db** ở `getUserByEmail` và `checkAndUpdateCooldown` (`index.ts:134-145`, `:153-166`): bỏ qua type-safety của Drizzle, schema đổi thì không bắt được lúc compile.
3. **Gate deploy prod bỏ test chậm**: `.github/workflows/quality.yml:106` đặt `VITEST_SKIP_SLOW: "1"` cho job `test-server`, và job này cũng được dùng trong `deploy.yml`/`deploy-staging.yml`. Trước đây deploy chạy `pnpm test` đầy đủ. Cần xác nhận đây là chủ ý.
4. **Smoke auth giảm phạm vi**: staging smoke chuyển sang `STUDENT_ORIGIN` (`deploy-staging.yml`, bước sign-up), nên đường auth của teacher origin và OTP không được smoke ở đâu cả. Prod vẫn không có auth smoke (chủ ý).
5. **Chuỗi brand hard-code trong smoke**: `deploy.yml`/`deploy-staging.yml` grep `'Cô Mỹ Dạy Tiếng Anh'`. Đã xác minh chuỗi có trong `apps/landing/public/index.html:6` (UTF-8), nhưng mỗi lần đổi title sẽ làm hỏng smoke. `BRAND_NAME` bị định nghĩa 2 lần (`apps/server/src/lib/brand.ts`, `packages/auth/src/mail/brand.ts`), có nguy cơ lệch nhau.
6. **Cache session phía client** (`apps/web/src/lib/auth-client.ts:96-113`): khi lỗi mạng thì dùng lại session cũ thêm 5s, và `force: true` vẫn trả promise đang bay (bỏ qua force). Chỉ ảnh hưởng UI; server vẫn là nơi xác thực. Thấp.
7. **`GET /api/student/schedule`** (`apps/server/src/routes/student.ts:1111-1234`): scoping đúng (`orgId` + `studentId` + enrollment `active`). Có điều trả về toàn bộ lesson quá khứ và tương lai, không giới hạn, cộng thêm `loadNextSession` cho từng lớp (N query, chặn trên bởi số enrollment). Rủi ro hiệu năng thấp, về sau có thể cần cửa sổ thời gian.
8. **Release train**: server và student dùng contract strict (`writing`, `dueAt`, `grade` trong detail). Alchemy deploy cả hai cùng lúc nên ổn, nhưng rollback phải hạ cả hai bundle cùng nhau.
9. **Test gap**: chưa có test cho nhánh hết lượt thử OTP (`TOO_MANY_ATTEMPTS`) và cooldown dưới request song song.

## Đã kiểm, không phải lỗi (kèm nguồn)
- Migration `0062` (`student.last_invite_email_at` nullable), `0063` (`writing_part`/`writing_type` nullable; `writing_prompt TEXT NOT NULL DEFAULT ''` hợp lệ khi ADD COLUMN trên SQLite), `0064` (`student.current_level` nullable): đều additive. Code đọc `writing` chỉ khi `writingPart !== null` (`student.ts` diff). `/readyz` tự suy ra `REQUIRED_COLUMN_TOTAL` từ schema (`apps/server/src/routes/readiness.ts:49`).
- Journal `_journal.json` có idx 61–64 tăng dần. Chuỗi `id`/`prevId` của snapshot 0059→0064 liền mạch (đã kiểm bằng script). `0060_snapshot.json` bổ sung sau (commit 81b422fd) cũng khớp chuỗi.
- better-auth 1.6.27 → 1.7.16 (`pnpm-workspace.yaml`): bảng `account` ở v1.7.16 vẫn dùng `accountId`, không có `providerAccountId`/`issuer` (`packages/core/src/db/get-tables.ts@v1.7.16`), nên khớp `packages/db/src/schema/auth.ts:51-78`. Các breaking change của bản RC không có trong bản stable.
- Pre-hijack: `sign-in/email-otp` của v1.7.16 gọi `revokeUnprovenAccountAccess` với user chưa xác thực. Có test `auth-email-otp.test.ts:268`.
- OTP: các endpoint phụ (reset/change-email/verify-email) bị chặn (`index.ts:366-379`); OTP không gửi tới email trong TEACHER_EMAILS/ADMIN_EMAILS hoặc user có role khác student (`:569-579`); hook `user.create` chặn email giáo viên tạo từ cổng khác. `storeOTP: "hashed"`, hết hạn sau 300s.
- Resend invite (#570): truy vấn scoped theo `orgId`, cooldown CAS trên `last_invite_email_at` có rollback khi gửi lỗi (`kernel.ts:1178-1320`). Body email đi qua `escapeHtml` (`deliver.ts:104`), `fromName` đi qua `sanitizeHeaderValue` (`packages/auth/src/mail/mailer.ts:27`).
- Detail attempt học viên chỉ lộ grade đã publish: `toQuizAttemptGrade` cần `gradeScores` + `gradedAt`, và hai trường này chỉ được ghi khi publish (`grading.ts:1038-1041`); bản nháp AI nằm ở bảng `ai_grading_draft`.
- Secrets: chỉ có fixture test (`packages/db/src/seed/vocab-library.test.ts`). Không tìm thấy token thật (`re_`, `ghp_`, `AKIA`, `sk-`).
- Infra: `alchemy.run.ts` chỉ đổi default `MAIL_FROM` và thêm `STUDENT_PORTAL_URL` cho profile; profile build gọi thẳng `node build.mjs` nên không bị turbo lọc env. Không đổi tên Worker, D1 hay cookie prefix. Seed vocab chỉ chạy ở staging, prod có chặn cơ học (`assertNonProdD1Database`).
- Workflow: `quality.yml` không đọc secrets, `permissions: contents: read`; deploy giữ `cancel-in-progress: false`.

## Hành động đề xuất (theo ưu tiên)
1. **Trước khi merge**: chạy truy vấn pre-flight `0061` trên D1 prod. Có dòng trùng thì tách liên kết theo runbook rồi mới merge.
2. Cùng release: thêm WAF rate-limit cho 2 path OTP (H1). Sau đó bật `rateLimit` better-auth với storage database.
3. Xác nhận chủ ý `VITEST_SKIP_SLOW` trên gate deploy prod (I3).
4. Follow-up: hợp nhất `BRAND_NAME`, làm trung tính lỗi enumeration, bổ sung test `TOO_MANY_ATTEMPTS`.

## Câu hỏi chưa giải quyết
- Prod D1 hiện có bao nhiêu dòng `study_pack` có `source_pack_id IS NOT NULL`? Pre-flight đã chạy chưa?
- Bỏ test chậm khỏi gate deploy prod là quyết định đã duyệt hay là tác dụng phụ của #409?
