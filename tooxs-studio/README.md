# Tooxs — versión "Studio"

Contenido **acotado** del sitio [tooxs.cl](https://tooxs.cl) incorporado a un
modelo de página de estilo editorial (inspirado en la estructura de la plantilla
*Das Studio*). Se rescataron los **componentes** y el **lenguaje visual** del
modelo y se reconstruyeron como código y vectores propios, adaptados a la marca
y al contenido reales de Tooxs.

## Lenguaje visual rescatado del modelo

| Elemento            | Adaptación en Tooxs                                          |
|---------------------|-------------------------------------------------------------|
| Tema claro editorial | Fondo `#f5f5f3`, tinta `#0a0a0a`, acento azul `#0099ff`     |
| Tipografías          | **Inter** (titulares) + **Fragment Mono** (etiquetas/números) |
| Hero editorial       | Titular grande con palabra en *cursiva mono* + tags         |
| Marquee de marcas    | Cinta animada: SAP · Siemens · Odoo · WhatsApp · Instagram · Excel |
| Grid de *Projects*   | Las 6 soluciones como tarjetas con visual + meta + flecha ↗ |
| Lista numerada *Services* | Capacidades `(01)…(06)` con hover invertido            |
| *Flow* de proceso    | Diagnóstico → Integración → Operación → Escala               |
| *Numbers* / stats    | 6 soluciones · 100% cloud · 24/7 · piloto 8 sem             |
| CTA de contacto      | Bloque oscuro con email grande subrayado                    |

## Estructura

```text
tooxs-studio/
  index.html    Secciones: hero, marquee, soluciones, capacidades, proceso, nosotros, contacto, footer
  styles.css    Tema editorial claro, grids con hairlines, hover invertido, marquee, reveal
  script.js     Año dinámico + animación reveal (IntersectionObserver)
  assets/
    logo.svg    Logo / wordmark de Tooxs (versión monocroma)
```

## Ver en local

```bash
cd tooxs-studio
python3 -m http.server 8080   # http://localhost:8080
```

## Notas

- Los **vectores** (íconos de cada solución, marca del logo, flechas) son SVG
  reconstruidos en el estilo del modelo; no se reutilizaron imágenes
  propietarias de la plantilla original.
- El **contenido** (nombres, descripciones, enlaces a subdominios) proviene del
  sitio real `tooxs.cl`, condensado para el formato editorial.
