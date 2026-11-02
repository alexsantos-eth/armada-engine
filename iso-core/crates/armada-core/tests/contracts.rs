use armada_core::grid::{
    CHUNK_SIZE, ChunkCoord, LocalCoord, WorldCoord, to_chunk_coord, to_local_coord, to_world_coord,
};
use armada_core::projection::{GridPoint, ProjectionConfig, project_block};
use armada_core::scene_order::{
    DrawKey, JumpPhase, JumpPoses, LengthAxis, climb_pose, compare_draw_keys, get_draw_depth,
    idle_pose, jump_pose, walk_pose,
};
use serde_json::Value;

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../src/isometric/core/engine/flow-check/contracts.v1.json"
    ))
    .expect("migration fixture is valid JSON")
}

fn integer(value: &Value) -> i32 {
    value.as_i64().expect("integer fixture") as i32
}

fn number(value: &Value) -> f64 {
    value.as_f64().expect("numeric fixture")
}

#[test]
fn signed_chunk_coordinates_match_typescript_fixture() {
    for sample in fixture()["coordinates"].as_array().unwrap() {
        let world = WorldCoord {
            x: integer(&sample["world"]["x"]),
            y: integer(&sample["world"]["y"]),
        };
        let chunk = ChunkCoord {
            cx: integer(&sample["chunk"]["cx"]),
            cy: integer(&sample["chunk"]["cy"]),
        };
        let local = LocalCoord {
            lx: integer(&sample["local"]["lx"]),
            ly: integer(&sample["local"]["ly"]),
        };
        assert_eq!(to_chunk_coord(world), chunk);
        assert_eq!(to_local_coord(world), local);
        assert_eq!(to_world_coord(chunk, local), world);
        assert!((0..CHUNK_SIZE).contains(&local.lx));
        assert!((0..CHUNK_SIZE).contains(&local.ly));
    }
}

#[test]
fn isometric_blocks_match_typescript_fixture() {
    let fixture = fixture();
    let config = &fixture["projection"]["config"];
    let config = ProjectionConfig {
        tile_width: number(&config["tileWidth"]),
        tile_height: number(&config["tileHeight"]),
        elevation_step: Some(number(&config["elevationStep"])),
        origin_x: number(&config["originX"]),
        origin_y: number(&config["originY"]),
    };
    for block in fixture["projection"]["blocks"].as_array().unwrap() {
        let point = GridPoint {
            x: number(&block["x"]),
            y: number(&block["y"]),
        };
        let result = project_block(point, number(&block["elevation"]), config);
        assert_eq!(result.screen_x, number(&block["screenX"]));
        assert_eq!(result.base_screen_y, number(&block["baseScreenY"]));
        assert_eq!(result.screen_y, number(&block["screenY"]));
    }
}

#[test]
fn scene_depth_and_layer_match_typescript_fixture() {
    let fixture = fixture();
    let order = &fixture["drawOrder"];
    let height = number(&order["tileHeight"]);
    let mut entries: Vec<_> = order["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            let axis = if entry["axis"] == "x" {
                LengthAxis::X
            } else {
                LengthAxis::Y
            };
            let depth = get_draw_depth(
                number(&entry["baseScreenY"]),
                number(&entry["elevation"]),
                number(&entry["x"]),
                height,
                integer(&entry["tile"]),
                axis,
            );
            (
                entry["id"].as_str().unwrap(),
                DrawKey {
                    depth,
                    layer: integer(&entry["layer"]),
                },
            )
        })
        .collect();
    entries.sort_by(|a, b| compare_draw_keys(&a.1, &b.1));
    let ids: Vec<_> = entries.into_iter().map(|entry| entry.0).collect();
    let expected: Vec<_> = order["expected"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap())
        .collect();
    assert_eq!(ids, expected);
}

#[test]
fn player_pose_columns_match_typescript_fixture() {
    let fixture = fixture();
    let frames = &fixture["framePoses"];
    let walk = &frames["walk"];
    for (distance, expected) in walk["distances"]
        .as_array()
        .unwrap()
        .iter()
        .zip(walk["expected"].as_array().unwrap())
    {
        assert_eq!(
            walk_pose(
                number(distance),
                integer(&walk["frames"]),
                number(&walk["stride"])
            ),
            integer(expected)
        );
    }
    let idle = &frames["idle"];
    for (ms, expected) in idle["milliseconds"]
        .as_array()
        .unwrap()
        .iter()
        .zip(idle["expected"].as_array().unwrap())
    {
        assert_eq!(
            idle_pose(
                number(ms),
                integer(&idle["frames"]),
                number(&idle["period"])
            ),
            integer(expected)
        );
    }
    let climb = &frames["climb"];
    for (progress, expected) in climb["progress"]
        .as_array()
        .unwrap()
        .iter()
        .zip(climb["expected"].as_array().unwrap())
    {
        assert_eq!(
            climb_pose(number(progress), integer(&climb["frames"])),
            integer(expected)
        );
    }
    let jump = &frames["jump"];
    let poses = &jump["poses"];
    let poses = JumpPoses {
        takeoff: integer(&poses["takeoff"]),
        rise: integer(&poses["rise"]),
        apex: integer(&poses["apex"]),
        fall: integer(&poses["fall"]),
        landing: integer(&poses["landing"]),
    };
    for (phase, expected) in jump["phases"]
        .as_array()
        .unwrap()
        .iter()
        .zip(jump["expected"].as_array().unwrap())
    {
        let phase = match phase.as_str().unwrap() {
            "ground" => JumpPhase::Ground,
            "takeoff" => JumpPhase::Takeoff,
            "rise" => JumpPhase::Rise,
            "apex" => JumpPhase::Apex,
            "fall" => JumpPhase::Fall,
            "landing" => JumpPhase::Landing,
            other => panic!("unexpected jump phase: {other}"),
        };
        assert_eq!(
            jump_pose(phase, poses),
            expected.as_i64().map(|value| value as i32)
        );
    }
}
