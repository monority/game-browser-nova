/**
 * Food conservation (Step067): the granary loses a fixed share of its stock
 * every tick. A content value, not a simulation literal — the phase reads it
 * from here so a rate change has exactly one home
 * (docs/roadmap/Step056-food-preservation-design.md §8).
 *
 * This is a STORAGE-LOSS RATE, not a shelf life: it degrades the aggregate
 * stock (fresh production included), never the age of individual units. No
 * FIFO, no cohorts — do not present it as an expiry system.
 *
 * 3% is the first rate measured to stop the granary pinning at +3/tick
 * (Step056 §7); it remains an experimental value to be re-measured, not a
 * settled balance constant.
 */
export const FOOD_SPOILAGE_RATE_PER_TICK = 0.03;
