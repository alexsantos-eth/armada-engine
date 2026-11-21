//! Deterministic road carving between data-selected access points.

use std::collections::{HashMap, HashSet};

use crate::grid::{WorldCoord, WorldRect};
use crate::paths::find_path;
use crate::terrain::{TerrainColumn, TerrainMaterial, stairs_direction};

/// One structure that needs one of its free neighbouring cells connected to the road network.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoadConnector {
    anchor: WorldCoord,
    access_cells: Vec<WorldCoord>,
}

impl RoadConnector {
    /// Creates a structure connector with all of its candidate access cells.
    pub fn new(anchor: WorldCoord, access_cells: impl IntoIterator<Item = WorldCoord>) -> Self {
        let mut access_cells: Vec<_> = access_cells.into_iter().collect();
        access_cells.sort_by_key(|cell| (cell.y, cell.x));
        access_cells.dedup();
        Self {
            anchor,
            access_cells,
        }
    }

    /// Candidate cells that can become the structure's road entrance.
    pub fn access_cells(&self) -> &[WorldCoord] {
        &self.access_cells
    }
}

/// Carves a stable road tree across `columns`, returning the number of connected structures.
/// Every road already paved on them is part of the network from the start, so a structure
/// beside a street only walks to the nearest one.
/// Every carved block that ends one level over the road beside it becomes a flight of stairs.
pub fn connect_roads(
    columns: &mut [TerrainColumn],
    connectors: &[RoadConnector],
    occupied: &[WorldCoord],
) -> usize {
    let Some(area) = area_of(columns) else {
        return 0;
    };
    let indices: HashMap<_, _> = columns
        .iter()
        .enumerate()
        .map(|(index, column)| (column.coord, index))
        .collect();
    let occupied: HashSet<_> = occupied.iter().copied().collect();
    let mut connectors: Vec<_> = connectors.iter().collect();
    connectors.sort_by_key(|connector| (connector.anchor.y, connector.anchor.x));
    let mut network: HashSet<WorldCoord> = columns
        .iter()
        .filter(|column| {
            matches!(
                column.surface,
                TerrainMaterial::Path | TerrainMaterial::Stairs
            )
        })
        .map(|column| column.coord)
        .collect();
    let mut connected = 0;

    for connector in connectors {
        let starts: Vec<_> = connector
            .access_cells
            .iter()
            .copied()
            .filter(|cell| is_open(*cell, None, columns, &indices, &occupied))
            .collect();
        if starts.is_empty() {
            continue;
        }
        let path = if network.is_empty() {
            Some(vec![starts[0]])
        } else {
            find_path(
                area,
                &starts,
                |cell| network.contains(&cell),
                |from, to| {
                    if is_open(to, Some(from), columns, &indices, &occupied) {
                        1.0
                    } else {
                        f64::INFINITY
                    }
                },
                |cell| distance_to_network(cell, &network),
            )
        };
        let Some(path) = path else {
            continue;
        };
        for cell in path {
            let index = indices[&cell];
            columns[index].surface = TerrainMaterial::Path;
            columns[index].walkable = true;
            network.insert(cell);
        }
        connected += 1;
    }
    place_stairs(columns);
    connected
}

/// Paves every land column `streets` marks, in column order, and lays the stairs its climbs
/// need; returns how many columns it paved. Water and unwalkable columns stay as they are.
pub fn pave(columns: &mut [TerrainColumn], streets: &[bool]) -> usize {
    let mut paved = 0;
    for (column, &street) in columns.iter_mut().zip(streets) {
        if !street || !column.walkable || column.surface == TerrainMaterial::Water {
            continue;
        }
        column.surface = TerrainMaterial::Path;
        paved += 1;
    }
    place_stairs(columns);
    paved
}

/// Turns the road blocks that stand one level over the road beside them into flights of stairs,
/// returning how many it laid. The rule is [`stairs_direction`], read off a snapshot of the road
/// before any block changes. Two flights that touch must climb along the same axis: a candidate
/// is skipped (it stays a plain road block) when a flight already laid beside it climbs along the
/// other axis, so no L-shaped corner of crossed flights appears. Candidates are visited in
/// coordinate order, so the result does not depend on the order of `columns`.
pub fn place_stairs(columns: &mut [TerrainColumn]) -> usize {
    let roads: HashMap<_, _> = columns
        .iter()
        .map(|column| (column.coord, (column.surface, column.elevation)))
        .collect();
    let mut candidates: Vec<(usize, WorldCoord)> = columns
        .iter()
        .enumerate()
        .filter(|(_, column)| column.surface == TerrainMaterial::Path)
        .filter_map(|(index, column)| {
            stairs_direction(column.coord, column.elevation, |at| roads.get(&at).copied())
                .map(|direction| (index, direction))
        })
        .collect();
    candidates.sort_by_key(|&(index, _)| (columns[index].coord.x, columns[index].coord.y));
    let mut axes: HashMap<WorldCoord, bool> = HashMap::new();
    let mut laid = 0;
    for (index, direction) in candidates {
        let coord = columns[index].coord;
        let along_x = direction.x != 0;
        let crosses = [(1, 0), (0, 1), (-1, 0), (0, -1)]
            .into_iter()
            .any(|(dx, dy)| {
                let beside = WorldCoord {
                    x: coord.x.saturating_add(dx),
                    y: coord.y.saturating_add(dy),
                };
                axes.get(&beside).is_some_and(|&other| other != along_x)
            });
        if crosses {
            continue;
        }
        axes.insert(coord, along_x);
        columns[index].surface = TerrainMaterial::Stairs;
        laid += 1;
    }
    laid
}

fn area_of(columns: &[TerrainColumn]) -> Option<WorldRect> {
    let first = columns.first()?.coord;
    Some(columns.iter().skip(1).fold(
        WorldRect {
            min_x: first.x,
            min_y: first.y,
            max_x: first.x,
            max_y: first.y,
        },
        |area, column| WorldRect {
            min_x: area.min_x.min(column.coord.x),
            min_y: area.min_y.min(column.coord.y),
            max_x: area.max_x.max(column.coord.x),
            max_y: area.max_y.max(column.coord.y),
        },
    ))
}

fn is_open(
    cell: WorldCoord,
    from: Option<WorldCoord>,
    columns: &[TerrainColumn],
    indices: &HashMap<WorldCoord, usize>,
    occupied: &HashSet<WorldCoord>,
) -> bool {
    if occupied.contains(&cell) {
        return false;
    }
    let Some(&index) = indices.get(&cell) else {
        return false;
    };
    let column = columns[index];
    if !column.walkable || column.surface == TerrainMaterial::Water {
        return false;
    }
    from.is_none_or(|from| {
        let from = columns[indices[&from]];
        (column.elevation - from.elevation).abs() <= 1
    })
}

fn distance_to_network(cell: WorldCoord, network: &HashSet<WorldCoord>) -> f64 {
    network
        .iter()
        .map(|target| i32::abs(cell.x - target.x) + i32::abs(cell.y - target.y))
        .min()
        .map_or(f64::INFINITY, f64::from)
}

#[cfg(test)]
#[path = "roads.test.rs"]
mod tests;
