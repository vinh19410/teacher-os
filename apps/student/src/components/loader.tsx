import { Loader2 } from "lucide-react";

export function Loader() {
	return (
		<div className="flex h-full min-h-[50svh] items-center justify-center p-8">
			<Loader2 className="h-6 w-6 animate-spin text-muted-fg" />
		</div>
	);
}
export default Loader;
