// =====================================================
// DERIV ANALYZER V4
// Public Deriv Market Data
// Live Price + EMA + RSI + Trend + BUY/SELL/WAIT
// Auto Reconnect + Connection Status
// =====================================================

const WS_URL = "wss://ws.binaryws.com/websockets/v3";

// -----------------------------------------------------
// MARKETS
// -----------------------------------------------------

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
  ["R_100", "Volatility 100"]
];

// -----------------------------------------------------
// SETTINGS
// -----------------------------------------------------

const CANDLE_COUNT = 100;
const CANDLE_SECONDS = 60;

const FAST_EMA = 9;
const SLOW_EMA = 21;
const RSI_PERIOD = 14;

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 15000;

// -----------------------------------------------------
// STATE
// -----------------------------------------------------

let ws = null;
let reconnectTimer = null;
let reconnectDelay = RECONNECT_DELAY;

let currentSymbol = "R_10";
let candles = [];
let ticks = [];

let currentPrice = null;
let lastUpdate = null;

let connected = false;
let manuallyClosed = false;

let analysis = {
  signal: "WAIT",
  confidence: 0,
  trend: "NEUTRAL",
  rsi: 50,
  fastEMA: null,
  slowEMA: null
};

// -----------------------------------------------------
// DOM
// -----------------------------------------------------

const marketSelect = document.getElementById("market");
const priceEl = document.getElementById("price");
const signalEl = document.getElementById("signal");
const confidenceEl = document.getElementById("confidence");
const trendEl = document.getElementById("trend");
const rsiEl = document.getElementById("rsi");
const emaFastEl = document.getElementById("emaFast");
const emaSlowEl = document.getElementById("emaSlow");
const statusEl = document.getElementById("status");
const lastUpdateEl = document.getElementById("lastUpdate");

// -----------------------------------------------------
// INITIALIZE MARKET LIST
// -----------------------------------------------------

function initMarkets() {
  if (!marketSelect) return;

  marketSelect.innerHTML = "";

  markets.forEach(([symbol, name]) => {
    const option = document.createElement("option");

    option.value = symbol;
    option.textContent = name;

    if (symbol === currentSymbol) {
      option.selected = true;
    }

    marketSelect.appendChild(option);
  });

  marketSelect.addEventListener("change", () => {
    currentSymbol = marketSelect.value;

    candles = [];
    ticks = [];
    currentPrice = null;

    updateStatus("Changing market...");

    subscribeMarket();
  });
}

// -----------------------------------------------------
// WEBSOCKET CONNECTION
// -----------------------------------------------------

function connect() {
  if (manuallyClosed) return;

  clearTimeout(reconnectTimer);

  updateStatus("Connecting...");

  try {
    ws = new WebSocket(WS_URL);
  } catch (error) {
    updateStatus("Connection error");
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
    reconnectDelay = RECONNECT_DELAY;

    updateStatus("Connected");

    subscribeMarket();
  };

  ws.onmessage = event => {
    try {
      const data = JSON.parse(event.data);

      handleMessage(data);
    } catch (error) {
      console.error("Message parsing error:", error);
    }
  };

  ws.onerror = error => {
    console.warn("WebSocket error:", error);

    updateStatus("Connection error");
  };

  ws.onclose = () => {
    connected = false;

    updateStatus("Disconnected - reconnecting...");

    scheduleReconnect();
  };
}

// -----------------------------------------------------
// AUTO RECONNECT
// -----------------------------------------------------

function scheduleReconnect() {
  if (manuallyClosed) return;

  clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(() => {
    connect();
  }, reconnectDelay);

  reconnectDelay = Math.min(
    reconnectDelay * 2,
    MAX_RECONNECT_DELAY
  );
}

// -----------------------------------------------------
// STATUS
// -----------------------------------------------------

function updateStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

// -----------------------------------------------------
// SUBSCRIBE TO MARKET
// -----------------------------------------------------

function subscribeMarket() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  // Remove old subscriptions
  try {
    ws.send(
      JSON.stringify({
        forget_all: "ticks"
      })
    );
  } catch (error) {
    console.warn(error);
  }

  // Request historical candles
  ws.send(
    JSON.stringify({
      ticks_history: currentSymbol,
      adjust_start_time: 1,
      count: CANDLE_COUNT,
      end: "latest",
      granularity: CANDLE_SECONDS,
      style: "candles"
    })
  );

  // Subscribe to live ticks
  ws.send(
    JSON.stringify({
      ticks: currentSymbol,
      subscribe: 1
    })
  );
}

// -----------------------------------------------------
// MESSAGE HANDLER
// -----------------------------------------------------

