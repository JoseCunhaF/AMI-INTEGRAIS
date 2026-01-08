// js/calculos.js
// Lógica de cálculo (λ(t), P(t), integrais) separada do HTML

function toNumber(el) {
  const v = el.value.trim();
  return v === "" ? null : Number(v);
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function setHint() {
  const cenarioEl = document.getElementById("cenario");
  const hint = document.getElementById("cenarioHint");
  if (!cenarioEl || !hint) return;

  const c = cenarioEl.value;
  if (c === "normal") hint.textContent = "λ(t) = base + amp·sin(πt)";
  if (c === "pico") hint.textContent = "λ(t) = e^{-k·(t−t₀)²}";
  if (c === "poupanca") hint.textContent = "λ(t) = min(L, base + amp·sin(πt))";
}

function showError(msg) {
  const erro = document.getElementById("erro");
  if (!erro) return;
  erro.innerHTML = msg ? `<p style="color:#a40000;font-weight:600">${msg}</p>` : "";
}

function lambdaFactory({ cenario, base, amp, k, t0, limite }) {
  return function lambda(t) {
    let val;

    if (cenario === "normal") {
      // λ(t) = base + amp*sin(πt)
      val = base + amp * Math.sin(Math.PI * t);
    } else if (cenario === "pico") {
      // λ(t) = exp(-k*(t - t0)^2)
      val = Math.exp(-k * Math.pow(t - t0, 2));
    } else {
      // Poupança: λ(t) = min(L, base + amp*sin(πt))
      const normal = base + amp * Math.sin(Math.PI * t);
      val = Math.min(limite, normal);
    }

    // Carga relativa deve ficar entre 0 e 1
    return clamp01(val);
  };
}

function potenciaFactory({ pidle, pmax, lambda }) {
  // P(t) = P_idle + (P_max - P_idle) * λ(t)
  return function P(t) {
    return pidle + (pmax - pidle) * lambda(t);
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

  // t está em horas ⇒ resultado em Wh
  return (h / 2) * soma;
}

function integrarSimpson(P, a, b, n) {
  // n tem de ser par
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
  set("base", "0.5");
  set("amp", "0.3");
  set("k", "10");
  set("limite", "0.6");
  set("t0", "0.5");
  set("tarifa", "0.20");
  set("emissao", "0.25");

  showError("");
  setHint();
}

function main() {
  // Se estivermos no index.html, não existe form — sai
  const form = document.getElementById("form");
  if (!form) return;

  // Atualizar hint do cenário
  const cenarioEl = document.getElementById("cenario");
  if (cenarioEl) cenarioEl.addEventListener("change", setHint);
  setHint();

  // Botão "Exemplo"
  const btnExemplo = document.getElementById("btnExemplo");
  if (btnExemplo) btnExemplo.addEventListener("click", preencherExemplo);

  // Submit do formulário
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

    const base   = toNumber(document.getElementById("base"));
    const amp    = toNumber(document.getElementById("amp"));
    const k      = toNumber(document.getElementById("k"));
    const limite = toNumber(document.getElementById("limite"));
    const t0raw  = toNumber(document.getElementById("t0"));

    const tarifa  = toNumber(document.getElementById("tarifa"));
    const emissao = toNumber(document.getElementById("emissao"));

    // Validações
    if (a === null || b === null || n === null || pidle === null || pmax === null || base === null || amp === null || k === null || limite === null) {
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

    // Se t0 não vier, assume meio do intervalo
    const t0 = (t0raw === null) ? (a + b) / 2 : t0raw;

    // Construir funções
    const lambda = lambdaFactory({ cenario, base, amp, k, t0, limite });
    const P = potenciaFactory({ pidle, pmax, lambda });

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

    // Mostrar fórmulas usadas
    const formulas = [];
    formulas.push("Modelo: P(t) = P_idle + (P_max − P_idle)·λ(t)");
    if (cenario === "normal") formulas.push("Carga: λ(t) = base + amp·sin(πt)");
    if (cenario === "pico") formulas.push("Carga: λ(t) = e^{−k·(t−t₀)²}");
    if (cenario === "poupanca") formulas.push("Carga: λ(t) = min(L, base + amp·sin(πt))");
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
