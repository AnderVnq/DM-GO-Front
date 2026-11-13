// Aplicar la apariencia antes de cargar Angular y las hojas de estilo.
(() => {
  let saved;
  try {
    saved = localStorage.getItem('dm48-theme');
  } catch {
    // La apariencia también funciona si el navegador impide guardar preferencias.
  }
  const mode =
    saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'dark' ? '#0b1120' : '#f8fafc');
})();
