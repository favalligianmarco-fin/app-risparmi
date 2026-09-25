import type { Dir } from './sim';

/**
 * Tocco = un passo avanti; trascinamento = spostamento nella direzione del gesto.
 * La direzione del trascinamento scatta appena si supera la soglia, senza aspettare
 * che il dito si alzi: è ciò che rende i controlli reattivi.
 */
const SWIPE_PX = 22;

interface Track {
  x: number;
  y: number;
  fired: boolean;
}

export class Input {
  enabled = false;
  private tracks = new Map<number, Track>();

  constructor(
    el: HTMLElement,
    private readonly onMove: (d: Dir) => void,
    private readonly onUmbrella: () => void,
    private readonly onPause: () => void,
  ) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tracks.set(e.pointerId, { x: e.clientX, y: e.clientY, fired: false });
    });
    el.addEventListener('pointermove', (e) => {
      const tr = this.tracks.get(e.pointerId);
      if (!tr || tr.fired) return;
      const dx = e.clientX - tr.x;
      const dy = e.clientY - tr.y;
      if (Math.hypot(dx, dy) < SWIPE_PX) return;
      tr.fired = true;
      if (Math.abs(dx) > Math.abs(dy)) this.emit(dx > 0 ? 'right' : 'left');
      else this.emit(dy > 0 ? 'down' : 'up');
    });
    const end = (e: PointerEvent) => {
      const tr = this.tracks.get(e.pointerId);
      this.tracks.delete(e.pointerId);
      if (!tr || tr.fired || e.type === 'pointercancel') return;
      this.emit('up');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const map: Record<string, Dir> = {
        ArrowUp: 'up',
        KeyW: 'up',
        ArrowDown: 'down',
        KeyS: 'down',
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right',
      };
      const d = map[e.code];
      if (d) {
        e.preventDefault();
        if (!e.repeat) this.emit(d);
      } else if (e.code === 'Space' || e.code === 'KeyU') {
        e.preventDefault();
        if (!e.repeat) this.onUmbrella();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause();
      }
    });
  }

  private emit(d: Dir) {
    if (this.enabled) this.onMove(d);
  }
}
