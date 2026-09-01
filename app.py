"""
Machine Sound Classifier — live microphone audio event detection.

Captures short audio clips from the user's microphone, runs them through a
pretrained Audio Spectrogram Transformer (AST) fine-tuned on AudioSet, and
displays the top predicted sound classes with confidence scores. Detections
above a user-adjustable alert threshold are logged with timestamps and can
be exported as CSV.

Model: MIT/ast-finetuned-audioset-10-10-0.4593
       (Audio Spectrogram Transformer, trained on Google's AudioSet — 527
       everyday sound event classes such as "Siren", "Speech", "Engine",
       "Dog", "Machine gun", etc.)
"""

import csv
import io
import time
from datetime import datetime

import numpy as np
import gradio as gr
from transformers import pipeline

MODEL_ID = "MIT/ast-finetuned-audioset-10-10-0.4593"
TARGET_SR = 16000
TOP_K = 5

_classifier = None


def get_classifier():
    """Lazily load the AST audio classification pipeline (loaded once)."""
    global _classifier
    if _classifier is None:
        _classifier = pipeline(
            "audio-classification",
            model=MODEL_ID,
            top_k=TOP_K,
        )
    return _classifier


def _resample_if_needed(audio: np.ndarray, sr: int) -> np.ndarray:
    """Resample audio to TARGET_SR using linear interpolation (no extra deps)."""
    if sr == TARGET_SR:
        return audio
    duration = len(audio) / sr
    new_len = max(1, int(round(duration * TARGET_SR)))
    old_idx = np.linspace(0, len(audio) - 1, num=len(audio))
    new_idx = np.linspace(0, len(audio) - 1, num=new_len)
    return np.interp(new_idx, old_idx, audio).astype(np.float32)


def classify_audio(audio, threshold, event_log):
    """
    Run the classifier on a captured audio clip.

    Args:
        audio: (sample_rate, numpy array) tuple from gr.Audio, or None.
        threshold: confidence (0-1) above which a detection is logged as an alert.
        event_log: running list of log rows (list of lists) kept in gr.State.

    Returns:
        results_label: dict of {class_name: score} for gr.Label
        alert_html: HTML banner, shown only when top score crosses threshold
        log_df: updated log as a list-of-lists for the dataframe display
        event_log: updated state
        stats_md: markdown summary of session statistics
    """
    if event_log is None:
        event_log = []

    if audio is None:
        return (
            {},
            "<div style='padding:8px;color:#888;'>Waiting for audio input…</div>",
            event_log,
            event_log,
            _stats_markdown(event_log),
        )

    sr, data = audio
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data)) if data.size else 0.0
    if max_val > 0:
        data = data / max_val

    if data.size < 400:
        return (
            {},
            "<div style='padding:8px;color:#888;'>Clip too short, keep talking…</div>",
            event_log,
            event_log,
            _stats_markdown(event_log),
        )

    data = _resample_if_needed(data, sr)

    clf = get_classifier()
    predictions = clf({"array": data, "sampling_rate": TARGET_SR})

    scores = {p["label"]: float(p["score"]) for p in predictions}
    top_label = predictions[0]["label"]
    top_score = float(predictions[0]["score"])

    timestamp = datetime.now().strftime("%H:%M:%S")
    is_alert = top_score >= threshold
    event_log.append([timestamp, top_label, f"{top_score:.3f}", "YES" if is_alert else ""])
    event_log = event_log[-200:]  # cap history so memory/log stays bounded

    if is_alert:
        alert_html = (
            f"<div style='padding:10px;background:#ffe5e5;border:1px solid #ff4d4d;"
            f"border-radius:6px;color:#b30000;font-weight:bold;'>"
            f"⚠️ Alert: '{top_label}' detected at {top_score:.0%} confidence "
            f"(threshold {threshold:.0%})</div>"
        )
    else:
        alert_html = (
            f"<div style='padding:10px;background:#eaf7ea;border:1px solid #8fce8f;"
            f"border-radius:6px;color:#2d6a2d;'>"
            f"✅ Below threshold — top guess: '{top_label}' ({top_score:.0%})</div>"
        )

    return scores, alert_html, event_log, event_log, _stats_markdown(event_log)


