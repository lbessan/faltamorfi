/**
 * El Select de shadcn (Radix UI) no permite `value=""` para opciones, así que
 * usamos este sentinel cuando el usuario elige "Sin asignar". Las server
 * actions lo convierten a null antes de tocar la DB.
 */
export const EMPTY_VALUE_SENTINEL = "__none__";

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

export const INITIAL_ACTION_STATE: ActionState = { status: "idle" };
