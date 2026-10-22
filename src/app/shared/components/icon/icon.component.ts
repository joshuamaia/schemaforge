import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONS, IconName } from './icons';

/** Renders a Lucide icon as inline SVG through template bindings (no innerHTML). */
@Component({
  selector: 'sf-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', class: 'sf-icon' },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.stroke-width]="strokeWidth()"
    >
      @for (node of nodes(); track $index) {
        @let a = node[1];
        @switch (node[0]) {
          @case ('path') {
            <svg:path [attr.d]="a['d']" />
          }
          @case ('circle') {
            <svg:circle [attr.cx]="a['cx']" [attr.cy]="a['cy']" [attr.r]="a['r']" />
          }
          @case ('rect') {
            <svg:rect
              [attr.x]="a['x']"
              [attr.y]="a['y']"
              [attr.width]="a['width']"
              [attr.height]="a['height']"
              [attr.rx]="a['rx']"
              [attr.ry]="a['ry']"
            />
          }
          @case ('line') {
            <svg:line
              [attr.x1]="a['x1']"
              [attr.y1]="a['y1']"
              [attr.x2]="a['x2']"
              [attr.y2]="a['y2']"
            />
          }
          @case ('polyline') {
            <svg:polyline [attr.points]="a['points']" />
          }
          @case ('polygon') {
            <svg:polygon [attr.points]="a['points']" />
          }
          @case ('ellipse') {
            <svg:ellipse
              [attr.cx]="a['cx']"
              [attr.cy]="a['cy']"
              [attr.rx]="a['rx']"
              [attr.ry]="a['ry']"
            />
          }
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 0;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(16);
  readonly strokeWidth = input(2);

  protected readonly nodes = computed(() => ICONS[this.name()]);
}
