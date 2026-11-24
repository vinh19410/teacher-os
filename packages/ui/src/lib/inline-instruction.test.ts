// @vitest-environment jsdom
/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	formatInlineBankOptionLabel,
	type InlineHtmlNode,
	type InlineQuestionRef,
	mapInlineMarkersToQuestions,
	parseInlineInstruction,
} from "./inline-instruction";

function makeQuestions(count: number, startNumber = 1): InlineQuestionRef[] {
	return Array.from({ length: count }, (_, idx) => ({
		q: startNumber - 1 + idx,
		number: startNumber + idx,
	}));
}

function collectSlots(
	nodes: readonly InlineHtmlNode[],
): Array<{ q: number; number: number; markerNumber: number }> {
	const slots: Array<{ q: number; number: number; markerNumber: number }> = [];
	for (const node of nodes) {
		if (node.kind === "slot") {
			slots.push({
				q: node.question.q,
				number: node.question.number,
				markerNumber: node.markerNumber,
			});
		} else if (node.kind === "element") {
			slots.push(...collectSlots(node.children));
		}
	}
	return slots;
}

function collectElements(
	nodes: readonly InlineHtmlNode[],
): Array<Extract<InlineHtmlNode, { kind: "element" }>> {
	const elements: Array<Extract<InlineHtmlNode, { kind: "element" }>> = [];
	for (const node of nodes) {
		if (node.kind === "element") {
			elements.push(node);
			elements.push(...collectElements(node.children));
		}
	}
	return elements;
}

function collectText(nodes: readonly InlineHtmlNode[]): string {
	let out = "";
	for (const node of nodes) {
		if (node.kind === "text") {
			out += node.text;
		} else if (node.kind === "element") {
			out += collectText(node.children);
		}
	}
	return out;
}

