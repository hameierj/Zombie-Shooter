# Generates the game's chiptune music (the same sound as the teaser): a start sting, a seamless battle loop and a
# seamless horde loop. 120 BPM, A minor (Am F C G), square/triangle + noise drums. Writes mono 22.05 kHz WAVs
# (exact sample loops; lossy formats add padding that clicks on loop) to src/assets/audio/.
#   python3 tools/make-music.py
import os, wave
import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'audio')
B = 0.5                       # seconds per beat
PROG = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]   # one chord per 2 s bar
note = lambda m: 440.0 * 2 ** ((m - 69) / 12)


class Track:
    def __init__(self, dur, seed=7):
        self.n = int(dur * SR); self.buf = np.zeros(self.n + SR * 3); self.rng = np.random.default_rng(seed)
    def put(self, sig, t0, g=1.0):
        i = int(t0 * SR); j = min(len(self.buf), i + len(sig))
        if j > i: self.buf[i:j] += sig[: j - i] * g
    def osc(self, kind, f, dur, duty=0.5):
        n = int(dur * SR); f = f if np.ndim(f) else np.full(n, f)
        ph = np.cumsum(f / SR) % 1.0
        return np.where(ph < duty, 1.0, -1.0) if kind == 'sq' else 4 * np.abs(ph - 0.5) - 1
    def env(self, n, d=0.08, s=0.6, r=0.05, hold=None):
        t = np.arange(n) / SR; hold = n / SR if hold is None else hold; a = 0.002
        e = np.where(t < a, t / a, np.where(t < a + d, 1 - (1 - s) * (t - a) / d, s))
        return e * (1 - np.clip((t - hold) / r, 0, 1))
    def noise(self, dur): return self.rng.uniform(-1, 1, int(dur * SR))
    # instruments
    def kick(self, t, g=0.9):
        d = 0.22; tt = np.arange(int(d * SR)) / SR
        self.put(self.osc('sq', 150 * np.exp(-tt * 28) + 45, d) * np.exp(-tt * 14), t, g * 0.55)
    def snare(self, t, g=0.45):
        d = 0.18; tt = np.arange(int(d * SR)) / SR
        self.put(self.noise(d) * np.exp(-tt * 22), t, g); self.put(self.osc('tri', 190, d) * np.exp(-tt * 30), t, g * 0.5)
    def hat(self, t, g=0.14):
        d = 0.04; tt = np.arange(int(d * SR)) / SR; h = np.diff(np.concatenate([[0], self.noise(d)]))
        self.put(h * np.exp(-tt * 70), t, g)
    def crash(self, t, g=0.4, d=1.6):
        tt = np.arange(int(d * SR)) / SR; h = np.diff(np.concatenate([[0], self.noise(d)]))
        self.put(h * np.exp(-tt * 2.6), t, g)
    def boom(self, t, g=0.8):
        d = 0.9; tt = np.arange(int(d * SR)) / SR
        self.put((self.osc('sq', 80 * np.exp(-tt * 4) + 30, d) * 0.6 + self.noise(d) * 0.5) * np.exp(-tt * 4.5), t, g)
    def blip(self, t, m, d=0.07, g=0.25, duty=0.25):
        self.put(self.osc('sq', note(m), d, duty) * self.env(int(d * SR), d=0.03, s=0.4, r=0.02), t, g)
    def lead(self, t, m, d, g=0.15, duty=0.25):
        n = int(d * SR); tt = np.arange(n) / SR
        f = note(m) * (1 + 0.006 * np.sin(2 * np.pi * 6 * tt) * np.clip(tt / 0.15 - 0.5, 0, 1))
        self.put(self.osc('sq', f, d, duty) * self.env(n, d=0.1, s=0.7, r=0.06, hold=d - 0.06), t, g)
    def bass(self, t, m, d, g=0.3):
        n = int(d * SR); self.put(self.osc('tri', note(m), d) * self.env(n, d=0.05, s=0.8, r=0.03, hold=d - 0.03), t, g)
    # parts
    def groove(self, t0, t1, busy=1):
        t = t0
        while t < t1 - 1e-6:
            beat = round(t / B)
            if beat % 2 == 0 or busy > 1: self.kick(t)
            if beat % 2 == 1: self.snare(t)
            for h in range(2 * busy): self.hat(t + h * B / (2 * busy), 0.1 if h % 2 else 0.14)
            t += B
    def bassline(self, t0, t1, octave=0):
        t = t0
        while t < t1 - 1e-6:
            root = PROG[int(t // 2.0) % 4][0] - 12 + octave
            for k, off in enumerate([0, 0, 12, 0, 7, 0, 12, 10]): self.bass(t + k * 0.25, root + off, 0.22)
            t += 2.0
    def arp(self, t0, t1, g=0.08, up=12):
        t = t0
        while t < t1 - 1e-6:
            ch = PROG[int(t // 2.0) % 4][1]
            for k in range(16): self.blip(t + k * 0.125, ch[k % 3] + up + (12 if k % 6 == 5 else 0), 0.1, g, 0.125)
            t += 2.0
    def melody(self, t, notes, g=0.14, unit=B * 2):
        for m, d in notes: self.lead(t, m, d * unit - 0.02, g); t += d * unit
    def render(self, loop):
        out = self.buf[: self.n].copy()
        if loop: tail = self.buf[self.n:]; out[: len(tail)] += tail[: self.n]   # wrap ringing notes into the start
        return out


MEL = [(76, 1), (74, .5), (72, .5), (74, 1), (69, 1), (72, 1), (71, .5), (69, .5), (67, 1), (64, 1),
       (69, .5), (72, .5), (76, .5), (79, .5), (77, 1), (76, 1), (74, .5), (72, .5), (71, .5), (72, .5), (74, 2)]


def save(name, x, gain):
    x = np.tanh(x * gain) * 0.9
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('wrote', name, f'{len(x) / SR:.1f}s', f'{os.path.getsize(os.path.join(OUT, name)) // 1024} KB')


# start sting: coin blips, rising sweep, title hit (≈3.2 s, one shot)
s = Track(3.4)
for i, m in enumerate([84, 88, 91, 96]): s.blip(0.05 + i * 0.09, m, 0.08, 0.22)
n = int(1.3 * SR); tt = np.arange(n) / SR
s.put(s.osc('sq', 110 * 2 ** (tt * 2.4), 1.3, 0.5) * (tt / 1.3) ** 2, 0.3, 0.14)
s.snare(1.45, 0.3); s.snare(1.57, 0.4); s.boom(1.7, 0.9); s.crash(1.7, 0.45)
for i, m in enumerate([69, 72, 76, 81]): s.lead(1.7 + i * 0.1, m, 0.12 if i < 3 else 1.0, 0.16, 0.5)
x = s.render(False); x[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR)); save('start.wav', x, 1.0)

# battle loop: 32 s (16 bars) - groove + bass all through, arp from bar 3, the lead melody on the second half
t = Track(32.0)
t.groove(0, 32); t.bassline(0, 32); t.arp(4, 32, 0.06)
t.melody(16.0, MEL, 0.11)
save('battle.wav', t.render(True), 0.9)

# horde loop: 16 s, double-time drums, bass up, busier arp, a climbing lead
h = Track(16.0, seed=11)
h.groove(0, 16, busy=2); h.bassline(0, 16, 0); h.arp(0, 16, 0.08, 24)
h.melody(0.0, [(81, 1), (79, .5), (76, .5), (84, 1), (83, .5), (79, .5), (81, 1), (76, 1), (88, 2)], 0.13, B)
h.melody(8.0, [(76, 1), (74, .5), (72, .5), (74, 1), (69, 1), (72, 1), (71, .5), (69, .5), (67, 1), (64, 1)], 0.12, B)
save('horde.wav', h.render(True), 0.95)
