import type { ReactNode } from "react";
import { Badge } from "./badge";

export function Tag({
	children,
	hot,
}: {
	children: ReactNode;
	/** Tag nổi bật (final-exam, invited, attention states) → badge đặc. */
	hot?: boolean;
}) {
	return <Badge variant={hot ? "default" : "secondary"}>{children}</Badge>;
}
