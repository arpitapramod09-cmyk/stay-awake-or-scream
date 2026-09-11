/* ==========================================================
   Eye Closure "Beep" Detector
   - Uses MediaPipe FaceMesh (runs fully in the browser, no
     images/video ever leave your machine)
   - Computes Eye Aspect Ratio (EAR) to decide open vs closed
   - If eyes stay closed for CLOSE_DURATION_MS, it plays one
     long synthesized beep — the ONLY sound this app makes
   ========================================================== */

// ---- Tunable settings ----
const EAR_THRESHOLD = 0.21;      // lower = eye counts as "closed". Tune if it misfires.
const CLOSE_DURATION_MS = 30000; // 30 seconds
const BEEP_FREQUENCY = 880;      // pitch of the long alarm beep, in Hz
const BEEP_DURATION_S = 1.5;     // how long the long alarm beep lasts, in seconds

// A "blink" is a closed→open transition that happens quickly.
// Anything shorter than BLINK_MIN_MS is treated as sensor noise and ignored.
// Anything longer than BLINK_MAX_MS is a deliberate eye-close, not a blink.
const BLINK_MIN_MS = 40;
const BLINK_MAX_MS = 400;
const BLINK_BEEP_FREQUENCY = 1400; // higher pitch so it's clearly different from the alarm
const BLINK_BEEP_DURATION_S = 0.12;

// 6-point landmark indices for each eye (MediaPipe FaceMesh, 468-point model)
// Order matters: [corner1, top1, top2, corner2, bottom2, bottom1]
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

// ---- DOM references ----
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const canvasCtx = overlay.getContext('2d');
const startBtn = document.getElementById('startBtn');
const camStateEl = document.getElementById('camState');
const eyeStateEl = document.getElementById('eyeState');
const timerValEl = document.getElementById('timerVal');
const earValEl = document.getElementById('earVal');
const barEl = document.getElementById('bar');
const flashEl = document.getElementById('flash');
const blinkCountEl = document.getElementById('blinkCount');

// ---- State ----
let faceMesh = null;
let camera = null;
let closedSince = null;
let hasScreamed = false;
let audioCtx = null;
let blinkCount = 0;

// ---- Wire up button ----
startBtn.addEventListener('click', startApp);

async function startApp() {
  if (typeof FaceMesh === 'undefined' || typeof Camera === 'undefined') {
    camStateEl.textContent = 'library failed to load';
    camStateEl.className = 'value bad';
    alert('The face-tracking library did not load from the CDN.\nCheck your internet connection and refresh the page.');
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';
  camStateEl.textContent = 'requesting permission…';
  camStateEl.className = 'value pending';

  try {
    faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    camera = new Camera(video, {
      onFrame: async () => {
        if (video.videoWidth > 0 && overlay.width !== video.videoWidth) {
          overlay.width = video.videoWidth;
          overlay.height = video.videoHeight;
        }
        await faceMesh.send({ image: video });
      },
      width: 640,
      height: 480
    });

    await camera.start();

    startBtn.textContent = 'Camera Running';
  } catch (err) {
    console.error(err);
    camStateEl.textContent = 'camera error';
    camStateEl.className = 'value bad';
    startBtn.disabled = false;
    startBtn.textContent = 'Retry';
    alert(
      'Could not access the camera.\n\n' +
      'Common fixes:\n' +
      '1) Click "Allow" when the browser asks for camera permission.\n' +
      '2) Open this page through Live Server (http://127.0.0.1:...) ' +
      'instead of double-clicking the HTML file.\n' +
      '3) Make sure no other app is using the webcam.\n\n' +
      'Error details: ' + err.message
    );
  }
}

// ---- Per-frame results from FaceMesh ----
function onResults(results) {
  if (overlay.width === 0 || overlay.height === 0) return;
  canvasCtx.clearRect(0, 0, overlay.width, overlay.height);

  const faces = results.multiFaceLandmarks;
  if (faces && faces.length > 0) {
    const landmarks = faces[0];

    const leftEAR = calcEAR(landmarks, LEFT_EYE, overlay.width, overlay.height);
    const rightEAR = calcEAR(landmarks, RIGHT_EYE, overlay.width, overlay.height);
    const avgEAR = (leftEAR + rightEAR) / 2;

    drawEyeDots(landmarks, LEFT_EYE.concat(RIGHT_EYE));

    earValEl.textContent = avgEAR.toFixed(3);
    camStateEl.textContent = 'live';
    camStateEl.className = 'value good';

    updateEyeLogic(avgEAR);
  } else {
    eyeStateEl.textContent = 'no face detected';
    eyeStateEl.className = 'value pending';
    earValEl.textContent = '—';
    resetTimer();
  }
}

// Eye Aspect Ratio: (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
function calcEAR(landmarks, idx, w, h) {
  const p = idx.map((i) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h }));
  const vert1 = dist(p[1], p[5]);
  const vert2 = dist(p[2], p[4]);
  const horiz = dist(p[0], p[3]);
  return (vert1 + vert2) / (2 * horiz);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawEyeDots(landmarks, idxList) {
  canvasCtx.fillStyle = '#35d07f';
  idxList.forEach((i) => {
    const x = landmarks[i].x * overlay.width;
    const y = landmarks[i].y * overlay.height;
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 2.2, 0, Math.PI * 2);
    canvasCtx.fill();
  });
}

