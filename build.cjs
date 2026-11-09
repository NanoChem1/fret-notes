'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const samples = require('./samples.js');
let html = read('index.html');
html = html.replace('  <link rel="stylesheet" href="styles.css">', () => `  <style>\n${read('styles.css')}\n  </style>`);
for (const name of ['logic.js', 'samples.js', 'audio.js', 'app.js']) html = html.replace(`  <script src="${name}" defer></script>\n`, '');
// Embed each real recording so the downloaded HTML also works without network access.
const embedded = Object.fromEntries(Object.entries(samples).map(([id, sample]) => [id, {
  ...sample, src: `data:audio/wav;base64,${fs.readFileSync(path.join(root, sample.src)).toString('base64')}`
}]));
const attribution = read('assets/guitar/ATTRIBUTION.txt');
html = html.replace('</body>', () => `  <!-- ${attribution.replace(/--/g, '—')} -->\n  <script>\n${read('logic.js')}\nwindow.FretGuitarSamples = ${JSON.stringify(embedded)};\n${read('audio.js')}\n${read('app.js')}\n  </script>\n</body>`);
const output = path.join(root, 'dist', '弦记.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log(`Built: ${output}`);
