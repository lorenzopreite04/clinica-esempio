(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const html = document.documentElement;

  // ---------- loading screen: until the hero video can play and the fonts are in (6 s at most) ----------
  {
    const t0 = performance.now();
    const day = html.dataset.theme === 'day';
    const vid = $(day ? '#v-day' : '#v-night'), other = $(day ? '#v-night' : '#v-day');
    vid.src = vid.dataset.src;                          // the visible video alone at first: a shorter wait
    const canPlay = new Promise(r => {
      vid.addEventListener('canplay', r, { once: true });
      vid.addEventListener('error', r, { once: true });
    });
    const loadOther = () => { if (!other.src) other.src = other.dataset.src; };
    canPlay.then(loadOther);
    setTimeout(loadOther, 6000);                        // whatever happens, the spotlight video comes too
    Promise.race([Promise.all([canPlay, document.fonts && document.fonts.ready]), new Promise(r => setTimeout(r, 6000))])
      .then(() => setTimeout(() => {
        html.classList.remove('loading');
        setTimeout(measure, 1400);                      // where the hero texts are once they have come in
        if (!consent) setTimeout(askConsent, 1200);     // the cookie banner, once the hero has come in
        if (startHash) openFromHash(startHash);
      }, Math.max(0, 700 - (performance.now() - t0)))); // shown long enough not to flash
  }

  // ---------- open / closed status (Mon–Fri 8:30–19:30, Sat 9:00–13:00) ----------
  // on Rome's clock (whatever the visitor's time zone), closed on public holidays
  const romeClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: 'numeric',
    day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  function easterMonday(y) {                           // Gregorian Easter (anonymous algorithm) + 1 day, as "m-d"
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easter = new Date(Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1 + 1));
    return `${easter.getUTCMonth() + 1}-${easter.getUTCDate()}`;
  }
  // national holidays + Saints Peter and Paul (29 June, Rome's patron saints)
  const HOLIDAYS = ['1-1', '1-6', '4-25', '5-1', '6-2', '6-29', '8-15', '11-1', '12-8', '12-25', '12-26'];
  function updateStatus(root = document) {
    const p = Object.fromEntries(romeClock.formatToParts(new Date()).map(x => [x.type, x.value]));
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), m = +p.hour * 60 + +p.minute;
    const date = `${+p.month}-${+p.day}`;
    const holiday = HOLIDAYS.includes(date) || date === easterMonday(+p.year);
    const open = !holiday && ((day >= 1 && day <= 5 && m >= 510 && m < 1170) || (day === 6 && m >= 540 && m < 780));
    $$('[data-status]', root).forEach(el => {
      el.classList.toggle('is-open', open);
      el.querySelector('em').textContent = open ? 'Aperto ora' : 'Chiuso ora';
    });
  }
  updateStatus();
  setInterval(updateStatus, 60000);

  // ---------- full section panel ----------
  // Clicking a cell expands it to fill the screen; "Torna alla griglia", Esc and the browser
  // back button all shrink it back into the same cell.
  const panel = $('#panel'), panelBody = $('#panel-body'), panelKicker = $('#panel-kicker');
  const LABELS = { chi: 'Chi siamo', trattamenti: 'I trattamenti', prenota: 'Prenota', contatti: 'Contatti e orari', dove: 'Dove siamo' };
  let panelOpen = false, panelOrigin = null;
  const EASE = 'cubic-bezier(.65,0,.35,1)';
  const ZOOM = 'cubic-bezier(.7,0,.2,1)';
  const OPEN_MS = 750, CLOSE_MS = 650;
  const pinned = $('.sticky');
  const panelInner = $('#panel-inner'), panelBar = $('.panel-bar', panel), panelAlt = $('#panel-alt'), panelTint = $('#panel-tint');
  let closing = false, pendingCard = null;
  let panelReady = false;            // true once the section has finished growing
  let twin = new Map();              // element of the section -> its copy in the spotlight layer
  const both = el => el ? [el, twin.get(el)].filter(Boolean) : [];

  // the section starts with the colour of what was clicked (cell background, or the cell colour for small buttons)
  function colorOf(el) {
    const c = getComputedStyle(el).backgroundColor;
    return c === 'rgba(0, 0, 0, 0)' || c === 'transparent' ? getComputedStyle(html).getPropertyValue('--cell').trim() : c;
  }
  const bgColor = () => getComputedStyle(html).getPropertyValue('--bg').trim();
  function insetOf(el) {
    const r = el.getBoundingClientRect();
    const radius = el.classList.contains('cell') ? 16 : 8;
    return `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${radius}px)`;
  }
  const FULL = 'inset(0px 0px 0px 0px round 0px)';
  // scale the section around the centre of the cell, so it really grows out of it
  function originAt(el) {
    const r = el.getBoundingClientRect();
    panelInner.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2 + panel.scrollTop}px`;
  }
  const GRID_BACK = [{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: .35 }];

  // ---------- section content entering the viewport ----------
  const REVEAL = '.p-title, .kicker, .p-lead, .p-card, .p-rows li, .p-map, .booking, .pr-points li, .status, .p-split > div > .btn, ' +
    '.chi-photo, .chi-val, .chi-team, .chi-text > .btn, .tr-media, .tr-wheel, .dv-map, .dv-ui, .dv-cta, .ct-rev';
  const io = new IntersectionObserver(entries => {
    let i = 0;
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      revealEl(en.target, 120 + i++ * 55);
    }
  }, { root: panel, threshold: 0.1 });

  // transform + opacity only (no blur): cheap for the browser, so it stays smooth
  // (the spotlight copy, if any, moves in step with the original)
  function revealEl(el, delay) {
    both(el).forEach(t => t.classList.add('in'));
    if (el.matches('.p-title')) { // title rises line by line from behind a mask
      el.querySelectorAll('.ln > span').forEach((s, k) => both(s).forEach(t => t.animate(
        [{ transform: 'translateY(110%)' }, { transform: 'none' }],
        { duration: 900, delay: delay + k * 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })));
      return;
    }
    if (el.matches('.chi-photo, .tr-media, .dv-map')) { // the portrait / video / map settles in, from slightly closer
      both(el).forEach(t => t.animate(
        [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'none' }],
        { duration: 1400, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
      return;
    }
    both(el).forEach(t => t.animate(
      [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }],
      { duration: 700, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
  }
  function prepReveal() {
    const t = panelBody.querySelector('.p-title');
    t.innerHTML = t.innerHTML.split(/<br\s*\/?>/i).map(l => `<span class="ln"><span>${l}</span></span>`).join('');
    $$(REVEAL, panelBody).forEach(el => { el.classList.add('rvl'); io.observe(el); });
  }

  function fill(id, service) {
    io.disconnect();
    dropMap();
    panelBody.replaceChildren($('#tpl-' + id).content.cloneNode(true));
    panelKicker.textContent = LABELS[id];
    updateStatus(panelBody);
    if (id === 'prenota') {
      fillVisits(panelBody);
      if (service) panelBody.querySelector('select[name="visita"]').value = service;
    }
    pendingCard = null;
    rollify(panelBody);
    // "Contatti": the reviews run in a loop, so the list is there twice (the copy is hidden from screen readers)
    $$('.rv-track', panelBody).forEach(t => {
      const copy = t.firstElementChild.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      t.append(copy);
    });
    panel.dataset.sec = id;
    panel.classList.remove('scrolled');
    prepReveal();   // observing is async: the copy below is taken before anything is revealed
    buildAlt();
    setupWheel();
    setupReviews();
    watchFit();
    // an area picked elsewhere on the site (the grid icons) opens straight on its own treatments
    if (wheel && service && SERIES[service]) { showSeries(service, true); pendingCard = wheel.box; }
    // the map starts once the section has finished growing (building it costs a few frames)
    if (id === 'dove' && panelReady) requestAnimationFrame(setupMap);
  }

  // "Contatti" and "Dove siamo" always fit in one screen: on a short screen the text block is scaled
  // down (its copy in the spotlight layer too) instead of making the section scroll
  const fitSize = new ResizeObserver(() => fitPage());
  function fitPage() {
    $$('.fit', panelBody).forEach(el => {
      const k = Math.min(1, el.parentElement.clientHeight / el.offsetHeight);
      const v = k < 0.999 ? k.toFixed(4) : '';
      both(el).forEach(t => { if (t.style.getPropertyValue('--fit') !== v) t.style.setProperty('--fit', v); });
    });
  }
  function watchFit() {
    fitSize.disconnect();
    $$('.fit', panelBody).forEach(el => { fitSize.observe(el); fitSize.observe(el.parentElement); });
  }

  // ---------- "I trattamenti": the cards sliding down in a loop ----------
  // Positions are in card steps: card i sits at p = u + i, wrapped to [-N/2, N/2) (0 = middle of the
  // wheel area). u grows over time, so the cards move down; at ±N/2 a card is fully faded out, which
  // is where it jumps from the bottom back to the top.
  const WHEEL_SPEED = 1 / 3.4;                          // cards per second
  const CARD_GAP = 26;                                  // empty space between two cards
  const stackedMQ = matchMedia('(max-width:1100px),(max-aspect-ratio:13/10)');
  // the treatments of each area: one series of cards per area, shown in place of the four areas
  const SERIES = {
    derm: ['Dermatologia', [
      ['Visita dermatologica', 'Controllo completo di pelle, capelli e unghie.'],
      ['Mappatura dei nei', 'Dermatoscopia digitale, con le immagini archiviate.'],
      ['Acne e rosacea', 'Percorsi su misura, anche per le cicatrici.'],
      ['Psoriasi e dermatiti', 'Diagnosi e cura delle infiammazioni croniche.'],
      ['Tricologia', 'Caduta dei capelli e salute del cuoio capelluto.']]],
    dent: ['Odontoiatria', [
      ['Igiene e sbiancamento', 'Pulizia professionale e sbiancamento sicuro.'],
      ['Implantologia', 'Impianti guidati da TAC 3D, anche a carico immediato.'],
      ['Ortodonzia invisibile', 'Allineatori trasparenti per adulti e ragazzi.'],
      ['Conservativa ed endodonzia', 'Otturazioni estetiche e cure canalari.'],
      ['Odontoiatria pediatrica', 'Prime visite e prevenzione per i più piccoli.']]],
    fisio: ['Fisioterapia', [
      ['Riabilitazione post-operatoria', 'Dopo protesi, interventi ai legamenti e fratture.'],
      ['Terapia manuale', 'Mobilizzazioni e trattamento dei tessuti molli.'],
      ['Rieducazione posturale', 'Esercizi mirati per schiena, collo e spalle.'],
      ['Terapie fisiche', 'Onde d’urto, laser e tecarterapia.'],
      ['Riabilitazione sportiva', 'Il ritorno all’attività dopo un infortunio.']]],
    estetica: ['Medicina estetica', [
      ['Filler', 'Acido ialuronico per volumi e linee del viso.'],
      ['Biostimolazione', 'Pelle più compatta, elastica e luminosa.'],
      ['Tossina botulinica', 'Attenua le rughe d’espressione.'],
      ['Laser', 'Macchie, capillari ed epilazione.'],
      ['Peeling', 'Rinnovamento della pelle, delicato o profondo.']]],
  };
  const ARROW = '<svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
  let wheel = null;
  const wheelSize = new ResizeObserver(() => layoutWheel());
  function watchWheel() {
    wheelSize.disconnect();
    [wheel.box, ...wheel.cards].forEach(el => wheelSize.observe(el));
  }
  function setupWheel() {
    const box = panelBody.querySelector('.tr-wheel');
    if (!box) { wheelSize.disconnect(); wheel = null; return; }
    const list = $('.tr-list', box);
    wheel = {
      box, list, home: list, key: '', homeLabel: $('.tr-where', panelBody).textContent,
      cards: $$('.tr-card', list), u: 0, v: WHEEL_SPEED, s: 0, H: 0, ch: 0,
      hold: 0, drag: null, dragged: false, busy: false,
    };
    watchWheel();
  }
  function layoutWheel() {
    const w = wheel;
    if (!w || !w.box.isConnected) return;
    const ch = Math.max(...w.cards.map(c => c.offsetHeight));
    if (!ch) return;                                    // section not on screen yet
    w.ch = ch;
    w.s = ch + CARD_GAP;                                // distance between two cards
    // stacked layout: room for about three cards; side by side it fills the column
    const h = stackedMQ.matches ? Math.round(w.s * 3.3) + 'px' : '';
    both(w.box).forEach(t => { if (t.style.height !== h) t.style.height = h; });
    w.H = w.box.clientHeight;
  }
  stackedMQ.addEventListener('change', () => layoutWheel());
  function stepWheel(dt) {
    const w = wheel;
    if (!w) return;
    if (!w.s) { layoutWheel(); if (!w.s) return; }
    const N = w.cards.length;
    // slows to a stop under the cursor, while a button inside has keyboard focus, or for a moment after a tap
    const rest = w.box.matches(':hover') || !!w.box.querySelector(':focus-visible') || performance.now() < w.hold;
    if (w.busy) w.u += w.v * dt;                        // switching series: no braking
    else if (!w.drag) {
      w.v += ((rest ? 0 : WHEEL_SPEED) - w.v) * ease(rest ? 0.08 : 0.03, dt);
      w.u += w.v * dt;
    }
    w.u = ((w.u % N) + N) % N;
    const half = w.H / 2 - w.ch / 2, edge = w.ch * 0.3; // half: a card centred there touches the top / bottom
    const fadeBottom = stackedMQ.matches;               // side by side they just leave through the bottom of the screen
    w.cards.forEach((c, i) => {
      let p = (w.u + i) % N;
      if (p >= N / 2) p -= N;
      const y = p * w.s;
      // faded out at the wrap point, and before its top edge reaches the text above
      let fade = Math.min(clamp((1 - Math.abs(p) / (N / 2)) / 0.3), clamp((half + y) / edge));
      if (fadeBottom) fade = Math.min(fade, clamp((half - y) / edge));
      const tf = `translate3d(0,${y.toFixed(1)}px,0) translateY(-50%)`;
      both(c).forEach(t => {
        t.style.transform = tf;
        t.style.opacity = fade.toFixed(3);
        t.style.visibility = fade > 0 ? '' : 'hidden';
      });
    });
  }

  // replaces a node of the section, and its twin in the spotlight copy
  function swapTwin(oldEl, newEl) {
    const t = twin.get(oldEl);
    oldEl.replaceWith(newEl);
    if (!t) return;
    const c = newEl.cloneNode(true);
    t.replaceWith(c);
    const a = [newEl, ...newEl.querySelectorAll('*')], b = [c, ...c.querySelectorAll('*')];
    a.forEach((el, k) => twin.set(el, b[k]));
    b.forEach(el => el.removeAttribute('id'));
  }
  // "Prenota": the visits to choose from, grouped by area (the same list as the treatment cards)
  function fillVisits(root) {
    $('select[name="visita"]', root).insertAdjacentHTML('beforeend', Object.entries(SERIES).map(([key, [name, items]]) =>
      `<optgroup label="${name}"><option value="${key}">${name} · prima visita</option>` +
      items.map(([title], i) => `<option value="${key}/${i + 1}">${title}</option>`).join('') + '</optgroup>').join(''));
  }
  // the cards of one area's treatments, each with its own "Prenota" (that visit is pre-selected in the form)
  function seriesList(key) {
    const [name, items] = SERIES[key];
    const ico = wheel.home.querySelector(`[data-branch="${key}"] .chi-ico`).innerHTML;
    const ul = document.createElement('ul');
    ul.className = 'tr-list';
    ul.innerHTML = items.map(([title, text], i) =>
      `<li class="tr-card"><div class="tc-top"><span class="chi-num">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="tc-tag">${name}</span><button class="btn ghost mag tr-btn" data-panel="prenota" data-service="${key}/${i + 1}">Prenota${ARROW}</button></div>` +
      `<div class="tc-main"><span class="chi-ico">${ico}</span><div><h3>${title}</h3><p>${text}</p></div></div></li>`).join('');
    rollify(ul);
    return ul;
  }
  // key: an area ('derm', ...) or '' for the four areas. The current cards rush down and fade out,
  // then the new ones come in with a quick spin that settles into the usual pace.
  function showSeries(key, instant, refocus) {
    const w = wheel;
    if (!w || w.busy || w.key === key) return;
    const prev = w.key;
    let out = [];
    const swap = () => {
      if (wheel !== w) return;                          // the section changed meanwhile
      const list = key ? seriesList(key) : w.home;
      swapTwin(w.list, list);
      out.forEach(a => a.cancel());                     // the list taken out may come back later
      w.list = list;
      w.key = key;
      w.cards = $$('.tr-card', list);
      watchWheel();
      w.s = 0;
      layoutWheel();
      const text = w.box.closest('.tr-text');
      both(text).forEach(t => t.classList.toggle('series', !!key));
      const where = key ? `${SERIES[key][0]} · ${SERIES[key][1].length} trattamenti` : w.homeLabel;
      both($('.tr-where', text)).forEach(t => { t.textContent = where; });
      w.u = 0;
      w.v = instant ? WHEEL_SPEED : 2.6;
      w.busy = false;
      if (!instant) both(list).forEach(t => t.animate({ opacity: [0, 1] }, { duration: 550, easing: 'ease-out' }));
      stepWheel(0);
      if (refocus) $(key ? '.tr-back' : `[data-series="${prev}"]`, text).focus({ preventScroll: true });
    };
    if (instant) { swap(); return; }
    w.busy = true;
    w.v = 3;
    out = both(w.list).map(t => t.animate({ opacity: [1, 0] }, { duration: 320, easing: 'ease-in', fill: 'forwards' }));
    setTimeout(swap, 320);
  }
  panel.addEventListener('click', e => {
    const w = wheel;
    if (!w) return;
    const b = e.target.closest('[data-series]');
    const card = !b && !e.target.closest('button, a') && e.target.closest('.tr-card[data-branch]');
    if (card && w.dragged) return;                      // the end of a drag is not a click
    const key = b ? b.dataset.series : card ? card.dataset.branch : null;
    if (key !== null) showSeries(key, false, e.detail === 0);
  });

  // drag with the mouse to move the cards (they keep the momentum); on touch screens a tap holds them a moment
  panel.addEventListener('pointerdown', e => {
    const w = wheel;
    if (!w || !w.box.contains(e.target)) return;
    w.dragged = false;
    if (e.pointerType === 'touch') { w.hold = performance.now() + 4000; return; }
    if (e.button !== 0 || e.target.closest('button') || w.busy) return;
    w.drag = { id: e.pointerId, y: e.clientY, t: e.timeStamp, moved: false, vel: 0 };
  });
  panel.addEventListener('pointermove', e => {
    const w = wheel, d = w && w.drag;
    if (!d || e.pointerId !== d.id || !w.s) return;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dy) < 4) return;
      d.moved = true;
      w.box.classList.add('drag');
      w.box.setPointerCapture(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - d.t) / 1000;
    w.u += dy / w.s;
    d.vel = d.vel * 0.6 + (dy / w.s / dt) * 0.4;
    d.y = e.clientY; d.t = e.timeStamp;
  });
  ['pointerup', 'pointercancel'].forEach(ev => panel.addEventListener(ev, e => {
    const w = wheel, d = w && w.drag;
    if (!d || e.pointerId !== d.id) return;
    if (d.moved) { w.v = clamp(e.timeStamp - d.t > 80 ? 0 : d.vel, -4, 4); w.dragged = true; }   // fling
    w.drag = null;
    w.box.classList.remove('drag');
  }));

  // ---------- "Dove siamo": a 3D miniature of the neighbourhood ----------
  // MapLibre GL (loaded only when it is needed) on OpenFreeMap's vector tiles (OpenStreetMap data), drawn
  // in the site's own colours: no labels, extruded buildings, a slow orbit around the clinic.
  // Drag sideways to turn it (up / down to tilt it, with the mouse); + / − to zoom.
  const DV_AT = [12.512825, 41.923];                    // Piazza Istria, Roma
  const DV_ZOOM = [15.3, 16.2, 17.6], DV_PITCH = [30, 58, 70], ORBIT = 3.2;   // [min, start, max]; orbit in °/s
  // MapLibre GL 6.15.0, served by the site (BSD licence, see the file next to it). The module path is relative to this script.
  const MAP_JS = './vendor/maplibre-gl.mjs', MAP_CSS = 'assets/vendor/maplibre-gl.css';
  const MAP_COLORS = {
    night: { land: '#0b0d0e', park: '#0d1a15', water: '#0a2630', road: '#192023', major: '#253035', bld: '#232c31', light: .5 },
    day: { land: '#e9ecec', park: '#d9eadf', water: '#c2e3eb', road: '#ffffff', major: '#ffffff', bld: '#fafbfb', light: .3 },
  };
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let mapLib = null, dv = null;
  function loadMapLib() {
    if (mapLib) return mapLib;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = MAP_CSS;
    document.head.insertBefore(css, $('style'));        // before the site's styles, so ours win
    mapLib = import(MAP_JS).catch(err => { mapLib = null; css.remove(); throw err; });
    return mapLib;
  }
  // warm up before the click (the library is on the site; the external map tiles still wait for consent)
  $('.c-dove').addEventListener('pointerenter', () => loadMapLib().catch(() => {}));

  const mapColors = () => MAP_COLORS[html.dataset.theme === 'day' ? 'day' : 'night'];
  // [layer, paint property, colour key] — also used to recolour the map when the theme changes
  const MAP_PAINT = [['land', 'background-color', 'land'], ['park', 'fill-color', 'park'], ['green', 'fill-color', 'park'],
    ['water', 'fill-color', 'water'], ['square', 'fill-color', 'road'], ['minor', 'line-color', 'road'],
    ['major', 'line-color', 'major'], ['building', 'fill-extrusion-color', 'bld']];
  function mapStyle() {
    const c = mapColors();
    const cls = (...v) => ['match', ['get', 'class'], v, true, false];
    const lines = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
    const width = (a, b) => ['interpolate', ['exponential', 1.6], ['zoom'], 14, a, 18, b];
    const src = (id, type, layer, extra) => ({ id, type, source: 'omt', 'source-layer': layer, ...extra });
    const layers = [
      { id: 'land', type: 'background' },
      src('park', 'fill', 'park'),
      src('green', 'fill', 'landcover', { filter: cls('grass', 'wood') }),
      src('water', 'fill', 'water'),
      src('square', 'fill', 'transportation', { filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false] }),
      src('minor', 'line', 'transportation', { filter: ['all', lines, cls('minor', 'service', 'path', 'pedestrian', 'track')],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': width(1, 9) } }),
      src('major', 'line', 'transportation', { filter: ['all', lines, cls('primary', 'secondary', 'tertiary', 'trunk', 'motorway')],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': width(2.5, 22) } }),
      src('building', 'fill-extrusion', 'building', { paint: {
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } }),
    ];
    for (const [id, prop, key] of MAP_PAINT) {
      const l = layers.find(l => l.id === id);
      l.paint = { ...l.paint, [prop]: c[key] };
    }
    return {
      version: 8,
      sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
      light: { anchor: 'viewport', position: [1.4, 210, 35], intensity: c.light },
      layers,
    };
  }
  function recolorMap() {
    if (!dv || !dv.loaded) return;
    const c = mapColors(), m = dv.map;
    for (const [id, prop, key] of MAP_PAINT) m.setPaintProperty(id, prop, c[key]);
    m.setLight({ anchor: 'viewport', position: [1.4, 210, 35], intensity: c.light });
    m.redraw();                                         // now, so the theme transition captures the new colours
  }
  // the map's state as a class on the box and its copy: ready (drawn), failed (offline: the drawing shows)
  // or blocked (no consent to the external services yet: the drawing and a button to load it)
  const mapState = (box, cls, on = true) => both(box).forEach(t => t.classList.toggle(cls, on));
  async function setupMap() {
    const box = panelBody.querySelector('.dv-map');
    if (!box || dv) return;
    mapState(box, 'failed', false);
    mapState(box, 'blocked', !(consent && consent.map));
    if (!(consent && consent.map)) return;
    let gl;
    try { gl = await loadMapLib(); } catch (e) { mapState(box, 'failed'); return; }
    if (!box.isConnected || dv || !panelOpen) return;
    const map = new gl.Map({
      container: $('.dv-gl', box), style: mapStyle(), center: DV_AT,
      zoom: DV_ZOOM[1], pitch: DV_PITCH[1], bearing: -30, maxPitch: 75,
      interactive: false, attributionControl: false, fadeDuration: 0,
      pixelRatio: Math.min(devicePixelRatio, 2),
    });
    dv = { map, box, ring: both($('.dv-ring', box.parentElement)), loaded: false, spin: ORBIT, zoom: DV_ZOOM[1], zoomTo: DV_ZOOM[1], pitch: DV_PITCH[1], drag: null, mark: '' };
    const slow = setTimeout(() => { if (dv && dv.map === map && !dv.loaded) mapState(box, 'failed'); }, 15000);
    map.once('load', () => {
      clearTimeout(slow);
      if (!dv || dv.map !== map) return;
      dv.loaded = true;
      recolorMap();                                     // the theme may have changed while it was loading
      box.classList.remove('failed');
      mapState(box, 'ready');
    });
  }
  function dropMap() {
    if (!dv) return;
    dv.map.remove();
    mapState(dv.box, 'ready', false);
    dv = null;
  }
  // every frame while the section is open: orbit, zoom and tilt, all eased
  function stepMap(dt) {
    if (!dv || !dv.loaded) return;
    const m = dv.map;
    if (!dv.drag) dv.spin += ((calm.matches ? 0 : ORBIT) - dv.spin) * ease(0.025, dt);
    dv.zoom += (dv.zoomTo - dv.zoom) * ease(0.12, dt);
    if (Math.abs(dv.zoomTo - dv.zoom) < 0.001) dv.zoom = dv.zoomTo;
    let turn = dv.spin * dt;
    if (dv.drag) { turn = dv.drag.turn; dv.drag.turn = 0; }
    if (!turn && dv.zoom === m.getZoom() && dv.pitch === m.getPitch()) return;
    m.jumpTo({ bearing: m.getBearing() + turn, zoom: dv.zoom, pitch: dv.pitch });
    // the rings lie on the ground: tilted like the map, as big as the zoom makes them
    const mark = `rotateX(${dv.pitch.toFixed(2)}deg) scale(${(2 ** (dv.zoom - DV_ZOOM[1])).toFixed(4)})`;
    if (mark !== dv.mark) { dv.mark = mark; dv.ring.forEach(t => { t.style.transform = mark; }); }
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-zoom]');
    if (b && dv) dv.zoomTo = clamp(dv.zoomTo + 0.6 * b.dataset.zoom, DV_ZOOM[0], DV_ZOOM[2]);
  });
  // ---------- "Contatti": the reviews ----------
  // A loop that moves on its own (down on a computer, sideways on a phone) and can be moved by hand:
  // mouse wheel, drag, finger swipe. It keeps the momentum, then settles back to its own pace, and
  // slows to a stop under the pointer. The list is there twice: the track is shifted by up to one list.
  const REV_SPEED = 22;                                 // px per second
  const revRowMQ = matchMedia('(max-width:900px),(max-aspect-ratio:1/1)');   // same as the CSS: sideways
  let rev = null;
  function setupReviews() {
    const roll = panelBody.querySelector('.rv-roll');
    rev = roll && { roll, track: both($('.rv-track', roll)), pos: 0, v: REV_SPEED, push: 0, drag: null, hold: 0 };
  }
  function stepReviews(dt) {
    if (!rev) return;
    const row = revRowMQ.matches, list = rev.track[0].firstElementChild;
    const L = row ? list.offsetWidth : list.offsetHeight;   // one list, gap included
    if (!L) return;
    if (!rev.drag) {
      const rest = rev.roll.matches(':hover') || performance.now() < rev.hold;
      rev.v += ((rest ? 0 : REV_SPEED) - rev.v) * ease(rest ? 0.08 : 0.025, dt);
      const step = rev.push * ease(0.18, dt);           // wheel: eased, not in jumps
      rev.push -= step;
      rev.pos += rev.v * dt + step;
    }
    const off = (((rev.pos % L) + L) % L - L).toFixed(1);
    const tf = row ? `translate3d(${off}px,0,0)` : `translate3d(0,${off}px,0)`;
    rev.track.forEach(t => { t.style.transform = tf; });
  }
  panel.addEventListener('wheel', e => {
    if (!rev || !rev.roll.contains(e.target)) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    rev.push -= d * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
  }, { passive: false });
  panel.addEventListener('pointerdown', e => {
    if (!rev || !rev.roll.contains(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    rev.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, vel: 0 };
    rev.push = 0;
    try { rev.roll.setPointerCapture(e.pointerId); } catch (err) {}
    rev.roll.classList.add('drag');
  });
  panel.addEventListener('pointermove', e => {
    const d = rev && rev.drag;
    if (!d || e.pointerId !== d.id) return;
    const delta = revRowMQ.matches ? e.clientX - d.x : e.clientY - d.y;
    const dt = Math.max(1, e.timeStamp - d.t) / 1000;
    rev.pos += delta;
    d.vel = d.vel * 0.6 + (delta / dt) * 0.4;
    d.x = e.clientX; d.y = e.clientY; d.t = e.timeStamp;
  });
  ['pointerup', 'pointercancel'].forEach(ev => panel.addEventListener(ev, e => {
    const d = rev && rev.drag;
    if (!d || e.pointerId !== d.id) return;
    rev.v = clamp(e.timeStamp - d.t > 80 ? 0 : d.vel, -2500, 2500);   // fling
    if (e.pointerType === 'touch') rev.hold = performance.now() + 2500;
    rev.drag = null;
    rev.roll.classList.remove('drag');
  }));
  // drag: sideways turns the map, up / down tilts it (mouse only: on touch screens vertical is the page scroll);
  // let go, it keeps turning with the speed it had and slows back to the orbit
  panel.addEventListener('pointerdown', e => {
    if (!dv || !dv.loaded || e.button !== 0 || !dv.box.contains(e.target)) return;
    dv.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, vel: 0, turn: 0, touch: e.pointerType === 'touch' };
    try { dv.box.setPointerCapture(e.pointerId); } catch (err) {}   // keeps turning outside the map
    dv.box.classList.add('drag');
  });
  panel.addEventListener('pointermove', e => {
    const d = dv && dv.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y, dt = Math.max(1, e.timeStamp - d.t) / 1000;
    const turn = -dx * 0.3;
    d.turn += turn;                                     // applied once per frame, in stepMap
    if (!d.touch) dv.pitch = clamp(dv.pitch - dy * 0.25, DV_PITCH[0], DV_PITCH[2]);
    d.vel = d.vel * 0.6 + (turn / dt) * 0.4;
    d.x = e.clientX; d.y = e.clientY; d.t = e.timeStamp;
  });
  ['pointerup', 'pointercancel'].forEach(ev => panel.addEventListener(ev, e => {
    const d = dv && dv.drag;
    if (!d || e.pointerId !== d.id) return;
    dv.spin = clamp(e.timeStamp - d.t > 80 ? 0 : d.vel, -90, 90);   // fling
    dv.drag = null;
    dv.box.classList.remove('drag');
  }));

  // every section gets a twin copy of itself in the opposite theme, uncovered by the cursor spotlight
  let panelVids = [];                                   // [section video, its copy] pairs, kept in sync
  const taSize = new ResizeObserver(entries => entries.forEach(en => {
    const t = twin.get(en.target);                      // a resized textarea moves the layout: copy its height
    if (t) t.style.height = en.target.offsetHeight + 'px';
  }));
  function buildAlt() {
    twin = new Map();
    taSize.disconnect();
    const src = [panelBar, panelBody];
    const copies = src.map(n => n.cloneNode(true));
    panelAlt.replaceChildren(...copies);
    src.forEach((n, i) => {
      const b = [copies[i], ...copies[i].querySelectorAll('*')];
      [n, ...n.querySelectorAll('*')].forEach((el, k) => twin.set(el, b[k]));
    });
    panelAlt.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    // form values are not copied by cloneNode (e.g. the pre-selected service)
    $$('input, select, textarea', panelBody).forEach(el => { twin.get(el).value = el.value; });
    $$('textarea', panelBody).forEach(el => taSize.observe(el));
    panelVids = [...$$('video', panelBody), ...$$('video', panelAlt)];
    leadVid = null;
  }
  // Section videos: the one the section shows (day or night, by theme) leads; the one shown in the
  // spotlight copy follows it frame by frame; the hidden ones are paused. When the theme changes,
  // the newly shown video takes over from the same instant.
  let leadVid = null;
  function syncPanelVideos() {
    if (!panelVids.length) return;
    const shown = panelVids.filter(v => v.getClientRects().length);
    const lead = shown.find(v => panelBody.contains(v));
    if (!lead) return;
    if (lead !== leadVid) {
      if (leadVid) lead.currentTime = leadVid.currentTime;
      leadVid = lead;
    }
    if (lead.paused) lead.play().catch(() => {});
    for (const v of panelVids) {
      if (v === lead) continue;
      if (!shown.includes(v)) { if (!v.paused) v.pause(); continue; }
      const drift = lead.currentTime - v.currentTime;
      if (Math.abs(drift) > 0.25) v.currentTime = lead.currentTime;
      else v.playbackRate = 1 + Math.max(-0.1, Math.min(0.1, drift * 0.5));
      if (v.paused) v.play().catch(() => {});
    }
  }
  // what is typed / focused in a form shows up in the copy too (it is what the spotlight shows)
  ['input', 'change'].forEach(ev => panel.addEventListener(ev, e => {
    const t = twin.get(e.target);
    if (t && 'value' in t) t.value = e.target.value;
    if (t && e.target.type === 'checkbox') t.checked = e.target.checked;
  }));
  panel.addEventListener('focusin', e => { const t = twin.get(e.target); if (t) t.classList.add('is-focus'); });
  panel.addEventListener('focusout', e => { const t = twin.get(e.target); if (t) t.classList.remove('is-focus'); });
  function showPendingCard() {
    if (pendingCard && wheel) { layoutWheel(); stepWheel(0); }   // in place on the wheel before scrolling to it
    if (pendingCard) pendingCard.scrollIntoView({ block: 'center' });
    pendingCard = null;
  }

  // The real section (already usable) grows out of the clicked cell and settles in front of the grid.
  function openPanel(id, origin, service) {
    if (closing) return;
    if (panelOpen) { // already open: swap the content in place, it enters again
      fill(id, service);
      panel.scrollTop = 0;
      showPendingCard();
      return;
    }
    panelOpen = true;
    panelReady = false;
    panelOrigin = origin;
    Object.assign(pull, { k: 0, target: 0, done: false, touch: false });
    html.classList.add('locked');
    fill(id, service);
    panel.hidden = false;
    panel.scrollTop = 0;
    showPendingCard();
    originAt(origin);

    const opts = { duration: OPEN_MS, easing: ZOOM };
    const grow = panel.animate({ clipPath: [insetOf(origin), FULL] }, opts);
    panelTint.style.background = colorOf(origin);
    panelTint.animate({ opacity: [1, 0] }, opts);
    grow.onfinish = () => {
      if (!panelOpen) return;
      panelReady = true;
      if (panel.dataset.sec === 'dove') setupMap();
    };
    panel.animate({ opacity: [0, 1] }, { duration: 220, easing: 'linear' });
    panelInner.animate({ transform: ['scale(.82)', 'none'] }, opts);
    pinned.getAnimations().forEach(a => a.cancel());
    pinned.animate(GRID_BACK, { ...opts, fill: 'forwards' });

    history.pushState({ panel: id }, '', '#' + id);
    $('#panel-back').focus({ preventScroll: true });
  }

  // The section shrinks back into its cell while the grid comes forward again.
  // After a scroll-down (see "pull" below) it carries on from where the scroll left it.
  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panelReady = false;
    closing = true;
    ps.target = 0; ps.lit = 0; ps.was = true; // the section spotlight goes out at once

    const k = pull.k;
    const from = {
      clip: k ? panel.style.clipPath : FULL,
      tint: k ? +panelTint.style.opacity : 0,
      inner: k ? panelInner.style.transform : 'none',
      grid: k ? { transform: pinned.style.transform, opacity: +pinned.style.opacity } : GRID_BACK[1],
    };
    // measure the cell where the grid will be at the end (full size), not where it is now
    pinned.getAnimations().forEach(a => a.cancel());
    pinned.style.transform = pinned.style.opacity = '';
    const to = insetOf(panelOrigin);
    originAt(panelOrigin);

    const dur = CLOSE_MS * (1 - 0.45 * k);
    const opts = { duration: dur, easing: k ? 'cubic-bezier(.3,.6,.25,1)' : ZOOM, fill: 'forwards' };
    const shrink = panel.animate({ clipPath: [from.clip, to] }, opts);
    panelTint.style.background = colorOf(panelOrigin);
    panelTint.animate({ opacity: [from.tint, 1] }, opts);
    panel.animate([{ opacity: 1 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    panelInner.animate({ transform: [from.inner, 'scale(.82)'] }, opts);
    pinned.animate([from.grid, GRID_BACK[0]], { duration: dur, easing: opts.easing });
    panel.style.clipPath = panelTint.style.opacity = panelInner.style.transform = '';

    shrink.onfinish = () => {
      panel.hidden = true;
      panel.getAnimations({ subtree: true }).forEach(a => a.cancel());
      panel.querySelectorAll('video').forEach(v => v.pause());   // no decoding while hidden
      dropMap();
      html.classList.remove('locked');
      closing = false;
      Object.assign(pull, { k: 0, target: 0, done: false, touch: false });
      panelOrigin.focus({ preventScroll: true });
    };
  }

  // ---------- scrolling down past the end of a section takes it back to the grid ----------
  // Same feel as the hero: the scroll itself drives the shrink (the section folds back into its cell
  // while the grid comes forward), smoothed the same way. Let go half way, it springs back open;
  // carried to the end (or let go past half), it closes.
  const pull = { k: 0, target: 0, t: 0, done: false, touch: false };
  const atBottom = () => panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2;
  function pullBy(px, span) {
    pull.target = clamp(pull.target + px / span);
    pull.t = performance.now();
    if (pull.target >= 1) commitPull();
  }
  function commitPull() {
    if (pull.done) return;
    pull.done = true;
    pull.target = 1;
    history.back();                                     // -> popstate -> closePanel, from the current state
  }
  function releasePull() {
    if (pull.done) return;
    if (pull.target > 0.5) commitPull();
    else pull.target = 0;
  }
  const inReviews = e => e.target.closest && e.target.closest('.rv-roll');   // they scroll on their own
  panel.addEventListener('wheel', e => {
    if (!panelReady || pull.done || e.ctrlKey || inReviews(e)) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (pull.target > 0 || (dy > 0 && atBottom())) {
      e.preventDefault();
      pullBy(dy, innerHeight * 0.9);
    }
  }, { passive: false });
  let touchY = null;
  panel.addEventListener('touchstart', e => { touchY = inReviews(e) ? null : e.touches[0].clientY; }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (touchY === null || !panelReady || pull.done) return;
    const y = e.touches[0].clientY, dy = touchY - y;
    touchY = y;
    if (pull.target > 0 || (dy > 0 && atBottom())) {
      if (e.cancelable) e.preventDefault();
      pull.touch = true;
      pullBy(dy, innerHeight * 0.55);
    }
  }, { passive: false });
  panel.addEventListener('touchend', () => {
    touchY = null;
    if (pull.touch) { pull.touch = false; releasePull(); }
  });
  function stepPull(dt) {
    // the wheel has stopped: decide
    if (!pull.touch && pull.target > 0 && !pull.done && performance.now() - pull.t > 260) releasePull();
    const k0 = pull.k;
    pull.k += (pull.target - pull.k) * ease(0.12, dt);
    if (Math.abs(pull.target - pull.k) < 0.001) pull.k = pull.target;
    if (pull.k !== k0) applyPull(pull.k);
  }
  function applyPull(k) {
    pinned.getAnimations().forEach(a => a.cancel());    // the grid now follows the scroll (inline styles)
    pinned.style.transform = `scale(${(0.94 + 0.06 * k).toFixed(4)})`;
    pinned.style.opacity = (0.35 + 0.65 * k).toFixed(3);
    if (!k) { panel.style.clipPath = panelTint.style.opacity = panelInner.style.transform = ''; return; }
    const r = panelOrigin.getBoundingClientRect();
    const rad = (panelOrigin.classList.contains('cell') ? 16 : 8) * k;
    panel.style.clipPath = `inset(${(r.top * k).toFixed(1)}px ${((innerWidth - r.right) * k).toFixed(1)}px ` +
      `${((innerHeight - r.bottom) * k).toFixed(1)}px ${(r.left * k).toFixed(1)}px round ${rad.toFixed(1)}px)`;
    panelTint.style.background = colorOf(panelOrigin);
    panelTint.style.opacity = k.toFixed(3);
    originAt(panelOrigin);
    panelInner.style.transform = `scale(${(1 - 0.18 * k).toFixed(4)})`;
  }
  panel.addEventListener('scroll', () => panel.classList.toggle('scrolled', panel.scrollTop > 8), { passive: true });
  $('#panel-back').addEventListener('click', () => history.back());
  addEventListener('keydown', e => { if (e.key === 'Escape' && panelOpen && !sheet.open) history.back(); });   // Esc on a sheet closes the sheet only
  addEventListener('popstate', () => { if (panelOpen) closePanel(); });
  // a link straight to a section (site/#dove, #prenota…, also #privacy and #cookie) opens it once the site
  // has loaded, from its cell in the finished grid; "back" then leads to the grid
  // The hash comes from whoever wrote the link: it is only ever compared with the known names, never
  // decoded or put in a selector (a malformed "%" would throw and stop the whole script)
  const HASH_ALIASES = { 'chi-siamo': 'chi', 'dove-siamo': 'dove' };
  const startHash = location.hash.slice(1);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  function openFromHash(h) {
    const id = Object.hasOwn(HASH_ALIASES, h) ? HASH_ALIASES[h] : h;
    if (Object.hasOwn(SHEETS, id)) { openSheet(id); return; }
    if (!Object.hasOwn(LABELS, id)) return;
    const cell = $(`.cell[data-panel="${id}"]`);
    scrollTo({ top: stageTop + stageDist, behavior: 'instant' });
    prog = -1;                                          // straight to the finished grid, no fly-in
    requestAnimationFrame(() => requestAnimationFrame(() => openPanel(id, cell)));
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-panel]');
    if (t) { e.preventDefault(); openPanel(t.dataset.panel, t, t.dataset.service); }
  });

  // demo form ("Prenota"): nothing is sent yet, it only confirms
  document.addEventListener('submit', e => {
    if (!e.target.matches('.booking')) return;
    e.preventDefault();
    const form = e.target, ok = form.querySelector('.ok');
    const text = form.dataset.mode === 'msg'
      ? 'Messaggio inviato — ti rispondiamo entro 24 ore.'
      : 'Richiesta ricevuta — ti ricontattiamo entro 24 ore per fissare la visita.';
    both(ok).forEach(t => { t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); });
    form.reset();
    $$('input, select, textarea', form).forEach(el => { const t = twin.get(el); if (t) { t.value = el.value; t.checked = el.checked; } });
  });

  // the switch on top of the form: visit request or message (the fields of the other one are disabled)
  function setMode(form, mode) {
    both(form).forEach(f => {
      f.dataset.mode = mode;
      $$('.seg [data-mode]', f).forEach(b => {
        b.setAttribute('aria-checked', b.dataset.mode === mode);
        b.tabIndex = b.dataset.mode === mode ? 0 : -1;
      });
      $$('fieldset[data-only]', f).forEach(fs => { fs.disabled = fs.dataset.only !== mode; });
      $('.lg-send .lbl > span', f).textContent = mode === 'book' ? 'Richiedi la visita' : 'Invia il messaggio';
      $('.ok', f).classList.remove('show');
    });
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('.seg [data-mode]');
    if (b) setMode(b.closest('form'), b.dataset.mode);
  });
  panel.addEventListener('keydown', e => {
    const b = e.target.closest('.seg [data-mode]');
    if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const other = $(`.seg [data-mode]:not([data-mode="${b.dataset.mode}"])`, b.closest('form'));
    setMode(b.closest('form'), other.dataset.mode);
    other.focus();
  });
  // the glass sheen follows the cursor
  panel.addEventListener('pointermove', e => {
    const g = e.target.closest && e.target.closest('.lg');
    if (!g) return;
    const r = g.getBoundingClientRect();
    both(g).forEach(t => {
      t.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      t.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    });
  });

  // ---------- buttons ----------
  // the label is wrapped once so it can roll: a copy of the text sits right below it (text-shadow)
  function rollify(root) {
    $$('.pill, .btn', root).forEach(b => {
      if (b.querySelector('.lbl')) return;
      const parts = [...b.childNodes].filter(n => n.nodeType === 3 ? n.textContent.trim() : n.classList.contains('hide-sm'));
      if (!parts.length) return;
      const lbl = document.createElement('span'), inner = document.createElement('span');
      lbl.className = 'lbl';
      lbl.append(inner);
      parts[0].before(lbl);
      inner.append(...parts);
    });
  }
  rollify(document);
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  // ---------- cookie consent ----------
  // Only technical storage is used without asking; the 3D map (external services) waits for consent.
  // The choice is kept 6 months, then asked again. "Rifiuta" and the × give the same answer.
  const CONSENT_KEY = 'consent', CONSENT_MS = 180 * 864e5;
  function readConsent() {
    try {
      const c = JSON.parse(localStorage.getItem(CONSENT_KEY));
      if (c && typeof c.map === 'boolean' && Date.now() - c.t < CONSENT_MS) return c;
    } catch (e) {}
    return null;
  }
  let consent = readConsent();
  const consentBox = $('#consent');
  function askConsent() {
    if (!consentBox.hidden) return;
    consentBox.hidden = false;
    consentBox.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }],
      { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  function setConsent(map) {
    consent = { map, t: Date.now() };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(consent)); } catch (e) {}
    consentBox.hidden = true;
    // "Dove siamo" is open: the choice applies now (a refusal also stops a map already running)
    if (panelOpen && panelReady && panel.dataset.sec === 'dove') {
      if (!map) dropMap();
      setupMap();
    }
  }

  // ---------- privacy / cookie texts: a sheet rising from the bottom ----------
  const sheet = $('#sheet'), sheetBody = $('#sheet-body');
  const SHEETS = { privacy: 'Informativa privacy', cookie: 'Cookie policy' };
  const SHEET_IN = [{ opacity: 0, transform: 'translateY(48px)' }, { opacity: 1, transform: 'none' }];
  function openSheet(id) {
    sheetBody.replaceChildren($('#tpl-' + id).content.cloneNode(true));
    rollify(sheetBody);
    $('#sheet-kicker').textContent = SHEETS[id];
    sheetBody.scrollTop = 0;
    if (sheet.open) return;
    sheet.showModal();
    sheet.animate(SHEET_IN, { duration: 550, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  function closeSheet() {
    if (!sheet.open || sheet.dataset.closing) return;
    sheet.dataset.closing = '1';
    sheet.animate(SHEET_IN, { duration: 320, easing: 'cubic-bezier(.5,0,.75,0)', direction: 'reverse', fill: 'forwards' })
      .onfinish = () => { sheet.close(); sheet.getAnimations().forEach(a => a.cancel()); delete sheet.dataset.closing; };
  }
  sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });   // Esc: same animation
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });   // click on the dimmed backdrop

  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-consent-choice], [data-consent-open], [data-map-ok], [data-sheet], [data-sheet-close]');
    if (!t) return;
    if (t.matches('[data-consent-choice]')) setConsent(t.dataset.consentChoice === '1');
    else if (t.matches('[data-map-ok]')) setConsent(true);
    else if (t.matches('[data-consent-open]')) { closeSheet(); askConsent(); }
    else if (t.matches('[data-sheet]')) openSheet(t.dataset.sheet);
    else closeSheet();
  });
  $$('.tile path').forEach(p => p.setAttribute('pathLength', 100)); // for the "redraw" hover

  // the fill grows from where the pointer comes in and shrinks back towards where it leaves
  const FX = '.pill, .btn, .switch, .chi-val, .tr-card';
  function fxAt(el, e) {
    const r = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const k = r.width / w || 1;                     // the hero buttons can be scaled down
    const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
    const d = 2 * Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 4;
    both(el).forEach(t => {
      t.style.setProperty('--x', x.toFixed(1) + 'px');
      t.style.setProperty('--y', y.toFixed(1) + 'px');
      t.style.setProperty('--d', d.toFixed(1) + 'px');
    });
  }
  function fxEdge(e, on) {
    const el = e.target.closest && e.target.closest(FX);
    if (!el || el.contains(e.relatedTarget) || e.pointerType === 'touch') return;
    fxAt(el, e);
    const t = twin.get(el);
    if (t) t.classList.toggle('is-hover', on);
  }
  document.addEventListener('pointerover', e => fxEdge(e, true));
  document.addEventListener('pointerout', e => fxEdge(e, false));
  // pressed state mirrored on the spotlight copy
  document.addEventListener('pointerdown', e => {
    const t = twin.get(e.target.closest && e.target.closest(FX));
    if (t) t.classList.add('is-press');
  });
  ['pointerup', 'pointercancel'].forEach(ev => addEventListener(ev, () =>
    panelAlt.querySelectorAll('.is-press').forEach(t => t.classList.remove('is-press'))));

  // magnetic buttons (.mag): they lean towards the cursor while it is over them, then spring back
  document.addEventListener('pointermove', e => {
    const el = e.pointerType !== 'touch' && e.target.closest && e.target.closest('.mag');
    if (!el) return;
    const r = el.getBoundingClientRect();
    // at most ~8px sideways and 5px up/down, whatever the button's size
    const dx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1) * 8;
    const dy = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1) * 5;
    both(el).forEach(t => { t.classList.add('mag-on'); t.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`; });
  });
  document.addEventListener('pointerout', e => {
    const el = e.target.closest && e.target.closest('.mag');
    if (!el || el.contains(e.relatedTarget)) return;
    both(el).forEach(t => { t.classList.remove('mag-on'); t.style.translate = ''; });
  });

  // ---------- spotlight reveal ----------
  // The reveal video sits above the base video; its mask is a stack of soft radial spots:
  // the head (exactly under the pointer) plus a tail of smaller, fainter spots chasing it.
  // All spotlight coordinates are in the hero's own (unscaled) space.
  const hero = $('#hero');
  const vNight = $('#v-night');
  const vDay = $('#v-day');
  let base, reveal;
  let scale = 1;                    // current hero scale (1 = full screen)
  const isTouch = matchMedia('(hover: none)').matches;

  const TAIL = 10;
  const NONE = 'linear-gradient(transparent,transparent)';
  // alpha profile from centre (0) to edge (1): solid core, long progressive fade to nothing
  const STOPS = [[0, 1], [.16, 1], [.3, .9], [.44, .72], [.57, .5], [.69, .3], [.8, .15], [.9, .05], [1, 0]];
  const radius = () => Math.max(170, Math.min(280, innerWidth * 0.19));

  function profile(t) {
    if (t >= 1) return 0;
    for (let i = 1; i < STOPS.length; i++) {
      const [p1, a1] = STOPS[i];
      if (t <= p1) {
        const [p0, a0] = STOPS[i - 1];
        return a0 + (a1 - a0) * (t - p0) / (p1 - p0);
      }
    }
    return 0;
  }
  const spot = s => `radial-gradient(circle ${s.r.toFixed(1)}px at ${s.x.toFixed(1)}px ${s.y.toFixed(1)}px,` +
    STOPS.map(([p, a]) => `rgba(0,0,0,${(a * s.a).toFixed(3)}) ${p * 100}%`).join(',') + ')';

  // per-frame easing factor normalised to 60fps, so speed is the same on 30/60/120Hz screens
  const ease = (k, dt) => 1 - Math.pow(1 - k, dt * 60);

  // one spotlight = head position + a tail chasing it + how open it is (lit: 0 closed .. 1 open)
  const makeSpot = () => ({ x: 0, y: 0, lit: 0, target: 0, was: false, timer: 0,
    trail: Array.from({ length: TAIL }, () => ({ x: 0, y: 0 })) });
  function moveSpot(s, x, y, snap) {
    s.x = x; s.y = y;
    if (snap) s.trail.forEach(p => { p.x = x; p.y = y; });
  }
  function stepSpot(s, want, k, dt) {
    s.lit += (want - s.lit) * ease(k, dt);
    if (s.lit < 0.004 && want === 0) s.lit = 0;
    // each tail segment chases the one in front of it
    let lx = s.x, ly = s.y;
    const follow = ease(0.38, dt);
    for (const p of s.trail) {
      p.x += (lx - p.x) * follow;
      p.y += (ly - p.y) * follow;
      lx = p.x; ly = p.y;
    }
  }
  // the spots in the masked layer's coordinates (ox/oy: where that layer starts)
  function spotsOf(s, ox = 0, oy = 0, size = 1) {
    if (s.lit <= 0) return [];
    const R = radius() * size * s.lit;
    return [{ x: s.x - ox, y: s.y - oy, r: R, a: 1 }, ...s.trail.map((p, i) => {
      const f = 1 - (i + 1) / (TAIL + 1);
      return { x: p.x - ox, y: p.y - oy, r: R * (0.35 + 0.65 * f), a: 0.85 * f };
    })];
  }
  // hole: an area that stays as it is (the spotlight goes around it), in the layer's px.
  // Built with mask compositing: invert(spots), add the hole, invert again = spots minus the hole.
  // The hole is made of gradient layers only ([image, size, position]): no image to decode on every frame.
  const SOLID = 'linear-gradient(#000 0 0)';
  const CORNER = 'radial-gradient(closest-side,#000 calc(100% - 1px),transparent)';
  function paintMask(el, spots, hole) {
    const st = el.style;
    if (!spots.length || !hole) {
      const m = spots.length ? spots.map(spot).join(',') : NONE;
      st.webkitMaskImage = m;
      st.maskImage = m;
      if (st.maskComposite) st.webkitMaskSize = st.maskSize = st.webkitMaskPosition = st.maskPosition = st.webkitMaskComposite = st.maskComposite = '';
      return;
    }
    const rest = n => Array(spots.length).fill(n), holes = n => hole.map(() => n);
    st.webkitMaskImage = st.maskImage = [SOLID, ...hole.map(h => h[0]), SOLID, ...spots.map(spot)].join(',');
    st.webkitMaskSize = st.maskSize = ['100% 100%', ...hole.map(h => h[1]), '100% 100%', ...rest('auto')].join(',');
    st.webkitMaskPosition = st.maskPosition = ['0 0', ...hole.map(h => h[2]), '0 0', ...rest('0 0')].join(',');
    st.webkitMaskComposite = ['xor', ...holes('source-over'), 'xor', ...rest('source-over')].join(',');
    st.maskComposite = ['exclude', ...holes('add'), 'exclude', ...rest('add')].join(',');
  }
  // the hole of an element: its own --hole mask if it has one (e.g. the map, which fades out at its edges),
  // otherwise its rounded box (two crossed rects + four round corners)
  function holeOf(el, r) {
    if (!el) return null;
    const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const x = Math.round(b.left - r.left), y = Math.round(b.top - r.top), w = Math.round(b.width), h = Math.round(b.height);
    const px = (a, c) => `${a}px ${c}px`;
    const own = cs.getPropertyValue('--hole').trim();
    if (own) return [[own, px(w, h), px(x, y)]];
    const k = Math.min(Math.round(parseFloat(cs.borderTopLeftRadius) || 0), w >> 1, h >> 1), d = 2 * k;
    if (!k) return [[SOLID, px(w, h), px(x, y)]];
    return [
      [SOLID, px(w - d, h), px(x + k, y)], [SOLID, px(w, h - d), px(x, y + k)],
      [CORNER, px(d, d), px(x, y)], [CORNER, px(d, d), px(x + w - d, y)],
      [CORNER, px(d, d), px(x, y + h - d)], [CORNER, px(d, d), px(x + w - d, y + h - d)],
    ];
  }
  // touch screens: tap to reveal, it closes again after a moment
  function tapSpot(s, x, y) {
    moveSpot(s, x, y, s.lit < 0.05);
    s.target = 1;
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { s.target = 0; }, 1500);
  }

  const hs = makeSpot();   // hero: hero-local, unscaled px
  const ps = makeSpot();   // sections: viewport px
  let intro = null;

  // ---------- day / night ----------
  // night: black video is the base, white video is revealed; day: the opposite.
  // There is a switch in the hero and one in the "Chi siamo" section; both stay in sync.
  function setTheme(day) {
    html.dataset.theme = day ? 'day' : 'night';
    $$('.switch').forEach(b => b.setAttribute('aria-checked', day));
    base = day ? vDay : vNight;
    reveal = day ? vNight : vDay;
    base.classList.remove('reveal');
    base.style.webkitMaskImage = base.style.maskImage = '';
    reveal.classList.add('reveal');
    hs.was = true; // repaint the mask on the new reveal video next frame
    // the section spotlight always shows the opposite theme
    panelAlt.classList.toggle('theme-day', !day);
    panelAlt.classList.toggle('theme-night', day);
    recolorMap();
    try { localStorage.setItem('theme', day ? 'day' : 'night'); } catch (e) {}
  }
  setTheme(html.dataset.theme === 'day');
  function toggleTheme(btn) {
    const day = html.dataset.theme !== 'day';
    if (!document.startViewTransition) {
      html.classList.add('theme-anim');
      setTheme(day);
      setTimeout(() => html.classList.remove('theme-anim'), 650);
      return;
    }
    // the new theme grows as a circle out of the switch that was pressed
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => setTheme(day));
    vt.ready.then(() => html.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 1000, easing: EASE, pseudoElement: '::view-transition-new(root)' }
    ));
  }
  $$('.switch').forEach(b => b.addEventListener('click', () => toggleTheme(b)));

  function local(e) {
    const r = hero.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  }

  // mouse: follow in real time
  hero.addEventListener('pointerenter', e => {
    if (e.pointerType === 'touch') return;
    intro = null;
    moveSpot(hs, ...local(e), hs.lit < 0.05);
    hs.target = 1;
  });
  hero.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') moveSpot(hs, ...local(e));
  });
  hero.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'touch') hs.target = 0;
  });

  // touch: tap to reveal (pointerup is cancelled when the gesture turns into a scroll)
  hero.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch' || e.target.closest('button,a')) return;
    intro = null;
    tapSpot(hs, ...local(e));
  });

  // sections: the cursor uncovers the section in the opposite theme (same spotlight, same tail)
  const sectionSpot = () => panelReady;
  panel.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || !sectionSpot()) return;
    moveSpot(ps, e.clientX, e.clientY, ps.lit < 0.05);
    ps.target = 1;
  });
  panel.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'touch') ps.target = 0;
  });
  panel.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch' || !sectionSpot() || e.target.closest('button,a,input,select,textarea,label')) return;
    tapSpot(ps, e.clientX, e.clientY);
  });

  // mouse click on the shrunken hero: scroll back up and reopen it full screen
  hero.addEventListener('click', e => {
    if (!document.body.classList.contains('in-grid') || e.target.closest('button,a')) return;
    if (e.pointerType === 'touch') return;
    scrollTo({ top: 0, behavior: 'smooth' });
  });

  // touch: automatic sweep on load, to hint that the hero can be tapped
  if (isTouch) {
    setTimeout(() => {
      if (hs.lit > 0.05 || scale < 0.99) return;
      const w = hero.clientWidth, h = hero.clientHeight;
      intro = { t0: performance.now(), x0: w * 0.3, y0: h * 0.42, x1: w * 0.72, y1: h * 0.52, dur: 1800 };
      moveSpot(hs, intro.x0, intro.y0, true);
      hs.target = 1;
    }, 1200);
  }

  // text and buttons switch colour as the revealed (opposite) video gets close to them
  const targets = $$('.top .pill, .switch, .wordmark .ch, .sub h2, .sq, .tagline, .tile', hero)
    .map(el => (el.classList.add('dk'), { el, d: 0 }));
  function measure() {
    const hr = hero.getBoundingClientRect();
    targets.forEach(t => {
      const r = t.el.getBoundingClientRect();
      t.l = (r.left - hr.left) / scale; t.r = (r.right - hr.left) / scale;
      t.t = (r.top - hr.top) / scale;   t.b = (r.bottom - hr.top) / scale;
    });
  }

  function darken(spots) {
    for (const t of targets) {
      let a = 0;
      for (const s of spots) {
        const dx = Math.max(t.l - s.x, 0, s.x - t.r);
        const dy = Math.max(t.t - s.y, 0, s.y - t.b);
        a = Math.max(a, profile(Math.hypot(dx, dy) / s.r) * s.a);
      }
      const d = Math.min(1, a * 1.6);
      if (Math.abs(d - t.d) > 0.01 || (d === 0 && t.d !== 0)) {
        t.d = d;
        t.el.style.setProperty('--dark', d.toFixed(3));
      }
    }
  }

  // ---------- scroll stage: hero -> grid ----------
  const stage = $('#stage'), sticky = $('.sticky'), grid = $('#grid'), heroCell = $('.cell-hero');
  const cells = $$('.cell', grid);
  let W = 0, H = 0, cell = { x: 0, y: 0, w: 0, h: 0 }, stageTop = 0, stageDist = 1;
  let prog = -1, progShown = -1;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function layoutStage() {
    W = sticky.clientWidth; H = sticky.clientHeight;
    const cs = getComputedStyle(grid);
    if (innerWidth > 700) {
      // size the hero cell so it keeps the screen's proportions (no cropping when it shrinks)
      const gap = parseFloat(cs.columnGap);
      const innerW = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const innerH = grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const twoCols = (innerW - 2 * gap) * 2 / 3 + gap;
      grid.style.setProperty('--hero-h', Math.min(twoCols * H / W, (innerH - gap) * 0.76) + 'px');
    } else {
      grid.style.removeProperty('--hero-h');
    }
    const sr = sticky.getBoundingClientRect(), cr = heroCell.getBoundingClientRect();
    cell = { x: cr.left - sr.left, y: cr.top - sr.top, w: cr.width, h: cr.height };
    stageTop = stage.offsetTop;
    stageDist = Math.max(1, stage.offsetHeight - H);
    progShown = -1; // force a redraw
  }

  // smooth curves only (no anticipation / overshoot): the motion never reverses direction, so it never "jumps"
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const bgLayer = $('.bg', hero);

  function applyStage(p) {
    // 0 .. .62: the hero flies into its cell; .28 .. 1: the other cells fly in around it, one after another
    const t = clamp(p / 0.62);
    const e = easeInOut(t);
    const lift = Math.sin(Math.PI * t);          // 0 → 1 → 0: strongest mid-flight
    const bx = cell.x * e, by = cell.y * e;
    const bw = W + (cell.w - W) * e, bh = H + (cell.h - H) * e;
    scale = Math.max(bw / W, bh / H);
    const x = bx - (W * scale - bw) / 2, y = by;
    const cl = (bx - x) / scale, cw = bw / scale, ch = bh / scale;
    const ox = cl + cw / 2, oy = ch / 2;          // centre of the visible card, in hero space
    const radius = (16 * Math.min(1, t * 4) + 10 * lift) / scale;
    hero.style.transform = t > 0
      ? `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${scale.toFixed(5)}) ` +
        `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px) perspective(1400px) ` +
        `rotateX(${(lift * 5).toFixed(2)}deg) rotateY(${(-lift * 6).toFixed(2)}deg) rotateZ(${(-lift * 1).toFixed(2)}deg) ` +
        `translate(${(-ox).toFixed(1)}px,${(-oy).toFixed(1)}px)`
      : '';
    hero.style.clipPath = t > 0
      ? `inset(0px ${(W - cl - cw).toFixed(2)}px ${(H - ch).toFixed(2)}px ${cl.toFixed(2)}px round ${radius.toFixed(2)}px)`
      : '';
    // the video drifts deeper while the card is in flight (parallax), then settles back
    bgLayer.style.transform = lift > 0.001 ? `scale(${(1 + 0.12 * lift).toFixed(4)})` : '';

    cells.forEach((c, i) => {
      const k = clamp((p - (0.28 + i * 0.1)) / 0.32);
      const q = easeOut(k).toFixed(4);
      c.style.setProperty('--q', q);
      c.style.setProperty('--qo', q);
      // clickable once it is most of the way in (85% of its eased entrance): no need to wait until it has
      // fully landed, which for the last cells only happens at the very end of the scroll
      const ready = k > 0.47;
      c.classList.toggle('ready', ready);
      c.tabIndex = ready ? 0 : -1;
    });
    document.body.classList.toggle('in-grid', t > 0.02);
  }

  layoutStage();
  measure();
  addEventListener('resize', () => { layoutStage(); measure(); });
  addEventListener('load', () => { layoutStage(); measure(); });
  document.fonts && document.fonts.ready.then(measure);
  setTimeout(measure, 2200); // after the entrance animation

  let last = performance.now();

  (function tick(now = performance.now()) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // scroll progress through the stage, smoothed so wheel steps still feel fluid
    const target = clamp((scrollY - stageTop) / stageDist);
    prog = prog < 0 ? target : prog + (target - prog) * ease(0.1, dt);
    if (Math.abs(target - prog) < 0.0002) prog = target;
    if (prog !== progShown) { applyStage(prog); progShown = prog; }
    // the spotlight rests while the hero is flying into the grid: redrawing it there costs frames
    const inFlight = prog > 0.002 && prog < 0.62;

    if (intro) {
      const k = Math.min(1, (now - intro.t0) / intro.dur);
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      moveSpot(hs, intro.x0 + (intro.x1 - intro.x0) * e, intro.y0 + (intro.y1 - intro.y0) * e);
      if (k === 1) { intro = null; hs.target = 0; }
    }

    // hero spotlight (off while flying, and while a section covers the hero)
    stepSpot(hs, inFlight || panelOpen ? 0 : hs.target, inFlight ? 0.3 : 0.14, dt);
    if (hs.lit > 0 || hs.was) {
      const spots = spotsOf(hs);
      paintMask(reveal, spots);
      darken(spots);
      hs.was = hs.lit > 0;
    }

    // section spotlight: the opposite-theme copy scrolls with the section, the spot stays under the cursor
    stepSpot(ps, sectionSpot() ? ps.target : 0, 0.14, dt);
    if (ps.lit > 0 || ps.was) {
      const r = panelAlt.getBoundingClientRect();
      // 15% wider than in the hero; in "Prenota" 20% smaller than that, and it goes around the form
      // (in "Dove siamo" around the map)
      const prenota = panel.dataset.sec === 'prenota';
      const spots = spotsOf(ps, r.left, r.top, prenota ? 1.15 * 0.8 : 1.15);
      paintMask(panelAlt, spots, holeOf(panelBody.querySelector('.lg, .dv-map'), r));
      panelAlt.style.visibility = spots.length ? 'visible' : '';
      ps.was = ps.lit > 0;
    }

    // section videos start once the section has finished growing: decoding them during the zoom cost frames
    if (panelOpen) { if (panelReady) syncPanelVideos(); stepWheel(dt); stepReviews(dt); stepPull(dt); stepMap(dt); }

    // keep the two videos on the same frame: nudge speed for small drift, seek for big jumps (loop restart)
    if (!base.paused) {
      const drift = base.currentTime - reveal.currentTime;
      if (Math.abs(drift) > 0.25) reveal.currentTime = base.currentTime;
      else reveal.playbackRate = 1 + Math.max(-0.1, Math.min(0.1, drift * 0.5));
      base.playbackRate = 1;
      if (reveal.paused) reveal.play().catch(() => {});
    }
    requestAnimationFrame(tick);
  })();
})();
