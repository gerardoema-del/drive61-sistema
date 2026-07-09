/* =====================================================================
   Drive61 — Backend seguro del Asistente IA (Claude Sonnet)
   Función serverless de Vercel. La API key vive SOLO acá (variable de
   entorno ANTHROPIC_API_KEY en Vercel), nunca en el cliente.
   El cliente manda { pregunta, contexto } y recibe { reply }.
   ===================================================================== */
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ reply: 'Método no permitido.' }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(200).json({ reply: '⚠️ El asistente todavía no está activado. Falta cargar la API key de Anthropic en Vercel (variable de entorno ANTHROPIC_API_KEY). Una vez cargada, funciona sin tocar nada más.' });
    return;
  }

  const body = req.body || {};
  const pregunta = String(body.pregunta || '').slice(0, 2000);
  const contexto = String(body.contexto || '').slice(0, 12000);

  const system = [
    'Sos el asistente virtual del sistema "Drive61", un software de gestión para una empresa que ALQUILA autos a conductores que trabajan en Uber (el conductor paga una tarifa de alquiler y se queda con el resto de lo que gana).',
    '',
    'REGLAS ESTRICTAS:',
    '1. Respondé ÚNICAMENTE sobre Drive61 y su operación: conductores, autos/flota, agenda de asignaciones, telepeajes, multas, cobranzas/deuda, scoring de conducción, reportes y el uso del propio sistema. Si te preguntan cualquier otra cosa (temas generales, otros softwares, política, chismes, código, lo que sea ajeno a Drive61), respondé amablemente que solo podés ayudar con el sistema Drive61 y no con eso.',
    '2. Usá EXCLUSIVAMENTE los datos que aparecen abajo en "DATOS ACTUALES". Si un dato puntual no está ahí, decí claramente que no lo tenés en este momento. NUNCA inventes nombres, patentes, montos, cifras de dinero ni estadísticas. La plata y los números tienen que salir de los datos provistos, no de tu imaginación.',
    '3. Cuando des conclusiones o recomendaciones (ej. a quién conviene cobrarle primero, qué auto conviene revisar), basalas en los datos y explicá brevemente por qué.',
    '4. Sé breve, claro y concreto. Español rioplatense (voseo), tono profesional y amable.',
    '5. No prometas acciones que no podés ejecutar (no mandás mensajes ni modificás datos vos); si corresponde, sugerí qué hacer en el sistema.',
    '',
    'CONTEXTO DEL SISTEMA (módulos): Tablero gerencial (KPIs), Conductores (ficha 360), Flota, Agenda (asignación de autos por conductor/día/turno), Telepeajes, Multas, Cobranzas (con recordatorio por WhatsApp), Ituran/Scoring, CRM y Reportes. Los datos hoy son de demostración.',
    '',
    'DATOS ACTUALES:',
    contexto || '(sin datos)'
  ].join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: pregunta || 'Hola' }]
      })
    });
    const data = await r.json();
    let reply = 'Sin respuesta.';
    if (data && Array.isArray(data.content) && data.content[0] && data.content[0].text) reply = data.content[0].text;
    else if (data && data.error) reply = 'El asistente devolvió un error: ' + (data.error.message || 'desconocido') + '. Revisá la API key o el nombre del modelo.';
    res.status(200).json({ reply });
  } catch (e) {
    res.status(200).json({ reply: 'No pude consultar al asistente en este momento (' + e.message + ').' });
  }
}
