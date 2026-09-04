// =====================================================
// // ============================================================
// DERIV ANALYZER V4
// Mobile Market Analyzer - Analysis Only
// No trading / No account authorization
// ============================================================

"use strict";

// ------------------------------------------------------------
// DERIV CONNECTION
// ------------------------------------------------------------
const WS_URL = "wss://ws.binaryws.com/websockets/v3";

let ws = null;
let reconnectTimer = null;
let pingTimer = null;
let reconnectAttempts = 0;
let manualClose = false;

let currentSymbol = "1HZ10V";
let currentMarketName = "Volatility 10 (1s)";

let tickPrices = [];
let candles = [];
let lastPrice = null;
let lastEpoch = null;

let signalHistory = [];
let lastSignal = "WAIT";
let lastAlertTime = 0;

// ------------------------------------------------------------
// MARKETS
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// DOM HELPERS
// ------------------------------------------------------------
function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function setHTML(id, value) {
    const el = $(id);
    if (el) el.innerHTML = value;
}

// ------------------------------------------------------------
// FIND COMMON ELEMENT NAMES
// ------------------------------------------------------------
function updateStatus(text, online = false) {
    const possible = [
        "status",
        "connectionStatus",
        "connection",
        "wsStatus"
    ];

    possible.forEach(id => {
        const el = $(id);

        if (el) {
            el.textContent = text;

            if (online) {
                el.classList.add("connected");
                el.classList.remove("disconnected");
            } else {
                el.classList.remove("connected");
                el.classList.add("disconnected");
            }
        }
    });
}

// ------------------------------------------------------------
// CREATE MARKET SELECT IF NOT PRESENT
// ------------------------------------------------------------
function createMarketSelector() {

    let select =
        $("marketSelect") ||
        $("market") ||
        $("symbolSelect");

    if (!select) return;

    select.innerHTML = "";

    markets.forEach(item => {

        const option = document.createElement("option");

        option.value = item[0];
        option.textContent = item[1];

        if (item[0] === currentSymbol) {
            option.selected = true;
        }

        select.appendChild(option);
    });

    select.addEventListener("change", () => {

        const symbol = select.value;

        const market = markets.find(x => x[0] === symbol);

        currentSymbol = symbol;
        currentMarketName = market ? market[1] : symbol;

        resetMarket();

        connectDeriv();
    });
}

// ------------------------------------------------------------
// RESET MARKET
// ------------------------------------------------------------
function resetMarket() {

    tickPrices = [];
    candles = [];

    lastPrice = null;
    lastEpoch = null;

    lastSignal = "WAIT";

    setText("price", "--");
    setText("signal", "WAIT");
    setText("confidence", "0%");
    setText("trend", "WAITING");

    setText("bos", "WAITING");
    setText("liquidity", "WAITING");
    setText("fvg", "WAITING");
    setText("candle", "WAITING");
    setText("support", "--");
    setText("resistance", "--");
}

// ------------------------------------------------------------
// CONNECT
// ------------------------------------------------------------
function connectDeriv() {

    manualClose = false;

    clearTimeout(reconnectTimer);

    if (ws) {

        try {
            ws.onclose = null;
            ws.close();
        } catch (e) {}
    }

    updateStatus("Connecting to Deriv...", false);

    const url = WS_URL;

    try {

        ws = new WebSocket(url);

    } catch (error) {

        scheduleReconnect();
        return;
    }

    ws.onopen = () => {

        reconnectAttempts = 0;

        updateStatus("Connected to Deriv", true);

        console.log("DERIV CONNECTED");

        requestHistory();

        subscribeTicks();

        startPing();
    };

    ws.onmessage = event => {

        try {

            const data = JSON.parse(event.data);

            handleMessage(data);

        } catch (error) {

            console.error("Invalid Deriv message:", error);
        }
    };

    ws.onerror = error => {

        console.warn("Deriv WebSocket error", error);

        updateStatus("Connection error", false);
    };

    ws.onclose = () => {

        stopPing();

        updateStatus("Disconnected - reconnecting...", false);

        if (!manualClose) {
            scheduleReconnect();
        }
    };
}

// ------------------------------------------------------------
// RECONNECT
// ------------------------------------------------------------
function scheduleReconnect() {

    clearTimeout(reconnectTimer);

    reconnectAttempts++;

    const delay =
        Math.min(30000, 2000 * reconnectAttempts);

    updateStatus(
        `Reconnecting in ${Math.ceil(delay / 1000)}s...`,
        false
    );

    reconnectTimer = setTimeout(() => {

        connectDeriv();

    }, delay);
}

