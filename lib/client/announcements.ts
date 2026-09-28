import type { AnnouncementRow } from './types';

/** Texto público de um anúncio de virada. Nunca revela papéis. */
export function announcementText(a: AnnouncementRow): { title: string; detail: string | null; tone: 'death' | 'arrest' | 'info' } {
  switch (a.kind) {
    case 'death':
      return { title: `nº ${a.seat} · ${a.name} morreu`, detail: `era ${a.character_name}`, tone: 'death' };
    case 'arrest':
      return { title: `nº ${a.seat} · ${a.name} foi preso`, detail: `era ${a.character_name}`, tone: 'arrest' };
    case 'targeted':
      return {
        title: (a.count ?? 1) > 1 ? `Os assassinos escolheram ${a.count} alvos.` : 'Os assassinos escolheram um alvo.',
        detail: 'Quem foi escolhido morre na virada da próxima rodada.',
        tone: 'info',
      };
    case 'sabotage_ok':
      return { title: `Houve uma sabotagem e o nº ${a.seat} tirou o alvo dele e colocou em outra pessoa.`, detail: null, tone: 'info' };
    case 'sabotage_fail':
      return { title: 'Houve uma tentativa de sabotagem, mas falhou.', detail: null, tone: 'info' };
  }
}
