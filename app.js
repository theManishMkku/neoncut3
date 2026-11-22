(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var mmss = function (t) { t = Math.max(0, Math.floor(t || 0)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

  var S = {
    base: '', key: '',
    file: null, fileId: null, name: 'Midnight Vlog Cut', duration: 0,
    outputs: {},
    captions: [],
    busy: false
  };
  try { S.base = localStorage.getItem('nc_base') || ''; S.key = localStorage.getItem('nc_key') || ''; } catch (e) {}

  var isNative = function () { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); };
  var plug = function (n) { return window.Capacitor && Capacitor.Plugins ? Capacitor.Plugins[n] : null; };

  var preview = $('.preview');
  var iconBtns = $$('.icon-btn');
  var exportBtn = $('.export');
  var playfab = $('.playfab');
  var aiCards = $$('.ai-card');
  var tools = $$('.tool');
  var addfab = $('.addfab');
  var titleH1 = $('.title h1');
  var titleP = $('.title p');
  var capLive = $('.caption-live');
  var progBar = $('.pv-progress i');
  var timecode = $('.timecode');
  var resB = $('.pill.pr b');
  var pillPlay = '<path d="M6 4l14 8-14 8z"/>';
  var pillPause = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';

  function mk(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
  var scrim = mk('div', 'nc-scrim'), sheet = mk('div', 'nc-sheet'), toastEl = mk('div', 'nc-toast');
  document.body.appendChild(scrim); document.body.appendChild(sheet); document.body.appendChild(toastEl);
  var fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'video/*'; fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  var toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2400); }
  function openSheet(title, html) { sheet.innerHTML = '<div class="nc-grab"></div><h3>' + esc(title) + '</h3>' + html; scrim.classList.add('on'); sheet.classList.add('on'); }
  function closeSheet() { if (S.busy) { toast('Wait — working…'); return; } scrim.classList.remove('on'); sheet.classList.remove('on'); }
  scrim.addEventListener('click', closeSheet);

  var video = document.createElement('video');
  video.className = 'nc-video'; video.playsInline = true; video.setAttribute('playsinline', ''); video.preload = 'metadata';
  preview.insertBefore(video, $('.pill.pl'));

  function setSrc(url) { video.src = url; video.classList.add('on'); preview.classList.add('has-video'); video.load(); }

  video.addEventListener('loadedmetadata', function () {
    S.duration = video.duration || S.duration;
    if (resB && video.videoHeight) resB.textContent = video.videoHeight + 'p';
    if (titleP && titleP.lastChild) titleP.lastChild.textContent = '\u00a0Auto-saved\u00a0\u00a0·\u00a0\u00a0' + mmss(S.duration);
    if (timecode && timecode.lastChild) timecode.lastChild.textContent = mmss(S.duration);
  });
  video.addEventListener('timeupdate', function () {
    var b = timecode && timecode.querySelector('b'); if (b) b.textContent = mmss(video.currentTime);
    if (progBar && video.duration) progBar.style.width = (100 * video.currentTime / video.duration) + '%';
    showCaption();
  });
  video.addEventListener('play', function () { playfab.querySelector('svg').innerHTML = pillPause; playfab.style.opacity = '0'; });
  video.addEventListener('pause', function () { playfab.querySelector('svg').innerHTML = pillPlay; playfab.style.opacity = '1'; });
  video.addEventListener('click', togglePlay);

  function togglePlay() {
    if (!video.classList.contains('on')) { toast('Tap + to add a video'); return; }
    if (video.paused) video.play(); else video.pause();
  }
  playfab.addEventListener('click', togglePlay);

  function showCaption() {
    if (!video.classList.contains('on') || !capLive) return;
    var t = video.currentTime, hit = null;
    for (var i = 0; i < S.captions.length; i++) { if (t >= S.captions[i].s && t <= S.captions[i].e) { hit = S.captions[i]; break; } }
    if (hit) { capLive.textContent = hit.t; capLive.classList.remove('nc-hidden'); } else { capLive.classList.add('nc-hidden'); }
  }

  function baseUrl() { return S.base.replace(/\/+$/, ''); }
  function needServer() { if (!baseUrl()) { openSettings('Pehle server URL daalo'); return false; } return true; }
  function api(path, opts) {
    opts = opts || {}; opts.headers = Object.assign({ 'X-Key': S.key }, opts.headers || {});
    return fetch(baseUrl() + path, opts).then(function (r) {
      if (r.ok) return r.json();
      return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.detail || ('Server error ' + r.status)); });
    });
  }
  function fileUrl(o) { return baseUrl() + '/files/' + o.job + '/' + encodeURIComponent(o.name) + '?key=' + encodeURIComponent(S.key); }

  function upload(file, onp) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('POST', baseUrl() + '/upload');
      x.setRequestHeader('X-Key', S.key);
      x.upload.onprogress = function (e) { if (e.lengthComputable) onp(e.loaded / e.total); };
      x.onload = function () {
        var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
        if (x.status < 300 && j.file_id) res(j); else rej(new Error(j.detail || 'Upload failed'));
      };
      x.onerror = function () { rej(new Error('Server se connect nahi hua')); };
      var f = new FormData(); f.append('file', file); x.send(f);
    });
  }

  async function ensureUploaded(onp) {
    if (S.fileId) return;
    var j = await upload(S.file, function (p) { onp(p * 0.5, 'Uploading ' + Math.round(p * 100) + '%'); });
    S.fileId = j.file_id;
  }

  async function runJob(kind, params, onp) {
    await ensureUploaded(onp);
    var r = await api('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ kind: kind, file_id: S.fileId }, params)) });
    for (;;) {
      await sleep(1500);
      var j = await api('/jobs/' + r.job_id);
      onp(j.progress, j.message || 'Processing…');
      if (j.status === 'done') { j.id = r.job_id; return j; }
      if (j.status === 'error') throw new Error(j.message || 'Job failed');
    }
  }

  function progressUI() {
    sheet.innerHTML = '<div class="nc-grab"></div><h3>Working…</h3><div class="nc-bar indet" id="ncBar"><i></i></div><div class="nc-msg" id="ncMsg">Starting…</div>';
    var bar = $('#ncBar'), fill = $('#ncBar i'), msg = $('#ncMsg');
    return function (p, m) {
      if (typeof p === 'number') { bar.classList.remove('indet'); fill.style.width = Math.round(Math.min(1, p) * 100) + '%'; } else { bar.classList.add('indet'); }
      if (m) msg.textContent = m;
    };
  }

  function chips(id, items, selIdx) {
    return '<div class="nc-row" id="' + id + '">' + items.map(function (it, i) {
      return '<div class="nc-chip' + (i === selIdx ? ' sel' : '') + '" data-v="' + esc(it[0]) + '">' + esc(it[1]) + '</div>';
    }).join('') + '</div>';
  }
  function wireChips(id) {
    $$('#' + id + ' .nc-chip').forEach(function (c) { c.addEventListener('click', function () { $$('#' + id + ' .nc-chip').forEach(function (x) { x.classList.remove('sel'); }); c.classList.add('sel'); }); });
  }
  function chipVal(id) { var s = $('#' + id + ' .nc-chip.sel'); return s ? s.getAttribute('data-v') : ''; }

  function needVideo() { if (!S.file) { toast('Pehle + se video add karo'); return false; } return true; }

  function resultSheet(title, sub, items) {
    var h = '<p class="nc-sub">' + esc(sub) + '</p>';
    items.forEach(function (it, i) { h += '<div class="nc-item" data-i="' + i + '"><div>' + esc(it.label) + '<small>' + esc(it.name) + '</small></div><b>SAVE</b></div>'; });
    h += '<button class="nc-btn ghost" id="ncClose">Close</button>';
    sheet.innerHTML = '<div class="nc-grab"></div><h3>' + esc(title) + '</h3>' + h;
    $$('.nc-item', sheet).forEach(function (el) { el.addEventListener('click', function () { saveOut(items[+el.getAttribute('data-i')]); }); });
    $('#ncClose').addEventListener('click', closeSheet);
  }

  async function runTask(kind, params, title, onDone) {
    S.busy = true;
    var up = progressUI();
    try {
      var j = await runJob(kind, params, up);
      S.busy = false;
      onDone(j);
    } catch (e) {
      S.busy = false;
      openSheet('Error', '<p class="nc-sub">' + esc(e.message || e) + '</p><button class="nc-btn ghost" id="ncClose">Close</button>');
      $('#ncClose').addEventListener('click', closeSheet);
    }
  }

  async function saveOut(o) {
    try {
      var url = fileUrl(o);
      if (isNative() && plug('Filesystem')) {
        toast('Saving…');
        var dl = await plug('Filesystem').downloadFile({ url: url, path: 'NeonCut/' + o.name, directory: 'DOCUMENTS', recursive: true });
        toast('Saved: Documents/NeonCut/' + o.name);
        if (plug('Share')) {
          var u = await plug('Filesystem').getUri({ path: 'NeonCut/' + o.name, directory: 'DOCUMENTS' });
          try { await plug('Share').share({ title: o.name, files: [u.uri] }); } catch (e) {}
        }
        return dl;
      }
      var a = document.createElement('a'); a.href = url; a.download = o.name; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast('Save failed: ' + (e.message || e)); }
  }

  function openSplit() {
    if (!needVideo() || !needServer()) return;
    openSheet('Split into 30s clips',
      '<p class="nc-sub">Poori video 30-30 second ke clips me kat jayegi (30 min ki video = ~60 clips). Sab ek ZIP me milenge.</p>' +
      '<button class="nc-btn" id="ncGo">Start splitting</button><button class="nc-btn ghost" id="ncClose">Cancel</button>');
    $('#ncClose').addEventListener('click', closeSheet);
    $('#ncGo').addEventListener('click', function () {
      runTask('split', {}, 'Split', function (j) {
        var z = j.files.filter(function (f) { return /\.zip$/i.test(f); })[0];
        S.outputs.clips = { job: j.id, name: z, label: 'Clips ZIP (' + (j.result && j.result.count || '?') + ' clips)' };
        resultSheet('Clips ready', 'Save karke gallery/files me kholo.', [S.outputs.clips]);
      });
    });
  }

  function openCaptions() {
    if (!needVideo() || !needServer()) return;
    openSheet('Auto Captions',
      '<p class="nc-sub">Awaaz se captions banenge (Hindi / English). SRT file bhi milegi.</p>' +
      '<div class="nc-lbl">Language</div>' + chips('ncLang', [['auto', 'Auto'], ['hi', 'Hindi'], ['en', 'English']], 0) +
      '<div class="nc-lbl">Output</div>' + chips('ncTr', [['0', 'Same language'], ['1', 'Translate → English']], 0) +
      '<button class="nc-btn" id="ncGo">Generate captions</button><button class="nc-btn ghost" id="ncClose">Cancel</button>');
    wireChips('ncLang'); wireChips('ncTr');
    $('#ncClose').addEventListener('click', closeSheet);
    $('#ncGo').addEventListener('click', function () {
      runTask('captions', { language: chipVal('ncLang'), translate: chipVal('ncTr') === '1' }, 'Captions', function (j) {
        S.captions = (j.result && j.result.segments) || [];
        var srt = j.files.filter(function (f) { return /\.srt$/i.test(f); })[0];
        var txt = j.files.filter(function (f) { return /\.txt$/i.test(f); })[0];
        S.outputs.srt = { job: j.id, name: srt, label: 'Captions (.srt)' };
        S.outputs.txt = { job: j.id, name: txt, label: 'Transcript (.txt)' };
        showCaption();
        resultSheet('Captions ready', S.captions.length + ' lines · language: ' + ((j.result && j.result.language) || '?') + '. Preview me live dikh rahe hain.', [S.outputs.srt, S.outputs.txt]);
      });
    });
  }

  function openUpscale() {
    if (!needVideo() || !needServer()) return;
    var start = Math.floor(video.currentTime || 0);
    openSheet('AI Upscale',
      '<p class="nc-sub">Har frame AI (Real-ESRGAN) se enhance hota hai — colour grading nahi. Sirf <b>1 minute</b> process hoga, ' + mmss(start) + ' (playhead) se shuru.</p>' +
      '<p class="nc-warn" id="ncDev"></p>' +
      '<div class="nc-lbl">Scale</div>' + chips('ncScale', [['2', '2x'], ['4', '4x']], 0) +
      '<div class="nc-lbl">Quality</div>' + chips('ncQ', [['fast', 'Fast'], ['best', 'Best (slower)']], 0) +
      '<button class="nc-btn" id="ncGo">Start upscale</button><button class="nc-btn ghost" id="ncClose">Cancel</button>');
    wireChips('ncScale'); wireChips('ncQ');
    $('#ncClose').addEventListener('click', closeSheet);
    api('/health').then(function (h) {
      var d = $('#ncDev'); if (d && h.device !== 'cuda') d.textContent = 'Server pe GPU nahi mila — upscale bahut slow hoga. Colab me GPU runtime chalu karo.';
    }).catch(function () {});
    $('#ncGo').addEventListener('click', function () {
      runTask('upscale', { start: start, scale: +chipVal('ncScale'), quality: chipVal('ncQ') }, 'Upscale', function (j) {
        var o = { job: j.id, name: j.files[0], label: 'Upscaled video (' + (j.result && j.result.size || '') + ')' };
        S.outputs.upscale = o;
        setSrc(fileUrl(o));
        resultSheet('Upscale done', 'Preview ab enhanced clip dikha raha hai (1 min, ' + mmss(start) + ' se).', [o]);
      });
    });
  }

  function openExport() {
    var list = ['upscale', 'clips', 'srt', 'txt'].map(function (k) { return S.outputs[k]; }).filter(Boolean);
    if (!list.length) {
      openSheet('Export', '<p class="nc-sub">Abhi kuch export karne ko nahi hai. Pehle Split, Upscale ya Auto Captions chalao.</p><button class="nc-btn ghost" id="ncClose">Close</button>');
      $('#ncClose').addEventListener('click', closeSheet);
      return;
    }
    resultSheet('Export', 'Jo save karna hai us par tap karo.', list);
  }

  function openSettings(note) {
    openSheet('Settings',
      '<p class="nc-sub">' + esc(note || 'AI server (Colab) ka URL daalo. Split, Upscale aur Captions wahi pe chalte hain.') + '</p>' +
      '<div class="nc-lbl">Server URL</div><input class="nc-in" id="ncUrl" placeholder="https://xxxx.trycloudflare.com" value="' + esc(S.base) + '" autocapitalize="off" autocorrect="off">' +
      '<div class="nc-lbl">Key (optional)</div><input class="nc-in" id="ncKey" placeholder="NEONCUT_KEY agar set kiya ho" value="' + esc(S.key) + '" autocapitalize="off">' +
      '<button class="nc-btn" id="ncSave">Save & test</button><button class="nc-btn ghost" id="ncClose">Close</button><div class="nc-msg" id="ncMsg" style="margin-top:10px"></div>');
    $('#ncClose').addEventListener('click', closeSheet);
    $('#ncSave').addEventListener('click', async function () {
      S.base = $('#ncUrl').value.trim(); S.key = $('#ncKey').value.trim();
      try { localStorage.setItem('nc_base', S.base); localStorage.setItem('nc_key', S.key); } catch (e) {}
      var m = $('#ncMsg'); m.textContent = 'Testing…';
      try { var h = await api('/health'); m.textContent = 'Connected ✓  device: ' + h.device + ' · whisper: ' + h.whisper; }
      catch (e) { m.textContent = 'Connect nahi hua: ' + (e.message || e); }
    });
  }

  function openMenu() {
    openSheet('Project',
      '<div class="nc-item" id="ncRen"><div>Rename project<small>' + esc(S.name) + '</small></div><b>EDIT</b></div>' +
      '<div class="nc-item" id="ncSet"><div>Server settings<small>' + (S.base ? esc(S.base) : 'Not set') + '</small></div><b>OPEN</b></div>' +
      '<button class="nc-btn ghost" id="ncClose">Close</button>');
    $('#ncClose').addEventListener('click', closeSheet);
    $('#ncSet').addEventListener('click', function () { openSettings(); });
    $('#ncRen').addEventListener('click', function () {
      openSheet('Rename project', '<input class="nc-in" id="ncName" value="' + esc(S.name) + '"><button class="nc-btn" id="ncOk">Save</button>');
      $('#ncOk').addEventListener('click', function () { S.name = $('#ncName').value.trim() || S.name; titleH1.textContent = S.name; closeSheet(); });
    });
  }

  function selectTool(el) { tools.forEach(function (t) { t.classList.remove('sel'); }); el.classList.add('sel'); }
  function selectCard(el) { aiCards.forEach(function (c) { c.classList.remove('sel'); }); el.classList.add('sel'); }

  iconBtns[0].addEventListener('click', function () {
    var app = plug('App');
    if (isNative() && app && app.exitApp) app.exitApp(); else toast('Back');
  });
  iconBtns[1].addEventListener('click', openMenu);
  exportBtn.addEventListener('click', openExport);

  addfab.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0]; if (!f) return;
    S.file = f; S.fileId = null; S.outputs = {}; S.captions = [];
    S.name = f.name.replace(/\.[^.]+$/, '');
    titleH1.textContent = S.name;
    setSrc(URL.createObjectURL(f));
    capLive.classList.add('nc-hidden');
    toast('Video added');
  });

  aiCards[0].addEventListener('click', function () { selectCard(aiCards[0]); openCaptions(); });
  aiCards[1].addEventListener('click', function () { toast('Templates — coming soon'); });
  aiCards[2].addEventListener('click', function () { selectCard(aiCards[2]); openUpscale(); });

  tools.forEach(function (t) {
    var label = ($('span', t).textContent || '').trim();
    t.addEventListener('click', function () {
      selectTool(t);
      if (label === 'Edit') return;
      if (label === 'Split') return openSplit();
      toast(label + ' — coming soon');
    });
  });
})();
