// =====================================================
// DERIV ANALYZER V3
// Public Deriv Market Data
// =====================================================

const WS_URL =
  "wss://ws.binaryws.com/websockets/v3";

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
let reconnectAttempts = 0;
let requestId = 1;


// =====================================================
// ELEMENTS
// =====================================================

const marketSelect =
  document.getElementById("market");

const timeframeSelect =
  document.getElementById("timeframe");

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


// =====================================================
// START
// =====================================================

function startAnalyzer() {

  setupMarket();

  setupTimeframe();

  setupTimeframeButtons();

  connect();

}


// =====================================================
// MARKET
// =====================================================

function setupMarket() {

  if (!marketSelect) return;

  if (
    marketSelect.tagName === "SELECT"
  ) {

    marketSelect.innerHTML = "";

    markets.forEach(function (item) {

      const option =
        document.createElement("option");

      option.value = item[0];

      option.textContent = item[1];

      if (
        item[0] === currentSymbol
      ) {

        option.selected = true;

      }

      marketSelect.appendChild(option);

    });

  }

  marketSelect.addEventListener(
    "change",
    function () {

      currentSymbol =
        this.value;

      restart();

    }
  );

}


// =====================================================
// TIMEFRAME
// =====================================================

function setupTimeframe() {

  if (!timeframeSelect) return;

  if (
    timeframeSelect.tagName === "SELECT"
  ) {

    timeframeSelect.innerHTML = `
      <option value="60">1 Minute</option>
      <option value="300">5 Minutes</option>
      <option value="900">15 Minutes</option>
      <option value="3600">1 Hour</option>
    `;

    timeframeSelect.value =
      String(currentGranularity);

    timeframeSelect.addEventListener(
      "change",
      function () {

        currentGranularity =
          Number(this.value);

        restart();

      }
    );

  }

}


// =====================================================
// TIMEFRAME BUTTONS
// =====================================================

function setupTimeframeButtons() {

  const buttons =
    document.querySelectorAll(
      "[data-timeframe]"
    );

  buttons.forEach(function (button) {

    button.addEventListener(
      "click",
      function () {

        const value =
          Number(
            button.getAttribute(
              "data-timeframe"
            )
          );

        if (!value) return;

        currentGranularity =
          value;

        buttons.forEach(
          function (btn) {

            btn.classList.remove(
              "active"
            );

          }
        );

        button.classList.add(
          "active"
        );

        restart();

      }
    );

  });

}


// =====================================================
// CONNECT
// =====================================================

function connect() {

  clearTimeout(
    reconnectTimer
  );

  updateStatus(
    "Connecting..."
  );

  try {

    socket =
      new WebSocket(
        WS_URL
      );

  } catch (error) {

    showDerivError(
      error.message
    );

    scheduleReconnect();

    return;

  }


  socket.onopen =
    function () {

      console.log(
        "DERIV CONNECTED"
      );

      reconnectAttempts = 0;

      updateStatus(
        "Connected"
      );

      requestCandles();

    };


  socket.onmessage =
    function (event) {

      try {

        const data =
          JSON.parse(
            event.data
          );

        console.log(
          "DERIV RESPONSE:",
          data
        );

        handleMessage(
          data
        );

      } catch (error) {

        console.error(
          error
        );

      }

    };


  socket.onerror =
    function (error) {

      console.error(
        "WEBSOCKET ERROR:",
        error
      );

      updateStatus(
        "Connection error"
      );

    };


  socket.onclose =
    function () {

      console.log(
        "DERIV DISCONNECTED"
      );

      updateStatus(
        "Reconnecting..."
      );

      scheduleReconnect();

    };

}


// =====================================================
// REQUEST CANDLES
// =====================================================

function requestCandles() {

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {

    return;

  }

  candles = [];


  const request = {

    ticks_history:
      currentSymbol,

    adjust_start_time: 1,

    count: 200,

    end: "latest",

    style: "candles",

    granularity:
      currentGranularity,

    subscribe: 1,

    req_id:
      requestId++

  };


  console.log(
    "REQUESTING CANDLES:",
    request
  );


  socket.send(
    JSON.stringify(
      request
    )
  );

}


// =====================================================
// HANDLE MESSAGE
// =====================================================

function handleMessage(data) {

  // -----------------------------------------
  // ERROR
  // -----------------------------------------

  if (data.error) {

    const message =
      data.error.message ||
      data.error.code ||
      "Unknown Deriv error";

    console.error(
      "DERIV API ERROR:",
      data.error
    );

    showDerivError(
      message
    );

    return;

  }


  // -----------------------------------------
  // CANDLES
  // -----------------------------------------

  if (
    data.msg_type ===
    "candles"
  ) {

    if (
      Array.isArray(
        data.candles
      )
    ) {

      candles =
        data.candles.map(
          function (c) {

            return {

              epoch:
                Number(c.epoch),

              open:
                Number(c.open),

              high:
                Number(c.high),

              low:
                Number(c.low),

              close:
                Number(c.close)

            };

          }
        );


      console.log(
        "CANDLES RECEIVED:",
        candles.length
      );


      updateStatus(
        "Connected"
      );

      clearError();

      updatePrice();

      analyze();

    }

    return;

  }


  // -----------------------------------------
  // LIVE OHLC
  // -----------------------------------------

  if (
    data.msg_type ===
    "ohlc"
  ) {

    updateLiveCandle(
      data.ohlc
    );

    return;

  }

}