describe("parseInlineInstruction", () => {
	it("parses exact strong(N) markers inside table and bullet lists", () => {
		const html = `
			<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p>
			<table>
				<tbody>
					<tr>
						<td>
							<h3><strong>History of US recording technology</strong></h3>
							<ul>
								<li><p>Popular music began with instruments made of <strong>(1)</strong> that were used outdoors.</p></li>
								<li><p>People liked to sing while watching <strong>(2)</strong> events.</p></li>
								<li><p>The <strong>(3)</strong> of publishers Witmark and Mills were located there.</p></li>
							</ul>
						</td>
					</tr>
				</tbody>
			</table>
		`;
		const questions = makeQuestions(3);
		const parsed = parseInlineInstruction(html, questions);

		expect(parsed).not.toBeNull();
		expect(parsed?.isHtml).toBe(true);
		expect([...(parsed?.boundQuestionQs ?? [])]).toEqual([0, 1, 2]);
		expect(collectSlots(parsed?.nodes ?? [])).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 1, number: 2, markerNumber: 2 },
			{ q: 2, number: 3, markerNumber: 3 },
		]);

		const tags = collectElements(parsed?.nodes ?? []).map((el) => el.tag);
		expect(tags).toContain("table");
		expect(tags).toContain("ul");
		expect(tags).toContain("li");
		expect(tags).toContain("h3");
	});

	it("parses bracketed [N] markers in both plain text and HTML paragraphs", () => {
		const questions = makeQuestions(2);

		const plainParsed = parseInlineInstruction(
			"Name: [1]\nDestination: [2]",
			questions,
		);
		expect(plainParsed).not.toBeNull();
		expect(plainParsed?.isHtml).toBe(false);
		expect([...(plainParsed?.boundQuestionQs ?? [])]).toEqual([0, 1]);
		expect(plainParsed?.nodes).toEqual([
			{ kind: "text", text: "Name: " },
			{ kind: "slot", question: { q: 0, number: 1 }, markerNumber: 1 },
			{ kind: "text", text: "\nDestination: " },
			{ kind: "slot", question: { q: 1, number: 2 }, markerNumber: 2 },
		]);

		const htmlParsed = parseInlineInstruction(
			"<p>First blank [1] and second blank [2].</p>",
			questions,
		);
		expect(htmlParsed).not.toBeNull();
		expect(htmlParsed?.isHtml).toBe(true);
		expect([...(htmlParsed?.boundQuestionQs ?? [])]).toEqual([0, 1]);
		expect(collectSlots(htmlParsed?.nodes ?? [])).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 1, number: 2, markerNumber: 2 },
		]);
	});

	it("detects leaf strong(N) markers nested inside outer strong elements", () => {
		const questions = makeQuestions(2);

		const wrappedWithText = parseInlineInstruction(
			"<p><strong>Text <strong>(1)</strong> end</strong> and <strong><strong>(2)</strong></strong></p>",
			questions,
		);
		expect(wrappedWithText).not.toBeNull();
		expect([...(wrappedWithText?.boundQuestionQs ?? [])]).toEqual([0, 1]);
		expect(collectSlots(wrappedWithText?.nodes ?? [])).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 1, number: 2, markerNumber: 2 },
		]);
		expect(collectText(wrappedWithText?.nodes ?? [])).toBe("Text  end and ");

		const singleNested = parseInlineInstruction(
			"<p><strong><strong>(1)</strong></strong></p>",
			makeQuestions(1),
		);
		expect(singleNested).not.toBeNull();
		expect(collectSlots(singleNested?.nodes ?? [])).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
		]);
	});

	it("supports IELTS Section 2-4 positive numbering offsets", () => {
		// Section 2: (11)..(20) mapped to local questions 1..10
		const s2Html = Array.from(
			{ length: 10 },
			(_, idx) => `<p>Item <strong>(${idx + 11})</strong></p>`,
		).join("");
		const s2Parsed = parseInlineInstruction(s2Html, makeQuestions(10, 1));
		expect(s2Parsed).not.toBeNull();
		expect(s2Parsed?.boundQuestionQs.size).toBe(10);
		expect(collectSlots(s2Parsed?.nodes ?? [])).toEqual(
			Array.from({ length: 10 }, (_, idx) => ({
				q: idx,
				number: idx + 1,
				markerNumber: idx + 11,
			})),
		);

		// Section 3 second group: (26)..(30) mapped to local questions 6..10
		const s3Html = Array.from(
			{ length: 5 },
			(_, idx) => `<p>Step <strong>(${idx + 26})</strong></p>`,
		).join("");
		const s3Parsed = parseInlineInstruction(s3Html, makeQuestions(5, 6));
		expect(s3Parsed).not.toBeNull();
		expect(s3Parsed?.boundQuestionQs.size).toBe(5);
		expect(collectSlots(s3Parsed?.nodes ?? [])).toEqual(
			Array.from({ length: 5 }, (_, idx) => ({
				q: 5 + idx,
				number: 6 + idx,
				markerNumber: 26 + idx,
			})),
		);

		// Single-question Section 2 group with one unambiguous marker (11)
		const singleOffset = parseInlineInstruction(
			"<p>Location: <strong>(11)</strong></p>",
			makeQuestions(1, 1),
		);
		expect(singleOffset).not.toBeNull();
		expect(collectSlots(singleOffset?.nodes ?? [])).toEqual([
			{ q: 0, number: 1, markerNumber: 11 },
		]);

		// Single-question group with multiple offset markers is ambiguous -> reject
		const ambiguousSingle = parseInlineInstruction(
			"<p>Locations: <strong>(11)</strong> and <strong>(12)</strong></p>",
			makeQuestions(1, 1),
		);
		expect(ambiguousSingle).toBeNull();
	});

	it("handles duplicate markers without emitting duplicate slots", () => {
		// Leading stray [2] before [1], [2], [3]
		const leadingDup = parseInlineInstruction(
			"<table><thead><tr><th><strong>(2)</strong></th></tr></thead><tbody><tr><td><strong>(1)</strong></td><td><strong>(2)</strong></td><td><strong>(3)</strong></td></tr></tbody></table>",
			makeQuestions(3),
		);
		expect(leadingDup).not.toBeNull();
		const leadingSlots = collectSlots(leadingDup?.nodes ?? []);
		expect(leadingSlots).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 1, number: 2, markerNumber: 2 },
			{ q: 2, number: 3, markerNumber: 3 },
		]);
		expect(leadingSlots.length).toBe(leadingDup?.boundQuestionQs.size);
		// Stray leading (2) in <thead> remains normal <strong>(2)</strong> text
		expect(collectText(leadingDup?.nodes ?? [])).toContain("(2)");

		// Trailing duplicate [2] in [1, 2, 2]
		const trailingDup = parseInlineInstruction(
			"<p>First [1], second [2], repeat [2].</p>",
			makeQuestions(2),
		);
		expect(trailingDup).not.toBeNull();
		const trailingSlots = collectSlots(trailingDup?.nodes ?? []);
		expect(trailingSlots).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 1, number: 2, markerNumber: 2 },
		]);
		expect(trailingSlots.length).toBe(trailingDup?.boundQuestionQs.size);
		expect(collectText(trailingDup?.nodes ?? [])).toBe(
			"First , second , repeat [2].",
		);
	});

	it("handles out-of-order 2-column table layouts [1, 3, 2, 4]", () => {
		const tableHtml = `
			<table>
				<tbody>
					<tr>
						<td>Col A: <strong>(1)</strong></td>
						<td>Col B: <strong>(3)</strong></td>
					</tr>
					<tr>
						<td>Col A: <strong>(2)</strong></td>
						<td>Col B: <strong>(4)</strong></td>
					</tr>
				</tbody>
			</table>
		`;
		const parsed = parseInlineInstruction(tableHtml, makeQuestions(4));
		expect(parsed).not.toBeNull();
		expect([...(parsed?.boundQuestionQs ?? [])].sort((a, b) => a - b)).toEqual([
			0, 1, 2, 3,
		]);
		expect(collectSlots(parsed?.nodes ?? [])).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 2, number: 3, markerNumber: 3 },
			{ q: 1, number: 2, markerNumber: 2 },
			{ q: 3, number: 4, markerNumber: 4 },
		]);
	});

	it("enforces partial-match reporting and false-positive guards", () => {
		// Multi-question group with only 1 stray strong(2) -> null
		expect(
			parseInlineInstruction(
				"<p>See note <strong>(2)</strong> before answering.</p>",
				makeQuestions(3),
			),
		).toBeNull();

		// Plain un-bolded (1) and (2) in prose -> null
		expect(
			parseInlineInstruction(
				"<p>Consider points (1) and (2) carefully.</p>",
				makeQuestions(2),
			),
		).toBeNull();

		// Partial match: 3 questions, markers (1) and (2) exist -> binds q=0,1; leaves q=2 unbound
		const partial = parseInlineInstruction(
			"<p>Item <strong>(1)</strong> and item <strong>(2)</strong>.</p>",
			makeQuestions(3),
		);
		expect(partial).not.toBeNull();
		expect([...(partial?.boundQuestionQs ?? [])]).toEqual([0, 1]);
		expect(partial?.boundQuestionQs.has(2)).toBe(false);

		// Non-positive markers and years do not trigger false deltas
		expect(
			parseInlineInstruction(
				"<p>In <strong>(0)</strong> and <strong>(1995)</strong>.</p>",
				makeQuestions(2),
			),
		).toBeNull();

		// Empty input or empty questions -> null
		expect(parseInlineInstruction("   ", makeQuestions(2))).toBeNull();
		expect(parseInlineInstruction("<p>[1] [2]</p>", [])).toBeNull();
	});

	it("returns null safely when DOMParser is unavailable", () => {
		const originalDomParser = globalThis.DOMParser;
		// @ts-expect-error simulating SSR / non-DOM runtime
		globalThis.DOMParser = undefined;
		try {
			expect(
				parseInlineInstruction("<p><strong>(1)</strong></p>", makeQuestions(1)),
			).toBeNull();
		} finally {
			globalThis.DOMParser = originalDomParser;
		}
	});

	it("preserves plain-text operators and line breaks with isHtml=false", () => {
		const parsed = parseInlineInstruction(
			"Price < $50 for [1] & [2]\nSecond line",
			makeQuestions(2),
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.isHtml).toBe(false);
		expect(parsed?.nodes).toEqual([
			{ kind: "text", text: "Price < $50 for " },
			{ kind: "slot", question: { q: 0, number: 1 }, markerNumber: 1 },
			{ kind: "text", text: " & " },
			{ kind: "slot", question: { q: 1, number: 2 }, markerNumber: 2 },
			{ kind: "text", text: "\nSecond line" },
		]);
	});

	it("preserves literal angle brackets around markers in plain text without HTML parsing", () => {
		const parsed = parseInlineInstruction(
			"Check a<b [1] and c>d [2]",
			makeQuestions(2),
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.isHtml).toBe(false);
		expect([...(parsed?.boundQuestionQs ?? [])]).toEqual([0, 1]);
		expect(parsed?.nodes).toEqual([
			{ kind: "text", text: "Check a<b " },
			{ kind: "slot", question: { q: 0, number: 1 }, markerNumber: 1 },
			{ kind: "text", text: " and c>d " },
			{ kind: "slot", question: { q: 1, number: 2 }, markerNumber: 2 },
		]);
	});

	it("sanitizes XSS payloads while preserving safe links and table spans", () => {
		const dirty = `
			<script>alert(1)</script>
			<img src="x" onerror="alert(1)" />
			<h5>Subheading</h5>
			<p>
				<a href="javascript:alert(1)">bad-js</a>
				<a href="data:text/html,<script>alert(1)</script>">bad-data</a>
				<a href="vbscript:msgbox(1)">bad-vbs</a>
				<a href="https://example.com/guide" target="_self">good-link</a>
			</p>
			<table>
				<thead>
					<tr><th colspan="2" rowspan="1">Header</th></tr>
				</thead>
				<tbody>
					<tr>
						<td colspan="2" rowspan="3">A <strong>(1)</strong></td>
					</tr>
					<tr>
						<td colspan="0" rowspan="-2">B <strong>(2)</strong></td>
					</tr>
				</tbody>
			</table>
		`;
		const parsed = parseInlineInstruction(dirty, makeQuestions(2));
		expect(parsed).not.toBeNull();
		expect(collectSlots(parsed?.nodes ?? [])).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 1, number: 2, markerNumber: 2 },
		]);

		const elements = collectElements(parsed?.nodes ?? []);
		const tags = elements.map((el) => el.tag);
		expect(tags).not.toContain("script");
		expect(tags).not.toContain("img");
		expect(tags).not.toContain("h5");
		expect(collectText(parsed?.nodes ?? [])).toContain("Subheading");
		expect(collectText(parsed?.nodes ?? [])).not.toContain("alert(1)");

		const anchors = elements.filter((el) => el.tag === "a");
		const goodAnchor = anchors.find(
			(el) => collectText(el.children) === "good-link",
		);
		expect(goodAnchor?.attrs).toEqual({
			href: "https://example.com/guide",
			target: "_blank",
			rel: "noopener noreferrer",
		});

		for (const badLabel of ["bad-js", "bad-data", "bad-vbs"]) {
			const badAnchor = anchors.find(
				(el) => collectText(el.children) === badLabel,
			);
			expect(badAnchor?.attrs?.href).toBeUndefined();
		}

		const th = elements.find((el) => el.tag === "th");
		expect(th?.attrs).toEqual({ colSpan: 2, rowSpan: 1 });

		const tds = elements.filter((el) => el.tag === "td");
		expect(tds[0]?.attrs).toEqual({ colSpan: 2, rowSpan: 3 });
		expect(tds[1]?.attrs).toBeUndefined();
	});
});

