//! UI event contract. The core describes what to show; the client renders it.

/// A UI event the core wants surfaced.
#[derive(Clone, Debug, PartialEq)]
pub enum UiEvent {
    /// Show a text message.
    Message { text: String },
    /// Update the HUD with the player's state.
    HudUpdate {
        x: f64,
        y: f64,
        elevation: i32,
        motion: String,
        chunks: usize,
    },
    /// A chunk was discovered.
    ChunkDiscovered { cx: i32, cy: i32 },
}

/// UI event sink.
pub trait UiService {
    /// Pushes an event to the UI layer.
    fn push(&mut self, event: UiEvent);
}
