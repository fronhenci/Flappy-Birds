/*
Simple Flappy Bird (shapes only). 
Controls:
 - Tap / click / Spacebar to flap.
 - Restart button to reset.
Designed for a single-screen mobile-friendly canvas.
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreEl = document.getElementById('score');
const titleScreen = document.getElementById('titleScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const goScoreEl = document.getElementById('goScore');
const goBestEl = document.getElementById('goBest');

// helper: render a number into the score element using digit images (assets /0.png .. /9.png)
function setScoreImages(el, n){
  if(!el) return;
  const s = String(Math.max(0, Math.floor(n)));
  // each digit is an <img> using project assets; keep pixelated rendering and match current font-size
  el.innerHTML = Array.from(s).map(d => {
    // small inline styling to size images relative to the element and keep pixel-art crisp
    return `<img src="/${d}.png" alt="${d}" style="height:1em; image-rendering: pixelated; vertical-align: middle;">`;
  }).join('');
}
const playBtn = document.getElementById('playBtn');
const rateBtn = document.getElementById('rateBtn');
const leaderBtn = document.getElementById('leaderBtn');
const settingsBtn = document.getElementById('settingsBtn');
const skinsBtn = document.getElementById('skinsBtn');

const restartBtn = document.getElementById('restartBtn');
const menuBtn = document.getElementById('menuBtn');
const goLeaderBtn = document.getElementById('goLeaderBtn');
const shareBtn = document.getElementById('shareBtn');

// Player count overlay elements
const playerCountOverlay = document.getElementById('playerCountOverlay');
const playerCountButtons = document.querySelectorAll('.playercount-button');
// Store selected player count (default to 1)
let playerCount = 1;

// Share / replay elements
const shareOverlay = document.getElementById('shareOverlay');
const shareScoreEl = document.getElementById('shareScore');
const shareBestEl = document.getElementById('shareBest');
const shareCommentBtn = document.getElementById('shareCommentBtn');
const shareCloseBtn = document.getElementById('shareCloseBtn');
const shareVideoEl = document.getElementById('shareVideo');
const shareMessageEl = document.getElementById('shareMessage');

// Leaderboard elements
const leaderOverlay = document.getElementById('leaderOverlay');
const leaderListEl = document.getElementById('leaderList');
const leaderPageInfoEl = document.getElementById('leaderPageInfo');
const leaderPrevBtn = document.getElementById('leaderPrevBtn');
const leaderNextBtn = document.getElementById('leaderNextBtn');
const leaderCloseBtn = document.getElementById('leaderCloseBtn');
const leaderYourPosEl = document.getElementById('leaderYourPos');

// Settings / rate / skins overlays
const rateOverlay = document.getElementById('rateOverlay');
const donateAmountInput = document.getElementById('donateAmount');
const donateBtn = document.getElementById('donateBtn');

const settingsOverlay = document.getElementById('settingsOverlay');
const settingsVolumeInput = document.getElementById('settingsVolume');
const settingsRecordInput = document.getElementById('settingsRecord');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');

const skinsOverlay = document.getElementById('skinsOverlay');
const skinsCloseBtn = document.getElementById('skinsCloseBtn');
const skinButtons = document.querySelectorAll('.skin-button');
const skinsTitleEl = document.querySelector('#skinsOverlay .skins-title');
const skinsTextEl = document.querySelector('#skinsOverlay .skins-text');

 // Settings state (persistent)
let settings = {
  volume: 1.0,
  recordRuns: true,
};

(function loadSettings() {
  try {
    const raw = localStorage.getItem('floppy_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.volume === 'number') {
        settings.volume = Math.min(1, Math.max(0, parsed.volume));
      }
      if (typeof parsed.recordRuns === 'boolean') {
        settings.recordRuns = parsed.recordRuns;
      }
    }
  } catch (e) {
    // ignore parse/storage errors and keep defaults
  }
})();

function saveSettings() {
  try {
    localStorage.setItem('floppy_settings', JSON.stringify(settings));
  } catch (e) {
    // ignore storage errors
  }
}

 // MediaRecorder state for run replay
let runRecorder = null;
let runRecordedChunks = [];
let runVideoUrl = null;
let runVideoBlob = null;

 // leaderboard state
let leaderboardEntries = [];
let leaderboardPage = 0;
const LEADERBOARD_PAGE_SIZE = 10;
let leaderboardUnsubscribe = null;

// WebsimSocket helper for persistent scores
let roomPromise = null;
function getRoom() {
  if (!roomPromise) {
    roomPromise = (async () => {
      const room = new WebsimSocket();
      await room.initialize();
      return room;
    })();
  }
  return roomPromise;
}

function startRunRecording() {
  if (!settings.recordRuns) {
    // if recording is disabled in settings, ensure no old data is kept
    if (runVideoUrl) {
      URL.revokeObjectURL(runVideoUrl);
      runVideoUrl = null;
    }
    runVideoBlob = null;
    runRecordedChunks = [];
    runRecorder = null;
    return;
  }

  // clean up any previous recording URL / blob
  if (runVideoUrl) {
    URL.revokeObjectURL(runVideoUrl);
    runVideoUrl = null;
  }
  runVideoBlob = null;
  runRecordedChunks = [];

  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
    console.log('MediaRecorder or canvas.captureStream not supported; replay video disabled.');
    return;
  }

  try {
    const stream = canvas.captureStream(60);
    runRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
    });

    runRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        runRecordedChunks.push(e.data);
      }
    };

    runRecorder.onstop = () => {
      if (runRecordedChunks.length === 0) return;
      runVideoBlob = new Blob(runRecordedChunks, { type: 'video/webm' });
      runVideoUrl = URL.createObjectURL(runVideoBlob);
      if (shareVideoEl) {
        shareVideoEl.src = runVideoUrl;
      }
    };

    runRecorder.start();
  } catch (err) {
    console.log('Failed to start MediaRecorder:', err);
    runRecorder = null;
  }
}

function stopRunRecording() {
  if (runRecorder && runRecorder.state !== 'inactive') {
    try {
      runRecorder.stop();
    } catch (e) {
      console.log('Error stopping recorder:', e);
    }
  }
}

let DPR = Math.max(1, window.devicePixelRatio || 1);

// available bird skins (all unlocked)
const SKINS = [
  {
    id: 'yellow',
    label: 'Classic',
    up: '/Yellow-upflap.png',
    mid: '/Yellow-midflap.png',
    down: '/Yellow-downflap.png',
  },
  {
    id: 'red',
    label: 'Red',
    up: '/Red-upflap.png',
    mid: '/Red-midflap.png',
    down: '/Red-downflap.png',
  },
  {
    id: 'blue',
    label: 'Blue',
    up: '/Blue-upflap.png',
    mid: '/Blue-midflap.png',
    down: '/Blue-downflap.png',
  },
  {
    id: 'green',
    label: 'Green',
    up: '/Green-upflap.png',
    mid: '/Green-midflap.png',
    down: '/Green-downflap.png',
  },
];

// global default skin (used for 1-player quick start / skins button)
let currentSkinId = 'yellow';
(function loadSkinChoice() {
  try {
    const stored = localStorage.getItem('floppy_skin');
    if (stored && SKINS.some(s => s.id === stored)) {
      currentSkinId = stored;
    }
  } catch (e) {
    // ignore storage errors
  }
})();

// per-skin sprite cache (so we can draw multiple birds with different skins)
const SkinSprites = {};
for (const skin of SKINS) {
  const cache = {
    up: new Image(),
    mid: new Image(),
    down: new Image(),
    ready: false,
    _loaded: 0,
  };
  const inc = () => {
    cache._loaded++;
    if (cache._loaded === 3) cache.ready = true;
  };
  cache.up.addEventListener('load', inc);
  cache.mid.addEventListener('load', inc);
  cache.down.addEventListener('load', inc);
  cache.up.src = skin.up;
  cache.mid.src = skin.mid;
  cache.down.src = skin.down;
  SkinSprites[skin.id] = cache;
}

// per-player skin selection (filled when you choose player count)
let selectedSkins = [currentSkinId];
let currentSkinSelectionIndex = null;

// digit sprites (0-9) for in-canvas score HUD so the recording shows score increasing
const DigitSprites = {
  imgs: [],
  ready: false
};
(function initDigitSprites(){
  let loaded = 0;
  for (let i = 0; i <= 9; i++) {
    const img = new Image();
    img.src = `/${i}.png`;
    img.onload = () => {
      loaded++;
      if (loaded === 10) DigitSprites.ready = true;
    };
    DigitSprites.imgs[i] = img;
  }
})();

 // load sounds (wing on flap, point on score)
const Sounds = {
  wing: new Audio('/wing.ogg'),
  point: new Audio('/point.ogg'),
  hit: new Audio('/hit.ogg'),
  die: new Audio('/die.ogg')
};

function applySoundVolume() {
  const v = Math.min(1, Math.max(0, settings.volume || 0));
  const base = 0.9;
  Sounds.wing.volume = base * v;
  Sounds.point.volume = base * v;
  Sounds.hit.volume = base * v;
  Sounds.die.volume = base * v;
}

// allow quick retriggering by setting currentTime when played; keep volumes reasonable
applySoundVolume();
Sounds.wing.preload = 'auto';
Sounds.point.preload = 'auto';
Sounds.hit.preload = 'auto';
Sounds.die.preload = 'auto';

 // load pipe sprite
const PipeSprite = new Image();
let PipeSpriteReady = false;
PipeSprite.src = '/pipe-green.png';
PipeSprite.addEventListener('load', () => {
  PipeSpriteReady = true;
});

// load game over image (in-canvas overlay)
const GameOverImg = new Image();
let GameOverImgReady = false;
GameOverImg.src = '/gameover.png';
GameOverImg.addEventListener('load', () => {
  GameOverImgReady = true;
});

 // load ground texture (base.png) and keep the image for manual tiling
const BaseImg = new Image();
let BaseImgReady = false;
BaseImg.src = '/base.png';
BaseImg.addEventListener('load', () => {
  BaseImgReady = true;
});

// load background (day) and allow horizontal tiling so it can duplicate to the sides
const BackgroundImg = new Image();
let BackgroundImgReady = false;
BackgroundImg.src = '/background-day.png';
BackgroundImg.addEventListener('load', () => {
  BackgroundImgReady = true;
});

function resize() {
  const vv = window.visualViewport;
  const rawW = vv ? vv.width : window.innerWidth;
  const rawH = vv ? vv.height : window.innerHeight;

  const w = Math.max(320, Math.round(rawW));
  const h = Math.max(480, Math.round(rawH));

  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);

  if (window.Game && typeof window.Game.onResize === 'function') {
    window.Game.onResize(w, h);
  }
}

function scheduleResize() {
  DPR = Math.max(1, window.devicePixelRatio || 1);
  resize();
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleResize);
  window.visualViewport.addEventListener('scroll', scheduleResize);
}
window.addEventListener('resize', scheduleResize);
resize();

/* --- Game constants --- */
const GRAVITY = 1000; // px/s^2
const FLAP_V = -320; // px/s immediate velocity
const PIPE_WIDTH = 64;
const PIPE_GAP = 150;
const PIPE_SPACING = 220; // distance between pipe centers
const GROUND_HEIGHT = 90;
const FLASH_DURATION = 0.55;
const FADE_IN_DURATION = 0.6;

