import { parsePrimaryId, RocketLeagueStatsClient, TeamIndex } from '../src/index.ts';
import type { GameState, Player } from '../src/index.ts';

function clock(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(whole / 60);

    return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

function scoreline(game: GameState): string {
    const blue = game.Teams.find((team) => team.TeamNum === TeamIndex.Blue)?.Score ?? 0;
    const orange = game.Teams.find((team) => team.TeamNum === TeamIndex.Orange)?.Score ?? 0;
    const overtime = game.bOvertime ? ' OVERTIME' : '';

    return `Blue ${blue} - ${orange} Orange  ${clock(game.TimeSeconds)}${overtime}`;
}

function describePlayer(player: Player): string {
    const boost = player.Boost === undefined ? '' : ` boost ${player.Boost}`;

    return `${player.Name} ${player.Goals}g ${player.Assists}a ${player.Saves}s${boost}`;
}

const client = new RocketLeagueStatsClient()
    .tickRate(10)
    .on('UpdateState', (tick) => {
        const roster = tick.Players.map(describePlayer).join(' | ');

        console.log(`${scoreline(tick.Game)}  ${roster}`);
    })
    .on('GoalScored', (goal) => {
        const assist = goal.Assister === undefined ? '' : ` (assist ${goal.Assister.Name})`;

        console.log(`GOAL ${goal.Scorer.Name}${assist} at ${Math.round(goal.GoalSpeed)} uu/s`);
    })
    .on('StatfeedEvent', (stat) => {
        const other = stat.SecondaryTarget === undefined ? '' : ` -> ${stat.SecondaryTarget.Name}`;

        console.log(`STAT ${stat.EventName} ${stat.MainTarget.Name}${other}`);
    })
    .on('PlayerJoined', (joined) => {
        const id = parsePrimaryId(joined.PrimaryId);

        console.log(`JOIN ${joined.PlayerName} on ${id?.platform ?? 'unknown platform'}`);
    })
    .on('MatchEnded', (result) => {
        console.log(`MATCH OVER, team ${result.WinnerTeamNum} wins`);
    })
    .onConnected((info) => {
        console.log(`Connected to ${info.host}:${info.port}`);
    })
    .onDisconnected((info) => {
        console.log(`Disconnected (${info.reason}), reconnecting: ${String(info.willReconnect)}`);
    })
    .onError((error) => {
        console.error(`${error.code}: ${error.message}`);
    });

process.on('SIGINT', () => {
    void client.disconnect().then(() => {
        process.exit(0);
    });
});

await client.connect();
