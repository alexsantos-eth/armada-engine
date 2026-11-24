//! Haptic feedback helpers for the web build.

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn iso_vibrate(duration_ms: i32) -> i32;
}

#[allow(dead_code)]
/// Triggers a haptic pulse of `duration_ms` milliseconds (web only; no-op natively).
pub fn vibrate(duration_ms: u32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        let _ = iso_vibrate(duration_ms as i32);
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = duration_ms;
    }
}

#[allow(dead_code)]
/// Triggers the default haptic pulse.
pub fn pulse() {
    vibrate(10);
}

// MacroquadHaptic is available via crate::services.
