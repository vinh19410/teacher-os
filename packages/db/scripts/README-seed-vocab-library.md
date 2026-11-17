# Runbook: Seed Thư viện Từ vựng Built-in (`vocab_library_*`)

Tài liệu hướng dẫn nạp dữ liệu thư viện từ vựng dùng chung (**20 khóa học / 968 bài học / 10.160 từ**) từ `packages/db/seed-data/vocab-library/*.csv` vào SQLite local, E2E, và Cloudflare D1 (#361).

---

## Gate Giấy phép PROD — ĐÃ MỞ (2026-11-17)

> Toàn bộ dữ liệu CSV và URL audio/hình ảnh trỏ tới CDN của bên thứ ba (`mochidemy.com`).
> Ngày 2026-11-17 chủ dự án xác nhận bằng văn bản (trong phiên làm việc với agent) rằng quyền
> sử dụng nội dung đã được giải quyết (Open Question 1 resolved) và yêu cầu đưa thư viện từ vựng lên production.
> - Gate chỉ mở cho **thư viện từ vựng**. Seed study packs (`seed-study-packs.ts`) vẫn bị chặn trên prod.
> - Việc ghi prod vẫn phải **opt-in tường minh** bằng cờ `--allow-prod` (xem mục 5); thiếu cờ thì CLI từ chối DB prod như trước.
> - `deploy.yml` **không** tự seed prod. Seed prod là thao tác thủ công, chạy lại khi CSV thay đổi.

---

## 1. Giả định & Tính chất Idempotent

- **Khóa chính deterministic:** `libcourse-<id>`, `libdeck-<id>`, `libword-<id>` (lấy từ cột `id` duy nhất của từng CSV; tuyệt đối không dùng `lessonDetailId` vì cột đó trùng lặp giữa các khóa).
- **Giả định ổn định ID:** Pipeline dựa trên giả định các `id` trong CSV giữ nguyên qua các lần re-export. Nếu file CSV mới xóa bớt dòng cũ, truyền thêm cờ `--prune` để dọn các dòng `libcourse-%`/`libdeck-%`/`libword-%` trước khi upsert.
- **Đối chiếu theo tập ID (`--verify`):** Không chỉ đếm `COUNT(*)`, bước `--verify` tải tập `id` thực tế trong DB đối chiếu 1-1 với tập `id` từ CSV (`missing` / `extra`).

---

## 2. Chạy trên SQLite Local (Alchemy Dev Stack)

1. **Tắt dev stack** (`pnpm dev` / `pnpm dev:server`) trước khi chạy để tránh khóa file SQLite.
2. **Xác định đúng file SQLite của D1 local:**
   Cây `.alchemy/local` có nhiều file `.sqlite` (metadata của miniflare, R2, cache). Chỉ chọn file nằm dưới nhánh `*d1/*` và loại trừ `metadata.sqlite`:
   ```bash
   SQLITE_FILE=$(find packages/infra/.alchemy/local -path "*d1/*" -name "*.sqlite" ! -name "metadata.sqlite" | head -n 1)
   echo "Target DB: $SQLITE_FILE"
   ```
3. **Chạy seed kèm verify** (CLI tự kiểm tra bảng `organization` và `vocab_library_course` tồn tại trước khi ghi):
   ```bash
   pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --file "$SQLITE_FILE" --verify
   ```
   Kết quả kỳ vọng: `Summary: course 20/20, deck 968/968, word 10160/10160` và exit code `0`.

---

## 3. Môi trường E2E (`apps/e2e/src/boot.ts`)

- Không cần chạy tay: `apps/e2e/src/boot.ts` tự động gọi `seedVocabLibrary(client)` ngay sau bước `migrate(...)` mỗi lần khởi động E2E API server.
- **Xử lý sự cố:** Nếu toàn bộ E2E suite đỏ ngay lúc boot với log `[vocab-library-seed] failed — every spec will fail; check CSV/EXPECTED_COUNTS first`, hãy kiểm tra lại 3 file CSV trong `packages/db/seed-data/vocab-library/` và chạy `pnpm --filter @teacher-os/db test`.

---

## 4. Chạy trên Staging / Production (Cloudflare D1 REST API)

1. **Thứ tự deploy bắt buộc:**
   - Apply migrations `0037`..`0040` (`db:migrate:deploy`) **TRƯỚC** khi deploy worker, sau đó re-seed `seed-vocab-library.ts --d1 --verify` để đổ cột `vocab_library_deck.description` (#369).
   - Deploy `apps/server` và `apps/student` **cùng một release train** (do `vocabSessionCardSchema` / `vocabStudentLibraryDeckSchema` dùng `.strict()` và thêm trường `hasAudio`, `description`).
2. **Tự động trên Staging (`.github/workflows/deploy-staging.yml` — #573):**
   - Bước `Seed built-in vocab library (staging only)` chạy ngay sau `/readyz` trên mỗi lần deploy staging (push vào nhánh `develop`):
     ```bash
     CLOUDFLARE_ACCOUNT_ID="<account-id>" \
     CLOUDFLARE_API_TOKEN="<api-token>" \
       pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --d1 --d1-stage staging --if-needed --verify
     ```
   - `--d1-stage staging` tự tra cứu đúng 1 DB khớp `^teacher-os-database-staging-[a-z2-7]{16}$` (fail-closed nếu `!= 1` kết quả hoặc trộn với `D1_DATABASE_ID`); `--if-needed` đối chiếu cả tập ID lẫn SHA-256 toàn bộ cột của 3 bảng trước khi bỏ qua upsert.
3. **Tính chất không nguyên tử (Non-atomic per-chunk) trên D1 REST:**
   D1 REST `/query` thực thi từng statement một (mỗi chunk ≤ 48KB là 1 câu `INSERT ... ON CONFLICT(id) DO UPDATE`). Nếu mạng hoặc token đứt giữa chừng, dữ liệu mới vào một phần; chỉ cần **chạy lại nguyên lệnh trên** cho tới khi `--verify` in `OK` ở cả 3 bảng và trả về exit code `0`.
4. **Production (`teacher-os-database-prod-*`):** `deploy.yml` không seed (khóa bởi `scripts/ci-workflow.test.mjs`). Chạy tay theo mục 5.

---

## 5. Seed Production (thủ công, cần `--allow-prod`)

Staging không có đường ghi runtime nào vào `vocab_library_*`, nên dữ liệu staging chính là 3 file CSV đã commit. "Đưa master data từ staging lên prod" vì vậy tương đương seed prod từ cùng CSV. Bước `--if-needed` đối chiếu SHA-256 toàn bộ cột, nên prod sau khi seed khớp staging từng byte.

1. **Credential prod:** token phải có quyền `D1:Edit` trên account chứa DB prod. Lấy UUID DB prod:
   ```bash
   pnpm dlx wrangler@4 d1 list | grep teacher-os-database-prod
   ```
2. **Đối chiếu staging với CSV (tùy chọn, read-only khi khớp):**
   ```bash
   pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --d1 --d1-stage staging --if-needed --verify
   ```
3. **Backup trước khi ghi:** ghi lại bookmark Time Travel của DB prod (khôi phục point-in-time trong 30 ngày) và export 3 bảng:
   ```bash
   pnpm dlx wrangler@4 d1 time-travel info <prod-db-name>
   pnpm dlx wrangler@4 d1 export <prod-db-name> --remote --no-schema \
     --table vocab_library_course --table vocab_library_deck --table vocab_library_word \
     --output plans/reports/<ngày>-vocab-library-prod-preimage.sql
   ```
   File export chỉ chứa dữ liệu thư viện công khai, không có dữ liệu cá nhân.
4. **Seed + verify:**
   ```bash
   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... D1_DATABASE_ID=<prod-uuid> \
     pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --d1 --allow-prod --if-needed --verify
   ```
   Log phải in `verified target D1 database (teacher-os-database-prod-…, --allow-prod)` và bảng verify `OK` ở cả 3 bảng. Upsert không nguyên tử theo chunk; đứt giữa chừng thì chạy lại nguyên lệnh.
5. **Smoke:** đăng nhập giáo viên trên prod, mở thư viện từ vựng thấy 20 khóa; học viên mở khóa học thấy danh sách bài.
6. **Rollback:** `pnpm dlx wrangler@4 d1 time-travel restore <prod-db-name> --bookmark=<bookmark bước 3>`. Lệnh này khôi phục **toàn bộ DB** về thời điểm bookmark, nên chỉ dùng ngay sau khi seed. Muốn rollback muộn hơn thì xóa riêng các dòng `libcourse-%`/`libdeck-%`/`libword-%` rồi nạp lại file preimage. Lưu ý: các bộ từ giáo viên đã clone (`vocab_deck.source_library_deck_id`) và `vocab_card.word_id` trỏ `libword-*` sẽ mất tham chiếu.
