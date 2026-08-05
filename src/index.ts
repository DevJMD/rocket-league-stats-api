/**
 * @packageDocumentation
 * Typed client for the Rocket League Stats API.
 *
 * Reads live match ticks and events from the game's local socket and sends spectator
 * and replay commands back.
 *
 * @example Fluent client
 * ```ts
 * import { RocketLeagueStatsClient } from '@devjmd/rocket-league-stats-api';
 *
 * const client = new RocketLeagueStatsClient()
 *     .tickRate(10)
 *     .on('UpdateState', (tick) => render(tick.Game, tick.Players))
 *     .on('GoalScored', (goal) => celebrate(goal.Scorer.Name))
 *     .onError((error) => console.error(error.code, error.message));
 *
 * await client.connect();
 * ```
 *
 * @example Plugin
 * ```ts
 * import { on, throttle, StatsPlugin, RocketLeagueStatsClient } from '@devjmd/rocket-league-stats-api';
 * import type { GoalScoredData, UpdateStateData } from '@devjmd/rocket-league-stats-api';
 *
 * class Scoreboard extends StatsPlugin {
 *     @on('UpdateState')
 *     @throttle(100)
 *     render(tick: UpdateStateData): void {
 *         draw(tick.Game);
 *     }
 *
 *     @on('GoalScored')
 *     celebrate(goal: GoalScoredData): void {
 *         flash(goal.Scorer.Name);
 *     }
 * }
 *
 * const client = new RocketLeagueStatsClient().use(new Scoreboard());
 * await client.connect();
 * ```
 *
 * @example Async iteration
 * ```ts
 * for await (const message of client) {
 *     if (message.event === 'GoalScored') console.log(message.data.Scorer.Name);
 * }
 * ```
 *
 * @remarks
 * The game reads its config once at startup, so set this and restart before connecting:
 *
 * ```ini
 * [TAGame.MatchStatsExporter_TA]
 * PacketSendRate=30
 * Port=49123
 * WebPort=49124
 * ```
 *
 * `PacketSendRate=0` disables the API. Events fire only during a live match.
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

export { RocketLeagueStatsClient } from './client.ts';

export { bound, handlerBindings, on, once, throttle } from './decorators.ts';
export type { HandlerBinding, HandlerMode } from './decorators.ts';

export { StatsPlugin } from './plugin.ts';

export type {
    ClientEventName,
    ClientLifecycleMap,
    ClientStatus,
    ConnectedInfo,
    DisconnectedInfo,
    DisconnectReason,
    GameEventListener,
    LifecycleListener,
    ReconnectOptions,
    RocketLeagueStatsClientOptions,
    StoredListener,
    StreamOptions,
    UnknownEventInfo,
    WarningInfo,
} from './types/lifecycle.ts';

export {
    ConnectionError,
    ConnectTimeoutError,
    InvalidCommandError,
    InvalidPayloadError,
    MalformedFrameError,
    NotConnectedError,
    StatsApiError,
} from './errors.ts';
export type { StatsApiErrorCode } from './errors.ts';

export { decodeFrame, isStatsApiEventName } from './protocol/decode.ts';
export type { DecodeResult } from './protocol/decode.ts';
export { encodeCommand, validateCommand } from './protocol/encode.ts';
export { JsonFrameBuffer } from './protocol/framer.ts';
export type { JsonFrameBufferOptions } from './protocol/framer.ts';
export { isRecord } from './protocol/validation.ts';
export type { IssueSeverity, Mutable, ValidationIssue } from './protocol/validation.ts';

export { FOCUS_BALL, PERSPECTIVES, STATS_API_COMMANDS } from './types/commands.ts';
export type {
    ChangePovCommandData,
    Focus,
    LoadReplayCommandData,
    Perspective,
    SeekReplayCommandData,
    SetGameSpeedCommandData,
    SetHudVisibilityCommandData,
    SetMatchPausedCommandData,
    StatsApiCommand,
    StatsApiCommandData,
    StatsApiCommandMap,
    StatsApiCommandName,
} from './types/commands.ts';

export {
    CONFIG_FILE,
    CONFIG_FILE_FALLBACK,
    CONFIG_SECTION,
    DEFAULT_HOST,
    DEFAULT_PORT,
    DEFAULT_WEB_PORT,
    formatGameConfig,
    MAX_PACKET_SEND_RATE,
} from './types/config.ts';
export type { StatsApiGameConfig } from './types/config.ts';

export { STATS_API_EVENTS, TICK_EVENT } from './types/events.ts';
export type {
    BallHitBall,
    BallHitData,
    BallState,
    BoostPickupData,
    BoostType,
    ClockUpdatedSecondsData,
    CountdownBeginData,
    CrossbarHitData,
    GameState,
    GoalReplayEndData,
    GoalReplayStartData,
    GoalReplayWillEndData,
    GoalScoredData,
    LifecycleEventName,
    MatchCreatedData,
    MatchDestroyedData,
    MatchEndedData,
    MatchInitializedData,
    MatchPausedData,
    MatchUnpausedData,
    Player,
    PlayerJoinedData,
    PlayerLeftData,
    PodiumStartData,
    ReplayCreatedData,
    RoundStartedData,
    StatfeedEventData,
    StatsApiEventData,
    StatsApiEventMap,
    StatsApiEventName,
    StatsApiMessage,
    TeamState,
    UpdateStateData,
} from './types/events.ts';

export { LOADOUT_SLOT_EMPTY, NO_TEAM, parsePrimaryId, TeamIndex } from './types/primitives.ts';
export type {
    BallLastTouch,
    BallTeamNum,
    PlayerRef,
    PrimaryId,
    TeamNum,
    Vector3,
} from './types/primitives.ts';
