// A chart tooltip's state (MAIN-BARS-06, MAIN-SCAT-10): shown on hover or focus, stays 250 ms after the pointer
// leaves, and while the pointer is on the tooltip itself (so its model link can be clicked).

export class Tip<T> {
  item = $state.raw<T | null>(null);
  x = $state(0);
  y = $state(0);
  #timer: ReturnType<typeof setTimeout> | undefined;

  show(item: T, x: number, y: number): void {
    clearTimeout(this.#timer);
    this.item = item;
    this.x = x;
    this.y = y;
  }

  hide(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.item = null), 250);
  }

  keep(): void {
    clearTimeout(this.#timer);
  }

  close(): void {
    clearTimeout(this.#timer);
    this.item = null;
  }
}
