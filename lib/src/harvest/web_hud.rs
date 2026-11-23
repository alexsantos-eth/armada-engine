//! What the HTML HUD is told about the harvest: the slots, the prompt with its verb and tool,
//! the full-inventory note and each pick-up with the point it flies from. Pure; tested in
//! `web_hud.test.rs`.

use crate::gui::web_ui::{UiFrame, UiGain, UiPrompt, UiStack};
use iso::harvest::HarvestStatus;
use iso::inventory::Carried;
use iso::items::{HarvestYield, ItemCatalog, ToolKind};

/// The verb on the action button and the tool icon it shows, for what a target needs.
const fn action_of(tool: Option<ToolKind>) -> (&'static str, &'static str) {
    match tool {
        Some(ToolKind::Axe) => ("Talar", "axe"),
        Some(ToolKind::Pickaxe) => ("Picar", "pickaxe"),
        Some(ToolKind::Net) => ("Atrapar", "net"),
        None => ("Recoger", "hand"),
    }
}

fn item_name(item: &str, items: &ItemCatalog) -> String {
    items
        .item(item)
        .map_or_else(|| item.to_owned(), |def| def.name.clone())
}

fn prompt_of(status: &HarvestStatus, items: &ItemCatalog) -> Option<UiPrompt> {
    let target = status.target()?;
    let rule = items.harvest_rule(&target.blueprint);
    let (verb, tool) = action_of(rule.and_then(|rule| rule.tool));
    let name = rule
        .and_then(|rule| rule.yields.first())
        .map(|first| item_name(&first.item, items))
        .unwrap_or_default();
    match status {
        HarvestStatus::Idle | HarvestStatus::Done { .. } => None,
        HarvestStatus::Ready { .. } | HarvestStatus::Approaching { .. } => Some(UiPrompt {
            text: name,
            verb,
            tool,
            progress: None,
            blocked: false,
        }),
        HarvestStatus::Working {
            progress, total, ..
        } => Some(UiPrompt {
            text: name,
            verb,
            tool,
            progress: Some((*progress as f32 / (*total).max(1) as f32 * 100.0).round() / 100.0),
            blocked: false,
        }),
        HarvestStatus::Blocked { .. } => Some(UiPrompt {
            text: crate::harvest::hotbar::prompt(status, items)?.text,
            verb,
            tool,
            progress: None,
            blocked: true,
        }),
    }
}

/// The HUD frame for what the player carries, the harvest's `status`, the hotbar's `note` (only
/// the full-inventory one goes out: gains have their own bubble) and whether the touch controls
/// are on screen.
pub(crate) fn hud_frame(
    carried: &Carried,
    items: &ItemCatalog,
    status: &HarvestStatus,
    note: Option<&str>,
    touch: bool,
) -> UiFrame {
    UiFrame {
        visible: true,
        touch,
        slots: carried
            .inventory
            .slots()
            .iter()
            .map(|slot| {
                slot.as_ref().map(|stack| UiStack {
                    item: stack.item.clone(),
                    name: item_name(&stack.item, items),
                    count: stack.count,
                })
            })
            .collect(),
        prompt: prompt_of(status, items),
        note: note
            .filter(|text| *text == crate::harvest::hotbar::FULL_NOTE)
            .map(str::to_owned),
    }
}

/// One flying gain per yield picked up, starting at `at` (shares of the screen).
pub(crate) fn gains(yields: &[HarvestYield], items: &ItemCatalog, at: (f32, f32)) -> Vec<UiGain> {
    yields
        .iter()
        .map(|y| UiGain {
            item: y.item.clone(),
            name: item_name(&y.item, items),
            amount: y.amount,
            x: at.0,
            y: at.1,
        })
        .collect()
}

/// A screen point as shares of a `width` × `height` screen, clamped to it; the middle when the
/// screen has no size.
pub(crate) fn screen_share(x: f64, y: f64, width: f32, height: f32) -> (f32, f32) {
    if width <= 0.0 || height <= 0.0 {
        return (0.5, 0.5);
    }
    (
        (x as f32 / width).clamp(0.0, 1.0),
        (y as f32 / height).clamp(0.0, 1.0),
    )
}

#[cfg(test)]
#[path = "web_hud.test.rs"]
mod tests;