/* --- Utility --- */
function randRange(a,b){ return a + Math.random()*(b-a); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

/* --- Game State & Logic --- */
const Game = {
  width: canvas.width / DPR,
  height: canvas.height / DPR,
  running: false,
  started: false,
  lastTime: 0,
  // main bird pointer (first player)
  bird: null,
  // all birds
  birds: [],
  pipes: [],
  speed: 140,
  spawnTimer: 0,
  score: 0,
  best: 0,
  runStartTime: 0,
  runRecord: [],
  lastRunDurationSec: 0,
  fadeInTimer: 0,
  onResize(w,h){
    // Keep the "camera" view consistent when the canvas size changes by
    // proportionally scaling positions of birds, pipes, and ground offset.
    const oldW = this.width || w;
    const oldH = this.height || h;
    const sx = oldW > 0 ? (w / oldW) : 1;
    const sy = oldH > 0 ? (h / oldH) : 1;

    // Update stored dimensions first
    this.width = w;
    this.height = h;

    // Scale bird positions so they stay in roughly the same relative place
    if (Array.isArray(this.birds)) {
      this.birds.forEach(b => {
        if (!b) return;
        b.x *= sx;
        b.y *= sy;
      });
    }

    // Scale pipe positions so their relative locations stay correct
    if (Array.isArray(this.pipes)) {
      this.pipes.forEach(p => {
        if (!p) return;
        p.x *= sx;
        p.cy *= sy;
      });
    }

    // Adjust title bobbing baseline
    if (typeof this.titleBirdBaseY === 'number') {
      this.titleBirdBaseY *= sy;
    }

    // Adjust ground scroll offset horizontally
    if (typeof this.groundOffset === 'number') {
      this.groundOffset *= sx;
    }
  },
  _recordFrame(now){
    if (!this.started || !this.runStartTime) return;
    if (!this.running && !this.dying) return;
    const t = (now - this.runStartTime) / 1000;
    const main = this.bird || this.birds[0];
    if (!main) return;
    this.runRecord.push({
      t,
      score: this.score,
      x: main.x,
      y: main.y,
      vy: main.vy
    });
  },
  reset(){
    this.running = false;
    this.started = false;
    this.frozen = false;
    this.dying = false;
    this.lastTime = performance.now();

    try {
      this.best = parseInt(localStorage.getItem('floppy_best') || '0', 10) || 0;
    } catch (e) {
      this.best = this.best || 0;
    }

    // ensure selectedSkins matches playerCount
    if (!Array.isArray(selectedSkins) || selectedSkins.length !== playerCount) {
      selectedSkins = new Array(playerCount).fill(currentSkinId);
    }

    this.birds = [];
    const baseX = Math.round(this.width * 0.28);
    const baseY = Math.round(this.height * 0.5);
    const spacing = 22; // horizontal spacing between birds
    for (let i = 0; i < playerCount; i++) {
      const offset = (i - (playerCount - 1) / 2) * spacing;
      this.birds.push({
        x: baseX + offset,
        y: baseY,
        r: 14,
        vy: 0,
        vx: 0,
        rot: 0,
        animTime: 1,
        skinId: selectedSkins[i] || currentSkinId,
        alive: true,
        score: 0,
      });
    }
    this.bird = this.birds[0] || null;

    this.titleTime = 0;
    this.titleBirdBaseY = baseY;
    this.pipes = [];
    this.spawnTimer = 0;
    this.dying = false;

    const baseSpan = Math.min(this.width, this.height);
    const portraitBoost = (this.width < this.height) ? 1.25 : 1.0;
    this.speed = Math.max(120, Math.round(baseSpan * 0.28 * portraitBoost));
    this.groundOffset = 0;
    this.score = 0;
    this.runStartTime = 0;
    this.runRecord = [];
    if (scoreEl) {
      scoreEl.style.display = 'none';
    }
    this.flashTimer = 0;
    this.fadeInTimer = 0;
    this.deathTimer = 0;
    this._spawnInitialPipes();

    hideGameOver();
    showTitle();
  },
  _spawnInitialPipes(){
    const startX = this.width + 60;
    for(let i=0;i<3;i++){
      this._spawnPipe(startX + i*PIPE_SPACING);
    }
  },
  _spawnPipe(x){
    const margin = 36;
    const maxGapCenter = this.height - GROUND_HEIGHT - PIPE_GAP/2 - margin;
    const minGapCenter = margin + PIPE_GAP/2;
    const cy = randRange(minGapCenter, maxGapCenter);
    this.pipes.push({
      x,
      cy,
      passed: false,
      // per-bird pass tracking: index -> true when that bird scores on this pipe
      passedBy: {},
    });
  },
  flap(birdIndex){
    if (!this.running || this.dying) return;

    let birdsToFlap;
    if (typeof birdIndex === 'number') {
      const b = this.birds[birdIndex];
      if (!b || !b.alive) return;
      birdsToFlap = [b];
    } else {
      birdsToFlap = this.birds.filter(b => b.alive);
    }

    if (!birdsToFlap || !birdsToFlap.length) return;

    for (const b of birdsToFlap) {
      b.vy = FLAP_V;
      b.animTime = 0;
    }
    try {
      Sounds.wing.currentTime = 0;
      const p = Sounds.wing.play();
      if (p && p.catch) p.catch(()=>{});
    } catch (e) {}
  },
  _handleBirdDeath(b, fromGround){
    if (!b.alive) return;
    b.alive = false;

    if (fromGround) {
      b.vy = 0;
    } else {
      b.vy = -120;
    }
    b.vx = 0;
    b.rot = -0.8;

    // play hit sound for this bird
    try {
      Sounds.hit.currentTime = 0;
      const pHit = Sounds.hit.play();
      if (pHit && pHit.catch) pHit.catch(()=>{});
    } catch (e) {}

    // if all birds are now dead, trigger global death sequence
    if (this.birds.every(bb => !bb.alive)) {
      this._allBirdsDead(fromGround);
    }
  },
  _allBirdsDead(fromGround){
    if (this.dying) return;
    this.dying = true;

    if (!fromGround) {
      this.flashTimer = FLASH_DURATION;
    }

    this.deathTimer = 2.0;

    try {
      Sounds.die.currentTime = 0;
      const d = Sounds.die.play();
      if (d && d.catch) d.catch(() => {});
    } catch (e) {}
  },
  update(dt){
    if (this.frozen) return;

    if (this.fadeInTimer > 0) {
      this.fadeInTimer = Math.max(0, this.fadeInTimer - dt);
    }

    if (this.runStartTime) {
      this._recordFrame(performance.now());
    }

    // Title screen animation
    if (!this.started) {
      this.titleTime += dt;
      const amp = 10;
      const freq = 2;

      if (this.birds.length) {
        const centerX = this.width * 0.5;
        const spacing = 22;
        this.birds.forEach((b, i) => {
          const phaseOffset = (i - (this.birds.length - 1) / 2) * 0.25;
          b.x = centerX + (i - (this.birds.length - 1) / 2) * spacing;
          b.y = this.titleBirdBaseY + Math.sin((this.titleTime + phaseOffset) * freq) * amp;
          b.animTime += dt * 1.5;
        });
      }

      if (typeof this.groundOffset === 'number') {
        this.groundOffset += this.speed * dt;
      }
      return;
    }

    if(!this.running && !this.dying) return;

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
    }

    if (this.dying && this.deathTimer > 0) {
      this.deathTimer = Math.max(0, this.deathTimer - dt);
      if (this.deathTimer === 0) {
        this.running = false;
        this.dying = false;
        this.frozen = true;
        this.best = Math.max(this.best, this.score);

        const nowTs = performance.now();
        if (this.runStartTime) {
          this.lastRunDurationSec = Math.max(0, (nowTs - this.runStartTime) / 1000);
        } else {
          this.lastRunDurationSec = 0;
        }

        stopRunRecording();

        try {
          localStorage.setItem('floppy_best', String(this.best));
        } catch (e) {}

        saveScoreRecord(this.score, this.lastRunDurationSec).catch(() => {});

        showGameOver();
        return;
      }
    }

    // bird physics for all birds
    for (const b of this.birds) {
      // apply gravity to all birds so dead ones fall too
      b.vy += GRAVITY * dt;
      b.y += b.vy * dt;

      if (this.dying) {
        b.vx *= 0.98;
      }

      if (!b.alive) {
        // dead birds just keep rotating downwards a bit while falling
        b.rot = clamp(b.rot + dt * 2.5, -0.8, 1.8);
      } else {
        b.rot = clamp(b.vy / 600, -0.8, 1.2);
        b.animTime += dt * 1.5;
      }
    }

    if (!this.dying) {
      this.spawnTimer -= this.speed * dt;
      if(this.spawnTimer <= 0){
        const lastX = this.pipes.length ? this.pipes[this.pipes.length-1].x : this.width;
        this._spawnPipe(lastX + PIPE_SPACING);
        this.spawnTimer = PIPE_SPACING;
      }
    }

    for(const p of this.pipes){
      if (!this.dying) {
        p.x -= this.speed * dt;
      }

      if (!p.passedBy) p.passedBy = {};

      const halfW = PIPE_WIDTH / 2;
      const pipeCenterX = p.x + halfW;

      if (!this.dying) {
        this.birds.forEach((b, idx) => {
          if (!b.alive) return;
          if (b.x > pipeCenterX && !p.passedBy[idx]) {
            p.passedBy[idx] = true;
            b.score = (b.score || 0) + 1;

            try {
              const s = Sounds.point.cloneNode();
              s.currentTime = 0;
              const playPromise = s.play();
              if (playPromise && playPromise.catch) playPromise.catch(()=>{});
            } catch (e) {}
          }
        });
      }
    }

    // keep global score as best bird score
    let maxScore = 0;
    for (const b of this.birds) {
      if (typeof b.score === 'number' && b.score > maxScore) {
        maxScore = b.score;
      }
    }
    this.score = maxScore;

    if (typeof this.groundOffset === 'number') {
      if (!this.dying) {
        this.groundOffset += this.speed * dt;
      }
    }

    this.pipes = this.pipes.filter(p => p.x + PIPE_WIDTH/2 > -50);

    // ground collision per bird
    const groundY = this.height - GROUND_HEIGHT;

    for (const b of this.birds) {
      if (b.y + b.r >= groundY) {
        b.y = groundY - b.r;
        b.vy = 0;
        b.vx = 0;
        // if it was alive, this impact kills it; if already dead, just stop at ground
        if (b.alive) {
          this._handleBirdDeath(b, true);
        }
      }
    }

    // ceiling clamp
    for (const b of this.birds) {
      if (!b.alive) continue;
      if(b.y - b.r < 0){
        b.y = b.r;
        b.vy = 0;
      }
    }

    // pipe collision per bird
    for(const p of this.pipes){
      const halfW = PIPE_WIDTH/2;
      const topH = p.cy - PIPE_GAP/2;
      const bottomY = p.cy + PIPE_GAP/2;
      for (const b of this.birds) {
        if (!b.alive) continue;
        if(rectCircleCollide(p.x-halfW, 0, PIPE_WIDTH, topH, b.x, b.y, b.r) ||
           rectCircleCollide(p.x-halfW, bottomY, PIPE_WIDTH, this.height - bottomY - GROUND_HEIGHT, b.x, b.y, b.r)){
          this._handleBirdDeath(b, false);
        }
      }
    }
  },
  step(now){
    const dt = Math.min(1/30, (now - this.lastTime)/1000 || 0) ;
    this.lastTime = now;
    this.update(dt);
    render();
    requestAnimationFrame((t)=>this.step(t));
  }
};

