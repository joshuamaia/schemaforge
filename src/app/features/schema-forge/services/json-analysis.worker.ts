import { analyzeJson } from '../parsers/json-analysis';
import { formatJsonText } from '../parsers/json-formatter';

export type WorkerRequest =
  | { readonly id: number; readonly kind: 'analyze'; readonly text: string }
  | { readonly id: number; readonly kind: 'format'; readonly text: string };

addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => {
  const result = data.kind === 'analyze' ? analyzeJson(data.text) : formatJsonText(data.text);
  postMessage({ id: data.id, result });
});
