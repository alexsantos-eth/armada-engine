#[test]
#[cfg(not(target_arch = "wasm32"))]
fn native_builds_report_a_fine_pointer() {
    assert!(!super::coarse_pointer());
}
