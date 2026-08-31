// =====================================================
// DERIV ANALYZER V3
// Live public market data + technical analysis
// =====================================================

const WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";

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

let currentSymbol = "R_100";
let currentGranularity = 60;

let socket = null;
let candles = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
let manuallyClosed = false;

// -----------------------------------------------------
// HTML ELEMENTS
// -----------------------------------------------------

const marketSelect =
  document.getElementById("market") ||
  document.getElementById("marketSelect");

const timeframeSelect =
  document.getElementById("timeframe") ||
  document.getElementById("timeframeSelect");

const signalElement =
  document.getElementById("signal");

const confidenceElement =
  document.getElementById("confidence");

const trendElement =
  document.getElementById("trend");

const momentumElement =
  document.getElementById("momentum");

const structureElement =
  document.getElementById("structure");

const liquidityElement =
  document.getElementById("liquidity");

const priceElement =
  document.getElementById("price");

const statusElement =
  document.getElementById("status");

const analysisElement =
  document.getElementById("analysis");

// -----------------------------------------------------
// START
// -----------------------------------------------------

document.addEventListener("DOMContentLoaded", function () {

  setupMarket();

  setupTimeframe();

  setupTimeframeButtons();

  connectToDeriv();

});

// -----------------------------------------------------
// MARKET SETUP
// -----------------------------------------------------

function setupMarket() {

  if (!marketSelect) return;

  // Only create options if it is a SELECT element
  if (marketSelect.tagName === "SELECT") {

    marketSelect.innerHTML = "";

    markets.forEach(function (market) {

      const option = document.createElement("option");

      option.value = market[0];

      option.textContent = market[1];

      if (market[0] === currentSymbol) {
        option.selected = true;
      }

      marketSelect.appendChild(option);

    });

  }

  marketSelect.addEventListener("change", function () {

    currentSymbol = this.value;

    restartMarket();

  });

}

// -----------------------------------------------------
// TIMEFRAME SELECT
// -----------------------------------------------------

function setupTimeframe() {

  if (!timeframeSelect) return;

  if (timeframeSelect.tagName === "SELECT") {

    timeframeSelect.innerHTML = `
      <option value="60">1M</option>
      <option value="300">5M</option>
      <option value="900">15M</option>
      <option value="1800">30M</option>
      <option value="3600">1H</option>
    `;

    timeframeSelect.value =
      String(currentGranularity);

    timeframeSelect.addEventListener("change", function () {

      currentGranularity =
        Number(this.value);

      restartMarket();

    });

  }

}

// -----------------------------------------------------
// TIMEFRAME BUTTONS
// -----------------------------------------------------

function setupTimeframeButtons() {

  const buttons =
    document.querySelectorAll(
      "[data-timeframe]"
    );

  buttons.forEach(function (button) {

    button.addEventListener("click", function () {

      const value =
        Number(
          button.getAttribute("data-timeframe")
        );

      if (!value) return;

      currentGranularity = value;

      buttons.forEach(function (btn) {
        btn.classList.remove("active");
      });

      button.classList.add("active");

      restartMarket();

    });

  });

}

// -----------------------------------------------------
// CONNECT TO DERIV
// -----------------------------------------------------

function connectToDeriv() {

  manuallyClosed = false;

  clearTimeout(reconnectTimer);

  updateStatus("Connecting...");

  try {

    socket = new WebSocket(WS_URL);

  } catch (error) {

    console.error(error);

    updateStatus("Connection error");

    scheduleReconnect();

    return;

  }

  socket.onopen = function () {

    console.log("Connected to Deriv");

    reconnectAttempts = 0;

    updateStatus("Connected");

    requestCandles();

  };

  socket.onmessage = function (event) {

    try {

      const data =
        JSON.parse(event.data);

      handleDerivMessage(data);

    } catch (error) {

      console.error(
        "Message parsing error:",
        error
      );

    }

  };

  socket.onerror = function (error) {

    console.error(
      "Deriv WebSocket error:",
      error
    );

    updateStatus("Connection error");

  };

  socket.onclose = function () {

    console.log(
      "Deriv connection closed"
    );

    if (!manuallyClosed) {

      updateStatus("Reconnecting...");

      scheduleReconnect();

    }

  };

}

// -----------------------------------------------------
// RECONNECT
// -----------------------------------------------------

function scheduleReconnect() {

  clearTimeout(reconnectTimer);

  reconnectAttempts++;

  const delay =
    Math.min(
      10000,
      2000 * reconnectAttempts
    );

  reconnectTimer =
    setTimeout(function () {

      connectToDeriv();

    }, delay);

}

// -----------------------------------------------------
// REQUEST CANDLES
// -----------------------------------------------------

