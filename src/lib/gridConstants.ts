export const CELL_SIZE = 160;
export const GAP = 8;
export const STEP = CELL_SIZE + GAP;
export const CHUNK_SIZE = 16;
export const BUFFER = 2;

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
