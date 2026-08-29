const WS = "wss://ws.binaryws.com/websockets/v3";

const markets = [
  ["1HZ10V", "Volatility 10 (1s)"],
  ["R_10", "Volatility 10"],
  ["1HZ25V", "Volatility 25 (1s)"],
  ["R_25", "Volatility 25"],
  ["1HZ50V", "Volatility 50 (1s)"],
  ["R_50", "Volatility 50"],
  ["1HZ75V", "Volatility 75 (1s)"],
  ["R_75", "Volatility 75"],
  ["1HZ100V", "Volatility 100 (1s)"],
  ["R_100", "Volatility 100"],
  ["1HZ150V", "Volatility 150 (1s)"],
  ["frxEURUSD", "EUR/USD"],
  ["frxGBPUSD", "GBP/USD"],
  ["frxUSDJPY", "USD/JPY"],
  ["frxXAUUSD", "Gold (XAU/USD)"]
];

const $ = id => document.getElementById(id);

const marketEl = $("market");

if (marketEl) {
  markets.forEach(([value, name]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = name;
    marketEl.appendChild(option);
  });
}

let symbol = "1HZ100V";
let tf = 60;
let ws = null;
let candles = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
let manuallyClosed = false;

if (marketEl) {
  marketEl.value = symbol;
}

function status(text, live = false) {
  if (!$("status")) return;

  $("status").textContent = "● " + text;
  $("status").style.color = live ? "#32dc8a" : "#f0b84c";
}

function send(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("WebSocket send error:", error);
    return false;
  }
}

