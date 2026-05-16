# Stock en Casa

App PWA para control de stock doméstico: escaneo de códigos de barra, alertas de stock bajo, listas de compras automáticas y features de IA con Claude.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**
- **Supabase** (Postgres + Auth + Realtime + Storage)
- **Serwist** (PWA: manifest + service worker)
- **Claude API** (Fase 6+)

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear proyecto en Supabase

1. Andá a [supabase.com/dashboard](https://supabase.com/dashboard) y creá un proyecto nuevo.
2. En **Settings → API** copiá:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. En **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (dev) o tu dominio de Vercel.
   - **Redirect URLs**: agregá `http://localhost:3000/auth/callback` y la URL equivalente en producción.

### 3. Variables de entorno

Pegá los valores en `.env.local` (ya está creado, no se commitea):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=        # opcional hasta la Fase 6
```

### 4. Levantar el server de dev

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). Te va a redirigir a `/login` y desde ahí podés pedir un magic link.

> **Heads up:** Supabase manda los magic links a tu casilla de email. En el plan free el SMTP propio de Supabase tiene rate limit bajo (3 emails/hora). Para producción conviene configurar SMTP en **Auth → Email Templates**.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Server de dev (PWA deshabilitada para hot reload limpio) |
| `npm run build` | Build de producción (genera el service worker) |
| `npm run start` | Server de producción |
| `npm run lint` | ESLint |

## Estructura

```
src/
  app/
    auth/
      callback/route.ts    # OAuth callback (intercambia code por sesión)
      signout/route.ts     # Logout
    login/
      page.tsx             # Form de login
      login-form.tsx       # Client component
      actions.ts           # Server action: signInWithMagicLink
    layout.tsx             # Root layout + PWA metadata
    page.tsx               # Home protegida
    sw.ts                  # Service worker (Serwist)
  components/ui/           # shadcn/ui
  lib/
    supabase/
      client.ts            # Cliente browser
      server.ts            # Cliente server (RSC, route handlers)
      middleware.ts        # Refresh de sesión
    utils.ts
  middleware.ts            # Auth guard + redirect a /login
public/
  manifest.webmanifest     # Manifest PWA
  icon.svg                 # Icono base (reemplazar con PNG para mejor compat)
```

## Deploy a Vercel

1. Conectá el repo en Vercel.
2. Pegá las mismas variables de entorno en **Settings → Environment Variables**.
3. Actualizá las **Redirect URLs** en Supabase con tu dominio de Vercel.
4. Deploy.

## Roadmap

- [x] **Fase 0** — Bootstrap (Next.js + Supabase + PWA + auth)
- [ ] **Fase 1** — Core inventario (alta manual, ubicaciones, descuento)
- [ ] **Fase 2** — Escaneo de códigos de barra + Open Food Facts
- [ ] **Fase 3** — Fechas de vencimiento + alertas
- [ ] **Fase 4** — Lista de compras automática + modo super
- [ ] **Fase 5** — Hogar compartido (multi-usuario + realtime)
- [ ] **Fase 6** — IA básica (categorización, normalización)
- [ ] **Fase 7** — Historial de consumo + predicciones
- [ ] **Fase 8** — IA avanzada (recetas, asistente, ticket vision)
