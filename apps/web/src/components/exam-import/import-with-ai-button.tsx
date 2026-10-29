import { Link } from "@tanstack/react-router";
import { CREDIT_COSTS } from "@teacher-os/api/contracts";
import { buttonVariants } from "@/components/ui/button";
import { AI_ENABLED } from "@/lib/features";

/**
 * Nút dẫn tới màn Nhập đề AI — đặt trên PageHead của route "Full test mới"
 * (tests/new.tsx). Định nghĩa tại đây để tránh route file import chéo nhau.
 */
export function ImportWithAiButton() {
	if (!AI_ENABLED) return null;
	return (
		<Link
			to="/assignments/tests/import"
			className={buttonVariants({ variant: "default" })}
		>
			Nhập đề bằng AI ({CREDIT_COSTS.examImport} Credit)
		</Link>
	);
}
