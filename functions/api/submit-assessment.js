/* ==========================================================================
   Greenlight AI — funzione serverless "submit-assessment"
   Deploy in: /functions/api/submit-assessment.js  (convenzione Cloudflare Pages Functions)

   Cosa fa, in ordine:
   1. Riceve { name, email, company, answers } dal quiz custom del sito.
   2. Ricalcola il punteggio lato server (fonte "ufficiale" del punteggio,
      indipendente da quanto mostrato subito lato client).
   3. Salva/aggiorna il contatto su HubSpot (piano gratuito, via API) con
      punteggio totale, anello assegnato e punteggio per dimensione.
   4. Invia l'email di risultato personalizzata tramite Resend.com.

   VARIABILI D'AMBIENTE DA CONFIGURARE (Cloudflare Pages → Settings →
   Environment variables, NON hardcodare le chiavi in questo file):
     - HUBSPOT_PRIVATE_APP_TOKEN   token di una Private App HubSpot con
                                    scope "crm.objects.contacts.write"
     - RESEND_API_KEY              chiave API da resend.com
     - RESEND_FROM_EMAIL           mittente verificato su Resend,
                                    es. "Greenlight AI <hello@fernandocarta.it>"
     - BOOKING_URL                 link di prenotazione call (facoltativo,
                                    default sotto)

   PROPRIETÀ HUBSPOT: dato il limite di 10 proprietà personalizzate del piano
   gratuito, tutti i dati dell'assessment (punteggio totale, anello, dettaglio
   per competenza, data di completamento) confluiscono in un'unica proprietà
   contatto di tipo "Rich text":
     - greenlight_data   (nome interno: greenlight_data)
   Nome, cognome, email e azienda usano invece le proprietà standard di
   HubSpot (firstname, lastname, email, company), che non consumano lo slot
   delle proprietà personalizzate.
   Nota: essendo un campo rich text (testo formattato), non è filtrabile né
   ordinabile in una lista HubSpot come lo sarebbe stato un campo numerico —
   va bene per consultare il risultato sulla scheda contatto, non per
   segmentare i contatti per punteggio. Se in futuro si libera uno slot di
   proprietà personalizzata, si può tornare a un campo "Numero" dedicato.
   Se la proprietà non esiste, la chiamata HubSpot fallisce con errore 400:
   in quel caso l'email viene comunque inviata (i due passaggi sono
   indipendenti, vedi in fondo al file).
   ========================================================================== */

// Stesse identiche domande e stesso punteggio di assets/assessment.js.
// Duplicate qui perché il sito è statico e non usa un bundler: se si
// modifica una domanda o un punteggio, aggiornare in entrambi i file.
const QUESTIONS = [
  { id: "q1", dim: "delegation" },
  { id: "q2", dim: "delegation" },
  { id: "q3", dim: "description" },
  { id: "q4", dim: "description" },
  { id: "q5", dim: "discernment" },
  { id: "q6", dim: "discernment" },
  { id: "q7", dim: "diligence" },
  { id: "q8", dim: "diligence" },
  { id: "q9", dim: "normativa" },
  { id: "q10", dim: "normativa" },
];

const VALID_POINTS = [0, 5, 10, 15, 20];

const DIM_LABELS = {
  delegation: "Delegation",
  description: "Description",
  discernment: "Discernment",
  diligence: "Diligence",
  normativa: "Consapevolezza normativa",
};

