// Hand-drawn spot illustrations ported from teacheros-design@fcf60a5
// (src/lib/art.tsx). Strokes and fills resolve through theme tokens so the
// drawings re-ink themselves when the theme toggles. The decorative
// handwritten font from the design is replaced by the display font.
const S = {
	stroke: "var(--foreground)",
	strokeWidth: 2.5,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

type IllustrationProps = {
	className?: string;
	/** Pure decoration: hide from assistive tech (aria-label omitted). */
	decorative?: boolean;
};

/* Teacher at a desk with a stack of IELTS papers, a mug and a plant */
export function TeacherDesk({ className, decorative }: IllustrationProps) {
	return (
		<svg
			viewBox="0 0 420 320"
			className={className}
			role={decorative ? undefined : "img"}
			aria-label={
				decorative ? undefined : "Minh họa giáo viên đọc bài ở bàn làm việc"
			}
			aria-hidden={decorative || undefined}
		>
			<circle cx="320" cy="70" r="38" fill="var(--muted)" {...S} />
			<path
				d="M40 70c20-14 40-14 60 0M60 100c14-10 28-10 42 0"
				fill="none"
				{...S}
				strokeWidth={2.5}
			/>
			<rect
				x="30"
				y="236"
				width="360"
				height="22"
				rx="8"
				fill="var(--muted)"
				{...S}
			/>
			<path d="M60 258v50M360 258v50" {...S} />
			{/* teacher */}
			<path
				d="M150 236c0-58 22-92 62-92s62 34 62 92z"
				fill="var(--card)"
				{...S}
			/>
			<circle cx="212" cy="108" r="34" fill="var(--card)" {...S} />
			<path
				d="M178 104c0-30 18-44 38-44 24 0 38 16 32 46-10-14-30-20-50-14-8 2-14 6-20 12z"
				fill="var(--foreground)"
				{...S}
			/>
			<circle cx="200" cy="112" r="7" fill="none" {...S} strokeWidth={2.5} />
			<circle cx="224" cy="112" r="7" fill="none" {...S} strokeWidth={2.5} />
			<path
				d="M207 112h10M204 128c5 4 11 4 16 0"
				fill="none"
				{...S}
				strokeWidth={2.5}
			/>
			{/* papers */}
			<path d="M170 236l10-50 68 10-10 40z" fill="var(--card)" {...S} />
			<path d="M186 202l46 7M184 214l42 6" {...S} strokeWidth={2} />
			<text
				x="196"
				y="232"
				fontFamily="var(--)"
				fontWeight="800"
				fontSize="16"
				fill="var(--muted)"
				transform="rotate(8 200 230)"
			>
				7.5
			</text>
			{/* mug */}
			<rect
				x="290"
				y="200"
				width="34"
				height="36"
				rx="6"
				fill="var(--card)"
				{...S}
			/>
			<path
				d="M324 210c12 0 12 18 0 18M300 188c-4-8 4-10 0-18M312 188c-4-8 4-10 0-18"
				fill="none"
				{...S}
				strokeWidth={2.5}
			/>
			{/* plant */}
			<path d="M70 236h44l-6-30H76z" fill="var(--muted)" {...S} />
			<path
				d="M92 206c0-30-20-40-30-44 0 20 10 34 30 44zM92 206c0-34 18-46 32-50 0 24-12 40-32 50z"
				fill="var(--card)"
				{...S}
			/>
		</svg>
	);
}

/* Small sun + open book spot for dashboard greeting */
export function MorningSpot({ className, decorative }: IllustrationProps) {
	return (
		<svg
			viewBox="0 0 220 130"
			className={className}
			role={decorative ? undefined : "img"}
			aria-label={
				decorative ? undefined : "Minh họa cuốn sách mở dưới mặt trời"
			}
			aria-hidden={decorative || undefined}
		>
			<circle cx="160" cy="44" r="26" fill="var(--muted)" {...S} />
			<path d="M160 6v8M196 44h-8M186 18l-6 6M134 18l6 6" {...S} />
			<path
				d="M20 112c30-14 60-14 86 0V46C80 32 50 32 20 46z"
				fill="var(--card)"
				{...S}
			/>
			<path
				d="M192 112c-30-14-60-14-86 0V46c26-14 56-14 86 0z"
				fill="var(--card)"
				{...S}
			/>
			<path
				d="M36 62c18-6 36-6 54 0M36 78c18-6 36-6 54 0M122 62c18-6 36-6 54 0"
				{...S}
				strokeWidth={2}
			/>
			<path
				d="M128 86l10 10 22-24"
				fill="none"
				stroke="var(--muted)"
				strokeWidth={4}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* Student with headphones on a stack of books */
export function StudentSpot({ className, decorative }: IllustrationProps) {
	return (
		<svg
			viewBox="0 0 220 150"
			className={className}
			role={decorative ? undefined : "img"}
			aria-label={
				decorative
					? undefined
					: "Minh họa học viên đeo tai nghe ngồi trên chồng sách"
			}
			aria-hidden={decorative || undefined}
		>
			<rect
				x="40"
				y="112"
				width="130"
				height="18"
				rx="5"
				fill="var(--muted)"
				{...S}
			/>
			<rect
				x="52"
				y="94"
				width="110"
				height="18"
				rx="5"
				fill="var(--card)"
				{...S}
			/>
			<path
				d="M86 94c0-30 10-44 26-44s26 14 26 44z"
				fill="var(--muted)"
				{...S}
			/>
			<circle cx="112" cy="36" r="20" fill="var(--card)" {...S} />
			<path
				d="M90 38c0-18 10-26 22-26s22 8 22 26"
				fill="none"
				{...S}
				strokeWidth={4}
			/>
			<rect
				x="84"
				y="32"
				width="10"
				height="16"
				rx="4"
				fill="var(--foreground)"
			/>
			<rect
				x="130"
				y="32"
				width="10"
				height="16"
				rx="4"
				fill="var(--foreground)"
			/>
			<path d="M106 42c4 3 8 3 12 0" fill="none" {...S} strokeWidth={2.5} />
			<path
				d="M180 30l4 8 8 2-8 3-4 8-3-8-8-3 8-2z"
				fill="var(--muted)"
				{...S}
				strokeWidth={2}
			/>
			<path d="M30 50c6-6 14-6 20 0" fill="none" {...S} strokeWidth={2.5} />
		</svg>
	);
}