describe("mapInlineMarkersToQuestions", () => {
	it("enforces offset ratio gate and smallest-delta tie-break for multi-question groups", () => {
		const fiveQuestions = makeQuestions(5, 1);

		// 2/5 = 0.4 < 0.5 for delta > 0 -> rejected
		const lowRatio = mapInlineMarkersToQuestions(
			[
				{ id: 0, markerNum: 11 },
				{ id: 1, markerNum: 12 },
			],
			fiveQuestions,
		);
		expect(lowRatio.size).toBe(0);

		// 3/5 = 0.6 >= 0.5 with unambiguous delta=10 (1->11, 3->13, 5->15) -> accepted
		const passRatio = mapInlineMarkersToQuestions(
			[
				{ id: 0, markerNum: 11 },
				{ id: 1, markerNum: 13 },
				{ id: 2, markerNum: 15 },
			],
			fiveQuestions,
		);
		expect(passRatio.size).toBe(3);
		expect(passRatio.get(0)).toEqual({ q: 0, number: 1 });
		expect(passRatio.get(1)).toEqual({ q: 2, number: 3 });
		expect(passRatio.get(2)).toEqual({ q: 4, number: 5 });

		// When multiple positive deltas tie on matchedCount (delta 8, 9, 10 all match 3),
		// tie-break selects the smallest positive delta (delta=8 -> 3->11, 4->12, 5->13).
		const tieBreak = mapInlineMarkersToQuestions(
			[
				{ id: 0, markerNum: 11 },
				{ id: 1, markerNum: 12 },
				{ id: 2, markerNum: 13 },
			],
			fiveQuestions,
		);
		expect(tieBreak.size).toBe(3);
		expect(tieBreak.get(0)).toEqual({ q: 2, number: 3 });
		expect(tieBreak.get(1)).toEqual({ q: 3, number: 4 });
		expect(tieBreak.get(2)).toEqual({ q: 4, number: 5 });
	});

	it("prefers delta=0 when it matches as many questions as a positive delta", () => {
		const questions = makeQuestions(3, 1);
		const mapped = mapInlineMarkersToQuestions(
			[
				{ id: 0, markerNum: 1 },
				{ id: 1, markerNum: 2 },
				{ id: 2, markerNum: 11 },
				{ id: 3, markerNum: 12 },
			],
			questions,
		);
		expect([...mapped.keys()]).toEqual([0, 1]);
		expect(mapped.get(0)).toEqual({ q: 0, number: 1 });
		expect(mapped.get(1)).toEqual({ q: 1, number: 2 });
	});
});

