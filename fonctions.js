const state = { mayo: 0, ketchup: 0, idx: 0 };
let slides       = [];
let blobURLs     = [];
let bdmAudio     = null;
let victoryAudio = null;
let bdmQuestions = [];
let bdmQIdx      = 0;
let inBDMMode    = false;
let answerState  = null; // { type, correct, selected, revealed }
let tossRevealed = false;
let candPhase    = 1; // 1 = candidat 1 seul, 2 = les deux

/* menu */
let bdmReady            = false; // true = video en cours, → lance les questions
let bdmRecapActive      = false;
let generiqueActive     = false;
let goodbyeActive       = false;
let sonometerStream     = null;
let sonometerRaf        = null;
let sonometerCtx        = null;
let sonometerAnalyser   = null;
let sonometerSmoothed   = 0;
let sonometerRunning    = false;
let menuHubActive       = false;
let menuSlideRef        = null;
let menuActiveItem      = null; // index 0/1/2 du menu en cours
let menuQIdx            = 0;
let menuDoneSet         = new Set();
let menuQAnswerRevealed = false;

try { Object.assign(state, JSON.parse(localStorage.bq_state || '{}')); } catch (_) {}

function saveState() {
  localStorage.bq_state = JSON.stringify(state);
}

/* ─── Démarrage ─────────────────────────────────────────────────────── */
async function init() {
  const listId = new URLSearchParams(window.location.search).get('list');
  slides = listId ? await BQ_DB.getSlidesByList(listId) : await BQ_DB.getSlides();
  refreshScores();
  await showSlide();
}

/* ─── Scores ────────────────────────────────────────────────────────── */
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function refreshScores() {
  ['mayo', 'ketchup'].forEach(team => {
    const s = pad(state[team]);
    document.getElementById('score-' + team).src         = 'img/score-' + s + '.jpg';
    document.getElementById('txt-'   + team).textContent = s;
  });
  const counter = document.getElementById('slide-counter');
  if (counter && slides.length)
    counter.textContent = (state.idx + 1) + ' / ' + slides.length;
}

function score(team, delta) {
  const prev = state[team];
  state[team] = Math.max(0, Math.min(25, state[team] + delta));
  const s = pad(state[team]);
  document.getElementById('score-' + team).src         = 'img/score-' + s + '.jpg';
  document.getElementById('txt-'   + team).textContent = s;
  saveState();
  if (state[team] === 25 && prev < 25) triggerVictoire(team);
}

/* ─── Victoire à 25 ──────────────────────────────────────────────────── */
function triggerVictoire(team) {
  const label  = team === 'mayo' ? 'MAYO' : 'KETCHUP';
  const colors = team === 'mayo'
    ? ['#EDD400','#FFE033','#FFF176','#FFFFFF','#FFC107']
    : ['#CC0000','#FF1111','#FF6B6B','#FFFFFF','#8B0000'];

  lancerParticules(colors);
  afficherBanniereVictoire(label, team);
  startVictoryMusic();

  setTimeout(() => {
    cacherBanniereVictoire();
    arreterParticules();
    stopVictoryMusic();
    if (confirm('Lancer le Burger de la Mort ?')) {
      lancerBurgerDeLaMort();
    }
  }, 11000);
}

/* ─── Particules ─────────────────────────────────────────────────────── */
let _canvas = null, _ctx = null, _particles = [], _raf = null;

function lancerParticules(colors) {
  arreterParticules();

  _canvas = document.createElement('canvas');
  _canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:700';
  _canvas.width  = window.innerWidth;
  _canvas.height = window.innerHeight;
  document.body.appendChild(_canvas);
  _ctx = _canvas.getContext('2d');

  _particles = Array.from({ length: 260 }, () => creerParticule(colors, true));
  _raf = requestAnimationFrame(() => animerParticules(colors));
}

function creerParticule(colors, fromTop) {
  const W = _canvas.width, H = _canvas.height;
  return {
    x:      Math.random() * W,
    y:      fromTop ? Math.random() * -H * 0.5 : Math.random() * H,
    w:      Math.random() * 14 + 5,
    h:      Math.random() * 7  + 3,
    color:  colors[Math.floor(Math.random() * colors.length)],
    speed:  Math.random() * 5  + 2,
    drift:  (Math.random() - 0.5) * 2.5,
    angle:  Math.random() * 360,
    spin:   (Math.random() - 0.5) * 6,
    shape:  Math.random() < 0.3 ? 'circle' : 'rect',
  };
}

