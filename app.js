const STORAGE_KEY = 'machineSoundEvents';

const state = {
  audioContext: null,
  analyser: null,
  source: null,
  stream: null,
  frameId: null,
  listening: false,
  threshold: 0.65,
  events: [],
  lastSampleAt: 0,
  sessionStartedAt: null,
  durationTimer: null,
};

const elements = {
  start: document.querySelector('#startButton'),
  stop: document.querySelector('#stopButton'),
  slider: document.querySelector('#thresholdSlider'),
  threshold: document.querySelector('#thresholdValue'),
  presets: document.querySelectorAll('.preset-button'),
  notice: document.querySelector('#notice'),
  status: document.querySelector('#connectionStatus'),
  statusText: document.querySelector('#statusText'),
  badge: document.querySelector('#liveBadge'),
  canvas: document.querySelector('#spectrumCanvas'),
  empty: document.querySelector('#chartEmpty'),
  frequency: document.querySelector('#dominantFrequency'),
  level: document.querySelector('#soundLevel'),
  energy: document.querySelector('#spectralEnergy'),
  score: document.querySelector('#analysisScore'),
  duration: document.querySelector('#sessionDuration'),
  vuFill: document.querySelector('#vuMeterFill'),
  alertCard: document.querySelector('#alertCard'),
  alertIcon: document.querySelector('#alertIcon'),
  alertTitle: document.querySelector('#alertTitle'),
  alertMessage: document.querySelector('#alertMessage'),
  table: document.querySelector('#eventTable'),
  clear: document.querySelector('#clearButton'),
  export: document.querySelector('#exportButton'),
  exportJson: document.querySelector('#exportJsonButton'),
  stats: document.querySelector('#sessionStats'),
  statReadings: document.querySelector('#statReadings'),
  statAlerts: document.querySelector('#statAlerts'),
  statAvgFreq: document.querySelector('#statAvgFreq'),
  statPeakFreq: document.querySelector('#statPeakFreq'),
};

function setNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle('error', isError);
}

function setStatus(message, active = false) {
  elements.statusText.textContent = message;
  elements.status.classList.toggle('active', active);
  elements.badge.textContent = active ? 'LISTENING' : 'IDLE';
  elements.badge.classList.toggle('active', active);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function loadPersistedEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.events = parsed.map((item) => ({ ...item, time: new Date(item.time) })).slice(0, 100);
  } catch (error) {
    state.events = [];
  }
}

function persistEvents() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  } catch (error) {
    // Storage may be unavailable (private browsing, quota); the session still works in memory.
  }
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = elements.canvas.getBoundingClientRect();
  elements.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  elements.canvas.height = Math.max(1, Math.floor(rect.height * ratio));
}

