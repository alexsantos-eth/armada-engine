//! The world editor's client side: the panel it paints and the session that reads the pointer.
//!
//! Every editing rule lives in `iso::maker`; this domain only turns a pointer, a key press and
//! a click on the panel into one of those rules, and paints what the session is holding.

mod panel;
mod session;

pub(crate) use session::{MakerFrame, MakerSession};
