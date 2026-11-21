//! The harvest machine: while the gather key is held on one target, the carried tool's speed
//! accumulates work each fixed tick until the target's rule is met; letting go pauses the work.

use crate::harvest::HarvestTarget;
use crate::inventory::Carried;
use crate::items::{HarvestYield, ItemCatalog, ToolKind, tool_speed_tenths};

/// Fixed ticks of one blow of the gathering swing: wind up, strike, follow through.
pub const HARVEST_STRIKE_TICKS: u32 = 10;
/// Tick of the swing on which the blow lands; the gather sheet's strike pose matches it.
pub const HARVEST_STRIKE_AT: u32 = 6;

/// Why a target in reach cannot be gathered now.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HarvestBlock {
    /// The rule asks for a tool of `kind` at `tier` or better, and none is carried.
    NeedsTool { kind: ToolKind, tier: u8 },
    /// The yields do not all fit in the inventory.
    InventoryFull,
}

/// What the harvest did this step.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HarvestStatus {
    /// Nothing harvestable in reach.
    Idle,
    /// A target in sight, the key not held.
    Ready { target: HarvestTarget },
    /// The key held on a target in sight but out of reach: the player walks up to it.
    Approaching { target: HarvestTarget },
    /// A target in reach that cannot be gathered.
    Blocked {
        target: HarvestTarget,
        reason: HarvestBlock,
    },
    /// Work under way (or paused, the key let go), in tenths of a bare-hand tick.
    Working {
        target: HarvestTarget,
        progress: u32,
        total: u32,
    },
    /// The target is gathered: the caller takes it out of the world and stores the yields.
    Done {
        target: HarvestTarget,
        yields: Vec<HarvestYield>,
    },
}

impl HarvestStatus {
    /// The target in reach, whatever is happening to it; `None` when idle.
    pub fn target(&self) -> Option<&HarvestTarget> {
        match self {
            Self::Idle => None,
            Self::Ready { target }
            | Self::Approaching { target }
            | Self::Blocked { target, .. }
            | Self::Working { target, .. }
            | Self::Done { target, .. } => Some(target),
        }
    }
}

/// One fixed step's input to the harvest.
#[derive(Clone, Copy, Debug)]
pub struct HarvestInput<'a> {
    /// Whether the gather key is held.
    pub held: bool,
    /// What is in reach, from [`crate::harvest::pick_harvest_target`].
    pub target: Option<&'a HarvestTarget>,
    /// Fixed ticks this step covers.
    pub ticks: u32,
}

/// The work done on the current target; kept while the key is let go, dropped when the target
/// changes, leaves reach or is blocked.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Harvester {
    target: Option<String>,
    progress: u32,
    swing_ticks: u32,
    strikes: u64,
}

impl Harvester {
    /// Advances the harvest `input.ticks` ticks with what the player `carried`.
    pub fn step(
        &mut self,
        input: HarvestInput<'_>,
        carried: &Carried,
        items: &ItemCatalog,
    ) -> HarvestStatus {
        let Some(target) = input.target else {
            self.reset();
            return HarvestStatus::Idle;
        };
        let Some(rule) = items.harvest_rule(&target.blueprint) else {
            self.reset();
            return HarvestStatus::Idle;
        };
        let speed = match rule.tool {
            None => tool_speed_tenths(0),
            Some(kind) => match carried.toolbelt.best_tier(kind, items) {
                Some(tier) if tier >= rule.tier => tool_speed_tenths(tier),
                _ => {
                    self.reset();
                    return HarvestStatus::Blocked {
                        target: target.clone(),
                        reason: HarvestBlock::NeedsTool {
                            kind,
                            tier: rule.tier,
                        },
                    };
                }
            },
        };
        if !carried.inventory.fits(&rule.yields, items) {
            self.reset();
            return HarvestStatus::Blocked {
                target: target.clone(),
                reason: HarvestBlock::InventoryFull,
            };
        }
        if self.target.as_deref() != Some(target.id.as_str()) {
            self.target = Some(target.id.clone());
            self.progress = 0;
        }
        let total = rule.ticks.saturating_mul(tool_speed_tenths(0));
        if input.held && !target.in_reach {
            self.swing_ticks = 0;
            return HarvestStatus::Approaching {
                target: target.clone(),
            };
        }
        if !input.held {
            self.swing_ticks = 0;
            if self.progress == 0 {
                return HarvestStatus::Ready {
                    target: target.clone(),
                };
            }
            return HarvestStatus::Working {
                target: target.clone(),
                progress: self.progress,
                total,
            };
        }
        self.progress = self
            .progress
            .saturating_add(input.ticks.saturating_mul(speed));
        for _ in 0..input.ticks {
            self.swing_ticks = (self.swing_ticks + 1) % HARVEST_STRIKE_TICKS;
            if self.swing_ticks == HARVEST_STRIKE_AT {
                self.strikes += 1;
            }
        }
        if self.progress >= total {
            self.reset();
            return HarvestStatus::Done {
                target: target.clone(),
                yields: rule.yields.clone(),
            };
        }
        HarvestStatus::Working {
            target: target.clone(),
            progress: self.progress,
            total,
        }
    }

    /// Ticks into the current blow of the swing, `0..HARVEST_STRIKE_TICKS`; `0` is the top.
    pub fn swing(&self) -> u32 {
        self.swing_ticks
    }

    /// Blows landed since this harvester was made; never goes back, so a view can tell a new one.
    pub fn strikes(&self) -> u64 {
        self.strikes
    }

    /// Forgets the work in hand; the count of blows stays.
    fn reset(&mut self) {
        self.target = None;
        self.progress = 0;
        self.swing_ticks = 0;
    }
}

#[cfg(test)]
#[path = "harvester.test.rs"]
mod tests;
