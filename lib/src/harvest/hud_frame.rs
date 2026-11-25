//! What the HUD is told about the harvest: the slots, the work progress while it is under way
//! and where it sits (above the player), the desktop action button and the full-inventory note.
//! Pure; tested in `hud_frame.test.rs`.

use crate::ui::{UiAction, UiFrame, UiGain, UiStack};
use iso::drops::StackGain;
use iso::harvest::{HarvestStatus, HarvestTarget};
use iso::inventory::Carried;
use iso::items::{ItemCatalog, ToolKind};

/// The tool and the verb of holding a blueprint's harvest.
fn action_of(blueprint: &str, items: &ItemCatalog) -> UiAction {
    let tool = items.harvest_rule(blueprint).and_then(|rule| rule.tool);
    let (verb, tool_name) = match tool {
        Some(ToolKind::Axe) => ("Talar", "axe"),
        Some(ToolKind::Pickaxe) => ("Picar", "pickaxe"),
        Some(ToolKind::Net) => ("Atrapar", "net"),
        None => ("Recoger", "hand"),
    };
    UiAction {
        tool: tool_name.into(),
        verb: verb.into(),
    }
}

/// The button next to a market: the hand and the verb of opening the shop.
fn trade_action() -> UiAction {
    UiAction {
        tool: "hand".into(),
        verb: "Comerciar".into(),
    }
}

/// The name of what the harvest yields: the first yield's item, as the catalog names it.
fn yield_name(target: &HarvestTarget, items: &ItemCatalog) -> Option<String> {
    items
        .harvest_rule(&target.blueprint)
        .and_then(|rule| rule.yields.first())
        .and_then(|yielded| items.item(&yielded.item))
        .map(|def| def.name.clone())
}

/// The HUD frame for what the player carries, the harvest's `status`, the hotbar's `note` (only
/// the full-inventory one goes out) and whether the touch controls are on screen. `progress_at`
/// is where the progress bar sits when work is under way: just above the player;
/// `progress_name` is the material it will yield.
pub(crate) fn hud_frame(
    carried: &Carried,
    items: &ItemCatalog,
    status: &HarvestStatus,
    note: Option<&str>,
    touch: bool,
    progress_at: Option<(f32, f32)>,
    trade: bool,
) -> UiFrame {
    let (progress, progress_name, action) = match status {
        HarvestStatus::Ready { target } | HarvestStatus::Approaching { target } => (
            None,
            yield_name(target, items),
            Some(action_of(&target.blueprint, items)),
        ),
        HarvestStatus::Working {
            target,
            progress,
            total,
        } => (
            Some((*progress as f32 / (*total).max(1) as f32 * 100.0).round() / 100.0),
            yield_name(target, items),
            Some(action_of(&target.blueprint, items)),
        ),
        HarvestStatus::Idle | HarvestStatus::Done { .. } | HarvestStatus::Blocked { .. } => {
            (None, None, None)
        }
    };
    // Next to a market the action button trades, whatever else is in reach.
    let (progress, progress_name, action) = if trade {
        (None, None, Some(trade_action()))
    } else {
        (progress, progress_name, action)
    };
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
        progress,
        progress_at,
        progress_name,
        action,
        note: note
            .filter(|text| *text == crate::harvest::hotbar::FULL_NOTE)
            .map(str::to_owned),
    }
}

fn item_name(item: &str, items: &ItemCatalog) -> String {
    items
        .item(item)
        .map_or_else(|| item.to_owned(), |def| def.name.clone())
}

/// One flying gain per slot deposit, starting at `at` (shares of the screen).
pub(crate) fn gains(stacks: &[StackGain], items: &ItemCatalog, at: (f32, f32)) -> Vec<UiGain> {
    stacks
        .iter()
        .map(|y| UiGain {
            slot: y.slot,
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
#[path = "hud_frame.test.rs"]
mod tests;
