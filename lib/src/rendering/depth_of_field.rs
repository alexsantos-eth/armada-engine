//! Depth of field by isometric depth: a half-resolution depth pass the presentation reads.
//!
//! The pass redraws the sorted scene with [`DepthMaterial`] into [`DepthTarget`]; every draw
//! carries a [`DepthStamp`] that says at which depth its pixels sit, so the blur of the grade
//! follows `x + y` of the world and not the height on screen. The GPU half (the material and
//! the target) is checked by eye with the `armada-visual-check` scenes; the arithmetic the two
//! shaders run is mirrored on the CPU in `depth_of_field.test.rs` and tested there.

use iso::player::physics::get_player_column;
use iso::projection::{GridPoint, ProjectionConfig};
use iso::scene_order::DrawKey;
use macroquad::prelude::*;
use miniquad::{BlendFactor, BlendState, Equation, PipelineParams};

use crate::assets::sprites::Focus;

/// The lowest depth the map can hold, as a share of the screen's height from its top.
pub const DEPTH_MIN: f32 = -1.0;

/// How much depth the map spans above [`DEPTH_MIN`]: feet far below the screen still count.
pub const DEPTH_SPAN: f32 = 3.0;

/// Half the height of the band around the focus that stays perfectly sharp (CoC 0).
pub const FOCAL_HALF_HEIGHT: f32 = 0.10;

/// How far past the focal band the blur takes to reach its full radius.
pub const TRANSITION_HEIGHT: f32 = 0.20;

/// The full blur radius, in pixels of the scene target.
pub const MAX_BLUR_RADIUS_PX: f32 = 4.0;

/// The name the grade gives the depth map.
pub const DEPTH_MAP: &str = "DepthMap";

/// Packs a depth into two bytes, high byte first, held to the map's range.
pub fn encode_depth(depth: f32) -> [u8; 2] {
    let share = ((depth - DEPTH_MIN) / DEPTH_SPAN).clamp(0.0, 1.0);
    let code = (share * 65535.0).round() as u16;
    code.to_be_bytes()
}

/// What one frame's projection says about depth: where the ground of the camera's level
/// sits on screen, and where the player stands.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DepthFrame {
    ground_origin: f64,
    elevation_step: f64,
    level: f64,
    tile_height: f64,
    height: f32,
    focus: f32,
}

impl DepthFrame {
    /// The depth frame of `projection` drawn at camera `level` on a screen `height` pixels
    /// tall, focused on the player's `feet` (the cell-centred point, as `player_feet` projects).
    pub fn new(projection: ProjectionConfig, level: f64, height: f32, feet: GridPoint) -> Self {
        let elevation_step = projection
            .elevation_step
            .unwrap_or(projection.tile_height / 2.0);
        let ground_origin = projection.origin_y - level * elevation_step;
        let height = height.max(1.0);
        let column = get_player_column(GridPoint {
            x: feet.x - 0.5,
            y: feet.y - 0.5,
        });
        let feet = ground_origin
            - ((f64::from(column.x) + 0.5) + (f64::from(column.y) + 0.5))
                * (projection.tile_height / 2.0);
        Self {
            ground_origin,
            elevation_step,
            level,
            tile_height: projection.tile_height,
            height,
            focus: feet as f32 / height,
        }
    }

    /// The depth of the player's feet, which the focal band is centred on.
    pub fn focus(&self) -> f32 {
        self.focus
    }

    /// The screen's height in pixels, which depths are a share of.
    pub fn height(&self) -> f32 {
        self.height
    }

    /// Where a draw sorted by `key` sits in depth, read as `focus` says.
    pub fn stamp(&self, key: DrawKey, focus: Focus) -> DepthStamp {
        let at = |pixels: f64| ((self.ground_origin + pixels) / f64::from(self.height)) as f32;
        match focus {
            Focus::Standing => {
                let depth = at(key.depth);
                DepthStamp {
                    least: depth,
                    most: depth,
                    lift: 0.0,
                }
            }
            Focus::Surface { top } => DepthStamp {
                least: at(key.depth),
                most: at(key.depth + self.tile_height),
                lift: ((top - self.level) * self.elevation_step) as f32,
            },
        }
    }
}

/// The depth a draw writes: `pixel_y + lift` as a share of the screen, held between `least`
/// and `most`. A standing sprite has both bounds equal; a top face spans its cell.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DepthStamp {
    pub least: f32,
    pub most: f32,
    pub lift: f32,
}

impl DepthStamp {
    /// Lays the stamp over `vertex`: the two bounds in its colour, the lift in `normal.x`.
    pub fn over(&self, vertex: &mut Vertex) {
        let [a, b] = encode_depth(self.least);
        let [c, d] = encode_depth(self.most);
        vertex.color = [a, b, c, d];
        vertex.normal = vec4(self.lift, 0.0, 0.0, 0.0);
    }
}

/// The size of the depth map for a framebuffer of `width` by `height`: half of it, rounded up.
fn depth_target_size(width: f32, height: f32) -> (u32, u32) {
    let half = |value: f32| {
        if !value.is_finite() {
            return 1;
        }
        (value.max(1.0) / 2.0).ceil().min(u32::MAX as f32) as u32
    };
    (half(width), half(height))
}

/// The GLSL the grade includes to read the depth map and turn it into a blur radius.
pub const GRADE_DEPTH_GLSL: &str = r#"
uniform sampler2D DepthMap;
uniform float FocusDepth;
uniform float FocalHalfHeight;
uniform float TransitionHeight;
uniform float MaxBlurRadius;