// ------------------------------------------------------------
// PING
// ------------------------------------------------------------
function startPing() {

    stopPing();

    pingTimer = setInterval(() => {

        if (ws && ws.readyState === WebSocket.OPEN) {

            ws.send(JSON.stringify({
                ping: 1
            }));
        }

    }, 30000);
}

function stopPing() {

    if (pingTimer) {

        clearInterval(pingTimer);
        pingTimer = null;
    }
}

// ------------------------------------------------------------
// SEND
// ------------------------------------------------------------
function send(data) {

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return false;
    }

    try {

        ws.send(JSON.stringify(data));

        return true;

    } catch (error) {

        console.error(error);

        return false;
    }
}

// ------------------------------------------------------------
// HISTORICAL DATA
// ------------------------------------------------------------
function requestHistory() {

    send({

        ticks_history: currentSymbol,

        count: 500,

        end: "latest",

        style: "candles",

        granularity: 60,

        req_id: 10

    });
}

// ------------------------------------------------------------
// LIVE TICKS
// ------------------------------------------------------------
function subscribeTicks() {

    send({

        ticks: currentSymbol,

        subscribe: 1,

        req_id: 20

    });
}

// ------------------------------------------------------------
// MESSAGE HANDLER
// ------------------------------------------------------------
function handleMessage(data) {

    if (data.error) {

        console.error(
            "Deriv error:",
            data.error.message
        );

        updateStatus(
            "Deriv error: " + data.error.message,
            false
        );

        return;
    }

    // Historical candles
    if (data.msg_type === "candles") {

        processHistoricalCandles(data.candles);

        return;
    }

    // Historical ticks fallback
    if (data.msg_type === "history") {

        processTickHistory(data);

        return;
    }

    // Live tick
    if (data.msg_type === "tick") {

        processTick(data.tick);

        return;
    }
}

// ------------------------------------------------------------
// PROCESS HISTORICAL CANDLES
// ------------------------------------------------------------
function processHistoricalCandles(data) {

    if (!Array.isArray(data)) return;

    candles = data.map(c => ({

        time: Number(c.epoch),

        open: Number(c.open),

        high: Number(c.high),

        low: Number(c.low),

        close: Number(c.close)

    }));

    candles = candles.filter(c =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    );

    if (candles.length > 500) {

        candles = candles.slice(-500);
    }

    if (candles.length) {

        lastPrice =
            candles[candles.length - 1].close;

        updatePrice(lastPrice);

        analyze();
    }
}

// ------------------------------------------------------------
// PROCESS TICK HISTORY
// ------------------------------------------------------------
function processTickHistory(data) {

    const prices = data.history?.prices || [];
    const times = data.history?.times || [];

    if (!prices.length) return;

    tickPrices = prices.map(Number);

    if (tickPrices.length > 5000) {

        tickPrices =
            tickPrices.slice(-5000);
    }

    lastPrice =
        tickPrices[tickPrices.length - 1];

    lastEpoch =
        times[times.length - 1];

    updatePrice(lastPrice);
}

// ------------------------------------------------------------
// PROCESS LIVE TICK
// ------------------------------------------------------------
function processTick(tick) {

    if (!tick) return;

    const price = Number(tick.quote);

    if (!Number.isFinite(price)) return;

    lastPrice = price;

    lastEpoch = Number(tick.epoch);

    tickPrices.push(price);

    if (tickPrices.length > 5000) {

        tickPrices.shift();
    }

    updatePrice(price);

    updateCurrentCandle(
        price,
        lastEpoch
    );

    analyze();
}

// ------------------------------------------------------------
// CURRENT CANDLE
// ------------------------------------------------------------
function updateCurrentCandle(price, epoch) {

    const minute =
        Math.floor(epoch / 60) * 60;

    let current =
        candles[candles.length - 1];

    if (!current || current.time !== minute) {

        current = {

            time: minute,

            open: price,

            high: price,

            low: price,

            close: price
        };

        candles.push(current);

    } else {

        current.high =
            Math.max(current.high, price);

        current.low =
            Math.min(current.low, price);

        current.close = price;
    }

    if (candles.length > 500) {

        candles.shift();
    }
}

// ------------------------------------------------------------
// PRICE DISPLAY
// ------------------------------------------------------------
function updatePrice(price) {

    if (!Number.isFinite(price)) return;

    let decimals = 2;

    if (price < 10) decimals = 5;

    if (price >= 1000) decimals = 2;

    setText(
        "price",
        price.toFixed(decimals)
    );

    setText(
        "market",
        currentMarketName
    );

    setText(
        "symbol",
        currentSymbol
    );
}

