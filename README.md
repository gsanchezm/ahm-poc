# AHM-POC: Atomic Helix Model — Proof of Concept

The **Atomic Helix Model (AHM)** is a deterministic testing model that replaces heuristic test-strategy metaphors — the Test Pyramid, Testing Trophy, Testing Honeycomb — with a mathematically grounded framework. Where those models prescribe *how much* to test at each layer, AHM defines *how tests execute* through formal constraints: Set Theory isolation ($S_{A1} \cap S_{A2} = \emptyset$), π-Calculus message passing (gRPC intents, no shared memory), and Chaos Suppression (Lyapunov exponent $\lambda < 0$ — transient noise is absorbed, not propagated).

The model is realised through the **Test-Oriented Microkernel (TOM)** — a pluggable architecture where tests are written once in Gherkin and executed across Web (Playwright), Mobile (Appium), API, and Performance (Gatling) through isolated gRPC plugin servers. TOM implements the microkernel layer of AHM: the `chaos-proxy` handles locator resolution, chaos suppression, and intent routing, while each plugin is a pure execution engine with no knowledge of test logic.

## Architecture

![AHM — TOM Microkernel Flow & Performance Testing](docs/images/ahm-architecture.png)

<details>
<summary>Text diagram</summary>

```
Cucumber Steps --> client.ts --> chaos-proxy (:50051) --> plugin servers
                                    |                       |-- playwright (:50052)
                                    |                       |-- appium     (:50053)
                                    |                       |-- gatling    (:50054)  <-- TOM-driven perf
                                    |                       |-- api        (:50055)
                                    |
                                    +-- locator resolution
                                    +-- chaos suppression (Lyapunov stabilizer)
                                    +-- telemetry emission

Gatling CLI ----------------------> [domain]/simulations/   <-- standalone load tests
                                    (feature-driven feeder, HTML reports)

Gatling plugin (TOM-driven) ------> RUN_CHECKOUT_LOAD intent
                                    → subprocess (checkout-load.gatling.ts)
                                    → parseGatlingStats() → SimulationMetrics in gRPC payload
```

</details>

The **Microkernel** (`chaos-proxy`) receives generic `ExecuteIntent` gRPC calls, resolves logical locator keys to platform-specific selectors, applies exponential backoff for transient failures, and forwards the intent to the appropriate plugin server.

Performance testing operates in two modes: **TOM-driven** (Gatling gRPC plugin triggers a subprocess from Cucumber, returns `SimulationMetrics` in the gRPC payload) and **standalone** (Gatling CLI runs simulations directly from the terminal).

## Atomic Design Layers

| AHM Layer | Folder | Purpose |
|-----------|--------|---------|
| Atoms | `kernel/client.ts` | `sendIntent()` — indivisible gRPC primitives |
| Molecules | `[domain]/actions/` | Grouped atomic intents (cross-platform reusable) |
| Organisms | `[domain]/usecases/` | Orchestrate actions into business flows |
| Eco-Systems | `[domain]/features/` + `step_definitions/` | BDD scenarios composing use cases + DAOs |
| Resonance | `[domain]/simulations/` | Gatling simulations co-located with their feature, driven by the same Examples data |

## Project Structure

```
src/
  proto/                   # gRPC service definitions (ptom.proto)
  kernel/                  # Microkernel: proxy, client, locator resolver, plugin factory, launcher
  plugins/                 # Isolated gRPC plugin servers
    playwright/            #   Web automation (Chromium)
    appium/                #   Mobile automation (Android / iOS)
    gatling/               #   Performance plugin (gRPC server + subprocess runner)
      support/
        types.ts           #     Shared types: FeatureToRowsOptions, RunnerOptions, PerfProfile, SimulationMetrics
        gherkin-parser.ts  #     Reads .feature files and returns Examples tables
        feature-to-rows.ts #     Generic featureToRows<T>() — reusable across all features
        simulation-runner.ts #   Spawns the Gatling CLI as a child process
        metrics-parser.ts  #     Parses stats.json → SimulationMetrics
    api/                   #   API testing (HttpClient)
  core/
    test-data/             # Data sources (users.json, etc.)
    tests/
      [domain]/            # e.g. 'checkout'
        actions/           # Molecules: reusable cross-platform action wrappers
        usecases/          # Organisms: business flow orchestration
        features/          # Eco-Systems: BDD scenarios (.feature files)
        simulations/       # Resonance: Gatling simulation + feature-specific support
          *.gatling.ts     #   Simulation entry point (runs under Gatling JVM)
          *-rows.ts        #   Feature-specific row mapper (CheckoutRow, etc.)
          money.ts         #   Feature-specific currency parser
        step_definitions/  # Thin Gherkin bindings → use cases + DAOs
        locators/          # JSON mapping logical keys to platform selectors
        dao/               # API state injection ($S_0$)
  utils/                   # Shared utilities (pino logger)

plugins.config.ts          # Plugin registry — enable/disable plugins
.env                       # Local environment configuration (gitignored)
.env.example               # Template for environment configuration
```

