import { singletonObjectiveName } from '../../emit/compile'

const MC_OBJECTIVE_LIMIT = 16

describe('singletonObjectiveName', () => {
  test('short names pass through unchanged', () => {
    // "Foo" (3) + "hp" (2) = 5 <= 12, so format is _s_Foo_hp (9 chars)
    const result = singletonObjectiveName('Foo', 'hp')
    expect(result).toBe('_s_Foo_hp')
    expect(result.length).toBeLessThanOrEqual(MC_OBJECTIVE_LIMIT)
  })

  test('names whose combined length is exactly 12 pass through unchanged', () => {
    // struct "SSSS" (4) + field "FFFFFFFF" (8) = 12, format: _s_SSSS_FFFFFFFF = 16 chars
    const result = singletonObjectiveName('SSSS', 'FFFFFFFF')
    expect(result).toBe('_s_SSSS_FFFFFFFF')
    expect(result.length).toBe(MC_OBJECTIVE_LIMIT)
  })

  test('names with combined length 13+ are truncated to struct[0..4] + field[0..8]', () => {
    // struct "GameState" (9) + field "velocity" (8) = 17 > 12, triggers truncation
    const result = singletonObjectiveName('GameState', 'velocity')
    expect(result).toBe('_s_Game_velocity')
    expect(result.length).toBe(MC_OBJECTIVE_LIMIT)
  })

  test('truncated result is always within the 16-char Minecraft limit', () => {
    const result = singletonObjectiveName('AVeryLongStructName', 'aVeryLongFieldName')
    expect(result.length).toBeLessThanOrEqual(MC_OBJECTIVE_LIMIT)
    // _s_ (3) + 4 + _ (1) + 8 = 16
    expect(result).toBe('_s_AVer_aVeryLon')
  })

  // Known limitation: two distinct long names can produce the same objective name
  // after truncation, because only the first 4 chars of struct and 8 of field are kept.
  test('collision after truncation is a known limitation (documents current behaviour)', () => {
    const a = singletonObjectiveName('GameState', 'positionX')
    const b = singletonObjectiveName('GameState', 'positionY')
    // Both truncate to _s_Game_position — a collision in the current implementation.
    // This test documents the limitation rather than asserting distinct outputs.
    expect(a).toBe('_s_Game_position')
    expect(b).toBe('_s_Game_position')
    expect(a).toBe(b) // collision confirmed — callers must avoid long overlapping names
  })
})
