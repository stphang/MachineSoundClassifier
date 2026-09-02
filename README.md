---
title: Machine Sound Classifier
emoji: 🎙️
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
---

# Machine Sound Classifier

A live microphone audio-event classifier: it listens through your browser's
microphone, classifies each short clip against **527 AudioSet sound
categories** (speech, engines, sirens, alarms, machinery, animals, music,
etc.), shows confidence scores, and raises a visible alert when a detection
crosses a user-adjustable threshold.

**Live Space:** https://huggingface.co/spaces/stPPst/MachineSoundClassifier

## What it does

- Captures streaming audio from the microphone in small clips.
- Runs each clip through a pretrained **Audio Spectrogram Transformer (AST)**
  fine-tuned on AudioSet (`MIT/ast-finetuned-audioset-10-10-0.4593`).
- Displays the **top-5 predicted classes with confidence scores** live.
- Flags any detection above an adjustable **alert threshold** with a
  color-coded banner.
- Keeps a running **event log** (timestamp, label, confidence, alert flag)
  that can be **exported as CSV**.
- Shows **session statistics** (clips analyzed, alert rate).

## Model / data used

- Model: [`MIT/ast-finetuned-audioset-10-10-0.4593`](https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593)
  — an Audio Spectrogram Transformer trained on Google's **AudioSet**
  (2M+ labeled 10-second YouTube clips, 527 sound event classes).
- No training data is collected from users; audio clips are processed
  in-memory for classification only and are not stored beyond the
  in-session event log (label/timestamp/score, not raw audio).
- Runs entirely on **CPU** — no GPU required, compatible with the free
  Hugging Face Spaces tier.

## Run locally

```bash
git clone <this-repo-url>
cd Test10-MachineSoundFrequencyRecorder
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # macOS/Linux
pip install -r requirements.txt
python app.py
```

Then open the local URL Gradio prints (usually `http://127.0.0.1:7860`) and
allow microphone access when prompted.

## How it works

See the **"How it works"** panel inside the running app for a plain-language
explanation of the model and its limitations, or read the docstring at the
top of [app.py](./app.py).

## CI/CD

- `.github/workflows/deploy-huggingface.yml` runs on every push to `main`:
  1. **verify** job — installs system + Python dependencies on a clean
     Ubuntu runner, compiles all `.py` files, and runs [`verify.py`](./verify.py)
     to confirm required files exist, syntax is valid, and core imports
     (`gradio`, `transformers`, `numpy`) succeed.
  2. **deploy** job — only runs if verify passes; force-pushes the repo to
     the Hugging Face Space using the `HF_TOKEN` repository secret (never a
     hardcoded token).

## Engineering features beyond the bare demo

- Adjustable alert confidence threshold with visible pass/fail banner.
- Persistent-within-session event log with CSV export.
- Live session statistics (clip count, alert rate).
- CI verify step that already caught a missing system library
  (`libsndfile`) on its first real run — see Actions history / screenshots.

## Limitations

The model is a general-purpose AudioSet classifier, not tuned to any
specific machine or environment. Expect noisier confidence scores for
quiet, short, or overlapping sounds. This is a demo/learning project, not a
certified monitoring system.
