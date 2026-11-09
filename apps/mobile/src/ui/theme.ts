/**
 * Colors and sizes shared by every screen. Keeping them in one place makes it
 * easy to restyle the app (or add a dark theme later).
 */

import type { Premium } from '@maitremot/engine';

export const colors = {
  background: '#f6f1e7',
  surface: '#ffffff',
  text: '#2b2b2b',
  textMuted: '#6f6a60',
  border: '#d8cfbb',
  primary: '#2f6b4f',
  primaryText: '#ffffff',
  danger: '#b3261e',
  // Board
  square: '#e9e1cf',
  squareBorder: '#f6f1e7',
  center: '#e7c873',
  // Tiles
  tile: '#f3d9a4',
  tileBorder: '#c9a35e',
  tileText: '#3b2a12',
  tileBlankText: '#8a4b0f',
  pendingTile: '#ffe58f',
  pendingBorder: '#d4a106',
  lastMove: '#f8c983',
  selected: '#2f6b4f',
} as const;

export const premiumStyle: Record<Premium, { color: string; label: string }> = {
  DL: { color: '#9fd3f0', label: 'L×2' },
  TL: { color: '#3b8fd0', label: 'L×3' },
  DW: { color: '#f3b3a6', label: 'M×2' },
  TW: { color: '#d9463b', label: 'M×3' },
};

export const radius = { small: 4, medium: 10, large: 16 } as const;
