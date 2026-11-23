#!/usr/bin/env node
// Servidor de demostración de Pulso, sin dependencias.
//
//   node demo-server.mjs                       → http://localhost:4173 con datos que cambian solos
//   node demo-server.mjs --port 8080
//   node demo-server.mjs --template ruta/a/mi-pagina.html --data ruta/a/estado.json
//
// Escenarios (parámetro ?scenario= en la URL): live (por defecto), ok, ko, empty.
// Otros parámetros: ?theme=dark|light para forzar el tema.
// También sirve de adaptador de referencia: inyecta el JSON inicial en
// <script id="pulso-seed"> y expone el mismo JSON en /status.

import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
  arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []));
const port = Number(args.port || process.env.PORT || 4173);
const templatePath = resolve(args.template || resolve(here, '../assets/status-page.html'));
const dataPath = args.data ? resolve(args.data) : null;

/* ── Datos de ejemplo: una tienda online ficticia ─────────────────────────── */
const SERVICE = 'Tienda Brezo';
const minutes = (n) => new Date(Date.now() - n * 60_000).toISOString();
const clock = (date = new Date()) => date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

// Serie pseudoaleatoria estable que avanza con el tiempo (misma forma en cada petición del mismo minuto).
function series(seed, base, spread, length = 30, spikeAt = -1) {
  const tick = Math.floor(Date.now() / 10_000);
  return Array.from({length}, (_, i) => {
    const x = tick - length + i;
    const wave = Math.sin((x + seed) * 0.45) * 0.5 + Math.sin((x + seed * 3) * 0.17) * 0.5;
    const spike = i >= length + spikeAt && spikeAt < 0 && spikeAt > -length ? spread * 2.2 : 0;
    return Math.max(0, Math.round((base + wave * spread + spike) * 10) / 10);
  });
}
// Últimas 24 comprobaciones: el patrón describe las más recientes (a activo, w revisar, o apagado, e error).
const STATES = {a: 'active', w: 'attention', o: 'off', e: 'error'};
const history = (recent = '') => [...'a'.repeat(24 - recent.length) + recent].map((c) => STATES[c]);

