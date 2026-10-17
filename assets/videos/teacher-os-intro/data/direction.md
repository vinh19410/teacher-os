# Direction: teacher-os-intro

> Director brief (subagent, 2026-10-14) — controller lưu nguyên văn, sửa 1 typo màu accent
> (`#66366f1` → `#6366f1`). Line-level script edits ở cuối ĐÃ áp vào `data/script.json`.

Concept: Trong một bento grid, đống admin hỗn loạn của giáo viên freelance được gom về một workspace indigo duy nhất — mỗi module là một tile, mỗi lời hứa là một cú grid-reflow snap.

Story: arc hook_payoff · hook pain_point · ending signature_outro

Base: saas-bento · energy 3 · juice budget: soft overshoot `back.out(1.4)`, smear trên UI, một impact mỗi section rơi vào drop (`slam(el, t, {soft: true})`) — không flash, không shake (ràng buộc `beat_response` của profile thắng bảng juice chung)

Locks: palette bg `#f5f6f8` · ink `#0f172a` · accent `#6366f1` · tile `#ffffff` · mute `#64748b` · line `#e2e8f0` · mint `#10b981` · peach `#fb923c` · type Manrope 800 headline 72–96/-0.03em, Manrope 700 34 tile title, Manrope 500 26 body, JetBrains Mono 500 metrics/tag · caption pill Be Vietnam Pro 600 untouched · signature untouched

Motif: Vòng indigo (accent ring 2px, radius khớp tile 28) — sinh ra dưới dạng mảnh vỡ rời rạc trên các tile lệch ở s01, khép thành vòng tròn trên tile Teacher OS 2×2 ở drop s02, nhảy tile-đến-tile bằng grid-reflow qua s03–s07, chuyền tay giữa hai tile số liệu ở s08, bước trái→phải qua 3 tile bước ở s09, phồng theo tile CTA ở s10, nghỉ và "thở" (1.00–1.015) quanh tile logo ở s11. Hành trình: vỡ → lành → di chuyển → chuyền → bước → phồng → nghỉ.

Rhythm: s01 build → s02 DROP → s03 breathe → s04 build → s05 DROP → s06 breathe → s07 build → s08 DROP → s09 breathe → s10 DROP → s11 calm. BPM 104–122; mọi reflow snap và soft slam land trên downbeat, tile icon nudge 4px trên kick, ring sáng lên nhịp xuống.

Taste rules:
1. Không bao giờ có card tự do ngoài lưới — mọi nội dung sống trong một grid slot; caption pill là lớp fg riêng, không đè grid.
2. Không bao giờ hai tile active (ring/expand) cùng lúc; trong feature run không full-frame hard cut — mọi đổi cảnh đi qua tile-expand / tile-collapse / grid-reflow / stagger-fill.
3. Không shake, flash, glitch, elastic lớn — juice tối đa là `back.out(1.4)` + soft slam; "flash" digit chỉ là đổi màu accent, không phải flash frame.
4. Không bao giờ di chuyển chữ bằng "camera" — camera locked-off; chữ chỉ vào qua mask (lineIn) rồi hold, mọi move thuộc về tile và nội dung bên trong tile.
5. Không nhồi text trong tile — một tile một ý ≤ 5 từ, metrics chỉ dùng JetBrains Mono.
6. Không stagger đều tăm tắp và không `linear`/`power1` mặc định — phân phối eased (`each: 0.05, from: "center", ease: "power1.in"`), entrance `expo.out`/`power4.out`.