function requestCandles() {

  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  candles = [];

  const request = {

    ticks_history: currentSymbol,

    adjust_start_time: 1,

    count: 200,

    end: "latest",

    start: 1,

    style: "candles",

    granularity:
      currentGranularity,

    subscribe: 1

  };

  console.log(
    "Requesting:",
    currentSymbol,
    currentGranularity
  );

  socket.send(
    JSON.stringify(request)
  );

}

// -----------------------------------------------------
// HANDLE DERIV MESSAGE
// -----------------------------------------------------

function handleDerivMessage(data) {

  if (data.error) {

    console.error(
      "Deriv API error:",
      data.error
    );

    updateStatus(
      "Deriv error"
    );

    return;

  }

  // Initial candle history
  if (data.msg_type === "candles") {

    if (Array.isArray(data.candles)) {

      candles =
        data.candles.map(function (candle) {

          return {

            epoch:
              Number(candle.epoch),

            open:
              Number(candle.open),

            high:
              Number(candle.high),

            low:
              Number(candle.low),

            close:
              Number(candle.close)

          };

        });

      console.log(
        "Candles received:",
        candles.length
      );

      updateStatus("Connected");

      updatePrice();

      analyzeMarket();

    }

    return;

  }

  // Live candle update
  if (data.msg_type === "ohlc") {

    processLiveCandle(
      data.ohlc
    );

    return;

  }

}

// -----------------------------------------------------
// LIVE CANDLE
// -----------------------------------------------------

function processLiveCandle(candle) {

  if (!candle) return;

  const newCandle = {

    epoch:
      Number(candle.epoch),

    open:
      Number(candle.open),

    high:
      Number(candle.high),

    low:
      Number(candle.low),

    close:
      Number(candle.close)

  };

  if (candles.length === 0) {

    candles.push(newCandle);

  } else {

    const last =
      candles[candles.length - 1];

    if (
      Number(last.epoch) ===
      newCandle.epoch
    ) {

      candles[
        candles.length - 1
      ] = newCandle;

    } else if (
      newCandle.epoch >
      Number(last.epoch)
    ) {

      candles.push(newCandle);

    }

  }

  if (candles.length > 250) {
    candles.shift();
  }

  updatePrice();

  analyzeMarket();

}

// -----------------------------------------------------
// PRICE
// -----------------------------------------------------

function updatePrice() {

  if (
    !priceElement ||
    candles.length === 0
  ) {
    return;
  }

  const last =
    candles[candles.length - 1];

  priceElement.textContent =
    formatPrice(last.close);

}

// -----------------------------------------------------
// PRICE FORMAT
// -----------------------------------------------------

function formatPrice(price) {

  if (!Number.isFinite(price)) {
    return "--";
  }

  return price.toFixed(2);

}

// -----------------------------------------------------
// EMA
// -----------------------------------------------------

function calculateEMA(values, period) {

  if (
    values.length < period
  ) {
    return null;
  }

  const multiplier =
    2 / (period + 1);

  let ema = 0;

  for (
    let i = 0;
    i < period;
    i++
  ) {

    ema += values[i];

  }

  ema /= period;

  for (
    let i = period;
    i < values.length;
    i++
  ) {

    ema =
      (
        values[i] - ema
      ) *
      multiplier +
      ema;

  }

  return ema;

}

// -----------------------------------------------------
// RSI
// -----------------------------------------------------

function calculateRSI(
  values,
  period = 14
) {

  if (
    values.length <= period
  ) {
    return 50;
  }

  let gain = 0;

  let loss = 0;

  const start =
    values.length - period;

  for (
    let i = start;
    i < values.length;
    i++
  ) {

    const change =
      values[i] -
      values[i - 1];

    if (change > 0) {

      gain += change;

    } else {

      loss +=
        Math.abs(change);

    }

  }

  if (loss === 0) {
    return 100;
  }

  const rs =
    (gain / period) /
    (loss / period);

  return (
    100 -
    100 / (1 + rs)
  );

}

// -----------------------------------------------------
// ATR
// -----------------------------------------------------

function calculateATR(
  candleData,
  period = 14
) {

  if (
    candleData.length <= period
  ) {
    return 0;
  }

  const trueRanges = [];

  for (
    let i = 1;
    i < candleData.length;
    i++
  ) {

    const current =
      candleData[i];

    const previous =
      candleData[i - 1];

    const tr =
      Math.max(

        current.high -
          current.low,

        Math.abs(
          current.high -
          previous.close
        ),

        Math.abs(
          current.low -
          previous.close
        )

      );

    trueRanges.push(tr);

  }

  const recent =
    trueRanges.slice(-period);

  if (recent.length === 0) {
    return 0;
  }

  return (
    recent.reduce(
      (a, b) => a + b,
      0
    ) /
    recent.length
  );

}

// -----------------------------------------------------
// TREND
// -----------------------------------------------------