window.Game = Game;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    resize();
    if (window.Game) window.Game.lastTime = performance.now();
  }
});

function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr){
  const nx = clamp(cx, rx, rx+rw);
  const ny = clamp(cy, ry, ry+rh);
  const dx = nx - cx;
  const dy = ny - cy;
  return (dx*dx + dy*dy) <= cr*cr;
}

/* --- Input handling --- */
function startGame() {
  if (!Game.running && !Game.started) {
    Game.started = true;
    Game.running = true;
    const now = performance.now();
    Game.lastTime = now;
    Game.runStartTime = now;
    Game.runRecord = [];
    Game._recordFrame(now);
    startRunRecording();
    Game.fadeInTimer = FADE_IN_DURATION;
    Game.pipes = [];
    Game._spawnInitialPipes();
    hideTitle();
  }
}

function onPointer(){
  if(!Game.running && !Game.started){
    startGame();
    // touch / click flaps all birds together
    Game.flap();
    return;
  }

  if(!Game.running && Game.started){
    return;
  }

  // during the run, touch / click also flaps all birds together
  Game.flap();
}
canvas.addEventListener('pointerdown', (e) => { 
  e.preventDefault();
  onPointer();
}, { passive: false });

// per-bird keyboard controls (up to 4 players)
// P1: Space, P2: ArrowUp, P3: W, P4: I
const KEY_TO_BIRD = {
  Space: 0,
  ArrowUp: 1,
  KeyW: 2,
  KeyI: 3,
};