// =====================================================
// LIVE CANDLE
// =====================================================

function updateLiveCandle(c) {

  if (!c) return;


  const candle = {

    epoch:
      Number(c.epoch),

    open:
      Number(c.open),

    high:
      Number(c.high),

    low:
      Number(c.low),

    close:
      Number(c.close)

  };


  if (
    candles.length === 0
  ) {

    candles.push(
      candle
    );

  } else {

    const last =
      candles[
        candles.length - 1
      ];


    if (
      Number(last.epoch) ===
      candle.epoch
    ) {

      candles[
        candles.length - 1
      ] = candle;

    } else if (
      candle.epoch >
      Number(last.epoch)
    ) {

      candles.push(
        candle
      );

    }

  }


  if (
    candles.length > 250
  ) {

    candles.shift();

  }


  updatePrice();

  analyze();

}


// =====================================================
// PRICE
// =====================================================

function updatePrice() {

  if (
    !priceElement ||
    candles.length === 0
  ) {

    return;

  }


  const last =
    candles[
      candles.length - 1
    ];


  priceElement.textContent =
    Number(
      last.close
    ).toFixed(2);

}


// =====================================================
// EMA
// =====================================================

function EMA(
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


  let ema = 0;


  for (
    let i = 0;
    i < period;
    i++
  ) {

    ema +=
      values[i];

  }


  ema /=
    period;


  for (
    let i = period;
    i < values.length;
    i++
  ) {

    ema =
      (
        values[i] -
        ema
      ) *
      multiplier +
      ema;

  }


  return ema;

}


// =====================================================
// RSI
// =====================================================

function RSI(
  values,
  period = 14
) {

  if (
    values.length <= period
  ) {

    return 50;

  }


  let gains = 0;

  let losses = 0;


  const start =
    values.length -
    period;


  for (
    let i = start;
    i < values.length;
    i++
  ) {

    const change =
      values[i] -
      values[i - 1];


    if (
      change > 0
    ) {

      gains +=
        change;

    } else {

      losses +=
        Math.abs(
          change
        );

    }

  }


  if (
    losses === 0
  ) {

    return 100;

  }


  const rs =
    (gains / period) /
    (losses / period);


  return (
    100 -
    100 / (1 + rs)
  );

}


// =====================================================
// ANALYSIS
// =====================================================

