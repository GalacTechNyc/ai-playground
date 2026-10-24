// Shared input state for the spectator character (keyboard + touch joystick write here; Scene reads it each frame).
export const input = { x: 0, z: 0, jump: false, run: false };

// Local player position + pending launch impulse (written by Player, read by TraversalKit).
export const player = { pos: { x: 0, y: 0, z: 8 }, impulse: null as null | { x: number; y: number; z: number } };
