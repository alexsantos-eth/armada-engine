use super::*;

/// The shader branches on `normal.z`, so the two kinds have to fall either side of its cut.
#[test]
fn the_two_kinds_of_vertex_fall_either_side_of_the_shaders_cut() {
    const { assert!(SPRITE < 0.5) };
    const { assert!(SHADOW > 0.5) };
}

#[test]
fn a_sprite_vertex_carries_no_shadow_coordinate_and_the_sprite_kind() {
    let v = vertex((10.0, 20.0), (0.25, 0.5), WHITE, (0.0, 0.0), SPRITE);

    assert_eq!(v.position, vec3(10.0, 20.0, 0.0));
    assert_eq!(v.uv, vec2(0.25, 0.5));
    assert_eq!(v.color, [255, 255, 255, 255]);
    assert_eq!(v.normal, vec4(0.0, 0.0, SPRITE, 0.0));
}

#[test]
fn a_shadow_vertex_carries_where_to_read_the_map() {
    let v = vertex(
        (1.0, 2.0),
        (0.5, 0.5),
        Color::new(0.0, 0.0, 0.0, 0.5),
        (0.125, 0.75),
        SHADOW,
    );

    assert_eq!(v.normal, vec4(0.125, 0.75, SHADOW, 0.0));
    assert_eq!(v.color[3], 127);
}

/// The names Macroquad reserves. Passing either as a material texture panics inside
#[test]
fn the_shadow_map_does_not_use_a_reserved_texture_name() {
    assert_ne!(SHADOW_MAP, "Texture");
    assert_ne!(SHADOW_MAP, "_ScreenTexture");
}

/// Both stages have to declare the same varyings, and the fragment stage has to sample the
#[test]
fn the_two_stages_agree_on_what_they_pass_between_them() {
    assert!(VERTEX.contains("varying vec4 data;"));
    assert!(FRAGMENT.contains("varying vec4 data;"));
    assert!(VERTEX.contains("attribute vec4 normal;"));
    assert!(FRAGMENT.contains(&format!("uniform sampler2D {SHADOW_MAP};")));
}

#[test]
fn the_scene_preserves_the_opaque_target_alpha_while_blending_its_colours() {
    assert_eq!(
        scene_pipeline().alpha_blend,
        Some(BlendState::new(
            Equation::Add,
            BlendFactor::Zero,
            BlendFactor::One,
        ))
    );
}
