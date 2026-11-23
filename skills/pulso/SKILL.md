---
name: pulso
description: Crea una página de estado del sistema (status page, health page, /system/health, /status) a pantalla completa para el panel de administración de cualquier proyecto web, con veredicto en grande, esquema animado de procesos alrededor de un núcleo, pestaña de infraestructura con medidores y tendencias, pestaña de eventos, modales de detalle enlazables, refresco automático y modo oscuro. Úsala cuando pidan una página de salud o estado, un monitor de procesos, workers, colas, cron o servicios, un panel para dejar abierto en una pantalla o "algo como /system/health". Funciona con cualquier backend (Symfony, Laravel, Django, Rails, Express, Next.js, Go…) porque la página es HTML autocontenido que consume un JSON.
---

# Pulso: páginas de estado que se entienden de un vistazo

Pulso da a cualquier proyecto una página de estado pensada para dejarla abierta en
otra pestaña o en una pantalla. Responde primero a la pregunta «¿funciona todo?» con
una frase grande, y deja el detalle a un clic.

| Pieza | Fichero |
|---|---|
| Plantilla HTML/CSS/JS autocontenida, sin dependencias | `assets/status-page.html` |
| Servidor de demo y adaptador de referencia (Node, sin dependencias) | `scripts/demo-server.mjs` |
| Contrato JSON entre backend y página | `references/data-contract.md` |
| Qué vigilar y cómo decidir cada estado | `references/collectors.md` |
| Cómo conectarla en cada framework | `references/adapters.md` |
| Sistema visual, cómo adaptarlo a la marca y qué no tocar | `references/design.md` |

## Flujo de trabajo

Sigue estos pasos en orden. Si el proyecto tiene sus propias reglas de arquitectura
(AGENTS.md, CLAUDE.md, capas DDD, convenciones de rutas o permisos), mandan esas
reglas: Pulso solo define la página y el contrato de datos.

### 1. Haz inventario de lo que corre de verdad

Antes de escribir código, averigua qué piezas tiene el sistema. No te las inventes:
léelas del proyecto.

- **Procesos**: workers y consumidores de colas (Messenger, Horizon, Celery, Sidekiq,
  BullMQ…), programador o cron, daemons. Búscalos en `docker-compose*.yml`,
  `supervisord.conf`, `Procfile`, unidades systemd, manifiestos de Kubernetes,
  `package.json`, `composer.json` y la configuración de colas.
- **Infraestructura**: base de datos, caché, disco, CPU, memoria, almacenamiento
  de ficheros y servicios externos (pasarela de pago, correo, CDN, APIs).
- **Lo que ya existe**: endpoints de health, comandos de monitorización, tablas de
  latidos (heartbeats), métricas. Reutilízalos antes de crear nada nuevo.

- **Conexiones**: qué llama a qué en una petición normal (proxy o servidor web →
  aplicación → base de datos, caché, colas). Sácalo de la configuración del servidor
  web, de `docker-compose*.yml` y de las variables de conexión. Con ello se dibuja el
  mapa de infraestructura (`connects` en el contrato).

Presenta al usuario la lista de piezas que vas a vigilar, agrupadas en procesos
(carril izquierdo y derecho) e infraestructura (el mapa de conexiones y los grupos). Si hay dudas sobre qué
incluir, pregunta antes de seguir.

### 2. Decide cómo se calcula cada estado (en el backend)

Lee `references/collectors.md`. Para cada pieza define:

- la fuente de la señal (latido, consulta, ping, métrica);
- los umbrales de `attention` y `error`, y cuándo pasa a `off`;
- el texto de `detail`, escrito para quien mira la página, no para quien la programó
  («Sin señal desde las 16:42», no «heartbeat_ts < now-300»).

La verdad vive en el servidor: la página solo pinta. Escribe esta lógica como una
clase pura y testeable (un «evaluador» que recibe lecturas y devuelve el JSON del
contrato) y cúbrela con tests unitarios para cada transición de estado.

### 3. Expón dos rutas protegidas

1. **Página** (`GET /admin/system/health` o la ruta que siga la convención del
   proyecto): sirve `assets/status-page.html` con el JSON inicial inyectado en
   `<script id="pulso-seed">` y `data-endpoint` apuntando a la ruta JSON.
2. **JSON** (`GET …/health/status`): devuelve el mismo documento.

Ambas exigen sesión de administrador y responden con `Cache-Control: private, no-store`.
La página lleva `noindex`. Cuando la sesión caduca, el JSON debe responder 401/403 o
redirigir al login: la página lo detecta y lo explica. Ejemplos por framework en
`references/adapters.md`.

Al inyectar la semilla, escapa `<` como `<` (o usa la función de tu framework
que lo hace, como `JSON_HEX_TAG` en PHP) para que el JSON no pueda cerrar la etiqueta.

### 4. Adapta la plantilla

Copia `assets/status-page.html` al proyecto (como plantilla del motor que use:
Twig, Blade, Jinja, ERB, JSX…) y ajusta solo lo previsto:

- **Variables de marca** en `:root` (tipografía, colores base, radio). Usa la
  tipografía y los colores del proyecto si existen; mantén la semántica de colores
  de estado (verde, ámbar, gris, rojo).
- **Textos** en el objeto `TEXT` del script, y `lang` en `<html>`, para otro idioma.
- **Enlaces** del pie (`links` en el JSON), por ejemplo a la página de colas o a los logs.

No reescribas el esquema ni el modal: lee `references/design.md` para saber qué
decisiones de diseño sostienen la página y cuáles se pueden cambiar.

### 5. Comprueba que funciona

- Previsualiza tu JSON real o de prueba con la plantilla sin levantar el proyecto:
  `node scripts/demo-server.mjs --template ruta/a/plantilla.html --data estado.json`.
  Con `--data` no hay semilla dinámica: úsalo para revisar el diseño.
- Revisa los escenarios de la demo (`?scenario=ok`, `ko`, `live`, `empty`) y el tema
  oscuro (`?theme=dark`) para comparar.
- En el proyecto, verifica: todo bien, una pieza en `attention`, una en `off`, una en
  `error`, el backend caído (aviso de conexión), la sesión caducada (aviso con enlace
  al login), móvil (columna única) y `prefers-reduced-motion`.
- Abre un modal y comprueba que la URL cambia (`#procesos/clave`) y que al recargar
  se abre el mismo detalle.
- Tests: unitarios del evaluador, funcionales de las dos rutas (200 con permisos,
  redirección o 401/403 sin ellos, `Content-Type: application/json` en la ruta JSON).

## Reglas

- La página nunca consulta la base de datos ni servicios por su cuenta: solo pinta el JSON.
- Las claves (`key`) son estables entre refrescos. Si cambian las piezas, la página
  se reconstruye sola, pero conviene no renombrarlas.
- `detail` es una frase corta de estado. Lo largo va en `description`, que solo
  aparece en el modal.
- No metas secretos en `facts`: ni DSN con contraseñas, ni tokens, ni datos personales.
- Mantén el refresco en 10 s o más en producción. Si medir algo es caro, cachea
  la lectura en el servidor.
