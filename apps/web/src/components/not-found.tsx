export function NotFoundPage() {
	return (
		<div className="flex min-h-svh flex-col bg-bg text-fg">
			{/* Top bar with wordmark */}
			<header className="flex h-16 items-center justify-between border-line border-b px-6 lg:px-12">
				<a
					href="/"
					className="inline-flex items-center gap-3 transition-opacity hover:opacity-90"
					aria-label="Teacher OS - Trang chủ"
				>
					<span className="font-mono text-xs uppercase tracking-[0.25em]">
						Teacher<span className="text-hot">/</span>OS
					</span>
				</a>
			</header>

			{/* Main 404 content */}
			<main className="flex flex-1 items-center justify-center p-6">
				<div className="mx-auto max-w-md text-center">
					<div className="mb-4 inline-flex items-center justify-center font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
						Lỗi 404 · Không tìm thấy trang
					</div>
					<h1 className="font-display font-extrabold text-5xl text-fg leading-[0.95] tracking-[-0.045em] sm:text-7xl">
						404
					</h1>
					<h2 className="mt-3 font-display font-extrabold text-2xl text-fg tracking-[-0.02em]">
						Trang không tồn tại
					</h2>
					<p className="mt-3 text-muted-fg text-sm leading-relaxed sm:text-base">
						Đường dẫn bạn truy cập không tồn tại hoặc đã được chuyển sang địa
						chỉ khác. Vui lòng kiểm tra lại URL.
					</p>

					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<a
							href="/dashboard"
							className="inline-flex items-center gap-2 rounded-lg bg-fg px-6 py-2.5 font-medium text-bg text-sm transition-colors hover:bg-hot hover:text-accent-on active:scale-[0.98]"
						>
							Về bảng điều khiển
						</a>
						<a
							href="/login"
							className="neu-sm inline-flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium text-fg text-sm transition-colors active:scale-[0.98]"
						>
							Đăng nhập
						</a>
					</div>
				</div>
			</main>

			{/* Footer */}
			<footer className="border-line border-t py-4 text-center font-mono text-[10px] text-meta uppercase tracking-[0.18em]">
				© 2022 Teacher OS · Quản lý lớp gia sư 1:1
			</footer>
		</div>
	);
}

export default NotFoundPage;
