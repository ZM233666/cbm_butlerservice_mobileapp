---
name: butler-snippets-api
description: >-
  Integrates with the ButlerService (Snippets API) backend documented by Swagger/OpenAPI.
  Use when implementing or debugging HTTP calls, serializers, or frontend service layers for
  ButlerService; when the user mentions Snippets API, drf-yasg Swagger, captcha/login, work orders,
  or the dev server at 117.62.232.51:8004. Prefer fetching the live schema over guessing paths.
---

# ButlerService / Snippets API

## Authoritative sources (use in this order)

1. **Human, module-oriented spec (this repo)** — [API.md](../../../API.md) at the ButlerService root.  
   Covers real-world conventions: base URL for local/LAN, `code/msg/data` responses, and **`Authorization: JWT <access>`** for `/api/*` (except captcha/login as documented there).

2. **Interactive Swagger UI** — [http://117.62.232.51:8004/](http://117.62.232.51:8004/)  
   Browse tags, parameters, and operationIds.

3. **Machine-readable OpenAPI (Swagger 2.0)** — use for exhaustive path/method lists and codegen:
   - [http://117.62.232.51:8004/swagger.json](http://117.62.232.51:8004/swagger.json)
   - [http://117.62.232.51:8004/swagger.yaml](http://117.62.232.51:8004/swagger.yaml)

## Agent workflow

- **Before** adding a new API call or changing request/response handling: skim the matching section in `API.md`, then confirm path, method, query/body fields, and required headers against `swagger.json` (or YAML) for that path.
- Prefer explicit JSON negotiation headers in examples and integration tests:
  - `-H 'accept: application/json'`
  - For JSON requests: `-H 'Content-Type: application/json'`
- If Swagger **global security** shows `basic` but `API.md` specifies JWT, **follow `API.md`** for this project’s frontend and integration tests.
- Host and scheme in the published schema are `117.62.232.51:8004` and `http`; local development base URLs remain as defined in `API.md`.

## cURL templates

Use these as defaults when sharing runnable examples.

**GET (JWT)**

```bash
curl "http://117.62.232.51:8004/<path>/?<query>" \
  -H "accept: application/json" \
  -H "Authorization: JWT <access>"
```

**POST/PUT/PATCH (JSON + JWT)**

```bash
curl -X POST "http://117.62.232.51:8004/<path>/" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <access>" \
  -d '{"key":"value"}'
```

## Optional: refresh a local schema copy

When offline work or diffing is needed, download the schema into the workspace (do not commit unless the team wants a pinned snapshot):

```bash
curl -sS "http://117.62.232.51:8004/swagger.json" -o swagger.snapshot.json
```

Replace the URL with `swagger.yaml` if YAML is preferred.
