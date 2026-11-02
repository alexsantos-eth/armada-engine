//! Deterministic placement of entities over materialized terrain columns.
//!
//! Mirrors `createEntitiesFromConfig()` in `engine/entities/entities.ts`, simplified for the
//! Rust port: the V2 catalog carries no spawn chances, formations or patch fields, so placement
//! is a pure validity pass over every column. Density, biomes, slopes and neighbourhood rules
//! are designed in Rust once the new terrain generator exists; this module supplies the
//! validity rules (surface, elevation, footprint, gap) and a deterministic placer that fills
//! every eligible column.

use crate::entities::blueprint::{
    EntityBlueprintV2, EntityCatalogV2, EntityLengthAxis,
};
use crate::entities::entity::{get_entity_footprint, index_entities, Entity};
use crate::grid::{CellMap, SpatialIndex, WorldCoord};
use crate::terrain::{TerrainColumn, TerrainMaterial};

/// Result of placing every eligible definition over the given columns.
pub struct PlacementResult {
    /// Placed entities, in definition order then column order.
    pub entities: Vec<Entity>,
    /// Spatial index over every placed entity's whole footprint.
    pub index: SpatialIndex<Entity>,
}

/// Minimum free blocks between instances of the same entity when the catalog does not say
/// otherwise. Zero means instances may touch.
const DEFAULT_GAP: i32 = 0;

/// Lookups shared by every placement check of one placement pass.
pub struct PlacementContext<'a> {
    columns: &'a CellMap<TerrainColumn>,
    placed: &'a mut SpatialIndex<Entity>,
}

impl<'a> PlacementContext<'a> {
    pub fn new(columns: &'a CellMap<TerrainColumn>, placed: &'a mut SpatialIndex<Entity>) -> Self {
        Self { columns, placed }
    }

    pub fn column(&self, x: i32, y: i32) -> Option<&TerrainColumn> {
        self.columns
            .get(WorldCoord { x, y })
            .ok()
            .flatten()
    }

    pub fn is_taken(&self, x: i32, y: i32) -> bool {
        self.placed.is_occupied(WorldCoord { x, y })
    }
}

/// A validated position for one entity instance.
pub struct Placement {
    pub anchor: WorldCoord,
    pub footprint: Vec<WorldCoord>,
    pub elevation: i32,
}

/// Places every eligible entity over `columns`, one instance per valid anchor column.
///
/// Rules:
/// * the anchor's surface must match the definition's first footprint surface;
/// * every footprint cell must exist, match its required surface, be flat (one shared
///   elevation) and be free of other entities;
/// * instances of the same type respect `gap` (Chebyshev, diagonals included).
///
/// Placement is deterministic: definitions are visited in catalog order and columns in slice
/// order, so the same input always yields the same world.
pub fn place_entities(
    columns: &[TerrainColumn],
    catalog: &EntityCatalogV2,
) -> PlacementResult {
    let mut columns_map = CellMap::new();
    for column in columns {
        let _ = columns_map.insert(column.coord, *column);
    }
    let mut placed = SpatialIndex::new();
    let mut entities = Vec::new();

    for blueprint in &catalog.entities {
        for column in columns {
            let anchor = column.coord;
            let context = &mut PlacementContext::new(&columns_map, &mut placed);
            if let Some(placement) = find_placement(anchor, blueprint, context, DEFAULT_GAP) {
                let entity = Entity::new(
                    placement.anchor.x,
                    placement.anchor.y,
                    blueprint,
                    placement.elevation,
                );
                let footprint = get_entity_footprint(
                    placement.anchor,
                    placement.footprint.len() as i32,
                    blueprint.shape.axis,
                );
                let _ = placed.insert(entity.clone(), &footprint);
                entities.push(entity);
            }
        }
    }

    let index = index_entities(&entities);
    PlacementResult { entities, index }
}

