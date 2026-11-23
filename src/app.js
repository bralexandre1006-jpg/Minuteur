(() => {
  const T = window.__TAURI__;
  const invoke = T?.core?.invoke;
  const win = T?.window?.getCurrentWindow?.();

  const KEY = 'minuteur.v1';
  const CIRC = 2 * Math.PI * 118;
  const MAX = (23 * 3600 + 59 * 60 + 59) * 1000;
  const PRESETS = [1, 3, 5, 10, 15, 20, 25, 30, 45, 60];
  const BELL = '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>';

  const $ = id => document.getElementById(id);
  const shell = $('shell'), prog = $('prog'), timeEl = $('time'), sub = $('sub');
  const btnMain = $('btnMain'), btnReset = $('btnReset'), label = $('label');
  const segs = { h: timeEl.querySelector('[data-k="h"]'), m: timeEl.querySelector('[data-k="m"]'), s: timeEl.querySelector('[data-k="s"]') };
  const colonH = timeEl.querySelector('[data-c="h"]');

  const s = load();
  let raf = 0, lastKey = '', alarm = null, ac = null, buf = '', labelTimer = 0;

  function load() {
    const d = { setMs: 300000, label: '', sound: true, pin: false, status: 'idle', total: 0, endAt: 0, remaining: 0 };
    try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return d; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

  const pad = n => String(n).padStart(2, '0');
  const split = ms => { const t = Math.ceil(ms / 1000); return [Math.floor(t / 3600), Math.floor(t % 3600 / 60), t % 60]; };
  const clock = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  function human(ms) {
    const [h, m, sec] = split(ms);
    return [h && `${h} h`, m && `${m} min`, sec && `${sec} s`].filter(Boolean).join(' ') || '0 s';
  }

  function remaining() {
    if (s.status === 'running') return Math.max(0, s.endAt - Date.now());
    if (s.status === 'paused') return s.remaining;
    if (s.status === 'done') return 0;
    return s.setMs;
  }

  // ---------- native bridge ----------
  function arm() {
    const title = s.label.trim() || 'Minuteur';
    const body = `Le temps est écoulé (${human(s.total)}).`;
    invoke?.('arm', { endMs: Math.round(s.endAt), title, body }).catch(() => {});
  }
  function disarm() { invoke?.('disarm').catch(() => {}); }
  function webNotify() {
    if (invoke || !('Notification' in window)) return;
    if (Notification.permission === 'granted') new Notification(s.label.trim() || 'Minuteur', { body: `Le temps est écoulé (${human(s.total)}).` });
  }

  // ---------- sound ----------
  function ensureAudio() {
    try {
      ac ||= new AudioContext();
      if (ac.state === 'suspended') ac.resume();
    } catch {}
  }
  function chime() {
    if (!ac) return;
    const t0 = ac.currentTime + .02;
    [[1318.5, 0], [1975.5, .15], [2637, .3]].forEach(([f, d]) => {
      [[1, .16], [2.76, .035], [5.4, .012]].forEach(([mul, peak]) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = t0 + d;
        o.type = 'sine';
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + .008);
        g.gain.exponentialRampToValueAtTime(.0001, t + (mul === 1 ? 1.6 : .6));
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + 1.7);
      });
    });
  }
  function startAlarm() {
    stopAlarm();
    if (!s.sound) return;
    ensureAudio();
    chime();
    let n = 0;
    alarm = setInterval(() => (++n >= 30 ? stopAlarm() : chime()), 2000);
  }
  function stopAlarm() { clearInterval(alarm); alarm = null; }

  // ---------- state transitions ----------
  function go(ms) {
    s.total = ms;
    s.endAt = Date.now() + ms;
    s.status = 'running';
    arm();
    commit();
  }
  function start() {
    ensureAudio();
    if (s.setMs <= 0) return;
    buf = '';
    go(s.setMs);
  }
  function pause() {
    s.remaining = Math.max(0, s.endAt - Date.now());
    s.status = 'paused';
    disarm();
    commit();
  }
  function resume() {
    ensureAudio();
    s.endAt = Date.now() + s.remaining;
    s.status = 'running';
    arm();
    commit();
  }
  function reset() {
    disarm();
    stopAlarm();
    s.status = 'idle';
    commit();
  }
  function repeat() { stopAlarm(); go(s.total); }
  function finish(silent) {
    if (s.status !== 'running') return;
    s.status = 'done';
    commit();
    if (!silent) { startAlarm(); webNotify(); }
  }
  function addTime(ms) {
    if (s.status === 'running') {
      s.endAt += ms; s.total += ms; arm();
    } else if (s.status === 'paused') {
      s.remaining += ms; s.total += ms;
    } else if (s.status === 'done') {
      stopAlarm(); return go(ms);
    } else return;
    commit();
  }
  function commit() { save(); render(); loop(); }

  function setParts(h, m, sec) {
    s.setMs = Math.min(MAX, Math.max(0, ((h * 60 + m) * 60 + sec) * 1000));
    save();
    render();
  }

  // ---------- rendering ----------
  function render() {
    shell.dataset.status = s.status;
    btnMain.textContent = { idle: 'Démarrer', running: 'Pause', paused: 'Reprendre', done: 'OK' }[s.status];
    btnReset.textContent = s.status === 'done' ? 'Répéter' : 'Annuler';
    btnReset.disabled = s.status === 'idle';
    btnMain.disabled = s.status === 'idle' && s.setMs <= 0;
    document.querySelectorAll('#presets .chip').forEach(c => c.classList.toggle('on', +c.dataset.min * 60000 === s.setMs));
    $('btnPin').classList.toggle('on', s.pin);
    $('btnSound').classList.toggle('muted', !s.sound);
    lastKey = '';
    tick();
  }

  function tick() {
    const ms = remaining();
    const frac = s.status === 'idle' || s.status === 'done' ? 1 : s.total ? ms / s.total : 0;
    prog.style.strokeDashoffset = String(CIRC * (1 - Math.min(1, frac)));

    const [h, m, sec] = split(ms);
    const key = `${s.status}|${h}:${m}:${sec}`;
    if (key !== lastKey) {
      lastKey = key;
      const idle = s.status === 'idle';
      const showH = idle || h > 0;
      segs.h.hidden = colonH.hidden = !showH;
      timeEl.classList.toggle('long', showH);
      segs.h.textContent = pad(h);
      segs.m.textContent = pad(m);
      segs.s.textContent = pad(sec);
      segs.h.classList.toggle('zero', idle && h === 0);
      segs.m.classList.toggle('zero', idle && h === 0 && m === 0);
      segs.s.classList.toggle('zero', idle && ms === 0);

      if (s.status === 'running') sub.innerHTML = `${BELL}<span>${clock(s.endAt)}</span>`;
      else if (s.status === 'paused') sub.textContent = 'En pause';
      else if (s.status === 'done') sub.textContent = 'Terminé';
      else sub.textContent = 'Molette ou clavier pour régler';

      const t = (h ? `${h}:` : '') + `${h ? pad(m) : m}:${pad(sec)}`;
      const title = s.status === 'running' || s.status === 'paused' ? `${t} · Minuteur` : 'Minuteur';
      if (document.title !== title) { document.title = title; win?.setTitle(title).catch(() => {}); }
    }

    if (s.status === 'running' && ms <= 0) finish();
  }

  function loop() {
    cancelAnimationFrame(raf);
    if (s.status !== 'running') return;
    const frame = () => { tick(); if (s.status === 'running') raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
  }

  // ---------- UI wiring ----------
  $('presets').innerHTML = PRESETS.map(min =>
    `<button class="chip glass" data-min="${min}">${min === 60 ? '1<small> h</small>' : `${min}<small> min</small>`}</button>`
  ).join('');

  $('presets').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c || s.status !== 'idle') return;
    buf = '';
    s.setMs = +c.dataset.min * 60000;
    save();
    render();
  });
  $('presets').addEventListener('dblclick', e => { if (e.target.closest('.chip') && s.status === 'idle') start(); });
  $('extras').addEventListener('click', e => {
    const c = e.target.closest('[data-add]');
    if (c) addTime(+c.dataset.add * 1000);
  });

  btnMain.addEventListener('click', () => ({ idle: start, running: pause, paused: resume, done: reset })[s.status]());
  btnReset.addEventListener('click', () => (s.status === 'done' ? repeat() : reset()));

  timeEl.addEventListener('wheel', e => {
    const seg = e.target.closest('.seg');
    if (!seg || s.status !== 'idle') return;
    e.preventDefault();
    buf = '';
    const k = seg.dataset.k, dir = e.deltaY < 0 ? 1 : -1;
    let [h, m, sec] = split(s.setMs);
    if (k === 'h') h = (h + dir + 24) % 24;
    if (k === 'm') m = (m + dir * (e.shiftKey ? 5 : 1) + 60) % 60;
    if (k === 's') sec = (sec + dir * (e.shiftKey ? 15 : 5) + 60) % 60;
    setParts(h, m, sec);
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (e.target === label) {
      if (e.key === 'Enter' || e.key === 'Escape') label.blur();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); btnMain.click(); return; }
    if (e.key === 'Escape') { if (s.status !== 'idle') reset(); return; }
    if (s.status !== 'idle') return;
    if (/^[0-9]$/.test(e.key)) {
      buf = (buf + e.key).replace(/^0+/, '').slice(-6);
    } else if (e.key === 'Backspace') {
      buf = buf.slice(0, -1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      buf = '';
      s.setMs = Math.min(MAX, Math.max(0, s.setMs + (e.key === 'ArrowUp' ? 60000 : -60000)));
      save(); render();
      return;
    } else return;
    const d = buf.padStart(6, '0');
    setParts(+d.slice(0, 2), +d.slice(2, 4), +d.slice(4));
  });

  label.value = s.label;
  label.addEventListener('input', () => {
    s.label = label.value;
    save();
    if (s.status === 'running') { clearTimeout(labelTimer); labelTimer = setTimeout(arm, 400); }
  });

  $('btnClose').addEventListener('click', () => (win ? win.close() : window.close()));
  $('btnMin').addEventListener('click', () => win?.minimize());
  $('btnPin').addEventListener('click', () => {
    s.pin = !s.pin;
    win?.setAlwaysOnTop(s.pin).catch(() => {});
    save(); render();
  });
  $('btnSound').addEventListener('click', () => {
    s.sound = !s.sound;
    if (!s.sound) stopAlarm(); else { ensureAudio(); chime(); }
    save(); render();
  });

  document.addEventListener('contextmenu', e => { if (e.target !== label) e.preventDefault(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastKey = ''; tick(); loop(); } });
  setInterval(() => { if (s.status === 'running') tick(); }, 1000);

  T?.event?.listen('timer-fired', e => {
    if (s.status === 'running' && e.payload === Math.round(s.endAt)) finish();
  });

  // ---------- restore ----------
  if (s.status === 'running') {
    if (s.endAt <= Date.now()) s.status = 'done';
    else arm();
  }
  if (s.pin) win?.setAlwaysOnTop(true).catch(() => {});
  if (!invoke && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  render();
  loop();
})();
