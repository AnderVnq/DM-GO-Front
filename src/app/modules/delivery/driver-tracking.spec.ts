import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeConfig } from '../../core/runtime-config';
import { DriverTracking } from './driver-tracking';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
it('pide permiso solo al activar, envía GPS y deja de observar al cambiar la ruta', () => {
  let receive!: PositionCallback;
  const watchPosition = vi.fn((success: PositionCallback) => {
    receive = success;
    return 8;
  });
  const clearWatch = vi.fn();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
    ],
  });
  const fixture = TestBed.createComponent(DriverTracking);
  fixture.componentRef.setInput('routeId', 'r1');
  fixture.componentRef.setInput('active', true);
  fixture.detectChanges();
  const page = fixture.componentInstance;
  expect(watchPosition).not.toHaveBeenCalled();
  page.start();
  receive({
    coords: { latitude: -12.1, longitude: -77, accuracy: 10 },
    timestamp: Date.now(),
  } as GeolocationPosition);
  const http = TestBed.inject(HttpTestingController);
  const request = http.expectOne('/api/v1/driver/locations');
  expect(request.request.body.points[0]).toEqual(
    expect.objectContaining({ latitude: -12.1, longitude: -77, accuracy_m: 10 }),
  );
  request.flush({ accepted: 1 });
  expect(page.message()).toContain('Ubicación enviada');
  fixture.componentRef.setInput('routeId', 'r2');
  fixture.detectChanges();
  expect(clearWatch).toHaveBeenCalledWith(8);
  expect(page.watch).toBeNull();
  http.verify();
});
