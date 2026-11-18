//! The lens of the miniature look: a disc bokeh, the micro-contrast of the focus and a vignette.
//!
//! The presentation pass includes [`lens_glsl`]: [`BOKEH_TAPS`] taps on a Vogel spiral (golden
//! angle, equal-area radii) blur with a round kernel, so the corners of an out-of-focus block go
//! round like clay instead of washing out; bright taps weigh more, so highlights keep their disc.
//! Where the scene is in focus an unsharp mask deepens the creases between voxels, saturation and
//! contrast rise a little, and a soft vignette draws the eye to the middle. The shader half is
//! checked by eye with `armada-visual-check`; its arithmetic is mirrored in `lens.test.rs`.

/// How many taps the bokeh disc reads.
pub const BOKEH_TAPS: usize = 16;

/// The turn between consecutive Vogel taps, in radians: `π (3 − √5)`.
pub const GOLDEN_ANGLE: f32 = 2.399_963;

/// How much more a fully bright tap weighs in the bokeh than a black one (`1 + k·luma⁴`).
pub const BOKEH_HIGHLIGHT: f32 = 2.0;

/// The strength of the unsharp mask laid over what is in focus.
pub const MICRO_CONTRAST: f32 = 0.35;

/// Saturation added everywhere, as a share of the source.
pub const SCENE_SATURATION: f32 = 0.0;

/// Saturation added on top where the scene is perfectly sharp.
pub const FOCUS_SATURATION: f32 = 0.02;

/// Contrast added everywhere, around mid grey.
pub const SCENE_CONTRAST: f32 = 0.0;

/// Contrast added on top where the scene is perfectly sharp.
pub const FOCUS_CONTRAST: f32 = 0.02;

/// How far from the centre (0) to a corner (1) the vignette starts.
pub const VIGNETTE_START: f32 = 0.55;

/// How much the vignette darkens the very corners.
pub const VIGNETTE_STRENGTH: f32 = 0.14;

/// The `count` taps of a Vogel spiral over the unit disc: tap `i` at radius `√((i + ½) / n)`,
/// turned `i` golden angles.
pub fn vogel_offsets(count: usize) -> Vec<(f32, f32)> {
    (0..count)
        .map(|i| {
            let radius = ((i as f32 + 0.5) / count as f32).sqrt();
            let theta = i as f32 * GOLDEN_ANGLE;
            (theta.cos() * radius, theta.sin() * radius)
        })
        .collect()
}

/// `value` written as a GLSL float literal.
pub fn glsl_float(value: f32) -> String {
    format!("{value:?}")
}

/// The GLSL the presentation includes: `bokeh`, `microContrast`, `lensTone` and `vignette`.
pub fn lens_glsl() -> String {
    let f = glsl_float;
    let taps: String = vogel_offsets(BOKEH_TAPS)
        .iter()
        .map(|(x, y)| {
            format!(
                "    bokehTap(point, vec2({}, {}) * scale, sum);\n",
                f(*x),
                f(*y)
            )
        })
        .collect();
    format!(
        r#"
void bokehTap(vec2 point, vec2 offset, inout vec4 sum) {{
    vec3 tap = texture2D(Texture, point + offset).rgb;
    float luma = dot(tap, vec3(0.299, 0.587, 0.114));
    float weight = 1.0 + {highlight} * luma * luma * luma * luma;
    sum += vec4(tap * weight, weight);
}}

vec3 bokeh(vec2 point, float radius) {{
    if (radius < 0.05) {{
        return texture2D(Texture, point).rgb;
    }}
    vec2 scale = TexelSize * radius;
    vec4 sum = vec4(0.0);
{taps}    return sum.rgb / sum.a;
}}

vec3 microContrast(vec3 colour, vec2 point, float focus) {{
    vec3 around = texture2D(Texture, point + vec2(TexelSize.x, 0.0)).rgb;
    around += texture2D(Texture, point - vec2(TexelSize.x, 0.0)).rgb;
    around += texture2D(Texture, point + vec2(0.0, TexelSize.y)).rgb;
    around += texture2D(Texture, point - vec2(0.0, TexelSize.y)).rgb;
    return colour + (colour - around * 0.25) * {micro} * focus;
}}

vec3 lensTone(vec3 colour, float focus) {{
    float luma = dot(colour, vec3(0.299, 0.587, 0.114));
    colour = mix(vec3(luma), colour, 1.0 + {scene_sat} + {focus_sat} * focus);
    return (colour - 0.5) * (1.0 + {scene_con} + {focus_con} * focus) + 0.5;
}}

float vignette(vec2 point) {{
    float reach = length(point - 0.5) * 1.41421356;
    return 1.0 - {vig_strength} * smoothstep({vig_start}, 1.0, reach);
}}
"#,
        highlight = f(BOKEH_HIGHLIGHT),
        micro = f(MICRO_CONTRAST),
        scene_sat = f(SCENE_SATURATION),
        focus_sat = f(FOCUS_SATURATION),
        scene_con = f(SCENE_CONTRAST),
        focus_con = f(FOCUS_CONTRAST),
        vig_strength = f(VIGNETTE_STRENGTH),
        vig_start = f(VIGNETTE_START),
    )
}

#[cfg(test)]
#[path = "lens.test.rs"]
mod tests;
