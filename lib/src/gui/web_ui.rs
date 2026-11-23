//! The bridge to the HTML HUD of the web build (`web/ui/armada-ui.js`): the client sends it the
//! hotbar, the gather prompt and each gain as JSON, and reads back whether its action button is
//! held. Outside the browser, or on a page without the kit, it is inactive and the client paints
//! its own hotbar.

use serde::Serialize;

/// One stack in a slot, as the kit shows it.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct UiStack {
    pub(crate) item: String,
    pub(crate) name: String,
    pub(crate) count: u32,
}

/// The gather prompt: what is in reach, the verb and tool on the action button, the share of the
/// work done while it is under way, and whether a missing tool blocks it.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct UiPrompt {
    pub(crate) text: String,
    pub(crate) verb: &'static str,
    pub(crate) tool: &'static str,
    pub(crate) progress: Option<f32>,
    pub(crate) blocked: bool,
}

/// What the HUD shows this frame.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct UiFrame {
    pub(crate) visible: bool,
    pub(crate) touch: bool,
    pub(crate) slots: Vec<Option<UiStack>>,
    pub(crate) prompt: Option<UiPrompt>,
    pub(crate) note: Option<String>,
}

/// One pick-up: what and how much, and where it starts its flight, as shares of the screen.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct UiGain {
    pub(crate) item: String,
    pub(crate) name: String,
    pub(crate) amount: u32,
    pub(crate) x: f32,
    pub(crate) y: f32,
}

#[derive(Serialize)]
struct Message<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    frame: Option<&'a UiFrame>,
    gains: &'a [UiGain],
}

/// Remembers the last frame sent, so an unchanged HUD costs nothing.
#[derive(Debug, Default)]
pub(crate) struct WebUi {
    last_frame: Option<UiFrame>,
}

impl WebUi {
    /// The JSON for this frame: the frame when it changed since the last message, and every
    /// gain; `None` when there is nothing new.
    pub(crate) fn message(&mut self, frame: &UiFrame, gains: &[UiGain]) -> Option<String> {
        let changed = self.last_frame.as_ref() != Some(frame);
        if !changed && gains.is_empty() {
            return None;
        }
        if changed {
            self.last_frame = Some(frame.clone());
        }
        serde_json::to_string(&Message {
            frame: changed.then_some(frame),
            gains,
        })
        .ok()
    }

    /// Sends this frame's message to the page, if there is one.
    pub(crate) fn send(&mut self, frame: &UiFrame, gains: &[UiGain]) {
        if let Some(message) = self.message(frame, gains) {
            push(&message);
        }
    }
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn iso_ui_active() -> i32;
    fn iso_ui_push(message_ptr: *const u8, message_length: usize);
    fn iso_ui_gather_held() -> i32;
}

/// Whether the page hosts the HTML HUD.
#[cfg(target_arch = "wasm32")]
pub(crate) fn active() -> bool {
    unsafe { iso_ui_active() == 1 }
}

/// Whether the HUD's action button is held down.
#[cfg(target_arch = "wasm32")]
pub(crate) fn gather_held() -> bool {
    unsafe { iso_ui_gather_held() == 1 }
}

#[cfg(target_arch = "wasm32")]
fn push(message: &str) {
    unsafe { iso_ui_push(message.as_ptr(), message.len()) }
}

/// Whether the page hosts the HTML HUD: never outside the browser.
#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn active() -> bool {
    false
}

/// Whether the HUD's action button is held down: never outside the browser.
#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn gather_held() -> bool {
    false
}

#[cfg(not(target_arch = "wasm32"))]
fn push(_message: &str) {}

#[cfg(test)]
#[path = "web_ui.test.rs"]
mod tests;
