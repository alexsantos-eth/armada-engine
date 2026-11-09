//! Which web route the page is served from, and whether that route shows the overlay.
//!
//! `/` is the clean presentation and paints no GUI at all; `/playground` is the development
//! surface with the overlay the HUD has always drawn. Native builds have no route and keep
//! the historical behaviour. The decision is taken once per process, before the loop starts.

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn iso_route_path(output_ptr: *mut u8, output_capacity: usize) -> isize;
}

/// The path the browser serves the page at, or `None` when it cannot be read.
///
/// The host writes at most `OUTPUT_CAPACITY` bytes and reports how many; the buffer is only
/// read up to that reported length.
#[cfg(target_arch = "wasm32")]
fn browser_path() -> Option<String> {
    const OUTPUT_CAPACITY: usize = 4 * 1024;
    let mut output = Vec::with_capacity(OUTPUT_CAPACITY);
    let length = unsafe { iso_route_path(output.as_mut_ptr(), OUTPUT_CAPACITY) };
    if length < 0 || length as usize > OUTPUT_CAPACITY {
        return None;
    }
    unsafe {
        output.set_len(length as usize);
    }
    String::from_utf8(output).ok()
}

/// The overlay rule: only `/playground`, optionally with a trailing slash, shows the GUI.
#[cfg(any(target_arch = "wasm32", test))]
fn overlay_for_path(path: &str) -> bool {
    path.trim_end_matches('/') == "/playground"
}

/// Whether this route paints the overlay. Native always does; the web build only on `/playground`.
pub(crate) fn overlay_enabled() -> bool {
    #[cfg(target_arch = "wasm32")]
    {
        browser_path().is_some_and(|path| overlay_for_path(&path))
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        true
    }
}

#[cfg(test)]
#[path = "route.test.rs"]
mod tests;
