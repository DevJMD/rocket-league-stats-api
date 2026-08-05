/**
 * Decodes one framed JSON string into a validated message.
 *
 * Never throws. Every failure comes back as a {@link DecodeResult}, so a bad frame
 * cannot tear down a listener. Fields the library does not model stay readable on
 * `message.raw`.
 *
 * `Data` arrives as a JSON encoded string on current builds, and as a nested object in
 * the published envelope. Both are accepted.
 *
 * @example
 * ```ts
 * const result = decodeFrame(frame);
 *
 * switch (result.kind) {
 *     case 'message':
 *         handle(result.message);
 *         break;
 *     case 'invalid':
 *         console.warn(result.event, result.issues);
 *         break;
 *     case 'unknown-event':
 *         console.log('new event', result.event, result.raw);
 *         break;
 *     case 'malformed':
 *         console.error(result.reason);
 *         break;
 * }
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import type {
    BallHitData,
    BallState,
    BoostPickupData,
    ClockUpdatedSecondsData,
    CrossbarHitData,
    GameState,
    GoalScoredData,
    MatchEndedData,
    Player,
    PlayerJoinedData,
    PlayerLeftData,
    ReplayCreatedData,
    StatfeedEventData,
    StatsApiEventMap,
    StatsApiEventName,
    StatsApiMessage,
    TeamState,
    UpdateStateData,
} from '../types/events.ts';
import { STATS_API_EVENTS } from '../types/events.ts';
import type { BallLastTouch, PlayerRef, Vector3 } from '../types/primitives.ts';
import type { FieldReader, Mutable, ValidationIssue } from './validation.ts';
import { createReader, isRecord } from './validation.ts';

const KNOWN_EVENTS: ReadonlySet<string> = new Set<string>(STATS_API_EVENTS);

export function isStatsApiEventName(value: string): value is StatsApiEventName {
    return KNOWN_EVENTS.has(value);
}

function decodeVector(reader: FieldReader): Vector3 {
    return { X: reader.number('X'), Y: reader.number('Y'), Z: reader.number('Z') };
}

function decodePlayerRef(reader: FieldReader): PlayerRef {
    return {
        Name: reader.string('Name'),
        Shortcut: reader.number('Shortcut'),
        TeamNum: reader.teamNum('TeamNum'),
    };
}

function decodeBallLastTouch(reader: FieldReader): BallLastTouch {
    return {
        Player: decodePlayerRef(reader.child('Player')),
        Speed: reader.number('Speed'),
    };
}

function readMatchGuid(reader: FieldReader): string | undefined {
    return reader.optionalString('MatchGuid');
}

function decodePlayer(reader: FieldReader): Player {
    const player: Mutable<Player> = {
        Name: reader.string('Name'),
        PrimaryId: reader.string('PrimaryId'),
        Shortcut: reader.number('Shortcut'),
        TeamNum: reader.teamNum('TeamNum'),
        Score: reader.number('Score'),
        Goals: reader.number('Goals'),
        Shots: reader.number('Shots'),
        Assists: reader.number('Assists'),
        Saves: reader.number('Saves'),
        Touches: reader.number('Touches'),
        CarTouches: reader.number('CarTouches'),
        Demos: reader.number('Demos'),
        Loadout: reader.stringArray('Loadout'),
    };

    const hasCar = reader.optionalBoolean('bHasCar');

    if (hasCar !== undefined) player.bHasCar = hasCar;

    const speed = reader.optionalNumber('Speed');

    if (speed !== undefined) player.Speed = speed;

    const boost = reader.optionalNumber('Boost');

    if (boost !== undefined) player.Boost = boost;

    const boosting = reader.optionalBoolean('bBoosting');

    if (boosting !== undefined) player.bBoosting = boosting;

    const onGround = reader.optionalBoolean('bOnGround');

    if (onGround !== undefined) player.bOnGround = onGround;

    const onWall = reader.optionalBoolean('bOnWall');

    if (onWall !== undefined) player.bOnWall = onWall;

    const powersliding = reader.optionalBoolean('bPowersliding');

    if (powersliding !== undefined) player.bPowersliding = powersliding;

    const demolished = reader.optionalBoolean('bDemolished');

    if (demolished !== undefined) player.bDemolished = demolished;

    const supersonic = reader.optionalBoolean('bSupersonic');

    if (supersonic !== undefined) player.bSupersonic = supersonic;

    const pickupClass = reader.optionalString('PickupClass');

    if (pickupClass !== undefined) player.PickupClass = pickupClass;

    const attacker = reader.optionalChild('Attacker');

    if (attacker !== undefined) player.Attacker = decodePlayerRef(attacker);

    return player;
}

function decodeTeamState(reader: FieldReader): TeamState {
    return {
        Name: reader.string('Name'),
        TeamNum: reader.teamNum('TeamNum'),
        Score: reader.number('Score'),
        ColorPrimary: reader.string('ColorPrimary'),
        ColorSecondary: reader.string('ColorSecondary'),
    };
}

function decodeBallState(reader: FieldReader): BallState {
    return {
        Speed: reader.number('Speed'),
        TeamNum: reader.ballTeamNum('TeamNum'),
    };
}

function decodeGameState(reader: FieldReader): GameState {
    const game: Mutable<GameState> = {
        Teams: reader.objectArray('Teams', decodeTeamState),
        PlaylistId: reader.number('PlaylistId'),
        TimeSeconds: reader.number('TimeSeconds'),
        bOvertime: reader.boolean('bOvertime'),
        Ball: decodeBallState(reader.child('Ball')),
        bReplay: reader.boolean('bReplay'),
        bHasWinner: reader.boolean('bHasWinner'),
        Winner: reader.string('Winner'),
        Arena: reader.string('Arena'),
        bHasTarget: reader.boolean('bHasTarget'),
    };

    const target = reader.optionalChild('Target');

    if (target !== undefined) game.Target = decodePlayerRef(target);

    const frame = reader.optionalNumber('Frame');

    if (frame !== undefined) game.Frame = frame;

    const elapsed = reader.optionalNumber('Elapsed');

    if (elapsed !== undefined) game.Elapsed = elapsed;

    return game;
}

function decodeUpdateState(reader: FieldReader): UpdateStateData {
    const tick: Mutable<UpdateStateData> = {
        Players: reader.objectArray('Players', decodePlayer),
        Game: decodeGameState(reader.child('Game')),
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) tick.MatchGuid = guid;

    return tick;
}

function decodeLifecycle(reader: FieldReader): { MatchGuid?: string } {
    const out: { MatchGuid?: string } = {};
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodeBallHit(reader: FieldReader): BallHitData {
    const ball = reader.child('Ball');
    const out: Mutable<BallHitData> = {
        Players: reader.objectArray('Players', decodePlayerRef),
        Ball: {
            PreHitSpeed: ball.number('PreHitSpeed'),
            PostHitSpeed: ball.number('PostHitSpeed'),
            Location: decodeVector(ball.child('Location')),
        },
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodeBoostPickup(reader: FieldReader): BoostPickupData {
    const out: Mutable<BoostPickupData> = {
        Player: decodePlayerRef(reader.child('Player')),
        Location: decodeVector(reader.child('Location')),
        BoostAmount: reader.number('BoostAmount'),
        BoostType: reader.string('BoostType'),
        bReplay: reader.boolean('bReplay'),
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodeClockUpdatedSeconds(reader: FieldReader): ClockUpdatedSecondsData {
    const out: Mutable<ClockUpdatedSecondsData> = {
        TimeSeconds: reader.number('TimeSeconds'),
        bOvertime: reader.boolean('bOvertime'),
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodeCrossbarHit(reader: FieldReader): CrossbarHitData {
    const out: Mutable<CrossbarHitData> = {
        BallLocation: decodeVector(reader.child('BallLocation')),
        BallSpeed: reader.number('BallSpeed'),
        ImpactForce: reader.number('ImpactForce'),
        BallLastTouch: decodeBallLastTouch(reader.child('BallLastTouch')),
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodeGoalScored(reader: FieldReader): GoalScoredData {
    const out: Mutable<GoalScoredData> = {
        GoalSpeed: reader.number('GoalSpeed'),
        GoalTime: reader.number('GoalTime'),
        ImpactLocation: decodeVector(reader.child('ImpactLocation')),
        Scorer: decodePlayerRef(reader.child('Scorer')),
        BallLastTouch: decodeBallLastTouch(reader.child('BallLastTouch')),
    };
    const assister = reader.optionalChild('Assister');

    if (assister !== undefined) out.Assister = decodePlayerRef(assister);

    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodeMatchEnded(reader: FieldReader): MatchEndedData {
    const out: Mutable<MatchEndedData> = {
        WinnerTeamNum: reader.teamNum('WinnerTeamNum'),
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodePlayerJoined(reader: FieldReader): PlayerJoinedData {
    const out: Mutable<PlayerJoinedData> = {
        PlayerName: reader.string('PlayerName'),
        PrimaryId: reader.string('PrimaryId'),
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodePlayerLeft(reader: FieldReader): PlayerLeftData {
    return decodePlayerJoined(reader);
}

function decodeReplayCreated(reader: FieldReader): ReplayCreatedData {
    const out: Mutable<ReplayCreatedData> = {
        FileName: reader.string('FileName'),
        Date: reader.string('Date'),
    };
    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

function decodeStatfeedEvent(reader: FieldReader): StatfeedEventData {
    const out: Mutable<StatfeedEventData> = {
        EventName: reader.string('EventName'),
        Type: reader.string('Type'),
        MainTarget: decodePlayerRef(reader.child('MainTarget')),
    };
    const secondary = reader.optionalChild('SecondaryTarget');

    if (secondary !== undefined) out.SecondaryTarget = decodePlayerRef(secondary);

    const guid = readMatchGuid(reader);

    if (guid !== undefined) out.MatchGuid = guid;

    return out;
}

type DecoderMap = {
    readonly [K in StatsApiEventName]: (reader: FieldReader) => StatsApiEventMap[K];
};

const DECODERS: DecoderMap = {
    UpdateState: decodeUpdateState,
    BallHit: decodeBallHit,
    BoostPickup: decodeBoostPickup,
    ClockUpdatedSeconds: decodeClockUpdatedSeconds,
    CountdownBegin: decodeLifecycle,
    CrossbarHit: decodeCrossbarHit,
    GoalReplayEnd: decodeLifecycle,
    GoalReplayStart: decodeLifecycle,
    GoalReplayWillEnd: decodeLifecycle,
    GoalScored: decodeGoalScored,
    MatchCreated: decodeLifecycle,
    MatchDestroyed: decodeLifecycle,
    MatchEnded: decodeMatchEnded,
    MatchInitialized: decodeLifecycle,
    MatchPaused: decodeLifecycle,
    MatchUnpaused: decodeLifecycle,
    PlayerJoined: decodePlayerJoined,
    PlayerLeft: decodePlayerLeft,
    PodiumStart: decodeLifecycle,
    ReplayCreated: decodeReplayCreated,
    RoundStarted: decodeLifecycle,
    StatfeedEvent: decodeStatfeedEvent,
};

export type DecodeResult =
    | {
          readonly kind: 'message';
          readonly message: StatsApiMessage;
          readonly warnings: readonly ValidationIssue[];
      }
    | {
          readonly kind: 'invalid';
          readonly event: StatsApiEventName;
          readonly raw: Readonly<Record<string, unknown>>;
          readonly issues: readonly ValidationIssue[];
      }
    | {
          readonly kind: 'unknown-event';
          readonly event: string;
          readonly raw: Readonly<Record<string, unknown>>;
      }
    | {
          readonly kind: 'malformed';
          readonly frame: string;
          readonly reason: string;
      };

function malformed(frame: string, reason: string): DecodeResult {
    return { kind: 'malformed', frame, reason };
}

export function decodeFrame(frame: string, receivedAt: number = Date.now()): DecodeResult {
    let envelope: unknown;

    try {
        envelope = JSON.parse(frame);
    } catch (error) {
        return malformed(frame, error instanceof Error ? error.message : String(error));
    }

    if (!isRecord(envelope)) {
        return malformed(frame, 'envelope is not a JSON object');
    }

    const eventName = envelope['Event'];

    if (typeof eventName !== 'string') {
        return malformed(frame, 'envelope is missing a string Event field');
    }

    const rawData = envelope['Data'];
    let payload: Readonly<Record<string, unknown>>;

    if (isRecord(rawData)) {
        payload = rawData;
    } else if (typeof rawData === 'string') {
        let reparsed: unknown;

        try {
            reparsed = JSON.parse(rawData);
        } catch (error) {
            return malformed(
                frame,
                `Data was a string but not valid JSON: ${describeError(error)}`,
            );
        }

        if (!isRecord(reparsed)) {
            return malformed(frame, 'Data was a JSON string but did not contain an object');
        }

        payload = reparsed;
    } else if (rawData === undefined) {
        payload = {};
    } else {
        return malformed(frame, 'Data is neither an object nor a JSON string');
    }

    if (!isStatsApiEventName(eventName)) {
        return { kind: 'unknown-event', event: eventName, raw: payload };
    }

    const reader = createReader(payload);
    const data = DECODERS[eventName](reader);

    if (!reader.ok) {
        return { kind: 'invalid', event: eventName, raw: payload, issues: reader.recorded };
    }

    const message = { event: eventName, data, raw: payload, receivedAt } as StatsApiMessage;

    return { kind: 'message', message, warnings: reader.warnings };
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