// ---- Closed-eye timer + scream trigger ----
function updateEyeLogic(ear) {
  const closed = ear < EAR_THRESHOLD;
  const now = performance.now();

  if (closed) {
    if (closedSince === null) closedSince = now;
    const elapsed = now - closedSince;

    eyeStateEl.textContent = 'CLOSED';
    eyeStateEl.className = 'value bad';
    timerValEl.textContent = (elapsed / 1000).toFixed(1) + 's';

    const pct = Math.min(100, (elapsed / CLOSE_DURATION_MS) * 100);
    barEl.style.width = pct + '%';

    if (elapsed >= CLOSE_DURATION_MS && !hasScreamed) {
      triggerScream();
      hasScreamed = true;
    }
  } else {
    if (closedSince !== null) {
      const closedDuration = now - closedSince;
      if (closedDuration >= BLINK_MIN_MS && closedDuration <= BLINK_MAX_MS) {
        registerBlink();
      }
    }
    eyeStateEl.textContent = 'open';
    eyeStateEl.className = 'value good';
    resetTimer();
  }
}

function resetTimer() {
  closedSince = null;
  hasScreamed = false;
  timerValEl.textContent = '0.0s';
  barEl.style.width = '0%';
}

// ---- Blink detection: short beep on every quick blink ----
function registerBlink() {
  blinkCount += 1;
  if (blinkCountEl) blinkCountEl.textContent = String(blinkCount);
  playBlinkBeep();
}

function playBlinkBeep() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = BLINK_BEEP_FREQUENCY;

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
  gain.gain.linearRampToValueAtTime(0.0001, now + BLINK_BEEP_DURATION_S);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + BLINK_BEEP_DURATION_S + 0.02);
}

// ---- The "scream" itself: screen flash + long beep ----
function triggerScream() {
  flashEl.classList.add('on');
  setTimeout(() => flashEl.classList.remove('on'), 700);
  playBeep();
}

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Plays one long beep. This is the ONLY sound the app makes.
// While it's still sounding, it won't be re-triggered on top of itself.
// When it finishes naturally, it repeats only if eyes are STILL closed.
function playBeep() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = BEEP_FREQUENCY;

  // Small fade in/out so it doesn't click at the start/end.
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
  gain.gain.setValueAtTime(0.5, now + BEEP_DURATION_S - 0.05);
  gain.gain.linearRampToValueAtTime(0.0001, now + BEEP_DURATION_S);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + BEEP_DURATION_S);

  osc.onended = () => {
    if (closedSince !== null) {
      playBeep();
    }
  };
}