float sceneDepth(vec2 point) {
    vec4 stored = texture2D(DepthMap, point);
    if (stored.b < 0.5) {
        return 1.0 - point.y;
    }
    float code = floor(stored.r * 255.0 + 0.5) * 256.0 + floor(stored.g * 255.0 + 0.5);
    return code / 65535.0 * 3.0 + -1.0;
}

float blurRadius(vec2 point) {
    float gap = abs(sceneDepth(point) - FocusDepth);
    return smoothstep(
        FocalHalfHeight,
        FocalHalfHeight + TransitionHeight,
        gap
    ) * MaxBlurRadius;
}
"#;

const DEPTH_VERTEX: &str = r#"#version 100
attribute vec3 position;
attribute vec2 texcoord;
attribute vec4 color0;
attribute vec4 normal;

varying vec2 uv;
varying vec4 bounds;
varying float pixelY;
varying float lift;

uniform mat4 Model;
uniform mat4 Projection;

void main() {
    gl_Position = Projection * Model * vec4(position, 1);
    uv = texcoord;
    bounds = color0 / 255.0;
    pixelY = position.y;
    lift = normal.x;
}"#;

/// The depth pass's fragment shader: alpha-tested artwork writing its depth in two bytes.
pub const DEPTH_FRAGMENT: &str = r#"#version 100
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 uv;
varying vec4 bounds;
varying float pixelY;
varying float lift;

uniform sampler2D Texture;
uniform float ScreenHeight;

float unpack(vec2 pair) {
    float code = floor(pair.x * 255.0 + 0.5) * 256.0 + floor(pair.y * 255.0 + 0.5);
    return code / 65535.0 * 3.0 + -1.0;
}

void main() {
    if (texture2D(Texture, uv).a < 0.5) {
        discard;
    }
    float depth = clamp((pixelY + lift) / ScreenHeight, unpack(bounds.rg), unpack(bounds.ba));
    float code = floor(clamp((depth - -1.0) / 3.0, 0.0, 1.0) * 65535.0 + 0.5);
    float high = floor(code / 256.0);
    gl_FragColor = vec4(high / 255.0, (code - high * 256.0) / 255.0, 1.0, 1.0);
}"#;

fn opaque_pipeline() -> PipelineParams {
    PipelineParams {
        color_blend: Some(BlendState::new(
            Equation::Add,
            BlendFactor::One,
            BlendFactor::Zero,
        )),
        alpha_blend: Some(BlendState::new(
            Equation::Add,
            BlendFactor::One,
            BlendFactor::Zero,
        )),
        ..Default::default()
    }
}

/// The material the depth pass draws with.
pub struct DepthMaterial {
    material: Material,
}

impl DepthMaterial {
    /// Loads the material; fails like the scene's does when the context has no OpenGL.
    pub fn load() -> Result<Self, String> {
        let backend = unsafe { get_internal_gl().quad_context.info().backend };
        if backend != miniquad::Backend::OpenGl {
            return Err(format!(
                "la profundidad de campo necesita el backend de OpenGL y este contexto es {backend:?}"
            ));
        }
        let material = load_material(
            ShaderSource::Glsl {
                vertex: DEPTH_VERTEX,
                fragment: DEPTH_FRAGMENT,
            },
            MaterialParams {
                pipeline_params: opaque_pipeline(),
                uniforms: vec![UniformDesc::new("ScreenHeight", UniformType::Float1)],
                ..Default::default()
            },
        )
        .map_err(|error| format!("no se pudo compilar el shader de profundidad: {error}"))?;
        Ok(Self { material })
    }
}

/// The half-resolution map of depths the grade reads; cleared to "nothing drawn" each frame.
pub struct DepthTarget {
    target: RenderTarget,
    size: (u32, u32),
}

impl DepthTarget {
    /// Allocates the map for a framebuffer of `width` by `height` pixels.
    pub fn new(width: f32, height: f32) -> Self {
        let size = depth_target_size(width, height);
        Self {
            target: Self::allocate(size),
            size,
        }
    }

    fn allocate(size: (u32, u32)) -> RenderTarget {
        let target = render_target(size.0, size.1);
        target.texture.set_filter(FilterMode::Nearest);
        target
    }

    /// Reallocates only after the framebuffer's size changed.
    pub fn resize(&mut self, width: f32, height: f32) {
        let size = depth_target_size(width, height);
        if size != self.size {
            self.target = Self::allocate(size);
            self.size = size;
        }
    }

    /// The map, for the grade to sample.
    pub fn texture(&self) -> &Texture2D {
        &self.target.texture
    }

    /// Clears the map and points following drawing at it through `material`, in the scene's
    /// own pixel coordinates.
    pub fn begin(&self, material: &DepthMaterial, frame: &DepthFrame) {
        let mut camera =
            Camera2D::from_display_rect(Rect::new(0.0, 0.0, screen_width(), screen_height()));
        camera.render_target = Some(self.target.clone());
        set_camera(&camera);
        clear_background(Color::new(0.0, 0.0, 0.0, 0.0));
        material
            .material
            .set_uniform("ScreenHeight", frame.height());
        gl_use_material(&material.material);
    }

    /// Hands drawing back to Macroquad's own pipeline.
    pub fn end(&self) {
        gl_use_default_material();
    }
}

#[cfg(test)]
#[path = "depth_of_field.test.rs"]
mod tests;
