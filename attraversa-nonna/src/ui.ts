import { DESTINATIONS } from './levels';
import { t } from './i18n';
import { OUTFITS } from './outfits';
import type { Outfit } from './outfits';
import { drawNonna } from './render/characters';
import { MAX_HEARTS } from './sim';
import type { Sim } from './sim';
import type { Save } from './storage';

// ------------------------------------------------------------ icone

const STAR_PATH = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z';
const star = (on: boolean) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" fill="${on ? '#f7c948' : '#e2dbe8'}" stroke="#2d2a3e" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const heart = (on: boolean) =>
  `<svg viewBox="0 0 24 22" aria-hidden="true"${on ? '' : ' class="lost"'}><path d="M12 20.5S2 14.2 2 7.6A5 5 0 0 1 12 5a5 5 0 0 1 10 2.6c0 6.6-10 12.9-10 12.9z" fill="${on ? '#e84a4a' : '#d9d4df'}" stroke="#2d2a3e" stroke-width="2" stroke-linejoin="round"/></svg>`;
const candy =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 1.5 8.5v7zM19 12l3.5-3.5v7z" fill="#f28bb6" stroke="#2d2a3e" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="12" cy="12" rx="7" ry="5.5" fill="#e84a8a" stroke="#2d2a3e" stroke-width="1.8"/><path d="M9.5 7.5l2 9M13.5 7l2 9" stroke="#fff" stroke-width="1.5"/></svg>';
const clock =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8.5" fill="#fff" stroke="#2d2a3e" stroke-width="2"/><path d="M12 8.5V13l3 2" fill="none" stroke="#2d2a3e" stroke-width="2" stroke-linecap="round"/><path d="M9.5 2.5h5" stroke="#2d2a3e" stroke-width="2" stroke-linecap="round"/></svg>';
const lock =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
const gear =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6a8 8 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.8a8 8 0 0 1 0 2.2l2 1.8-1.7 2.9-2.5-.9a8 8 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a8 8 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.8a8 8 0 0 1 0-2.2l-2-1.8 1.7-2.9 2.5.9a8 8 0 0 1 1.9-1.1zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
const back =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 7 12l8 8" fill="none" stroke="#2d2a3e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const play =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="#fff" stroke="#2d2a3e" stroke-width="2" stroke-linejoin="round"/></svg>';
const finger =
  '<svg class="finger" viewBox="0 0 32 32" aria-hidden="true"><path d="M12 17V6.5a2.5 2.5 0 0 1 5 0V14l6.2 1.3a3 3 0 0 1 2.3 3.4l-1.2 7A3 3 0 0 1 21.3 28h-6.6a3 3 0 0 1-2.4-1.2L7 19.8a2.3 2.3 0 0 1 3.4-3z" fill="#f6d2b8" stroke="#2d2a3e" stroke-width="2" stroke-linejoin="round"/></svg>';
const swipe =
  '<svg class="finger" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 16h26M3 16l5-5M3 16l5 5M29 16l-5-5M29 16l-5 5" fill="none" stroke="#2d2a3e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Controller {
  save: Save;
  play(): void;
  startLevel(n: number): void;
  openTitle(): void;
  openLevels(): void;
  openWardrobe(): void;
  openSettings(from: 'title' | 'pause'): void;
  openInfo(kind: 'privacy' | 'credits'): void;
  pause(): void;
  resume(): void;
  restart(): void;
  next(): void;
  toMenu(): void;
  buy(id: string): void;
  equip(id: string): void;
  setOption(key: 'music' | 'sfx' | 'haptics', on: boolean): void;
  resetProgress(): void;
  sfx(name: 'click' | 'star'): void;
}

export interface ResultData {
  won: boolean;
  level: number;
  stars: number;
  hits: number;
  time: number;
  par: number;
  candies: number;
  candiesTotal: number;
}

export function destPhrase(n: number) {
  const d = DESTINATIONS[(n - 1) % DESTINATIONS.length];
  return t.destinations[d];
}

