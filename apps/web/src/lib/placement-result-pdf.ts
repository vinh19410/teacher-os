/**
 * Trình sinh phiếu kết quả bài kiểm tra đầu vào dạng PDF vector khổ A4
 * chạy 100% client-side bằng `pdfmake` + bộ font self-host `Be Vietnam Pro`.
 * `pdfmake` được dynamic-import để tách chunk riêng, không tăng initial bundle.
 */
import {
	type PlacementErrorCategory,
	type PlacementErrorSkill,
	type PlacementSubmissionDetail,
	placementErrorCategoriesForSkill,
} from "@teacher-os/api/placement-test-contracts";
import type {
	Content,
	ContentTable,
	ContentText,
	TableCell,
	TableLayout,
	TDocumentDefinitions,
} from "pdfmake/interfaces";
import boldFontUrl from "@/assets/fonts/BeVietnamPro-Bold.ttf?url";
import boldItalicFontUrl from "@/assets/fonts/BeVietnamPro-BoldItalic.ttf?url";
import italicFontUrl from "@/assets/fonts/BeVietnamPro-Italic.ttf?url";
import regularFontUrl from "@/assets/fonts/BeVietnamPro-Regular.ttf?url";
import {
	buildPlacementPdfFilename,
	buildPlacementResultPdfModel,
	PDF_EMPTY_WRITING_TEXT,
	PDF_NO_ERRORS_TEXT,
	type PlacementPdfHighlightSegment,
	type PlacementPdfNumberedError,
	type PlacementPdfRubricCriterion,
	type PlacementResultPdfModel,
} from "./placement-result-pdf-model";

export {
	buildPlacementPdfFilename,
	buildPlacementResultPdfModel,
	type PlacementResultPdfModel,
};

export interface PlacementResultPdfOptions {
	/** Custom font asset loader — dùng trong test Node để đọc `.ttf` trực tiếp từ đĩa. */
	loadFont?: (assetUrl: string) => Promise<Uint8Array>;
}

const PAGE_MARGIN_X = 40;
const PAGE_CONTENT_WIDTH = 595.28 - PAGE_MARGIN_X * 2; // A4 width = 595.28pt

const COLOR_BRAND = "#0d7c6b";
const COLOR_BRAND_SOFT = "#edf7f5";
const COLOR_BRAND_BORDER = "#bfe2dc";
const COLOR_INK = "#18181b";
const COLOR_INK_SECONDARY = "#3f3f46";
const COLOR_MUTED = "#64748b";
const COLOR_SURFACE = "#f8fafc";
const COLOR_HEADER_BG = "#f1f5f9";
const COLOR_BORDER = "#e2e8f0";
const COLOR_WHITE = "#ffffff";

const ERROR_CATEGORY_PALETTE: Record<
	PlacementErrorCategory,
	{ accent: string; softBg: string }
> = {
	task: { accent: "#b45309", softBg: "#fef3c7" },
	coherence: { accent: "#7e22ce", softBg: "#f3e8ff" },
	fluency: { accent: "#7e22ce", softBg: "#f3e8ff" },
	lexical: { accent: "#1d4ed8", softBg: "#dbeafe" },
	grammar: { accent: "#be123c", softBg: "#ffe4e6" },
	pronunciation: { accent: "#0f766e", softBg: "#ccfbf1" },
};

function paletteForCriterionKey(
	key: string,
): { accent: string; softBg: string } | null {
	if (Object.hasOwn(ERROR_CATEGORY_PALETTE, key)) {
		return ERROR_CATEGORY_PALETTE[key as PlacementErrorCategory];
	}
	return null;
}

const FONT_FAMILY = "BeVietnamPro";
const FONT_FILES = {
	normal: "BeVietnamPro-Regular.ttf",
	bold: "BeVietnamPro-Bold.ttf",
	italics: "BeVietnamPro-Italic.ttf",
	bolditalics: "BeVietnamPro-BoldItalic.ttf",
} as const;

const FONT_ASSET_URLS: ReadonlyArray<readonly [string, string]> = [
	[FONT_FILES.normal, regularFontUrl],
	[FONT_FILES.bold, boldFontUrl],
	[FONT_FILES.italics, italicFontUrl],
	[FONT_FILES.bolditalics, boldItalicFontUrl],
];

