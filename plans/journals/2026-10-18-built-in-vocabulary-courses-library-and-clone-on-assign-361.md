---
title: "Built-in Vocabulary Courses Library and Clone-on-Assign (#361)"
date: 2026-10-18
summary: "Implemented global vocab_library_* catalog, idempotent CSV seed pipeline, clone-on-assign kernel API, remote audio proxy with 301 follow + skip fallback, and 2-step Teacher UI dialog."
---

# Built-in Vocabulary Courses Library and Clone-on-Assign (#361)

## Bối cảnh
Triển khai thư viện từ vựng dùng chung toàn hệ thống (20 khóa học / 968 bài học / 10.160 từ từ master CSV) theo mô hình clone-on-assign (#361) mà không chạm vào ràng buộc `NOT NULL` của `vocab_deck.orgId`/`classId` (#359).

## Quyết định kỹ thuật
1. **3 bảng library global riêng biệt (`vocab_library_course`, `vocab_library_deck`, `vocab_library_word`):** PK deterministic (`libcourse-*`, `libdeck-*`, `libword-*`) cho phép seed idempotent qua `ON CONFLICT(id) DO UPDATE` và đối chiếu theo `id-set`.
2. **Clone-on-assign nguyên tử (1 `db.batch`):** Guard `classId` thuộc `ctx.orgId` trước mọi truy vấn library; chặn `deckIds` trùng (400) và vượt giới hạn `decks <= 50` hoặc `decks + words <= 500` (422); trả `duplicates[]` server-side.
3. **Proxy audio remote & nút Bỏ qua:** Dời gate `!store` 503 vào nhánh `audioKey`; proxy `audioUrl` từ `mochien3.1-api.mochidemy.com` có follow 301 cross-host sang `mochien-server.mochidemy.com`, kiểm tra `audio/*` ở response cuối, giới hạn 5MB, cache 24h; thêm nút "Bỏ qua" (`skipCurrentPrompt`) khi lỗi audio để không phạt SRS.
4. **Sửa tràn ngang 375×812 ở `AppShell`:** Thêm `w-full` vào `main.content` (`mx-auto` trong flex column tắt stretch khiến shrink-to-fit vượt 375px).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
