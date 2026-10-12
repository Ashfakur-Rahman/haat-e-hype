
import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const drawingCanvas = document.getElementById("drawingCanvas");
const drawingCtx = drawingCanvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");
const trackingStatus = document.getElementById("trackingStatus");

let handLandmarker;
let running = false;
let isDrawing = false;
let lastPoint = null;

const PINCH_THRESHOLD = 0.055;

startBtn.addEventListener("click", startExperience);

// Add a clear button if one is not already present.
let clearBtn = document.getElementById("clearBtn");

if (!clearBtn) {
  clearBtn = document.createElement("button");
  clearBtn.id = "clearBtn";
  clearBtn.textContent = "Clear Canvas";
  startBtn.insertAdjacentElement("afterend", clearBtn);
}

clearBtn.addEventListener("click", clearDrawing);

function clearDrawing() {
  drawingCtx.clearRect(
    0, 0, drawingCanvas.width, drawingCanvas.height
  );
  lastPoint = null;
  isDrawing = false;
}

async function startExperience() {
  startBtn.disabled = true;
  status.textContent = "Loading AI model...";
  trackingStatus.textContent = "Initializing computer vision";

  let stream;

  try {
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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    drawingCanvas.width = video.videoWidth;
    drawingCanvas.height = video.videoHeight;

    drawingCtx.lineWidth = 5;
    drawingCtx.lineCap = "round";
    drawingCtx.lineJoin = "round";
    drawingCtx.strokeStyle = "#65f2d0";

    running = true;
    startBtn.textContent = "AI Tracking Active";
    status.textContent = "PINCH THUMB + INDEX TO DRAW";
    renderFrame();

  } catch (error) {
    console.error("HAAT-E-HYPE ERROR:", error);

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    video.srcObject = null;
    status.textContent = `${error.name || "Error"}: ${error.message || error}`;
    trackingStatus.textContent = "Setup needs attention";
    startBtn.textContent = "Try Again";
    startBtn.disabled = false;
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function renderFrame() {
  if (!running) return;

  if (video.readyState >= 2 && handLandmarker) {
    const result = handLandmarker.detectForVideo(
      video,
      performance.now()
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];

      // Draw hand connections.
      ctx.strokeStyle = "#65f2d0";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";

      for (const connection of HandLandmarker.HAND_CONNECTIONS) {
        const a = landmarks[connection.start];
        const b = landmarks[connection.end];

        ctx.beginPath();
        ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
        ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
        ctx.stroke();
      }

      // Draw hand landmarks.
      for (const point of landmarks) {
        ctx.beginPath();
        ctx.arc(
          point.x * canvas.width,
          point.y * canvas.height,
          4,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];

      const pinching = distance(thumbTip, indexTip) < PINCH_THRESHOLD;

      // Index fingertip position in canvas pixels.
      const x = indexTip.x * drawingCanvas.width;
      const y = indexTip.y * drawingCanvas.height;

      if (pinching) {
        if (!isDrawing) {
          lastPoint = { x, y };
          isDrawing = true;
        } else if (lastPoint) {
          drawingCtx.beginPath();
          drawingCtx.moveTo(lastPoint.x, lastPoint.y);
          drawingCtx.lineTo(x, y);
          drawingCtx.stroke();
          lastPoint = { x, y };
        }

        trackingStatus.textContent = "Drawing ✍️";
        status.textContent = "PINCH DETECTED · DRAWING";
      } else {
        isDrawing = false;
        lastPoint = null;
        trackingStatus.textContent = "Hand detected ✓";
        status.textContent = "PINCH THUMB + INDEX TO DRAW";
      }
    } else {
      isDrawing = false;
      lastPoint = null;
      trackingStatus.textContent = "Show your hand to the camera";
      status.textContent = "SEARCHING FOR HAND...";
    }
  }

  requestAnimationFrame(renderFrame);
}
