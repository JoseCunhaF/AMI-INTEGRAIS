// js/calculos.js
// Lógica de cálculo (u(t), P(t), integrais) separada do HTML

function toNumber(el) {
  const v = el.value.trim();
  return v === "" ? null : Number(v);
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function showError(msg) {
  const erro = document.getElementById("erro");
  if (!erro) return;
  erro.innerHTML = msg ? `<p style="color:#a40000;font-weight:600">${msg}</p>` : "";
}

function setHintAndMetodo() {
  const cenarioEl = document.getElementById("cenario");
  const hint = document.getElementById("cenarioHint");
  const metodoEl = document.getElementById("metodo");
  const nEl = document.getElementById("n");

  if (!cenarioEl || !hint) return;

  const c = cenarioEl.value;

  // Hints coerentes com o relatório
  if (c === "normal") hint.textContent = "u(t) = base + amp·sin(πt)";
  if (c === "pico") hint.textContent = "u(t) = base + amp·e^{−k·(t−t₀)²}";
  if (c === "poupanca") hint.textContent = "P(t) = min(P_normal(t), L)  (L em W)";

  // Recomendação automática do método (pode ser alterado pelo utilizador)
  if (metodoEl) {
    if (c === "poupanca") {
      metodoEl.value = "trapezios";
    } else {
      metodoEl.value = "simpson";
    }
  }

  // Nota: se Simpson e n ímpar, o submit vai validar e pedir n par
  // (mantemos simples e robusto)
  if (metodoEl && nEl && metodoEl.value === "simpson") {
    const n = toNumber(nEl);
    if (n !== null && Number.isInteger(n) && n > 0 && (n % 2 !== 0)) {
      // Não bloqueia já, mas informa
      hint.textContent += " — (para Simpson, usa n par)";
    }
  }
}

// u(t): carga relativa (0..1)
function cargaFactory({ cenario, base, amp, k, t0 }) {
  return function u(t) {
    let val;

    if (cenario === "pico") {
      // Pico (Ivo): u(t) = base + amp * exp(-k*(t - t0)^2)
      val = base + amp * Math.exp(-k * Math.pow(t - t0, 2));
    } else {
      // Normal (José) e base para poupança (Rúben): u(t) = base + amp*sin(pi t)
      val = base + amp * Math.sin(Math.PI * t);
    }

    return clamp01(val);
  };
}

// Potência
function potenciaFactory({ cenario, pidle, pmax, u, limiteW }) {
  // P_normal(t) = P_idle + (P_max - P_idle) * u(t)
  return function P(t) {
    const Pnormal = pidle + (pmax - pidle) * u(t);

    if (cenario === "poupanca") {
      // Política de poupança (Rúben): limitar potência em Watts
      return Math.min(limiteW, Pnormal);
    }

    return Pnormal;
  };
}

function integrarTrapezios(P, a, b, n) {
  const h = (b - a) / n;
  let soma = 0;

  for (let i = 0; i <= n; i++) {
    const t = a + i * h;
    const peso = (i === 0 || i === n) ? 1 : 2;
    soma += peso * P(t);
  }

  // t em horas ⇒ Wh
  return (h / 2) * soma;
}

function integrarSimpson(P, a, b, n) {
  const h = (b - a) / n;
  let soma = P(a) + P(b);

  for (let i = 1; i < n; i++) {
    const t = a + i * h;
    soma += (i % 2 === 0 ? 2 : 4) * P(t);
  }

  // t em horas ⇒ Wh
  return (h / 3) * soma;
}

function preencherExemplo() {
  // Valores típicos do relatório
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  set("a", "0");
  set("b", "1");
  set("n", "1000");
  set("pidle", "120");
  set("pmax", "320");

  // Normal: base + amp*sin(pi t)
  set("base", "0.5");
  set("amp", "0.3");

  // Pico: base + amp*gaussiana
  set("k", "10");
  set("t0", "0.5");

  // Poupança: L em Watts (no relatório: 260 W)
  set("limite", "260");

  // Opcionais (Rafael)
  set("tarifa", "0.20");
  set("emissao", "0.25");

  showError("");
  setHintAndMetodo();
}

function main() {
  const form = document.getElementById("form");
  if (!form) return;

  // Atualizar hint e método recomendado
  const cenarioEl = document.getElementById("cenario");
  const nEl = document.getElementById("n");
  if (cenarioEl) cenarioEl.addEventListener("change", setHintAndMetodo);
  if (nEl) nEl.addEventListener("input", setHintAndMetodo);
  setHintAndMetodo();

  // Botão "Exemplo"
  const btnExemplo = document.getElementById("btnExemplo");
  if (btnExemplo) btnExemplo.addEventListener("click", preencherExemplo);

  // Submit
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    showError("");

    const cenario = document.getElementById("cenario").value;
    const metodo = document.getElementById("metodo").value;

    const a = toNumber(document.getElementById("a"));
    const b = toNumber(document.getElementById("b"));
    const n = toNumber(document.getElementById("n"));

    const pidle = toNumber(document.getElementById("pidle"));
    const pmax  = toNumber(document.getElementById("pmax"));

    const base = toNumber(document.getElementById("base"));
    const amp  = toNumber(document.getElementById("amp"));

    const k      = toNumber(document.getElementById("k"));
    const limite = toNumber(document.getElementById("limite")); // Watts na poupança
    const t0raw  = toNumber(document.getElementById("t0"));

    const tarifa  = toNumber(document.getElementById("tarifa"));
    const emissao = toNumber(document.getElementById("emissao"));

    // Validações base
    if (a === null || b === null || n === null || pidle === null || pmax === null || base === null || amp === null) {
      showError("Preenche todos os campos obrigatórios.");
      return;
    }
    if (!(b > a)) {
      showError("O limite superior b tem de ser maior do que a.");
      return;
    }
    if (!Number.isInteger(n) || n <= 0) {
      showError("n tem de ser um inteiro positivo.");
      return;
    }
    if (pmax < pidle) {
      showError("Pmax deve ser ≥ Pidle.");
      return;
    }
    if (metodo === "simpson" && (n % 2 !== 0)) {
      showError("Para Simpson, n tem de ser par.");
      return;
    }

    // Validações por cenário
    if (cenario === "pico") {
      if (k === null) {
        showError("No cenário Pico, o parâmetro k é obrigatório.");
        return;
      }
      if (k <= 0) {
        showError("No cenário Pico, k deve ser > 0.");
        return;
      }
    }

    if (cenario === "poupanca") {
      if (limite === null) {
        showError("No cenário Poupança, o limite máximo L (em W) é obrigatório.");
        return;
      }
      if (limite <= 0) {
        showError("No cenário Poupança, L deve ser > 0 (em W).");
        return;
      }
    }

    // Se t0 não vier, assume meio do intervalo
    const t0 = (t0raw === null) ? (a + b) / 2 : t0raw;

    // Construir funções
    const u = cargaFactory({ cenario, base, amp, k: (k ?? 1), t0 });
    const P = potenciaFactory({
      cenario,
      pidle,
      pmax,
      u,
      limiteW: (limite ?? Infinity)
    });

    // Integrar (Wh)
    const Wh = (metodo === "simpson")
      ? integrarSimpson(P, a, b, n)
      : integrarTrapezios(P, a, b, n);

    const kWh = Wh / 1000;

    // Mostrar resultados
    const out = document.getElementById("out");
    if (out) out.style.display = "block";

    document.getElementById("energia").textContent = kWh.toFixed(6);
    document.getElementById("energiaWh").textContent = Wh.toFixed(3);

    // Custo e CO2 (opcionais)
    document.getElementById("custo").textContent =
      (tarifa === null) ? "—" : (kWh * tarifa).toFixed(4);

    document.getElementById("co2").textContent =
      (emissao === null) ? "—" : (kWh * emissao).toFixed(4);

    // Fórmulas usadas
    const formulas = [];
    formulas.push("Modelo: P_normal(t) = P_idle + (P_max − P_idle)·u(t)");
    if (cenario === "normal") formulas.push("Carga: u(t) = base + amp·sin(πt)");
    if (cenario === "pico") formulas.push("Carga: u(t) = base + amp·e^{−k·(t−t₀)²}");
    if (cenario === "poupanca") formulas.push("Poupança: P(t) = min(P_normal(t), L)  (L em W)");
    formulas.push(`Integral: E = ∫[${a}, ${b}] P(t) dt (tempo em horas)`);
    formulas.push("Conversão: kWh = (∫ P(t) dt em Wh) / 1000");

    const formulasEl = document.getElementById("formulasUsadas");
    if (formulasEl) {
      formulasEl.innerHTML =
        "<strong>Fórmulas usadas:</strong><br>" +
        formulas.map(s => "• " + s).join("<br>");
    }
  });
}

document.addEventListener("DOMContentLoaded", main);
