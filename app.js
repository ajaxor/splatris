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
