// Fallback: remove the boot loader if the app bundle fails to mount.
// External file so the CSP (script-src 'self') allows it.
window.setTimeout(function () {
  var loader = document.getElementById('boot-loader')
  if (loader) loader.remove()
}, 10000)
