import { Component, computed, input } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideRefreshCw,
  LucideCopy,
  LucideTrash2,
  LucideSun,
  LucideMoon,
  LucideHouse,
  LucideUsers,
  LucidePackage,
  LucideFileText,
  LucideTag,
  LucideEye,
  LucideDownload,
  LucideSearch,
  LucidePlus,
  LucidePencil,
  LucideChevronRight,
  LucideChevronLeft,
  LucideX,
  LucideCheck,
  LucideLogOut,
  LucideMenu,
  LucidePlane,
  LucideWarehouse,
  LucideTruck,
  LucideBell,
  LucidePaperclip,
} from '@lucide/angular';

// Vocabulario compartido de la aplicación; solo se importan los iconos utilizados.
const icons = {
  refresh: LucideRefreshCw,
  copy: LucideCopy,
  trash: LucideTrash2,
  sun: LucideSun,
  moon: LucideMoon,
  overview: LucideHouse,
  customers: LucideUsers,
  packages: LucidePackage,
  billing: LucideFileText,
  quotes: LucideTag,
  eye: LucideEye,
  download: LucideDownload,
  search: LucideSearch,
  plus: LucidePlus,
  edit: LucidePencil,
  arrow: LucideChevronRight,
  back: LucideChevronLeft,
  close: LucideX,
  check: LucideCheck,
  logout: LucideLogOut,
  menu: LucideMenu,
  plane: LucidePlane,
  warehouse: LucideWarehouse,
  delivery: LucideTruck,
  bell: LucideBell,
  attachment: LucidePaperclip,
} as const;
export type IconName = keyof typeof icons;

@Component({
  selector: 'app-icon',
  imports: [LucideDynamicIcon],
  template:
    '<svg [lucideIcon]="icon()" [strokeWidth]="1.75" aria-hidden="true" focusable="false"></svg>',
  styles: [
    ':host{display:inline-flex;flex:none;width:1.25rem;height:1.25rem;pointer-events:none}svg{width:100%;height:100%}',
  ],
})
export class Icon {
  readonly name = input<IconName>('packages');
  readonly icon = computed(() => icons[this.name()]);
}
