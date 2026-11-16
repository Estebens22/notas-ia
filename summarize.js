// Resume una transcripción con un LLM (endpoint compatible OpenAI, config en .env).
// Uso: node summarize.js /ruta/transcripcion.txt   → imprime el resumen (markdown)
const fs = require('fs');
require('dotenv').config({ path: __dirname + '/.env' });

const URL = process.env.SUMMARY_URL, KEY = process.env.SUMMARY_KEY, MODEL = process.env.SUMMARY_MODEL;

async function summarize(text) {
  if (!URL || !KEY) throw new Error('Falta SUMMARY_URL/SUMMARY_KEY en .env');
  // qwen 7b: ventana acotada → recorto transcripciones muy largas (ponytail: simple, avisa el corte)
  const MAX = 12000;
  let t = text, note = '';
  if (t.length > MAX) { t = t.slice(0, MAX); note = '\n\n(nota: transcripción recortada para el resumen)'; }
  const sys = 'Eres un asistente que resume reuniones en español. A partir de la transcripción, entrega en markdown:\n' +
    '## Resumen (3-5 bullets)\n## Decisiones\n## Tareas / pendientes (con responsable si se menciona)\n' +
    'Sé conciso y concreto. Si algo no está en la transcripción, no lo inventes.';
  const res = await fetch(URL.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.2,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: 'Transcripción:\n\n' + t + note }] }),
  });
  if (!res.ok) throw new Error('LLM ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  return j.choices?.[0]?.message?.content?.trim() || '(sin resumen)';
}

module.exports = { summarize };

if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('Uso: node summarize.js <transcripcion.txt>'); process.exit(1); }
  summarize(fs.readFileSync(f, 'utf8'))
    .then(s => { console.log(s); })
    .catch(e => { console.error('ERR', e.message); process.exit(1); });
}
