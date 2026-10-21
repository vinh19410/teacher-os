import { describe, expect, it } from "vitest";
import type { EssayAnnotation } from "../contracts";
import { segmentEssay, snapSpanToWords } from "./essay-annotations";
import { essayToPlain, plainToRaw, rawToPlain } from "./essay-plain";

describe("essayToPlain — fast path (plain text identity)", () => {
	it.each([
		[""],
		["Living in a city has many benefits.\nFirst, jobs are plentiful."],
		["Line 1\r\nLine 2\r\n\tIndented  with  double  spaces."],
		["a < b && c > d"],
		["if a<b and c>d then x <i and y> z"],
		["I <3 coding & writing"],
		["<notatag> still plain </notatag>"],
	])("giữ nguyên từng byte với essay plain: %j", (raw) => {
		const view = essayToPlain(raw);
		expect(view.text).toBe(raw);
		expect(view.rawStart).toBeNull();
		expect(view.rawEnd).toBeNull();
		expect(view.rawLength).toBe(raw.length);
		if (raw.length >= 5) {
			expect(plainToRaw(view, 1, 5)).toEqual({ start: 1, end: 5 });
			expect(rawToPlain(view, 1, 5)).toEqual({ start: 1, end: 5 });
		}
	});
});

describe("essayToPlain — HTML tags, entities, and whitespace", () => {
	it("chuyển các thẻ <p> kế tiếp thành đoạn ngăn cách bằng \\n", () => {
		const raw = "<p>First paragraph.</p><p>Second paragraph.</p>";
		const view = essayToPlain(raw);
		expect(view.text).toBe("First paragraph.\nSecond paragraph.");
	});

	it("ngắt dòng khi gặp thẻ khối mở sau văn bản trần (Intro<p>Para</p>)", () => {
		const view = essayToPlain("Intro<p>Para</p>");
		expect(view.text).toBe("Intro\nPara");
	});

	it("xử lý đúng thẻ khối rỗng ở đầu và ở giữa (<p></p><p>Bc</p>)", () => {
		expect(essayToPlain("<p></p><p>Bc</p>").text).toBe("Bc");
		expect(essayToPlain("<p>A</p><p></p><p>B</p>").text).toBe("A\nB");
		expect(essayToPlain("<p></p>").text).toBe("");
	});

	it("bỏ whitespace ASCII thụt lề đầu bài và giữa hai thẻ khối", () => {
		expect(essayToPlain("<p>\n  Hello</p>").text).toBe("Hello");
		expect(essayToPlain("<p>A</p>\n  \t <p>B</p>\n").text).toBe("A\nB");
	});

	it("chuyển <br> và <br/> thành \\n", () => {
		const view = essayToPlain("<p>Line 1<br>Line 2<br />Line 3</p>");
		expect(view.text).toBe("Line 1\nLine 2\nLine 3");
	});

	it("bỏ thẻ inline, thẻ lạ, nhưng giữ nguyên dấu < trần không phải thẻ", () => {
		expect(
			essayToPlain(
				"<p>Remote <strong>learning</strong> has <em>widened</em> the gap.</p>",
			).text,
		).toBe("Remote learning has widened the gap.");
		expect(essayToPlain("<p>Score <3 and <o:p>word</o:p></p>").text).toBe(
			"Score <3 and word",
		);
	});

	it("giải mã named entities, numeric dec/hex, và giữ nguyên entity không hợp lệ", () => {
		const raw =
			"<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39; &apos;G&apos; H&nbsp;I &#65; &#x42; &mdash; &rsquo;</p>";
		expect(essayToPlain(raw).text).toBe(
			"A & B < C > D \"E\" 'F' 'G' H\u00a0I A B \u2014 \u2019",
		);
		expect(
			essayToPlain("<p>a &#99999999; &#0; &#xD800; &unknown; b</p>").text,
		).toBe("a &#99999999; &#0; &#xD800; &unknown; b");
	});

	it("bỏ hoàn toàn <script>, <style> và HTML comments", () => {
		const raw =
			"<p>Safe</p><!-- hidden --><script>alert(1)</script><style>body{color:red}</style><p>Text</p>";
		expect(essayToPlain(raw).text).toBe("Safe\nText");
	});
});

