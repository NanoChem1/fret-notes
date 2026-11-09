(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FretNotes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const SOLFEGE = {
    'C': ['do', '哆', 'doh'], 'C♯': ['升 do / 降 re', '升哆，也叫降来', 'sharp doh, or flat ray'],
    'D': ['re', '来', 'ray'], 'D♯': ['升 re / 降 mi', '升来，也叫降咪', 'sharp ray, or flat me'],
    'E': ['mi', '咪', 'me'], 'F': ['fa', '发', 'fah'],
    'F♯': ['升 fa / 降 sol', '升发，也叫降嗦', 'sharp fah, or flat sol'],
    'G': ['sol', '嗦', 'sol'], 'G♯': ['升 sol / 降 la', '升嗦，也叫降拉', 'sharp sol, or flat lah'],
    'A': ['la', '拉', 'lah'], 'A♯': ['升 la / 降 si', '升拉，也叫降西', 'sharp lah, or flat see'],
    'B': ['si', '西', 'see']
  };
  function solfege(note) {
    const entry = SOLFEGE[note];
    if (!entry) throw new Error('Unknown note');
    return { label: entry[0], spoken: entry[1], english: entry[2] };
  }
  const OPEN = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
  const NATURAL = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  const INTERVALS = [0, 10 * 60000, 86400000, 3 * 86400000, 7 * 86400000, 14 * 86400000];
  const FLATS = { 'C♯': 'D♭', 'D♯': 'E♭', 'F♯': 'G♭', 'G♯': 'A♭', 'A♯': 'B♭' };
  function card(string, fret) {
    const midi = OPEN[string] + fret;
    return { id: `${string}-${fret}`, string, fret, midi, note: NOTES[midi % 12], octave: Math.floor(midi / 12) - 1 };
  }
  const ALL = [];
  for (let s = 6; s >= 1; s--) for (let f = 0; f <= 12; f++) ALL.push(card(s, f));
  function naturalCards(s) { return ALL.filter(c => c.string === s && NATURAL.has(c.note)); }
  const LESSONS = [
    { id: 'six', title: '第 6 弦 · 路标音', subtitle: '从最粗的一根弦开始', tag: '起点', cards: [0, 3, 5, 7, 12].map(f => card(6, f)) },
    { id: 'five', title: '第 5 弦 · 路标音', subtitle: '找到常用和弦的根音', tag: '基础', cards: [0, 3, 5, 7, 12].map(f => card(5, f)) },
    { id: 'bass', title: '低音弦 · 自然音', subtitle: '把路标之间的音补齐', tag: '进阶', cards: [...naturalCards(6), ...naturalCards(5)] },
    { id: 'middle', title: '第 4、3 弦 · 自然音', subtitle: '将记忆扩展到中间两根弦', tag: '进阶', cards: [...naturalCards(4), ...naturalCards(3)] },
    { id: 'treble', title: '第 2、1 弦 · 自然音', subtitle: '连接高音区的音名', tag: '进阶', cards: [...naturalCards(2), ...naturalCards(1)] },
    { id: 'all', title: '整块指板 · 全部音', subtitle: '加入升降音，挑战 0–12 品', tag: '挑战', cards: ALL }
  ];
  function localDay(time = Date.now()) {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function blankState() { return { version: 1, cards: {}, days: {}, lesson: 'six', mode: 'find', sound: true, solfege: true, sessions: 0, activity: null, savedAt: 0 }; }
  function loadState(raw) {
    try {
      const x = JSON.parse(raw);
      if (!x || x.version !== 1 || !x.cards || typeof x.cards !== 'object' || Array.isArray(x.cards)) return blankState();
      const state = blankState();
      for (const c of ALL) {
        const p = x.cards[c.id];
        if (!p || typeof p !== 'object') continue;
        if (![p.box, p.due, p.correct, p.wrong].every(Number.isFinite)) continue;
        if (p.box < 0 || p.box > 5 || p.correct < 0 || p.wrong < 0 || !Number.isInteger(p.box)) continue;
        state.cards[c.id] = { box: p.box, due: p.due, correct: p.correct, wrong: p.wrong };
      }
      if (x.days && typeof x.days === 'object') for (const [key, val] of Object.entries(x.days)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isInteger(val) && val >= 0) state.days[key] = val;
      }
      state.lesson = LESSONS.some(l => l.id === x.lesson) ? x.lesson : 'six';
      state.mode = ['find', 'name'].includes(x.mode) ? x.mode : 'find';
      state.sound = typeof x.sound === 'boolean' ? x.sound : true;
      state.solfege = x.solfege !== false;
      state.sessions = Number.isInteger(x.sessions) && x.sessions >= 0 ? x.sessions : 0;
      state.activity = normalizeActivity(x.activity);
      state.savedAt = Number.isFinite(x.savedAt) && x.savedAt > 0 ? x.savedAt : 0;
      return state;
    } catch { return blankState(); }
  }
  // Backups contain card IDs only. Rebuild trusted cards and Sets when resuming.
  function normalizeActivity(x) {
    if (!x || !['session', 'study'].includes(x.type) || !LESSONS.some(l => l.id === x.lesson) || !['find', 'name'].includes(x.mode)) return null;
    const ids = new Set(ALL.map(c => c.id));
    const list = x.type === 'session' ? x.queue : x.cards;
    const max = x.type === 'session' ? 20 : 5;
    if (!Array.isArray(list) || !list.length || list.length > max || !list.every(id => ids.has(id))) return null;
    if (!Number.isInteger(x.index) || x.index < 0 || x.index >= list.length) return null;
    const base = { type: x.type, lesson: x.lesson, mode: x.mode, index: x.index };
    if (x.type === 'study') return { ...base, cards: [...list], revealed: x.revealed === true };
    if (!Number.isInteger(x.originalLength) || x.originalLength < 1 || x.originalLength > 10 || x.originalLength > list.length || list.length > x.originalLength * 2) return null;
    if (!Number.isInteger(x.correct) || x.correct < 0 || x.correct > x.index + (x.answered === true ? 1 : 0)) return null;
    if (!Number.isFinite(x.started) || x.started <= 0) return null;
    if (!Array.isArray(x.wrongIds) || !Array.isArray(x.retried) || ![...x.wrongIds, ...x.retried].every(id => list.includes(id))) return null;
    const answered = x.answered === true;
    const a = x.answer;
    if (answered && (!a || typeof a.correct !== 'boolean' || (a.wrongId !== null && !ids.has(a.wrongId)) || (a.chosenNote !== null && !NOTES.includes(a.chosenNote)))) return null;
    return { ...base, queue: [...list], originalLength: x.originalLength, correct: x.correct,
      answered, answer: answered ? { correct: a.correct, wrongId: a.wrongId, chosenNote: a.chosenNote } : null,
      wrongIds: [...new Set(x.wrongIds)], retried: [...new Set(x.retried)], started: x.started, reviewOnly: x.reviewOnly === true };
  }
  function snapshotActivity(session, study, mode, lesson) {
    if (session) return normalizeActivity({ ...session, type: 'session', mode, lesson,
      queue: session.queue.map(c => c.id), wrongIds: [...session.wrongIds], retried: [...session.retried] });
    if (study) return normalizeActivity({ ...study, type: 'study', mode, lesson, cards: study.cards.map(c => c.id) });
    return null;
  }
  function restoreActivity(raw) {
    const x = normalizeActivity(raw);
    if (!x) return { session: null, study: null };
    const byId = id => ALL.find(c => c.id === id);
    if (x.type === 'study') return { session: null, study: { cards: x.cards.map(byId), index: x.index, revealed: x.revealed } };
    return { study: null, session: { queue: x.queue.map(byId), index: x.index, correct: x.correct,
      answered: x.answered, answer: x.answer, originalLength: x.originalLength, started: x.started,
      reviewOnly: x.reviewOnly, wrongIds: new Set(x.wrongIds), retried: new Set(x.retried) } };
  }
  function grade(state, id, correct, now = Date.now()) {
    if (!ALL.some(c => c.id === id)) throw new Error('Unknown card');
    const old = state.cards[id];
    const p = old || { box: 0, due: 0, correct: 0, wrong: 0 };
    let box = p.box;
    let due = p.due;
    if (correct) {
      // Extra practice counts toward accuracy, but cannot fast-forward spaced repetition.
      if (!old || now >= p.due) { box = Math.min(5, p.box + 1); due = now + INTERVALS[box]; }
    } else { box = 0; due = now + 60000; }
    state.cards[id] = { box, due, correct: p.correct + (correct ? 1 : 0), wrong: p.wrong + (correct ? 0 : 1) };
    const day = localDay(now);
    state.days[day] = (state.days[day] || 0) + 1;
    return state.cards[id];
  }
  function shuffle(items, rng = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function makeQueue(state, lessonId, now = Date.now(), rng = Math.random, reviewOnly = false, focusCards = null) {
    const lesson = LESSONS.find(l => l.id === lessonId) || LESSONS[0];
    const due = ALL.filter(c => state.cards[c.id] && state.cards[c.id].due <= now)
      .sort((a, b) => state.cards[a.id].due - state.cards[b.id].due);
    if (reviewOnly) return due.slice(0, 10);
    const practiceCards = focusCards && focusCards.length ? focusCards.filter(c => lesson.cards.some(x => x.id === c.id)).slice(0, 5) : lesson.cards;
    const fresh = shuffle(practiceCards.filter(c => !state.cards[c.id]), rng).slice(0, 5);
    const chosen = [...due.slice(0, 5), ...fresh];
    const seen = new Set(chosen.map(c => c.id));
    const rest = shuffle(practiceCards.filter(c => state.cards[c.id] && !seen.has(c.id)), rng);
    chosen.push(...rest.slice(0, Math.max(0, 10 - chosen.length)));
    if (!chosen.length) chosen.push(...shuffle(practiceCards.length ? practiceCards : lesson.cards, rng).slice(0, 10));
    // Short lessons repeat their small vocabulary; no more than five new cards per session.
    const pool = [...chosen];
    while (chosen.length < 10) {
      const alternatives = pool.filter(c => c.id !== chosen.at(-1).id);
      chosen.push((alternatives.length ? alternatives : pool)[Math.floor(rng() * (alternatives.length || pool.length))]);
    }
    return chosen.slice(0, 10);
  }
  function streak(state, now = Date.now()) {
    const d = new Date(now); d.setHours(12, 0, 0, 0);
    if (!state.days[localDay(d)]) d.setDate(d.getDate() - 1);
    let count = 0;
    while (state.days[localDay(d)]) { count++; d.setDate(d.getDate() - 1); }
    return count;
  }
  function stats(state, now = Date.now()) {
    const ps = Object.values(state.cards);
    const attempts = ps.reduce((n, p) => n + p.correct + p.wrong, 0);
    return { learned: ps.length, mastered: ps.filter(p => p.box >= 3).length,
      due: ps.filter(p => p.due <= now).length, attempts,
      accuracy: attempts ? Math.round(ps.reduce((n, p) => n + p.correct, 0) / attempts * 100) : 0,
      today: state.days[localDay(now)] || 0, streak: streak(state, now) };
  }
  function displayNote(note) { return FLATS[note] ? `${note} / ${FLATS[note]}` : note; }
  return { solfege, NOTES, OPEN, ALL, LESSONS, INTERVALS, NATURAL, card, localDay, blankState, loadState, normalizeActivity, snapshotActivity, restoreActivity, grade, shuffle, makeQueue, streak, stats, displayNote };
});


