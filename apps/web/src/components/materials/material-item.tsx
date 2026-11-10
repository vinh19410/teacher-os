import {
	MATERIAL_MIME,
	type MaterialKind,
	type MaterialView,
} from "@teacher-os/api/material-contracts";
import {
	Download,
	ExternalLink,
	FileText,
	Link2,
	PlayCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatBytes, materialFileUrl } from "@/lib/repos/materials";

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
	file: "File",
	link: "Liên kết",
	media: "Audio/Video",
};

const KIND_ICONS: Record<MaterialKind, typeof FileText> = {
	file: FileText,
	link: Link2,
	media: PlayCircle,
};

/**
 * Projection tối thiểu để render một dòng tài liệu — dùng được cho cả
 * `MaterialView` (ngân hàng/buổi) lẫn `SyllabusBankMaterialRef` (#655):
 * không cột teacher-only (objectKey, người tạo, thư mục, số buổi dùng).
 */
export type MaterialRowItem = Pick<
	MaterialView,
	| "id"
	| "title"
	| "description"
	| "kind"
	| "url"
	| "mimeType"
	| "sizeBytes"
	| "originalName"
>;

/** Dòng phụ: định dạng · dung lượng (file) hoặc tên miền (link). */
export function materialMeta(item: MaterialRowItem): string {
	if (item.kind === "link") {
		try {
			return item.url ? new URL(item.url).hostname : "Liên kết";
		} catch {
			return "Liên kết";
		}
	}
	const label =
		(item.mimeType && MATERIAL_MIME[item.mimeType]?.label) ??
		MATERIAL_KIND_LABELS[item.kind];
	return item.sizeBytes ? `${label} · ${formatBytes(item.sizeBytes)}` : label;
}

/**
 * Nút mở/tải theo loại: link mở tab mới; audio/video phát inline + tải về;
 * tài liệu (server luôn trả attachment) chỉ có Tải xuống. Accessible name
 * kèm tiêu đề để phân biệt giữa nhiều dòng.
 */
export function MaterialOpenActions({ item }: { item: MaterialRowItem }) {
	const linkCls = buttonVariants({ variant: "ghost", size: "sm" });
	if (item.kind === "link") {
		return item.url ? (
			<a
				href={item.url}
				target="_blank"
				rel="noopener noreferrer"
				className={linkCls}
				aria-label={`Mở liên kết ${item.title}`}
			>
				<ExternalLink aria-hidden="true" />
				<span className="max-sm:sr-only">Mở</span>
			</a>
		) : null;
	}
	return (
		<>
			{item.kind === "media" && (
				<a
					href={materialFileUrl(item.id)}
					target="_blank"
					rel="noopener noreferrer"
					className={linkCls}
					aria-label={`Phát ${item.title}`}
				>
					<PlayCircle aria-hidden="true" />
					<span className="max-sm:sr-only">Phát</span>
				</a>
			)}
			<a
				href={materialFileUrl(item.id, true)}
				className={linkCls}
				aria-label={`Tải xuống ${item.title}`}
			>
				<Download aria-hidden="true" />
				<span className="max-sm:sr-only">Tải xuống</span>
			</a>
		</>
	);
}

/** Một tài liệu dạng hàng — dùng chung ở ngân hàng và buổi học. */
export function MaterialItem({
	item,
	detail,
	actions,
	className,
}: {
	item: MaterialRowItem;
	/** Dòng phụ thêm (thư mục, số buổi dùng…). */
	detail?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	const Icon = KIND_ICONS[item.kind];
	return (
		<li
			data-testid="material-item"
			className={cn(
				"flex flex-wrap items-start gap-3 rounded-lg border bg-card p-3",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
			>
				<Icon className="size-4" />
			</span>
			<div className="min-w-0 flex-1">
				<p className="break-words font-medium text-sm">{item.title}</p>
				{item.description && (
					<p className="mt-0.5 line-clamp-2 break-words text-muted-foreground text-xs">
						{item.description}
					</p>
				)}
				<p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
					<span>{materialMeta(item)}</span>
					{detail}
				</p>
			</div>
			{actions && (
				<div className="flex shrink-0 flex-wrap items-center gap-1 max-sm:w-full max-sm:justify-end">
					{actions}
				</div>
			)}
		</li>
	);
}