export class UI {
  private layer = document.getElementById('layer')!;
  private hud = document.getElementById('hud')!;
  private el = {
    level: document.getElementById('hud-level')!,
    dest: document.getElementById('hud-dest')!,
    hearts: document.getElementById('hud-hearts')!,
    candies: document.getElementById('hud-candies')!,
    time: document.getElementById('hud-time')!,
    umbrella: document.getElementById('btn-umbrella')!,
    umbrellaCount: document.getElementById('umbrella-count')!,
    coffee: document.getElementById('hud-coffee')!,
    coffeeBar: document.querySelector<HTMLElement>('#hud-coffee span')!,
    hint: document.getElementById('hint')!,
    banner: document.getElementById('banner')!,
  };
  private cache = { hearts: -1, candies: '', time: '', late: false, umbrellas: -1, coffee: -1 };
  private bannerTimer = 0;
  private resetArmed = false;

  constructor(private readonly c: Controller) {
    this.layer.addEventListener('click', (e) => this.onClick(e));
    document.getElementById('btn-pause')!.setAttribute('aria-label', t.paused);
  }

  // ------------------------------------------------------------ HUD

  showHud(on: boolean) {
    this.hud.hidden = !on;
  }

  setLevel(n: number, sim: Sim) {
    this.el.level.textContent = t.level(n);
    this.el.dest.textContent = t.goingTo(destPhrase(n)[1]);
    this.cache = { hearts: -1, candies: '', time: '', late: false, umbrellas: -1, coffee: -1 };
    this.el.umbrella.hidden = n === 1;
    this.el.umbrella.classList.remove('pulse');
    this.updateHud(sim);
  }

  updateHud(sim: Sim) {
    const p = sim.player;
    if (p.hearts !== this.cache.hearts) {
      this.cache.hearts = p.hearts;
      let html = '';
      for (let i = 0; i < MAX_HEARTS; i++) html += heart(i < p.hearts);
      this.el.hearts.innerHTML = html;
    }
    const cand = `${sim.candies}/${sim.candiesTotal}`;
    if (cand !== this.cache.candies) {
      this.cache.candies = cand;
      this.el.candies.innerHTML = `${candy}${cand}`;
    }
    const secs = Math.floor(sim.elapsed);
    const time = `${secs}s`;
    const late = sim.elapsed > sim.level.parTime;
    if (time !== this.cache.time || late !== this.cache.late) {
      this.cache.time = time;
      this.cache.late = late;
      this.el.time.innerHTML = `${clock}${time}`;
      this.el.time.classList.toggle('late', late);
      this.el.time.classList.toggle('ontime', !late && sim.started);
    }
    if (p.umbrellas !== this.cache.umbrellas) {
      this.cache.umbrellas = p.umbrellas;
      this.el.umbrellaCount.textContent = String(p.umbrellas);
      this.el.umbrella.classList.toggle('empty', p.umbrellas <= 0);
    }
    const coffee = p.coffeeT > 0 ? Math.round((p.coffeeT / 7) * 50) / 50 : 0;
    if (coffee !== this.cache.coffee) {
      this.cache.coffee = coffee;
      this.el.coffee.hidden = coffee <= 0;
      this.el.coffeeBar.style.transform = `scaleX(${coffee})`;
    }
  }

  pulseUmbrella(on: boolean) {
    this.el.umbrella.classList.toggle('pulse', on);
  }

  showHint(kind: 'tap' | 'swipe' | 'umbrella' | null) {
    if (!kind) {
      this.el.hint.hidden = true;
      return;
    }
    const icon = kind === 'swipe' ? swipe : kind === 'tap' ? finger : '';
    this.el.hint.innerHTML = `${icon}<span>${esc(t.hints[kind])}</span>`;
    this.el.hint.hidden = false;
  }

