// Compatibility and responsiveness fixes loaded after app.js.

const originalGzip = gzip;
const originalGunzip = gunzip;

// Keep newly generated signals in the original raw-gzip format. The joining
// page begins decoding its URL before this file loads, so adding a format byte
// here would make an otherwise valid join URL fail during initial page load.
gzip = async function gzipCompatible(bytes) {
  if (!("CompressionStream" in window)) {
    throw new Error("This browser cannot create compressed QR signals. Please update the browser.");
  }
  return originalGzip(bytes);
};

// Decode current raw-gzip signals and remain tolerant of the briefly deployed
// prefixed format so an already-open answer screen can still be scanned.
gunzip = async function gunzipCompatible(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot read compressed QR signals. Please update the browser.");
  }

  try {
    return await originalGunzip(bytes);
  } catch (rawError) {
    if (bytes.length > 1 && bytes[0] === 1) {
      return originalGunzip(bytes.slice(1));
    }
    if (bytes.length > 1 && bytes[0] === 0) {
      return bytes.slice(1);
    }
    throw rawError;
  }
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
