const hostRoomButton = document.querySelector("#host-room");
const multiplayerStatus = document.querySelector("#multiplayer-status");
const hostTools = document.querySelector("#host-tools");
const guestTools = document.querySelector("#guest-tools");
const answerPanel = document.querySelector("#answer-panel");
const qrList = document.querySelector("#qr-list");
const guestAnswerQr = document.querySelector("#guest-answer-qr");
const scanAnswerButton = document.querySelector("#scan-answer");
const scanner = document.querySelector("#scanner");
const scannerVideo = document.querySelector("#scanner-video");
const scannerCanvas = document.querySelector("#scanner-canvas");
const stopScanButton = document.querySelector("#stop-scan");
const playerButtons = document.querySelector("#player-buttons");

const maxPlayers = 4;
const signalVersion = 1;
const peerConnections = new Map();
const channels = new Map();
const playerState = Array.from({ length: maxPlayers }, (_, index) => ({
  name: `Player ${index + 1}`,
  pressed: false,
  connected: index === 0,
}));

let localPlayerIndex = 0;
let isHost = false;
let scannerStream;
let scannerFrame;
let scanBusy = false;

const rtcConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function setStatus(message) {
  multiplayerStatus.textContent = message;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("The QR code contains invalid data.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodeSignal(payload) {
  const envelope = { v: signalVersion, ...payload };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  return bytesToBase64Url(await gzip(bytes));
}

async function decodeSignal(value, expectedType) {
  try {
    const bytes = await gunzip(base64UrlToBytes(value.trim()));
    const envelope = JSON.parse(new TextDecoder().decode(bytes));
    if (envelope.v !== signalVersion || envelope.type !== expectedType) {
      throw new Error("This is not the expected multiplayer QR code.");
    }
    if (!Number.isInteger(envelope.playerIndex) || envelope.playerIndex < 1 || envelope.playerIndex >= maxPlayers) {
      throw new Error("The QR code has an invalid player slot.");
    }
    return envelope;
  } catch (error) {
    if (error.message.includes("expected multiplayer") || error.message.includes("invalid player")) throw error;
    throw new Error("The QR code was incomplete or unreadable. Hold the phones steady and scan again.");
  }
}

function qrImage(data, label) {
  const image = document.createElement("img");
  image.alt = label;
  image.src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&ecc=M&margin=8&data=${encodeURIComponent(data)}`;
  return image;
}

function sendToChannel(channel, message) {
  if (channel?.readyState === "open") channel.send(JSON.stringify(message));
}

function broadcast(message, exceptPlayer) {
  channels.forEach((channel, playerIndex) => {
    if (playerIndex !== exceptPlayer) sendToChannel(channel, message);
  });
}

function renderPlayerButtons() {
  playerButtons.innerHTML = "";
  playerState.forEach((player, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `player-toggle${player.pressed ? " is-on" : ""}`;
    button.disabled = index !== localPlayerIndex || !player.connected;
    button.innerHTML = `<span>${player.name}</span><small>${player.connected ? "connected" : "waiting"} · ${player.pressed ? "on" : "off"}</small>`;
    button.addEventListener("click", () => {
      player.pressed = !player.pressed;
      renderPlayerButtons();
      broadcast({ type: "state", playerIndex: index, pressed: player.pressed });
    });
    playerButtons.append(button);
  });
}

function applyRemoteState(message, sourcePlayer) {
  if (message.type === "hello") {
    playerState[message.playerIndex].connected = true;
    sendToChannel(channels.get(message.playerIndex), { type: "snapshot", players: playerState });
    broadcast({ type: "connected", playerIndex: message.playerIndex }, message.playerIndex);
  } else if (message.type === "snapshot") {
    message.players.forEach((player, index) => Object.assign(playerState[index], player));
  } else if (message.type === "connected") {
    playerState[message.playerIndex].connected = true;
  } else if (message.type === "state") {
    playerState[message.playerIndex].pressed = Boolean(message.pressed);
    if (isHost) broadcast(message, sourcePlayer);
  }
  renderPlayerButtons();
}

function wireChannel(playerIndex, channel) {
  channels.set(playerIndex, channel);
  channel.addEventListener("open", () => {
    playerState[playerIndex].connected = true;
    if (isHost) {
      sendToChannel(channel, { type: "snapshot", players: playerState });
      broadcast({ type: "connected", playerIndex }, playerIndex);
    } else {
      sendToChannel(channel, { type: "hello", playerIndex: localPlayerIndex });
    }
    setStatus(`${playerState[playerIndex].name} connected.`);
    renderPlayerButtons();
  });
  channel.addEventListener("message", event => {
    try { applyRemoteState(JSON.parse(event.data), playerIndex); }
    catch { setStatus("Received an invalid multiplayer message."); }
  });
  channel.addEventListener("close", () => {
    playerState[playerIndex].connected = playerIndex === localPlayerIndex;
    renderPlayerButtons();
  });
}

function waitForIce(peerConnection, timeoutMs = 10000) {
  if (peerConnection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, timeoutMs);
    peerConnection.addEventListener("icegatheringstatechange", () => {
      if (peerConnection.iceGatheringState === "complete") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function makeOffer(playerIndex) {
  const peerConnection = new RTCPeerConnection(rtcConfiguration);
  const channel = peerConnection.createDataChannel("multiplayer-test");
  peerConnections.set(playerIndex, peerConnection);
  wireChannel(playerIndex, channel);
  await peerConnection.setLocalDescription(await peerConnection.createOffer());
  await waitForIce(peerConnection);
  return encodeSignal({ type: "offer", playerIndex, description: peerConnection.localDescription });
}

async function startHost() {
  isHost = true;
  localPlayerIndex = 0;
  hostRoomButton.disabled = true;
  hostTools.classList.remove("hidden");
  answerPanel.classList.remove("hidden");
  setStatus("Creating player QR codes...");
  qrList.innerHTML = "";

  for (let playerIndex = 1; playerIndex < maxPlayers; playerIndex += 1) {
    const signal = await makeOffer(playerIndex);
    const joinUrl = `${location.href.split("#")[0]}#join=${signal}`;
    const card = document.createElement("article");
    card.className = "qr-card";
    const title = document.createElement("strong");
    title.textContent = `Player ${playerIndex + 1}`;
    card.append(qrImage(joinUrl, `Join QR code for Player ${playerIndex + 1}`), title);
    qrList.append(card);
  }

  setStatus("Ready. Joining phones should scan one player QR code each.");
  renderPlayerButtons();
}