const RINGS = [
  { min: 0, max: 40, kanji: "地", romaji: "Chi", label: "Anello Chi", title: "Il punto di partenza",
    text: "La vostra azienda usa l'AI, ma senza una mappa. È il punto normale da cui parte chi non ha ancora affrontato il tema in modo strutturato.",
    next: "Il primo passo utile è mappare il contesto (anello Chi) con una prima serie di interviste a direzione, legal e IT." },
  { min: 41, max: 80, kanji: "水", romaji: "Sui", label: "Anello Sui", title: "Le prime domande giuste",
    text: "Qualcosa si muove, ma in modo disomogeneo tra i team. È il momento di capire come l'AI attraversa davvero ogni ruolo.",
    next: "Il passo utile ora è una mappatura ruoli × modalità × rischio, per vedere dove serve più controllo." },
  { min: 81, max: 120, kanji: "火", romaji: "Ka", label: "Anello Ka", title: "Pronti per le regole",
    text: "Avete già consapevolezza e alcune buone pratiche isolate. Il passo che manca è trasformarle in regole scritte e condivise.",
    next: "Il momento è giusto per trasformare le buone pratiche in regole scritte — il cuore del metodo Greenlight AI." },
  { min: 121, max: 160, kanji: "風", romaji: "Fū", label: "Anello Fū", title: "Serve solo la governance",
    text: "Siete più avanti della maggior parte delle aziende italiane su questo tema. Manca probabilmente solo la governance.",
    next: "Manca probabilmente solo la governance: un owner della policy e un ciclo di revisione periodico." },
  { min: 161, max: 200, kanji: "空", romaji: "Kū", label: "Anello Kū", title: "Quasi fluidità totale",
    text: "Poche aziende arrivano a questo livello. La disciplina è quasi un istinto.",
    next: "La sfida ora è mantenere la disciplina mentre l'azienda cresce — vale la pena una revisione periodica strutturata." },
];

function pickRing(score) {
  return RINGS.find((r) => score >= r.min && score <= r.max) || RINGS[0];
}

function computeScores(rawAnswers) {
  const perDim = { delegation: 0, description: 0, discernment: 0, diligence: 0, normativa: 0 };
  let total = 0;
  for (const q of QUESTIONS) {
    let pts = Number(rawAnswers ? rawAnswers[q.id] : 0);
    if (!VALID_POINTS.includes(pts)) pts = 0; // scarta valori manomessi/non validi
    perDim[q.dim] += pts;
    total += pts;
  }
  return { total, perDim };
}

