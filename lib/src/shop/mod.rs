//! The client side of the economy: the shop a merchant opens, its rows and where they sit.
//!
//! The rules (prices, the shelf, the trades) live in `iso::economy`; this folder turns them into
//! rows a player can pick (`rows.rs`), keeps what the open shop remembers (`session.rs`) and
//! places its pieces on every screen size (`layout.rs`). `ui::draw_shop` paints them with the UI
//! kit. Texts go without accents: the default Macroquad font does not draw them.

pub(crate) mod layout;
pub(crate) mod mark;
pub(crate) mod rows;
pub(crate) mod session;

pub(crate) use layout::{Hit, ShopLayout};
pub(crate) use mark::{MarketMark, mark_pose, mark_rect, mark_side};
pub(crate) use rows::{RowAction, ShopRow, ShopStock, rows, tool_piece, trade};
pub(crate) use session::{Shop, ShopEvent, ShopKey, Tab};
