import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConsolidationApi } from './consolidation-api';
import { RuntimeConfig } from '../../core/runtime-config';

it('usa rutas, verbos y cuerpos del tablero y de todas sus mutaciones', () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const api = TestBed.inject(ConsolidationApi);
  const http = TestBed.inject(HttpTestingController);
  api.guideGroups('c/1').subscribe();
  const read = http.expectOne('/api/v1/consolidations/c%2F1/guide-groups');
  expect(read.request.method).toBe('GET');
  read.flush({});
  api.createGuideGroup('c1', ['p1', 'p2']).subscribe();
  const create = http.expectOne('/api/v1/consolidations/c1/guide-groups');
  expect(create.request.method).toBe('POST');
  expect(create.request.body).toEqual({ package_ids: ['p1', 'p2'] });
  create.flush({});
  api.updateGuideGroup('g/1', ['p2']).subscribe();
  const update = http.expectOne('/api/v1/guide-groups/g%2F1');
  expect(update.request.method).toBe('PUT');
  expect(update.request.body).toEqual({ package_ids: ['p2'] });
  update.flush({});
  api.orderGuideGroups('c1', ['g2', 'g1']).subscribe();
  const order = http.expectOne('/api/v1/consolidations/c1/guide-groups/order');
  expect(order.request.method).toBe('PUT');
  expect(order.request.body).toEqual({ group_ids: ['g2', 'g1'] });
  order.flush({});
  api.deleteGuideGroup('g1').subscribe();
  const remove = http.expectOne('/api/v1/guide-groups/g1');
  expect(remove.request.method).toBe('DELETE');
  remove.flush(null, { status: 204, statusText: 'No Content' });
  http.verify();
});
