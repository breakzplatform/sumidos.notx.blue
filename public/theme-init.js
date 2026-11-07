// Applies the saved theme before first paint to avoid a flash. A separate
// file so the Content-Security-Policy needs no inline script.
try {
  var saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'terminal') document.documentElement.setAttribute('data-theme', saved);
} catch (e) {}
