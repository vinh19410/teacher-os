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

## 2. Promote từ Staging lên Production (Thủ công sau khi Staging OK)

`.github/workflows/deploy.yml` **KHÔNG** tự động seed study packs lên production. Khi staging đã kiểm thử ổn định, chạy 2 bước sau:

```bash
# Bước 1: Dry-run kiểm tra số file R2 còn thiếu & trạng thái D1 production (chỉ đọc, không ghi)
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --dry-run

# Bước 2: Copy các MP3 còn thiếu từ R2 staging -> R2 production, rồi upsert + verify D1 production
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --allow-prod --verify
```

**Lưu ý:**
- Có thể truyền `--audio-dir <dir>` nếu muốn upload MP3 từ máy local thay vì copy qua R2 staging.
- Nếu cần đặt tên bucket hoặc D1 UUID tường minh, dùng `STAGING_R2_LIBRARY_AUDIO_BUCKET`, `PROD_R2_LIBRARY_AUDIO_BUCKET`, `D1_DATABASE_ID`.
- Có thể chạy lại nguyên lệnh Bước 2 nhiều lần an toàn (idempotent).
