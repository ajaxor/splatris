const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const scoreDisplay = document.querySelector("#score");
const livesDisplay = document.querySelector("#lives");
const startButton = document.querySelector("#start");
const statusDisplay = document.querySelector("#status");

const blobColors = ["#ff6b9a", "#ffd166", "#8cffd2", "#7fa7ff"];
let animationFrame;
let blobs = [];
let score = 0;
let lives = 3;
let running = false;
let lastSpawn = 0;
let lastTick = 0;

function resetGame() {
  blobs = [];
  score = 0;
  lives = 3;
  running = true;
  lastSpawn = 0;
  lastTick = performance.now();
  updateHud();
  statusDisplay.textContent = "Tap blobs before they splat!";
  startButton.textContent = "Restart game";
}

function updateHud() {
  scoreDisplay.textContent = score;
  livesDisplay.textContent = lives;
}

function spawnBlob(now) {
  if (now - lastSpawn < Math.max(450, 1100 - score * 12)) {
    return;
  }

  const radius = 18 + Math.random() * 16;
  blobs.push({
    x: radius + Math.random() * (canvas.width - radius * 2),
    y: -radius,
    radius,
    speed: 85 + Math.random() * 95 + score * 1.8,
    color: blobColors[Math.floor(Math.random() * blobColors.length)],
  });
  lastSpawn = now;
}

function drawBlob(blob) {
  context.beginPath();
  context.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
  context.fillStyle = blob.color;
  context.fill();
  context.beginPath();
  context.arc(blob.x - blob.radius * 0.28, blob.y - blob.radius * 0.25, blob.radius * 0.24, 0, Math.PI * 2);
  context.fillStyle = "rgb(255 255 255 / 55%)";
  context.fill();
}

function drawBackground() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#12162d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgb(255 255 255 / 8%)";
  for (let y = 52; y < canvas.height; y += 52) {
    context.fillRect(0, y, canvas.width, 1);
  }
}

function finishGame() {
  running = false;
  cancelAnimationFrame(animationFrame);
  statusDisplay.textContent = `Game over! Final score: ${score}.`;
}

function tick(now) {
  const elapsed = (now - lastTick) / 1000;
  lastTick = now;
  spawnBlob(now);
  drawBackground();

  blobs = blobs.filter((blob) => {
    blob.y += blob.speed * elapsed;
    drawBlob(blob);

    if (blob.y - blob.radius > canvas.height) {
      lives -= 1;
      updateHud();
      return false;
    }

    return true;
  });

  if (lives <= 0) {
    finishGame();
    return;
  }

  animationFrame = requestAnimationFrame(tick);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const pointer = event.touches?.[0] ?? event;
  return {
    x: ((pointer.clientX - rect.left) / rect.width) * canvas.width,
    y: ((pointer.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function popBlob(event) {
  if (!running) {
    return;
  }

  const point = canvasPoint(event);
  const hitIndex = blobs.findIndex((blob) => {
    const distance = Math.hypot(blob.x - point.x, blob.y - point.y);
    return distance <= blob.radius + 8;
  });

  if (hitIndex >= 0) {
    blobs.splice(hitIndex, 1);
    score += 1;
    updateHud();
    statusDisplay.textContent = score % 10 === 0 ? "Combo! Keep splatting." : "Nice splat!";
  }
}

startButton.addEventListener("click", () => {
  cancelAnimationFrame(animationFrame);
  resetGame();
  animationFrame = requestAnimationFrame(tick);
});

canvas.addEventListener("click", popBlob);
canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();
  popBlob(event);
}, { passive: false });

drawBackground();

const hostRoomButton = document.querySelector("#host-room");
const multiplayerStatus = document.querySelector("#multiplayer-status");
const hostTools = document.querySelector("#host-tools");
const guestTools = document.querySelector("#guest-tools");
const answerPanel = document.querySelector("#answer-panel");
const qrList = document.querySelector("#qr-list");
const roomUrl = document.querySelector("#room-url");
const guestAnswerQr = document.querySelector("#guest-answer-qr");
const guestAnswer = document.querySelector("#guest-answer");
const scanAnswerButton = document.querySelector("#scan-answer");
const scanner = document.querySelector("#scanner");
const scannerVideo = document.querySelector("#scanner-video");
const stopScanButton = document.querySelector("#stop-scan");
const copyAnswerButton = document.querySelector("#copy-answer");
const answerInput = document.querySelector("#answer-input");
const applyAnswerButton = document.querySelector("#apply-answer");
const playerButtons = document.querySelector("#player-buttons");

const maxPlayers = 4;
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

const rtcConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
};

function encodeSignal(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeSignal(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function setMultiplayerStatus(message) {
  multiplayerStatus.textContent = message;
}

function sendToChannel(channel, message) {
  if (channel.readyState === "open") {
    channel.send(JSON.stringify(message));
  }
}

function broadcast(message, exceptPlayer) {
  channels.forEach((channel, playerIndex) => {
    if (playerIndex !== exceptPlayer) {
      sendToChannel(channel, message);
    }
  });
}

function renderPlayerButtons() {
  playerButtons.innerHTML = "";
  playerState.forEach((player, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `player-toggle${player.pressed ? " is-on" : ""}`;
    button.disabled = index !== localPlayerIndex;
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
  }

  if (message.type === "snapshot") {
    message.players.forEach((player, index) => Object.assign(playerState[index], player));
  }

  if (message.type === "connected") {
    playerState[message.playerIndex].connected = true;
  }

  if (message.type === "state") {
    playerState[message.playerIndex].pressed = message.pressed;
    if (isHost) {
      broadcast(message, sourcePlayer);
    }
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
      sendToChannel(channel, { type: "hello", playerIndex });
    }
    setMultiplayerStatus(`${playerState[playerIndex].name} connected.`);
    renderPlayerButtons();
  });
  channel.addEventListener("message", (event) => applyRemoteState(JSON.parse(event.data), playerIndex));
  channel.addEventListener("close", () => {
    playerState[playerIndex].connected = playerIndex === localPlayerIndex;
    renderPlayerButtons();
  });
}

function waitForIce(peerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    peerConnection.addEventListener("icegatheringstatechange", () => {
      if (peerConnection.iceGatheringState === "complete") {
        resolve();
      }
    });
  });
}

