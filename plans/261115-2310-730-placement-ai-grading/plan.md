# Plan #730 — AI chấm Writing/Speaking test đầu vào + highlight lỗi

Status: in progress · Issue: #730 · Branch: `vinh19410/ai-chấm-điểm` → PR vào `develop` (beta)

## Phases
| # | Phase | Owner files | Depends |
|---|-------|-------------|---------|
| A | Contracts + schema + migration 0071 | `packages/api/src/placement-test-contracts.ts`, `packages/db/src/schema/placement-test.ts`, `packages/db/src/migrations/0071_*` | — (done) |
| B | Server: OpenAI grader, pipeline nền, retry, sweep, chốt + token + email, route kết quả công khai, env/infra | `apps/server/**`, `packages/infra/alchemy.run.ts`, `.github/workflows/deploy-staging.yml`, `apps/e2e/src/boot*` (fake grader) | A |
| C | Web: panel giáo viên — điểm AI, highlight màu + thẻ số, sửa/xoá/thêm lỗi (bôi đen), retry, copy link | `apps/web/src/components/leads/**`, `apps/web/src/lib/repos/leads.ts` | A |
| D | Profile: ghi audio-only, trang kết quả `/kiem-tra-dau-vao/ket-qua/?t=` | `apps/profile/**` | A |
| E | E2E spec lẻ + POT | `apps/e2e/specs/placement-ai-grading.spec.ts` | B, C, D |

## Acceptance criteria
Xem Done means trong issue #730.

## Key decisions
- Bảng riêng không dùng `ai_grading_draft` (FK `quiz_attempt`, thang IELTS).
- Offset lỗi do server định vị lại từ `quote` (`locatePlacementErrors`) — LLM không phải đếm ký tự.
- Token kết quả lưu thô (không hash) để giáo viên copy lại link; chỉ lộ cho giáo viên cùng org.
- Bật khi có `OPENAI_API_KEY`; không trừ Credit.