  showBanner(n: number, hint: string | null) {
    window.clearTimeout(this.bannerTimer);
    const b = this.el.banner;
    b.classList.remove('out');
    b.innerHTML = `<b>${esc(t.level(n))}</b><span>${esc(t.goingTo(destPhrase(n)[1]))}</span>${hint ? `<em>${esc(hint)}</em>` : ''}`;
    b.hidden = false;
    this.bannerTimer = window.setTimeout(() => this.hideBanner(), hint ? 3600 : 2200);
  }

  hideBanner() {
    const b = this.el.banner;
    if (b.hidden || b.classList.contains('out')) return;
    window.clearTimeout(this.bannerTimer);
    b.classList.add('out');
    this.bannerTimer = window.setTimeout(() => (b.hidden = true), 350);
  }

  // ------------------------------------------------------------ schermate

  clear() {
    this.layer.innerHTML = '';
    this.resetArmed = false;
  }

  private mount(html: string): HTMLElement {
    this.layer.innerHTML = html;
    return this.layer.firstElementChild as HTMLElement;
  }

  private wallet() {
    return `<span class="wallet" aria-label="${esc(t.statCandies)}">${candy}${this.c.save.candies}</span>`;
  }

  showTitle() {
    const s = this.c.save;
    const title = esc(t.title).replace(',', '<span class="comma">,</span>');
    this.mount(`
      <section class="screen title-screen">
        <div class="corner left">${this.wallet()}</div>
        <div class="corner right"><button class="round-btn" data-action="settings" aria-label="${esc(t.settings)}">${gear}</button></div>
        <div>
          <h1 class="logo">${title}</h1>
          <p class="tagline">${esc(t.subtitle)}</p>
        </div>
        <div class="menu-stack">
          <button class="btn primary" data-action="play">${play}<span>${esc(t.play)}</span><span class="sub">· ${esc(t.continueLevel(s.unlocked))}</span></button>
          <div class="menu-row">
            <button class="btn" data-action="levels">${esc(t.levels)}</button>
            <button class="btn" data-action="wardrobe">${esc(t.wardrobe)}</button>
          </div>
        </div>
      </section>`);
  }

  showLevels() {
    const s = this.c.save;
    const shown = Math.max(24, Math.ceil((s.unlocked + 8) / 4) * 4);
    let grid = '';
    for (let n = 1; n <= shown; n++) {
      const stars = s.stars[n] ?? 0;
      const locked = n > s.unlocked;
      const cls = locked ? '' : n === s.unlocked ? 'current' : stars ? 'done' : '';
      const mini = locked
        ? `<span class="lock">${lock}</span>`
        : `<span class="mini-stars">${star(stars >= 1)}${star(stars >= 2)}${star(stars >= 3)}</span>`;
      grid += `<button class="level-btn ${cls}" data-action="level" data-n="${n}" ${locked ? 'disabled aria-label="' + esc(t.locked) + '"' : `aria-label="${esc(t.level(n))}"`}>${n}${mini}</button>`;
    }
    const totalStars = Object.values(s.stars).reduce((a, b) => a + b, 0);
    this.mount(`
      <section class="screen dim">
        <div class="panel" style="max-height:100%">
          <div class="panel-head">
            <button class="round-btn" data-action="title" aria-label="${esc(t.back)}">${back}</button>
            <h2>${esc(t.levels)}</h2>
            <span class="wallet">${star(true)}${totalStars}</span>
          </div>
          <div class="scroll"><div class="level-grid">${grid}</div></div>
        </div>
      </section>`);
    const cur = this.layer.querySelector('.level-btn.current');
    cur?.scrollIntoView({ block: 'center' });
  }

