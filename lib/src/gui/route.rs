//! Which web route the page is served from, and what that route runs.
//!
//! `/` is the clean presentation and paints no GUI at all; `/playground` is the development
//! surface with the overlay the HUD has always drawn; `/maker` is the world editor, which
//! paints the overlay and edits one chunk instead of streaming the procedural world. The
//! native build has no route and takes it from its arguments (`--maker`, `--plain`). The
//! decision is taken once per process, before the loop starts.

/// What this process runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Route {
    /// The game as it is presented: no overlay.
    Plain,
    /// The development surface: the overlay over the streamed world.
    Playground,
    /// The world editor over one flat chunk.
    Maker,
}

impl Route {
    /// Whether this route paints the overlay.
    pub(crate) fn shows_overlay(self) -> bool {
        matches!(self, Self::Playground | Self::Maker)
    }

    /// Whether this route lets the player strap a jetpack on. It is a development option, so
    /// only the surfaces that paint the overlay offer it; the plain presentation never does.
    pub(crate) fn allows_jetpack(self) -> bool {
        matches!(self, Self::Playground | Self::Maker)
    }

    /// Whether this route edits one chunk by hand instead of streaming the world.
    pub(crate) fn edits_the_world(self) -> bool {
        matches!(self, Self::Maker)
    }
}

/// The argument that opens the editor on a native build.
#[cfg(any(not(target_arch = "wasm32"), test))]
const MAKER_FLAG: &str = "--maker";
/// The argument that runs a native build as the game is presented, with no overlay.
#[cfg(any(not(target_arch = "wasm32"), test))]
const PLAIN_FLAG: &str = "--plain";

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

/// The route rule: `/playground` is the development surface, `/maker` the editor, optionally
/// with a trailing slash; everything else is the plain presentation.
#[cfg(any(target_arch = "wasm32", test))]
fn route_for_path(path: &str) -> Route {
    match path.trim_end_matches('/') {
        "/playground" => Route::Playground,
        "/maker" => Route::Maker,
        _ => Route::Plain,
    }
}

/// The route a native run takes: the playground, unless its arguments ask for the editor or
/// for the game as it is presented.
#[cfg(any(not(target_arch = "wasm32"), test))]
fn native_route<'a>(arguments: impl Iterator<Item = &'a String>) -> Route {
    let mut route = Route::Playground;
    for argument in arguments {
        if argument == MAKER_FLAG {
            route = Route::Maker;
        }
        if argument == PLAIN_FLAG {
            route = Route::Plain;
        }
    }
    route
}

/// The route this process runs: the page's path on the web, the arguments natively.
pub(crate) fn current() -> Route {
    #[cfg(target_arch = "wasm32")]
    {
        browser_path().map_or(Route::Plain, |path| route_for_path(&path))
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        native_route(std::env::args().collect::<Vec<String>>().iter())
    }
}

#[cfg(test)]
#[path = "route.test.rs"]
mod tests;