// ------------------------------------------------------------
// MAIN ANALYZER
// ------------------------------------------------------------
function analyze() {

    if (candles.length < 30) {

        if (tickPrices.length < 30) {

            setText("signal", "WAIT");

            setText(
                "confidence",
                "Building data..."
            );

            return;
        }
    }

    const c = candles;

    const closes =
        c.map(x => x.close);

    const highs =
        c.map(x => x.high);

    const lows =
        c.map(x => x.low);

    const current =
        closes[closes.length - 1];

    // Indicators
    const emaFast =
        EMA(closes, 9);

    const emaSlow =
        EMA(closes, 21);

    const rsi =
        RSI(closes, 14);

    const atr =
        ATR(c, 14);

    const trend =
        detectTrend(
            emaFast,
            emaSlow,
            current
        );

    const sr =
        supportResistance(c);

    const bos =
        detectBOS(c);

    const liquidity =
        detectLiquiditySweep(c);

    const fvg =
        detectFVG(c);

    const candle =
        candleConfirmation(c);

    let buyScore = 0;
    let sellScore = 0;

    // --------------------------------------------------------
    // TREND
    // --------------------------------------------------------

    if (trend === "BULLISH") {

        buyScore += 25;
    }

    if (trend === "BEARISH") {

        sellScore += 25;
    }

    // --------------------------------------------------------
    // RSI
    // --------------------------------------------------------

    if (rsi >= 52 && rsi <= 70) {

        buyScore += 15;
    }

    if (rsi <= 48 && rsi >= 30) {

        sellScore += 15;
    }

    // --------------------------------------------------------
    // BOS
    // --------------------------------------------------------

    if (bos === "BULLISH BOS") {

        buyScore += 20;
    }

    if (bos === "BEARISH BOS") {

        sellScore += 20;
    }

    // --------------------------------------------------------
    // LIQUIDITY
    // --------------------------------------------------------

    if (liquidity === "BULLISH SWEEP") {

        buyScore += 15;
    }

    if (liquidity === "BEARISH SWEEP") {

        sellScore += 15;
    }

    // --------------------------------------------------------
    // FVG
    // --------------------------------------------------------

    if (fvg === "BULLISH FVG") {

        buyScore += 10;
    }

    if (fvg === "BEARISH FVG") {

        sellScore += 10;
    }

    // --------------------------------------------------------
    // CANDLE
    // --------------------------------------------------------

    if (candle === "BULLISH") {

        buyScore += 15;
    }

    if (candle === "BEARISH") {

        sellScore += 15;
    }

    // --------------------------------------------------------
    // SIGNAL
    // --------------------------------------------------------

    let signal = "WAIT";

    let confidence = 0;

    if (buyScore > sellScore) {

        confidence = buyScore;

        if (confidence >= 55) {

            signal = "BUY";
        }

    } else if (sellScore > buyScore) {

        confidence = sellScore;

        if (confidence >= 55) {

            signal = "SELL";
        }
    }

    confidence =
        Math.min(95, Math.max(20, confidence));

    // Avoid fake 100% confidence
    if (signal === "WAIT") {

        confidence =
            Math.min(54, confidence);
    }

    updateAnalysisUI({

        signal,

        confidence,

        trend,

        bos,

        liquidity,

        fvg,

        candle,

        support: sr.support,

        resistance: sr.resistance,

        rsi,

        atr
    });

    handleSignal(signal, confidence);
}

// ------------------------------------------------------------
// EMA
// ------------------------------------------------------------
function EMA(values, period) {

    if (!values.length) return 0;

    const k =
        2 / (period + 1);

    let ema =
        values[0];

    for (let i = 1; i < values.length; i++) {

        ema =
            values[i] * k +
            ema * (1 - k);
    }

    return ema;
}