## s01-hook · hook · build
- Shot: MEDIUM · push_in → tương đương locked-off: camera đứng, bốn tile hỗn loạn tự phồng 1.00→1.06 trong slot; cut-in duy nhất của video theo script: FLIP tile-expand tile "học phí" lên CLOSE trên từ "khắp" (0.45s `expo.inOut`) — scene chạy ~6s với hai nhịp.
- Focal beats: "giỏi" → headline Manrope 800 top-left lineIn, grid còn trống; "rải rác" → ba tile bài vở / lịch học / học phí tumble lệch ±4° bên trong slot; "khắp nơi" → CLOSE trong tile học phí: mảnh spreadsheet + biên lai nhàu (baked fragment).
- Hero moment: trên "rải rác" — tumble land với `back.out(1.4)`, mỗi tile overshoot rồi kẹt lệch: chaos được thiết kế, không phải lộn xộn thật.
- Entrances: headline → lineIn qua mask, `expo.out`, dẫn trước; 3 tile lệch → slap vào slot (1.4→1.0, `expo.out`) stagger 0.05 from center; mảnh giấy → fly-in arc 6–10° spin resolve khi land.
- Depth: bg `#f5f6f8` + mesh bake góc phải, settleCam 1.00→1.03 cả scene; mid: các slot line `#e2e8f0`; fg: 3–4 mảnh giấy mute trôi chậm (những thứ "rơi ra" khỏi tile) — parallax 0.3:1:1.6.
- Exit: tile học phí collapse về slot (≈60% thời lượng entry, ease `.in`), toàn grid gồng ngược 2 frame rồi grid-reflow snap mở s02.
- Avoid: không tile nào rời slot hay chồng lên nhau; không đỏ/cảnh báo — nỗi đau giữ bảng mute/peach; không để caption chạy trước khi headline settle.

## s02-reveal · cover · DROP
- Shot: WIDE · pull_out → tương đương locked-off: grid-reflow + stagger-fill khai mở toàn bộ bento 4×3 (khám phá thêm tile = cú pull-out), không zoom camera.
- Focal beats: "gom" → reflow snap hút mọi mảnh hỗn loạn về đúng slot; "một workspace duy nhất" → tile 2×2 Teacher OS slam soft, vòng indigo khép kín từ mảnh vỡ; "sáu" → 6 icon module pop nối tiếp; "danh sách" → tile roster học viên sáng mint một nhịp.
- Hero moment: DROP trên "workspace" — `slam(el, t, {soft: true})` tile 2×2, squash 3 frame giữ volume, ring draw khép trễ 2 frame; impact duy nhất của section, không flash.
- Entrances: các tile còn lại → stagger-fill 0.92→1 `power3.out`, each 0.05 from center; ring → draw 2px `expo.out` overlap 30% sau tile; icon module → pop nudge 4px theo nhịp đếm.
- Depth: bg giữ + settleCam; mid: grid hoàn chỉnh sway ±1° lệch pha; fg: light sweep 0.6s `power2.inOut` (opacity ≤0.35) quét tile 2×2 sau slam.
- Exit: grid-reflow đưa tile Lớp học lên slot lớn, ring nhảy sang tile đó và bắt đầu phồng — giao tiếp grid-reflow → tile-expand dẫn thẳng vào s03.
- Avoid: không cho 6 module tile cùng lúc ring hay sáng đậm (chỉ icon nudge); headline không đè lên grid (grid chiếm 75% dưới).

## s03-classes · feature · breathe
- Shot: MEDIUM · pan → tương đương locked-off: tile Lớp học FLIP-expand full frame (`power3.inOut` 0.6s — zoom duy nhất của video, theo profile); bên trong, stage rộng hơn mask pan x trái→phải — pan sống trong tile.
- Focal beats: "nhân bản" → thẻ syllabus spawn một ghost copy snap vào slot lớp mới; "vào lớp" → class card tự điền tên; "có ngay" → mini-calendar pop với các ô buổi đã tô.
- Hero moment: trên "nhân bản" — ghost copy bay theo arc (x `expo.out`, y `power2.inOut`) với 2 ghost mờ 0.35/0.2 trailing 1 frame, land squash giữ volume rồi settle: gesture "clone" trở thành đạo cụ quay lại ở s09.
- Entrances: syllabus card → rise khỏi mask trong tile; class card mới → pop-settle trễ 30% sau ghost; calendar → `back.out(1.4)`.
- Depth: trong tile mở: bg canvas trắng kẻ line; mid: hàng class card stagger 0.05 `power2.out`; fg: cursor đi arc eased, click chọn syllabus đúng spoken word.
- Exit: tile-collapse về slot, grid-reflow đưa tile Ngân hàng đề lên slot lớn, ring nhảy theo — thuần vocabulary grid-reflow.
- Avoid: không pan cả grid (camera locked); class card chỉ chứa tên lớp + chip lịch, không thêm cột dữ liệu.

