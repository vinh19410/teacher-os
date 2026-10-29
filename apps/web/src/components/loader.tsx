import { Loader2 } from "lucide-react";

/** Loader v2: spinner giữa màn, màu muted. */
export default function Loader() {
	return (
		<div className="flex h-full min-h-svh items-center justify-center p-6 text-muted-foreground">
			<Loader2 aria-hidden="true" className="size-6 animate-spin" />
		</div>
	);
}
