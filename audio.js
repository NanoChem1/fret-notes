(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FretAudio = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createPlayer(env, samples, notify = () => {}) {
    const clips = new Map(), warned = new Set();
    let active = null, generation = 0;
    function warn(message) { if (!warned.has(message)) { warned.add(message); notify(message); } }
    function stop() {
      generation++;
      const previous = active; active = null;
      if (previous) {
        previous.onerror = null; previous.onended = null;
        try { previous.pause(); previous.currentTime = 0; } catch {}
      }
    }
    async function play(card, settings, force = false) {
      if (!settings.sound && !force) return;
      stop();
      const ticket = generation, sample = samples?.[card.id];
      if (!sample || sample.string !== card.string || sample.fret !== card.fret || sample.midi !== card.midi) {
        warn('这个位置的吉他录音暂不可用，请重新打开页面。'); return;
      }
      if (typeof env.Audio !== 'function') { warn('此浏览器不支持吉他录音播放，请换用支持音频的浏览器。'); return; }
      let clip;
      const failed = error => {
        if (generation !== ticket || active !== clip) return;
        stop(); clips.delete(card.id);
        warn(error?.name === 'NotAllowedError' ? '浏览器暂未允许播放，请再次点击「试听」并检查声音权限。' : '吉他录音加载失败，请检查网络或网页文件是否完整，再点击重试。');
      };
      try {
        clip = clips.get(card.id);
        if (!clip) {
          clip = new env.Audio(sample.src); clip.preload = 'auto'; clip.volume = .8;
          clips.set(card.id, clip);
        }
        active = clip;
        clip.currentTime = 0;
        clip.onerror = () => failed();
        clip.onended = () => { if (generation === ticket && active === clip) active = null; };
        // Call play during the click gesture. Never transpose or synthesize a substitute tone.
        await clip.play();
      } catch (error) {
        if (clip) failed(error);
        else if (generation === ticket) warn('吉他录音暂不可用，请重新点击试听。');
      }
    }
    return { play, stop };
  }
  return { createPlayer };
});