## s04-assignments · ui-demo · build
- Shot: MEDIUM · parallax → tương đương locked-off: demo nằm trong slot 2×2, grid xung quanh vẫn hiện; ba lớp nội tile trôi lệch nhau 0.3:1:1.6 trong hold — parallax nội tile.
- Focal beats: "bốn" → 4 chip kỹ năng pop stagger from center; "đáp án" → answer-key preview rise lên dưới chips; "một nút" → cursor arc đến nút Giao đề; "online" → 4 row học viên fill bằng smear.
- Hero moment: trên "giao" — cursor press `scale 0.96` 3 frame + ripple, nút squash giữ volume, 4 card đề smear (dx theo hướng, ghost trailing) bay đến 4 row học viên: climax của cặp build 04–05.
- Entrances: chips → pop 0.92→1 `power2.out` each 0.05; answer-key → rise qua mask; cursor → path cong `expo.out`; card đề → smear rồi settle.
- Depth: bg: grid dim 60% (quy tắc profile); mid: nội dung tile cascade 0.05s `power2.out` 0.4s; fg: cursor + ripple.
- Exit: zoom-through bằng tile-expand — thẻ đề Writing phồng lên chiếm full frame và trở thành chính màn hình chấm của s05 (match-move, không cut).
- Avoid: không mở full frame ở scene này (giữ khác biệt với s03/s05); chips kỹ năng chỉ là accent nhỏ mint/peach, không tô cả tile.

## s05-grading · ui-demo · DROP
- Shot: CLOSE · static → tương đương locked-off: frame full chính là tile đã expand (thừa hưởng exit s04); không move nào ngoài settleCam 1.00→1.03 và micro-motion — static để chính con số nói.
- Focal beats: "một lượt" → tri-pane đồng loạt rise: bài luận | đáp án | band; "band điểm" → chip điểm slam soft + odo 0.0→7.5 `power3.out`; "máy chấm" → cascade tick mint stagger từ giữa (trắc nghiệm tự chấm).
- Hero moment: DROP trên "band điểm" — odo decelerate vào 7.5, digit cuối đổi màu accent một nhịp + bump 1.06, chip squash 3 frame rồi settle `back.out(1.4)`; không flash frame, không shake.
- Entrances: 3 pane → rise khỏi mask `expo.out`, bài luận dẫn đầu, đáp án và band trễ 2–4 frame (secondary theo sau primary); tick → pop-settle each 0.04 eased.
- Depth: bg: pane trắng + line `#e2e8f0`; mid: các dòng essay lineIn tuần tự như đang được đọc; fg: ring tile sáng nhẹ trên downbeat + caption.
- Exit: con số band co lại thành chip trên row học viên (match-move giữ hướng), rồi tile-collapse toàn màn về slot, grid-reflow đưa tile Học phí lên, ring nhảy.
- Avoid: không chia lại layout giữa scene; không để cả ba pane cùng chạy animation dài đè spoken word — chỉ pane tương ứng động theo anchor.

