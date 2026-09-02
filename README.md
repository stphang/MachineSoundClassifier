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

**Direct app URL:** https://stppst-machinesoundclassifier.static.hf.space/

Use the direct app URL for microphone access. Hugging Face's Space overview
page may embed Static Spaces in a cross-origin iframe, and browsers can block
microphone permission requests from that embedded page.

## What it does

- Requests microphone access directly from the browser.
- Applies the Web Audio API's Fast Fourier Transform (FFT) to live audio.
- Shows a live spectrum from 0 to 4 kHz+, the dominant frequency, sound level,
  spectral energy, a live sound-level meter, and an analysis score.
- Offers quick sensitivity presets (Quiet room / Workshop / Industrial) plus a
  fine-grained slider.
- Records timestamped normal and alert readings for the current browser session.
- Tracks session duration and enriched statistics (readings, alerts, average
  and peak frequency).
- Saves the event history in the browser (`localStorage`) so it survives a
  page refresh, and exports it as CSV or JSON.
- Handles denied permissions and missing microphones with a visible message.

## Data and processing

This is a Track B audio application using signal processing rather than a
downloaded machine-learning model. The browser's Web Audio API performs the
analysis locally. Microphone samples are not uploaded, sent to a Python
backend, or stored as recordings. The derived event history (timestamp,
frequency, score, alert flag — never raw audio) is saved in the browser's
`localStorage` so it persists across page reloads on the same device, and can
be cleared at any time with the **Clear** button.

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

- Adjustable alert sensitivity with quick presets and a fine-grained slider.
- Live sound-level (VU) meter for at-a-glance feedback.
- Session duration timer and enriched statistics (readings, alerts, average
  and peak frequency).
- Timestamped event history persisted in the browser across page reloads.
- CSV and JSON export without uploading data.
- Graceful microphone permission and device error states.
- CI validation before deployment.

## Limitations

Readings depend on microphone quality, browser audio settings, room noise,
and machine load. A single frequency peak should not be treated as proof of a
mechanical fault. The visible spectrum is limited to the lower 4 kHz range for
readability. Event history is stored per-browser via `localStorage`; clearing
browser data, using a different browser or device, or private/incognito mode
will not show previously saved events.
