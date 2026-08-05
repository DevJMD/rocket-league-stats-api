/**
 * Commands the Stats API accepts back over the same socket.
 *
 * Commands documented as "One of" are modelled as unions, so the compiler enforces
 * that exactly one form is supplied.
 *
 * @example
 * ```ts
 * const pov: StatsApiCommand = {
 *     Command: 'ChangePOV',
 *     Data: { Focus: '1', Perspective: 'PlayerView' },
 * };
 *
 * const replay: StatsApiCommand = {
 *     Command: 'LoadReplay',
 *     Data: { FileName: 'Stadium_P_2026-06-05_18-42' },
 * };
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

export const PERSPECTIVES = [
    'Fly',
    'SoftAttach',
    'HardAttach',
    'PlayerView',
    'AutoCam',
    'Camera_Director',
] as const;

export type Perspective = (typeof PERSPECTIVES)[number];

export const FOCUS_BALL = 'Ball';

export type Focus = typeof FOCUS_BALL | `${number}`;

export type ChangePovCommandData =
    | { readonly Focus: Focus; readonly Perspective?: Perspective }
    | { readonly Focus?: Focus; readonly Perspective: Perspective };

export type LoadReplayCommandData =
    | { readonly FileName: string; readonly Path?: string }
    | { readonly FileName?: string; readonly Path: string };

export type SeekReplayCommandData =
    | { readonly Frame: number; readonly TimeSeconds?: number }
    | { readonly Frame?: number; readonly TimeSeconds: number };

export interface SetGameSpeedCommandData {
    readonly Speed: number;
}

export interface SetHudVisibilityCommandData {
    readonly bVisible: boolean;
}

export interface SetMatchPausedCommandData {
    readonly bPaused: boolean;
}

export const STATS_API_COMMANDS = [
    'ChangePOV',
    'LoadReplay',
    'SeekReplay',
    'SetGameSpeed',
    'SetHUDVisibility',
    'SetMatchPaused',
] as const;

export type StatsApiCommandName = (typeof STATS_API_COMMANDS)[number];

export interface StatsApiCommandMap {
    readonly ChangePOV: ChangePovCommandData;
    readonly LoadReplay: LoadReplayCommandData;
    readonly SeekReplay: SeekReplayCommandData;
    readonly SetGameSpeed: SetGameSpeedCommandData;
    readonly SetHUDVisibility: SetHudVisibilityCommandData;
    readonly SetMatchPaused: SetMatchPausedCommandData;
}

export type StatsApiCommandData<K extends StatsApiCommandName> = StatsApiCommandMap[K];

export type StatsApiCommand = {
    [K in StatsApiCommandName]: {
        readonly Command: K;
        readonly Data: StatsApiCommandMap[K];
    };
}[StatsApiCommandName];
