//! What an open shop remembers: the tab, the row under the cursor and the last thing it said.

/// How long the shop keeps a message up, in milliseconds.
pub(crate) const MESSAGE_MS: f64 = 2400.0;

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
    /// What the last trade said, and how long it stays up in milliseconds.
    pub(crate) message: Option<(String, f64)>,
}

impl Shop {
    /// A shop that opens on what the player most likely came to do.
    pub(crate) const fn open(tab: Tab) -> Self {
        Self {
            tab,
            cursor: 0,
            message: None,
        }
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

    /// Says something for [`MESSAGE_MS`].
    pub(crate) fn say(&mut self, text: String) {
        self.message = Some((text, MESSAGE_MS));
    }

    /// Ages the message by a frame.
    pub(crate) fn advance(&mut self, elapsed_ms: f64) {
        if let Some((_, left)) = self.message.as_mut() {
            *left -= elapsed_ms;
            if *left <= 0.0 {
                self.message = None;
            }
        }
    }
}

#[cfg(test)]
#[path = "session.test.rs"]
mod tests;
