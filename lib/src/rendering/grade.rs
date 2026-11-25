//! The grade applied when the offscreen scene is presented, per baked light phase.
//!
//! The scene is composited through a small GLSL material bound only for the presentation quad:
//! it scales the colour (tint), shifts saturation around the luma and lifts the blacks, so the
//! world reads dawn, day, dusk or night while the interface stays untouched on top of it.

use iso::lighting::BakePhase;
use macroquad::prelude::*;
use miniquad::{BlendFactor, BlendState, Equation, PipelineParams};

use crate::game::config::PHASE_TRANSITION_SECONDS;
use crate::rendering::depth_of_field::{
    DEPTH_MAP, FOCAL_HALF_HEIGHT, GRADE_DEPTH_GLSL, MAX_BLUR_RADIUS_PX, TRANSITION_HEIGHT,
};
use crate::rendering::lens::lens_glsl;

const VERTEX: &str = r#"#version 100
attribute vec3 position;
attribute vec2 texcoord;

#ifdef GL_FRAGMENT_PRECISION_HIGH
varying highp vec2 uv;
#else
varying mediump vec2 uv;
#endif

uniform mat4 Model;
uniform mat4 Projection;

void main() {
    gl_Position = Projection * Model * vec4(position, 1);
    uv = texcoord;
}"#;

const FRAGMENT_HEAD: &str = r#"#version 100
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#ifdef GL_FRAGMENT_PRECISION_HIGH
varying highp vec2 uv;
#else
varying mediump vec2 uv;
#endif

uniform sampler2D Texture;
uniform vec4 Tint;
uniform vec4 Lift;
uniform float Saturation;
uniform vec2 TexelSize;
uniform float MenuBlur;
"#;

const FRAGMENT_BODY: &str = r#"
void main() {
    float radius = max(blurRadius(uv), MenuBlur);
    float focus = max(1.0 - radius / MaxBlurRadius, 0.0);
    vec3 colour = bokeh(uv, radius);
    colour = lensTone(colour, focus);
    float luma = dot(colour, vec3(0.299, 0.587, 0.114));
    colour = mix(vec3(luma), colour, Saturation);
    colour = colour * Tint.rgb * vignette(uv) + Lift.rgb;
    gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}"#;

/// The grade's fragment shader: its head, the depth-of-field reader, the lens and its body.
fn fragment() -> String {
    format!(
        "{FRAGMENT_HEAD}{GRADE_DEPTH_GLSL}{}{FRAGMENT_BODY}",
        lens_glsl()
    )
}

fn grade_pipeline() -> PipelineParams {
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

/// How one phase's presentation reads: the multiplier on the scene, the saturation shift around
/// the luma, and the floor added to the blacks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PhaseGrade {
    /// Multiplied into every scene texel. Day is the identity.
    pub tint: Color,
    /// Saturation around the Rec. 601 luma; `1.0` keeps the source, `0.0` is greyscale.
    pub saturation: f32,
    /// Additive floor added to every channel, keeping the night from reading as a void.
    pub lift: Color,
}