function buildEmailHtml({ name, score, ring, perDim, bookingUrl }) {
  const dimRows = Object.keys(perDim)
    .map((k) => `<tr><td style="padding:4px 0;color:#1F3A5F;">${DIM_LABELS[k]}</td><td style="padding:4px 0;text-align:right;color:#B08D3F;font-weight:700;">${perDim[k]}/40</td></tr>`)
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
    <p style="letter-spacing:0.1em;text-transform:uppercase;font-size:12px;color:#B08D3F;font-weight:700;">Greenlight AI</p>
    <h1 style="font-size:22px;color:#1F3A5F;margin:8px 0 24px;">Il tuo punteggio Greenlight AI</h1>
    <p>Ciao${name ? " " + name : ""},</p>
    <p>Grazie per aver completato l'assessment Greenlight AI.</p>
    <table style="width:100%;background:#F4F5F7;border-radius:8px;padding:20px;margin:20px 0;border-collapse:collapse;">
      <tr><td style="font-size:32px;font-weight:700;color:#1F3A5F;">${score}<span style="font-size:16px;color:#595959;font-weight:400;"> / 200</span></td></tr>
      <tr><td style="padding-top:6px;color:#B08D3F;font-weight:700;">${ring.kanji} ${ring.label} — ${ring.title}</td></tr>
    </table>
    <p style="color:#2b2b2b;">${ring.text}</p>
    <h3 style="color:#1F3A5F;font-size:15px;margin-top:24px;">Dettaglio per competenza</h3>
    <table style="width:100%;border-collapse:collapse;">${dimRows}</table>
    <div style="background:#1F3A5F;color:#fff;border-radius:8px;padding:18px 20px;margin:24px 0;">
      <p style="margin:0 0 6px;color:#D9C48C;font-weight:700;font-size:14px;">Prossimo passo consigliato</p>
      <p style="margin:0;color:#E8EDF3;">${ring.next}</p>
    </div>
    <p style="text-align:center;margin:28px 0;">
      <a href="${bookingUrl}" style="background:#B08D3F;color:#13233B;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;display:inline-block;">Prenota una call gratuita di 20 minuti</a>
    </p>
    <p style="font-size:12px;color:#595959;margin-top:32px;">Hai ricevuto questa email perché hai completato l'assessment Greenlight AI con questo indirizzo. Non condividiamo i tuoi dati con terzi.</p>
  </div>`;
}

// Costruisce il contenuto della proprietà unica "greenlight_data" (Rich text):
// un unico blocco HTML leggibile con punteggio, anello e dettaglio per
// competenza, così da stare in un solo slot di proprietà personalizzata.
function buildHubspotDataHtml({ total, ring, perDim }) {
  const dimList = Object.keys(perDim)
    .map((k) => `<li>${DIM_LABELS[k]}: <strong>${perDim[k]}/40</strong></li>`)
    .join("");
  const completedOn = new Date().toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  return (
    `<p><strong>Punteggio Greenlight AI: ${total}/200</strong></p>` +
    `<p>Anello: ${ring.kanji} ${ring.romaji} — ${ring.title}</p>` +
    `<p>Dettaglio per competenza:</p>` +
    `<ul>${dimList}</ul>` +
    `<p><em>Assessment completato il ${completedOn}</em></p>`
  );
}

async function saveToHubspot(env, { name, email, company, total, ring, perDim }) {
  if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
    console.warn("HUBSPOT_PRIVATE_APP_TOKEN non configurata: salto il salvataggio su HubSpot.");
    return { skipped: true };
  }
  const [firstname, ...rest] = (name || "").split(" ");
  const lastname = rest.join(" ");

  const body = {
    inputs: [
      {
        idProperty: "email",
        id: email,
        properties: {
          email: email,
          firstname: firstname || undefined,
          lastname: lastname || undefined,
          company: company || undefined,
          greenlight_data: buildHubspotDataHtml({ total, ring, perDim }),
        },
      },
    ],
  };

  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.HUBSPOT_PRIVATE_APP_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Errore HubSpot:", res.status, errText);
    return { ok: false, status: res.status, error: errText };
  }
  return { ok: true };
}

async function sendResultEmail(env, { name, email, total, ring, perDim }) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.warn("RESEND_API_KEY o RESEND_FROM_EMAIL non configurate: salto l'invio email.");
    return { skipped: true };
  }
  const bookingUrl = env.BOOKING_URL || "https://meetings-eu1.hubspot.com/fernando-carta";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `Il tuo punteggio Greenlight AI: ${total}/200 — ${ring.label}`,
      html: buildEmailHtml({ name, score: total, ring, perDim, bookingUrl }),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Errore Resend:", res.status, errText);
    return { ok: false, status: res.status, error: errText };
  }
  return { ok: true };
}

// Handler Cloudflare Pages Functions per POST /api/submit-assessment
export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "JSON non valido" }), { status: 400 });
  }

  const { name, email, company, answers } = payload || {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, error: "Email mancante o non valida" }), { status: 400 });
  }

  const { total, perDim } = computeScores(answers);
  const ring = pickRing(total);

  // I due passaggi sono indipendenti: se HubSpot fallisce, proviamo comunque
  // a mandare l'email, e viceversa. L'utente ha già visto il risultato in
  // pagina indipendentemente da questa chiamata.
  const [hubspotResult, emailResult] = await Promise.all([
    saveToHubspot(env, { name, email, company, total, ring, perDim }).catch((e) => ({ ok: false, error: String(e) })),
    sendResultEmail(env, { name, email, total, ring, perDim }).catch((e) => ({ ok: false, error: String(e) })),
  ]);

  return new Response(
    JSON.stringify({ ok: true, score: total, ring: ring.romaji, hubspot: hubspotResult, email: emailResult }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// Risponde alle eventuali richieste OPTIONS (preflight CORS), utile solo se
// in futuro il form viene chiamato da un dominio diverso da quello del sito.
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
