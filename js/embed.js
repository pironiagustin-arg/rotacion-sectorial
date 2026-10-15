// Si la página se abre dentro de la app (shell), oculta su propio encabezado: la navegación la maneja la app.
(function () {
  try { if (window.top !== window.self && window.top.location.origin === location.origin) document.documentElement.classList.add("embedded"); } catch (e) {}
})();
