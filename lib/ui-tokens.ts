/**
 * TuAgentX — Design Tokens UI
 * Un solo lugar para definir estilos de cards/containers.
 * Cambia aquí → aplica en todo el sistema.
 */
import type { CSSProperties } from 'react'

// ── Tipo 1: KPI Glass — contadores con blur ──────────────────────
export const CARD_KPI: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.30)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: 16,
}

// ── Tipo 2: Dark Azul — listas, acciones, contenedores principales ──
export const CARD_DARK: CSSProperties = {
  background: 'rgba(8,8,28,0.82)',
  border: '1px solid rgba(59,130,246,0.25)',
  borderRadius: 16,
}

// ── Tipo 2b: Dark Azul énfasis — turno activo, acciones importantes ──
export const CARD_DARK_STRONG: CSSProperties = {
  background: 'rgba(8,8,28,0.82)',
  border: '1px solid rgba(59,130,246,0.35)',
  borderRadius: 16,
}

// ── Tipo 3: Sub-card — ítems dentro de otras cards ────────────────
export const CARD_SUB: CSSProperties = {
  background: 'rgba(15,15,22,0.60)',
  border: '1px solid rgba(59,130,246,0.20)',
  borderRadius: 10,
}

// ── Modal overlay ──────────────────────────────────────────────────
export const MODAL_OVERLAY: CSSProperties = {
  background: 'rgba(0,0,0,0.95)',
}

// ── Modal card ────────────────────────────────────────────────────
export const MODAL_CARD: CSSProperties = {
  background: 'rgba(8,8,28,0.99)',
  border: '1px solid rgba(59,130,246,0.30)',
  borderRadius: 16,
}

// ── Modal inner card (facturas, pagos dentro de modal) ────────────
export const MODAL_INNER: CSSProperties = {
  background: '#27272a',
  border: '2px solid rgba(59,130,246,0.40)',
  borderRadius: 12,
}

// ── Input dentro de modal ─────────────────────────────────────────
export const MODAL_INPUT: CSSProperties = {
  background: 'rgba(8,8,28,0.90)',
  border: '1px solid rgba(59,130,246,0.30)',
  color: 'white',
  borderRadius: 10,
}

// ── Botón Efectivo/Transferencia activo ───────────────────────────
export const BTN_METHOD_ACTIVE: CSSProperties = {
  background: 'rgba(30,58,138,0.45)',
  border: '1px solid rgba(59,130,246,0.60)',
  borderRadius: 10,
  color: 'white',
}

export const BTN_METHOD_INACTIVE: CSSProperties = {
  background: 'rgba(15,15,22,0.60)',
  border: '1px solid rgba(59,130,246,0.20)',
  borderRadius: 10,
  color: 'rgba(255,255,255,0.50)',
}
