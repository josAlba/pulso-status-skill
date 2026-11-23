# Sistema visual

Pulso está pensada para mirarse de reojo, a varios metros o en mitad de una
incidencia. Cada decisión de diseño sirve para eso.

## Lo que sostiene la página (no lo cambies)

1. **El veredicto es lo primero.** Una frase en lenguaje llano, enorme (hasta 4 rem,
   peso 800). Responde «¿funciona todo?» antes de que nadie lea una tarjeta.
2. **Un solo color de estado domina.** La franja superior de 8 px, el anillo del
   núcleo, el favicon y el título de la pestaña cambian a la vez con el veredicto. Se
   ve el estado aunque la pestaña esté en segundo plano.
3. **El color nunca va solo.** Cada estado tiene también forma y texto: `off` usa
   punto hueco y borde discontinuo; `error`, cable discontinuo rojo y barra lateral;
   todas las píldoras dicen el estado con palabras.
4. **El movimiento significa algo.** Las partículas solo viajan por cables de piezas
   vivas: rápidas y numerosas si `working`, lentas si `attention`, ninguna si `off` o
   `error`. El núcleo late despacio. Nada más se mueve sin que el usuario actúe.
   Con `prefers-reduced-motion` todo queda quieto.
5. **El detalle está a un clic, nunca en la vista principal.** Las tarjetas dicen una
   sola frase. Descripción, historial, tendencias, datos y enlaces van al modal.
   Excepción: las tarjetas del mapa de infraestructura explican la arquitectura, así
   que llevan la descripción (dos líneas como mucho) y hasta cuatro datos. Historial,
   tendencia y enlaces siguen en el modal.
6. **Superficies neutras.** Fondo glaciar frío, tarjetas casi blancas, una sola sombra
   (la del modal). Así el color de estado es lo único que destaca.

## Lo que se adapta a cada proyecto

Todas las variables están al principio del `<style>`:

| Variable | Uso | Consejo |
|---|---|---|
| `--font` | Toda la página | La tipografía de la marca, si tiene una sans con peso 800 para el veredicto. Si es una serif, úsala solo en `h1`. |
| `--glacier`, `--paper`, `--ink`, `--muted`, `--rule` | Superficies y texto | Neutros fríos o cálidos según la marca. Mantén el contraste AA de `--muted` sobre `--glacier`. |
| `--disc`, `--disc-ink` | Núcleo | Por defecto, el color de tinta. Puede ser el color principal de la marca si es oscuro. |
| `--active`, `--attention`, `--off`, `--error` | Estados | Ajusta el tono, no el significado: verde, ámbar, gris, rojo. |
| `--attention-ink` | Texto ámbar | El ámbar puro no llega al contraste AA como texto. |
| `--radius` | Tarjetas | 6–14 px. |

Hay un bloque equivalente para el modo oscuro (`prefers-color-scheme` y
`data-theme="dark"` en `<html>` para forzarlo, útil en pantallas de oficina).

### Fuentes

La plantilla no descarga fuentes: usa `Poppins` si la página la tiene cargada y, si no,
la del sistema. Para usar la de la marca, añade su `@font-face` (servida por el propio
proyecto, con `font-display: swap`) y ponla primera en `--font`.

### Textos e idioma

El objeto `TEXT` del script contiene todas las frases, con plurales. Para otro idioma,
tradúcelo y cambia `lang` en `<html>`: fechas, horas y números usan `Intl` con ese idioma.
Las etiquetas de la pestaña y el aviso `noscript` están en el HTML.

## Composición

```
┌──────────────────────────────────────────────────────────────┐ ← franja de estado
│ Todo funciona                         13 piezas en marcha.   │
│                                       Comprobado a las…      │
│ Procesos •   Infraestructura •   Eventos 2                   │
│ ─────────────────────────────────────────────────────────────│
│ Carril izq.           ╭─────╮            Carril dcho.        │
│ [tarjeta]─────╮       │núcleo│      ╭────[tarjeta]           │
│ [tarjeta]─────┼──────▶│     │◀─────┼────[tarjeta]           │
│ [tarjeta]─────╯       ╰─────╯      ╰────[tarjeta]           │
│ ─────────────────────────────────────────────────────────────│
│ • Activo • Trabajando • Revisar ○ Apagado • Error   Enlaces  │
└──────────────────────────────────────────────────────────────┘
```

- Por debajo de 900 px el esquema pasa a una columna con el núcleo arriba y sin cables.
- Las pestañas solo aparecen si hay más de una con contenido. Su contador indica las
  piezas con problemas y toma el color de la peor.
- Infraestructura: si hay conexiones (`connects`), primero el mapa: una columna por
  paso del recorrido de una petición, piezas centradas en vertical y cables curvos
  que salen del lateral de la tarjeta, repartidos para no salir del mismo punto. Por
  debajo de 1100 px las columnas se apilan y los cables desaparecen (las conexiones
  siguen en el modal). Después, rejilla automática de tarjetas de 260 px o más,
  agrupadas, para las piezas sin conexiones.
- Los iconos del mapa están en `ICONS`, en el script: trazo de 1,7 px sobre 24×24.
  Añade los que falten con el mismo estilo; un nombre desconocido muestra el punto de estado.
- Eventos: línea de tiempo de hasta 860 px de ancho.

## Accesibilidad

- Pestañas con `role="tablist"`, flechas, Inicio y Fin.
- Cada tarjeta es un botón (el nombre se extiende a toda la tarjeta); las subpiezas
  son botones propios.
- Modal con `<dialog>` nativo: atrapa el foco, se cierra con Esc, con la X o pulsando
  fuera, y devuelve el foco al cerrar.
- El estado se anuncia en texto (píldoras, oculto en las subpiezas) y el aviso de
  conexión usa `role="status"`.

## Ideas de extensión (solo si se piden)

- **Modo pantalla**: con `?pantalla`, ocultar el pie y rotar las pestañas cada 20 s.
- **Sonido o notificación** al pasar a `error` (con permiso explícito del usuario).
- **Página pública** para clientes: otra plantilla, sin `facts` ni detalles internos.
