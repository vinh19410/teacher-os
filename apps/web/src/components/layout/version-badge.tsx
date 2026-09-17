import { Badge } from "@/components/ui/badge";

export function VersionBadge() {
	return (
		<Badge
			variant="muted"
			data-testid="app-version"
			className="px-[7px] py-px font-medium font-mono text-[10px] tracking-[0.04em]"
		>
			v{__APP_VERSION__}
		</Badge>
	);
}
