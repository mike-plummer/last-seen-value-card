# Last Seen Value Card

A Home Assistant Lovelace custom card that displays the last known value for sensors that update infrequently. When Home Assistant marks a sensor as **Unavailable** even though its last reading is still valid, this card looks back through history and shows the most recent populated state within a configurable time window.

## Requirements

- Home Assistant **2026.5 or later** (visual editor uses `ha-input`; tested on **2026.8**)
- Home Assistant with the **Recorder** integration enabled (this is on by default as a dependency of the **History** integration [also on by default])
- Configured entities must be recorded in history (check **Settings → Devices & Services → Recorder**)

## Installation

### HACS

1. Add this repository as a [custom repository](https://hacs.xyz/docs/faq/custom_repositories/) in HACS (category: **Lovelace**).
2. Install **Last Seen Value Card** (HACS downloads the built bundle from the latest GitHub release).
3. Add the card resource if HACS does not do so automatically:
   - **Dashboard → Edit → Resources → Add Resource**
   - URL: `/hacsfiles/last-seen-value-card/last-seen-value-card.js`
   - Type: **JavaScript Module**

### Manual

1. Download `last-seen-value-card.js` from a release (or run `npm run build`).
2. Copy `dist/last-seen-value-card.js` to `config/www/last-seen-value-card.js`.
3. Add a Lovelace resource:
   - URL: `/local/last-seen-value-card.js`
   - Type: **JavaScript Module**

## Configuration

```yaml
type: custom:last-seen-value-card
title: Slow Sensors
lookback: 7d
show_last_updated: true
refresh_interval: 300
entities:
  - sensor.outdoor_temp
  - entity: sensor.tank_level
    name: Tank Level
    icon: mdi:water
    tap_action:
      action: more-info
    hold_action:
      action: more-info
    double_tap_action:
      action: none
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entities` | list | **required** | One or more entity IDs, or entity objects with optional overrides |
| `lookback` | string | **required** | How far back to search for a last known value |
| `title` | string | — | Optional card header |
| `show_last_updated` | boolean | `false` | Show relative time since the displayed value was last seen |
| `refresh_interval` | number | `300` | Seconds between history reloads; `0` refreshes only on config changes |
| `show_entities` | boolean | `true` | Show the entity row list |
| `show_content` | boolean | `false` | Show a templated markdown content block |
| `content` | string | — | Jinja2 template rendered as markdown (**required** when `show_content: true`) |
| `content_entity_id` | string \| list | — | Entities that trigger template re-renders (defaults to all configured entities) |
| `card_size` | number | — | Estimated content height in 50px units for dashboard layout |
| `show_empty` | boolean | `true` | When `false`, hide the content block if rendered output is empty |
| `text_only` | boolean | `false` | Render content without extra padding (markdown-card style) |

### Templated content

Enable `show_content` to add a markdown section similar to the native markdown card. The `content` field supports standard Home Assistant Jinja2 templates, plus **history-resolved** values from this card.

You can show entity rows, templated content, or both (`show_entities` / `show_content`).

```yaml
type: custom:last-seen-value-card
lookback: 14d
show_entities: true
show_content: true
content: |
  ## Slow sensors
  {% for item in last_seen_list %}
  - **{{ item.name }}**: {{ item.state if item.available else 'Unavailable' }}
    {%- if item.available %} ({{ item.last_changed_relative }}){% endif %}
  {% endfor %}
entities:
  - sensor.rain_gauge
  - sensor.soil_moisture
```

#### Template variables

| Variable | Description |
| --- | --- |
| `config` | Full card configuration (markdown-card convention) |
| `user` | Current Home Assistant username |
| `last_seen` | Dict keyed by entity ID with resolved values |
| `last_seen_list` | List of resolved value objects (easier for loops) |

Each entry in `last_seen` / `last_seen_list`:

| Field | Description |
| --- | --- |
| `entity_id` | Entity ID |
| `available` | `true` if a value was found within the lookback window |
| `state` | Raw resolved state (when available) |
| `last_changed` | ISO timestamp of the resolved reading |
| `last_changed_relative` | Locale-aware relative time (e.g. `3 days ago`) |
| `name` | Friendly name (respects per-entity name override) |
| `unit_of_measurement` | Unit from the entity attributes, when present |

Standard HA template functions such as `states()` still work in `content`, but for configured entities use `last_seen` to get the **history-resolved** value rather than the live (possibly unavailable) state.

```jinja
{{ last_seen['sensor.rain_gauge'].state }}
{{ states('sensor.other_entity') }}
```

### Lookback format

The `lookback` value accepts flexible duration strings (case-insensitive):

| Example | Meaning |
| --- | --- |
| `48h` | 48 hours |
| `7d` | 7 days |
| `2w` | 2 weeks |
| `168` | 168 hours (bare number = hours) |

### Entity object fields

| Field | Description |
| --- | --- |
| `entity` | Entity ID (**required**) |
| `name` | Override the displayed name |
| `icon` | Override the displayed icon |
| `tap_action` | Action on tap (default: `more-info`) |
| `hold_action` | Action on hold (default: `more-info`) |
| `double_tap_action` | Action on double tap (default: `none`) |

Supported actions match the standard Entity Card: `more-info`, `toggle`, `navigate`, `url`, `call-service`, and `none`.

## How it works

1. For each configured entity, the card checks whether the live state is populated and falls within the lookback window.
2. If not, it queries the Home Assistant history API for all entities in a single batched request.
3. It walks history newest → oldest and uses the first populated state (`state` is not `unavailable`, `unknown`, or empty).
4. If nothing is found in the window, the row shows **Unavailable**.
5. When `show_last_updated` is enabled, the card displays a locale-aware relative timestamp (e.g. `3 days ago`) for resolved values.
6. When `show_content` is enabled, the card renders `content` via Home Assistant's template engine and displays the result as markdown, with `last_seen` variables reflecting the same resolved values as the entity rows.

## Development

```bash
npm install
npm run build      # lint + outputs dist/last-seen-value-card.js
npm start          # watch mode with dev server on port 5000
npm run lint       # check formatting and lint rules
npm run lint:fix   # auto-fix formatting, imports, and safe lint issues
npm run format     # format files only
```

### Live reload during development

Home Assistant does not load custom card code automatically. You must register the JavaScript bundle as a **Lovelace resource** — a script URL that Lovelace downloads when the dashboard loads. Without a resource entry, cards using `type: custom:last-seen-value-card` will not appear.

1. Start the dev server on your machine:

   ```bash
   npm start
   ```

   This serves `dist/last-seen-value-card.js` at `http://<your-machine-ip>:5000/last-seen-value-card.js` and rebuilds when you edit files under `src/`.

2. In Home Assistant, open **Settings → Dashboards → ⋮ (top right) → Resources** (or, while editing a dashboard, **Edit dashboard → ⋮ → Manage resources**).

3. Click **Add resource** and enter:

   - **URL:** `http://<your-machine-ip>:5000/last-seen-value-card.js`
     - Replace `<your-machine-ip>` with the LAN IP of the computer running `npm start` (not `localhost`, unless the browser is on that same machine).
   - **Resource type:** **JavaScript module**

4. Save, then hard-refresh the dashboard (or clear browser cache). Lovelace will load the card from your dev server instead of a copied file.

When you change card code, save the file, wait for the dev server to rebuild, and refresh the dashboard to pick up changes.

For day-to-day use (not development), install via HACS (recommended) or build locally and copy `dist/last-seen-value-card.js` to `/config/www/`, then add a resource pointing at `/local/last-seen-value-card.js` (JavaScript module).

### Releasing

Releases are built and published automatically when you push a version tag. The built `last-seen-value-card.js` is attached as a release asset for HACS; `dist/` is not committed to git.

1. Bump the version in [`package.json`](package.json).
2. Commit the version bump.
3. Create and push a tag (either form works):

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   Or without the `v` prefix: `git tag 1.0.0 && git push origin 1.0.0`

4. GitHub Actions runs [`.github/workflows/release.yml`](.github/workflows/release.yml), builds the card, and publishes a release with `last-seen-value-card.js` attached.

## License

MIT