function animerParticules(colors) {
  if (!_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  _particles.forEach(p => {
    p.y     += p.speed;
    p.x     += p.drift;
    p.angle += p.spin;
    _ctx.save();
    _ctx.globalAlpha = 0.92;
    _ctx.translate(p.x, p.y);
    _ctx.rotate(p.angle * Math.PI / 180);
    _ctx.fillStyle = p.color;
    if (p.shape === 'circle') {
      _ctx.beginPath();
      _ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      _ctx.fill();
    } else {
      _ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    _ctx.restore();
    if (p.y > _canvas.height + 20) Object.assign(p, creerParticule(colors, true), { y: -20 });
  });
  _raf = requestAnimationFrame(() => animerParticules(colors));
}

function arreterParticules() {
  if (_raf)    { cancelAnimationFrame(_raf); _raf = null; }
  if (_canvas) { _canvas.remove(); _canvas = null; _ctx = null; }
  _particles = [];
}

/* ─── Bannière victoire ──────────────────────────────────────────────── */
function afficherBanniereVictoire(label, team) {
  let el = document.getElementById('victoire-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'victoire-banner';
    el.style.cssText = [
      'position:fixed', 'top:50%', 'left:50%',
      'transform:translate(-50%,-50%) scale(0)',
      'z-index:600', 'text-align:center',
      'background:rgba(0,0,0,0.85)',
      'border-radius:24px', 'padding:40px 70px',
      'border:4px solid #EDD400',
      'transition:transform .4s cubic-bezier(.34,1.56,.64,1)',
      'font-family:"BQ",sans-serif',
    ].join(';');
    document.body.appendChild(el);
  }
  const color = team === 'mayo' ? '#EDD400' : '#CC0000';
  el.innerHTML = `
    <div style="font-size:72px;line-height:1">🏆</div>
    <div style="color:${color};font-size:80px;letter-spacing:4px;margin:8px 0">${label}</div>
    <div style="color:#fff;font-size:36px;letter-spacing:6px">A GAGNÉ !</div>
    <div style="color:#666;font-size:18px;margin-top:16px;font-family:'AV',sans-serif">
      Burger de la Mort dans quelques instants…
    </div>`;
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-50%) scale(1)'; });
}

function cacherBanniereVictoire() {
  const el = document.getElementById('victoire-banner');
  if (el) {
    el.style.transform = 'translate(-50%,-50%) scale(0)';
    setTimeout(() => el.remove(), 400);
  }
}

/* ─── Lancer Burger de la Mort ───────────────────────────────────────── */
async function lancerBurgerDeLaMort() {
  // Chercher la vidéo burger-mort dans la liste courante, sinon dans toutes les slides
  let videoName = null;

  const bmLocal = slides.find(s =>
    s.type === 'V' && (s.mediaName || '').toLowerCase().includes('burger-mort'));
  if (bmLocal) {
    videoName = bmLocal.mediaName;
  } else {
    const all = await BQ_DB.getSlides();
    const bmAll = all.find(s =>
      s.type === 'V' && (s.mediaName || '').toLowerCase().includes('burger-mort'));
    if (bmAll) videoName = bmAll.mediaName;
  }

  if (videoName) {
    const url = await resolveURL(videoName);
    if (url) {
      // Jouer la vidéo directement sans passer par showSlide() (qui remet bdmReady = false)
      const customDisp = document.getElementById('custom-display');
      if (customDisp) { customDisp.style.display = 'none'; customDisp.innerHTML = ''; }
      hide('reponse', 'reponses', 'image', 'menus', 'media-extra');
      document.getElementById('title').innerHTML    = '';
      document.getElementById('question').innerHTML = '';
      const vid = document.getElementById('generique');
      vid.src = url;
      document.getElementById('video-frame').style.display = 'block';
      vid.currentTime = 0;
      vid.play().catch(() => {});
      bdmReady = true; // → déclenchera enterBDMOverlay()
      return;
    }
  }

  // Aucune vidéo : lancer directement les questions
  enterBDMOverlay();
}

/* ─── Highlighting des réponses ──────────────────────────────────────── */
const LETTER_MAP = { 1:'A', 2:'B', 3:'C', 4:'D' };

function initAnswerState(s) {
  answerState = { type: s.type, correct: (s.correctAnswer || '').trim(), selected: null, revealed: false };
  clearAnswerHighlight();
}

function clearAnswerHighlight() {
  ['A','B','C','D'].forEach(l => {
    const el = document.getElementById('row-' + l);
    if (el) el.className = 'answer-row';
  });
  const rep = document.getElementById('reponse');
  if (rep) rep.classList.remove('answer-correct', 'answer-wrong', 'answer-selected');
  const ind = document.getElementById('sp-indicator');
  if (ind) ind.remove();
}

function selectTeamAnswer(num) {
  if (!answerState || answerState.revealed) return;
  if (answerState.type === 'N') {
    const letter = LETTER_MAP[num];
    if (!letter) return;
    answerState.selected = letter;
    ['A','B','C','D'].forEach(l => {
      const el = document.getElementById('row-' + l);
      if (el) el.className = 'answer-row' + (l === letter ? ' answer-selected' : '');
    });
  } else if (answerState.type === 'S') {
    return; // la révélation se fait via ESPACE
  }
}

function revealAnswer() {
  if (!answerState) return;
  answerState.revealed = true;
  const { type, correct, selected } = answerState;

  if (type === 'N') {
    ['A','B','C','D'].forEach(l => {
      const el = document.getElementById('row-' + l);
      if (!el) return;
      if (l === correct)                    el.className = 'answer-row answer-correct';
      else if (l === selected && l !== correct) el.className = 'answer-row answer-wrong';
      else                                  el.className = 'answer-row';
    });
  }

  if (type === 'S') {
    const rep = document.getElementById('reponse');
    rep.style.display = 'block';
    requestAnimationFrame(() => rep.classList.add('sp-revealed'));
    return;
  }

  if (type === 'M') {
    const rep = document.getElementById('reponse');
    if (rep) rep.classList.add('answer-correct');
  }
}

function renderSPNeutral(answer) {
  let ind = document.getElementById('sp-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'sp-indicator';
    const rep = document.getElementById('reponse');
    if (rep && rep.parentNode) rep.parentNode.insertBefore(ind, rep.nextSibling);
  }
  ind.innerHTML = answer
    ? `<span style="color:#EDD400;font-family:'BQ',sans-serif;font-size:72px">${answer.toUpperCase()}</span>`
    : '';
}

function renderSPIndicator(selected, correct) {
  let ind = document.getElementById('sp-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'sp-indicator';
    const rep = document.getElementById('reponse');
    if (rep && rep.parentNode) rep.parentNode.insertBefore(ind, rep.nextSibling);
  }
  if (!selected && !correct) { ind.innerHTML = ''; return; }
  if (!correct) {
    // Juste afficher la sélection en attente
    ind.innerHTML = `<span style="color:#EDD400">${selected.toUpperCase()} ?</span>`;
    return;
  }
  // Révélation
  if (selected && selected !== correct) {
    ind.innerHTML = `<span style="color:#CC0000">${selected.toUpperCase()} ✗</span>` +
                    `&nbsp;&nbsp;<span style="color:#00cc50">${correct.toUpperCase()} ✓</span>`;
  } else {
    ind.innerHTML = `<span style="color:#00cc50">${correct.toUpperCase()} ✓</span>`;
  }
}

/* ─── Menu hub (liste de menus avec sous-questions) ─────────────────── */
function showMenuHub(s) {
  menuHubActive  = true;
  menuSlideRef   = s;
  menuActiveItem = null;
  document.getElementById('screen').classList.add('menu-mode');
  renderMenuHub();
}

function renderMenuHub() {
  const s    = menuSlideRef;
  const disp = document.getElementById('custom-display');
  const items = [1, 2, 3]
    .filter(n => s['item' + n])
    .map(n => ({ n, name: s['item' + n], qs: s['item' + n + 'Questions'] || [] }));

  let btns = '';
  items.forEach(m => {
    const done = menuDoneSet.has(m.n - 1);
    btns += `<button class="menu-btn ${done ? 'done' : ''}" onclick="enterMenu(${m.n - 1})">
      <span class="menu-btn-num">${m.n}</span>
      <span class="menu-btn-name">${m.name}</span>
      ${done ? '<span class="menu-btn-check">✓</span>' : `<span class="menu-btn-count">${m.qs.length} q.</span>`}
    </button>`;
  });

  disp.innerHTML = `<div class="menu-hub">
    <div class="menu-hub-title">MENUS</div>
    <div class="menu-btns">${btns}</div>
    <div class="menu-hub-hint">1/2/3 : choisir &nbsp;·&nbsp; → : continuer</div>
  </div>`;
  disp.style.display = 'block';
}

function enterMenu(idx) {
  const s  = menuSlideRef;
  const n  = idx + 1;
  const qs = s['item' + n + 'Questions'] || [];
  if (!qs.length) { menuDoneSet.add(idx); renderMenuHub(); return; }
  menuActiveItem      = idx;
  menuQIdx            = 0;
  menuQAnswerRevealed = false;
  renderMenuQuestion();
}

function renderMenuQuestion() {
  const s    = menuSlideRef;
  const n    = menuActiveItem + 1;
  const qs   = s['item' + n + 'Questions'] || [];
  const q    = qs[menuQIdx];
  if (!q) { exitMenuQ(); return; }

  const disp = document.getElementById('custom-display');
  disp.innerHTML = `<div class="menu-q-content">
    <div class="menu-q-header">
      <span class="menu-q-title">${s['item' + n] || 'Menu'}</span>
      <span class="menu-q-progress">${menuQIdx + 1} / ${qs.length}</span>
    </div>
    <div class="menu-q-text">${q.q || ''}</div>
    ${q.a ? `<div class="menu-q-answer${menuQAnswerRevealed ? ' revealed' : ''}" id="menu-q-ans">${q.a}</div>` : ''}
    <div class="menu-q-hint">← → naviguer &nbsp;·&nbsp; ESPACE : révéler &nbsp;·&nbsp; 0 : masquer</div>
  </div>`;
  disp.style.display = 'block';
}

function menuQNext() {
  const s  = menuSlideRef;
  const n  = menuActiveItem + 1;
  const qs = s['item' + n + 'Questions'] || [];
  menuQAnswerRevealed = false;
  if (menuQIdx < qs.length - 1) { menuQIdx++; renderMenuQuestion(); }
  else exitMenuQ();
}

function menuQPrev() {
  if (menuQIdx > 0) { menuQIdx--; menuQAnswerRevealed = false; renderMenuQuestion(); }
}

function menuQReveal() {
  menuQAnswerRevealed = true;
  const el = document.getElementById('menu-q-ans');
  if (el) el.classList.add('revealed');
}

function menuQHideAnswer() {
  menuQAnswerRevealed = false;
  const el = document.getElementById('menu-q-ans');
  if (el) el.classList.remove('revealed');
}

function exitMenuQ() {
  menuDoneSet.add(menuActiveItem);
  menuActiveItem = null;
  menuQAnswerRevealed = false;
  renderMenuHub();
}

/* ─── Listes BDM (localStorage) ─────────────────────────────────────── */
function getActiveBDMList() {
  const activeId = localStorage.bq_active_bdm;
  if (!activeId) return null;
  try {
    const lists = JSON.parse(localStorage.bq_bdm_lists || '[]');
    return lists.find(l => l.id === activeId) || null;
  } catch (_) { return null; }
}

/* ─── Overlay BDM ────────────────────────────────────────────────────── */
function enterBDMOverlay() {
  const list = getActiveBDMList();
  const qs   = (list?.questions || []).filter(q => (q.text || '').trim());
  if (!qs.length) return false;
  bdmQuestions   = qs;
  bdmQIdx        = 0;
  inBDMMode      = true;
  bdmRecapActive = false;

  // Toujours remettre la vue questions visible et le récap caché
  const qView = document.getElementById('bdm-q-view');
  const recap = document.getElementById('bdm-recap');
  if (qView) qView.style.display = 'flex';
  if (recap) recap.style.display = 'none';

  startBDMMusic();
  document.getElementById('bdm-overlay').style.display = 'flex';
  renderBDMQuestion();
  return true;
}

function renderBDMQuestion() {
  const q = bdmQuestions[bdmQIdx];
  document.getElementById('bdm-counter').textContent = (bdmQIdx + 1) + ' / ' + bdmQuestions.length;
  document.getElementById('bdm-q-text').textContent  = q.text || '';
}

function bdmPrev() {
  if (bdmRecapActive) { bdmRecapBack(); return; }
  if (bdmQIdx > 0) { bdmQIdx--; renderBDMQuestion(); }
}

function bdmNext() {
  if (bdmRecapActive) return;
  if (bdmQIdx < bdmQuestions.length - 1) { bdmQIdx++; renderBDMQuestion(); }
  else showBDMRecap();
}

function exitBDM() {
  inBDMMode     = false;
  bdmRecapActive = false;
  stopBDMMusic();
  document.getElementById('bdm-overlay').style.display = 'none';
  document.getElementById('screen').classList.remove('bdm-mode');
}

/* ─── Récapitulatif BDM ──────────────────────────────────────────────── */
function showBDMRecap() {
  bdmRecapActive = true;
  document.getElementById('bdm-q-view').style.display   = 'none';
  const recapEl = document.getElementById('bdm-recap');
  recapEl.style.display = 'flex';

  document.getElementById('bdm-recap-list').innerHTML = bdmQuestions
    .map((q, i) => `<div class="bdm-recap-item">
      <span class="bdm-recap-num">${i + 1}</span>
      <span class="bdm-recap-q">${q.text || ''}</span>
    </div>`).join('');
}

function bdmRecapBack() {
  bdmRecapActive = false;
  document.getElementById('bdm-recap').style.display   = 'none';
  document.getElementById('bdm-q-view').style.display  = 'flex';
  // Revenir à la dernière question
  bdmQIdx = bdmQuestions.length - 1;
  renderBDMQuestion();
}

async function bdmSuccess() {
  inBDMMode      = false;
  bdmRecapActive = false;
  stopBDMMusic();
  document.getElementById('bdm-overlay').style.display = 'none';
  document.getElementById('bdm-recap').style.display   = 'none';

  // Afficher le contenu de la slide cadeau (type G)
  const cadeauEl    = document.getElementById('bdm-win-cadeau-content');
  cadeauEl.innerHTML = '';
  const cadeauSlide = slides.find(s => s.type === 'G')
                   || (await BQ_DB.getSlides()).find(s => s.type === 'G');
  if (cadeauSlide) {
    let mediaHtml = '';
    if (cadeauSlide.mediaName) {
      const url = await resolveURL(cadeauSlide.mediaName);
      if (url) {
        const ext = (cadeauSlide.mediaName.split('.').pop() || '').toLowerCase();
        if (['mp4','webm','mov'].includes(ext))
          mediaHtml = `<div class="bdm-win-cadeau-media"><video autoplay loop src="${url}"></video></div>`;
        else
          mediaHtml = `<div class="bdm-win-cadeau-media"><img src="${url}" alt=""></div>`;
      }
    }
    cadeauEl.innerHTML =
      (cadeauSlide.title       ? `<div class="bdm-win-cadeau-title">${cadeauSlide.title}</div>`      : '') +
      mediaHtml +
      (cadeauSlide.description ? `<div class="bdm-win-cadeau-desc">${cadeauSlide.description}</div>` : '');
  }

  document.getElementById('bdm-win-overlay').style.display = 'flex';
  lancerParticules(['#EDD400','#FF1493','#00BFFF','#FF6B00','#00FF88','#FFFFFF','#FF0000','#CC00FF']);
  startVictoryMusic();
}

function exitBDMWin() {
  document.getElementById('bdm-win-overlay').style.display = 'none';
  arreterParticules();
  stopVictoryMusic();
}

function bdmWinRetourBDM() {
  document.getElementById('bdm-win-overlay').style.display = 'none';
  arreterParticules();
  stopVictoryMusic();
  bdmFail();
}

async function bdmWinGenerique() {
  arreterParticules();
  stopVictoryMusic();
  document.getElementById('bdm-win-overlay').style.display = 'none';

  const overlay = document.getElementById('bdm-generique-overlay');
  const vid     = document.getElementById('generique-fin-vid');
  generiqueActive       = true;
  overlay.style.display = 'flex';

  const rec = await BQ_DB.getMedia('__generique_fin__');
  if (rec?.blob) {
    const url = URL.createObjectURL(rec.blob);
    blobURLs.push(url);
    vid.style.display = 'block';
    vid.src           = url;
    vid.currentTime   = 0;
    vid.play().catch(() => {});
    vid.onended = showRetourAuCalme;
  } else {
    vid.style.display = 'none';
    showRetourAuCalme();
  }
}

function showRetourAuCalme() {
  const vid = document.getElementById('generique-fin-vid');
  vid.pause();
  vid.style.display = 'none';

  let cfg = {};
  try { cfg = JSON.parse(localStorage.bq_retour_calme || '{}'); } catch (_) {}
  document.getElementById('retour-calme-title').textContent = cfg.titre   || 'FIN';
  document.getElementById('retour-calme-msg').textContent   = cfg.message || '';
  document.getElementById('bdm-retour-calme').style.display = 'flex';
}

function exitBDMGenerique() {
  generiqueActive = false;
  stopSonometer();
  const vid = document.getElementById('generique-fin-vid');
  vid.pause();
  vid.src           = '';
  vid.style.display = 'block';
  document.getElementById('bdm-generique-overlay').style.display = 'none';
  document.getElementById('bdm-retour-calme').style.display      = 'none';
  showGoodbye();
}

function showGoodbye() {
  goodbyeActive = true;
  document.getElementById('goodbye-overlay').style.display = 'flex';
}

function exitGoodbye() {
  goodbyeActive = false;
  document.getElementById('goodbye-overlay').style.display = 'none';
}

/* ─── Sonomètre micro ────────────────────────────────────────────────── */
async function toggleSonometer() {
  if (sonometerRunning) { stopSonometer(); return; }
  const btn = document.getElementById('sono-btn');
  if (btn) btn.textContent = '⏳ Connexion…';
  try {
    sonometerStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    sonometerCtx    = new (window.AudioContext || window.webkitAudioContext)();
    const src       = sonometerCtx.createMediaStreamSource(sonometerStream);
    sonometerAnalyser = sonometerCtx.createAnalyser();
    sonometerAnalyser.fftSize               = 2048;
    sonometerAnalyser.smoothingTimeConstant = 0;   // pas de lissage côté Web Audio, on gère nous-mêmes
    src.connect(sonometerAnalyser);
    sonometerRunning  = true;
    sonometerSmoothed = 0;
    if (btn) { btn.textContent = '🔴 Couper le micro'; btn.classList.add('active'); }
    updateSonometer();
  } catch (_) {
    if (btn) { btn.textContent = '❌ Micro refusé'; btn.classList.remove('active'); }
  }
}

function stopSonometer() {
  sonometerRunning = false;
  if (sonometerRaf)    { cancelAnimationFrame(sonometerRaf); sonometerRaf = null; }
  if (sonometerStream) { sonometerStream.getTracks().forEach(t => t.stop()); sonometerStream = null; }
  if (sonometerCtx)    { sonometerCtx.close().catch(() => {}); sonometerCtx = null; }
  sonometerAnalyser = null;
  const btn = document.getElementById('sono-btn');
  if (btn) { btn.textContent = '🎤 Activer le micro'; btn.classList.remove('active'); }
  // Remettre l'affichage à zéro
  const dbEl = document.getElementById('sono-db');
  const stEl = document.getElementById('sono-status');
  if (dbEl) { dbEl.textContent = '-- dB'; dbEl.style.color = '#555'; }
  if (stEl) { stEl.textContent = ''; }
  const canvas = document.getElementById('sono-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.roundRect ? ctx.roundRect(0, 0, canvas.width, canvas.height, 8) : ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fill();
  }
  const needle = document.getElementById('sono-needle');
  if (needle) needle.style.left = '0%';
}

function updateSonometer() {
  if (!sonometerRunning || !sonometerAnalyser) return;

  const bufLen = sonometerAnalyser.frequencyBinCount;
  const data   = new Float32Array(bufLen);
  sonometerAnalyser.getFloatTimeDomainData(data);

  // RMS → dBFS → dB affiché (offset +85 pour calibration)
  let sum = 0;
  for (let i = 0; i < bufLen; i++) sum += data[i] * data[i];
  const rms     = Math.sqrt(sum / bufLen);
  const dbFS    = rms > 1e-9 ? 20 * Math.log10(rms) : -100;
  const instant = Math.max(0, Math.min(90, dbFS + 85));

  // Lissage léger : montée rapide, descente douce
  const alpha   = instant > sonometerSmoothed ? 0.4 : 0.15;
  sonometerSmoothed = sonometerSmoothed * (1 - alpha) + instant * alpha;
  const db = Math.round(sonometerSmoothed);

  // Couleur selon seuils : ≤40 vert / 41-60 orange / >60 rouge
  let color, status;
  if (db <= 40)      { color = '#00cc50'; status = 'CALME ✓'; }
  else if (db <= 60) { color = '#FF8C00'; status = 'UN PEU FORT'; }
  else               { color = '#CC0000'; status = 'TROP FORT !'; }

  const dbEl = document.getElementById('sono-db');
  const stEl = document.getElementById('sono-status');
  if (dbEl) { dbEl.textContent = db + ' dB'; dbEl.style.color = color; }
  if (stEl) { stEl.textContent = status;     stEl.style.color = color; }

  // Bargraphe canvas
  const canvas = document.getElementById('sono-canvas');
  if (canvas) {
    const c  = canvas.getContext('2d');
    const W  = canvas.width, H = canvas.height;
    const pct = db / 90; // 0..1

    c.clearRect(0, 0, W, H);

    // Fond
    c.fillStyle = '#1a1a1a';
    c.fillRect(0, 0, W, H);

    // Barre de fond (zones colorées atténuées)
    const bg = c.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0,       'rgba(0,180,70,.18)');
    bg.addColorStop(40 / 90, 'rgba(0,180,70,.18)');
    bg.addColorStop(40 / 90, 'rgba(255,140,0,.18)');
    bg.addColorStop(60 / 90, 'rgba(255,140,0,.18)');
    bg.addColorStop(60 / 90, 'rgba(200,0,0,.18)');
    bg.addColorStop(1,       'rgba(200,0,0,.18)');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    // Barre active
    const grad = c.createLinearGradient(0, 0, W * pct, 0);
    if (db <= 40) {
      grad.addColorStop(0, '#00cc50'); grad.addColorStop(1, '#00cc50');
    } else if (db <= 60) {
      grad.addColorStop(0, '#00cc50'); grad.addColorStop(40 / 90 / pct, '#00cc50');
      grad.addColorStop(1, '#FF8C00');
    } else {
      grad.addColorStop(0, '#00cc50'); grad.addColorStop(40 / 90 / pct, '#00cc50');
      grad.addColorStop(60 / 90 / pct, '#FF8C00'); grad.addColorStop(1, '#CC0000');
    }
    c.fillStyle = grad;
    c.fillRect(0, 0, W * pct, H);

    // Ligne cible 40 dB
    const x40 = (40 / 90) * W;
    c.strokeStyle = '#EDD400';
    c.lineWidth   = 2;
    c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(x40, 0); c.lineTo(x40, H); c.stroke();
    c.setLineDash([]);

    // Aiguille (triangle) sur le niveau actuel
    const xNeedle = W * pct;
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(xNeedle, 0);
    c.lineTo(xNeedle - 5, H);
    c.lineTo(xNeedle + 5, H);
    c.closePath(); c.fill();
  }

  sonometerRaf = requestAnimationFrame(updateSonometer);
}

