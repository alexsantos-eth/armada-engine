//! Tests for reading a player sheet's grid out of its SVG.

use super::*;

/// The header of `walk.svg`, which is the shape every player sheet is generated with.
const WALK: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" width="3966" height="3528" viewBox="0 0 3966 3528" data-cell="313 271 398 399" data-gap="48" data-frames="9" data-facings="east north-east north north-west west south-west south south-east"><g id="east-0"/></svg>"#;

/// The header of `jump.svg`, whose columns are named phases rather than numbered.
const JUMP: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" width="2182" height="3528" viewBox="0 0 2182 3528" data-cell="313 271 398 399" data-gap="48" data-frames="5" data-poses="takeoff rise apex fall landing" data-facings="east north-east north north-west west south-west south south-east"><g id="east-takeoff"/></svg>"#;

#[test]
fn reads_the_grid_of_a_numbered_sheet() {
    let grid = parse_sheet(WALK).expect("walk.svg is a sheet");
    assert_eq!(grid.columns, 9);
    assert_eq!(grid.rows(), 8);
    assert_eq!(grid.gap, 48.0);
    assert_eq!(grid.facings[0], "east");
    assert_eq!(grid.facings[6], "south");
    assert!(grid.poses.is_empty());
    assert_eq!(
        grid.cell,
        SheetCell { x: 313.0, y: 271.0, width: 398.0, height: 399.0 }
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

/// The whole sheet shares one box, and it has to agree with the still figure's own: `block.svg`
/// is drawn in the same template, so its artwork falls inside the window the cells show.
#[test]
fn places_every_cell_by_the_window_it_shows() {
    let ink = parse_sheet(WALK).expect("sheet").ink();
    assert!((ink.x - (313.0 - 512.0) / 1024.0).abs() < 1e-9);
    assert!((ink.y - (271.0 - 341.0 - 256.0) / 1024.0).abs() < 1e-9);
    assert!((ink.width - 398.0 / 1024.0).abs() < 1e-9);
    assert!((ink.height - 399.0 / 1024.0).abs() < 1e-9);
    // The still figure, measured from `player/block.svg`.
    let figure = InkBox { x: -0.128125, y: -0.278809, width: 0.263086, height: 0.33291 };
    assert!(ink.x <= figure.x, "the window reaches past the figure on the left");
    assert!(ink.y <= figure.y, "and above it");
    assert!(ink.x + ink.width >= figure.x + figure.width);
    assert!(ink.y + ink.height >= figure.y + figure.height);
}

#[test]
fn reads_the_real_sheets() {
    for (svg, columns, poses) in [
        (include_str!("../../../../../public/assets/player/walk.svg"), 9, 0),
        (include_str!("../../../../../public/assets/player/idle.svg"), 8, 0),
        (include_str!("../../../../../public/assets/player/climb.svg"), 9, 0),
        (include_str!("../../../../../public/assets/player/jump.svg"), 5, 5),
        (include_str!("../../../../../public/assets/player/jetpack.svg"), 1, 0),
    ] {
        let grid = parse_sheet(svg).expect("a generated player sheet");
        assert_eq!(grid.columns, columns);
        assert_eq!(grid.poses.len(), poses);
        assert_eq!(grid.rows(), 8);
        assert_eq!(grid.ink(), parse_sheet(WALK).expect("sheet").ink(), "one window");
    }
}

#[test]
fn rejects_what_is_not_a_sheet() {
    assert!(parse_sheet(include_str!("../../../../../public/assets/player/block.svg")).is_none());
    assert!(parse_sheet(r#"<svg data-frames="9"/>"#).is_none(), "no cell");
    assert!(
        parse_sheet(r#"<svg data-cell="0 0 10 10" data-frames="9"/>"#).is_none(),
        "no facings"
    );
    assert!(
        parse_sheet(r#"<svg data-cell="0 0 0 10" data-frames="9" data-facings="east"/>"#).is_none(),
        "an empty cell"
    );
    assert!(
        parse_sheet(r#"<svg data-cell="0 0 10 10" data-frames="0" data-facings="east"/>"#)
            .is_none(),
        "no columns"
    );
    assert!(
        parse_sheet(r#"<svg data-cell="0 0 10" data-frames="2" data-facings="east"/>"#).is_none(),
        "a short cell"
    );
}

/// A sheet with no `data-gap` is one unbroken grid; the attribute is optional.
#[test]
fn defaults_the_gap_to_nothing() {
    let svg = r#"<svg data-cell="313 271 398 399" data-frames="2" data-facings="east west"/>"#;
    assert_eq!(parse_sheet(svg).expect("sheet").gap, 0.0);
}
