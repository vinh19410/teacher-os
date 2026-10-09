/*
 * Auto-fill the "Apply to the Claude Startups program" form.
 *
 * Usage: open the application page while signed in, open DevTools Console,
 * paste this whole file, press Enter. Review the form, then either tick the
 * terms checkbox + click "Submit application" yourself, or set
 * acceptTerms/autoSubmit to true below before pasting.
 *
 * Select fields take a list of candidate option labels; the first option whose
 * text contains a candidate (case-insensitive) wins.
 */
(async () => {
	const CONFIG = {
		companyName: "TeacherOS",
		jobTitle: "Founder",
		companyWebsite: "https://teacheros.io.vn",
		country: ["Vietnam", "Viet Nam"],
		city: "", // optional, e.g. "Ho Chi Minh City"
		industry: ["Education", "EdTech", "Ed Tech"],
		foundedMonth: ["August", "Aug"],
		foundedYear: ["2026"],
		fundingRound: [
			"Bootstrapped",
			"None",
			"No funding",
			"Not raised",
			"Pre-seed",
		],
		raisedOutsideFunding: false,
		investors: "",
		anthropicSpendShare: ["100%", "76", "75", "Over 75", "More than 75"],
		supportFromAnthropic:
			"Solo-founder EdTech in Vietnam: TeacherOS is built end-to-end with Claude Code (~700 commits in 8 weeks), and Claude is our only AI provider. We want: (1) API credits to launch Claude-powered IELTS Writing/Speaking feedback for students; (2) Applied AI guidance on prompt caching, Batch API and evals for consistent band scoring in Vietnamese + English; (3) best practices for multi-agent Claude Code workflows so one founder can ship like a team.",
		buildingOnClaude:
			"TeacherOS is an all-in-one workspace for independent IELTS/English teachers in Vietnam: classes, schedule, attendance, tuition invoices with bank-transfer matching, assignments and a student portal. Claude Code designs, tests and ships the product. Next, Claude becomes the in-app copilot: band-score feedback on Writing/Speaking, auto-drafted lesson plans and progress reports, and smart tuition reminders, so one teacher can run more classes with less admin.",
		linkedin: "", // optional, e.g. "linkedin.com/in/yourname"
		emailUpdates: true,
		acceptTerms: false,
		autoSubmit: false,
	};

	const MAX_CHARS = 500;
	const CONTROL =
		'input:not([type="hidden"]), textarea, select, button[role="combobox"], [role="combobox"]';
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
	const failures = [];

	for (const key of ["supportFromAnthropic", "buildingOnClaude"]) {
		if (CONFIG[key].length > MAX_CHARS) {
			throw new Error(
				`${key} is ${CONFIG[key].length} chars (max ${MAX_CHARS})`,
			);
		}
	}

	const isAfter = (anchor, el) =>
		Boolean(
			anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
		);

	// Deepest visible element whose text starts with `text` (usually the label).
	function findAnchor(text) {
		const q = norm(text);
		const hits = [
			...document.querySelectorAll("label, legend, span, p, div, h2, h3, h4"),
		].filter(
			(el) => el.offsetParent !== null && norm(el.textContent).startsWith(q),
		);
		hits.sort((a, b) => a.textContent.length - b.textContent.length);
		return hits[0] ?? null;
	}

	// The `count` controls that follow a label inside its nearest shared container.
	function controlsFor(labelText, count = 1, selector = CONTROL) {
		const anchor = findAnchor(labelText);
		if (!anchor) return [];
		if (count === 1 && anchor.htmlFor) {
			const byId = document.getElementById(anchor.htmlFor);
			if (byId) return [byId];
		}
		for (
			let node = anchor.parentElement;
			node && node !== document.body;
			node = node.parentElement
		) {
			const found = [...node.querySelectorAll(selector)].filter((c) =>
				isAfter(anchor, c),
			);
			if (found.length >= count) return found.slice(0, count);
		}
		return [];
	}

	// React tracks input values internally; use the native setter so onChange fires.
	function setNativeValue(el, value) {
		const proto =
			el instanceof HTMLTextAreaElement
				? HTMLTextAreaElement.prototype
				: HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
		el.dispatchEvent(new Event("input", { bubbles: true }));
		el.dispatchEvent(new Event("change", { bubbles: true }));
		el.dispatchEvent(new Event("blur", { bubbles: true }));
	}

	function pointerClick(el) {
		const opts = {
			bubbles: true,
			cancelable: true,
			button: 0,
			pointerType: "mouse",
		};
		el.dispatchEvent(new PointerEvent("pointerdown", opts));
		el.dispatchEvent(new MouseEvent("mousedown", opts));
		el.dispatchEvent(new PointerEvent("pointerup", opts));
		el.dispatchEvent(new MouseEvent("mouseup", opts));
		el.click();
	}

	function fillText(label, value) {
		if (!value) return;
		const [el] = controlsFor(
			label,
			1,
			"input:not([type]), input[type='text'], input[type='url'], textarea",
		);
		if (!el) return failures.push(label);
		setNativeValue(el, value);
	}

	async function pickOption(el, candidates, label) {
		if (el instanceof HTMLSelectElement) {
			const opt = [...el.options].find((o) =>
				candidates.some((c) => norm(o.text).includes(norm(c))),
			);
			if (!opt) return failures.push(`${label} (no matching option)`);
			Object.getOwnPropertyDescriptor(
				HTMLSelectElement.prototype,
				"value",
			).set.call(el, opt.value);
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return;
		}
		pointerClick(el);
		let options = [];
		for (let i = 0; i < 20 && options.length === 0; i++) {
			await sleep(100);
			options = [...document.querySelectorAll('[role="option"]')];
		}
		const match = candidates
			.map((c) => options.find((o) => norm(o.textContent).includes(norm(c))))
			.find(Boolean);
		if (!match) {
			console.warn(
				`[startups] ${label}: options were`,
				options.map((o) => o.textContent.trim()),
			);
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			);
			await sleep(150);
			return failures.push(`${label} (no matching option)`);
		}
		match.scrollIntoView({ block: "nearest" });
		pointerClick(match);
		await sleep(250);
	}

	async function fillSelect(label, candidates, index = 0, count = 1) {
		const el = controlsFor(label, count)[index];
		if (!el) return failures.push(label);
		await pickOption(
			el,
			candidates,
			count > 1 ? `${label} #${index + 1}` : label,
		);
	}

	function setCheckbox(text, checked) {
		const [box] = controlsFor(
			text,
			1,
			'input[type="checkbox"], button[role="checkbox"], [role="checkbox"]',
		);
		const anchor = findAnchor(text);
		const target =
			box ??
			anchor
				?.closest("label")
				?.querySelector('input[type="checkbox"], [role="checkbox"]') ??
			anchor?.parentElement?.querySelector(
				'input[type="checkbox"], [role="checkbox"]',
			);
		if (!target) return failures.push(text);
		const isChecked =
			target.checked ?? target.getAttribute("aria-checked") === "true";
		if (isChecked !== checked) target.click();
	}

	fillText("Company name", CONFIG.companyName);
	fillText("Job title", CONFIG.jobTitle);
	fillText("Company website", CONFIG.companyWebsite);
	await fillSelect("Country", CONFIG.country);
	fillText("City", CONFIG.city);
	await fillSelect("Industry", CONFIG.industry);
	await fillSelect("When was your company founded", CONFIG.foundedMonth, 0, 2);
	await fillSelect("When was your company founded", CONFIG.foundedYear, 1, 2);
	await fillSelect("Latest funding round", CONFIG.fundingRound);
	setCheckbox("We raised outside funding", CONFIG.raisedOutsideFunding);
	fillText("Investors", CONFIG.investors);
	fillText(
		"Where do you want support from Anthropic",
		CONFIG.supportFromAnthropic,
	);
	await fillSelect(
		"What % of your monthly AI spend",
		CONFIG.anthropicSpendShare,
	);
	fillText("What are you building on Claude", CONFIG.buildingOnClaude);
	fillText("Your LinkedIn", CONFIG.linkedin);
	setCheckbox(
		"I agree to receive Claude Startups program email updates",
		CONFIG.emailUpdates,
	);
	if (CONFIG.acceptTerms) setCheckbox("By submitting this application", true);

	if (failures.length) {
		console.warn("[startups] Fill these manually:", failures);
		return;
	}
	console.log("[startups] All fields filled.");

	if (CONFIG.acceptTerms && CONFIG.autoSubmit) {
		const submit = [...document.querySelectorAll("button")].find(
			(b) => norm(b.textContent) === "submit application",
		);
		if (!submit) return console.warn("[startups] Submit button not found");
		await sleep(300);
		submit.click();
		console.log("[startups] Submitted.");
	} else {
		console.log(
			"[startups] Review the form, tick the terms checkbox and click Submit application.",
		);
	}
})();
