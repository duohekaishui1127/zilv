function calculateExerciseCalories({ met, weightKg, durationMinutes }) {
  const m = Number(met)
  const w = Number(weightKg)
  const d = Number(durationMinutes)
  if (![m, w, d].every(Number.isFinite) || m <= 0 || w <= 0 || d <= 0) return null
  return Math.round(m * 3.5 * w / 200 * d)
}

module.exports = { calculateExerciseCalories }
