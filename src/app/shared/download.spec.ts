import { savePdf, openDownload } from './download';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('revoca la URL temporal después de iniciar la descarga del PDF', () => {
  vi.useFakeTimers();
  const create = vi.fn(() => 'blob:quote-test');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = create;
      static override revokeObjectURL = revoke;
    },
  );
  let downloaded: HTMLAnchorElement | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded = this;
  });
  savePdf(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), 'COT-042.pdf');
  expect(downloaded?.getAttribute('href')).toBe('blob:quote-test');
  expect(downloaded?.download).toBe('COT-042.pdf');
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:quote-test');
});

it('rechaza respuestas que no son PDF sin crear descargas temporales', () => {
  const create = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = create;
    },
  );
  expect(() => savePdf(new Blob(['Error'], { type: 'text/html' }), 'error.pdf')).toThrow(
    'La respuesta recibida no es un PDF.',
  );
  expect(create).not.toHaveBeenCalled();
});

it('abre el enlace firmado sin conceder acceso a la ventana de origen', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  openDownload('https://files.example.test/document.pdf');
  expect(open).toHaveBeenCalledExactlyOnceWith(
    'https://files.example.test/document.pdf',
    '_blank',
    'noopener,noreferrer',
  );
  expect(() => openDownload('javascript:alert(1)')).toThrow('El enlace de descarga no es válido.');
  expect(open).toHaveBeenCalledTimes(1);
});
