use super::*;

fn chunk(cx: i32, cy: i32) -> ChunkCoord {
    ChunkCoord { cx, cy }
}

#[test]
fn a_slot_holds_a_chunks_map_with_its_margin() {
    assert_eq!(
        SLOT_TEXELS,
        (CHUNK_SIZE + 2 * SHADOW_MAP_MARGIN) as u32 * SHADOW_MAP_PIXELS_PER_TILE
    );
    assert_eq!(SLOT_TEXELS, 1224);
}

/// The atlas has to fit the smallest texture size a desktop or WebGL2 context may offer.
#[test]
fn the_atlas_stays_inside_the_smallest_allowed_texture() {
    const { assert!(ATLAS_TEXELS <= 4096) };
    assert_eq!(SLOT_COUNT, 9);
}

#[test]
fn slots_are_laid_out_in_rows() {
    assert_eq!(slot_origin(0), (0, 0));
    assert_eq!(slot_origin(1), (SLOT_TEXELS, 0));
    assert_eq!(slot_origin(SLOTS_ACROSS as usize), (0, SLOT_TEXELS));
    assert_eq!(
        slot_origin(SLOT_COUNT - 1),
        (ATLAS_TEXELS - SLOT_TEXELS, ATLAS_TEXELS - SLOT_TEXELS)
    );
}

#[test]
fn every_slot_lies_inside_the_atlas() {
    for slot in 0..SLOT_COUNT {
        let (x, y) = slot_origin(slot);
        assert!(x + SLOT_TEXELS <= ATLAS_TEXELS);
        assert!(y + SLOT_TEXELS <= ATLAS_TEXELS);
    }
}

#[test]
fn a_chunk_that_has_no_slot_is_in_none() {
    let slots = SlotMap::new();

    assert_eq!(slots.slot_of(chunk(0, 0)), None);
}

#[test]
fn claiming_twice_gives_a_chunk_the_same_slot() {
    let mut slots = SlotMap::new();

    let (first, turned_out) = slots.claim(chunk(1, 1));
    assert_eq!(turned_out, None);
    let (again, turned_out) = slots.claim(chunk(1, 1));

    assert_eq!(again, first);
    assert_eq!(turned_out, None);
    assert_eq!(slots.slot_of(chunk(1, 1)), Some(first));
}

#[test]
fn each_chunk_gets_a_slot_of_its_own_while_there_are_free_ones() {
    let mut slots = SlotMap::new();

    let mut taken = Vec::new();
    for n in 0..SLOT_COUNT as i32 {
        let (slot, turned_out) = slots.claim(chunk(n, 0));
        assert_eq!(
            turned_out, None,
            "slot {n} evicted while the atlas had room"
        );
        taken.push(slot);
    }

    taken.sort_unstable();
    taken.dedup();
    assert_eq!(taken.len(), SLOT_COUNT);
}

/// The draw path touches the chunks it draws, so the one turned out is one that is not on screen.
#[test]
fn a_full_atlas_turns_out_the_chunk_wanted_longest_ago() {
    let mut slots = SlotMap::new();
    for n in 0..SLOT_COUNT as i32 {
        slots.claim(chunk(n, 0));
    }
    for n in 1..SLOT_COUNT as i32 {
        assert!(slots.touch(chunk(n, 0)).is_some());
    }

    let (slot, turned_out) = slots.claim(chunk(99, 0));

    assert_eq!(turned_out, Some(chunk(0, 0)));
    assert_eq!(slots.slot_of(chunk(0, 0)), None);
    assert_eq!(slots.slot_of(chunk(99, 0)), Some(slot));
}

#[test]
fn touching_a_chunk_the_atlas_does_not_hold_says_so() {
    let mut slots = SlotMap::new();

    assert_eq!(slots.touch(chunk(4, 4)), None);
}

