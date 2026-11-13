import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";

const SERVER_SRC_DIR = fileURLToPath(new URL(".", import.meta.url).href);
const REAL_MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

function unwrapExpr(expr: ts.Expression): ts.Expression {
	let cur = expr;
	while (
		ts.isParenthesizedExpression(cur) ||
		ts.isAsExpression(cur) ||
		ts.isSatisfiesExpression(cur) ||
		ts.isNonNullExpression(cur)
	) {
		cur = cur.expression;
	}
	return cur;
}

function isImportMetaUrlExpr(expr: ts.Expression): boolean {
	const cur = unwrapExpr(expr);
	return (
		ts.isPropertyAccessExpression(cur) &&
		cur.name.text === "url" &&
		ts.isMetaProperty(cur.expression) &&
		cur.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
		cur.expression.name.text === "meta"
	);
}

function isUrlCallee(expr: ts.Expression): boolean {
	const cur = unwrapExpr(expr);
	if (ts.isIdentifier(cur)) return cur.text === "URL";
	if (ts.isPropertyAccessExpression(cur)) return cur.name.text === "URL";
	return false;
}

function isImportMetaFileUrlNewExpr(expr: ts.Expression): boolean {
	const cur = unwrapExpr(expr);
	if (!ts.isNewExpression(cur)) return false;
	if (!isUrlCallee(cur.expression)) return false;
	return (cur.arguments ?? []).some((arg) => isImportMetaUrlExpr(arg));
}

function findPathnameBinding(
	pattern: ts.ObjectBindingPattern,
): ts.BindingElement | undefined {
	for (const el of pattern.elements) {
		if (el.propertyName === undefined) {
			if (ts.isIdentifier(el.name) && el.name.text === "pathname") {
				return el;
			}
		} else {
			const prop = ts.isComputedPropertyName(el.propertyName)
				? unwrapExpr(el.propertyName.expression)
				: el.propertyName;
			if (
				(ts.isIdentifier(prop) ||
					ts.isStringLiteral(prop) ||
					ts.isNoSubstitutionTemplateLiteral(prop)) &&
				prop.text === "pathname"
			) {
				return el;
			}
		}
	}
	return undefined;
}

