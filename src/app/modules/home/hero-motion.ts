/** Secuencia de bienvenida y vuelo decorativo; no interviene en las acciones de registro. */
export function setupHeroMotion(hero: HTMLElement): () => void {
  const view = hero.ownerDocument.defaultView;
  const route = hero.querySelector<SVGPathElement>('.route-path');
  const plane = hero.querySelector<SVGGElement>('.route-aircraft');
  const diagram = hero.querySelector<HTMLElement>('.route-diagram');
  if (!view || !route || !plane || !diagram) return () => {};

  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  hero.dataset['heroMotion'] = 'static';
  if (reduced.matches || hero.ownerDocument.documentElement.dataset['interaction'] === 'keyboard')
    return () => {};

  let frame = 0;
  let disposed = false;
  let flying = false;
  let introObserver: IntersectionObserver | undefined;
  let flightObserver: IntersectionObserver | undefined;
  const length = route.getTotalLength();
  const place = (progress: number) => {
    const point = route.getPointAtLength(progress * length);
    const before = route.getPointAtLength(Math.max(0, progress * length - 1));
    const after = route.getPointAtLength(Math.min(length, progress * length + 1));
    const angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI + 45;
    plane.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
    route.style.strokeDashoffset = String(1 - progress);
  };
  const cleanup = () => {
    disposed = true;
    view.cancelAnimationFrame(frame);
    introObserver?.disconnect();
    flightObserver?.disconnect();
    reduced.removeEventListener('change', onPreference);
    hero.ownerDocument.removeEventListener('keydown', onKeyboard);
  };
  const finish = () => {
    if (disposed) return;
    place(1);
    hero.dataset['heroMotion'] = 'complete';
    cleanup();
  };
  function onPreference() {
    if (reduced.matches) finish();
  }
  function onKeyboard() {
    finish();
  }
  const startIntro = () => {
    if (disposed) return;
    hero.dataset['heroMotion'] = 'running';
    introObserver?.disconnect();
  };
  const startFlight = () => {
    if (disposed || flying) return;
    flying = true;
    startIntro();
    flightObserver?.disconnect();
    route.style.strokeDasharray = '1';
    place(0);
    const start = view.performance.now();
    const tick = (now: number) => {
      if (disposed) return;
      const progress = Math.min(1, (now - start) / 2400);
      // Aceleración y frenada continuas para explicar el trayecto, sin un bucle de distracción.
      place(progress * progress * (3 - 2 * progress));
      if (progress < 1) frame = view.requestAnimationFrame(tick);
      else finish();
    };
    frame = view.requestAnimationFrame(tick);
  };
  reduced.addEventListener('change', onPreference);
  hero.ownerDocument.addEventListener('keydown', onKeyboard);
  if ('IntersectionObserver' in view) {
    introObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) startIntro();
    });
    flightObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) startFlight();
      },
      { threshold: 0.5 },
    );
    introObserver.observe(hero);
    flightObserver.observe(diagram);
  } else {
    startFlight();
  }
  return cleanup;
}
