import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * Vertical splitter between two panels. Emits horizontal pointer deltas in pixels and
 * keyboard steps (arrow keys) so panels can be resized with mouse, touch or keyboard.
 */
@Component({
  selector: 'sf-resize-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuenow]': 'value()',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[class.dragging]': 'dragging()',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'end($event)',
    '(pointercancel)': 'end($event)',
    '(keydown)': 'key($event)',
    '(dblclick)': 'reset.emit()',
  },
  template: '<span class="grip" aria-hidden="true"></span>',
  styles: `
    :host {
      position: relative;
      z-index: 2;
      display: block;
      width: 6px;
      margin: 0 -2px;
      cursor: col-resize;
      touch-action: none;
      outline: none;
    }
    .grip {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 2px;
      width: 2px;
      background: transparent;
      transition: background-color 150ms ease;
    }
    :host(:hover) .grip,
    :host(.dragging) .grip,
    :host(:focus-visible) .grip {
      background: var(--sf-accent);
    }
  `,
})
export class ResizeHandleComponent {
  readonly label = input('Redimensionar painéis');
  /** Current size of the panel before the handle, in percent (for assistive technologies). */
  readonly value = input(50);
  readonly resized = output<number>();
  /** Keyboard step, in percent. */
  readonly stepped = output<number>();
  readonly reset = output<void>();

  protected readonly dragging = signal(false);
  private lastX = 0;

  protected start(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.lastX = event.clientX;
    this.dragging.set(true);
    event.preventDefault();
  }

  protected move(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    const delta = event.clientX - this.lastX;
    this.lastX = event.clientX;
    if (delta !== 0) {
      this.resized.emit(delta);
    }
  }

  protected end(event: PointerEvent): void {
    if (this.dragging()) {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
      this.dragging.set(false);
    }
  }

  protected key(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') {
      this.stepped.emit(-step);
    } else if (event.key === 'ArrowRight') {
      this.stepped.emit(step);
    } else {
      return;
    }
    event.preventDefault();
  }
}