describe("plainToRaw ↔ rawToPlain symmetry & edge cases", () => {
	it("ánh xạ đối xứng đoạn chứa entity (&amp;) và ký tự thường", () => {
		const raw = "<p>A</p><p>B &amp; C</p>";
		const view = essayToPlain(raw);
		expect(view.text).toBe("A\nB & C");

		// "B & C" trên plain = 2..7 → raw = 11..20 ("B &amp; C")
		const rawSpan = plainToRaw(view, 2, 7);
		expect(rawSpan).toEqual({ start: 11, end: 20 });
		expect(raw.slice(11, 20)).toBe("B &amp; C");
		expect(rawToPlain(view, 11, 20)).toEqual({ start: 2, end: 7 });

		// Riêng ký tự "&" trên plain = 4..5 → raw = 13..18 ("&amp;")
		const ampRaw = plainToRaw(view, 4, 5);
		expect(ampRaw).toEqual({ start: 13, end: 18 });
		expect(raw.slice(13, 18)).toBe("&amp;");
		expect(rawToPlain(view, 13, 18)).toEqual({ start: 4, end: 5 });
	});

	it("ánh xạ đối xứng từ nằm trong thẻ inline <strong>learning</strong>", () => {
		const raw = "<p>Remote <strong>learning</strong> gap</p>";
		const view = essayToPlain(raw);
		expect(view.text).toBe("Remote learning gap");
		const plainStart = view.text.indexOf("learning");
		const plainEnd = plainStart + "learning".length;
		const rawSpan = plainToRaw(view, plainStart, plainEnd);
		expect(rawSpan).not.toBeNull();
		if (!rawSpan) return;
		expect(raw.slice(rawSpan.start, rawSpan.end)).toBe("learning");
		expect(rawToPlain(view, rawSpan.start, rawSpan.end)).toEqual({
			start: plainStart,
			end: plainEnd,
		});
	});

	it("chuẩn hoá span cắt ngang cặp surrogate của astral entity (&#x1F600;)", () => {
		const raw = "<p>a &#x1F600; b</p>";
		const view = essayToPlain(raw);
		expect(view.text).toBe("a \u{1F600} b");
		expect(view.text.length).toBe(6);

		// Cắt nửa đầu surrogate (2..3) hoặc nửa sau (3..4) đều phủ trọn entity
		// và khi rawToPlain chuẩn hoá về cả cặp 2..4.
		const half1 = plainToRaw(view, 2, 3);
		expect(half1).not.toBeNull();
		if (!half1) return;
		expect(raw.slice(half1.start, half1.end)).toBe("&#x1F600;");
		expect(rawToPlain(view, half1.start, half1.end)).toEqual({
			start: 2,
			end: 4,
		});

		const half2 = plainToRaw(view, 3, 4);
		expect(half2).toEqual(half1);
		if (!half2) return;
		expect(rawToPlain(view, half2.start, half2.end)).toEqual({
			start: 2,
			end: 4,
		});
	});

	it("trả null cho span nằm trọn trong thẻ HTML hoặc ngoài biên", () => {
		const raw = "<p>Hello</p>";
		const view = essayToPlain(raw);
		expect(rawToPlain(view, 0, 3)).toBeNull();
		expect(rawToPlain(view, 8, 12)).toBeNull();
		expect(rawToPlain(view, -1, 5)).toBeNull();
		expect(rawToPlain(view, 5, 5)).toBeNull();
		expect(rawToPlain(view, 0, 99)).toBeNull();

		expect(plainToRaw(view, -1, 2)).toBeNull();
		expect(plainToRaw(view, 2, 2)).toBeNull();
		expect(plainToRaw(view, 0, 99)).toBeNull();
	});

	it("tích hợp snapSpanToWords + segmentEssay khớp từ đã chọn", () => {
		const raw =
			"<p>Remote learning has widened the gap between rich &amp; poor students.</p>";
		const view = essayToPlain(raw);
		const needle = view.text.indexOf("learn");
		const snapped = snapSpanToWords(view.text, needle, needle + 5);
		expect(snapped).not.toBeNull();
		if (!snapped) return;
		const rawSpan = plainToRaw(view, snapped.start, snapped.end);
		expect(rawSpan).not.toBeNull();
		if (!rawSpan) return;
		expect(raw.slice(rawSpan.start, rawSpan.end)).toBe("learning");

		const plainSpan = rawToPlain(view, rawSpan.start, rawSpan.end);
		expect(plainSpan).not.toBeNull();
		if (!plainSpan) return;
		const ann: EssayAnnotation = {
			id: "ann-1",
			start: plainSpan.start,
			end: plainSpan.end,
			note: "Good gerund",
		};
		const segments = segmentEssay(view.text, [ann]);
		const highlighted = segments.find((s) => s.annotation !== null);
		expect(highlighted?.text).toBe("learning");
	});
});
