//! The exported UI kit (`content/ui/`, written by `scripts/export-ui.cjs` from `web/ui/`): the
//! manifest of pieces and colours, and the textures and fonts loaded from it.

use std::collections::HashMap;

use macroquad::prelude::*;

/// The pieces the native HUD draws; the manifest must carry them all.
pub(crate) const REQUIRED_PIECES: &[&str] = &[
    "hotbar",
    "slot",
    "slot_selected",
    "slot_empty",
    "bubble",
    "bubble_warning",
    "bubble_tail",
    "bubble_tail_warning",
    "action",
    "action_pressed",
    "stick_base",
    "stick_knob",
    "stick_knob_run",
    "badge",
    "tool_axe",
    "tool_pickaxe",
    "tool_net",
    "tool_hand",
    "backpack_closed",
    "backpack_open",
    "progress",
    "progress_fill",
];

/// Where the manifest lives under `content/`.
pub(crate) const MANIFEST_PATH: &str = "content/ui/ui.json";

/// One exported piece: its PNG, its size in image pixels, the transparent room around the
/// shape and the nine-slice border measured from the shape's edge.
#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
pub(crate) struct Piece {
    pub(crate) file: String,
    pub(crate) width: f32,
    pub(crate) height: f32,
    pub(crate) pad: f32,
    pub(crate) slice: f32,
}

/// The kit's manifest as exported.
#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UiManifest {
    pub(crate) schema_version: u32,
    pub(crate) scale: f32,
    pub(crate) items: String,
    pub(crate) colors: HashMap<String, String>,
    pub(crate) pieces: HashMap<String, Piece>,
}

/// The kit's colours the native HUD paints with, as RGB.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Palette {
    pub(crate) ink: [u8; 3],
    pub(crate) cream: [u8; 3],
    pub(crate) umber: [u8; 3],
    pub(crate) red: [u8; 3],
    pub(crate) leaf: [u8; 3],
}

impl UiManifest {
    /// The colours the HUD needs, or `None` when a token is missing or malformed.
    pub(crate) fn palette(&self) -> Option<Palette> {
        let token = |name: &str| self.colors.get(name).and_then(|value| hex_rgb(value));
        Some(Palette {
            ink: token("ink")?,
            cream: token("cream")?,
            umber: token("umber")?,
            red: token("red")?,
            leaf: token("leaf")?,
        })
    }
}

/// `#rrggbb` (the hash optional) as RGB.
pub(crate) fn hex_rgb(value: &str) -> Option<[u8; 3]> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let byte = |at: usize| u8::from_str_radix(hex.get(at..at + 2)?, 16).ok();
    Some([byte(0)?, byte(2)?, byte(4)?])
}

/// Reads and checks the manifest: schema 1, a positive scale, every required piece and colour.
pub(crate) fn parse_manifest(text: &str) -> Result<UiManifest, String> {
    let manifest: UiManifest =
        serde_json::from_str(text).map_err(|err| format!("ui.json: {err}"))?;
    if manifest.schema_version != 1 {
        return Err(format!(
            "ui.json: schema {} is not 1",
            manifest.schema_version
        ));
    }
    if manifest.scale <= 0.0 {
        return Err("ui.json: scale must be positive".into());
    }
    if let Some(missing) = REQUIRED_PIECES
        .iter()
        .find(|name| !manifest.pieces.contains_key(**name))
    {
        return Err(format!("ui.json: missing piece {missing}"));
    }
    manifest
        .palette()
        .ok_or_else(|| "ui.json: missing a colour token".to_owned())?;
    Ok(manifest)
}

/// The loaded kit: the manifest, a texture per piece and per item, and the display face.
pub(crate) struct ClaySkin {
    pub(crate) manifest: UiManifest,
    pub(crate) palette: Palette,
    pub(crate) pieces: HashMap<String, Texture2D>,
    pub(crate) items: HashMap<String, Texture2D>,
    pub(crate) display: Font,
}

impl ClaySkin {
    /// Loads the exported kit through `path_of` (the client's content path), with an icon for
    /// each of `item_ids`; `None` (with a warning) when the manifest, a piece or the face is missing.
    pub(crate) async fn load(
        path_of: impl Fn(&str) -> String,
        item_ids: impl Iterator<Item = String>,
    ) -> Option<Self> {
        let warn = |what: String| {
            eprintln!("warning: the clay HUD is off: {what}");
        };
        let text = match load_string(&path_of(MANIFEST_PATH)).await {
            Ok(text) => text,
            Err(err) => {
                warn(format!("could not read {MANIFEST_PATH}: {err}"));
                return None;
            }
        };
        let manifest = match parse_manifest(&text) {
            Ok(manifest) => manifest,
            Err(err) => {
                warn(err);
                return None;
            }
        };
        let palette = manifest.palette()?;
        let pieces_loaded =
            futures::future::join_all(manifest.pieces.iter().map(|(name, piece)| async {
                let path = path_of(&format!("content/{}", piece.file));
                (name.clone(), load_texture(&path).await)
            }))
            .await;
        let mut pieces = HashMap::new();
        for (name, loaded) in pieces_loaded {
            match loaded {
                Ok(texture) => {
                    texture.set_filter(FilterMode::Linear);
                    pieces.insert(name, texture);
                }
                Err(err) => {
                    warn(format!("could not load the piece {name}: {err}"));
                    return None;
                }
            }
        }
        let item_ids: Vec<String> = item_ids.collect();
        let items_loaded = futures::future::join_all(item_ids.into_iter().map(|id| {
            let path = path_of(&format!("content/{}/{id}.png", manifest.items));
            async move { (id, load_texture(&path).await) }
        }))
        .await;
        let mut items = HashMap::new();
        for (id, loaded) in items_loaded {
            if let Ok(texture) = loaded {
                texture.set_filter(FilterMode::Linear);
                items.insert(id, texture);
            }
        }
        let display = match load_ttf_font(&path_of(DISPLAY_FONT)).await {
            Ok(font) => font,
            Err(err) => {
                warn(format!("could not load {DISPLAY_FONT}: {err}"));
                return None;
            }
        };
        Some(Self {
            manifest,
            palette,
            pieces,
            items,
            display,
        })
    }
}

/// Fredoka Bold, the kit's display face: numbers, buttons, prompts and bubbles.
pub(crate) const DISPLAY_FONT: &str = "content/fonts/Fredoka-Bold.ttf";

#[cfg(test)]
#[path = "skin.test.rs"]
mod tests;
