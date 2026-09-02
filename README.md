---
title: Machine Sound Frequency Monitor
emoji: "📈"
colorFrom: green
colorTo: blue
sdk: static
app_file: index.html
pinned: false
---

# Machine Sound Frequency Monitor

A browser-only microphone analyzer for exploring machine sound in real time.
The app draws a frequency fingerprint, reports the strongest frequency and
sound level, calculates a normalized analysis score, and raises a visible
alert when the score crosses the selected sensitivity setting.

**Live Space:** https://huggingface.co/spaces/stPPst/MachineSoundClassifier

## What it does

- Requests microphone access directly from the browser.
- Applies the Web Audio API's Fast Fourier Transform (FFT) to live audio.
- Shows a live spectrum from 0 to 4 kHz+, the dominant frequency, sound level,
  spectral energy, and an analysis score.
- Lets the user adjust the alert sensitivity while listening.
- Records timestamped normal and alert readings for the current browser session.
- Exports the session history as a CSV file.
- Handles denied permissions and missing microphones with a visible message.

## Data and processing

This is a Track B audio application using signal processing rather than a
downloaded machine-learning model. The browser's Web Audio API performs the
analysis locally. Microphone samples are not uploaded, sent to a Python
backend, or stored as recordings. Only the current session's derived readings
are held in browser memory.

The score is a normalized indicator based on average spectrum energy and the
strongest frequency bin. It is an alert signal, not a certified machine-fault
diagnosis or a model confidence probability.

## Run locally

No Python environment or package installation is required. Serve the folder
from a local HTTP server because browsers restrict microphone access for many
`file://` pages:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000` and allow microphone access when prompted. A
modern browser with Web Audio API support is required.

## How it works

1. `getUserMedia` requests a microphone stream after the user clicks **Start
  listening**.
2. An `AnalyserNode` samples the stream and exposes frequency-bin magnitudes.
3. The app identifies the strongest bin, estimates sound level and energy, and
  combines those measurements into a bounded score.
4. Every two seconds, the score is compared with the selected threshold and a
  normal or alert event is added to the session log.

## Static Space deployment

The Space uses the **Static** SDK and serves `index.html` directly. There is
no server runtime, Python dependency, model download, or paid compute
requirement. The GitHub Actions workflow runs on pushes to `main`:

1. The `verify` job checks required assets, confirms that `index.html`
  references `styles.css` and `app.js`, rejects server-side dependencies, and
  checks JavaScript syntax.
2. The gated `deploy` job pushes the checked-out revision to the Space using
  the GitHub Actions secret `HF_TOKEN`.

## Engineering features

- Adjustable alert sensitivity.
- Timestamped in-session event history.
- CSV export without uploading data.
- Session statistics showing readings and alerts.
- Graceful microphone permission and device error states.
- CI validation before deployment.

## Limitations

Readings depend on microphone quality, browser audio settings, room noise,
and machine load. A single frequency peak should not be treated as proof of a
mechanical fault. The visible spectrum is limited to the lower 4 kHz range for
readability, and event history is cleared when the page is refreshed.
