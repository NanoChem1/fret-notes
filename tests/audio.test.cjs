const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../logic.js');
const A = require('../audio.js');
function fixture(options = {}) {
  const events = { tones: [], speech: [], messages: [], cancels: 0, voices: [] };
  class AudioContext {
    constructor() { this.currentTime = 4; this.destination = {}; this.state = options.suspended ? 'suspended' : 'running'; }
    resume() { return options.resume ? options.resume() : Promise.resolve(); }
    createOscillator() {
      const tone = { frequency: {}, connect() {}, start(time) { this.startTime = time; }, stop(time) { this.stopTime = time; } };
      events.tones.push(tone); return tone;
    }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  const env = { AudioContext, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, speechSynthesis: {
    getVoices: () => events.voices, cancel: () => events.cancels++, speak: utterance => events.speech.push(utterance)
  } };
  events.voices.push({ lang: 'zh-CN', localService: true });
  return { env, events, player: A.createPlayer(env, F.solfege, msg => events.messages.push(msg)) };
}
test('natural notes map to the requested fixed solfege', () => {
  assert.deepEqual(['C','D','E','F','G','A','B'].map(n => F.solfege(n).label), ['do','re','mi','fa','sol','la','si']);
  assert.equal(F.solfege('C♯').label, '升 do / 降 re');
  assert.equal(F.solfege('A♯').label, '升 la / 降 si');
  assert.ok(F.NOTES.every(n => F.solfege(n).spoken && F.solfege(n).english));
});
test('pitch uses the octave of the selected position', () => {
  assert.equal(A.frequency(69), 440);
  assert.ok(Math.abs(A.frequency(F.card(5,3).midi) - 130.81278265) < .001);
  assert.equal(A.frequency(F.card(5,12).midi), A.frequency(F.card(5,0).midi) * 2);
});
test('click playback makes the selected tone and speaks its matching syllable', async () => {
  const { player, events } = fixture();
  await player.play(F.card(5,3), { sound: true, solfege: true });
  assert.equal(events.tones.length, 1);
  assert.equal(events.tones[0].frequency.value, A.frequency(48));
  assert.equal(events.speech[0].text, '哆');
  assert.equal(events.speech[0].lang, 'zh-CN');
  assert.equal(events.speech[0].voice.localService, true);
});
test('muted clicks stay silent and explicit listen overrides mute', async () => {
  const { player, events } = fixture();
  await player.play(F.card(5,3), { sound: false, solfege: true });
  assert.equal(events.tones.length, 0); assert.equal(events.speech.length, 0);
  await player.play(F.card(5,3), { sound: false, solfege: true }, true);
  assert.equal(events.tones.length, 1); assert.equal(events.speech.length, 1);
});
test('turning off solfege preserves pitched audio', async () => {
  const { player, events } = fixture();
  await player.play(F.card(5,3), { sound: true, solfege: false });
  assert.equal(events.tones.length, 1); assert.equal(events.speech.length, 0);
});
test('rapid clicks cancel old speech instead of building up a queue', async () => {
  const { player, events } = fixture();
  await player.play(F.card(5,3), { sound: true, solfege: true });
  await player.play(F.card(5,5), { sound: true, solfege: true });
  assert.deepEqual(events.speech.map(u => u.text), ['哆','来']);
  assert.ok(events.cancels >= 4);
  player.stop(); assert.ok(events.cancels >= 5);
});
test('voices loaded after initialization are discovered on the next click', async () => {
  const { player, events } = fixture(); events.voices.length = 0;
  await player.play(F.card(5,3), { sound: true, solfege: true });
  assert.equal(events.speech.length, 0); assert.equal(events.messages.length, 1);
  events.voices.push({ lang:'en-US', localService:true });
  await player.play(F.card(5,3), { sound: true, solfege: true });
  assert.equal(events.speech[0].text, 'doh');
});
test('network voices are never selected, and missing speech only warns once', async () => {
  const { player, events } = fixture();
  events.voices.splice(0, 1, { lang:'zh-CN', localService:false });
  for(let i=0; i<2; i++) await player.play(F.card(5,3), { sound:true, solfege:true });
  assert.equal(events.speech.length, 0); assert.equal(events.tones.length, 2); assert.equal(events.messages.length, 1);
});
test('missing synthesis APIs fail gracefully', async () => {
  const messages = [], player = A.createPlayer({}, F.solfege, msg => messages.push(msg));
  await player.play(F.card(5,3), { sound:true, solfege:true });
  assert.equal(messages.length, 2);
});
test('stopping pending playback prevents a delayed sound or spoken answer', async () => {
  let resume;
  const { player, events } = fixture({ suspended:true, resume: () => new Promise(resolve => { resume = resolve; }) });
  const pending = player.play(F.card(5,3), { sound:true, solfege:true });
  player.stop(); resume(); await pending;
  assert.equal(events.tones[0].startTime, undefined); assert.equal(events.speech.length, 0);
});
test('older saved progress retains its mute setting and gains a solfege preference', () => {
  const state = F.loadState(JSON.stringify({ version:1, cards:{}, days:{}, sound:false }));
  assert.equal(state.sound, false); assert.equal(state.solfege, true);
  state.solfege = false; assert.deepEqual(F.loadState(JSON.stringify(state)), state);
  assert.equal(F.blankState().sound, true); assert.equal(F.blankState().solfege, true);
});

test('all 78 fret positions play their own pitch and fixed solfege, including accidentals', async () => {
  const { player, events } = fixture();
  const openHz = { 1:329.6275569128699, 2:246.94165062806206, 3:195.99771799087463, 4:146.8323839587038, 5:110, 6:82.4068892282175 };
  const chromatic = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const openIndex = { 1:4, 2:11, 3:7, 4:2, 5:9, 6:4 };
  const seen = new Set();
  for (let string = 1; string <= 6; string++) {
    for (let fret = 0; fret <= 12; fret++) {
      const c = F.card(string, fret);
      await player.play(c, { sound:true, solfege:true });
      seen.add(c.id);
      const expectedNote = chromatic[(openIndex[string] + fret) % 12];
      const expectedHz = openHz[string] * 2 ** (fret / 12);
      assert.equal(c.note, expectedNote, c.id);
      assert.ok(Math.abs(events.tones.at(-1).frequency.value - expectedHz) < 1e-8, `pitch at ${c.id}`);
      assert.equal(events.speech.at(-1).text, F.solfege(expectedNote).spoken, `solfege at ${c.id}`);
      assert.equal(events.tones.at(-1).startTime, 4, `playback started at ${c.id}`);
    }
  }
  assert.equal(seen.size, 78);
  assert.equal(events.tones.length, 78);
  assert.equal(events.speech.length, 78);
  assert.equal(events.messages.length, 0);
});
