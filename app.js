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
};

const elements = {
  start: document.querySelector('#startButton'),
  stop: document.querySelector('#stopButton'),
  slider: document.querySelector('#thresholdSlider'),
  threshold: document.querySelector('#thresholdValue'),
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
  alertCard: document.querySelector('#alertCard'),
  alertIcon: document.querySelector('#alertIcon'),
  alertTitle: document.querySelector('#alertTitle'),
  alertMessage: document.querySelector('#alertMessage'),
  table: document.querySelector('#eventTable'),
  clear: document.querySelector('#clearButton'),
  export: document.querySelector('#exportButton'),
  stats: document.querySelector('#sessionStats'),
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
  const peakMagnitude = Math.max(1, ...data.slice(0, visibleBins));
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#147d55'); gradient.addColorStop(1, '#b8e8c7');
  context.beginPath();
  for (let index = 0; index < visibleBins; index += 1) {
    const x = (index / Math.max(1, visibleBins - 1)) * width;
    const y = height - Math.max(2, (data[index] / peakMagnitude) * height * .85);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.lineTo(width, height); context.lineTo(0, height); context.closePath();
  context.fillStyle = gradient; context.globalAlpha = .78; context.fill(); context.globalAlpha = 1;
  context.beginPath();
  for (let index = 0; index < visibleBins; index += 1) {
    const x = (index / Math.max(1, visibleBins - 1)) * width;
    const y = height - Math.max(2, (data[index] / peakMagnitude) * height * .85);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
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
  drawSpectrum(values.map((value) => value / 255), sampleRate);
  elements.empty.hidden = true;
  elements.frequency.textContent = Math.round(frequency).toLocaleString();
  elements.level.textContent = `${db.toFixed(1)} dB`;
  elements.energy.textContent = `${Math.round(average / 2.55)}%`;
  elements.score.textContent = `${Math.round(score * 100)}%`;
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
  elements.stats.textContent = `${state.events.length} readings / ${alerts} alerts`;
  elements.export.disabled = state.events.length === 0;
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
  if (state.source) state.source.disconnect();
  if (state.audioContext) state.audioContext.close();
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.audioContext = null; state.analyser = null; state.source = null; state.stream = null; state.listening = false;
  elements.start.disabled = false; elements.stop.disabled = true;
  setStatus('Ready to listen'); setNotice('Listening paused. Your session history remains available.');
}

elements.start.addEventListener('click', startListening);
elements.stop.addEventListener('click', stopListening);
elements.slider.addEventListener('input', (event) => { state.threshold = Number(event.target.value) / 100; elements.threshold.textContent = `${event.target.value}%`; });
elements.clear.addEventListener('click', () => { state.events = []; renderLog(); elements.alertCard.className = 'alert-card neutral'; elements.alertIcon.textContent = '.'; elements.alertTitle.textContent = 'History cleared'; elements.alertMessage.textContent = 'New readings will appear here.'; });
elements.export.addEventListener('click', exportCsv);
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
renderLog();