function isPathnameMemberAccess(
	node: ts.Node,
	matchesTarget: (expr: ts.Expression) => boolean,
): boolean {
	if (ts.isPropertyAccessExpression(node) && node.name.text === "pathname") {
		return matchesTarget(node.expression);
	}
	if (ts.isElementAccessExpression(node) && node.argumentExpression) {
		const arg = unwrapExpr(node.argumentExpression);
		if (
			(ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
			arg.text === "pathname"
		) {
			return matchesTarget(node.expression);
		}
	}
	return false;
}

function isLexicalScopeBoundary(node: ts.Node): boolean {
	return (
		ts.isBlock(node) ||
		ts.isFunctionLike(node) ||
		ts.isModuleBlock(node) ||
		ts.isCaseBlock(node)
	);
}

function collectBoundIdentifiers(name: ts.BindingName, out: string[]): void {
	if (ts.isIdentifier(name)) {
		out.push(name.text);
		return;
	}
	for (const el of name.elements) {
		if (!ts.isOmittedExpression(el)) {
			collectBoundIdentifiers(el.name, out);
		}
	}
}

function findImportMetaUrlPathnameViolations(
	source: string,
	fileName = "sample.ts",
): string[] {
	const sf = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const violationPositions = new Set<number>();

	const visit = (node: ts.Node, activeUrlIdents: ReadonlySet<string>) => {
		const scopeIdents = new Set(activeUrlIdents);

		const matchesUrlTarget = (expr: ts.Expression): boolean => {
			const cur = unwrapExpr(expr);
			return (
				isImportMetaFileUrlNewExpr(cur) ||
				(ts.isIdentifier(cur) && scopeIdents.has(cur.text))
			);
		};

		const walkStatementList = (statements: readonly ts.Node[]) => {
			for (const stmt of statements) {
				walkInCurrentScope(stmt);
			}
		};

		const walkInCurrentScope = (cur: ts.Node) => {
			if (isPathnameMemberAccess(cur, matchesUrlTarget)) {
				violationPositions.add(cur.getStart(sf));
			}
			if (ts.isVariableDeclaration(cur)) {
				if (cur.initializer && isImportMetaFileUrlNewExpr(cur.initializer)) {
					if (ts.isIdentifier(cur.name)) {
						scopeIdents.add(cur.name.text);
					} else if (ts.isObjectBindingPattern(cur.name)) {
						const hit = findPathnameBinding(cur.name);
						if (hit) violationPositions.add(hit.getStart(sf));
					}
				} else {
					if (
						cur.initializer &&
						ts.isObjectBindingPattern(cur.name) &&
						matchesUrlTarget(cur.initializer)
					) {
						const hit = findPathnameBinding(cur.name);
						if (hit) violationPositions.add(hit.getStart(sf));
					}
					const shadowed: string[] = [];
					collectBoundIdentifiers(cur.name, shadowed);
					for (const id of shadowed) {
						scopeIdents.delete(id);
					}
				}
			} else if (
				ts.isBinaryExpression(cur) &&
				cur.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				ts.isIdentifier(cur.left)
			) {
				if (isImportMetaFileUrlNewExpr(cur.right)) {
					scopeIdents.add(cur.left.text);
				} else {
					scopeIdents.delete(cur.left.text);
				}
			}

			ts.forEachChild(cur, (child) => {
				if (isLexicalScopeBoundary(child)) {
					visit(child, scopeIdents);
				} else {
					walkInCurrentScope(child);
				}
			});
		};

		if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) {
			walkStatementList(node.statements);
		} else {
			if (ts.isFunctionLike(node)) {
				for (const param of node.parameters) {
					const shadowed: string[] = [];
					collectBoundIdentifiers(param.name, shadowed);
					for (const id of shadowed) {
						scopeIdents.delete(id);
					}
				}
			}
			ts.forEachChild(node, (child) => {
				if (isLexicalScopeBoundary(child)) {
					visit(child, scopeIdents);
				} else {
					walkInCurrentScope(child);
				}
			});
		}
	};

	visit(sf, new Set());

	return [...violationPositions]
		.sort((a, b) => a - b)
		.map((pos) => {
			const { line, character } = sf.getLineAndCharacterOfPosition(pos);
			return `L${line + 1}:${character + 1}`;
		});
}

function collectTsFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectTsFiles(full));
		} else if (entry.isFile() && entry.name.endsWith(".ts")) {
			results.push(full);
		}
	}
	return results.sort();
}