interface PdfMakeCreatedDoc {
	getBuffer(): Promise<Uint8Array>;
}

interface PdfMakeRuntime {
	addVirtualFileSystem(vfs: Record<string, string>): void;
	addFonts(
		fonts: Record<
			string,
			{
				normal: string;
				bold: string;
				italics: string;
				bolditalics: string;
			}
		>,
	): void;
	createPdf(docDefinition: TDocumentDefinitions): PdfMakeCreatedDoc;
}

let cachedDefaultFontVfsPromise: Promise<Record<string, string>> | null = null;

/** Chuyển `Uint8Array` sang base64 theo từng chunk để tránh tràn call stack với file font lớn. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength,
		).toString("base64");
	}
	const chunkSize = 0x8000;
	const parts: string[] = [];
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		const end = Math.min(offset + chunkSize, bytes.length);
		let binary = "";
		for (let i = offset; i < end; i++) {
			binary += String.fromCharCode(bytes[i] ?? 0);
		}
		parts.push(binary);
	}
	return btoa(parts.join(""));
}

function toArrayBufferBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
	copy.set(data);
	return copy;
}

async function fetchFontAsset(assetUrl: string): Promise<Uint8Array> {
	const response = await fetch(assetUrl);
	if (!response.ok) {
		throw new Error(`Không thể tải font PDF (${response.status}).`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

async function loadFontVfs(
	loader: (assetUrl: string) => Promise<Uint8Array>,
): Promise<Record<string, string>> {
	const entries = await Promise.all(
		FONT_ASSET_URLS.map(async ([fileName, assetUrl]) => {
			const bytes = await loader(assetUrl);
			if (bytes.byteLength === 0) {
				throw new Error(`File font PDF rỗng: ${fileName}`);
			}
			return [fileName, uint8ArrayToBase64(bytes)] as const;
		}),
	);
	return Object.fromEntries(entries);
}

function getFontVfs(
	customLoader?: (assetUrl: string) => Promise<Uint8Array>,
): Promise<Record<string, string>> {
	if (customLoader) {
		return loadFontVfs(customLoader);
	}
	if (!cachedDefaultFontVfsPromise) {
		cachedDefaultFontVfsPromise = loadFontVfs(fetchFontAsset).catch((error) => {
			cachedDefaultFontVfsPromise = null;
			throw error;
		});
	}
	return cachedDefaultFontVfsPromise;
}

async function loadPdfMake(): Promise<PdfMakeRuntime> {
	const mod = (await import("pdfmake/build/pdfmake")) as unknown as {
		default?: PdfMakeRuntime;
	} & Partial<PdfMakeRuntime>;
	const runtime = mod.default ?? mod;
	if (
		typeof runtime.createPdf !== "function" ||
		typeof runtime.addVirtualFileSystem !== "function" ||
		typeof runtime.addFonts !== "function"
	) {
		throw new Error("Không thể khởi tạo trình tạo PDF.");
	}
	return runtime as PdfMakeRuntime;
}

const BORDERED_TABLE_LAYOUT: TableLayout = {
	hLineWidth: () => 0.6,
	vLineWidth: () => 0.6,
	hLineColor: () => COLOR_BORDER,
	vLineColor: () => COLOR_BORDER,
	paddingLeft: () => 8,
	paddingRight: () => 8,
	paddingTop: () => 6,
	paddingBottom: () => 6,
};

const OVERVIEW_CARD_LAYOUT: TableLayout = {
	hLineWidth: () => 0.8,
	vLineWidth: () => 0.8,
	hLineColor: () => COLOR_BRAND_BORDER,
	vLineColor: () => COLOR_BRAND_BORDER,
	paddingLeft: () => 10,
	paddingRight: () => 10,
	paddingTop: () => 8,
	paddingBottom: () => 8,
};

const PROSE_BOX_LAYOUT: TableLayout = {
	hLineWidth: () => 0.6,
	vLineWidth: () => 0.6,
	hLineColor: () => COLOR_BORDER,
	vLineColor: () => COLOR_BORDER,
	paddingLeft: () => 10,
	paddingRight: () => 10,
	paddingTop: () => 8,
	paddingBottom: () => 8,
};

function buildSectionHeading(
	sectionNumber: number,
	title: string,
	badgeText?: string | null,
): Content {
	return {
		margin: [0, 14, 0, 8],
		unbreakable: true,
		stack: [
			{
				columns: [
					{
						text: `${sectionNumber}. ${title}`,
						fontSize: 12,
						bold: true,
						color: COLOR_INK,
						width: "*",
					},
					...(badgeText
						? [
								{
									text: badgeText,
									fontSize: 11,
									bold: true,
									color: COLOR_BRAND,
									alignment: "right" as const,
									width: "auto" as const,
								},
							]
						: []),
				],
			},
			{
				canvas: [
					{
						type: "line",
						x1: 0,
						y1: 0,
						x2: PAGE_CONTENT_WIDTH,
						y2: 0,
						lineWidth: 1,
						lineColor: COLOR_BRAND_BORDER,
					},
				],
				margin: [0, 4, 0, 0],
			},
		],
	};
}

function buildRubricTable(
	criteria: readonly PlacementPdfRubricCriterion[],
	isIelts: boolean,
): ContentTable {
	const headerRow: TableCell[] = [
		{
			text: "Tiêu chí",
			bold: true,
			fontSize: 9,
			color: COLOR_INK_SECONDARY,
			fillColor: COLOR_HEADER_BG,
		},
		{
			text: "Mô tả",
			bold: true,
			fontSize: 9,
			color: COLOR_INK_SECONDARY,
			fillColor: COLOR_HEADER_BG,
		},
		{
			text: "Điểm",
			bold: true,
			fontSize: 9,
			color: COLOR_INK_SECONDARY,
			fillColor: COLOR_HEADER_BG,
			alignment: "right",
		},
	];

	const bodyRows: TableCell[][] = criteria.map((criterion) => {
		const palette = isIelts ? paletteForCriterionKey(criterion.key) : null;
		const titleCell: TableCell = palette
			? {
					columns: [
						{
							width: 7,
							canvas: [
								{
									type: "rect",
									x: 0,
									y: 2,
									w: 3.5,
									h: 11,
									r: 1.5,
									color: palette.accent,
								},
							],
						},
						{
							width: "*",
							text: criterion.label,
							bold: true,
							fontSize: 9.5,
							color: palette.accent,
						},
					],
					columnGap: 4,
				}
			: {
					text: criterion.label,
					bold: true,
					fontSize: 9.5,
					color: COLOR_INK,
				};

		const compactComment = criterion.comment.trim().replace(/\n{3,}/g, "\n\n");
		const descCell: TableCell = compactComment
			? {
					stack: [
						{
							text: criterion.desc,
							fontSize: 8.5,
							color: COLOR_MUTED,
						},
						{
							margin: [0, 4, 0, 0],
							text: [
								{
									text: "Nhận xét: ",
									bold: true,
									fontSize: 9,
									color: COLOR_INK_SECONDARY,
								},
								{
									text: compactComment,
									fontSize: 9,
									color: COLOR_INK,
								},
							],
							lineHeight: 1.4,
						},
					],
				}
			: {
					text: criterion.desc,
					fontSize: 9,
					color: COLOR_MUTED,
				};

		return [
			titleCell,
			descCell,
			{
				text: criterion.valueText,
				bold: true,
				fontSize: 9.5,
				color: palette?.accent ?? COLOR_BRAND,
				alignment: "right",
			},
		];
	});

	const hasTallCriterionComment = criteria.some((criterion) => {
		const compact = criterion.comment.trim().replace(/\n{3,}/g, "\n\n");
		const lineBreaks = compact.match(/\n/g)?.length ?? 0;
		return lineBreaks > 18 || compact.length > 600;
	});

	return {
		margin: [0, 0, 0, 10],
		table: {
			headerRows: 1,
			dontBreakRows: !hasTallCriterionComment,
			widths: ["32%", "*", 56],
			body: [headerRow, ...bodyRows],
		},
		layout: BORDERED_TABLE_LAYOUT,
	};
}

function buildErrorLegend(skill: PlacementErrorSkill): Content {
	const inlineItems: ContentText[] = [
		{
			text: "Chú giải loại lỗi:  ",
			bold: true,
			fontSize: 8.5,
			color: COLOR_MUTED,
		},
	];
	for (const category of placementErrorCategoriesForSkill(skill)) {
		const palette = ERROR_CATEGORY_PALETTE[category.key];
		inlineItems.push(
			{
				text: " Aa ",
				fontSize: 8.5,
				bold: true,
				color: palette.accent,
				background: palette.softBg,
				decoration: "underline",
				decorationColor: palette.accent,
			},
			{
				text: ` ${category.label}   `,
				fontSize: 8.5,
				color: COLOR_INK_SECONDARY,
			},
		);
	}
	return {
		text: inlineItems,
		margin: [0, 0, 0, 6],
		lineHeight: 1.5,
	};
}

function buildAnnotatedTextBox(
	segments: readonly PlacementPdfHighlightSegment[],
	fallbackText: string,
): Content {
	const runs: ContentText[] = [];
	for (const seg of segments) {
		if (!seg.text) continue;
		if (seg.kind === "text") {
			runs.push({ text: seg.text, color: COLOR_INK });
			continue;
		}
		const palette =
			ERROR_CATEGORY_PALETTE[seg.category] ?? ERROR_CATEGORY_PALETTE.grammar;
		runs.push(
			{
				text: seg.text,
				color: COLOR_INK,
				background: palette.softBg,
				decoration: "underline",
				decorationColor: palette.accent,
			},
			{
				text: ` [${seg.number}]`,
				bold: true,
				fontSize: 8,
				color: palette.accent,
				background: palette.softBg,
			},
		);
	}

	const textContent: ContentText =
		runs.length > 0
			? { text: runs, fontSize: 9.5, lineHeight: 1.65 }
			: { text: fallbackText, fontSize: 9.5, lineHeight: 1.65 };

	return {
		margin: [0, 0, 0, 8],
		table: {
			widths: ["*"],
			body: [[{ ...textContent, fillColor: COLOR_SURFACE }]],
		},
		layout: PROSE_BOX_LAYOUT,
	};
}

function buildErrorCard(error: PlacementPdfNumberedError): Content {
	const palette =
		ERROR_CATEGORY_PALETTE[error.category] ?? ERROR_CATEGORY_PALETTE.grammar;
	const fixRuns: ContentText[] = [
		{
			text: error.quote,
			decoration: "lineThrough",
			color: COLOR_MUTED,
		},
	];
	if (error.correction.trim()) {
		fixRuns.push(
			{
				text: "  ->  ",
				bold: true,
				color: COLOR_MUTED,
			},
			{
				text: error.correction,
				bold: true,
				color: COLOR_BRAND,
			},
		);
	}

	const cardStack: Content[] = [
		{
			text: [
				{
					text: `[${error.number}] `,
					bold: true,
					fontSize: 9.5,
					color: palette.accent,
				},
				{
					text: error.categoryLabel,
					bold: true,
					fontSize: 9.5,
					color: COLOR_INK,
				},
			],
		},
		{
			text: fixRuns,
			fontSize: 9.5,
			margin: [0, 3, 0, 0],
			lineHeight: 1.4,
		},
	];

	const compactExplanation = error.explanation
		.trim()
		.replace(/\n{3,}/g, "\n\n");
	if (compactExplanation) {
		cardStack.push({
			text: compactExplanation,
			fontSize: 9,
			color: COLOR_INK_SECONDARY,
			margin: [0, 3, 0, 0],
			lineHeight: 1.4,
		});
	}

	const totalLineBreaks =
		(error.quote.match(/\n/g)?.length ?? 0) +
		(error.correction.match(/\n/g)?.length ?? 0) +
		(compactExplanation.match(/\n/g)?.length ?? 0);
	const totalChars =
		error.quote.length + error.correction.length + compactExplanation.length;
	const keepTogether = totalLineBreaks <= 20 && totalChars <= 900;

	const cardLayout: TableLayout = {
		hLineWidth: () => 0.6,
		vLineWidth: (colIdx) => (colIdx === 0 ? 3 : 0.6),
		hLineColor: () => COLOR_BORDER,
		vLineColor: (colIdx) => (colIdx === 0 ? palette.accent : COLOR_BORDER),
		paddingLeft: () => 9,
		paddingRight: () => 9,
		paddingTop: () => 6,
		paddingBottom: () => 6,
	};

	return {
		margin: [0, 0, 0, 6],
		...(keepTogether ? { unbreakable: true } : {}),
		table: {
			dontBreakRows: keepTogether,
			widths: ["*"],
			body: [[{ stack: cardStack, fillColor: COLOR_WHITE }]],
		},
		layout: cardLayout,
	};
}

function buildErrorListBlocks(
	errors: readonly PlacementPdfNumberedError[],
): Content[] {
	if (errors.length === 0) {
		return [
			{
				text: PDF_NO_ERRORS_TEXT,
				italics: true,
				fontSize: 9.5,
				color: COLOR_MUTED,
				margin: [0, 2, 0, 4],
			},
		];
	}
	return [
		{
			text: `Chi tiết lỗi cần chỉnh sửa (${errors.length} lỗi)`,
			bold: true,
			fontSize: 9.5,
			color: COLOR_INK_SECONDARY,
			margin: [0, 4, 0, 6],
		},
		...errors.map(buildErrorCard),
	];
}

/** Dựng `TDocumentDefinitions` cho `pdfmake` từ model phiếu kết quả đã chuẩn hóa. */
export function buildPlacementResultDocDefinition(
	model: PlacementResultPdfModel,
): TDocumentDefinitions {
	const content: Content[] = [];

	// --- Brand Header & Student Meta ---
	content.push({
		unbreakable: true,
		stack: [
			{
				canvas: [
					{
						type: "rect",
						x: 0,
						y: 0,
						w: PAGE_CONTENT_WIDTH,
						h: 3.5,
						color: COLOR_BRAND,
					},
				],
				margin: [0, 0, 0, 10],
			},
			{
				text: model.brandName,
				fontSize: 9,
				bold: true,
				color: COLOR_BRAND,
				characterSpacing: 0.8,
			},
			{
				text: model.reportTitle,
				fontSize: 15,
				bold: true,
				color: COLOR_INK,
				margin: [0, 3, 0, 10],
			},
			{
				table: {
					dontBreakRows: true,
					widths: ["*", "*"],
					body: [
						[
							{
								colSpan: 2,
								text: [
									{ text: "Học viên: ", color: COLOR_MUTED, fontSize: 9.5 },
									{
										text: model.studentName,
										bold: true,
										color: COLOR_INK,
										fontSize: 10,
									},
								],
								fillColor: COLOR_SURFACE,
							},
							{},
						],
						[
							{
								text: [
									{ text: "Ngày làm bài: ", color: COLOR_MUTED, fontSize: 9.5 },
									{
										text: model.submittedDate,
										bold: true,
										color: COLOR_INK,
										fontSize: 9.5,
									},
								],
								fillColor: COLOR_SURFACE,
							},
							{
								text: [
									{ text: "Ngày chấm: ", color: COLOR_MUTED, fontSize: 9.5 },
									{
										text: model.gradedDate,
										bold: true,
										color: COLOR_INK,
										fontSize: 9.5,
									},
								],
								fillColor: COLOR_SURFACE,
							},
						],
					],
				},
				layout: BORDERED_TABLE_LAYOUT,
				margin: [0, 0, 0, 10],
			},
		],
	});

	// --- Overview Summary (3 cards) ---
	content.push({
		unbreakable: true,
		margin: [0, 0, 0, 6],
		table: {
			dontBreakRows: true,
			widths: ["*", "*", "*"],
			body: [
				[
					{
						fillColor: COLOR_BRAND_SOFT,
						stack: [
							{
								text: "Trình độ (CEFR)",
								fontSize: 8.5,
								color: COLOR_MUTED,
							},
							{
								text: model.overview.cefr,
								fontSize: 15,
								bold: true,
								color: COLOR_BRAND,
								margin: [0, 3, 0, 0],
							},
						],
					},
					{
						fillColor: COLOR_BRAND_SOFT,
						stack: [
							{
								text: "Khóa học đề xuất",
								fontSize: 8.5,
								color: COLOR_MUTED,
							},
							{
								text: model.overview.recommendedCourse,
								fontSize: 11.5,
								bold: true,
								color: COLOR_INK,
								margin: [0, 4, 0, 0],
							},
						],
					},
					{
						fillColor: COLOR_BRAND_SOFT,
						stack: [
							{
								text: "Điểm tổng hợp",
								fontSize: 8.5,
								color: COLOR_MUTED,
							},
							{
								text: model.overview.overallScorePct,
								fontSize: 15,
								bold: true,
								color: COLOR_BRAND,
								margin: [0, 3, 0, 0],
							},
						],
					},
				],
			],
		},
		layout: OVERVIEW_CARD_LAYOUT,
	});

	let sectionIndex = 1;

	// --- Section 1: Objective 3 skills ---
	content.push(
		buildSectionHeading(sectionIndex, "Điểm 3 kỹ năng trắc nghiệm"),
		{
			unbreakable: true,
			margin: [0, 0, 0, 4],
			table: {
				dontBreakRows: true,
				widths: ["*", "*", "*"],
				body: [
					model.objectiveSkills.map((skill) => ({
						text: skill.label,
						bold: true,
						fontSize: 9,
						color: COLOR_INK_SECONDARY,
						fillColor: COLOR_HEADER_BG,
						alignment: "center" as const,
					})),
					model.objectiveSkills.map((skill) => ({
						text: skill.scoreText,
						bold: true,
						fontSize: 11,
						color: COLOR_INK,
						alignment: "center" as const,
					})),
				],
			},
			layout: BORDERED_TABLE_LAYOUT,
		},
	);
	sectionIndex += 1;

	// --- Section 2: Writing ---
	content.push(
		buildSectionHeading(sectionIndex, "Writing", model.writing.totalText),
	);
	if (model.writing.criteria) {
		content.push(
			buildRubricTable(model.writing.criteria, model.writing.isIelts),
		);
	}

	const writingTitle =
		model.writing.wordCount > 0
			? `Bài viết của học viên (${model.writing.wordCount} từ)`
			: "Bài viết của học viên";
	content.push({
		text: writingTitle,
		bold: true,
		fontSize: 10,
		color: COLOR_INK,
		margin: [0, 2, 0, 4],
	});

	if (model.writing.text.trim().length > 0) {
		content.push(
			buildErrorLegend("writing"),
			buildAnnotatedTextBox(model.writing.segments, model.writing.text),
			...buildErrorListBlocks(model.writing.errors),
		);
	} else {
		content.push({
			text: PDF_EMPTY_WRITING_TEXT,
			italics: true,
			fontSize: 9.5,
			color: COLOR_MUTED,
			margin: [0, 0, 0, 4],
		});
		if (model.writing.errors.length > 0) {
			content.push(...buildErrorListBlocks(model.writing.errors));
		}
	}
	sectionIndex += 1;

	// --- Section 3: Speaking ---
	if (model.speaking.hasContent) {
		content.push(
			buildSectionHeading(sectionIndex, "Speaking", model.speaking.totalText),
		);
		if (model.speaking.skippedNotice) {
			content.push({
				text: model.speaking.skippedNotice,
				italics: true,
				fontSize: 9.5,
				color: COLOR_MUTED,
				margin: [0, 0, 0, 4],
			});
		}
		if (model.speaking.criteria) {
			content.push(
				buildRubricTable(model.speaking.criteria, model.speaking.isIelts),
			);
		}
		if (model.speaking.transcript.trim().length > 0) {
			content.push(
				{
					text: "Transcript bài nói của học viên",
					bold: true,
					fontSize: 10,
					color: COLOR_INK,
					margin: [0, 2, 0, 4],
				},
				buildErrorLegend("speaking"),
				buildAnnotatedTextBox(
					model.speaking.segments,
					model.speaking.transcript,
				),
				...buildErrorListBlocks(model.speaking.errors),
			);
		} else if (model.speaking.errors.length > 0) {
			content.push(...buildErrorListBlocks(model.speaking.errors));
		}
		sectionIndex += 1;
	}

	// --- Section 4: Feedback & Roadmap ---
	if (model.feedbackBlocks.length > 0) {
		content.push(buildSectionHeading(sectionIndex, "Nhận xét & Lộ trình"));
		for (const block of model.feedbackBlocks) {
			content.push({
				margin: [0, 0, 0, 8],
				table: {
					widths: ["*"],
					body: [
						[
							{
								fillColor: COLOR_SURFACE,
								stack: [
									{
										text: block.title,
										bold: true,
										fontSize: 9.5,
										color: COLOR_BRAND,
										margin: [0, 0, 0, 3],
									},
									{
										text: block.body,
										fontSize: 9.5,
										color: COLOR_INK,
										lineHeight: 1.5,
									},
								],
							},
						],
					],
				},
				layout: PROSE_BOX_LAYOUT,
			});
		}
	}

	return {
		pageSize: "A4",
		pageMargins: [PAGE_MARGIN_X, 36, PAGE_MARGIN_X, 48],
		info: {
			title: `Phiếu kết quả đầu vào - ${model.studentName}`,
			author: "Cô Đỗ Thục Mỹ - The English Corner",
			subject: "Phiếu kết quả bài kiểm tra đầu vào 5 kỹ năng",
		},
		defaultStyle: {
			font: FONT_FAMILY,
			fontSize: 10,
			lineHeight: 1.45,
			color: COLOR_INK,
		},
		footer: (currentPage: number, pageCount: number): Content => ({
			margin: [PAGE_MARGIN_X, 10, PAGE_MARGIN_X, 0],
			stack: [
				{
					canvas: [
						{
							type: "line",
							x1: 0,
							y1: 0,
							x2: PAGE_CONTENT_WIDTH,
							y2: 0,
							lineWidth: 0.5,
							lineColor: COLOR_BORDER,
						},
					],
					margin: [0, 0, 0, 6],
				},
				{
					columns: [
						{
							text: model.footerSupportText,
							fontSize: 8.5,
							color: COLOR_MUTED,
							alignment: "left",
						},
						{
							text: `Trang ${currentPage} / ${pageCount}`,
							fontSize: 8.5,
							color: COLOR_MUTED,
							alignment: "right",
						},
					],
				},
			],
		}),
		content,
	};
}

