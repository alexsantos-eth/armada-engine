//! The platform hint for touch controls: whether the primary pointer is coarse.
//!
//! The web build asks the browser through the `iso_pointer_coarse` import (the
//! same FFI pattern as `gui::route` and `save::persistence`); native builds
//! report `false` and reveal the controls on the first touch instead.

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn iso_pointer_coarse() -> i32;
}

/// Whether the platform's primary pointer is coarse (touch-first device).
pub(crate) fn coarse_pointer() -> bool {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { iso_pointer_coarse() != 0 }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(not(target_arch = "wasm32"))]
    fn native_builds_report_a_fine_pointer() {
        assert!(!super::coarse_pointer());
    }
}
