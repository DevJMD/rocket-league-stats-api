/**
 * Game side configuration for the Stats API.
 *
 * The player edits an ini file and restarts the game. Nothing here is set by the
 * library. `PacketSendRate` doubles as the on switch, since 0 disables the feature.
 *
 * @example
 * ```ts
 * console.log(formatGameConfig({ PacketSendRate: 30, Port: 49123, WebPort: 49124 }));
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

export interface StatsApiGameConfig {
    readonly PacketSendRate: number;
    readonly Port: number;
    readonly WebPort: number;
}

export const CONFIG_SECTION = 'TAGame.MatchStatsExporter_TA';

export const CONFIG_FILE = 'TAStatsAPI.ini';

export const CONFIG_FILE_FALLBACK = 'DefaultStatsAPI.ini';

export const DEFAULT_PORT = 49_123;

export const DEFAULT_WEB_PORT = 49_124;

export const DEFAULT_HOST = '127.0.0.1';

export const MAX_PACKET_SEND_RATE = 120;

export function formatGameConfig(config: StatsApiGameConfig): string {
    return [
        `[${CONFIG_SECTION}]`,
        `PacketSendRate=${config.PacketSendRate}`,
        `Port=${config.Port}`,
        `WebPort=${config.WebPort}`,
    ].join('\n');
}
