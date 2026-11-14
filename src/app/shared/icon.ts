import { Component, computed, input } from '@angular/core';

const paths = {
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z',
  overview: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  customers:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  packages: 'm12 3 9 5v9l-9 5-9-5V8Zm0 9v10M3 8l9 4 9-4M7.5 5.5l9 5',
  billing: 'M14 2H5v20h14V7Zm0 0v6h5M8 12h8M8 16h8',
  quotes: 'M20 13 11 22 2 13V3h10l8 8ZM7 7h.01',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  arrow: 'm9 5 7 7-7 7',
  back: 'm14 5-7 7 7 7',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  logout: 'M9 3H3v18h6M10 12h11m-4-4 4 4-4 4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  plane: 'm22 2-7 20-4-9-9-4Zm0 0L11 13',
  warehouse: 'm3 9 9-6 9 6v12H3Zm4 12V11h10v10M7 15h10M7 18h10',
  delivery:
    'M3 4h11v13H3Zm11 5h4l3 4v4h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm11 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  attachment: 'm8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',
} as const;
export type IconName = keyof typeof paths;

@Component({
  selector: 'app-icon',
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path()" /></svg>',
  styles: [
    ':host{display:inline-flex;flex:none;width:1.25rem;height:1.25rem}svg{width:100%;height:100%}',
  ],
})
export class Icon {
  readonly name = input<IconName>('packages');
  readonly path = computed(() => paths[this.name()]);
}
