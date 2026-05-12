# Contributing — TuAgentX Gestor

Workflow: **GitHub Flow**. Main siempre desplegable.

## Ramas

```
main                   producción (gestor.tuagentx.com)
feature/<descripción>  cambios nuevos
fix/<descripción>      bugs
hotfix/<descripción>   urgencias contra producción
```

Una rama por cambio. Nombres en kebab-case. Vida corta (cierran al mergear).

## Ciclo

1. **Crear rama desde main actualizada**
   ```bash
   cd /srv/gestor
   git checkout main && git pull
   git checkout -b feature/mi-cambio
   ```

2. **Trabajar y commitear**
   - Commits pequeños y atómicos. Conventional Commits sugerido (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
   - Cuerpo del commit: qué y por qué, no cómo.

3. **Push y deploy a staging**
   ```bash
   git push -u origin feature/mi-cambio
   ./scripts/deploy.sh staging feature/mi-cambio
   ```
   Verificar en `https://staging.tuagentx.com` con badge ámbar `STAGING` al pie.

4. **Abrir PR en GitHub** → review → squash & merge.

5. **Deploy a producción**
   ```bash
   ./scripts/deploy.sh production main
   ```

## Tags & semver

Tras cambios mergeados a main que justifiquen release:

```bash
git checkout main && git pull
# patch: bug fix sin cambio de API
npm version patch -m "release: v%s"
# minor: feature retrocompatible
npm version minor -m "release: v%s"
# major: breaking change
npm version major -m "release: v%s"

git push --follow-tags
```

Esto crea tag `vX.Y.Z` y sube `package.json` con bump.

Reglas:
- **v1.x.x** patches (correcciones sin nueva funcionalidad usuario)
- **v1.Y.0** minor (feature, módulo nuevo, endpoint nuevo)
- **v2.0.0** major (cambio de BD que rompe rollback, cambio de auth, refactor estructural)

## Deploy script

```bash
./scripts/deploy.sh production               # main → prod
./scripts/deploy.sh production v1.2.0        # tag → prod
./scripts/deploy.sh staging                  # main → staging
./scripts/deploy.sh staging feature/foo      # rama → staging
```

Hace: `git fetch && checkout && pull → npm ci → npm run build → prisma migrate deploy (si hay migraciones) → pm2 restart → curl /api/version`.

Rollback automático si el build falla o si `/api/version` no responde 200 tras el restart.

Log: `/home/luis/logs/deploys.log`.

## Reglas duras

- ❌ Nunca commitear a `main` directo. Siempre PR.
- ❌ Nunca `pm2 restart` sin build exitoso. `deploy.sh` lo garantiza.
- ❌ Nunca `git push --force` a `main`.
- ❌ Nunca tocar `.env` en git. Verificar `.gitignore`.
- ✅ Migraciones Prisma versionadas en `prisma/migrations/`.
- ✅ Hotfix también es feature branch corta, no excepción al PR.

## Hotfix de emergencia

Si producción está caída y la rama main tiene WIP no probado:

```bash
git checkout v<última-tag-estable>
git checkout -b hotfix/<descripción>
# arreglar
git push -u origin hotfix/<descripción>
./scripts/deploy.sh production hotfix/<descripción>
# después: PR a main para mergear el fix
```

## Staging

- Comparte BD con producción (mismo schema `gestor`).
- **No corre worker** — los crons los maneja prod.
- Sentry `environment: staging`.
- PM2: `gestor-staging` (id 8), puerto 3011.
- `/srv/gestor-staging` — independiente de `/srv/gestor`.

Probar en staging cualquier cosa que toque pagos, sync, o schema antes de mergear.
