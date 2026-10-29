export interface NotFoundPageProps {
	/** Primary action: where this app's signed-in home lives. */
	homeHref: string;
	homeLabel: string;
}

/** Branded 404 shared by the teacher, student and admin apps (#489). */
export function NotFoundPage({ homeHref, homeLabel }: NotFoundPageProps) {
	return (
		<div className="flex min-h-svh flex-col bg-background text-foreground">
			{/* Top bar with wordmark */}
			<header className="flex h-16 items-center justify-between border-b px-6 lg:px-12">
				<a
					href="/"
					className="inline-flex items-center gap-2 font-medium transition-opacity hover:opacity-90"
					aria-label="Teacher OS - Trang chủ"
				>
					<span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						TS
					</span>
					Teacher OS
				</a>
			</header>

			{/* Main 404 content */}
			<main className="flex flex-1 items-center justify-center p-6">
				<div className="mx-auto max-w-md text-center">
					<div className="mb-4 inline-flex items-center justify-center text-muted-foreground text-xs uppercase tracking-[0.2em]">
						Lỗi 404 · Không tìm thấy trang
					</div>
					<h1 className="font-semibold text-7xl tracking-tight sm:text-8xl">
						404
					</h1>
					<h2 className="mt-3 font-semibold text-2xl tracking-tight">
						Trang không tồn tại
					</h2>
					<p className="mt-3 text-muted-foreground text-sm leading-relaxed sm:text-base">
						Đường dẫn bạn truy cập không tồn tại hoặc đã được chuyển sang địa
						chỉ khác. Vui lòng kiểm tra lại URL.
					</p>

					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<a
							href={homeHref}
							className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm shadow-xs transition-all hover:bg-primary/90"
						>
							{homeLabel}
						</a>
						<a
							href="/login"
							className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs transition-all hover:bg-accent hover:text-accent-foreground"
						>
							Đăng nhập
						</a>
					</div>
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t py-4 text-center text-muted-foreground text-xs">
				© 2022 Teacher OS · Quản lý lớp gia sư 1:1
			</footer>
		</div>
	);
}