function scenario(name) {
  const ko = name === 'ko';
  const phase = Math.floor(Date.now() / 1000) % 60;
  const live = name === 'live';
  const mailWorking = live ? phase % 14 < 7 : !ko;
  const gatewaySlow = ko || (live && phase >= 40);
  const now = new Date();

  const nodes = [
    // Procesos · carril izquierdo
    {key: 'payments', label: 'Comprobación de pagos', status: 'active', detail: 'Esperando tareas', lane: 'workers',
      description: 'Confirma con la pasarela los pagos que quedaron pendientes y marca los pedidos como pagados.',
      since: minutes(312), history: history(), facts: {'Cola': 'payments', 'Procesos': '2 de 2', 'Mensajes en cola': 0, 'Último trabajo': clock(new Date(Date.now() - 41_000))},
      links: [{label: 'Ver la cola', href: '#procesos/payments'}]},
    {key: 'payments-pending', parent: 'payments', label: 'Pedidos pendientes de pago', status: 'active', detail: 'Sin pagos pendientes'},
    {key: 'mail', label: 'Correos y avisos', status: mailWorking ? 'working' : 'active', detail: mailWorking ? 'En curso: confirmación de pedido' : 'Esperando tareas', lane: 'workers',
      description: 'Envía confirmaciones de pedido, avisos de envío y recordatorios de carrito.',
      since: minutes(1), history: history(), facts: {'Cola': 'mail', 'Enviados hoy': 1284, 'Mensajes en cola': mailWorking ? 3 : 0}},
    {key: 'stock', label: 'Sincronización de stock', status: ko ? 'off' : 'active', detail: ko ? 'Sin señal desde las 16:42' : 'Esperando tareas', lane: 'workers',
      description: 'Importa existencias del almacén cada cinco minutos.',
      since: ko ? minutes(27) : minutes(1440), history: history(ko ? 'aaaooooo' : ''),
      facts: {'Cola': 'stock', 'Procesos': ko ? '0 de 1' : '1 de 1', 'Mensajes en cola': ko ? 46 : 0},
      links: [{label: 'Cómo reiniciarlo', href: 'https://example.com/runbooks/stock'}]},
    {key: 'feeds', label: 'Exportaciones y feeds', status: 'active', detail: 'Esperando tareas', lane: 'workers',
      since: minutes(2880), history: history(), facts: {'Cola': 'feeds', 'Último feed': clock(new Date(Date.now() - 600_000))}},
    {key: 'search', label: 'Indexado del buscador', status: 'active', detail: 'Esperando tareas', lane: 'workers',
      since: minutes(600), history: history(), facts: {'Cola': 'search', 'Productos indexados': '18.240'}},

    // Procesos · carril derecho
    {key: 'database-link', label: 'Base de datos', status: 'active', detail: 'Responde en 4 ms', lane: 'services',
      description: 'Conexión de la aplicación con la base de datos principal.', history: history(), since: minutes(4000)},
    {key: 'scheduler', label: 'Programador', status: 'active', detail: `Última señal a las ${clock(new Date(Date.now() - 20_000))}`, lane: 'services',
      description: 'Lanza las tareas periódicas. Si se para, ninguna de sus tareas se ejecuta.', since: minutes(1440), history: history()},
    {key: 'cron-payments', parent: 'scheduler', label: 'Consultas de pago', status: 'active', detail: 'Cada minuto'},
    {key: 'cron-sitemaps', parent: 'scheduler', label: 'Regenerar sitemaps', status: 'active', detail: 'Cada hora'},
    {key: 'cron-carts', parent: 'scheduler', label: 'Limpiar carritos abandonados', status: 'active', detail: 'Cada noche a las 3:00'},
    {key: 'failed', label: 'Tareas fallidas', status: ko ? 'error' : 'active', detail: ko ? '3 tareas fallidas en la última hora' : 'Ninguna', lane: 'services',
      description: 'Tareas que agotaron los reintentos y esperan a que alguien las revise.',
      since: ko ? minutes(18) : minutes(2000), history: history(ko ? 'aaaaeeee' : ''),
      facts: ko ? {'Sincronizar stock #8812': 'Tiempo de espera agotado', 'Sincronizar stock #8813': 'Tiempo de espera agotado', 'Enviar factura #1204': 'Destinatario rechazado'} : {},
      links: ko ? [{label: 'Revisar tareas fallidas', href: '#procesos/failed'}] : []},

    // Infraestructura
    {key: 'db', tab: 'infra', group: 'Datos', label: 'Base de datos', status: 'active', detail: 'MariaDB 10.11 · réplica al día',
      gauge: {value: 18, max: 150, unit: 'conexiones'}, series: series(1, 4, 1.2), seriesLabel: 'Latencia de consultas, últimos 5 min (ms)',
      history: history(), since: minutes(4000), facts: {'Versión': '10.11.9', 'Retraso de la réplica': '0 s', 'Consultas lentas (1 h)': 2}},
    {key: 'cache', tab: 'infra', group: 'Datos', label: 'Caché', status: 'active', detail: 'Acierto del 97 %',
      gauge: {value: 412, max: 1024, unit: 'MB'}, series: series(4, 97, 1), seriesLabel: 'Porcentaje de aciertos',
      history: history(), facts: {'Claves': '184.302', 'Expulsadas (1 h)': 0}},
    {key: 'disk', tab: 'infra', group: 'Datos', label: 'Disco', status: ko ? 'attention' : 'active', detail: ko ? 'Quedan 9 GB libres' : 'Quedan 37 GB libres',
      gauge: {value: ko ? 91 : 63, max: 100, unit: '%'}, history: history(ko ? 'aawwwwww' : ''),
      description: ko ? 'Los registros de la aplicación crecen más de lo normal desde esta mañana.' : undefined,
      facts: {'Volumen': '/var/lib', 'Tamaño': '100 GB'}},
    {key: 'cpu', tab: 'infra', group: 'Servidor', label: 'CPU', status: 'active', detail: '4 núcleos',
      gauge: {value: Math.round(series(7, 34, 12).at(-1)), max: 100, unit: '%'}, series: series(7, 34, 12), seriesLabel: 'Uso, últimos 5 min (%)', history: history()},
    {key: 'memory', tab: 'infra', group: 'Servidor', label: 'Memoria', status: 'active', detail: 'Sin uso de swap',
      gauge: {value: 5.1, max: 8, unit: 'GB'}, series: series(9, 5.1, 0.3), seriesLabel: 'En uso, últimos 5 min (GB)', history: history()},
    {key: 'gateway', tab: 'infra', group: 'Servicios externos', label: 'Pasarela de pago', status: gatewaySlow ? 'attention' : 'active',
      detail: gatewaySlow ? 'Responde lenta: 1,8 s' : 'Responde en 180 ms',
      series: gatewaySlow ? series(11, 420, 80, 30, -6).map((v, i) => i > 23 ? v * 3.6 : v) : series(11, 180, 30), seriesLabel: 'Tiempo de respuesta (ms)',
      history: history(gatewaySlow ? 'aaaaaaww' : ''), since: gatewaySlow ? minutes(4) : minutes(900),
      links: [{label: 'Estado del proveedor', href: 'https://example.com/status'}]},
    {key: 'smtp', tab: 'infra', group: 'Servicios externos', label: 'Correo saliente', status: 'active', detail: 'Entrega normal',
      gauge: {value: 1284, max: 5000, unit: 'envíos hoy'}, history: history()},
    {key: 'cdn', tab: 'infra', group: 'Servicios externos', label: 'CDN de imágenes', status: 'active', detail: 'Acierto del 99 %', history: history()},
  ];

  const events = [
    ...(ko ? [
      {at: minutes(18), status: 'error', title: 'Tres tareas han fallado', detail: 'Agotaron los reintentos al sincronizar stock y enviar una factura.', node: 'failed'},
      {at: minutes(27), status: 'off', title: 'La sincronización de stock dejó de dar señal', detail: 'El último proceso salió con código 137 (sin memoria).', node: 'stock'},
      {at: minutes(95), status: 'attention', title: 'El disco ha pasado del 85 %', node: 'disk'},
    ] : []),
    ...(gatewaySlow ? [{at: minutes(4), status: 'attention', title: 'La pasarela de pago responde lenta', detail: 'Más de un segundo en las últimas comprobaciones.', node: 'gateway'}] : []),
    {at: minutes(140), status: 'active', title: 'El correo saliente vuelve a entregar', detail: 'Se enviaron los 212 correos que esperaban en cola.', node: 'smtp'},
    {at: minutes(152), status: 'error', title: 'El correo saliente rechaza conexiones', node: 'smtp'},
    {at: minutes(60 * 26), status: 'active', title: 'Procesos reiniciados tras el despliegue', detail: 'Versión 4.12.0.'},
  ];

  if (name === 'empty') return {service: SERVICE, checkedAt: now.toISOString(), nodes: [], events: []};

  return {
    service: SERVICE,
    checkedAt: now.toISOString(),
    refreshSeconds: 5,
    lanes: [
      {key: 'workers', label: 'Procesadores de tareas', side: 'left'},
      {key: 'services', label: 'Programación y servicios', side: 'right'},
    ],
    nodes,
    events,
    links: [{label: 'Ver colas y procesos', href: '#procesos'}],
  };
}

