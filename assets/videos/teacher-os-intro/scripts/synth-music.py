#!/usr/bin/env python3
"""Synthesize the background music locally (ElevenLabs Music needs a paid plan,
MiniMax has no key): a light upbeat lo-fi-house bed at exactly 112 BPM.

Writes the same files the pipeline expects from `generate-audio-assets.mjs music`:
  assets/audio/music/bgm-raw.mp3    ~92 s of sectioned material for arrange-music.mjs
  assets/audio/music/outro-raw.mp3  ~26 s calm bed (felt piano + crackle, no drums)

The beat grid is exact by construction (beat0 = 0 s, 4/4, 112 BPM) so the
bar-splice arrangement lands on true downbeats. Deterministic (seeded rng).

Section map (source beats, 4 beats / bar):
   0-15  intro groove (muted kick, filtered pad)   = hook chaos
  16-26  build (snare roll + riser), beat 27 silent stop
  28-51  DROP A (full band, hook motif)
  52-75  groove 1
  76-82  build 2 (roll + riser), beat 83 silent stop
  84-107 groove drop 2
 108-115 breakdown (pads + plucks only)
 116-139 stats drop (biggest)
 140-163 CTA drop (bright hook)
 164-171 tail (sustained pad, fade)
"""
import subprocess
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
BPM = 112.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
TOTAL_BEATS = 172
DUR = TOTAL_BEATS * BEAT + 1.5  # small tail past the last beat
rng = np.random.default_rng(42)

N = int(DUR * SR)
mixL = np.zeros(N, np.float64)
mixR = np.zeros(N, np.float64)


def add(sig, t0, pan=0.0, gain=1.0):
    """Mix a mono signal into the stereo bus at t0 with constant-power pan."""
    i0 = int(t0 * SR)
    if i0 >= N:
        return
    x = sig[: N - i0] * gain
    a = (pan + 1) / 2
    mixL[i0 : i0 + len(x)] += x * np.cos(a * np.pi / 2)
    mixR[i0 : i0 + len(x)] += x * np.sin(a * np.pi / 2)


def env_exp(n, tau, attack=0.004):
    t = np.arange(n) / SR
    e = np.exp(-np.maximum(0.0, t - attack) / tau)
    e[: int(attack * SR)] *= np.linspace(0, 1, int(attack * SR)) if attack > 0 else 1
    return e