window.addEventListener('keydown', (e)=>{
  const code = e.code;

  if (code === 'KeyR') {
    Game.reset();
    return;
  }

  const birdIndex = KEY_TO_BIRD[code];
  if (birdIndex === undefined) return;

  // ignore keys that map to birds beyond current player count
  if (birdIndex >= playerCount) return;

  e.preventDefault();

  if (!Game.running && !Game.started) {
    startGame();
  }

  if (!Game.running && Game.started) {
    // game is in dying / frozen state; ignore flaps
    return;
  }

  Game.flap(birdIndex);
});

/* --- Player count + per-player skin selection --- */

// Helper: update active skin button for a given skin id
function updateSkinButtonsForSkinId(skinId) {
  if (!skinButtons) return;
  skinButtons.forEach(btn => {
    const id = btn.getAttribute('data-skin');
    if (id === skinId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// General skin apply (single-player / skins button)
function applySkin(skinId) {
  const skin = SKINS.find(s => s.id === skinId) || SKINS[0];
  currentSkinId = skin.id;
  try {
    localStorage.setItem('floppy_skin', currentSkinId);
  } catch (e) {}
  // keep button highlights in sync
  updateSkinButtonsForSkinId(currentSkinId);
}

// Overlay flow: let each player choose their skin before the run starts
function startPlayerSkinSelection() {
  if (!skinsOverlay) return;
  // ensure selectedSkins array exists with length playerCount
  selectedSkins = new Array(playerCount).fill(currentSkinId);
  currentSkinSelectionIndex = 0;
  showNextPlayerSkinSelection();
}

function showNextPlayerSkinSelection() {
  if (!skinsOverlay) return;
  if (currentSkinSelectionIndex == null) return;

  if (currentSkinSelectionIndex >= playerCount) {
    // all players picked skins, close overlay and start game
    skinsOverlay.classList.remove('visible');
    currentSkinSelectionIndex = null;
    // reset game with the chosen skins and start
    Game.reset();
    startGame();
    Game.flap();
    return;
  }

  const playerNumber = currentSkinSelectionIndex + 1;
  if (skinsTitleEl) {
    skinsTitleEl.textContent = 'SKIN SHOP';
  }
  if (skinsTextEl) {
    skinsTextEl.textContent = `PLAYER ${playerNumber}: choose your bird`;
  }

  const currentChoice = selectedSkins[currentSkinSelectionIndex] || currentSkinId;
  updateSkinButtonsForSkinId(currentChoice);

  skinsOverlay.classList.add('visible');
}

// Title screen Play button -> open player count selection
if (playBtn) {
  playBtn.addEventListener('click', () => {
    if (!Game.started && playerCountOverlay) {
      playerCountOverlay.classList.add('visible');
    }
  });
}

// Player count buttons -> then per-player skin selection
if (playerCountButtons && playerCountButtons.length) {
  playerCountButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-count');
      const count = Math.max(1, Math.min(4, parseInt(raw, 10) || 1));
      playerCount = count;

      if (playerCountOverlay) {
        playerCountOverlay.classList.remove('visible');
      }

      // After selecting how many players, everyone picks their skin
      startPlayerSkinSelection();
    });
  });
}