/**
 * Sinh binary PDF vector khổ A4 từ bài làm đầu vào đã chấm.
 * Tự động tải lazy `pdfmake` và 4 file font `Be Vietnam Pro` self-host.
 */
export async function generatePlacementResultPdfBytes(
	submission: PlacementSubmissionDetail,
	options?: PlacementResultPdfOptions,
): Promise<Uint8Array<ArrayBuffer>> {
	const model = buildPlacementResultPdfModel(submission);
	const [pdfMake, fontVfs] = await Promise.all([
		loadPdfMake(),
		getFontVfs(options?.loadFont),
	]);

	pdfMake.addVirtualFileSystem(fontVfs);
	pdfMake.addFonts({
		[FONT_FAMILY]: {
			normal: FONT_FILES.normal,
			bold: FONT_FILES.bold,
			italics: FONT_FILES.italics,
			bolditalics: FONT_FILES.bolditalics,
		},
	});

	const docDefinition = buildPlacementResultDocDefinition(model);
	const rawBytes = await pdfMake.createPdf(docDefinition).getBuffer();
	return toArrayBufferBytes(rawBytes);
}

/**
 * Tạo và kích hoạt tải xuống file PDF phiếu kết quả trên trình duyệt.
 */
export async function exportPlacementResultPdf(
	submission: PlacementSubmissionDetail,
): Promise<void> {
	const bytes = await generatePlacementResultPdfBytes(submission);
	const filename = buildPlacementPdfFilename(submission.studentName);
	const url = URL.createObjectURL(
		new Blob([bytes], { type: "application/pdf" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.rel = "noopener";
	if (anchor.style) {
		anchor.style.display = "none";
	}
	document.body?.appendChild?.(anchor);
	try {
		anchor.click();
	} finally {
		anchor.remove?.();
		// Trì hoãn thu hồi Object URL để trình duyệt (Safari/Firefox) kịp bắt đầu tải file PDF.
		setTimeout(() => URL.revokeObjectURL(url), 1_000);
	}
}
