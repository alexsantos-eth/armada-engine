//! Toasts: short notes with an icon that slide in at the top of the screen, stay a moment and
//! fade away by themselves. Any part of the game can push one (the shop does when it trades).
//! Pure; `toast_draw.rs` paints them and `toast.test.rs` tests the timing.

/// How long a toast lives, in milliseconds.
pub(crate) const LIFE_MS: f64 = 2800.0;
/// How long it takes to slide in.
const IN_MS: f64 = 220.0;
/// How long it takes to fade out at the end of its life.
const OUT_MS: f64 = 380.0;
/// How far, in pixels, a toast starts above its place and leaves above it.
const SLIDE_PX: f32 = 22.0;
/// The most toasts on screen; a newer one pushes the oldest out.
pub(crate) const MAX_TOASTS: usize = 4;

/// The picture at the start of a toast.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ToastIcon {
    /// An item's icon, by item id.
    Item(String),
    /// A tool's piece in the kit, by piece name (`tool_axe`…).
    Piece(String),
}

/// Whether a toast reports or warns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ToastKind {
    Info,
    Warning,
}

/// One note on screen.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Toast {
    pub(crate) icon: ToastIcon,
    pub(crate) text: String,
    /// Coins that moved, shown at the end with their sign: `(amount, earned)`.
    pub(crate) coins: Option<(u64, bool)>,
    pub(crate) kind: ToastKind,
    pub(crate) age_ms: f64,
}

impl Toast {
    pub(crate) fn new(icon: ToastIcon, text: impl Into<String>) -> Self {
        Self {
            icon,
            text: text.into(),
            coins: None,
            kind: ToastKind::Info,
            age_ms: 0.0,
        }
    }

    /// The same toast with coins at its end.
    pub(crate) const fn with_coins(mut self, amount: u64, earned: bool) -> Self {
        self.coins = Some((amount, earned));
        self
    }

    /// The same toast as a warning.
    pub(crate) const fn warning(mut self) -> Self {
        self.kind = ToastKind::Warning;
        self
    }
}

/// How a toast is posed at its age.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ToastPose {
    pub(crate) alpha: f32,
    /// Pixels added to its resting y (negative: higher).
    pub(crate) dy: f32,
}

/// The pose of a toast `age_ms` old: it slides down into place and fades out at the end.
pub(crate) fn toast_pose(age_ms: f64) -> ToastPose {
    let arriving = (age_ms / IN_MS).clamp(0.0, 1.0) as f32;
    let leaving = ((age_ms - (LIFE_MS - OUT_MS)) / OUT_MS).clamp(0.0, 1.0) as f32;
    let slide_in = (1.0 - arriving).powi(3);
    ToastPose {
        alpha: arriving.min(1.0 - leaving),
        dy: -SLIDE_PX * slide_in - SLIDE_PX * 0.5 * leaving,
    }
}

/// The toasts on screen, oldest first.
#[derive(Debug, Default)]
pub(crate) struct Toasts {
    list: Vec<Toast>,
}

impl Toasts {
    /// Shows a new toast under the others; past [`MAX_TOASTS`] the oldest goes.
    pub(crate) fn push(&mut self, toast: Toast) {
        if self.list.len() == MAX_TOASTS {
            self.list.remove(0);
        }
        self.list.push(toast);
    }

    /// Ages every toast by a frame and drops the ones whose life is over.
    pub(crate) fn advance(&mut self, frame_ms: f64) {
        for toast in &mut self.list {
            toast.age_ms += frame_ms;
        }
        self.list.retain(|toast| toast.age_ms < LIFE_MS);
    }

    pub(crate) fn iter(&self) -> impl Iterator<Item = &Toast> {
        self.list.iter()
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.list.len()
    }
}

#[cfg(test)]
#[path = "toast.test.rs"]
mod tests;
