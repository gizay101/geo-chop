"""GEO CHOP sound effects, synthesised from scratch (no samples, so no licensing issues).

Usage: python pipeline/sfx/make_sfx.py
Writes 44.1 kHz mono 16-bit WAVs to mobile/assets/sfx/.
"""
from pathlib import Path
import wave

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[2] / "mobile" / "assets" / "sfx"
rng = np.random.default_rng(7)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(SR * seconds)) / SR


def env(t: np.ndarray, attack: float, decay: float) -> np.ndarray:
    """Fast attack, exponential decay."""
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def one_pole_lowpass(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    """Cutoff may vary per sample (Hz)."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha[i] * (x[i] - acc)
        y[i] = acc
    return y


def place(buf: np.ndarray, snd: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    n = min(len(snd), len(buf) - i)
    if n > 0:
        buf[i : i + n] += gain * snd[:n]


def write(name: str, x: np.ndarray, peak: float = 0.85) -> None:
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    fade = min(len(x), int(0.004 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(f"{name}.wav  {len(x) / SR:.2f}s")


# --- building blocks -------------------------------------------------------

def blip(freq: float, seconds: float = 0.06, decay: float = 0.018) -> np.ndarray:
    t = t_axis(seconds)
    return np.sin(2 * np.pi * freq * t) * env(t, 0.001, decay)


def thunk(seconds: float = 0.35) -> np.ndarray:
    """Cleaver hitting a wooden board: pitch-dropping sine plus a short noise knock."""
    t = t_axis(seconds)
    f = 160 * np.exp(-t / 0.05) + 55
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.001, 0.09)
    knock = one_pole_lowpass(rng.standard_normal(len(t)), 1800) * env(t, 0.0005, 0.012) * 3
    return body + knock


def shing(seconds: float = 0.9) -> np.ndarray:
    """Metallic ring: inharmonic partials, each decaying at its own rate."""
    t = t_axis(seconds)
    out = np.zeros_like(t)
    for f, d, g in [(2350, 0.35, 1.0), (3710, 0.22, 0.6), (5230, 0.15, 0.45), (6980, 0.1, 0.3)]:
        out += g * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * env(t, 0.002, d)
    return out


def whoosh(seconds: float, f_start: float, f_end: float) -> np.ndarray:
    t = t_axis(seconds)
    cutoff = np.geomspace(f_start, f_end, len(t))
    n = rng.standard_normal(len(t))
    band = one_pole_lowpass(n, cutoff) - one_pole_lowpass(n, cutoff * 0.35)
    shape = np.sin(np.pi * np.clip(t / seconds, 0, 1)) ** 1.5
    return band * shape


# --- effects ---------------------------------------------------------------

def make_tap() -> np.ndarray:
    t = t_axis(0.05)
    click = one_pole_lowpass(rng.standard_normal(len(t)), 4000) * env(t, 0.0003, 0.004)
    return click * 0.6 + blip(1400, 0.05, 0.012) * 0.5


def make_slice() -> np.ndarray:
    """Blade swish → shing → thunk on the board (~0.9 s). The impact lands at 0.30 s."""
    buf = np.zeros(int(SR * 1.0))
    place(buf, whoosh(0.32, 9000, 2500), 0.0, 0.9)
    place(buf, shing(0.7), 0.26, 0.35)
    place(buf, thunk(0.45), 0.30, 1.0)
    return buf


def make_rise() -> np.ndarray:
    """Soft rising swell while the columns grow (~1.9 s)."""
    t = t_axis(1.9)
    f = 70 + 90 * (t / t[-1]) ** 1.5
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR)
    air = whoosh(1.9, 600, 2200) * 0.5
    shape = np.clip(t / 0.25, 0, 1) * np.clip((t[-1] - t) / 0.5, 0, 1)
    return (tone * 0.5 + air) * shape


def make_countup() -> np.ndarray:
    """Ticks that speed up and rise in pitch over 1.4 s, ending in a small ding."""
    dur = 1.4
    buf = np.zeros(int(SR * (dur + 0.6)))
    # tick times follow the ease-out of the counter: dense at the start, sparse at the end
    n = 22
    for i in range(n):
        u = i / (n - 1)
        at = dur * (1 - (1 - u) ** (1 / 3)) * 0.98  # inverse of the ease-out-cubic counter
        place(buf, blip(900 + 900 * u, 0.04, 0.01), at, 0.5)
    ding_t = t_axis(0.6)
    ding = sum(g * np.sin(2 * np.pi * f * ding_t) for f, g in [(1568, 1.0), (2349, 0.5), (3136, 0.25)])
    place(buf, ding * env(ding_t, 0.002, 0.18), dur, 0.8)
    return buf


def make_fireworks() -> np.ndarray:
    """Three small pops, each followed by crackle (~2.2 s)."""
    buf = np.zeros(int(SR * 2.3))
    for at in (0.0, 0.35, 0.75):
        t = t_axis(0.25)
        pop = one_pole_lowpass(rng.standard_normal(len(t)), 900) * env(t, 0.001, 0.03) * 4
        pop += np.sin(2 * np.pi * 70 * t) * env(t, 0.001, 0.06) * 0.6
        place(buf, pop, at, 1.0)
        for _ in range(28):
            c_at = at + 0.12 + rng.exponential(0.25)
            ct = t_axis(0.02)
            crack = rng.standard_normal(len(ct)) * env(ct, 0.0002, 0.003)
            place(buf, crack, c_at, rng.uniform(0.15, 0.45))
    return buf


def make_success() -> np.ndarray:
    """Bright three-note arpeggio for a great chop."""
    buf = np.zeros(int(SR * 0.9))
    for i, f in enumerate([1047, 1319, 1568]):
        t = t_axis(0.6)
        note = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * env(t, 0.003, 0.16)
        place(buf, note, i * 0.08, 0.7)
    return buf


def make_error() -> np.ndarray:
    """Two short, low, buzzy tones: "nope"."""
    buf = np.zeros(int(SR * 0.32))
    for at, f in ((0.0, 220), (0.14, 165)):
        t = t_axis(0.11)
        tone = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t) * 0.5  # soft square
        place(buf, one_pole_lowpass(tone, 2200) * env(t, 0.003, 0.05), at, 1.0)
    return buf


if __name__ == "__main__":
    write("tap", make_tap(), 0.5)
    write("slice", make_slice())
    write("rise", make_rise(), 0.5)
    write("countup", make_countup(), 0.7)
    write("fireworks", make_fireworks(), 0.8)
    write("success", make_success(), 0.7)
    write("error", make_error(), 0.6)