if (playerCountOverlay) {
  playerCountOverlay.addEventListener('click', (e) => {
    if (e.target === playerCountOverlay) {
      playerCountOverlay.classList.remove('visible');
    }
  });
}

/* --- Rate / donate overlay --- */
if (rateBtn) {
  rateBtn.addEventListener('click', () => {
    if (rateOverlay) {
      rateOverlay.classList.add('visible');
      if (donateAmountInput) {
        donateAmountInput.focus();
      }
    }
  });
}

if (donateBtn) {
  donateBtn.addEventListener('click', () => {
    if (!donateAmountInput) return;
    const raw = donateAmountInput.value.trim();
    const amount = raw === '' ? 0 : Number(raw);
    console.log('Donate clicked with amount:', amount);
    if (rateOverlay) {
      rateOverlay.classList.remove('visible');
    }
  });
}

if (rateOverlay) {
  rateOverlay.addEventListener('click', (e) => {
    if (e.target === rateOverlay) {
      rateOverlay.classList.remove('visible');
    }
  });
}

/* --- Leaderboard + settings + skins buttons --- */

if (leaderBtn) {
  leaderBtn.addEventListener('click', () => {
    openLeaderboard();
  });
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    if (!settingsOverlay) return;
    if (settingsVolumeInput) {
      settingsVolumeInput.value = Math.round((settings.volume || 0) * 100);
    }
    if (settingsRecordInput) {
      settingsRecordInput.checked = !!settings.recordRuns;
    }
    settingsOverlay.classList.add('visible');
  });
}

// "Skins" button on title allows setting a default single-player skin
if (skinsBtn) {
  skinsBtn.addEventListener('click', () => {
    if (!skinsOverlay) return;
    currentSkinSelectionIndex = null; // not in multi-player selection mode
    if (skinsTitleEl) skinsTitleEl.textContent = 'SKIN SHOP';
    if (skinsTextEl) skinsTextEl.textContent = 'Choose your default bird';
    updateSkinButtonsForSkinId(currentSkinId);
    skinsOverlay.classList.add('visible');
  });
}

if (settingsSaveBtn) {
  settingsSaveBtn.addEventListener('click', () => {
    if (settingsVolumeInput) {
      const raw = Number(settingsVolumeInput.value);
      const vol = isNaN(raw) ? 100 : raw;
      settings.volume = Math.min(1, Math.max(0, vol / 100));
      applySoundVolume();
    }
    if (settingsRecordInput) {
      settings.recordRuns = !!settingsRecordInput.checked;
    }
    saveSettings();
    if (settingsOverlay) {
      settingsOverlay.classList.remove('visible');
    }
  });
}

