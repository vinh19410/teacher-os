import { Link } from "@tanstack/react-router";

/**
 * Card CTA thuần dẫn từ `/vocab` dashboard sang catalog `/vocab/courses`.
 */
export function VocabCoursesCta() {
	return (
		<section className="space-y-3">
			<Link
				to="/vocab/courses"
				data-testid="vocab-courses-cta"
				className="neu group flex flex-wrap items-center justify-between gap-4 rounded-md p-5 transition-colors duration-150 hover:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40"
			>
				<div className="space-y-1.5">
					<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
						Thư viện từ vựng · 20 khóa · 968 bài
					</p>
					<h2 className="font-display font-extrabold text-fg text-xl tracking-[-0.02em] group-hover:text-hot">
						Khóa học từ vựng
					</h2>
					<p className="text-meta text-sm">
						Tự chọn lộ trình từ vựng IELTS, TOEIC và giao tiếp theo chủ đề với
						hình ảnh minh họa và phát âm chuẩn.
					</p>
				</div>
				<span className="neu-sm shrink-0 rounded-md px-3.5 py-2 font-mono text-fg text-xs transition-colors group-hover:border-fg group-hover:text-hot">
					Khám phá khóa học →
				</span>
			</Link>
		</section>
	);
}
