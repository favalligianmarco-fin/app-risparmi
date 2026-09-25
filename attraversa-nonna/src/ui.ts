import { t } from './i18n';
import { NONNE } from './nonne';
import type { Nonna } from './nonne';
import { drawNonna } from './render/characters';
import { MAX_HEARTS } from './sim';
import type { OverCause, Sim } from './sim';
import type { Save } from './storage';

// ------------------------------------------------------------ icone

const heart = (on: boolean) =>
  `<svg viewBox="0 0 24 22" aria-hidden="true"${on ? '' : ' class="lost"'}><path d="M12 20.5S2 14.2 2 7.6A5 5 0 0 1 12 5a5 5 0 0 1 10 2.6c0 6.6-10 12.9-10 12.9z" fill="${on ? '#e84a4a' : '#d9d4df'}" stroke="#2d2a3e" stroke-width="2" stroke-linejoin="round"/></svg>`;
const candy =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 1.5 8.5v7zM19 12l3.5-3.5v7z" fill="#f28bb6" stroke="#2d2a3e" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="12" cy="12" rx="7" ry="5.5" fill="#e84a8a" stroke="#2d2a3e" stroke-width="1.8"/><path d="M9.5 7.5l2 9M13.5 7l2 9" stroke="#fff" stroke-width="1.5"/></svg>';
const trophy =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#f7c948" stroke="#2d2a3e" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 5H3.5v1.5A3.5 3.5 0 0 0 7 10M17 5h3.5v1.5A3.5 3.5 0 0 1 17 10" fill="none" stroke="#2d2a3e" stroke-width="1.8"/><path d="M10 13h4v3h2.5v4h-9v-4H10z" fill="#f7c948" stroke="#2d2a3e" stroke-width="1.8" stroke-linejoin="round"/></svg>';
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

export type HintKind = 'tap' | 'swipe' | 'slipper' | 'storm';

export interface Controller {
  save: Save;
  play(): void;
  openTitle(): void;
  openNonne(): void;
  openSettings(from: 'title' | 'pause'): void;
  openInfo(kind: 'privacy' | 'credits'): void;
  pause(): void;
  resume(): void;
  restart(): void;
  toMenu(): void;
  buy(id: string): void;
  choose(id: string): void;
  listen(id: string): string;
  setOption(key: 'music' | 'sfx' | 'haptics', on: boolean): void;
  resetProgress(): void;
  sfx(name: 'click'): void;
}

export interface OverData {
  cause: OverCause;
  meters: number;
  best: number;
  newBest: boolean;
  candies: number;
  stops: number;
}

export class UI {
  private layer = document.getElementById('layer')!;
  private hud = document.getElementById('hud')!;
  private el = {
    meters: document.getElementById('hud-meters')!,
    best: document.getElementById('hud-best')!,
    hearts: document.getElementById('hud-hearts')!,
    candies: document.getElementById('hud-candies')!,
    slipper: document.getElementById('btn-slipper')!,
    slipperCount: document.getElementById('slipper-count')!,
    coffee: document.getElementById('hud-coffee')!,
    coffeeBar: document.querySelector<HTMLElement>('#hud-coffee span')!,
    hint: document.getElementById('hint')!,
  };
  private cache = { hearts: -1, candies: -1, meters: -1, slippers: -1, coffee: -1, beaten: false };
  private resetArmed = false;

  constructor(private readonly c: Controller) {
    this.layer.addEventListener('click', (e) => this.onClick(e));
    document.getElementById('btn-pause')!.setAttribute('aria-label', t.paused);
    this.el.slipper.setAttribute('aria-label', t.slipper);
  }

  // ------------------------------------------------------------ HUD

  showHud(on: boolean) {
    this.hud.hidden = !on;
  }

  resetHud(sim: Sim) {
    this.cache = { hearts: -1, candies: -1, meters: -1, slippers: -1, coffee: -1, beaten: false };
    this.el.best.textContent = this.c.save.best > 0 ? t.best(this.c.save.best) : '';
    this.el.meters.classList.remove('beaten');
    this.el.slipper.classList.remove('pulse');
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
    if (sim.candies !== this.cache.candies) {
      this.cache.candies = sim.candies;
      this.el.candies.innerHTML = `${candy}${sim.candies}`;
    }
    if (sim.meters !== this.cache.meters) {
      this.cache.meters = sim.meters;
      this.el.meters.textContent = `${sim.meters} m`;
      const beaten = this.c.save.best > 0 && sim.meters > this.c.save.best;
      if (beaten !== this.cache.beaten) {
        this.cache.beaten = beaten;
        this.el.meters.classList.toggle('beaten', beaten);
        this.el.best.textContent = beaten ? t.newBest : t.best(this.c.save.best);
      }
    }
    if (p.slippers !== this.cache.slippers) {
      this.cache.slippers = p.slippers;
      this.el.slipperCount.textContent = String(p.slippers);
      this.el.slipper.classList.toggle('empty', p.slippers <= 0);
    }
    const coffee = p.coffeeT > 0 ? Math.round((p.coffeeT / 7) * 50) / 50 : 0;
    if (coffee !== this.cache.coffee) {
      this.cache.coffee = coffee;
      this.el.coffee.hidden = coffee <= 0;
      this.el.coffeeBar.style.transform = `scaleX(${coffee})`;
    }
  }

  pulseSlipper(on: boolean) {
    this.el.slipper.classList.toggle('pulse', on);
  }

