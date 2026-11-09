const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const F = require('../logic.js');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'window.inspect = { startSession, answer, nextQuestion, resumeActivity, startStudy, renderIntro, save, get state() { return state; }, get session() { return session; }, get study() { return study; } }; })();');
// Exercise actual app callbacks with inert DOM nodes; no browser/audio implementation is simulated here.
function launch(storage = new Map(), blocked = false) {
  const nodes = new Map();
  const make = () => ({ innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { this[type] = fn; }, setAttribute() {}, removeAttribute() {}, querySelector: get,
    querySelectorAll: () => [], scrollWidth: 0, clientWidth: 0 });
  const get = key => { if (!nodes.has(key)) nodes.set(key, make()); return nodes.get(key); };
  const document = { querySelector: get, querySelectorAll: () => [], addEventListener() {} };
  let plays = 0;
  const window = { FretNotes: F, FretAudio: { createPlayer: () => ({ play() { plays++; }, stop() {} }) }, addEventListener() {} };
  const context = { window, document, localStorage: { getItem: key => storage.get(key) || null,
    setItem(key, val) { if (blocked) throw Error('storage blocked'); storage.set(key, val); } },
    location: { hash: '' }, history: { replaceState() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval() {}, confirm: () => true };
  vm.runInNewContext(source, context);
  return { app: window.inspect, nodes, storage, plays: () => plays, unblock() { blocked = false; } };
}
test('an answered mistake survives reload without duplicate grades, retries or sound', () => {
  const first = launch(); first.app.startSession();
  const id = first.app.session.queue[0].id;
  first.app.answer(false, '1-1', null);
  const before = JSON.stringify(first.app.state.cards);
  const length = first.app.session.queue.length;
  assert.equal(first.plays(), 1);
  const second = launch(first.storage);
  assert.match(second.nodes.get('#exercise-content').innerHTML, /继续学习/);
  second.app.resumeActivity();
  assert.equal(second.app.session.answered, true);
  assert.equal(second.app.session.wrongIds.has(id), true);
  assert.equal(second.app.session.retried.has(id), true);
  assert.equal(second.app.session.queue.length, length);
  assert.match(second.nodes.get('#answer-instruction').innerHTML, /没关系/);
  second.app.answer(true, null, null);
  assert.equal(JSON.stringify(second.app.state.cards), before);
  assert.equal(second.plays(), 0);
  second.app.nextQuestion();
  assert.equal(second.app.session.index, 1);
  assert.equal(second.app.session.answered, false);
  assert.equal(JSON.parse(second.storage.get('fret-notes-v1')).activity.index, 1);
});
test('completing the last answer clears the resumable round atomically', () => {
  const x = launch(); x.app.startSession();
  while (x.app.session) { x.app.answer(true, null, null); x.app.nextQuestion(); }
  const saved = JSON.parse(x.storage.get('fret-notes-v1'));
  assert.equal(saved.sessions, 1); assert.equal(saved.activity, null);
  const reloaded = launch(x.storage);
  assert.equal(reloaded.app.session, null);
  assert.equal(reloaded.app.state.sessions, 1);
});
test('study preserves the exact card and whether its answer was revealed', () => {
  const x = launch(); x.app.startStudy();
  x.nodes.get('#study-flip').click();
  x.nodes.get('#study-next').click();
  x.nodes.get('#study-flip').click();
  const copy = launch(x.storage); copy.app.resumeActivity();
  assert.equal(copy.app.study.index, 1); assert.equal(copy.app.study.revealed, true);
  assert.match(copy.nodes.get('#exercise-content').innerHTML, /下一个位置/);
  copy.app.renderIntro();
  assert.equal(copy.app.study.index, 1);
});
test('blocked storage reports failure and can recover on the next save', () => {
  const x = launch(new Map(), true);
  assert.match(x.nodes.get('#save-status').textContent, /暂未保存/);
  assert.equal(x.app.state.savedAt, 0);
  x.unblock(); x.app.save();
  assert.match(x.nodes.get('#save-status').textContent, /已自动保存/);
  assert.ok(x.app.state.savedAt > 0);
});
test('backups round-trip active cards using canonical tuning and reject corrupt activities', () => {
  const x = launch(); x.app.startSession();
  const raw = JSON.parse(x.storage.get('fret-notes-v1'));
  const loaded = F.loadState(JSON.stringify(raw));
  const restored = F.restoreActivity(loaded.activity);
  assert.equal(restored.session.queue[0].midi, F.ALL.find(c => c.id === raw.activity.queue[0]).midi);
  const mutations = [a => { a.queue[0] = '6-24'; }, a => { a.index = 99; }, a => { a.correct = 8; },
    a => { a.lesson = '<img>'; }, a => { a.originalLength = 0; }, a => { a.answered = true; a.answer = null; },
    a => { a.queue = Array(100).fill('6-0'); }, a => { a.wrongIds = ['bad']; }];
  for (const mutate of mutations) {
    const copy = JSON.parse(JSON.stringify(raw)); mutate(copy.activity);
    assert.equal(F.loadState(JSON.stringify(copy)).activity, null);
  }
  delete raw.activity; delete raw.savedAt;
  assert.equal(F.loadState(JSON.stringify(raw)).activity, null);
});

test('find questions distinguish the open E2 from E3 at fret 12 and preserve the range', () => {
  for (const [fret, pitch, range] of [[0, 'E2', '0–5'], [12, 'E3', '6–12']]) {
    const x = launch();
    x.app.startSession(false, [F.card(6, fret)]);
    const html = x.nodes.get('#exercise-content').innerHTML;
    assert.ok(html.includes(`<div class="note-display">${pitch}</div>`));
    assert.ok(html.includes(`第 6 弦 · ${range} 品`));
    x.app.answer(true, null, null);
    assert.ok(x.nodes.get('#answer-instruction').innerHTML.includes(`= ${pitch}`));
    assert.ok(x.nodes.get('#question-board').innerHTML.includes(`<span class="note-dot">${pitch}</span>`));
  }
});
test('name questions hide pitch until answered and retain twelve pitch-class choices', () => {
  const x = launch(); x.app.state.mode = 'name';
  x.app.startSession(false, [F.card(6, 12)]);
  const html = x.nodes.get('#exercise-content').innerHTML;
  assert.ok(html.includes('<span class="note-dot">?</span>'));
  assert.ok(!html.includes('E3'));
  assert.equal([...html.matchAll(/class="answer-option"/g)].length, 12);
  x.app.answer(true, null, 'E');
  assert.ok(x.nodes.get('#answer-instruction').innerHTML.includes('E3'));
});
test('complete pitch spelling preserves enharmonic octave numbers and the B to C boundary', () => {
  assert.equal(F.displayPitch(F.card(6, 0)), 'E2');
  assert.equal(F.displayPitch(F.card(6, 12)), 'E3');
  assert.equal(F.displayPitch(F.card(2, 2)), 'C♯4 / D♭4');
  assert.equal(F.displayPitch(F.card(5, 2)), 'B2');
  assert.equal(F.displayPitch(F.card(5, 3)), 'C3');
});
