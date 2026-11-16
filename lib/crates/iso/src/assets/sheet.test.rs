//! Tests for reading a player sheet's grid out of its JSON sidecar.

use super::*;

/// The sidecar of `walk.json`, which is the shape every player sheet is generated with.
const WALK: &str = r#"{"frames": 9, "gap": 48, "cell": [313, 271, 398, 399], "facings": ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"]}"#;

/// The sidecar of `jump.json`, whose columns are named phases rather than numbered.
const JUMP: &str = r#"{"frames": 5, "gap": 48, "cell": [313, 271, 398, 399], "facings": ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"], "poses": ["takeoff", "rise", "apex", "fall", "landing"]}"#;

#[test]
fn reads_the_grid_of_a_numbered_sheet() {
    let grid = parse_sheet(WALK).expect("walk.json is a sheet");
    assert_eq!(grid.columns, 9);
    assert_eq!(grid.rows(), 8);
    assert_eq!(grid.gap, 48.0);
    assert_eq!(grid.facings[0], "east");
    assert_eq!(grid.facings[6], "south");
    assert!(grid.poses.is_empty());
    assert_eq!(
        grid.cell,
        SheetCell {
            x: 313.0,
            y: 271.0,
            width: 398.0,
            height: 399.0
        }
    );
}

#[test]
fn names_the_group_of_each_cell() {
    let walk = parse_sheet(WALK).expect("sheet");
    assert_eq!(walk.cell_id(0, 0).as_deref(), Some("east-0"));
    assert_eq!(walk.cell_id(6, 8).as_deref(), Some("south-8"));
    assert_eq!(walk.cell_id(6, 9), None, "past the last column");
    assert_eq!(walk.cell_id(8, 0), None, "past the last facing");

    let jump = parse_sheet(JUMP).expect("sheet");
    assert_eq!(jump.cell_id(0, 0).as_deref(), Some("east-takeoff"));
    assert_eq!(jump.cell_id(1, 4).as_deref(), Some("north-east-landing"));
    assert_eq!(jump.poses.len(), 5);
}

/// The whole sheet shares one box, and it has to agree with the still figure's own: `block.png`
/// is drawn from the same template.
#[test]
fn places_every_cell_by_the_window_it_shows() {
    let ink = parse_sheet(WALK).expect("sheet").ink();
    assert!((ink.x - (313.0 - 512.0) / 1024.0).abs() < 1e-9);
    assert!((ink.y - (271.0 - 341.0 - 256.0) / 1024.0).abs() < 1e-9);
    assert!((ink.width - 398.0 / 1024.0).abs() < 1e-9);
    assert!((ink.height - 399.0 / 1024.0).abs() < 1e-9);
    let figure = InkBox {
        x: -0.128125,
        y: -0.278809,
        width: 0.263086,
        height: 0.33291,
    };
    assert!(
        ink.x <= figure.x,
        "the window reaches past the figure on the left"
    );
    assert!(ink.y <= figure.y, "and above it");
    assert!(ink.x + ink.width >= figure.x + figure.width);
    assert!(ink.y + ink.height >= figure.y + figure.height);
}

/// The sheets as they are drawn: the sixteen-facing ones.
#[test]
fn reads_the_real_sheets() {
    let mut window = None;
    for (file, columns, poses) in [
        ("walk", 9, 0),
        ("idle", 8, 0),
        ("climb", 9, 0),
        ("jump", 5, 5),
        ("jetpack", 1, 0),
    ] {
        let path = format!(
            "{}/../../assets/player-16/{file}.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let json = std::fs::read_to_string(&path).unwrap_or_else(|err| panic!("{path}: {err}"));
        let grid = parse_sheet(&json).expect("a generated player sheet");
        assert_eq!(grid.columns, columns, "player-16/{file}");
        assert_eq!(grid.poses.len(), poses, "player-16/{file}");
        assert_eq!(grid.rows(), 16, "player-16/{file}");
        let shared = *window.get_or_insert(grid.ink());
        assert_eq!(
            grid.ink(),
            shared,
            "player-16/{file} shows the same window"
        );
        assert_eq!(grid.facings[0], "east", "counter-clockwise from east");
    }
}

#[test]
fn rejects_what_is_not_a_sheet() {
    assert!(parse_sheet("{}").is_none(), "no grid at all");
    assert!(
        parse_sheet(r#"{"frames": 9}"#).is_none(),
        "no cell and no facings"
    );
    assert!(
        parse_sheet(r#"{"frames": 9, "cell": [0, 0, 10, 10]}"#).is_none(),
        "no facings"
    );
    assert!(
        parse_sheet(r#"{"frames": 9, "cell": [0, 0, 0, 10], "facings": ["east"]}"#).is_none(),
        "an empty cell"
    );
    assert!(
        parse_sheet(r#"{"frames": 0, "cell": [0, 0, 10, 10], "facings": ["east"]}"#).is_none(),
        "no columns"
    );
    assert!(
        parse_sheet(r#"{"frames": 2, "cell": [0, 0, 10], "facings": ["east"]}"#).is_none(),
        "a short cell"
    );
    assert!(
        parse_sheet("not json").is_none(),
        "not even parseable as JSON"
    );
}

/// A sheet with no `gap` is one unbroken grid; the field is optional.
#[test]
fn defaults_the_gap_to_nothing() {
    let json = r#"{"frames": 2, "cell": [313, 271, 398, 399], "facings": ["east", "west"]}"#;
    assert_eq!(parse_sheet(json).expect("sheet").gap, 0.0);
}