describe("formatInlineBankOptionLabel", () => {
	it("returns choiceValue alone when bankText is missing or matches choiceValue", () => {
		expect(formatInlineBankOptionLabel("A", undefined)).toBe("A");
		expect(formatInlineBankOptionLabel("A", "")).toBe("A");
		expect(formatInlineBankOptionLabel("A", "   ")).toBe("A");
		expect(formatInlineBankOptionLabel("A", "A")).toBe("A");
		expect(formatInlineBankOptionLabel("A", "  a  ")).toBe("A");
		expect(formatInlineBankOptionLabel("iv", "IV")).toBe("iv");
	});

	it("formats choiceValue with bank text and truncates overly long text", () => {
		expect(formatInlineBankOptionLabel("B", "Coastal erosion")).toBe(
			"B — Coastal erosion",
		);

		const exact48 = "x".repeat(48);
		expect(formatInlineBankOptionLabel("C", exact48)).toBe(`C — ${exact48}`);

		const longText =
			"A very long option bank description that exceeds forty eight characters easily";
		const formatted = formatInlineBankOptionLabel("D", longText);
		expect(formatted.startsWith("D — ")).toBe(true);
		expect(formatted.endsWith("…")).toBe(true);
		const textPart = formatted.slice("D — ".length);
		expect(textPart.length).toBeLessThanOrEqual(48);
		expect(textPart.endsWith(" …")).toBe(false);

		expect(formatInlineBankOptionLabel("E", "Hello   world", 8)).toBe(
			"E — Hello…",
		);
	});
});

