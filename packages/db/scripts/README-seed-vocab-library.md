# Runbook: Seed Thư viện Từ vựng Built-in (`vocab_library_*`)

Tài liệu hướng dẫn nạp dữ liệu thư viện từ vựng dùng chung (**20 khóa học / 968 bài học / 10.160 từ**) từ `packages/db/seed-data/vocab-library/*.csv` vào SQLite local, E2E, và Cloudflare D1 (#361).

---

## ⚠️ Gate Giấy phép Bắt buộc Trước khi Seed PROD (`--d1`)

> **STOP — GATE GIẤY PHÉP (Open Question 1 trong `plan.md`):**
> Toàn bộ dữ liệu CSV và URL audio/hình ảnh hiện trỏ tới CDN của bên thứ ba (`mochidemy.com`).
> - **Local dev / E2E / Staging:** được phép chạy để kiểm thử kỹ thuật.
> - **Production (`--d1` trên DB prod):** **CHẶN TUYỆT ĐỐI** cho tới khi chủ sở hữu dự án xác nhận bằng văn bản rằng quyền sử dụng nội dung đã được giải quyết (Open Question 1 resolved).

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
   npx -y tsx packages/db/scripts/seed-vocab-library.ts --file "$SQLITE_FILE" --verify
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
2. **Smoke test trên Staging trước (BẮT BUỘC):**
   Không bao giờ commit `D1_DATABASE_ID` hay `CLOUDFLARE_API_TOKEN` vào repo. Truyền qua biến môi trường của operator:
   ```bash
   CLOUDFLARE_ACCOUNT_ID="<account-id>" \
   D1_DATABASE_ID="<staging-d1-database-id>" \
   CLOUDFLARE_API_TOKEN="<api-token>" \
     npx -y tsx packages/db/scripts/seed-vocab-library.ts --d1 --verify
   ```
3. **Tính chất không nguyên tử (Non-atomic per-chunk) trên D1 REST:**
   D1 REST `/query` thực thi từng statement một (mỗi chunk ≤ 48KB là 1 câu `INSERT ... ON CONFLICT(id) DO UPDATE`). Nếu mạng hoặc token đứt giữa chừng, dữ liệu mới vào một phần; chỉ cần **chạy lại nguyên lệnh trên** cho tới khi `--verify` in `OK` ở cả 3 bảng và trả về exit code `0`.
4. **Production:** Chỉ thực hiện sau khi **Gate Giấy phép** ở đầu tài liệu đã được mở và bước Staging `--verify` đã xanh.
