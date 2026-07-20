export const CELL_SIZE = 160;
export const GAP = 8;
export const STEP = CELL_SIZE + GAP;
export const CHUNK_SIZE = 16;
// Cells beyond the visible edge that still get rendered (and so still fetch
// their thumbnail) — kept small since every extra ring here is real
// bandwidth on every load, not just a smoother pan.
export const BUFFER = 1;

// Below this drag distance (px) a pointer-down/up pair is treated as a
// tap/click rather than a pan gesture.
export const TAP_THRESHOLD = 6;

// Max pan speed (px per 16.67ms tick) at full joystick deflection.
export const JOYSTICK_MAX_SPEED = 12;

// Height (px) of the fixed mobile controls row at the bottom of the screen
// (bottom-8 offset + the joystick/recenter button's own height, plus a
// little breathing room) — subtracted from the viewport when recentering
// so the target cell lands in the middle of the space actually above the
// controls, not the literal screen center (which the joystick would cover).
export const MOBILE_CONTROLS_HEIGHT = 144;

// Minimap radar (mobile, shown while the joystick is held). On-screen
// radius in px, and how many grid cells across that radius should
// represent — both are first-pass visual defaults, easy to retune.
export const MINIMAP_RADIUS_PX = 100;
export const MINIMAP_WORLD_RADIUS_CELLS = 15;
export const MINIMAP_SCALE = MINIMAP_RADIUS_PX / (MINIMAP_WORLD_RADIUS_CELLS * STEP);

// Column count used to pack filtered/clustered browse results (e.g. "my
// sketches", a theme) into a compact virtual grid starting at the origin,
// instead of their real scattered world coordinates.
export const FILTERED_GRID_COLS = 6;

// Discrete thumbnail zoom steps, as a multiplier of the normal CELL_SIZE —
// a single toggle between normal (index 1, the default) and one step down
// (halved). Changed via a single +/- toggle button.
export const ZOOM_LEVELS = [0.5, 1];
export const DEFAULT_ZOOM_INDEX = 1;
