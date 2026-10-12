
import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");
const trackingStatus = document.getElementById("trackingStatus");

let handLandmarker;
let running = false;

startBtn.addEventListener("click", startExperience);

async function startExperience() {
  startBtn.disabled = true;
  status.textContent = "Loading AI model...";
  trackingStatus.textContent = "Initializing computer vision";

  let stream;

  try {
    // Request camera permission.
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

    // Load MediaPipe vision runtime.
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    // Initialize the pretrained hand landmark model.
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

  if (video.readyState >= 2) {
    const result = handLandmarker.detectForVideo(
      video,
      performance.now()
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];

      // Draw connections between the 21 hand landmarks.
      ctx.strokeStyle = "#65f2d0";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";

      for (const connection of HandLandmarker.HAND_CONNECTIONS) {
        const a = landmarks[connection.start];
        const b = landmarks[connection.end];

        ctx.beginPath();
        ctx.moveTo(
          a.x * canvas.width,
          a.y * canvas.height
        );
        ctx.lineTo(
          b.x * canvas.width,
          b.y * canvas.height
        );
        ctx.stroke();
      }

      // Draw each detected landmark.
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

      const fingertip = landmarks[8];

      trackingStatus.textContent = "Hand detected ✓";
      status.textContent =
        `INDEX TIP · X: ${fingertip.x.toFixed(3)} · Y: ${fingertip.y.toFixed(3)}`;
    } else {
      trackingStatus.textContent = "Show your hand to the camera";
      status.textContent = "SEARCHING FOR HAND...";
    }
  }

  requestAnimationFrame(renderFrame);
}
