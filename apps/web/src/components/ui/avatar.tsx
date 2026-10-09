import { isSafeAvatarSrc } from "@teacher-os/auth/avatar-policy";
import type { ImgHTMLAttributes } from "react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** e2e hooks ride data-* attributes straight onto the rendered <img>.
 * alt/loading/onError stay component-owned — callers cannot break them. */
export type AvatarImgProps = Omit<
	ImgHTMLAttributes<HTMLImageElement>,
	"src" | "alt" | "loading" | "onError"
> & {
	src?: string;
} & { [key: `data-${string}`]: string | undefined };

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
	sm: "w-8 h-8 text-[12px]",
	md: "w-10 h-10 text-[14px]",
	lg: "w-14 h-14 text-[18px]",
};

export function Avatar({
	text,
	src,
	size = "md",
	className,
	imgProps,
}: {
	text: string;
	/** Safe http(s)/data URL; anything else (or a failing load) falls back to initials. */
	src?: string | null;
	size?: Size;
	className?: string;
	/** Pass-through onto the <img> element — e2e hooks its testid here. */
	imgProps?: AvatarImgProps;
}) {
	// Error is keyed to the current src: one bad URL must not lock the initials
	// forever — when src changes the img renders again (the layout route never
	// remounts the sidebar).
	const [errorSrc, setErrorSrc] = useState<string | null>(null);
	const showImg = Boolean(src && isSafeAvatarSrc(src) && errorSrc !== src);

	return (
		<span
			className={cn(
				"neu-sm inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-medium text-hot",
				sizeClasses[size],
				className,
			)}
		>
			{showImg && src ? (
				<img
					key={src}
					src={src}
					alt=""
					loading="lazy"
					{...imgProps}
					className="h-full w-full object-cover"
					onError={() => setErrorSrc(src)}
				/>
			) : (
				text
			)}
		</span>
	);
}