  showHint(kind: HintKind | null) {
    if (!kind) {
      this.el.hint.hidden = true;
      return;
    }
    const icon = kind === 'swipe' ? swipe : kind === 'tap' ? finger : '';
    this.el.hint.innerHTML = `${icon}<span>${esc(t.hints[kind])}</span>`;
    this.el.hint.classList.toggle('warn', kind === 'storm');
    this.el.hint.hidden = false;
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
          ${s.best > 0 ? `<div class="record">${trophy}<span>${esc(t.best(s.best))}</span></div>` : ''}
          <button class="btn primary" data-action="play">${play}<span>${esc(t.play)}</span></button>
          <button class="btn" data-action="nonne">${esc(t.nonne)}</button>
        </div>
      </section>`);
  }

  showNonne() {
    const s = this.c.save;
    const cards = NONNE.map((n) => this.nonnaCard(n, s)).join('');
    this.mount(`
      <section class="screen dim">
        <div class="panel wide" style="max-height:100%">
          <div class="panel-head">
            <button class="round-btn" data-action="title" aria-label="${esc(t.back)}">${back}</button>
            <h2>${esc(t.nonneTitle)}</h2>
            ${this.wallet()}
          </div>
          <p>${esc(t.nonneHint)}</p>
          <div class="scroll"><div class="nonna-grid">${cards}</div></div>
        </div>
      </section>`);
    this.layer.querySelectorAll<HTMLCanvasElement>('canvas[data-nonna]').forEach((cv) => {
      const n = NONNE.find((x) => x.id === cv.dataset.nonna)!;
      paintPortrait(cv, n, s.owned.includes(n.id));
    });
    this.layer.querySelector('.nonna.chosen')?.scrollIntoView({ block: 'nearest' });
  }

  private nonnaCard(n: Nonna, s: Save) {
    const owned = s.owned.includes(n.id);
    const chosen = s.nonna === n.id;
    let action: string;
    if (chosen) action = `<button class="btn small go" disabled>${esc(t.chosen)}</button>`;
    else if (owned) action = `<button class="btn small" data-action="choose" data-id="${n.id}">${esc(t.choose)}</button>`;
    else action = `<button class="btn small" data-action="buy" data-id="${n.id}" ${s.candies < n.price ? 'disabled' : ''}>${candy}${n.price}</button>`;
    return `
      <div class="nonna ${chosen ? 'chosen' : ''}">
        <button class="portrait" data-action="listen" data-id="${n.id}" aria-label="${esc(n.name)}">
          <canvas data-nonna="${n.id}" width="220" height="220"></canvas>
          <span class="said" data-said="${n.id}" hidden></span>
        </button>
        <span class="name">${esc(n.name)}</span>
        <span class="region">${esc(n.region)}</span>
        ${action}
      </div>`;
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

  showOver(d: OverData) {
    this.mount(`
      <section class="screen dim">
        <div class="panel">
          <h2>${esc(t.overTitle[d.cause])}</h2>
          <p>${esc(t.overText[d.cause])}</p>
          <div class="distance ${d.newBest ? 'best' : ''}">
            <strong>${d.meters}</strong><span>${esc(t.meters)}</span>
            ${d.newBest ? `<em>${trophy}${esc(t.newBest)}</em>` : `<em class="muted">${esc(t.best(d.best))}</em>`}
          </div>
          <div class="stats">
            <div class="stat"><small>${esc(t.statCandies)}</small><strong>${d.candies}</strong></div>
            <div class="stat"><small>${esc(t.statStops)}</small><strong>${d.stops}</strong></div>
          </div>
          <button class="btn primary go" data-action="restart">${play}${esc(t.retry)}</button>
          <div class="menu-row">
            <button class="btn small" data-action="nonne">${esc(t.nonne)}</button>
            <button class="btn small" data-action="menu">${esc(t.menu)}</button>
          </div>
        </div>
      </section>`);
  }

  private onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const a = btn.dataset.action!;
    if (a !== 'reset' && a !== 'listen') this.c.sfx('click');
    switch (a) {
      case 'play':
        return this.c.play();
      case 'nonne':
        return this.c.openNonne();
      case 'settings':
      case 'settings-title':
        return this.c.openSettings('title');
      case 'settings-pause':
        return this.c.openSettings('pause');
      case 'title':
        return this.c.openTitle();
      case 'choose':
        return this.c.choose(btn.dataset.id!);
      case 'buy':
        return this.c.buy(btn.dataset.id!);
      case 'listen': {
        const id = btn.dataset.id!;
        const said = this.layer.querySelector<HTMLElement>(`[data-said="${id}"]`);
        this.layer.querySelectorAll<HTMLElement>('.said').forEach((el) => (el.hidden = true));
        if (said) {
          said.textContent = this.c.listen(id);
          said.hidden = false;
          said.classList.remove('pop');
          void said.offsetWidth;
          said.classList.add('pop');
        }
        return;
      }
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
      case 'menu':
        return this.c.toMenu();
    }
  }
}

/** Ritratto della nonna per la galleria delle nonne. */
export function paintPortrait(cv: HTMLCanvasElement, n: Nonna, owned: boolean) {
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  const s = cv.width * 0.8;
  ctx.translate(cv.width / 2, cv.height * 0.95);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(30,25,50,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.26, 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!owned) ctx.globalAlpha = 0.5;
  drawNonna(ctx, n.look, 0, 'idle', 0.3, false);
  ctx.restore();
}
