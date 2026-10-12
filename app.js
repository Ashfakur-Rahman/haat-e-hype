import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

/* =========================================
   HAAT-E-HYPE — CREATIVE ENGINE
   Air Drawing + Selfie-to-Sketch
   ========================================= */

const $ = (id) => document.getElementById(id);

const video = $("camera");
const overlay = $("overlay");
const drawingCanvas = $("drawingCanvas");

const ctx = overlay.getContext("2d");
const drawingCtx = drawingCanvas.getContext("2d");

const startBtn = $("startBtn");
const status = $("status");
const trackingStatus = $("trackingStatus");

const selfieInput = $("selfieInput");
const originalImage = $("originalImage");
const sketchCanvas = $("sketchCanvas");
const sketchCtx = sketchCanvas.getContext("2d");

const sketchStatus = $("sketchStatus");
const generateSketchBtn = $("generateSketch");
const downloadSketchBtn = $("downloadSketch");
const resetSketchBtn = $("resetSketch");

const originalPlaceholder = $("originalPlaceholder");
const sketchPlaceholder = $("sketchPlaceholder");

if (
  !video ||
  !overlay ||
  !drawingCanvas ||
  !ctx ||
  !drawingCtx ||
  !startBtn
) {
  throw new Error("Haat-e-Hype: required drawing elements are missing.");
}

/* =========================================
   AIR DRAWING SETTINGS
   ========================================= */

let handLandmarker = null;
let running = false;
let starting = false;
let cameraStream = null;
let animationFrameId = null;

let isDrawing = false;
let lastPoint = null;
let smoothedPoint = null;

const PINCH_START = 0.045;
const PINCH_END = 0.070;
const SMOOTHING = 0.42;

const BRUSH_COLOR = "#65f2d0";
const BRUSH_WIDTH = 5;

let lastVideoTime = -1;
let lastDetectionTime = 0;

// Process hand tracking at a practical rate on mobile.
const TARGET_FRAME_INTERVAL = 1000 / 30;

/* =========================================
   CLEAR CANVAS CONTROL
   ========================================= */

let clearBtn = $("clearBtn");

if (!clearBtn) {
  clearBtn = document.createElement("button");
  clearBtn.id = "clearBtn";
  clearBtn.type = "button";
  clearBtn.textContent = "Clear Canvas";
  clearBtn.className = "secondary-action";

  const studioActions = document.querySelector(".studio-actions");

  if (studioActions) {
    studioActions.appendChild(clearBtn);
  } else {
    drawingCanvas.parentElement.insertAdjacentElement(
      "afterend",
      clearBtn
    );
  }
}

clearBtn.addEventListener("click", () => {
  drawingCtx.clearRect(
    0,
    0,
    drawingCanvas.width,
    drawingCanvas.height
  );

  resetStroke();
  smoothedPoint = null;

  if (trackingStatus) {
    trackingStatus.textContent = "Canvas cleared. Ready to create.";
  }
});

function resetStroke() {
  isDrawing = false;
  lastPoint = null;
}

/* =========================================
   SMOOTH DRAWING
   ========================================= */

function smoothPoint(point) {
  if (!smoothedPoint) {
    smoothedPoint = { ...point };
    return { ...smoothedPoint };
  }

  smoothedPoint.x +=
    (point.x - smoothedPoint.x) * SMOOTHING;

  smoothedPoint.y +=
    (point.y - smoothedPoint.y) * SMOOTHING;

  return { ...smoothedPoint };
}

function drawSmoothLine(point) {
  drawingCtx.strokeStyle = BRUSH_COLOR;
  drawingCtx.lineWidth = BRUSH_WIDTH;
  drawingCtx.lineCap = "round";
  drawingCtx.lineJoin = "round";

  if (!lastPoint) {
    lastPoint = point;

    drawingCtx.beginPath();
    drawingCtx.arc(
      point.x,
      point.y,
      BRUSH_WIDTH / 2,
      0,
      Math.PI * 2
    );
    drawingCtx.fillStyle = BRUSH_COLOR;
    drawingCtx.fill();

    return;
  }

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

  lastPoint = point;
}

/* =========================================
   START CAMERA AND HAND TRACKING
   ========================================= */

startBtn.addEventListener("click", startExperience);

