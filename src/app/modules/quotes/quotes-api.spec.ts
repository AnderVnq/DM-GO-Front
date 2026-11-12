import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../../core/runtime-config';
import { QuotesApi } from './quotes-api';

describe('QuotesApi', () => {
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
  it('trata el PDF de cotización como binario y no como enlace firmado', () => {
    TestBed.inject(QuotesApi)
      .pdf('quote-1')
      .subscribe((blob) => expect(blob.type).toBe('application/pdf'));
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/quotes/quote-1/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
  });
});
