// Modern line icons from Lucide (https://github.com/lucide-icons/lucide),
// ISC licensed. We render Lucide's IconNode data to inline SVG strings so the
// vanilla DOM UI can use them with no framework. Presentation only.
import { Sword, Swords, Sparkles, Pointer, ChevronsRight, Footprints, Diamond, Boxes } from 'lucide';

type IconNode = Array<[string, Record<string, string | number>]>;

const REGISTRY: Record<string, IconNode> = {
  sword: Sword as IconNode,
  swords: Swords as IconNode,
  sparkles: Sparkles as IconNode,
  pointer: Pointer as IconNode,
  'chevrons-right': ChevronsRight as IconNode,
  footprints: Footprints as IconNode,
  diamond: Diamond as IconNode,
  boxes: Boxes as IconNode,
};

/** Render one Lucide icon to an inline SVG string (24x24, stroke = currentColor). */
export function lucideSvg(name: string, size = 20): string {
  const node = REGISTRY[name];
  if (!node) return '';
  const inner = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`)
    .join('');
  return `<svg class="lucide" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** Replace every element carrying data-lucide="name" with its rendered icon. */
export function hydrateLucide(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-lucide]').forEach((el) => {
    const svg = lucideSvg(el.dataset.lucide ?? '', Number(el.dataset.lucideSize) || 20);
    if (svg) el.innerHTML = svg;
  });
}