async function startExperience() {
  if (starting || running) return;

  starting = true;
  startBtn.disabled = true;

  status.textContent = "LOADING COMPUTER VISION...";
  trackingStatus.textContent = "Preparing your creative studio";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is not supported in this browser.");
    }

    if (!handLandmarker) {
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
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });

    video.srcObject = cameraStream;
    await video.play();

    if (!video.videoWidth || !video.videoHeight) {
      await new Promise((resolve, reject) => {
        video.addEventListener("loadedmetadata", resolve, { once: true });
        video.addEventListener(
          "error",
          () => reject(new Error("Could not load camera video.")),
          { once: true }
        );
      });
    }

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    drawingCanvas.width = video.videoWidth;
    drawingCanvas.height = video.videoHeight;

    drawingCtx.lineWidth = BRUSH_WIDTH;
    drawingCtx.strokeStyle = BRUSH_COLOR;
    drawingCtx.lineCap = "round";
    drawingCtx.lineJoin = "round";

    lastVideoTime = -1;
    lastDetectionTime = 0;
    resetStroke();
    smoothedPoint = null;

    running = true;

    startBtn.textContent = "AI Tracking Active";
    status.textContent = "AI READY · SHOW YOUR HAND";
    trackingStatus.textContent = "Your canvas awaits.";

    animationFrameId = requestAnimationFrame(renderFrame);
  } catch (error) {
    console.error("Haat-e-Hype camera error:", error);

    running = false;

    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }

    video.srcObject = null;

    status.textContent =
      "CAMERA SETUP FAILED · CHECK PERMISSION AND INTERNET";

    trackingStatus.textContent =
      "Allow camera access, then try again.";

    startBtn.textContent = "Try Again";
    startBtn.disabled = false;
  } finally {
    starting = false;
  }
}

/* =========================================
   HAND TRACKING RENDER LOOP
   ========================================= */

function renderFrame(now) {
  if (!running || !handLandmarker) return;

  animationFrameId = requestAnimationFrame(renderFrame);

  if (video.readyState < 2) return;
  if (now - lastDetectionTime < TARGET_FRAME_INTERVAL) return;

  lastDetectionTime = now;

  // Avoid processing the same video frame repeatedly.
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  try {
    const result = handLandmarker.detectForVideo(
      video,
      performance.now()
    );

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];

      drawHandOverlay(landmarks);

      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      const distance = Math.hypot(
        indexTip.x - thumbTip.x,
        indexTip.y - thumbTip.y
      );

      if (!isDrawing && distance < PINCH_START) {
        isDrawing = true;
        lastPoint = null;
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
        trackingStatus.textContent =
          "Hand detected ✓ · Pinch to draw";
      }

      status.textContent =
        `INDEX TIP · X: ${indexTip.x.toFixed(3)} · Y: ${indexTip.y.toFixed(3)}`;
    } else {
      resetStroke();
      smoothedPoint = null;

      trackingStatus.textContent = "Show your hand to the camera";
      status.textContent = "SEARCHING FOR HAND...";
    }
  } catch (error) {
    console.error("Hand tracking error:", error);

    status.textContent = "TRACKING INTERRUPTED · TRY RESTARTING";
    trackingStatus.textContent = "Hand tracking needs attention";
  }
}

function drawHandOverlay(landmarks) {
  ctx.strokeStyle = BRUSH_COLOR;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const connection of HandLandmarker.HAND_CONNECTIONS) {
    const a = landmarks[connection.start];
    const b = landmarks[connection.end];

    if (!a || !b) continue;

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
      3,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
}

/* =========================================
   SELFIE-TO-SKETCH
   Browser-only pencil image processing
   ========================================= */

let currentImageURL = null;
let imageReady = false;
let sketchReady = false;
let processingSketch = false;

const MAX_IMAGE_DIMENSION = 1000;

function setSketchStatus(message, state = "") {
  if (!sketchStatus) return;

  sketchStatus.textContent = message;

  if (state) {
    sketchStatus.dataset.state = state;
  } else {
    delete sketchStatus.dataset.state;
  }
}

function showOriginalPlaceholder(show) {
  if (originalPlaceholder) {
    originalPlaceholder.hidden = !show;
  }
}

function showSketchPlaceholder(show) {
  if (sketchPlaceholder) {
    sketchPlaceholder.hidden = !show;
  }
}

function setSketchButtons() {
  if (generateSketchBtn) {
    generateSketchBtn.disabled =
      !imageReady || processingSketch;
  }

  if (downloadSketchBtn) {
    downloadSketchBtn.disabled =
      !sketchReady || processingSketch;
  }
}