## Prerequisites

- Node.js 22 LTS (see `.nvmrc`)
- pnpm 10.29.x

```bash
nvm use        # switches to Node 22 from .nvmrc
pnpm install
```

## Running Tests (Local)

### Option A — Plugin launcher (recommended)

Enable the plugins you need in `.env`, then start everything with two terminals:

```bash
# Terminal 1: Start the microkernel proxy
pnpm run proxy

# Terminal 2: Start all enabled plugins (controlled by .env)
pnpm run plugins

# Terminal 3: Run tests
pnpm test
```

Plugins are toggled in `.env`:

```env
PLUGIN_PLAYWRIGHT=true
PLUGIN_APPIUM=false
PLUGIN_API=true
PLUGIN_GATLING=false
```

> **Hot reload:** editing `.env` while `pnpm run plugins` is running automatically restarts affected plugins — no manual restart needed. See [Plugin Hot Reload](#plugin-hot-reload).

### Option B — Start plugins individually

```bash
pnpm run plugin:playwright   # Web
pnpm run plugin:appium       # Mobile
pnpm run plugin:api          # API
pnpm run plugin:gatling      # Performance
```

### With Docker

```bash
# Web + API (default)
docker compose up

# Android (emulator via docker-android + Appium server)
docker compose --profile mobile up

# Performance testing
docker compose --profile performance up
```

### Android emulator (docker-android)

The `mobile` profile starts three services in order:

```
android-emulator  →  appium-server  →  appium-plugin
(docker-android)     (Appium 2.x)      (gRPC plugin)
```

`android-emulator` uses [`halimqarroum/docker-android`](https://github.com/HQarroum/docker-android) and requires KVM on Linux. On macOS you can run the emulator natively instead and point `APPIUM_HOST=localhost`.

**Required env vars for mobile:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ANDROID_API_LEVEL` | `34` | Android API level (`28`–`34`) |
| `ANDROID_IMG_TYPE` | `google_apis` | `google_apis` or `google_apis_playstore` |
| `ANDROID_DEVICE_ID` | `pixel` | AVD device profile |
| `ANDROID_EMULATOR_MEMORY` | `4096` | RAM in MB |
| `ANDROID_EMULATOR_CORES` | `2` | vCPU count |
| `ANDROID_APP_PATH` | — | Path to `.apk` under test |

## Plugin Hot Reload

The plugin launcher (`pnpm run plugins`) watches `.env` for changes. When you save the file it automatically:

1. Re-parses `.env` (using `dotenv` with `override: true`)
2. Diffs the enabled plugin set against what is currently running
3. Stops plugins that were disabled, starts plugins that were enabled, restarts all others so they pick up the new env values

```
[you edit PLATFORM=ios or toggle PLUGIN_GATLING=true]
  → 300 ms debounce
  → diff: { toStop: [], toRestart: ['API'], toStart: ['Gatling'] }
  → kills / spawns as needed
  → "Hot-reload complete. Running: [API, Gatling]"
```

No terminal restart required — just save `.env`.

## Performance Testing

Performance tests have two modes that serve different purposes:

| Mode | Entry point | When to use |
|------|-------------|-------------|
| **TOM-driven** | `PLUGIN_GATLING=true` + `sendIntent('RUN_CHECKOUT_LOAD', profile)` | Trigger load from a Cucumber scenario, get `SimulationMetrics` back in the gRPC payload |
| **Standalone** | `pnpm perf:smoke \| perf:load \| perf:stress` | CI load gates, HTML reports, direct injection control |

Both modes run the same `checkout-load.gatling.ts` simulation. The difference is who invokes it.

### Feature-driven feeder

The feeder is no longer hardcoded. `featureToCheckoutRows()` reads `checkout.feature` at bundle time and returns all Examples rows as typed `CheckoutRow` objects:

```
checkout.feature (Examples: Credit Card + Cash)
  └─→ featureToCheckoutRows(['Credit Card', 'Cash'])
        └─→ arrayFeeder([...8 rows...]).circular()
```

The `.feature` file is the single source of truth — add a row there and it appears in the load test automatically.

| Row | Market | Item | Size | Qty | Payment |
|-----|--------|------|------|-----|---------|
| 1 | US | Pepperoni | Large | 1 | Credit Card |
| 2 | MX | Margarita | Medium | 3 | Credit Card |
| 3 | CH | Marinara | Small | 1 | Credit Card |
| 4 | JP | Pepperoni | Family | 2 | Credit Card |
| 5 | US | Pepperoni | Large | 1 | Cash |
| 6 | MX | Margarita | Medium | 3 | Cash |
| 7 | CH | Marinara | Small | 1 | Cash |
| 8 | JP | Pepperoni | Family | 2 | Cash |

### Simulation flow

```
Login (/api/auth/login)
  └─→ Get Pizzas (/api/pizzas, x-country-code: <market>)
        └─→ Add to Cart (/api/cart)
              └─→ Checkout (/api/checkout, delivery + contact + payment)
```

### Standalone profiles

| Profile | Command | Users | Injection |
|---------|---------|-------|-----------|
| Smoke | `pnpm perf:smoke` | 1 | at once — validates the chain end-to-end |
| Load | `pnpm perf:load` | 20 | ramp over 2 min — realistic sustained traffic |
| Stress | `pnpm perf:stress` | 50 | at once — peak burst |

**Env overrides:**

```bash
PERF_USERS=30 pnpm perf:load         # override user count
PERF_DURATION=60 pnpm perf:load      # override ramp duration (seconds)
```

> **First run** downloads the Gatling JRE bundle (~200 MB). Subsequent runs are instant.
> HTML reports are written to `target/gatling/`.

### TOM-driven mode

When `PLUGIN_GATLING=true`, the Gatling gRPC plugin accepts `RUN_CHECKOUT_LOAD` intents from Cucumber steps:

```ts
sendIntent('RUN_CHECKOUT_LOAD', 'smoke')
sendIntent('RUN_CHECKOUT_LOAD', 'load')
sendIntent('RUN_CHECKOUT_LOAD', 'load||PERF_USERS=30||PERF_DURATION=90')
```

The plugin spawns `checkout-load.gatling.ts` as a subprocess, waits for it to finish, then parses `target/gatling/<report>/js/stats.json` and returns a `SimulationMetrics` JSON in the gRPC `payload` field:

```json
{
  "simulation": "checkout-load",
  "profile": "smoke",
  "requests": { "total": 4, "ok": 4, "ko": 0 },
  "responseTime": { "min": 120, "mean": 340, "p95": 810, "max": 950 },
  "throughput": 1.2,
  "status": "PASS",
  "reportDir": "target/gatling/checkout-load-20260406..."
}
```

`status` is `PASS` when the KO rate is below 1%, `FAIL` otherwise. A `FAIL` result also causes the gRPC call to return an error, which the proxy propagates to the Cucumber step.

### Adding simulations for other features

The Gatling support in `plugins/gatling/support/` is fully generic. To add load tests for a new feature slice:

1. Create `tests/<domain>/simulations/<domain>-rows.ts` — implement a mapper calling `featureToRows<YourRow>(options, mapper)`
2. Create `tests/<domain>/simulations/<domain>-load.gatling.ts` — import your rows, build the HTTP chain
3. Add a `RUN_<DOMAIN>_LOAD` handler in `plugins/gatling/gatling.ts` pointing `sourcesFolder` at the new simulation

## Environment Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Key variables

| Variable | Options | Description |
|----------|---------|-------------|
| `PLATFORM` | `web` `android` `ios` `api` | Target platform |
| `VIEWPORT` | `desktop` `responsive` | Web viewport (only when `PLATFORM=web`) |
| `DRIVER` | `playwright` `appium` `api` | Automation driver |
| `BASE_URL` | URL | Web application under test |
| `API_BASE_URL` | URL | Backend API for state injection |
| `HEADLESS` | `true` `false` | Browser visibility |
| `LOG_LEVEL` | `fatal` `error` `warn` `info` `debug` `trace` | Pino log level |

### Plugin registry

| Variable | Default | Description |
|----------|---------|-------------|
| `PLUGIN_PLAYWRIGHT` | `false` | Enable the Playwright gRPC plugin |
| `PLUGIN_APPIUM` | `false` | Enable the Appium gRPC plugin |
| `PLUGIN_API` | `false` | Enable the API gRPC plugin |
| `PLUGIN_GATLING` | `false` | Enable the Gatling gRPC plugin |

### Plugin addresses (proxy → plugins)

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_ADDRESS` | `localhost:50051` | Used by `client.ts` to reach the proxy |
| `PLAYWRIGHT_ADDRESS` | `localhost:50052` | Used by proxy to reach Playwright plugin |
| `APPIUM_ADDRESS` | `localhost:50053` | Used by proxy to reach Appium plugin |
| `GATLING_ADDRESS` | `localhost:50054` | Used by proxy to reach Gatling plugin |
| `API_ADAPTER_ADDRESS` | `localhost:50055` | Used by proxy to reach API plugin |

### Plugin listen ports (each plugin server)

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYWRIGHT_PORT` | `50052` | Port the Playwright plugin binds to |
| `APPIUM_PORT_GRPC` | `50053` | Port the Appium plugin binds to |
| `API_PLUGIN_PORT` | `50055` | Port the API plugin binds to |
| `GATLING_PLUGIN_PORT` | `50054` | Port the Gatling plugin binds to |

### Performance

| Variable | Default | Description |
|----------|---------|-------------|
| `PERF_PROFILE` | `smoke` | Injection profile: `smoke` / `load` / `stress` (overridden by perf scripts) |
| `PERF_USERS` | `20` | Virtual user count (ramp target for `load`, burst size for `stress`) |
| `PERF_DURATION` | `120` | Ramp duration in seconds (`load` profile only) |

### Appium (mobile only)

| Variable | Default | Description |
|----------|---------|-------------|
| `APPIUM_HOST` | `localhost` | Appium server host |
| `APPIUM_PORT` | `4723` | Appium server port |
| `ANDROID_APP_PATH` | — | Path to `.apk` under test |
| `IOS_APP_PATH` | — | Path to `.zip` under test |
| `IOS_UDID` | `auto` | iOS device UDID |

## Cross-Platform Locators

Locator JSON files map logical keys to platform-specific selectors. The proxy resolves them at runtime based on `PLATFORM` and `VIEWPORT`:

```json
{
  "streetInput": {
    "web": {
      "responsive": "[data-testid='address-responsive']",
      "desktop": "[data-testid='address-desktop']"
    },
    "mobile": {
      "android": "android=new UiSelector().description(\"input-address\")",
      "ios": "~input-address"
    }
  }
}
```

Actions always use logical keys (`streetInput`), never raw selectors. The same test code runs across all platforms without modification.

## Key Concepts

### Chaos Suppression
The proxy detects transient failures (stale elements, timeouts, detached nodes) and automatically retries with exponential backoff. Deterministic failures fail immediately without retrying.

### API State Injection ($S_0$)
`Given` steps inject test state directly via API calls using DAOs, bypassing flaky UI setup flows. Login, cart creation, and market selection happen through `HttpClient`. `When`/`Then` steps then attach to this pre-built state via the UI.

### Browser Session Isolation
Each Cucumber worker gets its own `BrowserContext` in Playwright. `localStorage` is cleared between scenarios so state never leaks across scenario outlines.

### Plugin Isolation
Each plugin runs as an independent gRPC server. The proxy handles locator resolution, chaos suppression, and telemetry — plugins are pure execution engines with no knowledge of test logic.

### Gatling JVM boundary
`@gatling.io/core` and `@gatling.io/http` call `Java.type()` at load time and only work inside the Gatling JVM bundle. They must never be imported in the gRPC plugin server (plain Node.js). All simulations are executed as **subprocesses** by `simulation-runner.ts` — the plugin server only orchestrates and reads results.

## CI / CD (GitHub Actions)

Two workflow files live in `.github/workflows/`:

| File | Purpose |
|------|---------|
| `ahm-execution-helix.yml` | Unified test execution — API, Web, Android, and Perf |
| `deploy-pages.yml` | Static site deployment to GitHub Pages (independent) |

### `ahm-execution-helix.yml` — Trigger Matrix

| Trigger | `api-smoke` | `e2e-web` | `e2e-android` | `perf-gatling` |
|---------|:-----------:|:---------:|:-------------:|:--------------:|
| **Push → `main`** | ✅ | ✅ | — | ✅ (smoke) |
| **PR → `main`** | ✅ | ✅ | — | — |
| **Manual → `all`** | ✅ | ✅ | ✅ | ✅ |
| **Manual → `api`** | ✅ | — | — | — |
| **Manual → `web`** | — | ✅ | — | — |
| **Manual → `android`** | — | — | ✅ | — |
| **Manual → `perf`** | — | — | — | ✅ |

> Android is **manual-only** because it requires KVM + docker-android, making it too heavy for every push.

**Manual dispatch inputs:**

| Input | Default | Description |
|-------|---------|-------------|
| `platform` | `all` | `all` · `api` · `web` · `android` · `perf` |
| `perf_profile` | `smoke` | Gatling injection profile: `smoke` · `load` · `stress` |
| `perf_users` | `20` | Virtual user count (load/stress) |
| `perf_duration` | `120` | Ramp duration in seconds (load only) |
| `android_api_level` | `34` | Android API level (`28`–`34`) |

### `deploy-pages.yml`

Triggers on pushes to `main` that touch `web/**`. Deploys the static site using GitHub Pages with `actions/deploy-pages@v4`.

## Tech Stack

| Concern | Library |
|---------|---------|
| Test framework | Cucumber (BDD) |
| Language | TypeScript |
| Web automation | Playwright |
| Mobile automation | WebDriverIO + Appium (UiAutomator2 / XCUITest) |
| Performance | @gatling.io/core + @gatling.io/http + @gatling.io/cli |
| Communication | gRPC (@grpc/grpc-js) |
| Logging | Pino |
| Containerization | Docker + Docker Compose |
| Package manager | pnpm |
