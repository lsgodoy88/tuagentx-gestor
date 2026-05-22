# TuAgentX — Vault

Snapshots congelados de componentes y módulos del Gestor.
Cuando algo funciona bien → se guarda aquí con fecha y descripción.
Si algo se rompe o quieres recuperar lógica → buscas aquí.

---

## Cómo usar

**Guardar un snapshot:**
```bash
# Componentes
cp /srv/gestor/components/*.tsx /srv/gestor/vault/components/YYYY-MM-DD/
cp /srv/gestor/components/ui/cards.tsx /srv/gestor/vault/components/YYYY-MM-DD/

# Módulo específico
mkdir /srv/gestor/vault/modules/YYYY-MM-DD-nombre-modulo
# copiar archivos + crear index.md con descripción
```

**Recuperar un componente:**
```bash
cp /srv/gestor/vault/components/2026-05-21/ModalVisita.tsx \
   /srv/gestor/components/ModalVisita.tsx
```

---

## Estructura

```
vault/
├── README.md               → este archivo
├── components/
│   └── YYYY-MM-DD/         → snapshot de todos los componentes
│       ├── index.md        → qué hace cada uno
│       └── [archivos.tsx]
└── modules/
    └── YYYY-MM-DD-nombre/  → snapshot de un módulo completo
        ├── index.md        → lógica, dependencias, contexto
        └── [archivos]
```

---

## Snapshots disponibles

| Fecha | Tipo | Descripción |
|-------|------|-------------|
| 2026-05-21 | components | Todos los componentes — estado estable post-Redis+Postgres tuning |