async function makeOffer(playerIndex) {
  const peerConnection = new RTCPeerConnection(rtcConfiguration);
  const channel = peerConnection.createDataChannel("splatris-buttons");
  peerConnections.set(playerIndex, peerConnection);
  wireChannel(playerIndex, channel);
  await peerConnection.setLocalDescription(await peerConnection.createOffer());
  await waitForIce(peerConnection);
  return encodeSignal({ playerIndex, offer: peerConnection.localDescription });
}

async function startHost() {
  isHost = true;
  localPlayerIndex = 0;
  hostRoomButton.disabled = true;
  hostTools.classList.remove("hidden");
  answerPanel.classList.remove("hidden");
  roomUrl.textContent = location.href.split("#")[0];
  setMultiplayerStatus("Creating player QR codes...");
  qrList.innerHTML = "";

  for (let playerIndex = 1; playerIndex < maxPlayers; playerIndex += 1) {
    const signal = await makeOffer(playerIndex);
    const joinUrl = `${location.href.split("#")[0]}#join=${signal}`;
    const card = document.createElement("article");
    card.className = "qr-card";
    card.innerHTML = `<img alt="QR code for Player ${playerIndex + 1}" src="https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=${encodeURIComponent(joinUrl)}"><div><strong>Player ${playerIndex + 1}</strong><span>${joinUrl}</span></div>`;
    qrList.append(card);
  }

  setMultiplayerStatus("Ready. Have each phone scan a different player QR, then scan its answer QR below.");
  renderPlayerButtons();
}

async function connectGuest(signal) {
  const { playerIndex, offer } = decodeSignal(signal);
  localPlayerIndex = playerIndex;
  playerState[playerIndex].connected = true;
  const peerConnection = new RTCPeerConnection(rtcConfiguration);
  peerConnections.set(0, peerConnection);
  peerConnection.addEventListener("datachannel", (event) => wireChannel(0, event.channel));
  await peerConnection.setRemoteDescription(offer);
  await peerConnection.setLocalDescription(await peerConnection.createAnswer());
  await waitForIce(peerConnection);
  guestTools.classList.remove("hidden");
  guestAnswer.value = encodeSignal({ playerIndex, answer: peerConnection.localDescription });
  guestAnswerQr.innerHTML = `<img alt="Answer QR code for Player ${playerIndex + 1}" src="https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=${encodeURIComponent(guestAnswer.value)}">`;
  setMultiplayerStatus(`You are Player ${playerIndex + 1}. Show this answer QR to the host.`);
  renderPlayerButtons();
}

async function applyGuestAnswer(signal = answerInput.value.trim()) {
  const { playerIndex, answer } = decodeSignal(signal);
  const peerConnection = peerConnections.get(playerIndex);
  if (!peerConnection) {
    setMultiplayerStatus("That answer does not match an open player slot.");
    return;
  }
  await peerConnection.setRemoteDescription(answer);
  answerInput.value = "";
  setMultiplayerStatus(`Applied Player ${playerIndex + 1}'s answer. Waiting for the data channel to open...`);
}

async function stopAnswerScanner() {
  cancelAnimationFrame(scannerFrame);
  scannerFrame = undefined;
  scanner?.classList.add("hidden");
  scannerStream?.getTracks().forEach((track) => track.stop());
  scannerStream = undefined;
}

async function scanAnswerQr() {
  if (!("BarcodeDetector" in window)) {
    setMultiplayerStatus("QR scanning is not supported in this browser. Paste the answer text instead.");
    return;
  }

  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  scannerVideo.srcObject = scannerStream;
  await scannerVideo.play();
  scanner.classList.remove("hidden");
  setMultiplayerStatus("Point the host camera at the guest answer QR.");

  const scanFrame = async () => {
    let codes = [];
    try {
      codes = await detector.detect(scannerVideo);
    } catch {
      // The video may not have a decodable frame yet. Try again on the next animation frame.
    }
    if (codes.length > 0) {
      answerInput.value = codes[0].rawValue;
      await stopAnswerScanner();
      await applyGuestAnswer(codes[0].rawValue);
      return;
    }
    scannerFrame = requestAnimationFrame(scanFrame);
  };

  scannerFrame = requestAnimationFrame(scanFrame);
}

hostRoomButton.addEventListener("click", () => {
  startHost().catch((error) => setMultiplayerStatus(error.message));
});

applyAnswerButton.addEventListener("click", () => {
  applyGuestAnswer().catch((error) => setMultiplayerStatus(error.message));
});

scanAnswerButton.addEventListener("click", () => {
  scanAnswerQr().catch((error) => setMultiplayerStatus(error.message));
});

stopScanButton.addEventListener("click", () => {
  stopAnswerScanner();
  setMultiplayerStatus("Answer QR scanning stopped.");
});

copyAnswerButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(guestAnswer.value);
  setMultiplayerStatus("Answer copied. Paste it into the host phone if QR scanning is unavailable.");
});

const joinSignal = new URLSearchParams(location.hash.slice(1)).get("join");
if (joinSignal) {
  hostRoomButton.classList.add("hidden");
  connectGuest(joinSignal).catch((error) => setMultiplayerStatus(error.message));
}

renderPlayerButtons();
