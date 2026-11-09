const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../logic.js');
const now = new Date(2026, 10, 9, 10, 0, 0).getTime();

test('all 78 positions have unique, valid identifiers', () => {
  assert.equal(F.ALL.length, 78);
  assert.equal(new Set(F.ALL.map(c => c.id)).size, 78);
  assert.ok(F.ALL.every(c => F.NOTES.includes(c.note)));
});
test('standard tuning, chromatic semitones and octaves are correct', () => {
  assert.deepEqual([6, 5, 4, 3, 2, 1].map(s => F.card(s, 0).note), ['E', 'A', 'D', 'G', 'B', 'E']);
  assert.equal(F.card(6, 1).note, 'F');
  assert.equal(F.card(6, 7).note, 'B');
  assert.equal(F.card(6, 8).note, 'C');
  assert.equal(F.card(2, 1).note, 'C');
  assert.equal(F.card(6, 0).midi, 40);
  assert.equal(F.card(1, 0).midi, 64);
  for (let s = 1; s <= 6; s++) {
    assert.equal(F.card(s, 0).note, F.card(s, 12).note);
    assert.equal(F.card(s, 12).octave, F.card(s, 0).octave + 1);
    for (let f = 1; f <= 12; f++) assert.equal(F.card(s, f).midi - F.card(s, f - 1).midi, 1);
  }
});
test('each find-mode string and range has exactly one correct answer', () => {
  for (const c of F.ALL) {
    const lo = c.fret <= 5 ? 0 : 6, hi = c.fret <= 5 ? 5 : 12;
    const answers = F.ALL.filter(p => p.string === c.string && p.fret >= lo && p.fret <= hi && p.note === c.note);
    assert.equal(answers.length, 1);
    assert.equal(answers[0].id, c.id);
  }
});
test('all natural-note units exclude accidental notes', () => {
  for (const l of F.LESSONS.filter(l => ['bass', 'middle', 'treble'].includes(l.id))) {
    assert.ok(l.cards.every(c => F.NATURAL.has(c.note)));
  }
  assert.equal(F.LESSONS[0].cards.length, 5);
  assert.equal(F.LESSONS.at(-1).cards.length, 78);
});
test('first correct answer is due in ten minutes', () => {
  const state = F.blankState();
  const p = F.grade(state, '6-0', true, now);
  assert.equal(p.box, 1); assert.equal(p.due, now + 600000);
  assert.equal(state.days[F.localDay(now)], 1);
});
test('early repetition cannot inflate memory level or postpone the review', () => {
  const state = F.blankState();
  const first = F.grade(state, '6-0', true, now);
  for (let i = 0; i < 10; i++) F.grade(state, '6-0', true, now + 1000);
  assert.equal(state.cards['6-0'].box, 1);
  assert.equal(state.cards['6-0'].due, first.due);
  assert.equal(F.stats(state, now).mastered, 0);
  assert.equal(F.stats(state, now).attempts, 11);
});
test('three spaced correct answers promote the card to long-term memory', () => {
  const state = F.blankState();
  F.grade(state, '6-0', true, now);
  F.grade(state, '6-0', true, now + 600000);
  F.grade(state, '6-0', true, now + 600000 + 86400000);
  assert.equal(state.cards['6-0'].box, 3);
  assert.equal(F.stats(state, now).mastered, 1);
  assert.equal(state.cards['6-0'].due, now + 600000 + 86400000 + 3 * 86400000);
});
test('incorrect answer schedules a short review and resets memory level', () => {
  const state = F.blankState();
  F.grade(state, '6-0', true, now);
  F.grade(state, '6-0', false, now + 1000);
  assert.equal(state.cards['6-0'].box, 0);
  assert.equal(state.cards['6-0'].due, now + 61000);
  F.grade(state, '6-0', true, now + 2000);
  assert.equal(state.cards['6-0'].box, 0);
  assert.equal(F.stats(state, now + 61000).due, 1);
});
test('memory level is capped at five', () => {
  const state = F.blankState(); let t = now;
  for (let i = 0; i < 10; i++) { F.grade(state, '6-0', true, t); t = state.cards['6-0'].due; }
  assert.equal(state.cards['6-0'].box, 5);
});
test('queue has ten questions, no adjacent duplicates and at most five new positions', () => {
  for (const l of F.LESSONS) {
    const queue = F.makeQueue(F.blankState(), l.id, now, () => .4);
    assert.equal(queue.length, 10);
    assert.ok(new Set(queue.map(c => c.id)).size <= 5);
    for (let i = 1; i < queue.length; i++) assert.notEqual(queue[i].id, queue[i - 1].id);
    assert.ok(queue.every(c => l.cards.some(x => x.id === c.id)));
  }
});
test('due cards take priority, including cards from a different lesson', () => {
  const state = F.blankState(); F.grade(state, '2-1', false, now - 120000);
  const queue = F.makeQueue(state, 'six', now, () => .2);
  assert.equal(queue[0].id, '2-1');
  assert.ok(new Set(queue.filter(c => !state.cards[c.id]).map(c => c.id)).size <= 5);
});
test('review-only queue never introduces new cards or repeats not-due cards', () => {
  const state = F.blankState();
  assert.deepEqual(F.makeQueue(state, 'six', now, () => .3, true), []);
  F.grade(state, '6-0', true, now);
  F.grade(state, '6-3', false, now - 120000);
  const queue = F.makeQueue(state, 'six', now, () => .3, true);
  assert.deepEqual(queue.map(c => c.id), ['6-3']);
});
test('corrupted and malicious storage is sanitized', () => {
  assert.deepEqual(F.loadState('bad json'), F.blankState());
  assert.deepEqual(F.loadState('null'), F.blankState());
  assert.deepEqual(F.loadState('{"version":2,"cards":{}}'), F.blankState());
  const state = F.loadState(JSON.stringify({ version: 1, cards: { '6-0': { box: 99, due: 2, correct: 1, wrong: 0 }, '6-1': { box: 1, due: 500, correct: 1, wrong: 0 } }, days: { '<script>': 3, '2026-11-09': 3 }, lesson: 'bad', mode: 'bad', sessions: -1 }));
  assert.equal(state.cards['6-0'], undefined);
  assert.equal(state.cards['6-1'].box, 1);
  assert.deepEqual(state.days, { '2026-11-09': 3 });
  assert.equal(state.lesson, 'six'); assert.equal(state.mode, 'find'); assert.equal(state.sessions, 0);
});
test('save/load preserves legitimate progress', () => {
  const state = F.blankState(); F.grade(state, '6-0', true, now); state.lesson = 'bass'; state.mode = 'name'; state.sound = true; state.sessions = 3;
  assert.deepEqual(F.loadState(JSON.stringify(state)), state);
});
test('streak uses local calendar days, includes yesterday, and expires after a gap', () => {
  const state = F.blankState();
  const day = offset => { const d = new Date(now); d.setDate(d.getDate() + offset); return F.localDay(d); };
  state.days[day(-2)] = 1; state.days[day(-1)] = 4;
  assert.equal(F.streak(state, now), 2);
  state.days[day(0)] = 2; assert.equal(F.streak(state, now), 3);
  delete state.days[day(-1)]; assert.equal(F.streak(state, now), 1);
  delete state.days[day(0)]; assert.equal(F.streak(state, now), 0);
});
test('stats count correctness, discovery, and due reviews accurately', () => {
  const state = F.blankState(); F.grade(state, '6-0', true, now); F.grade(state, '5-3', false, now);
  const s = F.stats(state, now);
  assert.equal(s.learned, 2); assert.equal(s.accuracy, 50); assert.equal(s.today, 2); assert.equal(s.due, 0);
  assert.equal(F.stats(state, now + 60000).due, 1);
});
test('enharmonic names are paired consistently', () => {
  assert.equal(F.displayNote('C♯'), 'C♯ / D♭');
  assert.equal(F.displayNote('A♯'), 'A♯ / B♭');
  assert.equal(F.displayNote('C'), 'C');
});

test('a study round is followed by practice on the same small vocabulary', () => {
  const state = F.blankState();
  const selected = F.LESSONS.find(l => l.id === 'all').cards.slice(0, 5);
  const queue = F.makeQueue(state, 'all', now, () => .3, false, selected);
  assert.equal(queue.length, 10);
  assert.ok(queue.every(c => selected.some(x => x.id === c.id)));
  selected.forEach(c => F.grade(state, c.id, true, now));
  const extraPractice = F.makeQueue(state, 'all', now, () => .3, false, selected);
  assert.ok(extraPractice.every(c => selected.some(x => x.id === c.id)));
});
