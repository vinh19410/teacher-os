---
title: "Plan: dời bank link từ /payments vào /profile (#338)"
date: 2026-10-07
summary: "Fast-mode plan 261007-0818: BankLinkPanel rời trang riêng /payments về /profile, gỡ route + sidebar nav, matcher/test/e2e/docs theo — chưa implement"
---

# Plan: dời bank link từ /payments vào /profile (#338)

## What happened

Chạy `ak:plan --github` cho task "di chuyển phần liên kết tài khoản ngân hàng tại /payments vào trong /profile". Auto-detect chọn **fast mode** (scope rõ, scout 1 lượt là đủ). Scout xác nhận: `/payments` chỉ chứa duy nhất `<BankLinkPanel />`, `/profile` đã có stack Card (ProfileForm → AvatarSection → GoogleLinkCard) nên panel drop-in khớp; duy nhất 1 importer của panel là payments.tsx.

Plan `plans/261007-0818-bank-link-to-profile/` gồm 2 phase (~2h): (1) dời panel vào /profile + xoá route + gỡ sidebar nav "Nhận học phí" + matcher gỡ entry + matcher-test assert invalid (precedent /settings #321) + doc comment panel + URL mẫu security-headers.test; (2) e2e goto /profile + CHANGELOG + runbook smoke step + gate local + screenshot 3 viewport.

## Decision

- **Gỡ hẳn route `/payments`, không redirect** — theo precedent `/settings` (#321). Cơ sở: tính năng #320 mới ship 2026-10-06, beta tắt mặc định, không có deep-link nào trỏ `/payments` (QR trỏ `/pay/<token>`).
- **Panel giữ nguyên file `components/payments/bank-link-panel.tsx`** — domain vẫn là payments logic, `bank-hub-link-modal.tsx` import type `BankLinkPurpose` từ panel; chỉ đổi chỗ render, tránh churn import.
- Vị trí trên profile: cuối stack, sau GoogleLinkCard (nhóm "liên kết tài khoản" liền nhau); lead PageHead profile cập nhật.
- Không đụng nhánh OAuth `?error=` của profile (modal bank dùng postMessage, không thêm search param).
- Non-goal ghi rõ: không thêm CTA từ /tuition (gap discoverability sau khi gỡ nav là đường vào duy nhất — để dành quyết định sản phẩm riêng).

## Next steps

- Review issue [#338](https://github.com/vinh19410/teacher-os/issues/338) (label `ready to review`), rồi `/ak:cook plans/261007-0818-bank-link-to-profile/plan.md`.
- Lưu ý cook: `routeTree.gen.ts` regen qua `pnpm --filter web check-types` (vite build), không sửa tay; e2e chạy override port 8100/8101/8103 theo AGENTS.md.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
