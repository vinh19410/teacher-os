import { pathToFileURL } from "node:url";
import { resolveDomainTopology } from "../src/topology.ts";

export const LEGACY_WORKER_IDS = ["web", "student", "admin"] as const;

export interface CloudflareWorkerDomainRecord {
	id: string;
	hostname: string;
	service: string;
	zone_id?: string;
}

export interface DetachLegacyDomainsResult {
	detached: Array<{ id: string; hostname: string; service: string }>;
	alreadyUnified: Array<{ hostname: string; service: string }>;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches only retired Teacher OS legacy frontend Workers (`web`, `student`,
 * `admin`) for the exact target Alchemy stage. Supports both Alchemy v2
 * `<stack>-<id>-<stage>-<suffix>` and `<stack>-<stage>-<id>-<suffix>` naming.
 */
export function isLegacyWorkerServiceName(
	service: string,
	stage: string,
): boolean {
	const normalized = service.trim().toLowerCase();
	const escapedStage = escapeRegExp(stage.trim().toLowerCase());
	if (!normalized || !escapedStage) {
		return false;
	}
	const idGroup = LEGACY_WORKER_IDS.join("|");
	const stackIdStage = new RegExp(
		`^teacher-os-(?:${idGroup})-${escapedStage}(?:-[a-z0-9]+)?$`,
	);
	const stackStageId = new RegExp(
		`^teacher-os-${escapedStage}-(?:${idGroup})(?:-[a-z0-9]+)?$`,
	);
	return stackIdStage.test(normalized) || stackStageId.test(normalized);
}

/**
 * Matches the unified `lms` Worker for the exact target Alchemy stage.
 */
export function isUnifiedLmsWorkerServiceName(
	service: string,
	stage: string,
): boolean {
	const normalized = service.trim().toLowerCase();
	const escapedStage = escapeRegExp(stage.trim().toLowerCase());
	if (!normalized || !escapedStage) {
		return false;
	}
	const stackIdStage = new RegExp(
		`^teacher-os-lms-${escapedStage}(?:-[a-z0-9]+)?$`,
	);
	const stackStageId = new RegExp(
		`^teacher-os-${escapedStage}-lms(?:-[a-z0-9]+)?$`,
	);
	return stackIdStage.test(normalized) || stackStageId.test(normalized);
}

async function listWorkerDomains(options: {
	accountId: string;
	apiToken: string;
	fetchImpl: typeof fetch;
}): Promise<CloudflareWorkerDomainRecord[]> {
	const { accountId, apiToken, fetchImpl } = options;
	const records: CloudflareWorkerDomainRecord[] = [];
	let page = 1;
	const perPage = 100;

	while (true) {
		const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/domains?page=${page}&per_page=${perPage}`;
		const res = await fetchImpl(url, {
			headers: {
				Authorization: `Bearer ${apiToken}`,
				Accept: "application/json",
			},
		});
		if (!res.ok) {
			throw new Error(
				`Failed to list Cloudflare Workers custom domains (HTTP ${res.status})`,
			);
		}
		const payload = (await res.json()) as {
			success?: boolean;
			result?: CloudflareWorkerDomainRecord[];
			result_info?: { total_pages?: number };
			errors?: Array<{ message?: string }>;
		};
		if (payload.success === false) {
			const msg =
				payload.errors
					?.map((e) => e.message)
					.filter(Boolean)
					.join("; ") || "unknown Cloudflare API error";
			throw new Error(`Cloudflare list domains failed: ${msg}`);
		}
		const batch = Array.isArray(payload.result) ? payload.result : [];
		records.push(...batch);
		const totalPages = payload.result_info?.total_pages ?? 1;
		if (page >= totalPages || batch.length === 0) {
			break;
		}
		page += 1;
	}

	return records;
}

/**
 * Detaches `app.<domain>`, `student.<domain>`, and `admin.<domain>` from the
 * retired legacy `web`/`student`/`admin` Workers before Alchemy attaches those
 * aliases to the unified `lms` Worker.
 *
 * Why this is needed: Alchemy evaluates and reconciles active resources (`lms`)
 * before deleting orphaned resources (`web`, `student`, `admin`). Cloudflare's
 * WorkerProvider refuses to attach a hostname that still belongs to another
 * Worker, so without detaching first the initial cutover fails during initial
 * reconciliation. Once `lms` owns the hostnames, every subsequent run is an
 * idempotent no-op.
 */
export async function detachLegacyWorkerDomains(options: {
	accountId: string;
	apiToken: string;
	appDomain: string;
	stage: string;
	fetchImpl?: typeof fetch;
	log?: (message: string) => void;
}): Promise<DetachLegacyDomainsResult> {
	const accountId = options.accountId.trim();
	const apiToken = options.apiToken.trim();
	const appDomain = options.appDomain.trim();
	const stage = options.stage.trim();
	const fetchImpl = options.fetchImpl ?? fetch;
	const log = options.log ?? ((msg: string) => console.log(msg));

	if (!accountId) {
		throw new Error("CLOUDFLARE_ACCOUNT_ID is required");
	}
	if (!apiToken) {
		throw new Error("CLOUDFLARE_API_TOKEN is required");
	}
	if (!appDomain) {
		throw new Error("APP_DOMAIN is required");
	}
	if (stage !== "staging" && stage !== "prod") {
		throw new Error(`Unsupported stage "${stage}" (expected staging or prod)`);
	}

	const topology = resolveDomainTopology(appDomain);
	const legacyHostnames = new Set(
		topology.lmsAliases.map((h) => h.toLowerCase()),
	);
	const allDomains = await listWorkerDomains({
		accountId,
		apiToken,
		fetchImpl,
	});

	const detached: Array<{ id: string; hostname: string; service: string }> = [];
	const alreadyUnified: Array<{ hostname: string; service: string }> = [];

	for (const record of allDomains) {
		const hostname = record.hostname?.trim().toLowerCase();
		if (!hostname || !legacyHostnames.has(hostname)) {
			continue;
		}
		const service = record.service?.trim() ?? "";
		if (isUnifiedLmsWorkerServiceName(service, stage)) {
			alreadyUnified.push({ hostname, service });
			continue;
		}
		if (!isLegacyWorkerServiceName(service, stage)) {
			throw new Error(
				`Refusing to detach hostname '${hostname}': currently attached to unexpected Worker '${service || "<unknown>"}' (stage '${stage}').`,
			);
		}
		const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/domains/${encodeURIComponent(record.id)}`;
		const delRes = await fetchImpl(deleteUrl, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				Accept: "application/json",
			},
		});
		if (!delRes.ok && delRes.status !== 404) {
			throw new Error(
				`Failed to detach '${hostname}' from '${service}' (HTTP ${delRes.status})`,
			);
		}
		detached.push({ id: record.id, hostname, service });
		log(
			`[lms-cutover] Detached legacy custom domain ${hostname} from ${service}`,
		);
	}

	if (detached.length === 0) {
		log(
			`[lms-cutover] No legacy Worker custom domains to detach for ${appDomain} (${alreadyUnified.length} already on unified lms Worker).`,
		);
	}

	return { detached, alreadyUnified };
}

function parseArgs(argv: string[]): { stage: string; appDomain: string } {
	let stage = "";
	let appDomain = process.env.APP_DOMAIN ?? "";
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--stage" && next) {
			stage = next;
			i += 1;
		} else if (arg === "--app-domain" && next) {
			appDomain = next;
			i += 1;
		}
	}
	return { stage, appDomain };
}

const entryArg = process.argv[1];
const isDirectRun =
	typeof entryArg === "string" &&
	import.meta.url === pathToFileURL(entryArg).href;

if (isDirectRun) {
	const { stage, appDomain } = parseArgs(process.argv.slice(2));
	await detachLegacyWorkerDomains({
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
		apiToken: process.env.CLOUDFLARE_API_TOKEN ?? "",
		appDomain,
		stage,
	});
}