function handleMessage(data) {
  if (data.error) {
    console.error("Deriv error:", data.error);

    updateStatus(
      "Deriv error: " + data.error.message
    );

    return;
  }

  // Historical candles
  if (data.candles) {
    candles = data.candles.map(c => ({
      time: Number(c.epoch),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }));

    if (candles.length > 0) {
      currentPrice =
        candles[candles.length - 1].close;

      updatePrice();
      runAnalysis();
    }

    return;
  }

  // Live tick
  if (data.tick) {
    handleTick(data.tick);
  }
}

// -----------------------------------------------------
// LIVE TICK
// -----------------------------------------------------

function handleTick(tick) {
  const price = Number(tick.quote);
  const epoch = Number(tick.epoch);

  if (!Number.isFinite(price)) return;

  currentPrice = price;

  ticks.push({
    time: epoch,
    price
  });

  if (ticks.length > 500) {
    ticks.shift();
  }

  updatePrice();
  updateLastUpdate();

  updateLiveCandle(epoch, price);

  runAnalysis();
}

// -----------------------------------------------------
// BUILD LIVE CANDLE
// -----------------------------------------------------

function updateLiveCandle(epoch, price) {
  const candleTime =
    Math.floor(epoch / CANDLE_SECONDS) *
    CANDLE_SECONDS;

  let last =
    candles.length > 0
      ? candles[candles.length - 1]
      : null;

  // New candle
  if (!last || last.time !== candleTime) {
    candles.push({
      time: candleTime,
      open: price,
      high: price,
      low: price,
      close: price
    });

    if (candles.length > CANDLE_COUNT) {
      candles.shift();
    }

    return;
  }

  // Update existing candle
  last.close = price;

  if (price > last.high) {
    last.high = price;
  }

  if (price < last.low) {
    last.low = price;
  }
}

// -----------------------------------------------------
// PRICE DISPLAY
// -----------------------------------------------------

function updatePrice() {
  if (!priceEl || currentPrice === null) return;

  priceEl.textContent =
    formatPrice(currentPrice);
}

function formatPrice(price) {
  if (!Number.isFinite(price)) return "--";

  return price.toFixed(
    getPriceDecimals(price)
  );
}

function getPriceDecimals(price) {
  if (price >= 1000) return 2;
  if (price >= 100) return 2;
  if (price >= 10) return 3;
  return 5;
}

// -----------------------------------------------------
// EMA
// -----------------------------------------------------

function calculateEMA(values, period) {
  if (!values || values.length < period) {
    return null;
  }

  const multiplier =
    2 / (period + 1);

  let ema = 0;

  // Initial SMA
  for (let i = 0; i < period; i++) {
    ema += values[i];
  }

  ema /= period;

  // EMA
  for (let i = period; i < values.length; i++) {
    ema =
      (values[i] - ema) *
      multiplier +
      ema;
  }

  return ema;
}

// -----------------------------------------------------
// RSI
// -----------------------------------------------------