function clearSketchOutput() {
  if (sketchCtx) {
    sketchCtx.clearRect(
      0,
      0,
      sketchCanvas.width,
      sketchCanvas.height
    );
  }

  sketchCanvas.hidden = true;
  showSketchPlaceholder(true);

  sketchReady = false;
  setSketchButtons();
}

/* Load a selected photo */

if (
  selfieInput &&
  originalImage &&
  sketchCanvas &&
  sketchCtx
) {
  selfieInput.addEventListener("change", () => {
    const file = selfieInput.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setSketchStatus("Please select a valid image file.", "error");
      selfieInput.value = "";
      return;
    }

    // Avoid excessively large files on mobile.
    if (file.size > 15 * 1024 * 1024) {
      setSketchStatus(
        "This photo is over 15 MB. Please choose a smaller image.",
        "error"
      );
      selfieInput.value = "";
      return;
    }

    if (currentImageURL) {
      URL.revokeObjectURL(currentImageURL);
      currentImageURL = null;
    }

    imageReady = false;
    processingSketch = false;
    sketchReady = false;

    clearSketchOutput();

    setSketchStatus("Loading your photo...");
    setSketchButtons();

    currentImageURL = URL.createObjectURL(file);

    originalImage.onload = () => {
      imageReady = true;

      originalImage.hidden = false;
      showOriginalPlaceholder(false);

      sketchCanvas.hidden = true;
      showSketchPlaceholder(true);

      if (resetSketchBtn) {
        resetSketchBtn.hidden = false;
      }

      setSketchStatus(
        "Photo ready. Create your pencil sketch.",
        "success"
      );

      setSketchButtons();
    };

    originalImage.onerror = () => {
      imageReady = false;

      originalImage.hidden = true;
      showOriginalPlaceholder(true);

      setSketchStatus(
        "Could not open this photo. Try another image.",
        "error"
      );

      setSketchButtons();
    };

    originalImage.src = currentImageURL;
  });
}

/* Generate the pencil effect */

