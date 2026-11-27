# Runbook: Bộ đề Tự học Built-in (`study_pack*`) & Audio R2 (#702, #814)

Tài liệu vận hành cho pipeline seed bộ đề tự học hệ thống:
- `packages/db/seed-data/study-packs/foun-gt1-discipline.json` (**Course Foun/GT1** — 69 bài, audio external allowlist `listenaminute.com` / `lingua.com`)
- `packages/db/seed-data/study-packs/first-step-gt2.json` (**First Step/GT2** — 62 bài từ `mini-ielts.com`, 30 Reading + 32 Listening lưu MP3 trên R2 `library-audio`)

---

## 1. Đồng bộ lên Staging

### 1.1 D1 (`study_pack`, `study_pack_exercise`, `study_pack_item`)
`.github/workflows/deploy-staging.yml` **tự động** chạy bước `Seed built-in study packs (staging only)` mỗi khi merge/push lên `develop`:
```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/seed-study-packs.ts --d1 --d1-stage staging --if-needed --verify
```

### 1.2 R2 Audio (`library-audio` staging)
Upload 32 file MP3 Listening của `first-step-gt2` lên R2 staging (đọc từ `--audio-dir` nếu đã có sẵn hoặc tự tải từ YouTube bằng `yt-dlp` + `ffmpeg` theo `first-step-gt2.audio-manifest.json`):
```bash
# Xem trước (không ghi):
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/sync-study-pack-audio.ts --stage staging --dry-run

# Thực thi upload & verify toàn bộ 32/32 file:
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/sync-study-pack-audio.ts --stage staging --verify
```

---

## 2. Promote có chọn lọc từ Staging lên Production (Thủ công sau khi Staging OK)

`.github/workflows/deploy.yml` **KHÔNG** tự động seed study packs lên production. Khi staging đã kiểm thử ổn định, promote đúng bộ đề cần chuyển (đọc trực tiếp dữ liệu live từ D1 staging và copy MP3 từ R2 staging sang R2 production):

### 2.1 Qua GitHub Actions (`.github/workflows/promote-study-packs-prod.yml`)
1. `mode=audit-staging` (trên nhánh `develop`, môi trường `staging`): liệt kê toàn bộ `study_pack` trên D1 staging và kiểm tra số MP3 hiện có trên R2 staging.
2. `mode=dry-run` (trên nhánh `main`, môi trường `production`): chỉ đọc, đối chiếu diff D1 (insert/update/unchanged), xung đột và trạng thái MP3 giữa R2 staging và R2 production cho `pack_titles` đã chọn.
3. `mode=apply` với `confirm_prod=prod` (trên nhánh `main`, môi trường `production`): chụp preimage JSON + rollback SQL trước khi ghi, copy MP3 còn thiếu từ R2 staging sang R2 production (fail-closed nếu R2 staging thiếu file), upsert D1 production và đối chiếu SHA-256 content parity.

### 2.2 Chạy CLI trực tiếp ở local (khi có Cloudflare credentials)
```bash
# Bước 1: Audit read-only trên staging (D1 + R2)
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --d1 --mode audit-staging

# Bước 2: Dry-run đối chiếu staging -> production cho 1 bộ đề cụ thể (chỉ đọc)
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --d1 --mode dry-run \
    --pack "First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)"

# Bước 3: Apply lên production (kèm preimage backup, rollback SQL, copy R2 audio & verify SHA-256)
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --d1 --mode apply \
    --allow-prod --confirm-prod prod \
    --pack "First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)"
```

**Lưu ý:**
- Bộ đề hệ thống (`org_id IS NULL`) giữ nguyên `org_id = NULL` trên production để dùng chung trên `/assignments/packs` (#829).
- Nếu cần chỉ định tường minh bucket hoặc D1 UUID, dùng `STAGING_R2_LIBRARY_AUDIO_BUCKET`, `PROD_R2_LIBRARY_AUDIO_BUCKET`, `STAGING_D1_DATABASE_ID`, `PROD_D1_DATABASE_ID`.
- Có thể chạy lại lệnh Bước 3 nhiều lần an toàn (idempotent).
