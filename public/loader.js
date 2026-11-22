/* Loading screen controller (classic script: runs before the game modules, so it can also report
   when those fail to load). The game calls MA_LOAD.set(percent, message) while it builds the world
   and MA_LOAD.done() once it is ready. */
(function () {
  var TIPS = [
    'Every table holds a letter, photo, ticket or note. Press E when you stand next to one.',
    'Alibis clear suspects. Two matching traits point at the culprit.',
    'Drag the mouse to look around. WASD or the arrow keys to walk.',
    'In a group, everyone must pick the same suspect before the case can be submitted.',
    'Not every angry letter means guilt. Some motives are red herrings.',
    'Photographs often hide the best details. Read the captions carefully.'
  ];
  var finished = false, failed = false, slowTimer, hardTimer;
  function $(id) { return document.getElementById(id); }

  var api = window.MA_LOAD = {
    set: function (pct, msg) {
      if (finished || failed) return;
      var f = $('ldFill'), m = $('ldMsg');
      if (f) f.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (m && msg) m.textContent = msg;
    },
    done: function () {
      if (finished || failed) return;
      finished = true; clearTimeout(slowTimer); clearTimeout(hardTimer);
      api.set(100, 'Ready');
      var el = $('loading'); if (!el) return;
      setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.style.display = 'none'; }, 700); }, 250);
    },
    fail: function (title, detail) {
      if (finished || failed) return;     // an error after the game started is handled by the game itself
      failed = true; clearTimeout(slowTimer); clearTimeout(hardTimer);
      var el = $('loading'); if (el) { el.style.display = ''; el.classList.remove('out'); el.classList.add('failed'); }
      var t = $('ldErrTitle'), d = $('ldErrText'), box = $('ldErr');
      if (t) t.textContent = title || 'Something went wrong';
      if (d) d.textContent = detail || '';
      if (box) box.classList.remove('hidden');
      var m = $('ldMsg'); if (m) m.textContent = '';
    },
    isDone: function () { return finished; }
  };

  var tip = $('ldTip'); if (tip) tip.textContent = 'Tip: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  var retry = $('ldRetry'); if (retry) retry.onclick = function () { location.reload(); };
  api.set(8, 'Opening the case files…');

  // slow connection hints
  slowTimer = setTimeout(function () { if (!finished && !failed) { var m = $('ldMsg'); if (m) m.textContent = 'Still loading. Your connection looks slow…'; } }, 12000);
  hardTimer = setTimeout(function () { if (!finished && !failed) api.fail('This is taking too long', 'The game could not finish loading. Check your internet connection and try again.'); }, 45000);

  // a script or module that fails to download (offline, blocked CDN, missing /three files)
  window.addEventListener('error', function (e) {
    if (finished || failed) return;
    var t = e.target;
    if (t && t.tagName === 'SCRIPT') {
      var src = t.src || '';
      if (/socket\.io/.test(src)) return api.fail('Cannot reach the game server', 'The multiplayer client did not load. Make sure the server is running, then try again.');
      if (t.type === 'module') return api.fail('Could not load the 3D engine', 'A game file failed to download. Check your internet connection (and that "npm install" was run on the server), then try again.');
      return api.fail('A game file failed to load', src.split('/').pop() + ' could not be downloaded. Check your connection and try again.');
    }
    if (e.error) api.fail('Something went wrong while loading', String(e.message || e.error));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    if (finished || failed) return;
    api.fail('Something went wrong while loading', String((e.reason && e.reason.message) || e.reason || 'Unknown error'));
  });
})();
