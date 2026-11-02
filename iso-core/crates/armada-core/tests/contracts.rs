use armada_core::grid::{
    CHUNK_SIZE, ChunkCoord, LocalCoord, WorldCoord, to_chunk_coord, to_local_coord, to_world_coord,
};
use armada_core::projection::{GridPoint, ProjectionConfig, project_block};
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