describe("anchor marker exclusion", () => {
	it("never creates inline slots inside <a> elements while keeping sibling markers active", () => {
		const html =
			'<p>See <a href="https://example.com">note <strong>(1)</strong> and [2]</a>, then fill <strong>(1)</strong> and <strong>(2)</strong>.</p>';
		const parsed = parseInlineInstruction(html, makeQuestions(2, 1));
		expect(parsed).not.toBeNull();
		if (!parsed) return;

		expect(collectSlots(parsed.nodes)).toEqual([
			{ q: 0, number: 1, markerNumber: 1 },
			{ q: 1, number: 2, markerNumber: 2 },
		]);

		const anchorNode = collectElements(parsed.nodes).find(
			(el) => el.tag === "a",
		);
		expect(anchorNode).toBeDefined();
		expect(collectSlots(anchorNode?.children ?? [])).toEqual([]);

		// Only markers inside <a> -> does not activate inline mode at all.
		const anchorOnly = parseInlineInstruction(
			'<p><a href="https://example.com"><strong>(1)</strong> and <strong>(2)</strong></a></p>',
			makeQuestions(2, 1),
		);
		expect(anchorOnly).toBeNull();
	});
});

interface RawListeningGroup {
	type?: string;
	instructions?: string;
	body_html?: string;
	questions?: Array<{ number?: number }>;
}

