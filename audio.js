(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FretAudio = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function frequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
  function createPlayer(env, solfege, notify = () => {}) {
    let audio, active = null;
    const warned = new Set();
    function warn(message) { if (!warned.has(message)) { warned.add(message); notify(message); } }
    function cancelSpeech() { try { env.speechSynthesis?.cancel(); } catch {} }
    function stop() {
      cancelSpeech();
      if (active) { try { active.stop(); } catch {} active = null; }
    }
    function speak(note) {
      const synth = env.speechSynthesis, Utterance = env.SpeechSynthesisUtterance;
      if (!synth || !Utterance) { warn('此浏览器不支持唱名朗读，仍会播放参考音并显示唱名。'); return; }
      try {
        // Use installed voices only, keeping note names on this device.
        const local = synth.getVoices().filter(v => v.localService === true);
        const voice = local.find(v => /^zh(?:-|_)/i.test(v.lang)) || local.find(v => /^en(?:-|_)/i.test(v.lang));
        if (!voice) { warn('暂未找到本地中英文语音，请稍后重试；参考音和唱名显示仍可使用。'); return; }
        const info = solfege(note), chinese = /^zh(?:-|_)/i.test(voice.lang);
        const utterance = new Utterance(chinese ? info.spoken : info.english);
        utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = .8; utterance.volume = .9;
        // Speech labels the syllable. The oscillator supplies the musical pitch.
        utterance.onerror = e => { if (!['canceled', 'interrupted'].includes(e.error)) warn('唱名朗读暂不可用，仍可听参考音和查看唱名。'); };
        synth.cancel(); synth.speak(utterance);
      } catch { warn('唱名朗读暂不可用，仍可听参考音和查看唱名。'); }
    }
    async function play(card, settings, force = false) {
      if (!settings.sound && !force) return;
      stop();
      try {
        const AudioClass = env.AudioContext || env.webkitAudioContext;
        if (AudioClass) {
          audio ||= new AudioClass();
          const oscillator = audio.createOscillator(), gain = audio.createGain();
          // Bind to this gesture before awaiting a suspended context.
          active = oscillator;
          if (audio.state === 'suspended') await audio.resume();
          if (active !== oscillator) return;
          const now = audio.currentTime;
          oscillator.type = 'triangle'; oscillator.frequency.value = frequency(card.midi);
          gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.12, now + .015);
          gain.gain.exponentialRampToValueAtTime(.001, now + .8);
          oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + .85);
        } else warn('此浏览器不支持参考音，仍可查看唱名。');
      } catch { warn('参考音暂不可用，仍可查看唱名。'); }
      if (settings.solfege) speak(card.note);
    }
    // Ask the browser to load the installed voice list before the first gesture.
    try { env.speechSynthesis?.getVoices(); } catch {}
    return { play, stop };
  }
  return { frequency, createPlayer };
});