  showWardrobe() {
    const s = this.c.save;
    const cards = OUTFITS.map((o) => {
      const owned = s.owned.includes(o.id);
      const worn = s.outfit === o.id;
      let action: string;
      if (worn) action = `<button class="btn small go" disabled>${esc(t.equipped)}</button>`;
      else if (owned) action = `<button class="btn small" data-action="equip" data-id="${o.id}">${esc(t.equip)}</button>`;
      else
        action = `<button class="btn small" data-action="buy" data-id="${o.id}" ${s.candies < o.price ? 'disabled' : ''}>${candy}${o.price}</button>`;
      return `<div class="outfit ${worn ? 'worn' : ''}"><canvas data-outfit="${o.id}" width="220" height="220"></canvas><span class="name">${esc(t.outfits[o.id])}</span>${action}</div>`;
    }).join('');
    this.mount(`
      <section class="screen dim">
        <div class="panel" style="max-height:100%">
          <div class="panel-head">
            <button class="round-btn" data-action="title" aria-label="${esc(t.back)}">${back}</button>
            <h2>${esc(t.wardrobe)}</h2>
            ${this.wallet()}
          </div>
          <p>${esc(t.candiesHint)}</p>
          <div class="scroll"><div class="outfit-grid">${cards}</div></div>
        </div>
      </section>`);
    this.layer.querySelectorAll<HTMLCanvasElement>('canvas[data-outfit]').forEach((cv) => {
      const o = OUTFITS.find((x) => x.id === cv.dataset.outfit)!;
      paintPortrait(cv, o, s.owned.includes(o.id));
    });
  }

  showSettings(from: 'title' | 'pause') {
    const s = this.c.save;
    const toggle = (key: 'music' | 'sfx' | 'haptics', label: string) =>
      `<button class="toggle" role="switch" aria-checked="${s[key]}" data-action="toggle" data-key="${key}"><span>${esc(label)}</span><span class="switch"></span></button>`;
    this.mount(`
      <section class="screen dim">
        <div class="panel">
          <div class="panel-head">
            <button class="round-btn" data-action="${from === 'pause' ? 'pause' : 'title'}" aria-label="${esc(t.back)}">${back}</button>
            <h2>${esc(t.settings)}</h2>
          </div>
          ${toggle('music', t.music)}
          ${toggle('sfx', t.sounds)}
          ${toggle('haptics', t.haptics)}
          <div class="menu-row">
            <button class="btn small" data-action="privacy">${esc(t.privacy)}</button>
            <button class="btn small" data-action="credits">${esc(t.credits)}</button>
          </div>
          ${from === 'title' ? `<button class="link-btn danger" data-action="reset">${esc(t.resetProgress)}</button>` : ''}
        </div>
      </section>`);
  }

  showInfo(kind: 'privacy' | 'credits', backTo: 'title' | 'pause') {
    const paras = (kind === 'privacy' ? t.privacyText : t.creditsText).map((p) => `<p class="text">${esc(p)}</p>`).join('');
    this.mount(`
      <section class="screen dim">
        <div class="panel">
          <div class="panel-head">
            <button class="round-btn" data-action="settings-${backTo}" aria-label="${esc(t.back)}">${back}</button>
            <h2>${esc(kind === 'privacy' ? t.privacy : t.credits)}</h2>
          </div>
          <div class="scroll">${paras}</div>
        </div>
      </section>`);
  }

  showPause() {
    this.mount(`
      <section class="screen dim">
        <div class="panel">
          <h2>${esc(t.paused)}</h2>
          <button class="btn primary" data-action="resume">${play}${esc(t.resume)}</button>
          <div class="menu-row">
            <button class="btn" data-action="restart">${esc(t.restart)}</button>
            <button class="btn" data-action="menu">${esc(t.menu)}</button>
          </div>
          <button class="btn small" data-action="settings-pause">${gear.replace('<svg', '<svg style="fill:#2d2a3e"')}${esc(t.settings)}</button>
        </div>
      </section>`);
  }

