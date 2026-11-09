//! An offscreen scene pass that is composited before the interface.
//!
//! Its GPU path requires manual verification in native and WASM runs.

use macroquad::prelude::*;

use crate::rendering::grade::{GradeMaterial, PhaseGrade};

/// Converts framebuffer dimensions into valid texture dimensions.
pub fn render_target_size(width: f32, height: f32) -> (u32, u32) {
    let dimension = |value: f32| {
        if !value.is_finite() {
            return 1;
        }
        value.max(1.0).ceil().min(u32::MAX as f32) as u32
    };
    (dimension(width), dimension(height))
}

fn scene_camera(width: f32, height: f32) -> Camera2D {
    Camera2D::from_display_rect(Rect::new(0.0, 0.0, width, height))
}

fn present_params(width: f32, height: f32) -> DrawTextureParams {
    DrawTextureParams {
        dest_size: Some(vec2(width, height)),
        flip_y: true,
        ..Default::default()
    }
}

/// The reusable target that receives the world before it is presented to the framebuffer.
pub struct SceneTarget {
    target: RenderTarget,
    size: (u32, u32),
}

impl SceneTarget {
    /// Allocates a nearest-filtered target for a framebuffer of `width` by `height` pixels.
    pub fn new(width: f32, height: f32) -> Self {
        let size = render_target_size(width, height);
        let target = render_target(size.0, size.1);
        target.texture.set_filter(FilterMode::Nearest);
        Self { target, size }
    }

    /// Reallocates only after the framebuffer's texture dimensions changed.
    pub fn resize(&mut self, width: f32, height: f32) -> bool {
        let size = render_target_size(width, height);
        if size == self.size {
            return false;
        }
        let target = render_target(size.0, size.1);
        target.texture.set_filter(FilterMode::Nearest);
        self.target = target;
        self.size = size;
        true
    }

    /// Directs following scene drawing to this target.
    pub fn begin(&self) {
        let mut camera = scene_camera(screen_width(), screen_height());
        camera.render_target = Some(self.target.clone());
        set_camera(&camera);
    }

    /// Returns to the framebuffer and composites the completed scene at native resolution,
    /// applying `grade` through `material` when the grade shader loaded; untouched otherwise.
    pub fn present(&self, material: Option<&GradeMaterial>, grade: &PhaseGrade) {
        set_default_camera();
        if let Some(material) = material {
            material.bind(grade);
        }
        draw_texture_ex(
            &self.target.texture,
            0.0,
            0.0,
            WHITE,
            present_params(screen_width(), screen_height()),
        );
        if let Some(material) = material {
            material.release();
        }
    }
}

#[cfg(test)]
#[path = "render_target.test.rs"]
mod tests;
