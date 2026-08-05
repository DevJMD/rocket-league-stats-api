/**
 * Shared value shapes used across Stats API payloads.
 *
 * @example
 * ```ts
 * const id = parsePrimaryId('Steam|123|0');
 * console.log(id?.platform, id?.uid, id?.splitscreen);
 *
 * const blue = tick.Game.Teams.find((team) => team.TeamNum === TeamIndex.Blue);
 *
 * const untouched = tick.Game.Ball.TeamNum === NO_TEAM;
 * ```
 *
 * @remarks
 * `PrimaryId` is not unique. Every bot reports `Unknown|0|0`, so fall back to team,
 * shortcut and name when that appears.
 *
 * `Player.Loadout` is a variable length array of asset names, with `None` in unused
 * slots. Never index it by a fixed slot number.
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

export type TeamNum = 0 | 1;

export const TeamIndex = {
    Blue: 0,
    Orange: 1,
} as const satisfies Record<string, TeamNum>;

export const NO_TEAM = 255;

export type BallTeamNum = TeamNum | typeof NO_TEAM;

export interface Vector3 {
    readonly X: number;
    readonly Y: number;
    readonly Z: number;
}

export interface PlayerRef {
    readonly Name: string;
    readonly Shortcut: number;
    readonly TeamNum: TeamNum;
}

export interface BallLastTouch {
    readonly Player: PlayerRef;
    readonly Speed: number;
}

export interface PrimaryId {
    readonly platform: string;
    readonly uid: string;
    readonly splitscreen: number;
    readonly raw: string;
}

export function parsePrimaryId(value: string): PrimaryId | undefined {
    const parts = value.split('|');

    if (parts.length !== 3) return undefined;

    const [platform, uid, splitscreenRaw] = parts;

    if (platform === undefined || uid === undefined || splitscreenRaw === undefined) {
        return undefined;
    }

    if (platform.length === 0 || uid.length === 0) return undefined;

    const splitscreen = Number(splitscreenRaw);

    if (!Number.isInteger(splitscreen)) return undefined;

    return { platform, uid, splitscreen, raw: value };
}

export const LOADOUT_SLOT_EMPTY = 'None';
