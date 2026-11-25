//! The economy in the frame: finding the merchant in reach, opening and driving the shop from the
//! keyboard, the pointer and scripted runs, trading, and handing the shop to the HUD.
//!
//! The rules are `iso::economy`; the rows, the layout and what an open shop remembers are
//! `crate::shop`; the painting is `ui::draw_shop`. This file is the glue between them and the
//! game, looked at through `scenes/pr-shop.json` by the FILE_STRUCTURE exception for IO-bound
//! code.

use iso::economy::{Market, Merchant, pick_merchant};
use iso::grid::to_chunk_coord;
use iso::projection::GridPoint;
use iso::services::{AudioService, NormalizedInput, SoundEvent};
use iso::testbed::SceneTrade;
use iso::time::clock_time;
use macroquad::prelude::*;

use crate::game::Game;
use crate::shop::{Hit, RowAction, Shop, ShopEvent, ShopKey, ShopLayout, ShopRow, ShopStock, Tab};
use crate::ui::{ClaySkin, ShopFrame};

/// What the shop is asked to do in a frame, whoever asked.
enum Command {
    Open,
    Key(ShopKey),
    Click(f32, f32),
}

/// The new presses of the pointer this frame: touches that began, or else a mouse click.
fn pointer_taps() -> Vec<(f32, f32)> {
    let touched: Vec<(f32, f32)> = touches()
        .iter()
        .filter(|touch| touch.phase == TouchPhase::Started)
        .map(|touch| (touch.position.x, touch.position.y))
        .collect();
    if !touched.is_empty() {
        return touched;
    }
    if is_mouse_button_pressed(MouseButton::Left) {
        return vec![mouse_position()];
    }
    Vec::new()
}

/// The keys of a real keyboard this frame, as shop commands while the shop is up (`open`).
/// Opening it is the gather action, which `update_shop` reads from the frame's input.
fn keyboard(open: bool) -> Vec<Command> {
    let mut commands = Vec::new();
    if !open {
        return commands;
    }
    let pressed = |keys: &[KeyCode]| keys.iter().any(|key| is_key_pressed(*key));
    for (keys, key) in [
        (&[KeyCode::Escape][..], ShopKey::Close),
        (&[KeyCode::Up, KeyCode::W][..], ShopKey::Up),
        (&[KeyCode::Down, KeyCode::S][..], ShopKey::Down),
        (&[KeyCode::Left, KeyCode::A][..], ShopKey::Tab(Tab::Sell)),
        (&[KeyCode::Right, KeyCode::D][..], ShopKey::Tab(Tab::Buy)),
        (&[KeyCode::Enter, KeyCode::Space][..], ShopKey::Confirm),
    ] {
        if pressed(keys) {
            commands.push(Command::Key(key));
        }
    }
    commands
}

/// What a scripted step asks of the shop.
const fn scripted(step: SceneTrade) -> Command {
    match step {
        SceneTrade::Open => Command::Open,
        SceneTrade::Sell => Command::Key(ShopKey::Tab(Tab::Sell)),
        SceneTrade::Buy => Command::Key(ShopKey::Tab(Tab::Buy)),
        SceneTrade::Up => Command::Key(ShopKey::Up),
        SceneTrade::Down => Command::Key(ShopKey::Down),
        SceneTrade::Confirm => Command::Key(ShopKey::Confirm),
        SceneTrade::Close => Command::Key(ShopKey::Close),
    }
}

