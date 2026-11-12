use super::*;

#[test]
fn dev_working_directory_wins_for_assets() {
    let resolved = decide_asset(
        "content/images/atlas.png",
        true,
        Some(PathBuf::from("/App/Contents/Resources")),
    );

    assert_eq!(resolved, "content/images/atlas.png");
}

#[test]
fn bundle_resources_serve_assets_outside_a_dev_checkout() {
    let hit = Some(PathBuf::from(
        "/App/Contents/Resources/content/images/atlas.png",
    ));

    assert_eq!(
        decide_asset("content/images/atlas.png", false, hit),
        "/App/Contents/Resources/content/images/atlas.png"
    );
}

#[test]
fn missing_assets_fall_back_to_the_relative_path() {
    assert_eq!(
        decide_asset("content/images/atlas.png", false, None),
        "content/images/atlas.png"
    );
}

#[test]
fn save_goes_to_user_support_inside_a_bundle() {
    let path = decide_save(Some(PathBuf::from("/Users/test")), true, "Yorch Adventure");

    assert_eq!(
        path,
        PathBuf::from(
            "/Users/test/Library/Application Support/Yorch Adventure/saves/iso_save.json"
        )
    );
}

#[test]
fn save_falls_back_to_the_dev_path_outside_a_bundle() {
    assert_eq!(
        decide_save(Some(PathBuf::from("/Users/test")), false, "Yorch Adventure"),
        PathBuf::from("saves/iso_save.json")
    );
}

#[test]
fn save_falls_back_to_the_dev_path_without_a_home_directory() {
    assert_eq!(
        decide_save(None, true, "Yorch Adventure"),
        PathBuf::from("saves/iso_save.json")
    );
}

#[test]
fn bundle_layout_needs_a_macos_resources_pair() {
    let exists = |_: &Path| true;
    let resources = resources_of(
        Path::new("/App/Yorch Adventure.app/Contents/MacOS/yorch-adventure"),
        &exists,
    );

    assert_eq!(
        resources,
        Some(PathBuf::from("/App/Yorch Adventure.app/Contents/Resources"))
    );
}

#[test]
fn bundle_layout_rejects_a_plain_binary() {
    let exists = |_: &Path| true;

    assert_eq!(
        resources_of(Path::new("/usr/local/bin/yorch-adventure"), &exists),
        None
    );
}

#[test]
fn bundle_layout_rejects_a_missing_resources_directory() {
    let missing = |_: &Path| false;

    assert_eq!(
        resources_of(
            Path::new("/App/Yorch Adventure.app/Contents/MacOS/yorch-adventure"),
            &missing
        ),
        None
    );
}