function bdmFail() {
  let lists = [];
  try { lists = JSON.parse(localStorage.bq_bdm_lists || '[]'); } catch (_) {}
  lists = lists.filter(l => (l.questions || []).some(q => (q.text || '').trim()));

  const container = document.getElementById('bdm-fail-lists');
  container.innerHTML = '';
  if (!lists.length) {
    container.innerHTML = '<p style="color:#555;font-family:sans-serif;margin:20px 0">Aucune autre liste disponible.</p>';
  } else {
    lists.forEach(l => {
      const btn = document.createElement('button');
      btn.className   = 'bdm-fail-list-btn';
      btn.textContent = l.name || 'Sans nom';
      btn.onclick     = () => bdmStartOtherList(l.id);
      container.appendChild(btn);
    });
  }
  document.getElementById('bdm-fail-overlay').style.display = 'flex';
}

function bdmStartOtherList(id) {
  document.getElementById('bdm-fail-overlay').style.display = 'none';
  document.getElementById('bdm-overlay').style.display      = 'none';
  inBDMMode      = false;
  bdmRecapActive = false;
  stopBDMMusic();
  localStorage.bq_active_bdm = id;
  enterBDMOverlay();
}

/* ─── Musique Burger de la Mort ──────────────────────────────────────── */
async function startBDMMusic() {
  if (bdmAudio) return;
  const rec = await BQ_DB.getMedia('__bdm_music__');
  if (!rec?.blob) return;
  bdmAudio = new Audio(URL.createObjectURL(rec.blob));
  bdmAudio.loop   = true;
  bdmAudio.volume = 0.75;
  bdmAudio.play().catch(() => {});
}

