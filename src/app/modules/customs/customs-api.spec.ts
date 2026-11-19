import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../../core/runtime-config';
import { CustomsApi } from './customs-api';

it('consulta pendientes con el contrato paginado vigente y rechaza respuestas inesperadas', () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const api = TestBed.inject(CustomsApi);
  const http = TestBed.inject(HttpTestingController);
  const result = vi.fn();
  api.pending().subscribe(result);
  const request = http.expectOne((r) => r.url === '/api/v1/customs/lines');
  expect(request.request.params.get('pending')).toBe('true');
  request.flush({ lines: [], total: 0, limit: 200, offset: 0 });
  expect(result).toHaveBeenCalledWith([]);
  const error = vi.fn();
  api.pending().subscribe({ error });
  http.expectOne((r) => r.url === '/api/v1/customs/lines').flush({ pending: [] });
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('interpretar') }),
  );
  http.verify();
  TestBed.resetTestingModule();
});
