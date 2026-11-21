import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth.service';
import { RuntimeConfig } from '../../core/runtime-config';
import { RouteLive } from './route-live';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
it.each(['operations', 'portal'] as const)(
  'consume eventos de %s y cancela la conexión al salir',
  async (audience) => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        source = c;
      },
      cancel: cancelled,
    });
    const fetchMock = vi.fn(
      async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { validToken: async () => 'test-token' } },
        { provide: RuntimeConfig, useValue: { value: { apiBaseUrl: '/api/v1' } } },
      ],
    });
    const fixture = TestBed.createComponent(RouteLive);
    fixture.componentRef.setInput('routeId', 'r1');
    fixture.componentRef.setInput('audience', audience);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const encoder = new TextEncoder();
    source.enqueue(encoder.encode('event: location\ndata: {"lat":-12.1,'));
    source.enqueue(encoder.encode('"lng":-77,"recorded_at":"2026-11-19T12:00:00Z"}\n\n'));
    await vi.waitFor(() => expect(fixture.componentInstance.position()?.lat).toBe(-12.1));
    const options = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(options[0]).toBe(
      audience === 'portal' ? '/api/v1/portal/packages/r1/live' : '/api/v1/routes/r1/live',
    );
    expect(options[1].headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer test-token' }),
    );
    fixture.destroy();
    expect(options[1].signal?.aborted).toBe(true);
    source.close();
  },
);
