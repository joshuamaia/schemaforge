import { DOCUMENT, Injectable, inject } from '@angular/core';

export type Monaco = typeof import('monaco-editor/editor/editor.api.js');

/** Stylesheet emitted by the build (`angular.json` → styles → `monaco-editor`). */
const MONACO_STYLESHEET = 'monaco-editor.css';

const DARK_THEME = 'schemaforge-dark';
const LIGHT_THEME = 'schemaforge-light';

export function monacoTheme(mode: 'dark' | 'light'): string {
  return mode === 'dark' ? DARK_THEME : LIGHT_THEME;
}

/**
 * Lazily loads the Monaco ESM build with a curated set of editor contributions, so the
 * initial bundle stays small. JSON tokenization is registered locally: validation is done
 * by SchemaForge itself, so Monaco's JSON language worker is not needed.
 */
@Injectable({ providedIn: 'root' })
export class MonacoLoaderService {
  private readonly document = inject(DOCUMENT);
  private loading: Promise<Monaco> | null = null;

  load(): Promise<Monaco> {
    this.loading ??= this.doLoad();
    return this.loading;
  }

  private async doLoad(): Promise<Monaco> {
    this.injectStylesheet();
    (globalThis as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
      getWorker: () =>
        new Worker(new URL('./monaco-editor.worker', import.meta.url), { type: 'module' }),
    };

    const monaco = await import('monaco-editor/editor/editor.api.js');
    await Promise.all([
      import('monaco-editor/editor/browser/coreCommands.js'),
      import('monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget.js'),
      import('monaco-editor/editor/contrib/find/browser/findController.js'),
      import('monaco-editor/editor/contrib/folding/browser/folding.js'),
      import('monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js'),
      import('monaco-editor/editor/contrib/clipboard/browser/clipboard.js'),
      import('monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js'),
      import('monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js'),
      import('monaco-editor/editor/contrib/hover/browser/hoverContribution.js'),
      import('monaco-editor/editor/contrib/multicursor/browser/multicursor.js'),
      import('monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js'),
      import('monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js'),
      import('monaco-editor/editor/contrib/smartSelect/browser/smartSelect.js'),
      import('monaco-editor/editor/contrib/indentation/browser/indentation.js'),
      import('monaco-editor/editor/contrib/gotoError/browser/gotoError.js'),
      import('monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js'),
      import('monaco-editor/editor/contrib/readOnlyMessage/browser/contribution.js'),
      import('monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'),
      import('monaco-editor/editor/contrib/placeholderText/browser/placeholderText.contribution.js'),
      import('monaco-editor/languages/definitions/java/register.js'),
      import('monaco-editor/languages/definitions/typescript/register.js'),
    ]);
    this.registerJson(monaco);
    this.defineThemes(monaco);
    return monaco;
  }

  private injectStylesheet(): void {
    if (this.document.querySelector(`link[href="${MONACO_STYLESHEET}"]`)) {
      return;
    }
    const link = this.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MONACO_STYLESHEET;
    this.document.head.appendChild(link);
  }

  private registerJson(monaco: Monaco): void {
    monaco.languages.register({ id: 'json', extensions: ['.json'], aliases: ['JSON'] });
    monaco.languages.setLanguageConfiguration('json', {
      brackets: [
        ['{', '}'],
        ['[', ']'],
      ],
      autoClosingPairs: [
        { open: '{', close: '}', notIn: ['string'] },
        { open: '[', close: ']', notIn: ['string'] },
        { open: '"', close: '"', notIn: ['string'] },
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '"', close: '"' },
      ],
    });
    monaco.languages.setMonarchTokensProvider('json', {
      tokenizer: {
        root: [
          [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'type.key'],
          [/"(?:[^"\\]|\\.)*"/, 'string'],
          [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
          [/\b(?:true|false)\b/, 'keyword'],
          [/\bnull\b/, 'keyword.null'],
          [/[{}[\]]/, '@brackets'],
          [/[,:]/, 'delimiter'],
        ],
      },
    });
  }

  private defineThemes(monaco: Monaco): void {
    monaco.editor.defineTheme(DARK_THEME, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'type.key', foreground: '7dd3fc' },
        { token: 'string', foreground: 'a5d6a7' },
        { token: 'number', foreground: 'fbbf77' },
        { token: 'keyword', foreground: 'c4a7ff' },
        { token: 'keyword.null', foreground: '94a3b8', fontStyle: 'italic' },
        { token: 'annotation', foreground: 'f0abfc' },
        { token: 'type', foreground: '67e8f9' },
      ],
      colors: {
        'editor.background': '#0f131a',
        'editor.lineHighlightBackground': '#ffffff08',
        'editorLineNumber.foreground': '#4b5563',
        'editorLineNumber.activeForeground': '#9ca3af',
        'editorGutter.background': '#0f131a',
        'editor.selectionBackground': '#7c5cff40',
        'editorIndentGuide.background1': '#1f2937',
        'editorWidget.background': '#161b24',
        'scrollbarSlider.background': '#ffffff14',
      },
    });
    monaco.editor.defineTheme(LIGHT_THEME, {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'type.key', foreground: '0b6bcb' },
        { token: 'string', foreground: '1b7f3b' },
        { token: 'number', foreground: 'b45309' },
        { token: 'keyword', foreground: '7c3aed' },
        { token: 'keyword.null', foreground: '64748b', fontStyle: 'italic' },
        { token: 'annotation', foreground: 'a21caf' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.lineHighlightBackground': '#0000000a',
        'editorLineNumber.foreground': '#9ca3af',
        'editor.selectionBackground': '#7c5cff33',
      },
    });
  }
}
