import { lang, t } from '../i18n';
import type { StopKind } from '../world';
import { Ago } from './ago';
import type { MiniEnv, MiniGame } from './common';
import { Poste } from './poste';
import { Pranzo } from './pranzo';
import { Tiramisu } from './tiramisu';

export interface MiniResult {
  success: boolean;
  time: number;
  reward: number;
}

function create(kind: StopKind, env: MiniEnv): MiniGame {
  switch (kind) {
    case 'tiramisu':
      return new Tiramisu(env, t.mg.tiramisu);
    case 'poste':
      return new Poste(env, t.mg.poste);
    case 'ago':
      return new Ago(env, t.mg.ago);
    case 'pranzo':
      return new Pranzo(env, t.mg.pranzo);
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Mostra il minigioco di una sosta a tutto schermo: presentazione, gioco a tempo,
 * risultato. Si risolve quando il giocatore preme "Avanti".
 */
export function runMinigame(kind: StopKind, env: MiniEnv, host: HTMLElement): Promise<MiniResult> {
  const info = t.mg[kind];
  const root = document.createElement('div');
  root.className = 'mg';
  root.innerHTML = `
    <div class="mg-head">
      <span class="mg-place">${esc(info.place)}</span>
      <div class="mg-timer"><span></span></div>
    </div>
    <div class="mg-stage"><canvas></canvas></div>
    <div class="mg-card">
      <div class="panel">
        <span class="mg-kicker">${esc(t.mg.stopKicker)}</span>
        <h2>${esc(info.title)}</h2>
        <p>${esc(info.how)}</p>
        <button class="btn primary go" data-go>${esc(t.mg.go)}</button>
      </div>
    </div>`;
  host.appendChild(root);
  const stage = root.querySelector<HTMLElement>('.mg-stage')!;
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const bar = root.querySelector<HTMLElement>('.mg-timer span')!;
  const card = root.querySelector<HTMLElement>('.mg-card')!;
  const game = create(kind, env);

  let w = 0;
  let h = 0;
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  window.addEventListener('resize', fit);

  let running = false;
  let finished = false;
  let elapsed = 0;
  let last = performance.now();
  let raf = 0;

  const toLocal = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!running) return;
    const [x, y] = toLocal(e);
    game.down(x, y);
  });
  const release = () => game.up();
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);

  return new Promise((resolve) => {
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (running) {
        elapsed += dt;
        game.update(dt);
        if (game.result === 'running' && elapsed >= game.limit) game.result = 'fail';
        bar.style.transform = `scaleX(${Math.max(0, 1 - elapsed / game.limit)})`;
        bar.classList.toggle('late', elapsed > game.limit * 0.75);
        if (game.result !== 'running' && !finished) {
          finished = true;
          running = false;
          window.setTimeout(showResult, 650);
        }
      } else if (finished) game.update(dt);
      ctx.clearRect(0, 0, w, h);
      game.draw(ctx, w, h);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const showResult = () => {
      const success = game.result === 'win';
      const reward = success ? 5 + Math.round(10 * Math.max(0, 1 - elapsed / game.limit)) : 0;
      env.sfx(success ? 'cash' : 'bad');
      env.haptic(success ? 'medium' : 'heavy');
      card.innerHTML = `
        <div class="panel">
          <h2>${esc(success ? t.mg.doneIn(lang === 'it' ? elapsed.toFixed(1).replace('.', ',') : elapsed.toFixed(1)) : game.result === 'fail' && elapsed >= game.limit ? t.mg.timeUp : t.mg.failed)}</h2>
          <p>${esc(success ? t.mg.reward(reward) : t.mg.offended)}</p>
          <button class="btn primary ${success ? 'go' : ''}" data-next>${esc(t.mg.next)}</button>
        </div>`;
      card.hidden = false;
      card.querySelector<HTMLButtonElement>('[data-next]')!.addEventListener('click', () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', fit);
        root.remove();
        resolve({ success, time: elapsed, reward });
      });
    };

    card.querySelector<HTMLButtonElement>('[data-go]')!.addEventListener('click', () => {
      card.hidden = true;
      env.sfx('tick');
      last = performance.now();
      running = true;
    });
  });
}