def lp(x, cutoff, order=2):
    b, a = signal.butter(order, cutoff / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x, cutoff, order=2):
    b, a = signal.butter(order, cutoff / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


def kick(t0, gain=0.9):
    n = int(0.38 * SR)
    t = np.arange(n) / SR
    f = 42 + (115 - 42) * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    add(np.tanh(1.4 * np.sin(ph) * env_exp(n, 0.11, 0.002)), t0, 0.0, gain)


def snare(t0, gain=0.42):
    n = int(0.22 * SR)
    noise = bp(rng.standard_normal(n), 1400, 3400) * env_exp(n, 0.055, 0.001)
    tone = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * env_exp(n, 0.045, 0.001)
    add((noise * 0.9 + tone * 0.55), t0, 0.0, gain)


def clap(t0, gain=0.46):
    for k, g in enumerate([1.0, 0.75, 0.55]):
        n = int(0.18 * SR)
        t0k = t0 + k * 0.011
        noise = bp(rng.standard_normal(n), 1100, 2600) * env_exp(n, 0.05 if k == 2 else 0.02, 0.001)
        add(noise, t0k, 0.0, gain * g)


def shaker(t0, gain=0.13, decay=0.045, pan=0.25):
    n = int((decay * 4 + 0.05) * SR)
    noise = hp(rng.standard_normal(n), 6200) * env_exp(n, decay, 0.001)
    add(noise, t0, pan, gain)


def pluck(t0, freq, gain=0.34, pan=0.0, decay=0.34):
    n = int((decay * 4 + 0.05) * SR)
    t = np.arange(n) / SR
    det = 1.0 + (rng.random() - 0.5) * 0.002
    x = (
        np.sin(2 * np.pi * freq * det * t)
        + 0.42 * np.sin(2 * np.pi * 2 * freq * t + 0.7)
        + 0.16 * np.sin(2 * np.pi * 3 * freq * t + 1.3)
    )
    add(x * env_exp(n, decay, 0.003), t0, pan, gain)


def pad_chord(t0, dur, freqs, gain=0.14, cutoff=1150):
    """Detuned-saw pad, slow attack, spread across the stereo field."""
    n = int((dur + 0.9) * SR)
    t = np.arange(n) / SR
    att = np.minimum(t / 0.6, 1.0)
    rel = np.ones(n)
    r0 = int(dur * SR)
    rel[r0:] = np.exp(-np.arange(n - r0) / SR / 0.45)
    e = att * rel
    for k, f in enumerate(freqs):
        pan = [-0.6, 0.6, -0.3, 0.3][k % 4]
        for d in (-0.0035, 0.0035):
            saw = signal.sawtooth(2 * np.pi * f * (1 + d) * t)
            add(lp(saw * e, cutoff, 2), t0, pan, gain / len(freqs) / 2)


def bass_note(t0, dur, freq, gain=0.5):
    n = int((dur + 0.06) * SR)
    t = np.arange(n) / SR
    e = env_exp(n, dur * 0.9, 0.006)
    tri = signal.sawtooth(2 * np.pi * freq * t, 0.5)
    sub = np.sin(2 * np.pi * freq / 2 * t) if freq > 60 else 0.35 * np.sin(2 * np.pi * freq * t)
    add(lp(0.7 * tri + sub, 380, 2) * e, t0, 0.0, gain)


def sidechain_duck(x, depth=0.42, rec=0.13):
    """Volume ducks at every beat start and recovers — the house pump."""
    n = x.shape[-1]
    g = np.ones(n)
    for b in np.arange(0, n / SR / BEAT + 1):
        i0 = int(b * BEAT * SR)
        m = min(n, i0 + int(0.5 * SR))
        if i0 >= n:
            break
        t = np.arange(m - i0) / SR
        g[i0:m] = np.minimum(g[i0:m], 1 - depth * np.exp(-t / rec))
    return x * g


def riser(t0, dur, gain=0.24):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # sweeping resonant band-pass approximated in 12 slices
    out = np.zeros(n)
    for k in range(12):
        a, b = int(n * k / 12), int(n * (k + 1) / 12) + 64
        c = 400 * (3500 / 400) ** (k / 11)
        seg = bp(noise[a:b], c * 0.7, min(c * 1.4, 18000))
        out[a:b] += seg[: b - a]
    sweep_f = 200 * (3.2) ** (t / dur)
    tone = np.sin(2 * np.pi * np.cumsum(sweep_f) / SR)
    amp = (t / dur) ** 1.6
    add((out * 0.75 + tone * 0.45) * amp, t0, 0.0, gain)


# ---------- harmony: Cmaj7 / Am7 / Fmaj7 / G6, one chord per bar ----------
CHORDS = [
    dict(pad=[130.81, 164.81, 196.0, 246.94], bass=65.41, arp=[261.63, 329.63, 392.0, 493.88, 523.25]),
    dict(pad=[110.0, 130.81, 164.81, 196.0], bass=55.0, arp=[220.0, 261.63, 329.63, 392.0, 440.0]),
    dict(pad=[87.31, 110.0, 130.81, 164.81], bass=87.31 / 2 * 2, arp=[174.61, 220.0, 261.63, 349.23, 440.0]),
    dict(pad=[98.0, 123.47, 146.83, 164.81], bass=98.0, arp=[196.0, 246.94, 293.66, 392.0, 493.88]),
]
# hook motif (scale degrees into the arp arrays), 8 eighth-notes per bar
HOOKS = [[0, 2, 4, 2, 3, 2, 1, 2], [0, 2, 3, 4, 3, 2, 1, 0], [0, 1, 2, 3, 4, 3, 2, 1], [4, 3, 2, 1, 0, 1, 2, 3]]


def bar_chord(bar):
    return CHORDS[bar % 4]


def section_intro(b0, b1):
    for b in range(b0, b1):
        bar = b // 4
        ch = bar_chord(bar)
        tb = b * BEAT
        kick(tb, 0.5)
        if b % 2 == 0:
            bass_note(tb, BEAT * 1.8, ch["bass"], 0.42)
        for k, e in enumerate([0, None, 2, None]):
            if e is not None:
                shaker(tb + e * BEAT / 2, 0.09)
        if b % 4 == 3:
            pluck(tb + BEAT * 2.5, ch["arp"][2], 0.22, 0.3)
        if b % 4 == 0:
            pad_chord(tb, BAR * 0.98, ch["pad"], 0.13, cutoff=800)


def section_build(b0, b1, silent_last=True):
    """Snare roll accelerating + riser over [b0, b1); last beat silent."""
    riser(b0 * BEAT, (b1 - b0) * BEAT - BEAT, 0.22)
    for b in range(b0, b1):
        tb = b * BEAT
        bars_in = b - b0
        if b % 4 == 0:
            pad_chord(tb, BAR * 0.98, bar_chord(b // 4)["pad"], 0.13, cutoff=900)
        if bars_in == 0:
            kick(tb, 0.55)
        div = 2 if bars_in < 2 else 4  # 8ths, then 16ths
        for k in range(div * 4):
            g = 0.12 + 0.3 * (k / (div * 4)) + bars_in * 0.05
            snare(tb + k * BEAT / div, min(g, 0.5))
        if silent_last and b == b1 - 1:
            # last bar: keep only the first two 16ths, then silence
            pass
    if silent_last:
        # zero the final beat: overwrite the bus tail of this bar's snare rolls
        i0, i1 = int((b1 - 1) * BEAT * SR), int(b1 * BEAT * SR)
        for buf in (mixL, mixR):
            buf[i0:i1] *= np.linspace(1, 0, i1 - i0) ** 3


def section_drop(b0, b1, big=False, hook=True):
    for b in range(b0, b1):
        bar = b // 4
        ch = bar_chord(bar)
        tb = b * BEAT
        for q in range(4):
            kick(tb + q * BEAT, 0.95 if big else 0.85)
            if q in (1, 3):
                clap(tb + q * BEAT, 0.42 if big else 0.36)
        bass_note(tb, BEAT * 0.9, ch["bass"], 0.5)
        bass_note(tb + 2.5 * BEAT, BEAT * 0.55, ch["bass"], 0.4)
        pad_chord(tb, BAR * 0.98, ch["pad"], 0.15 if big else 0.13, cutoff=1500 if big else 1250)
        hook_pattern = HOOKS[bar % 4] if hook else [0, None, 2, None, 4, None, 2, None]
        for k, deg in enumerate(hook_pattern):
            if deg is None:
                continue
            if rng.random() < (0.92 if hook else 0.7):
                pluck(tb + k * BEAT / 2, ch["arp"][deg % 5], 0.3 + (0.06 if big else 0), (k % 2) * 0.7 - 0.35)
        for q in range(4):
            shaker(tb + (q + 0.5) * BEAT, 0.14)
            if big:
                shaker(tb + q * BEAT, 0.08, 0.03)
        if b % 4 == 3 and b + 1 < b1:
            shaker(tb + 3.5 * BEAT, 0.2, 0.16, 0.1)  # open-hat lift into the next bar


def section_groove(b0, b1):
    for b in range(b0, b1):
        bar = b // 4
        ch = bar_chord(bar)
        tb = b * BEAT
        for q in range(4):
            kick(tb + q * BEAT, 0.8)
            if q == 3 and b % 2 == 1:
                continue  # laid-back: drop one kick every other bar
        snare(tb + BEAT, 0.3)
        snare(tb + 3 * BEAT, 0.3)
        bass_note(tb, BEAT * 1.6, ch["bass"], 0.46)
        bass_note(tb + 2.5 * BEAT, BEAT * 0.5, ch["bass"], 0.36)
        pad_chord(tb, BAR * 0.98, ch["pad"], 0.12, cutoff=1050)
        for k, deg in enumerate([0, None, 2, None, 4, 3, None, 1]):
            if deg is not None and rng.random() < 0.85:
                pluck(tb + k * BEAT / 2, ch["arp"][deg], 0.26, (k % 2) * 0.6 - 0.3)
        for q in range(4):
            shaker(tb + (q + 0.5) * BEAT, 0.12)


def section_breakdown(b0, b1):
    for b in range(b0, b1):
        bar = b // 4
        ch = bar_chord(bar)
        tb = b * BEAT
        pad_chord(tb, BAR * 0.98, ch["pad"], 0.15, cutoff=950)
        for k, deg in enumerate([4, None, 2, None, 3, None, 1, None]):
            if deg is not None:
                pluck(tb + k * BEAT / 2, ch["arp"][deg], 0.22, (k % 2) * 0.7 - 0.35)


def section_tail(b0, b1):
    ch = CHORDS[0]
    tb = b0 * BEAT
    pad_chord(tb, (b1 - b0) * BAR, [ch["pad"][0], ch["pad"][2], 261.63, 329.63, 493.88], 0.2, cutoff=1000)
    kick(tb, 0.4)
    pluck(tb + 2 * BEAT, ch["arp"][4], 0.18, 0.2, decay=0.8)


def build_bgm():
    section_intro(0, 16)
    section_build(16, 28)  # beats 16-27, beat 27 silent stop
    section_drop(28, 52, big=False, hook=True)  # DROP A
    section_groove(52, 76)
    section_build(76, 84)  # beats 76-83, beat 83 silent stop
    section_drop(84, 108, big=True, hook=True)  # groove drop 2
    section_breakdown(108, 116)
    section_drop(116, 140, big=True, hook=True)  # stats drop
    section_drop(140, 164, big=True, hook=True)  # CTA drop
    section_tail(164, 172)

    # sidechain the whole bus against the kick, then master
    bus = sidechain_duck(np.stack([mixL, mixR]))
    peak = np.abs(bus).max()
    bus = bus / peak * 0.85
    return bus


def felt_piano(t0, freq, dur, gain=0.3, pan=0.0):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    x = (
        np.sin(2 * np.pi * freq * t)
        + 0.3 * np.sin(2 * np.pi * 2 * freq * t + 0.4)
        + 0.09 * np.sin(2 * np.pi * 3 * freq * t)
    )
    e = np.minimum(t / 0.012, 1.0) * np.exp(-t / (dur * 0.55))
    add(lp(x * e, 2600, 2), t0, pan, gain)


def crackle(dur, gain=0.016):
    n = int(dur * SR)
    ticks = rng.random(n) < (30 / SR)
    x = np.zeros(n)
    x[ticks] = rng.standard_normal(int(ticks.sum())) * 0.6
    return hp(x, 1800)


def build_outro(dur=26.0):
    """Calm bed: rolled felt-piano chords over a quiet pad + vinyl crackle."""
    global mixL, mixR
    mixL[:] = 0.0
    mixR[:] = 0.0
    n_out = int(dur * SR)
    mixL[n_out:] = 0.0
    mixR[n_out:] = 0.0
    PROG = [
        [130.81, 164.81, 196.0, 246.94, 329.63],  # Cmaj7
        [87.31, 130.81, 174.61, 220.0, 261.63],  # Fmaj7
        [110.0, 130.81, 164.81, 196.0, 261.63],  # Am7
        [98.0, 146.83, 196.0, 246.94, 293.66],  # G add9
    ]
    step = dur / 8  # two bars of a slow 4-chord loop, twice
    for k in range(8):
        chord = PROG[k % 4]
        t0 = k * step
        for j, f in enumerate(chord):
            felt_piano(t0 + j * 0.035, f, step * 1.3, 0.16 - j * 0.012, pan=(-0.5 + 0.25 * j))
        for j, f in enumerate(chord[1:]):
            felt_piano(t0 + step * 0.5 + j * 0.03, f, step * 0.7, 0.09, pan=(0.4 - 0.2 * j))
    pad_chord(0, dur * 0.96, [130.81, 196.0, 329.63], 0.05, cutoff=700)
    bus = np.stack([mixL[:n_out] + crackle(dur), mixR[:n_out] + crackle(dur)])
    peak = np.abs(bus).max()
    fade = np.ones_like(bus)
    f0 = int((dur - 3.5) * SR)
    fade[:, f0:] *= np.linspace(1, 0, bus.shape[1] - f0) ** 1.2
    return bus / peak * 0.85 * fade


def write_mp3(bus, path, kbps="192k"):
    tmp = Path(path).with_suffix(".wav")
    wavfile.write(tmp, SR, (bus.T * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-codec:a", "libmp3lame", "-b:a", kbps, str(path)], check=True)
    tmp.unlink()
    print(f"wrote {path} ({Path(path).stat().st_size // 1024} KB)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    write_mp3(build_bgm(), root / "assets/audio/music/bgm-raw.mp3")
    write_mp3(build_outro(), root / "assets/audio/music/outro-raw.mp3")
    print(f"BPM {BPM}, beat {BEAT:.6f} s, total {TOTAL_BEATS} beats = {TOTAL_BEATS * BEAT:.2f} s")