/// Validates one instance of `blueprint` anchored on `column`.
fn find_placement(
    anchor: WorldCoord,
    blueprint: &EntityBlueprintV2,
    context: &mut PlacementContext,
    gap: i32,
) -> Option<Placement> {
    let length = blueprint.shape.length as usize;
    let along_x = blueprint.shape.axis == EntityLengthAxis::X;
    let surfaces = &blueprint.placement.surfaces;

    let anchor_cell = context.column(anchor.x, anchor.y)?;
    if anchor_cell.surface != surfaces[0] {
        return None;
    }
    if context.is_taken(anchor.x, anchor.y) {
        return None;
    }

    // A footprint mixing water and land (e.g. a pier) is allowed to stand on land while
    // its water cells are exempt from the flat-elevation rule.
    let water = surfaces.contains(&TerrainMaterial::Water);
    let land = surfaces.iter().any(|s| *s != TerrainMaterial::Water);
    let reaches_over_water = water && land;

    let mut elevation: Option<i32> = None;
    for index in 0..length {
        let x = if along_x {
            anchor.x + index as i32
        } else {
            anchor.x
        };
        let y = if along_x {
            anchor.y
        } else {
            anchor.y + index as i32
        };
        let cell = context.column(x, y)?;
        let required = surfaces.get(index).copied().unwrap_or(surfaces[0]);
        if cell.surface != required {
            return None;
        }
        if context.is_taken(x, y) {
            return None;
        }
        if reaches_over_water && required == TerrainMaterial::Water {
            continue;
        }
        let e = cell.elevation;
        elevation = match elevation {
            None => Some(e),
            Some(prev) if prev == e => Some(e),
            _ => return None,
        };
    }

    // Gap: no other instance of the same type within `gap` columns (Chebyshev).
    if gap > 0 {
        let last_x = if along_x {
            anchor.x + length as i32 - 1
        } else {
            anchor.x
        };
        let last_y = if along_x {
            anchor.y
        } else {
            anchor.y + length as i32 - 1
        };
        let rect = crate::grid::WorldRect {
            min_x: anchor.x - gap,
            min_y: anchor.y - gap,
            max_x: last_x + gap,
            max_y: last_y + gap,
        };
        if context
            .placed
            .any_in_rect(rect, |e| e.type_() == blueprint.id)
        {
            return None;
        }
    }

    Some(Placement {
        anchor,
        footprint: get_entity_footprint(anchor, length as i32, blueprint.shape.axis),
        elevation: elevation.unwrap_or(0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::blueprint::EntityPlacement;
    use crate::entities::blueprint::EntityAsset;
    use crate::entities::entity::Entity;
    use crate::entities::validation::CATALOG_SCHEMA_VERSION;
    use crate::grid::WorldCoord;
    use crate::terrain::TerrainMaterial;

    fn grass() -> TerrainMaterial {
        TerrainMaterial::Grass
    }
    fn water() -> TerrainMaterial {
        TerrainMaterial::Water
    }
    fn sand() -> TerrainMaterial {
        TerrainMaterial::Sand
    }

    fn column(x: i32, y: i32, surface: TerrainMaterial, elevation: i32) -> TerrainColumn {
        TerrainColumn {
            coord: WorldCoord { x, y },
            elevation,
            surface,
            walkable: surface != TerrainMaterial::Water,
        }
    }

    fn blueprint(id: &str, length: i32, surfaces: Vec<TerrainMaterial>) -> EntityBlueprintV2 {
        EntityBlueprintV2 {
            id: id.to_owned(),
            asset: EntityAsset {
                sprite: format!("/assets/{}/block.svg", id),
                reflection: None,
                color_replacements: None,
                sway: None,
                contact_shadow: None,
            },
            shape: crate::entities::blueprint::EntityShape {
                height: 1,
                length,
                axis: EntityLengthAxis::X,
                collision: vec![1.0; length as usize],
            },
            placement: EntityPlacement { surfaces },
        }
    }

    fn catalog(blueprints: Vec<EntityBlueprintV2>) -> EntityCatalogV2 {
        EntityCatalogV2 {
            schema_version: CATALOG_SCHEMA_VERSION,
            entities: blueprints,
        }
    }

    #[test]
    fn places_one_entity_per_eligible_column() {
        let columns = vec![
            column(0, 0, grass(), 0),
            column(1, 0, grass(), 0),
            column(0, 1, water(), -1),
        ];
        let catalog = catalog(vec![blueprint("house", 1, vec![grass()])]);
        let result = place_entities(&columns, &catalog);
        assert_eq!(result.entities.len(), 2);
        assert!(result
            .entities
            .iter()
            .any(|e| e.id() == "house@0,0"));
        assert!(result
            .entities
            .iter()
            .any(|e| e.id() == "house@1,0"));
        assert!(result.index.is_occupied(WorldCoord { x: 0, y: 0 }));
        assert!(!result.index.is_occupied(WorldCoord { x: 0, y: 1 }));
    }

    #[test]
    fn does_not_place_on_wrong_surface() {
        let columns = vec![column(0, 0, water(), -1)];
        let catalog = catalog(vec![blueprint("house", 1, vec![grass()])]);
        let result = place_entities(&columns, &catalog);
        assert!(result.entities.is_empty());
    }

    #[test]
    fn multi_cell_footprint_requires_matching_surfaces() {
        let columns = vec![
            column(0, 0, water(), -1),
            column(1, 0, sand(), 0),
            column(2, 0, grass(), 0),
        ];
        let catalog = catalog(vec![blueprint("pier", 3, vec![water(), sand(), grass()])]);
        let result = place_entities(&columns, &catalog);
        assert_eq!(result.entities.len(), 1);
        assert_eq!(result.entities[0].id(), "pier@0,0");
        assert_eq!(result.entities[0].elevation(), 0);
    }

    #[test]
    fn respects_gap_between_same_type_instances() {
        let columns = vec![
            column(0, 0, grass(), 0),
            column(1, 0, grass(), 0),
            column(2, 0, grass(), 0),
            column(3, 0, grass(), 0),
        ];
        let catalog = catalog(vec![blueprint("tree", 1, vec![grass()])]);
        // Use a gap of 1 so adjacent columns cannot both host a tree.
        let mut columns_map = CellMap::new();
        for column in &columns {
            let _ = columns_map.insert(column.coord, *column);
        }
        let mut placed = SpatialIndex::new();
        let bp = &catalog.entities[0];
        let p0 = find_placement(WorldCoord { x: 0, y: 0 }, bp, &mut PlacementContext::new(&columns_map, &mut placed), 1);
        assert!(p0.is_some());
        let placement = p0.unwrap();
        let entity = Entity::new(placement.anchor.x, placement.anchor.y, bp, placement.elevation);
        let _ = placed.insert(entity, &placement.footprint);
        // After placing at (0,0) with gap 1, (1,0) is within the gap rectangle.
        let p1 = find_placement(WorldCoord { x: 1, y: 0 }, bp, &mut PlacementContext::new(&columns_map, &mut placed), 1);
        assert!(p1.is_none());
        // (2,0) is at Chebyshev distance 2 from (0,0), outside gap 1.
        let p2 = find_placement(WorldCoord { x: 2, y: 0 }, bp, &mut PlacementContext::new(&columns_map, &mut placed), 1);
        assert!(p2.is_some());
    }

    #[test]
    fn entity_id_matches_blueprint_and_anchor() {
        let columns = vec![column(5, -3, grass(), 0)];
        let catalog = catalog(vec![blueprint("tree", 1, vec![grass()])]);
        let result = place_entities(&columns, &catalog);
        assert_eq!(result.entities[0].id(), "tree@5,-3");
    }
}
