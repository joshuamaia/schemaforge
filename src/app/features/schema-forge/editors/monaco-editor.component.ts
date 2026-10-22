import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatProgressBar } from '@angular/material/progress-bar';
import type { editor as MonacoEditorNs, IDisposable } from 'monaco-editor/editor/editor.api.js';
import { DiagnosticSeverity } from '../../../core/models/diagnostic';
import { SourceRange } from '../../../core/models/source-range';
import { ThemeService } from '../../../core/services/theme.service';
import { DeclarationSpan } from '../models/generated-file.model';
import { Monaco, MonacoLoaderService, monacoTheme } from './monaco-loader.service';

export type EditorLanguage = 'json' | 'java' | 'typescript';

export interface EditorPaste {
  readonly text: string;
  /** The paste replaced (or filled) the whole document. */
  readonly replacedAll: boolean;
}

/** Above this size, programmatic replacements skip the undo stack for speed. */
const LARGE_TEXT = 500_000;

export interface EditorMarker {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly range: SourceRange;
}

/**
 * Angular wrapper around a Monaco editor instance. Inputs are applied through effects;
 * the editor, its model and listeners are disposed with the component.
 */
@Component({
  selector: 'sf-monaco-editor',
  imports: [MatProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="editor-host" #host></div>
    @if (state() === 'loading') {
      <div class="editor-overlay" role="status">
        <mat-progress-bar mode="indeterminate" />
        <span>Carregando editor…</span>
      </div>
    } @else if (state() === 'failed') {
      <div class="editor-overlay editor-overlay--error" role="alert">
        Não foi possível carregar o editor de código. Recarregue a página.
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 0;
      overflow: hidden;
    }
    .editor-host {
      position: absolute;
      inset: 0;
    }
    .editor-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--sf-muted);
      font-size: 13px;
      background: var(--sf-editor-bg);
    }
    .editor-overlay mat-progress-bar {
      max-width: 200px;
    }
    .editor-overlay--error {
      color: var(--sf-error);
    }
  `,
})
export class MonacoEditorComponent {
  readonly value = input.required<string>();
  readonly language = input<EditorLanguage>('json');
  readonly readOnly = input(false);
  readonly markers = input<readonly EditorMarker[]>([]);
  /** Character ranges to highlight (JSON input). */
  readonly highlightRanges = input<readonly SourceRange[]>([]);
  /** Line span to highlight (generated code). */
  readonly highlightLines = input<DeclarationSpan | null>(null);
  readonly ariaLabel = input('Editor de código');
  readonly placeholder = input('');

  readonly valueChange = output<string>();
  /** Emits the full text after a paste operation. */
  readonly pasted = output<EditorPaste>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly loader = inject(MonacoLoaderService);
  private readonly theme = inject(ThemeService);

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  private readonly monaco = signal<Monaco | null>(null);
  private editor: MonacoEditorNs.IStandaloneCodeEditor | null = null;
  private decorations: MonacoEditorNs.IEditorDecorationsCollection | null = null;
  private readonly disposables: IDisposable[] = [];
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      this.loader
        .load()
        .then((monaco) => {
          if (this.destroyed) {
            return;
          }
          this.createEditor(monaco);
          this.monaco.set(monaco);
          this.state.set('ready');
        })
        .catch(() => this.state.set('failed'));
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.disposables.forEach((disposable) => disposable.dispose());
      this.editor?.getModel()?.dispose();
      this.editor?.dispose();
      this.editor = null;
    });

    effect(() => {
      const value = this.value();
      const model = this.monaco() && this.editor?.getModel();
      if (!model || model.getValue() === value) {
        return;
      }
      if (this.readOnly() || value.length > LARGE_TEXT || model.getValueLength() > LARGE_TEXT) {
        model.setValue(value);
      } else {
        // Keeps undo history for programmatic edits such as formatting.
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: value }],
          () => null,
        );
      }
    });

    effect(() => {
      const monaco = this.monaco();
      const language = this.language();
      const model = this.editor?.getModel();
      if (monaco && model) {
        monaco.editor.setModelLanguage(model, language);
        model.updateOptions({ tabSize: language === 'java' ? 4 : 2 });
      }
    });

    effect(() => {
      const readOnly = this.readOnly();
      if (this.monaco()) {
        this.editor?.updateOptions({ readOnly, domReadOnly: readOnly });
      }
    });

    effect(() => {
      const monaco = this.monaco();
      const mode = this.theme.mode();
      monaco?.editor.setTheme(monacoTheme(mode));
    });

    effect(() => {
      const monaco = this.monaco();
      const markers = this.markers();
      this.value();
      const model = this.editor?.getModel();
      if (!monaco || !model) {
        return;
      }
      const severity = {
        error: monaco.MarkerSeverity.Error,
        warning: monaco.MarkerSeverity.Warning,
        info: monaco.MarkerSeverity.Info,
      };
      const length = model.getValueLength();
      monaco.editor.setModelMarkers(
        model,
        'schemaforge',
        markers.map((marker) => {
          const start = model.getPositionAt(Math.min(marker.range.start, length));
          const end = model.getPositionAt(
            Math.min(Math.max(marker.range.end, marker.range.start + 1), length),
          );
          return {
            severity: severity[marker.severity],
            message: marker.message,
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn:
              end.column === start.column && end.lineNumber === start.lineNumber
                ? end.column + 1
                : end.column,
          };
        }),
      );
    });

    effect(() => {
      const monaco = this.monaco();
      const ranges = this.highlightRanges();
      const lines = this.highlightLines();
      this.value();
      const editor = this.editor;
      const model = editor?.getModel();
      if (!monaco || !editor || !model || !this.decorations) {
        return;
      }
      const decorations: MonacoEditorNs.IModelDeltaDecoration[] = [];
      const length = model.getValueLength();
      for (const range of ranges) {
        if (range.end > length) {
          continue;
        }
        const start = model.getPositionAt(range.start);
        const end = model.getPositionAt(range.end);
        decorations.push({
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: { inlineClassName: 'sf-highlight-inline' },
        });
        decorations.push({
          range: new monaco.Range(start.lineNumber, 1, start.lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'sf-highlight-line',
            linesDecorationsClassName: 'sf-highlight-gutter',
            overviewRuler: { color: '#7c5cff', position: monaco.editor.OverviewRulerLane.Center },
          },
        });
      }
      if (lines && lines.endLine <= model.getLineCount()) {
        decorations.push({
          range: new monaco.Range(lines.startLine, 1, lines.endLine, 1),
          options: {
            isWholeLine: true,
            className: 'sf-highlight-line',
            linesDecorationsClassName: 'sf-highlight-gutter',
          },
        });
      }
      this.decorations.set(decorations);
      const first = decorations[0]?.range;
      if (first) {
        editor.revealRangeInCenterIfOutsideViewport(first, monaco.editor.ScrollType.Smooth);
      }
    });
  }

  private createEditor(monaco: Monaco): void {
    const language = this.language();
    const model = monaco.editor.createModel(this.value(), language);
    const editor = monaco.editor.create(this.host().nativeElement, {
      model,
      theme: monacoTheme(this.theme.mode()),
      readOnly: this.readOnly(),
      domReadOnly: this.readOnly(),
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontLigatures: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      padding: { top: 10, bottom: 10 },
      tabSize: language === 'java' ? 4 : 2,
      insertSpaces: true,
      autoIndent: 'full',
      formatOnPaste: false,
      folding: true,
      fixedOverflowWidgets: true,
      ariaLabel: this.ariaLabel(),
      placeholder: this.placeholder() || undefined,
      stickyScroll: { enabled: false },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: false, indentation: true },
      smoothScrolling: true,
    });
    this.editor = editor;
    this.decorations = editor.createDecorationsCollection();
    this.disposables.push(
      editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        if (value !== this.value()) {
          this.valueChange.emit(value);
        }
      }),
      editor.onDidPaste(({ range }) => {
        const full = model.getFullModelRange();
        this.pasted.emit({
          text: editor.getValue(),
          // The pasted text is now the whole document (it replaced or filled the editor).
          replacedAll:
            range.startLineNumber === 1 &&
            range.startColumn === 1 &&
            range.endLineNumber === full.endLineNumber &&
            range.endColumn === full.endColumn,
        });
      }),
    );
  }
}
