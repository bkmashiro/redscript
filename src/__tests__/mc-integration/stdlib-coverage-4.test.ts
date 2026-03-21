/**
 * RedScript MC Integration Tests — stdlib coverage 4
 *
 * Tests graph / linalg / physics / parabola / quaternion / bigint / heap / pathfind
 * stdlib modules against a real Paper 1.21.4 server with TestHarnessPlugin.
 *
 * Prerequisites:
 *   - Paper server running with TestHarnessPlugin on port 25561
 *   - MC_SERVER_DIR env var pointing to server directory
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest stdlib-coverage-4 --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test4')

const STDLIB_DIR = path.join(__dirname, '../../stdlib')

let serverOnline = false
let mc: MCTestClient

// ---------------------------------------------------------------------------
// Helper: compile and deploy a RedScript snippet with optional stdlib libs
// ---------------------------------------------------------------------------
function writeFixture(source: string, namespace: string, librarySources: string[] = []): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(
      path.join(DATAPACK_DIR, 'pack.mcmeta'),
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests 4' } })
    )
  }

  const result = compile(source, { namespace, librarySources })

  for (const file of result.files) {
    if (file.path === 'pack.mcmeta') continue
    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    // Merge minecraft tag files (tick.json / load.json) instead of overwriting
    if (file.path.includes('data/minecraft/tags/') && fs.existsSync(filePath)) {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const incoming = JSON.parse(file.content)
      const merged = { values: [...new Set([...(existing.values ?? []), ...(incoming.values ?? [])])] }
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2))
    } else {
      fs.writeFileSync(filePath, file.content)
    }
  }
}

function readStdlib(name: string): string {
  return fs.readFileSync(path.join(STDLIB_DIR, name), 'utf-8')
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (process.env.MC_OFFLINE === 'true') {
    console.warn('⚠ MC_OFFLINE=true — skipping stdlib coverage 4 integration tests')
    return
  }

  mc = new MCTestClient(MC_HOST, MC_PORT)

  try {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await mc.isOnline()) { serverOnline = true; break }
      await new Promise(r => setTimeout(r, 1000))
    }
  } catch {
    serverOnline = false
  }

  if (!serverOnline) {
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping stdlib coverage 4 tests`)
    return
  }

  // Clear stale minecraft tag files before writing fixtures
  for (const tagFile of [
    'data/minecraft/tags/function/tick.json',
    'data/minecraft/tags/function/load.json',
    'data/minecraft/tags/functions/tick.json',
    'data/minecraft/tags/functions/load.json',
  ]) {
    const p = path.join(DATAPACK_DIR, tagFile)
    if (fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ values: [] }, null, 2))
  }

  // Ensure result objective exists
  await mc.command('/scoreboard objectives add sc4_result dummy').catch(() => {})

  const MATH_SRC = readStdlib('math.mcrs')
  const MATH_HP_SRC = readStdlib('math_hp.mcrs')
  const GRAPH_SRC = readStdlib('graph.mcrs')
  const LINALG_SRC = readStdlib('linalg.mcrs')
  const PHYSICS_SRC = readStdlib('physics.mcrs')
  const PARABOLA_SRC = readStdlib('parabola.mcrs')
  const QUATERNION_SRC = readStdlib('quaternion.mcrs')
  const BIGINT_SRC = readStdlib('bigint.mcrs')
  const HEAP_SRC = readStdlib('heap.mcrs')
  const PATHFIND_SRC = readStdlib('pathfind.mcrs')

  // ─── graph module ────────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_graph_test

    fn test_graph_node_count() {
      let g: int[] = graph_new(5)
      let n: int = graph_node_count(g)
      scoreboard_set("#graph_nodes", sc4_result, n)
    }

    fn test_graph_add_edge_count() {
      let g: int[] = graph_new(4)
      g = graph_add_edge(g, 0, 1, 1)
      g = graph_add_edge(g, 1, 2, 2)
      g = graph_add_edge(g, 2, 3, 3)
      let e: int = graph_edge_count(g)
      scoreboard_set("#graph_edges", sc4_result, e)
    }

    fn test_graph_has_path_direct() {
      let g: int[] = graph_new(4)
      g = graph_add_edge(g, 0, 1, 1)
      g = graph_add_edge(g, 1, 2, 1)
      g = graph_add_edge(g, 2, 3, 1)
      let found: int = graph_has_path(g, 0, 3)
      scoreboard_set("#graph_path_yes", sc4_result, found)
    }

    fn test_graph_has_path_none() {
      let g: int[] = graph_new(4)
      g = graph_add_edge(g, 0, 1, 1)
      // no edge from 1->2 or to 3
      let found: int = graph_has_path(g, 0, 3)
      scoreboard_set("#graph_path_no", sc4_result, found)
    }

    fn test_graph_shortest_path() {
      // 0->1 weight 1, 0->2 weight 4, 1->2 weight 2, 1->3 weight 6, 2->3 weight 3
      // shortest 0->3 = 0->1->2->3 = 1+2+3 = 6
      let g: int[] = graph_new(4)
      g = graph_add_edge(g, 0, 1, 1)
      g = graph_add_edge(g, 0, 2, 4)
      g = graph_add_edge(g, 1, 2, 2)
      g = graph_add_edge(g, 1, 3, 6)
      g = graph_add_edge(g, 2, 3, 3)
      let dist: int[] = [0, 0, 0, 0]
      let d: int = graph_shortest_path(g, 0, 3, dist)
      scoreboard_set("#graph_dijkstra", sc4_result, d)
    }

    fn test_graph_bfs_order_start() {
      let g: int[] = graph_new(4)
      g = graph_add_edge(g, 0, 1, 1)
      g = graph_add_edge(g, 0, 2, 1)
      g = graph_add_edge(g, 1, 3, 1)
      let vis: int[] = [0, 0, 0, 0]
      let order: int[] = graph_bfs(g, 0, vis)
      let first: int = order[0]
      scoreboard_set("#graph_bfs_first", sc4_result, first)
    }

    fn test_graph_undirected() {
      let g: int[] = graph_new(3)
      g = graph_add_undirected(g, 0, 1, 5)
      let e: int = graph_edge_count(g)
      scoreboard_set("#graph_undirected_edges", sc4_result, e)
    }
  `, 'stdlib_graph_test', [GRAPH_SRC])

  // ─── linalg module ───────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_linalg_test

    fn test_vec2d_dot() {
      // dot([3,4],[3,4]) = 9+16 = 25; ×10000 → expect 25 (double result cast to int)
      let r: double = vec2d_dot(3.0d, 4.0d, 3.0d, 4.0d)
      scoreboard_set("#linalg_dot2d", sc4_result, r as int)
    }

    fn test_vec3d_dot() {
      // dot([1,2,3],[4,5,6]) = 4+10+18 = 32
      let r: double = vec3d_dot(1.0d, 2.0d, 3.0d, 4.0d, 5.0d, 6.0d)
      scoreboard_set("#linalg_dot3d", sc4_result, r as int)
    }

    fn test_vec2d_length() {
      // length([3,4]) = 5.0
      let r: double = vec2d_length(3.0d, 4.0d)
      let ri: int = r as int
      scoreboard_set("#linalg_len2d", sc4_result, ri)
    }

    fn test_vec3d_length() {
      // length([0,3,4]) = 5.0
      let r: double = vec3d_length(0.0d, 3.0d, 4.0d)
      let ri: int = r as int
      scoreboard_set("#linalg_len3d", sc4_result, ri)
    }

    fn test_vec3d_cross_z() {
      // cross([1,0,0],[0,1,0]) = [0,0,1] → z=1
      let rz: double = vec3d_cross_z(1.0d, 0.0d, 0.0d, 0.0d, 1.0d, 0.0d)
      scoreboard_set("#linalg_cross_z", sc4_result, rz as int)
    }

    fn test_mat2d_det() {
      // det([1,2,3,4]) = 1*4-2*3 = -2
      let d: double = mat2d_det(1.0d, 2.0d, 3.0d, 4.0d)
      scoreboard_set("#linalg_det", sc4_result, d as int)
    }

    fn test_solve2d_x() {
      // [2 1][x]=[5]  → x=1, y=3 via Cramer
      // [1 3][y]=[10]
      // det=2*3-1*1=5, x=(5*3-1*10)/5=(15-10)/5=1
      let x: double = solve2d_x(2.0d, 1.0d, 1.0d, 3.0d, 5.0d, 10.0d)
      scoreboard_set("#linalg_cramer_x", sc4_result, x as int)
    }

    fn test_solve2d_y() {
      // y=(2*10-5*1)/5=(20-5)/5=3
      let y: double = solve2d_y(2.0d, 1.0d, 1.0d, 3.0d, 5.0d, 10.0d)
      scoreboard_set("#linalg_cramer_y", sc4_result, y as int)
    }
  `, 'stdlib_linalg_test', [MATH_HP_SRC, LINALG_SRC])

  // ─── physics module ───────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_physics_test

    fn test_gravity_fx() {
      let g: int = gravity_fx()
      scoreboard_set("#phys_gravity", sc4_result, g)
    }

    fn test_projectile_y_at_t0() {
      // y(p0=100, v0=50, t=0) = 100 + 0 - 0 = 100
      let y: int = projectile_y(100, 50, 0)
      scoreboard_set("#phys_proj_y_t0", sc4_result, y)
    }

    fn test_projectile_x_linear() {
      // x(p0=0, v0=200, t=5) = 0 + 200*5 = 1000
      let x: int = projectile_x(0, 200, 5)
      scoreboard_set("#phys_proj_x", sc4_result, x)
    }

    fn test_projectile_max_height() {
      // h = v0y²/(2g) = 80²/(2*8) = 6400/16 = 400
      let h: int = projectile_max_height(80)
      scoreboard_set("#phys_max_h", sc4_result, h)
    }

    fn test_apply_drag() {
      // apply_drag(1000, 9800) = 1000*9800/10000 = 980
      let v: int = apply_drag(1000, 9800)
      scoreboard_set("#phys_drag", sc4_result, v)
    }

    fn test_bounce_v() {
      // bounce_v(-500, 8000) = 500 * 8000 / 10000 = 400
      let v: int = bounce_v(-500, 8000)
      scoreboard_set("#phys_bounce", sc4_result, v)
    }

    fn test_is_grounded_yes() {
      let r: int = is_grounded(0, 0)
      scoreboard_set("#phys_ground_yes", sc4_result, r)
    }

    fn test_is_grounded_no() {
      let r: int = is_grounded(100, 0)
      scoreboard_set("#phys_ground_no", sc4_result, r)
    }

    fn test_spring_force() {
      // spring_force(pos=0, target=100, k=10000) = (100-0)*10000/10000 = 100
      let f: int = spring_force(0, 100, 10000)
      scoreboard_set("#phys_spring", sc4_result, f)
    }

    fn test_friction_decel_positive() {
      // friction_decel(500, 100) = 500-100 = 400
      let v: int = friction_decel(500, 100)
      scoreboard_set("#phys_friction_pos", sc4_result, v)
    }

    fn test_friction_decel_to_zero() {
      // friction_decel(50, 100) = 0 (|v| < friction)
      let v: int = friction_decel(50, 100)
      scoreboard_set("#phys_friction_zero", sc4_result, v)
    }
  `, 'stdlib_physics_test', [MATH_SRC, PHYSICS_SRC])

  // ─── parabola module ──────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_parabola_test

    fn test_parabola_gravity() {
      let g: int = parabola_gravity()
      scoreboard_set("#para_gravity", sc4_result, g)
    }

    fn test_parabola_vx() {
      // vx = dx*10000/ticks = 10*10000/20 = 5000
      let vx: int = parabola_vx(10, 20)
      scoreboard_set("#para_vx", sc4_result, vx)
    }

    fn test_parabola_vz() {
      // vz = dz*10000/ticks = 5*10000/10 = 5000
      let vz: int = parabola_vz(5, 10)
      scoreboard_set("#para_vz", sc4_result, vz)
    }

    fn test_parabola_x_at_t() {
      // x = vx0*t/10000 = 5000*20/10000 = 10
      let x: int = parabola_x(5000, 20)
      scoreboard_set("#para_x", sc4_result, x)
    }

    fn test_parabola_flight_time() {
      // t = 2*vy0/g = 2*4000/800 = 10
      let t: int = parabola_flight_time(4000)
      scoreboard_set("#para_flight_t", sc4_result, t)
    }

    fn test_parabola_in_range_yes() {
      // sqrt(3²+4²)=5 ≤ 10 → 1
      let r: int = parabola_in_range(3, 4, 10)
      scoreboard_set("#para_inrange_yes", sc4_result, r)
    }

    fn test_parabola_in_range_no() {
      // sqrt(10²+10²)≈14.1 > 10 → 0
      let r: int = parabola_in_range(10, 10, 10)
      scoreboard_set("#para_inrange_no", sc4_result, r)
    }

    fn test_parabola_step_vx_drag() {
      // step_vx(10000, 9900) = mulfix(10000,9900) = 9900
      let vx: int = parabola_step_vx(10000, 9900)
      scoreboard_set("#para_step_vx", sc4_result, vx)
    }
  `, 'stdlib_parabola_test', [MATH_SRC, PARABOLA_SRC])

  // ─── quaternion module ────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_quaternion_test

    fn test_quat_identity_w() {
      let w: int = quat_identity_w()
      scoreboard_set("#quat_id_w", sc4_result, w)
    }

    fn test_quat_identity_x() {
      let x: int = quat_identity_x()
      scoreboard_set("#quat_id_x", sc4_result, x)
    }

    fn test_quat_mag_sq_identity() {
      // identity (0,0,0,10000): mag_sq = mulfix(0,0)*3 + mulfix(10000,10000) = 10000
      let ms: int = quat_mag_sq(0, 0, 0, 10000)
      scoreboard_set("#quat_magsq_id", sc4_result, ms)
    }

    fn test_quat_conj_x() {
      // conj of (1000,2000,3000,8000) → x = -1000
      let cx: int = quat_conj_x(1000, 2000, 3000, 8000)
      scoreboard_set("#quat_conj_x", sc4_result, cx)
    }

    fn test_quat_conj_w() {
      // conj preserves w
      let cw: int = quat_conj_w(1000, 2000, 3000, 8000)
      scoreboard_set("#quat_conj_w", sc4_result, cw)
    }

    fn test_quat_dot_identity_self() {
      // dot(identity, identity) = mulfix(10000,10000) = 10000
      let d: int = quat_dot(0, 0, 0, 10000, 0, 0, 0, 10000)
      scoreboard_set("#quat_dot_id", sc4_result, d)
    }

    fn test_quat_mul_identity() {
      // identity * identity → w component should be 10000
      let w: int = quat_mul_w(0, 0, 0, 10000, 0, 0, 0, 10000)
      scoreboard_set("#quat_mul_w_id", sc4_result, w)
    }

    fn test_quat_slerp_at_0() {
      // slerp(a, b, t=0) should give a; test w component of identity
      let w: int = quat_slerp_w(0, 0, 0, 10000, 0, 0, 0, 10000, 0)
      scoreboard_set("#quat_slerp_w_t0", sc4_result, w)
    }
  `, 'stdlib_quaternion_test', [MATH_SRC, QUATERNION_SRC])

  // ─── bigint module ────────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_bigint_test

    fn test_bigint_base() {
      let b: int = bigint_base()
      scoreboard_set("#bigint_base", sc4_result, b)
    }

    fn test_chunk_hi() {
      // chunk_hi(12345) = 12345/10000 = 1
      let h: int = chunk_hi(12345)
      scoreboard_set("#bigint_chunk_hi", sc4_result, h)
    }

    fn test_chunk_lo() {
      // chunk_lo(12345) = 12345%10000 = 2345
      let l: int = chunk_lo(12345)
      scoreboard_set("#bigint_chunk_lo", sc4_result, l)
    }

    fn test_bigint3_add_lo() {
      // (5000 + 7000) % 10000 = 2000
      let lo: int = bigint3_add_lo(5000, 7000)
      scoreboard_set("#bigint3_add_lo", sc4_result, lo)
    }

    fn test_bigint3_carry_lo() {
      // (5000 + 7000) / 10000 = 1
      let c: int = bigint3_carry_lo(5000, 7000)
      scoreboard_set("#bigint3_carry", sc4_result, c)
    }

    fn test_bigint3_cmp_eq() {
      let r: int = bigint3_cmp(0, 0, 100, 0, 0, 100)
      scoreboard_set("#bigint3_cmp_eq", sc4_result, r)
    }

    fn test_bigint3_cmp_gt() {
      let r: int = bigint3_cmp(0, 0, 200, 0, 0, 100)
      scoreboard_set("#bigint3_cmp_gt", sc4_result, r)
    }

    fn test_bigint3_cmp_lt() {
      let r: int = bigint3_cmp(0, 0, 50, 0, 0, 100)
      scoreboard_set("#bigint3_cmp_lt", sc4_result, r)
    }

    fn test_bigint3_mul1_lo() {
      // (3000*3000) % 10000 = 9000000%10000 = 0
      let lo: int = bigint3_mul1_lo(3000, 3000)
      scoreboard_set("#bigint3_mul1_lo", sc4_result, lo)
    }

    fn test_bigint3_mul1_hi() {
      // (3000*3000) / 10000 = 900
      let hi: int = bigint3_mul1_hi(3000, 3000)
      scoreboard_set("#bigint3_mul1_hi", sc4_result, hi)
    }

    fn test_bigint3_to_int32() {
      // hi=1, mid=2, lo=3 → 1*100000000 + 2*10000 + 3 = 100020003
      let v: int = bigint3_to_int32(1, 2, 3)
      scoreboard_set("#bigint3_to_i32", sc4_result, v)
    }
  `, 'stdlib_bigint_test', [BIGINT_SRC])

  // ─── heap module ──────────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_heap_test

    fn test_heap_new_size() {
      let h: int[] = heap_new()
      let sz: int = heap_size(h)
      scoreboard_set("#heap_new_size", sc4_result, sz)
    }

    fn test_heap_push_one() {
      let h: int[] = heap_new()
      h = heap_push(h, 42)
      let sz: int = heap_size(h)
      scoreboard_set("#heap_push1_sz", sc4_result, sz)
    }

    fn test_heap_peek_min() {
      let h: int[] = heap_new()
      h = heap_push(h, 30)
      h = heap_push(h, 10)
      h = heap_push(h, 20)
      let top: int = heap_peek(h)
      scoreboard_set("#heap_peek_min", sc4_result, top)
    }

    fn test_heap_pop_removes_min() {
      let h: int[] = heap_new()
      h = heap_push(h, 30)
      h = heap_push(h, 10)
      h = heap_push(h, 20)
      h = heap_pop(h)
      let top: int = heap_peek(h)
      scoreboard_set("#heap_pop_next", sc4_result, top)
    }

    fn test_heap_size_after_pop() {
      let h: int[] = heap_new()
      h = heap_push(h, 5)
      h = heap_push(h, 3)
      h = heap_pop(h)
      let sz: int = heap_size(h)
      scoreboard_set("#heap_sz_after_pop", sc4_result, sz)
    }

    fn test_max_heap_peek() {
      let h: int[] = heap_new()
      h = max_heap_push(h, 10)
      h = max_heap_push(h, 50)
      h = max_heap_push(h, 30)
      let top: int = heap_peek(h)
      scoreboard_set("#max_heap_peek", sc4_result, top)
    }

    fn test_max_heap_pop_removes_max() {
      let h: int[] = heap_new()
      h = max_heap_push(h, 10)
      h = max_heap_push(h, 50)
      h = max_heap_push(h, 30)
      h = max_heap_pop(h)
      let top: int = heap_peek(h)
      scoreboard_set("#max_heap_next", sc4_result, top)
    }
  `, 'stdlib_heap_test', [HEAP_SRC])

  // ─── pathfind module ──────────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_pathfind_test

    fn test_pf_pack() {
      // pf_pack(3, 5) = 3*16+5 = 53
      let p: int = pf_pack(3, 5)
      scoreboard_set("#pf_pack", sc4_result, p)
    }

    fn test_pf_unpack_x() {
      let p: int = pf_pack(7, 9)
      let x: int = pf_unpack_x(p)
      scoreboard_set("#pf_unpack_x", sc4_result, x)
    }

    fn test_pf_unpack_z() {
      let p: int = pf_pack(7, 9)
      let z: int = pf_unpack_z(p)
      scoreboard_set("#pf_unpack_z", sc4_result, z)
    }

    fn test_pf_is_blocked_oob() {
      let map: int[] = pf_new_map()
      let r: int = pf_is_blocked(map, -1, 0)
      scoreboard_set("#pf_oob", sc4_result, r)
    }

    fn test_pf_set_blocked() {
      let map: int[] = pf_new_map()
      pf_set_blocked(map, 5, 5)
      let r: int = pf_is_blocked(map, 5, 5)
      scoreboard_set("#pf_set_blocked", sc4_result, r)
    }

    fn test_pf_set_open() {
      let map: int[] = pf_new_map()
      pf_set_blocked(map, 5, 5)
      pf_set_open(map, 5, 5)
      let r: int = pf_is_blocked(map, 5, 5)
      scoreboard_set("#pf_set_open", sc4_result, r)
    }

    fn test_pathfind_bfs_path_length() {
      // Straight line from (0,0) to (0,3) → path length 4
      let map: int[] = pf_new_map()
      let path: int[] = pathfind_bfs(map, 0, 0, 0, 3)
      let l: int = path.len
      scoreboard_set("#pf_path_len", sc4_result, l)
    }

    fn test_pathfind_bfs_no_path() {
      // Build a wall at x=1, z=0..15 to block all passage
      let map: int[] = pf_new_map()
      let zi: int = 0
      while (zi < 16) {
        pf_set_blocked(map, 1, zi)
        zi = zi + 1
      }
      let path: int[] = pathfind_bfs(map, 0, 0, 5, 5)
      let l: int = path.len
      scoreboard_set("#pf_no_path_len", sc4_result, l)
    }

    fn test_pathfind_bfs_first_step() {
      // path from (0,0) to (0,2) → first step = pf_pack(0,0) = 0
      let map: int[] = pf_new_map()
      let path: int[] = pathfind_bfs(map, 0, 0, 0, 2)
      let first: int = path[0]
      scoreboard_set("#pf_first_step", sc4_result, first)
    }

    fn test_pf_heuristic() {
      // manhattan(0,0,3,4) = (3+4)*10000 = 70000
      let h: int = pf_heuristic(0, 0, 3, 4)
      scoreboard_set("#pf_heuristic", sc4_result, h)
    }
  `, 'stdlib_pathfind_test', [PATHFIND_SRC])

  await mc.reload()
  await mc.ticks(20)

  console.log('  stdlib-coverage-4 setup complete.')
}, 60_000)

// ---------------------------------------------------------------------------
// graph.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: graph.mcrs', () => {
  test('graph_node_count returns 5 for graph_new(5)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #graph_nodes sc4_result 0')
    await mc.command('/function stdlib_graph_test:test_graph_node_count')
    await mc.ticks(3)
    const r = await mc.scoreboard('#graph_nodes', 'sc4_result')
    expect(r).toBe(5)
    console.log(`  graph_node_count(graph_new(5)) = ${r} ✓`)
  }, 30_000)

  test('graph_edge_count returns 3 after 3 add_edge calls', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #graph_edges sc4_result 0')
    await mc.command('/function stdlib_graph_test:test_graph_add_edge_count')
    await mc.ticks(3)
    const r = await mc.scoreboard('#graph_edges', 'sc4_result')
    expect(r).toBe(3)
    console.log(`  graph_edge_count after 3 edges = ${r} ✓`)
  }, 30_000)

  test('graph_has_path returns 1 for connected 0→3', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #graph_path_yes sc4_result 0')
    await mc.command('/function stdlib_graph_test:test_graph_has_path_direct')
    await mc.ticks(3)
    const r = await mc.scoreboard('#graph_path_yes', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  graph_has_path(0→3 connected) = ${r} ✓`)
  }, 30_000)

  test('graph_has_path returns 0 when no path exists', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #graph_path_no sc4_result 0')
    await mc.command('/function stdlib_graph_test:test_graph_has_path_none')
    await mc.ticks(3)
    const r = await mc.scoreboard('#graph_path_no', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  graph_has_path(0→3 disconnected) = ${r} ✓`)
  }, 30_000)

  test('graph_shortest_path (Dijkstra) 0→3 = 6', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #graph_dijkstra sc4_result 0')
    await mc.command('/function stdlib_graph_test:test_graph_shortest_path')
    await mc.ticks(3)
    const r = await mc.scoreboard('#graph_dijkstra', 'sc4_result')
    expect(r).toBe(6)
    console.log(`  graph_shortest_path(0→3) = ${r} ✓`)
  }, 30_000)

  test('graph_bfs first node in order is the start node (0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #graph_bfs_first sc4_result -1')
    await mc.command('/function stdlib_graph_test:test_graph_bfs_order_start')
    await mc.ticks(3)
    const r = await mc.scoreboard('#graph_bfs_first', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  graph_bfs first node = ${r} ✓`)
  }, 30_000)

  test('graph_add_undirected adds 2 edges', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #graph_undirected_edges sc4_result 0')
    await mc.command('/function stdlib_graph_test:test_graph_undirected')
    await mc.ticks(3)
    const r = await mc.scoreboard('#graph_undirected_edges', 'sc4_result')
    expect(r).toBe(2)
    console.log(`  graph_add_undirected edge count = ${r} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// linalg.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: linalg.mcrs', () => {
  test('vec2d_dot([3,4],[3,4]) == 25', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_dot2d sc4_result 0')
    await mc.command('/function stdlib_linalg_test:test_vec2d_dot')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_dot2d', 'sc4_result')
    expect(r).toBe(25)
    console.log(`  vec2d_dot([3,4],[3,4]) = ${r} ✓`)
  }, 30_000)

  test('vec3d_dot([1,2,3],[4,5,6]) == 32', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_dot3d sc4_result 0')
    await mc.command('/function stdlib_linalg_test:test_vec3d_dot')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_dot3d', 'sc4_result')
    expect(r).toBe(32)
    console.log(`  vec3d_dot([1,2,3],[4,5,6]) = ${r} ✓`)
  }, 30_000)

  test('vec2d_length([3,4]) == 5', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_len2d sc4_result 0')
    await mc.command('/function stdlib_linalg_test:test_vec2d_length')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_len2d', 'sc4_result')
    expect(r).toBe(5)
    console.log(`  vec2d_length([3,4]) = ${r} ✓`)
  }, 30_000)

  test('vec3d_length([0,3,4]) == 5', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_len3d sc4_result 0')
    await mc.command('/function stdlib_linalg_test:test_vec3d_length')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_len3d', 'sc4_result')
    expect(r).toBe(5)
    console.log(`  vec3d_length([0,3,4]) = ${r} ✓`)
  }, 30_000)

  test('vec3d_cross_z([1,0,0]×[0,1,0]) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_cross_z sc4_result 0')
    await mc.command('/function stdlib_linalg_test:test_vec3d_cross_z')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_cross_z', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  vec3d_cross_z = ${r} ✓`)
  }, 30_000)

  test('mat2d_det([1,2,3,4]) == -2', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_det sc4_result 0')
    await mc.command('/function stdlib_linalg_test:test_mat2d_det')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_det', 'sc4_result')
    expect(r).toBe(-2)
    console.log(`  mat2d_det([1,2,3,4]) = ${r} ✓`)
  }, 30_000)

  test('solve2d_x via Cramer — x == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_cramer_x sc4_result -99')
    await mc.command('/function stdlib_linalg_test:test_solve2d_x')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_cramer_x', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  solve2d_x = ${r} ✓`)
  }, 30_000)

  test('solve2d_y via Cramer — y == 3', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #linalg_cramer_y sc4_result -99')
    await mc.command('/function stdlib_linalg_test:test_solve2d_y')
    await mc.ticks(3)
    const r = await mc.scoreboard('#linalg_cramer_y', 'sc4_result')
    expect(r).toBe(3)
    console.log(`  solve2d_y = ${r} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// physics.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: physics.mcrs', () => {
  test('gravity_fx() == 8', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_gravity sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_gravity_fx')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_gravity', 'sc4_result')
    expect(r).toBe(8)
    console.log(`  gravity_fx() = ${r} ✓`)
  }, 30_000)

  test('projectile_y(100,50,0) == 100 (no motion at t=0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_proj_y_t0 sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_projectile_y_at_t0')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_proj_y_t0', 'sc4_result')
    expect(r).toBe(100)
    console.log(`  projectile_y(t=0) = ${r} ✓`)
  }, 30_000)

  test('projectile_x(0,200,5) == 1000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_proj_x sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_projectile_x_linear')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_proj_x', 'sc4_result')
    expect(r).toBe(1000)
    console.log(`  projectile_x(0,200,5) = ${r} ✓`)
  }, 30_000)

  test('projectile_max_height(80) == 400', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_max_h sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_projectile_max_height')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_max_h', 'sc4_result')
    expect(r).toBe(400)
    console.log(`  projectile_max_height(80) = ${r} ✓`)
  }, 30_000)

  test('apply_drag(1000, 9800) == 980', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_drag sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_apply_drag')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_drag', 'sc4_result')
    expect(r).toBe(980)
    console.log(`  apply_drag(1000,9800) = ${r} ✓`)
  }, 30_000)

  test('bounce_v(-500, 8000) == 400', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_bounce sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_bounce_v')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_bounce', 'sc4_result')
    expect(r).toBe(400)
    console.log(`  bounce_v(-500,8000) = ${r} ✓`)
  }, 30_000)

  test('is_grounded(0,0) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_ground_yes sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_is_grounded_yes')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_ground_yes', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  is_grounded(0,0) = ${r} ✓`)
  }, 30_000)

  test('is_grounded(100,0) == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_ground_no sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_is_grounded_no')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_ground_no', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  is_grounded(100,0) = ${r} ✓`)
  }, 30_000)

  test('spring_force(0,100,10000) == 100', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_spring sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_spring_force')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_spring', 'sc4_result')
    expect(r).toBe(100)
    console.log(`  spring_force = ${r} ✓`)
  }, 30_000)

  test('friction_decel(500,100) == 400', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_friction_pos sc4_result 0')
    await mc.command('/function stdlib_physics_test:test_friction_decel_positive')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_friction_pos', 'sc4_result')
    expect(r).toBe(400)
    console.log(`  friction_decel(500,100) = ${r} ✓`)
  }, 30_000)

  test('friction_decel(50,100) == 0 (clamped to zero)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #phys_friction_zero sc4_result 99')
    await mc.command('/function stdlib_physics_test:test_friction_decel_to_zero')
    await mc.ticks(3)
    const r = await mc.scoreboard('#phys_friction_zero', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  friction_decel(50,100) = ${r} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// parabola.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: parabola.mcrs', () => {
  test('parabola_gravity() == 800', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_gravity sc4_result 0')
    await mc.command('/function stdlib_parabola_test:test_parabola_gravity')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_gravity', 'sc4_result')
    expect(r).toBe(800)
    console.log(`  parabola_gravity() = ${r} ✓`)
  }, 30_000)

  test('parabola_vx(10,20) == 5000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_vx sc4_result 0')
    await mc.command('/function stdlib_parabola_test:test_parabola_vx')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_vx', 'sc4_result')
    expect(r).toBe(5000)
    console.log(`  parabola_vx(10,20) = ${r} ✓`)
  }, 30_000)

  test('parabola_vz(5,10) == 5000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_vz sc4_result 0')
    await mc.command('/function stdlib_parabola_test:test_parabola_vz')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_vz', 'sc4_result')
    expect(r).toBe(5000)
    console.log(`  parabola_vz(5,10) = ${r} ✓`)
  }, 30_000)

  test('parabola_x(5000,20) == 10', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_x sc4_result 0')
    await mc.command('/function stdlib_parabola_test:test_parabola_x_at_t')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_x', 'sc4_result')
    expect(r).toBe(10)
    console.log(`  parabola_x(5000,20) = ${r} ✓`)
  }, 30_000)

  test('parabola_flight_time(4000) == 10', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_flight_t sc4_result 0')
    await mc.command('/function stdlib_parabola_test:test_parabola_flight_time')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_flight_t', 'sc4_result')
    expect(r).toBe(10)
    console.log(`  parabola_flight_time(4000) = ${r} ✓`)
  }, 30_000)

  test('parabola_in_range(3,4,10) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_inrange_yes sc4_result 0')
    await mc.command('/function stdlib_parabola_test:test_parabola_in_range_yes')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_inrange_yes', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  parabola_in_range(3,4,10) = ${r} ✓`)
  }, 30_000)

  test('parabola_in_range(10,10,10) == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_inrange_no sc4_result 1')
    await mc.command('/function stdlib_parabola_test:test_parabola_in_range_no')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_inrange_no', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  parabola_in_range(10,10,10) = ${r} ✓`)
  }, 30_000)

  test('parabola_step_vx(10000,9900) == 9900', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #para_step_vx sc4_result 0')
    await mc.command('/function stdlib_parabola_test:test_parabola_step_vx_drag')
    await mc.ticks(3)
    const r = await mc.scoreboard('#para_step_vx', 'sc4_result')
    expect(r).toBe(9900)
    console.log(`  parabola_step_vx(10000,9900) = ${r} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// quaternion.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: quaternion.mcrs', () => {
  test('quat_identity_w() == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_id_w sc4_result 0')
    await mc.command('/function stdlib_quaternion_test:test_quat_identity_w')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_id_w', 'sc4_result')
    expect(r).toBe(10000)
    console.log(`  quat_identity_w() = ${r} ✓`)
  }, 30_000)

  test('quat_identity_x() == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_id_x sc4_result 99')
    await mc.command('/function stdlib_quaternion_test:test_quat_identity_x')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_id_x', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  quat_identity_x() = ${r} ✓`)
  }, 30_000)

  test('quat_mag_sq of identity quaternion == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_magsq_id sc4_result 0')
    await mc.command('/function stdlib_quaternion_test:test_quat_mag_sq_identity')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_magsq_id', 'sc4_result')
    expect(r).toBe(10000)
    console.log(`  quat_mag_sq(identity) = ${r} ✓`)
  }, 30_000)

  test('quat_conj_x negates x component', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_conj_x sc4_result 0')
    await mc.command('/function stdlib_quaternion_test:test_quat_conj_x')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_conj_x', 'sc4_result')
    expect(r).toBe(-1000)
    console.log(`  quat_conj_x(1000,...) = ${r} ✓`)
  }, 30_000)

  test('quat_conj_w preserves w component', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_conj_w sc4_result 0')
    await mc.command('/function stdlib_quaternion_test:test_quat_conj_w')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_conj_w', 'sc4_result')
    expect(r).toBe(8000)
    console.log(`  quat_conj_w(…,8000) = ${r} ✓`)
  }, 30_000)

  test('quat_dot(identity, identity) == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_dot_id sc4_result 0')
    await mc.command('/function stdlib_quaternion_test:test_quat_dot_identity_self')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_dot_id', 'sc4_result')
    expect(r).toBe(10000)
    console.log(`  quat_dot(id,id) = ${r} ✓`)
  }, 30_000)

  test('quat_mul_w(identity×identity) == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_mul_w_id sc4_result 0')
    await mc.command('/function stdlib_quaternion_test:test_quat_mul_identity')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_mul_w_id', 'sc4_result')
    expect(r).toBe(10000)
    console.log(`  quat_mul_w(id×id) = ${r} ✓`)
  }, 30_000)

  test('quat_slerp_w at t=0 returns ~10000 (start quaternion)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #quat_slerp_w_t0 sc4_result 0')
    await mc.command('/function stdlib_quaternion_test:test_quat_slerp_at_0')
    await mc.ticks(3)
    const r = await mc.scoreboard('#quat_slerp_w_t0', 'sc4_result')
    expect(r).toBeGreaterThanOrEqual(9900)
    expect(r).toBeLessThanOrEqual(10000)
    console.log(`  quat_slerp_w(t=0) = ${r} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// bigint.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: bigint.mcrs', () => {
  test('bigint_base() == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint_base sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_bigint_base')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint_base', 'sc4_result')
    expect(r).toBe(10000)
    console.log(`  bigint_base() = ${r} ✓`)
  }, 30_000)

  test('chunk_hi(12345) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint_chunk_hi sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_chunk_hi')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint_chunk_hi', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  chunk_hi(12345) = ${r} ✓`)
  }, 30_000)

  test('chunk_lo(12345) == 2345', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint_chunk_lo sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_chunk_lo')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint_chunk_lo', 'sc4_result')
    expect(r).toBe(2345)
    console.log(`  chunk_lo(12345) = ${r} ✓`)
  }, 30_000)

  test('bigint3_add_lo(5000,7000) == 2000 (with wraparound)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint3_add_lo sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_bigint3_add_lo')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint3_add_lo', 'sc4_result')
    expect(r).toBe(2000)
    console.log(`  bigint3_add_lo(5000,7000) = ${r} ✓`)
  }, 30_000)

  test('bigint3_carry_lo(5000,7000) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint3_carry sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_bigint3_carry_lo')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint3_carry', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  bigint3_carry_lo(5000,7000) = ${r} ✓`)
  }, 30_000)

  test('bigint3_cmp equal returns 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint3_cmp_eq sc4_result 99')
    await mc.command('/function stdlib_bigint_test:test_bigint3_cmp_eq')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint3_cmp_eq', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  bigint3_cmp(equal) = ${r} ✓`)
  }, 30_000)

  test('bigint3_cmp a>b returns 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint3_cmp_gt sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_bigint3_cmp_gt')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint3_cmp_gt', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  bigint3_cmp(a>b) = ${r} ✓`)
  }, 30_000)

  test('bigint3_cmp a<b returns -1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint3_cmp_lt sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_bigint3_cmp_lt')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint3_cmp_lt', 'sc4_result')
    expect(r).toBe(-1)
    console.log(`  bigint3_cmp(a<b) = ${r} ✓`)
  }, 30_000)

  test('bigint3_mul1_hi(3000,3000) == 900', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint3_mul1_hi sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_bigint3_mul1_hi')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint3_mul1_hi', 'sc4_result')
    expect(r).toBe(900)
    console.log(`  bigint3_mul1_hi(3000,3000) = ${r} ✓`)
  }, 30_000)

  test('bigint3_to_int32(1,2,3) == 100020003', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #bigint3_to_i32 sc4_result 0')
    await mc.command('/function stdlib_bigint_test:test_bigint3_to_int32')
    await mc.ticks(3)
    const r = await mc.scoreboard('#bigint3_to_i32', 'sc4_result')
    expect(r).toBe(100020003)
    console.log(`  bigint3_to_int32(1,2,3) = ${r} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// heap.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: heap.mcrs', () => {
  test('heap_new() has size 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #heap_new_size sc4_result 99')
    await mc.command('/function stdlib_heap_test:test_heap_new_size')
    await mc.ticks(3)
    const r = await mc.scoreboard('#heap_new_size', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  heap_new() size = ${r} ✓`)
  }, 30_000)

  test('heap_push increases size to 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #heap_push1_sz sc4_result 0')
    await mc.command('/function stdlib_heap_test:test_heap_push_one')
    await mc.ticks(3)
    const r = await mc.scoreboard('#heap_push1_sz', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  heap_push size after 1 push = ${r} ✓`)
  }, 30_000)

  test('heap_peek returns minimum after 3 pushes', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #heap_peek_min sc4_result 0')
    await mc.command('/function stdlib_heap_test:test_heap_peek_min')
    await mc.ticks(3)
    const r = await mc.scoreboard('#heap_peek_min', 'sc4_result')
    expect(r).toBe(10)
    console.log(`  heap_peek min = ${r} ✓`)
  }, 30_000)

  test('heap_pop removes minimum; next peek == 20', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #heap_pop_next sc4_result 0')
    await mc.command('/function stdlib_heap_test:test_heap_pop_removes_min')
    await mc.ticks(3)
    const r = await mc.scoreboard('#heap_pop_next', 'sc4_result')
    expect(r).toBe(20)
    console.log(`  heap_peek after pop = ${r} ✓`)
  }, 30_000)

  test('heap_size decreases after pop', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #heap_sz_after_pop sc4_result 0')
    await mc.command('/function stdlib_heap_test:test_heap_size_after_pop')
    await mc.ticks(3)
    const r = await mc.scoreboard('#heap_sz_after_pop', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  heap_size after pop = ${r} ✓`)
  }, 30_000)

  test('max_heap_push puts 50 at top', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #max_heap_peek sc4_result 0')
    await mc.command('/function stdlib_heap_test:test_max_heap_peek')
    await mc.ticks(3)
    const r = await mc.scoreboard('#max_heap_peek', 'sc4_result')
    expect(r).toBe(50)
    console.log(`  max_heap peek max = ${r} ✓`)
  }, 30_000)

  test('max_heap_pop removes 50; next peek == 30', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #max_heap_next sc4_result 0')
    await mc.command('/function stdlib_heap_test:test_max_heap_pop_removes_max')
    await mc.ticks(3)
    const r = await mc.scoreboard('#max_heap_next', 'sc4_result')
    expect(r).toBe(30)
    console.log(`  max_heap peek after pop = ${r} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// pathfind.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: pathfind.mcrs', () => {
  test('pf_pack(3,5) == 53', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_pack sc4_result 0')
    await mc.command('/function stdlib_pathfind_test:test_pf_pack')
    await mc.ticks(3)
    const r = await mc.scoreboard('#pf_pack', 'sc4_result')
    expect(r).toBe(53)
    console.log(`  pf_pack(3,5) = ${r} ✓`)
  }, 30_000)

  test('pf_unpack_x recovers x from packed coord', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_unpack_x sc4_result 0')
    await mc.command('/function stdlib_pathfind_test:test_pf_unpack_x')
    await mc.ticks(3)
    const r = await mc.scoreboard('#pf_unpack_x', 'sc4_result')
    expect(r).toBe(7)
    console.log(`  pf_unpack_x(pf_pack(7,9)) = ${r} ✓`)
  }, 30_000)

  test('pf_unpack_z recovers z from packed coord', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_unpack_z sc4_result 0')
    await mc.command('/function stdlib_pathfind_test:test_pf_unpack_z')
    await mc.ticks(3)
    const r = await mc.scoreboard('#pf_unpack_z', 'sc4_result')
    expect(r).toBe(9)
    console.log(`  pf_unpack_z(pf_pack(7,9)) = ${r} ✓`)
  }, 30_000)

  test('pf_is_blocked returns 1 for out-of-bounds', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_oob sc4_result 0')
    await mc.command('/function stdlib_pathfind_test:test_pf_is_blocked_oob')
    await mc.ticks(3)
    const r = await mc.scoreboard('#pf_oob', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  pf_is_blocked(-1,0) = ${r} ✓`)
  }, 30_000)

  test('pf_set_blocked marks cell as impassable', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_set_blocked sc4_result 0')
    await mc.command('/function stdlib_pathfind_test:test_pf_set_blocked')
    await mc.ticks(3)
    const r = await mc.scoreboard('#pf_set_blocked', 'sc4_result')
    expect(r).toBe(1)
    console.log(`  pf_is_blocked after set_blocked = ${r} ✓`)
  }, 30_000)

  test('pf_set_open re-opens a blocked cell', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_set_open sc4_result 1')
    await mc.command('/function stdlib_pathfind_test:test_pf_set_open')
    await mc.ticks(3)
    const r = await mc.scoreboard('#pf_set_open', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  pf_is_blocked after set_open = ${r} ✓`)
  }, 30_000)

  test('pathfind_bfs path from (0,0) to (0,3) has length 4', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_path_len sc4_result 0')
    await mc.command('/function stdlib_pathfind_test:test_pathfind_bfs_path_length')
    await mc.ticks(5)
    const r = await mc.scoreboard('#pf_path_len', 'sc4_result')
    expect(r).toBe(4)
    console.log(`  pathfind_bfs path length (0,0)→(0,3) = ${r} ✓`)
  }, 30_000)

  test('pathfind_bfs returns empty path when walled off', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_no_path_len sc4_result 99')
    await mc.command('/function stdlib_pathfind_test:test_pathfind_bfs_no_path')
    await mc.ticks(5)
    const r = await mc.scoreboard('#pf_no_path_len', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  pathfind_bfs no path = ${r} ✓`)
  }, 30_000)

  test('pathfind_bfs first step is start node (packed=0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_first_step sc4_result 99')
    await mc.command('/function stdlib_pathfind_test:test_pathfind_bfs_first_step')
    await mc.ticks(5)
    const r = await mc.scoreboard('#pf_first_step', 'sc4_result')
    expect(r).toBe(0)
    console.log(`  pathfind_bfs first step = ${r} ✓`)
  }, 30_000)

  test('pf_heuristic(0,0,3,4) == 70000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set #pf_heuristic sc4_result 0')
    await mc.command('/function stdlib_pathfind_test:test_pf_heuristic')
    await mc.ticks(3)
    const r = await mc.scoreboard('#pf_heuristic', 'sc4_result')
    expect(r).toBe(70000)
    console.log(`  pf_heuristic(0,0,3,4) = ${r} ✓`)
  }, 30_000)
})
