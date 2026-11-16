// Notas IA — orquestador completo:
//   une al Meet (invitado) → espera admisión → graba audio (BlackHole) → detecta fin → transcribe → resume.
// Uso: node bot.js "https://meet.google.com/xxx-xxxx-xxx" [maxMin]
const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(require('puppeteer-core'));
const Stealth = require('puppeteer-extra-plugin-stealth');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const { summarize } = require('./summarize');
puppeteer.use(Stealth());

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2];
const MAX_MIN = parseInt(process.argv[3] || '180', 10); // tope de seguridad
const NAME = 'Notas IA';
const BLACKHOLE = 'BlackHole 2ch';
const MODEL = __dirname + '/models/ggml-small.bin';
if (!URL) { console.error('Uso: node bot.js "<link Meet>" [maxMin]'); process.exit(1); }

const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = sh("date +%Y%m%d-%H%M%S");
const meetId = (URL.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/) || [, 'meet'])[1];
const dir = `${__dirname}/recordings/${stamp}-${meetId}`;
const WAV = `${dir}/audio.wav`;

function blackholeIdx() {
  const out = execSync(`ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true`, { encoding: 'utf8' });
  const m = out.split('\n').find(l => /BlackHole/i.test(l) && /\[\d+\]/.test(l));
  return m ? m.match(/\[(\d+)\]/)[1] : null;
}

let prevOut = null, ffmpeg = null, audioSwitched = false;
function startAudio(idx) {
  prevOut = sh('SwitchAudioSource -c');
  sh(`SwitchAudioSource -s "${BLACKHOLE}"`); audioSwitched = true;
  ffmpeg = spawn('ffmpeg', ['-y', '-f', 'avfoundation', '-i', `:${idx}`, '-ar', '16000', '-ac', '1', WAV], { stdio: 'ignore' });
}
function stopAudio() {
  try { if (ffmpeg) { ffmpeg.kill('SIGINT'); } } catch (e) {}
  try { if (audioSwitched && prevOut) { sh(`SwitchAudioSource -s "${prevOut}"`); audioSwitched = false; } } catch (e) {}
}
process.on('exit', stopAudio);
process.on('SIGINT', () => { stopAudio(); process.exit(1); });

// estados leídos del DOM de Meet
const probe = (page) => page.evaluate(() => {
  const t = document.body.innerText || '';
  const waiting = /bring you into the call|Pidiendo permiso|Asking to be let in|Please wait|Esperando/i.test(t);
  const ended = /You left the meeting|Has salido de la reunión|Return to home screen|Volver a la pantalla|removed from the meeting|se te quitó de la reunión/i.test(t);
  const hangup = !!document.querySelector('button[aria-label*="Leave call" i],button[aria-label*="Abandonar" i],button[aria-label*="Salir de la llamada" i],[aria-label*="colgar" i]');
  return { waiting, ended, hangup };
});

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const idx = blackholeIdx();
  if (!idx) { console.error('❌ BlackHole no está disponible para ffmpeg.'); process.exit(1); }
  console.log(`🎧 BlackHole=#${idx}  ·  guardando en ${dir}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false, defaultViewport: null, userDataDir: '/tmp/meet-bot-profile',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-first-run',
      '--no-default-browser-check', '--lang=es', '--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
  const page = (await browser.pages())[0];
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(6000);
  try { await page.type('input[type=text]', NAME, { delay: 60 }); } catch (e) {}
  await sleep(1000);
  await page.evaluate(() => { for (const b of document.querySelectorAll('button,[role=button]')) {
    if (/^(Ask to join|Solicitar unirse|Pedir para unirte|Pedir unirse|Unirse ahora|Join now)$/i.test((b.textContent || '').trim())) { b.click(); return; } } });
  console.log('🚪 Pedí unirme como "' + NAME + '". Esperando que el host admita…');

  // esperar admisión (hasta 10 min)
  let inside = false;
  for (let k = 0; k < 300; k++) {
    await sleep(2000);
    const s = await probe(page).catch(() => ({}));
    if (s.hangup && !s.waiting) { inside = true; break; }
  }
  if (!inside) { console.error('No me admitieron (timeout).'); await browser.close(); process.exit(2); }
  console.log('✅ Adentro. ⏺ Grabando…');
  startAudio(idx);

  // grabar hasta que termine la reunión o se alcance el tope
  const until = Date.now() + MAX_MIN * 60000;
  let endedClean = false;
  while (Date.now() < until) {
    await sleep(4000);
    let s; try { s = await probe(page); } catch (e) { endedClean = true; break; } // página cerrada = fin
    if (s.ended || !s.hangup) { endedClean = true; break; }
  }
  console.log('🛑 Reunión terminada (' + (endedClean ? 'fin detectado' : 'tope de tiempo') + '). Cerrando…');
  stopAudio();
  await sleep(1500);
  try { await browser.close(); } catch (e) {}

  // transcribir
  console.log('📝 Transcribiendo…');
  sh(`whisper-cli -m "${MODEL}" -f "${WAV}" -l es -otxt -of "${dir}/transcript" >/dev/null 2>&1`);
  const transcript = fs.readFileSync(`${dir}/transcript.txt`, 'utf8');

  // resumir (si falla el LLM, igual queda la transcripción)
  let summary = '(resumen no disponible)';
  try { summary = await summarize(transcript); } catch (e) { console.error('resumen falló:', e.message); }
  fs.writeFileSync(`${dir}/summary.md`, `# Notas IA — ${meetId} — ${stamp}\n\n${summary}\n`);

  console.log('\n================= RESUMEN =================\n' + summary + '\n==========================================');
  console.log(`\n✅ Transcripción: ${dir}/transcript.txt\n✅ Resumen: ${dir}/summary.md\n✅ Audio: ${WAV}`);
})().catch(e => { console.error('ERR', e.message); stopAudio(); process.exit(1); });
