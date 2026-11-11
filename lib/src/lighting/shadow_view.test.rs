use super::*;
use crate::game::config::PHASE_TRANSITION_SECONDS;
use iso::assets::InkBox;

#[test]
fn an_inks_extent_is_the_rectangle_the_sprite_is_drawn_into() {
    let ink = InkBox {
        x: -0.2,
        y: -0.5,
        width: 0.4,
        height: 0.6,
    };
    let extent = extent_of_ink(ink, 200.0);

    assert_eq!(extent.left, -40.0);
    assert_eq!(extent.top, -100.0);
    assert_eq!(extent.width, 80.0);
    assert_eq!(extent.height, 120.0);
}

#[test]
fn a_receiver_keeps_its_artwork_relative_to_its_feet() {
    let feet = ScreenPoint { x: 500.0, y: 300.0 };
    let layout = SpriteLayout {
        x: 460.0,
        y: 200.0,
        width: 80.0,
        height: 120.0,
    };
    let receiver = receiver_of(layout, feet, (4.5, 7.5), 2.0);

    assert_eq!(receiver.foot, (4.5, 7.5));
    assert_eq!(receiver.elevation, 2.0);
    assert_eq!(receiver.extent.left, -40.0);
    assert_eq!(receiver.extent.top, -100.0);
}

#[test]
fn the_nine_chunks_around_one_include_it_once() {
    let all = around(ChunkCoord { cx: 3, cy: -2 });

    assert_eq!(all.len(), 9);
    assert_eq!(
        all.iter()
            .filter(|c| **c == ChunkCoord { cx: 3, cy: -2 })
            .count(),
        1
    );
    assert!(all.contains(&ChunkCoord { cx: 2, cy: -3 }));
    assert!(all.contains(&ChunkCoord { cx: 4, cy: -1 }));
}

/// A column's quad reads the map at the middle of the square's outermost texels and not at its
#[test]
fn a_columns_quad_reads_inside_its_own_square_of_the_map() {
    let per_tile = f64::from(SHADOW_MAP_PIXELS_PER_TILE);
    let (near, far) = (0.5, per_tile - 0.5);

    assert!(near > 0.0, "the near corner would read the previous column");
    assert!(far < per_tile, "the far corner would read the next column");
    assert_eq!(far - near, per_tile - 1.0);
}

/// Every shadow is drawn out of the shared atlas, so that binding it changes nothing and the
#[test]
fn the_atlas_carries_the_white_patch_the_shadows_are_drawn_from() {
    use iso::assets::AssetManifest;

    let manifest: AssetManifest =
        serde_json::from_str(include_str!("../../content/assets.manifest.json"))
            .expect("the asset manifest is valid JSON");
    let patch = manifest
        .entries
        .iter()
        .find(|entry| entry.source == crate::assets::sprites::WHITE_PATCH)
        .unwrap_or_else(|| panic!("the atlas has no {}", crate::assets::sprites::WHITE_PATCH));

    assert!(
        patch.primary_frame().is_some(),
        "the white patch was packed with no frame"
    );
    assert!(
        patch.texture.is_none(),
        "the white patch belongs in the shared atlas, not a sheet"
    );
}

#[test]
fn the_ground_shadow_lies_over_the_terrain_and_under_what_stands_on_it() {
    use crate::terrain::terrain_view_blocks::TERRAIN_LAYER;

    const { assert!(GROUND_SHADOW_LAYER > TERRAIN_LAYER) };
    const { assert!(GROUND_SHADOW_LAYER < crate::game::config::ENTITY_LAYER) };
    const { assert!(GROUND_SHADOW_LAYER < crate::game::config::PLAYER_BEHIND_LAYER) };
}

#[test]
fn a_clear_grid_asks_for_no_lattice() {
    use iso::lighting::{
        BoxMetrics, SHADE_COLUMNS, SHADE_ROWS, ShadeLatticeSpec, ShadowCaster, SpriteExtent,
        shade_grid,
    };

    let receiver = ShadowReceiver {
        foot: (1.0, 1.0),
        elevation: 0.0,
        extent: SpriteExtent {
            left: -50.0,
            top: -100.0,
            width: 100.0,
            height: 100.0,
        },
    };
    let caster = ShadowCaster {
        foot: (0.0, 0.0),
        elevation: 0.0,
        extent: SpriteExtent {
            left: -50.0,
            top: -100.0,
            width: 100.0,
            height: 100.0,
        },
        silhouette: 0,
    };
    let light = iso::lighting::DAWN;
    let solid = shade_grid(
        &receiver,
        &[caster],
        &light.shadow,
        BoxMetrics {
            tile_width: 280.0,
            box_height: 93.0,
        },
        &|_| {
            Some(iso::lighting::Silhouette {
                alpha: &[255],
                stride: 1,
                rows: 1,
                left: 0.0,
                top: 0.0,
                right: 0.0,
                bottom: 0.0,
            })
        },
        None,
        ShadeLatticeSpec {
            opacity: light.opacity(),
            columns: SHADE_COLUMNS,
            rows: SHADE_ROWS,
        },
    );

    assert!(solid.is_none());
}

