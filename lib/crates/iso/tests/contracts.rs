use iso::camera::{Camera, ScreenSize, cull_rect, needs_cull, visible_chunks};
use iso::grid::{
    CHUNK_SIZE, ChunkCoord, LocalCoord, WorldCoord, to_chunk_coord, to_local_coord, to_world_coord,
};
use iso::projection::{GridPoint, ProjectionConfig, project_block};
use iso::scene_order::{
    CHUNK_KEEP_RADIUS, CHUNK_LOAD_RADIUS, CHUNK_PREFETCH_RADIUS, CHUNKS_HIDDEN_PER_FRAME,
    CHUNKS_LOADED_PER_FRAME, CHUNKS_SHOWN_PER_FRAME, DrawKey, JumpPhase, JumpPoses, LengthAxis,
    PlayerFrame, PlayerFrameInput, PlayerSheet, climb_pose, compare_draw_keys, get_draw_depth,
    idle_pose, jump_pose, select_player_frame, walk_pose,
};
use iso::simulation::{FixedStepper, StepperOptions};
use serde_json::Value;

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "fixtures/contracts.json"
    ))
    .expect("contract fixture is valid JSON")
}

fn integer(value: &Value) -> i32 {
    value.as_i64().expect("integer fixture") as i32
}

fn number(value: &Value) -> f64 {
    value.as_f64().expect("numeric fixture")
}

#[test]
fn signed_chunk_coordinates_match_contract_fixture() {
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
fn isometric_blocks_match_contract_fixture() {
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
fn scene_depth_and_layer_match_contract_fixture() {
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
fn player_pose_columns_match_contract_fixture() {
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

#[test]
fn player_sheet_selection_matches_contract_fixture() {
    let fixture = fixture();
    let poses = &fixture["framePoses"];
    for sample in fixture["frameSelection"].as_array().unwrap() {
        let has = |name: &str| sample[name].as_bool().unwrap();
        let frame = select_player_frame(PlayerFrameInput {
            walk_frames: integer(&poses["walk"]["frames"]),
            walk_stride: number(&poses["walk"]["stride"]),
            climb_frames: has("hasClimb").then(|| integer(&poses["climb"]["frames"])),
            idle: has("hasIdle").then(|| {
                (
                    integer(&poses["idle"]["frames"]),
                    number(&poses["idle"]["period"]),
                )
            }),
            jump_pose: has("hasJump")
                .then(|| sample["jumpPose"].as_i64().map(|value| value as i32))
                .flatten(),
            climbing: sample["climbing"].as_f64(),
            walking: sample["walking"].as_bool().unwrap(),
            flying: sample["flying"].as_bool().unwrap(),
            walked: sample["walked"].as_f64().unwrap(),
            stood_ms: sample["stoodMs"].as_f64().unwrap(),
            air_pose: sample["airPose"].as_i64().map(|value| value as i32),
        });
        let expected = &sample["expected"];
        let sheet = match expected["sheet"].as_str().unwrap() {
            "walk" => PlayerSheet::Walk,
            "climb" => PlayerSheet::Climb,
            "jump" => PlayerSheet::Jump,
            "idle" => PlayerSheet::Idle,
            other => panic!("unexpected player sheet: {other}"),
        };
        assert_eq!(
            frame,
            PlayerFrame {
                sheet,
                pose: integer(&expected["pose"])
            },
            "{}",
            sample["id"].as_str().unwrap()
        );
    }
}

#[test]
fn chunk_budgets_match_contract_fixture() {
    let fixture = fixture();
    let budgets = &fixture["chunkBudgets"];
    assert_eq!(CHUNK_LOAD_RADIUS, integer(&budgets["chunkLoadRadius"]));
    assert_eq!(CHUNK_PREFETCH_RADIUS, integer(&budgets["chunkPrefetchRadius"]));
    assert_eq!(CHUNK_KEEP_RADIUS, integer(&budgets["chunkKeepRadius"]));
    assert_eq!(CHUNKS_LOADED_PER_FRAME, integer(&budgets["chunksLoadedPerFrame"]));
    assert_eq!(CHUNKS_SHOWN_PER_FRAME, integer(&budgets["chunksShownPerFrame"]));
    assert_eq!(CHUNKS_HIDDEN_PER_FRAME, integer(&budgets["chunksHiddenPerFrame"]));
}

#[test]
fn camera_culling_matches_contract_fixture() {
    let fixture = fixture();
    let culling = &fixture["culling"];
    let viewport = ScreenSize {
        width: number(&culling["viewport"]["width"]),
        height: number(&culling["viewport"]["height"]),
    };
    let proj = ProjectionConfig {
        tile_width: number(&culling["projection"]["tileWidth"]),
        tile_height: number(&culling["projection"]["tileHeight"]),
        elevation_step: None,
        origin_x: number(&culling["projection"]["originX"]),
        origin_y: number(&culling["projection"]["originY"]),
    };
    for sample in culling["cullRect"].as_array().unwrap() {
        let rect = cull_rect(viewport, number(&sample["margin"]));
        let exp = &sample["expected"];
        assert_eq!(rect.x, number(&exp["x"]));
        assert_eq!(rect.y, number(&exp["y"]));
        assert_eq!(rect.width, number(&exp["width"]));
        assert_eq!(rect.height, number(&exp["height"]));
    }
    for sample in culling["needsCull"].as_array().unwrap() {
        let previous = if sample["previous"].is_null() {
            None
        } else {
            Some(Camera {
                x: number(&sample["previous"]["x"]),
                y: number(&sample["previous"]["y"]),
                zoom: number(&sample["previous"]["zoom"]),
            })
        };
        let camera = Camera {
            x: number(&sample["camera"]["x"]),
            y: number(&sample["camera"]["y"]),
            zoom: number(&sample["camera"]["zoom"]),
        };
        assert_eq!(
            needs_cull(previous, camera, viewport, proj, number(&sample["margin"])),
            sample["expected"].as_bool().unwrap()
        );
    }
    for sample in culling["visibleChunks"].as_array().unwrap() {
        let camera = Camera {
            x: number(&sample["camera"]["x"]),
            y: number(&sample["camera"]["y"]),
            zoom: number(&sample["camera"]["zoom"]),
        };
        let result = visible_chunks(camera, viewport, proj, number(&sample["margin"]));
        let expected: Vec<ChunkCoord> = sample["expected"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| ChunkCoord {
                cx: integer(&c["cx"]),
                cy: integer(&c["cy"]),
            })
            .collect();
        assert_eq!(result, expected);
    }
}

#[test]
fn stepper_matches_contract_fixture() {
    let fixture = fixture();
    let stepper = &fixture["stepper"];
    let step_ms = number(&stepper["stepMs"]);
    let frames_ms: Vec<f64> = stepper["framesMs"]
        .as_array()
        .unwrap()
        .iter()
        .map(number)
        .collect();
    let steps: Vec<u64> = stepper["steps"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_u64().expect("step count"))
        .collect();
    let alpha: Vec<f64> = stepper["alpha"]
        .as_array()
        .unwrap()
        .iter()
        .map(number)
        .collect();

    let mut stepper = FixedStepper::new(StepperOptions {
        step_ms,
        max_frame_ms: 250.0,
        time_scale: 1.0,
    })
    .expect("valid stepper options");

    for i in 0..frames_ms.len() {
        let got_steps = stepper.consume_frame(frames_ms[i]);
        assert_eq!(got_steps, steps[i], "steps at frame {i}");
        assert!(
            (stepper.interpolation_alpha() - alpha[i]).abs() < 1e-9,
            "alpha at frame {i}"
        );
    }
}
