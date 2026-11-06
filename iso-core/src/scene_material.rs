//! The one shader the whole scene is drawn with.
//!
//! Macroquad starts a new draw call whenever the bound texture **or the pipeline** changes
//! (`QuadGl::geometry` compares both), and a ground shadow sits between the block it lies on and
//! the next one. So a material used for the shadows alone would break the batch at every shadow,
//! which is the very thing [`crate::shadow_view::atlas`] exists to avoid. One material draws
//! everything instead, and each vertex says what it is.
//!
//! **What a vertex carries.** Macroquad's vertex layout is `position`, `texcoord`, `color0` and
//! `normal`, and it never reads `normal` itself — its own documentation calls it free user data.
//! That is sixteen bytes a vertex this scene used to upload for nothing, and it is exactly what
//! a shadow needs:
//!
//! * `normal.xy` — where to read the shadow atlas, in its own texture coordinates.
//! * `normal.z` — [`SPRITE`] for artwork out of the bound texture, [`SHADOW`] for coverage out
//!   of the shadow atlas.
//!
//! **Backends.** The client runs the OpenGL backend everywhere it ships: Miniquad defaults
//! macOS to GL, the web is GL, and `window_conf` does not ask for anything else. There is no
//! Metal source here rather than an unverified one, so [`SceneMaterial::load`] refuses a Metal
//! context and says why; the client then runs without baked shadows instead of drawing them
//! wrong.

use macroquad::prelude::*;
use miniquad::{BlendFactor, BlendState, BlendValue, Equation, PipelineParams};

/// `normal.z` of a vertex drawn from the bound texture, which is every sprite.
pub const SPRITE: f32 = 0.0;

/// `normal.z` of a vertex whose colour is coverage read from the shadow atlas.
pub const SHADOW: f32 = 1.0;

/// The name the shader gives the shadow atlas. `Texture` and `_ScreenTexture` are Macroquad's
/// own and cannot be reused.
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

// `data` holds a coordinate into an atlas a few thousand texels across, so it is the one varying
// that needs the precision: at mediump its ten relative bits are a few texels of slop. Every
// context this ships on offers high precision in the fragment stage; the guard is there so a
// context that does not degrades instead of failing to compile.
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

void main() {
    if (data.z > 0.5) {
        // A shadow is flat black at the coverage its own square of the map carries, scaled by
        // the lighting phase's opacity, which rides in the vertex colour's alpha.
        float cover = texture2D(ShadowMap, data.xy).a;
        gl_FragColor = vec4(0.0, 0.0, 0.0, cover * color.a);
    } else {
        gl_FragColor = color * texture2D(Texture, uv);
    }
}"#;

/// The scene's material, bound for the whole sorted list and unbound after it.
pub struct SceneMaterial {
    material: Material,
}

impl SceneMaterial {
    /// Loads the material and points it at `shadow_map`.
    ///
    /// `Err` with a reason the client can print: a Metal context, or a shader that would not
    /// compile. Either way the caller carries on without baked shadows.
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
                // The same blend Macroquad gives its own pipelines. Without it every sprite
                // draws its transparent border as opaque black.
                pipeline_params: PipelineParams {
                    color_blend: Some(BlendState::new(
                        Equation::Add,
                        BlendFactor::Value(BlendValue::SourceAlpha),
                        BlendFactor::OneMinusValue(BlendValue::SourceAlpha),
                    )),
                    ..Default::default()
                },
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
/// things [`SceneMaterial`] reads out of `normal`.
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

#[cfg(test)]
#[path = "scene_material.test.rs"]
mod tests;