function connect() {
  manuallyClosed = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    try {
      ws.close();
    } catch (e) {}
  }

  candles = [];
  status("Connecting");

  try {
    ws = new WebSocket(WS);
  } catch (error) {
    console.error("WebSocket creation failed:", error);
    status("Connection failed");
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("Deriv WebSocket connected");

    reconnectAttempts = 0;
    status("Live", true);

    requestHistory();

    send({
      ticks: symbol,
      subscribe: 1,
      req_id: 2
    });
  };

  ws.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (error) {
      console.error("Invalid WebSocket message:", error);
    }
  };

  ws.onerror = error => {
    console.error("Deriv WebSocket error:", error);
    status("Connection error");
  };

  ws.onclose = event => {
    console.log("WebSocket closed:", event.code, event.reason);

    if (!manuallyClosed) {
      status("Disconnected");
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  if (reconnectTimer || manuallyClosed) return;

  reconnectAttempts++;

  const delay = Math.min(
    30000,
    2000 * Math.max(1, reconnectAttempts)
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function requestHistory() {
  send({
    ticks_history: symbol,
    end: "latest",
    count: 250,
    style: "candles",
    granularity: tf,
    subscribe: 0,
    req_id: 1
  });
}

function handleMessage(data) {
  if (data.error) {
    console.error("Deriv API error:", data.error);

    status(
      data.error.message
        ? "Error: " + data.error.message
        : "API error"
    );

    return;
  }

  if (data.msg_type === "candles") {
    processCandles(data.candles);
    return;
  }

  if (data.msg_type === "tick") {
    processTick(data.tick);
    return;
  }

  if (data.msg_type === "ping") {
    return;
  }
}

function processCandles(data) {
  if (!Array.isArray(data) || data.length === 0) {
    console.warn("No candle data received");
    status("No candle data");
    return;
  }

  candles = data
    .map(c => ({
      epoch: Number(c.epoch),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }))
    .filter(c =>
      Number.isFinite(c.epoch) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    );

  if (candles.length > 300) {
    candles = candles.slice(-300);
  }

  console.log("Loaded candles:", candles.length);

  analyze();
}

function processTick(tick) {
  if (!tick) return;

  const price = Number(tick.quote);
  const epoch = Number(tick.epoch);

  if (!Number.isFinite(price) || !Number.isFinite(epoch)) {
    return;
  }

  if ($("price")) {
    $("price").textContent = tick.quote;
  }

  updateCandle(epoch, price);

  analyze();

  if ($("clock")) {
    $("clock").textContent =
      new Date(epoch * 1000).toLocaleTimeString();
  }
}

function updateCandle(epoch, price) {
  if (!candles.length) return;

  const bucket = Math.floor(epoch / tf) * tf;
  const current = candles[candles.length - 1];

  if (current.epoch !== bucket) {
    candles.push({
      epoch: bucket,
      open: price,
      high: price,
      low: price,
      close: price
    });

    if (candles.length > 300) {
      candles.shift();
    }

    return;
  }

  current.close = price;
  current.high = Math.max(current.high, price);
  current.low = Math.min(current.low, price);
}

function ema(values, period) {
  if (values.length < period) return null;

  const multiplier = 2 / (period + 1);

  let result = 0;

  for (let i = 0; i < period; i++) {
    result += values[i];
  }

  result /= period;

  for (let i = period; i < values.length; i++) {
    result =
      values[i] * multiplier +
      result * (1 - multiplier);
  }

  return result;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  const start = values.length - period;

  for (let i = start; i < values.length; i++) {
    const difference = values[i] - values[i - 1];

    if (difference > 0) {
      gains += difference;
    } else {
      losses += Math.abs(difference);
    }
  }

  if (losses === 0) return 100;

  const rs = gains / losses;

  return 100 - 100 / (1 + rs);
}

function analyze() {
  if (candles.length < 35) {
    if ($("signal")) $("signal").textContent = "WAIT";
    if ($("confidence")) $("confidence").textContent = "--";
    return;
  }

  const closes = candles.map(c => c.close);

  const fastEMA = ema(closes, 9);
  const slowEMA = ema(closes, 21);
  const rsiValue = rsi(closes, 14);

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const previousFive = candles.slice(-6, -1);

  let trend = 0;

  if (fastEMA > slowEMA) {
    trend = 1;
  } else if (fastEMA < slowEMA) {
    trend = -1;
  }

  let momentum = 0;

  if (rsiValue > 55) {
    momentum = 1;
  } else if (rsiValue < 45) {
    momentum = -1;
  }

  let structure = 0;

  if (previousFive.length) {
    const previousHigh = Math.max(
      ...previousFive.map(c => c.high)
    );

    const previousLow = Math.min(
      ...previousFive.map(c => c.low)
    );

    if (last.close > previousHigh) {
      structure = 1;
    } else if (last.close < previousLow) {
      structure = -1;
    }
  }

  const recent = candles.slice(-20);

  const recentHigh = Math.max(
    ...recent.map(c => c.high)
  );

  const recentLow = Math.min(
    ...recent.map(c => c.low)
  );

  let liquidity = 0;

  if (
    last.low <= recentLow &&
    last.close > previous.close
  ) {
    liquidity = 1;
  } else if (
    last.high >= recentHigh &&
    last.close < previous.close
  ) {
    liquidity = -1;
  }

  const score =
    0.35 * trend +
    0.25 * momentum +
    0.25 * structure +
    0.15 * liquidity;

  let signal = "WAIT";

  if (score >= 0.45) {
    signal = "BUY";
  } else if (score <= -0.45) {
    signal = "SELL";
  }

  const confidence = Math.round(
    50 + Math.min(47, Math.abs(score) * 47)
  );

  updateInterface({
    signal,
    confidence,
    trend,
    rsiValue,
    structure,
    liquidity
  });
}

function updateInterface(data) {
  const {
    signal,
    confidence,
    trend,
    rsiValue,
    structure,
    liquidity
  } = data;

  if ($("signal")) {
    $("signal").textContent = signal;
    $("signal").className =
      "signal " + signal.toLowerCase();
  }

  if ($("confidence")) {
    $("confidence").textContent =
      confidence + "%";
  }

  if ($("trend")) {
    $("trend").textContent =
      trend > 0
        ? "Bullish"
        : trend < 0
        ? "Bearish"
        : "Neutral";
  }

  if ($("momentum")) {
    $("momentum").textContent =
      rsiValue > 55
        ? "Bullish (" + rsiValue.toFixed(0) + ")"
        : rsiValue < 45
        ? "Bearish (" + rsiValue.toFixed(0) + ")"
        : "Mixed (" + rsiValue.toFixed(0) + ")";
  }

  if ($("structure")) {
    $("structure").textContent =
      structure > 0
        ? "Break ↑"
        : structure < 0
        ? "Break ↓"
        : "Range";
  }

  if ($("liquidity")) {
    $("liquidity").textContent =
      liquidity > 0
        ? "Sweep ↑"
        : liquidity < 0
        ? "Sweep ↓"
        : "Balanced";
  }

  if ($("symbol")) {
    $("symbol").textContent = symbol;
  }

  if ($("reason")) {
    if (signal === "BUY") {
      $("reason").textContent =
        "Bullish trend and momentum are aligned. Wait for a pullback/retest before acting.";
    } else if (signal === "SELL") {
      $("reason").textContent =
        "Bearish trend and momentum are aligned. Wait for a pullback/retest before acting.";
    } else {
      $("reason").textContent =
        "Conditions are mixed. Wait for stronger structure confirmation.";
    }
  }

  if ($("clock")) {
    $("clock").textContent =
      new Date().toLocaleTimeString();
  }
}

/* Timeframe buttons */
document.querySelectorAll(".tf button").forEach(button => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".tf button")
      .forEach(x => x.classList.remove("active"));

    button.classList.add("active");

    tf = Number(button.dataset.tf);

    candles = [];

    status("Updating");

    requestHistory();
  });
});

/* Market selector */
if (marketEl) {
  marketEl.addEventListener("change", () => {
    symbol = marketEl.value;

    candles = [];

    connect();
  });
}

/* Start */
connect();