async function connectGuest(signal) {
  const { playerIndex, description } = await decodeSignal(signal, "offer");
  localPlayerIndex = playerIndex;
  playerState[playerIndex].connected = true;
  const peerConnection = new RTCPeerConnection(rtcConfiguration);
  peerConnections.set(0, peerConnection);
  peerConnection.addEventListener("datachannel", event => wireChannel(0, event.channel));
  await peerConnection.setRemoteDescription(description);
  await peerConnection.setLocalDescription(await peerConnection.createAnswer());
  await waitForIce(peerConnection);

  const answerSignal = await encodeSignal({
    type: "answer",
    playerIndex,
    description: peerConnection.localDescription,
  });
  guestAnswerQr.replaceChildren(qrImage(answerSignal, `Answer QR code for Player ${playerIndex + 1}`));
  guestTools.classList.remove("hidden");
  setStatus(`You are Player ${playerIndex + 1}. Show the QR below to the host.`);
  renderPlayerButtons();
}

async function applyGuestAnswer(signal) {
  const { playerIndex, description } = await decodeSignal(signal, "answer");
  const peerConnection = peerConnections.get(playerIndex);
  if (!peerConnection) throw new Error("That QR code does not match an open player slot.");
  if (peerConnection.currentRemoteDescription) throw new Error(`Player ${playerIndex + 1} is already connected.`);
  await peerConnection.setRemoteDescription(description);
  setStatus(`Player ${playerIndex + 1} answer accepted. Connecting...`);
}

async function stopScanner() {
  cancelAnimationFrame(scannerFrame);
  scannerFrame = undefined;
  scanBusy = false;
  scanner.classList.add("hidden");
  scannerStream?.getTracks().forEach(track => track.stop());
  scannerStream = undefined;
  scannerVideo.srcObject = null;
}

async function scanAnswerQr() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not available in this browser.");
  if (typeof jsQR !== "function") throw new Error("The QR scanner could not load. Check the internet connection and reload.");

  scannerStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  scannerVideo.srcObject = scannerStream;
  await scannerVideo.play();
  scanner.classList.remove("hidden");
  setStatus("Point the host camera at the joining player’s QR code.");

  const context = scannerCanvas.getContext("2d", { willReadFrequently: true });
  const scanFrame = async () => {
    if (!scannerStream) return;
    if (!scanBusy && scannerVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      scannerCanvas.width = scannerVideo.videoWidth;
      scannerCanvas.height = scannerVideo.videoHeight;
      context.drawImage(scannerVideo, 0, 0);
      const imageData = context.getImageData(0, 0, scannerCanvas.width, scannerCanvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        scanBusy = true;
        try {
          await applyGuestAnswer(code.data);
          await stopScanner();
          return;
        } catch (error) {
          setStatus(error.message);
          scanBusy = false;
        }
      }
    }
    scannerFrame = requestAnimationFrame(scanFrame);
  };
  scannerFrame = requestAnimationFrame(scanFrame);
}

hostRoomButton.addEventListener("click", () => startHost().catch(error => setStatus(error.message)));
scanAnswerButton.addEventListener("click", () => scanAnswerQr().catch(error => setStatus(error.message)));
stopScanButton.addEventListener("click", () => {
  stopScanner();
  setStatus("Camera closed.");
});

const joinSignal = new URLSearchParams(location.hash.slice(1)).get("join");
if (joinSignal) {
  hostRoomButton.classList.add("hidden");
  connectGuest(joinSignal).catch(error => setStatus(error.message));
}

renderPlayerButtons();
