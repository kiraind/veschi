import { randomUUID } from 'node:crypto';
import { withInput, type Workflow } from './workflows';

/**
 * Client of the ComfyUI HTTP API: upload the picture, queue the workflow, wait
 * for it and download its output. Works with a self-hosted ComfyUI (no key)
 * and with Comfy Cloud (`X-API-Key`), whose API is the same except for the
 * job status (`/api/jobs/{id}` instead of `/api/history/{id}`) and outputs
 * served through a redirect to a signed URL.
 */
export interface ComfyOptions {
	baseUrl: string;
	apiKey?: string;
	fetch?: typeof fetch;
	/** Pause between status checks, ms. */
	pollMs?: number;
}

/** The processor cannot be reached or is overloaded: worth retrying later without counting. */
export class ProcessorUnavailableError extends Error {}

/** The processor ran the workflow and it failed, or answered something unexpected. */
export class ProcessorError extends Error {}

interface OutputImage {
	filename: string;
	subfolder?: string;
	type?: string;
}

type Outputs = Record<string, { images?: OutputImage[] } | undefined>;

type JobState = { done: false } | { done: true; outputs: Outputs } | { done: true; error: string };

const sleep = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason);
		});
	});

export class ComfyClient {
	private readonly base: string;
	private readonly fetch: typeof fetch;
	private readonly pollMs: number;

	constructor(private readonly options: ComfyOptions) {
		this.base = options.baseUrl.replace(/\/+$/, '');
		this.fetch = options.fetch ?? fetch;
		this.pollMs = options.pollMs ?? 2000;
	}

	private get cloud(): boolean {
		return Boolean(this.options.apiKey);
	}

	private async request(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		if (this.options.apiKey) headers.set('X-API-Key', this.options.apiKey);
		let response: Response;
		try {
			response = await this.fetch(`${this.base}${path}`, { ...init, headers });
		} catch (e) {
			if (init.signal?.aborted) throw e;
			throw new ProcessorUnavailableError(`ComfyUI is unreachable: ${(e as Error).message}`);
		}
		if (response.status === 429 || response.status >= 500) {
			throw new ProcessorUnavailableError(`ComfyUI answered ${response.status} on ${path}`);
		}
		return response;
	}

	private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await this.request(path, init);
		const text = await response.text();
		if (!response.ok) {
			throw new ProcessorError(
				`ComfyUI answered ${response.status} on ${path}: ${text.slice(0, 500)}`
			);
		}
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ProcessorError(`ComfyUI answered non-JSON on ${path}`);
		}
	}

	/** Uploads a picture to the input folder and returns the name to put in LoadImage. */
	async upload(image: Buffer, signal: AbortSignal): Promise<string> {
		const form = new FormData();
		form.set(
			'image',
			new Blob([new Uint8Array(image)], { type: 'image/jpeg' }),
			`veschi-${randomUUID()}.jpg`
		);
		form.set('type', 'input');
		form.set('overwrite', 'true');
		const result = await this.json<{ name?: string; subfolder?: string }>('/api/upload/image', {
			method: 'POST',
			body: form,
			signal
		});
		if (!result.name) throw new ProcessorError('ComfyUI did not name the uploaded picture');
		return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
	}

	/** Queues a graph and returns its prompt id. */
	async queue(graph: Workflow['graph'], signal: AbortSignal): Promise<string> {
		const result = await this.json<{ prompt_id?: string; error?: unknown; node_errors?: unknown }>(
			'/api/prompt',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ prompt: graph, client_id: 'veschi' }),
				signal
			}
		);
		if (!result.prompt_id) {
			throw new ProcessorError(
				`ComfyUI refused the workflow: ${JSON.stringify(result.error ?? result.node_errors ?? result)}`
			);
		}
		return result.prompt_id;
	}

	/** Where a queued prompt is. */
	async state(promptId: string, signal: AbortSignal): Promise<JobState> {
		if (this.cloud) {
			const job = await this.json<{
				status?: string;
				outputs?: Outputs;
				execution_error?: { node_type?: string; exception_message?: string };
			}>(`/api/jobs/${encodeURIComponent(promptId)}`, { signal });
			if (job.status === 'completed') return { done: true, outputs: job.outputs ?? {} };
			if (job.status === 'failed' || job.status === 'cancelled') {
				const e = job.execution_error;
				return {
					done: true,
					error: e ? `${e.node_type}: ${e.exception_message}` : `job ${job.status}`
				};
			}
			return { done: false };
		}
		const history = await this.json<
			Record<
				string,
				{
					outputs?: Outputs;
					status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
				}
			>
		>(`/api/history/${encodeURIComponent(promptId)}`, { signal });
		const entry = history[promptId];
		if (!entry?.status?.completed && entry?.status?.status_str !== 'error') return { done: false };
		if (entry.status.status_str === 'error') {
			const failure = (entry.status.messages ?? []).find(
				(m) => Array.isArray(m) && m[0] === 'execution_error'
			) as [string, { node_type?: string; exception_message?: string }] | undefined;
			const e = failure?.[1];
			return {
				done: true,
				error: e ? `${e.node_type}: ${e.exception_message}` : 'execution error'
			};
		}
		return { done: true, outputs: entry.outputs ?? {} };
	}

	/** Downloads an output file; Comfy Cloud redirects to a signed URL fetched without the key. */
	async download(file: OutputImage, signal: AbortSignal): Promise<Buffer> {
		const query = new URLSearchParams({
			filename: file.filename,
			subfolder: file.subfolder ?? '',
			type: file.type ?? 'output'
		});
		let response = await this.request(`/api/view?${query}`, { redirect: 'manual', signal });
		const location = response.headers.get('location');
		if (response.status >= 300 && response.status < 400 && location) {
			try {
				response = await this.fetch(new URL(location, this.base), { signal });
			} catch (e) {
				if (signal.aborted) throw e;
				throw new ProcessorUnavailableError(
					`ComfyUI output is unreachable: ${(e as Error).message}`
				);
			}
		}
		if (!response.ok) throw new ProcessorError(`ComfyUI output answered ${response.status}`);
		return Buffer.from(await response.arrayBuffer());
	}

	/**
	 * Runs a workflow on a picture and returns its first output image. Gives up
	 * after `timeoutMs` and asks ComfyUI to drop the prompt.
	 */
	async run(workflow: Workflow, image: Buffer, timeoutMs: number): Promise<Buffer> {
		const signal = AbortSignal.timeout(timeoutMs);
		let promptId: string | null = null;
		try {
			const name = await this.upload(image, signal);
			promptId = await this.queue(withInput(workflow, name), signal);
			for (;;) {
				const state = await this.state(promptId, signal);
				if (state.done && 'error' in state) throw new ProcessorError(state.error);
				if (state.done) {
					const file = state.outputs[workflow.outputNode]?.images?.[0];
					if (!file) throw new ProcessorError('The workflow finished without an output image');
					return await this.download(file, signal);
				}
				await sleep(this.pollMs, signal);
			}
		} catch (e) {
			if (!signal.aborted) throw e;
			if (promptId) await this.cancel(promptId);
			throw new ProcessorError(`ComfyUI did not finish in ${timeoutMs / 1000} s`);
		}
	}

	/** Drops a prompt from the queue or interrupts it; failures do not matter. */
	private async cancel(promptId: string): Promise<void> {
		const signal = AbortSignal.timeout(10_000);
		const post = (path: string, body: unknown) =>
			this.request(path, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				signal
			}).catch(() => undefined);
		await post('/api/queue', { delete: [promptId] });
		await post('/api/interrupt', { prompt_id: promptId });
	}
}
