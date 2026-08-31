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
  ["R_100", "Volatility 100"]
];

let socket = null;
let candles = [];
let currentSymbol = "R_100";
let currentGranularity = 60;
let reconnectTimer = null;

// --------------------------------------------------
// ELEMENTS
// --------------------------------------------------

const marketSelect = document.getElementById("market");
const timeframeSelect = document.getElementById("timeframe");

const signalElement = document.getElementById("signal");
const confidenceElement = document.getElementById("confidence");
const trendElement = document.getElementById("trend");
const priceElement = document.getElementById("price");
const statusElement = document.getElementById("status");

// --------------------------------------------------
// CREATE MARKET OPTIONS
// --------------------------------------------------

function setupMarkets() {
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
}

// --------------------------------------------------
// TIMEFRAME OPTIONS
// --------------------------------------------------

function setupTimeframes() {
  if (!timeframeSelect) return;

  timeframeSelect.innerHTML = `
    <option value="60">1 Minute</option>
    <option value="300">5 Minutes</option>
    <option value="900">15 Minutes</option>
    <option value="1800">30 Minutes</option>
    <option value="3600">1 Hour</option>
  `;

  timeframeSelect.value = currentGranularity;
}

// --------------------------------------------------
// CONNECT TO DERIV
// --------------------------------------------------

function connect() {
  if (socket) {
    try {
      socket.close();
    } catch (e) {}
  }

  updateStatus("Connecting...");

  socket = new WebSocket(WS);

  socket.onopen = function () {
    updateStatus("Connected");

    requestCandles();
  };

  socket.onmessage = function (event) {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (error) {
      console.log("Message error:", error);
    }
  };

  socket.onerror = function () {
    updateStatus("Connection error");
  };

  socket.onclose = function () {
    updateStatus("Disconnected");

    clearTimeout(reconnectTimer);

    reconnectTimer = setTimeout(() => {
      connect();
    }, 5000);
  };
}

// --------------------------------------------------
// REQUEST HISTORICAL CANDLES
// --------------------------------------------------

function requestCandles() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  candles = [];

  const request = {
    ticks_history: currentSymbol,
    adjust_start_time: 1,
    count: 150,
    end: "latest",
    start: 1,
    style: "candles",
    granularity: currentGranularity,
    subscribe: 1
  };

  socket.send(JSON.stringify(request));
}

// --------------------------------------------------
// HANDLE DERIV DATA
// --------------------------------------------------

function handleMessage(data) {
  if (data.error) {
    console.log("Deriv error:", data.error.message);
    updateStatus("Error");
    return;
  }

  if (data.msg_type === "candles") {
    candles = data.candles || [];

    if (candles.length > 0) {
      updatePrice();
      analyzeMarket();
    }

    return;
  }

  if (data.msg_type === "ohlc") {
    updateLiveCandle(data.ohlc);
    return;
  }

  if (data.msg_type === "history") {
    return;
  }
}

// --------------------------------------------------
// UPDATE LIVE CANDLE
// --------------------------------------------------

function updateLiveCandle(candle) {
  if (!candle) return;

  const newCandle = {
    epoch: Number(candle.epoch),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close)
  };

  if (candles.length === 0) {
    candles.push(newCandle);
  } else {
    const last = candles[candles.length - 1];

    if (Number(last.epoch) === newCandle.epoch) {
      candles[candles.length - 1] = newCandle;
    } else if (newCandle.epoch > Number(last.epoch)) {
      candles.push(newCandle);

      if (candles.length > 200) {
        candles.shift();
      }
    }
  }

  updatePrice();
  analyzeMarket();
}

// --------------------------------------------------
// PRICE
// --------------------------------------------------

function updatePrice() {
  if (!priceElement || candles.length === 0) return;

  const last = candles[candles.length - 1];

  priceElement.textContent = Number(last.close).toFixed(2);
}

// --------------------------------------------------
// EMA
// --------------------------------------------------

function calculateEMA(values, period) {
  if (values.length < period) return null;

  const multiplier = 2 / (period + 1);

  let ema = values
    .slice(0, period)
    .reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }

  return ema;
}

// --------------------------------------------------
// RSI
// --------------------------------------------------

function calculateRSI(values, period = 14) {
  if (values.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses === 0) return 100;

  const averageGain = gains / period;
  const averageLoss = losses / period;

  const rs = averageGain / averageLoss;

  return 100 - (100 / (1 + rs));
}

// --------------------------------------------------
// TREND
// --------------------------------------------------

function getTrend(closes) {
  if (closes.length < 30) {
    return "WAIT";
  }

  const fastEMA = calculateEMA(closes, 9);
  const slowEMA = calculateEMA(closes, 21);

  const recent = closes[closes.length - 1];
  const previous = closes[closes.length - 6];

  if (
    fastEMA > slowEMA &&
    recent > previous
  ) {
    return "UPTREND";
  }

  if (
    fastEMA < slowEMA &&
    recent < previous
  ) {
    return "DOWNTREND";
  }

  return "SIDEWAYS";
}