## s06-tuition · feature · breathe
- Shot: MEDIUM · push_in → tương đương locked-off: demo trong slot 2×1; push-in = hoá đơn tự scale 1.00→1.08 từ anchor trong hold (`power2.inOut`) — camera vẫn đứng.
- Focal beats: "hoá đơn" → invoice trượt ra từ session card vừa hoàn thành (arc nhẹ); "đã thu" / "còn lại" → hai odo song song mint/peach; "đối soát" → các row tick-khớp, connector 2px draw.
- Hero moment: trên "đã thu" — counter odo `power3.out` decelerate vào giá trị + bump 1.06; khi row cuối khớp, toast "đã đối soát" pop-settle — nhẹ, đúng tinh thần breathe.
- Entrances: invoice → slide x `expo.out` kết hợp y `power2.inOut` (arc); 2 counter → odo trễ nhau 0.12s; tick rows → stagger eased from center.
- Depth: bg: grid dim; mid: ledger rows sway rất nhẹ ±1°; fg: light sweep trên invoice sau khi trượt xong.
- Exit: grid-reflow; một report-card ghost bay chéo lên hướng tile Portal (direction carry), ring nhảy sang tile Portal.
- Avoid: không dùng ký hiệu tiền nhảy múa; mọi số dùng JetBrains Mono; không biến thành dashboard dày — đúng một tile 2×1 và vài row.

## s07-portal · ui-demo · build
- Shot: WIDE · tilt → tương đương locked-off: tile Portal dạng 1×2 cao; bên trong, cột portal cuộn y trên xuống (tilt = travel dọc nội tile); grid xung quanh dim 60%.
- Focal beats: "nộp bài" → card bài nộp rise vào danh sách submission; "xem điểm" → band chip của học viên pop mint; "portal riêng" → cột cuộn dừng lại ở profile học viên; "kịp hỏi" → toast "đã gửi phụ huynh" pop-settle sau khi report assemble xong.
- Hero moment: trên "kịp hỏi" — report card hoàn tất các row stagger 0.05 `power2.out`, light sweep quét ngang, toast pop `back.out(1.4)`: punch của dòng "chưa kịp hỏi thì báo cáo đã tới".
- Entrances: submission card → rise qua mask; band chip → pop-settle; report rows → cascade; toast → pop-settle trễ 2 frame.
- Depth: bg: grid dim + mesh bake; mid: cột portal cuộn; fg: avatar học viên/phụ huynh ở mép tile trôi nhanh hơn (tỷ lệ 1.6) khi cuộn — parallax nội tile.
- Exit: tile Portal collapse, grid-reflow sắp lại thành bố cục stats (hai tile lớn chuẩn bị nhận số), ring rời portal.
- Avoid: không cuộn cả grid theo chiều dọc; portal không thành mockup web đầy chi tiết — chỉ list, score chip và report.

## s08-stats · stats · DROP
- Shot: CLOSE · static → tương đương locked-off: recap grid giữ nguyên không move; chỉ counters, ring pass và light sweep — static dành cho payoff theo quy tắc anti-monotony.
- Focal beats: "nghìn" → tile lớn thứ nhất: odo 0→1.200 `power3.out` rồi slam soft; "tám nghìn" → ring pass sang tile thứ hai: odo 0→8.500 mint; "đã chấm" → recap: mỗi tile trong grid sáng đèn nối tiếp (signature move "recap grid lit in sequence").
- Hero moment: DROP kép trên hai con số — mỗi odo chạm mốc thì soft slam (squash 3 frame, không flash, không shake), digit cuối đổi accent + bump 1.06.
- Entrances: 2 stat tile → stagger-fill 0.92→1; số → odo `power3.out`; đèn recap → sweep mint trái→phải each 0.03 eased từ giữa.
- Depth: bg: grid module dim 60% làm bối; mid: hai stat tile lớn (được reflow lên); fg: các chấm mint recap drift chậm (không nhấp nháy).
- Exit: recap grid co cụm lại thành ba ô bước bằng grid-reflow, ring bước vào ô bước 1.
- Avoid: hai counter không chạy cùng lúc; không thêm chart mới — con số là hero; mỗi odo không chạy quá ~1.2s.

