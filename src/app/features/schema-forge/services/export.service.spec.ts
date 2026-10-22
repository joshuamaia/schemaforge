import { TestBed } from '@angular/core/testing';
import { CLIENTE_JSON, generate } from '../testing/test-helpers';
import { ExportService, ZIP_FILE_NAME, exportEntries } from './export.service';

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExportService);
  });

  it('builds export entries preserving packages and folders', () => {
    const java = generate(CLIENTE_JSON, { java: { classSuffix: 'DTO' } }).files;
    const ts = generate(CLIENTE_JSON, { format: 'typescript' }).files;
    expect(exportEntries([...java, ...ts]).map((entry) => entry.path)).toEqual([
      'generated/java/com/example/model/ClienteDTO.java',
      'generated/java/com/example/model/EnderecoDTO.java',
      'generated/java/com/example/model/TelefoneDTO.java',
      'generated/typescript/cliente.model.ts',
      'generated/typescript/endereco.model.ts',
      'generated/typescript/telefone.model.ts',
    ]);
  });

  it('skips empty files', () => {
    const [file] = generate('{"a": 1}').files;
    expect(exportEntries([file, { ...file, path: 'x/Empty.java', content: '  \n' }])).toHaveLength(
      1,
    );
  });

  it('downloads the ZIP through an object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:zip');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const count = service.downloadZip(generate(CLIENTE_JSON).files);

    expect(count).toBe(3);
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0] as unknown as [Blob];
    expect(blob[0].type).toBe('application/zip');
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(ZIP_FILE_NAME);
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does not create an archive without files', () => {
    expect(service.downloadZip([])).toBe(0);
  });

  it('downloads a single file with its name', () => {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const [file] = generate('{"a": 1}', { format: 'typescript' }).files;
    service.downloadFile(file);
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('cliente.model.ts');
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('copies text to the clipboard and reports failures', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await service.copy('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
    expect(await service.copy('abc')).toBe(false);
  });
});