#[test]
fn a_released_slot_is_free_again() {
    let mut slots = SlotMap::new();
    for n in 0..SLOT_COUNT as i32 {
        slots.claim(chunk(n, 0));
    }

    slots.release(chunk(3, 0));
    let (_, turned_out) = slots.claim(chunk(99, 0));

    assert_eq!(
        turned_out, None,
        "the freed slot should have been taken instead of evicting"
    );
    assert_eq!(slots.slot_of(chunk(3, 0)), None);
}

#[test]
fn releasing_a_chunk_the_atlas_does_not_hold_changes_nothing() {
    let mut slots = SlotMap::new();
    let (slot, _) = slots.claim(chunk(2, 2));

    slots.release(chunk(7, 7));

    assert_eq!(slots.slot_of(chunk(2, 2)), Some(slot));
}

#[test]
fn a_default_slot_map_is_empty() {
    let slots = SlotMap::default();

    assert_eq!(slots.slot_of(chunk(0, 0)), None);
}

/// The whole point of asking the area rather than computing the arithmetic twice: a column's
#[test]
fn a_columns_square_is_the_one_the_bake_laid_it_in() {
    let coord = chunk(2, -3);
    let min_x = coord.cx * CHUNK_SIZE;
    let min_y = coord.cy * CHUNK_SIZE;
    let map = ShadowMap::new(
        MapArea::around(min_x, min_y, min_x + CHUNK_SIZE - 1, min_y + CHUNK_SIZE - 1),
        SHADOW_MAP_PIXELS_PER_TILE,
    );

    for (x, y) in [
        (min_x, min_y),
        (min_x + 7, min_y + 11),
        (min_x + CHUNK_SIZE - 1, min_y),
    ] {
        assert_eq!(
            square_in_slot(coord, x, y),
            map.square_of(x, y),
            "column ({x}, {y})"
        );
    }
}

#[test]
fn the_margin_column_outside_a_chunk_still_has_a_square() {
    let coord = chunk(0, 0);

    assert_eq!(square_in_slot(coord, -1, -1), Some((0, 0)));
    assert_eq!(
        square_in_slot(coord, 0, 0),
        Some((SHADOW_MAP_PIXELS_PER_TILE, SHADOW_MAP_PIXELS_PER_TILE))
    );
}

#[test]
fn a_column_past_the_margin_has_no_square() {
    assert_eq!(square_in_slot(chunk(0, 0), -2, 0), None);
    assert_eq!(square_in_slot(chunk(0, 0), 0, CHUNK_SIZE + 1), None);
}

#[test]
fn a_texels_middle_in_the_first_slot_is_its_place_in_the_atlas() {
    let (u, v) = atlas_uv(0, (0.5, 0.5));

    assert!(
        (u - 0.5 / f32::from(ATLAS_TEXELS as u16)).abs() < 1e-7,
        "{u}"
    );
    assert!(
        (v - 0.5 / f32::from(ATLAS_TEXELS as u16)).abs() < 1e-7,
        "{v}"
    );
}

#[test]
fn a_later_slots_coordinates_are_offset_by_its_corner() {
    let (u, v) = atlas_uv(SLOTS_ACROSS as usize + 1, (0.5, 0.5));
    let side = f64::from(ATLAS_TEXELS);

    assert!(
        (f64::from(u) - (f64::from(SLOT_TEXELS) + 0.5) / side).abs() < 1e-7,
        "{u}"
    );
    assert!(
        (f64::from(v) - (f64::from(SLOT_TEXELS) + 0.5) / side).abs() < 1e-7,
        "{v}"
    );
}

#[test]
fn the_far_corner_of_the_last_slot_is_the_far_corner_of_the_atlas() {
    let (u, v) = atlas_uv(
        SLOT_COUNT - 1,
        (f64::from(SLOT_TEXELS), f64::from(SLOT_TEXELS)),
    );

    assert!((u - 1.0).abs() < 1e-7, "{u}");
    assert!((v - 1.0).abs() < 1e-7, "{v}");
}
