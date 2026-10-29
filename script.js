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
let frequencyHistory = [];

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
  frequencyHistory = [];
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
      analyser.fftSize = 16384;
      analyser.smoothingTimeConstant = 0.2;

      microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);

      isRunning = true;
      toggleMicBtn.textContent = "Stop Tuner";
      toggleMicBtn.classList.add("active");
      tuningStatusEl.textContent = "Listening...";
      tuningStatusEl.style.color = "#ffa502";
      frequencyHistory = [];

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
  frequencyHistory = [];
}

function smoothFrequency(freq) {
  if (!Number.isFinite(freq)) return null;

  frequencyHistory.push(freq);
  if (frequencyHistory.length > 8) {
    frequencyHistory.shift();
  }

  const avg = frequencyHistory.reduce((sum, value) => sum + value, 0) / frequencyHistory.length;
  return avg;
}

function getDominantFrequencyFromFFT() {
  if (!analyser || !audioContext) return -1;

  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(frequencyData);

  let peakIndex = -1;
  let peakValue = -Infinity;

  const minHz = 50;
  const maxHz = 500;
  const nyquist = audioContext.sampleRate / 2;
  const minBin = Math.max(0, Math.floor((minHz / nyquist) * frequencyData.length));
  const maxBin = Math.min(frequencyData.length - 1, Math.ceil((maxHz / nyquist) * frequencyData.length));

  for (let i = minBin; i <= maxBin; i++) {
    if (frequencyData[i] > peakValue) {
      peakValue = frequencyData[i];
      peakIndex = i;
    }
  }

  if (peakIndex === -1 || peakValue < -90) return -1;

  const binWidth = audioContext.sampleRate / analyser.fftSize;
  return peakIndex * binWidth;
}

function updatePitch() {
  if (!analyser || !audioContext) {
    return;
  }

  const rawFreq = getDominantFrequencyFromFFT();

  if (rawFreq !== -1 && rawFreq >= selectedNote.freq * 0.6 && rawFreq <= selectedNote.freq * 1.8) {
    const detectedFreq = smoothFrequency(rawFreq) ?? rawFreq;

    detectedFreqEl.textContent = `Detected: ${detectedFreq.toFixed(2)} Hz`;
    noteNameEl.textContent = selectedNote.name.replace(/[₀-₉]/g, "");
    targetFreqEl.textContent = `Target: ${selectedNote.freq.toFixed(2)} Hz`;

    const cents = 1200 * Math.log2(detectedFreq / selectedNote.freq);
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

    animationId = requestAnimationFrame(updatePitch);
    return;
  }

  detectedFreqEl.textContent = "Detected: -- Hz";
  tuningStatusEl.textContent = "Listening...";
  tuningStatusEl.style.color = "#ffa502";
  needleEl.style.left = "50%";
  frequencyHistory = [];

  animationId = requestAnimationFrame(updatePitch);
}