function calculateTrend(
  closes
) {

  if (
    closes.length < 30
  ) {
    return "WAITING";
  }

  const ema9 =
    calculateEMA(closes, 9);

  const ema21 =
    calculateEMA(closes, 21);

  const ema50 =
    calculateEMA(closes, 50);

  if (
    ema9 === null ||
    ema21 === null ||
    ema50 === null
  ) {
    return "WAITING";
  }

  const price =
    closes[closes.length - 1];

  if (
    ema9 > ema21 &&
    ema21 > ema50 &&
    price > ema9
  ) {

    return "BULLISH";

  }

  if (
    ema9 < ema21 &&
    ema21 < ema50 &&
    price < ema9
  ) {

    return "BEARISH";

  }

  if (
    ema9 > ema21
  ) {

    return "BULLISH";

  }

  if (
    ema9 < ema21
  ) {

    return "BEARISH";

  }

  return "SIDEWAYS";

}

// -----------------------------------------------------
// MOMENTUM
// -----------------------------------------------------

function calculateMomentum(
  closes
) {

  if (
    closes.length < 10
  ) {
    return "WAITING";
  }

  const current =
    closes[closes.length - 1];

  const previous =
    closes[closes.length - 6];

  if (
    current > previous
  ) {

    return "BUYING";

  }

  if (
    current < previous
  ) {

    return "SELLING";

  }

  return "NEUTRAL";

}

// -----------------------------------------------------
// MARKET STRUCTURE
// -----------------------------------------------------

function calculateStructure(
  candleData
) {

  if (
    candleData.length < 20
  ) {
    return "WAITING";
  }

  const recent =
    candleData.slice(-20);

  const highs =
    recent.map(c => c.high);

  const lows =
    recent.map(c => c.low);

  const current =
    recent[recent.length - 1]
      .close;

  const highest =
    Math.max(...highs);

  const lowest =
    Math.min(...lows);

  const range =
    highest - lowest;

  if (range <= 0) {
    return "NEUTRAL";
  }

  const position =
    (current - lowest) /
    range;

  if (position > 0.70) {
    return "HIGH";
  }

  if (position < 0.30) {
    return "LOW";
  }

  return "MID-RANGE";

}

// -----------------------------------------------------
// LIQUIDITY
// -----------------------------------------------------

function calculateLiquidity(
  candleData
) {

  if (
    candleData.length < 20
  ) {
    return "WAITING";
  }

  const recent =
    candleData.slice(-20);

  const atr =
    calculateATR(
      candleData,
      14
    );

  if (atr <= 0) {
    return "NORMAL";
  }

  const last =
    recent[recent.length - 1];

  const range =
    last.high -
    last.low;

  if (
    range > atr * 1.8
  ) {

    return "HIGH";

  }

  if (
    range < atr * 0.5
  ) {

    return "LOW";

  }

  return "NORMAL";

}

// -----------------------------------------------------
// MAIN ANALYSIS
// -----------------------------------------------------