function stopBDMMusic() {
  if (!bdmAudio) return;
  bdmAudio.pause();
  if (bdmAudio.src.startsWith('blob:')) URL.revokeObjectURL(bdmAudio.src);
  bdmAudio = null;
}

/* ─── Musique de victoire ─────────────────────────────────────────────── */
async function startVictoryMusic() {
  if (victoryAudio) return;
  const rec = await BQ_DB.getMedia('__victory_music__');
  if (!rec?.blob) return;
  victoryAudio = new Audio(URL.createObjectURL(rec.blob));
  victoryAudio.loop   = false;
  victoryAudio.volume = 0.85;
  victoryAudio.play().catch(() => {});
}

function stopVictoryMusic() {
  if (!victoryAudio) return;
  victoryAudio.pause();
  if (victoryAudio.src.startsWith('blob:')) URL.revokeObjectURL(victoryAudio.src);
  victoryAudio = null;
}

/* ─── Candidats / Cadeau / Toss ──────────────────────────────────────── */
async function showCandidatsSlide(s) {
  document.getElementById('screen').classList.add('candidats-mode');
  candPhase = 1;
  await renderCandidatPhase(s, 1);
}

async function renderCandidatPhase(s, phase) {
  const disp = document.getElementById('custom-display');

  function photoHtml(url) {
    return url
      ? `<img src="${url}">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;color:#ccc">&#128100;</div>`;
  }
  function teamBadge(team) {
    if (!team) return '';
    return `<div class="cand-team ${team}">${team === 'mayo' ? 'MAYO' : 'KETCHUP'}</div>`;
  }
  function card(name, age, job, team, url) {
    return `<div class="cand-card">
      <div class="cand-photo-wrap">${photoHtml(url)}</div>
      <div class="cand-name">${name || ''}</div>
      ${age ? `<div class="cand-age">${age} ans</div>` : ''}
      ${job ? `<div class="cand-job">${job}</div>` : ''}
      ${teamBadge(team)}
    </div>`;
  }

  const url1 = s.cand1Photo ? await resolveURL(s.cand1Photo) : null;

  if (phase === 1) {
    const hint = s.cand2Name
      ? `<div style="position:absolute;bottom:16px;left:0;right:0;text-align:center;color:#aaa;font-size:14px;font-family:sans-serif;letter-spacing:2px">ESPACE : candidat suivant</div>`
      : '';
    disp.innerHTML = `<div class="candidats-grid single">${card(s.cand1Name, s.cand1Age, s.cand1Job, s.cand1Team, url1)}</div>${hint}`;
  } else {
    const url2 = s.cand2Photo ? await resolveURL(s.cand2Photo) : null;
    disp.innerHTML = `<div class="candidats-grid">
      ${card(s.cand1Name, s.cand1Age, s.cand1Job, s.cand1Team, url1)}
      ${card(s.cand2Name, s.cand2Age, s.cand2Job, s.cand2Team, url2)}
    </div>`;
  }
  disp.style.display = 'block';
}

