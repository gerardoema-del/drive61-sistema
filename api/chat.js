/* =====================================================================
   Drive61 — Backend seguro del Asistente IA (Claude Sonnet)
   Función serverless de Vercel. La API key vive SOLO acá
   (ANTHROPIC_API_KEY en Vercel), nunca en el cliente.
   ===================================================================== */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ reply: 'Método no permitido.' }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(200).json({ reply: '⚠️ El asistente todavía no está activado. Falta cargar la API key de Anthropic en Vercel (variable ANTHROPIC_API_KEY).' });
    return;
  }

  const body = req.body || {};
  const pregunta = String(body.pregunta || '').slice(0, 2000);
  const contexto = String(body.contexto || '').slice(0, 12000);

  const system = [
    'Sos el asistente virtual del sistema "Drive61", un software de gestión para una empresa que ALQUILA autos a conductores que trabajan en Uber (el conductor paga una tarifa de alquiler y se queda con el resto de lo que gana).',
    '',
    'REGLAS ESTRICTAS:',
    '1. Respondé ÚNICAMENTE sobre Drive61 y su operación: conductores, autos/flota, agenda de asignaciones, telepeajes, multas, cobranzas/deuda, scoring de conducción, reportes y el uso del propio sistema. Si te preguntan cualquier otra cosa ajena a Drive61, respondé amablemente que solo podés ayudar con el sistema Drive61.',
    '2. Usá EXCLUSIVAMENTE los datos que aparecen abajo en "DATOS ACTUALES". Si un dato puntual no está, decí que no lo tenés. NUNCA inventes nombres, patentes, montos ni estadísticas.',
    '3. Cuando des conclusiones o recomendaciones, basalas en los datos y explicá brevemente por qué.',
    '4. Sé breve, claro y concreto. Español rioplatense (voseo), tono profesional y amable.',
    '5. No prometas acciones que no podés ejecutar; si corresponde, sugerí qué hacer en el sistema.',
    '',
    'CONTEXTO DEL SISTEMA (módulos): Tablero, Conductores (ficha 360), Flota, Agenda, Telepeajes, Multas, Cobranzas (WhatsApp), Ituran/Scoring, CRM, Reportes. Los datos hoy son de demostración.',
    '',
    'DATOS ACTUALES:',
    contexto || '(sin datos)'
  ].join('\n');

  async function callClaude() {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 900,
        system,
        messages: [{ role: 'user', content: pregunta || 'Hola' }]
      })
    });
    const data = await r.json().catch(() => null);
    return { r, data };
  }

  function extractText(data) {
    if (data && Array.isArray(data.content)) {
      const parts = data.content.filter(b => b && b.type === 'text' && b.text).map(b => b.text);
      if (parts.length) return parts.join('\n');
    }
    return null;
  }

  try {
    let { r, data } = await callClaude();

    // Reintento automático 1 vez ante rate limit / saturación / respuesta vacía
    if (r.status === 429 || r.status === 529 || (r.ok && !extractText(data))) {
      await new Promise(res => setTimeout(res, 1200));
      ({ r, data } = await callClaude());
    }

    let reply;
    const text = extractText(data);
    if (text) {
      reply = text;
    } else if (r.status === 429) {
      reply = '😅 Estoy recibiendo muchas consultas al mismo tiempo. Esperá unos segundos y volvé a preguntar. (Es un límite del proveedor de IA, no una falla del sistema.)';
    } else if (r.status === 529) {
      reply = 'El servicio de IA está momentáneamente saturado. Probá de n