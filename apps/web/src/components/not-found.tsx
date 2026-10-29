import { NotFoundPage as SharedNotFoundPage } from "@teacher-os/ui/components/not-found-page";

export function NotFoundPage() {
	return (
		<SharedNotFoundPage homeHref="/dashboard" homeLabel="Về bảng điều khiển" />
	);
}

export default NotFoundPage;
