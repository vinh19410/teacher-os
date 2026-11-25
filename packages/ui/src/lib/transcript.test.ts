// @vitest-environment node
/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	classifyTranscriptInput,
	parseTranscript,
	splitMonologueParagraphs,
	type TranscriptTurn,
} from "@teacher-os/ui/lib/transcript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const LISTENING_DIR = join(REPO_ROOT, "docs/listening_ielts");
const STUDY_PACK_DIR = join(REPO_ROOT, "packages/db/seed-data/study-packs");

function readListeningTranscript(fileName: string): string {
	const raw = JSON.parse(
		readFileSync(join(LISTENING_DIR, fileName), "utf8"),
	) as { transcript?: string };
	return raw.transcript ?? "";
}

function readStudyPackTranscript(fileName: string, id: string): string {
	const raw = JSON.parse(
		readFileSync(join(STUDY_PACK_DIR, fileName), "utf8"),
	) as { exercises: Array<{ id: string; transcript?: string }> };
	const match = raw.exercises.find((ex) => ex.id === id);
	if (!match) throw new Error(`Missing study-pack exercise ${id}`);
	return match.transcript ?? "";
}

function allParagraphs(turns: readonly TranscriptTurn[]): string[] {
	return turns.flatMap((turn) => turn.paragraphs);
}

/**
 * Normalize a string into lowercase alphanumeric word tokens for lossless checks.
 * Strips extracted `Speaker N:` prefixes and known speaker labels followed by `:`
 * so comparing source vs parsed output verifies that zero content words were dropped.
 */
