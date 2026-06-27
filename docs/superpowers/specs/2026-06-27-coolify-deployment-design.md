# Despliegue en Coolify — Diseño

**Fecha:** 2026-06-27
**Estado:** Aprobado (diseño)
**Topología elegida:** dos subdominios

## Objetivo

Desplegar el monorepo (Angular frontend + NestJS backend + Postgres) en una
instancia self-hosted de Coolify, con:

- Frontend en `https://scheduler.davidrojom.com`
- Backend en `https://api.scheduler.davidrojom.com`
- Postgres gestionado por Coolify (no expuesto a internet)
- Login con Google OAuth real funcionando desde el primer despliegue

El repo no tiene hoy artefactos de despliegue para el backend ni para una base de
datos productiva: el único `Dockerfile` (raíz) solo construye el frontend y lo
sirve con Apache httpd. Este diseño añade lo que falta y deja el flujo de
desarrollo local intacto.

## Arquitectura

Tres recursos en el **mismo proyecto/servidor de Coolify** (para compartir red
interna):

```
                 Internet (HTTPS, Let's Encrypt vía Coolify/Traefik)
                        │
        ┌───────────────┴────────────────┐
        ▼                                 ▼
scheduler.davidrojom.com          api.scheduler.davidrojom.com
   (Frontend, nginx :80)             (Backend NestJS :3100)
        │                                 │
        └── llamadas HTTP + WS ──────────►│  (CORS: FRONTEND_URL)
                                          │
                                          ▼  red interna Coolify
                                   Postgres (gestionado por Coolify)
```

- **Frontend** y **backend**: apps tipo *Dockerfile* en Coolify, ambas desde este repo.
- **Postgres**: base de datos gestionada por Coolify (volumen persistente + backups).
- El navegador alcanza el backend por `api.scheduler.davidrojom.com`; el backend
  habla con Postgres por la red interna de Coolify.

## Decisiones de diseño

1. **URL de la API en el frontend → build-arg.** El `Dockerfile` del frontend
   recibe `API_BASE_URL` y `WS_URL` y los hornea en `environment.prod.ts` durante
   el build (Angular embebe la config en build time vía `fileReplacements`).
   Alternativa descartada: config en runtime (`config.json` + `APP_INITIALIZER`) —
   más código y los dominios son estables.

2. **Migraciones → al arrancar el contenedor del backend.** El entrypoint corre
   las migraciones y luego `node dist/main`. Evita un paso manual por deploy. Para
   no arrastrar `tsx`/TypeScript al runtime se añade un runner compilado
   (`dist/database/migrate.js`). Alternativa descartada: comando pre-deploy en
   Coolify o paso manual.

3. **Servidor del frontend → nginx (en lugar de httpd).** Necesario para el *SPA
   fallback* (`try_files … /index.html`): el callback de Google redirige a
   `https://scheduler.davidrojom.com/auth/callback?token=…`, una ruta de Angular
   que con httpd tal cual daría 404 al recargar/entrar directo.

4. **Imagen del backend → multi-stage con deps de producción podadas.** Build con
   pnpm desde la raíz del workspace, luego runtime ligero (`node:slim`) solo con
   dependencias de producción (vía `pnpm deploy --prod` o equivalente).

## Cambios en el repositorio

| Archivo | Acción | Propósito |
| --- | --- | --- |
| `apps/backend/Dockerfile` | nuevo | Build multi-stage del backend; entrypoint `migrate && node dist/main` |
| `apps/backend/src/database/migrate.ts` | nuevo | Runner de migraciones compilable (reutiliza `createKysely`/`createMigrator`) |
| `Dockerfile` (raíz, frontend) | modificar | `ARG API_BASE_URL`/`ARG WS_URL`, generar `environment.prod.ts`, servir con nginx |
| `apps/frontend/nginx.conf` | nuevo | `try_files` (SPA), gzip, cache de assets |
| `.dockerignore` | revisar/ajustar | Mantener contextos de build limpios para ambos Dockerfiles |
| `README.md` / docs | opcional | Notas de despliegue en Coolify |

El build context de ambos Dockerfiles es la **raíz del repo** (workspace pnpm +
lockfile disponibles). El flujo local (`pnpm start:*`, `docker-compose.yml` de
Postgres dev) no cambia.

### Detalle del runner de migraciones

`apps/backend/scripts/migrate.ts` usa `tsx` y lee migraciones `.ts` desde
`src/database/migrations`. `MIGRATIONS_FOLDER` se resuelve como
`path.join(__dirname, 'migrations')`, así que el equivalente compilado
(`dist/database/migrator.js`) resuelve `dist/database/migrations/*.js`, que
`nest build` genera. El nuevo `src/database/migrate.ts` (compilado a
`dist/database/migrate.js`) llama a `migrateToLatest()` sin depender de `tsx` ni
del árbol `src/` en runtime.

