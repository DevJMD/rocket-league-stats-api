# @devjmd/rocket-league-stats-api

Typed client for the [Rocket League Stats API](https://www.rocketleague.com/developer/stats-api). Reads live match data over the game's local socket and sends spectator and replay commands back.

ESM only. Zero dependencies. All 22 events and all 6 commands, validated at runtime.

```bash
npm  install @devjmd/rocket-league-stats-api
pnpm add     @devjmd/rocket-league-stats-api
bun  add     @devjmd/rocket-league-stats-api
yarn add     @devjmd/rocket-league-stats-api
```

Node 24+. CI installs the packed tarball with all four managers and runs it, so
compatibility is tested rather than assumed. The Bun runtime works too, not just its
installer.

## Enable the game

Edit `<Install Dir>\TAGame\Config\TAStatsAPI.ini`, then restart Rocket League.

```ini
[TAGame.MatchStatsExporter_TA]
PacketSendRate=30
Port=49123
WebPort=49124
```

`PacketSendRate=0` disables the API, so it doubles as the on switch. Events fire only during a live match.

## Use

```ts
import { RocketLeagueStatsClient } from '@devjmd/rocket-league-stats-api';

const client = new RocketLeagueStatsClient()
    .tickRate(10)
    .on('UpdateState', (tick) => render(tick.Game, tick.Players))
    .on('GoalScored', (goal) => console.log(goal.Scorer.Name))
    .onError((error) => console.error(error.code, error.message));

await client.connect();
```

## Plugins

```ts
import { on, throttle, StatsPlugin } from '@devjmd/rocket-league-stats-api';

class Scoreboard extends StatsPlugin {
    @on('UpdateState')
    @throttle(100)
    render(tick: UpdateStateData): void {
        draw(tick.Game);
    }
}

const client = new RocketLeagueStatsClient().use(new Scoreboard());
```

`@on` and `@once` subscribe, `@throttle(ms)` rate limits, `@bound` binds the method. A handler declared for the wrong payload is a compile error. `client.unuse(plugin)` removes everything it registered.

## Tick rate

```ts
client.tickInterval(100); // at most one tick per 100ms
client.tickRate(10); // same, as updates per second
client.tickInterval(0); // every tick the game sends
```

Ticks coalesce rather than queue, so you always get the newest. Discrete events are never throttled. `client.snapshot` holds the latest tick if you prefer to poll.

## Streaming

```ts
for await (const message of client) {
    if (message.event === 'GoalScored') console.log(message.data.Scorer.Name);
}
```

## Commands

```ts
client.watchPlayer(3, 'PlayerView');
client.watchBall('SoftAttach');
client.setHudVisibility(false);
client.setGameSpeed(0.5);
client.setMatchPaused(true);
client.loadReplay({ FileName: 'Stadium_P_2026-06-05_18-42' });
client.seekReplay({ TimeSeconds: 120.5 });
```

Invalid commands throw locally, because the game rejects them silently.

## Events

`UpdateState` `BallHit` `BoostPickup` `ClockUpdatedSeconds` `CountdownBegin` `CrossbarHit` `GoalReplayStart` `GoalReplayWillEnd` `GoalReplayEnd` `GoalScored` `MatchCreated` `MatchInitialized` `MatchEnded` `MatchDestroyed` `MatchPaused` `MatchUnpaused` `PlayerJoined` `PlayerLeft` `PodiumStart` `ReplayCreated` `RoundStarted` `StatfeedEvent`

Lifecycle events are camelCase so they cannot collide: `connected` `disconnected` `error` `message` `unknownEvent` `warning`.

Use the named constants instead of raw strings if you prefer:

```ts
import { StatsEvent, LifecycleEvent, StatsCommand } from '@devjmd/rocket-league-stats-api';

client.on(StatsEvent.GoalScored, (goal) => console.log(goal.Scorer.Name));
client.on(LifecycleEvent.Disconnected, (info) => console.log(info.reason));
client.send({ Command: StatsCommand.SetGameSpeed, Data: { Speed: 0.5 } });

class Overlay extends StatsPlugin {
    @on(StatsEvent.UpdateState)
    render(tick: UpdateStateData): void {}
}
```

Your own `enum` works too, since the parameter is a string literal union:

```ts
enum MyEvents {
    Goal = 'GoalScored',
}

client.on(MyEvents.Goal, (goal) => console.log(goal.Scorer.Name));
```

The exported constants are plain frozen objects rather than `enum`s because `enum` is the one piece of TypeScript that cannot be erased. `node file.ts` fails on it with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, and it emits a runtime object either way. Constants keep exact literal types, so narrowing is identical and raw strings stay interchangeable.

## Validation

A payload that fails validation is not delivered, and `error` reports the exact path that failed. Unexpected but harmless values report on `warning` and are still delivered. Unmodelled events arrive on `unknownEvent`. Undocumented fields stay readable on `message.raw`.

## Gotchas

Properties of the API itself, not of this library.

- `MatchGuid` is only set for online and LAN matches, so it is optional everywhere.
- `StatfeedEvent.Type` is localized text. Branch on `EventName`.
- `GoalScored.GoalTime` is the previous round's length, not the match clock.
- `Ball.TeamNum` is `255` until the ball is touched.
- `Speed`, `Boost` and the `b`-prefixed flags on `Player` are spectator only.
- `Frame` and `Elapsed` are replay only.
- `PrimaryId` is not unique, since bots share a placeholder. Use `parsePrimaryId`.
- No continuous positions, so a live minimap is not possible from this feed.
- On an own goal, `Scorer` is the benefiting team and `BallLastTouch` is who scored it.

## Errors

Every error carries a `code`: `connection_failed`, `connect_timeout`, `not_connected`, `invalid_command`, `invalid_payload`, `malformed_frame`.

`connect()` rejects on the first failure. Reconnect with backoff applies only after an established connection drops.

## Other transports

The game can also open a WebSocket on `WebPort`. Feed it straight in:

```ts
socket.addEventListener('message', (event) => client.ingest(event.data));
```

## Scripts

```bash
npm run lint      # oxlint
npm run typecheck # tsc --noEmit
npm test          # node:test
npm run format    # prettier, then blank line spacing
npm run build     # emit dist
npm run check     # lint, typecheck, test
```

Style is single quotes and four space indents. Source imports use `.ts` specifiers, which TypeScript rewrites to the real runtime filename on build. That is an ESM requirement, not a CommonJS one: Node's ESM resolver does no extension guessing, so `import './client'` throws `ERR_MODULE_NOT_FOUND` and the specifier has to name the file that exists at runtime. The output is ESM only, with no CommonJS build and no `require` anywhere in `dist`.

Built with TypeScript 7 targeting `es2025`, the highest stable target Node 24 supports. Not `esnext`, because its meaning changes with every TypeScript release, so a toolchain bump would silently change the JavaScript consumers receive.

`erasableSyntaxOnly` keeps the source free of syntax that only a type-aware compiler can remove, so every file also runs under Node's native type stripping. `isolatedDeclarations` is on for the build, so declarations emit per file without whole-program inference.

`npm run format` runs Prettier and then `scripts/spacing.mjs`, which enforces one blank line between declarations and members and separates constants, blocks and returns. oxlint has no blank line rules, so the formatter owns that.

Releases run on Conventional Commits through release-please, which is a two step flow. A push to `master` opens or updates a release PR, it does not publish. Merging that PR is what tags the version, writes `CHANGELOG.md`, attaches the compiled and source archives, and publishes to npm. Set `skip-github-pull-request: true` in the release workflow if you would rather it tag straight from `master`.

Publishing needs an `NPM_TOKEN` repository secret. Once the package exists on npm you can drop the token and switch to trusted publishing with OIDC instead, which the workflow already has the `id-token: write` permission for.

Tests run against a fake game over a real socket, so Rocket League is not needed. Fixtures are copied verbatim from the official docs.

## License

MIT © [devjmd](https://github.com/devjmd)

Unofficial. Not affiliated with Psyonix or Epic Games.
