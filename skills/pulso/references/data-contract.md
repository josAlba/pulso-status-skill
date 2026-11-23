# Contrato de datos

La página consume un único documento JSON, tanto en la semilla inicial
(`<script id="pulso-seed">`) como en cada refresco (`data-endpoint`). Todos los campos
son opcionales salvo los marcados como obligatorios.

## Documento

```jsonc
{
  "service": "Tienda Brezo",              // nombre en el núcleo y en el título de la pestaña
  "status": "attention",                  // veredicto general; si falta, se calcula
  "headline": "Hay una cosa que revisar",  // frase grande; si falta, se calcula
  "summary": "Todo sigue en marcha.",     // frase de apoyo; si falta, se calcula
  "checkedAt": "2026-11-23T17:00:33+01:00", // ISO 8601, momento de la medición (obligatorio en producción)
  "refreshSeconds": 10,                   // cada cuánto vuelve a pedir el JSON
  "lanes": [                              // carriles de la pestaña Procesos
    {"key": "workers",  "label": "Procesadores de tareas",   "side": "left"},
    {"key": "services", "label": "Programación y servicios", "side": "right"}
  ],
  "nodes": [ /* piezas, ver abajo */ ],
  "events": [ /* cambios recientes, ver abajo; si falta, no hay pestaña Eventos */ ],
  "links": [ {"label": "Ver colas y procesos", "href": "/admin/queues"} ]  // pie de página
}
```

## Estados

| Valor | Significa | Color | Cuenta como |
|---|---|---|---|
| `active` | Funciona y tiene señal reciente | verde | sano |
| `working` | Funciona y está haciendo algo ahora mismo (señal que late) | verde | sano |
| `attention` | Sigue funcionando, pero hay algo que revisar | ámbar | aviso |
| `off` | Parado o sin señal: no procesa nada | gris, discontinuo | parado |
| `error` | La última ejecución o comprobación falló | rojo | parado |

Un valor desconocido se trata como `off`.

## Pieza (`nodes[]`)

```jsonc
{
  "key": "stock",                     // obligatorio, único y estable
  "label": "Sincronización de stock", // obligatorio
  "status": "off",                    // obligatorio
  "detail": "Sin señal desde las 16:42", // frase corta bajo el nombre

  "tab": "processes",                 // "processes" (por defecto) o "infra"
  "lane": "workers",                  // solo procesos de primer nivel: carril donde va
  "parent": null,                     // clave de la pieza madre: se pinta como subpieza
  "group": "Datos",                   // solo infraestructura: título del grupo

  "gauge": {"value": 91, "max": 100, "unit": "%"},  // cifra grande y barra (infra y modal)
  "series": [12, 14, 13, 40],         // tendencia, de más antigua a más reciente (infra y modal)
  "seriesLabel": "Latencia (ms)",

  // Solo infraestructura: mapa de conexiones (ver «Reglas de pintado»)
  "connects": ["db", "cache", {"to": "disk", "passive": true}], // piezas a las que llama
  "column": 2,                        // fuerza la columna del mapa (0 = la primera)
  "icon": "cpu",                      // globe, server, cpu, database, bolt, queue, disk, mail, cloud, card, clock, search
  "meta": "php-fpm · pool www",       // identificación técnica bajo el nombre
  "value": "3 activos · 9 en espera", // cifra en texto, si no hay gauge
  "tag": "12 ms",                     // dato corto junto a la cifra (latencia, versión…)

  "description": "Importa existencias del almacén cada cinco minutos.", // texto largo del modal
  "since": "2026-11-23T16:42:00+01:00", // desde cuándo está en este estado
  "history": ["active", "active", "off"], // últimas comprobaciones, de más antigua a más reciente
  "facts": {"Cola": "stock", "Procesos": "0 de 1"}, // tabla clave-valor del modal
  "links": [{"label": "Cómo reiniciarlo", "href": "https://wiki/runbooks/stock"}]
}
```

Reglas de pintado:

- **Procesos**: las piezas de primer nivel (`parent` vacío) con `tab: "processes"` son
  tarjetas conectadas al núcleo por un cable animado. Sus hijas aparecen dentro de la
  tarjeta como subpiezas. Si una pieza no indica un carril válido, va al último carril.
  Si no hay `lanes`, las piezas se reparten mitad y mitad.
- **Infraestructura**: las piezas con `tab: "infra"` se agrupan por `group`, en el
  orden en que aparecen. `gauge` (o `value`) muestra la cifra y la barra; `series`, la tendencia.
- **Mapa de infraestructura**: si alguna pieza de infraestructura trae `connects`, la
  pestaña empieza con un mapa del camino que recorre una petición, de izquierda a
  derecha (visitantes → servidor web → aplicación → base de datos y caché). Las piezas
  conectadas se colocan en columnas: cada una va a la derecha de quien la llama, y las
  que solo llaman a otras van justo antes de la primera a la que llaman. Si la columna
  calculada no te convence, fíjala con `column`. Por los cables viajan señales como en
  Procesos, con el estado del peor de sus dos extremos. Una conexión `passive` (disco,
  montajes, ficheros compartidos) se pinta discontinua y sin señales. Las tarjetas del
  mapa muestran icono, `meta`, la descripción en dos líneas, la cifra con su `tag`,
  `detail` y los cuatro primeros `facts`. Las piezas sin conexiones (CPU, memoria,
  servicios externos…) siguen debajo, agrupadas por `group`. En el modal, cada pieza
  del mapa lista a qué piezas se conecta y cuáles la llaman.
- **Modal**: cualquier pieza o subpieza se abre con un clic y muestra todo lo anterior.
  La URL cambia a `#procesos/<key>` o `#infra/<key>` para poder compartirla.
- Los `href` solo se aceptan si empiezan por `http(s)://`, `/`, `.`, `#` o `?`.

`gauge.unit` se muestra tras la cifra. Con `max` y una unidad distinta de `%`, se
lee «412 de 1024 MB».

## Veredicto calculado

Si el JSON no trae `status`, `headline` o `summary`, la página los calcula a partir de
las piezas de primer nivel (las subpiezas no cuentan aparte):

1. Alguna en `off` o `error` → `error`, «Hay una pieza parada» / «Hay N piezas paradas».
2. Si no, alguna en `attention` → `attention`, «Hay una cosa que revisar».
3. Si no → `active`, «Todo funciona», «N piezas en marcha.».

Es preferible calcularlo en el servidor, con el vocabulario del negocio («Hay un
proceso parado», «Los pagos van con retraso»), y dejar el cálculo del cliente como red
de seguridad.

## Eventos (`events[]`)

```jsonc
{
  "at": "2026-11-23T16:42:00+01:00", // obligatorio
  "status": "off",                    // color del punto
  "title": "La sincronización de stock dejó de dar señal", // obligatorio
  "detail": "El proceso salió con código 137 (sin memoria).",
  "node": "stock"                     // si existe, el título abre el modal de esa pieza
}
```

Se ordenan del más reciente al más antiguo. La pestaña muestra cuántos hay de las
últimas 24 horas. Registra solo cambios de estado, no cada comprobación: guárdalos al
evaluar (comparando con el estado anterior) o calcúlalos a partir del historial.

## Respuestas especiales del endpoint

| Respuesta | La página muestra |
|---|---|
| 200 con JSON | Los datos nuevos |
| 401, 403, redirección o HTML con 200 | «La sesión ha caducado» con enlace para volver a entrar |
| Error de red o 5xx | «No se puede consultar el estado», atenúa el esquema y sigue reintentando |
| `checkedAt` con más de 3 refrescos (y más de 60 s) de antigüedad | Aviso de datos viejos |