function analyze() {

  if (
    candles.length < 50
  ) {

    setSignal(
      "WAIT",
      0
    );

    setText(
      trendElement,
      "Waiting"
    );

    setText(
      momentumElement,
      "Waiting"
    );

    setText(
      structureElement,
      "Waiting"
    );

    setText(
      liquidityElement,
      "Waiting"
    );

    return;

  }


  const closes =
    candles.map(
      c => c.close
    );


  const ema9 =
    EMA(
      closes,
      9
    );

  const ema21 =
    EMA(
      closes,
      21
    );

  const ema50 =
    EMA(
      closes,
      50
    );


  const rsi =
    RSI(
      closes,
      14
    );


  const price =
    closes[
      closes.length - 1
    ];


  let buy = 0;

  let sell = 0;


  // -----------------------------
  // TREND
  // -----------------------------

  let trend =
    "SIDEWAYS";


  if (
    ema9 > ema21 &&
    ema21 > ema50
  ) {

    trend =
      "BULLISH";

    buy += 35;

  }


  else if (
    ema9 < ema21 &&
    ema21 < ema50
  ) {

    trend =
      "BEARISH";

    sell += 35;

  }


  else if (
    ema9 > ema21
  ) {

    trend =
      "BULLISH";

    buy += 20;

  }


  else if (
    ema9 < ema21
  ) {

    trend =
      "BEARISH";

    sell += 20;

  }


  // -----------------------------
  // RSI
  // -----------------------------

  if (
    rsi > 50 &&
    rsi < 70
  ) {

    buy += 20;

  }


  if (
    rsi < 50 &&
    rsi > 30
  ) {

    sell += 20;

  }


  // -----------------------------
  // MOMENTUM
  // -----------------------------

  const oldPrice =
    closes[
      closes.length - 6
    ];


  let momentum =
    "NEUTRAL";


  if (
    price > oldPrice
  ) {

    momentum =
      "BUYING";

    buy += 20;

  }


  if (
    price < oldPrice
  ) {

    momentum =
      "SELLING";

    sell += 20;

  }


  // -----------------------------
  // LAST CANDLE
  // -----------------------------

  const last =
    candles[
      candles.length - 1
    ];


  if (
    last.close >
    last.open
  ) {

    buy += 10;

  }


  if (
    last.close <
    last.open
  ) {

    sell += 10;

  }


  // -----------------------------
  // STRUCTURE
  // -----------------------------

  const recent =
    candles.slice(
      -20
    );


  const high =
    Math.max(
      ...recent.map(
        c => c.high
      )
    );


  const low =
    Math.min(
      ...recent.map(
        c => c.low
      )
    );


  const range =
    high - low;


  let structure =
    "MID-RANGE";


  if (
    range > 0
  ) {

    const position =
      (
        price - low
      ) /
      range;


    if (
      position < 0.30
    ) {

      structure =
        "LOW";

      buy += 5;

    }


    else if (
      position > 0.70
    ) {

      structure =
        "HIGH";

      sell += 5;

    }

  }


  // -----------------------------
  // LIQUIDITY
  // -----------------------------

  const lastRange =
    last.high -
    last.low;


  let liquidity =
    "NORMAL";


  if (
    range > 0 &&
    lastRange >
      range * 0.20
  ) {

    liquidity =
      "HIGH";

  }


  // -----------------------------
  // FINAL SIGNAL
  // -----------------------------

  let signal =
    "WAIT";


  let confidence =
    50;


  if (
    buy > sell &&
    buy >= 60
  ) {

    signal =
      "BUY";

    confidence =
      Math.min(
        95,
        50 +
        (buy - sell)
      );

  }


  else if (
    sell > buy &&
    sell >= 60
  ) {

    signal =
      "SELL";

    confidence =
      Math.min(
        95,
        50 +
        (sell - buy)
      );

  }


  else {

    signal =
      "WAIT";

    confidence =
      Math.min(
        65,
        45 +
        Math.abs(
          buy - sell
        )
      );

  }


  // -----------------------------
  // DISPLAY
  // -----------------------------

  setSignal(
    signal,
    confidence
  );

  setText(
    trendElement,
    trend
  );

  setText(
    momentumElement,
    momentum
  );

  setText(
    structureElement,
    structure
  );

  setText(
    liquidityElement,
    liquidity
  );


  console.log({
    market:
      currentSymbol,

    timeframe:
      currentGranularity,

    price,

    ema9,

    ema21,

    ema50,

    rsi,

    trend,

    momentum,

    structure,

    liquidity,

    buy,

    sell,

    signal,

    confidence
  });

}


// =====================================================
// DISPLAY SIGNAL
// =====================================================

function setSignal(
  signal,
  confidence
) {

  if (
    signalElement
  ) {

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


  if (
    confidenceElement
  ) {

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


// =====================================================
// TEXT HELPER
// =====================================================

function setText(
  element,
  value
) {

  if (
    element
  ) {

    element.textContent =
      value;

  }

}


// =====================================================
// STATUS
// =====================================================

function updateStatus(
  status
) {

  if (
    statusElement
  ) {

    statusElement.textContent =
      status;

  }

  console.log(
    "STATUS:",
    status
  );

}


// =====================================================
// SHOW REAL DERIV ERROR
// =====================================================

function showDerivError(
  message
) {

  updateStatus(
    "Deriv error"
  );


  if (
    analysisElement
  ) {

    analysisElement.textContent =
      "Deriv error: " +
      message;

  }


  console.error(
    "DERIV ERROR:",
    message
  );

}


// =====================================================
// CLEAR ERROR
// =====================================================

function clearError() {

  if (
    analysisElement
  ) {

    analysisElement.textContent =
      "Live market analysis";

  }

}


// =====================================================
// RESTART
// =====================================================

function restart() {

  candles = [];

  setSignal(
    "WAIT",
    0
  );

  setText(
    trendElement,
    "Waiting"
  );

  setText(
    momentumElement,
    "Waiting"
  );

  setText(
    structureElement,
    "Waiting"
  );

  setText(
    liquidityElement,
    "Waiting"
  );


  if (
    socket &&
    socket.readyState ===
      WebSocket.OPEN
  ) {

    requestCandles();

  } else {

    connect();

  }

}


// =====================================================
// RECONNECT
// =====================================================

function scheduleReconnect() {

  clearTimeout(
    reconnectTimer
  );


  reconnectAttempts++;


  const delay =
    Math.min(
      10000,
      2000 *
      reconnectAttempts
    );


  reconnectTimer =
    setTimeout(
      function () {

        connect();

      },
      delay
    );

}


// =====================================================
// INTERNET RECOVERY
// =====================================================

window.addEventListener(
  "online",
  function () {

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {

      connect();

    }

  }
);


// =====================================================
// START AFTER PAGE LOAD
// =====================================================

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startAnalyzer
  );

} else {

  startAnalyzer();

}
