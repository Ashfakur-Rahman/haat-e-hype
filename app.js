
import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const video = document.getElementById("camera");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

const drawingCanvas = document.getElementById("drawingCanvas");
const drawingCtx = drawingCanvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");
const trackingStatus = document.getElementById("trackingStatus");

let handLandmarker;
let running = false;
let isDrawing = false;
let lastPoint = null;
let previousPoint = null;
let smoothedPoint = null;

// Separate pinch thresholds prevent rapid start/stop flickering.
const PINCH_START = 0.045;
const PINCH_END = 0.070;

// Lower values smooth more, but may add some lag.
const SMOOTHING = 0.35;

startBtn.addEventListener("click", startExperience);

let clearBtn = document.getElementById("clearBtn");

if (!clearBtn) {
  clearBtn = document.createElement("button");
  clearBtn.id = "clearBtn";
  clearBtn.textContent = "Clear Canvas";
  drawingCanvas.parentElement.insertAdjacentElement("afterend", clearBtn);
}

clearBtn.addEventListener("click", () => {
  drawingCtx.clearRect(
    0, 0, drawingCanvas.width, drawingCanvas.height
  );
  resetStroke();
});

function resetStroke() {
  isDrawing = false;
  lastPoint = null;
  previousPoint = null;
}

function smoothPoint(point) {
  if (!smoothedPoint) {
    smoothedPoint = { ...point };
    return smoothedPoint;
  }

  smoothedPoint.x +=
    (point.x - smoothedPoint.x) * SMOOTHING;

  smoothedPoint.y +=
    (point.y - smoothedPoint.y) * SMOOTHING;

  return { ...smoothedPoint };
}

function drawSmoothLine(point) {
  if (!lastPoint) {
    lastPoint = point;
    previousPoint = point;

    drawingCtx.beginPath();
    drawingCtx.moveTo(point.x, point.y);
    drawingCtx.lineTo(point.x + 0.1, point.y + 0.1);
    drawingCtx.stroke();
    return;
  }

  // Quadratic curves create smoother joins between hand positions.
  const midX = (lastPoint.x + point.x) / 2;
  const midY = (lastPoint.y + point.y) / 2;

  drawingCtx.beginPath();
  drawingCtx.moveTo(lastPoint.x, lastPoint.y);
  drawingCtx.quadraticCurveTo(
    lastPoint.x,
    lastPoint.y,
    midX,
    midY
  );
  drawingCtx.stroke();

  previousPoint = lastPoint;
  lastPoint = point;
}

async function startExperience() {
  startBtn.disabled = true;
  status.textContent = "Loading AI model...";
  trackingStatus.textContent = "Initializing computer vision";

  let stream;

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(
      vision,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      }
    );

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    drawingCanvas.width = video.videoWidth;
    drawingCanvas.height = video.videoHeight;

    drawingCtx.lineWidth = 5;
    drawingCtx.strokeStyle = "#65f2d0";
    drawingCtx.lineCap = "round";
    drawingCtx.lineJoin = "round";

    running = true;
    startBtn.textContent = "AI Tracking Active";
    status.textContent = "AI READY · SHOW YOUR HAND";
    renderFrame();

  } catch (error) {
    console.error(error);

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    video.srcObject = null;
    status.textContent =
      "Could not start. Check camera permission and internet.";
    trackingStatus.textContent = "Setup needs attention";
    startBtn.textContent = "Try Again";
    startBtn.disabled = false;
  }
}

function renderFrame() {
  if (!running) return;

  if (video.readyState >= 2 && handLandmarker) {
    const result = handLandmarker.detectForVideo(
      video,
      performance.now()
    );

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];

      // Hand skeleton overlay.
      ctx.strokeStyle = "#65f2d0";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";

      for (const connection of HandLandmarker.HAND_CONNECTIONS) {
        const a = landmarks[connection.start];
        const b = landmarks[connection.end];

        ctx.beginPath();
        ctx.moveTo(a.x * overlay.width, a.y * overlay.height);
        ctx.lineTo(b.x * overlay.width, b.y * overlay.height);
        ctx.stroke();
      }

      for (const point of landmarks) {
        ctx.beginPath();
        ctx.arc(
          point.x * overlay.width,
          point.y * overlay.height,
          4, 0, Math.PI * 2
        );
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      const distance = Math.hypot(
        indexTip.x - thumbTip.x,
        indexTip.y - thumbTip.y
      );

      // Hysteresis: a slightly larger distance is needed to stop.
      if (!isDrawing && distance < PINCH_START) {
        isDrawing = true;
        lastPoint = null;
        previousPoint = null;
        smoothedPoint = null;
      } else if (isDrawing && distance > PINCH_END) {
        resetStroke();
        smoothedPoint = null;
      }

      if (isDrawing) {
        const point = smoothPoint({
          x: indexTip.x * drawingCanvas.width,
          y: indexTip.y * drawingCanvas.height
        });

        drawSmoothLine(point);
        trackingStatus.textContent = "Drawing ✦ Keep pinching";
      } else {
        trackingStatus.textContent = "Hand detected ✓ · Pinch to draw";
      }

      status.textContent =
        `INDEX TIP · X: ${indexTip.x.toFixed(3)} · Y: ${indexTip.y.toFixed(3)}`;

    } else {
      resetStroke();
      smoothedPoint = null;
      trackingStatus.textContent = "Show your hand to the camera";
      status.textContent = "SEARCHING FOR HAND...";
    }
  }

  requestAnimationFrame(renderFrame);
}
