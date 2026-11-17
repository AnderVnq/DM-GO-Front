/** Explica las etapas visibles sin repetir la secuencia al volver a desplazarse. */
export function setupProcessMotion(list: HTMLElement): () => void {
  const view = list.ownerDocument.defaultView;
  const steps = Array.from(list.querySelectorAll<HTMLElement>(':scope > li'));
  list.dataset['processMotion'] = 'static';
  if (!view || !steps.length) return () => {};
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || list.ownerDocument.documentElement.dataset['interaction'] === 'keyboard')
    return () => {};

  const animations = new Set<Animation>();
  const started = new Set<HTMLElement>();
  const completed = new Set<HTMLElement>();
  let observer: IntersectionObserver | undefined;
  let disposed = false;
  list.dataset['processMotion'] = 'ready';
  const cleanup = () => {
    disposed = true;
    observer?.disconnect();
    for (const animation of animations) animation.cancel();
    animations.clear();
    reduced.removeEventListener('change', onPreference);
    list.ownerDocument.removeEventListener('keydown', finishAll);
  };
  function finishAll() {
    if (disposed) return;
    for (const step of steps) {
      step.dataset['stepMotion'] = 'complete';
      const marker = step.querySelector<HTMLElement>('.step-marker');
      const connector = step.querySelector<HTMLElement>('.step-connector');
      if (marker) marker.style.color = 'var(--accent)';
      if (connector) connector.style.background = 'var(--accent)';
    }
    list.dataset['processMotion'] = 'complete';
    cleanup();
  }
  function onPreference() {
    if (reduced.matches) finishAll();
  }
  const play = (
    element: HTMLElement,
    frames: Keyframe[],
    delay: number,
    duration: number,
    done?: () => void,
  ) => {
    const animation = element.animate(frames, {
      duration,
      delay,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'both',
    });
    animations.add(animation);
    animation.onfinish = () => {
      animation.cancel();
      animations.delete(animation);
      done?.();
    };
  };
  const start = (step: HTMLElement, delay: number) => {
    if (disposed || started.has(step)) return;
    started.add(step);
    observer?.unobserve(step);
    list.dataset['processMotion'] = 'running';
    step.dataset['stepMotion'] = 'running';
    const marker = step.querySelector<HTMLElement>('.step-marker');
    const connector = step.querySelector<HTMLElement>('.step-connector');
    if (marker) {
      marker.style.color = 'var(--accent)';
      play(marker, [{ transform: 'scale(0.9)' }, { transform: 'none' }], delay, 360);
    }
    if (connector) {
      const axis = view.matchMedia('(max-width: 650px)').matches ? 'Y' : 'X';
      connector.style.transformOrigin = axis === 'Y' ? 'center top' : 'left center';
      connector.style.background = 'var(--accent)';
      play(
        connector,
        [{ transform: `scale${axis}(0)` }, { transform: `scale${axis}(1)` }],
        delay + 170,
        250,
      );
    }
    play(step, [{ opacity: 0.6 }, { opacity: 1 }], delay, 520, () => {
      step.dataset['stepMotion'] = 'complete';
      completed.add(step);
      if (completed.size === steps.length) finishAll();
    });
  };
  reduced.addEventListener('change', onPreference);
  list.ownerDocument.addEventListener('keydown', finishAll);
  if ('IntersectionObserver' in view) {
    observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              steps.indexOf(a.target as HTMLElement) - steps.indexOf(b.target as HTMLElement),
          )
          .forEach((entry, index) => start(entry.target as HTMLElement, index * 220));
      },
      { threshold: 0.3 },
    );
    steps.forEach((step) => observer!.observe(step));
  } else {
    finishAll();
  }
  return cleanup;
}
