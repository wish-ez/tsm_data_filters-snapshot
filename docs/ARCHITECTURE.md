# Architecture

A short technical walkthrough of what happens when a user submits the form,
and where the interesting bits of the code live.

## 1. Request flow

```
Browser form                Flask (main.py)                 tsm.py
------------                ---------------                 ------
 POST /tsm_data    -->   tsm_data() handler
   apiKey                    reads apiKey,
   ahId                      ahId, regionId, dataUpdate
   regionId                  from request.form
   dataUpdate                reads accessToken + tokenExpires from cookies

                            if no valid access_token:
                              ----------------------->   tsm_get_auth_credentials(
                                                            api_key, client_id)
                              <-----------------------   POST /oauth2/token
                                                         {access_token, expires_in}

                            ----------------------->    get_items(access_token,
                                                                  region_id, ah_id, ...)
                              <-----------------------   dict with
                                                         {'region': {...}, 'ah': {...},
                                                          'errors': [...]}

 JSON response    <--    {'data': {'region', 'ah'},
                          'accessToken', 'tokenExpires',
                          'errors': []}
```

The single server-side endpoint is `/tsm_data`. Everything else — sorting,
filtering, re-rendering, locale switching — happens in
`static/js/scripts.js` in the browser.

## 2. Authentication

TSM uses OAuth2 with an `api_token` grant. The Flask backend exchanges the
user-supplied token for a short-lived bearer access token and caches it in a
browser cookie along with its expiry timestamp. Subsequent requests skip the
token exchange as long as the cached access token is still valid (see
`main.py`, around the `token_expires <= time()` check). The OAuth
`client_id` is read from `config.yml` rather than hard-coded, so the same
code can target a different TSM application without a rebuild.

## 3. Caching

Two layers of cache, both written to the local filesystem as JSON:

- `cache_ah/<ah_id>.json` — one file per auction house, holding the most
  recent pricing snapshot.
- `cache_region/<region_id>.json` — one file per region, holding the most
  recent region-level pricing snapshot.

Each file stores `{id, timestamp, expires, elapsed, items}`. On every
request `get_ah_items` and `get_region_items` (in `tsm.py`) decide between
three branches:

1. Cache hit and user asked to **disable** updates → return cache as-is.
2. Cache hit and not expired and user didn't **force** refresh → return
   cache.
3. Otherwise → hit the TSM API, overwrite the file, return the fresh
   snapshot. On failure the handler appends a message to `errors` but does
   not raise, so a partial response still reaches the browser.

A separate script, `update_realms_cron.py`, lives outside the request path.
It refreshes the realm catalog (game versions, regions, realms, auction
houses), writes a new `static/cache/realms<timestamp>.js` bundle that the
browser loads as a plain `<script>` tag, and updates `realms_cache_file` in
`config.yml` so the template picks up the new filename. The shell wrapper
`update_realms_cron.sh` is what cron actually invokes on the host.

## 4. Data transformation

The TSM responses are verbose and named-dictionary-heavy. Before storing
them, `tsm.py` reduces each item to a fixed-order array keyed by the item
id:

```python
# tsm_format_data_ah:   [minBuyout, marketValue, historical, numAuctions, quantity]
# tsm_format_data_region: [marketValue, historical, avgSalePrice, soldPerDay, salePct, quantity]
```

This does two things: it cuts payload size dramatically compared to a list
of dicts with repeated keys, and it pushes the "meaning" of each slot into
a single documented comment instead of scattering it across every item.
The browser uses the same positional convention when it builds table rows.

The realms catalog in `format_realms` goes through a similar pass: it
groups realms under `{gameVersion -> region -> realm}` buckets, sorts each
level by localized name, renames a couple of legacy TSM labels (e.g.
`Wrath` → `WotLK`), and drops fields that the front-end never reads.

## 5. Why this is a reasonable small project

- **Real external integration.** OAuth2 token exchange, authenticated REST
  calls, and error paths that have to survive a flaky upstream.
- **Explicit caching story.** Two-tier, TTL-driven, user-overridable from
  the UI, plus a decoupled catalog-refresher that writes a versioned static
  bundle.
- **Front-end/back-end split.** The server only returns data; all
  filtering, sorting, locale handling and cookie persistence sit in the
  browser, which keeps the Python side short.
- **Small, self-contained, runnable.** No database, no queue, no
  background worker — just Flask, a cron script and a YAML config.
