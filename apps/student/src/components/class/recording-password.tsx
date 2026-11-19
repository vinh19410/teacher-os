import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const COPIED_RESET_MS = 2000;

export function RecordingPassword({
	password,
	className,
}: {
	password: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
		return () => clearTimeout(timer);
	}, [copied]);

	async function copy() {
		try {
			await navigator.clipboard.writeText(password);
			setCopied(true);
		} catch {
			// Clipboard can be unavailable (insecure context); the passcode stays visible.
		}
	}

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 text-muted-foreground text-xs",
				className,
			)}
		>
			Mật khẩu: <span className="font-mono text-foreground">{password}</span>
			<button
				type="button"
				aria-label="Sao chép mật khẩu recording"
				onClick={() => void copy()}
				className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				{copied ? (
					<Check aria-hidden="true" className="size-3.5 text-success" />
				) : (
					<Copy aria-hidden="true" className="size-3.5" />
				)}
			</button>
			<span role="status" aria-live="polite" className="sr-only">
				{copied ? "Đã sao chép mật khẩu" : ""}
			</span>
		</span>
	);
}