// ------------------------------------------------------------
// RSI
// ------------------------------------------------------------
function RSI(values, period) {

    if (values.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (
        let i = values.length - period;
        i < values.length;
        i++
    ) {

        const change =
            values[i] - values[i - 1];

        if (change > 0) {

            gains += change;

        } else {

            losses -= change;
        }
    }

    if (losses === 0) return 70;

    const rs =
        gains / losses;

    return 100 - (100 / (1 + rs));
}

// ------------------------------------------------------------
// ATR
// ------------------------------------------------------------
function ATR(data, period) {

    if (data.length < period + 1) return 0;

    const trs = [];

    for (
        let i = 1;
        i < data.length;
        i++
    ) {

        const high = data[i].high;
        const low = data[i].low;
        const previousClose =
            data[i - 1].close;

        const tr =
            Math.max(
                high - low,
                Math.abs(high - previousClose),
                Math.abs(low - previousClose)
            );

        trs.push(tr);
    }

    const recent =
        trs.slice(-period);

    return recent.reduce(
        (a, b) => a + b,
        0
    ) / recent.length;
}

// ------------------------------------------------------------
// TREND
// ------------------------------------------------------------
function detectTrend(
    emaFast,
    emaSlow,
    price
) {

    if (
        emaFast > emaSlow &&
        price > emaFast
    ) {

        return "BULLISH";
    }

    if (
        emaFast < emaSlow &&
        price < emaFast
    ) {

        return "BEARISH";
    }

    return "SIDEWAYS";
}

// ------------------------------------------------------------
// SUPPORT / RESISTANCE
// ------------------------------------------------------------
function supportResistance(data) {

    const recent =
        data.slice(-50);

    const support =
        Math.min(
            ...recent.map(x => x.low)
        );

    const resistance =
        Math.max(
            ...recent.map(x => x.high)
        );

    return {
        support,
        resistance
    };
}

// ------------------------------------------------------------
// BOS
// ------------------------------------------------------------
function detectBOS(data) {

    if (data.length < 10) {

        return "WAITING";
    }

    const last =
        data[data.length - 1];

    const previous =
        data.slice(-10, -1);

    const previousHigh =
        Math.max(
            ...previous.map(x => x.high)
        );

    const previousLow =
        Math.min(
            ...previous.map(x => x.low)
        );

    if (last.close > previousHigh) {

        return "BULLISH BOS";
    }

    if (last.close < previousLow) {

        return "BEARISH BOS";
    }

    return "NO BOS";
}

// ------------------------------------------------------------
// LIQUIDITY SWEEP
// ------------------------------------------------------------
function detectLiquiditySweep(data) {

    if (data.length < 10) {

        return "WAITING";
    }

    const last =
        data[data.length - 1];

    const previous =
        data.slice(-10, -1);

    const high =
        Math.max(
            ...previous.map(x => x.high)
        );

    const low =
        Math.min(
            ...previous.map(x => x.low)
        );

    // Sweep low then close back above
    if (
        last.low < low &&
        last.close > low
    ) {

        return "BULLISH SWEEP";
    }

    // Sweep high then close back below
    if (
        last.high > high &&
        last.close < high
    ) {

        return "BEARISH SWEEP";
    }

    return "NO SWEEP";
}

// ------------------------------------------------------------
// FAIR VALUE GAP
// ------------------------------------------------------------
function detectFVG(data) {

    if (data.length < 5) {

        return "WAITING";
    }

    const a =
        data[data.length - 3];

    const b =
        data[data.length - 2];

    const c =
        data[data.length - 1];

    // Bullish FVG
    if (c.low > a.high) {

        return "BULLISH FVG";
    }

    // Bearish FVG
    if (c.high < a.low) {

        return "BEARISH FVG";
    }

    return "NO FVG";
}

// ------------------------------------------------------------
// CANDLE CONFIRMATION
// ------------------------------------------------------------
function candleConfirmation(data) {

    if (data.length < 3) {

        return "WAITING";
    }

    const c =
        data[data.length - 1];

    const body =
        Math.abs(c.close - c.open);

    const range =
        c.high - c.low;

    if (range === 0) {

        return "NEUTRAL";
    }

    const upperWick =
        c.high -
        Math.max(c.open, c.close);

    const lowerWick =
        Math.min(c.open, c.close) -
        c.low;

    // Bullish candle / rejection
    if (
        c.close > c.open &&
        (
            body > range * 0.45 ||
            lowerWick > body * 1.2
        )
    ) {

        return "BULLISH";
    }

    // Bearish candle / rejection
    if (
        c.close < c.open &&
        (
            body > range * 0.45 ||
            upperWick > body * 1.2
        )
    ) {

        return "BEARISH";
    }

    return "NEUTRAL";
}

// ------------------------------------------------------------
// UPDATE UI
// ------------------------------------------------------------
function updateAnalysisUI(a) {

    setText(
        "signal",
        a.signal
    );

    setText(
        "confidence",
        Math.round(a.confidence) + "%"
    );

    setText(
        "trend",
        a.trend
    );

    setText(
        "bos",
        a.bos
    );

    setText(
        "liquidity",
        a.liquidity
    );

    setText(
        "fvg",
        a.fvg
    );

    setText(
        "candle",
        a.candle
    );

    if (Number.isFinite(a.support)) {

        setText(
            "support",
            formatPrice(a.support)
        );
    }

    if (Number.isFinite(a.resistance)) {

        setText(
            "resistance",
            formatPrice(a.resistance)
        );
    }

    setText(
        "rsi",
        Number(a.rsi).toFixed(1)
    );

    updateSignalClass(a.signal);
}

// ------------------------------------------------------------
// PRICE FORMAT
// ------------------------------------------------------------
function formatPrice(price) {

    if (!Number.isFinite(price)) {
        return "--";
    }

    if (price < 10) {
        return price.toFixed(5);
    }

    return price.toFixed(2);
}

// ------------------------------------------------------------
// SIGNAL STYLE
// ------------------------------------------------------------
function updateSignalClass(signal) {

    const possible = [
        "signal",
        "signalBox",
        "signalValue"
    ];

    possible.forEach(id => {

        const el = $(id);

        if (!el) return;

        el.classList.remove(
            "buy",
            "sell",
            "wait"
        );

        if (signal === "BUY") {

            el.classList.add("buy");

        } else if (signal === "SELL") {

            el.classList.add("sell");

        } else {

            el.classList.add("wait");
        }
    });
}

// ------------------------------------------------------------
// SIGNAL ALERT
// ------------------------------------------------------------
function handleSignal(
    signal,
    confidence
) {

    if (
        signal === "WAIT" ||
        confidence < 60
    ) {
        return;
    }

    if (signal === lastSignal) {

        return;
    }

    lastSignal = signal;

    addSignalHistory(
        signal,
        confidence
    );

    playAlert();
}

// ------------------------------------------------------------
// SIGNAL HISTORY
// ------------------------------------------------------------
function addSignalHistory(
    signal,
    confidence
) {

    const item = {

        signal,

        confidence,

        price: lastPrice,

        time: new Date()
    };

    signalHistory.unshift(item);

    if (signalHistory.length > 10) {

        signalHistory.pop();
    }

    renderHistory();
}

function renderHistory() {

    const possible = [
        "signalHistory",
        "history",
        "recentSignals"
    ];

    let container = null;

    for (const id of possible) {

        if ($(id)) {

            container = $(id);

            break;
        }
    }

    if (!container) return;

    container.innerHTML = "";

    signalHistory.forEach(item => {

        const row =
            document.createElement("div");

        row.className =
            "signal-history-row";

        row.textContent =
            `${item.signal} ${Math.round(item.confidence)}% — ${formatPrice(item.price)} — ${item.time.toLocaleTimeString()}`;

        container.appendChild(row);
    });
}

// ------------------------------------------------------------
// SOUND ALERT
// ------------------------------------------------------------
function playAlert() {

    const now = Date.now();

    if (now - lastAlertTime < 5000) {

        return;
    }

    lastAlertTime = now;

    try {

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) return;

        const audio =
            new AudioContext();

        const oscillator =
            audio.createOscillator();

        const gain =
            audio.createGain();

        oscillator.frequency.value = 700;

        oscillator.type = "sine";

        gain.gain.value = 0.08;

        oscillator.connect(gain);

        gain.connect(audio.destination);

        oscillator.start();

        oscillator.stop(
            audio.currentTime + 0.25
        );

    } catch (error) {

        console.log(
            "Audio alert unavailable"
        );
    }
}

// ------------------------------------------------------------
// VISIBILITY / RECONNECT CHECK
// ------------------------------------------------------------
document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.visibilityState ===
            "visible"
        ) {

            if (
                !ws ||
                ws.readyState !==
                WebSocket.OPEN
            ) {

                connectDeriv();
            }
        }
    }
);

// ------------------------------------------------------------
// ONLINE / OFFLINE
// ------------------------------------------------------------
window.addEventListener(
    "online",
    () => {

        connectDeriv();
    }
);

window.addEventListener(
    "offline",
    () => {

        updateStatus(
            "Internet disconnected",
            false
        );
    }
);

// ------------------------------------------------------------
// START
// ------------------------------------------------------------
function startAnalyzer() {

    console.log(
        "DERIV ANALYZER V4 STARTING..."
    );

    createMarketSelector();

    resetMarket();

    connectDeriv();
}

// ------------------------------------------------------------
// PAGE READY
// ------------------------------------------------------------
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
} ANALYZER V4
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