/* ── Servidor ─────────────────────────────────────────────────────────────── */
async function payload(name) {
  if (dataPath) return JSON.parse(await readFile(dataPath, 'utf8'));
  return scenario(name);
}
const toSeed = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const name = ['ok', 'ko', 'live', 'empty'].includes(url.searchParams.get('scenario')) ? url.searchParams.get('scenario') : 'live';
  try {
    if (url.pathname === '/status') {
      response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
      response.end(JSON.stringify(await payload(name)));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const theme = ['dark', 'light'].includes(url.searchParams.get('theme')) ? url.searchParams.get('theme') : null;
      const seed = toSeed(await payload(name));
      let html = await readFile(templatePath, 'utf8');
      html = html
        .replace(/(<script type="application\/json" id="pulso-seed">)[\s\S]*?(<\/script>)/, (_, open, close) => open + seed + close)
        .replace(/data-endpoint="[^"]*"/, `data-endpoint="/status?scenario=${name}"`);
      if (theme) html = html.replace('<html lang="es">', `<html lang="es" data-theme="${theme}">`);
      response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      response.end(html);
      return;
    }
    response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    response.end('No encontrado');
  } catch (error) {
    response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
    response.end(String(error));
  }
}).listen(port, () => {
  console.log(`Pulso en http://localhost:${port}  (escenarios: ?scenario=live|ok|ko|empty, tema: ?theme=dark)`);
});

