// Getting PNG blobs off the page: download now; share sheet + clipboard arrive in step 8.
// Only handles blobs; knows nothing about the game.
window.DG = window.DG || {};

DG.Share = (function () {
  // Plain download. Works everywhere; on iOS it saves to the Files app, not Photos.
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); // give slow browsers time to start the download
  }

  return { download };
})();