if (settingsCloseBtn) {
  settingsCloseBtn.addEventListener('click', () => {
    if (settingsOverlay) {
      settingsOverlay.classList.remove('visible');
    }
  });
}

if (skinsCloseBtn) {
  skinsCloseBtn.addEventListener('click', () => {
    if (!skinsOverlay) return;
    skinsOverlay.classList.remove('visible');
    // if we were in per-player selection flow and user closes manually,
    // just cancel that flow (use whatever skins were already chosen/default).
    currentSkinSelectionIndex = null;
  });
}

if (settingsOverlay) {
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
      settingsOverlay.classList.remove('visible');
    }
  });
}

if (skinsOverlay) {
  skinsOverlay.addEventListener('click', (e) => {
    if (e.target === skinsOverlay) {
      skinsOverlay.classList.remove('visible');
      currentSkinSelectionIndex = null;
    }
  });
}

 // Skin buttons: only active during per-player selection flow.
 // When opened from the standalone "Skins" menu (currentSkinSelectionIndex === null),
 // buttons are just for preview and do not change the in-game skin.
if (skinButtons && skinButtons.length) {
  skinButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-skin');
      if (!id) return;

      if (currentSkinSelectionIndex == null) {
        // Not in per-player selection mode; ignore clicks (preview-only).
        return;
      }

      // multi-player selection mode: store skin choice for this player
      selectedSkins[currentSkinSelectionIndex] = id;
      currentSkinSelectionIndex++;
      showNextPlayerSkinSelection();
    });
  });
}

/* --- Game over / share / leaderboard wiring --- */

// Game over screen buttons
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    // keep same playerCount and skins, just reset and start
    Game.reset();
    startGame();
    Game.flap();
  });
}
if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    Game.reset();
  });
}
if (goLeaderBtn) {
  goLeaderBtn.addEventListener('click', () => {
    openLeaderboard();
  });
}

// Share overlay logic
if (shareBtn) {
  shareBtn.addEventListener('click', () => {
    if (!shareOverlay) return;
    if (shareScoreEl) setScoreImages(shareScoreEl, Game.score);
    if (shareBestEl) setScoreImages(shareBestEl, Game.best);

    if (shareVideoEl) {
      if (runVideoUrl) {
        shareVideoEl.src = runVideoUrl;
      }
      try {
        shareVideoEl.play().catch(()=>{});
      } catch (e) {}
    }

    shareOverlay.classList.add('visible');
  });
}

if (shareCloseBtn) {
  shareCloseBtn.addEventListener('click', () => {
    if (shareOverlay) shareOverlay.classList.remove('visible');
  });
}

if (shareOverlay) {
  shareOverlay.addEventListener('click', (e) => {
    if (e.target === shareOverlay) {
      shareOverlay.classList.remove('visible');
    }
  });
}

if (shareCommentBtn) {
  shareCommentBtn.addEventListener('click', async () => {
    if (!window.websim || typeof window.websim.postComment !== 'function') {
      console.log('websim.postComment is not available; cannot share to comments.');
      return;
    }

    let videoUrlText = '';
    try {
      if (runVideoBlob && typeof window.websim.upload === 'function') {
        const uploadedUrl = await window.websim.upload(runVideoBlob);
        if (uploadedUrl) {
          videoUrlText = `Video: ${uploadedUrl}\n\n`;
        }
      }
    } catch (uploadErr) {
      console.log('Failed to upload run video for sharing:', uploadErr);
    }

    const content =
      `Floppy Bird Websim run replay:\n\n` +
      `Score: ${Game.score}\n` +
      `Best: ${Game.best}\n\n` +
      (videoUrlText || '') +
      `Shared from the in-game replay screen.`;

    try {
      const result = await window.websim.postComment({ content });
      if (result && result.error) {
        console.log('Error posting comment:', result.error);
      } else {
        console.log('Run replay shared to comments.');
      }
    } catch (err) {
      console.log('Failed to post comment:', err);
    }
  });
}

/* --- Leaderboard persistence --- */

async function saveScoreRecord(score, durationSec) {
  try {
    const room = await getRoom();
    const safeScore = Math.max(0, Math.floor(score));
    const safeDurationMs = Math.max(0, Math.round(durationSec * 1000));

    const me = room.peers && room.clientId ? room.peers[room.clientId] : null;
    const username = me && me.username ? me.username : null;

    let myRecords = [];
    if (username) {
      const allRecords = room
        .collection('floppy_score_v5')
        .getList() || [];
      myRecords = allRecords.filter((rec) => rec.username === username);
    }

    let bestExisting = null;
    const others = [];

    for (const rec of myRecords) {
      if (!bestExisting) {
        bestExisting = rec;
      } else {
        const sA = typeof rec.score === 'number' ? rec.score : 0;
        const sB = typeof bestExisting.score === 'number' ? bestExisting.score : 0;
        const dA = typeof rec.duration_ms === 'number' ? rec.duration_ms : Number.MAX_SAFE_INTEGER;
        const dB = typeof bestExisting.duration_ms === 'number' ? bestExisting.duration_ms : Number.MAX_SAFE_INTEGER;

        if (sA > sB || (sA === sB && dA < dB)) {
          others.push(bestExisting);
          bestExisting = rec;
        } else {
          others.push(rec);
        }
      }
    }

    if (others.length > 0) {
      const col = room.collection('floppy_score_v5');
      Promise.allSettled(others.map(r => col.delete(r.id))).catch(() => {});
    }

    const collection = room.collection('floppy_score_v5');

    if (!bestExisting) {
      await collection.create({
        username: username || null,
        score: safeScore,
        duration_ms: safeDurationMs,
      });
    } else {
      const existingScore = typeof bestExisting.score === 'number' ? bestExisting.score : 0;

      if (safeScore > existingScore) {
        await collection.update(bestExisting.id, {
          score: safeScore,
          duration_ms: safeDurationMs,
        });
      }
    }
  } catch (err) {
    console.log('Failed to save or update score record:', err);
  }
}