interface RawListeningFile {
	question_groups?: RawListeningGroup[];
}

const EXCLUDED_INLINE_TYPES = new Set([
	"MULTIPLE_CHOICE_ONE",
	"MULTIPLE_CHOICE_MANY",
	"TRUE/FALSE/NOT GIVEN",
]);

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function buildSeedLikeInstructionHtml(group: RawListeningGroup): string {
	const instrLines = (group.instructions ?? "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const instrHtml = instrLines
		.map((line) => `<p>${escapeHtml(line)}</p>`)
		.join("");
	const bodyHtml = (group.body_html ?? "")
		.replace(/<img\b[^>]*>/gi, "")
		.replace(/\[(\d+)\]/g, "<strong>($1)</strong>")
		.trim();
	return instrHtml ? `${instrHtml}${bodyHtml}` : bodyHtml;
}

describe("listening IELTS real-dataset sweep", () => {
	it("binds every question with zero duplicate slots across all body_html groups", () => {
		const datasetDir = path.resolve(
			import.meta.dirname,
			"../../../../docs/listening_ielts",
		);
		const fileNames = readdirSync(datasetDir)
			.filter((name) => name.endsWith(".json") && name !== "_index.json")
			.sort();

		expect(fileNames.length).toBeGreaterThanOrEqual(490);

		let bodyHtmlGroupCount = 0;
		const failures: string[] = [];

		for (const fileName of fileNames) {
			const raw = JSON.parse(
				readFileSync(path.join(datasetDir, fileName), "utf8"),
			) as RawListeningFile;

			let qCursor = 0;
			for (const [groupIndex, group] of (raw.question_groups ?? []).entries()) {
				const rawQuestions = group.questions ?? [];
				if (rawQuestions.length === 0) continue;

				const groupQuestions: InlineQuestionRef[] = rawQuestions.map(
					(_, offset) => ({
						q: qCursor + offset,
						number: qCursor + offset + 1,
					}),
				);
				qCursor += rawQuestions.length;

				if (!group.body_html?.trim()) continue;
				const rawType = (group.type ?? "").trim().toUpperCase();
				if (EXCLUDED_INLINE_TYPES.has(rawType)) continue;

				bodyHtmlGroupCount += 1;
				const instructionHtml = buildSeedLikeInstructionHtml(group);
				const parsed = parseInlineInstruction(instructionHtml, groupQuestions);

				if (!parsed) {
					failures.push(
						`${fileName} group #${groupIndex} (${rawType}): returned null for ${groupQuestions.length} questions`,
					);
					continue;
				}

				const slots = collectSlots(parsed.nodes);
				if (slots.length !== parsed.boundQuestionQs.size) {
					failures.push(
						`${fileName} group #${groupIndex}: duplicate slots (${slots.length} slots vs ${parsed.boundQuestionQs.size} bound qs)`,
					);
				}

				const uniqueSlotQs = new Set(slots.map((slot) => slot.q));
				if (uniqueSlotQs.size !== slots.length) {
					failures.push(
						`${fileName} group #${groupIndex}: duplicate q in slots`,
					);
				}

				for (const question of groupQuestions) {
					if (!parsed.boundQuestionQs.has(question.q)) {
						failures.push(
							`${fileName} group #${groupIndex} (${rawType}): unbound q=${question.q} (number=${question.number})`,
						);
					}
				}

				if (parsed.boundQuestionQs.size !== groupQuestions.length) {
					failures.push(
						`${fileName} group #${groupIndex} (${rawType}): bound ${parsed.boundQuestionQs.size}/${groupQuestions.length}`,
					);
				}
			}
		}

		expect(bodyHtmlGroupCount).toBeGreaterThanOrEqual(500);
		expect(failures).toEqual([]);
	}, 30_000);
});
