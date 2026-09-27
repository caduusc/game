'use client';

/**
 * Diferença entre o relógio do servidor e o do aparelho.
 * Cada resposta da API traz serverNow; usamos a mediana das últimas amostras,
 * compensando metade do tempo de ida e volta.
 */
const samples: number[] = [];
let offset = 0;

export function recordServerTime(serverNow: number, sentAt: number, receivedAt: number) {
  const rtt = Math.max(0, receivedAt - sentAt);
  if (rtt > 5000) return;
  samples.push(serverNow + rtt / 2 - receivedAt);
  if (samples.length > 7) samples.shift();
  const sorted = [...samples].sort((a, b) => a - b);
  offset = sorted[Math.floor(sorted.length / 2)];
}

export function serverNow(): number {
  return Date.now() + offset;
}
