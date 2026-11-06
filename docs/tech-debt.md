# Sổ nợ kỹ thuật

Danh sách nợ kỹ thuật đang mở của Cô Mỹ Dạy Tiếng Anh (Teacher OS), kèm bằng chứng trong repo và những thông tin cần chủ dự án quyết định.

**Cập nhật lần cuối:** 2026-11-04, trên `develop` @ `00c1ae64`.

## Tóm tắt

- Việc gấp nhất là đưa bản nâng `better-auth` (1.6.27 lên 1.7.16, xử lý advisory critical về đăng nhập) lên staging rồi production. Code đã nâng trên nhánh `fix/better-auth-1.7-upgrade`, còn chờ kiểm tra thật trên D1 (TD-01).
- Lỗi SePay (#329) chưa gây hại vì tính năng đang tắt, nhưng phải sửa xong trước khi bật ở bất kỳ môi trường nào.
- Phần còn lại chủ yếu là file quá lớn, repo nặng và tài liệu lệch trạng thái. Các mục này không khẩn cấp, chỉ làm việc phát triển chậm dần.
- Kỷ luật code khá tốt: mã nguồn không có TODO/FIXME thật sự, không có `@ts-ignore`, và 62/62 migration đều có snapshot. Tuy vậy, code vẫn mang nhiều nhánh tương thích dữ liệu cũ (TD-19).

## Thông tin cần bạn cung cấp

Bạn điền vào cột "Trả lời" hoặc trả lời trong chat, mình sẽ cập nhật lại sổ. **Đừng dán secret hay token vào file này**, vì nó được commit lên git.

| # | Câu hỏi | Liên quan | Trả lời |
|---|---------|-----------|---------|
| Q1 | Có được nâng `better-auth` lên ≥1.7.7 ngay, trước khi làm #578 không? | TD-01 | Có, nâng ngay (2026-11-04) |
| Q2 | Dự kiến bật SePay khi nào, hay chưa có kế hoạch? Câu trả lời này quyết định mức ưu tiên của TD-04. | TD-04 | |
| Q3 | Bạn có chấp nhận lâu dài việc E2E không chạy trên CI không? Hiện prod và staging chỉ gate bằng quality, E2E dựa vào kỷ luật chạy local. | TD-06 | |
| Q4 | Mỗi tuần hoặc mỗi đợt release, bạn muốn dành bao nhiêu thời gian trả nợ (ví dụ 20%, hay một đợt riêng)? | TD-07, TD-08 | |
| Q5 | Với repo nặng: chỉ dừng thêm file nặng từ nay, hay chấp nhận viết lại lịch sử git để giảm dung lượng? Viết lại lịch sử sẽ làm đổi hash và ảnh hưởng mọi clone. | TD-12 | |
| Q6 | Có cần giữ ảnh trong `plans/` và `dogfood-output/` trên git không, hay chuyển ra kho ngoài được? | TD-12 | |
| Q7 | Có được xóa 59 nhánh remote đã merge vào `develop` không? | TD-13 | |
| Q8 | Issue release #494 còn hiệu lực không? Lần cập nhật cuối là 2026-10-29, trong khi `main` đã nhận merge mới (#557, 2026-11-03). | TD-14 | |
| Q9 | Có nợ nào chỉ bạn biết mà repo không thể hiện không (sự cố production, thao tác tay lặp lại, chi phí Cloudflare, phản hồi của người dùng, phần code bạn ngại sửa)? | Thêm mục mới | |
| Q10 | Production còn lớp hoặc hoá đơn tạo từ trước khi có lịch dạng JSON không? Nếu đã hết hoặc migrate được thì có thể gỡ nhánh legacy. | TD-19 | |

## Danh sách nợ đang mở

Mức ưu tiên:

- **P0:** xử lý ngay.
- **P1:** xử lý trước mốc liên quan.
- **P2:** nên trả khi đụng tới vùng code đó.
- **P3:** dọn khi rảnh.

| ID | Mức | Hạng mục | Vùng | Trạng thái |
|----|-----|----------|------|------------|
| TD-01 | P0 | `better-auth` nằm trong dải advisory critical | Bảo mật | Đã nâng trên nhánh, chờ staging |
| TD-02 | P1 | `dompurify` có advisory, nâng bản dễ | Bảo mật | Mở |
| TD-03 | P1 | Một số secret không được redact trong cấu hình deploy | Bảo mật | Mở |
| TD-04 | P1 | Lỗi SePay Bank Hub phải sửa trước khi bật (#329) | Thanh toán | Chờ Q2 |
| TD-05 | P2 | Chưa thấy test IDOR cho media bài nộp | Test | Cần xác minh |
| TD-06 | P2 | E2E không chạy trên CI | Quy trình | Chờ Q3 |
| TD-07 | P2 | File nguồn quá lớn | Kiến trúc | Chờ Q4 |
| TD-08 | P2 | Lớp map sang "legacy UI shape" ở web | Kiến trúc | Chờ Q4 |
| TD-09 | P2 | Tính ngày kết thúc lớp bỏ qua buổi bù | Nghiệp vụ | Cần xác minh |
| TD-10 | P2 | Không có job đối soát object R2 mồ côi | Vận hành | Mở |
| TD-11 | P3 | CLI `shadcn` nằm trong `dependencies`, làm nhiễu audit | Phụ thuộc | Mở |
| TD-12 | P3 | Repo nặng do media được commit | Repo | Chờ Q5, Q6 |
| TD-13 | P3 | Nhiều nhánh remote đã merge chưa xóa | Repo | Chờ Q7 |
| TD-14 | P3 | Trạng thái plan và issue lệch thực tế | Tài liệu | Chờ Q8 |
| TD-15 | P3 | Dependency tụt major, thiếu `engines` | Phụ thuộc | Mở |
| TD-16 | P3 | Lint hook để mức info, còn comment `eslint-disable` thừa | Chất lượng | Mở |
| TD-17 | P3 | Runbook dài hơn giới hạn tài liệu | Tài liệu | Mở |
| TD-18 | P3 | Vite 8 có thể crash native khi thiếu bộ nhớ | Dev tooling | Đã giảm nhẹ |
| TD-19 | P2 | Nhiều nhánh tương thích dữ liệu legacy | Kiến trúc | Chờ Q10 |
| TD-20 | P3 | Module dùng thật nhưng tên là `mock-data.ts` | Kiến trúc | Mở |

## Chi tiết

### TD-01: `better-auth` nằm trong dải advisory critical

- **Bằng chứng:** catalog ghim `better-auth: 1.6.27` (`pnpm-workspace.yaml`). `pnpm audit --prod` báo GHSA-965c-763c-88jm (critical, OAuth state dùng như magic link để đăng nhập thành người khác) và GHSA-r4xp-prcw-77qf (high, OAuth Proxy). Cả hai được vá ở ≥1.7.7.
- **Mức độ thực tế:** chưa xác nhận khai thác được. `packages/auth/src/index.ts` không khai báo `plugins:`, nên có thể chưa bật magic link hay OAuth Proxy, nhưng app có dùng Google OAuth và `getOAuthState`. Cần đọc kỹ advisory để kết luận.
- **Rủi ro tăng thêm:** #578 sẽ thêm đăng nhập bằng link hoặc mã qua email, tức là đi đúng vào vùng của advisory.
- **Đã làm:** nâng catalog lên 1.7.16 trên nhánh `fix/better-auth-1.7-upgrade`. Cấu hình email/password + Google + Drizzle của repo không cần đổi schema, vì cột `account.issuer` của 1.7.0-1.7.2 đã bị bỏ từ 1.7.3. Khóa OAuth state trong bảng `verification` đổi thành `auth-state:<state>`.
- **Trước khi deploy:** kiểm tra `(provider_id, account_id)` trùng trên D1 thật theo hướng dẫn nâng cấp 1.7. Nếu có dòng trùng, better-auth sẽ từ chối lookup tài khoản đó:

```sql
SELECT provider_id, account_id, count(*) FROM account GROUP BY 1, 2 HAVING count(*) > 1;
```

- **Sau khi deploy lên staging:** thử đăng nhập email/password, Google, xác thực email và đặt lại mật khẩu. Test và E2E chạy libsql nên chưa chứng minh được hành vi trên D1; phần này mới chỉ được kiểm tra bằng cách đọc mã adapter.
- **Tác động lúc deploy:** người dùng đang dở luồng Google có thể phải đăng nhập lại, vì state cũ không còn đọc được (state chỉ sống 10 phút).

### TD-02: `dompurify` có advisory

- **Bằng chứng:** đang dùng 3.4.16. Audit báo GHSA-cg2g-xh64-v4q7 (critical) và GHSA-mrv2-3pqr-j5jr (high), vá ở ≥3.4.17.
- **Mức độ thực tế:** repo không dùng `SAFE_FOR_TEMPLATES`, `IN_PLACE` hay `RETURN_DOM`, nên có vẻ không dính trực tiếp. Tuy vậy, `packages/ui/src/lib/rich-text-sanitize.ts` có `addHook` và đây là lớp chống XSS cho rich text.
- **Hướng xử lý:** nâng bản patch, chạy test rich text.

### TD-03: Secret không được redact trong cấu hình deploy

- **Bằng chứng:** `packages/infra/alchemy.run.ts:222` dùng `Config.string` cho `RESEND_API_KEY`, và các secret `SEPAY_BANKHUB_*` đi theo cùng pattern, vì `redacted` không kết hợp được với `withDefault`. Nợ này đã được ghi từ release 0.0.7 (`plans/journals/2026-10-01-ship-release-0011-mail-env-deploy-fix.md`).
- **Hướng xử lý:** bỏ `withDefault` với secret, dùng `Config.redacted` kèm `Config.option` hoặc cách tương đương, rồi xử lý giá trị rỗng trong code. Cần kiểm tra phía Cloudflare để biết biến đang là secret hay plain text.

### TD-04: Lỗi SePay Bank Hub phải sửa trước khi bật (#329)

- **Trạng thái:** tính năng đang tắt, secret rỗng thì route trả 503 `BANKHUB_DISABLED`, nên chưa ảnh hưởng người dùng.
- **Đã kiểm tra lại trong code hiện tại:**
  - H1: `apps/web/src/components/modals/bank-hub-link-modal.tsx:133` gọi `finish()` ngay khi `linked`, nên modal huỷ liên kết tự đóng.
  - H2: lệnh UPDATE ở `apps/server/src/routes/payment-transactions.ts:118-126` chỉ lọc theo `id`, không có điều kiện `matchStatus = 'unmatched'`, nên hai request đồng thời có thể gán một giao dịch cho hai hoá đơn.
  - H5: `.github/workflows/` chưa có biến `SEPAY_BANKHUB_*`.
- **Chưa kiểm tra lại:** H3, H4, H6 và các mục Medium. Xem chi tiết tại #329.
- **Lưu ý:** đây là lỗi liên quan đến tiền, nên phải đóng toàn bộ #329 trước khi bật ở bất kỳ môi trường nào.

### TD-05: Chưa thấy test IDOR cho media bài nộp

- **Bằng chứng:** journal release 0.0.13 ghi test này là follow-up. Danh sách test trong `apps/server/src/routes/student-quiz-media.test.ts` không có test nào đặt tên cho kịch bản học viên khác truy cập media.
- **Mức độ thực tế:** code có guard `ownedAttempt` (`apps/server/src/routes/student.ts:809`), nên đây là thiếu test bảo vệ, chưa phải lỗ hổng đã xác nhận.
- **Hướng xử lý:** soát toàn bộ test server rồi thêm test GET và DELETE bằng tài khoản học viên khác.

### TD-06: E2E chỉ chạy trên CI ở deploy production

- **Bằng chứng:** `.github/workflows/deploy.yml` có job `e2e` (6 shard, `--fully-parallel`) và `deploy` phụ thuộc nó. `ci.yml`, `quality.yml` và `deploy-staging.yml` không chạy e2e.
- **Rủi ro:** lỗi e2e chỉ lộ ra ở bước release lên prod, không có lưới ở PR hay staging; spec mới có test phụ thuộc thứ tự phải nằm trong describe serial, nếu không sẽ vỡ khi bị chia shard.

### TD-07: File nguồn quá lớn

| File | Số dòng |
|------|---------|
| `packages/api/src/contracts.ts` | 4559 |
| `apps/server/src/routes/student.ts` | 2203 |
| `apps/server/src/routes/kernel.ts` | 2148 |
| `apps/server/src/routes/grading.ts` | 1431 |
| `apps/server/src/routes/vocab.ts` | 1245 |
| `apps/server/src/routes/admin-library.ts` | 1198 |

- **Hướng xử lý:** tách dần theo domain khi đụng tới, ưu tiên `contracts.ts` vì mọi app đều phụ thuộc vào nó. Không nên làm một PR refactor lớn cùng lúc.

### TD-08: Lớp map sang "legacy UI shape"

- **Bằng chứng:** `docs/system-architecture.md` mô tả `apps/web/src/lib/repos/kernel.ts` (795 dòng) map snapshot của kernel sang "legacy UI shape".
- **Tác động:** mỗi field mới phải đi qua thêm một lớp chuyển đổi. Cần đánh giá thêm chi phí thực tế trước khi quyết định gỡ.

### TD-09: Tính ngày kết thúc lớp bỏ qua buổi bù

- **Bằng chứng:** `apps/web/src/lib/schedule-conflicts.ts:100-104` tính `classEnd` từ lịch và tổng số buổi, không tính buổi bù. Plan TOS-11 ghi đây là nợ (M2) và chuyển sang TOS-14. #447 đã đóng nhưng code này vẫn không xử lý buổi bù.
- **Tác động:** lớp có buổi bù sau ngày kết thúc lý thuyết có thể không bị phát hiện trùng lịch.
- **Cần xác minh:** nợ M3 (`moveDate` chọn được ngày trong kỳ nghỉ). Hiện đã có guard 409 `holiday-locked` cho nhóm có dòng holiday, nhưng chưa rõ guard này có bao phủ hết trường hợp không.

### TD-10: Không có job đối soát object R2 mồ côi

- **Bằng chứng:** `apps/server/src/routes/admin-library.ts:602` ghi object mồ côi "dọn tay" và dòng 819 chấp nhận orphan khi xoá nền lỗi. Journal release 0.0.13 có follow-up về job đối soát, nhưng tìm trong code chưa thấy job nào.
- **Tác động:** chủ yếu là chi phí lưu trữ tăng dần, không ảnh hưởng tính đúng đắn của dữ liệu.

### TD-11: CLI `shadcn` nằm trong `dependencies`

- **Bằng chứng:** `packages/ui/package.json` khai `shadcn` ở `dependencies`. Nhiều advisory mức high trong audit (`fast-uri`, `undici`, `js-yaml`, `body-parser`, `@modelcontextprotocol/sdk`) và critical `proxy-addr` đi qua đường này.
- **Hướng xử lý:** chuyển sang `devDependencies` nếu xác nhận runtime không import, audit `--prod` sẽ bớt nhiễu đáng kể.
- **Số liệu audit sau khi nâng `better-auth` (`pnpm audit --prod`):** 2 critical, 31 high, 50 moderate, 10 low.

### TD-12: Repo nặng do media được commit

- **Bằng chứng:** `.git` nặng 277 MB. `assets/videos` khoảng 140 MB (179 file), ảnh trong `plans/` khoảng 89 MB (709 file), `dogfood-output/` có 83 file được track. File `bgm.flac` (11 MB) có hai bản giống hệt nhau ở `teacher-os-intro` và `teacher-os-intro-9x16`.
- **Tác dụng phụ:** chạy full E2E local làm thay đổi 92 ảnh PNG đang được track trong `plans/`, nên dễ commit nhầm và phải dọn tay sau mỗi lần chạy.
- **Hướng xử lý:** tuỳ Q5 và Q6. Bước an toàn nhất là thêm `.gitignore` và chuyển media mới ra ngoài. Viết lại lịch sử phải có quyết định riêng của bạn.

### TD-13: Nhánh remote đã merge chưa xóa

- **Bằng chứng:** có 121 ref remote, trong đó 59 nhánh đã merge vào `origin/develop`.

### TD-14: Trạng thái plan và issue lệch thực tế

- **Bằng chứng:** 17 `plan.md` còn `pending` hoặc `in-progress`, nhiều plan từ tháng 9 (ví dụ `260918-0700-fix-176-invoice-code-type`) có thể đã xong. Giá trị status cũng chưa thống nhất: `completed`, `done`, `complete`, `released`.
- **Ví dụ issue:** #554 đã merge vào `develop` nhưng còn mở vì chờ lên beta (hợp lý), còn #494 thì cần bạn xác nhận (Q8).

### TD-15: Dependency tụt major, thiếu `engines`

- **Bằng chứng:** `pnpm outdated -r` báo 50 gói cũ, trong đó 6 gói tụt major: `typescript` 6→7, `vitest` 4→5, `jsdom` 26→30, `@types/node` 22→26, `dotenv` 17→18, `unpdf` 1→2.
- **Chi tiết khác:** `@types/node` đang là 22 trong khi CI pin Node 24. `package.json` gốc không có `engines`, nên chạy nhầm Node vẫn không bị cảnh báo.
- **Đã gây lỗi thật:** trên Node 26, 4 test ở `apps/web/src/routes/login-signup-gate.test.tsx` hỏng vì `localStorage` là `undefined`, kể cả trên `develop`; trên Node 24 thì qua hết. Shell trên máy dev có lúc mặc định Node 26, nên dễ gặp lỗi giả kiểu này.

### TD-16: Lint hook để mức info, còn `eslint-disable` thừa

- **Bằng chứng:** `biome.json` đặt `useExhaustiveDependencies` ở mức `info`, nên lỗi dependency của hook không chặn CI. Có 7 `biome-ignore` cho rule này, và 5 comment `eslint-disable` trong 3 file, dù repo không có cấu hình ESLint nên các comment đó không có tác dụng.

### TD-17: Runbook dài hơn giới hạn tài liệu

- **Bằng chứng:** `docs/production-release-runbook.md` dài 962 dòng, vượt giới hạn 800 dòng của `docs.maxLoc`.

### TD-18: Vite 8 có thể crash native khi thiếu bộ nhớ

- **Bằng chứng:** `AGENTS.md` ghi nguyên nhân là native abort trong rolldown-binding. Watchdog (#402) đã giảm tác động lên E2E nhưng chưa xử lý nguyên nhân gốc. Có thể thử lại khi nâng Vite.

### TD-19: Nhiều nhánh tương thích dữ liệu legacy

- **Bằng chứng:** có 194 dòng nhắc `legacy`, `deprecated`, `workaround` hoặc `tạm thời` trong code ngoài test, trong đó 120 dòng ở `apps/web`. Tập trung nhất là `apps/web/src/lib/class-sessions.ts` (18 dòng, có cả đường "legacy walk" được đóng băng làm fallback) và `packages/api/src/contracts.ts` (14 dòng). Ví dụ: lịch lớp vừa nhận JSON `{days,start,end}` vừa nhận free text cũ.
- **Tác động:** logic lịch và học phí phải giữ hai đường xử lý, nên khó sửa và dễ lệch nhau. Một số dòng có thể chỉ là chú thích, nên con số này chỉ phản ánh độ lan rộng.
- **Hướng xử lý:** đếm số row legacy trên production (Q10). Nếu còn ít thì viết migration, sau đó gỡ fallback.

### TD-20: Module dùng thật nhưng tên là `mock-data.ts`

- **Bằng chứng:** `apps/web/src/lib/mock-data.ts` (328 dòng) được 75 file không phải test import, và phần đầu file khai báo type của domain.
- **Tác động:** tên file gây hiểu nhầm là dữ liệu giả. Cần xem còn dữ liệu giả nào trong file không trước khi đổi tên.

## Đã kiểm tra, không xếp vào nợ

- Tìm `TODO`, `FIXME`, `HACK`, `XXX` trong `apps/`, `packages/`, `scripts/` chỉ ra 1 kết quả, là chuỗi mẫu trong `scripts/design-compare/capture.mjs:918`, không phải ghi chú nợ.
- Không có `@ts-ignore`, `@ts-expect-error`. Chỉ có 1 `test.skip`, ở `apps/e2e/specs/profile.spec.ts:143`, có điều kiện vì cần Google OAuth thật.
- Chỉ có 9 chỗ `any` hoặc `as unknown as` ngoài test và file sinh tự động, trong đó 3 chỗ ở `apps/server/src/index.ts` để nối DB.
- 62/62 migration có snapshot, tức là lỗi thiếu snapshot 0060 của #554 đã được xử lý.
- `TEACHER_EMAILS` rỗng bị chặn trên production (`packages/infra/src/topology.ts:168`).

## Chưa rà soát

Sổ này được lập từ phân tích tĩnh repo, issue và journal. Các phần sau chưa được đánh giá: hiệu năng runtime, chi phí Cloudflare, log production, độ phủ test theo số liệu, và chất lượng dữ liệu thật.

## Cách cập nhật sổ này

- Mỗi mục phải có bằng chứng kiểm tra được (`file:dòng`, issue, hoặc lệnh và kết quả).
- ID giữ nguyên, không dùng lại ID cũ. Khi trả xong, chuyển dòng xuống "Đã trả" kèm số PR.
- Các lỗi tính năng thông thường đi theo GitHub Issues. Chỉ ghi vào đây những gì làm chậm hoặc làm rủi ro hơn cho việc phát triển về sau.
- Lệnh tái kiểm tra nhanh:

```bash
pnpm audit --prod
```

```bash
pnpm outdated -r
```

## Đã trả

| ID | Hạng mục | PR | Ngày |
|----|----------|----|------|
| | Chưa có mục nào | | |
