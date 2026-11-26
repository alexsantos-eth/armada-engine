//! What the HUD shows each frame and what was picked up: the data `harvest::hud_frame` builds
//! from the game and `ClayHud` and `draw_clay_hud` animates and paints.

/// One stack in a slot, as the kit shows it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiStack {
    pub(crate) item: String,
    pub(crate) name: String,
    pub(crate) count: u32,
}

/// The desktop action button: the tool and the verb of holding it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiAction {
    pub(crate) tool: String,
    pub(crate) verb: String,
}

/// One tool the player owns, as the mobile inventory lists it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiTool {
    /// The kit piece that draws it (`tool_axe`…).
    pub(crate) piece: String,
    pub(crate) name: String,
    pub(crate) tier: u8,
    /// How many of it are carried.
    pub(crate) count: u32,
}

/// What the HUD shows this frame.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiFrame {
    pub(crate) visible: bool,
    pub(crate) touch: bool,
    pub(crate) slots: Vec<Option<UiStack>>,
    /// The tools the player owns.
    pub(crate) tools: Vec<UiTool>,
    /// The share of work done while the harvest is under way (0–1).
    pub(crate) progress: Option<f32>,
    /// The screen point above the player the progress sits at.
    pub(crate) progress_at: Option<(f32, f32)>,
    /// The name of the entity the progress belongs to.
    pub(crate) progress_name: Option<String>,
    /// The desktop action button when a target is ready.
    pub(crate) action: Option<UiAction>,
    pub(crate) note: Option<String>,
}

/// The units picked up into one slot, with their flight origin as shares of the screen.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UiGain {
    pub(crate) slot: usize,
    pub(crate) item: String,
    pub(crate) name: String,
    pub(crate) amount: u32,
    pub(crate) x: f32,
    pub(crate) y: f32,
}

/// What the open shop shows this frame.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ShopFrame {
    /// What the money is called, plural.
    pub(crate) currency: String,
    pub(crate) coins: u64,
    pub(crate) tab: crate::shop::Tab,
    pub(crate) cursor: usize,
    pub(crate) rows: Vec<crate::shop::ShopRow>,
}