## s09-how · diagram · breathe
- Shot: MEDIUM · pan → tương đương locked-off: ring bước trái→phải qua 3 tile bước, connector accent 2px `draw()` dẫn mắt — pan chính là hành trình của ring (khác s03: pan nội tile full-frame).
- Focal beats: "ba bước" → 3 tile bước stagger-fill; "tạo" → bước 1 pop + check nhỏ; "nhân bản" → bước 2 tái dùng gesture ghost-copy từ s03; "bắt đầu dạy" → bước 3 pop `back.out(1.4)` mint.
- Hero moment: trên "bắt đầu dạy" — bước 3 land squash nhẹ, connector cuối vẽ xong, cả ba tile breathe cùng nhau (sway lệch pha): mạch "dạy" được đóng.
- Entrances: 3 tile bước → stagger-fill, mỗi tile scale 1.04 đúng một nhịp khi keyword tới; connector → `draw()` với dot dẫn đường; icon bước 2 → ghost copy reuse.
- Depth: bg: grid đã co cụm từ reflow s08, dim; mid: 3 tile bước; fg: dot chạy trên connector + caption.
- Exit: ba bước gộp lại bằng grid-reflow thành một tile CTA lớn duy nhất, ring phồng theo tile — chuẩn bị tile-expand cho s10, không fade.
- Avoid: số bước không to đùng xuyên tile; connector mảnh 2px; không bịa bước thứ tư hay footnote.

## s10-cta · cta · DROP
- Shot: CLOSE · push_in → tương đương locked-off: tile CTA FLIP-expand full frame (zoom của section), bên trong chỉ headline và một nút; sau đó hold với settleCam.
- Focal beats: "miễn phí" → headline "Beta miễn phí đang mở" lineIn trong tile; "giữ chỗ" → cursor arc đến nút và press; "ngay hôm nay" → nút slam soft + ripple, label nút đổi accent.
- Hero moment: DROP trên "giữ chỗ" — press `scale 0.96` 3 frame, nút squash giữ volume, ripple lan, chip xác nhận "chỗ của bạn đã giữ" pop-settle mint; impact duy nhất của section, không flash.
- Entrances: tile expand `power3.inOut` 0.6s; headline → lineIn `expo.out`; nút → rise khỏi mask trễ headline 40%; chip xác nhận → pop-settle sau ripple 2 frame.
- Depth: bg: các tile khác dim 60% thở chậm quanh tile CTA; mid: headline + nút; fg: ripple + cursor.
- Exit: tile-collapse, grid-reflow về bố cục logo (pull-out hướng vào s11), ring trượt về tile logo giữa grid.
- Avoid: không thêm giá hay feature mới; chỉ một nút duy nhất; không đếm ngược urgency giả — giữ đúng fact "beta miễn phí, giữ chỗ".

## s11-outro · outro · calm
- Shot: WIDE · pull_out → tương đương locked-off: stagger-fill nhẹ đưa cả bento quay lại đầy đủ (khám phá toàn cảnh lần cuối, khép vòng với s02), rồi static hold với settleCam rất chậm.
- Focal beats: "nền vận hành" → grid hoàn chỉnh hiện rõ, mọi tile đã có mặt; "vẫn muốn được dạy" → ring settle trên tile logo, headline "Teacher OS" lineIn top-left.
- Hero moment: không impact — hero là cú thở cuối: mọi tile sway ±1° lệch pha và vòng indigo breathe 1.00–1.015 quanh tile logo (motif về vị trí nghỉ).
- Entrances: các tile → stagger-fill 0.92→1 each 0.05 from center, `expo.out`, chậm hơn s02 một nhịp; headline → lineIn; signature → theo composition-contract, untouched.
- Depth: bg: mesh bake + settleCam 1.00→1.03 rất chậm; mid: grid sway; fg: caption pill + music bed resolve.
- Exit: mọi chuyển động khựng dần về tĩnh, không fade đen đột ngột trước signature — kết trên outro bed và signature_outro.
- Avoid: không lặp CTA lần hai; không kéo dài quá ~5s; không tile nào sáng đậm hơn tile logo.

