import { TestBed } from '@angular/core/testing';
import { JSON_EXAMPLES } from '../models/examples';
import { CLIENTE_JSON } from '../testing/test-helpers';
import { ANALYSIS_DEBOUNCE_MS, SchemaForgeStore } from './schema-forge.store';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SchemaForgeStore', () => {
  let store: SchemaForgeStore;

  async function settle(): Promise<void> {
    TestBed.tick();
    await sleep(ANALYSIS_DEBOUNCE_MS + 30);
    TestBed.tick();
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(SchemaForgeStore);
    await settle();
  });

  it('starts with the first example analyzed', () => {
    expect(store.jsonText()).toBe(JSON_EXAMPLES[0].json);
    expect(store.analysis().valid).toBe(true);
    expect(store.files().map((file) => file.name)).toEqual(['Cliente.java']);
    expect(store.status().state).toBe('valid');
  });

  it('analyzes JSON changes with debounce and regenerates the code', async () => {
    store.setJson(CLIENTE_JSON);
    TestBed.tick();
    expect(store.analyzing()).toBe(true);
    await settle();
    expect(store.analyzing()).toBe(false);
    expect(store.status()).toMatchObject({ properties: 11, objects: 3, files: 3 });
  });

  it('keeps the text and the last valid structure when the JSON becomes invalid', async () => {
    store.setJson('{"a": 1,');
    await settle();
    expect(store.jsonText()).toBe('{"a": 1,');
    expect(store.analysis().valid).toBe(false);
    expect(store.schemaIsStale()).toBe(true);
    expect(store.files().length).toBe(1);
    expect(store.status().state).toBe('invalid');
    expect(store.errors()[0].code).toBe('syntax');
  });

  it('updates the generated code when the configuration changes', async () => {
    store.setJson(CLIENTE_JSON);
    await settle();
    store.updateProperty('#/nome', { generatedName: 'nomeCompleto' });
    store.updateValidations('#/email', { email: true });
    store.updateJava({ classSuffix: 'DTO' });
    const content = store.files()[0].content;
    expect(content).toContain('private String nomeCompleto;');
    expect(content).toContain('@Email\n    private String email;');
    expect(store.files()[0].name).toBe('ClienteDTO.java');
  });

  it('keeps the original JSON untouched by customizations', async () => {
    store.setJson(CLIENTE_JSON);
    await settle();
    store.updateProperty('#/id', { javaType: 'Integer', included: false });
    expect(store.jsonText()).toBe(CLIENTE_JSON);
  });

  it('removes empty property configuration', async () => {
    store.updateValidations('#/nome', { notBlank: true });
    expect(store.config().properties['#/nome']).toEqual({ validations: { notBlank: true } });
    store.updateValidations('#/nome', { notBlank: undefined });
    expect(store.config().properties['#/nome']).toBeUndefined();
  });

  it('keeps the selected declaration in sync across output formats', async () => {
    store.setJson(CLIENTE_JSON);
    await settle();
    store.selectProperty('#/telefones/*/ddd');
    expect(store.activeFile()?.name).toBe('Telefone.java');
    const javaLine = store.activeDeclaration();
    expect(store.activeFile()?.content.split('\n')[(javaLine?.endLine ?? 0) - 1]).toContain(
      'private String ddd;',
    );
    expect(store.jsonHighlights().length).toBe(1);

    store.setFormat('typescript');
    expect(store.activeFile()?.name).toBe('telefone.model.ts');
    const tsLine = store.activeDeclaration();
    expect(store.activeFile()?.content.split('\n')[(tsLine?.endLine ?? 0) - 1]).toContain(
      'ddd: string;',
    );
  });

  it('loads examples resetting per-property settings', async () => {
    store.updateProperty('#/nome', { generatedName: 'x' });
    store.loadExample(JSON_EXAMPLES[1]);
    await settle();
    expect(store.config().rootName).toBe('Pedido');
    expect(store.config().properties).toEqual({});
    expect(store.files().map((file) => file.name)).toContain('Pedido.java');
  });

  it('names the root model after an imported file', () => {
    store.importJson('pedido-de-venda.json', '{"a": 1}');
    expect(store.config().rootName).toBe('PedidoDeVenda');
  });

  it('clears the project', async () => {
    store.clearProject();
    await settle();
    expect(store.jsonText()).toBe('');
    expect(store.files()).toEqual([]);
    expect(store.status().state).toBe('empty');
  });

  it('formats valid JSON and refuses invalid JSON', async () => {
    store.setJson('{"a":[1,2]}');
    expect(await store.formatJson()).toBe(true);
    expect(store.jsonText()).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}\n');
    store.setJson('{"a":');
    expect(await store.formatJson()).toBe(false);
    expect(store.jsonText()).toBe('{"a":');
  });

  it('persists the project locally', async () => {
    store.setJson('{"persisted": true}');
    TestBed.tick();
    await sleep(600);
    expect(localStorage.getItem('schemaforge.project')).toContain('persisted');
  });
});
