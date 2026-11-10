//! The grade applied when the offscreen scene is presented, per baked light phase.
//!
//! The scene is composited through a small GLSL material bound only for the presentation quad:
//! it scales the colour (tint), shifts saturation around the luma and lifts the blacks, so the
//! world reads dawn, day, dusk or night while the interface stays untouched on top of it.

use iso::lighting::BakePhase;
use macroquad::prelude::*;
use miniquad::{BlendFactor, BlendState, Equation, PipelineParams};

const VERTEX: &str = r#"#version 100
attribute vec3 position;
attribute vec2 texcoord;

varying lowp vec2 uv;

uniform mat4 Model;
uniform mat4 Projection;

void main() {
    gl_Position = Projection * Model * vec4(position, 1);
    uv = texcoord;
}"#;

const FRAGMENT: &str = r#"#version 100
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying lowp vec2 uv;

uniform sampler2D Texture;
uniform vec4 Tint;
uniform vec4 Lift;
uniform float Saturation;
uniform vec2 TexelSize;
uniform float TiltShiftFocusY;
uniform float TiltShiftSharpHalfHeight;
uniform float TiltShiftTransitionHeight;
uniform float TiltShiftMaxRadius;

float tiltShiftRadius(vec2 point) {
    float distanceFromFocus = abs(point.y - TiltShiftFocusY);
    float transition = smoothstep(
        TiltShiftSharpHalfHeight,
        TiltShiftSharpHalfHeight + TiltShiftTransitionHeight,
        distanceFromFocus
    );
    return transition * TiltShiftMaxRadius;
}

vec3 tiltShiftBlur(vec2 point, float radius) {
    vec2 stepSize = TexelSize * radius;
    vec3 colour = texture2D(Texture, point).rgb * 0.20;
    colour += texture2D(Texture, point + vec2(stepSize.x, 0.0)).rgb * 0.15;
    colour += texture2D(Texture, point - vec2(stepSize.x, 0.0)).rgb * 0.15;
    colour += texture2D(Texture, point + vec2(0.0, stepSize.y)).rgb * 0.15;
    colour += texture2D(Texture, point - vec2(0.0, stepSize.y)).rgb * 0.15;
    colour += texture2D(Texture, point + stepSize).rgb * 0.05;
    colour += texture2D(Texture, point - stepSize).rgb * 0.05;
    colour += texture2D(Texture, point + vec2(stepSize.x, -stepSize.y)).rgb * 0.05;
    colour += texture2D(Texture, point + vec2(-stepSize.x, stepSize.y)).rgb * 0.05;
    return colour;
}

void main() {
    vec3 colour = tiltShiftBlur(uv, tiltShiftRadius(uv));
    float luma = dot(colour, vec3(0.299, 0.587, 0.114));
    colour = mix(vec3(luma), colour, Saturation);
    colour = colour * Tint.rgb + Lift.rgb;
    gl_FragColor = vec4(colour, 1.0);
}"#;

const TILT_SHIFT_FOCUS_Y: f32 = 0.52;
const TILT_SHIFT_SHARP_HALF_HEIGHT: f32 = 0.14;
const TILT_SHIFT_TRANSITION_HEIGHT: f32 = 0.20;
const TILT_SHIFT_MAX_RADIUS_PX: f32 = 3.0;

#[cfg(test)]
fn tilt_shift_radius(y: f32) -> f32 {
    let edge = (y - TILT_SHIFT_FOCUS_Y).abs() - TILT_SHIFT_SHARP_HALF_HEIGHT;
    let amount = (edge / TILT_SHIFT_TRANSITION_HEIGHT).clamp(0.0, 1.0);
    let smooth = amount * amount * (3.0 - 2.0 * amount);
    smooth * TILT_SHIFT_MAX_RADIUS_PX
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
        let material = load_material(
            ShaderSource::Glsl {
                vertex: VERTEX,
                fragment: FRAGMENT,
            },
            MaterialParams {
                pipeline_params: grade_pipeline(),
                uniforms: vec![
                    UniformDesc::new("Tint", UniformType::Float4),
                    UniformDesc::new("Lift", UniformType::Float4),
                    UniformDesc::new("Saturation", UniformType::Float1),
                    UniformDesc::new("TexelSize", UniformType::Float2),
                    UniformDesc::new("TiltShiftFocusY", UniformType::Float1),
                    UniformDesc::new("TiltShiftSharpHalfHeight", UniformType::Float1),
                    UniformDesc::new("TiltShiftTransitionHeight", UniformType::Float1),
                    UniformDesc::new("TiltShiftMaxRadius", UniformType::Float1),
                ],
                ..Default::default()
            },
        )
        .map_err(|error| format!("no se pudo compilar el shader de grado de la escena: {error}"))?;
        Ok(Self { material })
    }

    /// Applies the presentation uniforms and draws what follows with this material.
    pub fn bind(&self, grade: &PhaseGrade, texel_size: Vec2) {
        self.material
            .set_uniform("Tint", vec4(grade.tint.r, grade.tint.g, grade.tint.b, 1.0));
        self.material
            .set_uniform("Lift", vec4(grade.lift.r, grade.lift.g, grade.lift.b, 0.0));
        self.material.set_uniform("Saturation", grade.saturation);
        self.material.set_uniform("TexelSize", texel_size);
        self.material
            .set_uniform("TiltShiftFocusY", TILT_SHIFT_FOCUS_Y);
        self.material
            .set_uniform("TiltShiftSharpHalfHeight", TILT_SHIFT_SHARP_HALF_HEIGHT);
        self.material
            .set_uniform("TiltShiftTransitionHeight", TILT_SHIFT_TRANSITION_HEIGHT);
        self.material
            .set_uniform("TiltShiftMaxRadius", TILT_SHIFT_MAX_RADIUS_PX);
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
