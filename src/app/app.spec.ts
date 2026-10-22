import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { MonacoLoaderService } from './features/schema-forge/editors/monaco-loader.service';
import { SchemaForgeStore } from './features/schema-forge/services/schema-forge.store';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Monaco needs a real browser; component tests run without the editor. */
class NeverLoadingMonaco {
  load(): Promise<never> {
    return new Promise(() => undefined);
  }
}

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: MonacoLoaderService, useClass: NeverLoadingMonaco }],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await sleep(50);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('renders the header, the three panels and the status bar', async () => {
    const { element } = await render();
    expect(element.querySelector('h1')?.textContent).toContain('SchemaForge');
    expect(element.textContent).toContain('JSON to Code Generator');
    expect(element.querySelector('sf-json-panel')).toBeTruthy();
    expect(element.querySelector('sf-structure-panel')).toBeTruthy();
    expect(element.querySelector('sf-code-panel')).toBeTruthy();
    expect(element.querySelector('sf-status-bar')?.textContent).toContain('JSON válido');
  });

  it('shows the inferred structure as a tree', async () => {
    const { element } = await render();
    const names = [...element.querySelectorAll('.tree .row .name')].map((node) =>
      node.textContent?.replace('*', '').trim(),
    );
    expect(names).toEqual(['id', 'nome', 'email', 'idade', 'ativo', 'cpf', 'limiteCredito']);
  });

  it('opens the validations tab from the tree and blocks incompatible rules', async () => {
    const { fixture, element } = await render();
    const idade = [...element.querySelectorAll<HTMLElement>('.tree .row')].find((row) =>
      row.textContent?.includes('idade'),
    );
    idade?.click();
    await fixture.whenStable();
    const editor = element.querySelector('sf-property-editor');
    expect(editor?.textContent).toContain('idade');
    expect(editor?.querySelector('.tab.active')?.textContent).toContain('Identificação');

    idade?.querySelector<HTMLButtonElement>('button[aria-label="Configurar validações"]')?.click();
    await fixture.whenStable();
    expect(editor?.querySelector('.tab.active')?.textContent).toContain('Validações');
    const checkbox = (label: string) =>
      [...(editor?.querySelectorAll('mat-checkbox') ?? [])].find((box) =>
        box.textContent?.includes(label),
      );
    expect(checkbox('@NotBlank')?.querySelector('input')?.disabled).toBe(true);
    expect(checkbox('@Email')?.querySelector('input')?.disabled).toBe(true);
    expect(checkbox('@Min')?.querySelector('input')?.disabled).toBe(false);
  });

  it('excludes a property from generation from the tree', async () => {
    const { fixture, element } = await render();
    const store = TestBed.inject(SchemaForgeStore);
    const cpfRow = [...element.querySelectorAll<HTMLElement>('.tree .row')].find((row) =>
      row.textContent?.includes('cpf'),
    );
    cpfRow?.querySelector<HTMLButtonElement>('button[aria-label="Remover da geração"]')?.click();
    await fixture.whenStable();
    expect(store.files()[0].content).not.toContain('cpf');
    expect(cpfRow?.classList).toContain('excluded');
  });

  it('switches the output format', async () => {
    const { fixture, element } = await render();
    const typescript = [...element.querySelectorAll<HTMLElement>('mat-button-toggle button')].find(
      (button) => button.textContent?.includes('TypeScript'),
    );
    typescript?.click();
    await fixture.whenStable();
    expect(element.querySelector('.file-path')?.textContent).toContain(
      'typescript/cliente.model.ts',
    );
    expect(element.querySelector('sf-status-bar')?.textContent).toContain('TypeScript');
  });

  it('supports keyboard navigation in the tree', async () => {
    const { fixture, element } = await render();
    const tree = element.querySelector<HTMLElement>('.tree');
    const press = (key: string) =>
      tree?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    await fixture.whenStable();
    expect(TestBed.inject(SchemaForgeStore).selectedPropertyId()).toBe('#/email');
  });
});
