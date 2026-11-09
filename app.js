(() => {
  'use strict';
  const F = window.FretNotes;
  const KEY = 'fret-notes-v1';
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const icons = {
    practice: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z"/><path d="M9 3v16m6-14v16"/>',
    chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
    guitar: '<path d="m14 10 6-6m-2-2 4 4m-8 4c-3-3-5-2-5 0 0 1-1 2-2 2-5 0-6 6-2 9s9-1 7-5c-1-1 0-2 1-2 2 0 3-2 1-4Z"/><circle cx="8" cy="16" r="1.5"/>',
    sound: '<path d="m11 4-5 4H3v8h3l5 4V4Z"/><path d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/>',
    mute: '<path d="m11 4-5 4H3v8h3l5 4V4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
    flame: '<path d="M13 2c1 6-3 6-3 10-2-1-3-2-3-4-3 3-4 6-2 10 3 6 13 5 15-1 2-5-2-10-7-15Z"/><path d="M12 14c-4 5 2 8 4 4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    note: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
    repeat: '<path d="M20 7H7l3-3M4 17h13l-3 3M20 7v5M4 17v-5"/>',
    bulb: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/>'
  };
  function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.note}</svg>`; }
  function hydrateIcons(root = document) { $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  let state, storageOK = true;
  try { state = F.loadState(localStorage.getItem(KEY)); } catch { state = F.blankState(); storageOK = false; }
  let { session, study } = F.restoreActivity(state.activity);
  if (state.activity) { state.mode = state.activity.mode; state.lesson = state.activity.lesson; }
  let view = 'practice', mapNote = '', mapSelected = null, toastTimer;
  const player = window.FretAudio.createPlayer(window, F.solfege, toast);
  const content = $('#exercise-content');
  function save() {
    state.activity = F.snapshotActivity(session, study, state.mode, state.lesson);
    const previousTime = state.savedAt;
    state.savedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; }
    catch { storageOK = false; state.savedAt = previousTime; }
    $('#storage-warning').classList.toggle('hidden', storageOK);
    const status = $('#save-status');
    status.textContent = storageOK ? '✓ 已自动保存到此浏览器' : '暂未保存，请导出备份';
    status.title = storageOK ? `上次保存：${new Date(state.savedAt).toLocaleString()}。关闭后可继续学习；其他设备需恢复备份。` : '浏览器未允许保存，建议在「我的进度」导出备份。';
    status.classList.toggle('save-failed', !storageOK);
  }
  function confirmNewActivity() {
    return (!session && !study) || confirm('开始新一轮会替换尚未完成的练习，已完成的答题记录仍会保留。确定开始吗？');
  }
  function resumeActivity() {
    switchView('practice');
    if (session) renderQuestion(); else if (study) renderStudy(); else renderIntro();
  }
  function toast(message) {
    clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.remove('hidden');
    toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4200);
  }
  function lesson() { return F.LESSONS.find(l => l.id === state.lesson) || F.LESSONS[0]; }
  function play(c, force = false) {
    if (!state.sound && !force) return;
    player.play(c, state, force);
  }
  function range(c) { return c.fret <= 5 ? [0, 5] : [6, 12]; }
  function pos(c) { return `第 ${c.string} 弦 · ${c.fret === 0 ? '空弦' : `${c.fret} 品`}`; }
  function board(options = {}) {
    const { target, reveal = false, wrong, preview = false, map = false, filter = '' } = options;
    let html = '<div class="board-wrap"><div class="fretboard"><div class="fret-numbers"><span>弦</span>';
    for (let f = 0; f <= 12; f++) html += `<span class="${[0, 3, 5, 7, 9, 12].includes(f) ? 'marked' : ''}">${f === 0 ? '空弦' : f}</span>`;
    html += '</div>';
    for (let s = 1; s <= 6; s++) {
      html += `<div class="string-row ${target && target.string === s ? 'target-string' : ''}" style="--weight:${.6 + s * .22}px"><span class="string-label"><b>${s}</b>${F.card(s, 0).note}</span>`;
      for (let f = 0; f <= 12; f++) {
        const c = F.card(s, f), isTarget = target && target.id === c.id;
        let cls = 'fret-cell', label = '', disabled = '', extra = '', syllable = '';
        if (preview) {
          disabled = 'disabled';
          if (lesson().cards.some(x => x.id === c.id)) { cls += ' known-dot'; label = c.note; }
        } else if (map) {
          cls += ' map-cell';
          if (!F.NATURAL.has(c.note)) cls += ' accidental';
          if (filter && filter !== c.note) { cls += ' out-of-range'; extra = 'style="opacity:.25"'; }
          if (state.cards[c.id]?.box >= 3) cls += ' map-mastered';
          if (mapSelected?.id === c.id) cls += ' map-selected';
          label = c.note;
          syllable = `<small class="cell-solfege">${F.solfege(c.note).label.split(' / ')[0].replace(/ /g, '')}</small>`;
        } else {
          if (target && session && state.mode === 'find') {
            const [lo, hi] = range(target);
            if (s !== target.string || f < lo || f > hi) cls += ' out-of-range';
          }
          if (isTarget && (state.mode === 'name' || study)) { cls += ' focus-dot'; label = reveal ? c.note : '?'; }
          if (isTarget && reveal) { cls += ' answer-dot'; label = c.note; }
          if (wrong === c.id) { cls += ' wrong-dot'; label = c.note; }
          if (study || session?.answered || state.mode === 'name') disabled = 'disabled';
        }
        const aria = `${s} 弦 ${f === 0 ? '空弦' : `${f} 品`}${map ? `，${F.displayNote(c.note)}，${c.note}${c.octave}，${F.solfege(c.note).label}，点击播放` : preview ? `，${F.displayNote(c.note)}` : ''}`;
        html += `<button class="${cls}" data-string="${s}" data-fret="${f}" aria-label="${aria}" ${disabled} ${extra} ${map ? `aria-pressed="${mapSelected?.id === c.id}"` : ''}><span class="note-dot">${label}</span>${syllable}</button>`;
      }
      html += '</div>';
    }
    html += '<div class="fret-markers"><span></span>';
    for (let f = 0; f <= 12; f++) html += `<span>${[3, 5, 7, 9].includes(f) ? '•' : f === 12 ? '••' : ''}</span>`;
    return html + '</div></div></div><div class="board-legend"><span><i class="legend-dot"></i>上方 1 弦最细，下方 6 弦最粗</span><span>0 = 空弦 · 可左右滑动</span></div>';
  }
  function updateStats() {
    const s = F.stats(state), l = lesson();
    $('#streak-count').innerHTML = `${s.streak} <small>天</small>`;
    $('#daily-fill').style.width = `${Math.min(100, s.today * 10)}%`;
    $('#daily-count').textContent = `${Math.min(10, s.today)} / 10`;
    $('#daily-status').textContent = s.today >= 10 ? '今日目标已完成 ✓' : '慢慢来，也很快';
    $('#stat-learned').innerHTML = `${s.learned} <small>/ 78 个位置</small>`;
    $('#stat-mastered').innerHTML = `${s.mastered} <small>个位置</small>`;
    $('#stat-accuracy').textContent = s.attempts ? `${s.accuracy}%` : '—';
    $('#lesson-title').textContent = l.title;
    $('#lesson-description').textContent = l.subtitle;
    $('.rail-label>span').textContent = `${String(F.LESSONS.indexOf(l) + 1).padStart(2, '0')} / 06`;
    $('.lesson-art>span').textContent = l.id === 'six' ? '6' : l.id === 'five' ? '5' : '♫';
    $('#lesson-note-count').textContent = `${l.cards.length} 个位置`;
    const learned = l.cards.filter(c => state.cards[c.id]).length;
    $('#lesson-learned').textContent = `已认识 ${learned} 个`;
    $('#lesson-fill').style.width = `${learned / l.cards.length * 100}%`;
    $('#review-copy').textContent = s.due ? `${s.due} 个位置到期了，回忆一下吧。` : '暂时没有到期的音，继续探索吧。';
    $('#review-button').disabled = !s.due;
    $('#sound-button').setAttribute('aria-pressed', String(state.sound));
    $('#sound-button').setAttribute('aria-label', state.sound ? '关闭声音' : '开启声音');
    $('#solfege-button').setAttribute('aria-pressed', String(state.solfege));
    $('#solfege-button').textContent = `唱名：${state.solfege ? '开' : '关'}`;
    $('#sound-button').innerHTML = icon(state.sound ? 'sound' : 'mute');
    const mapSound = $('#map-sound-toggle');
    if (mapSound) {
      mapSound.textContent = state.sound ? '点击发声：开' : '点击发声：关';
      mapSound.setAttribute('aria-pressed', String(state.sound));
    }
  }
  function modeUI() {
    $$('.mode-tab').forEach(b => { b.classList.toggle('active', b.dataset.mode === state.mode); b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
  }
  function renderIntro() {
    player.stop(); modeUI();
    $('#exercise-heading').textContent = '今日练习';
    $('#session-step').textContent = '约 3–5 分钟 / 每轮 10 题';
    const unique = [...new Set(lesson().cards.map(c => c.note))].slice(0, 7);
    const resume = session || study;
    const resumeText = session ? `上次练到第 ${session.index + 1} / ${session.queue.length} 题${session.answered ? '，答案已记录' : ''}` : study ? `上次看到第 ${study.index + 1} / ${study.cards.length} 张认识卡` : '';
    content.innerHTML = `${resume ? `<div class="resume-banner"><div><strong>欢迎回来，接着上次学。</strong><p>${resumeText} · ${lesson().title}</p></div><button id="resume-button" class="primary-button">继续学习 →</button></div>` : ''}<div class="intro-prompt"><div class="mini-label">SMALL STEPS. REAL PROGRESS.</div><h2 class="intro-title">今天，和几个音熟悉一下。</h2><p class="intro-description">${state.mode === 'find' ? '看到音名，在指定的弦上找到它的位置。' : '看到指板上的位置，试着说出它的音名。'}<br>一次记一点，每次都更确定一点。</p><div class="preview-notes">${unique.map(n => `<span>${n}</span>`).join('')}</div><div class="start-row"><button id="start-button" class="primary-button">${resume ? '开始新一轮' : '开始今日练习'}<span class="arrow">→</span></button><small>新手可以先点右侧「先认一遍」</small></div></div><div class="intro-board">${board({ preview: true })}</div><div class="exercise-bottom"><span class="subtle-hint">${icon('bulb')}小提示：不用背整块指板，从路标开始。</span><span class="keyboard-tip">一次最多 5 个新位置</span></div>`;
    $('#resume-button')?.addEventListener('click', resumeActivity);
    $('#start-button').addEventListener('click', () => { if (confirmNewActivity()) startSession(false); });
  }
  function startSession(reviewOnly = false, focusCards = null) {
    const queue = F.makeQueue(state, state.lesson, Date.now(), Math.random, reviewOnly, focusCards);
    if (!queue.length) { toast('暂时没有到期的位置，可以先做今日练习。'); return; }
    study = null;
    session = { queue, index: 0, correct: 0, answered: false, wrongIds: new Set(), retried: new Set(), originalLength: queue.length, started: Date.now(), reviewOnly };
    save(); switchView('practice', false); renderQuestion();
  }
  function renderQuestion() {
    player.stop();
    if (!session) return renderIntro();
    const c = session.queue[session.index];
    if (!c) return renderResult();
    modeUI();
    $('#exercise-heading').textContent = session.reviewOnly ? '到期复习' : '回忆练习';
    $('#session-step').textContent = `${session.index + 1} / ${session.queue.length}${session.queue.length > session.originalLength ? ' · 含错题加练' : ''}`;
    const [lo, hi] = range(c);
    const nameMode = state.mode === 'name';
    content.innerHTML = `<div class="session-progress"><i style="width:${session.index / session.queue.length * 100}%"></i></div><div class="question-area"><p class="question-kicker">${nameMode ? '看看标记的位置，它是什么音？' : '找到这个音，轻轻点一下。'}</p>${nameMode ? '<h2 class="note-title">这个位置，叫什么？</h2>' : `<div class="note-display">${c.note}${F.displayNote(c.note).includes('/') ? `<small>/ ${F.displayNote(c.note).split(' / ')[1]}</small>` : ''}</div>`}<p class="question-prompt"><span class="range-chip">${nameMode ? pos(c) : `第 ${c.string} 弦 · ${lo}–${hi} 品`}</span>${nameMode ? '从下方选择音名' : c.string === 6 ? '最粗的那根弦' : c.string === 1 ? '最细的那根弦' : '从细到粗数弦号'}</p></div><div id="question-board">${board({ target: c })}</div>${nameMode ? `<div class="answer-options">${F.NOTES.map(n => `<button class="answer-option" data-answer="${n}" aria-label="${F.displayNote(n)}">${n}${F.displayNote(n).includes('/') ? `<small>${F.displayNote(n).split(' / ')[1]}</small>` : ''}</button>`).join('')}</div>` : ''}<div id="hint-slot"></div><div class="exercise-bottom"><button id="hint-button" class="text-button">给我一个提示</button><span id="answer-instruction" class="subtle-hint">${nameMode ? '先想一想，再选择。' : '点击指板上的位置作答。'}</span><button id="next-button" class="primary-button hidden">下一题<span class="arrow">→</span></button></div>`;
    if (nameMode) $$('.answer-option', content).forEach(b => b.addEventListener('click', () => answer(b.dataset.answer === c.note, null, b.dataset.answer)));
    else $$('.fret-cell', content).forEach(b => b.addEventListener('click', () => {
      const picked = F.card(Number(b.dataset.string), Number(b.dataset.fret));
      answer(picked.id === c.id, picked.id, null);
    }));
    $('#hint-button').addEventListener('click', showHint);
    $('#next-button').addEventListener('click', nextQuestion);
    if (session.answered) paintAnswer(session.answer);
    if (nameMode || lo === 6) scrollBoard(c);
  }
  function scrollBoard(c) {
    const wrap = $('.board-wrap', content), cell = $(`[data-string="${c.string}"][data-fret="${c.fret}"]`, content);
    if (wrap && cell && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, cell.offsetLeft - wrap.clientWidth / 2);
  }
  function showHint() {
    if (!session || session.answered) return;
    const c = session.queue[session.index], open = F.card(c.string, 0);
    $('#hint-slot').innerHTML = `<div class="hint-box">这根弦的空弦音是 ${open.note}。每往琴身方向移动一品，升高半音；B–C、E–F 相邻一品。${c.fret === 12 ? '12 品和空弦音名相同，高一个八度。' : c.fret === 0 ? '0 品就是不按任何品位的空弦。' : ''}</div>`;
    $('#hint-button').disabled = true;
  }
  function answer(correct, wrongId, chosenNote) {
    if (!session || session.answered) return;
    session.answered = true;
    const c = session.queue[session.index];
    F.grade(state, c.id, correct);
    if (correct) session.correct++;
    else {
      session.wrongIds.add(c.id);
      if (!session.retried.has(c.id)) {
        session.retried.add(c.id);
        session.queue.splice(Math.min(session.index + 3, session.queue.length), 0, c);
      }
    }
    session.answer = { correct, wrongId, chosenNote };
    save(); updateStats(); paintAnswer(session.answer); play(c);
  }
  function paintAnswer({ correct, wrongId, chosenNote }) {
    const c = session.queue[session.index];
    $('#question-board').innerHTML = board({ target: c, reveal: true, wrong: correct ? null : wrongId });
    $$('.answer-option', content).forEach(b => {
      b.disabled = true;
      if (b.dataset.answer === c.note) b.classList.add('answer-correct');
      else if (b.dataset.answer === chosenNote) b.classList.add('answer-wrong');
    });
    $('#hint-button').classList.add('hidden');
    const info = $('#answer-instruction'); info.className = `feedback ${correct ? 'good' : 'bad'}`; info.setAttribute('role', 'status');
    info.innerHTML = `<strong>${correct ? '找对了，记忆又清楚了一点。' : '没关系，再认识它一次。'}</strong>${pos(c)} = ${F.displayNote(c.note)} · ${F.solfege(c.note).label}${!correct ? ' · 稍后再来一次' : ''}`;
    $('#next-button').classList.remove('hidden');
    $('#next-button').innerHTML = `${session.index === session.queue.length - 1 ? '看看成果' : '下一题'}<span class="arrow">→</span>`;
    $('#session-step').textContent = `${session.index + 1} / ${session.queue.length}${session.queue.length > session.originalLength ? ' · 含错题加练' : ''}`;
    scrollBoard(c);
  }
  function nextQuestion() {
    if (!session || !session.answered) return;
    session.index++; session.answered = false; session.answer = null;
    if (session.index >= session.queue.length) renderResult(); else { save(); renderQuestion(); }
  }
  function renderResult() {
    if (!session) return;
    const result = session;
    session = null; state.sessions++; save(); updateStats();
    $('#exercise-heading').textContent = '练习完成'; $('#session-step').textContent = '每一次回忆，都在积累';
    const acc = Math.round(result.correct / result.queue.length * 100);
    const seconds = Math.max(1, Math.round((Date.now() - result.started) / 1000));
    content.innerHTML = `<div class="result-area"><div class="result-icon">✦</div><div class="eyebrow" style="justify-content:center">A LITTLE BETTER THAN BEFORE</div><h2>今天，又熟悉了一点。</h2><p>${acc >= 80 ? '做得不错。让时间帮你把这些位置记得更牢。' : '不用急，容易混的音，值得多见几次。'}<br>下次到期时，它们会出现在复习里。</p><div class="result-stats"><div><strong>${result.queue.length}</strong><span>完成题数</span></div><div><strong>${acc}%</strong><span>本轮正确率</span></div><div><strong>${seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`}</strong><span>练习用时</span></div></div><div class="result-actions"><button id="again-button" class="primary-button">再练一轮<span class="arrow">→</span></button><button id="result-map-button" class="secondary-button">看看指板地图</button></div>${result.wrongIds.size ? `<div class="mistake-summary">这些位置还可以多见几次：<br>${[...result.wrongIds].map(id => { const c = F.ALL.find(x => x.id === id); return `${pos(c)} ${c.note}`; }).join('　/　')}</div>` : '<div class="mistake-summary">本轮全对！过一阵子再回忆，比现在一直重复更有助于检查记忆。</div>'}</div><div class="exercise-bottom"><span class="subtle-hint">${icon('repeat')}按时复习，才能提升长期记忆等级。</span><button id="back-intro" class="text-button">回到练习首页</button></div>`;
    $('#again-button').addEventListener('click', () => startSession(false));
    $('#result-map-button').addEventListener('click', () => switchView('map'));
    $('#back-intro').addEventListener('click', renderIntro);
  }
  function startStudy() {
    session = null;
    const cards = lesson().cards;
    const fresh = cards.filter(c => !state.cards[c.id]);
    study = { cards: (fresh.length ? fresh : cards).slice(0, 5), index: 0, revealed: false };
    save(); switchView('practice', false); renderStudy();
  }
  function renderStudy() {
    player.stop();
    if (!study) return;
    save();
    const c = study.cards[study.index];
    $('#exercise-heading').textContent = '先认识，再回忆'; $('#session-step').textContent = `${study.index + 1} / ${study.cards.length} 张认识卡`;
    content.innerHTML = `<div class="question-area"><span class="study-tag">认识卡 · ${pos(c)}</span><p class="question-kicker">${study.revealed ? '把音名、位置和声音连在一起。' : '先看看位置，再翻开答案。'}</p>${study.revealed ? `<div class="note-display">${c.note}</div><p class="study-hint">${F.displayNote(c.note)} · <strong class="solfege-label">${F.solfege(c.note).label}</strong> · ${c.octave} 组<br>${c.fret === 0 ? '空弦：不用按品，直接拨响这根弦。' : c.fret === 12 ? '12 品与同弦空弦音名相同，高一个八度。' : `从空弦 ${F.card(c.string, 0).note} 出发，向琴身方向移动 ${c.fret} 品。`}</p>` : '<div class="study-placeholder">?</div><p class="study-hint">试着猜一猜，不会也没有关系。</p>'}</div>${board({ target: c, reveal: study.revealed })}<div class="exercise-bottom"><button id="study-exit" class="text-button">回到练习</button>${study.revealed ? `<button id="play-study" class="sound-inline">${icon('sound')}听音与唱名</button><button id="study-next" class="primary-button">${study.index + 1 === study.cards.length ? '开始回忆' : '下一个位置'}<span class="arrow">→</span></button>` : '<button id="study-flip" class="primary-button">翻开音名<span class="arrow">↗</span></button>'}</div>`;
    $('#study-exit').addEventListener('click', renderIntro);
    if (study.revealed) {
      $('#play-study').addEventListener('click', () => play(c, true));
      $('#study-next').addEventListener('click', () => {
        study.index++;
        if (study.index >= study.cards.length) { const studied = study.cards; study = null; startSession(false, studied); }
        else { study.revealed = false; renderStudy(); }
      });
    } else $('#study-flip').addEventListener('click', () => { study.revealed = true; renderStudy(); play(c); });
    scrollBoard(c);
  }
  function switchView(next, updateHash = true) {
    player.stop();
    view = ['practice', 'map', 'progress'].includes(next) ? next : 'practice';
    $$('.page-view').forEach(el => el.classList.toggle('hidden', el.id !== `${view}-view`));
    $$('.nav-item').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const texts = {
      practice: ['今日练习', '让每个音，都有位置', '像记单词一样记指板。每天 5 分钟，从陌生到熟悉。'],
      map: ['指板地图', '给指尖，一张地图', '看见音与音的联系，把零散的位置慢慢串起来。'],
      progress: ['我的进度', '每一小步，都算数', '记忆需要时间。看看那些正在变熟悉的位置。']
    };
    $('#page-label').textContent = texts[view][0];
    $('#page-title').innerHTML = `${texts[view][1]}<span>。</span>`;
    $('#page-subtitle').textContent = texts[view][2];
    if (view === 'map') renderMap(); if (view === 'progress') renderProgress();
    if (updateHash && location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    updateStats();
  }
  function renderMap() {
    const root = $('#map-view');
    const previousScroll = $('.board-wrap', root)?.scrollLeft || 0;
    root.innerHTML = `<section class="map-card"><div class="map-header"><div><h2>标准调弦 · 0–12 品</h2><p>全部 78 个位置均可点击听音；上方是音名，下方是固定唱名。</p></div><div class="map-controls"><button id="map-sound-toggle" class="secondary-button" aria-pressed="${state.sound}">${state.sound ? '点击发声：开' : '点击发声：关'}</button><select id="note-filter" aria-label="筛选音名"><option value="">显示全部音</option>${F.NOTES.map(n => `<option value="${n}" ${mapNote === n ? 'selected' : ''}>${F.displayNote(n)}</option>`).join('')}</select></div></div>${board({ map: true, filter: mapNote })}<div class="map-detail" id="map-detail">${mapDetail()}</div></section><div class="map-info-grid"><div class="info-tile"><h3>01 / 一品，一个半音</h3><p>向琴身方向移动一品，升高半音。B–C、E–F 之间只差一品，其余相邻自然音之间差两品。</p></div><div class="info-tile"><h3>02 / 12 品，重新出发</h3><p>12 品的音名与空弦相同，高一个八度。后面的音名依次重复；1 弦与 6 弦同品也同名。</p></div><div class="info-tile"><h3>03 / 同音，不只一处</h3><p>同一个音名能出现在多个位置。先记弦和品，再找重复的音，慢慢连接整块指板。</p></div></div>`;
    $('.board-wrap', root).scrollLeft = previousScroll;
    $('#map-sound-toggle').addEventListener('click', () => $('#sound-button').click());
    $('#note-filter').addEventListener('change', e => { mapNote = e.target.value; renderMap(); });
    $$('.fret-cell', root).forEach(b => b.addEventListener('click', () => {
      mapSelected = F.card(Number(b.dataset.string), Number(b.dataset.fret));
      play(mapSelected); renderMap();
      if (!state.sound) toast('当前声音已关闭，点击地图上方「点击发声：关」即可开启。');
      const selected = $('.map-selected', root); if (selected) selected.focus({ preventScroll: true });
    }));
  }
  function mapDetail() {
    if (!mapSelected) return '<strong>♫</strong><p>每个格子都有对应的音，点击任意位置试听。<small>自然音对应 do、re、mi、fa、sol、la、si；升降音会标出变化。</small></p>';
    const c = mapSelected, p = state.cards[c.id];
    return `<strong>${F.displayNote(c.note)}</strong><p>${pos(c)} · ${c.note}${c.octave} · <strong class="solfege-label">${F.solfege(c.note).label}</strong><small>${p ? `已答对 ${p.correct} 次 · ${p.box >= 3 ? '已进入长期记忆' : '正在积累记忆'}` : '还没练过这个位置，可以在对应单元中认识它。'} · 参考音约 ${Math.round(440 * 2 ** ((c.midi - 69) / 12))} Hz</small></p><button id="map-listen" class="sound-inline" aria-label="播放音高与唱名">${icon('sound')}试听</button>`;
  }
  function renderProgress() {
    const s = F.stats(state), root = $('#progress-view');
    let heat = '<span class="heatmap-label">弦 / 品</span>';
    for (let f = 0; f <= 12; f++) heat += `<span class="heatmap-label">${f}</span>`;
    for (let st = 1; st <= 6; st++) {
      heat += `<span class="heatmap-label">${st} 弦</span>`;
      for (let f = 0; f <= 12; f++) {
        const c = F.card(st, f), p = state.cards[c.id], level = !p ? 0 : p.box >= 3 ? 3 : p.box >= 2 ? 2 : 1;
        heat += `<div class="heatmap-cell level${level}" title="${pos(c)} ${c.note} · ${p ? `答对 ${p.correct} 次，答错 ${p.wrong} 次` : '还未练习'}">${c.note}</div>`;
      }
    }
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, n: state.days[F.localDay(d)] || 0 }); }
    const max = Math.max(10, ...days.map(d => d.n));
    root.innerHTML = `<div class="progress-summary"><div><span>累计练习</span><strong>${s.attempts}<small style="font-size:11px;color:#a2ac9b"> 次</small></strong></div><div><span>完成轮次</span><strong>${state.sessions}</strong></div><div><span>累计正确率</span><strong>${s.attempts ? `${s.accuracy}%` : '—'}</strong></div></div><section class="progress-card"><div class="progress-header"><div><h2>你的指板，正在亮起来。</h2><p>已认识 ${s.learned} / 78 个位置 · ${s.mastered} 个已通过至少三轮间隔复习</p></div><button id="progress-practice" class="secondary-button">继续练习 ↗</button></div><div style="overflow:auto"><div class="heatmap-grid">${heat}</div></div><div class="heatmap-legend">未练过<i></i><i></i><i></i><i></i>长期记忆</div>${!s.attempts ? '<div class="empty-progress">从第一个音开始，这张地图就会慢慢有颜色。</div>' : ''}</section><section class="progress-card"><div class="progress-header"><div><h2>最近 7 天</h2><p>每次回忆都算一次练习，包括错题加练。</p></div></div><div class="history-row">${days.map(d => `<div class="history-day"><strong>${d.n} 次</strong><div class="history-bar" style="height:${Math.max(3, d.n / max * 85)}px"></div><span>${d.label}</span></div>`).join('')}</div></section><section class="progress-card"><div class="progress-header"><div><h2>把进步好好留住</h2><p>每次答题、翻卡都会自动保存到此浏览器。关闭网页后可继续；跨设备使用请导出并恢复备份。</p></div></div><div class="data-actions"><button id="export-button" class="secondary-button">导出学习记录 ↗</button><button id="import-button" class="secondary-button">恢复备份</button><input id="import-file" class="import-input" type="file" accept=".json,application/json" aria-label="选择学习记录备份"><button id="reset-button" class="text-button">清空本机记录</button></div></section>`;
    $('#progress-practice').addEventListener('click', resumeActivity);
    $('#export-button').addEventListener('click', exportData);
    $('#import-button').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importData);
    $('#reset-button').addEventListener('click', () => {
      if (!confirm('确定清空当前浏览器里的全部学习记录吗？建议先导出备份。')) return;
      state = F.blankState(); session = null; study = null; save(); updateStats(); renderIntro(); renderProgress(); toast('本机记录已清空，可以重新开始。');
    });
  }
  function exportData() {
    save();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `弦记-学习记录-${F.localDay()}.json`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('学习记录已导出，请妥善保存。');
  }
  async function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 1000000) { toast('备份文件过大，请选择弦记导出的 JSON 文件。'); return; }
    try {
      const raw = await file.text(), x = JSON.parse(raw);
      if (x?.version !== 1 || !x.cards || !x.days || Array.isArray(x.cards) || Array.isArray(x.days)) throw new Error('Invalid backup');
      const restored = F.loadState(raw);
      if (Object.keys(x.cards).length && !Object.keys(restored.cards).length) throw new Error('Invalid card data');
      if (!confirm('恢复备份将替换本机现有学习记录，确定继续吗？')) return;
      state = restored; ({ session, study } = F.restoreActivity(state.activity));
      if (state.activity) { state.mode = state.activity.mode; state.lesson = state.activity.lesson; }
      save(); updateStats(); renderIntro(); renderProgress(); toast('备份已恢复，接着练吧。');
    } catch { toast('无法读取这个备份，请选择弦记导出的完整 JSON 文件。'); }
  }
  function showLessons() {
    $('#lesson-list').innerHTML = F.LESSONS.map((l, i) => `<button class="lesson-choice ${state.lesson === l.id ? 'selected' : ''}" data-lesson="${l.id}"><span>${String(i + 1).padStart(2, '0')}</span><span><strong>${l.title}</strong><small>${l.subtitle} · ${l.cards.length} 个位置</small></span><span class="lesson-tag">${l.tag}</span></button>`).join('');
    $$('.lesson-choice').forEach(b => b.addEventListener('click', () => {
      if (state.lesson === b.dataset.lesson) { $('#lesson-dialog').close(); return; }
      if (!confirmNewActivity()) return;
      session = null; study = null; state.lesson = b.dataset.lesson; save(); updateStats(); renderIntro(); $('#lesson-dialog').close(); toast(`已切换到「${lesson().title}」`);
    }));
    $('#lesson-dialog').showModal();
  }
  $$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('.brand').addEventListener('click', e => { e.preventDefault(); switchView('practice'); });
  $$('.mode-tab').forEach(b => b.addEventListener('click', () => {
    if (state.mode === b.dataset.mode) return;
    if (!confirmNewActivity()) return;
    session = null; study = null; state.mode = b.dataset.mode; save(); renderIntro();
  }));
  $('#lesson-button').addEventListener('click', showLessons);
  $('#study-button').addEventListener('click', () => { if (confirmNewActivity()) startStudy(); });
  $('#review-button').addEventListener('click', () => { if (confirmNewActivity()) startSession(true); });
  $('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
  $('#sound-button').addEventListener('click', () => { state.sound = !state.sound; save(); updateStats(); if (!state.sound) player.stop();
    else if (view === 'practice' && ((session && !session.answered) || (study && !study.revealed))) toast('声音已开启，将在翻卡或作答后播放。');
    else play(study?.revealed ? study.cards[study.index] : session?.answered ? session.queue[session.index] : mapSelected || F.card(5, 3)); });
  $('#solfege-button').addEventListener('click', () => {
    state.solfege = !state.solfege;
    if (state.solfege) state.sound = true;
    else player.stop();
    save(); updateStats();
    if (state.solfege) {
      const current = study?.revealed ? study.cards[study.index] : session?.answered ? session.queue[session.index] : !session && !study ? mapSelected || F.card(5, 3) : null;
      if (current) play(current);
      else toast('唱名已开启，将在翻卡或作答后播放。');
    }
  });
  $$('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));
  document.addEventListener('click', e => { if (e.target.closest('#map-listen') && mapSelected) play(mapSelected, true); });
  document.addEventListener('keydown', e => {
    if ($('dialog[open]') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (view === 'practice' && e.key === 'Enter' && session?.answered && !e.target.closest('button')) { e.preventDefault(); nextQuestion(); }
    if (e.target.matches('.fret-cell') && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const s = Number(e.target.dataset.string), f = Number(e.target.dataset.fret);
      const ns = Math.min(6, Math.max(1, s + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0)));
      const nf = Math.min(12, Math.max(0, f + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)));
      const next = $(`#${view === 'map' ? 'map' : 'practice'}-view [data-string="${ns}"][data-fret="${nf}"]:not(:disabled)`);
      if (next) { e.preventDefault(); next.focus(); }
    }
  });
  window.addEventListener('pagehide', () => { save(); player.stop(); });
  window.addEventListener('hashchange', () => switchView(location.hash.slice(1), false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); player.stop(); } else { updateStats(); if (view === 'progress') renderProgress(); } });
  setInterval(updateStats, 30000);
  hydrateIcons(); save(); updateStats(); renderIntro(); switchView(location.hash.slice(1) || 'practice', false);
})();