impl Game {
    fn shop_stock(&self) -> ShopStock<'_> {
        ShopStock {
            carried: &self.carried,
            wallet: &self.wallet,
            market: &self.market,
            economy: &self.economy,
            items: &self.items,
        }
    }

    /// The rows of the tab the open shop is on; empty when it is closed.
    fn shop_rows(&self) -> Vec<ShopRow> {
        self.shop
            .as_ref()
            .map(|shop| crate::shop::rows(shop.tab, &self.shop_stock()))
            .unwrap_or_default()
    }

    /// The merchant the player is next to, from the chunks around them.
    fn merchant_in_reach(&self) -> Option<Merchant> {
        let at = GridPoint {
            x: self.player.x,
            y: self.player.y,
        };
        let centre = to_chunk_coord(iso::player::physics::get_player_column(at));
        let manager = &self.manager;
        let nearby = (-1..=1)
            .flat_map(|dx| {
                (-1..=1).map(move |dy| iso::grid::ChunkCoord {
                    cx: centre.cx + dx,
                    cy: centre.cy + dy,
                })
            })
            .filter_map(|coord| manager.entities_chunk(coord))
            .flatten();
        let feet = iso::harvest::Feet {
            at,
            elevation: self.player.elevation,
        };
        pick_merchant(feet, nearby, &self.economy)
    }

    /// The shop's share of a frame, before the player's input is used: restocks the shelf on a
    /// new day, looks for a merchant, takes the commands of this frame and, while the shop is
    /// up, keeps the player still.
    pub(crate) fn update_shop(&mut self, input: &mut NormalizedInput, frame_ms: f64) {
        if !self.streams {
            self.shop = None;
            self.merchant = None;
            return;
        }
        let day = clock_time(self.clock.tick).day;
        if self.market.day() != day {
            self.market = Market::open(&self.economy, self.world_seed, day);
        }
        self.merchant = self.merchant_in_reach();
        // The gather action (E, or the round button on touch) opens the shop next to a market.
        let gather_pressed = input.gather_held && !self.gather_was_held;
        self.gather_was_held = input.gather_held;
        let mut commands: Vec<Command> = std::mem::take(&mut self.scripted_trade)
            .into_iter()
            .map(scripted)
            .collect();
        if self.script.is_none() {
            commands.extend(keyboard(self.shop.is_some()));
            for (x, y) in pointer_taps() {
                if self.shop.is_some() {
                    commands.push(Command::Click(x, y));
                }
            }
            if gather_pressed && self.shop.is_none() && self.merchant.is_some() {
                commands.push(Command::Open);
            }
        }
        for command in commands {
            self.shop_command(command);
        }
        if self.merchant.is_none() {
            self.close_shop();
        }
        if let Some(shop) = self.shop.as_mut() {
            shop.advance(frame_ms);
            *input = NormalizedInput {
                gather_held: false,
                ..NormalizedInput::default()
            };
        }
        let len = self.shop_rows().len();
        if let Some(shop) = self.shop.as_mut() {
            shop.clamp(len);
        }
    }

    fn close_shop(&mut self) {
        if self.shop.take().is_some() {
            self.audio.play(SoundEvent::InventoryClose);
        }
    }

    fn shop_command(&mut self, command: Command) {
        match command {
            Command::Open => {
                if self.shop.is_none() && self.merchant.is_some() {
                    let selling = !crate::shop::rows(Tab::Sell, &self.shop_stock()).is_empty();
                    self.shop = Some(Shop::open(if selling { Tab::Sell } else { Tab::Buy }));
                    self.audio.play(SoundEvent::InventoryOpen);
                }
            }
            Command::Key(key) => self.press_shop(key),
            Command::Click(x, y) => self.click_shop(x, y),
        }
    }

    fn press_shop(&mut self, key: ShopKey) {
        let len = self.shop_rows().len();
        let Some(shop) = self.shop.as_mut() else {
            return;
        };
        match shop.press(key, len) {
            ShopEvent::None => {}
            ShopEvent::Close => self.close_shop(),
            ShopEvent::Confirm(index) => self.confirm_shop(index),
        }
    }

    /// A press of the pointer while the shop is up: tabs switch, the close button closes, a
    /// press outside the panel closes and a row is picked by one press and traded by a second.
    fn click_shop(&mut self, x: f32, y: f32) {
        let rows = self.shop_rows();
        let Some(shop) = self.shop.as_mut() else {
            return;
        };
        let layout = ShopLayout::new(screen_width(), screen_height(), rows.len(), shop.cursor);
        match layout.hit(x, y, rows.len()) {
            Hit::Tab(tab) => {
                shop.press(ShopKey::Tab(tab), rows.len());
            }
            Hit::Row(index) if index == shop.cursor => self.confirm_shop(index),
            Hit::Row(index) => shop.cursor = index,
            Hit::Close | Hit::Outside => self.close_shop(),
            Hit::Panel => {}
        }
    }

    /// Trades the row at `index` of the current tab and says what came of it.
    fn confirm_shop(&mut self, index: usize) {
        let rows = self.shop_rows();
        let Some(row) = rows.get(index) else {
            return;
        };
        let said = if row.enabled {
            let result = crate::shop::trade(
                row,
                &mut self.carried,
                &mut self.wallet,
                &self.market,
                &self.economy,
                &self.items,
            );
            if result.is_ok() {
                self.audio.play(SoundEvent::ItemCollect);
                self.haptic.pulse();
                self.unsaved_changes = true;
            }
            result.unwrap_or_else(str::to_owned)
        } else {
            // A greyed-out row only says why when it has something to say ("Ya la tienes").
            row.note.map(str::to_owned).unwrap_or_default()
        };
        if let Some(shop) = self.shop.as_mut().filter(|_| !said.is_empty()) {
            shop.say(said);
        }
        if matches!(row.action, RowAction::Sell { .. }) {
            let len = self.shop_rows().len();
            if let Some(shop) = self.shop.as_mut() {
                shop.clamp(len);
            }
        }
    }

    /// What the open shop shows, for the HUD.
    pub(crate) fn shop_frame(&self) -> Option<ShopFrame> {
        let shop = self.shop.as_ref()?;
        Some(ShopFrame {
            currency: self.economy.currency().to_owned(),
            coins: self.wallet.coins(),
            tab: shop.tab,
            cursor: shop.cursor,
            rows: self.shop_rows(),
            message: shop.message.as_ref().map(|(text, _)| text.clone()),
        })
    }

    /// Paints the economy over the HUD: the icon over each market, the wallet and the shop.
    pub(crate) fn draw_economy(&self, skin: &ClaySkin) {
        let open = self.shop_frame();
        if open.is_none() {
            crate::ui::draw_market_marks(skin, &self.market_marks, self.clay_hud.clock_ms);
        }
        if self.wallet.coins() > 0 || open.is_some() {
            crate::ui::draw_wallet(skin, self.wallet.coins());
        }
        if let Some(frame) = open {
            let layout = ShopLayout::new(
                screen_width(),
                screen_height(),
                frame.rows.len(),
                frame.cursor,
            );
            crate::ui::draw_shop(skin, &frame, &layout);
        }
    }
}
