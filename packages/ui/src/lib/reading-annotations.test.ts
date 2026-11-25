import {
	applyHighlightSpan,
	buildPassageModel,
	computeLastSegmentEndById,
	getPassageExcerpt,
	hashPassage,
	isHtmlRichText,
	isValidReadingAnnotationId,
	normalizeReadingAnnotations,
	type PassageAstNode,
	type PassageTextLeaf,
	READING_ANNOTATION_MAX_ITEMS,
	READING_ANNOTATION_NOTE_MAX,
	READING_TABLE_SPAN_MAX,
	type ReadingAnnotation,
	readDomSelectionRange,
	removeHighlightRange,
	sanitizeReadingHref,
	snapPassageSpan,
	splitLeafByAnnotations,
	upsertNoteSpan,
} from "@teacher-os/ui/lib/reading-annotations";
import { afterEach, describe, expect, it, vi } from "vitest";

function collectLeaves(nodes: readonly PassageAstNode[]): PassageTextLeaf[] {
	const out: PassageTextLeaf[] = [];
	const walk = (list: readonly PassageAstNode[]) => {
		for (const node of list) {
			if (node.kind === "text") {
				out.push(node);
			} else {
				walk(node.children);
			}
		}
	};
	walk(nodes);
	return out;
}

function makeIdFactory(prefix = "hl"): () => string {
	let seq = 0;
	return () => {
		seq += 1;
		return `${prefix}-${seq}`;
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("isHtmlRichText & hashPassage", () => {
	it("distinguishes plain text, comparisons, HTML tags, void tags, and entities", () => {
		expect(isHtmlRichText("Simple reading passage.")).toBe(false);
		expect(isHtmlRichText("If a < b and c > d then x")).toBe(false);
		expect(isHtmlRichText("a<b>c")).toBe(false);
		expect(isHtmlRichText("<p>Hello world</p>")).toBe(true);
		expect(isHtmlRichText("Line 1<br>Line 2")).toBe(true);
		expect(isHtmlRichText("Tea &amp; Coffee")).toBe(true);
	});

	it("produces deterministic FNV-1a hex hash that changes when passage changes", () => {
		const a = hashPassage("<p>The History of Tea</p>");
		const b = hashPassage("<p>The History of Tea</p>");
		const c = hashPassage("<p>The History of Tea.</p>");
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{8}$/);
		expect(a).not.toBe(c);
	});
});

describe("sanitizeReadingHref & isValidReadingAnnotationId", () => {
	it("allows safe protocols and relative paths while rejecting dangerous schemes and protocol-relative URLs", () => {
		expect(sanitizeReadingHref("https://ielts.org/reading")).toBe(
			"https://ielts.org/reading",
		);
		expect(sanitizeReadingHref("http://example.com")).toBe(
			"http://example.com",
		);
		expect(sanitizeReadingHref("mailto:teacher@example.com")).toBe(
			"mailto:teacher@example.com",
		);
		expect(sanitizeReadingHref("tel:+84123456789")).toBe("tel:+84123456789");
		expect(sanitizeReadingHref("/docs/guide")).toBe("/docs/guide");
		expect(sanitizeReadingHref("javascript:alert(1)")).toBeUndefined();
		expect(sanitizeReadingHref("  java\tscript:alert(1)")).toBeUndefined();
		expect(
			sanitizeReadingHref("data:text/html,<script>1</script>"),
		).toBeUndefined();
		expect(sanitizeReadingHref("ftp://evil.example/a")).toBeUndefined();
		expect(sanitizeReadingHref("//phishing.example/login")).toBeUndefined();
		expect(sanitizeReadingHref("/\\phishing.example/login")).toBeUndefined();
		expect(sanitizeReadingHref("\\\\phishing.example/login")).toBeUndefined();
		expect(sanitizeReadingHref("\\/phishing.example/login")).toBeUndefined();
		expect(sanitizeReadingHref("https://example.com/\x00evil")).toBeUndefined();
		expect(sanitizeReadingHref("https://example.com/\nevil")).toBeUndefined();
		expect(sanitizeReadingHref("")).toBeUndefined();
		expect(sanitizeReadingHref(null)).toBeUndefined();
	});

	it("validates annotation ids against allowlist and blocks prototype/selector payloads", () => {
		expect(isValidReadingAnnotationId("hl_1-abc")).toBe(true);
		expect(isValidReadingAnnotationId("")).toBe(false);
		expect(isValidReadingAnnotationId("a".repeat(65))).toBe(false);
		expect(isValidReadingAnnotationId('a"], button[type="submit')).toBe(false);
		expect(isValidReadingAnnotationId("__proto__")).toBe(false);
		expect(isValidReadingAnnotationId("constructor")).toBe(false);
		expect(isValidReadingAnnotationId("prototype")).toBe(false);
	});
});

describe("buildPassageModel", () => {
	it("parses sanitized HTML into an AST with contiguous leaves matching canonicalText and strips XSS", () => {
		const html =
			'<script>alert(1)</script><p onclick="evil()">Tea <strong>originated</strong> in <a href="https://example.com">China</a> and <a href="javascript:alert(1)">bad</a> and <a href="//evil.example">rel</a>.</p><p>Second paragraph.</p>';
		const model = buildPassageModel(html);

		expect(model.isHtml).toBe(true);
		const leaves = collectLeaves(model.nodes);
		expect(leaves.map((l) => l.text).join("")).toBe(model.canonicalText);
		expect(model.canonicalText).not.toContain("alert");
		expect(model.canonicalText).toBe(
			"Tea originated in China and bad and rel.Second paragraph.",
		);

		// First paragraph block break sits right before "Second paragraph."
		const secondIdx = model.canonicalText.indexOf("Second");
		expect(model.blockBreakOffsets.has(secondIdx)).toBe(true);

		// Verify <a> attributes: safe link keeps href/target/rel; unsafe links drop href
		const firstP = model.nodes[0];
		expect(firstP?.kind).toBe("element");
		if (firstP?.kind === "element") {
			const anchors = firstP.children.filter(
				(c) => c.kind === "element" && c.tag === "a",
			);
			expect(anchors).toHaveLength(3);
			expect(anchors[0]?.kind === "element" && anchors[0].attrs?.href).toBe(
				"https://example.com",
			);
			expect(anchors[0]?.kind === "element" && anchors[0].attrs?.target).toBe(
				"_blank",
			);
			expect(anchors[0]?.kind === "element" && anchors[0].attrs?.rel).toBe(
				"noopener noreferrer",
			);
			expect(
				anchors[1]?.kind === "element" && anchors[1].attrs?.href,
			).toBeUndefined();
			expect(
				anchors[2]?.kind === "element" && anchors[2].attrs?.href,
			).toBeUndefined();
		}
	});

	it("strips formatting whitespace inside structural table/list containers and caps colspan/rowspan", () => {
		const html = `
			<table>
				<tbody>
					<tr>
						<td colspan="2" rowspan="1000000">A</td>
						<td colspan="0" rowspan="3">B</td>
					</tr>
				</tbody>
			</table>
			<ul>
				<li>One</li>
				<li>Two</li>
			</ul>
		`;
		const model = buildPassageModel(html);
		const leaves = collectLeaves(model.nodes);
		expect(leaves.map((l) => l.text).join("")).toBe(model.canonicalText);
		expect(model.canonicalText).toBe("ABOneTwo");

		const tableNode = model.nodes.find(
			(n) => n.kind === "element" && n.tag === "table",
		);
		expect(tableNode?.kind).toBe("element");
		if (tableNode?.kind === "element") {
			const tbody = tableNode.children[0];
			expect(tbody?.kind === "element" && tbody.tag).toBe("tbody");
			if (tbody?.kind === "element") {
				const tr = tbody.children[0];
				expect(tr?.kind === "element" && tr.tag).toBe("tr");
				if (tr?.kind === "element") {
					// No whitespace text nodes inside tr
					expect(tr.children.every((c) => c.kind === "element")).toBe(true);
					const td1 = tr.children[0];
					const td2 = tr.children[1];
					if (td1?.kind === "element" && td2?.kind === "element") {
						expect(td1.attrs?.colSpan).toBe(2);
						expect(td1.attrs?.rowSpan).toBe(READING_TABLE_SPAN_MAX);
						expect(td2.attrs?.colSpan).toBeUndefined();
						expect(td2.attrs?.rowSpan).toBe(3);
					}
				}
			}
		}
	});

	it("records block breaks at <br> and falls back safely for plain text or missing DOM", () => {
		const brModel = buildPassageModel("<p>Alpha<br>Beta</p>");
		expect(brModel.canonicalText).toBe("AlphaBeta");
		expect(brModel.blockBreakOffsets.has(5)).toBe(true);

		const plainModel = buildPassageModel("Line 1\nLine 2");
		expect(plainModel.isHtml).toBe(false);
		expect(plainModel.canonicalText).toBe("Line 1\nLine 2");
		expect(collectLeaves(plainModel.nodes)).toHaveLength(1);

		vi.stubGlobal("document", undefined);
		const noDocModel = buildPassageModel("<p>No doc</p>");
		expect(noDocModel.isHtml).toBe(false);
		expect(noDocModel.canonicalText).toBe("<p>No doc</p>");
	});
});

describe("snapPassageSpan & getPassageExcerpt", () => {
	it("snaps to word boundaries for English and Vietnamese without crossing blockBreakOffsets", () => {
		const model = buildPassageModel("<p>Học sinh giỏi</p><p>bắt đầu học</p>");
		// canonicalText: "Học sinh giỏibắt đầu học" with block break at index 13 ("giỏi" | "bắt")
		const breakIdx = model.canonicalText.indexOf("bắt");
		expect(model.blockBreakOffsets.has(breakIdx)).toBe(true);

		// Selecting inside "giỏi" stops at block break, never merges into "bắt"
		const snapped1 = snapPassageSpan(model, 10, 12);
		expect(snapped1).toEqual({ start: 9, end: 13 });
		if (snapped1) {
			expect(model.canonicalText.slice(snapped1.start, snapped1.end)).toBe(
				"giỏi",
			);
		}

		// Selecting inside "bắt" stops at block break on the left
		const snapped2 = snapPassageSpan(model, 14, 15);
		expect(snapped2).toEqual({ start: 13, end: 16 });
		if (snapped2) {
			expect(model.canonicalText.slice(snapped2.start, snapped2.end)).toBe(
				"bắt",
			);
		}

		// Whitespace-only selection returns null
		expect(snapPassageSpan(model, 3, 4)).toBeNull();

		// Vietnamese NFD combining marks snap cleanly without splitting diacritics
		const nfdWord = "giỏi".normalize("NFD");
		const nfdModel = buildPassageModel(`<p>Học ${nfdWord}</p><p>bắt đầu</p>`);
		const wordStart = nfdModel.canonicalText.indexOf(nfdWord);
		const snappedNfd = snapPassageSpan(nfdModel, wordStart + 1, wordStart + 3);
		expect(snappedNfd).toEqual({
			start: wordStart,
			end: wordStart + nfdWord.length,
		});
		if (snappedNfd) {
			expect(
				nfdModel.canonicalText.slice(snappedNfd.start, snappedNfd.end),
			).toBe(nfdWord);
		}
	});

	it("inserts spaces across block breaks in excerpt and truncates with ellipsis", () => {
		const model = buildPassageModel("<p>Tea</p><p>begins here today</p>");
		expect(getPassageExcerpt(model, 0, model.canonicalText.length, 100)).toBe(
			"Tea begins here today",
		);
		expect(getPassageExcerpt(model, 0, model.canonicalText.length, 10)).toBe(
			"Tea begins…",
		);
	});
});

describe("interval algebra & normalization", () => {
	it("filters malformed offsets, unsafe ids, overlaps, caps note length and max item count", () => {
		const raw: ReadingAnnotation[] = [
			{
				id: "ok-2",
				start: 20,
				end: 30,
				note: "b".repeat(READING_ANNOTATION_NOTE_MAX + 50),
			},
			{ id: "ok-1", start: 5, end: 15, note: "first" },
			{ id: "ok-1", start: 40, end: 45, note: "duplicate-id" },
			{ id: "overlap", start: 10, end: 25, note: "drops" },
			{ id: "bad-nan", start: Number.NaN, end: 5, note: "" },
			{ id: "bad-float", start: 1.5, end: 4, note: "" },
			{ id: "bad-oob", start: 0, end: 101, note: "" },
			{ id: "__proto__", start: 50, end: 55, note: "" },
			{ id: 'bad"id', start: 60, end: 65, note: "" },
		];
		const out = normalizeReadingAnnotations(raw, 100);
		expect(out.map((a) => a.id)).toEqual(["ok-1", "ok-2"]);
		expect(out[1]?.note.length).toBe(READING_ANNOTATION_NOTE_MAX);

		const many: ReadingAnnotation[] = Array.from(
			{ length: READING_ANNOTATION_MAX_ITEMS + 20 },
			(_, i) => ({
				id: `id-${i}`,
				start: i * 2,
				end: i * 2 + 1,
				note: "",
			}),
		);
		expect(normalizeReadingAnnotations(many, 1000)).toHaveLength(
			READING_ANNOTATION_MAX_ITEMS,
		);
	});

	it("applyHighlightSpan merges note-less highlights, expands single enclosed note, and fills gaps around notes", () => {
		const nextId = makeIdFactory("hl");
		let list = applyHighlightSpan([], 10, 20, nextId);
		list = applyHighlightSpan(list, 30, 40, nextId);
		// Bridge both plain highlights -> single merged span [10, 40]
		list = applyHighlightSpan(list, 15, 35, nextId);
		expect(list).toEqual([{ id: "hl-1", start: 10, end: 40, note: "" }]);

		// Single enclosed noted highlight -> expands while keeping its id & note
		const noted: ReadingAnnotation[] = [
			{ id: "n-1", start: 20, end: 30, note: "important" },
		];
		const expanded = applyHighlightSpan(noted, 15, 35, nextId);
		expect(expanded).toEqual([
			{ id: "n-1", start: 15, end: 35, note: "important" },
		]);

		// Partial overlap with a noted highlight -> preserves noted span intact, highlights uncovered gap
		const partial = applyHighlightSpan(noted, 25, 45, nextId);
		expect(partial).toEqual([
			{ id: "n-1", start: 20, end: 30, note: "important" },
			{ id: "hl-3", start: 30, end: 45, note: "" },
		]);
	});

	it("upsertNoteSpan handles empty range, id update, carving plain highlights, single-note update, and multi-note conflict", () => {
		const nextId = makeIdFactory("nt");
		// Empty region -> create new
		const r1 = upsertNoteSpan([], { start: 10, end: 20 }, "Note A", nextId);
		expect(r1.ok).toBe(true);
		expect(r1.items).toEqual([
			{ id: "nt-1", start: 10, end: 20, note: "Note A" },
		]);

		// Update by id
		const r2 = upsertNoteSpan(r1.items, { id: "nt-1" }, "Note A2", nextId);
		expect(r2.ok).toBe(true);
		expect(r2.items).toEqual([
			{ id: "nt-1", start: 10, end: 20, note: "Note A2" },
		]);

		// Partial overlap with note-less highlight -> carves plain highlight around new note span
		const plain: ReadingAnnotation[] = [
			{ id: "p-1", start: 5, end: 30, note: "" },
		];
		const r3 = upsertNoteSpan(plain, { start: 10, end: 20 }, "Inside", nextId);
		expect(r3.ok).toBe(true);
		expect(r3.items).toEqual([
			{ id: "p-1", start: 5, end: 10, note: "" },
			{ id: "nt-2", start: 10, end: 20, note: "Inside" },
			{ id: "nt-3", start: 20, end: 30, note: "" },
		]);

		// Touching single noted highlight -> updates & expands to cover union without losing note
		const r4 = upsertNoteSpan(
			[{ id: "n-1", start: 10, end: 20, note: "Old" }],
			{ start: 15, end: 25 },
			"Updated",
			nextId,
		);
		expect(r4.ok).toBe(true);
		expect(r4.items).toEqual([
			{ id: "n-1", start: 10, end: 25, note: "Updated" },
		]);

		// Spanning >= 2 noted highlights -> returns conflict instead of silently dropping
		const twoNotes: ReadingAnnotation[] = [
			{ id: "n-1", start: 0, end: 10, note: "First" },
			{ id: "n-2", start: 20, end: 30, note: "Second" },
		];
		const r5 = upsertNoteSpan(
			twoNotes,
			{ start: 5, end: 25 },
			"Conflict",
			nextId,
		);
		expect(r5.ok).toBe(false);
		if (!r5.ok) {
			expect(r5.reason).toBe("multiple_notes_overlap");
			expect(r5.items).toEqual(twoNotes);
		}
	});

	it("removeHighlightRange removes full spans, trims edges, and splits middle", () => {
		const nextId = makeIdFactory("rm");
		const base: ReadingAnnotation[] = [
			{ id: "h-1", start: 10, end: 50, note: "keep-on-left" },
		];
		const split = removeHighlightRange(base, 20, 30, nextId);
		expect(split).toEqual([
			{ id: "h-1", start: 10, end: 20, note: "keep-on-left" },
			{ id: "rm-1", start: 30, end: 50, note: "" },
		]);

		const trimmed = removeHighlightRange(split, 15, 35, nextId);
		expect(trimmed).toEqual([
			{ id: "h-1", start: 10, end: 15, note: "keep-on-left" },
			{ id: "rm-1", start: 35, end: 50, note: "" },
		]);

		const emptied = removeHighlightRange(trimmed, 0, 60, nextId);
		expect(emptied).toEqual([]);

		// Negative start bounds are rejected safely across mutation helpers
		expect(applyHighlightSpan(base, -5, 20, nextId)).toEqual(base);
		expect(removeHighlightRange(base, -5, 20, nextId)).toEqual(base);
		const invalidNote = upsertNoteSpan(
			base,
			{ start: -5, end: 20 },
			"Bad",
			nextId,
		);
		expect(invalidNote.ok).toBe(false);
		if (!invalidNote.ok) {
			expect(invalidNote.reason).toBe("invalid_span");
		}
	});

	it("splitLeafByAnnotations marks isLastSegment accurately using Map", () => {
		const model = buildPassageModel("<p>Hello <strong>world</strong>!</p>");
		const annotations: ReadingAnnotation[] = [
			{ id: "hl-1", start: 0, end: 11, note: "cross-tag" },
		];
		const lastEnds = computeLastSegmentEndById(model.nodes, annotations);
		expect(lastEnds.get("hl-1")).toBe(11);

		const leaves = collectLeaves(model.nodes);
		const [leaf0, leaf1] = leaves;
		expect(leaf0).toBeDefined();
		expect(leaf1).toBeDefined();
		if (!leaf0 || !leaf1) return;
		// Leaf 0: "Hello " [0, 6), Leaf 1: "world" [6, 11), Leaf 2: "!" [11, 12)
		const slices0 = splitLeafByAnnotations(leaf0, annotations, lastEnds);
		const slices1 = splitLeafByAnnotations(leaf1, annotations, lastEnds);
		expect(slices0).toEqual([
			{
				start: 0,
				end: 6,
				text: "Hello ",
				annotation: annotations[0],
				isLastSegment: false,
			},
		]);
		expect(slices1).toEqual([
			{
				start: 6,
				end: 11,
				text: "world",
				annotation: annotations[0],
				isLastSegment: true,
			},
		]);
	});
});

describe("readDomSelectionRange", () => {
	it("maps single-node, cross-tag, cross-paragraph, note-icon, and ELEMENT_NODE boundary ranges accurately", () => {
		const html =
			"<p>Tea <strong>originated</strong> in China.</p><p>Next line.</p>";
		const model = buildPassageModel(html);

		const root = document.createElement("div");
		root.innerHTML =
			'<p>Tea <mark data-highlight-id="h1"><strong>originated</strong></mark><button type="button" data-reading-ui="true"><svg></svg></button> in China.</p><p>Next line.</p>';
		document.body.appendChild(root);

		try {
			const [p1, p2] = Array.from(root.querySelectorAll("p"));
			const teaText = p1?.firstChild; // "Tea "
			const nextText = p2?.firstChild; // "Next line."
			if (!p1 || !p2 || !teaText || !nextText) {
				throw new Error("Unexpected DOM structure in test");
			}

			// Cross-tag + across data-reading-ui button + cross-paragraph
			const r1 = document.createRange();
			r1.setStart(teaText, 0);
			r1.setEnd(nextText, 4);
			expect(readDomSelectionRange(root, r1, model)).toEqual({
				start: 0,
				end: model.canonicalText.indexOf("Next") + 4,
			});

			// ELEMENT_NODE boundary (e.g. triple-click selecting entire first <p> via root offsets 0..1)
			const r2 = document.createRange();
			r2.setStart(root, 0);
			r2.setEnd(root, 1);
			expect(readDomSelectionRange(root, r2, model)).toEqual({
				start: 0,
				end: model.canonicalText.indexOf("Next"),
			});

			// ELEMENT_NODE boundary at end of root (offset === childNodes.length)
			const r3 = document.createRange();
			r3.setStart(p2, 0);
			r3.setEnd(root, root.childNodes.length);
			expect(readDomSelectionRange(root, r3, model)).toEqual({
				start: model.canonicalText.indexOf("Next"),
				end: model.canonicalText.length,
			});

			// Selection outside root returns null
			const outside = document.createElement("p");
			outside.textContent = "Outside";
			document.body.appendChild(outside);
			const outsideText = outside.firstChild;
			if (!outsideText) throw new Error("Missing outside text node");
			const rOut = document.createRange();
			rOut.setStart(outsideText, 0);
			rOut.setEnd(outsideText, 4);
			expect(readDomSelectionRange(root, rOut, model)).toBeNull();
			outside.remove();

			// Selection touching data-reading-ui button returns null
			const btn = root.querySelector("[data-reading-ui]");
			if (!btn) throw new Error("Missing data-reading-ui button");
			const rUi = document.createRange();
			rUi.setStart(btn, 0);
			rUi.setEnd(btn, 1);
			expect(readDomSelectionRange(root, rUi, model)).toBeNull();
		} finally {
			root.remove();
		}
	});
});
