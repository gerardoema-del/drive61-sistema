/* =====================================================================
   Drive61 — Backend seguro del Asistente IA (Claude Sonnet)
   Función serverless de Vercel (CommonJS). La API key vive SOLO acá
   (ANTHROPIC_API_KEY en Vercel), nunca en el cliente.
   ===================================================================== */
module.exports = async function handler(req, res) {
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

  const sysAdmin = [
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

  const sysConductor = [
    'Sos el asistente de la APP DEL CONDUCTOR de Drive61.',
    'Drive61 ALQUILA autos (Fiat Cronos) a conductores para trabajar en Uber: se alquila por turnos de 12 hs (diurno 06-18 o nocturno 18-06), el conductor maneja para Uber, paga una tarifa de alquiler y se queda con el resto de lo que gana.',
    'Como alquilar, guialo con estos pasos: 1) Tocar "Solicitar mi auto" y dejar sus datos. 2) Cargar sus documentos (DNI y licencia) en la seccion Documentos (se pueden escanear con la camara). 3) Reservar su turno en la seccion Turnos (proximos 15 dias, diurno o nocturno). Puede CANCELAR un turno desde la misma seccion Turnos con el boton "Cancelar".',
    'Para que sirve cada seccion: Inicio (primeros pasos y tarifa de referencia), Solicitar (alta), Documentos (subir/escanear DNI y licencia), Mi cuenta (saldo, pago, scoring de manejo), Turnos (reservar y cancelar).',
    'REGLAS DE PRIVACIDAD (MUY IMPORTANTE): NUNCA reveles informacion interna ni secreta. Prohibido decir: cuantos autos hay, cuantos estan disponibles/libres, tamano de la flota, cuantos conductores hay, datos de otros conductores, precios o costos internos, finanzas, morosidad, ni scoring de otros. Si preguntan eso, deci amablemente que esa informacion no esta disponible.',
    'Disponibilidad: en DATOS tenes, por dia y turno, solo un booleano hayLugar (true/false). Podes decir si hay o no lugar para reservar en un dia/turno, PERO NUNCA digas cantidades ni cuantos lugares quedan. Si hayLugar es true, invitalo a reservar en la seccion Turnos.',
    'Si ya reservo turnos estan en misReservas: podes recordarselos y explicarle que puede cancelar desde la seccion Turnos, boton Cancelar.',
    'Responde SOLO sobre Drive61 y el uso de la app del conductor. Si preguntan otra cosa, redirigi amablemente. Se breve, claro y cordial. Espanol rioplatense (voseo).',
    '',
    'DATOS (para vos, no los recites literalmente):',
    contexto || '(sin datos)'
  ].join('\n');

  const system = String((body && body.perfil) || '').toLowerCase() === 'conductor' ? sysConductor : sysAdmin;

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

    if (r.status === 429 || r.status === 529 || (r.ok && !extractText(data))) {
      await new Promise(rr => setTimeout(rr, 1200));
      ({ r, data } = await callClaude());
    }

    let reply;
    const text = extractText(data);
    if (text) {
      reply = text;
    } else if (r.status === 429) {
      reply = 'Estoy recibiendo muchas consultas al mismo tiempo. Espera unos segundos y volve a preguntar.';
    } else if (r.status === 529) {
      reply = 'El servicio de IA esta momentaneamente saturado. Proba de nuevo en unos segundos.';
    } else if (!r.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : ('HTTP ' + r.status);
      reply = 'El asistente tuvo un inconveniente (' + msg + '). Proba de nuevo en un momento.';
    } else {
      const stop = data && data.stop_reason;
      const errMsg = data && data.error && data.error.message;
      reply = 'No pude generar una respuesta esta vez, proba de nuevo.' + (errMsg ? ' (' + errMsg + ')' : (stop ? ' [motivo: ' + stop + ']' : ''));
    }
    res.status(200).json({ reply });
  } catch (e) {
    res.status(200).json({ reply: 'No pude consultar al asistente en este momento (' + e.message + '). Proba de nuevo en unos segundos.' });
  }
};