function contentWords(
	text: string,
	extractedSpeakers: readonly string[],
): string[] {
	let cleaned = text.replace(/\bSpeaker\s+\d+\s*:/gi, " ");
	const sortedSpeakers = [...new Set(extractedSpeakers)]
		.filter((s) => s.length > 0)
		.sort((a, b) => b.length - a.length);
	for (const speaker of sortedSpeakers) {
		const escaped = speaker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		cleaned = cleaned.replace(
			new RegExp(`(?<![\\p{L}\\p{N}])${escaped}\\s*:`, "giu"),
			" ",
		);
	}
	// Standalone or inline generic Speaker: (no number)
	cleaned = cleaned.replace(
		/(?:^|\n|[.!?…]["”’)\]}]?\s*)\s*Speaker\s*:/gi,
		" ",
	);
	// Strip colons directly adjacent to standalone speaker headers in source
	return cleaned.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

describe("transcript parser — DOM-free Node environment", () => {
	it("runs without document or DOMParser globals", () => {
		expect(typeof document).toBe("undefined");
		expect(typeof DOMParser).toBe("undefined");
	});
});

describe("classifyTranscriptInput", () => {
	it("keeps plain text with HTML entities and newlines on the plain branch", () => {
		const raw =
			"Speaker 1: Agent: Welcome to B&amp;B.\nSpeaker 2: Customer: Thanks &quot;a lot&quot;.";
		expect(classifyTranscriptInput(raw)).toEqual({ kind: "plain", text: raw });
	});

	it("keeps math/comparison angle brackets on the plain branch", () => {
		expect(classifyTranscriptInput("score <p and q> or a < b > c")).toEqual({
			kind: "plain",
			text: "score <p and q> or a < b > c",
		});
	});

	it("extracts flat Tiptap/legacy <p>/<br> HTML safely to plain text with single-pass entity decode", () => {
		const flat =
			"<p>Speaker 1: Agent: Good morning.<br>Speaker 2: Customer: Hello &amp; welcome &mdash; it&apos;s fine.</p><p></p><p>Next &amp;lt;b&amp;gt; line.</p>";
		const res = classifyTranscriptInput(flat);
		expect(res.kind).toBe("plain");
		if (res.kind === "plain") {
			expect(res.text).toBe(
				"Speaker 1: Agent: Good morning.\nSpeaker 2: Customer: Hello & welcome — it's fine.\n\nNext &lt;b&gt; line.",
			);
		}
		// Unknown HTML entities fall back to RichTextBody HTML branch so the browser decodes them
		expect(classifyTranscriptInput("<p>Caf&eacute; au lait.</p>")).toEqual({
			kind: "html",
		});
	});

	it("routes rich HTML and attributed tags to html branch", () => {
		expect(
			classifyTranscriptInput(
				"<p><strong>Agent:</strong> Hello</p><p>World</p>",
			),
		).toEqual({ kind: "html" });
		expect(classifyTranscriptInput('<p class="lead">Agent: Hello</p>')).toEqual(
			{ kind: "html" },
		);
		expect(classifyTranscriptInput("<ul><li>Item 1</li></ul>")).toEqual({
			kind: "html",
		});
	});

	it("routes head-scoped and unclosed dangerous tags to html branch", () => {
		expect(
			classifyTranscriptInput("<script>alert(1)</script>Agent: Hello"),
		).toEqual({ kind: "html" });
		expect(
			classifyTranscriptInput("<style>body{color:red}</style>Agent: Hello"),
		).toEqual({ kind: "html" });
		expect(classifyTranscriptInput("<svg onload=alert(1)>Hello")).toEqual({
			kind: "html",
		});
		expect(
			classifyTranscriptInput("<iframe src=https://evil.test>Hello"),
		).toEqual({ kind: "html" });
	});
});

describe("parseTranscript — edge cases & real corpus fixtures", () => {
	it("returns [] for empty/whitespace and falls back cleanly for speaker-label-only input", () => {
		expect(parseTranscript("")).toEqual([]);
		expect(parseTranscript("   \n\n  ")).toEqual([]);
		expect(parseTranscript("Speaker 1: Agent:")).toEqual([
			{ speaker: null, paragraphs: ["Speaker 1: Agent:"] },
		]);
	});

	it("formats City Health Services: strips redundant Speaker N:, resolves bare Speaker N:, splits inline turns, merges consecutive Agent", () => {
		const raw = readListeningTranscript(
			"Actual-Test-S1-city-health-services.json",
		);
		const turns = parseTranscript(raw);
		const speakers = new Set(turns.map((t) => t.speaker));
		expect(speakers).toEqual(new Set(["Agent", "Customer"]));
		expect(turns.length).toBeGreaterThanOrEqual(30);

		const joined = allParagraphs(turns).join("\n");
		expect(joined).not.toMatch(/\bSpeaker\s+[12]\s*:/);
		// Line 18 inline switch Customer -> Agent -> Customer was split
		const kitchenTurn = turns.find((t) =>
			t.paragraphs.some((p) => p.includes("The kitchen diner is quite large")),
		);
		expect(kitchenTurn?.speaker).toBe("Agent");
		const conservatoryTurn = turns.find((t) =>
			t.paragraphs.some((p) =>
				p.includes("The conservatory has a lot of plants"),
			),
		);
		expect(conservatoryTurn?.speaker).toBe("Customer");
		// Bare Speaker 1 line 31 and bare Speaker 2 line 34 resolved unambiguously
		const convenientTurn = turns.find((t) =>
			t.paragraphs.some((p) =>
				p.includes("When is it convenient for us to come over"),
			),
		);
		expect(convenientTurn?.speaker).toBe("Agent");
		const howLongTurn = turns.find((t) =>
			t.paragraphs.some((p) => p.includes("By the way, how long will it take")),
		);
		expect(howLongTurn?.speaker).toBe("Customer");
		// Consecutive Agent: Excellent. Agent: Any extra services... merged under one Agent turn
		const excellentTurn = turns.find((t) =>
			t.paragraphs.some((p) => p.includes("Excellent.")),
		);
		expect(excellentTurn?.speaker).toBe("Agent");
		expect(excellentTurn?.paragraphs.length).toBeGreaterThanOrEqual(2);
	});

	it("formats Talking about the history of bikes into one NARRATOR turn with 14+ paragraphs and intact prose colons", () => {
		const raw = readListeningTranscript(
			"Unknown-S4-talking-about-the-history-of-bikes.json",
		);
		const turns = parseTranscript(raw);
		expect(turns).toHaveLength(1);
		expect(turns[0]?.speaker).toBe("NARRATOR");
		expect(turns[0]?.paragraphs.length).toBeGreaterThanOrEqual(14);

		const joined = allParagraphs(turns).join("\n");
		expect(joined).toContain(
			"Machine Age: people wanted machines to do all the work.",
		);
		expect(joined).toContain('comfortably: "OH NO! HOW DO I STOP?"');
		expect(joined).not.toMatch(/\bNARRATOR\s*:/);
		expect(joined).not.toMatch(/\bSpeaker\s+1\s*:/);
	});

	it("splits zero-newline multi-speaker dialogues including '}' closing markers", () => {
		const arillas = parseTranscript(
			readListeningTranscript("Actual-Test-S1-apartment-in-arillas.json"),
		);
		expect(new Set(arillas.map((t) => t.speaker))).toEqual(
			new Set(["Receptionist", "Tourist"]),
		);
		expect(arillas.length).toBeGreaterThanOrEqual(40);

		const diver = parseTranscript(
			readListeningTranscript(
				"Other-sources-S3-the-cartesian-diver-experiment.json",
			),
		);
		const diverSpeakers = new Set(diver.map((t) => t.speaker));
		expect(diverSpeakers.has("Bob")).toBe(true);
		expect(diverSpeakers.has("Julia")).toBe(true);
		expect(diverSpeakers.has("Tara")).toBe(true);

		const rental = parseTranscript(
			readListeningTranscript(
				"Collection-S1-rental-property-application-form-ac0672f7.json",
			),
		);
		expect(new Set(rental.map((t) => t.speaker))).toEqual(
			new Set(["Peter", "Susan"]),
		);
		expect(allParagraphs(rental).join("\n")).not.toMatch(/\]\}\s*Peter\s*:/);
	});

	it("discovers missing-space inline speakers (.MARY:, ?CUSTOMER:, ?Man:, .HENRY:, ?Dr.Twain:) without false-splitting .Have", () => {
		const med = parseTranscript(
			readListeningTranscript("Forecast-Quy-2-2025-S3-medicine-courses.json"),
		);
		const medSpeakers = new Set(med.map((t) => t.speaker));
		expect(medSpeakers.has("MARY")).toBe(true);
		expect(medSpeakers.has("PROFESSOR")).toBe(true);
		expect(medSpeakers.has("Have")).toBe(false);
		expect(allParagraphs(med).join("\n")).not.toMatch(/[.?!]MARY\s*:/);

		const japan = parseTranscript(
			readListeningTranscript("Collection-S1-tour-to-japan.json"),
		);
		expect(new Set(japan.map((t) => t.speaker)).has("CUSTOMER")).toBe(true);

		const job = parseTranscript(
			readListeningTranscript(
				"Forecast-Quy-2-2025-S1-voluntary-job-hunting.json",
			),
		);
		expect(new Set(job.map((t) => t.speaker)).has("Man")).toBe(true);

		const bsc = parseTranscript(
			readListeningTranscript(
				"Forecast-Quy-2-2025-S3-bachelor-of-science-degree.json",
			),
		);
		expect(new Set(bsc.map((t) => t.speaker)).has("HENRY")).toBe(true);

		const course = parseTranscript(
			readListeningTranscript("Collection-S3-course-research.json"),
		);
		const courseSpeakers = [...new Set(course.map((t) => t.speaker))];
		expect(
			courseSpeakers.some((s) => s !== null && /Dr\.?\s*Twain/i.test(s)),
		).toBe(true);
	});

	it("handles standalone speaker headers (LISA:\\n\\n..., joe:\\n\\n..., Lectuerer:\\nSpeaker 1:...)", () => {
		const b18 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b18",
			),
		);
		const b18Speakers = new Set(b18.map((t) => t.speaker));
		expect(b18Speakers.has("LISA")).toBe(true);
		expect(b18Speakers.has("GREG")).toBe(true);
		expect(allParagraphs(b18).every((p) => p.length > 0)).toBe(true);

		const b38 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b38",
			),
		);
		const b38Speakers = new Set(
			b38.map((t) => t.speaker?.toUpperCase() ?? null),
		);
		expect(b38Speakers.has("KATIE")).toBe(true);
		expect(b38Speakers.has("JOE")).toBe(true);

		const bislama = parseTranscript(
			readListeningTranscript(
				"Actual-Test-S4-bislama-the-pidgin-english-language-of-vanuatu.json",
			),
		);
		expect(bislama[0]?.speaker).toBe("Lectuerer");
		expect(allParagraphs(bislama).length).toBeGreaterThanOrEqual(4);

		const clifton = parseTranscript(
			readListeningTranscript("Collection-S2-clifton-bird-park.json"),
		);
		expect(clifton[0]?.speaker).toBe("Sandra Hayes");
	});

	it("suppresses generic solo SPEAKER/Speaker badges while keeping meaningful solo role names", () => {
		const hotel = parseTranscript(
			readListeningTranscript("C17T4-S2-hotel-staff-turnover.json"),
		);
		expect(hotel).toHaveLength(1);
		expect(hotel[0]?.speaker).toBeNull();
		expect(hotel[0]?.paragraphs.length).toBeGreaterThanOrEqual(12);

		const preschool = parseTranscript(
			readListeningTranscript(
				"Actual-Test-S2-the-pre-school-family-centre.json",
			),
		);
		expect(preschool).toHaveLength(1);
		expect(preschool[0]?.speaker).toBeNull();
		expect(allParagraphs(preschool).length).toBeGreaterThanOrEqual(4);
		expect(allParagraphs(preschool).join("\n")).toContain("09:30");

		const b10 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b10",
			),
		);
		expect(b10).toHaveLength(1);
		expect(b10[0]?.speaker).toBeNull();
		expect(b10[0]?.paragraphs.length).toBeGreaterThanOrEqual(5);

		const museum = parseTranscript(
			readListeningTranscript("Actual-Test-S4-a-museum-in-japan.json"),
		);
		expect(museum[0]?.speaker).toBe("Lecturer");
		expect(allParagraphs(museum).length).toBeGreaterThanOrEqual(5);

		const coconut = parseTranscript(
			readListeningTranscript("Actual-Test-S2-coconut-beach-resort.json"),
		);
		expect(coconut[0]?.speaker).toBe("Radio Presenter (Anna)");
		expect(allParagraphs(coconut).join("\n")).toContain(
			"radio program: Travel with me in Australia.",
		);

		const toy = parseTranscript(
			readListeningTranscript("Actual-Test-S2-an-electronic-toy-company.json"),
		);
		expect(toy[0]?.speaker).toBe("Manager");
	});

	it("preserves raw Speaker N on ASR diarization drift files and keeps unprefixed continuation before mid-line JOHN:", () => {
		const pen = parseTranscript(
			readListeningTranscript(
				"Actual-Test-S3-the-invention-of-the-ballpoint-pen.json",
			),
		);
		// Speaker 3 drifts between Josie & Roger -> bare Speaker 3 must stay Speaker 3
		const penSpeakers = new Set(pen.map((t) => t.speaker));
		expect(penSpeakers.has("Roger")).toBe(true);
		expect(penSpeakers.has("Josie")).toBe(true);
		expect(penSpeakers.has("Speaker 3")).toBe(true);

		const park = parseTranscript(
			readListeningTranscript("C19T1-S1-hinchingbrooke-country-park.json"),
		);
		const parkSpeakers = new Set(park.map((t) => t.speaker));
		expect(parkSpeakers.has("JOHN")).toBe(true);
		expect(parkSpeakers.has("Speaker 1")).toBe(true);
		const rangerTurn = park.find((t) =>
			t.paragraphs.some((p) => p.includes("one of the rangers.")),
		);
		expect(rangerTurn?.speaker).toBe("Speaker 0");

		// Synthetic drift lock: roles.size > 1 must NEVER alias bare Speaker 1
		const syntheticDrift = parseTranscript(
			[
				"Speaker 1: JOHN: Hello everyone.",
				"Speaker 1: SALLY: Welcome back.",
				"Speaker 1: Here is the schedule.",
			].join("\n"),
		);
		expect(syntheticDrift.map((t) => t.speaker)).toEqual([
			"JOHN",
			"SALLY",
			"Speaker 1",
		]);
	});

	it("splits bare Speaker N:, mid-line Speaker N: Role:, mixed-casing inline turns, and Unicode Vietnamese speakers cleanly", () => {
		// Bare Speaker N: without newlines must split into alternating turns, never collapse to null
		const bareInline = parseTranscript(
			"Speaker 1: Good morning. Speaker 2: Hello. Speaker 1: How are you? Speaker 2: Fine.",
		);
		expect(bareInline).toEqual([
			{ speaker: "Speaker 1", paragraphs: ["Good morning."] },
			{ speaker: "Speaker 2", paragraphs: ["Hello."] },
			{ speaker: "Speaker 1", paragraphs: ["How are you?"] },
			{ speaker: "Speaker 2", paragraphs: ["Fine."] },
		]);

		// Mid-line double prefix `Speaker N: Role:` must strip Role: and never duplicate
		const midDouble = parseTranscript(
			"Speaker 1: Agent: Good morning. Speaker 2: Customer: Hello there.\nSpeaker 2: Customer: How much is it?",
		);
		expect(midDouble).toEqual([
			{ speaker: "Agent", paragraphs: ["Good morning."] },
			{
				speaker: "Customer",
				paragraphs: ["Hello there.", "How much is it?"],
			},
		]);

		// Single-line double prefix transcript
		const singleLineDouble = parseTranscript(
			"Speaker 1: Agent: Good morning. Speaker 2: Customer: Hello there. Speaker 1: Agent: Can I help? Speaker 2: Customer: Yes please.",
		);
		expect(singleLineDouble).toEqual([
			{ speaker: "Agent", paragraphs: ["Good morning."] },
			{ speaker: "Customer", paragraphs: ["Hello there."] },
			{ speaker: "Agent", paragraphs: ["Can I help?"] },
			{ speaker: "Customer", paragraphs: ["Yes please."] },
		]);

		// Mixed-casing inline turns (`Agent:` vs `AGENT:`) merge to canonical speaker
		const mixedCasing = parseTranscript(
			"Agent: Good morning. Customer: Hi. AGENT: How can I help? CUSTOMER: I need a room.",
		);
		expect(mixedCasing).toEqual([
			{ speaker: "Agent", paragraphs: ["Good morning."] },
			{ speaker: "Customer", paragraphs: ["Hi."] },
			{ speaker: "Agent", paragraphs: ["How can I help?"] },
			{ speaker: "Customer", paragraphs: ["I need a room."] },
		]);

		// Unicode Vietnamese inline speakers
		const vietnamese = parseTranscript(
			"Cô Mỹ: Chào các em. Học viên: Em chào cô ạ. Cô Mỹ: Hôm nay học nghe. Học viên: Dạ vâng.",
		);
		expect(vietnamese).toEqual([
			{ speaker: "Cô Mỹ", paragraphs: ["Chào các em."] },
			{ speaker: "Học viên", paragraphs: ["Em chào cô ạ."] },
			{ speaker: "Cô Mỹ", paragraphs: ["Hôm nay học nghe."] },
			{ speaker: "Học viên", paragraphs: ["Dạ vâng."] },
		]);
	});

	it("rejects non-speaker metadata (SCRIPT:, (Note:, Useful vocabulary glossary, angle brackets), title-dot splits, and blank-line leakage", () => {
		const bio = parseTranscript(
			readListeningTranscript(
				"Forecast-Quy-2-2025-S3-biology-lecture-ebc23247.json",
			),
		);
		expect(new Set(bio.map((t) => t.speaker)).has("SCRIPT")).toBe(false);

		const research = parseTranscript(
			readListeningTranscript("Collection-S3-research-project.json"),
		);
		expect(
			[...new Set(research.map((t) => t.speaker))].some((s) =>
				s?.startsWith("("),
			),
		).toBe(false);

		const b24 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b24",
			),
		);
		const b24Speakers = [...new Set(b24.map((t) => t.speaker))];
		expect(
			b24Speakers.some(
				(s) => s !== null && /Contagious|Copycat|Crucial/i.test(s),
			),
		).toBe(false);

		const b08 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b08",
			),
		);
		const b08Speakers = [...new Set(b08.map((t) => t.speaker))];
		expect(
			b08Speakers.some(
				(s) => s !== null && /Puke|Summit|Out of the blue/i.test(s),
			),
		).toBe(false);

		const smith = parseTranscript(
			readListeningTranscript(
				"Actual-Test-S3-library-facilities-and-services.json",
			),
		);
		const smithSpeakers = new Set(smith.map((t) => t.speaker));
		expect(smithSpeakers.has("MR. SMITH")).toBe(true);
		expect(smithSpeakers.has("SMITH")).toBe(false);

		const rubin = parseTranscript(
			readListeningTranscript("Actual-Test-S3-the-artist-samuel-prout.json"),
		);
		const rubinSpeakers = new Set(rubin.map((t) => t.speaker));
		expect(rubinSpeakers.has("Dr. Rubin")).toBe(true);
		expect(rubinSpeakers.has("Rubin")).toBe(false);

		// Blank-line separated unprefixed dialogue turns must NOT be absorbed into Simon / D
		const b58 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b58",
			),
		);
		const simonTurns = b58.filter((t) => t.speaker === "Simon");
		const simonParagraphCount = simonTurns.reduce(
			(sum, t) => sum + t.paragraphs.length,
			0,
		);
		expect(simonParagraphCount).toBeLessThan(10);

		const b62 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b62",
			),
		);
		const dTurns = b62.filter((t) => t.speaker === "D");
		const dParagraphCount = dTurns.reduce(
			(sum, t) => sum + t.paragraphs.length,
			0,
		);
		expect(dParagraphCount).toBeLessThan(5);

		// Non-greedy leading label guard
		const nonGreedy = parseTranscript(
			"Speaker 1: No red meat. Officer: I see.\nSpeaker 2: Student: Thanks.",
		);
		expect(nonGreedy.some((t) => t.speaker?.includes("No red meat"))).toBe(
			false,
		);
		expect(allParagraphs(nonGreedy).join(" ")).toContain("No red meat.");

		// Angle-bracket label rejected by character allowlist
		const angle = parseTranscript("<tag>Agent: Hello there.");
		expect(angle[0]?.speaker).toBeNull();
	});

	it("splits long paragraphs across single-line, multi-line, and missing-space monologues while protecting abbreviations & quotes", () => {
		const puffins = parseTranscript(
			readListeningTranscript("Forecast-Quy-2-2025-S4-canadian-puffins.json"),
		);
		const puffinParas = allParagraphs(puffins);
		expect(puffinParas.length).toBeGreaterThanOrEqual(5);
		expect(Math.max(...puffinParas.map((p) => p.length))).toBeLessThan(1200);

		const suburbs = parseTranscript(
			readListeningTranscript("Actual-Test-S4-suburbs.json"),
		);
		const suburbParas = allParagraphs(suburbs);
		expect(suburbParas.length).toBeGreaterThanOrEqual(6);
		expect(Math.max(...suburbParas.map((p) => p.length))).toBeLessThan(1200);

		const b48 = parseTranscript(
			readStudyPackTranscript(
				"first-step-gt2.json",
				"sysex-first-step-gt2-b48",
			),
		);
		expect(allParagraphs(b48).length).toBeGreaterThanOrEqual(6);

		// Protect abbreviations, decimals, domains, and lowercase quote continuations (> 550 chars)
		const tricky =
			'Dr. Smith visited the U.S. at 10 a.m. to test 3.5 liters of freshwater samples from example.com with the field team today. "When will she learn her lesson?" they asked quietly while reviewing the lab records in the hall. Meanwhile Mr. Brown checked e.g. the earlier temperature notes and spoke with Prof. Lee about calibration. Firstly, the project started in 1995 with small volunteer teams working across central London and nearby towns. Secondly, international funding grew rapidly after the initial trial succeeded beyond everyone\'s expectations. Finally, the team published Ph.D. findings that changed how researchers measure water quality across the whole field.';
		expect(tricky.length).toBeGreaterThan(550);
		const split = splitMonologueParagraphs(tricky);
		expect(split.length).toBeGreaterThanOrEqual(2);
		expect(split.join(" ")).toContain("Dr. Smith visited the U.S. at 10 a.m.");
		expect(split.join(" ")).toContain(
			'"When will she learn her lesson?" they asked',
		);
		// Never break right after abbreviations/decimals/domains or before lowercase quote continuations
		for (const p of split) {
			expect(p).not.toMatch(/(?:Dr|Mr|Prof|U\.S|e\.g|Ph\.D|a\.m)\.$/i);
			expect(p).not.toMatch(/^(?:they asked|5\b|com\b)/);
		}

		// Orphan merge must not collapse a 2-paragraph split > 800 chars back to 1 block
		// Sentences 1-3 stay <= 449 chars, sentence 4 brings group 1 to 696 chars (<= 750),
		// leaving sentence 5 as a 1-sentence orphan in group 2 (total 839 chars > 800).
		const twoPart810 = `${"Opening background sentences remain concise so the first three statements stay strictly below the four hundred fifty character break threshold. ".repeat(3)}The fourth sentence then adds substantial explanatory detail about historical trends, survey methodology, regional comparisons, and long term outcomes across urban communities so the four sentence group remains under seven hundred fifty characters in total length. This final fifth sentence stands alone after the break so the orphan guard must preserve a two paragraph split above eight hundred characters.`;
		expect(twoPart810.length).toBeGreaterThan(800);
		expect(splitMonologueParagraphs(twoPart810)).toHaveLength(2);

		// Short texts stay single paragraph
		expect(parseTranscript("Sample transcript")).toEqual([
			{ speaker: null, paragraphs: ["Sample transcript"] },
		]);
		expect(
			parseTranscript("Receptionist: Welcome to Central Library."),
		).toEqual([
			{ speaker: "Receptionist", paragraphs: ["Welcome to Central Library."] },
		]);
	});

	it("handles adversarial 25 KB unclosed-tag and 1,600-line distinct-speaker payloads in linear time (< 500 ms under multi-worker CI)", () => {
		// Steady-state runs ~5–15 ms CPU; a 500 ms wall-clock ceiling tolerates
		// preemption across 28 parallel Vitest workers on 2-vCPU CI while still
		// catching O(N^2) ReDoS regressions (which take seconds).
		const unclosed = `${"<a".repeat(4999)}${" ".repeat(15000)}x`;
		const t0 = performance.now();
		const cls = classifyTranscriptInput(unclosed);
		if (cls.kind === "plain") parseTranscript(cls.text);
		const elapsed1 = performance.now() - t0;
		expect(elapsed1).toBeLessThan(500);

		const lines: string[] = [];
		for (let i = 0; i < 1600; i += 1) {
			const a = String.fromCharCode(65 + Math.floor(i / 676));
			const b = String.fromCharCode(97 + (Math.floor(i / 26) % 26));
			const c = String.fromCharCode(97 + (i % 26));
			lines.push(`${a}${b}${c}: text`);
		}
		const manySpeakers = lines.join("\n");
		// Warm up JIT paths before timing so cold compilation is excluded
		parseTranscript(lines.slice(0, 32).join("\n"));
		const t1 = performance.now();
		const turns = parseTranscript(manySpeakers);
		const elapsed2 = performance.now() - t1;
		expect(turns.length).toBeGreaterThan(0);
		expect(elapsed2).toBeLessThan(500);
	});
});

