import { on, once, RocketLeagueStatsClient, StatsPlugin, throttle } from '../src/index.ts';
import type {
    ConnectedInfo,
    GoalScoredData,
    MatchEndedData,
    StatfeedEventData,
    UpdateStateData,
} from '../src/index.ts';

class ScoreboardPlugin extends StatsPlugin {
    @on('UpdateState')
    @throttle(500)
    render(tick: UpdateStateData): void {
        const blue = tick.Game.Teams.find((team) => team.TeamNum === 0)?.Score ?? 0;
        const orange = tick.Game.Teams.find((team) => team.TeamNum === 1)?.Score ?? 0;
        const seconds = Math.max(0, Math.floor(tick.Game.TimeSeconds));
        const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

        console.log(`[scoreboard] Blue ${blue} - ${orange} Orange  ${clock}`);
    }

    @on('connected')
    announce(info: ConnectedInfo): void {
        console.log(`[scoreboard] connected to ${info.host}:${info.port}`);
    }
}

class HighlightPlugin extends StatsPlugin {
    #goals: string[] = [];
    #demos = 0;

    @once('MatchInitialized')
    start(): void {
        this.#goals = [];
        this.#demos = 0;
        console.log('[highlights] match starting, recording');
    }

    @on('GoalScored')
    recordGoal(goal: GoalScoredData): void {
        const assist = goal.Assister === undefined ? '' : ` assisted by ${goal.Assister.Name}`;

        this.#goals.push(`${goal.Scorer.Name}${assist}`);
        console.log(`[highlights] goal ${this.#goals.length}: ${goal.Scorer.Name}${assist}`);
    }

    @on('StatfeedEvent')
    recordStat(stat: StatfeedEventData): void {
        if (stat.EventName === 'Demolish') this.#demos += 1;
    }

    @on('MatchEnded')
    summarize(result: MatchEndedData): void {
        console.log(`[highlights] team ${result.WinnerTeamNum} won`);
        console.log(`[highlights] ${this.#goals.length} goals, ${this.#demos} demolitions`);

        for (const [index, goal] of this.#goals.entries()) {
            console.log(`[highlights]   ${index + 1}. ${goal}`);
        }
    }

    protected override onDetach(): void {
        console.log('[highlights] detached');
    }
}

const highlights = new HighlightPlugin();

const client = new RocketLeagueStatsClient()
    .tickRate(10)
    .use(new ScoreboardPlugin())
    .use(highlights)
    .onError((error) => {
        console.error(`[client] ${error.code}: ${error.message}`);
    });

process.on('SIGINT', () => {
    client.unuse(highlights);
    void client.disconnect().then(() => {
        process.exit(0);
    });
});

await client.connect();
