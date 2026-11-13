import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DocumentsApi } from './documents-api';
import { RuntimeConfig } from './runtime-config';

beforeEach(() =>
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  }),
);
afterEach(() => TestBed.inject(HttpTestingController).verify());

it('envía el documento en el campo multipart file y conserva un rechazo 413', () => {
  const file = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' });
  let status = 0;
  TestBed.inject(DocumentsApi)
    .upload(file)
    .subscribe({
      error: (error: { status: number }) => {
        status = error.status;
      },
    });
  const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/documents');
  expect(request.request.method).toBe('POST');
  expect((request.request.body as FormData).get('file')).toBe(file);
  expect(request.request.headers.has('Content-Type')).toBe(false);
  request.flush({}, { status: 413, statusText: 'Payload Too Large' });
  expect(status).toBe(413);
});

it('solicita un enlace nuevo cada vez sin reutilizar el enlace caducado', () => {
  const links: string[] = [];
  const api = TestBed.inject(DocumentsApi);
  const http = TestBed.inject(HttpTestingController);
  api.download('document-42').subscribe((link) => links.push(link.url));
  http
    .expectOne('/api/v1/documents/document-42/download')
    .flush({ url: 'https://files.example.test/expired.pdf', expires_at: '2026-01-01T00:00:00Z' });
  api.download('document-42').subscribe((link) => links.push(link.url));
  http
    .expectOne('/api/v1/documents/document-42/download')
    .flush({ url: 'https://files.example.test/fresh.pdf', expires_at: '2027-01-01T00:00:00Z' });
  expect(links).toEqual([
    'https://files.example.test/expired.pdf',
    'https://files.example.test/fresh.pdf',
  ]);
});
