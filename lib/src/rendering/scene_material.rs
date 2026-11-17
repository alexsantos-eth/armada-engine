//! The one shader the whole scene is drawn with.

use macroquad::prelude::*;
use miniquad::{BlendFactor, BlendState, BlendValue, Equation, PipelineParams};

/// `normal.z` of a vertex drawn from the bound texture, which is every sprite.
pub const SPRITE: f32 = 0.0;

/// `normal.z` of a vertex whose colour is coverage read from the shadow atlas.
pub const SHADOW: f32 = 1.0;

/// The name the shader gives the shadow atlas. `Texture` and `_ScreenTexture` are Macroquad's
const SHADOW_MAP: &str = "ShadowMap";

const VERTEX: &str = r#"#version 100
attribute vec3 position;
attribute vec2 texcoord;
attribute vec4 color0;
attribute vec4 normal;

varying lowp vec4 color;
varying lowp vec2 uv;
varying vec4 data;

uniform mat4 Model;
uniform mat4 Projection;

void main() {
    gl_Position = Projection * Model * vec4(position, 1);
    color = color0 / 255.0;
    uv = texcoord;
    data = normal;
}"#;

const FRAGMENT: &str = r#"#version 100
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying lowp vec4 color;
varying lowp vec2 uv;
varying vec4 data;

uniform sampler2D Texture;
uniform sampler2D ShadowMap;

float bayer2(vec2 cell) {
    cell = mod(floor(cell), 2.0);
    return fract(cell.x / 2.0 + cell.y * cell.y * 0.75);
}

float bayer4(vec2 cell) {
    return bayer2(0.5 * cell) * 0.25 + bayer2(cell);
}

void main() {
    if (data.z > 0.5) {
        float cover = texture2D(ShadowMap, data.xy).a;
        gl_FragColor = vec4(0.0, 0.0, 0.0, cover * color.a);
    } else {
        if (data.w > 0.0 && bayer4(gl_FragCoord.xy) < data.w) {
            discard;
        }
        gl_FragColor = color * texture2D(Texture, uv);
    }
}"#;

fn scene_pipeline() -> PipelineParams {
    PipelineParams {
        color_blend: Some(BlendState::new(
            Equation::Add,
            BlendFactor::Value(BlendValue::SourceAlpha),
            BlendFactor::OneMinusValue(BlendValue::SourceAlpha),
        )),
        alpha_blend: Some(BlendState::new(
            Equation::Add,
            BlendFactor::Zero,
            BlendFactor::One,
        )),
        ..Default::default()
    }
}

/// The scene's material, bound for the whole sorted list and unbound after it.
pub struct SceneMaterial {
    material: Material,
}

impl SceneMaterial {
    /// Loads the material and points it at `shadow_map`.
    pub fn load(shadow_map: &Texture2D) -> Result<Self, String> {
        let backend = unsafe { get_internal_gl().quad_context.info().backend };
        if backend != miniquad::Backend::OpenGl {
            return Err(format!(
                "la escena necesita el backend de OpenGL y este contexto es {backend:?}; \
                 deja `Conf::platform::apple_gfx_api` en su valor por omisión"
            ));
        }
        let material = load_material(
            ShaderSource::Glsl {
                vertex: VERTEX,
                fragment: FRAGMENT,
            },
            MaterialParams {
                pipeline_params: scene_pipeline(),
                textures: vec![SHADOW_MAP.to_owned()],
                ..Default::default()
            },
        )
        .map_err(|error| format!("no se pudo compilar el shader de la escena: {error}"))?;
        material.set_texture(SHADOW_MAP, shadow_map.weak_clone());
        Ok(Self { material })
    }

    /// Draws everything that follows with this material.
    pub fn bind(&self) {
        gl_use_material(&self.material);
    }

    /// Hands drawing back to Macroquad's own pipeline, for the HUD.
    pub fn release(&self) {
        gl_use_default_material();
    }
}

/// One vertex of the scene: a point, where to read the bound texture, a colour, and the two
pub fn vertex(
    position: (f32, f32),
    uv: (f32, f32),
    colour: Color,
    map_uv: (f32, f32),
    kind: f32,
) -> Vertex {
    Vertex {
        position: vec3(position.0, position.1, 0.0),
        uv: vec2(uv.0, uv.1),
        color: colour.into(),
        normal: vec4(map_uv.0, map_uv.1, kind, 0.0),
    }
}

/// How a sprite the player stands behind is thinned out: by the shader's screen-door when the
/// scene material draws it, by plain transparency when it does not.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Veil {
    /// What the vertex colour's alpha is multiplied by.
    pub alpha: f32,
    /// The share of the sprite's pixels the shader drops, carried in `normal.w`.
    pub dither: f32,
}

impl Veil {
    /// The veil that leaves a sprite `opacity` of itself; `dithered` says whether the scene
    /// material is bound to drop the pixels.
    pub fn of(opacity: f32, dithered: bool) -> Self {
        let opacity = if opacity.is_nan() {
            1.0
        } else {
            opacity.clamp(0.0, 1.0)
        };
        if dithered {
            Self {
                alpha: 1.0,
                dither: 1.0 - opacity,
            }
        } else {
            Self {
                alpha: opacity,
                dither: 0.0,
            }
        }
    }

    /// `vertex` with this veil laid over it.
    pub fn over(self, mut vertex: Vertex) -> Vertex {
        vertex.normal.w = self.dither;
        vertex.color[3] = (f32::from(vertex.color[3]) * self.alpha).round() as u8;
        vertex
    }
}

#[cfg(test)]
#[path = "scene_material.test.rs"]
mod tests;
