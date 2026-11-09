const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const F = require('../logic.js');
const A = require('../audio.js');
const samples = require('../samples.js');
function fixture(options = {}) {
  const events = { clips: [], messages: [], speech: 0 };
  class Audio {
    constructor(src) { this.src = src; this.currentTime = 0; this.pauses = 0; this.plays = 0; events.clips.push(this); }
    pause() { this.pauses++; }
    play() { this.plays++; return options.play ? options.play(this) : Promise.resolve(); }
  }
  const env = { Audio, speechSynthesis: { speak() { events.speech++; } },
    AudioContext: class { constructor() { throw Error('Synthesized tones must never be used'); } } };
  return { env, events, player: A.createPlayer(env, samples, msg => events.messages.push(msg)) };
}
test('all 78 string/fret positions use independent recorded files with matching MIDI metadata', () => {
  const manifest = require('../assets/guitar/manifest.json');
  assert.equal(Object.keys(samples).length, 78);
  const hashes = new Set();
  for (const c of F.ALL) {
    const sample = samples[c.id], info = manifest.samples[c.id];
    assert.equal(sample.string, c.string); assert.equal(sample.fret, c.fret); assert.equal(sample.midi, c.midi);
    assert.equal(sample.src, `assets/guitar/${c.id}.wav`);
    const wav = fs.readFileSync(path.join(__dirname, '..', sample.src));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1); assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 22050); assert.equal(wav.readUInt16LE(34), 16);
    assert.ok(wav.length > 22050); assert.ok(info.duration > .5 && info.duration <= 2);
    const expectedHz = 440 * 2 ** ((c.midi - 69) / 12);
    assert.ok(Math.abs(1200 * Math.log2(info.measuredHz / expectedHz)) <= 35, `recorded pitch ${c.id}`);
    const hash = crypto.createHash('sha256').update(wav).digest('hex');
    assert.equal(hash, info.sha256); hashes.add(hash);
  }
  assert.equal(hashes.size, 78, 'same-pitch positions must not reuse the same recording');
});
test('clicking every position selects its own recording without synthesis or speech', async () => {
  const { player, events } = fixture();
  for (const c of F.ALL) {
    await player.play(c, { sound: true, solfege: true }); // Old backups cannot re-enable human speech.
    const clip = events.clips.at(-1);
    assert.equal(clip.src, samples[c.id].src); assert.equal(clip.plays, 1); assert.equal(clip.playbackRate, undefined);
  }
  assert.equal(events.clips.length, 78); assert.equal(events.speech, 0); assert.equal(events.messages.length, 0);
});
test('equal-pitch notes on different strings play different recordings', async () => {
  const { player, events } = fixture();
  const a = F.card(6, 5), b = F.card(5, 0);
  assert.equal(a.midi, b.midi);
  await player.play(a, { sound: true }); await player.play(b, { sound: true });
  assert.notEqual(events.clips[0].src, events.clips[1].src);
});
test('mute stays silent, explicit listen overrides mute, and repeats restart the cached recording', async () => {
  const { player, events } = fixture();
  await player.play(F.card(5, 3), { sound: false }); assert.equal(events.clips.length, 0);
  await player.play(F.card(5, 3), { sound: false }, true);
  events.clips[0].currentTime = 1;
  await player.play(F.card(5, 3), { sound: true });
  assert.equal(events.clips.length, 1); assert.equal(events.clips[0].plays, 2);
  assert.equal(events.clips[0].currentTime, 0); assert.ok(events.clips[0].pauses > 0);
});
test('rapid clicks pause previous recordings and stop does not cause a late replay', async () => {
  const pending = [];
  const { player, events } = fixture({ play: () => new Promise(resolve => pending.push(resolve)) });
  const first = player.play(F.card(5, 3), { sound: true });
  const second = player.play(F.card(5, 5), { sound: true });
  assert.equal(events.clips[0].pauses, 1);
  player.stop(); assert.equal(events.clips[1].pauses, 1);
  pending.forEach(resolve => resolve()); await Promise.all([first, second]);
  assert.deepEqual(events.clips.map(c => c.plays), [1, 1]); assert.equal(events.messages.length, 0);
});
test('a failed or blocked recording gives a clear message and can retry', async () => {
  let fail = true;
  const { player, events } = fixture({ play: () => fail ? Promise.reject(Object.assign(Error('blocked'), { name: 'NotAllowedError' })) : Promise.resolve() });
  await player.play(F.card(5, 3), { sound: true });
  assert.equal(events.messages.length, 1); assert.match(events.messages[0], /允许播放/);
  fail = false; await player.play(F.card(5, 3), { sound: true });
  assert.equal(events.clips.length, 2); assert.equal(events.clips[1].plays, 1);
});
test('loading errors only affect the active recording, and never trigger a tone fallback', async () => {
  const { player, events } = fixture();
  await player.play(F.card(5, 3), { sound: true }); const staleError = events.clips[0].onerror;
  await player.play(F.card(5, 5), { sound: true }); staleError();
  assert.equal(events.messages.length, 0);
  events.clips[1].onerror(); assert.match(events.messages[0], /加载失败/);
  await player.play(F.card(5, 5), { sound: true }); assert.equal(events.clips.length, 3);
});
test('missing APIs and invalid recording metadata fail gracefully without another sound', async () => {
  const messages = [], absent = A.createPlayer({}, samples, msg => messages.push(msg));
  await absent.play(F.card(5, 3), { sound: true }); assert.match(messages[0], /不支持/);
  const { env, events } = fixture();
  const bad = A.createPlayer(env, { ...samples, '5-3': { ...samples['5-3'], midi: 99 } }, msg => messages.push(msg));
  await bad.play(F.card(5, 3), { sound: true }); assert.equal(events.clips.length, 0);
  assert.match(messages[1], /录音暂不可用/);
});
test('legacy speech settings are ignored while learning records and mute remain intact', () => {
  const state = F.blankState(); F.grade(state, '5-3', true);
  const saved = F.loadState(JSON.stringify({ ...state, sound: false, solfege: true }));
  assert.equal(saved.sound, false); assert.deepEqual(saved.cards, state.cards);
  assert.equal(saved.solfege, undefined); assert.equal(F.blankState().sound, true);
});