describe("parseTranscript — full 498 + 60 corpus invariants", () => {
	it("parses all 498 listening library files and 60 study-pack transcripts losslessly without crashes or single-block >800 char walls", () => {
		const entries: Array<{ label: string; transcript: string }> = [];

		for (const fileName of readdirSync(LISTENING_DIR)
			.filter((f) => f.endsWith(".json") && f !== "_index.json")
			.sort()) {
			entries.push({
				label: `listening/${fileName}`,
				transcript: readListeningTranscript(fileName),
			});
		}

		for (const packFile of [
			"foun-gt1-discipline.json",
			"first-step-gt2.json",
		]) {
			const pack = JSON.parse(
				readFileSync(join(STUDY_PACK_DIR, packFile), "utf8"),
			) as { exercises: Array<{ id: string; transcript?: string }> };
			for (const ex of pack.exercises) {
				if (ex.transcript && ex.transcript.trim().length > 0) {
					entries.push({
						label: `${packFile}#${ex.id}`,
						transcript: ex.transcript,
					});
				}
			}
		}

		expect(entries.length).toBe(558);

		const failures: string[] = [];
		for (const { label, transcript } of entries) {
			const classified = classifyTranscriptInput(transcript);
			if (classified.kind !== "plain") {
				failures.push(`${label}: classified as ${classified.kind}`);
				continue;
			}

			const turns = parseTranscript(classified.text);
			if (turns.length < 1) {
				failures.push(`${label}: produced 0 turns`);
				continue;
			}

			const paras = allParagraphs(turns);
			if (paras.length < 1) {
				failures.push(`${label}: produced 0 paragraphs`);
				continue;
			}
			for (const p of paras) {
				if (p.trim().length === 0) {
					failures.push(`${label}: empty paragraph`);
					break;
				}
			}

			for (const t of turns) {
				if (t.speaker !== null) {
					if (t.speaker.length > 40) {
						failures.push(`${label}: speaker too long (${t.speaker})`);
					}
					if (/[<>={};]/.test(t.speaker)) {
						failures.push(`${label}: unsafe speaker chars (${t.speaker})`);
					}
				}
			}

			if (transcript.trim().length > 800 && paras.length < 2) {
				failures.push(`${label}: >800 chars collapsed into 1 paragraph`);
			}

			const extractedSpeakers = turns
				.map((t) => t.speaker)
				.filter((s): s is string => s !== null);
			const expected = contentWords(transcript, extractedSpeakers);
			const actual = contentWords(paras.join(" "), extractedSpeakers);
			if (actual.length !== expected.length) {
				failures.push(
					`${label}: word count mismatch (actual=${actual.length}, expected=${expected.length})`,
				);
			} else {
				for (let i = 0; i < expected.length; i += 1) {
					if (actual[i] !== expected[i]) {
						failures.push(
							`${label}: word mismatch at index ${i} (actual="${actual[i]}", expected="${expected[i]}")`,
						);
						break;
					}
				}
			}
		}

		expect(failures).toEqual([]);
	}, 30_000);
});
