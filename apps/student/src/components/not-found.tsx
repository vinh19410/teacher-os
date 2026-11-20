import { NotFoundPage as SharedNotFoundPage } from "@teacher-os/ui/components/not-found-page";

export function NotFoundPage() {
	return <SharedNotFoundPage homeHref="/student" homeLabel="Về trang chủ" />;
}

export default NotFoundPage;