fn ease(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

fn lerp_channel(from: f32, to: f32, t: f32) -> f32 {
    from + (to - from) * t
}

fn lerp_colour(from: Color, to: Color, t: f32) -> Color {
    Color::new(
        lerp_channel(from.r, to.r, t),
        lerp_channel(from.g, to.g, t),
        lerp_channel(from.b, to.b, t),
        lerp_channel(from.a, to.a, t),
    )
}

/// The blend between two phases' grades at `t` of the crossfade, per channel.
pub fn lerp_grade(from: PhaseGrade, to: PhaseGrade, t: f32) -> PhaseGrade {
    let t = t.clamp(0.0, 1.0);
    PhaseGrade {
        tint: lerp_colour(from.tint, to.tint, t),
        saturation: lerp_channel(from.saturation, to.saturation, t),
        lift: lerp_colour(from.lift, to.lift, t),
    }
}

/// The crossfade between the presented grade and the one the world wants now.
///
/// The phase buttons rebake the shadows behind an untouched scene; presenting the grade of the
/// selected phase straight away would cut the whole world warm or cold in a single frame. This
/// keeps the presentation continuous instead: retargeting a settled transition restarts the
/// crossfade from whatever grade is on screen.
pub struct GradeTransition {
    current: PhaseGrade,
    from: PhaseGrade,
    to: PhaseGrade,
    elapsed: f32,
}

impl GradeTransition {
    /// A settled transition displaying `grade`.
    pub fn new(grade: PhaseGrade) -> Self {
        Self {
            current: grade,
            from: grade,
            to: grade,
            elapsed: PHASE_TRANSITION_SECONDS,
        }
    }

    /// Points the transition at `grade`; re-selecting the grade it already wants changes nothing.
    pub fn set_target(&mut self, grade: PhaseGrade) {
        if grade == self.to {
            return;
        }
        self.from = self.current;
        self.to = grade;
        self.elapsed = 0.0;
    }

    /// Advances the crossfade by `dt` seconds and returns the grade to present.
    pub fn advance(&mut self, dt: f32) -> PhaseGrade {
        if self.elapsed >= PHASE_TRANSITION_SECONDS {
            return self.current;
        }
        self.elapsed = (self.elapsed + dt.max(0.0)).min(PHASE_TRANSITION_SECONDS);
        if self.elapsed >= PHASE_TRANSITION_SECONDS {
            self.current = self.to;
            return self.current;
        }
        let t = ease(self.elapsed / PHASE_TRANSITION_SECONDS);
        self.current = lerp_grade(self.from, self.to, t);
        self.current
    }
}

/// Sunrise: the warm, low sun of a scene baked for `BakePhase::Dawn`.
pub const DAWN_GRADE: PhaseGrade = PhaseGrade {
    tint: Color::new(1.0, 0.86, 0.7, 1.0),
    saturation: 1.0,
    lift: Color::new(0.0, 0.0, 0.0, 1.0),
};

/// Midday: the scene untouched.
pub const DAY_GRADE: PhaseGrade = PhaseGrade {
    tint: Color::new(1.0, 1.0, 1.0, 1.0),
    saturation: 1.0,
    lift: Color::new(0.0, 0.0, 0.0, 1.0),
};

/// Sunset: the amber hour, punchier than dawn.
pub const SUNSET_GRADE: PhaseGrade = PhaseGrade {
    tint: Color::new(1.0, 0.7, 0.45, 1.0),
    saturation: 1.1,
    lift: Color::new(0.0, 0.0, 0.0, 1.0),
};

/// Night: the moonlit scene, cool, desaturated and with lifted blacks.
pub const NIGHT_GRADE: PhaseGrade = PhaseGrade {
    tint: Color::new(0.38, 0.48, 0.78, 1.0),
    saturation: 0.75,
    lift: Color::new(0.012, 0.018, 0.045, 1.0),
};

/// The grade a baked phase presents with.
pub fn grade_for(phase: BakePhase) -> PhaseGrade {
    match phase {
        BakePhase::Dawn => DAWN_GRADE,
        BakePhase::Day => DAY_GRADE,
        BakePhase::Sunset => SUNSET_GRADE,
        BakePhase::Night => NIGHT_GRADE,
    }
}

/// The presentation material: one fullscreen pass that grades the finished scene.
pub struct GradeMaterial {
    material: Material,
}

impl GradeMaterial {
    /// Loads the material; fails the same way the scene's one does when the context has no OpenGL.
    pub fn load() -> Result<Self, String> {
        let backend = unsafe { get_internal_gl().quad_context.info().backend };
        if backend != miniquad::Backend::OpenGl {
            return Err(format!(
                "el grado de la escena necesita el backend de OpenGL y este contexto es {backend:?}"
            ));
        }
        let fragment = fragment();
        let material = load_material(
            ShaderSource::Glsl {
                vertex: VERTEX,
                fragment: &fragment,
            },
            MaterialParams {
                pipeline_params: grade_pipeline(),
                uniforms: vec![
                    UniformDesc::new("Tint", UniformType::Float4),
                    UniformDesc::new("Lift", UniformType::Float4),
                    UniformDesc::new("Saturation", UniformType::Float1),
                    UniformDesc::new("TexelSize", UniformType::Float2),
                    UniformDesc::new("FocusDepth", UniformType::Float1),
                    UniformDesc::new("FocalHalfHeight", UniformType::Float1),
                    UniformDesc::new("TransitionHeight", UniformType::Float1),
                    UniformDesc::new("MaxBlurRadius", UniformType::Float1),
                    UniformDesc::new("MenuBlur", UniformType::Float1),
                ],
                textures: vec![DEPTH_MAP.to_owned()],
            },
        )
        .map_err(|error| format!("no se pudo compilar el shader de grado de la escena: {error}"))?;
        Ok(Self { material })
    }

    /// Applies the presentation uniforms, with the depth of field focused at `focus` over
    /// `depth` and everything blurred at least `menu_blur` pixels (an open menu's backdrop), and draws what follows with this material.
    pub fn bind(
        &self,
        grade: &PhaseGrade,
        texel_size: Vec2,
        depth: &Texture2D,
        (focus, menu_blur): (f32, f32),
    ) {
        self.material
            .set_uniform("Tint", vec4(grade.tint.r, grade.tint.g, grade.tint.b, 1.0));
        self.material
            .set_uniform("Lift", vec4(grade.lift.r, grade.lift.g, grade.lift.b, 0.0));
        self.material.set_uniform("Saturation", grade.saturation);
        self.material.set_uniform("TexelSize", texel_size);
        self.material.set_uniform("FocusDepth", focus);
        self.material.set_uniform("MenuBlur", menu_blur);
        self.material
            .set_uniform("FocalHalfHeight", FOCAL_HALF_HEIGHT);
        self.material
            .set_uniform("TransitionHeight", TRANSITION_HEIGHT);
        self.material
            .set_uniform("MaxBlurRadius", MAX_BLUR_RADIUS_PX);
        self.material.set_texture(DEPTH_MAP, depth.weak_clone());
        gl_use_material(&self.material);
    }

    /// Hands drawing back to Macroquad's own pipeline, for the interface.
    pub fn release(&self) {
        gl_use_default_material();
    }
}

#[cfg(test)]
#[path = "grade.test.rs"]
mod tests;