async function openLeaderboard() {
  if (!leaderOverlay) return;
  leaderOverlay.classList.add('visible');
  leaderboardPage = 0;
  leaderboardEntries = [];

  if (leaderYourPosEl) {
    leaderYourPosEl.textContent = 'Loading scores...';
  }
  if (leaderListEl) {
    leaderListEl.innerHTML = '';
  }
  if (leaderPageInfoEl) {
    leaderPageInfoEl.textContent = '';
  }

  if (typeof leaderboardUnsubscribe === 'function') {
    try {
      leaderboardUnsubscribe();
    } catch {
    }
    leaderboardUnsubscribe = null;
  }

  try {
    const room = await getRoom();
    const collection = room.collection('floppy_score_v5');

    leaderboardUnsubscribe = collection.subscribe((rawList) => {
      const raw = rawList || [];
      const sorted = [...raw].sort((a, b) => {
        const sa = typeof a.score === 'number' ? a.score : 0;
        const sb = typeof b.score === 'number' ? b.score : 0;
        if (sb !== sa) return sb - sa;
        const ta = typeof a.duration_ms === 'number' ? a.duration_ms : Number.MAX_SAFE_INTEGER;
        const tb = typeof b.duration_ms === 'number' ? b.duration_ms : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });

      // Deduplicate so each username appears only once, keeping their best run
      const seen = new Set();
      const deduped = [];
      for (const entry of sorted) {
        const key = entry.username || `anon-${entry.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(entry);
        if (deduped.length >= 100) break;
      }

      leaderboardEntries = deduped;
      renderLeaderboard(room);
    });
  } catch (err) {
    console.log('Failed to load leaderboard:', err);
    if (leaderYourPosEl) {
      leaderYourPosEl.textContent = 'Could not load leaderboards.';
    }
  }
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

async function renderLeaderboard(roomInstance) {
  if (!leaderListEl || !leaderPageInfoEl || !leaderYourPosEl) return;

  const total = leaderboardEntries.length;
  if (total === 0) {
    leaderListEl.innerHTML = '';
    leaderYourPosEl.textContent = 'No scores yet. Be the first to play!';
    leaderPageInfoEl.textContent = '';
    return;
  }

  let room = roomInstance;
  if (!room) {
    try {
      room = await getRoom();
    } catch {
      room = null;
    }
  }

  let myUsername = null;
  try {
    if (room && room.peers && room.clientId && room.peers[room.clientId]) {
      myUsername = room.peers[room.clientId].username || null;
    } else if (window.websim && typeof window.websim.getCurrentUser === 'function') {
      const u = await window.websim.getCurrentUser();
      myUsername = u && u.username ? u.username : null;
    }
  } catch {
    myUsername = null;
  }

  let myIndex = -1;
  if (myUsername) {
    myIndex = leaderboardEntries.findIndex((entry) => entry.username === myUsername);
  }

  if (myIndex >= 0) {
    leaderYourPosEl.textContent = `Your position: #${myIndex + 1} of ${total}`;
  } else {
    leaderYourPosEl.textContent = `Your position: not ranked (yet)`;
  }

  const totalPages = Math.max(1, Math.ceil(total / LEADERBOARD_PAGE_SIZE));
  leaderboardPage = Math.min(leaderboardPage, totalPages - 1);
  const start = leaderboardPage * LEADERBOARD_PAGE_SIZE;
  const end = Math.min(total, start + LEADERBOARD_PAGE_SIZE);
  const slice = leaderboardEntries.slice(start, end);

  leaderListEl.innerHTML = slice.map((entry, idx) => {
    const globalPos = start + idx + 1;
    const name = entry.username || 'Anonymous';
    const score = typeof entry.score === 'number' ? entry.score : 0;
    const timeStr = formatDuration(entry.duration_ms);
    const isMe = myUsername && entry.username === myUsername;
    const rowClass = isMe ? 'leader-row-me' : '';
    return `<tr class="${rowClass}">
      <td>${globalPos}</td>
      <td>${name}</td>
      <td>${score}</td>
      <td>${timeStr}</td>
    </tr>`;
  }).join('');

  leaderPageInfoEl.textContent = `Page ${leaderboardPage + 1} / ${totalPages}`;
}

if (leaderOverlay) {
  leaderOverlay.addEventListener('click', (e) => {
    if (e.target === leaderOverlay) {
      leaderOverlay.classList.remove('visible');
    }
  });
}

if (leaderCloseBtn) {
  leaderCloseBtn.addEventListener('click', () => {
    if (leaderOverlay) leaderOverlay.classList.remove('visible');
  });
}

if (leaderPrevBtn) {
  leaderPrevBtn.addEventListener('click', () => {
    if (!leaderOverlay) return;
    if (leaderboardPage > 0) {
      leaderboardPage--;
      renderLeaderboard();
    }
  });
}

if (leaderNextBtn) {
  leaderNextBtn.addEventListener('click', () => {
    if (!leaderOverlay) return;
    const totalPages = Math.max(1, Math.ceil(leaderboardEntries.length / LEADERBOARD_PAGE_SIZE));
    if (leaderboardPage < totalPages - 1) {
      leaderboardPage++;
      renderLeaderboard();
    }
  });
}

/* --- Rendering --- */
function clear(){
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#87ceeb';
  ctx.fillRect(0,0,Game.width,Game.height);
}

function drawGround(){
  const gh = GROUND_HEIGHT;
  const gy = Game.height - gh;

  if (BaseImgReady) {
    const imgW = BaseImg.width;
    const imgH = BaseImg.height;
    const scaleY = gh / imgH;
    const drawW = Math.max(1, Math.round(imgW * scaleY));
    const rawOffset = Game.groundOffset || 0;
    const offset = ((rawOffset % drawW) + drawW) % drawW;

    const needed = Math.ceil(Game.width / drawW) + 2;
    const startXBase = - (offset % drawW);

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    for (let i = 0; i < needed; i++) {
      const dx = Math.round(startXBase + i * drawW);
      ctx.drawImage(BaseImg, dx, Math.round(gy), drawW, gh);
    }

    ctx.imageSmoothingEnabled = prevSmooth;
  } else {
    ctx.fillStyle = '#c6882b';
    ctx.fillRect(0, gy, Game.width, gh);
  }
}

function drawPipes(){
  for(const p of Game.pipes){
    const x = p.x - PIPE_WIDTH/2;
    const topH = p.cy - PIPE_GAP/2;
    const bottomY = p.cy + PIPE_GAP/2;
    const bottomH = Game.height - bottomY - GROUND_HEIGHT;

    if (PipeSpriteReady) {
      const spriteAspect = PipeSprite.height > 0 ? (PipeSprite.height / PipeSprite.width) : 1;
      const capH = PIPE_WIDTH * spriteAspect;

      ctx.fillStyle = '#2c8a2c';
      ctx.strokeStyle = '#216b21';
      ctx.lineWidth = 3;

      const topBodyH = Math.max(0, topH - capH);
      if (topBodyH > 0) {
        ctx.beginPath();
        ctx.rect(x, 0, PIPE_WIDTH, topBodyH);
        ctx.fill();
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(x, topH);
      ctx.scale(1, -1);
      ctx.drawImage(PipeSprite, 0, 0, PIPE_WIDTH, capH);
      ctx.restore();

      ctx.drawImage(PipeSprite, x, bottomY, PIPE_WIDTH, capH);

      const bottomBodyH = Math.max(0, bottomH - capH);
      if (bottomBodyH > 0) {
        ctx.beginPath();
        ctx.rect(x, bottomY + capH, PIPE_WIDTH, bottomBodyH);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#2c8a2c';
      ctx.strokeStyle = '#216b21';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(x, 0, PIPE_WIDTH, topH);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(x, bottomY, PIPE_WIDTH, bottomH);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawBird(b){
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);

  const sprites = SkinSprites[b.skinId] || SkinSprites[currentSkinId] || null;
  let frameImg = null;
  if (sprites && sprites.ready) {
    const t = (b.animTime !== undefined) ? b.animTime : 0;
    let phase;
    if (t < 1) {
      phase = t;
    } else {
      phase = (t - 1) % 1;
    }

    if (phase < 0.33) {
      frameImg = sprites.up;
    } else if (phase < 0.66) {
      frameImg = sprites.mid;
    } else {
      frameImg = sprites.down;
    }
  }

  const size = Math.max(1, b.r * 2);
  const drawW = size * 1.35;
  const drawH = size;
  if (frameImg) {
    ctx.drawImage(frameImg, -drawW/2, -drawH/2, drawW, drawH);
  } else {
    ctx.fillStyle = '#ffdf4a';
    ctx.fillRect(-size/2, -size/2, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-size/2, -size/2, size, size);
  }

  ctx.restore();
}

function drawBackground(){
  if (!BackgroundImgReady) return;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  const imgW = BackgroundImg.width / DPR;
  const imgH = BackgroundImg.height / DPR;

  const scale = Game.height / imgH;
  const drawW = Math.max(1, Math.round(imgW * scale));
  const drawH = Math.max(1, Math.round(imgH * scale));

  const needed = Math.ceil(Game.width / drawW) + 2;

  const totalW = needed * drawW;
  const startX = Math.round((Game.width - totalW) / 2);

  for (let i = 0; i < needed; i++) {
    const dx = Math.round(startX + i * drawW);
    ctx.drawImage(BackgroundImg, dx, 0, drawW, drawH);
  }

  ctx.imageSmoothingEnabled = prevSmooth;
}

function drawScoreHud(){
  if (!DigitSprites.ready) return;
  if (!Game.started) return;

  const digitW = 14;
  const digitH = 20;

  ctx.save();
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  Game.birds.forEach((b) => {
    const scoreVal = typeof b.score === 'number' ? b.score : 0;
    const s = String(Math.max(0, Math.floor(scoreVal)));
    if (!s.length) return;

    const totalW = s.length * digitW;
    const x0 = Math.round(b.x - totalW / 2);
    const y = Math.round(b.y - b.r - 26);

    for (let i = 0; i < s.length; i++) {
      const d = parseInt(s[i], 10);
      if (Number.isNaN(d)) continue;
      const img = DigitSprites.imgs[d];
      if (!img) continue;
      ctx.drawImage(img, x0 + i * digitW, y, digitW, digitH);
    }
  });

  ctx.imageSmoothingEnabled = prevSmooth;
  ctx.restore();
}

function render(){
  clear();
  drawBackground();
  drawPipes();
  drawGround();
  for (const b of Game.birds) {
    drawBird(b);
  }
  drawScoreHud();

  if (Game.flashTimer > 0) {
    const alpha = clamp(Game.flashTimer / FLASH_DURATION, 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(0, 0, Game.width, Game.height);
  }

  if (Game.fadeInTimer > 0) {
    const alpha = clamp(Game.fadeInTimer / FADE_IN_DURATION, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, Game.width, Game.height);
  }

  if(!Game.running){
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';

    if(!Game.started){
      if(Game.best > 0){
        ctx.font = '500 14px system-ui, -apple-system, Roboto, Arial';
        ctx.fillText(`Best ${Game.best}`, Game.width/2, Game.height*0.20);
      }
    }
  }
}

function showTitle(){
  if (titleScreen) titleScreen.style.display = 'flex';
  if (scoreEl) scoreEl.style.display = 'none';
}
function hideTitle(){
  if (titleScreen) titleScreen.style.display = 'none';
  if (scoreEl) scoreEl.style.display = 'none';
}

function showGameOver(){
  if (!gameOverScreen) return;
  gameOverScreen.classList.remove('visible');
  gameOverScreen.offsetHeight;
  gameOverScreen.classList.add('visible');

  if (scoreEl) scoreEl.style.display = 'none';
  if (goScoreEl) setScoreImages(goScoreEl, Game.score);
  if (goBestEl) setScoreImages(goBestEl, Game.best);
}

function hideGameOver(){
  if (!gameOverScreen) return;
  gameOverScreen.classList.remove('visible');
}

/* --- Start --- */
Game.reset();
Game.step(performance.now());