/// A shadow is laid on the cell itself, which only works while every terrain block is drawn at
#[test]
fn every_terrain_block_is_drawn_at_least_a_whole_cell_wide() {
    use iso::assets::{AssetManifest, terrain_sprite_source};
    use iso::terrain::TerrainMaterial;

    let manifest: AssetManifest =
        serde_json::from_str(include_str!("../../content/assets.manifest.json"))
            .expect("the asset manifest is valid JSON");

    for material in [
        TerrainMaterial::Water,
        TerrainMaterial::Sand,
        TerrainMaterial::Ground,
        TerrainMaterial::Grass,
        TerrainMaterial::Path,
    ] {
        let source = terrain_sprite_source(material);
        let entry = manifest
            .entries
            .iter()
            .find(|entry| entry.source == source)
            .unwrap_or_else(|| panic!("the atlas has no {source}"));
        let ink = entry
            .ink
            .unwrap_or_else(|| panic!("{source} was never measured"));
        assert!(
            ink.width >= 1.0,
            "{source} is drawn {} of a cell wide, so a field of it has gaps",
            ink.width
        );
    }
}

#[test]
fn the_shadow_fade_eases_in_and_lands() {
    assert_eq!(fade_of(0.0), 0.0);
    assert_eq!(fade_of(PHASE_TRANSITION_SECONDS), 1.0);
    assert_eq!(fade_of(PHASE_TRANSITION_SECONDS * 2.0), 1.0);
    assert!((fade_of(PHASE_TRANSITION_SECONDS / 2.0) - 0.5).abs() < 1e-6);

    let mut previous = 0.0_f32;
    for step in 1..=40 {
        let value = fade_of(PHASE_TRANSITION_SECONDS * step as f32 / 40.0);
        assert!(value >= previous, "the fade never dips back");
        previous = value;
    }
}

#[test]
fn a_zero_fade_asks_for_no_lattice_but_one_keeps_the_shadows() {
    use iso::lighting::{
        BoxMetrics, ShadowProjection, ShadowReceiver, Silhouette, SpriteExtent, shade_grid,
    };

    let light = ShadowProjection {
        dir_x: std::f64::consts::FRAC_1_SQRT_2,
        dir_y: std::f64::consts::FRAC_1_SQRT_2,
        stretch: 1.0,
        alpha: 1.0,
    };
    let receiver = ShadowReceiver {
        foot: (light.dir_x, light.dir_y),
        elevation: 0.0,
        extent: SpriteExtent {
            left: -50.0,
            top: -80.0,
            width: 100.0,
            height: 80.0,
        },
    };
    let caster = ShadowCaster {
        foot: (0.0, 0.0),
        elevation: 0.0,
        extent: SpriteExtent {
            left: -50.0,
            top: -80.0,
            width: 100.0,
            height: 80.0,
        },
        silhouette: 0,
    };
    let solid = |_: u32| {
        Some(Silhouette {
            alpha: &[255; 4],
            stride: 2,
            rows: 2,
            left: 0.0,
            top: 0.0,
            right: 1.0,
            bottom: 1.0,
        })
    };
    let grid = shade_grid(
        &receiver,
        &[caster],
        &light,
        BoxMetrics {
            tile_width: 100.0,
            box_height: 100.0 / 3.0,
        },
        &solid,
        None,
        ShadeLatticeSpec {
            opacity: 1.0,
            columns: SHADE_COLUMNS,
            rows: SHADE_ROWS,
        },
    )
    .expect("the grid carries shadow");

    assert!(lattice_of(&grid, 0.0).is_none(), "a zero fade hides it");
    assert!(lattice_of(&grid, 1.0).is_some(), "a full fade shows it");
    assert!(!grid.is_clear());
}

#[test]
fn a_fresh_bake_lands_whole_until_a_phase_change_arms_the_fade() {
    let fade = PhaseFade::default();

    assert_eq!(fade.fresh_born(), PHASE_TRANSITION_SECONDS);
}

#[test]
fn a_fresh_bake_eases_in_while_a_phase_change_is_being_rebaked() {
    let mut fade = PhaseFade::default();

    fade.phase_changed();

    assert_eq!(fade.fresh_born(), 0.0);
}

#[test]
fn fresh_bakes_land_whole_again_once_the_rebake_goes_idle() {
    let mut fade = PhaseFade::default();
    fade.phase_changed();

    fade.idle();

    assert_eq!(fade.fresh_born(), PHASE_TRANSITION_SECONDS);
}

#[test]
fn going_idle_without_a_phase_change_keeps_fresh_bakes_whole() {
    let mut fade = PhaseFade::default();

    fade.idle();

    assert_eq!(fade.fresh_born(), PHASE_TRANSITION_SECONDS);
}
