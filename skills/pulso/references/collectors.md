# Qué vigilar y cómo decidir cada estado

Una página de estado solo sirve si sus colores son fiables. Esta guía resume cómo
convertir señales técnicas en los cinco estados del contrato.

## Principios

- **Mide desde fuera del proceso vigilado.** Un worker parado no puede decir que está
  parado. Usa latidos (heartbeats) que el proceso escribe y que otro lee, o consulta
  al supervisor (Docker, systemd, Supervisor, Kubernetes).
- **Ausencia de señal = `off`, no `active`.** Si no hay registro, la pieza está apagada
  hasta que demuestre lo contrario.
- **`error` es un fallo concreto** (última ejecución fallida, conexión rechazada,
  tareas en la cola de fallidas). **`off` es silencio** (sin proceso, sin latido).
- **`attention` avisa antes de que algo se rompa**: retrasos, colas que crecen,
  latencias altas, disco casi lleno, latido que empieza a llegar tarde.
- **Las hijas heredan cuando dependen de la madre.** Si el programador está parado,
  sus tareas también lo están: no cuentes cada tarea como una pieza parada más.
- **Cada comprobación tiene un tiempo máximo** (1–2 s). Una comprobación colgada no
  puede colgar la página: si se agota el tiempo, la pieza pasa a `error` («No responde
  en 2 s»).
- **Cachea lo caro.** Si medir cuesta, guarda la lectura unos segundos en el servidor
  o pon a un proceso a medir en segundo plano y deja que la página lea el resultado.

## Recetas por tipo de pieza

### Worker o consumidor de cola

| Señal | Estado |
|---|---|
| Latido hace menos de 2× su intervalo y ejecutando una tarea | `working` («En curso: envío de correo») |
| Latido reciente, sin tarea | `active` («Esperando tareas») |
| Latido entre 2× y 5× el intervalo, o mensajes listos esperando más de N minutos | `attention` («12 tareas esperando desde hace 14 min») |
| Sin latido o sin proceso | `off` («Sin señal desde las 16:42») |
| El proceso sale con error en bucle, o ha fallado la última tarea sin reintento | `error` |

Para registrar el latido: un listener del evento de «worker en marcha o inactivo» del
framework (Symfony Messenger `WorkerRunningEvent`, Laravel `Looping`, señales de Celery,
eventos de BullMQ) que escribe `{pid, host, rol, tarea_actual, visto_en}` en Redis o en
una tabla. Olvida los latidos de procesos sustituidos: guarda por rol y host, no solo
por PID.

`facts` útiles: cola, procesos vivos de los esperados, mensajes en cola, edad del
mensaje más antiguo, última tarea terminada.

### Programador (cron / scheduler)

- El programador escribe su propio latido en cada tic. Sin latido en 2–3 tics, `off`.
- Cada tarea programada es hija del programador: `detail` con su frecuencia en lenguaje
  llano («Cada hora», «Cada noche a las 3:00») y, si se guarda, la última ejecución.
- Una tarea cuya última ejecución falló pasa a `error`. Una que no se ejecuta desde
  hace más de 2 periodos pasa a `attention`.

### Tareas fallidas (dead letter)

- 0 → `active` («Ninguna»). Más de 0 → `error` («3 tareas fallidas en la última hora»).
- `facts`: las últimas fallidas con su motivo, sin datos personales.
- `links`: a la pantalla donde se reintentan.

### Base de datos

- `SELECT 1` con tiempo máximo. Responde → `active` con la latencia en `detail`.
- Latencia por encima del umbral, réplica con retraso o conexiones por encima del 80 %
  del máximo → `attention`. No responde → `error`.
- `gauge`: conexiones de las máximas. `series`: latencia reciente.

### Caché (Redis, Memcached)

- `PING`. Memoria usada de la máxima en `gauge`. Tasa de aciertos en `detail` o `series`.
- Expulsiones (evictions) en aumento o memoria por encima del 90 % → `attention`.

### Disco, CPU y memoria

- Disco: `attention` por encima del 85 %, `error` por encima del 95 %. Indica cuánto
  queda libre en `detail` («Quedan 9 GB libres»).
- CPU: carga sostenida (media de varios minutos, no un pico) por encima del 85 % → `attention`.
- Memoria: uso de swap o memoria disponible por debajo del 10 % → `attention`.
- En contenedores, mide los límites del contenedor (cgroups), no los del host.

### Servicios externos (pagos, correo, CDN, APIs)

- Comprobación ligera y barata (endpoint de salud, `HEAD`, conexión SMTP sin enviar),
  hecha por un proceso en segundo plano, no en cada carga de la página.
- Latencia alta → `attention`; errores o tiempo agotado → `error`.
- Mejor aún, mide el uso real: porcentaje de llamadas fallidas en los últimos 5 minutos.
- `links`: a la página de estado del proveedor.

### Negocio

Las piezas de negocio son las que más valor dan: «Pedidos pendientes de pago»,
«Feeds publicados hoy», «Correos rebotados». Úsalas como hijas del proceso que las
atiende. Ejemplo: pagos sin confirmar más de 15 minutos → `attention`.

## Historial y eventos

- `history`: guarda el estado de cada pieza en cada evaluación en una lista corta
  (por ejemplo, las últimas 24 en Redis con `LPUSH` + `LTRIM`). Es lo que alimenta la
  tira de comprobaciones del modal.
- `since`: guarda el momento en que cambió el estado; no lo recalcules en cada lectura.
- `events`: al detectar un cambio de estado de una pieza, añade un evento con un título
  en lenguaje llano. Conserva los últimos 50 o las últimas 48 horas.

## Textos

Escribe para quien abre la página en mitad de un problema:

| Mejor | Peor |
|---|---|
| Sin señal desde las 16:42 | heartbeat stale |
| 12 tareas esperando desde hace 14 min | backlog=12 |
| Quedan 9 GB libres | disk 91% |
| Responde lenta: 1,8 s | p95 1800ms |
| Cada noche a las 3:00 | 0 3 * * * |
