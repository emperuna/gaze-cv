const state = globalThis as typeof globalThis & { gazeAnalysisBusy?: boolean };

export function acquireProcessingSlot() {
  if (state.gazeAnalysisBusy) throw new Error('Another analysis is running. Stop the camera or wait for it to finish.');
  state.gazeAnalysisBusy = true;
  let released = false;
  return () => { if (!released) { released = true; state.gazeAnalysisBusy = false; } };
}
