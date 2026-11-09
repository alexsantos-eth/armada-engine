//! Bounded path search on the documented world axes. Search ties follow discovery order.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

use crate::grid::{WorldCoord, WorldRect};

/// Side neighbours in the same order as the game contract: +x, +y, -x, -y.
pub const PATH_STEPS: [WorldCoord; 4] = [
    WorldCoord { x: 1, y: 0 },
    WorldCoord { x: 0, y: 1 },
    WorldCoord { x: -1, y: 0 },
    WorldCoord { x: 0, y: -1 },
];

#[derive(Clone, Copy, Debug)]
struct QueueEntry {
    index: usize,
    priority: f64,
    order: usize,
}

impl PartialEq for QueueEntry {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.order == other.order
    }
}

impl Eq for QueueEntry {}

impl PartialOrd for QueueEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueueEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .priority
            .total_cmp(&self.priority)
            .then_with(|| other.order.cmp(&self.order))
    }
}

/// Find a cheapest side-neighbour path inside an inclusive rectangle.
pub fn find_path<G, C, H>(
    area: WorldRect,
    starts: &[WorldCoord],
    mut is_goal: G,
    mut cost: C,
    mut heuristic: H,
) -> Option<Vec<WorldCoord>>
where
    G: FnMut(WorldCoord) -> bool,
    C: FnMut(WorldCoord, WorldCoord) -> f64,
    H: FnMut(WorldCoord) -> f64,
{
    let width = i64::from(area.max_x) - i64::from(area.min_x) + 1;
    let height = i64::from(area.max_y) - i64::from(area.min_y) + 1;
    if width <= 0 || height <= 0 {
        return None;
    }
    let size = usize::try_from(width.checked_mul(height)?).ok()?;
    if size > 4_194_304 {
        return None;
    }
    let height = usize::try_from(height).ok()?;
    let mut best = vec![f64::INFINITY; size];
    let mut parent = vec![None; size];
    let mut closed = vec![false; size];
    let mut open = BinaryHeap::new();
    let mut order = 0;

    let inside = |p: WorldCoord| {
        p.x >= area.min_x && p.x <= area.max_x && p.y >= area.min_y && p.y <= area.max_y
    };
    let index_of = |p: WorldCoord| {
        (i64::from(p.x) - i64::from(area.min_x)) as usize * height
            + (i64::from(p.y) - i64::from(area.min_y)) as usize
    };
    let point_of = |index: usize| WorldCoord {
        x: (i64::from(area.min_x) + (index / height) as i64) as i32,
        y: (i64::from(area.min_y) + (index % height) as i64) as i32,
    };

    for &start in starts {
        if !inside(start) {
            continue;
        }
        let index = index_of(start);
        if best[index] == 0.0 {
            continue;
        }
        best[index] = 0.0;
        let priority = heuristic(start);
        if !priority.is_finite() {
            continue;
        }
        open.push(QueueEntry {
            index,
            priority,
            order,
        });
        order += 1;
    }

    while let Some(entry) = open.pop() {
        if closed[entry.index] {
            continue;
        }
        closed[entry.index] = true;
        let point = point_of(entry.index);
        if is_goal(point) {
            let mut path = Vec::new();
            let mut at = Some(entry.index);
            while let Some(index) = at {
                path.push(point_of(index));
                at = parent[index];
            }
            path.reverse();
            return Some(path);
        }
        for step in PATH_STEPS {
            let Some(nx) = point.x.checked_add(step.x) else {
                continue;
            };
            let Some(ny) = point.y.checked_add(step.y) else {
                continue;
            };
            let next_point = WorldCoord { x: nx, y: ny };
            if !inside(next_point) {
                continue;
            }
            let next = index_of(next_point);
            if closed[next] {
                continue;
            }
            let step_cost = cost(point, next_point);
            if !step_cost.is_finite() || step_cost <= 0.0 {
                continue;
            }
            let total = best[entry.index] + step_cost;
            if total >= best[next] {
                continue;
            }
            let priority = total + heuristic(next_point);
            if !priority.is_finite() {
                continue;
            }
            best[next] = total;
            parent[next] = Some(entry.index);
            open.push(QueueEntry {
                index: next,
                priority,
                order,
            });
            order += 1;
        }
    }
    None
}

#[cfg(test)]
#[path = "astar.test.rs"]
mod tests;
