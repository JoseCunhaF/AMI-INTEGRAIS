// js/calculos.js
// Lógica de cálculo (u(t), P(t), integrais) separada do HTML
// Resultados acumulados (não desaparecem ao trocar cenário)

// CO2 calculado automaticamente (o utilizador NÃO insere nada)
const EMISSAO_CO2_KG_POR_KWH = 0.25; // ajusta apenas se o relatório usar outro valor

function toNumber(el) {
  if (!el) return null;
  const v = String(el.value ?? "").trim();
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

// Nome bonito para mostrar nos resultados
function nomeCenario(c) {
  if (c === "normal") return "Funcionamento normal";
  if (c === "pico") return "Pico de utilização";
  if (c === "poupanca") return "Poupança energética";
  return c;
}

// Recomendação automática do método (sem hints)
function setMetodoRecomendado() {
  const cenarioEl = document.getElementById("cenario");
  const metodoEl = document.getElementById("metodo");
  if (!cenarioEl || !metodoEl) return;

  const c = cenarioEl.value;
  metodoEl.value = (c === "poupanca") ? "trapezios" : "simpson";
}

/* ==========================
   UI dinâmica por cenário
   ========================== */

function setFieldState(
  inputId,
  { show = true, required = false, clearWhenHide = true, blockId = null } = {}
) {
  const el = document.getElementById(inputId);
  if (!el) return;

  const block =
    (blockId ? document.getElementById(blockId) : null) ||
    el.closest("div") ||
    el.parentElement;

  if (block) block.style.display = show ? "" : "none";

  // quando escondido, desativa (não interfere com validação HTML e nem com cálculo)
  el.disabled = !show;
  el.required = !!(show && required);

  if (!show && clearWhenHide) el.value = "";
}

function applyScenarioUI() {
  const cenarioEl = document.getElementById("cenario");
  if (!cenarioEl) return;

  const c = cenarioEl.value;

  // Pico: t0 (opcional), k (obrigatório)
  setFieldState("t0", { show: c === "pico", required: false, blockId: "block-t0" });
  setFieldState("k",  { show: c === "pico", required: true,  blockId: "block-k" });

  // Poupança: limite (obrigatório)
  setFieldState("limite", { show: c === "poupanca", required: true, blockId: "block-limite" });

  // Tarifa sempre visível (custo em todos os cenários)
  const tarifaEl = document.getElementById("tarifa");
  if (tarifaEl) {
    tarifaEl.disabled = false;
    tarifaEl.required = false;
  }

  // IMPORTANTE: NÃO TOCAR NO #out AQUI
  // (para manter os resultados visíveis ao trocar cenário)

  // Limpar apenas erros
  showError("");
}

/* ==========================
   Modelo matemático
   ========================== */

// u(t): carga relativa (0..1)
function cargaFactory({ cenario, base, amp, k, t0 }) {
  return function u(t) {
    let val;

    if (cenario === "pico") {
      // Pico: u(t) = base + amp * exp(-k*(t - t0)^2)
      val = base + amp * Math.exp(-k * Math.pow(t - t0, 2));
    } else {
      // Normal e base para poupança: u(t) = base + amp*sin(pi t)
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
    return (cenario === "poupanca") ? Math.min(limiteW, Pnormal) : Pnormal;
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

/* ==========================
   Render de resultados (acumulado)
   ========================== */

function appendResultado({ cenario, metodo, a, b, n, Wh, kWh, tarifa }) {
  const out = document.getElementById("out");
  if (!out) return;

  // garantir visível
  out.style.display = "block";

  // separador (não no primeiro bloco)
  if (out.children.length > 0) {
    out.appendChild(document.createElement("hr"));
  }

  const custoStr = (tarifa === null) ? "—" : (kWh * tarifa).toFixed(2);
  const co2Str = (kWh * EMISSAO_CO2_KG_POR_KWH).toFixed(2);

  const bloco = document.createElement("div");
  bloco.innerHTML = `
    <div style="margin-bottom:8px;">
      <strong>Cenário:</strong> ${nomeCenario(cenario)}
    </div>
    <div style="color:#555;margin-bottom:8px;">
      Intervalo: [${a}, ${b}] horas
    </div>
    <div><strong>Energia consumida:</strong> ${kWh.toFixed(2)} kWh</div>
    <div><strong>Energia consumida:</strong> ${Wh.toFixed(2)} Wh</div>
    <div><strong>Custo:</strong> ${custoStr} €</div>
    <div><strong>Emissões CO₂:</strong> ${co2Str} kg</div>
  `;

  out.appendChild(bloco);
}

function main() {
  const form = document.getElementById("form");
  if (!form) return;

  const cenarioEl = document.getElementById("cenario");

  // UI e método ao carregar
  setMetodoRecomendado();
  applyScenarioUI();

  // Troca de cenário: atualiza inputs e método, MAS não apaga resultados
  if (cenarioEl) {
    cenarioEl.addEventListener("change", () => {
      setMetodoRecomendado();
      applyScenarioUI();
    });
  }

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

    // Estes podem estar escondidos/disabled => vêm null (ok)
    const k      = toNumber(document.getElementById("k"));
    const limite = toNumber(document.getElementById("limite")); // Watts na poupança
    const t0raw  = toNumber(document.getElementById("t0"));

    // Tarifa para custo (pode ficar vazio)
    const tarifa = toNumber(document.getElementById("tarifa"));

    // Parâmetros de carga definidos automaticamente por cenário
    let base, amp;

    if (cenario === "normal") {
      base = 0.35;
      amp  = 0.25;
    } else if (cenario === "pico") {
      base = 0.30;
      amp  = 0.60;
    } else if (cenario === "poupanca") {
      base = 0.35;
      amp  = 0.25;
    } else {
      // fallback (não deve acontecer)
      base = 0.35;
      amp  = 0.25;
    }

    // Validações base (base/amp já não vêm do utilizador)
    if (a === null || b === null || n === null || pidle === null || pmax === null) {
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

    // coerência com u(t) (agora garantida por valores internos, mas mantemos validação)
    if (base < 0 || base > 1 || amp < 0 || amp > 1) {
      showError("Base e amplitude da carga devem estar entre 0 e 1.");
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

    // Se o utilizador forneceu t0 no pico, validar que está em [a,b]
    if (cenario === "pico" && t0raw !== null && (t0raw < a || t0raw > b)) {
      showError("No cenário Pico, t₀ deve estar dentro do intervalo [a, b].");
      return;
    }

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

    // Acrescentar bloco de resultados (2 casas decimais)
    appendResultado({ cenario, metodo, a, b, n, Wh, kWh, tarifa });
  });
}

document.addEventListener("DOMContentLoaded", main);
