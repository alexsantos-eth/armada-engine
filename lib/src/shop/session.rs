//! What an open shop remembers: the tab, and the row under the cursor.

/// The two lists a merchant offers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Tab {
    /// What the player carries that villages pay for.
    Sell,
    /// The tools on today's shelf.
    Buy,
}

/// A key the shop understands, whatever pressed it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ShopKey {
    Up,
    Down,
    Tab(Tab),
    Confirm,
    Close,
}

/// What a key asks of the game.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ShopEvent {
    None,
    Close,
    /// Trade the row at this index of the current tab.
    Confirm(usize),
}

/// An open shop.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Shop {
    pub(crate) tab: Tab,
    pub(crate) cursor: usize,
}

impl Shop {
    /// A shop that opens on what the player most likely came to do.
    pub(crate) const fn open(tab: Tab) -> Self {
        Self { tab, cursor: 0 }
    }

    /// Takes a key with `len` rows in the current tab.
    pub(crate) fn press(&mut self, key: ShopKey, len: usize) -> ShopEvent {
        match key {
            ShopKey::Close => return ShopEvent::Close,
            ShopKey::Tab(tab) => {
                if tab != self.tab {
                    self.tab = tab;
                    self.cursor = 0;
                }
            }
            ShopKey::Up => self.cursor = self.cursor.saturating_sub(1),
            ShopKey::Down => self.cursor = (self.cursor + 1).min(len.saturating_sub(1)),
            ShopKey::Confirm => {
                if self.cursor < len {
                    return ShopEvent::Confirm(self.cursor);
                }
            }
        }
        ShopEvent::None
    }

    /// Keeps the cursor on a row after the list changed under it (something was sold out).
    pub(crate) fn clamp(&mut self, len: usize) {
        self.cursor = self.cursor.min(len.saturating_sub(1));
    }
}

#[cfg(test)]
#[path = "session.test.rs"]
mod tests;
