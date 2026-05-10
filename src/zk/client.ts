import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ResolveOptions {
	env?: NodeJS.ProcessEnv;
	home?: string;
	exists?: (path: string) => boolean;
}

export interface RunZkOptions {
	cwd: string;
	args: string[];
	signal?: AbortSignal;
	timeoutMs?: number;
	input?: string;
	env?: NodeJS.ProcessEnv;
}

export interface RunZkResult {
	command: string;
	args: string[];
	cwd: string;
	stdout: string;
	stderr: string;
	code: number;
}

export class ProcessError extends Error {
	constructor(
		message: string,
		readonly result: RunZkResult,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = "ProcessError";
	}
}

export class ZkError extends ProcessError {
	constructor(message: string, result: RunZkResult, cause?: unknown) {
		super(message, result, cause);
		this.name = "ZkError";
	}
}

export function resolveZkBinary(options: ResolveOptions = {}): string {
	const env = options.env ?? process.env;
	const configured = env.ZK_BIN?.trim();
	if (configured) return configured;

	const home = options.home ?? homedir();
	const exists = options.exists ?? existsSync;
	const local = join(home, ".local", "bin", "zk");
	if (exists(local)) return local;

	return "zk";
}

export function buildZkEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	// Force plain output. zk respects NO_COLOR and TERM=dumb.
	return {
		...base,
		NO_COLOR: "1",
		TERM: "dumb",
	};
}

export function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
	return JSON.stringify(value);
}

export function formatCommand(bin: string, args: string[]): string {
	return [bin, ...args].map(shellQuote).join(" ");
}

export function missingZkMessage(): string {
	return [
		"zk is unavailable because the `zk` command was not found.",
		"Install zk (https://github.com/zk-org/zk), set ZK_BIN, or put zk on PATH.",
	].join("\n");
}

export function isNotebookMissing(result: Pick<RunZkResult, "stderr" | "stdout">): boolean {
	const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
	return output.includes("no notebook") || output.includes("not in a notebook");
}

interface SpawnOptions extends RunZkOptions {
	bin: string;
}

async function runProcess(options: SpawnOptions): Promise<RunZkResult> {
	const command = formatCommand(options.bin, options.args);

	if (options.signal?.aborted) {
		throw new ProcessError(`${command} aborted`, {
			command,
			args: [...options.args],
			cwd: options.cwd,
			stdout: "",
			stderr: "",
			code: 1,
		});
	}

	return await new Promise<RunZkResult>((resolve, reject) => {
		const child = spawn(options.bin, options.args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;

		const resultFor = (code: number): RunZkResult => ({
			command,
			args: [...options.args],
			cwd: options.cwd,
			stdout,
			stderr,
			code,
		});

		const cleanup = () => {
			settled = true;
			if (timer) clearTimeout(timer);
			options.signal?.removeEventListener("abort", abortHandler);
		};

		const fail = (error: Error, code = 1, cause?: unknown) => {
			if (settled) return;
			cleanup();
			reject(new ProcessError(error.message, resultFor(code), cause));
		};

		const abortHandler = () => {
			timedOut = true;
			child.kill("SIGTERM");
			fail(new Error(`${command} aborted`), 1);
		};

		const timer = options.timeoutMs
			? setTimeout(() => {
					if (settled) return;
					timedOut = true;
					child.kill("SIGTERM");
					const killTimer = setTimeout(() => child.kill("SIGKILL"), 100);
					killTimer.unref();
					fail(new Error(`${command} timed out`), 124);
				}, options.timeoutMs)
			: undefined;

		options.signal?.addEventListener("abort", abortHandler, { once: true });

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});

		child.on("error", (error) => {
			fail(error, (error as NodeJS.ErrnoException).code === "ENOENT" ? 127 : 1, error);
		});

		child.on("close", (code) => {
			if (settled) return;
			cleanup();
			const exitCode = code ?? (timedOut ? 124 : 1);
			const result = resultFor(exitCode);
			if (timedOut) {
				reject(new ProcessError(`${command} timed out`, { ...result, code: 124 }));
				return;
			}
			if (exitCode !== 0) {
				reject(new ProcessError(`${command} failed (exit ${exitCode})`, result));
				return;
			}
			resolve(result);
		});

		if (options.input !== undefined) {
			child.stdin.end(options.input);
		} else {
			child.stdin.end();
		}
	});
}

export async function runZk(options: RunZkOptions): Promise<RunZkResult> {
	const bin = resolveZkBinary({ env: options.env });
	try {
		return await runProcess({
			bin,
			args: options.args,
			cwd: options.cwd,
			env: buildZkEnv(options.env),
			signal: options.signal,
			timeoutMs: options.timeoutMs,
			input: options.input,
		});
	} catch (error) {
		if (!(error instanceof ProcessError)) throw error;
		const cause = error.cause as NodeJS.ErrnoException | undefined;
		if (cause?.code === "ENOENT" || error.result.code === 127) {
			throw new ZkError(missingZkMessage(), error.result, error);
		}
		const text = [
			`${error.result.command} failed (exit ${error.result.code}).`,
			error.result.stdout ? `stdout:\n${error.result.stdout}` : undefined,
			error.result.stderr ? `stderr:\n${error.result.stderr}` : undefined,
		]
			.filter(Boolean)
			.join("\n\n");
		throw new ZkError(text, error.result, error);
	}
}