if (generateSketchBtn) {
  generateSketchBtn.addEventListener("click", async () => {
    if (!imageReady || processingSketch) return;

    processingSketch = true;
    sketchReady = false;

    setSketchButtons();
    setSketchStatus("Creating your pencil sketch...", "loading");

    if (resetSketchBtn) {
      resetSketchBtn.disabled = true;
    }

    // Let the browser paint the loading message before processing.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const width = originalImage.naturalWidth;
      const height = originalImage.naturalHeight;

      if (!width || !height) {
        throw new Error("The selected photo has no usable dimensions.");
      }

      const scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / Math.max(width, height)
      );

      const outputWidth = Math.max(1, Math.round(width * scale));
      const outputHeight = Math.max(1, Math.round(height * scale));

      const sourceCanvas = document.createElement("canvas");
      const sourceCtx = sourceCanvas.getContext("2d", {
        willReadFrequently: true
      });

      const blurCanvas = document.createElement("canvas");
      const blurCtx = blurCanvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!sourceCtx || !blurCtx) {
        throw new Error("Canvas processing is not supported.");
      }

      sourceCanvas.width = outputWidth;
      sourceCanvas.height = outputHeight;

      blurCanvas.width = outputWidth;
      blurCanvas.height = outputHeight;

      // Draw the photo at a phone-friendly working resolution.
      sourceCtx.drawImage(
        originalImage,
        0,
        0,
        outputWidth,
        outputHeight
      );

      const sourceImage = sourceCtx.getImageData(
        0,
        0,
        outputWidth,
        outputHeight
      );

      const pixels = sourceImage.data;

      // Convert to grayscale and invert luminance.
      const inverted = sourceCtx.createImageData(
        outputWidth,
        outputHeight
      );

      for (let i = 0; i < pixels.length; i += 4) {
        const gray =
          0.299 * pixels[i] +
          0.587 * pixels[i + 1] +
          0.114 * pixels[i + 2];

        inverted.data[i] = 255 - gray;
        inverted.data[i + 1] = 255 - gray;
        inverted.data[i + 2] = 255 - gray;
        inverted.data[i + 3] = 255;
      }

      blurCtx.putImageData(inverted, 0, 0);

      // A blurred inverted image produces the pencil shading.
      const dodgeCanvas = document.createElement("canvas");
      dodgeCanvas.width = outputWidth;
      dodgeCanvas.height = outputHeight;

      const dodgeCtx = dodgeCanvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!dodgeCtx) {
        throw new Error("Could not create the sketch canvas.");
      }

      dodgeCtx.filter = "blur(12px)";
      dodgeCtx.drawImage(blurCanvas, 0, 0);
      dodgeCtx.filter = "none";

      const blurred = dodgeCtx.getImageData(
        0,
        0,
        outputWidth,
        outputHeight
      ).data;

      const output = sourceCtx.createImageData(
        outputWidth,
        outputHeight
      );

      // Color-dodge blending: original gray over blurred inverse.
      for (let i = 0; i < pixels.length; i += 4) {
        const gray =
          0.299 * pixels[i] +
          0.587 * pixels[i + 1] +
          0.114 * pixels[i + 2];

        const invertedGray = blurred[i];
        const denominator = 255 - invertedGray;

        let value;

        if (denominator <= 1) {
          value = 255;
        } else {
          value = Math.min(
            255,
            (gray * 255) / denominator
          );
        }

        // Slightly strengthen graphite contrast.
        value = Math.max(
          0,
          Math.min(255, (value - 128) * 1.12 + 128)
        );

        output.data[i] = value;
        output.data[i + 1] = value;
        output.data[i + 2] = value;
        output.data[i + 3] = 255;
      }

      sketchCanvas.width = outputWidth;
      sketchCanvas.height = outputHeight;

      // Subtle warm paper background.
      sketchCtx.fillStyle = "#f7f5ef";
      sketchCtx.fillRect(0, 0, outputWidth, outputHeight);

      sketchCtx.putImageData(output, 0, 0);

      // Light paper texture for a more natural presentation.
      sketchCtx.save();
      sketchCtx.globalAlpha = 0.035;
      sketchCtx.fillStyle = "#7e786d";

      for (
        let y = 2;
        y < outputHeight;
        y += 7
      ) {
        for (
          let x = (y % 2) + 2;
          x < outputWidth;
          x += 7
        ) {
          sketchCtx.fillRect(x, y, 1, 1);
        }
      }

      sketchCtx.restore();

      sketchCanvas.hidden = false;
      showSketchPlaceholder(false);

      sketchReady = true;

      setSketchStatus(
        "Your pencil sketch is ready.",
        "success"
      );
    } catch (error) {
      console.error("Sketch generation error:", error);

      clearSketchOutput();

      setSketchStatus(
        "Could not create the sketch. Try a different photo.",
        "error"
      );
    } finally {
      processingSketch = false;

      if (resetSketchBtn) {
        resetSketchBtn.disabled = false;
      }

      setSketchButtons();
    }
  });
}

/* Download the generated sketch */

if (downloadSketchBtn) {
  downloadSketchBtn.addEventListener("click", () => {
    if (!sketchReady || processingSketch) return;

    try {
      sketchCanvas.toBlob((blob) => {
        if (!blob) {
          setSketchStatus(
            "Could not export the image. Please try again.",
            "error"
          );
          return;
        }

        const downloadURL = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadURL;
        link.download = "haat-e-hype-pencil-sketch.png";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(downloadURL), 1000);

        setSketchStatus(
          "Sketch downloaded successfully.",
          "success"
        );
      }, "image/png");
    } catch (error) {
      console.error("Sketch download error:", error);

      setSketchStatus(
        "Download failed. Please try again.",
        "error"
      );
    }
  });
}

/* Reset and choose another photo */

if (resetSketchBtn) {
  resetSketchBtn.addEventListener("click", () => {
    selfieInput.value = "";

    if (currentImageURL) {
      URL.revokeObjectURL(currentImageURL);
      currentImageURL = null;
    }

    originalImage.removeAttribute("src");
    originalImage.hidden = true;

    imageReady = false;
    sketchReady = false;
    processingSketch = false;

    showOriginalPlaceholder(true);
    clearSketchOutput();

    resetSketchBtn.hidden = true;

    setSketchStatus("Choose a photo to begin.");
    setSketchButtons();
  });
}

/* Release temporary image memory when leaving the page */

window.addEventListener("pagehide", () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }

  if (currentImageURL) {
    URL.revokeObjectURL(currentImageURL);
  }

  if (handLandmarker) {
    handLandmarker.close();
    handLandmarker = null;
  }
});
