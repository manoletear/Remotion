# MCP Servers — Setup

Este repo incluye un `.mcp.json` con tres servidores MCP para Claude Code:

1. **`magic`** — Magic MCP de [21st.dev](https://21st.dev) (generación de componentes UI).
2. **`github`** — Servidor oficial de GitHub MCP (repos, PRs, issues, code search).
3. **`pixa`** — [Pixa MCP](https://pixa.com) (generar imágenes y video, quitar fondo, upscale 4x, borrar objetos, librería de assets).
4. **`higgsfield`** — [Higgsfield MCP](https://higgsfield.ai/mcp) (video cinemático y marketing; 30+ modelos: Soul, Kling, Veo, Seedance, Nano Banana Pro…).

> Los secretos **no** se guardan en el repo. `.mcp.json` usa expansión de
> variables de entorno (`${VAR}`), que Claude Code resuelve en tiempo de ejecución.

## 1. Magic MCP (21st.dev)

Requiere una API key propia. Consíguela en https://21st.dev (Dashboard → API Keys)
y expórtala antes de abrir Claude Code:

```bash
export MAGIC_API_KEY="tu_api_key_de_21st_dev"
```

> No reutilices la key que aparece en tutoriales/capturas: usa la tuya.

## 2. GitHub MCP

Está configurado con el **servidor remoto oficial** (`https://api.githubcopilot.com/mcp/`),
que usa OAuth — no necesitas pegar ningún token en el archivo.

Tras abrir Claude Code, autoriza la conexión con:

```
/mcp
```

y completa el login de GitHub en el navegador.

### Alternativa: GitHub MCP local con Docker + PAT

Si prefieres correrlo localmente con un Personal Access Token, reemplaza el
bloque `github` de `.mcp.json` por:

```json
"github": {
  "command": "docker",
  "args": [
    "run", "-i", "--rm",
    "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
    "ghcr.io/github/github-mcp-server"
  ],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" }
}
```

y exporta tu token:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_..."
```

## 3. Pixa MCP

Servidor remoto (`https://mcp.pixa.com/mcp`) que añade 6 herramientas: generación de
imágenes, generación de video, quitar fondo, upscale 4x, borrar objetos y librería de assets.

- **No requiere API key local** ni instalación por npm.
- Crea una cuenta gratis en https://pixa.com.
- Autenticación por OAuth: tras abrir Claude Code, corre `/mcp` → selecciona `pixa` → `Authenticate`.

> El tier gratuito incluye créditos limitados.

## 4. Higgsfield MCP

Servidor remoto (`https://mcp.higgsfield.ai/mcp`) orientado a video cinemático y de marketing.
Expone tools como analizador de video, generador de video marketing, entrenamiento de
personaje Soul, image-to-video cinemático, generador de clips virales y predicción de
viralidad. Da acceso a 30+ modelos (Soul, Kling, Veo, Seedance, Nano Banana Pro, Cinema Studio…).

- **No requiere API key**: usa login con tu cuenta de Higgsfield.
- Crea cuenta en https://higgsfield.ai.
- Autenticación por OAuth: `/mcp` → selecciona `higgsfield` → `Authenticate`.

## Verificar

Dentro de Claude Code:

```
/mcp
```

Deberías ver `magic`, `github`, `pixa` y `higgsfield` como `connected`.