## Line-level edits (VN) — ĐÃ ÁP vào data/script.json

1. **s08 dòng 2:** `en` "Tám nghìn bài đã chấm." → **"Tám nghìn năm trăm bài đã chấm."** (khớp `vi` "8.500 bài đã chấm." và fact landing).
2. **s01 dòng 2:** thêm ngắt em-dash: "Nhưng bài vở, lịch học, học phí — nằm rải rác khắp nơi." (VO ngắt hơi trước cụm anchor).

## Review 1: revise
Keep: ring motif journey (s02 khép kín 2px radius 28, s08 pass giữa 2 số, s11 breathe quanh tile logo) · s04 climax cursor press + ghost trails đọc là một gesture · s05 tri-pane + odo 7.5 accent + exit match-move · s08 số mono separator dấu chấm VN "1.200"/"8.500" + sweep mint · s10 button accent fill + label trắng contrast 4.9:1 + ripple/chip timing · s11 đóng vòng với s02 + sway lệch pha + signature · diacritics sạch toàn tuyến · grid geometry 20/28 nhất quán qua 2 layout · FLIP là zoom duy nhất.

1. [s01+s02+s11 caption pill @ mọi dòng dài] Caption clip giữa từ: s01 "lịch"→"ịch" + mất "nơi.", s02 "workspace duy…" mất "nhất.", s11 chữ biến mất từng ký tự. → Sửa 2 lớp: (a) caption chunker trong build-timeline.mjs phải tách tại dấu câu (kể cả em-dash) và cap ~7 từ/chunk — s01 dòng 2 tách "Nhưng bài vở, lịch học, học phí —" / "nằm rải rác khắp nơi."; s02 dòng 1 tách "Teacher OS gom tất cả" / "vào một workspace duy nhất."; s11 tách "Teacher OS —" / "nền vận hành…" / "cho giáo viên vẫn muốn được dạy."; (b) .cap-box không được clip: bỏ overflow-hidden cứng, cho pill đo width theo text hoặc wrap; exit caption fade cả pill 0.2s power1.inOut, không thu theo ký tự.
2. [s02-reveal @ ~10–12s, sheet F2–F6] Stagger-fill đọc là tuần tự trái→phải đều tăm tắp (demo tell, vi phạm taste rule 6) → re-key: `each: 0.05, from: "center", ease: "power3.out"`, 2–3 tile cùng nhịp mỗi ring (ring 1: tile 2×2 + 2 tile giữa; ring 2: 4 tile góc), một ring mỗi downbeat.
3. [s01-hook @ ~5.5–6.5s, cut-in CLOSE] Tile học phí expand xong gần như trắng — chỉ 1 mảnh calendar nhỏ giữa frame trắng → bake nội dung fragment dày hơn (hàng spreadsheet + dòng biên lai, đánh dấu peach/mute), fragment chiếm ≥60% tile expanded để CLOSE đọc là detail chứ không phải frame chết.
4. [s05-grading @ đầu scene ~30s] Mở màn còn dropdown/popover của s04 chồng lên tile → dropdown collapse 0.15s `power2.in` đúng lúc Writing card bắt đầu FLIP, biến mất hoàn toàn trước khi card đạt 60% scale.
5. [s03-classes @ cuối scene ~16–17s] ~1.5–2s dead hold sau calendar pop, cursor idle đứng → ô buổi calendar thở mint opacity 0.85↔1.0 mỗi downbeat, cursor idle drift 3px `sine.inOut` 1.2s.
6. [s07-portal @ cuối scene ~46–48s] ~2s dead hold sau toast → portal rows sway ±1° lệch pha + mint dot drift chậm; giữ nguyên exit reflow.
7. [s06-tuition @ exit ~39–40s, optional] Report-card ghost bay chéo về tile Portal không đọc ra → 2 ghost trail opacity 0.35/0.20 lệch 1 frame, arc ~30° (x `expo.out` 0.5s, y `power2.inOut`), fade tại mép tile Portal.