  showResult(r: ResultData) {
    if (!r.won) {
      this.mount(`
        <section class="screen dim">
          <div class="panel">
            <h2>${esc(t.loseTitle)}</h2>
            <p>${esc(t.loseText)}</p>
            <button class="btn primary" data-action="restart">${esc(t.retry)}</button>
            <button class="btn" data-action="menu">${esc(t.menu)}</button>
          </div>
        </section>`);
      return;
    }
    const title = t.winTitle[Math.floor(Math.random() * t.winTitle.length)];
    const slot = (on: boolean, label: string, i: number) =>
      `<div class="star-slot ${on ? 'on' : ''}" style="--i:${i}">${star(false)}<span>${esc(label)}</span></div>`;
    const earned = [true, r.hits === 0, r.time <= r.par];
    this.mount(`
      <section class="screen dim">
        <div class="panel">
          <h2>${esc(title)}</h2>
          <div class="stars">
            ${slot(earned[0], t.starDone, 0)}
            ${slot(earned[1], t.starNoHit, 1)}
            ${slot(earned[2], t.starTime(r.par), 2)}
          </div>
          <div class="stats">
            <div class="stat"><small>${esc(t.statTime)}</small><strong>${r.time.toFixed(1)} s</strong></div>
            <div class="stat"><small>${esc(t.statCandies)}</small><strong>${r.candies}/${r.candiesTotal}</strong></div>
          </div>
          <button class="btn primary go" data-action="next">${esc(t.next)}${play}</button>
          <div class="menu-row">
            <button class="btn small" data-action="restart">${esc(t.replay)}</button>
            <button class="btn small" data-action="menu">${esc(t.menu)}</button>
          </div>
        </div>
      </section>`);
    // le stelle si accendono una alla volta
    const slots = this.layer.querySelectorAll<HTMLElement>('.star-slot');
    earned.forEach((on, i) => {
      if (!on) return;
      window.setTimeout(() => {
        const el = slots[i];
        if (!el?.isConnected) return;
        el.querySelector('svg')!.outerHTML = star(true);
        this.c.sfx('star');
      }, 350 + i * 330);
    });
  }

  private onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const a = btn.dataset.action!;
    if (a !== 'reset') this.c.sfx('click');
    switch (a) {
      case 'play':
        return this.c.play();
      case 'levels':
        return this.c.openLevels();
      case 'wardrobe':
        return this.c.openWardrobe();
      case 'settings':
      case 'settings-title':
        return this.c.openSettings('title');
      case 'settings-pause':
        return this.c.openSettings('pause');
      case 'title':
        return this.c.openTitle();
      case 'level':
        return this.c.startLevel(Number(btn.dataset.n));
      case 'equip':
        return this.c.equip(btn.dataset.id!);
      case 'buy':
        return this.c.buy(btn.dataset.id!);
      case 'toggle': {
        const key = btn.dataset.key as 'music' | 'sfx' | 'haptics';
        const on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(on));
        return this.c.setOption(key, on);
      }
      case 'privacy':
      case 'credits':
        return this.c.openInfo(a);
      case 'reset':
        // conferma dentro la pagina: niente window.confirm
        if (!this.resetArmed) {
          this.resetArmed = true;
          btn.classList.remove('link-btn', 'danger');
          btn.classList.add('btn', 'small', 'confirm');
          btn.textContent = t.resetConfirm;
          this.c.sfx('click');
          return;
        }
        return this.c.resetProgress();
      case 'pause':
        return this.c.pause();
      case 'resume':
        return this.c.resume();
      case 'restart':
        return this.c.restart();
      case 'next':
        return this.c.next();
      case 'menu':
        return this.c.toMenu();
    }
  }
}

/** Ritratto della nonna per il guardaroba (e per l'icona dell'app). */
export function paintPortrait(cv: HTMLCanvasElement, o: Outfit, owned: boolean) {
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  const s = cv.width * 0.78;
  ctx.translate(cv.width / 2, cv.height * 0.93);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(30,25,50,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.26, 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!owned) ctx.globalAlpha = 0.55;
  drawNonna(ctx, o, 0, 'idle', 0, false);
  ctx.restore();
}

