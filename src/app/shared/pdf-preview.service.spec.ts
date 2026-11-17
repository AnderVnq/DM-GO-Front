import { RuntimeConfig } from '../core/runtime-config';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PdfPreviewService } from './pdf-preview.service';

afterEach(() => TestBed.resetTestingModule());
it('consulta enlaces firmados sin interceptores ni credenciales de la API', () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(
        withInterceptors([
          (req, next) => next(req.clone({ setHeaders: { Authorization: 'Bearer private' } })),
        ]),
      ),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: {} } },
    ],
  });
  const service = TestBed.inject(PdfPreviewService);
  service.fetch('https://files.example.test/file.pdf').subscribe();
  const http = TestBed.inject(HttpTestingController);
  const request = http.expectOne('https://files.example.test/file.pdf');
  expect(request.request.headers.has('Authorization')).toBe(false);
  expect(request.request.withCredentials).toBe(false);
  expect(request.request.responseType).toBe('blob');
  request.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
  http.verify();
});
it('rechaza protocolos que no sean HTTP antes de hacer peticiones', () => {
  const service = TestBed.inject(PdfPreviewService);
  expect(() => service.fetch('javascript:alert(1)')).toThrow(
    'El enlace del documento no es válido.',
  );
});
it('permite sustituir la vista y liberar la solicitud al cerrar', () => {
  const service = TestBed.inject(PdfPreviewService);
  const source = vi.fn();
  service.open('Nota 1', 'nota-1.pdf', source);
  service.open('Nota 2', 'nota-2.pdf', source);
  expect(service.request()?.filename).toBe('nota-2.pdf');
  service.close();
  expect(service.request()).toBeNull();
  expect(source).not.toHaveBeenCalled();
});

it('usa el proxy solo para el origen configurado y conserva la firma', () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: RuntimeConfig,
        useValue: { value: { documentProxyOrigin: 'http://localhost:4566' } },
      },
    ],
  });
  TestBed.inject(PdfPreviewService)
    .fetch('http://localhost:4566/bucket/key.pdf?X-Amz-Signature=abc%2F123&expires=30')
    .subscribe();
  const http = TestBed.inject(HttpTestingController);
  const request = http.expectOne(
    '/document-storage/bucket/key.pdf?X-Amz-Signature=abc%2F123&expires=30',
  );
  expect(request.request.headers.has('Authorization')).toBe(false);
  request.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
  http.verify();
});