async function showCadeauSlide(s) {
  if (s.enabled === false) return;
  document.getElementById('screen').classList.add('cadeau-mode');
  const disp = document.getElementById('custom-display');
  let mediaHtml = '';
  if (s.mediaName) {
    const url = await resolveURL(s.mediaName);
    if (url) {
      const ext = (s.mediaName.split('.').pop() || '').toLowerCase();
      if (['mp4','webm','mov'].includes(ext))
        mediaHtml = `<div class="cadeau-media"><video autoplay loop src="${url}"></video></div>`;
      else
        mediaHtml = `<div class="cadeau-media"><img src="${url}" alt=""></div>`;
    }
  }
  disp.innerHTML = `<div class="cadeau-content">
    <div class="cadeau-title">${s.title || 'CADEAU'}</div>
    ${mediaHtml}
    <div class="cadeau-desc">${s.description || ''}</div>
  </div>`;
  disp.style.display = 'block';
}

function showTossSlide(s) {
  tossRevealed = false;
  document.getElementById('screen').classList.add('toss-mode');
  const disp = document.getElementById('custom-display');
  const GAME_LABELS = {
    koala:                  'Imitation Koala',
    buzzer:                 'Premier sur le Buzzer',
    dernier_doigt:          'Dernier Doigt',
    pierre_feuille_ciseaux: 'Pierre Feuille Ciseaux',
    imitation:              'Imitation libre',
    personnalise:           s.gameName || 'Jeu personnalise',
  };
  const label = GAME_LABELS[s.gameType] || s.gameName || 'Jeu';

  disp.innerHTML = `<div class="toss-content">
    <div class="toss-label">TOSS</div>
    <div class="toss-game-name">${label.toUpperCase()}</div>
    ${s.instructions ? `<div class="toss-instructions">${s.instructions}</div>` : ''}
    ${s.mediaName ? `<div class="toss-hint">ESPACE : reveler &#9654;</div>` : ''}
  </div>`;
  disp.style.display = 'block';
}

async function tossReveal(s) {
  if (!s?.mediaName || tossRevealed) return;
  tossRevealed = true;
  const url = await resolveURL(s.mediaName);
  if (!url) { tossRevealed = false; return; }
  // Masquer l'ecran toss avant de lancer la video
  const disp = document.getElementById('custom-display');
  if (disp) disp.style.display = 'none';
  const vid = document.getElementById('generique');
  vid.src = url;
  document.getElementById('video-frame').style.display = 'block';
  vid.currentTime = 0;
  vid.play().catch(() => {});
}

/* ─── Affichage du slide ─────────────────────────────────────────────── */
function revokeBlobURLs() {
  blobURLs.forEach(u => URL.revokeObjectURL(u));
  blobURLs = [];
}

async function resolveURL(name) {
  const url = await BQ_DB.mediaURL(name);
  if (url && url.startsWith('blob:')) blobURLs.push(url);
  return url;
}

function hide(...ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

async function showSlide() {
  revokeBlobURLs();

  const vid = document.getElementById('generique');
  vid.pause();
  vid.src = '';

  // Quitter le mode Burger de la Mort si on change de slide
  document.getElementById('screen').classList.remove('bdm-mode');
  stopBDMMusic();
  stopVictoryMusic();
  answerState = null;
  clearAnswerHighlight();
  tossRevealed = false;
  candPhase    = 1;
  document.getElementById('screen').classList.remove('candidats-mode', 'toss-mode', 'cadeau-mode', 'menu-mode');
  bdmReady = false;
  menuHubActive = false; menuSlideRef = null; menuActiveItem = null;
  menuQIdx = 0; menuDoneSet = new Set(); menuQAnswerRevealed = false;
  const customDisp = document.getElementById('custom-display');
  if (customDisp) { customDisp.style.display = 'none'; customDisp.innerHTML = ''; }

  hide('video-frame', 'reponse', 'reponses', 'image', 'menus', 'media-extra');
  document.getElementById('info').classList.remove('has-media');
  document.getElementById('img').src               = '';
  document.getElementById('media-extra').innerHTML = '';
  document.getElementById('menus').innerHTML       = '';
  document.getElementById('title').innerHTML       = '';
  document.getElementById('question').innerHTML    = '';
  document.getElementById('reponse').innerHTML     = '';

  if (!slides.length) {
    document.getElementById('title').innerHTML    = 'BURGER QUIZ';
    document.getElementById('question').innerHTML =
      'Aucune question &mdash; appuyez sur <strong>A</strong> pour ouvrir l\'admin.';
    return;
  }

  const s = slides[state.idx] || slides[0];

  switch (s.type) {

    case 'V': {
      const url = await resolveURL(s.mediaName);
      if (url) {
        vid.src = url;
        document.getElementById('video-frame').style.display = 'block';
        vid.currentTime = 0;
        vid.play().catch(() => {});
      }
      break;
    }

    case 'N':
      document.getElementById('title').innerHTML    = 'NUGGETS';
      document.getElementById('question').innerHTML = s.question || '';
      ['A','B','C','D'].forEach(l =>
        document.getElementById('reponse' + l).innerHTML = s['answer' + l] || '');
      document.getElementById('reponses').style.display = 'block';
      initAnswerState(s);
      break;

    case 'S':
      document.getElementById('title').innerHTML    = 'SEL OU POIVRE';
      document.getElementById('question').innerHTML = s.question || '';
      document.getElementById('reponse').innerHTML  = s.answer   || '';
      // réponse cachée au départ, ESPACE la révèle
      answerState = { type: 'S', revealed: false };
      break;

    case 'I': {
      document.getElementById('title').innerHTML    = s.title    || '';
      document.getElementById('question').innerHTML = s.question || '';
      const url = await resolveURL(s.mediaName);
      if (url) document.getElementById('img').src = url;
      document.getElementById('image').style.display = 'block';
      break;
    }

    case 'M':
      document.getElementById('title').innerHTML    = 'MENUS';
      document.getElementById('question').innerHTML = s.question || '';
      document.getElementById('reponse').innerHTML  = s.answer   || '';
      document.getElementById('reponse').style.display = 'block';
      initAnswerState(s);
      break;

    case 'L':
      showMenuHub(s);
      break;

    case 'A':
      document.getElementById('title').innerHTML    = 'ADDITION';
      document.getElementById('question').innerHTML = s.title  || '';
      document.getElementById('reponse').innerHTML  = s.answer || '';
      document.getElementById('reponse').style.display = 'block';
      break;

    case 'B':
      if (!enterBDMOverlay()) {
        // Fallback si aucune liste active : affichage classique plein écran
        document.getElementById('screen').classList.add('bdm-mode');
        document.getElementById('title').innerHTML    = 'BURGER DE LA MORT';
        document.getElementById('question').innerHTML = s.question || '';
        startBDMMusic();
      }
      break;

    case 'C':
      await showCandidatsSlide(s);
      break;

    case 'G':
      await showCadeauSlide(s);
      break;

    case 'T':
      showTossSlide(s);
      break;
  }

  // Media supplementaire (image, vidéo, audio, PDF) pour tous les types sauf V, I, C, G, T
  if (s.type !== 'V' && s.type !== 'I' && s.type !== 'C' && s.type !== 'G' && s.type !== 'T' && s.mediaName) {
    const ext = (s.mediaName.split('.').pop() || '').toLowerCase();
    const url = await resolveURL(s.mediaName);
    if (url) {
      const el  = document.getElementById('media-extra');
      const hasAnswers = ['N','S','M'].includes(s.type);
      if (hasAnswers) document.getElementById('info').classList.add('has-media');
      if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) {
        el.innerHTML = `<img src="${url}" onerror="this.style.display='none'">`;
        el.style.display = 'block';
      } else if (['mp4','webm','mov'].includes(ext)) {
        el.innerHTML = `<video controls autoplay src="${url}" onerror="this.style.display='none'"></video>`;
        el.style.display = 'block';
      } else if (['mp3','wav','ogg','m4a'].includes(ext)) {
        el.innerHTML = `<audio controls autoplay src="${url}" style="width:80%"></audio>`;
        el.style.display = 'block';
      } else if (ext === 'pdf') {
        el.innerHTML = `<a href="${url}" target="_blank"
          style="color:#EDD400;font-family:'AV';font-size:24px;text-decoration:none">
          &#128196; Ouvrir le PDF</a>`;
        el.style.display = 'block';
      }
    }
  }

  // Pour type I : fallback si l'image ne charge pas
  if (s.type === 'I') {
    const imgEl = document.getElementById('img');
    imgEl.onerror = () => {
      console.error('[BurgerQuiz] Image introuvable :', imgEl.src);
      imgEl.style.opacity = '0.2';
      imgEl.src = '';
    };
    imgEl.onload = () => { imgEl.style.opacity = '1'; };
  }

  // Pour type V : log si la vidéo échoue
  if (s.type === 'V') {
    const vid = document.getElementById('generique');
    vid.onerror = () => console.error('[BurgerQuiz] Video introuvable :', vid.src);
  }

  refreshScores();
}

