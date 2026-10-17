// Generates voice-over (Gemini 3.8 Flash TTS), sound effects (ElevenLabs) and
// background music (ElevenLabs Music composition plan) through the multix CLI.
// MiniMax Music answers HTTP 410 for new accounts, so the music comes from data/music-plan.json;
// run scripts/arrange-music.mjs afterwards to put its drops on the video's beats.
// Usage: node scripts/generate-audio-assets.mjs <vo|sfx|music|all> [--force] [--only=id1,id2]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = JSON.parse(readFileSync(join(root, "data/script.json"), "utf8"));
const sfxSpec = JSON.parse(readFileSync(join(root, "data/sfx.json"), "utf8"));
const args = process.argv.slice(2);
const mode = args[0] || "all";
const force = args.includes("--force");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
// multix drops a copy of every output into ./multix-output; keep that out of the project.
const workDir = join(os.tmpdir(), `${basename(root)}-multix`);
mkdirSync(workDir, { recursive: true });

// POSIX spawns multix without a shell so spoken text never meets $, ` or globbing.
// Windows needs cmd.exe to resolve the multix.cmd shim: double embedded quotes and
// caret-escape % outside the quotes so %VAR% in a script line stays literal.
const isWin = process.platform === "win32";
const cmdQuote = (v) => `"${String(v).replace(/"/g, '""').replace(/%/g, '"^%"')}"`;
const spawnMultix = (argv, cwd) =>
  isWin ? spawn("multix", argv.map(cmdQuote), { shell: true, cwd }) : spawn("multix", argv, { cwd });

function multix(argv) {
  return new Promise((ok, fail) => {
    const child = spawnMultix(argv, workDir);
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok(log) : fail(new Error(`multix ${argv[0]} ${argv[1]} failed (${code}):\n${log.slice(-800)}`))));
  });
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Free-tier TTS allows only a few requests per minute: retry HTTP 429 honouring
// the "retry in Xs" hint, with a floor so bursts never loop hot.
async function multixRetry(argv, tries = 8) {
  for (let i = 1; ; i++) {
    try {
      return await multix(argv);
    } catch (e) {
      const m = /retry in ([\d.]+)s/i.exec(String(e));
      const wait = i < tries && m ? Math.max(45, Number(m[1]) + 2) : 0;
      if (!wait) throw e;
      console.log(`  rate limited, waiting ${Math.round(wait)}s (${i}/${tries})...`);
      await sleep(wait * 1000);
    }
  }
}

async function pool(items, size, fn) {
  const queue = [...items];
  const workers = Array.from({ length: size }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

// multix 0.2.0 has no --style flag: the style becomes a natural-language preamble
// in the text itself (Gemini TTS reads it as direction, verified it is not spoken
// aloud). script.json's gemini-3.8-flash-tts does not exist on this account and
// 2.5-flash-tts hit its daily quota, so the VO uses 3.1-flash-tts-preview (Sulafat).
const TTS_MODEL = "gemini-3.1-flash-tts-preview";

async function genVo() {
  const dir = join(root, "assets/audio/vo");
  mkdirSync(dir, { recursive: true });
  const scenes = script.scenes.filter((s) => !only.length || only.includes(s.id));
  await pool(scenes, 1, async (s) => { // serial: the free TTS tier allows ~3 requests/minute
    const out = join(dir, `${s.id}.wav`);
    if (existsSync(out) && !force) return console.log(`skip vo ${s.id}`);
    const content = s.lines.map((l) => l.say || l.en).join(" ");
    const style = (s.outro ? script.outroStyle : script.voice.style).trim().replace(/[.:]$/, ":");
    const text = `${style} ${content}`;
    await multixRetry(["gemini", "generate-speech", "--model", TTS_MODEL, "--voice", script.voice.voice, "--text", text, "--output", out]);
    console.log(`vo ${s.id} -> ${out}`);
  });
}

async function genSfx() {
  const dir = join(root, "assets/audio/sfx");
  mkdirSync(dir, { recursive: true });
  const list = sfxSpec.filter((s) => !only.length || only.includes(s.id));
  await pool(list, 4, async (s) => {
    const out = join(dir, `${s.id}.mp3`);
    if (existsSync(out) && !force) return console.log(`skip sfx ${s.id}`);
    await multix(["elevenlabs", "sfx", "--text", s.prompt, "--duration-seconds", s.duration, "--prompt-influence", "0.6", "--output", out]);
    console.log(`sfx ${s.id} -> ${out}`);
  });
}

async function composeMusic(plan, file) {
  const out = join(root, "assets/audio/music", file);
  if (existsSync(out) && !force) return console.log(`skip music ${file}`);
  const log = await multix(["elevenlabs", "music", "--plan", join(root, "data", plan), "--format", "mp3_44100_192", "--output", out, "--verbose"]);
  console.log(log.split("\n").slice(-6).join("\n"));
}

// The main track fades out before the ending, so the calm outro bed is a separate composition.
async function genMusic() {
  await composeMusic("music-plan.json", "bgm-raw.mp3");
  await composeMusic("outro-plan.json", "outro-raw.mp3");
}

const jobs = { vo: genVo, sfx: genSfx, music: genMusic };
for (const [name, job] of Object.entries(jobs)) {
  if (mode === "all" || mode === name) await job();
}
