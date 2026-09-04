"use strict";

// ==========================================
// DERIV WEBSOCKET CONNECTION DIAGNOSTIC
// ==========================================

const WS_URL = "wss://ws.binaryws.com/websockets/v3";

const SYMBOL = "1HZ10V";

let ws = null;
let reconnectTimer = null;

function show(message) {
    console.log(message);

    const ids = [
        "status",
        "connectionStatus",
        "connection",
        "wsStatus"
    ];

    let found = false;

    ids.forEach(id => {
        const el = document.getElementById(id);

        if (el) {
            el.textContent = message;
            found = true;
        }
    });

    // If your HTML has no status element, create one
    if (!found) {
        let box = document.getElementById("diagnosticStatus");

        if (!box) {
            box = document.createElement("div");
            box.id = "diagnosticStatus";

            box.style.position = "fixed";
            box.style.top = "10px";
            box.style.left = "10px";
            box.style.right = "10px";
            box.style.zIndex = "99999";
            box.style.padding = "15px";
            box.style.background = "#111";
            box.style.color = "#fff";
            box.style.fontSize = "16px";
            box.style.borderRadius = "10px";
            box.style.fontFamily = "Arial";

            document.body.appendChild(box);
        }

        box.textContent = message;
    }
}

function connect() {

    show("STEP 1: Starting WebSocket...");

    try {

        ws = new WebSocket(WS_URL);

    } catch (error) {

        show(
            "ERROR: WebSocket could not start: " +
            error.message
        );

        return;
    }

    ws.onopen = function () {

        show("STEP 2: CONNECTED to Deriv!");

        console.log(
            "Deriv WebSocket connected successfully."
        );

        // Test public tick request
        const request = {
            ticks: SYMBOL,
            subscribe: 1
        };

        show(
            "STEP 3: Sending tick request..."
        );

        try {

            ws.send(
                JSON.stringify(request)
            );

        } catch (error) {

            show(
                "ERROR sending request: " +
                error.message
            );
        }
    };

    ws.onmessage = function (event) {

        console.log(
            "Deriv message:",
            event.data
        );

        try {

            const data =
                JSON.parse(event.data);

            if (data.error) {

                show(
                    "DERIV ERROR: " +
                    data.error.message
                );

                return;
            }

            if (data.msg_type === "tick") {

                const price =
                    data.tick.quote;

                show(
                    "SUCCESS! LIVE PRICE: " +
                    price
                );

                return;
            }

            show(
                "CONNECTED. Received: " +
                data.msg_type
            );

        } catch (error) {

            show(
                "ERROR reading Deriv response: " +
                error.message
            );
        }
    };

    ws.onerror = function () {

        show(
            "STEP ERROR: WebSocket error. " +
            "The browser could not establish the connection."
        );
    };

    ws.onclose = function (event) {

        console.log(
            "WebSocket closed:",
            event.code,
            event.reason
        );

        show(
            "CONNECTION CLOSED. Code: " +
            event.code +
            ". Reconnecting..."
        );

        clearTimeout(reconnectTimer);

        reconnectTimer = setTimeout(
            connect,
            5000
        );
    };
}

function start() {

    show("DERIV DIAGNOSTIC STARTING...");

    connect();
}

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        start
    );

} else {

    start();
}