def _stats_markdown(event_log):
    total = len(event_log)
    alerts = sum(1 for row in event_log if row[3] == "YES")
    if total == 0:
        return "**Session stats:** no clips analyzed yet."
    return (
        f"**Session stats:** {total} clips analyzed · {alerts} alerts triggered "
        f"({alerts / total:.0%} of clips)."
    )


def export_csv(event_log):
    if not event_log:
        return None
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["time", "label", "confidence", "alert"])
    writer.writerows(event_log)
    path = f"/tmp/sound_events_{int(time.time())}.csv"
    with open(path, "w", newline="") as f:
        f.write(buf.getvalue())
    return path


def clear_log():
    return [], [], _stats_markdown([])


HOW_IT_WORKS = """
### How it works
- Your browser captures short clips from the **microphone** and sends them to a Python backend running on Hugging Face Spaces (CPU only, no GPU).
- Each clip is classified by **`MIT/ast-finetuned-audioset-10-10-0.4593`**, an Audio Spectrogram Transformer pretrained on Google's **AudioSet** (527 everyday sound classes: speech, engines, sirens, alarms, machinery, animals, music, etc.).
- The top-5 predicted classes and their confidence scores are shown live. If the top score crosses the **alert threshold** (adjustable below), the clip is flagged as an alert and logged.
- **Limitations:** the model was trained on general-purpose AudioSet clips, not on your specific machine/environment, so confidence scores can be noisy for unusual or overlapping sounds. Very short or very quiet clips may produce unreliable predictions. This is a demo, not a certified monitoring system.
"""

with gr.Blocks(title="Machine Sound Classifier") as demo:
    gr.Markdown("# 🎙️ Machine Sound Classifier")
    gr.Markdown(
        "Speak, play a sound, or let ambient noise run into your microphone. "
        "The app classifies each clip against 527 AudioSet sound categories and "
        "raises an alert when confidence crosses your chosen threshold."
    )

    event_log_state = gr.State([])

    with gr.Row():
        with gr.Column(scale=1):
            audio_in = gr.Audio(
                sources=["microphone"],
                streaming=True,
                type="numpy",
                label="Microphone input",
            )
            threshold_slider = gr.Slider(
                minimum=0.05, maximum=0.95, value=0.4, step=0.05,
                label="Alert confidence threshold",
            )
        with gr.Column(scale=1):
            label_out = gr.Label(num_top_classes=TOP_K, label="Top predictions")
            alert_out = gr.HTML()

    stats_out = gr.Markdown(_stats_markdown([]))

    gr.Markdown("### Event log")
    log_table = gr.Dataframe(
        headers=["time", "label", "confidence", "alert"],
        datatype=["str", "str", "str", "str"],
        row_count=(0, "dynamic"),
        col_count=(4, "fixed"),
        interactive=False,
    )

    with gr.Row():
        export_btn = gr.Button("⬇️ Export log as CSV")
        clear_btn = gr.Button("🗑️ Clear log")
    csv_file = gr.File(label="Download", visible=True)

    gr.Markdown(HOW_IT_WORKS)

    audio_in.stream(
        fn=classify_audio,
        inputs=[audio_in, threshold_slider, event_log_state],
        outputs=[label_out, alert_out, log_table, event_log_state, stats_out],
        stream_every=2,
    )

    export_btn.click(fn=export_csv, inputs=[event_log_state], outputs=[csv_file])
    clear_btn.click(fn=clear_log, outputs=[log_table, event_log_state, stats_out])

if __name__ == "__main__":
    demo.queue().launch()