describe("server test suite non-ASCII workspace path guard (#656)", () => {
	test("AST detector flags direct, multiline, 1-arg, bracket, destructured, and indirect import.meta.url pathname accesses without false positives", () => {
		expect(
			findImportMetaUrlPathnameViolations(
				[
					'const route = "/api/student/*";',
					"/* block comment with new URL('../x', import.meta.url).pathname */",
					'const origin = "http://localhost:8001";',
					"const MIGRATIONS_DIR = new URL(",
					'\t"../../../packages/db/src/migrations",',
					"\timport.meta.url,",
					").pathname;",
				].join("\n"),
			),
		).toEqual(["L4:24"]);

		expect(
			findImportMetaUrlPathnameViolations(
				"const selfPath = new URL(import.meta.url).pathname;",
			),
		).toEqual(["L1:18"]);

		expect(
			findImportMetaUrlPathnameViolations(
				'const dir = new URL("../migrations", import.meta.url)["pathname"];',
			),
		).toEqual(["L1:13"]);

		expect(
			findImportMetaUrlPathnameViolations(
				'const { ["pathname"]: dir } = (new globalThis.URL("../migrations", import.meta.url) as URL);',
			),
		).toEqual(["L1:9"]);

		expect(
			findImportMetaUrlPathnameViolations(
				[
					'const htmlUrl = new URL("../../profile/public/index.html", import.meta.url);',
					'const html = readFileSync(htmlUrl.pathname, "utf8");',
				].join("\n"),
			),
		).toEqual(["L2:27"]);

		expect(
			findImportMetaUrlPathnameViolations(
				[
					'import { fileURLToPath } from "node:url";',
					'const MIGRATIONS_DIR = fileURLToPath(new URL("../../../packages/db/src/migrations", import.meta.url).href);',
					'const gateUrl = new URL("../../profile/public/kiem-tra-dau-vao/lead-gate.js", import.meta.url);',
					"const mod = await import(gateUrl.href);",
					"function checkHttp(reqUrl: string) {",
					"\tconst gateUrl = new URL(reqUrl);",
					"\treturn gateUrl.pathname;",
					"}",
					'const httpPath = new URL("http://localhost:8001/v1/tx").pathname;',
					"const { pathname } = new URL(req.url);",
					'const sampleLiteral = "new URL(\\"../m\\", import.meta.url).pathname";',
				].join("\n"),
			),
		).toEqual([]);
	});

	test("Drizzle migrate() fails with percent-encoded .pathname but succeeds with fileURLToPath in a Vietnamese directory path", async () => {
		const vnRoot = mkdtempSync(
			join(tmpdir(), "Pick-tài-liệu-ở-page-tạo-buổi-học-"),
		);
		let client: Client | undefined;
		try {
			client = createClient({ url: "file::memory:" });
			mkdirSync(join(vnRoot, "apps/server/src"), { recursive: true });
			mkdirSync(join(vnRoot, "packages/db/src"), { recursive: true });
			symlinkSync(
				REAL_MIGRATIONS_DIR,
				join(vnRoot, "packages/db/src/migrations"),
				"dir",
			);

			const fakeTestFileUrl = pathToFileURL(
				join(vnRoot, "apps/server/src/holidays.test.ts"),
			).href;
			const brokenMigrationsDir = new URL(
				"../../../packages/db/src/migrations",
				fakeTestFileUrl,
			).pathname;
			expect(brokenMigrationsDir).toContain("Pick-t%C3%A0i-li%E1%BB%87u");

			const db = drizzle(client, { schema });
			await expect(
				migrate(db, { migrationsFolder: brokenMigrationsDir }),
			).rejects.toThrow(/Can't find meta\/_journal\.json file/);

			const decodedMigrationsDir = fileURLToPath(
				new URL("../../../packages/db/src/migrations", fakeTestFileUrl).href,
			);
			expect(decodedMigrationsDir).toContain(
				"Pick-tài-liệu-ở-page-tạo-buổi-học-",
			);
			await expect(
				migrate(db, { migrationsFolder: decodedMigrationsDir }),
			).resolves.toBeUndefined();
		} finally {
			try {
				client?.close();
			} finally {
				rmSync(vnRoot, { recursive: true, force: true });
			}
		}
	});

	test("zero files under apps/server/src use .pathname on import.meta.url file URLs", () => {
		const offendingFiles: string[] = [];
		for (const fullPath of collectTsFiles(SERVER_SRC_DIR)) {
			const source = readFileSync(fullPath, "utf8");
			const violations = findImportMetaUrlPathnameViolations(source, fullPath);
			if (violations.length > 0) {
				const relPath = relative(SERVER_SRC_DIR, fullPath)
					.split("\\")
					.join("/");
				offendingFiles.push(`${relPath} (${violations.join(", ")})`);
			}
		}
		expect(
			offendingFiles,
			`OFFENDING_COUNT=${offendingFiles.length}\n${offendingFiles.join("\n")}`,
		).toEqual([]);
	}, 30_000);
});
