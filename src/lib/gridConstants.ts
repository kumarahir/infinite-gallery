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
