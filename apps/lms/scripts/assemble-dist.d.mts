export interface AssemblePortalDistsOptions {
	lmsOutDir?: string;
	repoRoot?: string;
	rebuildPortals?: boolean;
	portalEnv?: Record<string, string | undefined>;
	buildPortal?: (
		pkg: string,
		env: Record<string, string | undefined>,
		repoRoot: string,
	) => void;
}

export declare const PORTAL_MOUNTS: ReadonlyArray<{
	pkg: string;
	mount: string;
}>;

export declare function isValidHttpUrl(
	value: string | undefined | null,
): boolean;

export declare function extractViteEnvFromConfig(
	config:
		| {
				env?: Record<string, unknown>;
				define?: Record<string, unknown>;
		  }
		| undefined,
	processEnv?: Record<string, string | undefined>,
): Record<string, string>;

export declare function bundleContainsServerUrl(
	portalDir: string,
	expectedServerUrl: string,
): boolean;

export declare function bundleMatchesStudentPracticeFlag(
	portalDir: string,
	expectedEnabled: boolean,
): boolean;

export declare function assemblePortalDists(
	options?: AssemblePortalDistsOptions,
): void;