### Detalle del frontend (build-arg → environment)

El `Dockerfile` raíz, antes de `pnpm --filter @scheduler/frontend build`,
sobrescribe `apps/frontend/src/environments/environment.prod.ts` con los valores
de `API_BASE_URL` y `WS_URL`. El build de producción (`ng build`) aplica el
`fileReplacements` configurado en `angular.json` y embebe esos valores.

Valores de producción:
- `API_BASE_URL=https://api.scheduler.davidrojom.com/api`
- `WS_URL=https://api.scheduler.davidrojom.com`

## Configuración en Coolify

**Prerrequisitos (DNS):** registros **A** de `scheduler.davidrojom.com` y
`api.scheduler.davidrojom.com` apuntando a la IP del servidor de Coolify. Coolify
emite el TLS (Let's Encrypt) automáticamente.

### 1. Postgres
*New Resource → Database → PostgreSQL.* Coolify entrega una **connection string
interna** que se usará como `DATABASE_URL` del backend.

### 2. Backend (Application → Dockerfile)
- Build Pack: `Dockerfile` · Dockerfile location: `/apps/backend/Dockerfile` · Base directory: `/`
- Ports Exposes: `3100` · Domain: `https://api.scheduler.davidrojom.com`
- Variables de entorno:
  - `PORT=3100`
  - `DATABASE_URL=<connection string interna de Coolify>`
  - `JWT_SECRET=<aleatorio largo>`
  - `GOOGLE_CLIENT_ID=<...>`
  - `GOOGLE_CLIENT_SECRET=<...>`
  - `GOOGLE_CALLBACK_URL=https://api.scheduler.davidrojom.com/api/auth/google/callback`
  - `FRONTEND_URL=https://scheduler.davidrojom.com`
  - `AUTH_TEST_MODE` sin definir (o `false`)

### 3. Frontend (Application → Dockerfile)
- Build Pack: `Dockerfile` · Dockerfile location: `/Dockerfile` · Base directory: `/`
- Ports Exposes: `80` · Domain: `https://scheduler.davidrojom.com`
- Build args:
  - `API_BASE_URL=https://api.scheduler.davidrojom.com/api`
  - `WS_URL=https://api.scheduler.davidrojom.com`

### 4. Google Cloud Console
- *Authorized redirect URI*: `https://api.scheduler.davidrojom.com/api/auth/google/callback`
- *Authorized JavaScript origins*: `https://scheduler.davidrojom.com`

### Orden de despliegue
1. Postgres → obtener `DATABASE_URL` interna.
2. Backend (corre migraciones al arrancar; revisar logs).
3. Frontend (con los build args).
4. Configurar OAuth en Google y probar login + colaboración (WebSocket).

## Riesgos / puntos a verificar

- **Extensión Postgres (`pgcrypto`/`uuid-ossp`):** `apps/backend/scripts/init-db.sql`
  la crea en dev. Verificar que alguna migración hace
  `CREATE EXTENSION IF NOT EXISTS …`; si el esquema usa `gen_random_uuid()` y no
  existe, añadirla a una migración inicial.
- **SSL de Postgres:** la conexión interna de Coolify va sin SSL; `node-postgres`
  no fuerza SSL salvo `sslmode=require` en la URL, así que la string interna
  funciona tal cual. No añadir `sslmode=require` para la conexión interna.
- **WebSocket:** el proxy (Traefik) de Coolify hace upgrade de WS por defecto. El
  gateway está en el namespace `/collab` con `origin: true` (permisivo); funciona
  cross-subdominio. Opcional endurecer el origin más adelante.
- **CORS HTTP:** depende de `FRONTEND_URL`; debe ser exactamente
  `https://scheduler.davidrojom.com` (sin barra final).
- **Rama de despliegue:** Coolify despliega de una rama concreta. Decidir si se
  fusiona a `main` o se despliega `feat/backend-collaboration-realtime`.
- **Healthcheck (opcional):** definir un endpoint/healthcheck para que Coolify
  marque el backend como *healthy* antes de enrutar.

## Verificación

- Backend: logs muestran migraciones aplicadas; `https://api.scheduler.davidrojom.com/api`
  responde.
- Frontend: `https://scheduler.davidrojom.com` carga; recargar en `/auth/callback`
  no da 404 (SPA fallback OK).
- Login con Google completa el ciclo y redirige a `FRONTEND_URL/auth/callback?token=…`.
- Colaboración en tiempo real: el WebSocket `/collab` conecta (autenticado por JWT).

## Fuera de alcance

- CI/CD propio (se usa el deploy de Coolify por push/rama).
- Single-domain con reverse proxy (descartado a favor de dos subdominios).
- Postgres en `docker-compose` (se usa la base de datos gestionada de Coolify).
- Endurecer CORS de Socket.IO (mejora opcional posterior).