// --------------------------------------------------
// MARKET ANALYSIS
// --------------------------------------------------

function analyzeMarket() {
  if (candles.length < 30) {
    setSignal("WAIT", 50);
    setTrend("WAIT");
    return;
  }

  const closes = candles.map(c => Number(c.close));
  const highs = candles.map(c => Number(c.high));
  const lows = candles.map(c => Number(c.low));

  const fastEMA = calculateEMA(closes, 9);
  const slowEMA = calculateEMA(closes, 21);

  const rsi = calculateRSI(closes, 14);

  const trend = getTrend(closes);

  const current = closes[closes.length - 1];
  const previous = closes[closes.length - 2];

  let buyScore = 0;
  let sellScore = 0;

  // EMA TREND
  if (fastEMA > slowEMA) {
    buyScore += 30;
  }

  if (fastEMA < slowEMA) {
    sellScore += 30;
  }

  // RSI
  if (rsi >= 50 && rsi <= 70) {
    buyScore += 25;
  }

  if (rsi <= 50 && rsi >= 30) {
    sellScore += 25;
  }

  // PRICE MOMENTUM
  if (current > previous) {
    buyScore += 20;
  }

  if (current < previous) {
    sellScore += 20;
  }

  // CANDLE DIRECTION
  const lastCandle = candles[candles.length - 1];

  if (lastCandle.close > lastCandle.open) {
    buyScore += 15;
  }

  if (lastCandle.close < lastCandle.open) {
    sellScore += 15;
  }

  // SUPPORT / RESISTANCE APPROXIMATION
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));

  const range = recentHigh - recentLow;

  if (range > 0) {
    const position = (current - recentLow) / range;

    if (position < 0.30) {
      buyScore += 10;
    }

    if (position > 0.70) {
      sellScore += 10;
    }
  }

  let signal = "WAIT";
  let confidence = 50;

  if (buyScore > sellScore && buyScore >= 60) {
    signal = "BUY";
    confidence = Math.min(95, buyScore);
  } else if (sellScore > buyScore && sellScore >= 60) {
    signal = "SELL";
    confidence = Math.min(95, sellScore);
  } else {
    signal = "WAIT";

    confidence = Math.min(
      75,
      Math.max(buyScore, sellScore)
    );
  }

  setSignal(signal, confidence);
  setTrend(trend);

  console.log({
    symbol: currentSymbol,
    price: current,
    EMA9: fastEMA,
    EMA21: slowEMA,
    RSI: rsi,
    trend: trend,
    signal: signal,
    confidence: confidence
  });
}

// --------------------------------------------------
// DISPLAY SIGNAL
// --------------------------------------------------

function setSignal(signal, confidence) {
  if (signalElement) {
    signalElement.textContent = signal;
  }

  if (confidenceElement) {
    confidenceElement.textContent =
      Math.round(confidence) + "%";
  }

  // Works with different HTML designs
  if (signalElement) {
    signalElement.classList.remove(
      "buy",
      "sell",
      "wait"
    );

    signalElement.classList.add(
      signal.toLowerCase()
    );
  }
}

// --------------------------------------------------
// DISPLAY TREND
// --------------------------------------------------

function setTrend(trend) {
  if (!trendElement) return;

  trendElement.textContent = trend;

  trendElement.classList.remove(
    "uptrend",
    "downtrend",
    "sideways"
  );

  if (trend === "UPTREND") {
    trendElement.classList.add("uptrend");
  }

  if (trend === "DOWNTREND") {
    trendElement.classList.add("downtrend");
  }

  if (trend === "SIDEWAYS") {
    trendElement.classList.add("sideways");
  }
}

// --------------------------------------------------
// STATUS
// --------------------------------------------------

function updateStatus(status) {
  if (statusElement) {
    statusElement.textContent = status;
  }

  console.log("Status:", status);
}

// --------------------------------------------------
// MARKET CHANGE
// --------------------------------------------------

if (marketSelect) {
  marketSelect.addEventListener("change", function () {
    currentSymbol = this.value;

    if (socket && socket.readyState === WebSocket.OPEN) {
      requestCandles();
    }
  });
}

// --------------------------------------------------
// TIMEFRAME CHANGE
// --------------------------------------------------

if (timeframeSelect) {
  timeframeSelect.addEventListener("change", function () {
    currentGranularity = Number(this.value);

    if (socket && socket.readyState === WebSocket.OPEN) {
      requestCandles();
    }
  });
}

// --------------------------------------------------
// START
// --------------------------------------------------

setupMarkets();
setupTimeframes();
connect();
