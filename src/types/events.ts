/**
 * Payload types for every Stats API tick and event.
 *
 * Field optionality follows the visibility markers in the official tables. Untagged
 * fields are always present. CONDITIONAL, SPECTATOR, TEAM and REPLAY fields are not,
 * so they are optional here.
 *
 * @example
 * ```ts
 * function handle(message: StatsApiMessage): void {
 *     switch (message.event) {
 *         case 'UpdateState':
 *             console.log(message.data.Game.TimeSeconds, message.data.Players.length);
 *             break;
 *         case 'GoalScored':
 *             console.log(message.data.Scorer.Name, message.data.GoalSpeed);
 *             break;
 *         case 'StatfeedEvent':
 *             console.log(message.data.EventName, message.data.MainTarget.Name);
 *             break;
 *         default:
 *             console.log(message.event, message.data.MatchGuid);
 *     }
 * }
 * ```
 *
 * @remarks
 * `MatchGuid` is only set for online and LAN matches.
 *
 * `StatfeedEvent.Type` is localized display text, so branch on `EventName`.
 *
 * `GoalScored.GoalTime` is the previous round's length, not the match clock.
 *
 * `Ball.TeamNum` is 255 until the ball is touched.
 *
 * The `b`-prefixed spectator flags are omitted rather than sent as false, so read them
 * as `player.bBoosting ?? false`.
 *
 * `Game.Target` is present exactly when `Game.bHasTarget` is true, and `Game.Frame`
 * and `Game.Elapsed` only during replay playback.
 *
 * A field can arrive as an empty placeholder instead of being absent. An unattributed
 * goal carries a `Scorer` with an empty `Name` and a `Shortcut` of 0.
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import type { BallLastTouch, BallTeamNum, PlayerRef, TeamNum, Vector3 } from './primitives.ts';

export interface Player {
    readonly Name: string;
    readonly PrimaryId: string;
    readonly Shortcut: number;
    readonly TeamNum: TeamNum;
    readonly Score: number;
    readonly Goals: number;
    readonly Shots: number;
    readonly Assists: number;
    readonly Saves: number;
    readonly Touches: number;
    readonly CarTouches: number;
    readonly Demos: number;
    readonly Loadout: readonly string[];

    readonly bHasCar?: boolean;
    readonly Speed?: number;
    readonly Boost?: number;
    readonly bBoosting?: boolean;
    readonly bOnGround?: boolean;
    readonly bOnWall?: boolean;
    readonly bPowersliding?: boolean;
    readonly bDemolished?: boolean;
    readonly bSupersonic?: boolean;
    readonly PickupClass?: string;
    readonly Attacker?: PlayerRef;
}

export interface TeamState {
    readonly Name: string;
    readonly TeamNum: TeamNum;
    readonly Score: number;
    readonly ColorPrimary: string;
    readonly ColorSecondary: string;
}

export interface BallState {
    readonly Speed: number;
    readonly TeamNum: BallTeamNum;
}

export interface GameState {
    readonly Teams: readonly TeamState[];
    readonly PlaylistId: number;
    readonly TimeSeconds: number;
    readonly bOvertime: boolean;
    readonly Ball: BallState;
    readonly bReplay: boolean;
    readonly bHasWinner: boolean;
    readonly Winner: string;
    readonly Arena: string;
    readonly bHasTarget: boolean;
    readonly Target?: PlayerRef;
    readonly Frame?: number;
    readonly Elapsed?: number;
}

export interface UpdateStateData {
    readonly MatchGuid?: string;
    readonly Players: readonly Player[];
    readonly Game: GameState;
}

export interface BallHitBall {
    readonly PreHitSpeed: number;
    readonly PostHitSpeed: number;
    readonly Location: Vector3;
}

export interface BallHitData {
    readonly MatchGuid?: string;
    readonly Players: readonly PlayerRef[];
    readonly Ball: BallHitBall;
}

export type BoostType = 'BoostType_Pad' | 'BoostType_Pill' | (string & {});

export interface BoostPickupData {
    readonly MatchGuid?: string;
    readonly Player: PlayerRef;
    readonly Location: Vector3;
    readonly BoostAmount: number;
    readonly BoostType: BoostType;
    readonly bReplay: boolean;
}

export interface ClockUpdatedSecondsData {
    readonly MatchGuid?: string;
    readonly TimeSeconds: number;
    readonly bOvertime: boolean;
}

export interface CountdownBeginData {
    readonly MatchGuid?: string;
}

export interface CrossbarHitData {
    readonly MatchGuid?: string;
    readonly BallLocation: Vector3;
    readonly BallSpeed: number;
    readonly ImpactForce: number;
    readonly BallLastTouch: BallLastTouch;
}

export interface GoalReplayEndData {
    readonly MatchGuid?: string;
}

export interface GoalReplayStartData {
    readonly MatchGuid?: string;
}

export interface GoalReplayWillEndData {
    readonly MatchGuid?: string;
}

export interface GoalScoredData {
    readonly MatchGuid?: string;
    readonly GoalSpeed: number;
    readonly GoalTime: number;
    readonly ImpactLocation: Vector3;
    readonly Scorer: PlayerRef;
    readonly BallLastTouch: BallLastTouch;
    readonly Assister?: PlayerRef;
}

export interface MatchCreatedData {
    readonly MatchGuid?: string;
}

export interface MatchDestroyedData {
    readonly MatchGuid?: string;
}

export interface MatchEndedData {
    readonly MatchGuid?: string;
    readonly WinnerTeamNum: TeamNum;
}

export interface MatchInitializedData {
    readonly MatchGuid?: string;
}

export interface MatchPausedData {
    readonly MatchGuid?: string;
}

export interface MatchUnpausedData {
    readonly MatchGuid?: string;
}

export interface PlayerJoinedData {
    readonly MatchGuid?: string;
    readonly PlayerName: string;
    readonly PrimaryId: string;
}

export interface PlayerLeftData {
    readonly MatchGuid?: string;
    readonly PlayerName: string;
    readonly PrimaryId: string;
}

export interface PodiumStartData {
    readonly MatchGuid?: string;
}

export interface ReplayCreatedData {
    readonly MatchGuid?: string;
    readonly FileName: string;
    readonly Date: string;
}

export interface RoundStartedData {
    readonly MatchGuid?: string;
}

export interface StatfeedEventData {
    readonly MatchGuid?: string;
    readonly EventName: string;
    readonly Type: string;
    readonly MainTarget: PlayerRef;
    readonly SecondaryTarget?: PlayerRef;
}

export const TICK_EVENT = 'UpdateState';

export const STATS_API_EVENTS = [
    'UpdateState',
    'BallHit',
    'BoostPickup',
    'ClockUpdatedSeconds',
    'CountdownBegin',
    'CrossbarHit',
    'GoalReplayEnd',
    'GoalReplayStart',
    'GoalReplayWillEnd',
    'GoalScored',
    'MatchCreated',
    'MatchDestroyed',
    'MatchEnded',
    'MatchInitialized',
    'MatchPaused',
    'MatchUnpaused',
    'PlayerJoined',
    'PlayerLeft',
    'PodiumStart',
    'ReplayCreated',
    'RoundStarted',
    'StatfeedEvent',
] as const;

export type StatsApiEventName = (typeof STATS_API_EVENTS)[number];

export interface StatsApiEventMap {
    readonly UpdateState: UpdateStateData;
    readonly BallHit: BallHitData;
    readonly BoostPickup: BoostPickupData;
    readonly ClockUpdatedSeconds: ClockUpdatedSecondsData;
    readonly CountdownBegin: CountdownBeginData;
    readonly CrossbarHit: CrossbarHitData;
    readonly GoalReplayEnd: GoalReplayEndData;
    readonly GoalReplayStart: GoalReplayStartData;
    readonly GoalReplayWillEnd: GoalReplayWillEndData;
    readonly GoalScored: GoalScoredData;
    readonly MatchCreated: MatchCreatedData;
    readonly MatchDestroyed: MatchDestroyedData;
    readonly MatchEnded: MatchEndedData;
    readonly MatchInitialized: MatchInitializedData;
    readonly MatchPaused: MatchPausedData;
    readonly MatchUnpaused: MatchUnpausedData;
    readonly PlayerJoined: PlayerJoinedData;
    readonly PlayerLeft: PlayerLeftData;
    readonly PodiumStart: PodiumStartData;
    readonly ReplayCreated: ReplayCreatedData;
    readonly RoundStarted: RoundStartedData;
    readonly StatfeedEvent: StatfeedEventData;
}

export type StatsApiEventData<K extends StatsApiEventName> = StatsApiEventMap[K];

export type StatsApiMessage = {
    [K in StatsApiEventName]: {
        readonly event: K;
        readonly data: StatsApiEventMap[K];
        readonly raw: Readonly<Record<string, unknown>>;
        readonly receivedAt: number;
    };
}[StatsApiEventName];

export type LifecycleEventName =
    | 'CountdownBegin'
    | 'GoalReplayEnd'
    | 'GoalReplayStart'
    | 'GoalReplayWillEnd'
    | 'MatchCreated'
    | 'MatchDestroyed'
    | 'MatchInitialized'
    | 'MatchPaused'
    | 'MatchUnpaused'
    | 'PodiumStart'
    | 'RoundStarted';
