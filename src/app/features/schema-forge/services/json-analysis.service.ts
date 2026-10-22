import { DestroyRef, Injectable, inject } from '@angular/core';
import { JsonAnalysisResult, analyzeJson } from '../parsers/json-analysis';
import { formatJsonText } from '../parsers/json-formatter';
import type { WorkerRequest } from './json-analysis.worker';

/** Inputs larger than this are processed in a Web Worker to keep the UI responsive. */
export const WORKER_THRESHOLD = 150_000;

interface WorkerResponse {
  readonly id: number;
  readonly result: unknown;
}

const WORKER_FAILURE: JsonAnalysisResult = {
  valid: false,
  syntaxError: null,
  schema: null,
  diagnostics: [
    {
      severity: 'error',
      code: 'syntax',
      message:
        'Não foi possível analisar o documento em segundo plano. Edite o JSON para tentar novamente.',
    },
  ],
};

/**
 * Runs JSON analysis and formatting. Small documents are processed synchronously; large ones
 * are sent to a dedicated worker so typing and pasting never freeze the interface.
 */
@Injectable({ providedIn: 'root' })
export class JsonAnalysisService {
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextId = 0;
  private readonly pending = new Map<number, (result: unknown) => void>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.worker?.terminate());
  }

  analyze(text: string): Promise<JsonAnalysisResult> {
    return this.run('analyze', text, () => analyzeJson(text), WORKER_FAILURE);
  }

  /** Pretty prints JSON, resolving `null` when it is invalid. */
  format(text: string): Promise<string | null> {
    return this.run('format', text, () => formatJsonText(text), null);
  }

  private run<T>(
    kind: WorkerRequest['kind'],
    text: string,
    local: () => T,
    fallback: T,
  ): Promise<T> {
    const worker = text.length >= WORKER_THRESHOLD ? this.getWorker() : null;
    if (!worker) {
      return Promise.resolve(local());
    }
    const id = ++this.nextId;
    return new Promise<T>((resolve) => {
      this.pending.set(id, (result) => resolve((result === undefined ? fallback : result) as T));
      const request: WorkerRequest = { id, kind, text };
      worker.postMessage(request);
    });
  }

  private getWorker(): Worker | null {
    if (this.worker || this.workerFailed || typeof Worker === 'undefined') {
      return this.worker;
    }
    try {
      const worker = new Worker(new URL('./json-analysis.worker', import.meta.url), {
        type: 'module',
      });
      worker.addEventListener('message', ({ data }: MessageEvent<WorkerResponse>) => {
        const resolve = this.pending.get(data.id);
        this.pending.delete(data.id);
        resolve?.(data.result);
      });
      worker.addEventListener('error', () => this.failWorker());
      this.worker = worker;
    } catch {
      this.workerFailed = true;
    }
    return this.worker;
  }

  /** Stops using the worker; pending requests resolve with their fallback value. */
  private failWorker(): void {
    this.workerFailed = true;
    this.worker?.terminate();
    this.worker = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    pending.forEach((resolve) => resolve(undefined));
  }
}
