---
type: reverse-erd
feature: placement-test
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# ERD — feature `placement-test`

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

Bảng thuộc feature: `placement_test`, `placement_test_audio` (toàn bộ cột là cột thật trong schema). Bảng tham chiếu biên: `organization`, `lead` (chỉ liệt kê cột feature này dùng). Quan hệ tham chiếu qua JSON (draft/published chứa audioId) vẽ nét đứt. ✅ packages/db/src/schema/placement-test.ts:13-51; packages/db/src/migrations/0058_simple_lady_deathstrike.sql:1-24

```mermaid
erDiagram
    ORGANIZATION ||--|| PLACEMENT_TEST : "mot to chuc mot bo de"
    ORGANIZATION ||--o{ PLACEMENT_TEST_AUDIO : "so huu audio"
    PLACEMENT_TEST ||..o{ PLACEMENT_TEST_AUDIO : "draft va published tham chieu audioId trong JSON"
    PLACEMENT_TEST ||..o{ LEAD : "mot de tao nhieu lead kem tom tat ket qua"

    PLACEMENT_TEST {
        text org_id PK "khoa chinh FK organization cascade"
        text draft "JSON ban nhap null khi chua co"
        text published "JSON snapshot null khi chua phat hanh"
        integer revision "so hieu CAS default 0"
        integer published_revision "revision tai luc phat hanh gan nhat"
        integer published_version "so phien ban default 0"
        integer published_at "thoi diem phat hanh timestamp ms"
        text published_by "nguoi phat hanh"
        integer updated_at "cap nhat cuoi timestamp ms"
    }
    PLACEMENT_TEST_AUDIO {
        text id PK "audioId uuid"
        text org_id FK "FK organization cascade not null"
        text object_key "khoa object placement orgId audioId"
        text name "ten file goc da lam sach"
        text content_type "kieu MIME audio"
        integer size "so byte"
        integer created_at "tao luc timestamp ms"
    }
    ORGANIZATION {
        text id PK "ma to chuc"
        text name "ten to chuc"
    }
    LEAD {
        text id PK "cua tinh nang leads"
        text source "profile hoac placement-test default profile"
        text placement "tom tat ket qua bai test default chuoi rong"
        integer submit_count "so lan gui default 1"
        text ip_hash "bam IP default chuoi rong"
    }
```

Chỉ mục thật (từ migration):

- `placement_test`: PRIMARY KEY (`org_id`). ✅ packages/db/src/migrations/0058_simple_lady_deathstrike.sql:1-12
- `placement_test_audio`: PRIMARY KEY (`id`); `placement_test_audio_org_id_idx` ON (`org_id`). ✅ packages/db/src/schema/placement-test.ts:49-51; packages/db/src/migrations/0058_simple_lady_deathstrike.sql:14-25
- `lead` (biên): `lead_ip_updated_idx` ON (`ip_hash`,`updated_at`). ✅ packages/db/src/migrations/0057_exotic_vulture.sql:27

Ghi chú: nội dung đề (câu hỏi, đoạn nghe, ngưỡng) nằm trong JSON `draft`/`published`, không tách bảng quan hệ; `published` là snapshot allowlist do `buildPlacementSnapshot` tạo. ✅ packages/api/src/placement-test-contracts.ts:447-514
