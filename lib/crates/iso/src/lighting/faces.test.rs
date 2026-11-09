use super::*;

const GRASS: TerrainMaterial = TerrainMaterial::Grass;

fn levels(map: &[(i32, i32, f64)]) -> impl Fn(i32, i32) -> Option<f64> + '_ {
    move |x, y| map.iter().find(|(mx, my, _)| *mx == x && *my == y).map(|(_, _, level)| *level)
}

#[test]
fn level_ground_shows_no_wall() {
    let map = [(0, 0, 1.0), (-1, 0, 1.0), (0, -1, 1.0)];

    let faces = terrain_faces([(0, 0, 1.0, GRASS)], levels(&map), 10.0);

    assert!(faces.is_empty(), "nothing steps down, so nothing is exposed");
}

#[test]
fn a_step_down_shows_the_side_it_steps_down_from() {
    let map = [(0, 0, 2.0), (-1, 0, 1.0), (0, -1, 2.0)];

    let faces = terrain_faces([(0, 0, 2.0, GRASS)], levels(&map), 10.0);

    assert_eq!(faces.len(), 1);
    assert_eq!(faces[0].axis, FaceAxis::X, "the step is along -x, so that is the side shown");
    assert_eq!((faces[0].top, faces[0].bottom), (2.0, 1.0));
}

#[test]
fn a_tall_cliff_is_cut_into_blocks_so_the_scene_can_sort_it() {
    let map = [(0, 0, 3.0), (-1, 0, 0.0), (0, -1, 3.0)];

    let faces = terrain_faces([(0, 0, 3.0, GRASS)], levels(&map), 10.0);

    assert_eq!(faces.len(), 3);
    for face in &faces {
        assert!((face.top - face.bottom - 1.0).abs() < 1e-12, "each piece is one block");
    }
    assert_eq!(faces[0].top, 3.0);
    assert_eq!(faces[2].bottom, 0.0);
}

/// A drawn level between two block planes still cuts the faces at the block boundaries, not at
#[test]
fn a_drawn_level_between_blocks_cuts_at_the_block_boundary() {
    let map = [(0, 0, 1.5), (-1, 0, 0.0), (0, -1, 1.5)];

    let faces = terrain_faces([(0, 0, 1.5, GRASS)], levels(&map), 10.0);

    assert_eq!(faces.len(), 2);
    assert_eq!((faces[0].top, faces[0].bottom), (1.5, 1.0), "the short piece is on top");
    assert_eq!((faces[1].top, faces[1].bottom), (1.0, 0.0));
}

#[test]
fn an_unloaded_neighbour_is_level_ground_and_not_a_cliff() {
    let map = [(0, 0, 4.0), (0, -1, 4.0)];

    let faces = terrain_faces([(0, 0, 4.0, GRASS)], levels(&map), 10.0);

    assert!(faces.is_empty(), "the chunk edge must not grow a wall while the next one loads");
}

#[test]
fn a_wall_is_never_cut_deeper_than_the_client_draws_the_stack() {
    let map = [(0, 0, 9.0), (-1, 0, -40.0), (0, -1, 9.0)];

    let faces = terrain_faces([(0, 0, 9.0, GRASS)], levels(&map), 3.0);

    assert_eq!(faces.len(), 3);
    assert_eq!(faces[2].bottom, 6.0, "three blocks down and no further");
}

#[test]
fn a_face_names_the_world_points_across_and_down_it() {
    let face = TerrainFace { x: 4, y: 7, axis: FaceAxis::X, top: 2.0, bottom: 1.0, material: GRASS };

    assert_eq!(face.point(0.0, 0.0), (4.0, 7.0, 2.0), "its top corner at the cell's origin");
    assert_eq!(face.point(1.0, 0.0), (4.0, 8.0, 2.0), "across is the cell's own y on an x face");
    assert_eq!(face.point(0.0, 1.0), (4.0, 7.0, 1.0), "and down reaches the bottom");

    let other = TerrainFace { axis: FaceAxis::Y, ..face };
    assert_eq!(other.point(1.0, 0.0), (5.0, 7.0, 2.0), "across is the cell's own x on a y face");
}
