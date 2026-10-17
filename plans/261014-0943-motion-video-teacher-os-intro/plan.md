# Plan: Video giới thiệu Teacher OS (motion video 60s)

Skill: `ak:motion-video` · Project: `assets/videos/teacher-os-intro/` · Ngày: 2026-10-14

## Outcome đã chốt với user

- **Đề tài:** giới thiệu sản phẩm Teacher OS (workspace cho giáo viên IELTS / trung tâm nhỏ).
- **Độ dài:** ~60 giây, 11 scene, arc `hook_payoff`, hook `pain_point`, ending `signature_outro`.
- **Ngôn ngữ:** VO tiếng Việt (Gemini TTS, voice Sulafat) + caption karaoke tiếng Việt.
- **Định dạng:** master 1920×1080 @30fps + edition 9:16 (reframe).
- **Mode:** default (director + executor subagents). Lưu ý runtime không gán model tier riêng cho
  subagent nên director/executor chạy cùng model — giữ nguyên vai trò và file ownership theo
  `references/orchestration.md` (degrade rule).
- **Facts:** `plans/reports/2026-10-14-teacher-os-intro-facts.md` (landing page + PDR, mỗi fact có nguồn).

## Beat map (đã trình bày, user không phản đối)

| # | Scene | Type | Shot | Nội dung |
|---|---|---|---|---|
| s01 | hook | hook | MEDIUM push_in, cut-in @ "khắp" | Dạy giỏi nhưng admin rải rác khắp nơi |
| s02 | reveal | cover | WIDE pull_out | Teacher OS = 1 workspace, 6 module |
| s03 | classes | feature | MEDIUM pan | Nhân bản syllabus vào lớp |
| s04 | assignments | ui-demo | MEDIUM parallax | Ngân hàng đề IELTS 4 kỹ năng + chấm tự động |
| s05 | grading | ui-demo | CLOSE static | Chấm Writing 1 lượt: bài + key + band |
| s06 | tuition | feature | MEDIUM push_in | Hoá đơn, đã thu/còn lại, đối soát tự động |
| s07 | portal | ui-demo | WIDE tilt | Student portal + báo cáo phụ huynh |
| s08 | stats | stats | CLOSE static | 1.200+ lớp, 8.500+ bài chấm, 40+ syllabus |
| s09 | how | diagram | MEDIUM pan | 3 bước bắt đầu |
| s10 | cta | cta | CLOSE push_in | Beta miễn phí — giữ chỗ |
| s11 | outro | outro | WIDE pull_out | Tagline + signature |

Anti-monotony: push_in → pull_out → pan → parallax → static → push_in → tilt → static → pan → push_in → pull_out (không scene kề nhau trùng move).

## Style — ĐÃ CHỌN: `saas-bento` (bake-off 2026-10-14)

Bake-off 4 ứng viên (snapshot so sánh: `assets/videos/teacher-os-intro/bakeoff/comparison-labeled.jpg`),
user chọn **saas-bento** bằng mắt. `data/style.json` = base only, không layers.

Resolved table: base áp mọi dimension cho mọi scene. Binding constraints (cứng mọi nơi):
- Mọi tile snap vào bento grid — không card trôi tự do (hook scene master phải làm chaos trong grid)
- Cùng lúc chỉ 1 tile active (expanded hoặc ringed)
- Tile radius + gap nhất quán toàn video

Locks: palette light `bg #f5f6f8 / ink #0f172a / accent #6366f1 / tile #ffffff / mint #10b981 / peach #fb923c` ·
Manrope 800 headline + JetBrains Mono metrics · caption 40px Be Vietnam Pro 600 · BPM band 104–122 ·
camera locked-off (FLIP tile-expand là cú zoom duy nhất) · không flash/shake.

## Các bước production (production-pipeline.md)

1. ✅ Scaffold project từ templates
2. Bake-off 4 style → user pick → `data/style.json`
3. Director brief `data/direction.md` (subagent, trước mọi audio)
4. `generate-audio-assets.mjs vo|sfx|music` (multix qua npx shim)
5. `align-voiceover.mjs` → `fit-beat-grid.py` → `arrange-music.mjs` → `verify-arrangement.py` (±2ms)
6. Edit EDIT block `build-timeline.mjs` → `--dry` → đầy đủ → `measure-mix-balance.py` (music −4..−6 dB dưới speech)
7. Author `index.html` từ skeleton + contract + direction (executor), lint/check/snapshot
8. Director taste review (tối đa 2 vòng) trên contact sheets
9. Render master → remux mix.m4a → ffprobe/ebur128 (≈−14 LUFS, peak ≤−1 dBFS)/blackdetect
10. `reframe.py --ratio 9x16` → lint/check/render/checks riêng cho edition
11. Social encode CRF 21

## Quy ước vận hành

- multix chưa có trên PATH: shim `~/.local/bin/multix` → `npx -y -p @mrgoonie/multix@0.2.0 multix "$@"`
  (credentials đọc từ `~/.multix/.env`, không bao giờ in/copy key).
- Fonts: tải TTF OFL từ Google Fonts vào `assets/fonts/`; font display phải hỗ trợ dấu tiếng Việt,
  thiếu thì thay bằng font cùng họ (grotesk/serif/mono) hỗ trợ VN và ghi rõ sự thay thế.
- bake-off dùng TIMING viết tay (không có VO), `data-duration` tự set.
- Không commit renders/audio lớn vào git; `.video_agent/` không liên quan (pointer cũ của plugin khác).
