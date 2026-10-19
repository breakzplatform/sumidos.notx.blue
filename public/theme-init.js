// Applies the saved theme before first paint to avoid a flash.
// Kept as a separate file so the Content-Security-Policy needs no inline scripts.
try {
  var t = localStorage.getItem('quiet.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