function drawSpectrum(data, sampleRate) {
  const canvas = elements.canvas;
  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#e1e9e1';
  context.lineWidth = 1;
  for (let line = 1; line < 5; line += 1) {
    const y = (height / 5) * line;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  const visibleBins = Math.min(data.length, Math.floor((4000 / (sampleRate / 2)) * data.length));
  // Bucket bins per pixel column: hundreds of bins into ~380px otherwise collapses
  // the loudest bin into a sub-pixel, invisible spike.
  const columns = Math.max(1, Math.min(visibleBins, Math.round(width)));
  const bucketed = new Array(columns).fill(0);
  for (let index = 0; index < visibleBins; index += 1) {
    const column = Math.min(columns - 1, Math.floor((index / visibleBins) * columns));
    bucketed[column] = Math.max(bucketed[column], data[index]);
  }
  // Perceptual (sqrt) scaling keeps quiet/single-tone audio visibly structured
  // instead of flattening everything but the loudest bin toward zero.
  const heightFor = (value) => height - Math.max(2, Math.sqrt(value) * height * .92);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#147d55'); gradient.addColorStop(1, '#b8e8c7');
  context.beginPath();
  bucketed.forEach((value, index) => {
    const x = (index / Math.max(1, columns - 1)) * width;
    const y = heightFor(value);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.lineTo(width, height); context.lineTo(0, height); context.closePath();
  context.fillStyle = gradient; context.globalAlpha = .78; context.fill(); context.globalAlpha = 1;
  context.beginPath();
  bucketed.forEach((value, index) => {
    const x = (index / Math.max(1, columns - 1)) * width;
    const y = heightFor(value);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.strokeStyle = '#147d55'; context.lineWidth = 2; context.stroke();
}

function analyze() {
  if (!state.analyser) return;
  const values = new Uint8Array(state.analyser.frequencyBinCount);
  state.analyser.getByteFrequencyData(values);
  const sampleRate = state.audioContext.sampleRate;
  const firstUsefulBin = Math.max(1, Math.floor(30 * values.length * 2 / sampleRate));
  let peakIndex = firstUsefulBin; let peakValue = 0; let total = 0;
  values.forEach((value, index) => {
    total += value;
    if (index >= firstUsefulBin && value > peakValue) { peakValue = value; peakIndex = index; }
  });
  const frequency = peakIndex * sampleRate / (values.length * 2);
  const average = total / values.length;
  const score = Math.min(1, average / 120 + peakValue / 510);
  const db = Math.max(-90, 20 * Math.log10(Math.max(0.00001, average / 255)));
  // Array.from (not Uint8Array.map, which truncates fractions back to 0-255 ints)
  // keeps the normalized 0..1 magnitudes needed for visible chart scaling.
  drawSpectrum(Array.from(values, (value) => value / 255), sampleRate);
  elements.empty.hidden = true;
  elements.frequency.textContent = Math.round(frequency).toLocaleString();
  elements.level.textContent = `${db.toFixed(1)} dB`;
  elements.energy.textContent = `${Math.round(average / 2.55)}%`;
  elements.score.textContent = `${Math.round(score * 100)}%`;
  const meterLevel = Math.min(1, Math.sqrt(average / 255));
  elements.vuFill.style.width = `${Math.round(meterLevel * 100)}%`;
  elements.vuFill.classList.toggle('hot', score >= state.threshold);
  if (performance.now() - state.lastSampleAt > 1800) {
    recordEvent(frequency, score);
    state.lastSampleAt = performance.now();
  }
  state.frameId = requestAnimationFrame(analyze);
}

function recordEvent(frequency, score) {
  const alert = score >= state.threshold;
  state.events.unshift({ time: new Date(), frequency: Math.round(frequency), score, alert });
  state.events = state.events.slice(0, 100);
  persistEvents();
  renderLog();
  elements.alertCard.className = `alert-card ${alert ? 'alert' : 'ok'}`;
  elements.alertIcon.textContent = alert ? '!' : 'OK';
  elements.alertTitle.textContent = alert ? 'Attention: elevated sound energy' : 'Within selected range';
  elements.alertMessage.textContent = alert ? `The ${Math.round(score * 100)}% score crossed your ${Math.round(state.threshold * 100)}% sensitivity setting.` : `The strongest signal is ${Math.round(frequency)} Hz at a ${Math.round(score * 100)}% score.`;
}

function renderLog() {
  elements.table.innerHTML = '';
  if (!state.events.length) {
    elements.table.innerHTML = '<tr class="empty-row"><td colspan="4">No events recorded in this session.</td></tr>';
  } else {
    state.events.forEach((event) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${event.time.toLocaleTimeString()}</td><td>${event.frequency.toLocaleString()} Hz</td><td>${Math.round(event.score * 100)}%</td><td>${event.alert ? 'ALERT' : 'NORMAL'}</td>`;
      elements.table.appendChild(row);
    });
  }
  const alerts = state.events.filter((event) => event.alert).length;
  const frequencies = state.events.map((event) => event.frequency);
  elements.statReadings.textContent = state.events.length.toLocaleString();
  elements.statAlerts.textContent = alerts.toLocaleString();
  elements.statAvgFreq.textContent = frequencies.length ? Math.round(frequencies.reduce((sum, value) => sum + value, 0) / frequencies.length).toLocaleString() : '--';
  elements.statPeakFreq.textContent = frequencies.length ? Math.max(...frequencies).toLocaleString() : '--';
  elements.stats.textContent = state.events.length ? 'Saved automatically in this browser.' : 'No history saved yet.';
  elements.export.disabled = state.events.length === 0;
  elements.exportJson.disabled = state.events.length === 0;
}

function exportCsv() {
  const rows = [['time', 'frequency_hz', 'score', 'result'], ...state.events.map((event) => [event.time.toISOString(), event.frequency, event.score.toFixed(3), event.alert ? 'ALERT' : 'NORMAL'])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = `machine-sound-events-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportJson() {
  const payload = state.events.map((event) => ({ time: event.time.toISOString(), frequencyHz: event.frequency, score: Number(event.score.toFixed(3)), alert: event.alert }));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  link.download = `machine-sound-events-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function startListening() {
  try {
    setNotice('Requesting microphone permission...');
    const permissionRequest = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('MICROPHONE_REQUEST_TIMEOUT')), 8000));
    state.stream = await Promise.race([permissionRequest, timeout]);
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await state.audioContext.resume();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 2048;
    state.analyser.smoothingTimeConstant = .72;
    state.source = state.audioContext.createMediaStreamSource(state.stream);
    state.source.connect(state.analyser);
    state.listening = true;
    elements.start.disabled = true; elements.stop.disabled = false;
    setStatus('Listening now', true); setNotice('Audio is being analyzed locally in your browser.');
    resizeCanvas(); // container size may not have been final at page load
    state.sessionStartedAt = Date.now();
    if (state.durationTimer) clearInterval(state.durationTimer);
    state.durationTimer = setInterval(() => {
      elements.duration.textContent = formatDuration(Date.now() - state.sessionStartedAt);
    }, 1000);
    analyze();
  } catch (error) {
    setStatus('Microphone unavailable');
    if (error.message === 'MICROPHONE_REQUEST_TIMEOUT') {
      setNotice('Microphone access did not respond. Open the direct app link below; embedded Space pages may block microphone access.', true);
    } else {
      setNotice(error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access in your browser settings, then try again.' : 'No microphone was available. Connect a microphone and try again.', true);
    }
  }
}

function stopListening() {
  if (state.frameId) cancelAnimationFrame(state.frameId);
  if (state.durationTimer) { clearInterval(state.durationTimer); state.durationTimer = null; }
  if (state.source) state.source.disconnect();
  if (state.audioContext) state.audioContext.close();
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.audioContext = null; state.analyser = null; state.source = null; state.stream = null; state.listening = false;
  elements.start.disabled = false; elements.stop.disabled = true;
  setStatus('Ready to listen'); setNotice('Listening paused. Your session history remains available.');
}

elements.start.addEventListener('click', startListening);
elements.stop.addEventListener('click', stopListening);
elements.slider.addEventListener('input', (event) => { state.threshold = Number(event.target.value) / 100; elements.threshold.textContent = `${event.target.value}%`; elements.presets.forEach((button) => button.classList.toggle('active', button.dataset.threshold === event.target.value)); });
elements.clear.addEventListener('click', () => { state.events = []; persistEvents(); renderLog(); elements.alertCard.className = 'alert-card neutral'; elements.alertIcon.textContent = '.'; elements.alertTitle.textContent = 'History cleared'; elements.alertMessage.textContent = 'New readings will appear here.'; });
elements.export.addEventListener('click', exportCsv);
elements.exportJson.addEventListener('click', exportJson);
elements.presets.forEach((button) => {
  button.addEventListener('click', () => {
    const value = button.dataset.threshold;
    elements.slider.value = value;
    state.threshold = Number(value) / 100;
    elements.threshold.textContent = `${value}%`;
    elements.presets.forEach((other) => other.classList.toggle('active', other === button));
  });
});
window.addEventListener('resize', resizeCanvas);
if (window.ResizeObserver) {
  new ResizeObserver(resizeCanvas).observe(elements.canvas.parentElement);
}
resizeCanvas();
loadPersistedEvents();
renderLog();
