// Compatibility and responsiveness fixes loaded after app.js.

const originalGzip = gzip;
const originalGunzip = gunzip;

gzip = async function gzipWithFallback(bytes) {
  if ("CompressionStream" in window) {
    const compressed = await originalGzip(bytes);
    const result = new Uint8Array(compressed.length + 1);
    result[0] = 1;
    result.set(compressed, 1);
    return result;
  }

  const result = new Uint8Array(bytes.length + 1);
  result[0] = 0;
  result.set(bytes, 1);
  return result;
};

gunzip = async function gunzipWithFallback(bytes) {
  if (bytes.length < 2) throw new Error("Signal is empty.");
  const format = bytes[0];
  const payload = bytes.slice(1);

  if (format === 0) return payload;
  if (format === 1 && "DecompressionStream" in window) return originalGunzip(payload);
  if (format === 1) throw new Error("Compressed QR signals are not supported by this browser.");
  throw new Error("Unknown QR signal format.");
};

waitForIce = function waitForIceResponsive(peerConnection, timeoutMs = 4000) {
  if (peerConnection.iceGatheringState === "complete") return Promise.resolve();

  return new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve();
    };

    const timeout = setTimeout(finish, timeoutMs);
    peerConnection.addEventListener("icegatheringstatechange", () => {
      if (peerConnection.iceGatheringState === "complete") finish();
    });
    peerConnection.addEventListener("icecandidate", event => {
      if (!event.candidate) finish();
    });
  });
};

startHost = async function startHostResponsive() {
  isHost = true;
  localPlayerIndex = 0;
  hostRoomButton.disabled = true;
  hostTools.classList.remove("hidden");
  answerPanel.classList.remove("hidden");
  qrList.innerHTML = "";
  setStatus("Starting host and creating player QR codes...");

  const slots = [1, 2, 3];
  const cards = new Map();

  for (const playerIndex of slots) {
    const card = document.createElement("article");
    card.className = "qr-card";
    card.innerHTML = `<div class="qr-placeholder">Creating…</div><strong>Player ${playerIndex + 1}</strong>`;
    cards.set(playerIndex, card);
    qrList.append(card);
  }

  let completed = 0;
  await Promise.all(slots.map(async playerIndex => {
    const signal = await makeOffer(playerIndex);
    const joinUrl = `${location.href.split("#")[0]}#join=${signal}`;
    const card = cards.get(playerIndex);
    const title = document.createElement("strong");
    title.textContent = `Player ${playerIndex + 1}`;
    card.replaceChildren(qrImage(joinUrl, `Join QR code for Player ${playerIndex + 1}`), title);
    completed += 1;
    setStatus(`Created ${completed} of ${slots.length} player QR codes...`);
  }));

  setStatus("Ready. Joining phones should scan one player QR code each.");
  renderPlayerButtons();
};
