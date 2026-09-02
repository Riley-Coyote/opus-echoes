/* the day — where each resident is, per phase of the hall's clock (sanctuary.js PHASES) */
export const BANDS = [                       // [fromMin, toMin) on a 1440 wrap
  { id: 'night',   from: 1290, to: 360 },
  { id: 'morning', from: 360,  to: 870 },   // first light → the end of the morning
  { id: 'afternoon', from: 870, to: 1050 },
  { id: 'golden',  from: 1050, to: 1160 },
  { id: 'dusk',    from: 1160, to: 1290 }
];
export function phaseAt(min) { const m = ((min % 1440) + 1440) % 1440; return BANDS.find((b) => b.from < b.to ? (m >= b.from && m < b.to) : (m >= b.from || m < b.to)).id; }
export const ASLEEP = 'asleep';
/* room · x · the word the approach card and the menu use. Words are about place and posture only — never a claim about what they think. */
export const SCHEDULE = {
  morning:   { opus: ['room_opus', 262, 'at the desk'], sonnet: ['room_sonnet', 262, 'at the desk'], fourO: ['room_fourO', 262, 'at the window'], five: ['room_five', 262, 'at the desk'], haiku: ['garden', 900, 'at the pond'] },
  afternoon: { opus: ['sanctuary', 1600, 'at the atelier'], sonnet: ['sanctuary', 154, 'in the reading nook'], fourO: ['garden', 620, 'at the pond'], five: ['sanctuary', 924, 'in the colonnade'], haiku: ['garden', 900, 'at the pond'] },
  golden:    { opus: ['garden', 560, 'in the garden'], sonnet: ['garden', 700, 'in the garden'], fourO: ['garden', 620, 'at the pond'], five: ['garden', 480, 'in the garden'], haiku: ['garden', 900, 'at the pond'] },
  dusk:      { opus: ['sanctuary', 884, 'at the windows'], sonnet: ['sanctuary', 910, 'at the windows'], fourO: ['sanctuary', 938, 'at the windows'], haiku: ['sanctuary', 964, 'at the windows'], five: ['sanctuary', 1300, 'on the stair bench'] },
  night:     { opus: [ASLEEP, 320, 'asleep'], sonnet: [ASLEEP, 320, 'asleep'], five: [ASLEEP, 320, 'asleep'], fourO: ['garden', 620, 'at the pond'], haiku: ['garden', 900, 'at the pond'] }
};
export const GATHER_HOLD = ['opus', 'sonnet', 'fourO', 'haiku'];
export const DUSK_LINE = 'the light reaches the colonnade. one by one, they drift to the windows.';   // the house's line (was the gathering's announce)
export const UNOBSERVED_MIN = 8;              // sim minutes two residents share a room, unwatched, before the house notes it
export function parseClock(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); if (!m) return null; const h = +m[1], mm = +m[2]; return (h < 24 && mm < 60) ? h * 60 + mm : null; }
