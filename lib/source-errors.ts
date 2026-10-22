// A provider answered correctly but listed no postings. Kept distinct from
// transport or format failures so history can tell "hiring closed" apart from
// "could not observe". Since 2026-10-08 (phase 3 spec §6) the snapshot records
// it as a healthy collection with zero postings when the board had no
// Seoul/Pangyo postings before (already empty, or new); a board that had some
// keeps them and is marked errorCode "empty", as before.
export class EmptyListError extends Error {
  readonly code = "empty" as const;
}
