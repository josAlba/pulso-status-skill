# Adaptadores por framework

Todos siguen el mismo patrón:

1. Un **evaluador** (clase o función pura) que recibe las lecturas y devuelve el
   documento del contrato. Es la única pieza con lógica y la que se testea.
2. Una ruta **HTML** que pinta `status-page.html` con la semilla y el endpoint.
3. Una ruta **JSON** con el mismo documento.
4. Las dos rutas, protegidas por el rol de administrador y con `Cache-Control: private, no-store`.

La plantilla no choca con Twig, Jinja, Blade ni ERB: no contiene `{{`, `{%`, `{#` ni `<%`.
En cada adaptador solo cambian dos cosas del HTML:

```html
<main class="board" id="pulso" data-endpoint="/status">           <!-- la URL del JSON -->
<script type="application/json" id="pulso-seed">null</script>   <!-- el JSON inicial -->
```

Si dejas la semilla en `null`, la página pide el JSON nada más cargar (se ve
«Comprobando…» un instante). Si quitas `data-endpoint`, la página es estática y no refresca.

## Symfony (Twig)

```php
#[IsGranted('ROLE_ADMIN')]
final class SystemHealthController extends AbstractController
{
    public function __construct(private readonly SystemHealthAssessor $assessor) {}

    #[Route('/admin/system/health', name: 'admin_system_health')]
    public function index(): Response
    {
        $response = $this->render('admin/system/health.html.twig', ['health' => $this->assessor->assess()]);
        $response->headers->set('Cache-Control', 'private, no-store');
        return $response;
    }

    #[Route('/admin/system/health/status', name: 'admin_system_health_status')]
    public function status(): JsonResponse
    {
        $response = $this->json($this->assessor->assess());
        $response->headers->set('Cache-Control', 'private, no-store');
        return $response;
    }
}
```

```twig
<main class="board" id="pulso" data-endpoint="{{ path('admin_system_health_status') }}">
…
<script type="application/json" id="pulso-seed">{{ health|json_encode(constant('JSON_HEX_TAG') b-or constant('JSON_HEX_AMP') b-or constant('JSON_UNESCAPED_UNICODE'))|raw }}</script>
```

- En proyectos con CQRS, el evaluador es un servicio de dominio y lo expone una query
  (`GetSystemHealthQuery`) por el query bus; el controlador no conoce las fuentes.
- Cuando el firewall redirige al login, `fetch` sigue la redirección y recibe HTML:
  la página lo detecta como sesión caducada. No captures `AccessDeniedException` en
  un listener de excepciones o se convertirá en un 500.
- Los latidos de Messenger se escriben desde un subscriber de `WorkerRunningEvent`,
  `WorkerStartedEvent` y `WorkerStoppedEvent`.

## Laravel (Blade)

```php
Route::middleware(['auth', 'can:admin'])->prefix('admin/system')->group(function () {
    Route::get('health', fn (HealthAssessor $a) => response()
        ->view('admin.health', ['health' => $a->assess()])
        ->header('Cache-Control', 'private, no-store'));
    Route::get('health/status', fn (HealthAssessor $a) => response()
        ->json($a->assess())
        ->header('Cache-Control', 'private, no-store'))->name('admin.health.status');
});
```

```blade
<main class="board" id="pulso" data-endpoint="{{ route('admin.health.status') }}">
…
<script type="application/json" id="pulso-seed">{!! json_encode($health, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) !!}</script>
```

- Para el JSON sin sesión, Laravel devuelve 401 si la petición lleva `Accept: application/json` (la página lo envía).
- Horizon ya expone el estado de supervisores y colas: léelo desde el evaluador.

## Django (plantillas o Jinja)

```python
@staff_member_required
@never_cache
def health(request):
    return render(request, "admin/health.html", {"health": assess()})

@staff_member_required
@never_cache
def health_status(request):
    return JsonResponse(assess())
```

```django
<main class="board" id="pulso" data-endpoint="{% url 'health_status' %}">
…
{{ health|json_script:"pulso-seed" }}
```

`json_script` ya genera `<script id="pulso-seed" type="application/json">` con el
escape correcto: borra la etiqueta `pulso-seed` original de la plantilla.

## Express / Node

```js
import {readFile} from 'node:fs/promises';
const template = await readFile(new URL('./status-page.html', import.meta.url), 'utf8');
const seed = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

app.get('/admin/health', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'private, no-store').type('html').send(template
    .replace('data-endpoint="/status"', 'data-endpoint="/admin/health/status"')
    .replace('id="pulso-seed">null<', `id="pulso-seed">${seed(await assess())}<`));
});
app.get('/admin/health/status', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'private, no-store').json(await assess());
});
```

`scripts/demo-server.mjs` es un ejemplo completo y ejecutable de este adaptador.

## Next.js (App Router)

- `app/admin/health/status/route.ts`: `GET` que comprueba la sesión y devuelve
  `NextResponse.json(await assess(), {headers: {'Cache-Control': 'private, no-store'}})`,
  con `export const dynamic = 'force-dynamic'`.
- La página: o bien un route handler que sirve el HTML como en Express (lo más simple,
  conserva la plantilla intacta), o bien `public/status-page.html` con la semilla en
  `null` y `data-endpoint` apuntando a la ruta, protegido por middleware.
- No conviertas la plantilla en componentes React salvo que el usuario lo pida: perderías
  la portabilidad y el comportamiento ya probado.

## Rails (ERB)

```erb
<main class="board" id="pulso" data-endpoint="<%= admin_health_status_path %>">
…
<script type="application/json" id="pulso-seed"><%= json_escape(@health.to_json).html_safe %></script>
```

Controlador con `before_action :require_admin` y `response.headers['Cache-Control'] = 'private, no-store'`.

## Go (`net/http`)

Usa `html/template` y pasa la semilla como `template.JS` después de escapar `<`, o
reemplaza la cadena `null` como en Express. Responde el JSON con `json.NewEncoder(w)`,
que ya escapa `<`, `>` y `&`.

## Probar sin el proyecto

```bash
node scripts/demo-server.mjs --template ruta/a/tu-plantilla.html --data ruta/a/estado.json
```

Sirve tu plantilla con tu JSON en `http://localhost:4173` para revisar el diseño antes
de integrarla.