function analyzeMarket() {

  if (
    candles.length < 50
  ) {

    setSignal(
      "WAIT",
      0
    );

    setTrend(
      "Waiting"
    );

    setMomentum(
      "Waiting"
    );

    setStructure(
      "Waiting"
    );

    setLiquidity(
      "Waiting"
    );

    return;

  }

  const closes =
    candles.map(
      c => c.close
    );

  const trend =
    calculateTrend(
      closes
    );

  const momentum =
    calculateMomentum(
      closes
    );

  const structure =
    calculateStructure(
      candles
    );

  const liquidity =
    calculateLiquidity(
      candles
    );

  const ema9 =
    calculateEMA(
      closes,
      9
    );

  const ema21 =
    calculateEMA(
      closes,
      21
    );

  const rsi =
    calculateRSI(
      closes,
      14
    );

  let buyScore = 0;

  let sellScore = 0;

  // -------------------------------
  // TREND
  // -------------------------------

  if (
    trend === "BULLISH"
  ) {

    buyScore += 30;

  }

  if (
    trend === "BEARISH"
  ) {

    sellScore += 30;

  }

  // -------------------------------
  // EMA
  // -------------------------------

  if (
    ema9 > ema21
  ) {

    buyScore += 20;

  }

  if (
    ema9 < ema21
  ) {

    sellScore += 20;

  }

  // -------------------------------
  // RSI
  // -------------------------------

  if (
    rsi >= 50 &&
    rsi <= 70
  ) {

    buyScore += 20;

  }

  if (
    rsi <= 50 &&
    rsi >= 30
  ) {

    sellScore += 20;

  }

  // -------------------------------
  // MOMENTUM
  // -------------------------------

  if (
    momentum === "BUYING"
  ) {

    buyScore += 15;

  }

  if (
    momentum === "SELLING"
  ) {

    sellScore += 15;

  }

  // -------------------------------
  // CANDLE
  // -------------------------------

  const last =
    candles[candles.length - 1];

  if (
    last.close >
    last.open
  ) {

    buyScore += 10;

  }

  if (
    last.close <
    last.open
  ) {

    sellScore += 10;

  }

  // -------------------------------
  // STRUCTURE
  // -------------------------------

  if (
    structure === "LOW"
  ) {

    buyScore += 5;

  }

  if (
    structure === "HIGH"
  ) {

    sellScore += 5;

  }

  // -------------------------------
  // SIGNAL
  // -------------------------------

  let signal = "WAIT";

  let confidence = 50;

  const difference =
    Math.abs(
      buyScore -
      sellScore
    );

  if (
    buyScore > sellScore &&
    buyScore >= 60
  ) {

    signal = "BUY";

    confidence =
      Math.min(
        95,
        50 + difference
      );

  } else if (
    sellScore > buyScore &&
    sellScore >= 60
  ) {

    signal = "SELL";

    confidence =
      Math.min(
        95,
        50 + difference
      );

  } else {

    signal = "WAIT";

    confidence =
      Math.min(
        65,
        45 + difference
      );

  }

  // -------------------------------
  // DISPLAY
  // -------------------------------

  setSignal(
    signal,
    confidence
  );

  setTrend(
    trend
  );

  setMomentum(
    momentum
  );

  setStructure(
    structure
  );

  setLiquidity(
    liquidity
  );

  console.log(
    "MARKET ANALYSIS",
    {
      market:
        currentSymbol,

      timeframe:
        currentGranularity,

      price:
        last.close,

      RSI:
        rsi.toFixed(2),

      EMA9:
        ema9.toFixed(2),

      EMA21:
        ema21.toFixed(2),

      trend,

      momentum,

      structure,

      liquidity,

      buyScore,

      sellScore,

      signal,

      confidence
    }
  );

}

// -----------------------------------------------------
// DISPLAY SIGNAL
// -----------------------------------------------------

function setSignal(
  signal,
  confidence
) {

  if (signalElement) {

    signalElement.textContent =
      signal;

    signalElement.classList.remove(
      "buy",
      "sell",
      "wait"
    );

    signalElement.classList.add(
      signal.toLowerCase()
    );

  }

  if (confidenceElement) {

    if (
      confidence === 0
    ) {

      confidenceElement.textContent =
        "--%";

    } else {

      confidenceElement.textContent =
        Math.round(
          confidence
        ) + "%";

    }

  }

}

// -----------------------------------------------------
// DISPLAY TREND
// -----------------------------------------------------

function setTrend(value) {

  if (!trendElement) return;

  trendElement.textContent =
    value;

}

// -----------------------------------------------------
// DISPLAY MOMENTUM
// -----------------------------------------------------

function setMomentum(value) {

  if (!momentumElement) return;

  momentumElement.textContent =
    value;

}

// -----------------------------------------------------
// DISPLAY STRUCTURE
// -----------------------------------------------------

function setStructure(value) {

  if (!structureElement) return;

  structureElement.textContent =
    value;

}

// -----------------------------------------------------
// DISPLAY LIQUIDITY
// -----------------------------------------------------

function setLiquidity(value) {

  if (!liquidityElement) return;

  liquidityElement.textContent =
    value;

}

// -----------------------------------------------------
// STATUS
// -----------------------------------------------------

function updateStatus(
  status
) {

  if (statusElement) {

    statusElement.textContent =
      status;

  }

  console.log(
    "STATUS:",
    status
  );

}

// -----------------------------------------------------
// RESTART MARKET
// -----------------------------------------------------

function restartMarket() {

  candles = [];

  setSignal(
    "WAIT",
    0
  );

  setTrend(
    "Connecting..."
  );

  setMomentum(
    "Connecting..."
  );

  setStructure(
    "Connecting..."
  );

  setLiquidity(
    "Connecting..."
  );

  if (
    socket &&
    socket.readyState ===
      WebSocket.OPEN
  ) {

    requestCandles();

  } else {

    connectToDeriv();

  }

}

// -----------------------------------------------------
// PAGE VISIBILITY
// -----------------------------------------------------

document.addEventListener(
  "visibilitychange",
  function () {

    if (
      document.visibilityState ===
      "visible"
    ) {

      if (
        !socket ||
        socket.readyState !==
          WebSocket.OPEN
      ) {

        connectToDeriv();

      }

    }

  }
);

// -----------------------------------------------------
// INTERNET RECOVERY
// -----------------------------------------------------

window.addEventListener(
  "online",
  function () {

    console.log(
      "Internet connection restored"
    );

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {

      connectToDeriv();

    }

  }
);