/* ─── Navigation ────────────────────────────────────────────────────── */
function navigate(delta) {
  const n = state.idx + delta;
  if (n >= 0 && n < slides.length) {
    state.idx = n;
    saveState();
    showSlide();
  }
}

function reset() {
  if (!confirm('Reinitialiser completement ?')) return;
  arreterParticules();
  cacherBanniereVictoire();
  stopVictoryMusic();
  stopBDMMusic();
  document.getElementById('screen').classList.remove('bdm-mode');
  state.mayo = 0; state.ketchup = 0; state.idx = 0;
  saveState();
  refreshScores();
  showSlide();
}

/* ─── Clavier ───────────────────────────────────────────────────────── */
document.body.addEventListener('keyup', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.keyCode;

  // Mode questions de menu
  if (menuActiveItem !== null) {
    if      (k === 39) menuQNext();
    else if (k === 37) menuQPrev();
    else if (k === 32) { e.preventDefault(); menuQReveal(); }
    else if (k === 48) menuQHideAnswer();
    else if (k === 27) exitMenuQ();
    else if (k === 77) score('mayo',    +1);
    else if (k === 76) score('mayo',    -1);
    else if (k === 75) score('ketchup', +1);
    else if (k === 74) score('ketchup', -1);
    return;
  }

  // Mode hub de menu
  if (menuHubActive) {
    if      (k === 49) enterMenu(0);
    else if (k === 50) enterMenu(1);
    else if (k === 51) enterMenu(2);
    else if (k === 39) { menuHubActive = false; document.getElementById('screen').classList.remove('menu-mode'); navigate(+1); }
    else if (k === 37) { menuHubActive = false; document.getElementById('screen').classList.remove('menu-mode'); navigate(-1); }
    else if (k === 77) score('mayo',    +1);
    else if (k === 76) score('mayo',    -1);
    else if (k === 75) score('ketchup', +1);
    else if (k === 74) score('ketchup', -1);
    return;
  }

  // Écran de fin (goodbye)
  if (goodbyeActive) { exitGoodbye(); return; }

  // Mode générique de fin / retour au calme
  if (generiqueActive) {
    const rc = document.getElementById('bdm-retour-calme');
    if (k === 39 || k === 32) {
      if (rc.style.display !== 'flex') showRetourAuCalme();
      else exitBDMGenerique();
    } else if (k === 27 || k === 69) exitBDMGenerique();
    return;
  }

  // Mode BDM actif : navigation dans les questions / récap
  if (inBDMMode) {
    if (bdmRecapActive) {
      if      (k === 37) bdmRecapBack();                            // ← retour aux questions
      else if (k === 69 || k === 27) exitBDM();                    // E ou ESC
      else if (k === 77) score('mayo',    +1);
      else if (k === 76) score('mayo',    -1);
      else if (k === 75) score('ketchup', +1);
      else if (k === 74) score('ketchup', -1);
    } else {
      if      (k === 39) bdmNext();                                 // →
      else if (k === 37) bdmPrev();                                 // ←
      else if (k === 69 || k === 27) exitBDM();                    // E ou ESC
      else if (k === 77) score('mayo',    +1);
      else if (k === 76) score('mayo',    -1);
      else if (k === 75) score('ketchup', +1);
      else if (k === 74) score('ketchup', -1);
    }
    return;
  }

  // Navigation normale
  switch (k) {
    case 82: reset(); break;                                          // R
    case 77: score('mayo',    +1); break;                            // M
    case 76: score('mayo',    -1); break;                            // L
    case 75: score('ketchup', +1); break;                            // K
    case 74: score('ketchup', -1); break;                            // J
    case 39: if (bdmReady) { bdmReady = false; enterBDMOverlay(); } else navigate(+1); break; // →
    case 37: navigate(-1); break;                                    // ←
    case 80: {                                                        // P
      const v = document.getElementById('generique');
      v.currentTime = 0; v.play().catch(() => {});
      break;
    }
    case 65: window.open('admin.html'); break;                       // A
    case 87: if (confirm('Retourner a l\'accueil ?')) window.location.href = 'index.html'; break; // W
    // Réponses : 1/2/3/4 = sélectionner, ESPACE = révéler, 0 = effacer
    case 49: selectTeamAnswer(1); break;                             // 1
    case 50: selectTeamAnswer(2); break;                             // 2
    case 51: selectTeamAnswer(3); break;                             // 3
    case 52: selectTeamAnswer(4); break;                             // 4
    case 32: {                                                       // ESPACE
      const cs = slides[state.idx];
      if (cs?.type === 'T') {
        tossReveal(cs);
      } else if (cs?.type === 'C' && candPhase < 2) {
        candPhase = 2;
        renderCandidatPhase(cs, 2);
      } else {
        revealAnswer();
      }
      break;
    }
    case 48: // 0
      clearAnswerHighlight();
      if (answerState?.type === 'S') document.getElementById('reponse').style.display = 'none';
      if (answerState) { answerState.revealed = false; answerState.selected = null; }
      break;
  }
});

init();
