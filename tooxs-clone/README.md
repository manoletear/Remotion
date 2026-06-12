# Tooxs — Clon del sitio web

Clon estático del sitio [tooxs.cl](https://tooxs.cl), el ecosistema de
soluciones tecnológicas de Tooxs.

## Contenido

```text
tooxs-clone/
  index.html      Estructura y contenido (basado en el marcado real del sitio)
  styles.css      Estilos: tema oscuro, hero con gradientes, grid de soluciones
  script.js       Año dinámico del footer + animación reveal (IntersectionObserver)
  assets/
    logo.svg      Logo / wordmark de Tooxs
```

## Soluciones del ecosistema

| Producto          | Descripción                                              |
|-------------------|----------------------------------------------------------|
| XperTooxs         | Mantenimiento predictivo con IA para equipos industriales |
| DocuEngine        | Digitalización y clasificación de documentos con IA       |
| TooxIA            | IA comercial 24/7: califica leads y agenda reuniones       |
| TooxsMatchLedger  | Gestión y auditoría de estructuras de compensación         |
| TalentScan        | Inteligencia de talento para búsqueda ejecutiva            |
| LiciTooxs         | Gestión de licitaciones públicas de punta a punta          |

## Ver en local

Al ser un sitio 100% estático no requiere build. Basta con abrir `index.html`
en el navegador, o servirlo con cualquier servidor estático:

```bash
cd tooxs-clone
python3 -m http.server 8080
# abrir http://localhost:8080
```

## Notas

El sitio en vivo entrega el HTML pero sus assets (`styles.css`, `script.js`,
`assets/logo.png`) respondían `404` al momento de clonar, por lo que se
reconstruyeron a partir del marcado semántico para reproducir la estructura,
el contenido y la intención de diseño del sitio. Los enlaces a los
subdominios de cada producto se conservan tal como en el original.
