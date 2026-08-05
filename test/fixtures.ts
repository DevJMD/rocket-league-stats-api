export const MATCH_GUID = 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6';

export const UPDATE_STATE_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    Players: [
        {
            Name: 'PlayerA',
            PrimaryId: 'Steam|123|0',
            Shortcut: 1,
            TeamNum: 0,
            Score: 125,
            Goals: 1,
            Shots: 2,
            Assists: 0,
            Saves: 1,
            Touches: 14,
            CarTouches: 3,
            Demos: 0,
            Loadout: [
                'body_grain',
                'Skin_bartees',
                'Wheel_SoccerBall',
                'Boost_AlphaReward',
                'None',
                'None',
            ],
            bHasCar: true,
            Speed: 1200,
            Boost: 45,
            bBoosting: true,
            bOnGround: true,
            bOnWall: false,
            bPowersliding: false,
            bDemolished: true,
            Attacker: {
                Name: 'PlayerB',
                Shortcut: 2,
                TeamNum: 1,
            },
            bSupersonic: true,
            PickupClass: 'SpecialPickup_GrapplingHook_TA',
        },
    ],
    Game: {
        Teams: [
            {
                Name: 'Blue',
                TeamNum: 0,
                Score: 1,
                ColorPrimary: '0000FF',
                ColorSecondary: '0000AA',
            },
        ],
        PlaylistId: 11,
        TimeSeconds: 180,
        bOvertime: false,
        Frame: 120,
        Elapsed: 50.2,
        Ball: {
            Speed: 850.5,
            TeamNum: 0,
        },
        bReplay: false,
        bHasWinner: true,
        Winner: 'Blue',
        Arena: 'Stadium_P',
        bHasTarget: true,
        Target: {
            Name: 'PlayerA',
            Shortcut: 1,
            TeamNum: 0,
        },
    },
} as const;

export const BALL_HIT_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    Players: [{ Name: 'PlayerA', Shortcut: 1, TeamNum: 0 }],
    Ball: {
        PreHitSpeed: 0,
        PostHitSpeed: 1450.2,
        Location: { X: -512, Y: 100, Z: 200 },
    },
} as const;

export const BOOST_PICKUP_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    Player: { Name: 'PlayerA', Shortcut: 1, TeamNum: 0 },
    Location: { X: -3072, Y: 0, Z: 73 },
    BoostAmount: 100,
    BoostType: 'BoostType_Pill',
    bReplay: false,
} as const;

export const CROSSBAR_HIT_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    BallLocation: { X: 120, Y: -2944, Z: 320 },
    BallSpeed: 870.3,
    ImpactForce: 127.5,
    BallLastTouch: {
        Player: { Name: 'PlayerA', Shortcut: 1, TeamNum: 0 },
        Speed: 120,
    },
} as const;

export const GOAL_SCORED_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    GoalSpeed: 87.3,
    GoalTime: 127.5,
    ImpactLocation: { X: 0, Y: -2944, Z: 320 },
    Scorer: { Name: 'PlayerA', Shortcut: 1, TeamNum: 0 },
    Assister: { Name: 'PlayerC', Shortcut: 3, TeamNum: 0 },
    BallLastTouch: {
        Player: { Name: 'PlayerA', Shortcut: 1, TeamNum: 0 },
        Speed: 125,
    },
} as const;

export const PLAYER_JOINED_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    PlayerName: 'PlayerA',
    PrimaryId: 'Steam|123|0',
} as const;

export const REPLAY_CREATED_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    FileName: 'Stadium_P_2026-06-05_18-42',
    Date: '2026-06-05 18:42:13',
} as const;

export const STATFEED_EVENT_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    EventName: 'Demolish',
    Type: 'Demolition',
    MainTarget: { Name: 'PlayerA', Shortcut: 1, TeamNum: 0 },
    SecondaryTarget: { Name: 'PlayerB', Shortcut: 2, TeamNum: 1 },
} as const;

export const MATCH_ENDED_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    WinnerTeamNum: 0,
} as const;

export const CLOCK_UPDATED_EXAMPLE = {
    MatchGuid: MATCH_GUID,
    TimeSeconds: 180,
    bOvertime: false,
} as const;

export function frame(event: string, data: unknown): string {
    return JSON.stringify({ Event: event, Data: data });
}

export function frameWithEncodedData(event: string, data: unknown): string {
    return JSON.stringify({ Event: event, Data: JSON.stringify(data) });
}
