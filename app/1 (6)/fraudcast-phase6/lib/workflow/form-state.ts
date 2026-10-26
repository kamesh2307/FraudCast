// Shared result shape for Phase 6 forms (kept outside the "use server" file, which may only export functions).
export type FormState = { ok: boolean; message: string | null; error: string | null; at: number };
export const INITIAL_FORM_STATE: FormState = { ok: false, message: null, error: null, at: 0 };
