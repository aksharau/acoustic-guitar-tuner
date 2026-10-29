const NOTES = [
  { name: "E₂", freq: 82.41 },
  { name: "A₂", freq: 110.0 },
  { name: "D₃", freq: 146.83 },
  { name: "G₃", freq: 196.0 },
  { name: "B₃", freq: 246.94 },
  { name: "E₄", freq: 329.63 },
];

let audioContext = null;
let analyser = null;
let microphone = null;
let isRunning = false;
let animationId = null;
let selectedNote = NOTES[0];

const toggleMicBtn = document.getElementById("toggle-mic");
const noteNameEl = document.getElementById("note-name");
const targetFreqEl = document.getElementById("target-frequency");
const detectedFreqEl = document.getElementById("detected-frequency");
const needleEl = document.getElementById("needle");
const tuningStatusEl = document.getElementById("tuning-status");
const stringButtons = document.querySelectorAll(".string-btn");

function updateSelectedString(button) {
  const freq = Number(button.dataset.freq);
  const note = NOTES.find((item) => Math.abs(item.freq - freq) < 0.01);

  if (!note) return;

  selectedNote = note;
  stringButtons.forEach((btn) => btn.classList.toggle("active", btn === button));

  noteNameEl.textContent = selectedNote.name.replace(/[₀-₉]/g, "");
  targetFreqEl.textContent = `Target: ${selectedNote.freq.toFixed(2)} Hz`;
}

stringButtons.forEach((button) => {
  button.addEventListener("click", () => updateSelectedString(button));
});

updateSelectedString(stringButtons[0]);

toggleMicBtn.addEventListener("click", async () => {
  if (!isRunning) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;

      microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);

      isRunning = true;
      toggleMicBtn.textContent = "Stop Tuner";
      toggleMicBtn.classList.add("active");
      tuningStatusEl.textContent = "Listening...";
      tuningStatusEl.style.color = "#ffa502";

      updatePitch();
    } catch (err) {
      alert("Microphone access is required for the tuner to work.");
      console.error(err);
    }
  } else {
    stopTuner();
  }
});

function stopTuner() {
  if (animationId) cancelAnimationFrame(animationId);
  if (audioContext && audioContext.state !== "closed") audioContext.close();
  isRunning = false;
  toggleMicBtn.textContent = "Start Tuner";
  toggleMicBtn.classList.remove("active");
  noteNameEl.textContent = selectedNote.name.replace(/[₀-₉]/g, "");
  targetFreqEl.textContent = `Target: ${selectedNote.freq.toFixed(2)} Hz`;
  detectedFreqEl.textContent = "Detected: -- Hz";
  needleEl.style.left = "50%";
  tuningStatusEl.textContent = "Click Start to Tune";
  tuningStatusEl.style.color = "#ffa502";
}

function autoCorrelate(buffer, sampleRate) {
  let SIZE = buffer.length;
  let sumOfSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    let val = buffer[i];
    sumOfSquares += val * val;
  }
  let rootMeanSquare = Math.sqrt(sumOfSquares / SIZE);
  if (rootMeanSquare < 0.01) return -1;

  let r1 = 0,
    r2 = SIZE - 1;
  let threshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < threshold) {
      r2 = SIZE - i;
      break;
    }
  }

  buffer = buffer.slice(r1, r2);
  SIZE = buffer.length;

  let c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE - i; j++) {
      c[i] += buffer[j] * buffer[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1,
    maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  if (maxpos <= 0) return -1;

  return sampleRate / maxpos;
}

function updatePitch() {
  if (!analyser || !audioContext) {
    return;
  }

  const buffer = new Float32Array(2048);
  analyser.getFloatTimeDomainData(buffer);
  const acFreq = autoCorrelate(buffer, audioContext.sampleRate);

  if (acFreq !== -1 && acFreq > 70 && acFreq < 400) {
    detectedFreqEl.textContent = `Detected: ${acFreq.toFixed(2)} Hz`;

    noteNameEl.textContent = selectedNote.name.replace(/[₀-₉]/g, "");
    targetFreqEl.textContent = `Target: ${selectedNote.freq.toFixed(2)} Hz`;

    const cents = 1200 * Math.log2(acFreq / selectedNote.freq);
    let needlePos = 50 + cents;
    needlePos = Math.max(0, Math.min(100, needlePos));
    needleEl.style.left = `${needlePos}%`;

    if (Math.abs(cents) < 3) {
      tuningStatusEl.textContent = "✨ In Tune! ✨";
      tuningStatusEl.style.color = "#2ed573";
    } else if (cents < 0) {
      tuningStatusEl.textContent = "Flat (Tighten String ↗)";
      tuningStatusEl.style.color = "#ffa502";
    } else {
      tuningStatusEl.textContent = "Sharp (Loosen String ↙)";
      tuningStatusEl.style.color = "#ff4757";
    }
  } else {
    detectedFreqEl.textContent = "Detected: -- Hz";
    tuningStatusEl.textContent = "Listening...";
    tuningStatusEl.style.color = "#ffa502";
    needleEl.style.left = "50%";
  }

  animationId = requestAnimationFrame(updatePitch);
}
