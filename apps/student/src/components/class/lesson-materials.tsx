import type { StudentLessonMaterialView } from "@teacher-os/api/material-contracts";
import {
	Download,
	ExternalLink,
	FileText,
	Film,
	Link2,
	Music,
	Paperclip,
} from "lucide-react";
import { useId, useState } from "react";
import { HttpError } from "@/lib/query-client";
import { lessonMaterialFileUrl, useLessonMaterials } from "@/lib/repos/student";

const ACTION_CLASS =
	"inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 font-medium text-xs shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-3.5";

/** Dung lượng dễ đọc (hệ thập phân, 1 chữ số thập phân khi < 10). */
export function formatFileSize(bytes: number | null): string {
	if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
	if (bytes < 1000) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes;
	let unit = "B";
	for (const next of units) {
		if (value < 1000) break;
		value /= 1000;
		unit = next;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}

function isVideo(m: StudentLessonMaterialView): boolean {
	return m.mimeType?.startsWith("video/") ?? false;
}

function KindIcon({ material }: { material: StudentLessonMaterialView }) {
	const cls = "size-4";
	if (material.kind === "link")
		return <Link2 aria-hidden="true" className={cls} />;
	if (material.kind === "media") {
		return isVideo(material) ? (
			<Film aria-hidden="true" className={cls} />
		) : (
			<Music aria-hidden="true" className={cls} />
		);
	}
	return <FileText aria-hidden="true" className={cls} />;
}

function MaterialRow({
	material,
	classId,
	date,
}: {
	material: StudentLessonMaterialView;
	classId: string;
	date: string;
}) {
	const size = formatFileSize(material.sizeBytes);
	const fileUrl = lessonMaterialFileUrl(classId, date, material.id);
	const downloadUrl = lessonMaterialFileUrl(classId, date, material.id, true);
	return (
		<li
			data-testid="lesson-material"
			data-kind={material.kind}
			className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
		>
			<div className="flex flex-wrap items-start gap-3">
				<span
					aria-hidden="true"
					className="grid size-8 flex-none place-items-center rounded-md bg-muted text-muted-foreground"
				>
					<KindIcon material={material} />
				</span>
				<div className="min-w-0 flex-1">
					<p className="break-words font-medium text-sm">{material.title}</p>
					{material.description && (
						<p className="mt-0.5 whitespace-pre-line break-words text-muted-foreground text-xs">
							{material.description}
						</p>
					)}
					{size && (
						<p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
							{size}
						</p>
					)}
				</div>
				<div className="flex flex-none gap-2">
					{material.kind === "link" && material.url ? (
						<a
							href={material.url}
							target="_blank"
							rel="noopener noreferrer"
							className={ACTION_CLASS}
						>
							<ExternalLink aria-hidden="true" />
							Mở liên kết
							<span className="sr-only"> (tab mới): {material.title}</span>
						</a>
					) : (
						<>
							<a
								href={fileUrl}
								target="_blank"
								rel="noopener noreferrer"
								className={ACTION_CLASS}
							>
								<ExternalLink aria-hidden="true" />
								Mở<span className="sr-only"> {material.title}</span>
							</a>
							<a href={downloadUrl} className={ACTION_CLASS}>
								<Download aria-hidden="true" />
								Tải<span className="sr-only"> {material.title}</span>
							</a>
						</>
					)}
				</div>
			</div>
			{material.kind === "media" &&
				(isVideo(material) ? (
					// biome-ignore lint/a11y/useMediaCaption: tài liệu giáo viên tải lên, không có track phụ đề
					<video
						controls
						preload="none"
						src={fileUrl}
						aria-label={material.title}
						className="max-h-80 w-full rounded-md bg-muted"
					/>
				) : (
					// biome-ignore lint/a11y/useMediaCaption: tài liệu giáo viên tải lên, không có track phụ đề
					<audio
						controls
						preload="none"
						src={fileUrl}
						aria-label={material.title}
						className="w-full"
					/>
				))}
		</li>
	);
}

/** Danh sách tài liệu (chỉ đọc) của một buổi học: loading / empty / error. */
export function LessonMaterials({
	classId,
	date,
}: {
	classId: string;
	date: string;
}) {
	const query = useLessonMaterials(classId, date, true);
	const notFound =
		query.error instanceof HttpError && query.error.status === 404;

	if (query.isLoading) {
		return (
			<p role="status" className="text-muted-foreground text-sm">
				Đang tải tài liệu…
			</p>
		);
	}
	if (query.isError && !notFound) {
		return (
			<p role="alert" className="text-destructive text-sm">
				Không tải được tài liệu. Vui lòng thử lại sau ít phút.
			</p>
		);
	}
	const items = notFound ? [] : (query.data ?? []);
	if (items.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">Buổi này chưa có tài liệu</p>
		);
	}
	return (
		<ul className="divide-y">
			{items.map((m) => (
				<MaterialRow key={m.id} material={m} classId={classId} date={date} />
			))}
		</ul>
	);
}

/** Nút mở/đóng mục "Tài liệu" của buổi; chỉ tải dữ liệu khi mở lần đầu. */
export function LessonMaterialsDisclosure({
	classId,
	date,
}: {
	classId: string;
	date: string;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	return (
		<div className="mt-2 w-full">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((v) => !v)}
				className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-3.5"
			>
				<Paperclip aria-hidden="true" />
				Tài liệu
			</button>
			<section
				id={panelId}
				aria-label="Tài liệu của buổi học"
				hidden={!open}
				className="mt-2 rounded-lg border bg-background p-3"
			>
				{open && <LessonMaterials classId={classId} date={date} />}
			</section>
		</div>
	);
}
