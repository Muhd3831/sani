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
  ["1HZ100V", "Volatility 100"],
  ["R_100", "Volatility 100"],
  ["1HZ150V", "Volatility 150 (1s)"],
  ["frxEURUSD", "EUR/USD"],
  ["frxGBPUSD", "GBP/USD"],
  ["frxUSDJPY", "USD/JPY"],
  ["frxXAUUSD", "Gold (XAU/USD)"]
];

const $ = id => document.getElementById(id);
const marketEl = $("market");

markets.forEach(([value, name]) => {
  if (!marketEl) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = name;
  marketEl.appendChild(option);
});

let symbol = "1HZ100V";
let tf = 60;
let ws = null;
let candles = [];
let tickBuffer = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
let manualClose = false;

if (marketEl) marketEl.value = symbol;

function setStatus(text, live = false) {
  const el = $("status");
  if (!el) return;

  el.textContent = "● " + text;
  el.style.color = live ? "#32dc8a" : "#f0b84c";
}

function send(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  try {
    ws.send(JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("Send error:", e);
    return false;
  }
}

function connect() {
  manualClose = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    try {
      ws.close();
    } catch (_) {}
  }

  candles = [];
  tickBuffer = [];

  setStatus("Connecting");

  try {
    ws = new WebSocket(WS);
  } catch (e) {
    console.error(e);
    setStatus("Connection failed");
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempts = 0;
    setStatus("Connected", true);

    send({
      ticks_history: symbol,
      end: "latest",
      count: 500,
      style: "ticks",
      subscribe: 0,
      req_id: 1
    });

    send({
      ticks: symbol,
      subscribe: 1,
      req_id: 2
    });

    send({
      ping: 1,
      req_id: 3
    });
  };

  ws.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (e) {
      console.error("Message parse error:", e);
    }
  };

  ws.onerror = event => {
    console.error("WebSocket error:", event);
    setStatus("Connection error");
  };

  ws.onclose = event => {
    console.log(
      "WebSocket closed:",
      event.code,
      event.reason
    );

    if (!manualClose) {
      setStatus("Disconnected");
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  if (reconnectTimer || manualClose) return;

  reconnectAttempts++;

  const delay = Math.min(
    30000,
    2000 * reconnectAttempts
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function handleMessage(data) {
  if (data.error) {
    console.error(
      "Deriv error:",
      data.error
    );

    setStatus("API error");

    if ($("reason")) {
      $("reason").textContent =
        data.error.message ||
        "Deriv API error.";
    }

    return;
  }

  if (data.msg_type === "history") {
    processHistory(data.history);
    return;
  }

  if (data.msg_type === "candles") {
    processLegacyCandles(data.candles);
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

function processHistory(history) {
  if (
    !history ||
    !Array.isArray(history.prices) ||
    !Array.isArray(history.times)
  ) {
    console.warn(
      "History response has no prices/times:",
      history
    );

    setStatus("No history");
    return;
  }

  const len = Math.min(
    history.prices.length,
    history.times.length
  );

  const ticks = [];

  for (let i = 0; i < len; i++) {
    const price =
      Number(history.prices[i]);

    const epoch =
      Number(history.times[i]);

    if (
      Number.isFinite(price) &&
      Number.isFinite(epoch)
    ) {
      ticks.push({
        price,
        epoch
      });
    }
  }

  tickBuffer = ticks.slice(-500);

  candles = buildCandles(
    tickBuffer
  );

  if (tickBuffer.length) {
    const last =
      tickBuffer[tickBuffer.length - 1];

    showPrice(last.price);
    showClock(last.epoch);
  }

  analyze();
}

function processLegacyCandles(data) {
  if (!Array.isArray(data)) return;

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

  analyze();
}

function processTick(tick) {
  if (!tick) return;

  const price =
    Number(tick.quote);

  const epoch =
    Number(tick.epoch);

  if (
    !Number.isFinite(price) ||
    !Number.isFinite(epoch)
  ) {
    return;
  }

  showPrice(price);
  showClock(epoch);

  tickBuffer.push({
    price,
    epoch
  });

  if (tickBuffer.length > 1000) {
    tickBuffer.shift();
  }

  updateLocalCandle(
    epoch,
    price
  );

  analyze();
}

function showPrice(price) {
  if ($("price")) {
    $("price").textContent =
      String(price);
  }

  if ($("symbol")) {
    $("symbol").textContent =
      symbol;
  }
}

function showClock(epoch) {
  if ($("clock")) {
    $("clock").textContent =
      new Date(
        epoch * 1000
      ).toLocaleTimeString();
  }
}

function buildCandles(ticks) {
  const result = [];

  for (const tick of ticks) {
    const bucket =
      Math.floor(
        tick.epoch / tf
      ) * tf;

    let candle =
      result[result.length - 1];

    if (
      !candle ||
      candle.epoch !== bucket
    ) {
      candle = {
        epoch: bucket,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price
      };

      result.push(candle);
    } else {
      candle.close =
        tick.price;

      candle.high =
        Math.max(
          candle.high,
          tick.price
        );

      candle.low =
        Math.min(
          candle.low,
          tick.price
        );
    }
  }

  return result.slice(-300);
}

function updateLocalCandle(
  epoch,
  price
) {
  const bucket =
    Math.floor(
      epoch / tf
    ) * tf;

  let current =
    candles[candles.length - 1];

  if (
    !current ||
    current.epoch !== bucket
  ) {
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

  current.high =
    Math.max(
      current.high,
      price
    );

  current.low =
    Math.min(
      current.low,
      price
    );
}

function ema(
  values,
  period
) {
  if (
    values.length < period
  ) {
    return null;
  }

  const multiplier =
    2 / (period + 1);

  let result = 0;

  for (
    let i = 0;
    i < period;
    i++
  ) {
    result += values[i];
  }

  result /= period;

  for (
    let i = period;
    i < values.length;
    i++
  ) {
    result =
      values[i] * multiplier +
      result *
        (1 - multiplier);
  }

  return result;
}

function rsi(
  values,
  period = 14
) {
  if (
    values.length <
    period + 1
  ) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  const start =
    values.length - period;

  for (
    let i = start;
    i < values.length;
    i++
  ) {
    const diff =
      values[i] -
      values[i - 1];

    if (diff > 0) {
      gains += diff;
    } else {
      losses +=
        Math.abs(diff);
    }
  }

  if (losses === 0) {
    return gains > 0 ? 100 : 50;
  }

  const rs =
    gains / losses;

  return (
    100 -
    100 / (1 + rs)
  );
}

function analyze() {
  if (candles.length < 22) {
    if ($("signal")) {
      $("signal").textContent =
        "WAIT";
    }

    if ($("confidence")) {
      $("confidence").textContent =
        "--%";
    }

    if ($("reason")) {
      $("reason").textContent =
        "Connected. Collecting enough market data for analysis…";
    }

    return;
  }

  const closes =
    candles.map(
      c => c.close
    );

  const fast =
    ema(closes, 9);

  const slow =
    ema(closes, 21);

  const rsiValue =
    rsi(closes, 14);

  const last =
    candles[candles.length - 1];

  const previous =
    candles[candles.length - 2];

  const previousFive =
    candles.slice(-6, -1);

  let trend = 0;

  if (fast > slow) {
    trend = 1;
  } else if (fast < slow) {
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
    const high =
      Math.max(
        ...previousFive.map(
          c => c.high
        )
      );

    const low =
      Math.min(
        ...previousFive.map(
          c => c.low
        )
      );

    if (last.close > high) {
      structure = 1;
    } else if (
      last.close < low
    ) {
      structure = -1;
    }
  }

  const recent =
    candles.slice(-20);

  const recentHigh =
    Math.max(
      ...recent.map(
        c => c.high
      )
    );

  const recentLow =
    Math.min(
      ...recent.map(
        c => c.low
      )
    );

  let liquidity = 0;

  if (
    last.low <= recentLow &&
    last.close >
      previous.close
  ) {
    liquidity = 1;
  } else if (
    last.high >= recentHigh &&
    last.close <
      previous.close
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
  } else if (
    score <= -0.45
  ) {
    signal = "SELL";
  }

  const confidence =
    Math.round(
      50 +
        Math.min(
          47,
          Math.abs(score) * 47
        )
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
    $("signal").textContent =
      signal;

    $("signal").className =
      "signal " +
      signal.toLowerCase();
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
        ? "Bullish (" +
          rsiValue.toFixed(0) +
          ")"
        : rsiValue < 45
        ? "Bearish (" +
          rsiValue.toFixed(0) +
          ")"
        : "Mixed (" +
          rsiValue.toFixed(0) +
          ")";
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
    $("symbol").textContent =
      symbol;
  }

  if ($("reason")) {
    $("reason").textContent =
      signal === "BUY"
        ? "Bullish trend and momentum are aligned. Wait for a pullback/retest before acting."
        : signal === "SELL"
        ? "Bearish trend and momentum are aligned. Wait for a pullback/retest before acting."
        : "Conditions are mixed. Wait for stronger structure confirmation.";
  }
}

/* Timeframe buttons */

document
  .querySelectorAll(".tf button")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(
            ".tf button"
          )
          .forEach(x =>
            x.classList.remove(
              "active"
            )
          );

        button.classList.add(
          "active"
        );

        tf = Number(
          button.dataset.tf
        );

        candles = [];
        tickBuffer = [];

        setStatus(
          "Updating"
        );

        if (
          ws &&
          ws.readyState ===
            WebSocket.OPEN
        ) {
          send({
            ticks_history:
              symbol,
            end: "latest",
            count: 500,
            style: "ticks",
            subscribe: 0,
            req_id: Date.now()
          });
        }
      }
    );
  });

/* Market selector */

if (marketEl) {

  marketEl.addEventListener(
    "change",
    () => {

      symbol =
        marketEl.value;

      candles = [];
      tickBuffer = [];

      connect();
    }
  );
}

/* Start */

connect();
