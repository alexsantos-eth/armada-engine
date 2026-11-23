//! What the HUD shows each frame and what was picked up: the data `harvest::hud_frame` builds
//! from the game and `ClayHud` and `draw_clay_hud` animate and paint.

/// One stack in a slot, as the kit shows it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiStack {
    pub(crate) item: String,
    pub(crate) name: String,
    pub(crate) count: u32,
}

/// The gather prompt: what is in reach, the verb and tool on the action button, the share of the
/// work done while it is under way, and whether a missing tool blocks it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiPrompt {
    pub(crate) text: String,
    pub(crate) verb: &'static str,
    pub(crate) tool: &'static str,
    pub(crate) progress: Option<f32>,
    pub(crate) blocked: bool,
}

/// What the HUD shows this frame.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiFrame {
    pub(crate) visible: bool,
    pub(crate) touch: bool,
    pub(crate) slots: Vec<Option<UiStack>>,
    pub(crate) prompt: Option<UiPrompt>,
    pub(crate) note: Option<String>,
}

/// One pick-up: what and how much, and where it starts its flight, as shares of the screen.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiGain {
    pub(crate) item: String,
    pub(crate) name: String,
    pub(crate) amount: u32,
    pub(crate) x: f32,
    pub(crate) y: f32,
}
