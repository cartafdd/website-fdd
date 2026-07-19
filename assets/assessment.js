/* ==========================================================================
   Greenlight AI — logica dell'assessment
   Deploy in: /assets/assessment.js

   NOTA IMPORTANTE SUL PUNTEGGIO
   Questo file calcola il punteggio lato client per mostrare il risultato
   istantaneamente (stessa UX del sito di riferimento). Le stesse identiche
   domande e stesso punteggio sono RIPETUTE lato server in
   functions/api/submit-assessment.js, che è la fonte "ufficiale" usata per
   salvare il contatto su HubSpot e per il testo dell'email. Se si modifica
   una domanda o un punteggio qui, va aggiornato anche là — sono due file
   distinti perché il sito è statico e non usa un bundler.
   ========================================================================== */

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Dati: le 10 domande, 2 per ciascuna delle 4D + consapevolezza normativa
  // ---------------------------------------------------------------------
  const QUESTIONS = [
    {
      id: "q1", dim: "delegation",
      text: "Quanto è chiaro, oggi, cosa la vostra azienda affida all'AI e cosa no?",
      options: [
        "Non ne abbiamo mai discusso",
        "Ne abbiamo parlato informalmente, senza decisioni",
        "Alcuni team hanno regole proprie, non condivise",
        "Esistono indicazioni condivise per le attività principali",
        "È chiaro per ogni ruolo cosa si può delegare e con quale autonomia"
      ]
    },
    {
      id: "q2", dim: "delegation",
      text: "La vostra azienda ha mai usato agenti AI autonomi (che agiscono senza supervisione diretta)?",
      options: [
        "Non sappiamo nemmeno cosa significhi",
        "No, e non ci abbiamo pensato",
        "Qualcuno li ha provati informalmente",
        "Sì, in modo controllato su attività specifiche",
        "Sì, con regole esplicite su dove sono ammessi e dove no"
      ]
    },
    {
      id: "q3", dim: "description",
      text: "Cosa succede oggi se qualcuno inserisce dati riservati (clienti, contratti, credenziali) in uno strumento AI?",
      options: [
        "Non lo sappiamo, potrebbe già succedere",
        "Sospettiamo che succeda, non l'abbiamo mai verificato",
        "È scoraggiato informalmente, senza controlli",
        "Esistono indicazioni scritte su cosa non condividere",
        "È chiaro, documentato e verificato per ogni team"
      ]
    },
    {
      id: "q4", dim: "description",
      text: "Avete standard condivisi su come istruire l'AI (prompt) per i casi d'uso ricorrenti?",
      options: [
        "No, ognuno fa come vuole",
        "Qualche buona pratica informale",
        "Alcuni team hanno librerie proprie",
        "Esistono standard condivisi per i casi principali",
        "Standard documentati, mantenuti e aggiornati"
      ]
    },
    {
      id: "q5", dim: "discernment",
      text: "Prima di usare un output generato dall'AI, quanto viene verificato?",
      options: [
        "Raramente o mai",
        "Dipende dalla persona",
        "C'è una prassi informale di verifica",
        "Esiste un livello minimo di verifica richiesto",
        "Verifica strutturata, proporzionata al rischio dell'output"
      ]
    },
    {
      id: "q6", dim: "discernment",
      text: "È già capitato un errore in un output AI arrivato a un cliente o pubblicato?",
      options: [
        "Non lo sapremmo dire",
        "Probabilmente sì, non gestito formalmente",
        "Sì, gestito caso per caso",
        "Sì, e abbiamo imparato qualcosa da quell'episodio",
        "Non ancora, ma abbiamo un processo pronto se succedesse"
      ]
    },
    {
      id: "q7", dim: "diligence",
      text: "Chi è responsabile, oggi, di un contenuto o una decisione realizzata con l'aiuto dell'AI?",
      options: [
        "Nessuno in particolare",
        "In teoria chi la pubblica, ma non è mai stato detto esplicitamente",
        "Dipende dal team",
        "È chiaro per le attività principali",
        "È chiaro, scritto e conosciuto da tutti"
      ]
    },
    {
      id: "q8", dim: "diligence",
      text: "Le decisioni che riguardano le persone (selezione, valutazione, credito) si basano mai solo sull'AI?",
      options: [
        "Non lo sappiamo",
        "Non crediamo, ma non l'abbiamo verificato",
        "Solo come supporto, senza regole scritte",
        "È vietato esplicitamente, informalmente",
        "È vietato, scritto e verificato"
      ]
    },
    {
      id: "q9", dim: "normativa",
      text: "Quanto conoscete gli obblighi che EU AI Act e GDPR impongono sull'uso dell'AI in azienda?",
      options: [
        "Non ne abbiamo mai sentito parlare",
        "Ne abbiamo sentito parlare, non sappiamo cosa comporti per noi",
        "Sappiamo che ci riguarda, non l'abbiamo approfondito",
        "Abbiamo iniziato a valutare l'impatto",
        "Sappiamo esattamente cosa si applica a noi e da quando"
      ]
    },
    {
      id: "q10", dim: "normativa",
      text: "Avete un documento di policy sull'uso dell'AI, anche minimo?",
      options: [
        "No, e non ci abbiamo pensato",
        "Ne abbiamo parlato, non è mai stato scritto",
        "Esiste una bozza non ancora condivisa",
        "Esiste ma copre solo alcune aree o team",
        "Sì, completa, condivisa e aggiornata"
      ]
    }
  ];

  const POINTS = [0, 5, 10, 15, 20];

  const DIM_LABELS = {
    delegation: "Delegation",
    description: "Description",
    discernment: "Discernment",
    diligence: "Diligence",
    normativa: "Consapevolezza normativa"
  };

  const DIM_ORDER = ["delegation", "description", "discernment", "diligence", "normativa"];

  // ---------------------------------------------------------------------
  // Le 5 fasce di risultato — i Cinque Anelli
  // ---------------------------------------------------------------------
  const RINGS = [
    {
      min: 0, max: 40, kanji: "地", romaji: "Chi", label: "Anello Chi",
      title: "Il punto di partenza",
      text: "La vostra azienda usa l'AI, ma senza una mappa. È il punto normale da cui parte chi non ha ancora affrontato il tema in modo strutturato — non è un problema, è un'opportunità di partire con ordine invece di rincorrere dopo.",
      next: "Il primo passo utile è mappare il contesto (anello Chi) con una prima serie di interviste a direzione, legal e IT."
    },
    {
      min: 41, max: 80, kanji: "水", romaji: "Sui", label: "Anello Sui",
      title: "Le prime domande giuste",
      text: "Qualcosa si muove, ma in modo disomogeneo tra i team. È il momento di capire come l'AI attraversa davvero ogni ruolo, prima che le pratiche informali diventino un'abitudine difficile da correggere.",
      next: "Il passo utile ora è una mappatura ruoli × modalità × rischio, per vedere dove serve più controllo."
    },
    {
      min: 81, max: 120, kanji: "火", romaji: "Ka", label: "Anello Ka",
      title: "Pronti per le regole",
      text: "Avete già consapevolezza e alcune buone pratiche isolate. Il passo che manca è trasformarle in regole scritte, condivise e coerenti tra i team.",
      next: "Il momento è giusto per trasformare le buone pratiche in regole scritte — il cuore del metodo Greenlight AI."
    },
    {
      min: 121, max: 160, kanji: "風", romaji: "Fū", label: "Anello Fū",
      title: "Serve solo la governance",
      text: "Siete più avanti della maggior parte delle aziende italiane su questo tema. Ciò che spesso manca a questo livello è la governance: un owner della policy, un processo di revisione, un canale di segnalazione.",
      next: "Manca probabilmente solo la governance: un owner della policy e un ciclo di revisione periodico."
    },
    {
      min: 161, max: 200, kanji: "空", romaji: "Kū", label: "Anello Kū",
      title: "Quasi fluidità totale",
      text: "Poche aziende arrivano a questo livello. La disciplina è quasi un istinto: la sfida ora è mantenerla mentre l'azienda cresce e gli strumenti cambiano.",
      next: "La sfida ora è mantenere la disciplina mentre l'azienda cresce — vale la pena una revisione periodica strutturata."
    }
  ];

  function pickRing(score) {
    return RINGS.find(function (r) { return score >= r.min && score <= r.max; }) || RINGS[0];
  }

  // ---------------------------------------------------------------------
  // Stato
  // ---------------------------------------------------------------------
  const answers = {}; // { q1: pointsValue, ... }
  let contact = { name: "", email: "", company: "" };

  const PART_1 = QUESTIONS.slice(0, 5);
  const PART_2 = QUESTIONS.slice(5, 10);

  // ---------------------------------------------------------------------
  // Rendering delle domande
  // ---------------------------------------------------------------------
  function renderPart(containerId, questions, onChange) {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    questions.forEach(function (q, idx) {
      const block = document.createElement("div");
      block.className = "q-block";

      const num = document.createElement("div");
      num.className = "q-num";
      num.textContent = "Domanda " + (QUESTIONS.indexOf(q) + 1) + " di " + QUESTIONS.length;
      block.appendChild(num);

      const text = document.createElement("div");
      text.className = "q-text";
      text.textContent = q.text;
      block.appendChild(text);

      const list = document.createElement("div");
      list.className = "opt-list";

      q.options.forEach(function (optText, i) {
        const label = document.createElement("label");
        label.className = "opt";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = q.id;
        input.value = POINTS[i];

        input.addEventListener("change", function () {
          answers[q.id] = POINTS[i];
          list.querySelectorAll(".opt").forEach(function (o) { o.classList.remove("selected"); });
          label.classList.add("selected");
          onChange();
        });

        const span = document.createElement("span");
        span.textContent = optText;

        label.appendChild(input);
        label.appendChild(span);
        list.appendChild(label);
      });

      block.appendChild(list);
      el.appendChild(block);
    });
  }

  function allAnswered(questions) {
    return questions.every(function (q) { return answers.hasOwnProperty(q.id); });
  }

  // ---------------------------------------------------------------------
  // Navigazione tra step
  // ---------------------------------------------------------------------
  const stepIntro = document.getElementById("step-intro");
  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");
  const stepResults = document.getElementById("step-results");

  const toStep2Btn = document.getElementById("to-step-2");
  const seeResultsBtn = document.getElementById("see-results");

  document.getElementById("intro-form").addEventListener("submit", function (e) {
    e.preventDefault();
    contact.name = document.getElementById("i-name").value.trim();
    contact.email = document.getElementById("i-email").value.trim();
    contact.company = document.getElementById("i-company").value.trim();

    stepIntro.classList.add("hidden");
    step1.classList.remove("hidden");
    renderPart("quiz-part-1", PART_1, function () {
      toStep2Btn.disabled = !allAnswered(PART_1);
      document.getElementById("progress-1").style.width =
        (Object.keys(answers).filter(k => PART_1.some(q => q.id === k)).length / PART_1.length * 50) + "%";
    });
  });

  toStep2Btn.addEventListener("click", function () {
    step1.classList.add("hidden");
    step2.classList.remove("hidden");
    renderPart("quiz-part-2", PART_2, function () {
      seeResultsBtn.disabled = !allAnswered(PART_2);
      document.getElementById("progress-2").style.width =
        (50 + Object.keys(answers).filter(k => PART_2.some(q => q.id === k)).length / PART_2.length * 50) + "%";
    });
    window.scrollTo({ top: step2.offsetTop - 100, behavior: "smooth" });
  });

  document.getElementById("back-to-1").addEventListener("click", function () {
    step2.classList.add("hidden");
    step1.classList.remove("hidden");
  });

  seeResultsBtn.addEventListener("click", function () {
    step2.classList.add("hidden");
    stepResults.classList.remove("hidden");
    showResults();
    submitToBackend();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---------------------------------------------------------------------
  // Calcolo e rendering del risultato
  // ---------------------------------------------------------------------
  function computeScores() {
    const perDim = { delegation: 0, description: 0, discernment: 0, diligence: 0, normativa: 0 };
    let total = 0;
    QUESTIONS.forEach(function (q) {
      const pts = answers[q.id] || 0;
      perDim[q.dim] += pts;
      total += pts;
    });
    return { total: total, perDim: perDim };
  }

  function showResults() {
    const scores = computeScores();
    const ring = pickRing(scores.total);

    // Gauge SVG: circonferenza = 2 * PI * 84 ≈ 527.8
    const CIRCUMFERENCE = 527.8;
    const pct = scores.total / 200;
    const arc = document.getElementById("gauge-arc");
    const scoreText = document.getElementById("gauge-score-text");
    // piccola animazione: parte da offset pieno e anima verso il valore finale
    requestAnimationFrame(function () {
      arc.style.transition = "stroke-dashoffset 1.1s ease";
      arc.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - pct)));
    });
    animateNumber(scoreText, 0, scores.total, 1100);

    document.getElementById("ring-kanji").textContent = ring.kanji;
    document.getElementById("ring-label").textContent = ring.label + " — " + ring.title;

    // Barre per dimensione
    const dimGrid = document.getElementById("dim-grid");
    dimGrid.innerHTML = "";
    DIM_ORDER.forEach(function (dimKey) {
      const val = scores.perDim[dimKey];
      const card = document.createElement("div");
      card.className = "dim-card";
      card.innerHTML =
        '<div class="dim-card__top"><span>' + DIM_LABELS[dimKey] + '</span><span>' + val + '/40</span></div>' +
        '<div class="dim-bar-track"><div class="dim-bar-fill" style="width:0%;"></div></div>';
      dimGrid.appendChild(card);
      const fill = card.querySelector(".dim-bar-fill");
      requestAnimationFrame(function () {
        fill.style.width = (val / 40 * 100) + "%";
      });
    });

    document.getElementById("meaning-text").textContent = ring.text;
    document.getElementById("next-step-text").textContent = ring.next;
    document.getElementById("email-note").textContent =
      "Ti abbiamo anche inviato questo risultato via email a " + contact.email + ".";
  }

  function animateNumber(el, from, to, duration) {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(from + (to - from) * progress);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------
  // Invio al backend: salva il lead su HubSpot e manda l'email di risultato.
  // Il calcolo qui sopra serve solo per mostrare il risultato all'istante;
  // il punteggio "ufficiale" viene ricalcolato lato server per sicurezza
  // (vedi functions/api/submit-assessment.js).
  // ---------------------------------------------------------------------
  function submitToBackend() {
    fetch("/api/submit-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: contact.name,
        email: contact.email,
        company: contact.company,
        answers: answers // { q1: 15, q2: 20, ... }
      })
    }).catch(function (err) {
      // Non blocchiamo l'esperienza utente se l'invio fallisce: il punteggio
      // è già visibile in pagina. Logghiamo solo in console per debug.
      console.error("Invio assessment fallito:", err);
    });
  }

})();