function calculateRSI(values, period = 14) {
  if (!values || values.length <= period) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change =
      values[i] - values[i - 1];

    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain =
    gains / period;

  let averageLoss =
    losses / period;

  for (
    let i = period + 1;
    i < values.length;
    i++
  ) {
    const change =
      values[i] - values[i - 1];

    const gain =
      change > 0 ? change : 0;

    const loss =
      change < 0 ? Math.abs(change) : 0;

    averageGain =
      ((averageGain * (period - 1)) +
        gain) /
      period;

    averageLoss =
      ((averageLoss * (period - 1)) +
        loss) /
      period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const rs =
    averageGain / averageLoss;

  return 100 - 100 / (1 + rs);
}

// -----------------------------------------------------
// TREND
// -----------------------------------------------------

function calculateTrend(fastEMA, slowEMA, rsi) {
  if (
    fastEMA === null ||
    slowEMA === null
  ) {
    return "NEUTRAL";
  }

  if (
    fastEMA > slowEMA &&
    rsi >= 50
  ) {
    return "BULLISH";
  }

  if (
    fastEMA < slowEMA &&
    rsi <= 50
  ) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

// -----------------------------------------------------
// SIGNAL ENGINE
// -----------------------------------------------------

function generateSignal(
  fastEMA,
  slowEMA,
  rsi,
  candlesData
) {
  if (
    fastEMA === null ||
    slowEMA === null
  ) {
    return {
      signal: "WAIT",
      confidence: 0
    };
  }

  let buyScore = 0;
  let sellScore = 0;

  // EMA trend
  if (fastEMA > slowEMA) {
    buyScore += 35;
  }

  if (fastEMA < slowEMA) {
    sellScore += 35;
  }

  // RSI
  if (rsi >= 55 && rsi <= 70) {
    buyScore += 25;
  }

  if (rsi <= 45 && rsi >= 30) {
    sellScore += 25;
  }

  // Momentum
  if (candlesData.length >= 3) {
    const last =
      candlesData[candlesData.length - 1];

    const previous =
      candlesData[candlesData.length - 2];

    const before =
      candlesData[candlesData.length - 3];

    if (
      last.close > previous.close &&
      previous.close > before.close
    ) {
      buyScore += 25;
    }

    if (
      last.close < previous.close &&
      previous.close < before.close
    ) {
      sellScore += 25;
    }
  }

  // Price position
  const lastClose =
    candlesData.length
      ? candlesData[candlesData.length - 1].close
      : null;

  if (lastClose !== null) {
    if (lastClose > fastEMA) {
      buyScore += 15;
    }

    if (lastClose < fastEMA) {
      sellScore += 15;
    }
  }

  if (
    buyScore >= 60 &&
    buyScore > sellScore
  ) {
    return {
      signal: "BUY",
      confidence: Math.min(buyScore, 95)
    };
  }

  if (
    sellScore >= 60 &&
    sellScore > buyScore
  ) {
    return {
      signal: "SELL",
      confidence: Math.min(sellScore, 95)
    };
  }

  return {
    signal: "WAIT",
    confidence:
      Math.min(
        Math.max(buyScore, sellScore),
        59
      )
  };
}

// -----------------------------------------------------
// COMPLETE ANALYSIS
// -----------------------------------------------------

function runAnalysis() {
  if (candles.length < SLOW_EMA) {
    updateSignal(
      "WAIT",
      0,
      "NEUTRAL",
      50,
      null,
      null
    );

    return;
  }

  const closes =
    candles.map(c => c.close);

  const fastEMA =
    calculateEMA(
      closes,
      FAST_EMA
    );

  const slowEMA =
    calculateEMA(
      closes,
      SLOW_EMA
    );

  const rsi =
    calculateRSI(
      closes,
      RSI_PERIOD
    );

  const trend =
    calculateTrend(
      fastEMA,
      slowEMA,
      rsi
    );

  const result =
    generateSignal(
      fastEMA,
      slowEMA,
      rsi,
      candles
    );

  analysis = {
    signal: result.signal,
    confidence: result.confidence,
    trend,
    rsi,
    fastEMA,
    slowEMA
  };

  updateSignal(
    result.signal,
    result.confidence,
    trend,
    rsi,
    fastEMA,
    slowEMA
  );
}

// -----------------------------------------------------
// UPDATE ANALYSIS UI
// -----------------------------------------------------

function updateSignal(
  signal,
  confidence,
  trend,
  rsi,
  fastEMA,
  slowEMA
) {
  if (signalEl) {
    signalEl.textContent = signal;
  }

  if (confidenceEl) {
    confidenceEl.textContent =
      Math.round(confidence) + "%";
  }

  if (trendEl) {
    trendEl.textContent = trend;
  }

  if (rsiEl) {
    rsiEl.textContent =
      Number.isFinite(rsi)
        ? rsi.toFixed(2)
        : "--";
  }

  if (emaFastEl) {
    emaFastEl.textContent =
      fastEMA !== null
        ? formatPrice(fastEMA)
        : "--";
  }

  if (emaSlowEl) {
    emaSlowEl.textContent =
      slowEMA !== null
        ? formatPrice(slowEMA)
        : "--";
  }

  // Signal class
  if (signalEl) {
    signalEl.classList.remove(
      "buy",
      "sell",
      "wait"
    );

    if (signal === "BUY") {
      signalEl.classList.add("buy");
    } else if (signal === "SELL") {
      signalEl.classList.add("sell");
    } else {
      signalEl.classList.add("wait");
    }
  }

  if (trendEl) {
    trendEl.classList.remove(
      "bullish",
      "bearish",
      "neutral"
    );

    if (trend === "BULLISH") {
      trendEl.classList.add("bullish");
    } else if (trend === "BEARISH") {
      trendEl.classList.add("bearish");
    } else {
      trendEl.classList.add("neutral");
    }
  }
}

// -----------------------------------------------------
// LAST UPDATE
// -----------------------------------------------------

function updateLastUpdate() {
  if (!lastUpdateEl) return;

  const now = new Date();

  lastUpdateEl.textContent =
    now.toLocaleTimeString();
}

// -----------------------------------------------------
// PAGE VISIBILITY
// -----------------------------------------------------

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      document.visibilityState === "visible"
    ) {
      if (
        !ws ||
        ws.readyState !== WebSocket.OPEN
      ) {
        connect();
      }
    }
  }
);

// -----------------------------------------------------
// INTERNET CONNECTION
// -----------------------------------------------------

window.addEventListener(
  "online",
  () => {
    updateStatus("Internet restored...");

    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN
    ) {
      connect();
    }
  }
);

window.addEventListener(
  "offline",
  () => {
    updateStatus("Internet disconnected");
  }
);

// -----------------------------------------------------
// START APPLICATION
// -----------------------------------------------------

function startApp() {
  initMarkets();

  updateSignal(
    "WAIT",
    0,
    "NEUTRAL",
    50,
    null,
    null
  );

  connect();
}

startApp();
