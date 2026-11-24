# Framework adapters

Every adapter follows the same pattern:

1. An **assessor** (pure class or function) that takes the readings and returns the
   contract document. It is the only piece with logic, and the one you test.
2. An **HTML** route that renders `status-page.html` with the seed and the endpoint.
3. A **JSON** route with the same document.
4. Both routes protected by the admin role and sent with `Cache-Control: private, no-store`.

The template doesn't clash with Twig, Jinja, Blade or ERB: it contains no `{{`, `{%`,
`{#` or `<%`. Each adapter changes only two things in the HTML (plus `lang`, if the page
isn't in English):

```html
<main class="board" id="pulso" data-endpoint="/status">         <!-- URL of the JSON -->
<script type="application/json" id="pulso-seed">null</script>   <!-- initial JSON -->
```

If you leave the seed as `null`, the page fetches the JSON as soon as it loads ("Checking…"
shows for a moment). If you remove `data-endpoint`, the page is static and never refreshes.

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

- In CQRS projects the assessor is a domain service exposed through a query
  (`GetSystemHealthQuery`) on the query bus; the controller doesn't know the sources.
- When the firewall redirects to the login page, `fetch` follows the redirect and gets
  HTML: the page treats that as an expired session. Don't catch `AccessDeniedException`
  in an exception listener, or it will turn into a 500.
- Messenger heartbeats are written from a subscriber to `WorkerRunningEvent`,
  `WorkerStartedEvent` and `WorkerStoppedEvent`.

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

- Without a session, Laravel answers 401 when the request carries
  `Accept: application/json` (the page sends it).
- Horizon already exposes the state of supervisors and queues: read it from the assessor.

## Django (templates or Jinja)

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

`json_script` already outputs `<script id="pulso-seed" type="application/json">` with the
right escaping: delete the original `pulso-seed` tag from the template.

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

`scripts/demo-server.mjs` is a complete, runnable example of this adapter.

## Next.js (App Router)

- `app/admin/health/status/route.ts`: a `GET` that checks the session and returns
  `NextResponse.json(await assess(), {headers: {'Cache-Control': 'private, no-store'}})`,
  with `export const dynamic = 'force-dynamic'`.
- The page: either a route handler that serves the HTML as in Express (simplest, keeps
  the template intact), or `public/status-page.html` with the seed left as `null` and
  `data-endpoint` pointing at the route, protected by middleware.
- Don't turn the template into React components unless the user asks: you would lose
  portability and the behaviour that has already been tested.

## Rails (ERB)

```erb
<main class="board" id="pulso" data-endpoint="<%= admin_health_status_path %>">
…
<script type="application/json" id="pulso-seed"><%= json_escape(@health.to_json).html_safe %></script>
```

Controller with `before_action :require_admin` and
`response.headers['Cache-Control'] = 'private, no-store'`.

## Go (`net/http`)

```go
//go:embed status-page.html
var page string

func health(w http.ResponseWriter, r *http.Request) {
	seed, _ := json.Marshal(assess(r.Context())) // Marshal already escapes <, > and &
	html := strings.Replace(page, `id="pulso-seed">null<`, `id="pulso-seed">`+string(seed)+`<`, 1)
	html = strings.Replace(html, `data-endpoint="/status"`, `data-endpoint="/admin/health/status"`, 1)
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	io.WriteString(w, html)
}

func healthStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(assess(r.Context()))
}
```

Wrap both handlers in the project's admin middleware.

## Testing without the project

```bash
node scripts/demo-server.mjs --template path/to/your-template.html --data path/to/status.json
```

Serves your template with your JSON at `http://localhost:4173`, to review the design
before wiring it in. With `--data` the seed is static: refreshes return the same file.
