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
    let mut network = HashSet::new();
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

/// Turns every road block that stands one level over the road beside it into a flight of stairs,
/// returning how many it laid. The rule is [`stairs_direction`], read off a snapshot of the road
/// before any block changes, so a run of levels comes out the same whatever order it is walked.
pub fn place_stairs(columns: &mut [TerrainColumn]) -> usize {
    let roads: HashMap<_, _> = columns
        .iter()
        .map(|column| (column.coord, (column.surface, column.elevation)))
        .collect();
    let mut laid = 0;
    for column in columns.iter_mut() {
        if column.surface != TerrainMaterial::Path {
            continue;
        }
        if stairs_direction(column.coord, column.elevation, |at| roads.get(&at).copied()).is_some()
        {
            column.surface = TerrainMaterial::Stairs;
            laid += 1;
        }
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
